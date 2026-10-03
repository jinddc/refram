// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachGsapTimelineSession,
  readTimelineScrollTrigger,
} from "../../src/devtools/timeline/session";

interface FakeTriggerOptions {
  readonly start?: number;
  readonly end?: number;
  readonly progress?: number;
  readonly scrub?: boolean | number;
  readonly id?: string;
  readonly rawStart?: string | number | (() => string | number);
  readonly rawEnd?: string | number | (() => string | number);
  readonly markers?: boolean | Readonly<Record<string, unknown>>;
  readonly trigger?: Element;
  readonly scroller?: Element | Window;
  readonly pin?: Element;
}

function attachFakeScrollTrigger(
  timeline: gsap.core.Timeline,
  options: FakeTriggerOptions = {},
) {
  let scrollPosition = options.start ?? 100;
  const instance = {
    start: options.start ?? 100,
    end: options.end ?? 500,
    progress: options.progress ?? 0,
    direction: 1,
    trigger: options.trigger,
    scroller: options.scroller ?? window,
    pin: options.pin,
    vars: {
      id: options.id,
      scrub: options.scrub,
      start: options.rawStart,
      end: options.rawEnd,
      markers: options.markers,
    },
    scroll(position?: number) {
      if (position === undefined) return scrollPosition;
      scrollPosition = position;
    },
    update() {
      const range = this.end - this.start;
      this.progress = range === 0
        ? 0
        : Math.min(1, Math.max(0, (scrollPosition - this.start) / range));
    },
  };
  Object.defineProperty(timeline, "scrollTrigger", {
    configurable: true,
    value: instance,
  });
  return instance;
}

function fixture() {
  const target = document.createElement("div");
  const timeline = gsap.timeline({ paused: true }).to(target, { x: 40, duration: 1 });
  return { target, timeline };
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 7));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("ScrollTrigger timeline inspection", () => {
  it("seeks scrubbed window and element scrollers through calculated ranges", () => {
    const windowFixture = fixture();
    const windowTrigger = attachFakeScrollTrigger(windowFixture.timeline, {
      start: 100,
      end: 500,
      scrub: true,
    });
    const windowSession = attachGsapTimelineSession(windowFixture.timeline, () => undefined);
    expect(windowSession.read().driver).toBe("scroll");
    expect(windowSession.seek(0.25)).toBe(true);
    expect(windowTrigger.scroll()).toBe(200);
    expect(windowSession.read().scrollTrigger).toMatchObject({
      progress: 0.25,
      scroller: "Window",
      state: "active",
    });

    const customScroller = document.createElement("main");
    customScroller.id = "scroll-shell";
    const customFixture = fixture();
    const customTrigger = attachFakeScrollTrigger(customFixture.timeline, {
      start: 40,
      end: 240,
      scrub: true,
      scroller: customScroller,
    });
    const customSession = attachGsapTimelineSession(customFixture.timeline, () => undefined);
    expect(customSession.seek(0.75)).toBe(true);
    expect(customTrigger.scroll()).toBe(190);
    expect(customSession.read().scrollTrigger?.scroller).toBe("main#scroll-shell");

    windowSession.detach();
    customSession.detach();
  });

  it("supports reversed ranges and clamps before/after progress", () => {
    const { timeline } = fixture();
    const trigger = attachFakeScrollTrigger(timeline, {
      start: 500,
      end: 100,
      scrub: true,
    });
    const session = attachGsapTimelineSession(timeline, () => undefined);
    expect(session.seek(0.25)).toBe(true);
    expect(trigger.scroll()).toBe(400);
    expect(session.read().scrollTrigger?.progress).toBeCloseTo(0.25);

    trigger.scroll(600);
    trigger.progress = -0.2;
    expect(readTimelineScrollTrigger(timeline)).toMatchObject({
      progress: 0,
      state: "before",
    });
    trigger.scroll(50);
    trigger.progress = 1.2;
    expect(readTimelineScrollTrigger(timeline)).toMatchObject({
      progress: 1,
      state: "after",
    });
    session.detach();
  });

  it("keeps numeric scrub scroll progress distinct from lagging animation progress", () => {
    const triggerElement = document.createElement("section");
    triggerElement.id = "hero";
    triggerElement.className = "panel active";
    const pin = document.createElement("div");
    pin.className = "pin";
    const { timeline } = fixture();
    const trigger = attachFakeScrollTrigger(timeline, {
      progress: 0.7,
      scrub: 0.8,
      id: "hero-scroll",
      rawStart: "top 80%",
      rawEnd: () => "+=400",
      markers: {
        startColor: "#fff",
        fontSize: "12px",
        indent: 8,
        ignored: "value",
      },
      trigger: triggerElement,
      pin,
    });
    trigger.scroll(380);
    timeline.totalProgress(0.2, true);
    expect(readTimelineScrollTrigger(timeline)).toEqual({
      id: "hero-scroll",
      scrub: 0.8,
      scrubbed: true,
      rawStart: "top 80%",
      rawEnd: "Function",
      start: 100,
      end: 500,
      distance: 400,
      scroll: 380,
      progress: 0.7,
      animationProgress: 0.2,
      state: "active",
      direction: 1,
      pin: "div.pin",
      trigger: "section#hero.panel.active",
      scroller: "Window",
      markers: {
        startColor: "#fff",
        fontSize: "12px",
        indent: 8,
      },
    });
  });

  it("keeps markers off by default without creating or mutating marker DOM", () => {
    const { timeline } = fixture();
    const markerCount = document.querySelectorAll("[class*='gsap-marker-']").length;
    attachFakeScrollTrigger(timeline, {
      rawStart: 20,
      rawEnd: 420,
      scrub: true,
    });

    expect(readTimelineScrollTrigger(timeline)).toMatchObject({
      rawStart: 20,
      rawEnd: 420,
      distance: 400,
      markers: false,
    });
    expect(document.querySelectorAll("[class*='gsap-marker-']")).toHaveLength(markerCount);
  });

  it("retains time transport for non-scrub trigger actions and cleans up sampling", () => {
    const { timeline } = fixture();
    const trigger = attachFakeScrollTrigger(timeline, { scrub: false });
    const session = attachGsapTimelineSession(timeline, () => undefined);
    expect(session.read().driver).toBe("manual");
    expect(session.seek(0.5)).toBe(true);
    expect(timeline.totalProgress()).toBeCloseTo(0.5);
    expect(trigger.scroll()).toBe(100);
    session.detach();
    session.detach();
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(() => session.read()).toThrowError("GSAP timeline session is detached.");
  });
});
