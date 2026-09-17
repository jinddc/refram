// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimelineController } from "../src/timeline/timeline-controller";
import { createTimelineDefinition } from "../src/timeline/timeline-options";
import {
  FakeScrollTrigger,
  installFakeScrollTrigger,
  removeFakeScrollTrigger,
} from "./scroll-trigger-fake";

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
    onScrollReady: vi.fn(),
    onInspectionChange: vi.fn(),
  };
  const controller = new TimelineController(root, options, hooks);
  controller.connect();
  return { controller, hooks, root, target };
}

afterEach(() => {
  removeFakeScrollTrigger(gsap);
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
    expect(controller.readInspection()).toMatchObject({
      driver: "manual",
      readiness: "ready",
      progress: 0,
      totalDuration: 0.25,
    });
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
    expect(controller.readInspection()).toMatchObject({
      readiness: "ready",
      progress: 0,
    });
    controller.destroy();
    controller.destroy();
  });

  it("stays readable and idle when root ScrollTrigger is not registered", () => {
    mockMotionPreference(false);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { controller, hooks, target } = setup({
      scrollTrigger: { trigger: document.body, scrub: true },
    });
    target.style.opacity = "1";
    controller.syncDefinition(createTimelineDefinition(
      { scrollTrigger: { trigger: document.body, scrub: true } },
      [{
        source: target,
        target,
        options: { from: { opacity: 0 }, to: { opacity: 1 } },
      }],
    ));

    expect(FakeScrollTrigger.instances).toHaveLength(0);
    expect(target.style.opacity).toBe("1");
    expect(controller.totalDuration()).toBe(0);
    expect(hooks.onScrollReady).toHaveBeenLastCalledWith(0, false);
    expect(controller.readInspection()).toMatchObject({
      driver: "scroll",
      readiness: "missing-plugin",
      progress: 0,
      totalDuration: 0,
    });
    expect(warning).toHaveBeenCalledTimes(1);

    controller.syncDefinition(createTimelineDefinition(
      { scrollTrigger: { trigger: document.body, scrub: true } },
      [{
        source: target,
        target,
        options: { from: { opacity: 0 }, to: { opacity: 1 } },
      }],
    ), true);
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("builds one root trigger and reports endpoint traversals after user updates", () => {
    mockMotionPreference(false);
    installFakeScrollTrigger(gsap);
    const order: string[] = [];
    const options = {
      scrollTrigger: {
        trigger: document.body,
        scrub: true,
        onUpdate: () => order.push("renderer-update"),
      },
    };
    const { controller, hooks, target } = setup(options);
    hooks.onStart.mockImplementation(() => order.push("semantic-start"));
    hooks.onComplete.mockImplementation(() => order.push("semantic-finish"));
    target.style.opacity = "1";
    controller.syncDefinition(createTimelineDefinition(options, [{
      source: target,
      target,
      options: {
        from: { opacity: 0 },
        to: { opacity: 1, duration: 1 },
      },
    }]));

    expect(FakeScrollTrigger.instances).toHaveLength(1);
    expect(target.style.opacity).toBe("0");
    const trigger = FakeScrollTrigger.instances[0]!;
    expect(trigger.refresh).toHaveBeenCalledTimes(1);

    trigger.setProgress(0.25);
    trigger.setProgress(0.6);
    trigger.setProgress(0.4);
    trigger.setProgress(0);

    expect(order).toEqual([
      "renderer-update",
      "semantic-start",
      "renderer-update",
      "renderer-update",
      "renderer-update",
      "semantic-finish",
    ]);
    expect(hooks.onStart).toHaveBeenCalledTimes(1);
    expect(hooks.onComplete).toHaveBeenCalledTimes(1);

    controller.destroy();
    expect(trigger.kill).toHaveBeenCalledWith(true);
  });

  it("strips child ScrollTrigger configuration and warns once", () => {
    mockMotionPreference(false);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { controller, target } = setup();
    const definition = createTimelineDefinition({}, [{
      source: target,
      target,
      options: {
        to: {
          x: 20,
          duration: 1,
          scrollTrigger: { trigger: target },
        },
      },
    }]);

    controller.syncDefinition(definition);
    controller.syncDefinition(definition, true);

    const tween = gsap.globalTimeline.getChildren(true, true, false)[0];
    expect(tween?.vars.scrollTrigger).toBeUndefined();
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("applies final presentation without a trigger for reduced motion", () => {
    mockMotionPreference(true);
    installFakeScrollTrigger(gsap);
    const { controller, hooks, target } = setup({
      scrollTrigger: { trigger: document.body, pin: true },
    });
    controller.syncDefinition(createTimelineDefinition(
      { scrollTrigger: { trigger: document.body, pin: true } },
      [{
        source: target,
        target,
        options: { from: { opacity: 0 }, to: { opacity: 0.35 } },
      }],
    ));

    expect(FakeScrollTrigger.instances).toHaveLength(0);
    expect(target.style.opacity).toBe("0.35");
    expect(hooks.onScrollReady).toHaveBeenLastCalledWith(1, true);
    expect(hooks.onStart).not.toHaveBeenCalled();
    expect(hooks.onComplete).not.toHaveBeenCalled();
    expect(controller.readInspection()).toMatchObject({
      driver: "scroll",
      readiness: "reduced-motion",
      progress: 1,
      totalDuration: 0,
    });
  });

  it("retains authored descriptors and resolved child timing without exposing animations", () => {
    mockMotionPreference(false);
    const { controller, target, hooks } = setup({
      defaults: { duration: 0.5 },
    });
    const inert = document.createElement("div");
    const overlapping = document.createElement("div");
    const advanced = { value: 1 };
    const definition = createTimelineDefinition(
      { defaults: { duration: 0.5 } },
      [
        {
          source: target,
          target,
          options: { to: { x: 10, callbackScope: advanced } },
        },
        {
          source: inert,
          target: inert,
          options: { from: { opacity: 0 } },
        },
        {
          source: overlapping,
          target: overlapping,
          authoredPosition: "<",
          options: { to: { x: 20 }, position: "<", duration: 0.25 },
        },
      ],
    );

    controller.syncDefinition(definition);

    const inspection = controller.readInspection();
    expect(inspection.items).toHaveLength(3);
    expect(inspection.items[0]?.definition.options.to?.callbackScope).toBe(
      advanced,
    );
    expect(inspection.items[0]).toMatchObject({
      resolvedStart: 0,
      resolvedDuration: 0.5,
      resolvedEnd: 0.5,
    });
    expect(inspection.items[1]).toMatchObject({
      resolvedStart: null,
      resolvedDuration: null,
      resolvedEnd: null,
    });
    expect(inspection.items[2]).toMatchObject({
      resolvedStart: 0,
      resolvedDuration: 0.25,
      resolvedEnd: 0.25,
    });
    expect(inspection.items[0]).not.toHaveProperty("animation");
    expect(hooks.onInspectionChange).toHaveBeenLastCalledWith(true);
  });

  it("reports cancelled scroll resources until refresh", () => {
    mockMotionPreference(false);
    installFakeScrollTrigger(gsap);
    const options = {
      scrollTrigger: { trigger: document.body, scrub: true },
    };
    const { controller, target } = setup(options);
    controller.syncDefinition(createTimelineDefinition(options, [{
      source: target,
      target,
      options: { to: { x: 10 }, duration: 1 },
    }]));

    controller.cancel();
    expect(controller.readInspection()).toMatchObject({
      readiness: "cancelled",
      progress: 0,
      totalDuration: 0,
    });
    expect(controller.readInspection().items[0]).toMatchObject({
      resolvedStart: null,
      resolvedDuration: null,
      resolvedEnd: null,
    });

    controller.syncDefinition(createTimelineDefinition(options, [{
      source: target,
      target,
      options: { to: { x: 10 }, duration: 1 },
    }]), true);
    expect(controller.readInspection().readiness).toBe("ready");
  });
});
