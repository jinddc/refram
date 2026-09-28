import type { EditorViewState, EditorViewTrack } from "../editor-view-state";
import {
  EDITOR_TIMELINE_EDGE_GUTTER,
  type EditorUiElements,
} from "./dom";

const TICK_COUNT = 12;
const MINOR_TICKS_PER_SECOND = 10;
const DEFAULT_TIMELINE_CONTENT_WIDTH = 1000;

function timelinePosition(progress: number): string {
  const offset = EDITOR_TIMELINE_EDGE_GUTTER * (1 - progress * 2);
  return `calc(${progress * 100}% + ${offset}px)`;
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalMilliseconds = Math.round(safe * 1000);
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function formatRulerTime(seconds: number): string {
  if (Number.isInteger(seconds)) return `${seconds}s`;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function renderTimelines(elements: EditorUiElements, view: EditorViewState): void {
  const signature = view.timelines
    .map(({ id, label }) => `${id}:${label}:${id === view.activeTimelineId}`)
    .join("|");
  if (elements.timelineList.dataset.signature === signature) return;
  elements.timelineList.dataset.signature = signature;
  const entries: HTMLElement[] = view.timelines.map(({ id, label }) => {
    const button = node("button", "devtools-editor__timeline-item");
    button.type = "button";
    button.dataset.timelineId = id;
    button.setAttribute("aria-current", String(id === view.activeTimelineId));
    button.append(node("span", "devtools-editor__timeline-item-label", label));
    return button;
  });
  if (entries.length === 0) {
    entries.push(node("p", "devtools-editor__timeline-empty", "No timelines registered."));
  }
  elements.timelineList.replaceChildren(...entries);
}

function renderTransport(elements: EditorUiElements, view: EditorViewState): void {
  const running = view.transport.playState === "running";
  elements.playButton.textContent = running ? "Pause" : "Play";
  elements.playButton.dataset.action = running ? "pause" : "play";
  elements.playButton.disabled = running
    ? !view.transport.canPause
    : !view.transport.canPlay;
  elements.replayButton.textContent = view.transport.canRetryReplay ? "Retry" : "Replay";
  elements.replayButton.disabled = !view.transport.canReplay
    && !view.transport.canRetryReplay;
  const time = view.time;
  elements.currentTime.value = formatTime(time ? time.progress * time.duration : 0);
  elements.currentTime.textContent = elements.currentTime.value;
  elements.duration.value = formatTime(time?.sourceDuration ?? 0);
  elements.duration.textContent = elements.duration.value;
  elements.playhead.style.left = timelinePosition(time?.progress ?? 0);
  elements.playhead.setAttribute("aria-valuenow", String(Math.round((time?.progress ?? 0) * 100)));
  elements.playhead.setAttribute("aria-valuetext", elements.currentTime.value);
}

function renderRuler(elements: EditorUiElements, view: EditorViewState): void {
  const duration = view.time?.duration ?? 12;
  const signature = String(duration);
  if (elements.ruler.dataset.signature === signature) return;
  elements.ruler.dataset.signature = signature;
  const scale = Math.max(1, duration / TICK_COUNT);
  elements.timelineContent.style.width = `${scale * 100}%`;
  elements.timelineContent.style.minWidth = `${scale * DEFAULT_TIMELINE_CONTENT_WIDTH}px`;
  const tickCount = Math.max(TICK_COUNT, Math.round(duration));
  const marks = Array.from(
    { length: tickCount * MINOR_TICKS_PER_SECOND + 1 },
    (_, index) => {
      const mark = node("span", "devtools-editor__ruler-mark");
      const progress = index / (tickCount * MINOR_TICKS_PER_SECOND);
      mark.style.left = timelinePosition(progress);
      mark.dataset.major = String(index % MINOR_TICKS_PER_SECOND === 0);
      mark.dataset.mid = String(index % (MINOR_TICKS_PER_SECOND / 2) === 0);
      return mark;
    },
  );
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const tick = node("span", "devtools-editor__tick");
    const progress = index / tickCount;
    tick.style.left = timelinePosition(progress);
    tick.textContent = formatRulerTime(index);
    if (index === 0) tick.dataset.edge = "start";
    if (index === tickCount) tick.dataset.edge = "end";
    return tick;
  });
  elements.ruler.replaceChildren(...marks, ...ticks);
}

function renderFiniteEnd(elements: EditorUiElements, view: EditorViewState): void {
  const time = view.time;
  const visible = time !== undefined
    && time.sourceDuration < time.duration;
  elements.timelineEndMarker.hidden = !visible;
  elements.postDurationRegion.hidden = !visible;
  if (!visible || !time) return;
  const progress = time.sourceDuration / time.duration;
  const position = timelinePosition(progress);
  elements.timelineEndMarker.style.left = position;
  elements.timelineEndMarker.setAttribute(
    "aria-label",
    `${time.repeating ? "Cycle" : "Animation"} ends at ${formatInspectorTime(time.sourceDuration)}`,
  );
  elements.postDurationRegion.style.left = position;
}

