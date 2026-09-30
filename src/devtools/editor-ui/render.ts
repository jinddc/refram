import type { EditorViewState, EditorViewTrack } from "../editor-view-state";
import {
  EDITOR_TIMELINE_EDGE_GUTTER,
  type EditorUiElements,
} from "./dom";

const DEFAULT_RULER_DURATION = 12;
const RULER_FRAMES_PER_SECOND = 60;
const MIN_ZOOM = 0.5;
const BASE_ZOOM = 1;
const MAX_ZOOM = 4;
const MIN_ZOOM_VISIBLE_DURATION = 35;
const MAX_ZOOM_VISIBLE_DURATION = 14 / RULER_FRAMES_PER_SECOND;
const MAX_VISIBLE_MAJOR_INTERVALS = 14;
const RULER_MAJOR_STEPS = [
  2 / RULER_FRAMES_PER_SECOND,
  5 / RULER_FRAMES_PER_SECOND,
  10 / RULER_FRAMES_PER_SECOND,
  15 / RULER_FRAMES_PER_SECOND,
  0.5,
  1,
  2,
  5,
  10,
  30,
  60,
] as const;

export interface TimelineRulerScale {
  readonly domainDuration: number;
  readonly visibleDuration: number;
  readonly majorStep: number;
  readonly minorStep: number;
  readonly contentScale: number;
  readonly unit: "frames" | "seconds";
}

function geometricInterpolate(from: number, to: number, progress: number): number {
  return from * ((to / from) ** progress);
}

function selectMajorStep(visibleDuration: number): number {
  return RULER_MAJOR_STEPS.find(
    (step) => visibleDuration / step <= MAX_VISIBLE_MAJOR_INTERVALS,
  ) ?? RULER_MAJOR_STEPS.at(-1)!;
}

export function getTimelineRulerScale(
  duration: number,
  zoom = BASE_ZOOM,
): TimelineRulerScale {
  const safeDuration = Math.max(
    DEFAULT_RULER_DURATION,
    Number.isFinite(duration) ? duration : DEFAULT_RULER_DURATION,
  );
  const safeZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  const manualVisibleDuration = safeZoom <= BASE_ZOOM
    ? geometricInterpolate(
      MIN_ZOOM_VISIBLE_DURATION,
      DEFAULT_RULER_DURATION,
      (safeZoom - MIN_ZOOM) / (BASE_ZOOM - MIN_ZOOM),
    )
    : geometricInterpolate(
      DEFAULT_RULER_DURATION,
      MAX_ZOOM_VISIBLE_DURATION,
      (safeZoom - BASE_ZOOM) / (MAX_ZOOM - BASE_ZOOM),
    );
  const visibleDuration = manualVisibleDuration;
  const domainDuration = Math.max(safeDuration, visibleDuration);
  const majorStep = selectMajorStep(visibleDuration);
  const minorStep = majorStep >= 5
    ? majorStep / 5
    : majorStep >= 1
      ? majorStep / 10
      : majorStep / 2;
  return {
    domainDuration,
    visibleDuration,
    majorStep,
    minorStep,
    contentScale: domainDuration / visibleDuration,
    unit: majorStep < 1 ? "frames" : "seconds",
  };
}

function timelinePosition(progress: number): string {
  const offset = EDITOR_TIMELINE_EDGE_GUTTER * (1 - progress * 2);
  return `calc(${progress * 100}% + ${offset}px)`;
}

