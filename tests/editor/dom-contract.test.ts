// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createActionButton } from "../../src/devtools/editor/ui/controls";
import { createEditorUiElements } from "../../src/devtools/editor/ui/dom";
import { createPlayheadIcon, createTransportIcon } from "../../src/devtools/editor/ui/icons";

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
    expect(elements.inspectorWidthSeparator.getAttribute("role")).toBe("separator");
    expect(elements.inspectorWidthSeparator.getAttribute("aria-orientation")).toBe("vertical");
    expect(elements.paneTabs.map((tab) => ({
      role: tab.getAttribute("role"),
      controls: tab.getAttribute("aria-controls"),
      selected: tab.getAttribute("aria-selected"),
    }))).toEqual([
      { role: "tab", controls: "rf-pane-timelines", selected: "false" },
      { role: "tab", controls: "rf-pane-timeline", selected: "true" },
    ]);
    expect(elements.timelineListPane.getAttribute("aria-labelledby"))
      .toBe("rf-tab-timelines");
    expect(elements.timelinePane.getAttribute("aria-labelledby"))
      .toBe("rf-tab-timeline");
    expect(elements.inspectorPane.getAttribute("aria-label")).toBe("Track inspector");
    expect([...elements.root.querySelectorAll("[role='group']")].map((group) => (
      group.getAttribute("aria-label")
    ))).toEqual(["Timeline actions", "Playback controls", "Timeline viewport"]);
  });

  it("keeps the stable selector seams and control inventory", () => {
    const elements = createEditorUiElements();
    expect(elements.root.matches("section.rf[data-rf]")).toBe(true);
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
      "inspector-width-separator",
      "inspector-empty",
      "inspector-content",
    ]));
    expect([...elements.root.querySelectorAll<HTMLElement>("[data-action]")].map((node) => (
      node.dataset.action
    ))).toEqual([
      "toggle-timelines",
      "jump-to-scrolltrigger-target",
      "toggle-scrolltrigger-markers",
      "replay",
      "play",
      "toggle-loop",
      "toggle-reverse",
      "set-speed",
      "reset-timeline-zoom",
      "zoom-out",
      "zoom-in",
      "toggle-timeline-visibility",
      "close-inspector",
    ]);
  });

  it("emits accessible button names, relationships, and presentation-only icons", () => {
    const elements = createEditorUiElements();
    const namedControls = [
      elements.heightSeparator,
      elements.inspectorWidthSeparator,
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
    expect(elements.playhead.getAttribute("role")).toBe("slider");
    expect(elements.playhead.getAttribute("aria-valuemin")).toBe("0");
    expect(elements.playhead.getAttribute("aria-valuemax")).toBe("100");
    expect([...elements.root.querySelectorAll<SVGSVGElement>("svg[data-icon]")].every((icon) => (
      icon.getAttribute("role") === "presentation"
      && icon.getAttribute("aria-hidden") === "true"
    ))).toBe(true);
  });

  it("keeps action-button and icon factory output exact", () => {
    const button = createActionButton({
      action: "toggle-timeline-visibility",
      accessibleLabel: "Hide timeline",
      title: "Hide timeline",
      icon: "timeline-visibility",
      variants: [
        "rf__action--icon",
        "rf__timeline-visibility",
      ],
      expanded: true,
      controls: "rf-timeline-body",
    });
    expect(button.type).toBe("button");
    expect(button.className).toBe(
      "rf__action rf__action--icon rf__timeline-visibility",
    );
    expect(button.dataset.action).toBe("toggle-timeline-visibility");
    expect(button.getAttribute("aria-label")).toBe("Hide timeline");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-controls")).toBe("rf-timeline-body");
    expect(button.title).toBe("Hide timeline");

    const icon = button.firstElementChild as SVGSVGElement;
    expect({
      name: icon.dataset.icon,
      className: icon.getAttribute("class"),
      width: icon.getAttribute("width"),
      height: icon.getAttribute("height"),
      viewBox: icon.getAttribute("viewBox"),
      preserveAspectRatio: icon.getAttribute("preserveAspectRatio"),
      fill: icon.getAttribute("fill"),
      role: icon.getAttribute("role"),
      hidden: icon.getAttribute("aria-hidden"),
      paths: [...icon.querySelectorAll("path")].map((path) => path.getAttribute("fill")),
    }).toEqual({
      name: "timeline-visibility",
      className: "rf__transport-icon",
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      preserveAspectRatio: "xMidYMid meet",
      fill: "none",
      role: "presentation",
      hidden: "true",
      paths: ["currentColor", "currentColor"],
    });
    expect(icon.querySelector("[data-follow-fill]")).toBeNull();

    expect(createTransportIcon("play").querySelectorAll("path")).toHaveLength(1);
    const playhead = createPlayheadIcon();
    expect(playhead.getAttribute("class")).toBe("rf__playhead-icon");
    expect(playhead.getAttribute("viewBox")).toBe("0 0 12 18");
    expect(playhead.getAttribute("aria-hidden")).toBe("true");
    expect(playhead.querySelector("mask")?.id).toBe("rf-playhead-mask");
    expect(playhead.querySelector(".rf__playhead-icon-border")
      ?.getAttribute("mask")).toBe("url(#rf-playhead-mask)");
  });
});
