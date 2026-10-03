// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorController } from "../../src/devtools/editor/controller";
import { createEditorUiElements } from "../../src/devtools/editor/ui/dom";
import { renderEditorUi } from "../../src/devtools/editor/ui/render";
import { createTimelineRegistry } from "../../src/devtools/timeline/registry";
import { directTimeline } from "../helpers/editor-test-fixtures";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("editor transport rendering", () => {
  it("renders the empty state without executing commands", () => {
    const registry = createTimelineRegistry();
    const controller = createEditorController({ registry });
    const elements = createEditorUiElements();
    renderEditorUi(elements, controller.getSnapshot().view);

    expect(elements.jumpToTargetButton.hidden).toBe(true);
    expect(elements.toggleMarkersButton.hidden).toBe(true);
    expect(elements.playButton.disabled).toBe(true);
    expect(elements.replayButton.disabled).toBe(true);
    expect(elements.root.dataset.timelineMode).toBe("time");
    expect(elements.timelinePane.dataset.timelineMode).toBe("time");

    controller.destroy();
    registry.destroy();
  });

  it("renders ordinary time transport state and its stable action semantics", () => {
    const registry = createTimelineRegistry();
    const fixture = directTimeline("ordinary");
    const registration = registry.register(fixture);
    const controller = createEditorController({ registry });
    const elements = createEditorUiElements();
    renderEditorUi(elements, controller.getSnapshot().view);

    expect(elements.playback.hidden).toBe(false);
    expect(elements.transportHint.hidden).toBe(true);
    expect(elements.playButton.dataset.action).toBe("play");
    expect(elements.playButton.getAttribute("aria-label")).toBe("Play");
    expect(elements.playButton.disabled).toBe(false);
    expect(elements.replayButton.disabled).toBe(false);
    expect(elements.speedSelect.disabled).toBe(false);
    expect(elements.reverseButton.disabled).toBe(false);
    expect(elements.loopButton.disabled).toBe(false);
    expect(elements.resetButton.hidden).toBe(false);
    expect(elements.zoomControl.hidden).toBe(false);
    expect(elements.playheadProgress.hidden).toBe(true);
    expect(elements.root.dataset.timelineMode).toBe("time");
    expect(elements.timelinePane.dataset.timelineMode).toBe("time");
    expect(fixture.timeline.paused()).toBe(true);

    controller.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("renders scrub transport as scroll-only with a percentage ruler and pill", () => {
    const registry = createTimelineRegistry();
    const fixture = directTimeline("scrub");
    Object.defineProperty(fixture.timeline, "scrollTrigger", {
      value: {
        start: 100,
        end: 500,
        progress: 0.25,
        direction: 1,
        trigger: fixture.target,
        scroller: window,
        vars: { scrub: true, markers: false },
        scroll: () => 200,
      },
    });
    const registration = registry.register(fixture);
    const controller = createEditorController({ registry });
    const elements = createEditorUiElements();
    renderEditorUi(elements, controller.getSnapshot().view);

    expect(elements.playback.hidden).toBe(true);
    expect(elements.transportHint.hidden).toBe(false);
    expect(elements.transportHint.textContent).toBe("Scroll the page to preview");
    expect(elements.resetButton.hidden).toBe(true);
    expect(elements.zoomControl.hidden).toBe(true);
    expect(elements.playheadProgress.hidden).toBe(false);
    expect(elements.playheadProgress.textContent).toBe("25%");
    expect(elements.playhead.getAttribute("aria-label")).toBe("Scroll progress playhead");
    expect(elements.playhead.getAttribute("aria-valuetext")).toBe("25%");
    expect(elements.ruler.dataset.unit).toBe("percent");
    expect(elements.root.dataset.timelineMode).toBe("scroll-scrub");
    expect(elements.timelinePane.dataset.timelineMode).toBe("scroll-scrub");

    controller.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("keeps trigger-action timelines on time transport while exposing marker actions", () => {
    const registry = createTimelineRegistry();
    const fixture = directTimeline("actions");
    Object.defineProperty(fixture.timeline, "scrollTrigger", {
      value: {
        start: 0,
        end: 400,
        progress: 0,
        direction: 0,
        trigger: fixture.target,
        scroller: window,
        vars: { scrub: false, markers: false },
        scroll: () => 0,
      },
    });
    const registration = registry.register(fixture);
    const controller = createEditorController({ registry });
    controller.selectTimeline("actions");
    const elements = createEditorUiElements();
    renderEditorUi(elements, controller.getSnapshot().view);

    expect(elements.playback.hidden).toBe(false);
    expect(elements.transportHint.hidden).toBe(true);
    expect(elements.toggleMarkersButton.hidden).toBe(false);
    expect(elements.toggleMarkersButton.disabled).toBe(false);
    expect(elements.toggleMarkersButton.getAttribute("aria-pressed")).toBe("true");
    expect(elements.toggleMarkersButton.getAttribute("aria-label"))
      .toBe("Hide ScrollTrigger markers");
    expect(elements.resetButton.hidden).toBe(false);
    expect(elements.root.dataset.timelineMode).toBe("time");
    expect(elements.timelinePane.dataset.timelineMode).toBe("time");

    controller.destroy();
    registration.destroy();
    registry.destroy();
  });
});
