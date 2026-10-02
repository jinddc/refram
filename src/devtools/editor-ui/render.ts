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
const SCRUB_PILL_EDGE_PROGRESS = 0.05;
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

const EDITOR_MINIMAL_TIMELINE_EDGE_GUTTER = 10;
const EDITOR_MINIMAL_PLAYHEAD_ICON_HALF_WIDTH = 6;

function timelinePosition(
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

function scrubPillTranslate(progress: number): string {
  const clamped = Math.min(1, Math.max(0, progress));
  if (clamped === 0) return "0%";
  if (clamped === 1) return "-100%";
  if (clamped < SCRUB_PILL_EDGE_PROGRESS) {
    return `${Number((-50 * clamped / SCRUB_PILL_EDGE_PROGRESS).toFixed(4))}%`;
  }
  if (clamped > 1 - SCRUB_PILL_EDGE_PROGRESS) {
    const translation = -50 - 50 * (clamped - (1 - SCRUB_PILL_EDGE_PROGRESS))
      / SCRUB_PILL_EDGE_PROGRESS;
    return `${Number(translation.toFixed(4))}%`;
  }
  return "-50%";
}

function scrubPillOverlap(progress: number): string {
  const clamped = Math.min(1, Math.max(0, progress));
  if (clamped < SCRUB_PILL_EDGE_PROGRESS) {
    return `${Number((-1 + clamped / SCRUB_PILL_EDGE_PROGRESS).toFixed(4))}px`;
  }
  if (clamped > 1 - SCRUB_PILL_EDGE_PROGRESS) {
    return `${Number(((clamped - (1 - SCRUB_PILL_EDGE_PROGRESS))
      / SCRUB_PILL_EDGE_PROGRESS).toFixed(4))}px`;
  }
  return "0px";
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
  const scrollTrigger = view.scrollTrigger;
  const scrubbed = scrollTrigger?.scrubbed === true;
  elements.transport.hidden = false;
  elements.playback.hidden = scrubbed;
  elements.transportHint.hidden = !scrubbed;
  elements.timelinePane.dataset.timelineMode = scrubbed ? "scroll-scrub" : "time";
  elements.root.dataset.timelineMode = scrubbed ? "scroll-scrub" : "time";
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
  const sourceProgress = time
    ? Math.min(1, Math.max(0, (time.time - time.start) / time.sourceDuration))
    : 0;
  const displayedProgress = scrubbed
    ? scrollTrigger.progress
    : elements.root.dataset.timelineCollapsed === "true"
      ? sourceProgress
      : time?.progress ?? 0;
  const timelineProgress = scrubbed
    ? displayedProgress
    : time
      ? time.progress * time.duration / scale.domainDuration
      : 0;
  const playheadPosition = timelinePosition(timelineProgress);
  elements.playhead.style.left = playheadPosition;
  elements.timelineContent.style.setProperty(
    "--editor-playhead-position",
    playheadPosition,
  );
  elements.timelineContent.style.setProperty(
    "--editor-progress-position",
    timelinePosition(displayedProgress),
  );
  elements.timelineContent.style.setProperty(
    "--editor-minimal-progress-position",
    timelinePosition(
      displayedProgress,
      EDITOR_MINIMAL_TIMELINE_EDGE_GUTTER,
    ),
  );
  elements.timelineContent.style.setProperty(
    "--editor-minimal-icon-progress-position",
    timelinePosition(
      displayedProgress,
      EDITOR_MINIMAL_TIMELINE_EDGE_GUTTER + EDITOR_MINIMAL_PLAYHEAD_ICON_HALF_WIDTH,
    ),
  );
  const percentage = Math.round(displayedProgress * 100);
  elements.playhead.setAttribute("aria-label", scrubbed
    ? "Scroll progress playhead"
    : "Timeline playhead");
  elements.playhead.setAttribute("aria-valuenow", String(percentage));
  elements.playhead.setAttribute("aria-valuetext", scrubbed
    ? `${percentage}%`
    : elements.currentTime.value);
  elements.playheadProgress.hidden = !scrubbed;
  elements.playheadProgress.textContent = `${percentage}%`;
  if (scrubbed) {
    elements.playheadProgress.style.setProperty(
      "--editor-playhead-pill-translate",
      scrubPillTranslate(displayedProgress),
    );
    elements.playheadProgress.style.setProperty(
      "--editor-playhead-pill-overlap",
      scrubPillOverlap(displayedProgress),
    );
  } else {
    elements.playheadProgress.style.removeProperty("--editor-playhead-pill-translate");
    elements.playheadProgress.style.removeProperty("--editor-playhead-pill-overlap");
  }
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

function inspectorField(
  label: string,
  value: string,
  truncate = false,
): HTMLDivElement {
  const field = node("div", "devtools-editor__inspector-field");
  const valueNode = node("dd", "devtools-editor__inspector-value", value);
  if (truncate) {
    valueNode.classList.add("devtools-editor__inspector-value--truncate");
    valueNode.title = value;
  }
  field.append(
    node("dt", "devtools-editor__inspector-term", label),
    valueNode,
  );
  return field;
}

function formatInspectorTime(value: number): string {
  if (value >= 1_000_000_000) return "∞";
  return `${Math.max(0, value).toFixed(2)}s`;
}

function formatInspectorProgress(value: number): string {
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

function formatRawScrollPosition(value: string | number | undefined): string {
  if (typeof value === "number") return `${value}px`;
  return value ?? "Default";
}

function formatMarkersStatus(markers: false | true | object): string {
  if (markers === false) return "Off";
  return markers === true ? "On" : "On (custom)";
}

function renderInspector(elements: EditorUiElements, view: EditorViewState): void {
  const inspector = view.inspector;
  elements.inspectorEmpty.hidden = inspector !== undefined;
  elements.inspectorContent.hidden = inspector === undefined;
  elements.inspectorActions.hidden = inspector === undefined;
  const statusTrackKey = elements.copyDebugStatus.dataset.trackKey;
  if (statusTrackKey !== inspector?.trackKey) {
    elements.copyDebugStatus.textContent = "";
    elements.copyDebugStatus.dataset.state = "";
    elements.copyDebugStatus.dataset.trackKey = inspector?.trackKey ?? "";
  }
  elements.copyDebugButton.disabled = inspector === undefined
    || elements.copyDebugStatus.dataset.state === "pending";
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
    view.scrollTrigger?.start,
    view.scrollTrigger?.end,
    view.scrollTrigger?.rawStart,
    view.scrollTrigger?.rawEnd,
    view.scrollTrigger?.distance,
    view.scrollTrigger?.progress,
    view.scrollTrigger?.animationProgress,
    view.scrollTrigger?.state,
    view.scrollTrigger?.direction,
    view.scrollTrigger?.scrub,
    view.scrollTrigger?.pin,
    view.scrollTrigger?.trigger,
    view.scrollTrigger?.scroller,
    JSON.stringify(view.scrollTrigger?.markers),
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
  const scrollTrigger = view.scrollTrigger;
  const scrollTriggerFields = scrollTrigger
    ? [
      inspectorField("ScrollTrigger state", scrollTrigger.state[0]!.toUpperCase()
        + scrollTrigger.state.slice(1)),
      inspectorField("Raw start", formatRawScrollPosition(scrollTrigger.rawStart)),
      inspectorField("Raw end", formatRawScrollPosition(scrollTrigger.rawEnd)),
      inspectorField("Resolved start", `${scrollTrigger.start.toFixed(2)}px`),
      inspectorField("Resolved end", `${scrollTrigger.end.toFixed(2)}px`),
      inspectorField("Scroll distance", `${scrollTrigger.distance.toFixed(2)}px`),
      inspectorField(
        "Scrub",
        typeof scrollTrigger.scrub === "number"
          ? `${scrollTrigger.scrub}s`
          : scrollTrigger.scrub ? "Enabled" : "Disabled",
      ),
      inspectorField("Pin", scrollTrigger.pin ?? "None"),
      inspectorField("Trigger", scrollTrigger.trigger ?? "Unavailable", true),
      inspectorField("Scroller", scrollTrigger.scroller, true),
      inspectorField("Markers", formatMarkersStatus(scrollTrigger.markers)),
      inspectorField(
        "Direction",
        scrollTrigger.direction < 0 ? "Backward" : scrollTrigger.direction > 0 ? "Forward" : "Idle",
      ),
      inspectorField("Scroll progress", formatInspectorProgress(scrollTrigger.progress)),
      ...(typeof scrollTrigger.scrub === "number"
        ? [inspectorField(
          "Animation progress",
          formatInspectorProgress(scrollTrigger.animationProgress),
        )]
        : []),
    ]
    : [];
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
    ...scrollTriggerFields,
  );
  elements.inspectorContent.replaceChildren(identity, details);
}

export function renderEditorUi(
  elements: EditorUiElements,
  view: EditorViewState,
  zoom = BASE_ZOOM,
): void {
  const scale = view.scrollTrigger?.scrubbed
    ? {
      domainDuration: 1,
      visibleDuration: 1,
      majorStep: 0.25,
      minorStep: 0.05,
      contentScale: 1,
      unit: "seconds" as const,
    }
    : getTimelineRulerScale(view.time?.duration ?? DEFAULT_RULER_DURATION, zoom);
  renderTimelines(elements, view);
  renderTransport(elements, view, scale);
  renderRuler(elements, view, scale);
  renderFiniteEnd(elements, view, scale);
  renderTracks(elements, view, scale);
  renderInspector(elements, view);
  elements.timelineViewport.dataset.seekable = String(view.transport.canSeek);
}
