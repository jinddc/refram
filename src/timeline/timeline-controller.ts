import { gsap } from "gsap";

import type { EffectController } from "../core/effect-controller";
import { sanitizePresentationVars } from "../gsap/presentation-vars";
import { createTimelineDefinition } from "./timeline-options";
import type {
  MotionTimelineOptions,
  TimelineDefinition,
  TimelineLifecycleHooks,
} from "./timeline.types";
import type { TweenDefinition } from "./tween.types";

type GsapContext = ReturnType<typeof gsap.context>;
type GsapTimeline = ReturnType<typeof gsap.timeline>;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const NOOP_HOOKS: TimelineLifecycleHooks = {
  onStart() {},
  onComplete() {},
  onInterrupt() {},
};

function prefersReducedMotion(): boolean {
  return (
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

function buildDestinationVars(item: TweenDefinition) {
  const vars = { ...item.options.to };

  if (item.options.duration !== undefined) {
    vars.duration = item.options.duration;
  }

  if (item.options.ease !== undefined) {
    vars.ease = item.options.ease;
  }

  // A paused authored timeline must never render during compilation.
  vars.immediateRender = false;
  return vars;
}

function runnableItems(
  definition: TimelineDefinition,
): readonly TweenDefinition[] {
  return definition.items.filter((item) => item.options.to !== undefined);
}

export class TimelineController
  implements EffectController<MotionTimelineOptions>
{
  private definition: TimelineDefinition;
  private pendingDefinition?: TimelineDefinition;
  private context?: GsapContext;
  private timeline?: GsapTimeline;
  private connected = false;
  private reducedMotion = false;
  private prepared = false;
  private rebuildGeneration = 0;

  public constructor(
    private readonly root: HTMLElement,
    options: MotionTimelineOptions = {},
    private readonly hooks: TimelineLifecycleHooks = NOOP_HOOKS,
  ) {
    this.definition = createTimelineDefinition(options, []);
  }

  public connect(): void {
    if (this.connected) {
      return;
    }

    this.connected = true;
  }

  public update(options: MotionTimelineOptions): void {
    const source = this.pendingDefinition ?? this.definition;
    this.pendingDefinition = createTimelineDefinition(options, source.items);

    if (!this.connected || this.isActive()) {
      return;
    }

    this.scheduleRebuild();
  }

  public syncDefinition(
    definition: TimelineDefinition,
    force = false,
  ): boolean {
    this.pendingDefinition = definition;

    if (!this.connected || (!force && this.isActive())) {
      return false;
    }

    this.commitPendingDefinition();
    return true;
  }

  public play(): boolean {
    this.flushPendingDefinition();
    const items = runnableItems(this.definition);

    if (items.length === 0) {
      return false;
    }

    if (this.reducedMotion) {
      this.completeReducedMotion(items, "onComplete", "onCompleteParams");
      return true;
    }

    if (!this.timeline) {
      return false;
    }

    if (this.timeline.totalProgress() === 1) {
      return false;
    }

    if (this.timeline.totalProgress() === 0 && !this.prepared) {
      this.prepareInitialState(items);
      this.timeline.invalidate();
    }

    this.timeline.play();
    return true;
  }

  public pause(): void {
    this.timeline?.pause();
  }

  public reverse(): boolean {
    this.flushPendingDefinition();
    const items = runnableItems(this.definition);

    if (items.length === 0) {
      return false;
    }

    if (this.reducedMotion) {
      this.completeReducedMotion(
        items,
        "onReverseComplete",
        "onReverseCompleteParams",
      );
      return true;
    }

    if (!this.timeline) {
      return false;
    }

    if (this.timeline.totalProgress() === 0) {
      this.prepareInitialState(items);
      this.timeline.invalidate().totalProgress(1, true);
    }

    this.timeline.reverse();
    return true;
  }

  public restart(): boolean {
    this.flushPendingDefinition(true);
    const items = runnableItems(this.definition);

    if (items.length === 0) {
      return false;
    }

    if (this.reducedMotion) {
      this.completeReducedMotion(items, "onComplete", "onCompleteParams");
      return true;
    }

    if (!this.timeline) {
      return false;
    }

    this.prepareInitialState(items);
    this.timeline.invalidate().restart();
    return true;
  }

  public finish(): boolean {
    this.flushPendingDefinition();
    const items = runnableItems(this.definition);

    if (items.length === 0) {
      return false;
    }

    if (this.reducedMotion) {
      this.completeReducedMotion(items, "onComplete", "onCompleteParams");
      return true;
    }

    if (!this.timeline) {
      return false;
    }

    if (this.timeline.totalProgress() === 0 && !this.prepared) {
      this.prepareInitialState(items);
      this.timeline.invalidate();
    }

    this.timeline.totalProgress(1, false).pause();
    return true;
  }

  public cancel(): boolean {
    const hadContent = this.hasContent();
    this.releaseContext(true);
    this.build();
    return hadContent;
  }

  public append(
    definition: TimelineDefinition,
    appendedItems: readonly TweenDefinition[],
  ): boolean {
    const runnable = appendedItems.filter(
      (item) => item.options.to !== undefined,
    );

    this.pendingDefinition = definition;
    this.definition = definition;
    this.pendingDefinition = undefined;

    if (runnable.length === 0) {
      return false;
    }

    if (this.reducedMotion) {
      this.completeReducedMotion(runnable, "onComplete", "onCompleteParams");
      return true;
    }

    if (!this.timeline || !this.context) {
      this.rebuild();
      return this.restart();
    }

    const batchStart = this.timeline.duration();
    const timeline = this.timeline;
    this.context.add(() => {
      for (const item of runnable) {
        if (item.options.from) {
          gsap.set(
            item.target,
            sanitizePresentationVars(item.options.from),
          );
        }
      }

      runnable.forEach((item, index) => {
        timeline.to(
          item.target,
          buildDestinationVars(item),
          index === 0 ? batchStart : item.authoredPosition,
        );
      });
    });

    this.invokeTimelineCallback("onStart", "onStartParams");
    this.hooks.onStart();
    timeline.play(batchStart);
    return true;
  }

  public hasContent(): boolean {
    const source = this.pendingDefinition ?? this.definition;
    return runnableItems(source).length > 0;
  }

  public isActive(): boolean {
    if (!this.timeline || this.timeline.paused()) {
      return false;
    }

    const progress = this.timeline.totalProgress();
    return this.timeline.reversed() ? progress > 0 : progress < 1;
  }

  public totalDuration(): number {
    this.flushPendingDefinition();
    return this.timeline?.totalDuration() ?? 0;
  }

  public resize(): void {
    // Timeline composition has no size-dependent state.
  }

  public destroy(): void {
    if (!this.connected) {
      return;
    }

    const interrupted = this.isActive();
    if (interrupted) {
      this.invokeTimelineCallback("onInterrupt", "onInterruptParams");
      this.hooks.onInterrupt();
    }

    this.connected = false;
    this.rebuildGeneration += 1;
    this.releaseContext(true);
    this.pendingDefinition = undefined;
  }

  private scheduleRebuild(): void {
    const generation = ++this.rebuildGeneration;

    queueMicrotask(() => {
      if (
        !this.connected ||
        generation !== this.rebuildGeneration ||
        this.isActive()
      ) {
        return;
      }

      this.commitPendingDefinition();
    });
  }

  private flushPendingDefinition(force = false): void {
    if (!this.pendingDefinition) {
      return;
    }

    if (!force && this.isActive()) {
      return;
    }

    this.commitPendingDefinition();
  }

  private commitPendingDefinition(): void {
    if (!this.pendingDefinition) {
      return;
    }

    this.rebuildGeneration += 1;
    this.definition = this.pendingDefinition;
    this.pendingDefinition = undefined;
    this.rebuild();
  }

  private rebuild(): void {
    this.releaseContext(true);
    this.build();
  }

  private build(): void {
    const items = runnableItems(this.definition);
    this.prepared = false;
    this.reducedMotion = prefersReducedMotion();

    if (items.length === 0 || this.reducedMotion || !this.connected) {
      return;
    }

    const options = this.definition.options;
    const {
      onStart: userOnStart,
      onComplete: userOnComplete,
      onReverseComplete: userOnReverseComplete,
      onInterrupt: userOnInterrupt,
      callbackScope,
      ...timelineVars
    } = options;
    const hooks = this.hooks;

    this.context = gsap.context(() => {
      this.timeline = gsap.timeline({
        ...timelineVars,
        paused: true,
        onStart: function (this: unknown, ...args: unknown[]) {
          userOnStart?.apply(callbackScope ?? this, args);
          hooks.onStart();
        },
        onComplete: function (this: unknown, ...args: unknown[]) {
          userOnComplete?.apply(callbackScope ?? this, args);
          hooks.onComplete();
        },
        onReverseComplete: function (this: unknown, ...args: unknown[]) {
          userOnReverseComplete?.apply(callbackScope ?? this, args);
          hooks.onComplete();
        },
        onInterrupt: function (this: unknown, ...args: unknown[]) {
          userOnInterrupt?.apply(callbackScope ?? this, args);
          hooks.onInterrupt();
        },
      });

      for (const item of items) {
        this.timeline.to(
          item.target,
          buildDestinationVars(item),
          item.authoredPosition,
        );
      }
    }, this.root);
  }

  private prepareInitialState(items: readonly TweenDefinition[]): void {
    if (!this.context) {
      return;
    }

    this.context.add(() => {
      for (const item of items) {
        if (item.options.from) {
          gsap.set(
            item.target,
            sanitizePresentationVars(item.options.from),
          );
        }
      }
    });
    this.prepared = true;
  }

  private completeReducedMotion(
    items: readonly TweenDefinition[],
    completionName: "onComplete" | "onReverseComplete",
    paramsName: "onCompleteParams" | "onReverseCompleteParams",
  ): void {
    this.releaseContext(true);
    this.context = gsap.context(() => {
      for (const item of items) {
        if (item.options.to) {
          gsap.set(
            item.target,
            sanitizePresentationVars(item.options.to),
          );
        }
      }
    }, this.root);

    this.invokeTimelineCallback("onStart", "onStartParams");
    this.hooks.onStart();
    this.invokeTimelineCallback(completionName, paramsName);
    this.hooks.onComplete();
  }

  private releaseContext(suppressCallbacks: boolean): void {
    if (suppressCallbacks && this.timeline) {
      this.timeline.eventCallback("onInterrupt", null);
      for (const child of this.timeline.getChildren(true, true, true)) {
        child.eventCallback("onInterrupt", null);
      }
    }

    this.context?.revert();
    this.context = undefined;
    this.timeline = undefined;
    this.prepared = false;
  }

  private invokeTimelineCallback(
    callbackName:
      | "onStart"
      | "onComplete"
      | "onReverseComplete"
      | "onInterrupt",
    paramsName:
      | "onStartParams"
      | "onCompleteParams"
      | "onReverseCompleteParams"
      | "onInterruptParams",
  ): void {
    const callback = this.definition.options[callbackName] as
      | ((...args: unknown[]) => void)
      | undefined;
    if (!callback) {
      return;
    }

    const params = this.definition.options[paramsName] as
      | unknown[]
      | undefined;
    callback.apply(
      this.definition.options.callbackScope ?? this,
      params ?? [],
    );
  }
}
