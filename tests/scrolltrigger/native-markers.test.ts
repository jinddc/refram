// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScrollTriggerMarkerPresentation } from "../../src/devtools/scrolltrigger/marker-presentation";
import { createTimelineRegistry } from "../../src/devtools/timeline/registry";
import { bounds, directTimeline, nativeMarker, ownedMarkers } from "../helpers/editor-test-fixtures";

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
      marker.hasAttribute("data-rf-marker-selected")
    ))).toBe(true);
    expect(unrelated.hasAttribute("data-rf-marker-selected")).toBe(false);
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

    expect(markerStart.hasAttribute("data-rf-marker-selected")).toBe(true);
    expect(markerEnd.hasAttribute("data-rf-marker-selected")).toBe(true);
    expect(firstScrollerStart.hasAttribute("data-rf-marker-selected")).toBe(false);
    expect(secondScrollerStart.hasAttribute("data-rf-marker-selected")).toBe(false);
    expect(scrollerEnd.hasAttribute("data-rf-marker-selected")).toBe(true);

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
    const editor = document.createElement("rf-editor");
    vi.spyOn(editor, "getBoundingClientRect").mockReturnValue(bounds(0, 600, 1200, 200));
    document.body.append(editor);
    const registry = createTimelineRegistry();
    const fixture = directTimeline("restore");
    const markerStart = nativeMarker("start", "Restore");
    const markerEnd = nativeMarker("end", "Restore");
    const scrollerStart = nativeMarker("scroller-start", "Restore");
    const scrollerEnd = nativeMarker("scroller-end", "Restore");
    markerStart.setAttribute("data-rf-marker-hidden", "authored-hidden");
    markerStart.setAttribute("data-rf-marker-selected", "authored-selected");
    markerStart.setAttribute("data-rf-marker-viewport-scroller", "authored-viewport");
    markerStart.style.setProperty("--rf-marker-inline-end", "12px", "important");
    scrollerEnd.style.setProperty("--rf-marker-scroller-width", "99px", "important");
    scrollerEnd.style.setProperty(
      "--rf-marker-scroller-end-top",
      "23px",
      "important",
    );
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
    expect(document.querySelectorAll("[data-rf-marker-visibility]")).toHaveLength(1);
    expect(observe).toHaveBeenCalledWith(editor);

    presentation.destroy();

    expect(markerStart.textContent).toBe("start-Restore");
    expect(markerStart.getAttribute("data-rf-marker-hidden")).toBe("authored-hidden");
    expect(markerStart.getAttribute("data-rf-marker-selected")).toBe("authored-selected");
    expect(markerStart.getAttribute("data-rf-marker-viewport-scroller"))
      .toBe("authored-viewport");
    expect(markerStart.style.getPropertyValue("--rf-marker-inline-end")).toBe("12px");
    expect(markerStart.style.getPropertyPriority("--rf-marker-inline-end"))
      .toBe("important");
    expect(scrollerEnd.style.getPropertyValue("--rf-marker-scroller-width"))
      .toBe("99px");
    expect(scrollerEnd.style.getPropertyPriority("--rf-marker-scroller-width"))
      .toBe("important");
    expect(scrollerEnd.style.getPropertyValue("--rf-marker-scroller-end-top"))
      .toBe("23px");
    expect(scrollerEnd.style.getPropertyPriority("--rf-marker-scroller-end-top"))
      .toBe("important");
    expect(disconnect).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-rf-marker-visibility]")).toBeNull();

    registration.destroy();
    registry.destroy();
  });

  it("samples visible geometry without repeating structural marker discovery", () => {
    const registry = createTimelineRegistry();
    const fixture = directTimeline("sampling");
    const markerStart = nativeMarker("start", "Sampling");
    const markerEnd = nativeMarker("end", "Sampling");
    nativeMarker("scroller-start", "Sampling");
    nativeMarker("scroller-end", "Sampling");
    Object.defineProperty(fixture.timeline, "scrollTrigger", {
      value: {
        start: 0,
        end: 400,
        trigger: fixture.target,
        markerStart,
        markerEnd,
        scroller: window,
        vars: { id: "Sampling", markers: true },
        scroll: () => 0,
      },
    });
    const registration = registry.register(fixture);
    const presentation = createScrollTriggerMarkerPresentation();
    presentation.activate(registration.id, registration.timeline);
    presentation.sync([registration], registration.id);
    const discovery = vi.spyOn(document, "querySelectorAll");

    presentation.sync([registration], registration.id);

    expect(discovery.mock.calls.filter(([selector]) => (
      String(selector).startsWith(".gsap-marker-")
    ))).toHaveLength(0);
    expect(markerStart.style.getPropertyValue("--rf-marker-inline-end"))
      .toBe("4px");
    presentation.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("anchors native scroller markers without taking over content-marker motion", () => {
    const registry = createTimelineRegistry();
    const fixture = directTimeline("native-vertical-motion");
    const markerStart = nativeMarker("start", "Native vertical motion");
    const markerEnd = nativeMarker("end", "Native vertical motion");
    const scrollerStart = nativeMarker("scroller-start", "Native vertical motion");
    const scrollerEnd = nativeMarker("scroller-end", "Native vertical motion");
    let anchorTop = 360;
    vi.spyOn(fixture.root, "getBoundingClientRect").mockImplementation(() => (
      bounds(0, anchorTop, 1200, 420)
    ));
    markerEnd.style.position = "absolute";
    markerEnd.style.top = "500px";
    scrollerEnd.style.position = "fixed";
    scrollerEnd.style.top = "0px";
    Object.defineProperty(fixture.timeline, "scrollTrigger", {
      value: {
        start: 0,
        end: 500,
        trigger: fixture.target,
        markerStart,
        markerEnd,
        scroller: window,
        vars: { id: "Native vertical motion", markers: true },
        scroll: () => 0,
      },
    });
    const registration = registry.register(fixture);
    const presentation = createScrollTriggerMarkerPresentation();
    presentation.activate(registration.id, registration.timeline);
    presentation.sync([registration], registration.id);
    expect(scrollerStart.style.getPropertyValue(
      "--rf-marker-scroller-start-top",
    )).toBe("780px");
    expect(scrollerEnd.style.getPropertyValue(
      "--rf-marker-scroller-end-top",
    )).toBe("360px");

    anchorTop = 280;
    markerEnd.style.top = "420px";
    presentation.sync([registration], registration.id);

    expect(markerEnd.style.position).toBe("absolute");
    expect(markerEnd.style.top).toBe("420px");
    expect(scrollerEnd.style.position).toBe("fixed");
    expect(scrollerEnd.style.top).toBe("0px");
    expect(scrollerStart.style.getPropertyValue(
      "--rf-marker-scroller-start-top",
    )).toBe("700px");
    expect(scrollerEnd.style.getPropertyValue(
      "--rf-marker-scroller-end-top",
    )).toBe("280px");

    presentation.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("replaces fallback nodes when native markers appear after the first sync", () => {
    const registry = createTimelineRegistry();
    const fixture = directTimeline("late-native");
    const trigger = {
      start: 0,
      end: 400,
      trigger: fixture.target,
      markerStart: undefined as HTMLElement | undefined,
      markerEnd: undefined as HTMLElement | undefined,
      scroller: window,
      vars: { id: "Late native", markers: true },
      scroll: () => 0,
    };
    Object.defineProperty(fixture.timeline, "scrollTrigger", { value: trigger });
    const registration = registry.register(fixture);
    const presentation = createScrollTriggerMarkerPresentation();
    presentation.activate(registration.id, registration.timeline);
    presentation.sync([registration], registration.id);
    expect(ownedMarkers()).toHaveLength(4);

    trigger.markerStart = nativeMarker("start", "Late native");
    trigger.markerEnd = nativeMarker("end", "Late native");
    const scrollerStart = nativeMarker("scroller-start", "Late native");
    const scrollerEnd = nativeMarker("scroller-end", "Late native");
    presentation.sync([registration], registration.id);

    expect(ownedMarkers()).toHaveLength(0);
    expect([
      trigger.markerStart,
      trigger.markerEnd,
      scrollerStart,
      scrollerEnd,
    ].every((marker) => marker.hasAttribute("data-rf-marker-selected")))
      .toBe(true);

    presentation.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("binds the editor clamp when an editor mounts after marker activation", () => {
    const observe = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      observe = observe;
      disconnect = vi.fn();
    });
    const registry = createTimelineRegistry();
    const fixture = directTimeline("late-editor");
    const markerStart = nativeMarker("start", "Late editor");
    const markerEnd = nativeMarker("end", "Late editor");
    nativeMarker("scroller-start", "Late editor");
    nativeMarker("scroller-end", "Late editor");
    Object.defineProperty(fixture.timeline, "scrollTrigger", {
      value: {
        start: 0,
        end: 400,
        trigger: fixture.target,
        markerStart,
        markerEnd,
        scroller: window,
        vars: { id: "Late editor", markers: true },
        scroll: () => 0,
      },
    });
    const registration = registry.register(fixture);
    const presentation = createScrollTriggerMarkerPresentation();
    presentation.activate(registration.id, registration.timeline);
    presentation.sync([registration], registration.id);
    const style = document.querySelector<HTMLStyleElement>(
      "[data-rf-marker-visibility]",
    );
    expect(style?.textContent).toContain(", 798px) !important");

    const editor = document.createElement("rf-editor");
    vi.spyOn(editor, "getBoundingClientRect").mockReturnValue(bounds(0, 600, 1200, 200));
    document.body.append(editor);
    presentation.sync([registration], registration.id);

    expect(style?.textContent).toContain(", 598px) !important");
    expect(observe).toHaveBeenCalledWith(editor);

    presentation.destroy();
    registration.destroy();
    registry.destroy();
  });
});
