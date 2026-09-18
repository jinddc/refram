// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createTimelineRegistry,
  defaultTimelineRegistry,
  registerTimeline,
  type MotionTimelineRegistrySnapshot,
} from "../src/devtools/timeline-registry";

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
});

function directDeclaration(id: string) {
  const root = document.createElement("div");
  const target = document.createElement("div");
  root.append(target);
  const timeline = gsap.timeline({ paused: true }).to(target, {
    opacity: 1,
    duration: 0.5,
  });
  return { id, root, timeline };
}

describe("timeline registry", () => {
  it("registers distributed declarations through the default registry helper", () => {
    const before = defaultTimelineRegistry.getSnapshot().registrations.length;
    const registration = registerTimeline(
      directDeclaration("test/default-registry-helper"),
    );

    expect(defaultTimelineRegistry.getSnapshot().registrations).toContain(registration);
    expect(defaultTimelineRegistry.getSnapshot().registrations).toHaveLength(before + 1);

    registration.destroy();
    expect(defaultTimelineRegistry.getSnapshot().registrations).toHaveLength(before);
  });

  it("publishes immutable ordered snapshots for distributed registrations", () => {
    const registry = createTimelineRegistry();
    const snapshots: MotionTimelineRegistrySnapshot[] = [];
    const unsubscribe = registry.subscribe((value) => snapshots.push(value));

    const hero = registerTimeline(directDeclaration("home/hero"), registry);
    const gallery = registerTimeline(directDeclaration("home/gallery"), registry);

    expect(snapshots).toHaveLength(3);
    expect(snapshots[0]?.registrations).toEqual([]);
    expect(registry.getSnapshot().registrations).toEqual([hero, gallery]);
    expect(Object.isFrozen(registry.getSnapshot())).toBe(true);
    expect(Object.isFrozen(registry.getSnapshot().registrations)).toBe(true);
    expect(() => registry.register(directDeclaration("home/hero"))).toThrow(
      'Timeline "home/hero" is already registered.',
    );
    expect(registry.getSnapshot().registrations).toEqual([hero, gallery]);

    unsubscribe();
    registry.destroy();
  });

  it("removes and disposes an owned rebuildable registration exactly once", () => {
    const registry = createTimelineRegistry();
    const dispose = vi.fn();
    const root = document.createElement("div");
    const registration = registry.register({
      id: "home/intro",
      root,
      create: () => ({
        timeline: gsap.timeline({ paused: true }),
        dispose,
      }),
    });

    registration.destroy();
    registration.destroy();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(registry.getSnapshot().registrations).toEqual([]);
    expect(() => registration.replay()).toThrow(/destroyed/i);
    registry.destroy();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps registration identity and order while replay replaces its timeline", () => {
    const registry = createTimelineRegistry();
    const snapshots: MotionTimelineRegistrySnapshot[] = [];
    let generation = 0;
    const registration = registry.register({
      id: "home/replayable",
      root: document.createElement("div"),
      create: () => {
        generation += 1;
        const timeline = gsap.timeline({ paused: true });
        return { timeline, dispose: () => timeline.kill() };
      },
    });
    const other = registry.register(directDeclaration("home/other"));
    registry.subscribe((value) => snapshots.push(value));
    const beforeSnapshot = registry.getSnapshot();
    const beforeTimeline = registration.timeline;

    registration.replay();

    expect(generation).toBe(2);
    expect(registration.timeline).not.toBe(beforeTimeline);
    expect(registry.getSnapshot()).toBe(beforeSnapshot);
    expect(registry.getSnapshot().registrations).toEqual([registration, other]);
    expect(snapshots).toHaveLength(1);
    registry.destroy();
  });

  it("isolates registries and releases every owned registration on destroy", () => {
    const left = createTimelineRegistry();
    const right = createTimelineRegistry();
    const leftDispose = vi.fn();
    const rightDispose = vi.fn();
    const finalSnapshots: MotionTimelineRegistrySnapshot[] = [];

    left.register({
      id: "shared/id",
      root: document.createElement("div"),
      create: () => ({ timeline: gsap.timeline({ paused: true }), dispose: leftDispose }),
    });
    right.register({
      id: "shared/id",
      root: document.createElement("div"),
      create: () => ({ timeline: gsap.timeline({ paused: true }), dispose: rightDispose }),
    });
    left.subscribe((value) => finalSnapshots.push(value));

    left.destroy();
    left.destroy();

    expect(leftDispose).toHaveBeenCalledTimes(1);
    expect(rightDispose).not.toHaveBeenCalled();
    expect(finalSnapshots.at(-1)?.registrations).toEqual([]);
    expect(right.getSnapshot().registrations).toHaveLength(1);
    expect(() => left.register(directDeclaration("after/destroy"))).toThrow(/destroyed/i);
    expect(() => left.subscribe(() => undefined)).toThrow(/destroyed/i);

    right.destroy();
    expect(rightDispose).toHaveBeenCalledTimes(1);
  });
});
