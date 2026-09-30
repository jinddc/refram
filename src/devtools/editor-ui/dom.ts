export const EDITOR_TIMELINE_EDGE_GUTTER = 12;

export interface EditorUiElements {
  readonly root: HTMLElement;
  readonly heightSeparator: HTMLElement;
  readonly paneTabs: readonly HTMLButtonElement[];
  readonly timelineList: HTMLElement;
  readonly timelineListPane: HTMLElement;
  readonly timelinePane: HTMLElement;
  readonly inspectorPane: HTMLElement;
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

function action(label: string, name: string): HTMLButtonElement {
  const button = element("button", "devtools-editor__action", label);
  button.type = "button";
  button.dataset.action = name;
  return button;
}

function createTransportIcon(
  name: "play" | "pause" | "loop" | "reverse" | "replay" | "previous" | "close"
    | "zoom-out" | "zoom-in",
  pathData: string | readonly string[],
  viewBox = "0 0 16 16",
): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.classList.add("devtools-editor__transport-icon");
  svg.dataset.icon = name;
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("fill", "none");
  svg.setAttribute("role", "presentation");
  svg.setAttribute("aria-hidden", "true");
  for (const data of typeof pathData === "string" ? [pathData] : pathData) {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("data-follow-fill", "currentColor");
    path.setAttribute("d", data);
    path.setAttribute("fill", "currentColor");
    svg.append(path);
  }
  return svg;
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

function createPlayheadIcon(): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.classList.add("devtools-editor__playhead-icon");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "18");
  svg.setAttribute("viewBox", "0 0 12 18");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");

  const mask = document.createElementNS(namespace, "mask");
  mask.id = "devtools-editor-playhead-mask";
  mask.setAttribute("fill", "white");
  const maskPath = document.createElementNS(namespace, "path");
  maskPath.setAttribute(
    "d",
    "M0 3C0 1.34314 1.34315 0 3 0H9C10.6569 0 12 1.34315 12 3V11.8287C12 12.7494 11.5772 13.6191 10.8531 14.1879L6 18L1.14686 14.1879C0.422795 13.6191 0 12.7494 0 11.8287V3Z",
  );
  mask.append(maskPath);

  const background = maskPath.cloneNode() as SVGPathElement;
  background.classList.add("devtools-editor__playhead-icon-background");
  const border = document.createElementNS(namespace, "path");
  border.classList.add("devtools-editor__playhead-icon-border");
  border.setAttribute(
    "d",
    "M6 18L4.76457 19.5728L6 20.5432L7.23543 19.5728L6 18ZM1.14686 14.1879L-0.0885728 15.7607L1.14686 14.1879ZM10.8531 14.1879L12.0886 15.7607L10.8531 14.1879ZM3 2H9V-2H3V2ZM10 3V11.8287H14V3H10ZM2 11.8287V3H-2V11.8287H2ZM9.61771 12.6151L4.76457 16.4272L7.23543 19.5728L12.0886 15.7607L9.61771 12.6151ZM7.23543 16.4272L2.38228 12.6151L-0.0885728 15.7607L4.76457 19.5728L7.23543 16.4272ZM-2 11.8287C-2 13.3632 -1.29534 14.8128 -0.0885728 15.7607L2.38228 12.6151C2.14093 12.4255 2 12.1356 2 11.8287H-2ZM10 11.8287C10 12.1356 9.85907 12.4255 9.61771 12.6151L12.0886 15.7607C13.2953 14.8128 14 13.3632 14 11.8287H10ZM9 2C9.55228 2 10 2.44772 10 3H14C14 0.238577 11.7614 -2 9 -2V2ZM3 -2C0.238579 -2 -2 0.23857 -2 3H2C2 2.44771 2.44771 2 3 2V-2Z",
  );
  border.setAttribute("mask", "url(#devtools-editor-playhead-mask)");
  svg.append(mask, background, border);
  return svg;
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
  const timelineListToggle = action("", "toggle-timelines");
  timelineListToggle.classList.add(
    "devtools-editor__timeline-list-toggle",
    "devtools-editor__action--compact",
  );
  timelineListToggle.setAttribute("aria-controls", "devtools-editor-pane-timelines");
  timelineListToggle.setAttribute("aria-expanded", "true");
  timelineListToggle.setAttribute("aria-label", "Hide timelines pane");
  timelineListToggle.title = "Hide timelines pane";
  timelineListToggle.append(createTransportIcon(
    "previous",
    "m 12 2 c 0 -0.265625 -0.105469 -0.519531 -0.292969 -0.707031 c -0.390625 -0.390625 -1.023437 -0.390625 -1.414062 0 l -6 6 c -0.1875 0.1875 -0.292969 0.441406 -0.292969 0.707031 s 0.105469 0.519531 0.292969 0.707031 l 6 6 c 0.390625 0.390625 1.023437 0.390625 1.414062 0 c 0.1875 -0.1875 0.292969 -0.441406 0.292969 -0.707031 s -0.105469 -0.519531 -0.292969 -0.707031 l -5.292969 -5.292969 l 5.292969 -5.292969 c 0.1875 -0.1875 0.292969 -0.441406 0.292969 -0.707031 z m 0 0",
  ));
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
  const transportSettings = element("div", "devtools-editor__transport-settings");
  const speedSelect = element("select", "devtools-editor__speed");
  speedSelect.dataset.action = "set-speed";
  speedSelect.setAttribute("aria-label", "Playback speed");
  for (const speed of [0.1, 0.25, 0.5, 1, 2]) {
    const option = element("option", "", `${speed}×`);
    option.value = String(speed);
    if (speed === 1) option.selected = true;
    speedSelect.append(option);
  }
  const reverseButton = action("", "toggle-reverse");
  reverseButton.classList.add("devtools-editor__action--icon");
  reverseButton.setAttribute("aria-label", "Reverse");
  reverseButton.title = "Reverse (R)";
  reverseButton.setAttribute("aria-pressed", "false");
  reverseButton.append(createTransportIcon(
    "reverse",
    "m 12 1 c -0.265625 0 -0.519531 0.105469 -0.707031 0.292969 c -0.390625 0.390625 -0.390625 1.023437 0 1.414062 l 1.292969 1.292969 h -7.585938 c -0.550781 0 -1 0.449219 -1 1 s 0.449219 1 1 1 h 7.585938 l -1.292969 1.292969 c -0.390625 0.390625 -0.390625 1.023437 0 1.414062 s 1.023437 0.390625 1.414062 0 l 3 -3 c 0.390625 -0.390625 0.390625 -1.023437 0 -1.414062 l -3 -3 c -0.1875 -0.1875 -0.441406 -0.292969 -0.707031 -0.292969 z m -8 6 c -0.257812 0 -0.511719 0.097656 -0.707031 0.292969 l -3 3 c -0.3906252 0.390625 -0.3906252 1.023437 0 1.414062 l 3 3 c 0.1875 0.1875 0.441406 0.292969 0.707031 0.292969 s 0.519531 -0.105469 0.707031 -0.292969 c 0.390625 -0.390625 0.390625 -1.023437 0 -1.414062 l -1.292969 -1.292969 h 7.585938 c 0.550781 0 1 -0.449219 1 -1 s -0.449219 -1 -1 -1 h -7.585938 l 1.292969 -1.292969 c 0.390625 -0.390625 0.390625 -1.023437 0 -1.414062 c -0.195312 -0.195313 -0.449219 -0.292969 -0.707031 -0.292969 z m 0 0",
  ));
  const loopButton = action("", "toggle-loop");
  loopButton.classList.add("devtools-editor__action--icon");
  loopButton.setAttribute("aria-label", "Loop");
  loopButton.title = "Loop (L)";
  loopButton.setAttribute("aria-pressed", "false");
  loopButton.append(createTransportIcon(
    "loop",
    "m 8 1 v 2 h -4 c -2.199219 0 -4 1.800781 -4 4 v 2 c 0 1.019531 0.386719 1.964844 1.019531 2.671875 c 0.367188 0.410156 1 0.445313 1.410157 0.078125 c 0.414062 -0.367188 0.449218 -1 0.078124 -1.414062 c -0.316406 -0.351563 -0.507812 -0.8125 -0.507812 -1.335938 v -2 c 0 -1.125 0.875 -2 2 -2 h 4 v 2 h 1 v -0.007812 c 0.265625 0.003906 0.519531 -0.101563 0.707031 -0.285157 l 2 -2 c 0.390625 -0.390625 0.390625 -1.023437 0 -1.414062 l -2 -2 c -0.1875 -0.183594 -0.441406 -0.289063 -0.707031 -0.285157 v -0.007812 z m 6.289062 3 c -0.265624 -0.011719 -0.523437 0.078125 -0.71875 0.257812 c -0.414062 0.367188 -0.449218 1 -0.078124 1.410157 c 0.316406 0.355469 0.507812 0.816406 0.507812 1.339843 v 2 c 0 1.125 -0.875 2 -2 2 h -4 v -2.007812 h -1 v 0.007812 c -0.265625 -0.003906 -0.519531 0.101563 -0.707031 0.285157 l -2 2 c -0.390625 0.390625 -0.390625 1.023437 0 1.414062 l 2 2 c 0.1875 0.183594 0.441406 0.289063 0.707031 0.285157 v 0.007812 h 1 v -1.992188 h 4 c 2.199219 0 4 -1.804687 4 -4 v -2 c 0 -1.023437 -0.386719 -1.96875 -1.019531 -2.675781 c -0.175781 -0.199219 -0.425781 -0.316406 -0.691407 -0.332031 z m 0 0",
  ));
  const playback = element("div", "devtools-editor__transport-group devtools-editor__playback");
  playback.setAttribute("role", "group");
  playback.setAttribute("aria-label", "Playback controls");
  const playButton = action("", "toggle-play");
  playButton.classList.add("devtools-editor__action--primary");
  playButton.setAttribute("aria-label", "Play");
  const playIcon = createTransportIcon(
    "play",
    "m 2 2.5 v 11 c 0 1.5 1.269531 1.492188 1.269531 1.492188 h 0.128907 c 0.246093 0.003906 0.488281 -0.050782 0.699218 -0.171876 l 9.796875 -5.597656 c 0.433594 -0.242187 0.65625 -0.734375 0.65625 -1.226562 c 0 -0.492188 -0.222656 -0.984375 -0.65625 -1.222656 l -9.796875 -5.597657 c -0.210937 -0.121093 -0.453125 -0.175781 -0.699218 -0.175781 h -0.128907 s -1.269531 0 -1.269531 1.5 z m 0 0",
  );
  const pauseIcon = createTransportIcon(
    "pause",
    [
      "m 3 1 h 3 c 0.550781 0 1 0.449219 1 1 v 12 c 0 0.550781 -0.449219 1 -1 1 h -3 c -0.550781 0 -1 -0.449219 -1 -1 v -12 c 0 -0.550781 0.449219 -1 1 -1 z m 0 0",
      "m 10 1 h 3 c 0.550781 0 1 0.449219 1 1 v 12 c 0 0.550781 -0.449219 1 -1 1 h -3 c -0.550781 0 -1 -0.449219 -1 -1 v -12 c 0 -0.550781 0.449219 -1 1 -1 z m 0 0",
    ],
  );
  pauseIcon.setAttribute("hidden", "");
  playButton.append(playIcon, pauseIcon);
  const replayButton = action("", "replay");
  replayButton.classList.add("devtools-editor__action--icon");
  replayButton.setAttribute("aria-label", "Replay");
  replayButton.title = "Replay";
  replayButton.append(createTransportIcon("replay", [
    "m 15 3 v 10 c 0 1 -1.085938 1 -1.085938 1 h -0.113281 c -0.210937 0 -0.417969 -0.046875 -0.601562 -0.148438 l -8.398438 -4.800781 c -0.375 -0.207031 -0.5625 -0.628906 -0.5625 -1.050781 s 0.1875 -0.84375 0.5625 -1.050781 l 8.398438 -4.800781 c 0.183593 -0.101563 0.390625 -0.148438 0.601562 -0.148438 h 0.113281 s 1.085938 0 1.085938 1 z m 0 0",
    "m 1.5 2 h 1 c 0.277344 0 0.5 0.222656 0.5 0.5 v 11 c 0 0.277344 -0.222656 0.5 -0.5 0.5 h -1 c -0.277344 0 -0.5 -0.222656 -0.5 -0.5 v -11 c 0 -0.277344 0.222656 -0.5 0.5 -0.5 z m 0 0",
  ]));
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
  const resetButton = action("Reset", "reset-timeline-zoom");
  resetButton.setAttribute("aria-label", "Reset timeline zoom");
  resetButton.title = "Fit timeline (F)";
  const zoomOutButton = action("", "zoom-out");
  zoomOutButton.classList.add("devtools-editor__action--icon");
  zoomOutButton.setAttribute("aria-label", "Zoom out timeline");
  zoomOutButton.title = "Zoom out timeline";
  zoomOutButton.append(createTransportIcon("zoom-out", [
    "M4 11C4 7.13401 7.13401 4 11 4C14.866 4 18 7.13401 18 11C18 14.866 14.866 18 11 18C7.13401 18 4 14.866 4 11ZM11 2C6.02944 2 2 6.02944 2 11C2 15.9706 6.02944 20 11 20C13.125 20 15.078 19.2635 16.6177 18.0319L20.2929 21.7071C20.6834 22.0976 21.3166 22.0976 21.7071 21.7071C22.0976 21.3166 22.0976 20.6834 21.7071 20.2929L18.0319 16.6177C19.2635 15.078 20 13.125 20 11C20 6.02944 15.9706 2 11 2Z",
    "M7 11C7 10.4477 7.44772 10 8 10H14C14.5523 10 15 10.4477 15 11C15 11.5523 14.5523 12 14 12H8C7.44772 12 7 11.5523 7 11Z",
  ], "0 0 24 24"));
  const zoomRange = element("input", "devtools-editor__zoom-range");
  zoomRange.type = "range";
  zoomRange.step = "0.05";
  zoomRange.value = "1";
  zoomRange.dataset.role = "zoom-range";
  zoomRange.setAttribute("aria-label", "Timeline zoom");
  const zoomInButton = action("", "zoom-in");
  zoomInButton.classList.add("devtools-editor__action--icon");
  zoomInButton.setAttribute("aria-label", "Zoom in timeline");
  zoomInButton.title = "Zoom in timeline";
  zoomInButton.append(createTransportIcon("zoom-in", [
    "M4 11C4 7.13401 7.13401 4 11 4C14.866 4 18 7.13401 18 11C18 14.866 14.866 18 11 18C7.13401 18 4 14.866 4 11ZM11 2C6.02944 2 2 6.02944 2 11C2 15.9706 6.02944 20 11 20C13.125 20 15.078 19.2635 16.6177 18.0319L20.2929 21.7071C20.6834 22.0976 21.3166 22.0976 21.7071 21.7071C22.0976 21.3166 22.0976 20.6834 21.7071 20.2929L18.0319 16.6177C19.2635 15.078 20 13.125 20 11C20 6.02944 15.9706 2 11 2Z",
    "M10 14C10 14.5523 10.4477 15 11 15C11.5523 15 12 14.5523 12 14V12H14C14.5523 12 15 11.5523 15 11C15 10.4477 14.5523 10 14 10H12V8C12 7.44772 11.5523 7 11 7C10.4477 7 10 7.44772 10 8V10H8C7.44772 10 7 10.4477 7 11C7 11.5523 7.44772 12 8 12H10V14Z",
  ], "0 0 24 24"));
  const zoomControl = element("div", "devtools-editor__zoom-control");
  zoomControl.append(zoomOutButton, zoomRange, zoomInButton);
  viewportControls.append(resetButton, zoomControl);
  transport.append(transportSettings, playback, viewportControls);

  const timelineBody = element("div", "devtools-editor__timeline-body");
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
  playhead.append(createPlayheadIcon());
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
  inspectorHeading.append(element("span", "devtools-editor__pane-heading-label", "Properties"));
  const inspectorCloseButton = action("", "close-inspector");
  inspectorCloseButton.classList.add("devtools-editor__inspector-close");
  inspectorCloseButton.setAttribute("aria-label", "Close inspector");
  inspectorCloseButton.title = "Close inspector";
  inspectorCloseButton.append(createTransportIcon(
    "close",
    "m 3 2 c -0.265625 0 -0.519531 0.105469 -0.707031 0.292969 c -0.390625 0.390625 -0.390625 1.023437 0 1.414062 l 4.292969 4.292969 l -4.292969 4.292969 c -0.390625 0.390625 -0.390625 1.023437 0 1.414062 s 1.023437 0.390625 1.414062 0 l 4.292969 -4.292969 l 4.292969 4.292969 c 0.390625 0.390625 1.023437 0.390625 1.414062 0 s 0.390625 -1.023437 0 -1.414062 l -4.292969 -4.292969 l 4.292969 -4.292969 c 0.390625 -0.390625 0.390625 -1.023437 0 -1.414062 c -0.1875 -0.1875 -0.441406 -0.292969 -0.707031 -0.292969 s -0.519531 0.105469 -0.707031 0.292969 l -4.292969 4.292969 l -4.292969 -4.292969 c -0.1875 -0.1875 -0.441406 -0.292969 -0.707031 -0.292969 z m 0 0",
  ));
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
  inspectorPane.append(inspectorHeading, inspectorEmpty, inspectorContent);

  workspace.append(timelineListPane, timeline, inspectorPane);
  root.append(heightSeparator, paneSwitcher, workspace);

  return {
    root,
    heightSeparator,
    paneTabs,
    timelineList,
    timelineListPane,
    timelinePane: timeline,
    inspectorPane,
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
    timelineViewport,
  };
}
