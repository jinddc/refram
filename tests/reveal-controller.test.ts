// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StandaloneRevealController } from "../src/reveal/reveal-controller";

class TestIntersectionObserver implements IntersectionObserver {
  public static instances: TestIntersectionObserver[] = [];

  public readonly root = null;
  public readonly rootMargin = "0px";
  public readonly thresholds: readonly number[];
  public readonly disconnect = vi.fn();
  public readonly observe = vi.fn();
  public readonly unobserve = vi.fn();

  public constructor(
    private readonly callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    const threshold = options?.threshold ?? 0;
    this.thresholds = Array.isArray(threshold) ? threshold : [threshold];
    TestIntersectionObserver.instances.push(this);
  }

  public takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  public reveal(
    intersectionRatio = this.thresholds[0] ?? 0,
  ): void {
    this.callback(
      [
        {
          isIntersecting: true,
          intersectionRatio,
        } as IntersectionObserverEntry,
      ],
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

async function flushPreparation(): Promise<void> {
  await Promise.resolve();
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
  it("prepares defaults before visibility and builds once", async () => {
    const target = createTarget();
    const controller = new StandaloneRevealController(target, {});

    controller.connect();
    controller.connect();
    await flushPreparation();
    expect(gsap.globalTimeline.getChildren()).toHaveLength(0);
    expect(TestIntersectionObserver.instances).toHaveLength(1);
    expect(target.style.opacity).toBe("0");
    expect(gsap.getProperty(target, "y")).toBe(24);

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

  it("lets top-level duration and ease override destination vars", async () => {
    const controller = new StandaloneRevealController(createTarget(), {
      duration: 0.4,
      ease: "linear",
      to: { duration: 2, ease: "bounce.out", x: 20 },
    });

    controller.connect();
    await flushPreparation();
    TestIntersectionObserver.instances[0]?.reveal();

    expect(currentTween()?.duration()).toBeCloseTo(0.4);
    expect(currentTween()?.vars.ease).toBe("linear");
    expect(currentTween()?.vars.x).toBe(20);
  });

  it("uses the latest pending options before preparation", async () => {
    const controller = new StandaloneRevealController(createTarget(), {});
    controller.connect();
    controller.update({ duration: 0.3 });
    await flushPreparation();
    expect(TestIntersectionObserver.instances).toHaveLength(1);
    expect(gsap.globalTimeline.getChildren()).toHaveLength(0);

    TestIntersectionObserver.instances[0]?.reveal();
    expect(currentTween()?.duration()).toBeCloseTo(0.3);
  });

  it("rebuilds the prepared state when renderer options change", async () => {
    const target = createTarget();
    const controller = new StandaloneRevealController(target, {
      from: { autoAlpha: 0, y: 10 },
    });
    controller.connect();
    await flushPreparation();
    const observer = TestIntersectionObserver.instances[0];

    expect(gsap.getProperty(target, "y")).toBe(10);

    controller.update({
      from: { autoAlpha: 0, y: 40 },
    });

    expect(TestIntersectionObserver.instances).toHaveLength(1);
    expect(TestIntersectionObserver.instances[0]).toBe(observer);
    expect(gsap.getProperty(target, "y")).toBe(40);
  });

  it("keeps the prepared state below threshold", async () => {
    const target = createTarget();
    const controller = new StandaloneRevealController(target, {
      threshold: 0.8,
    });
    controller.connect();
    await flushPreparation();

    TestIntersectionObserver.instances[0]?.reveal(0.5);

    expect(currentTween()).toBeUndefined();
    expect(target.style.opacity).toBe("0");
    expect(gsap.getProperty(target, "y")).toBe(24);
  });

  it("observes with a custom threshold", async () => {
    const controller = new StandaloneRevealController(createTarget(), {
      threshold: 0.6,
    });

    controller.connect();
    await flushPreparation();

    expect(TestIntersectionObserver.instances[0]?.thresholds).toEqual([0.6]);
  });

  it("replaces a pending observer only when threshold changes", async () => {
    const controller = new StandaloneRevealController(createTarget(), {
      threshold: 0.2,
    });
    controller.connect();
    await flushPreparation();
    const firstObserver = TestIntersectionObserver.instances[0];

    controller.update({ threshold: 0.2, duration: 0.3 });
    expect(TestIntersectionObserver.instances).toHaveLength(1);

    controller.update({ threshold: 0.7, duration: 0.3 });
    const secondObserver = TestIntersectionObserver.instances[1];
    expect(firstObserver?.disconnect).toHaveBeenCalledOnce();
    expect(secondObserver?.thresholds).toEqual([0.7]);

    firstObserver?.reveal(1);
    expect(gsap.globalTimeline.getChildren()).toHaveLength(0);

    secondObserver?.reveal(0.7);
    expect(currentTween()?.duration()).toBeCloseTo(0.3);
  });

  it("stores a post-trigger threshold without replaying the renderer", async () => {
    const controller = new StandaloneRevealController(createTarget(), {
      threshold: 0.2,
    });
    controller.connect();
    await flushPreparation();
    TestIntersectionObserver.instances[0]?.reveal(0.2);
    const firstTween = currentTween();

    controller.update({ threshold: 0.8 });

    expect(TestIntersectionObserver.instances).toHaveLength(1);
    expect(currentTween()).toBe(firstTween);

    controller.destroy();
    controller.connect();
    await flushPreparation();
    expect(TestIntersectionObserver.instances[1]?.thresholds).toEqual([0.8]);
  });

  it("reverts and restarts after the first trigger", async () => {
    const target = createTarget();
    const controller = new StandaloneRevealController(target, {
      duration: 1,
    });
    controller.connect();
    await flushPreparation();
    TestIntersectionObserver.instances[0]?.reveal();
    const firstTween = currentTween();

    controller.update({ duration: 0.25 });

    expect(gsap.globalTimeline.getChildren()).toHaveLength(1);
    expect(currentTween()).not.toBe(firstTween);
    expect(currentTween()?.duration()).toBeCloseTo(0.25);
  });

  it("restarts when options change after the prior run settled", async () => {
    const controller = new StandaloneRevealController(createTarget(), {
      duration: 0.4,
    });
    controller.connect();
    await flushPreparation();
    TestIntersectionObserver.instances[0]?.reveal();
    const settledTween = currentTween();
    settledTween?.totalProgress(1, false);

    controller.update({ duration: 0.6 });

    expect(currentTween()).not.toBe(settledTween);
    expect(currentTween()?.duration()).toBeCloseTo(0.6);
  });

  it("applies the final state immediately without observing for reduced motion", async () => {
    mockMotionPreference(true);
    const target = createTarget();
    const onComplete = vi.fn();
    const controller = new StandaloneRevealController(target, {
      to: { autoAlpha: 1, delay: 10, onComplete, x: 12 },
    });

    controller.connect();
    await flushPreparation();

    expect(target.style.opacity).toBe("1");
    expect(target.style.visibility).not.toBe("hidden");
    expect(gsap.getProperty(target, "x")).toBe(12);
    expect(TestIntersectionObserver.instances).toHaveLength(0);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("animates when matchMedia is unavailable", async () => {
    vi.stubGlobal("matchMedia", undefined);
    const controller = new StandaloneRevealController(createTarget(), {});

    controller.connect();
    await flushPreparation();
    TestIntersectionObserver.instances[0]?.reveal();

    expect(currentTween()?.duration()).toBeCloseTo(0.8);
  });

  it("prepares before the unsupported-observer fallback starts", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const target = createTarget();
    const controller = new StandaloneRevealController(target, {});

    controller.connect();
    await flushPreparation();

    expect(currentTween()?.duration()).toBeCloseTo(0.8);
    expect(gsap.getProperty(target, "y")).toBe(24);
  });

  it("does not pass from callbacks into preparation or the destination tween", async () => {
    const onComplete = vi.fn();
    const controller = new StandaloneRevealController(createTarget(), {
      from: { autoAlpha: 0, onComplete },
    });

    controller.connect();
    await flushPreparation();

    expect(onComplete).not.toHaveBeenCalled();

    TestIntersectionObserver.instances[0]?.reveal();
    currentTween()?.totalProgress(1, false);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("passes renderer callbacks through to GSAP", async () => {
    const onComplete = vi.fn();
    const controller = new StandaloneRevealController(createTarget(), {
      to: { onComplete },
    });

    controller.connect();
    await flushPreparation();
    TestIntersectionObserver.instances[0]?.reveal();
    currentTween()?.totalProgress(1, false);

    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("cleans pending and rendered resources and reconnects freshly", async () => {
    const controller = new StandaloneRevealController(createTarget(), {});
    controller.connect();
    await flushPreparation();
    const firstObserver = TestIntersectionObserver.instances[0];

    controller.destroy();
    controller.destroy();
    firstObserver?.reveal();

    expect(firstObserver?.disconnect).toHaveBeenCalledOnce();
    expect(gsap.globalTimeline.getChildren()).toHaveLength(0);

    controller.connect();
    await flushPreparation();
    expect(TestIntersectionObserver.instances).toHaveLength(2);
    TestIntersectionObserver.instances[1]?.reveal();
    expect(gsap.globalTimeline.getChildren()).toHaveLength(1);

    controller.destroy();
    expect(gsap.globalTimeline.getChildren()).toHaveLength(0);
  });

  it("invalidates preparation when destroyed before its microtask", async () => {
    const target = createTarget();
    const controller = new StandaloneRevealController(target, {});

    controller.connect();
    controller.destroy();
    await flushPreparation();

    expect(TestIntersectionObserver.instances).toHaveLength(0);
    expect(target.style.opacity).toBe("");

    controller.connect();
    await flushPreparation();
    expect(TestIntersectionObserver.instances).toHaveLength(1);
    expect(target.style.opacity).toBe("0");
  });

  it("keeps twenty instances isolated and offscreen instances idle", async () => {
    const controllers = Array.from({ length: 20 }, () =>
      new StandaloneRevealController(createTarget(), {}),
    );

    controllers.forEach((controller) => controller.connect());
    await flushPreparation();

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
