import { gsap } from "gsap";

import type { EffectController } from "../core/effect-controller";
import { whenVisible } from "../core/when-visible";
import { copyRevealOptions } from "./reveal-options";
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

export class StandaloneRevealController
  implements EffectController<StandaloneRevealOptions>
{
  private options: StandaloneRevealOptions;
  private context?: GsapContext;
  private visibilityCleanup?: () => void;
  private connected = false;
  private triggered = false;

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
    this.visibilityCleanup = whenVisible(this.target, () => {
      if (!this.connected) {
        return;
      }

      this.triggered = true;
      this.buildRun();
    });
  }

  public update(options: StandaloneRevealOptions): void {
    this.options = copyRevealOptions(options);

    if (!this.connected || !this.triggered) {
      return;
    }

    this.buildRun();
  }

  public resize(): void {
    // The approved reveal has no size-dependent state.
  }

  public destroy(): void {
    if (!this.connected) {
      return;
    }

    this.visibilityCleanup?.();
    this.visibilityCleanup = undefined;
    this.context?.revert();
    this.context = undefined;
    this.triggered = false;
    this.connected = false;
  }

  private buildRun(): void {
    this.context?.revert();
    this.context = gsap.context(() => {
      const fromToVars = buildFromToVars(this.options);

      if (prefersReducedMotion()) {
        gsap.set(this.target, {
          ...fromToVars.to,
          duration: 0,
        });
        return;
      }

      gsap.fromTo(
        this.target,
        fromToVars.from,
        fromToVars.to,
      );
    }, this.target);
  }
}
