// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScrollTriggerMarkerPresentation } from "../../src/devtools/scrolltrigger/marker-presentation";
import {
  calculateNativeMarkerGeometry,
  calculateOwnedMarkerGeometry,
} from "../../src/devtools/scrolltrigger/marker-geometry";
import { createTimelineRegistry } from "../../src/devtools/timeline/registry";
import {
  bounds,
  directTimeline,
  markerPositions,
  ownedMarkers,
} from "../helpers/editor-test-fixtures";

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

function presentGeometry(options: {
  start: number;
  end: number;
  scroll: number;
  scroller?: Element | Window;
  rootRect?: () => DOMRect;
  useRootAsTrigger?: boolean;
}) {
  const registry = createTimelineRegistry();
  const fixture = directTimeline("geometry");
  if (options.rootRect) {
    vi.spyOn(fixture.root, "getBoundingClientRect").mockImplementation(options.rootRect);
  }
  let scroll = options.scroll;
  Object.defineProperty(fixture.timeline, "scrollTrigger", {
    value: {
      start: options.start,
      end: options.end,
      trigger: options.useRootAsTrigger ? fixture.root : fixture.target,
      scroller: options.scroller ?? window,
      vars: { scrub: false, markers: false },
      scroll: () => scroll,
    },
  });
  const registration = registry.register(fixture);
  const presentation = createScrollTriggerMarkerPresentation();
  presentation.activate(registration.id, registration.timeline);
  presentation.sync([registration], registration.id);
  return {
    presentation,
    registration,
    registry,
    setScroll(value: number) { scroll = value; },
    sync() { presentation.sync([registration], registration.id); },
  };
}

