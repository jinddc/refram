// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScrollTriggerMarkerPresentation } from "../../src/devtools/scrolltrigger/marker-presentation";
import { createTimelineRegistry } from "../../src/devtools/timeline/registry";
import { directTimeline, ownedMarkers } from "../helpers/editor-test-fixtures";

beforeEach(() => {
  vi.stubGlobal("innerWidth", 1200);
  vi.stubGlobal("innerHeight", 800);
});

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
  document.head.replaceChildren();
  vi.unstubAllGlobals();
});

function markerFreeTimeline(id: string) {
  const fixture = directTimeline(id);
  const vars = { id, scrub: false, markers: false };
  const trigger = {
    start: 100,
    end: 500,
    trigger: fixture.target,
    scroller: window,
    vars,
    scroll: () => 100,
  };
  Object.defineProperty(fixture.timeline, "scrollTrigger", { value: trigger });
  return { fixture, trigger, vars };
}

describe("DevTools-owned ScrollTrigger marker lifecycle", () => {
  it("creates fallback markers only for the selected visible timeline", () => {
    const registry = createTimelineRegistry();
    const first = markerFreeTimeline("first");
    const second = markerFreeTimeline("second");
    const firstRegistration = registry.register(first.fixture);
    const secondRegistration = registry.register(second.fixture);
    const presentation = createScrollTriggerMarkerPresentation();
    presentation.activate(firstRegistration.id, firstRegistration.timeline);
    presentation.activate(secondRegistration.id, secondRegistration.timeline);

    presentation.sync(registry.getSnapshot().registrations, firstRegistration.id);
    expect(ownedMarkers()).toHaveLength(4);
    expect(first.vars.markers).toBe(false);
    expect(second.vars.markers).toBe(false);
    presentation.sync(registry.getSnapshot().registrations, secondRegistration.id);
    expect(ownedMarkers()).toHaveLength(4);
    expect(ownedMarkers().every((marker) => marker.getAttribute("aria-hidden") === "true"))
      .toBe(true);
    presentation.sync(registry.getSnapshot().registrations, undefined);
    expect(ownedMarkers()).toHaveLength(0);

    presentation.destroy();
    firstRegistration.destroy();
    secondRegistration.destroy();
    registry.destroy();
  });

  it("removes fallback markers on hide, registration removal, and destroy", () => {
    const registry = createTimelineRegistry();
    const current = markerFreeTimeline("current");
    const registration = registry.register(current.fixture);
    const presentation = createScrollTriggerMarkerPresentation();
    presentation.activate(registration.id, registration.timeline);
    presentation.sync([registration], registration.id);
    expect(ownedMarkers()).toHaveLength(4);

    expect(presentation.setVisible(registration.id, registration.timeline, false)).toBe(true);
    presentation.sync([registration], registration.id);
    expect(ownedMarkers()).toHaveLength(0);
    expect(presentation.setVisible(registration.id, registration.timeline, true)).toBe(true);
    presentation.sync([registration], registration.id);
    expect(ownedMarkers()).toHaveLength(4);
    presentation.sync([], undefined);
    expect(ownedMarkers()).toHaveLength(0);
    presentation.sync([registration], registration.id);
    expect(ownedMarkers()).toHaveLength(0);
    presentation.activate(registration.id, registration.timeline);
    presentation.sync([registration], registration.id);
    expect(ownedMarkers()).toHaveLength(4);
    presentation.destroy();
    expect(ownedMarkers()).toHaveLength(0);
    expect(document.querySelector("[data-motion-devtools-marker-visibility]")).toBeNull();

    registration.destroy();
    registry.destroy();
  });

  it("replaces owned nodes when replay replaces the timeline without mutating marker config", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("section");
    const markerConfig = { startColor: "#22c55e", endColor: "#ef4444" };
    const markerVars: Array<{ scrub: true; markers: typeof markerConfig }> = [];
    const triggers: object[] = [];
    const registration = registry.register({
      id: "replacement",
      root,
      create() {
        const timeline = gsap.timeline({ paused: true }).to(root, { x: 40, duration: 1 });
        const vars = { scrub: true as const, markers: markerConfig };
        const trigger = {
          start: 0,
          end: 400,
          trigger: root,
          scroller: window,
          vars,
          scroll: () => 0,
        };
        markerVars.push(vars);
        triggers.push(trigger);
        Object.defineProperty(timeline, "scrollTrigger", {
          value: trigger,
        });
        return { timeline, dispose: () => timeline.pause() };
      },
    });
    const presentation = createScrollTriggerMarkerPresentation();
    presentation.activate(registration.id, registration.timeline);
    presentation.sync([registration], registration.id);
    const before = ownedMarkers();
    expect((registration.timeline as gsap.core.Timeline & { scrollTrigger: object }).scrollTrigger)
      .toBe(triggers[0]);
    expect(markerVars[0]?.markers).toBe(markerConfig);

    registration.replay();
    presentation.activate(registration.id, registration.timeline);
    presentation.sync([registration], registration.id);
    const after = ownedMarkers();
    expect(after).toHaveLength(4);
    expect(before.every((marker) => !marker.isConnected)).toBe(true);
    expect(after.every((marker) => !before.includes(marker))).toBe(true);
    expect(triggers).toHaveLength(2);
    expect((registration.timeline as gsap.core.Timeline & { scrollTrigger: object }).scrollTrigger)
      .toBe(triggers[1]);
    expect(markerVars).toHaveLength(2);
    expect(markerVars.every(({ markers }) => markers === markerConfig)).toBe(true);
    expect(markerConfig).toEqual({ startColor: "#22c55e", endColor: "#ef4444" });

    presentation.destroy();
    registration.destroy();
    registry.destroy();
  });
});
