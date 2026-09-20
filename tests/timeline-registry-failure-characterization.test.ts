// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTimelineRegistry } from "../src/devtools/timeline-registry";

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
});

describe("current timeline-registry failure behavior", () => {
  it("retains a disposed runtime reference after a replacement factory throws", () => {
    const registry = createTimelineRegistry();
    const dispose = vi.fn();
    let creations = 0;
    const registration = registry.register({
      id: "failure/create",
      root: document.createElement("div"),
      create: () => {
        creations += 1;
        if (creations === 2) throw new Error("create failed");
        const timeline = gsap.timeline({ paused: true });
        return { timeline, dispose: () => { dispose(); timeline.kill(); } };
      },
    });
    const original = registration.timeline;

    expect(() => registration.replay()).toThrow("create failed");
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(registration.timeline).toBe(original);
    expect(registry.getSnapshot().registrations).toContain(registration);

    expect(registration.replay()).not.toBe(original);
    expect(dispose).toHaveBeenCalledTimes(1);
    registration.destroy();
    registry.destroy();
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it("retains a disposed runtime reference after reset throws", () => {
    const registry = createTimelineRegistry();
    const dispose = vi.fn();
    let resets = 0;
    const registration = registry.register({
      id: "failure/reset",
      root: document.createElement("div"),
      reset: () => {
        resets += 1;
        if (resets === 1) throw new Error("reset failed");
      },
      create: () => {
        const timeline = gsap.timeline({ paused: true });
        return { timeline, dispose: () => { dispose(); timeline.kill(); } };
      },
    });
    const original = registration.timeline;

    expect(() => registration.replay()).toThrow("reset failed");
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(registration.timeline).toBe(original);
    expect(registration.replay()).not.toBe(original);
    registration.destroy();
    registry.destroy();
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it("can retry after disposal throws, but publishes no replacement on the failed attempt", () => {
    const registry = createTimelineRegistry();
    let creations = 0;
    let disposals = 0;
    const registration = registry.register({
      id: "failure/dispose",
      root: document.createElement("div"),
      create: () => {
        creations += 1;
        const timeline = gsap.timeline({ paused: true });
        return {
          timeline,
          dispose: () => {
            disposals += 1;
            timeline.kill();
            if (creations === 1) throw new Error("dispose failed");
          },
        };
      },
    });
    const original = registration.timeline;

    expect(() => registration.replay()).toThrow("dispose failed");
    expect(creations).toBe(1);
    expect(registration.timeline).toBe(original);
    expect(registration.replay()).not.toBe(original);
    expect(creations).toBe(2);
    expect(disposals).toBe(1);
    registration.destroy();
    registry.destroy();
    expect(disposals).toBe(2);
  });

  it("commits registration before a throwing subscriber aborts publication", () => {
    const registry = createTimelineRegistry();
    const later = vi.fn();
    const unsubscribeThrower = registry.subscribe((snapshot) => {
      if (snapshot.registrations.length) throw new Error("subscriber failed");
    });
    registry.subscribe(later);

    expect(() => registry.register({
      id: "failure/subscriber",
      root: document.createElement("div"),
      timeline: gsap.timeline({ paused: true }),
    })).toThrow("subscriber failed");
    expect(registry.getSnapshot().registrations).toHaveLength(1);
    expect(later).toHaveBeenCalledTimes(1);

    unsubscribeThrower();
    registry.getSnapshot().registrations[0]?.destroy();
    registry.destroy();
  });
});
