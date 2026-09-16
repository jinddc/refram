// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimelineController } from "../src/timeline/timeline-controller";
import { createTimelineDefinition } from "../src/timeline/timeline-options";

function mockMotionPreference(matches: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches }) as MediaQueryList),
  );
}

function setup(options = {}) {
  const root = document.createElement("div");
  const target = document.createElement("div");
  root.append(target);
  document.body.append(root);
  const hooks = {
    onStart: vi.fn(),
    onComplete: vi.fn(),
    onInterrupt: vi.fn(),
  };
  const controller = new TimelineController(root, options, hooks);
  controller.connect();
  return { controller, hooks, root, target };
}

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("TimelineController", () => {
  it("compiles a paused destination tween without mutating idle presentation", () => {
    mockMotionPreference(false);
    const { controller, target } = setup({ defaults: { duration: 0.25 } });
    target.style.opacity = "1";
    controller.syncDefinition(createTimelineDefinition(
      { defaults: { duration: 0.25 } },
      [{
        source: target,
        target,
        options: { from: { opacity: 0 }, to: { opacity: 1 } },
      }],
    ));

    expect(target.style.opacity).toBe("1");
    expect(controller.totalDuration()).toBeCloseTo(0.25);
  });

  it("applies sanitized from state synchronously when forward playback starts", () => {
    mockMotionPreference(false);
    const fromCallback = vi.fn();
    const { controller, target } = setup();
    controller.syncDefinition(createTimelineDefinition({}, [{
      source: target,
      target,
      options: {
        from: { opacity: 0, onComplete: fromCallback },
        to: { opacity: 1, duration: 1 },
      },
    }]));

    expect(controller.play()).toBe(true);
    expect(target.style.opacity).toBe("0");
    expect(fromCallback).not.toHaveBeenCalled();
  });

  it("ignores descriptors without to and honors top-level child overrides", () => {
    mockMotionPreference(false);
    const { controller, target } = setup();
    const inert = document.createElement("div");
    controller.syncDefinition(createTimelineDefinition({}, [
      { source: inert, target: inert, options: { from: { x: 20 } } },
      {
        source: target,
        target,
        options: {
          to: { x: 10, duration: 2, ease: "bounce.out" },
          duration: 0.4,
          ease: "linear",
        },
      },
    ]));

    const tween = gsap.globalTimeline.getChildren(true, true, false)[0];
    expect(controller.hasContent()).toBe(true);
    expect(tween?.duration()).toBeCloseTo(0.4);
    expect(tween?.vars.ease).toBe("linear");
    expect(inert.style.transform).toBe("");
  });

  it("applies final presentation and callback ordering for reduced motion", () => {
    mockMotionPreference(true);
    const order: string[] = [];
    const options = {
      onStart: () => order.push("renderer-start"),
      onComplete: () => order.push("renderer-complete"),
    };
    const { controller, hooks, target } = setup(options);
    hooks.onStart.mockImplementation(() => order.push("semantic-start"));
    hooks.onComplete.mockImplementation(() => order.push("semantic-complete"));
    controller.syncDefinition(createTimelineDefinition(options, [{
      source: target,
      target,
      options: { to: { opacity: 0.4, duration: 3 } },
    }]));

    controller.play();

    expect(target.style.opacity).toBe("0.4");
    expect(order).toEqual([
      "renderer-start",
      "semantic-start",
      "renderer-complete",
      "semantic-complete",
    ]);
    expect(controller.totalDuration()).toBe(0);
  });

  it("reverts owned presentation on cancel and destroys idempotently", () => {
    mockMotionPreference(false);
    const { controller, target } = setup();
    target.style.opacity = "1";
    controller.syncDefinition(createTimelineDefinition({}, [{
      source: target,
      target,
      options: { from: { opacity: 0 }, to: { opacity: 1 } },
    }]));
    controller.play();

    expect(target.style.opacity).toBe("0");
    expect(controller.cancel()).toBe(true);
    expect(target.style.opacity).toBe("1");
    controller.destroy();
    controller.destroy();
  });
});
