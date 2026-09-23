import type { EditorViewState, EditorViewTrack } from "../editor-view-state";
import type { EditorUiElements } from "./dom";

const TICK_COUNT = 5;

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
  const minutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const milliseconds = Math.floor((safe % 1) * 1000);
  return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function formatRulerTime(seconds: number): string {
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
    button.append(
      node("span", "devtools-editor__timeline-item-label", label),
      node("span", "devtools-editor__timeline-item-id", id),
    );
    return button;
  });
  if (entries.length === 0) {
    entries.push(node("p", "devtools-editor__timeline-empty", "No timelines registered."));
  }
  elements.timelineList.replaceChildren(...entries);
}

function renderStatus(elements: EditorUiElements, view: EditorViewState): void {
  const labels = {
    empty: "Empty",
    connecting: "Connecting",
    ready: "Ready",
    "not-ready": "No tracks",
    retryable: "Replay failed. Retry available",
    blocked: "Replay blocked",
    error: "Timeline error",
  } as const;
  elements.status.value = labels[view.status];
  elements.status.textContent = elements.status.value;
  elements.status.dataset.state = view.status;
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
  elements.duration.value = formatTime(time?.duration ?? 0);
  elements.duration.textContent = elements.duration.value;
  elements.root.style.setProperty("--devtools-editor-progress", String(time?.progress ?? 0));
  elements.playhead.setAttribute("aria-valuenow", String(Math.round((time?.progress ?? 0) * 100)));
  elements.playhead.setAttribute("aria-valuetext", elements.currentTime.value);
}

function renderRuler(elements: EditorUiElements, view: EditorViewState): void {
  const signature = String(view.time?.duration ?? 0);
  if (elements.ruler.dataset.signature === signature) return;
  elements.ruler.dataset.signature = signature;
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, index) => {
    const tick = node("span", "devtools-editor__tick");
    const progress = index / TICK_COUNT;
    tick.style.left = `${progress * 100}%`;
    tick.textContent = formatRulerTime((view.time?.duration ?? 0) * progress);
    return tick;
  });
  elements.ruler.replaceChildren(...ticks);
}

function renderTrack(track: EditorViewTrack): [HTMLButtonElement, HTMLElement] {
  const label = node("button", "devtools-editor__track-label", track.label);
  label.type = "button";
  label.dataset.trackKey = track.key;
  label.dataset.selected = String(track.selected);
  label.setAttribute("aria-pressed", String(track.selected));
  const lane = node("div", "devtools-editor__track-lane");
  if (track.spans.length === 0) {
    const unavailable = node("span", "devtools-editor__track-unavailable", "Timing unavailable");
    lane.append(unavailable);
  } else {
    for (const span of track.spans) {
      const block = node("button", "devtools-editor__track-block", track.label);
      block.type = "button";
      block.dataset.trackKey = track.key;
      block.dataset.selected = String(track.selected);
      block.setAttribute("aria-pressed", String(track.selected));
      block.style.left = `${span.start * 100}%`;
      block.style.width = `${Math.max(0.8, (span.end - span.start) * 100)}%`;
      lane.append(block);
    }
  }
  return [label, lane];
}

function renderTracks(elements: EditorUiElements, view: EditorViewState): void {
  const signature = view.tracks.map((track) => [
    track.key,
    track.label,
    track.selected,
    track.spans.map(({ start, end }) => `${start}:${end}`).join(","),
  ].join("|")).join(";");
  if (elements.trackLanes.dataset.signature === signature) return;
  elements.trackLanes.dataset.signature = signature;
  const heading = node("div", "devtools-editor__track-heading", "Tracks");
  const labels: HTMLElement[] = [heading];
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
    inspector.mapping,
    inspector.start,
    inspector.duration,
    inspector.end,
    ease,
    inspector.animatedTargetCount,
    inspector.visualTargetCount,
  ].join("|");
  if (elements.inspectorContent.dataset.signature === signature) return;
  elements.inspectorContent.dataset.signature = signature;

  const identity = node("div", "devtools-editor__inspector-identity");
  const heading = node("div", "devtools-editor__inspector-label", inspector.label);
  const key = node("code", "devtools-editor__inspector-key", inspector.trackKey);
  const mapping = node(
    "span",
    "devtools-editor__inspector-mapping",
    inspector.mapping === "authored" ? "Authored" : "Automatic",
  );
  identity.append(heading, key, mapping);

  const details = node("dl", "devtools-editor__inspector-details");
  details.append(
    inspectorField("Start", formatInspectorTime(inspector.start)),
    inspectorField("Duration", formatInspectorTime(inspector.duration)),
    inspectorField("End", formatInspectorTime(inspector.end)),
    inspectorField("Ease", ease),
    inspectorField("Animated", String(inspector.animatedTargetCount)),
    inspectorField("Visual", String(inspector.visualTargetCount)),
  );
  elements.inspectorContent.replaceChildren(identity, details);
}

export function renderEditorUi(elements: EditorUiElements, view: EditorViewState): void {
  renderTimelines(elements, view);
  renderStatus(elements, view);
  renderTransport(elements, view);
  renderRuler(elements, view);
  renderTracks(elements, view);
  renderInspector(elements, view);
  elements.timelineViewport.dataset.seekable = String(view.transport.canSeek);
}