function timelineContentWidth(contentScale: number): string {
  if (contentScale === 1) return "100%";
  const gutterCorrection = (contentScale - 1) * EDITOR_TIMELINE_EDGE_GUTTER * 2;
  return `calc(${contentScale * 100}% - ${gutterCorrection}px)`;
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

function formatRulerScaleLabel(scale: TimelineRulerScale): string {
  if (scale.unit === "seconds") {
    return `Timeline ruler: ${formatRulerTime(scale.visibleDuration)} visible, major ticks every ${formatRulerTime(scale.majorStep)}`;
  }
  const visibleFrames = scale.visibleDuration * RULER_FRAMES_PER_SECOND;
  const majorFrames = scale.majorStep * RULER_FRAMES_PER_SECOND;
  const readableVisibleFrames = Number.isInteger(visibleFrames)
    ? String(visibleFrames)
    : visibleFrames.toFixed(1);
  const readableMajorFrames = Number.isInteger(majorFrames)
    ? String(majorFrames)
    : majorFrames.toFixed(1);
  return [
    `Timeline ruler: ${readableVisibleFrames} frames visible`,
    `(approximately ${Math.round(scale.visibleDuration * 1000)} milliseconds),`,
    `major ticks every ${readableMajorFrames} frames`,
    `(approximately ${Math.round(scale.majorStep * 1000)} milliseconds)`,
  ].join(" ");
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

function renderTransport(
  elements: EditorUiElements,
  view: EditorViewState,
  scale: TimelineRulerScale,
): void {
  const running = view.transport.playState === "running";
  elements.playIcon.toggleAttribute("hidden", running);
  elements.pauseIcon.toggleAttribute("hidden", !running);
  elements.playButton.setAttribute("aria-label", running ? "Pause" : "Play");
  elements.playButton.title = running ? "Pause (Space)" : "Play (Space)";
  elements.playButton.dataset.action = running ? "pause" : "play";
  elements.playButton.disabled = running
    ? !view.transport.canPause
    : !view.transport.canPlay;
  const replayLabel = view.transport.rebuilding
    ? "Rebuilding…"
    : view.transport.canRetryReplay
      ? "Retry"
      : "Replay";
  elements.replayButton.setAttribute("aria-label", replayLabel);
  elements.replayButton.title = replayLabel;
  elements.replayButton.disabled = !view.transport.canReplay
    && !view.transport.canRetryReplay;
  elements.speedSelect.value = String(view.transport.timeScale ?? 1);
  elements.speedSelect.disabled = !view.transport.canSetTimeScale;
  elements.reverseButton.disabled = !view.transport.canSetDirection;
  elements.reverseButton.setAttribute("aria-pressed", String(view.transport.reversed));
  elements.loopButton.disabled = !view.transport.canLoop;
  elements.loopButton.setAttribute("aria-pressed", String(view.transport.looping));
  const time = view.time;
  elements.currentTime.value = formatTime(time ? time.progress * time.duration : 0);
  elements.currentTime.textContent = elements.currentTime.value;
  elements.duration.value = formatTime(time?.sourceDuration ?? 0);
  elements.duration.textContent = elements.duration.value;
  const timelineProgress = time
    ? time.progress * time.duration / scale.domainDuration
    : 0;
  elements.playhead.style.left = timelinePosition(timelineProgress);
  elements.playhead.setAttribute("aria-valuenow", String(Math.round((time?.progress ?? 0) * 100)));
  elements.playhead.setAttribute("aria-valuetext", elements.currentTime.value);
}

function renderRuler(
  elements: EditorUiElements,
  scale: TimelineRulerScale,
): void {
  const {
    contentScale,
    domainDuration,
    majorStep,
    minorStep,
    unit,
    visibleDuration,
  } = scale;
  const contentWidth = timelineContentWidth(contentScale);
  elements.timelineContent.style.width = contentWidth;
  elements.timelineContent.style.removeProperty("min-width");
  const signature = `${domainDuration}:${visibleDuration}:${majorStep}:${minorStep}`;
  if (elements.ruler.dataset.signature === signature) return;
  elements.ruler.dataset.signature = signature;
  elements.ruler.dataset.visibleDuration = String(visibleDuration);
  elements.ruler.dataset.majorStep = String(majorStep);
  elements.ruler.dataset.unit = unit;
  elements.ruler.setAttribute("aria-label", formatRulerScaleLabel(scale));
  const markCount = Math.floor(domainDuration / minorStep + Number.EPSILON);
  const subdivisions = Math.round(majorStep / minorStep);
  const marks = Array.from(
    { length: markCount + 1 },
    (_, index) => {
      const mark = node("span", "devtools-editor__ruler-mark");
      const progress = index * minorStep / domainDuration;
      mark.style.left = timelinePosition(progress);
      mark.dataset.major = String(index % subdivisions === 0);
      mark.dataset.mid = String(subdivisions > 2 && index % Math.round(subdivisions / 2) === 0);
      return mark;
    },
  );
  const tickCount = Math.floor(domainDuration / majorStep + Number.EPSILON);
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const tick = node("span", "devtools-editor__tick");
    const seconds = index * majorStep;
    const progress = seconds / domainDuration;
    tick.style.left = timelinePosition(progress);
    tick.textContent = unit === "frames"
      ? `${Math.round(seconds * RULER_FRAMES_PER_SECOND)}f`
      : formatRulerTime(seconds);
    if (index === 0) tick.dataset.edge = "start";
    if (Math.abs(seconds - domainDuration) < Number.EPSILON * 10) {
      tick.dataset.edge = "end";
    }
    return tick;
  });
  elements.ruler.replaceChildren(...marks, ...ticks);
}

function renderFiniteEnd(
  elements: EditorUiElements,
  view: EditorViewState,
  scale: TimelineRulerScale,
): void {
  const time = view.time;
  const visible = time !== undefined
    && time.sourceDuration < time.duration;
  elements.timelineEndMarker.hidden = !visible;
  elements.postDurationRegion.hidden = !visible;
  if (!visible || !time) return;
  const progress = time.sourceDuration / scale.domainDuration;
  const position = timelinePosition(progress);
  elements.timelineEndMarker.style.left = position;
  elements.timelineEndMarker.setAttribute(
    "aria-label",
    `${time.repeating ? "Cycle" : "Animation"} ends at ${formatInspectorTime(time.sourceDuration)}`,
  );
  elements.postDurationRegion.style.left = position;
}

function renderTrack(
  track: EditorViewTrack,
  timelineScale: number,
): [HTMLButtonElement, HTMLElement] {
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
      block.style.left = `${span.start * timelineScale * 100}%`;
      block.style.width = `${(span.end - span.start) * timelineScale * 100}%`;
      lane.append(block);
    }
  }
  return [label, lane];
}

function renderTracks(
  elements: EditorUiElements,
  view: EditorViewState,
  scale: TimelineRulerScale,
): void {
  const timelineScale = (view.time?.duration ?? DEFAULT_RULER_DURATION)
    / scale.domainDuration;
  const signature = view.tracks.map((track) => [
    track.key,
    track.label,
    track.fullLabel,
    track.selected,
    track.spans.map(({ start, end }) => `${start}:${end}`).join(","),
  ].join("|")).concat(`@${timelineScale}`).join(";");
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
    const [label, lane] = renderTrack(track, timelineScale);
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

export function renderEditorUi(
  elements: EditorUiElements,
  view: EditorViewState,
  zoom = BASE_ZOOM,
): void {
  const scale = getTimelineRulerScale(view.time?.duration ?? DEFAULT_RULER_DURATION, zoom);
  renderTimelines(elements, view);
  renderTransport(elements, view, scale);
  renderRuler(elements, scale);
  renderFiniteEnd(elements, view, scale);
  renderTracks(elements, view, scale);
  renderInspector(elements, view);
  elements.timelineViewport.dataset.seekable = String(view.transport.canSeek);
}