function renderTrack(track: EditorViewTrack): [HTMLButtonElement, HTMLElement] {
  const label = node("button", "devtools-editor__track-label");
  label.type = "button";
  label.dataset.trackKey = track.key;
  label.dataset.selected = String(track.selected);
  label.setAttribute("aria-pressed", String(track.selected));
  label.title = track.fullLabel;
  label.setAttribute("aria-label", track.fullLabel);
  label.append(node("span", "devtools-editor__track-label-text", track.label));
  const lane = node("div", "devtools-editor__track-lane");
  if (track.spans.length === 0) {
    const unavailable = node("span", "devtools-editor__track-unavailable", "Timing unavailable");
    lane.append(unavailable);
  } else {
    for (const span of track.spans) {
      const block = node("button", "devtools-editor__track-block");
      block.type = "button";
      block.dataset.trackKey = track.key;
      block.dataset.selected = String(track.selected);
      block.setAttribute("aria-pressed", String(track.selected));
      block.style.left = `${span.start * 100}%`;
      block.style.width = `${(span.end - span.start) * 100}%`;
      lane.append(block);
    }
  }
  return [label, lane];
}

function renderTracks(elements: EditorUiElements, view: EditorViewState): void {
  const signature = view.tracks.map((track) => [
    track.key,
    track.label,
    track.fullLabel,
    track.selected,
    track.spans.map(({ start, end }) => `${start}:${end}`).join(","),
  ].join("|")).join(";");
  if (elements.trackLanes.dataset.signature === signature) return;
  elements.trackLanes.dataset.signature = signature;
  const count = view.tracks.length;
  const labels: HTMLElement[] = [node(
    "div",
    "devtools-editor__track-heading",
    `${count} ${count === 1 ? "track" : "tracks"}`,
  )];
  labels[0]!.dataset.role = "track-count";
  const lanes: HTMLElement[] = [];
  for (const track of view.tracks) {
    const [label, lane] = renderTrack(track);
    labels.push(label);
    lanes.push(lane);
  }
  if (view.tracks.length === 0) {
    labels.push(node("div", "devtools-editor__track-empty", "No tracks"));
    lanes.push(node("div", "devtools-editor__track-lane devtools-editor__track-lane--empty", "Select a timeline with inspectable motion."));
  }
  elements.trackLabels.replaceChildren(...labels);
  elements.trackLanes.replaceChildren(...lanes);
}

function inspectorField(label: string, value: string): HTMLDivElement {
  const field = node("div", "devtools-editor__inspector-field");
  field.append(
    node("dt", "devtools-editor__inspector-term", label),
    node("dd", "devtools-editor__inspector-value", value),
  );
  return field;
}

function formatInspectorTime(value: number): string {
  if (value >= 1_000_000_000) return "∞";
  return `${Math.max(0, value).toFixed(2)}s`;
}

function renderInspector(elements: EditorUiElements, view: EditorViewState): void {
  const inspector = view.inspector;
  elements.inspectorEmpty.hidden = inspector !== undefined;
  elements.inspectorContent.hidden = inspector === undefined;
  if (!inspector) {
    elements.inspectorContent.replaceChildren();
    elements.inspectorContent.dataset.signature = "";
    return;
  }
  const ease = inspector.mixedEase ? "Mixed" : inspector.ease ?? "Unavailable";
  const signature = [
    inspector.trackKey,
    inspector.label,
    inspector.start,
    inspector.duration,
    inspector.end,
    ease,
    inspector.animatedTargetCount,
    inspector.visualTargetCount,
    inspector.properties.join(","),
  ].join("|");
  if (elements.inspectorContent.dataset.signature === signature) return;
  elements.inspectorContent.dataset.signature = signature;

  const identity = node("div", "devtools-editor__inspector-identity");
  const heading = node("div", "devtools-editor__inspector-label", inspector.label);
  identity.append(heading);

  const details = node("dl", "devtools-editor__inspector-details");
  const targetFields = inspector.animatedTargetCount === inspector.visualTargetCount
    ? [inspectorField("Targets", String(inspector.animatedTargetCount))]
    : [
      inspectorField("Animated objects", String(inspector.animatedTargetCount)),
      inspectorField("Preview elements", String(inspector.visualTargetCount)),
    ];
  details.append(
    inspectorField("Start", formatInspectorTime(inspector.start)),
    inspectorField("Duration", formatInspectorTime(inspector.duration)),
    inspectorField("End", formatInspectorTime(inspector.end)),
    inspectorField("Ease", ease),
    ...targetFields,
    inspectorField(
      "Properties",
      inspector.properties.length > 0 ? inspector.properties.join(", ") : "Unavailable",
    ),
  );
  elements.inspectorContent.replaceChildren(identity, details);
}

export function renderEditorUi(elements: EditorUiElements, view: EditorViewState): void {
  renderTimelines(elements, view);
  renderTransport(elements, view);
  renderRuler(elements, view);
  renderFiniteEnd(elements, view);
  renderTracks(elements, view);
  renderInspector(elements, view);
  elements.timelineViewport.dataset.seekable = String(view.transport.canSeek);
}
