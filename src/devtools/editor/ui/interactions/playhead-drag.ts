import type { EditorController } from "../../controller";
import { EDITOR_TIMELINE_EDGE_GUTTER, type EditorUiElements } from "../dom";
import { getTimelineRulerScale } from "../render";

const EDITOR_TIMELINE_BOUNDARY_SNAP_PIXELS = 1;

export interface PlayheadDragHandle {
  isDragging(): boolean;
  destroy(): void;
}

export interface PlayheadDragOptions {
  readonly getTimelineZoom: () => number;
  readonly isTimelineCollapsed: () => boolean;
  readonly invalidatePlayheadVisibility: () => void;
}

export function createPlayheadDrag(
  controller: EditorController,
  elements: EditorUiElements,
  options: PlayheadDragOptions,
): PlayheadDragHandle {
  const eventController = new AbortController();
  const listenerOptions = { signal: eventController.signal };
  let destroyed = false;
  let pointerId: number | undefined;

  const progressAt = (clientX: number): number | undefined => {
    const bounds = elements.timelineContent.getBoundingClientRect();
    const width = bounds.width - EDITOR_TIMELINE_EDGE_GUTTER * 2;
    if (width <= 0) return undefined;
    const contentProgress = Math.min(1, Math.max(
      0,
      (clientX - bounds.left - EDITOR_TIMELINE_EDGE_GUTTER) / width,
    ));
    const snapshot = controller.getSnapshot();
    if (snapshot.view.scrollTrigger?.scrubbed) return contentProgress;
    const time = snapshot.timeWindow;
    if (options.isTimelineCollapsed() && time) {
      return contentProgress * time.sourceDuration / time.duration;
    }
    const duration = time?.duration ?? 12;
    const scale = getTimelineRulerScale(duration, options.getTimelineZoom());
    const progress = Math.min(1, contentProgress * scale.domainDuration / duration);
    if (!time?.repeating) return progress;
    const cycleProgress = time.sourceDuration / time.duration;
    const nearestBoundary = Math.round(progress / cycleProgress) * cycleProgress;
    const timelineWidth = width * duration / scale.domainDuration;
    return nearestBoundary > 0
      && nearestBoundary <= 1
      && Math.abs(progress - nearestBoundary) * timelineWidth
        <= EDITOR_TIMELINE_BOUNDARY_SNAP_PIXELS
      ? nearestBoundary
      : progress;
  };

  const isScrollbarPointer = (event: PointerEvent): boolean => {
    const bounds = elements.timelineViewport.getBoundingClientRect();
    const overVerticalScrollbar = elements.timelineViewport.scrollHeight
      > elements.timelineViewport.clientHeight
      && event.clientX >= bounds.left + elements.timelineViewport.clientWidth;
    const overHorizontalScrollbar = elements.timelineViewport.scrollWidth
      > elements.timelineViewport.clientWidth
      && event.clientY >= bounds.top + elements.timelineViewport.clientHeight;
    return overVerticalScrollbar || overHorizontalScrollbar;
  };

  const seekFromPointer = (event: PointerEvent, clampToCycle: boolean): void => {
    const pointerProgress = progressAt(event.clientX);
    if (pointerProgress === undefined) return;
    const time = controller.getSnapshot().timeWindow;
    const progress = clampToCycle && time?.repeating
      ? Math.min(pointerProgress, time.sourceDuration / time.duration)
      : pointerProgress;
    options.invalidatePlayheadVisibility();
    controller.seek(progress);
  };

  const finishDrag = (event: PointerEvent, seek: boolean): void => {
    if (event.pointerId !== pointerId) return;
    if (seek) seekFromPointer(event, true);
    if (elements.playhead.hasPointerCapture?.(event.pointerId)) {
      elements.playhead.releasePointerCapture(event.pointerId);
    }
    pointerId = undefined;
    elements.playhead.dataset.dragState = "idle";
  };

  const onTimelinePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !controller.getSnapshot().view.transport.canSeek) return;
    if (isScrollbarPointer(event)) return;
    const playheadTarget = event.target instanceof Element
      && event.target.closest("[data-role='playhead']") === elements.playhead;
    if (playheadTarget) {
      event.preventDefault();
      pointerId = event.pointerId;
      elements.playhead.dataset.dragState = "active";
      elements.playhead.setPointerCapture?.(event.pointerId);
      controller.pause();
      return;
    }
    if (event.target instanceof Element && event.target.closest("[data-track-key]")) return;
    seekFromPointer(event, true);
  };

  const onPlayheadPointerMove = (event: PointerEvent): void => {
    if (event.pointerId === pointerId) seekFromPointer(event, true);
  };
  const onPlayheadPointerUp = (event: PointerEvent): void => finishDrag(event, true);
  const onPlayheadPointerCancel = (event: PointerEvent): void => finishDrag(event, false);
  const onPlayheadLostPointerCapture = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    pointerId = undefined;
    elements.playhead.dataset.dragState = "idle";
  };

  elements.timelineViewport.addEventListener("pointerdown", onTimelinePointerDown, listenerOptions);
  elements.playhead.addEventListener("pointermove", onPlayheadPointerMove, listenerOptions);
  elements.playhead.addEventListener("pointerup", onPlayheadPointerUp, listenerOptions);
  elements.playhead.addEventListener("pointercancel", onPlayheadPointerCancel, listenerOptions);
  elements.playhead.addEventListener(
    "lostpointercapture",
    onPlayheadLostPointerCapture,
    listenerOptions,
  );

  return {
    isDragging: () => pointerId !== undefined,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (pointerId !== undefined && elements.playhead.hasPointerCapture?.(pointerId)) {
        elements.playhead.releasePointerCapture(pointerId);
      }
      pointerId = undefined;
      elements.playhead.dataset.dragState = "idle";
      eventController.abort();
    },
  };
}
