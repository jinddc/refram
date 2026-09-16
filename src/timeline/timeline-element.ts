import { MotionElement } from "../core/motion-element";
import { TimelineController } from "./timeline-controller";
import {
  copyTimelineOptions,
  createTimelineDefinition,
} from "./timeline-options";
import {
  REQUEST_TIMELINE_SYNC,
  type TimelineChangeReason,
  type TimelineCompositionHost,
} from "./timeline-protocol";
import type {
  MotionPlaybackEventDetail,
  MotionPlaybackState,
  MotionTimelineOptions,
  TimelineDefinition,
} from "./timeline.types";
import type { MotionTweenElement } from "./tween-element";
import type { TweenDefinition } from "./tween.types";

type PlaybackMode = "paused" | "playing" | "reversed";

export class MotionTimelineElement
  extends MotionElement<MotionTimelineOptions, TimelineController>
  implements TimelineCompositionHost
{
  private syncPending = false;
  private syncGeneration = 0;
  private dirty = true;
  private pendingChange: TimelineChangeReason = "structure";
  private playbackMode: PlaybackMode = "paused";
  private currentPlayState: MotionPlaybackState = "idle";
  private currentFinished: Promise<void> = Promise.resolve();
  private resolveRun?: () => void;
  private cancelling = false;
  private syncedSources: MotionTweenElement[] = [];

  public constructor() {
    super({});
    this.upgradeOptionsProperty();
  }

  public override get options(): MotionTimelineOptions {
    return super.options;
  }

  public override set options(value: MotionTimelineOptions) {
    super.options = value;
    this.scheduleSync("options");
  }

  public get playState(): MotionPlaybackState {
    return this.currentPlayState;
  }

  public get finished(): Promise<void> {
    return this.currentFinished;
  }

  public override connectedCallback(): void {
    super.connectedCallback();
    this.syncGeneration += 1;
    this.dirty = true;
    this.scheduleSync();
  }

  public override disconnectedCallback(): void {
    this.syncGeneration += 1;
    this.syncPending = false;
    super.disconnectedCallback();
    this.dirty = true;
    this.pendingChange = "structure";
    this.playbackMode = "paused";
    this.currentPlayState = "idle";
    this.syncedSources = [];
    this.settleRun();
  }

  public play(): Promise<void> {
    this.playbackMode = "playing";
    this.prepareRun();
    this.syncNow();
    const started = this.controller?.play() ?? false;

    if (!started && this.currentPlayState === "finished") {
      this.playbackMode = "paused";
      this.settleRun();
    }

    return this.finished;
  }

  public pause(): void {
    this.playbackMode = "paused";
    this.controller?.pause();

    if (this.currentPlayState === "running") {
      this.currentPlayState = "paused";
    }
  }

  public reverse(): Promise<void> {
    this.playbackMode = "reversed";
    this.prepareRun();
    this.syncNow();
    this.controller?.reverse();
    return this.finished;
  }

  public restart(): Promise<void> {
    this.playbackMode = "playing";
    this.prepareRun(true);
    this.syncNow(true);
    this.controller?.restart();
    return this.finished;
  }

  public finish(): void {
    this.syncNow();
    if (!this.controller?.hasContent()) {
      return;
    }

    this.prepareRun();
    this.controller.finish();
  }

  public cancel(): void {
    const hadPendingRun = this.resolveRun !== undefined;
    const hadContent = this.controller?.hasContent() ?? false;

    this.playbackMode = "paused";
    this.cancelling = true;
    this.controller?.cancel();
    this.cancelling = false;
    this.currentPlayState = "idle";
    this.settleRun();

    if (hadPendingRun || hadContent) {
      this.dispatchPlaybackEvent("motion-cancel");
    }
  }

  public refresh(): void {
    this.syncNow(true);
    this.applyPlaybackMode();
  }

  public totalDuration(): number {
    this.syncNow();
    return this.controller?.totalDuration() ?? 0;
  }

  public [REQUEST_TIMELINE_SYNC](
    reason: TimelineChangeReason = "structure",
  ): void {
    this.scheduleSync(reason);
  }

  protected normalizeOptions(
    value: MotionTimelineOptions,
  ): MotionTimelineOptions {
    return copyTimelineOptions(value);
  }

  protected copyOptions(
    options: MotionTimelineOptions,
  ): MotionTimelineOptions {
    return copyTimelineOptions(options);
  }

  protected createController(
    options: MotionTimelineOptions,
  ): TimelineController {
    return new TimelineController(this, options, {
      onStart: () => {
        this.currentPlayState = "running";
        this.dispatchPlaybackEvent("motion-start");
      },
      onComplete: () => {
        this.currentPlayState = "finished";
        this.playbackMode = "paused";
        this.settleRun();
        this.dispatchPlaybackEvent("motion-finish");
      },
      onInterrupt: () => {
        if (this.cancelling) {
          return;
        }

        this.currentPlayState = "idle";
        this.playbackMode = "paused";
        this.settleRun();
        this.dispatchPlaybackEvent("motion-interrupt");
      },
    });
  }

  private scheduleSync(
    reason: TimelineChangeReason = "structure",
  ): void {
    if (!this.isConnected) {
      return;
    }

    this.dirty = true;
    if (reason === "options") {
      this.pendingChange = "options";
    }

    if (this.controller?.isActive() || this.syncPending) {
      return;
    }

    this.syncPending = true;
    const generation = this.syncGeneration;
    queueMicrotask(() => {
      this.syncPending = false;
      if (
        !this.isConnected ||
        generation !== this.syncGeneration ||
        !this.dirty
      ) {
        return;
      }

      if (this.appendFinishedItems()) {
        return;
      }

      this.syncNow();
      this.applyPlaybackMode();
    });
  }

  private syncNow(force = false): void {
    if (
      !this.isConnected ||
      (!force && (!this.dirty || this.controller?.isActive()))
    ) {
      return;
    }

    const definition = this.readDefinition();
    this.dirty = false;
    this.controller?.syncDefinition(definition, force);
    this.syncedSources = definition.items.map(
      (item) => item.source as MotionTweenElement,
    );
    this.pendingChange = "structure";
  }

  private applyPlaybackMode(): void {
    if (!this.controller?.hasContent()) {
      return;
    }

    if (this.playbackMode === "playing") {
      this.prepareRun();
      this.controller.play();
    } else if (this.playbackMode === "reversed") {
      this.prepareRun();
      this.controller.reverse();
    } else {
      this.controller.pause();
    }
  }

  private prepareRun(forceNew = false): void {
    if (!forceNew && this.resolveRun) {
      return;
    }

    this.settleRun();
    this.currentFinished = new Promise<void>((resolve) => {
      this.resolveRun = resolve;
    });
  }

  private settleRun(): void {
    this.resolveRun?.();
    this.resolveRun = undefined;
  }

  private dispatchPlaybackEvent(
    type:
      | "motion-start"
      | "motion-finish"
      | "motion-cancel"
      | "motion-interrupt",
  ): void {
    this.dispatchEvent(new CustomEvent<MotionPlaybackEventDetail>(type, {
      bubbles: true,
      composed: true,
      detail: { playState: this.playState },
    }));
  }

  private appendFinishedItems(): boolean {
    if (
      this.currentPlayState !== "finished" ||
      this.pendingChange !== "structure" ||
      !this.controller
    ) {
      return false;
    }

    const definition = this.readDefinition();
    const previousSources = new Set(this.syncedSources);
    const retainedSources = definition.items
      .map((item) => item.source as MotionTweenElement)
      .filter((source) => previousSources.has(source));
    const previousOrderIsStable = this.syncedSources.every(
      (source, index) => retainedSources[index] === source,
    );
    const appendedItems = definition.items.filter(
      (item) => !previousSources.has(item.source as MotionTweenElement),
    );

    if (
      !previousOrderIsStable ||
      retainedSources.length !== this.syncedSources.length ||
      appendedItems.length === 0
    ) {
      return false;
    }

    this.dirty = false;
    this.pendingChange = "structure";
    this.syncedSources = definition.items.map(
      (item) => item.source as MotionTweenElement,
    );

    if (!appendedItems.some((item) => item.options.to !== undefined)) {
      this.controller.append(definition, appendedItems);
      return true;
    }

    this.playbackMode = "playing";
    this.prepareRun(true);
    return this.controller.append(definition, appendedItems);
  }

  private readDefinition(): TimelineDefinition {
    return createTimelineDefinition(this.options, this.readItems());
  }

  private readItems(): TweenDefinition[] {
    return Array.from(
      this.querySelectorAll<MotionTweenElement>("motion-tween"),
    )
      .filter((child) => child.closest("motion-timeline") === this)
      .map((child) => {
        const options = child.options;
        return {
          source: child,
          target: child,
          options,
          authoredPosition: options.position,
        };
      });
  }
}
