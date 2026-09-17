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
import {
  ATTACH_TIMELINE_INSPECTOR,
  TimelineInspectionHub,
  type TimelineInspectionItem,
  type TimelineInspectionListener,
  type TimelineInspectionSnapshot,
  type TimelineInspectorAttachment,
  type TimelineInspectorOptions,
} from "./timeline-inspection";
import type {
  MotionPlaybackEventDetail,
  MotionPlaybackState,
  MotionTimelineOptions,
  TimelineDefinition,
} from "./timeline.types";
import type { MotionTweenElement } from "./tween-element";
import type { TweenDefinition } from "./tween.types";

type PlaybackMode = "paused" | "playing" | "reversed";

function shallowEqual(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left[key] === right[key])
  );
}

function sameDefinition(
  left: TimelineDefinition | undefined,
  right: TimelineDefinition,
): boolean {
  if (!left || left.items.length !== right.items.length) {
    return false;
  }

  const leftOptions = left.options as Record<string, unknown>;
  const rightOptions = right.options as Record<string, unknown>;
  const leftDefaults = leftOptions.defaults as Record<string, unknown> | undefined;
  const rightDefaults = rightOptions.defaults as Record<string, unknown> | undefined;
  const leftScroll = leftOptions.scrollTrigger as Record<string, unknown> | undefined;
  const rightScroll = rightOptions.scrollTrigger as Record<string, unknown> | undefined;
  const comparableLeftOptions = { ...leftOptions };
  const comparableRightOptions = { ...rightOptions };
  delete comparableLeftOptions.defaults;
  delete comparableRightOptions.defaults;
  delete comparableLeftOptions.scrollTrigger;
  delete comparableRightOptions.scrollTrigger;

  if (
    !shallowEqual(comparableLeftOptions, comparableRightOptions) ||
    !shallowEqual(leftDefaults, rightDefaults) ||
    !shallowEqual(leftScroll, rightScroll)
  ) {
    return false;
  }

  return left.items.every((item, index) => {
    const candidate = right.items[index];
    return (
      candidate !== undefined &&
      item.source === candidate.source &&
      item.target === candidate.target &&
      item.authoredPosition === candidate.authoredPosition &&
      item.options.duration === candidate.options.duration &&
      item.options.ease === candidate.options.ease &&
      item.options.position === candidate.options.position &&
      shallowEqual(
        item.options.from as Record<string, unknown> | undefined,
        candidate.options.from as Record<string, unknown> | undefined,
      ) &&
      shallowEqual(
        item.options.to as Record<string, unknown> | undefined,
        candidate.options.to as Record<string, unknown> | undefined,
      )
    );
  });
}

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
  private syncedDefinition?: TimelineDefinition;
  private inspectionConnected = false;
  private inspectionHub?: TimelineInspectionHub;

  public constructor() {
    super({});
    Object.defineProperty(this, ATTACH_TIMELINE_INSPECTOR, {
      configurable: false,
      enumerable: false,
      value: (
        listener: TimelineInspectionListener,
        options?: TimelineInspectorOptions,
      ) => this.attachInspection(listener, options),
    });
    this.upgradeOptionsProperty();
  }

  public override get options(): MotionTimelineOptions {
    return super.options;
  }

  public override set options(value: MotionTimelineOptions) {
    const wasScrollDriven = this.options.scrollTrigger !== undefined;
    super.options = value;

    if (wasScrollDriven && value?.scrollTrigger === undefined) {
      this.playbackMode = "paused";
      this.currentPlayState = "idle";
      this.settleRun();
      this.notifyInspection();
    }

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
    this.inspectionConnected = true;
    this.inspectionHub?.setConnected(true);
    this.syncGeneration += 1;
    this.dirty = true;
    this.scheduleSync();
  }

  public override disconnectedCallback(): void {
    const generation = ++this.syncGeneration;
    this.syncPending = false;

    queueMicrotask(() => {
      if (
        this.isConnected ||
        generation !== this.syncGeneration
      ) {
        return;
      }

      super.disconnectedCallback();
      this.dirty = true;
      this.pendingChange = "structure";
      this.playbackMode = "paused";
      this.currentPlayState = "idle";
      this.syncedSources = [];
      this.syncedDefinition = undefined;
      this.settleRun();
      this.inspectionConnected = false;
      this.inspectionHub?.setConnected(false);
      this.inspectionHub?.notify({
        replacement: true,
        preserveAuthored: true,
      });
    });
  }

  public play(): Promise<void> {
    this.assertManualDriver("play");
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
    this.assertManualDriver("pause");
    this.playbackMode = "paused";
    this.controller?.pause();

    if (this.currentPlayState === "running") {
      this.currentPlayState = "paused";
      this.notifyInspection();
    }
  }

  public reverse(): Promise<void> {
    this.assertManualDriver("reverse");
    this.playbackMode = "reversed";
    this.prepareRun();
    this.syncNow();
    this.controller?.reverse();
    return this.finished;
  }

  public restart(): Promise<void> {
    this.assertManualDriver("restart");
    this.playbackMode = "playing";
    this.prepareRun(true);
    this.syncNow(true);
    this.controller?.restart();
    return this.finished;
  }

  public finish(): void {
    this.assertManualDriver("finish");
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
    this.notifyInspection();

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

  private attachInspection(
    listener: TimelineInspectionListener,
    options?: TimelineInspectorOptions,
  ): TimelineInspectorAttachment {
    this.inspectionHub ??= new TimelineInspectionHub(
      (
        revision,
        previousItems,
        rebuildItems,
        preserveAuthored,
      ) => this.readInspectionSnapshot(
        revision,
        previousItems,
        rebuildItems,
        preserveAuthored,
      ),
      this.inspectionConnected,
    );

    return this.inspectionHub.attach(listener, options);
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
        if (this.controller?.isScrollDriven()) {
          this.prepareRun(true);
        }

        this.currentPlayState = "running";
        this.notifyInspection();
        this.dispatchPlaybackEvent("motion-start");
      },
      onComplete: () => {
        this.currentPlayState = "finished";
        this.playbackMode = "paused";
        this.settleRun();
        this.notifyInspection();
        this.dispatchPlaybackEvent("motion-finish");
      },
      onInterrupt: () => {
        if (this.cancelling) {
          return;
        }

        this.currentPlayState = "idle";
        this.playbackMode = "paused";
        this.settleRun();
        this.notifyInspection();
        this.dispatchPlaybackEvent("motion-interrupt");
      },
      onScrollReady: (progress, reducedMotion) => {
        this.playbackMode = "paused";

        if (reducedMotion || progress >= 1) {
          this.currentPlayState = "finished";
          this.settleRun();
          this.notifyInspection();
          return;
        }

        if (progress > 0) {
          this.currentPlayState = "running";
          this.prepareRun();
          this.notifyInspection();
          return;
        }

        this.currentPlayState = "idle";
        this.settleRun();
        this.notifyInspection();
      },
      onInspectionChange: (replacement) => {
        this.inspectionHub?.notify({ replacement });
      },
    });
  }

  private notifyInspection(): void {
    this.inspectionHub?.notify();
  }

  private readInspectionSnapshot(
    revision: number,
    previousItems: readonly TimelineInspectionItem[] | undefined,
    rebuildItems: boolean,
    preserveAuthored: boolean,
  ): TimelineInspectionSnapshot {
    if (!this.inspectionConnected) {
      const items = rebuildItems
        ? this.readDisconnectedInspectionItems(
            previousItems,
            preserveAuthored,
          )
        : previousItems ?? [];
      return Object.freeze({
        revision,
        driver: this.options.scrollTrigger ? "scroll" : "manual",
        readiness: "disconnected",
        playState: this.currentPlayState,
        progress: 0,
        totalDuration: 0,
        items,
      });
    }

    const controllerInspection = this.controller?.readInspection();
    const definition = this.syncedDefinition;
    const items = rebuildItems
      ? Object.freeze((definition?.items ?? []).map((item, index) => {
          const compiled = controllerInspection?.items[index];
          const resolved = compiled?.definition === item
            ? compiled
            : undefined;
          return Object.freeze({
            source: item.source,
            index,
            runnable: item.options.to !== undefined,
            authoredPosition: item.authoredPosition,
            from: item.options.from,
            to: item.options.to,
            authoredDuration: item.options.duration,
            authoredEase: item.options.ease,
            resolvedStart: resolved?.resolvedStart ?? null,
            resolvedDuration: resolved?.resolvedDuration ?? null,
            resolvedEnd: resolved?.resolvedEnd ?? null,
          });
        }))
      : previousItems ?? [];

    return Object.freeze({
      revision,
      driver: controllerInspection?.driver ?? (
        this.options.scrollTrigger ? "scroll" : "manual"
      ),
      readiness: controllerInspection?.readiness ?? "empty",
      playState: this.currentPlayState,
      progress: controllerInspection?.progress ?? 0,
      totalDuration: controllerInspection?.totalDuration ?? 0,
      items,
    });
  }

  private readDisconnectedInspectionItems(
    previousItems: readonly TimelineInspectionItem[] | undefined,
    preserveAuthored: boolean,
  ): readonly TimelineInspectionItem[] {
    if (preserveAuthored && previousItems) {
      return Object.freeze(previousItems.map((item) => Object.freeze({
        ...item,
        resolvedStart: null,
        resolvedDuration: null,
        resolvedEnd: null,
      })));
    }

    return Object.freeze((this.syncedDefinition?.items ?? []).map(
      (item, index) => Object.freeze({
        source: item.source,
        index,
        runnable: item.options.to !== undefined,
        authoredPosition: item.authoredPosition,
        from: item.options.from,
        to: item.options.to,
        authoredDuration: item.options.duration,
        authoredEase: item.options.ease,
        resolvedStart: null,
        resolvedDuration: null,
        resolvedEnd: null,
      }),
    ));
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

    if (
      (this.controller?.isActive() && !this.controller.isScrollDriven()) ||
      this.syncPending
    ) {
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
      (!force && (
        !this.dirty ||
        (this.controller?.isActive() && !this.controller.isScrollDriven())
      ))
    ) {
      return;
    }

    const definition = this.readDefinition();
    this.dirty = false;

    if (!force && sameDefinition(this.syncedDefinition, definition)) {
      this.pendingChange = "structure";
      return;
    }

    this.controller?.syncDefinition(definition, force);
    this.syncedDefinition = definition;
    this.syncedSources = definition.items.map(
      (item) => item.source as MotionTweenElement,
    );
    this.pendingChange = "structure";
  }

  private applyPlaybackMode(): void {
    if (!this.controller?.hasContent()) {
      return;
    }

    if (this.controller.isScrollDriven()) {
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
      !this.controller ||
      this.controller.isScrollDriven()
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
    this.syncedDefinition = definition;

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

  private assertManualDriver(method: string): void {
    if (this.options.scrollTrigger === undefined) {
      return;
    }

    throw new DOMException(
      `${method}() is unavailable while options.scrollTrigger owns timeline progress.`,
      "InvalidStateError",
    );
  }
}
