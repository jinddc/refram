// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MotionRevealElement,
  registerMotionReveal,
} from "../src/reveal";

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

beforeEach(() => {
  TestIntersectionObserver.instances = [];
  // Renderer behavior is covered by reveal-controller tests. Keeping GSAP's
  // DOM measurement out of these adapter tests avoids happy-dom emitting
  // artificial disconnect/reconnect reactions for transformed custom elements.
  vi.spyOn(gsap, "set").mockReturnValue({} as gsap.core.Tween);
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false }) as MediaQueryList),
  );
  registerMotionReveal();
});

async function flushPreparation(): Promise<void> {
  await Promise.resolve();
}

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MotionRevealElement", () => {
  it("registers explicitly and idempotently", () => {
    registerMotionReveal();

    expect(customElements.get("motion-reveal")).toBe(
      MotionRevealElement,
    );
  });

  it("has empty property defaults and one threshold attribute", () => {
    const element = document.createElement(
      "motion-reveal",
    ) as MotionRevealElement;

    expect(element.options).toEqual({});
    expect(
      (
        MotionRevealElement as typeof MotionRevealElement & {
          observedAttributes?: string[];
        }
      ).observedAttributes ?? [],
    ).toEqual(["threshold"]);
    expect(element.attributes).toHaveLength(0);
  });

  it("normalizes replacement options without reflecting them", () => {
    const element = document.createElement(
      "motion-reveal",
    ) as MotionRevealElement;

    element.options = {
      threshold: Number.POSITIVE_INFINITY,
      duration: Number.NaN,
      ease: "  power2.out  ",
      from: { y: 40 },
    };

    expect(element.options).toEqual({
      ease: "power2.out",
      from: { y: 40 },
    });
    expect(element.getAttribute("options")).toBeNull();

    element.options = { duration: 0.2 };
    expect(element.options).toEqual({ duration: 0.2 });
  });

  it("resolves options threshold before attribute and default", async () => {
    const element = document.createElement(
      "motion-reveal",
    ) as MotionRevealElement;
    element.setAttribute("threshold", "0.4");
    element.options = { threshold: 0.7 };
    document.body.append(element);
    await flushPreparation();

    expect(TestIntersectionObserver.instances[0]?.thresholds).toEqual([0.7]);
    expect(element.options.threshold).toBe(0.7);
    expect(element.getAttribute("threshold")).toBe("0.4");

    element.options = { duration: 0.2 };
    expect(TestIntersectionObserver.instances[1]?.thresholds).toEqual([0.4]);
    expect(element.options).toEqual({ duration: 0.2 });
  });

  it("falls back from invalid or removed attributes to the default", async () => {
    const element = document.createElement(
      "motion-reveal",
    ) as MotionRevealElement;
    element.setAttribute("threshold", "-0.1");
    document.body.append(element);
    await flushPreparation();

    expect(TestIntersectionObserver.instances[0]?.thresholds).toEqual([0.15]);

    element.setAttribute("threshold", "0.8");
    expect(TestIntersectionObserver.instances[1]?.thresholds).toEqual([0.8]);

    element.removeAttribute("threshold");
    expect(TestIntersectionObserver.instances[2]?.thresholds).toEqual([0.15]);
  });

  it("replaces pending visibility and suppresses the cleaned observer", async () => {
    const element = document.createElement(
      "motion-reveal",
    ) as MotionRevealElement;
    document.body.append(element);
    await flushPreparation();
    const firstObserver = TestIntersectionObserver.instances[0];
    expect(TestIntersectionObserver.instances).toHaveLength(1);

    element.setAttribute("threshold", "0.6");
    const secondObserver = TestIntersectionObserver.instances[1];
    expect(TestIntersectionObserver.instances).toHaveLength(2);
    expect(firstObserver?.disconnect).toHaveBeenCalledOnce();

    firstObserver?.reveal(1);
    expect(gsap.globalTimeline.getChildren()).toHaveLength(0);
    expect(secondObserver?.thresholds).toEqual([0.6]);
  });

  it("returns defensive top-level renderer option copies", () => {
    const element = document.createElement(
      "motion-reveal",
    ) as MotionRevealElement;
    element.options = { from: { y: 20 }, to: { y: 0 } };

    const returned = element.options;
    if (returned.from) {
      returned.from.y = 99;
    }

    expect(element.options.from?.y).toBe(20);
  });

  it("preserves options assigned before Custom Element upgrade", async () => {
    const name = "motion-reveal-pre-upgrade";
    const element = document.createElement(name) as HTMLElement & {
      options: MotionRevealElement["options"];
    };
    element.options = { duration: 0.35, from: { y: 12 } };
    document.body.append(element);

    class PreUpgradeRevealElement extends MotionRevealElement {}
    customElements.define(name, PreUpgradeRevealElement);
    await flushPreparation();

    expect(element).toBeInstanceOf(PreUpgradeRevealElement);
    expect(element.options).toEqual({
      duration: 0.35,
      from: { y: 12 },
    });
  });

  it("cleans pending visibility and reconnects with a fresh observer", async () => {
    const element = document.createElement(
      "motion-reveal",
    ) as MotionRevealElement;
    document.body.append(element);
    await flushPreparation();
    const firstObserver = TestIntersectionObserver.instances[0];

    element.disconnectedCallback();
    element.remove();
    expect(firstObserver?.disconnect).toHaveBeenCalledOnce();
    expect(gsap.globalTimeline.getChildren()).toHaveLength(0);

    document.body.append(element);
    element.connectedCallback();
    await flushPreparation();
    expect(TestIntersectionObserver.instances).toHaveLength(2);
    expect(TestIntersectionObserver.instances[1]?.thresholds).toEqual([0.15]);
    expect(TestIntersectionObserver.instances[1]?.observe).toHaveBeenCalledWith(
      element,
    );
  });
});
