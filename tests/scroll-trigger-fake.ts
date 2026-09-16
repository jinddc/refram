import type { gsap } from "gsap";
import type { ScrollTrigger } from "gsap/ScrollTrigger";
import { vi } from "vitest";

type GsapAnimation = gsap.core.Animation;

export class FakeScrollTrigger {
  public static instances: FakeScrollTrigger[] = [];

  public readonly refresh = vi.fn();
  public readonly kill = vi.fn();
  public readonly revert = vi.fn();
  public progress = 0;

  private constructor(
    public readonly vars: ScrollTrigger.Vars,
    public readonly animation: GsapAnimation,
  ) {}

  public static create(
    vars: ScrollTrigger.Vars,
    animation: GsapAnimation,
  ): FakeScrollTrigger {
    const trigger = new FakeScrollTrigger(vars, animation);
    (animation as unknown as {
      scrollTrigger?: FakeScrollTrigger;
    }).scrollTrigger = trigger;
    FakeScrollTrigger.instances.push(trigger);
    return trigger;
  }

  public static reset(): void {
    FakeScrollTrigger.instances = [];
  }

  public setProgress(progress: number): void {
    this.progress = progress;
    this.animation.totalProgress(progress, true);
    this.vars.onUpdate?.(this as unknown as ScrollTrigger);
  }
}

export function installFakeScrollTrigger(gsapRuntime: typeof gsap): void {
  scrollTriggerGlobals(gsapRuntime).ScrollTrigger = FakeScrollTrigger;
}

export function removeFakeScrollTrigger(gsapRuntime: typeof gsap): void {
  delete scrollTriggerGlobals(gsapRuntime).ScrollTrigger;
  FakeScrollTrigger.reset();
}

function scrollTriggerGlobals(
  gsapRuntime: typeof gsap,
): Record<string, unknown> {
  const core = gsapRuntime.core as typeof gsapRuntime.core & {
    globals(): Record<string, unknown>;
  };
  return core.globals();
}
