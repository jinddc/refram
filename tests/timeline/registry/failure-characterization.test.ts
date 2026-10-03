// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTimelineRegistry } from "../../../src/devtools/timeline/registry";

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
});

describe("timeline registry failure paths", () => {
  it("allows a factory retry without exposing or disposing the old runtime twice", () => {
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
    expect(registration.replayState).toBe("retryable");
    expect(() => registration.timeline).toThrow(/no live runtime/i);
    expect(registry.getSnapshot().registrations[0]).toBe(registration);

    expect(registration.replay()).not.toBe(original);
    expect(registration.replayState).toBe("ready");
    expect(dispose).toHaveBeenCalledTimes(1);
    registration.destroy();
    registry.destroy();
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it("blocks retry after reset throws", () => {
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
    expect(() => registration.replay()).toThrow("reset failed");
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(registration.replayState).toBe("blocked");
    expect(() => registration.timeline).toThrow(/no live runtime/i);
    expect(() => registration.replay()).toThrow(/blocked/i);
    expect(resets).toBe(1);
    registration.destroy();
    registry.destroy();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("blocks retry after disposal throws", () => {
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
    expect(() => registration.replay()).toThrow("dispose failed");
    expect(creations).toBe(1);
    expect(registration.replayState).toBe("blocked");
    expect(() => registration.timeline).toThrow(/no live runtime/i);
    expect(() => registration.replay()).toThrow(/blocked/i);
    expect(creations).toBe(1);
    expect(disposals).toBe(1);
    registration.destroy();
    registry.destroy();
    expect(disposals).toBe(1);
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
