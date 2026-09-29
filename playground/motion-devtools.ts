import type { gsap } from "gsap";
import {
  attachGsapTimelineSession,
  type TimelineInspectionItem,
  type TimelineInspectionSnapshot,
  type TimelineSessionAttachment,
} from "../src/devtools/timeline-session";
import {
  defaultTimelineRegistry,
  type MotionTimelineRegistration,
  type MotionTimelineRegistry,
  type MotionTimelineRegistrySnapshot,
} from "../src/devtools/timeline-registry";

const DEFAULT_TIMELINE_RATIO = 0.38;
const MIN_PREVIEW_HEIGHT = 280;
const MIN_TIMELINE_HEIGHT = 240;
const DIVIDER_HEIGHT = 46;
const BASE_TIMELINE_WIDTH = 760;
const SPLIT_STORAGE_KEY = "motion-lab-devtools-timeline-ratio";

export interface MotionDevToolsOptions {
  readonly registry?: MotionTimelineRegistry;
  readonly initialTimelineId?: string;
}

export interface MotionDevToolsHandle {
  readonly activeTimelineId: string | undefined;
  setActiveTimeline(id: string): boolean;
  destroy(): void;
}

interface MountedTimelineEditor {
  activate(registration: MotionTimelineRegistration | undefined): void;
  setTimelineOptions(
    registrations: readonly MotionTimelineRegistration[],
    activeTimelineId: string | undefined,
  ): void;
  destroy(): void;
}

interface EditorElements {
  root: HTMLElement;
  previewPane: HTMLElement;
  previewSurface: HTMLElement;
  divider: HTMLElement;
  timelineSelect: HTMLSelectElement;
  playButton: HTMLButtonElement;
  time: HTMLOutputElement;
  duration: HTMLOutputElement;
  driver: HTMLElement;
  readiness: HTMLElement;
  scale: HTMLSelectElement;
  zoom: HTMLInputElement;
  labels: HTMLElement;
  ruler: HTMLElement;
  lanes: HTMLElement;
  trackContent: HTMLElement;
  playhead: HTMLElement;
  inspector: HTMLElement;
  inspectorContent: HTMLElement;
  loopButton: HTMLButtonElement;
  collapseButton: HTMLButtonElement;
}

interface EditorState {
  destroyed: boolean;
  replaying: boolean;
  control?: MotionTimelineRegistration;
  timeline?: gsap.core.Timeline;
  controlSubscription?: () => void;
  previewRoot?: HTMLElement;
  attachment?: TimelineSessionAttachment;
  snapshot?: TimelineInspectionSnapshot;
  pendingSnapshot?: TimelineInspectionSnapshot;
  renderFrame?: number;
  resizeFrame?: number;
  resizePointer?: number;
  pendingTimelineHeight?: number;
  timelineHeight: number;
  zoom: number;
  looping: boolean;
  collapsed: boolean;
  selected?: gsap.core.Animation;
  selectedTrackId?: string;
  selectedSources: readonly Element[];
  renderedItems?: readonly TimelineInspectionItem[];
  blocks: Map<gsap.core.Animation, HTMLElement>;
  originalParent?: Node;
  originalNextSibling?: Node | null;
  elements: EditorElements;
}

const EMPTY_TIMELINE_SNAPSHOT: TimelineInspectionSnapshot = Object.freeze({
  driver: "manual",
  readiness: "empty",
  playState: "idle",
  progress: 0,
  timeScale: 1,
  reversed: false,
  totalDuration: 0,
  items: Object.freeze([]),
});

