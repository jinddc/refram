// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StandaloneRevealController } from "../src/reveal/reveal-controller";

class TestIntersectionObserver implements IntersectionObserver {
  public static instances: TestIntersectionObserver[] = [];

  public readonly root = null;
  public readonly rootMargin = "0px";
  public readonly thresholds: readonly number[] = [0.15];
  public readonly disconnect = vi.fn();
  public readonly observe = vi.fn();
  public readonly unobserve = vi.fn();

  public constructor(
    private readonly callback: IntersectionObserverCallback,
  ) {
    TestIntersectionObserver.instances.push(this);
  }

  public takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  public reveal(): void {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this,
    );
  }
}

function createTarget(): HTMLElement {
  const target = document.createElement("div");
  document.body.append(target);
  return target;
}

function currentTween(): gsap.core.Tween | undefined {
  return gsap.globalTimeline.getChildren(
    false,
    true,
    false,
  )[0] as gsap.core.Tween | undefined;
}

function mockMotionPreference(matches: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches }) as MediaQueryList),
  );
}

beforeEach(() => {
  TestIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
  mockMotionPreference(false);
});

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("StandaloneRevealController", () => {
  it("waits for first visibility and builds the approved defaults once", () => {
    const target = createTarget();
    const controller = new StandaloneRevealController(target, {});

    controller.connect();
    controller.connect();
    expect(gsap.globalTimeline.getChildren()).toHaveLength(0);
    expect(TestIntersectionObserver.instances).toHaveLength(1);

    TestIntersectionObserver.instances[0]?.reveal();
    TestIntersectionObserver.instances[0]?.reveal();

    const tween = currentTween();
    expect(gsap.globalTimeline.getChildren()).toHaveLength(1);
    expect(tween?.duration()).toBeCloseTo(0.8);
    expect(tween?.vars.ease).toBe("power3.out");
    expect(tween?.vars.autoAlpha).toBe(1);
    expect(tween?.vars.y).toBe(0);
    expect(target.style.opacity).toBe("0");
    expect(gsap.getProperty(target, "y")).toBe(24);
  });

  it("lets top-level duration and ease override destination vars", () => {
    const controller = new StandaloneRevealController(createTarget(), {
      duration: 0.4,
      ease: "linear",
      to: { duration: 2, ease: "bounce.out", x: 20 },
    });

    controller.connect();
    TestIntersectionObserver.instances[0]?.reveal();

    expect(currentTween()?.duration()).toBeCloseTo(0.4);
    expect(currentTween()?.vars.ease).toBe("linear");
    expect(currentTween()?.vars.x).toBe(20);
  });

  it("uses the latest pending options without replacing the observer", () => {
    const controller = new StandaloneRevealController(createTarget(), {});
    controller.connect();

    controller.update({ duration: 0.3 });
    expect(TestIntersectionObserver.instances).toHaveLength(1);
    expect(gsap.globalTimeline.getChildren()).toHaveLength(0);

    TestIntersectionObserver.instances[0]?.reveal();
    expect(currentTween()?.duration()).toBeCloseTo(0.3);
  });

  it("reverts and restarts after the first trigger", () => {
    const target = createTarget();
    const controller = new StandaloneRevealController(target, {
      duration: 1,
    });
    controller.connect();
    TestIntersectionObserver.instances[0]?.reveal();
    const firstTween = currentTween();

    controller.update({ duration: 0.25 });

    expect(gsap.globalTimeline.getChildren()).toHaveLength(1);
    expect(currentTween()).not.toBe(firstTween);
    expect(currentTween()?.duration()).toBeCloseTo(0.25);
  });

  it("restarts when options change after the prior run settled", () => {
    const controller = new StandaloneRevealController(createTarget(), {
      duration: 0.4,
    });
    controller.connect();
    TestIntersectionObserver.instances[0]?.reveal();
    const settledTween = currentTween();
    settledTween?.totalProgress(1, false);

    controller.update({ duration: 0.6 });

    expect(currentTween()).not.toBe(settledTween);
    expect(currentTween()?.duration()).toBeCloseTo(0.6);
  });

  it("applies the final state immediately for reduced motion", () => {
    mockMotionPreference(true);
    const target = createTarget();
    const controller = new StandaloneRevealController(target, {
      to: { autoAlpha: 1, x: 12 },
    });

    controller.connect();
    TestIntersectionObserver.instances[0]?.reveal();

    expect(target.style.opacity).toBe("1");
    expect(target.style.visibility).not.toBe("hidden");
    expect(gsap.getProperty(target, "x")).toBe(12);
  });

  it("animates when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    const controller = new StandaloneRevealController(createTarget(), {});

    controller.connect();
    TestIntersectionObserver.instances[0]?.reveal();

    expect(currentTween()?.duration()).toBeCloseTo(0.8);
  });

  it("passes renderer callbacks through to GSAP", () => {
    const onComplete = vi.fn();
    const controller = new StandaloneRevealController(createTarget(), {
      to: { onComplete },
    });

    controller.connect();
    TestIntersectionObserver.instances[0]?.reveal();
    currentTween()?.totalProgress(1, false);

    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("cleans pending and rendered resources and reconnects freshly", () => {
    const controller = new StandaloneRevealController(createTarget(), {});
    controller.connect();
    const firstObserver = TestIntersectionObserver.instances[0];

    controller.destroy();
    controller.destroy();
    firstObserver?.reveal();

    expect(firstObserver?.disconnect).toHaveBeenCalledOnce();
    expect(gsap.globalTimeline.getChildren()).toHaveLength(0);

    controller.connect();
    expect(TestIntersectionObserver.instances).toHaveLength(2);
    TestIntersectionObserver.instances[1]?.reveal();
    expect(gsap.globalTimeline.getChildren()).toHaveLength(1);

    controller.destroy();
    expect(gsap.globalTimeline.getChildren()).toHaveLength(0);
  });

  it("keeps twenty instances isolated and offscreen instances idle", () => {
    const controllers = Array.from({ length: 20 }, () =>
      new StandaloneRevealController(createTarget(), {}),
    );

    controllers.forEach((controller) => controller.connect());

    expect(TestIntersectionObserver.instances).toHaveLength(20);
    expect(gsap.globalTimeline.getChildren()).toHaveLength(0);

    TestIntersectionObserver.instances
      .slice(0, 5)
      .forEach((observer) => observer.reveal());

    expect(gsap.globalTimeline.getChildren()).toHaveLength(5);

    controllers.forEach((controller) => controller.destroy());

    expect(gsap.globalTimeline.getChildren()).toHaveLength(0);
    expect(
      TestIntersectionObserver.instances.every(
        (observer) => observer.disconnect.mock.calls.length === 1,
      ),
    ).toBe(true);
  });
});
