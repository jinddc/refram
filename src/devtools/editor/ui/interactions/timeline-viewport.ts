import type { EditorController, EditorSnapshot } from "../../controller";
import type { EditorUiElements } from "../dom";
import { getTimelineRulerScale } from "../render";

const EDITOR_MIN_ZOOM = 0.5;
const EDITOR_MAX_ZOOM = 4;
const EDITOR_BASE_ZOOM = 1;
const EDITOR_ZOOM_STEP = 0.05;
const EDITOR_FORWARD_FOLLOW_CONTEXT = 0.25;
const EDITOR_REVERSE_FOLLOW_CONTEXT = 0.75;

function normalizeTimelineZoom(zoom: number): number {
  const clamped = Math.min(EDITOR_MAX_ZOOM, Math.max(EDITOR_MIN_ZOOM, zoom));
  const step = Math.round((clamped - EDITOR_MIN_ZOOM) / EDITOR_ZOOM_STEP);
  return Number((EDITOR_MIN_ZOOM + step * EDITOR_ZOOM_STEP).toFixed(2));
}

export interface TimelineViewportHandle {
  getZoom(): number;
  render(snapshot: EditorSnapshot): void;
  scheduleZoom(zoom: number): void;
  flushPendingZoom(): void;
  resetZoom(): void;
  zoomBy(factor: number): void;
  invalidatePlayheadVisibility(): void;
  destroy(): void;
}

export interface TimelineViewportOptions {
  readonly isDragging: () => boolean;
  readonly renderSnapshot: (snapshot: EditorSnapshot) => void;
}

export function createTimelineViewport(
  controller: EditorController,
  elements: EditorUiElements,
  options: TimelineViewportOptions,
): TimelineViewportHandle {
  elements.zoomRange.min = String(EDITOR_MIN_ZOOM);
  elements.zoomRange.max = String(EDITOR_MAX_ZOOM);
  const eventController = new AbortController();
  const listenerOptions = { signal: eventController.signal };
  let destroyed = false;
  let timelineZoom = EDITOR_BASE_ZOOM;
  let pendingTimelineZoom: number | undefined;
  let timelineZoomFrame: number | undefined;
  let playheadFollowFrame: number | undefined;
  let playheadWasVisible: boolean | undefined;
  let manualViewportChangePending = false;

  const renderZoomControls = (): void => {
    const displayedZoom = pendingTimelineZoom ?? timelineZoom;
    const zoomPercentage = Math.round(displayedZoom * 100);
    elements.zoomRange.value = String(zoomPercentage / 100);
    elements.zoomRange.setAttribute("aria-valuetext", `${zoomPercentage}%`);
    elements.zoomOutButton.disabled = displayedZoom <= EDITOR_MIN_ZOOM;
    elements.zoomInButton.disabled = displayedZoom >= EDITOR_MAX_ZOOM;
  };

  const schedulePlayheadFollow = (manualViewportChange = false): void => {
    manualViewportChangePending ||= manualViewportChange;
    if (playheadFollowFrame !== undefined) return;
    playheadFollowFrame = requestAnimationFrame(() => {
      playheadFollowFrame = undefined;
      if (destroyed) return;
      const viewportBounds = elements.timelineViewport.getBoundingClientRect();
      const playheadBounds = elements.playhead.getBoundingClientRect();
      const playheadCenter = playheadBounds.left + playheadBounds.width / 2;
      const visible = playheadCenter >= viewportBounds.left
        && playheadCenter <= viewportBounds.right;
      const snapshot = controller.getSnapshot();
      const running = snapshot.view.transport.playState === "running";
      const shouldFollow = !manualViewportChangePending
        && !options.isDragging()
        && running
        && playheadWasVisible === true
        && !visible;
      manualViewportChangePending = false;
      if (!shouldFollow) {
        playheadWasVisible = visible;
        return;
      }
      const viewportWidth = elements.timelineViewport.clientWidth;
      const playheadContentX = playheadCenter - viewportBounds.left
        + elements.timelineViewport.scrollLeft;
      const context = snapshot.view.transport.reversed
        ? EDITOR_REVERSE_FOLLOW_CONTEXT
        : EDITOR_FORWARD_FOLLOW_CONTEXT;
      const maxScroll = Math.max(
        0,
        elements.timelineViewport.scrollWidth - viewportWidth,
      );
      elements.timelineViewport.scrollLeft = Math.min(
        maxScroll,
        Math.max(0, playheadContentX - viewportWidth * context),
      );
      playheadWasVisible = true;
    });
  };

  const setTimelineZoom = (zoom: number): void => {
    const next = normalizeTimelineZoom(zoom);
    const snapshot = controller.getSnapshot();
    const time = snapshot.view.time;
    const progress = time?.progress ?? 0;
    const duration = time?.duration ?? 12;
    const oldScale = getTimelineRulerScale(duration, timelineZoom);
    const oldTimelinePosition = progress * duration / oldScale.domainDuration;
    const oldOffset = oldTimelinePosition * elements.timelineContent.scrollWidth
      - elements.timelineViewport.scrollLeft;
    timelineZoom = next;
    options.renderSnapshot(snapshot);
    const nextScale = getTimelineRulerScale(duration, timelineZoom);
    const nextTimelinePosition = progress * duration / nextScale.domainDuration;
    elements.timelineViewport.scrollLeft = Math.max(
      0,
      nextTimelinePosition * elements.timelineContent.scrollWidth - oldOffset,
    );
  };

  const cancelPendingZoom = (): void => {
    pendingTimelineZoom = undefined;
    if (timelineZoomFrame !== undefined) {
      cancelAnimationFrame(timelineZoomFrame);
      timelineZoomFrame = undefined;
    }
  };

  const flushPendingZoom = (): void => {
    if (pendingTimelineZoom === undefined) return;
    const next = pendingTimelineZoom;
    cancelPendingZoom();
    setTimelineZoom(next);
  };

  elements.timelineViewport.addEventListener(
    "scroll",
    () => schedulePlayheadFollow(true),
    listenerOptions,
  );

  return {
    getZoom: () => timelineZoom,
    render(snapshot) {
      renderZoomControls();
      if (snapshot.view.transport.playState === "running") schedulePlayheadFollow();
    },
    scheduleZoom(zoom) {
      const next = normalizeTimelineZoom(zoom);
      if (next === EDITOR_BASE_ZOOM) {
        cancelPendingZoom();
        setTimelineZoom(next);
        return;
      }
      pendingTimelineZoom = next;
      renderZoomControls();
      if (timelineZoomFrame !== undefined) return;
      timelineZoomFrame = requestAnimationFrame(() => {
        timelineZoomFrame = undefined;
        if (destroyed || pendingTimelineZoom === undefined) return;
        const pending = pendingTimelineZoom;
        pendingTimelineZoom = undefined;
        setTimelineZoom(pending);
      });
    },
    flushPendingZoom,
    resetZoom() {
      cancelPendingZoom();
      setTimelineZoom(EDITOR_BASE_ZOOM);
      elements.timelineViewport.scrollLeft = 0;
    },
    zoomBy(factor) {
      flushPendingZoom();
      setTimelineZoom(timelineZoom * factor);
    },
    invalidatePlayheadVisibility() {
      playheadWasVisible = undefined;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelPendingZoom();
      if (playheadFollowFrame !== undefined) cancelAnimationFrame(playheadFollowFrame);
      playheadFollowFrame = undefined;
      eventController.abort();
    },
  };
}