function createElement<K extends keyof HTMLElementTagNameMap>(
  name: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(name);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createButton(
  text: string,
  action: string,
  className = "motion-editor__button",
): HTMLButtonElement {
  const button = createElement("button", className, text);
  button.type = "button";
  button.dataset.action = action;
  return button;
}

function createEditorElements(): EditorElements {
  const root = createElement("section", "motion-editor");
  root.dataset.motionEditor = "";
  root.tabIndex = -1;

  const previewPane = createElement("section", "motion-editor__preview-pane");
  previewPane.setAttribute("aria-label", "Motion preview");
  const previewSurface = createElement("div", "motion-editor__preview-surface");
  previewSurface.dataset.role = "preview-surface";

  const inspectorToggle = createButton(
    "Inspector",
    "show-details",
    "motion-editor__inspector-toggle",
  );
  previewPane.append(previewSurface, inspectorToggle);

  const dividerRow = createElement("div", "motion-editor__divider");
  const divider = createElement("div", "motion-editor__splitter");
  divider.dataset.role = "splitter";
  divider.tabIndex = 0;
  divider.setAttribute("role", "separator");
  divider.setAttribute("aria-label", "Resize preview and timeline");
  divider.setAttribute("aria-orientation", "horizontal");
  divider.setAttribute("aria-valuemin", "20");
  divider.setAttribute("aria-valuemax", "70");

  const dividerLead = createElement("label", "motion-editor__divider-lead");
  const timelineLabel = createElement("span", "motion-editor__timeline-select-label", "Timeline");
  const timelineSelect = createElement("select", "motion-editor__timeline-select");
  timelineSelect.dataset.role = "timeline-selector";
  timelineSelect.setAttribute("aria-label", "Active timeline");
  dividerLead.append(timelineLabel, timelineSelect);

  const transport = createElement("div", "motion-editor__transport");
  const playButton = createButton("Play", "toggle-play", "motion-editor__play");
  const time = createElement("output", "motion-editor__time", "00:00.000");
  time.dataset.role = "time";
  const separator = createElement("span", "motion-editor__time-separator", "/");
  const duration = createElement("output", "motion-editor__duration", "00:00.000");
  duration.dataset.role = "duration";
  transport.append(playButton, time, separator, duration);

  const rightTools = createElement("div", "motion-editor__divider-tools motion-editor__divider-tools--right");
  const loopButton = createButton("Loop", "toggle-loop");
  loopButton.setAttribute("aria-pressed", "false");
  loopButton.setAttribute("aria-label", "Enable loop");
  const scale = createElement("select", "motion-editor__select");
  scale.setAttribute("aria-label", "Playback speed");
  for (const value of [0.1, 0.25, 0.5, 1, 2]) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = `${value}x`;
    if (value === 1) option.selected = true;
    scale.append(option);
  }
  const zoom = createElement("input", "motion-editor__zoom");
  zoom.type = "range";
  zoom.min = "100";
  zoom.max = "500";
  zoom.step = "25";
  zoom.value = "100";
  zoom.setAttribute("aria-label", "Timeline zoom");
  const collapseButton = createButton("Hide", "toggle-timeline");
  collapseButton.setAttribute("aria-expanded", "true");
  collapseButton.setAttribute("aria-label", "Hide timeline");
  rightTools.append(loopButton, scale, zoom, collapseButton);
  dividerRow.append(divider, dividerLead, transport, rightTools);

  const timelinePane = createElement("section", "motion-editor__timeline-pane");
  timelinePane.setAttribute("aria-label", "Timeline editor");
  const status = createElement("div", "motion-editor__timeline-status");
  const driver = createElement("span", "motion-editor__status-value", "manual");
  driver.dataset.role = "driver";
  const readiness = createElement("span", "motion-editor__status-value", "empty");
  readiness.dataset.role = "readiness";
  status.append(
    createElement("span", "motion-editor__status-label", "Driver"),
    driver,
    createElement("span", "motion-editor__status-label", "State"),
    readiness,
  );

  const editorBody = createElement("div", "motion-editor__timeline-body");
  const labels = createElement("div", "motion-editor__track-labels");
  labels.append(createElement("div", "motion-editor__track-heading", "Tracks"));
  const trackViewport = createElement("div", "motion-editor__track-viewport");
  trackViewport.dataset.role = "track-viewport";
  const trackContent = createElement("div", "motion-editor__track-content");
  const ruler = createElement("div", "motion-editor__ruler");
  ruler.dataset.role = "ruler";
  const lanes = createElement("div", "motion-editor__lanes");
  lanes.dataset.role = "lanes";
  const playhead = createElement("div", "motion-editor__playhead");
  playhead.dataset.role = "playhead";
  playhead.setAttribute("aria-hidden", "true");
  trackContent.append(ruler, lanes, playhead);
  trackViewport.append(trackContent);
  editorBody.append(labels, trackViewport);
  timelinePane.append(status, editorBody);

  const inspector = createElement("aside", "motion-editor__inspector");
  inspector.dataset.role = "inspector";
  inspector.hidden = true;
  const inspectorHeading = createElement("div", "motion-editor__inspector-heading");
  inspectorHeading.append(
    createElement("h2", "motion-editor__inspector-title", "Inspector"),
    createButton("Close", "close-inspector", "motion-editor__button"),
  );
  const inspectorContent = createElement("div", "motion-editor__inspector-content", "Select a motion block.");
  inspector.append(inspectorHeading, inspectorContent);

  root.append(previewPane, dividerRow, timelinePane, inspector);
  return {
    root,
    previewPane,
    previewSurface,
    divider,
    timelineSelect,
    playButton,
    time,
    duration,
    driver,
    readiness,
    scale,
    zoom,
    labels,
    ruler,
    lanes,
    trackContent,
    playhead,
    inspector,
    inspectorContent,
    loopButton,
    collapseButton,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const milliseconds = Math.floor((safe % 1) * 1000);
  return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function formatRulerTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  if (safe < 10) return `${safe.toFixed(1)}s`;
  if (safe < 60) return `${Math.round(safe)}s`;
  return `${Math.floor(safe / 60)}m ${Math.round(safe % 60)}s`;
}

function displayDuration(state: EditorState, snapshot: TimelineInspectionSnapshot): number {
  const timeline = state.timeline;
  if (timeline?.repeat() === -1) {
    const cycleDuration = timeline.duration();
    if (Number.isFinite(cycleDuration) && cycleDuration > 0) return cycleDuration;
  }
  return snapshot.totalDuration;
}

function displayProgress(state: EditorState, snapshot: TimelineInspectionSnapshot): number {
  const timeline = state.timeline;
  if (timeline?.repeat() === -1) {
    const cycleDuration = timeline.duration();
    if (Number.isFinite(cycleDuration) && cycleDuration > 0) {
      return clamp(timeline.time() / cycleDuration, 0, 1);
    }
  }
  return clamp(snapshot.progress, 0, 1);
}

function sourceLabel(source: Element): string {
  return source.id ? `#${source.id}` : source.localName;
}

function itemLabel(item: TimelineInspectionItem): string {
  if (item.label) return item.label;
  const label = sourceLabel(item.source);
  return item.sources.length > 1 ? `${label} × ${item.sources.length}` : label;
}

function readStoredRatio(): number {
  try {
    const value = Number(sessionStorage.getItem(SPLIT_STORAGE_KEY));
    return Number.isFinite(value) ? clamp(value, 0.2, 0.7) : DEFAULT_TIMELINE_RATIO;
  } catch {
    return DEFAULT_TIMELINE_RATIO;
  }
}

function writeStoredRatio(value: number): void {
  try {
    sessionStorage.setItem(SPLIT_STORAGE_KEY, String(value));
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

function workspaceHeight(root: HTMLElement): number {
  return root.getBoundingClientRect().height || globalThis.innerHeight || 800;
}

function applyTimelineHeight(state: EditorState, value: number, persist = false): void {
  const height = workspaceHeight(state.elements.root);
  const maximum = Math.max(
    MIN_TIMELINE_HEIGHT,
    height - MIN_PREVIEW_HEIGHT - DIVIDER_HEIGHT,
  );
  state.timelineHeight = clamp(value, MIN_TIMELINE_HEIGHT, maximum);
  state.elements.root.style.setProperty(
    "--motion-editor-timeline-height",
    `${state.timelineHeight}px`,
  );
  const ratio = clamp(state.timelineHeight / height, 0.2, 0.7);
  state.elements.divider.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
  state.elements.divider.setAttribute("aria-valuetext", `${Math.round(ratio * 100)}% timeline`);
  if (persist) writeStoredRatio(ratio);
}

function resetSplit(state: EditorState): void {
  applyTimelineHeight(
    state,
    workspaceHeight(state.elements.root) * DEFAULT_TIMELINE_RATIO,
    true,
  );
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "function") return "[Function]";
  if (Array.isArray(value)) return "[Array]";
  if (value && typeof value === "object") return "[Object]";
  return String(value);
}

function safeEntries(value: unknown): readonly [string, unknown][] {
  if (!value || typeof value !== "object") return [];
  try {
    return Object.entries(Object.getOwnPropertyDescriptors(value)).map(
      ([name, descriptor]) => [
        name,
        "value" in descriptor ? descriptor.value : "[Accessor]",
      ],
    );
  } catch {
    return [["Value", "[Unavailable]"]];
  }
}

function appendFacts(
  container: HTMLElement,
  title: string,
  values: readonly [string, unknown][],
): void {
  const section = createElement("section", "motion-editor__inspector-section");
  section.append(createElement("h3", "motion-editor__inspector-section-title", title));
  const list = createElement("dl", "motion-editor__facts");
  for (const [name, value] of values) {
    list.append(
      createElement("dt", "motion-editor__fact-name", name),
      createElement("dd", "motion-editor__fact-value", formatValue(value)),
    );
  }
  section.append(list);
  container.append(section);
}

function renderInspector(state: EditorState): void {
  const item = state.snapshot?.items.find(({ animation }) => animation === state.selected);
  state.elements.inspectorContent.replaceChildren();
  if (!item) {
    state.elements.inspectorContent.textContent = "Select a motion block.";
    return;
  }

  appendFacts(state.elements.inspectorContent, "Identity", [
    ["Source", sourceLabel(item.source)],
    ["Index", item.index],
    ["Tweens", item.animations.length],
    ["Animated targets", item.animatedTargetCount],
    ["Runnable", item.runnable ? "Yes" : "No"],
  ]);
  appendFacts(state.elements.inspectorContent, "Timing", [
    ["Authored", item.authoredPosition ?? "append"],
    ["Start", item.resolvedStart === null ? "Unavailable" : `${item.resolvedStart}s`],
    ["Duration", item.resolvedDuration === null ? "Unavailable" : `${item.resolvedDuration}s`],
    ["Ease", item.authoredEase ?? "Inherited"],
  ]);
  appendFacts(state.elements.inspectorContent, "From", safeEntries(item.from));
  appendFacts(state.elements.inspectorContent, "To", safeEntries(item.to));
}

function selectItem(state: EditorState, item: TimelineInspectionItem | undefined): void {
  for (const source of state.selectedSources) {
    source.removeAttribute("data-motion-editor-selected");
  }
  state.selected = item?.animation;
  state.selectedTrackId = item?.trackId;
  state.selectedSources = item?.sources ?? [];
  for (const source of state.selectedSources) {
    source.setAttribute("data-motion-editor-selected", "true");
  }
  for (const [candidate, block] of state.blocks) {
    const selected = candidate === state.selected;
    block.dataset.selected = String(selected);
    block.setAttribute("aria-pressed", String(selected));
  }
  renderInspector(state);
}

function renderRuler(state: EditorState): void {
  const duration = state.snapshot ? displayDuration(state, state.snapshot) : 0;
  state.elements.ruler.replaceChildren();
  const divisions = 6;
  for (let index = 0; index <= divisions; index += 1) {
    const tick = createElement("span", "motion-editor__tick");
    tick.style.left = `${(index / divisions) * 100}%`;
    tick.textContent = formatRulerTime((duration * index) / divisions);
    state.elements.ruler.append(tick);
  }
}

function renderTracks(state: EditorState, snapshot: TimelineInspectionSnapshot): void {
  state.blocks.clear();
  state.elements.lanes.replaceChildren();
  const totalDuration = displayDuration(state, snapshot);
  const viewportWidth = state.elements.trackContent.parentElement?.clientWidth ?? 0;
  const timelineWidth = Math.max(BASE_TIMELINE_WIDTH, viewportWidth) * (state.zoom / 100);
  state.elements.trackContent.style.width = `${timelineWidth}px`;
  state.elements.labels.replaceChildren(createElement("div", "motion-editor__track-heading", "Tracks"));

  if (snapshot.items.length === 0) {
    const emptyLabel = createElement("div", "motion-editor__track-label motion-editor__track-label--empty", "No tracks");
    const emptyLane = createElement("div", "motion-editor__lane motion-editor__lane--empty", "No animation tracks are available.");
    state.elements.labels.append(emptyLabel);
    state.elements.lanes.append(emptyLane);
  }

  for (const item of snapshot.items) {
    const label = createElement("button", "motion-editor__track-label", itemLabel(item));
    label.type = "button";
    label.dataset.sourceIndex = String(item.index);
    const lane = createElement("div", "motion-editor__lane");
    lane.dataset.sourceIndex = String(item.index);
    const block = createElement("button", "motion-editor__block", itemLabel(item));
    block.type = "button";
    block.dataset.sourceIndex = String(item.index);
    block.dataset.selected = String(item.animation === state.selected);
    block.setAttribute("aria-pressed", String(item.animation === state.selected));

    if (
      item.resolvedStart === null ||
      item.resolvedDuration === null ||
      totalDuration <= 0
    ) {
      block.dataset.available = "false";
      block.style.left = "8px";
      block.style.width = "148px";
    } else {
      block.dataset.available = "true";
      block.style.left = `${(item.resolvedStart / totalDuration) * 100}%`;
      block.style.width = `${Math.max(2, (item.resolvedDuration / totalDuration) * 100)}%`;
    }
    lane.append(block);
    state.elements.labels.append(label);
    state.elements.lanes.append(lane);
    state.blocks.set(item.animation, block);
  }

  state.renderedItems = snapshot.items;
  const selectedItem = snapshot.items.find((item) => (
    item.trackId !== undefined && item.trackId === state.selectedTrackId
  ))
    ?? snapshot.items.find(({ animation }) => animation === state.selected)
    ?? snapshot.items[0];
  selectItem(state, selectedItem);
  renderRuler(state);
}

function updateProgress(state: EditorState, snapshot: TimelineInspectionSnapshot): void {
  const progress = displayProgress(state, snapshot);
  const duration = displayDuration(state, snapshot);
  state.elements.root.style.setProperty("--motion-editor-progress", String(progress));
  state.elements.time.value = formatTime(progress * duration);
  state.elements.time.textContent = state.elements.time.value;
  state.elements.duration.value = formatTime(duration);
  state.elements.duration.textContent = state.elements.duration.value;
  state.elements.driver.textContent = snapshot.driver;
  state.elements.readiness.textContent = snapshot.readiness;
  state.elements.playButton.textContent = snapshot.playState === "running" ? "Pause" : "Play";
  state.elements.scale.value = String(snapshot.timeScale);
  const transportAvailable = snapshot.driver === "manual" && snapshot.readiness === "ready";
  const unavailableReason = snapshot.driver === "scroll"
    ? "ScrollTrigger owns timeline progress."
    : "Timeline transport is not ready.";
  const transportActions = new Set([
    "toggle-play",
    "toggle-loop",
  ]);
  for (const button of state.elements.root.querySelectorAll<HTMLButtonElement>("button[data-action]")) {
    if (!transportActions.has(button.dataset.action ?? "")) continue;
    button.disabled = !transportAvailable;
    button.title = transportAvailable ? "" : unavailableReason;
  }
  state.elements.scale.disabled = !transportAvailable;
  state.elements.scale.title = transportAvailable ? "" : unavailableReason;

  for (const [animation, block] of state.blocks) {
    const item = snapshot.items.find((candidate) => candidate.animation === animation);
    const active = Boolean(
      item &&
      item.resolvedStart !== null &&
      item.resolvedEnd !== null &&
      progress * duration >= item.resolvedStart &&
      progress * duration <= item.resolvedEnd,
    );
    block.dataset.active = String(active);
  }

  if (
    state.looping &&
    !state.replaying &&
    progress >= 1 &&
    (snapshot.playState === "running" || snapshot.playState === "finished")
  ) {
    const replayed = replayTimeline(state);
    if (replayed) void replayed.play();
  }
}

function renderSnapshot(state: EditorState, snapshot: TimelineInspectionSnapshot): void {
  if (state.destroyed) return;
  state.snapshot = snapshot;
  if (snapshot.items !== state.renderedItems) renderTracks(state, snapshot);
  updateProgress(state, snapshot);
}

function scheduleSnapshot(state: EditorState, snapshot: TimelineInspectionSnapshot): void {
  if (state.destroyed) return;
  if (!state.snapshot || typeof requestAnimationFrame !== "function") {
    renderSnapshot(state, snapshot);
    return;
  }
  state.pendingSnapshot = snapshot;
  if (state.renderFrame !== undefined) return;
  state.renderFrame = requestAnimationFrame(() => {
    state.renderFrame = undefined;
    const pending = state.pendingSnapshot;
    state.pendingSnapshot = undefined;
    if (pending) renderSnapshot(state, pending);
  });
}

function attachTimeline(state: EditorState): void {
  if (!state.timeline) return;
  state.attachment = attachGsapTimelineSession(
    state.timeline,
    (snapshot) => scheduleSnapshot(state, snapshot),
    state.control?.tracks,
  );
}

function reportConnectionError(state: EditorState, error: unknown): void {
  state.elements.root.dataset.connectionState = "error";
  state.elements.readiness.textContent = "error";
  state.elements.playButton.disabled = true;
  state.elements.playButton.title = error instanceof Error
    ? error.message
    : "Timeline replay failed.";
}

function replayTimeline(state: EditorState): gsap.core.Timeline | undefined {
  if (state.destroyed || state.replaying || !state.control) return undefined;
  state.replaying = true;

  try {
    return state.control.replay();
  } catch (error) {
    reportConnectionError(state, error);
    return undefined;
  } finally {
    state.replaying = false;
  }
}

function seekByPointer(state: EditorState, event: PointerEvent): void {
  if (state.snapshot?.driver !== "manual" || state.snapshot.readiness !== "ready") return;
  const rect = state.elements.trackContent.getBoundingClientRect();
  if (rect.width <= 0) return;
  const progress = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  if (state.timeline?.repeat() === -1) {
    const cycleDuration = state.timeline.duration();
    if (Number.isFinite(cycleDuration) && cycleDuration > 0) {
      state.timeline.pause().totalTime(progress * cycleDuration, true);
      if (state.attachment) scheduleSnapshot(state, state.attachment.read());
      return;
    }
  }
  state.attachment?.seek(progress);
}

function mountTimelineEditor(
  container: HTMLElement,
  requestTimelineActivation: (id: string) => void,
): MountedTimelineEditor {
  const elements = createEditorElements();
  const height = globalThis.innerHeight || 800;
  const state: EditorState = {
    destroyed: false,
    replaying: false,
    timelineHeight: height * readStoredRatio(),
    zoom: Number(elements.zoom.value),
    looping: false,
    collapsed: false,
    selectedSources: [],
    blocks: new Map(),
    elements,
  };
  container.append(elements.root);
  applyTimelineHeight(state, state.timelineHeight);
  renderSnapshot(state, EMPTY_TIMELINE_SNAPSHOT);

  const restorePreviewRoot = (): void => {
    const previewRoot = state.previewRoot;
    if (!previewRoot) return;
    if (state.originalParent) {
      const anchor = state.originalNextSibling?.parentNode === state.originalParent
        ? state.originalNextSibling
        : null;
      state.originalParent.insertBefore(previewRoot, anchor);
    } else {
      previewRoot.remove();
    }
    state.previewRoot = undefined;
    state.originalParent = undefined;
    state.originalNextSibling = undefined;
  };

  const releaseActiveTimeline = (): void => {
    state.controlSubscription?.();
    state.controlSubscription = undefined;
    state.attachment?.detach();
    state.attachment = undefined;
    for (const source of state.selectedSources) {
      source.removeAttribute("data-motion-editor-selected");
    }
    state.selected = undefined;
    state.selectedTrackId = undefined;
    state.selectedSources = [];
    state.control = undefined;
    state.timeline = undefined;
    state.snapshot = undefined;
    state.pendingSnapshot = undefined;
    state.renderedItems = undefined;
    state.blocks.clear();
    restorePreviewRoot();
  };

  const activate = (registration: MotionTimelineRegistration | undefined): void => {
    if (state.destroyed || state.control === registration) return;
    releaseActiveTimeline();
    delete elements.root.dataset.connectionState;

    if (!registration) {
      elements.timelineSelect.value = "";
      renderSnapshot(state, EMPTY_TIMELINE_SNAPSHOT);
      return;
    }

    const previewRoot = registration.root;
    state.control = registration;
    elements.timelineSelect.value = registration.id;
    state.timeline = registration.timeline;
    state.previewRoot = previewRoot;
    state.originalParent = previewRoot.parentNode ?? undefined;
    state.originalNextSibling = previewRoot.nextSibling;
    elements.previewSurface.append(previewRoot);

    state.controlSubscription = registration.subscribe((event) => {
      if (state.destroyed || state.control !== registration) return;
      if (event.type === "replay-start") {
        state.attachment?.detach();
        state.attachment = undefined;
        state.pendingSnapshot = undefined;
        for (const source of state.selectedSources) {
          source.removeAttribute("data-motion-editor-selected");
        }
        state.selectedSources = [];
        return;
      }
      if (event.type === "timeline") {
        state.timeline = event.timeline;
        state.renderedItems = undefined;
        delete state.elements.root.dataset.connectionState;
        attachTimeline(state);
        return;
      }
      if (event.type === "error") {
        reportConnectionError(state, event.error);
        return;
      }

      state.attachment?.detach();
      state.attachment = undefined;
      elements.root.dataset.connectionState = "disconnected";
      elements.readiness.textContent = "disconnected";
      elements.playButton.disabled = true;
    });

    try {
      attachTimeline(state);
    } catch (error) {
      releaseActiveTimeline();
      renderSnapshot(state, EMPTY_TIMELINE_SNAPSHOT);
      reportConnectionError(state, error);
    }
  };

  const handleAction = (action: string): void => {
    const snapshot = state.snapshot;
    if (!snapshot) return;
    switch (action) {
      case "toggle-play":
        if (snapshot.driver !== "manual" || !state.timeline) return;
        if (snapshot.playState === "running") {
          state.timeline.pause();
        } else {
          const activeTimeline = snapshot.progress >= 1
            ? replayTimeline(state)
            : state.timeline;
          if (!activeTimeline) return;
          void activeTimeline.play();
        }
        if (state.attachment) scheduleSnapshot(state, state.attachment.read());
        break;
      case "toggle-loop":
        state.looping = !state.looping;
        elements.loopButton.setAttribute("aria-pressed", String(state.looping));
        elements.loopButton.setAttribute(
          "aria-label",
          state.looping ? "Disable loop" : "Enable loop",
        );
        break;
      case "show-details":
        elements.inspector.hidden = false;
        renderInspector(state);
        break;
      case "close-inspector":
        elements.inspector.hidden = true;
        break;
      case "toggle-timeline":
        state.collapsed = !state.collapsed;
        elements.root.dataset.timelineCollapsed = String(state.collapsed);
        elements.collapseButton.textContent = state.collapsed ? "Show" : "Hide";
        elements.collapseButton.setAttribute("aria-expanded", String(!state.collapsed));
        elements.collapseButton.setAttribute(
          "aria-label",
          state.collapsed ? "Show timeline" : "Hide timeline",
        );
        elements.divider.tabIndex = state.collapsed ? -1 : 0;
        if (state.collapsed) elements.inspector.hidden = true;
        break;
    }
  };

  const handleClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const actionElement = target.closest<HTMLElement>("[data-action]");
    const action = actionElement?.dataset.action;
    if (action) {
      handleAction(action);
      return;
    }
    const indexText = target.closest<HTMLElement>("[data-source-index]")?.dataset.sourceIndex;
    if (indexText === undefined) return;
    const item = state.snapshot?.items.find((candidate) => candidate.index === Number(indexText));
    if (item) selectItem(state, item);
  };

  const handleScale = (): void => {
    state.attachment?.setTimeScale(Number(elements.scale.value));
  };
  const handleTimelineSelection = (): void => {
    const id = elements.timelineSelect.value;
    if (id) requestTimelineActivation(id);
  };
  const handleZoom = (): void => {
    state.zoom = Number(elements.zoom.value);
    if (state.snapshot) renderTracks(state, state.snapshot);
  };
  const handleTrackPointer = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest(".motion-editor__block")) return;
    elements.trackContent.setPointerCapture?.(event.pointerId);
    seekByPointer(state, event);
  };
  const handleTrackMove = (event: PointerEvent): void => {
    if (elements.trackContent.hasPointerCapture?.(event.pointerId)) seekByPointer(state, event);
  };
  const handleTrackUp = (event: PointerEvent): void => {
    if (elements.trackContent.hasPointerCapture?.(event.pointerId)) {
      elements.trackContent.releasePointerCapture?.(event.pointerId);
    }
  };

  const scheduleResize = (value: number): void => {
    state.pendingTimelineHeight = value;
    if (state.resizeFrame !== undefined) return;
    const apply = () => {
      state.resizeFrame = undefined;
      if (state.pendingTimelineHeight === undefined) return;
      applyTimelineHeight(state, state.pendingTimelineHeight);
      state.pendingTimelineHeight = undefined;
    };
    state.resizeFrame = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(apply)
      : (apply(), undefined);
  };
  const handleDividerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || state.collapsed) return;
    state.resizePointer = event.pointerId;
    elements.divider.setPointerCapture?.(event.pointerId);
    elements.root.dataset.resizing = "true";
  };
  const handleDividerMove = (event: PointerEvent): void => {
    if (state.resizePointer !== event.pointerId) return;
    const rect = elements.root.getBoundingClientRect();
    scheduleResize(rect.bottom - event.clientY);
  };
  const finishDividerResize = (event: PointerEvent): void => {
    if (state.resizePointer !== event.pointerId) return;
    if (elements.divider.hasPointerCapture?.(event.pointerId)) {
      elements.divider.releasePointerCapture?.(event.pointerId);
    }
    state.resizePointer = undefined;
    delete elements.root.dataset.resizing;
    applyTimelineHeight(state, state.pendingTimelineHeight ?? state.timelineHeight, true);
    state.pendingTimelineHeight = undefined;
  };
  const handleDividerKey = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const direction = event.key === "ArrowUp" ? 1 : -1;
    applyTimelineHeight(state, state.timelineHeight + direction * (event.shiftKey ? 64 : 16), true);
  };
  const handleEditorKey = (event: KeyboardEvent): void => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLButtonElement) {
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      handleAction("toggle-play");
    } else if (event.key.toLowerCase() === "l") {
      handleAction("toggle-loop");
    }
  };

  elements.root.addEventListener("click", handleClick);
  elements.root.addEventListener("keydown", handleEditorKey);
  elements.scale.addEventListener("change", handleScale);
  elements.timelineSelect.addEventListener("change", handleTimelineSelection);
  elements.zoom.addEventListener("input", handleZoom);
  elements.trackContent.addEventListener("pointerdown", handleTrackPointer);
  elements.trackContent.addEventListener("pointermove", handleTrackMove);
  elements.trackContent.addEventListener("pointerup", handleTrackUp);
  elements.trackContent.addEventListener("pointercancel", handleTrackUp);
  elements.divider.addEventListener("pointerdown", handleDividerDown);
  elements.divider.addEventListener("pointermove", handleDividerMove);
  elements.divider.addEventListener("pointerup", finishDividerResize);
  elements.divider.addEventListener("pointercancel", finishDividerResize);
  elements.divider.addEventListener("keydown", handleDividerKey);
  elements.divider.addEventListener("dblclick", () => resetSplit(state));

  return {
    activate,
    setTimelineOptions(registrations, activeTimelineId): void {
      const options = registrations.map((registration) => {
        const option = document.createElement("option");
        option.value = registration.id;
        option.textContent = `${registration.label} — ${registration.id}`;
        option.title = registration.id;
        return option;
      });
      if (options.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No timelines registered";
        option.disabled = true;
        options.push(option);
      }
      elements.timelineSelect.replaceChildren(...options);
      elements.timelineSelect.disabled = registrations.length === 0;
      elements.timelineSelect.value = activeTimelineId ?? "";
    },
    destroy(): void {
      if (state.destroyed) return;
      state.destroyed = true;
      if (state.renderFrame !== undefined) cancelAnimationFrame?.(state.renderFrame);
      if (state.resizeFrame !== undefined) cancelAnimationFrame?.(state.resizeFrame);
      if (
        state.resizePointer !== undefined &&
        elements.divider.hasPointerCapture?.(state.resizePointer)
      ) {
        elements.divider.releasePointerCapture?.(state.resizePointer);
      }
      releaseActiveTimeline();
      elements.root.remove();
    },
  };
}

