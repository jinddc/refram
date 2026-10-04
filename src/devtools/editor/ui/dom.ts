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
  readonly inspectorCloseButton: HTMLButtonElement;
  readonly timelineListToggle: HTMLButtonElement;
  readonly inspectorContent: HTMLElement;
  readonly inspectorEmpty: HTMLElement;
  readonly inspectorActions: HTMLElement;
  readonly copyDebugButton: HTMLButtonElement;
  readonly copyDebugStatus: HTMLOutputElement;
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
  const button = element("button", "devtools-editor__pane-tab", label);
  button.type = "button";
  button.id = `devtools-editor-tab-${pane}`;
  button.dataset.paneTarget = pane;
  button.setAttribute("role", "tab");
  button.setAttribute("aria-controls", `devtools-editor-pane-${pane}`);
  button.setAttribute("aria-selected", String(selected));
  button.tabIndex = selected ? 0 : -1;
  return button;
}

function configurePane(node: HTMLElement, pane: string, active = false): void {
  node.id = `devtools-editor-pane-${pane}`;
  node.dataset.pane = pane;
  node.dataset.active = String(active);
  node.setAttribute("role", "tabpanel");
  node.setAttribute("aria-labelledby", `devtools-editor-tab-${pane}`);
}

export function createEditorUiElements(): EditorUiElements {
  const root = element("section", "devtools-editor");
  root.dataset.devtoolsEditor = "";
  root.tabIndex = -1;

  const heightSeparator = element("div", "devtools-editor__height-separator");
  heightSeparator.dataset.role = "height-separator";
  heightSeparator.dataset.resizeState = "idle";
  heightSeparator.tabIndex = 0;
  heightSeparator.setAttribute("role", "separator");
  heightSeparator.setAttribute("aria-label", "Resize DevTools editor height");
  heightSeparator.setAttribute("aria-orientation", "horizontal");

  const paneSwitcher = element("div", "devtools-editor__pane-switcher");
  paneSwitcher.dataset.role = "pane-switcher";
  paneSwitcher.setAttribute("role", "tablist");
  paneSwitcher.setAttribute("aria-label", "DevTools panels");
  const paneTabs = [
    paneTab("Timelines", "timelines"),
    paneTab("Timeline", "timeline", true),
  ];
  paneSwitcher.append(...paneTabs);
  const workspace = element("div", "devtools-editor__workspace");
  workspace.dataset.role = "workspace";

  const timelineListPane = element(
    "section",
    "devtools-editor__pane devtools-editor__timeline-list-pane",
  );
  configurePane(timelineListPane, "timelines");
  const timelineListHeading = element("header", "devtools-editor__pane-heading");
  timelineListHeading.append(element("span", "devtools-editor__pane-heading-label", "Timelines"));
  const timelineListToggle = createActionButton({
    action: "toggle-timelines",
    accessibleLabel: "Hide timelines pane",
    title: "Hide timelines pane",
    icon: "previous",
    variants: [
      "devtools-editor__timeline-list-toggle",
      "devtools-editor__action--compact",
    ],
    expanded: true,
    controls: "devtools-editor-pane-timelines",
  });
  timelineListHeading.append(timelineListToggle);
  const timelineList = element("div", "devtools-editor__timeline-list");
  timelineList.dataset.role = "timeline-list";
  timelineListPane.append(timelineListHeading, timelineList);

  const timeline = element(
    "section",
    "devtools-editor__pane devtools-editor__timeline",
  );
  configurePane(timeline, "timeline", true);
  timeline.setAttribute("aria-label", "Timeline inspector");
  const transport = element("div", "devtools-editor__transport");
  const transportHint = element(
    "p",
    "devtools-editor__transport-hint",
    "Scroll the page to preview",
  );
  transportHint.hidden = true;
  const transportSettings = element("div", "devtools-editor__transport-settings");
  transportSettings.classList.add("devtools-editor__transport-group");
  transportSettings.setAttribute("role", "group");
  transportSettings.setAttribute("aria-label", "Timeline actions");
  transportSettings.setAttribute("aria-hidden", "true");
  const jumpToTargetButton = createActionButton({
    action: "jump-to-scrolltrigger-target",
    accessibleLabel: "Jump to target",
    title: "Jump to target",
    icon: "jump-to-target",
    variants: ["devtools-editor__action--icon"],
  });
  jumpToTargetButton.hidden = true;
  const toggleMarkersButton = createActionButton({
    action: "toggle-scrolltrigger-markers",
    accessibleLabel: "Show ScrollTrigger markers",
    title: "Show ScrollTrigger markers",
    icon: "markers",
    variants: ["devtools-editor__action--icon"],
    pressed: false,
  });
  toggleMarkersButton.hidden = true;
  transportSettings.append(jumpToTargetButton, toggleMarkersButton);
  const speedSelect = element("select", "devtools-editor__speed");
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
    variants: ["devtools-editor__action--icon"],
    pressed: false,
  });
  const loopButton = createActionButton({
    action: "toggle-loop",
    accessibleLabel: "Loop",
    title: "Loop (L)",
    icon: "loop",
    variants: ["devtools-editor__action--icon"],
    pressed: false,
  });
  const playback = element("div", "devtools-editor__transport-group devtools-editor__playback");
  playback.setAttribute("role", "group");
  playback.setAttribute("aria-label", "Playback controls");
  const playButton = createActionButton({
    action: "toggle-play",
    accessibleLabel: "Play",
    variants: ["devtools-editor__action--primary"],
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
    variants: ["devtools-editor__action--icon"],
  });
  const clock = element("div", "devtools-editor__clock");
  const currentTime = element("output", "devtools-editor__time", "00:00.000");
  currentTime.dataset.role = "current-time";
  const separator = element("span", "devtools-editor__time-separator", "/");
  const duration = element("output", "devtools-editor__duration", "00:00.000");
  duration.dataset.role = "duration";
  clock.append(currentTime, separator, duration);
  const playbackActions = element("div", "devtools-editor__playback-actions");
  playbackActions.append(replayButton, playButton, loopButton, reverseButton);
  playback.append(playbackActions, clock, speedSelect);
  const viewportControls = element("div", "devtools-editor__transport-group devtools-editor__viewport-controls");
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
    variants: ["devtools-editor__action--icon"],
  });
  const zoomRange = element("input", "devtools-editor__zoom-range");
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
    variants: ["devtools-editor__action--icon"],
  });
  const zoomControl = element("div", "devtools-editor__zoom-control");
  zoomControl.append(zoomOutButton, zoomRange, zoomInButton);
  const timelineVisibilityButton = createActionButton({
    action: "toggle-timeline-visibility",
    accessibleLabel: "Hide timeline",
    title: "Hide timeline",
    icon: "timeline-visibility",
    variants: [
      "devtools-editor__action--icon",
      "devtools-editor__timeline-visibility",
    ],
    expanded: true,
    controls: "devtools-editor-timeline-body",
  });
  viewportControls.append(resetButton, zoomControl, timelineVisibilityButton);
  transport.append(transportSettings, playback, transportHint, viewportControls);

  const timelineBody = element("div", "devtools-editor__timeline-body");
  timelineBody.id = "devtools-editor-timeline-body";
  const trackLabels = element("div", "devtools-editor__track-labels");
  trackLabels.dataset.role = "track-labels";
  const timelineViewport = element("div", "devtools-editor__timeline-viewport");
  timelineViewport.dataset.role = "timeline-viewport";
  const timelineContent = element("div", "devtools-editor__timeline-content");
  timelineContent.dataset.role = "timeline-content";
  const ruler = element("div", "devtools-editor__ruler");
  ruler.dataset.role = "ruler";
  ruler.setAttribute("role", "img");
  const trackLanes = element("div", "devtools-editor__track-lanes");
  trackLanes.dataset.role = "track-lanes";
  const postDurationRegion = element("div", "devtools-editor__post-duration");
  postDurationRegion.dataset.role = "post-duration";
  postDurationRegion.hidden = true;
  postDurationRegion.setAttribute("aria-hidden", "true");
  const timelineEndMarker = element("div", "devtools-editor__timeline-end-marker");
  timelineEndMarker.dataset.role = "timeline-end-marker";
  timelineEndMarker.hidden = true;
  timelineEndMarker.setAttribute("role", "img");
  const playhead = element("div", "devtools-editor__playhead");
  playhead.dataset.role = "playhead";
  playhead.dataset.dragState = "idle";
  playhead.setAttribute("aria-label", "Timeline playhead");
  playhead.setAttribute("aria-valuemin", "0");
  playhead.setAttribute("aria-valuemax", "100");
  playhead.setAttribute("role", "slider");
  playhead.tabIndex = 0;
  const playheadProgress = element("span", "devtools-editor__playhead-progress", "0%");
  playheadProgress.hidden = true;
  playheadProgress.setAttribute("aria-hidden", "true");
  playhead.append(createPlayheadIcon(), playheadProgress);
  timelineContent.append(ruler, trackLanes, postDurationRegion, timelineEndMarker, playhead);
  timelineViewport.append(timelineContent);
  timelineBody.append(trackLabels, timelineViewport);
  timeline.append(transport, timelineBody);

  const inspectorPane = element(
    "aside",
    "devtools-editor__inspector",
  );
  inspectorPane.dataset.role = "inspector";
  inspectorPane.setAttribute("aria-label", "Track inspector");
  inspectorPane.hidden = true;
  const inspectorHeading = element("header", "devtools-editor__pane-heading");
  inspectorHeading.append(element("span", "devtools-editor__pane-heading-label", "Inspector"));
  const inspectorCloseButton = createActionButton({
    action: "close-inspector",
    accessibleLabel: "Close inspector",
    title: "Close inspector",
    icon: "close",
    variants: ["devtools-editor__inspector-close"],
  });
  inspectorHeading.append(inspectorCloseButton);
  const inspectorEmpty = element(
    "p",
    "devtools-editor__inspector-empty",
    "Select a track to inspect it.",
  );
  inspectorEmpty.dataset.role = "inspector-empty";
  const inspectorContent = element("div", "devtools-editor__inspector-content");
  inspectorContent.dataset.role = "inspector-content";
  inspectorContent.hidden = true;
  const inspectorActions = element("footer", "devtools-editor__inspector-actions");
  inspectorActions.hidden = true;
  const copyDebugButton = createActionButton({
    action: "copy-debug-json",
    label: "Copy debug JSON",
    variants: ["devtools-editor__copy-debug"],
  });
  copyDebugButton.disabled = true;
  const copyDebugStatus = element("output", "devtools-editor__copy-status");
  copyDebugStatus.dataset.role = "copy-debug-status";
  copyDebugStatus.id = "devtools-editor-copy-debug-status";
  copyDebugStatus.setAttribute("aria-live", "polite");
  copyDebugButton.setAttribute("aria-describedby", copyDebugStatus.id);
  inspectorActions.append(copyDebugButton, copyDebugStatus);
  inspectorPane.append(
    inspectorHeading,
    inspectorEmpty,
    inspectorContent,
    inspectorActions,
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
    inspectorCloseButton,
    timelineListToggle,
    inspectorContent,
    inspectorEmpty,
    inspectorActions,
    copyDebugButton,
    copyDebugStatus,
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
