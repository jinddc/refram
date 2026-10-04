import type { EditorViewState, EditorViewTrack } from "../../view-state";
import {
  EDITOR_TIMELINE_EDGE_GUTTER,
  type EditorUiElements,
} from "../dom";
import { createRenderNode, formatInspectorTime } from "./shared";

export const DEFAULT_RULER_DURATION = 12;
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

export function timelinePosition(
  progress: number,
  startGutter = EDITOR_TIMELINE_EDGE_GUTTER,
  endGutter = startGutter,
): string {
  const offset = startGutter * (1 - progress) - endGutter * progress;
  return `calc(${progress * 100}% + ${offset}px)`;
}

function timelineContentWidth(contentScale: number): string {
  if (contentScale === 1) return "100%";
  const gutterCorrection = (contentScale - 1) * EDITOR_TIMELINE_EDGE_GUTTER * 2;
  return `calc(${contentScale * 100}% - ${gutterCorrection}px)`;
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

function renderRuler(
  elements: EditorUiElements,
  view: EditorViewState,
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
  const scrubbed = view.scrollTrigger?.scrubbed === true;
  const signature = `${scrubbed}:${domainDuration}:${visibleDuration}:${majorStep}:${minorStep}`;
  if (elements.ruler.dataset.signature === signature) return;
  elements.ruler.dataset.signature = signature;
  elements.ruler.dataset.visibleDuration = String(visibleDuration);
  elements.ruler.dataset.majorStep = String(majorStep);
  elements.ruler.dataset.unit = scrubbed ? "percent" : unit;
  elements.ruler.setAttribute("aria-label", scrubbed
    ? "Scroll progress ruler from 0% to 100%"
    : formatRulerScaleLabel(scale));
  const markCount = Math.floor(domainDuration / minorStep + Number.EPSILON);
  const subdivisions = Math.round(majorStep / minorStep);
  const marks = Array.from(
    { length: markCount + 1 },
    (_, index) => {
      const mark = createRenderNode("span", "rf__ruler-mark");
      const progress = index * minorStep / domainDuration;
      mark.style.left = timelinePosition(progress);
      mark.dataset.major = String(index % subdivisions === 0);
      mark.dataset.mid = String(subdivisions > 2
        && index % Math.round(subdivisions / 2) === 0);
      return mark;
    },
  );
  const tickCount = Math.floor(domainDuration / majorStep + Number.EPSILON);
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const tick = createRenderNode("span", "rf__tick");
    const seconds = index * majorStep;
    const progress = seconds / domainDuration;
    tick.style.left = timelinePosition(progress);
    tick.textContent = scrubbed
      ? `${Math.round(progress * 100)}%`
      : unit === "frames"
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
  const visible = view.scrollTrigger?.scrubbed !== true && time !== undefined
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
  const label = createRenderNode("button", "rf__track-label");
  label.type = "button";
  label.dataset.trackKey = track.key;
  label.dataset.selected = String(track.selected);
  label.setAttribute("aria-pressed", String(track.selected));
  label.title = track.fullLabel;
  label.setAttribute("aria-label", track.fullLabel);
  label.append(createRenderNode("span", "rf__track-label-text", track.label));
  const lane = createRenderNode("div", "rf__track-lane");
  if (track.spans.length === 0) {
    lane.append(createRenderNode("span", "rf__track-unavailable", "Timing unavailable"));
  } else {
    for (const span of track.spans) {
      const block = createRenderNode("button", "rf__track-block");
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
  const timelineScale = view.scrollTrigger?.scrubbed
    ? 1
    : (view.time?.duration ?? DEFAULT_RULER_DURATION) / scale.domainDuration;
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
  const labels: HTMLElement[] = [createRenderNode(
    "div",
    "rf__track-heading",
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
    labels.push(createRenderNode("div", "rf__track-empty", "No tracks"));
    lanes.push(createRenderNode(
      "div",
      "rf__track-lane rf__track-lane--empty",
      "Select a timeline with inspectable motion.",
    ));
  }
  elements.trackLabels.replaceChildren(...labels);
  elements.trackLanes.replaceChildren(...lanes);
}

export function renderTimeline(
  elements: EditorUiElements,
  view: EditorViewState,
  scale: TimelineRulerScale,
): void {
  renderRuler(elements, view, scale);
  renderFiniteEnd(elements, view, scale);
  renderTracks(elements, view, scale);
}