export function mountMotionDevTools(
  container: HTMLElement,
  options: MotionDevToolsOptions = {},
): MotionDevToolsHandle {
  const registry = options.registry ?? defaultTimelineRegistry;
  let destroyed = false;
  let activeTimelineId: string | undefined;
  let activeIndex = 0;
  let registrySnapshot: MotionTimelineRegistrySnapshot = registry.getSnapshot();
  const setActiveTimeline = (id: string): boolean => {
    if (destroyed) return false;
    const registration = registrySnapshot.registrations.find(
      (candidate) => candidate.id === id,
    );
    if (!registration) return false;
    activate(registration);
    editor.setTimelineOptions(registrySnapshot.registrations, activeTimelineId);
    return true;
  };
  const editor = mountTimelineEditor(container, (id) => {
    setActiveTimeline(id);
  });

  const activate = (registration: MotionTimelineRegistration | undefined): void => {
    activeTimelineId = registration?.id;
    if (registration) {
      activeIndex = registrySnapshot.registrations.indexOf(registration);
    }
    editor.activate(registration);
  };

  const handleRegistrySnapshot = (snapshot: MotionTimelineRegistrySnapshot): void => {
    if (destroyed) return;
    registrySnapshot = snapshot;
    const registrations = snapshot.registrations;
    if (activeTimelineId) {
      const active = registrations.find(({ id }) => id === activeTimelineId);
      if (active) {
        activeIndex = registrations.indexOf(active);
        editor.activate(active);
        editor.setTimelineOptions(registrations, activeTimelineId);
        return;
      }
    }

    const initial = !activeTimelineId && options.initialTimelineId
      ? registrations.find(({ id }) => id === options.initialTimelineId)
      : undefined;
    const fallback = initial ?? registrations[Math.min(activeIndex, registrations.length - 1)];
    activate(fallback);
    editor.setTimelineOptions(registrations, activeTimelineId);
  };

  const unsubscribeRegistry = registry.subscribe(handleRegistrySnapshot);

  return {
    get activeTimelineId() {
      return activeTimelineId;
    },
    setActiveTimeline,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribeRegistry();
      editor.destroy();
      activeTimelineId = undefined;
    },
  };
}
