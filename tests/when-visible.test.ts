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

  public emit(isIntersecting: boolean): void {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
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
