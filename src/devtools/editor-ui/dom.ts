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
  readonly replayButton: HTMLButtonElement;
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
  const timelineListHeading = element("header", "devtools-editor__pane-heading", "Timelines");
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
  const timelineListToggle = action("Hide timelines", "toggle-timelines");
  timelineListToggle.classList.add("devtools-editor__timeline-list-toggle");
  timelineListToggle.setAttribute("aria-controls", "devtools-editor-pane-timelines");
  timelineListToggle.setAttribute("aria-expanded", "true");
  const playButton = action("Play", "toggle-play");
  playButton.classList.add("devtools-editor__action--primary");
  const replayButton = action("Replay", "replay");
  const clock = element("div", "devtools-editor__clock");
  const currentTime = element("output", "devtools-editor__time", "00:00.000");
  currentTime.dataset.role = "current-time";
  const separator = element("span", "devtools-editor__time-separator", "/");
  const duration = element("output", "devtools-editor__duration", "00:00.000");
  duration.dataset.role = "duration";
  clock.append(currentTime, separator, duration);
  transport.append(timelineListToggle, playButton, replayButton, clock);

  const timelineBody = element("div", "devtools-editor__timeline-body");
  const trackLabels = element("div", "devtools-editor__track-labels");
  trackLabels.dataset.role = "track-labels";
  const timelineViewport = element("div", "devtools-editor__timeline-viewport");
  timelineViewport.dataset.role = "timeline-viewport";
  const timelineContent = element("div", "devtools-editor__timeline-content");
  timelineContent.dataset.role = "timeline-content";
  const ruler = element("div", "devtools-editor__ruler");
  ruler.dataset.role = "ruler";
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
  const inspectorCloseButton = action("Close", "close-inspector");
  inspectorCloseButton.classList.add("devtools-editor__inspector-close");
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
    replayButton,
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
