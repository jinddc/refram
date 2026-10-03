// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createEditorUiElements } from "../src/devtools/editor-ui/dom";

describe("editor DOM contract", () => {
  it("emits stable landmarks, pane relationships, and semantic group order", () => {
    const elements = createEditorUiElements();
    const rootChildren = [...elements.root.children] as HTMLElement[];
    expect(rootChildren.map(({ dataset, className }) => dataset.role ?? className)).toEqual([
      "height-separator",
      "pane-switcher",
      "workspace",
    ]);
    expect(elements.heightSeparator.getAttribute("role")).toBe("separator");
    expect(elements.heightSeparator.getAttribute("aria-orientation")).toBe("horizontal");
    expect(elements.paneTabs.map((tab) => ({
      role: tab.getAttribute("role"),
      controls: tab.getAttribute("aria-controls"),
      selected: tab.getAttribute("aria-selected"),
    }))).toEqual([
      { role: "tab", controls: "devtools-editor-pane-timelines", selected: "false" },
      { role: "tab", controls: "devtools-editor-pane-timeline", selected: "true" },
    ]);
    expect(elements.timelineListPane.getAttribute("aria-labelledby"))
      .toBe("devtools-editor-tab-timelines");
    expect(elements.timelinePane.getAttribute("aria-labelledby"))
      .toBe("devtools-editor-tab-timeline");
    expect(elements.inspectorPane.getAttribute("aria-label")).toBe("Track inspector");
    expect([...elements.root.querySelectorAll("[role='group']")].map((group) => (
      group.getAttribute("aria-label")
    ))).toEqual(["Timeline actions", "Playback controls", "Timeline viewport"]);
  });

  it("keeps the stable selector seams and control inventory", () => {
    const elements = createEditorUiElements();
    expect(elements.root.matches("section.devtools-editor[data-devtools-editor]")).toBe(true);
    expect([...elements.root.querySelectorAll<HTMLElement>("[data-role]")].map((node) => (
      node.dataset.role
    ))).toEqual(expect.arrayContaining([
      "height-separator",
      "pane-switcher",
      "workspace",
      "timeline-list",
      "current-time",
      "duration",
      "zoom-range",
      "timeline-viewport",
      "timeline-content",
      "ruler",
      "track-labels",
      "track-lanes",
      "post-duration",
      "timeline-end-marker",
      "playhead",
      "inspector",
      "inspector-empty",
      "inspector-content",
      "copy-debug-status",
    ]));
    expect([...elements.root.querySelectorAll<HTMLElement>("[data-action]")].map((node) => (
      node.dataset.action
    ))).toEqual([
      "toggle-timelines",
      "jump-to-scrolltrigger-target",
      "toggle-scrolltrigger-markers",
      "replay",
      "toggle-play",
      "toggle-loop",
      "toggle-reverse",
      "set-speed",
      "reset-timeline-zoom",
      "zoom-out",
      "zoom-in",
      "toggle-timeline-visibility",
      "close-inspector",
      "copy-debug-json",
    ]);
  });

  it("emits accessible button names, relationships, and presentation-only icons", () => {
    const elements = createEditorUiElements();
    const namedControls = [
      elements.heightSeparator,
      elements.timelineListToggle,
      elements.jumpToTargetButton,
      elements.toggleMarkersButton,
      elements.playButton,
      elements.replayButton,
      elements.speedSelect,
      elements.reverseButton,
      elements.loopButton,
      elements.resetButton,
      elements.zoomOutButton,
      elements.zoomRange,
      elements.zoomInButton,
      elements.timelineVisibilityButton,
      elements.inspectorCloseButton,
    ];
    expect(namedControls.every((control) => Boolean(
      control.getAttribute("aria-label") || control.textContent?.trim(),
    ))).toBe(true);
    expect(elements.copyDebugButton.getAttribute("aria-describedby"))
      .toBe(elements.copyDebugStatus.id);
    expect(elements.copyDebugStatus.getAttribute("aria-live")).toBe("polite");
    expect(elements.playhead.getAttribute("role")).toBe("slider");
    expect(elements.playhead.getAttribute("aria-valuemin")).toBe("0");
    expect(elements.playhead.getAttribute("aria-valuemax")).toBe("100");
    expect([...elements.root.querySelectorAll<SVGSVGElement>("svg[data-icon]")].every((icon) => (
      icon.getAttribute("role") === "presentation"
      && icon.getAttribute("aria-hidden") === "true"
    ))).toBe(true);
  });
});
