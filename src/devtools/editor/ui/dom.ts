import { createActionButton } from "./controls";
import { createPlayheadIcon, createTransportIcon } from "./icons";

export const EDITOR_TIMELINE_EDGE_GUTTER = 12;

export interface EditorUiElements {
  readonly root: HTMLElement;
  readonly heightSeparator: HTMLElement;
  readonly paneTabs: readonly HTMLButtonElement[];
  readonly timelineList: HTMLElement;
  readonly timelineListPane: HTMLElement;
  readonly timelinePane: HTMLElement;
  readonly transport: HTMLElement;
  readonly transportHint: HTMLElement;
  readonly scrollTriggerActions: HTMLElement;
  readonly jumpToTargetButton: HTMLButtonElement;
  readonly toggleMarkersButton: HTMLButtonElement;
  readonly playback: HTMLElement;
  readonly viewportControls: HTMLElement;
  readonly timelineVisibilityButton: HTMLButtonElement;
  readonly inspectorPane: HTMLElement;
  readonly inspectorWidthSeparator: HTMLElement;
  readonly inspectorCloseButton: HTMLButtonElement;
  readonly timelineListToggle: HTMLButtonElement;
  readonly inspectorContent: HTMLElement;
  readonly inspectorEmpty: HTMLElement;
  readonly playButton: HTMLButtonElement;
  readonly playIcon: SVGSVGElement;
  readonly pauseIcon: SVGSVGElement;
  readonly replayButton: HTMLButtonElement;
  readonly speedSelect: HTMLSelectElement;
  readonly reverseButton: HTMLButtonElement;
  readonly loopButton: HTMLButtonElement;
  readonly resetButton: HTMLButtonElement;
  readonly zoomControl: HTMLElement;
  readonly zoomOutButton: HTMLButtonElement;
  readonly zoomInButton: HTMLButtonElement;
  readonly zoomRange: HTMLInputElement;
  readonly currentTime: HTMLOutputElement;
  readonly duration: HTMLOutputElement;
  readonly timelineContent: HTMLElement;
  readonly ruler: HTMLElement;
  readonly trackLabels: HTMLElement;
  readonly trackLanes: HTMLElement;
  readonly timelineEndMarker: HTMLElement;
  readonly postDurationRegion: HTMLElement;
  readonly playhead: HTMLElement;
  readonly playheadProgress: HTMLElement;
  readonly timelineViewport: HTMLElement;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function paneTab(label: string, pane: string, selected = false): HTMLButtonElement {
  const button = element("button", "rf__pane-tab", label);
  button.type = "button";
  button.id = `rf-tab-${pane}`;
  button.dataset.paneTarget = pane;
  button.setAttribute("role", "tab");
  button.setAttribute("aria-controls", `rf-pane-${pane}`);
  button.setAttribute("aria-selected", String(selected));
  button.tabIndex = selected ? 0 : -1;
  return button;
}

function configurePane(node: HTMLElement, pane: string, active = false): void {
  node.id = `rf-pane-${pane}`;
  node.dataset.pane = pane;
  node.dataset.active = String(active);
  node.setAttribute("role", "tabpanel");
  node.setAttribute("aria-labelledby", `rf-tab-${pane}`);
}

export function createEditorUiElements(): EditorUiElements {
  const root = element("section", "rf");
  root.dataset.rf = "";
  root.dataset.lenisPrevent = "";
  root.tabIndex = -1;

  const heightSeparator = element("div", "rf__height-separator");
  heightSeparator.dataset.role = "height-separator";
  heightSeparator.dataset.resizeState = "idle";
  heightSeparator.tabIndex = 0;
  heightSeparator.setAttribute("role", "separator");
  heightSeparator.setAttribute("aria-label", "Resize DevTools editor height");
  heightSeparator.setAttribute("aria-orientation", "horizontal");

  const paneSwitcher = element("div", "rf__pane-switcher");
  paneSwitcher.dataset.role = "pane-switcher";
  paneSwitcher.setAttribute("role", "tablist");
  paneSwitcher.setAttribute("aria-label", "DevTools panels");
  const paneTabs = [
    paneTab("Timelines", "timelines"),
    paneTab("Timeline", "timeline", true),
  ];
  paneSwitcher.append(...paneTabs);
  const workspace = element("div", "rf__workspace");
  workspace.dataset.role = "workspace";

  const timelineListPane = element(
    "section",
    "rf__pane rf__timeline-list-pane",
  );
  configurePane(timelineListPane, "timelines");
  const timelineListHeading = element("header", "rf__pane-heading");
  timelineListHeading.append(element("span", "rf__pane-heading-label", "Timelines"));
  const timelineListToggle = createActionButton({
    action: "toggle-timelines",
    accessibleLabel: "Hide timelines pane",
    title: "Hide timelines pane",
    icon: "previous",
    variants: [
      "rf__timeline-list-toggle",
      "rf__action--compact",
    ],
    expanded: true,
    controls: "rf-pane-timelines",
  });
  timelineListHeading.append(timelineListToggle);
  const timelineList = element("div", "rf__timeline-list");
  timelineList.dataset.role = "timeline-list";
  timelineListPane.append(timelineListHeading, timelineList);

  const timeline = element(
    "section",
    "rf__pane rf__timeline",
  );
  configurePane(timeline, "timeline", true);
  timeline.setAttribute("aria-label", "Timeline inspector");
  const transport = element("div", "rf__transport");
  const transportHint = element(
    "p",
    "rf__transport-hint",
    "Scroll the page to preview",
  );
  transportHint.hidden = true;
  const transportSettings = element("div", "rf__transport-settings");
  transportSettings.classList.add("rf__transport-group");
  transportSettings.setAttribute("role", "group");
  transportSettings.setAttribute("aria-label", "Timeline actions");
  transportSettings.setAttribute("aria-hidden", "true");
  const jumpToTargetButton = createActionButton({
    action: "jump-to-scrolltrigger-target",
    accessibleLabel: "Jump to target",
    title: "Jump to target",
    icon: "jump-to-target",
    variants: ["rf__action--icon"],
  });
  jumpToTargetButton.hidden = true;
  const toggleMarkersButton = createActionButton({
    action: "toggle-scrolltrigger-markers",
    accessibleLabel: "Show ScrollTrigger markers",
    title: "Show ScrollTrigger markers",
    icon: "markers",
    variants: ["rf__action--icon"],
    pressed: false,
  });
  toggleMarkersButton.hidden = true;
  transportSettings.append(jumpToTargetButton, toggleMarkersButton);
  const speedSelect = element("select", "rf__speed");
  speedSelect.dataset.action = "set-speed";
  speedSelect.setAttribute("aria-label", "Playback speed");
  for (const speed of [0.1, 0.25, 0.5, 1, 2]) {
    const option = element("option", "", `${speed}×`);
    option.value = String(speed);
    if (speed === 1) option.selected = true;
    speedSelect.append(option);
  }
  const reverseButton = createActionButton({
    action: "toggle-reverse",
    accessibleLabel: "Reverse",
    title: "Reverse (R)",
    icon: "reverse",
    variants: ["rf__action--icon"],
    pressed: false,
  });
  const loopButton = createActionButton({
    action: "toggle-loop",
    accessibleLabel: "Loop",
    title: "Loop (L)",
    icon: "loop",
    variants: ["rf__action--icon"],
    pressed: false,
  });
  const playback = element("div", "rf__transport-group rf__playback");
  playback.setAttribute("role", "group");
  playback.setAttribute("aria-label", "Playback controls");
  const playButton = createActionButton({
    action: "play",
    accessibleLabel: "Play",
    variants: ["rf__action--primary"],
  });
  const playIcon = createTransportIcon("play");
  const pauseIcon = createTransportIcon("pause");
  pauseIcon.setAttribute("hidden", "");
  playButton.append(playIcon, pauseIcon);
  const replayButton = createActionButton({
    action: "replay",
    accessibleLabel: "Replay",
    title: "Replay",
    icon: "replay",
    variants: ["rf__action--icon"],
  });
  const clock = element("div", "rf__clock");
  const currentTime = element("output", "rf__time", "00:00.000");
  currentTime.dataset.role = "current-time";
  const separator = element("span", "rf__time-separator", "/");
  const duration = element("output", "rf__duration", "00:00.000");
  duration.dataset.role = "duration";
  clock.append(currentTime, separator, duration);
  const playbackActions = element("div", "rf__playback-actions");
  playbackActions.append(replayButton, playButton, loopButton, reverseButton);
  playback.append(playbackActions, clock, speedSelect);
  const viewportControls = element("div", "rf__transport-group rf__viewport-controls");
  viewportControls.setAttribute("role", "group");
  viewportControls.setAttribute("aria-label", "Timeline viewport");
  const resetButton = createActionButton({
    action: "reset-timeline-zoom",
    label: "Reset",
    accessibleLabel: "Reset timeline zoom",
    title: "Fit timeline (F)",
  });
  const zoomOutButton = createActionButton({
    action: "zoom-out",
    accessibleLabel: "Zoom out timeline",
    title: "Zoom out timeline",
    icon: "zoom-out",
    variants: ["rf__action--icon"],
  });
  const zoomRange = element("input", "rf__zoom-range");
  zoomRange.type = "range";
  zoomRange.step = "0.05";
  zoomRange.value = "1";
  zoomRange.dataset.role = "zoom-range";
  zoomRange.setAttribute("aria-label", "Timeline zoom");
  const zoomInButton = createActionButton({
    action: "zoom-in",
    accessibleLabel: "Zoom in timeline",
    title: "Zoom in timeline",
    icon: "zoom-in",
    variants: ["rf__action--icon"],
  });
  const zoomControl = element("div", "rf__zoom-control");
  zoomControl.append(zoomOutButton, zoomRange, zoomInButton);
  const timelineVisibilityButton = createActionButton({
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
  viewportControls.append(resetButton, zoomControl, timelineVisibilityButton);
  transport.append(transportSettings, playback, transportHint, viewportControls);

  const timelineBody = element("div", "rf__timeline-body");
  timelineBody.id = "rf-timeline-body";
  const trackLabels = element("div", "rf__track-labels");
  trackLabels.dataset.role = "track-labels";
  const timelineViewport = element("div", "rf__timeline-viewport");
  timelineViewport.dataset.role = "timeline-viewport";
  const timelineContent = element("div", "rf__timeline-content");
  timelineContent.dataset.role = "timeline-content";
  const ruler = element("div", "rf__ruler");
  ruler.dataset.role = "ruler";
  ruler.setAttribute("role", "img");
  const trackLanes = element("div", "rf__track-lanes");
  trackLanes.dataset.role = "track-lanes";
  const postDurationRegion = element("div", "rf__post-duration");
  postDurationRegion.dataset.role = "post-duration";
  postDurationRegion.hidden = true;
  postDurationRegion.setAttribute("aria-hidden", "true");
  const timelineEndMarker = element("div", "rf__timeline-end-marker");
  timelineEndMarker.dataset.role = "timeline-end-marker";
  timelineEndMarker.hidden = true;
  timelineEndMarker.setAttribute("role", "img");
  const playhead = element("div", "rf__playhead");
  playhead.dataset.role = "playhead";
  playhead.dataset.dragState = "idle";
  playhead.setAttribute("aria-label", "Timeline playhead");
  playhead.setAttribute("aria-valuemin", "0");
  playhead.setAttribute("aria-valuemax", "100");
  playhead.setAttribute("role", "slider");
  playhead.tabIndex = 0;
  const playheadProgress = element("span", "rf__playhead-progress", "0%");
  playheadProgress.hidden = true;
  playheadProgress.setAttribute("aria-hidden", "true");
  playhead.append(createPlayheadIcon(), playheadProgress);
  timelineContent.append(ruler, trackLanes, postDurationRegion, timelineEndMarker, playhead);
  timelineViewport.append(timelineContent);
  timelineBody.append(trackLabels, timelineViewport);
  timeline.append(transport, timelineBody);

  const inspectorPane = element(
    "aside",
    "rf__inspector",
  );
  inspectorPane.dataset.role = "inspector";
  inspectorPane.setAttribute("aria-label", "Track inspector");
  inspectorPane.hidden = true;
  const inspectorWidthSeparator = element("div", "rf__inspector-width-separator");
  inspectorWidthSeparator.dataset.role = "inspector-width-separator";
  inspectorWidthSeparator.dataset.resizeState = "idle";
  inspectorWidthSeparator.hidden = true;
  inspectorWidthSeparator.tabIndex = -1;
  inspectorWidthSeparator.setAttribute("role", "separator");
  inspectorWidthSeparator.setAttribute("aria-label", "Resize Inspector width");
  inspectorWidthSeparator.setAttribute("aria-orientation", "vertical");
  inspectorWidthSeparator.setAttribute("aria-hidden", "true");
  const inspectorHeading = element("header", "rf__pane-heading");
  inspectorHeading.append(element("span", "rf__pane-heading-label", "Inspector"));
  const inspectorCloseButton = createActionButton({
    action: "close-inspector",
    accessibleLabel: "Close inspector",
    title: "Close inspector",
    icon: "close",
    variants: ["rf__inspector-close"],
  });
  inspectorHeading.append(inspectorCloseButton);
  const inspectorEmpty = element(
    "p",
    "rf__inspector-empty",
    "Select a track to inspect it.",
  );
  inspectorEmpty.dataset.role = "inspector-empty";
  const inspectorContent = element("div", "rf__inspector-content");
  inspectorContent.dataset.role = "inspector-content";
  inspectorContent.hidden = true;
  inspectorPane.append(
    inspectorWidthSeparator,
    inspectorHeading,
    inspectorEmpty,
    inspectorContent,
  );

  workspace.append(timelineListPane, timeline, inspectorPane);
  root.append(heightSeparator, paneSwitcher, workspace);

  return {
    root,
    heightSeparator,
    paneTabs,
    timelineList,
    timelineListPane,
    timelinePane: timeline,
    transport,
    transportHint,
    scrollTriggerActions: transportSettings,
    jumpToTargetButton,
    toggleMarkersButton,
    playback,
    viewportControls,
    timelineVisibilityButton,
    inspectorPane,
    inspectorWidthSeparator,
    inspectorCloseButton,
    timelineListToggle,
    inspectorContent,
    inspectorEmpty,
    playButton,
    playIcon,
    pauseIcon,
    replayButton,
    speedSelect,
    reverseButton,
    loopButton,
    resetButton,
    zoomControl,
    zoomOutButton,
    zoomInButton,
    zoomRange,
    currentTime,
    duration,
    timelineContent,
    ruler,
    trackLabels,
    trackLanes,
    timelineEndMarker,
    postDurationRegion,
    playhead,
    playheadProgress,
    timelineViewport,
  };
}
