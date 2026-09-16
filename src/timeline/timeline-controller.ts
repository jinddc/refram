import { gsap } from "gsap";
import type { ScrollTrigger as GsapScrollTrigger } from "gsap/ScrollTrigger";

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
  onScrollReady() {},
};

const ENDPOINT_EPSILON = 0.000_001;

function isDevelopmentBuild(): boolean {
  const environment = (import.meta as ImportMeta & {
    env?: { DEV?: boolean };
  }).env;
  return environment?.DEV ?? true;
}

function isEndpoint(progress: number): boolean {
  return (
    progress <= ENDPOINT_EPSILON ||
    progress >= 1 - ENDPOINT_EPSILON
  );
}

function clampProgress(progress: number): number {
  return Math.min(1, Math.max(0, progress));
}

function registeredScrollTrigger(): typeof GsapScrollTrigger | undefined {
  const core = gsap.core as typeof gsap.core & {
    globals(): Record<string, unknown>;
  };
  const globals = core.globals();
  const plugin = globals.ScrollTrigger;

  if (
    typeof plugin !== "function" ||
    typeof (plugin as typeof GsapScrollTrigger).create !== "function"
  ) {
    return undefined;
  }

  return plugin as typeof GsapScrollTrigger;
}

function prefersReducedMotion(): boolean {
  return (
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

function buildDestinationVars(
  item: TweenDefinition,
  onExcludedScrollTrigger: () => void,
) {
  const vars = { ...item.options.to };

  if (Object.hasOwn(vars, "scrollTrigger")) {
    delete vars.scrollTrigger;
    onExcludedScrollTrigger();
  }

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
  private scrollTraversalActive = false;
  private lastScrollProgress = 0;
  private suppressSemanticHooks = false;
  private scrollCancelled = false;
  private warnedMissingScrollTrigger = false;
  private warnedChildScrollTrigger = false;

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
    this.scrollCancelled = false;

    if (
      !this.connected ||
      (this.isActive() && !this.involvesScrollDriver(this.pendingDefinition))
    ) {
      return;
    }

    this.scheduleRebuild();
  }

  public syncDefinition(
    definition: TimelineDefinition,
    force = false,
  ): boolean {
    this.pendingDefinition = definition;
    this.scrollCancelled = false;

    if (
      !this.connected ||
      (!force && this.isActive() && !this.involvesScrollDriver(definition))
    ) {
      return false;
    }

    this.commitPendingDefinition();
    return true;
  }

  public play(): boolean {
    if (this.isScrollDriven()) {
      return false;
    }

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
    if (this.isScrollDriven()) {
      return;
    }

    this.timeline?.pause();
  }

  public reverse(): boolean {
    if (this.isScrollDriven()) {
      return false;
    }

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
    if (this.isScrollDriven()) {
      return false;
    }

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
    if (this.isScrollDriven()) {
      return false;
    }

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
    const wasScrollDriven = this.isScrollDriven();
    this.releaseContext(true);
    this.scrollCancelled = wasScrollDriven;
    this.scrollTraversalActive = false;

    if (!wasScrollDriven) {
      this.build();
    }

    return hadContent;
  }

  public append(
    definition: TimelineDefinition,
    appendedItems: readonly TweenDefinition[],
  ): boolean {
    if (this.isScrollDriven()) {
      return false;
    }

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
          buildDestinationVars(
            item,
            () => this.warnExcludedChildScrollTrigger(),
          ),
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
    if (this.isScrollDriven()) {
      return this.scrollTraversalActive;
    }

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

  public isScrollDriven(): boolean {
    const source = this.pendingDefinition ?? this.definition;
    return source.options.scrollTrigger !== undefined;
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
    this.scrollTraversalActive = false;
  }

  private scheduleRebuild(): void {
    const generation = ++this.rebuildGeneration;

    queueMicrotask(() => {
      if (
        !this.connected ||
        generation !== this.rebuildGeneration ||
        (this.isActive() && !this.isScrollDriven())
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

    if (!force && this.isActive() && !this.isScrollDriven()) {
      return;
    }

    this.commitPendingDefinition();
  }

  private commitPendingDefinition(): void {
    if (!this.pendingDefinition) {
      return;
    }

    const preserveProgress = (
      this.isScrollDriven() &&
      this.pendingDefinition.options.scrollTrigger !== undefined
    )
      ? this.currentScrollProgress()
      : undefined;

    this.rebuildGeneration += 1;
    this.definition = this.pendingDefinition;
    this.pendingDefinition = undefined;
    this.rebuild(preserveProgress);
  }

  private rebuild(preserveScrollProgress?: number): void {
    this.releaseContext(true);
    this.build(preserveScrollProgress);
  }

  private build(preserveScrollProgress?: number): void {
    const items = runnableItems(this.definition);
    const scrollOptions = this.definition.options.scrollTrigger;
    const scrollDriven = scrollOptions !== undefined;
    this.prepared = false;
    this.reducedMotion = prefersReducedMotion();

    this.reportExcludedChildScrollTriggers(items);

    if (items.length === 0 || !this.connected || this.scrollCancelled) {
      this.scrollTraversalActive = false;
      if (scrollDriven) {
        this.hooks.onScrollReady(0, false);
      }
      return;
    }

    if (scrollDriven && this.reducedMotion) {
      this.scrollTraversalActive = false;
      this.applyFinalPresentation(items);
      this.lastScrollProgress = 1;
      this.hooks.onScrollReady(1, true);
      return;
    }

    if (scrollDriven && !registeredScrollTrigger()) {
      this.scrollTraversalActive = false;
      this.warnMissingScrollTrigger();
      this.lastScrollProgress = 0;
      this.hooks.onScrollReady(0, false);
      return;
    }

    if (!scrollDriven && this.reducedMotion) {
      this.scrollTraversalActive = false;
      return;
    }

    const options = this.definition.options;
    const {
      onStart: userOnStart,
      onComplete: userOnComplete,
      onReverseComplete: userOnReverseComplete,
      onInterrupt: userOnInterrupt,
      callbackScope,
      scrollTrigger: ignoredScrollTrigger,
      ...timelineVars
    } = options;
    const hooks = this.hooks;
    const controller = this;
    const authoredOnUpdate = scrollOptions?.onUpdate;
    const scrollTriggerVars = scrollOptions
      ? {
          ...scrollOptions,
          onUpdate: function (
            this: unknown,
            trigger: GsapScrollTrigger,
          ) {
            authoredOnUpdate?.call(this, trigger);
            controller.handleScrollProgress(trigger.progress);
          },
        }
      : undefined;

    void ignoredScrollTrigger;
    this.suppressSemanticHooks = scrollDriven;

    this.context = gsap.context(() => {
      if (scrollDriven) {
        this.applyInitialPresentation(items);
      }

      this.timeline = gsap.timeline({
        ...timelineVars,
        ...(scrollDriven
          ? { scrollTrigger: scrollTriggerVars }
          : { paused: true }),
        onStart: function (this: unknown, ...args: unknown[]) {
          userOnStart?.apply(callbackScope ?? this, args);
          if (!scrollDriven) {
            hooks.onStart();
          }
        },
        onComplete: function (this: unknown, ...args: unknown[]) {
          userOnComplete?.apply(callbackScope ?? this, args);
          if (!scrollDriven) {
            hooks.onComplete();
          }
        },
        onReverseComplete: function (this: unknown, ...args: unknown[]) {
          userOnReverseComplete?.apply(callbackScope ?? this, args);
          if (!scrollDriven) {
            hooks.onComplete();
          }
        },
        onInterrupt: function (this: unknown, ...args: unknown[]) {
          userOnInterrupt?.apply(callbackScope ?? this, args);
          if (!scrollDriven) {
            hooks.onInterrupt();
          }
        },
      });

      for (const item of items) {
        this.timeline.to(
          item.target,
          buildDestinationVars(
            item,
            () => this.warnExcludedChildScrollTrigger(),
          ),
          item.authoredPosition,
        );
      }
    }, this.root);

    if (scrollDriven) {
      const trigger = this.timeline?.scrollTrigger;
      trigger?.refresh();

      if (preserveScrollProgress !== undefined) {
        this.timeline?.totalProgress(preserveScrollProgress, true);
      }

      const progress = clampProgress(
        preserveScrollProgress ?? trigger?.progress ?? 0,
      );
      this.lastScrollProgress = progress;
      this.scrollTraversalActive = !isEndpoint(progress);
      this.suppressSemanticHooks = false;
      this.hooks.onScrollReady(progress, false);
    } else {
      this.scrollTraversalActive = false;
      this.suppressSemanticHooks = false;
    }
  }

  private prepareInitialState(items: readonly TweenDefinition[]): void {
    if (!this.context) {
      return;
    }

    this.context.add(() => {
      this.applyInitialPresentation(items);
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

    const timeline = this.timeline;
    const scrollTrigger = timeline?.scrollTrigger;
    scrollTrigger?.kill(true);

    if (timeline && scrollTrigger) {
      (timeline as GsapTimeline & {
        scrollTrigger?: GsapScrollTrigger;
      }).scrollTrigger = undefined;
    }

    this.context?.revert();
    this.context = undefined;
    this.timeline = undefined;
    this.prepared = false;
  }

  private applyInitialPresentation(
    items: readonly TweenDefinition[],
  ): void {
    for (const item of items) {
      if (item.options.from) {
        gsap.set(
          item.target,
          sanitizePresentationVars(item.options.from),
        );
      }
    }
    this.prepared = true;
  }

  private applyFinalPresentation(
    items: readonly TweenDefinition[],
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
  }

  private handleScrollProgress(rawProgress: number): void {
    const progress = clampProgress(rawProgress);
    const previous = this.lastScrollProgress;
    this.lastScrollProgress = progress;

    if (this.suppressSemanticHooks || progress === previous) {
      return;
    }

    const previousAtEndpoint = isEndpoint(previous);
    const currentAtEndpoint = isEndpoint(progress);

    if (!this.scrollTraversalActive && previousAtEndpoint) {
      this.scrollTraversalActive = true;
      this.hooks.onStart();
    }

    if (this.scrollTraversalActive && currentAtEndpoint) {
      this.scrollTraversalActive = false;
      this.hooks.onComplete();
    }
  }

  private currentScrollProgress(): number {
    return clampProgress(
      this.timeline?.scrollTrigger?.progress ??
      this.timeline?.totalProgress() ??
      this.lastScrollProgress,
    );
  }

  private involvesScrollDriver(next: TimelineDefinition): boolean {
    return (
      this.isScrollDriven() ||
      next.options.scrollTrigger !== undefined
    );
  }

  private reportExcludedChildScrollTriggers(
    items: readonly TweenDefinition[],
  ): void {
    if (items.some((item) => (
      item.options.to !== undefined &&
      Object.hasOwn(item.options.to, "scrollTrigger")
    ))) {
      this.warnExcludedChildScrollTrigger();
    }
  }

  private warnMissingScrollTrigger(): void {
    if (this.warnedMissingScrollTrigger || !isDevelopmentBuild()) {
      return;
    }

    this.warnedMissingScrollTrigger = true;
    console.warn(
      "[motion-timeline] options.scrollTrigger requires the consumer to register GSAP ScrollTrigger before connecting or refreshing the element.",
    );
  }

  private warnExcludedChildScrollTrigger(): void {
    if (this.warnedChildScrollTrigger || !isDevelopmentBuild()) {
      return;
    }

    this.warnedChildScrollTrigger = true;
    console.warn(
      "[motion-timeline] motion-tween options.to.scrollTrigger is ignored; configure one root options.scrollTrigger on motion-timeline instead.",
    );
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
