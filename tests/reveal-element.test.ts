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

beforeEach(() => {
  TestIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false }) as MediaQueryList),
  );
  registerMotionReveal();
});

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("MotionRevealElement", () => {
  it("registers explicitly and idempotently", () => {
    registerMotionReveal();

    expect(customElements.get("motion-reveal")).toBe(
      MotionRevealElement,
    );
  });

  it("has empty defaults and no attribute surface", () => {
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
    ).toEqual([]);
    expect(element.attributes).toHaveLength(0);
  });

  it("normalizes replacement options without reflecting them", () => {
    const element = document.createElement(
      "motion-reveal",
    ) as MotionRevealElement;

    element.options = {
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

  it("preserves options assigned before Custom Element upgrade", () => {
    const name = "motion-reveal-pre-upgrade";
    const element = document.createElement(name) as HTMLElement & {
      options: MotionRevealElement["options"];
    };
    element.options = { duration: 0.35, from: { y: 12 } };
    document.body.append(element);

    class PreUpgradeRevealElement extends MotionRevealElement {}
    customElements.define(name, PreUpgradeRevealElement);

    expect(element).toBeInstanceOf(PreUpgradeRevealElement);
    expect(element.options).toEqual({
      duration: 0.35,
      from: { y: 12 },
    });
  });

  it("cleans pending visibility and reconnects with a fresh observer", () => {
    const element = document.createElement(
      "motion-reveal",
    ) as MotionRevealElement;
    document.body.append(element);
    const firstObserver = TestIntersectionObserver.instances[0];

    element.disconnectedCallback();
    element.remove();
    expect(firstObserver?.disconnect).toHaveBeenCalledOnce();
    expect(gsap.globalTimeline.getChildren()).toHaveLength(0);

    document.body.append(element);
    element.connectedCallback();
    expect(TestIntersectionObserver.instances).toHaveLength(2);
    expect(TestIntersectionObserver.instances[1]?.observe).toHaveBeenCalledWith(
      element,
    );
  });
});
