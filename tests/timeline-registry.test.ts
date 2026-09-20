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

  it("restarts a directly registered timeline at zero", () => {
    const registry = createTimelineRegistry();
    const registration = registry.register(directDeclaration("home/direct-restart"));
    const timeline = registration.timeline;
    timeline.totalProgress(0.75, true);

    expect(registration.replay()).toBe(timeline);
    expect(timeline.totalProgress()).toBe(0);
    expect(timeline.paused()).toBe(true);

    registry.destroy();
  });

  it("normalizes single and multiple track values without changing the authored timeline", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("div");
    const canvas = document.createElement("canvas");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    root.append(canvas, path);
    const points = [{ x: 0 }, { x: 0 }];
    const timeline = gsap.timeline({ paused: true });
    timeline.to(points[0]!, { x: 10, duration: 1 });
    timeline.to(points[1]!, { x: 20, duration: 1 });
    const [first, second] = timeline.getChildren(false, true, false) as gsap.core.Tween[];
    const registration = registry.register({
      id: "home/mapped",
      root,
      timeline,
      tracks: [
        { id: "first", animation: first!, visualTarget: canvas },
        { id: "path", label: "SVG path", animations: [second!], visualTargets: [path] },
      ],
    });

    expect(registration.tracks.map(({ id, label }) => [id, label])).toEqual([
      ["first", "first"],
      ["path", "SVG path"],
    ]);
    expect(registration.tracks[0]?.animations).toEqual([first]);
    expect(registration.tracks[0]?.visualTargets).toEqual([canvas]);
    expect(Object.isFrozen(registration.tracks)).toBe(true);
    expect(registration.timeline).toBe(timeline);
    registry.destroy();
  });

  it("replaces track references with each rebuilt runtime", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("div");
    const canvas = document.createElement("canvas");
    root.append(canvas);
    const seen: number[] = [];
    let generation = 0;
    const registration = registry.register({
      id: "home/rebuilt-tracks",
      root,
      create: () => {
        generation += 1;
        const particles = [{ x: 0 }];
        const timeline = gsap.timeline({ paused: true }).to(particles, { x: 20 });
        return {
          timeline,
          tracks: [{
            id: "particles",
            animation: timeline.getChildren(false, true, false)[0] as gsap.core.Tween,
            visualTarget: canvas,
          }],
          dispose: () => timeline.kill(),
        };
      },
    });
    const firstAnimation = registration.tracks[0]?.animations[0];
    registration.subscribe((event) => {
      if (event.type === "timeline") seen.push(event.tracks.length);
    });

    registration.replay();

    expect(generation).toBe(2);
    expect(registration.tracks[0]?.animations[0]).not.toBe(firstAnimation);
    expect(seen).toEqual([1]);
    registry.destroy();
  });

  it("rejects duplicate track IDs and disposes an invalid factory runtime", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("div");
    const target = document.createElement("div");
    root.append(target);
    const dispose = vi.fn();
    expect(() => registry.register({
      id: "invalid/tracks",
      root,
      create: () => {
        const timeline = gsap.timeline({ paused: true }).to(target, { x: 10 });
        const animation = timeline.getChildren(false, true, false)[0] as gsap.core.Tween;
        return {
          timeline,
          tracks: [
            { id: "same", animation, visualTarget: target },
            { id: "same", animation, visualTarget: target },
          ],
          dispose: () => {
            dispose();
            timeline.kill();
          },
        };
      },
    })).toThrow(/unique/);
    expect(dispose).toHaveBeenCalledOnce();
    expect(registry.getSnapshot().registrations).toHaveLength(0);
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
