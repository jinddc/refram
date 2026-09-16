// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import {
  copyTimelineOptions,
  createTimelineDefinition,
} from "../src/timeline/timeline-options";
import type { MotionTimelineOptions } from "../src/timeline/timeline.types";

describe("timeline options and definition", () => {
  it("copies defaults, preserves advanced references, and strips runtime state", () => {
    const callback = vi.fn();
    const trigger = document.createElement("section");
    const defaults = { duration: 0.4 };
    const scrollTrigger = {
      trigger,
      start: callback,
    };
    const input = {
      defaults,
      scrollTrigger,
      onComplete: callback,
      paused: false,
      reversed: true,
    } as MotionTimelineOptions;

    const copy = copyTimelineOptions(input);

    expect(copy).toEqual({
      defaults,
      scrollTrigger,
      onComplete: callback,
    });
    expect(copy.defaults).not.toBe(defaults);
    expect(copy.scrollTrigger).not.toBe(scrollTrigger);
    expect(copy.scrollTrigger?.trigger).toBe(trigger);
    expect(copy.scrollTrigger?.start).toBe(callback);
    expect(copy.onComplete).toBe(callback);
  });

  it("creates frozen snapshots while retaining DOM identity", () => {
    const source = document.createElement("motion-tween");
    const nested = { amount: 2 };
    const definition = createTimelineDefinition(
      { defaults: { duration: 0.2 } },
      [{
        source,
        target: source,
        options: { to: { x: 0, custom: nested }, position: "<" },
        authoredPosition: "<",
      }],
    );

    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.options.defaults)).toBe(true);
    expect(Object.isFrozen(definition.items)).toBe(true);
    expect(Object.isFrozen(definition.items[0])).toBe(true);
    expect(Object.isFrozen(definition.items[0]?.options)).toBe(true);
    expect(definition.items[0]?.source).toBe(source);
    expect(definition.items[0]?.options.to?.custom).toBe(nested);
  });

  it("freezes the copied ScrollTrigger container but preserves its runtime references", () => {
    const trigger = document.createElement("section");
    const onUpdate = vi.fn();
    const authored = { trigger, onUpdate };
    const definition = createTimelineDefinition(
      { scrollTrigger: authored },
      [],
    );

    expect(definition.options.scrollTrigger).not.toBe(authored);
    expect(Object.isFrozen(definition.options.scrollTrigger)).toBe(true);
    expect(definition.options.scrollTrigger?.trigger).toBe(trigger);
    expect(definition.options.scrollTrigger?.onUpdate).toBe(onUpdate);
  });
});