describe("ScrollTrigger marker geometry", () => {
  it("calculates viewport, custom-scroller, and native pair geometry without DOM access", () => {
    expect(calculateOwnedMarkerGeometry({
      viewportWidth: 1200,
      viewportHeight: 800,
      editorTop: 600,
      scroll: 100,
      start: 100,
      end: 500,
      scrollerMarkerWidth: 0,
    })).toEqual({
      positions: {
        start: 800,
        end: 400,
        "scroller-start": 600,
        "scroller-end": 0,
      },
      scrollerInlineEnd: 0,
      contentInlineEnd: 4,
    });
    expect(calculateOwnedMarkerGeometry({
      viewportWidth: 1200,
      viewportHeight: 800,
      editorTop: 700,
      scrollerRect: { top: 50, right: 700, bottom: 650 },
      scroll: 300,
      start: 100,
      end: 500,
      scrollerMarkerWidth: 44,
    })).toEqual({
      positions: {
        start: 450,
        end: 250,
        "scroller-start": 650,
        "scroller-end": 50,
      },
      scrollerInlineEnd: 500,
      contentInlineEnd: 548,
    });
    expect(calculateOwnedMarkerGeometry({
      viewportWidth: 1200,
      viewportHeight: 800,
      editorTop: 600,
      scrollerRect: { top: -262, right: 700, bottom: -2 },
      scroll: 0,
      start: 100,
      end: 500,
      scrollerMarkerWidth: 44,
    })).toEqual({
      positions: {
        start: 98,
        end: 238,
        "scroller-start": -2,
        "scroller-end": -262,
      },
      scrollerInlineEnd: 500,
      contentInlineEnd: 548,
    });
    expect(calculateOwnedMarkerGeometry({
      viewportWidth: 1200,
      viewportHeight: 800,
      editorTop: 600,
      viewportScrollerAnchorRect: { top: 360, right: 1200, bottom: 780 },
      scroll: 100,
      start: 100,
      end: 500,
      scrollerMarkerWidth: 44,
    })).toEqual({
      positions: {
        start: 800,
        end: 400,
        "scroller-start": 780,
        "scroller-end": 360,
      },
      scrollerInlineEnd: 0,
      contentInlineEnd: 48,
    });
    expect(calculateNativeMarkerGeometry({
      scrollerStartWidth: 44,
      scrollerStartInlineEnd: 2,
      scrollerEndInlineEnd: 6,
    })).toEqual({
      scrollerWidth: 44,
      startInlineEnd: 50,
      endInlineEnd: 54,
    });
  });

  it("keeps viewport content geometry while clamping its scroller label above the editor", () => {
    const editor = document.createElement("motion-devtools-editor");
    vi.spyOn(editor, "getBoundingClientRect").mockReturnValue(bounds(0, 600, 1200, 200));
    document.body.append(editor);
    const harness = presentGeometry({
      start: 100,
      end: 500,
      scroll: 100,
      useRootAsTrigger: true,
    });

    expect(markerPositions()).toEqual({
      start: { top: "800px", right: "4px" },
      end: { top: "400px", right: "4px" },
      "scroller-start": { top: "600px", right: "0px" },
      "scroller-end": { top: "0px", right: "0px" },
    });

    harness.setScroll(180);
    harness.sync();
    expect(markerPositions()).toMatchObject({
      start: { top: "720px" },
      end: { top: "320px" },
      "scroller-end": { top: "0px" },
    });

    harness.presentation.destroy();
    harness.registration.destroy();
    harness.registry.destroy();
  });

  it("moves nested window-scroller labels with the registration root", () => {
    let anchorTop = 360;
    const harness = presentGeometry({
      start: 100,
      end: 500,
      scroll: 100,
      rootRect: () => bounds(0, anchorTop, 1200, 420),
    });

    expect(markerPositions()).toEqual({
      start: { top: "800px", right: "4px" },
      end: { top: "400px", right: "4px" },
      "scroller-start": { top: "780px", right: "0px" },
      "scroller-end": { top: "360px", right: "0px" },
    });

    anchorTop = 280;
    harness.setScroll(180);
    harness.sync();
    expect(markerPositions()).toEqual({
      start: { top: "720px", right: "4px" },
      end: { top: "320px", right: "4px" },
      "scroller-start": { top: "700px", right: "0px" },
      "scroller-end": { top: "280px", right: "0px" },
    });

    harness.presentation.destroy();
    harness.registration.destroy();
    harness.registry.destroy();
  });

  it("tracks custom-scroller bounds, content scroll delta, and marker-pair separation", () => {
    const scroller = document.createElement("main");
    let scrollerTop = 50;
    vi.spyOn(scroller, "getBoundingClientRect").mockImplementation(() => (
      bounds(100, scrollerTop, 600, 600)
    ));
    document.body.append(scroller);
    const harness = presentGeometry({ start: 100, end: 500, scroll: 100, scroller });
    for (const marker of ownedMarkers()) {
      vi.spyOn(marker, "getBoundingClientRect").mockReturnValue(bounds(0, 0, 44, 15));
    }
    harness.sync();
    const markerStyle = document.querySelector<HTMLStyleElement>(
      "[data-motion-devtools-marker-visibility]",
    );
    expect(markerStyle?.textContent).toContain("font: normal 16px/normal sans-serif, Arial");
    expect(markerStyle?.textContent).toContain("padding: 4px 8px");
    expect(markerStyle?.textContent).toMatch(
      /owned-marker-type="start"[\s\S]*transform: translateY\(-100%\)/,
    );
    expect(markerPositions()).toEqual({
      start: { top: "650px", right: "548px" },
      end: { top: "450px", right: "548px" },
      "scroller-start": { top: "650px", right: "500px" },
      "scroller-end": { top: "50px", right: "500px" },
    });

    scrollerTop = -30;
    harness.sync();
    expect(markerPositions()).toEqual({
      start: { top: "570px", right: "548px" },
      end: { top: "370px", right: "548px" },
      "scroller-start": { top: "570px", right: "500px" },
      "scroller-end": { top: "-30px", right: "500px" },
    });

    harness.setScroll(300);
    harness.sync();
    expect(markerPositions()).toMatchObject({
      start: { top: "370px" },
      end: { top: "170px" },
      "scroller-start": { top: "570px" },
      "scroller-end": { top: "-30px" },
    });

    harness.presentation.destroy();
    harness.registration.destroy();
    harness.registry.destroy();
  });

  it.each([
    { start: Number.NaN, end: 100, scroll: () => 0 },
    { start: 0, end: Number.POSITIVE_INFINITY, scroll: () => 0 },
    { start: 0, end: 100, scroll: undefined },
  ])("declines degenerate or missing geometry %#", (geometry) => {
    const registry = createTimelineRegistry();
    const fixture = directTimeline("invalid-geometry");
    Object.defineProperty(fixture.timeline, "scrollTrigger", {
      value: {
        ...geometry,
        trigger: fixture.target,
        scroller: window,
        vars: { markers: false },
      },
    });
    const registration = registry.register(fixture);
    const presentation = createScrollTriggerMarkerPresentation();

    expect(presentation.canPresent(registration.timeline)).toBe(false);
    expect(presentation.activate(registration.id, registration.timeline)).toBe(false);
    presentation.sync([registration], registration.id);
    expect(ownedMarkers()).toHaveLength(0);

    presentation.destroy();
    registration.destroy();
    registry.destroy();
  });
});
