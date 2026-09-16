// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { whenVisible } from "../src/core/when-visible";

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

  public emit(
    isIntersecting: boolean,
    intersectionRatio = isIntersecting ? 1 : 0,
  ): void {
    this.callback(
      [
        {
          isIntersecting,
          intersectionRatio,
        } as IntersectionObserverEntry,
      ],
      this,
    );
  }
}

beforeEach(() => {
  TestIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("whenVisible", () => {
  it("observes with the default threshold and ignores non-intersection", () => {
    const element = document.createElement("div");
    const callback = vi.fn();

    whenVisible(element, callback);
    const observer = TestIntersectionObserver.instances[0];
    observer?.emit(false);

    expect(observer?.thresholds).toEqual([0.15]);
    expect(observer?.observe).toHaveBeenCalledWith(element);
    expect(callback).not.toHaveBeenCalled();
  });

  it("disconnects before invoking once on first intersection", () => {
    const order: string[] = [];
    const element = document.createElement("div");
    const cleanup = whenVisible(element, () => order.push("callback"));
    const observer = TestIntersectionObserver.instances[0];
    observer?.disconnect.mockImplementation(() => order.push("disconnect"));

    observer?.emit(true);
    observer?.emit(true);
    cleanup();

    expect(order).toEqual(["disconnect", "callback"]);
    expect(observer?.disconnect).toHaveBeenCalledOnce();
  });

  it("waits for the configured ratio and accepts the exact boundary", () => {
    const callback = vi.fn();
    whenVisible(document.createElement("div"), callback, 0.6);
    const observer = TestIntersectionObserver.instances[0];

    observer?.emit(true, 0.59);
    expect(callback).not.toHaveBeenCalled();
    expect(observer?.disconnect).not.toHaveBeenCalled();

    observer?.emit(true, 0.6);
    expect(callback).toHaveBeenCalledOnce();
    expect(observer?.thresholds).toEqual([0.6]);
  });

  it("allows an intersecting zero-ratio entry at threshold zero", () => {
    const callback = vi.fn();
    whenVisible(document.createElement("div"), callback, 0);

    TestIntersectionObserver.instances[0]?.emit(true, 0);

    expect(callback).toHaveBeenCalledOnce();
  });

  it("cleanup prevents a queued observation and is idempotent", () => {
    const element = document.createElement("div");
    const callback = vi.fn();
    const cleanup = whenVisible(element, callback);
    const observer = TestIntersectionObserver.instances[0];

    cleanup();
    cleanup();
    observer?.emit(true);

    expect(observer?.disconnect).toHaveBeenCalledOnce();
    expect(callback).not.toHaveBeenCalled();
  });

  it("runs immediately without IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const callback = vi.fn();

    const cleanup = whenVisible(document.createElement("div"), callback);

    expect(callback).toHaveBeenCalledOnce();
    expect(cleanup).not.toThrow();
  });
});
