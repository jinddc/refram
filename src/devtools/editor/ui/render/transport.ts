import type { EditorViewState } from "../../view-state";
import type { EditorUiElements } from "../dom";
import { timelinePosition, type TimelineRulerScale } from "./timeline";

const EDITOR_MINIMAL_TIMELINE_EDGE_GUTTER = 10;
const EDITOR_MINIMAL_PLAYHEAD_ICON_HALF_WIDTH = 6;
const SCRUB_PILL_EDGE_PROGRESS = 0.05;

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

function formatTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalMilliseconds = Math.round(safe * 1000);
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

export function renderTransport(
  elements: EditorUiElements,
  view: EditorViewState,
  scale: TimelineRulerScale,
): void {
  const scrollTrigger = view.scrollTrigger;
  const scrubbed = scrollTrigger?.scrubbed === true;
  elements.transport.hidden = false;
  elements.playback.hidden = scrubbed;
  elements.transportHint.hidden = !scrubbed;
  if (view.activeTimelineId) elements.scrollTriggerActions.removeAttribute("aria-hidden");
  else elements.scrollTriggerActions.setAttribute("aria-hidden", "true");
  elements.jumpToTargetButton.hidden = !view.activeTimelineId;
  elements.toggleMarkersButton.hidden = scrollTrigger === undefined;
  elements.jumpToTargetButton.disabled = !view.transport.canJumpToScrollTriggerTarget;
  elements.toggleMarkersButton.disabled = !view.transport.canToggleScrollTriggerMarkers;
  elements.toggleMarkersButton.setAttribute(
    "aria-pressed",
    String(view.transport.scrollTriggerMarkersVisible),
  );
  const markersLabel = view.transport.scrollTriggerMarkersVisible
    ? "Hide ScrollTrigger markers"
    : "Show ScrollTrigger markers";
  elements.toggleMarkersButton.setAttribute("aria-label", markersLabel);
  elements.toggleMarkersButton.title = markersLabel;
  elements.resetButton.hidden = scrubbed;
  elements.zoomControl.hidden = scrubbed;
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
  elements.timelineContent.style.setProperty("--rf-playhead-position", playheadPosition);
  elements.timelineContent.style.setProperty(
    "--rf-progress-position",
    timelinePosition(displayedProgress),
  );
  elements.timelineContent.style.setProperty(
    "--rf-minimal-progress-position",
    timelinePosition(displayedProgress, EDITOR_MINIMAL_TIMELINE_EDGE_GUTTER),
  );
  elements.timelineContent.style.setProperty(
    "--rf-minimal-icon-progress-position",
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
      "--rf-playhead-pill-translate",
      scrubPillTranslate(displayedProgress),
    );
    elements.playheadProgress.style.setProperty(
      "--rf-playhead-pill-overlap",
      scrubPillOverlap(displayedProgress),
    );
  } else {
    elements.playheadProgress.style.removeProperty("--rf-playhead-pill-translate");
    elements.playheadProgress.style.removeProperty("--rf-playhead-pill-overlap");
  }
}
