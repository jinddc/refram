import { gsap } from "gsap";

import type { EffectController } from "../core/effect-controller";
import { whenVisible } from "../core/when-visible";
import { sanitizePresentationVars } from "../gsap/presentation-vars";
import {
  copyRevealOptions,
  DEFAULT_REVEAL_THRESHOLD,
} from "./reveal-options";
import type {
  MotionTweenVars,
  StandaloneRevealOptions,
} from "./reveal.types";

type GsapContext = ReturnType<typeof gsap.context>;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const DEFAULT_DURATION = 0.8;
const DEFAULT_EASE = "power3.out";
const DEFAULT_FROM: MotionTweenVars = {
  autoAlpha: 0,
  y: 24,
};
const DEFAULT_TO: MotionTweenVars = {
  autoAlpha: 1,
  y: 0,
};

function prefersReducedMotion(): boolean {
  return (
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

interface FromToVars {
  from: MotionTweenVars;
  to: MotionTweenVars;
}

function buildFromToVars(
  options: StandaloneRevealOptions,
): FromToVars {
  return {
    from: {
      ...DEFAULT_FROM,
      ...options.from,
    },
    to: {
      ...DEFAULT_TO,
      ...options.to,
      duration: options.duration ?? DEFAULT_DURATION,
      ease: options.ease ?? DEFAULT_EASE,
    },
  };
}

function haveSameTweenVars(
  left: MotionTweenVars | undefined,
  right: MotionTweenVars | undefined,
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
    leftKeys.every((key) => Object.is(left[key], right[key]))
  );
}

function haveSameRendererOptions(
  left: StandaloneRevealOptions,
  right: StandaloneRevealOptions,
): boolean {
  return (
    Object.is(left.duration, right.duration) &&
    Object.is(left.ease, right.ease) &&
    haveSameTweenVars(left.from, right.from) &&
    haveSameTweenVars(left.to, right.to)
  );
}

export class StandaloneRevealController
  implements EffectController<StandaloneRevealOptions>
{
  private options: StandaloneRevealOptions;
  private context?: GsapContext;
  private visibilityCleanup?: () => void;
  private connected = false;
  private prepared = false;
  private triggered = false;
  private preparationGeneration = 0;

  public constructor(
    private readonly target: HTMLElement,
    options: StandaloneRevealOptions,
  ) {
    this.options = copyRevealOptions(options);
  }

  public connect(): void {
    if (this.connected) {
      return;
    }

    this.connected = true;
    this.schedulePreparation();
  }

  public update(options: StandaloneRevealOptions): void {
    const previousOptions = this.options;
    const nextOptions = copyRevealOptions(options);
    const thresholdChanged =
      this.thresholdFor(previousOptions) !== this.thresholdFor(nextOptions);
    const rendererChanged = !haveSameRendererOptions(
      previousOptions,
      nextOptions,
    );
    this.options = nextOptions;

    if (!this.connected) {
      return;
    }

    if (!this.triggered) {
      if (rendererChanged && this.prepared) {
        this.prepareRun();
      }

      if (thresholdChanged) {
        this.visibilityCleanup?.();
        this.visibilityCleanup = undefined;

        if (this.prepared) {
          this.observe();
        }
      }

      return;
    }

    if (rendererChanged) {
      this.restartRun();
    }
  }

  public resize(): void {
    // The approved reveal has no size-dependent state.
  }

  public destroy(): void {
    if (!this.connected) {
      return;
    }

    this.connected = false;
    this.preparationGeneration += 1;
    this.visibilityCleanup?.();
    this.visibilityCleanup = undefined;
    this.context?.revert();
    this.context = undefined;
    this.prepared = false;
    this.triggered = false;
  }

  private schedulePreparation(): void {
    const generation = ++this.preparationGeneration;

    queueMicrotask(() => {
      if (
        !this.connected ||
        generation !== this.preparationGeneration
      ) {
        return;
      }

      if (prefersReducedMotion()) {
        this.triggered = true;
        this.applyFinalState();
        return;
      }

      if (this.prepareRun()) {
        this.observe();
      }
    });
  }

  private observe(): void {
    this.visibilityCleanup = whenVisible(this.target, () => {
      if (!this.connected) {
        return;
      }

      this.triggered = true;
      this.startRun();
    }, this.thresholdFor(this.options));
  }

  private thresholdFor(options: StandaloneRevealOptions): number {
    return options.threshold ?? DEFAULT_REVEAL_THRESHOLD;
  }

  private prepareRun(): boolean {
    this.context?.revert();
    this.context = undefined;
    this.prepared = false;
    const fromToVars = buildFromToVars(this.options);
    const context = gsap.context(() => {
      gsap.set(
        this.target,
        sanitizePresentationVars(fromToVars.from),
      );
    }, this.target);

    if (!this.connected) {
      context.revert();
      return false;
    }

    this.context = context;
    this.prepared = true;
    return true;
  }

  private startRun(): void {
    if (prefersReducedMotion()) {
      this.applyFinalState();
      return;
    }

    if (!this.context && !this.prepareRun()) {
      return;
    }

    const fromToVars = buildFromToVars(this.options);
    this.context?.add(() => {
      gsap.to(this.target, fromToVars.to);
    });
  }

  private restartRun(): void {
    if (prefersReducedMotion()) {
      this.applyFinalState();
      return;
    }

    if (this.prepareRun()) {
      this.startRun();
    }
  }

  private applyFinalState(): void {
    this.context?.revert();
    this.context = undefined;
    this.prepared = false;
    const fromToVars = buildFromToVars(this.options);
    const context = gsap.context(() => {
      gsap.set(
        this.target,
        sanitizePresentationVars(fromToVars.to),
      );
    }, this.target);

    if (!this.connected) {
      context.revert();
      return;
    }

    this.context = context;
  }
}
