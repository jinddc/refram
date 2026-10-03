// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScrollTriggerMarkerPresentation } from "../src/devtools/scrolltrigger-marker-presentation";
import { createTimelineRegistry } from "../src/devtools/timeline-registry";
import { bounds, directTimeline, nativeMarker } from "./helpers/editor-test-fixtures";

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

describe("native ScrollTrigger marker ownership", () => {
  it("discovers id-scoped markers and leaves ambiguous id-less candidates untouched", () => {
    const registry = createTimelineRegistry();
    const fixture = directTimeline("native");
    const markerStart = nativeMarker("start", "Scoped");
    const markerEnd = nativeMarker("end", "Scoped");
    const scrollerStart = nativeMarker("scroller-start", "Scoped");
    const scrollerEnd = nativeMarker("scroller-end", "Scoped");
    const unrelated = nativeMarker("scroller-start", "Other");
    const trigger = {
      start: 0,
      end: 400,
      trigger: fixture.target,
      markerStart,
      markerEnd,
      scroller: window,
      vars: { id: "Scoped", markers: true },
      scroll: () => 0,
    };
    Object.defineProperty(fixture.timeline, "scrollTrigger", { value: trigger });
    const registration = registry.register(fixture);
    const presentation = createScrollTriggerMarkerPresentation();

    expect(presentation.activate(registration.id, registration.timeline)).toBe(true);
    presentation.sync([registration], registration.id);
    expect([markerStart, markerEnd, scrollerStart, scrollerEnd].every((marker) => (
      marker.hasAttribute("data-motion-devtools-marker-selected")
    ))).toBe(true);
    expect(unrelated.hasAttribute("data-motion-devtools-marker-selected")).toBe(false);
    expect(unrelated.textContent).toBe("scroller-start-Other");

    presentation.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("does not adopt ambiguous scroller markers without an id", () => {
    const registry = createTimelineRegistry();
    const fixture = directTimeline("ambiguous");
    const markerStart = nativeMarker("start");
    const markerEnd = nativeMarker("end");
    const firstScrollerStart = nativeMarker("scroller-start");
    const secondScrollerStart = nativeMarker("scroller-start");
    const scrollerEnd = nativeMarker("scroller-end");
    Object.defineProperty(fixture.timeline, "scrollTrigger", {
      value: {
        start: 0,
        end: 100,
        trigger: fixture.target,
        markerStart,
        markerEnd,
        scroller: window,
        vars: { markers: true },
        scroll: () => 0,
      },
    });
    const registration = registry.register(fixture);
    const presentation = createScrollTriggerMarkerPresentation();
    presentation.activate(registration.id, registration.timeline);
    presentation.sync([registration], registration.id);

    expect(markerStart.hasAttribute("data-motion-devtools-marker-selected")).toBe(true);
    expect(markerEnd.hasAttribute("data-motion-devtools-marker-selected")).toBe(true);
    expect(firstScrollerStart.hasAttribute("data-motion-devtools-marker-selected")).toBe(false);
    expect(secondScrollerStart.hasAttribute("data-motion-devtools-marker-selected")).toBe(false);
    expect(scrollerEnd.hasAttribute("data-motion-devtools-marker-selected")).toBe(true);

    presentation.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("restores authored marker state and releases document resources exactly", () => {
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      observe = observe;
      disconnect = disconnect;
    });
    const editor = document.createElement("motion-devtools-editor");
    vi.spyOn(editor, "getBoundingClientRect").mockReturnValue(bounds(0, 600, 1200, 200));
    document.body.append(editor);
    const registry = createTimelineRegistry();
    const fixture = directTimeline("restore");
    const markerStart = nativeMarker("start", "Restore");
    const markerEnd = nativeMarker("end", "Restore");
    const scrollerStart = nativeMarker("scroller-start", "Restore");
    const scrollerEnd = nativeMarker("scroller-end", "Restore");
    markerStart.setAttribute("data-motion-devtools-marker-hidden", "authored-hidden");
    markerStart.setAttribute("data-motion-devtools-marker-selected", "authored-selected");
    markerStart.setAttribute("data-motion-devtools-marker-viewport-scroller", "authored-viewport");
    markerStart.style.setProperty("--motion-devtools-marker-inline-end", "12px", "important");
    scrollerEnd.style.setProperty("--motion-devtools-marker-scroller-width", "99px", "important");
    Object.defineProperty(fixture.timeline, "scrollTrigger", {
      value: {
        start: 0,
        end: 400,
        trigger: fixture.target,
        markerStart,
        markerEnd,
        scroller: window,
        vars: { id: "Restore", markers: { startColor: "blue" } },
        scroll: () => 0,
      },
    });
    const registration = registry.register(fixture);
    const presentation = createScrollTriggerMarkerPresentation();
    presentation.activate(registration.id, registration.timeline);
    presentation.sync([registration], registration.id);
    expect(document.querySelectorAll("[data-motion-devtools-marker-visibility]")).toHaveLength(1);
    expect(observe).toHaveBeenCalledWith(editor);

    presentation.destroy();

    expect(markerStart.textContent).toBe("start-Restore");
    expect(markerStart.getAttribute("data-motion-devtools-marker-hidden")).toBe("authored-hidden");
    expect(markerStart.getAttribute("data-motion-devtools-marker-selected")).toBe("authored-selected");
    expect(markerStart.getAttribute("data-motion-devtools-marker-viewport-scroller"))
      .toBe("authored-viewport");
    expect(markerStart.style.getPropertyValue("--motion-devtools-marker-inline-end")).toBe("12px");
    expect(markerStart.style.getPropertyPriority("--motion-devtools-marker-inline-end"))
      .toBe("important");
    expect(scrollerEnd.style.getPropertyValue("--motion-devtools-marker-scroller-width"))
      .toBe("99px");
    expect(scrollerEnd.style.getPropertyPriority("--motion-devtools-marker-scroller-width"))
      .toBe("important");
    expect(disconnect).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-motion-devtools-marker-visibility]")).toBeNull();

    registration.destroy();
    registry.destroy();
  });
});
