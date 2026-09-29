import {
  createEditorController,
  type EditorController,
  type EditorControllerOptions,
  type EditorSnapshot,
} from "../editor-controller";
import {
  createEditorUiElements,
  EDITOR_TIMELINE_EDGE_GUTTER,
} from "./dom";
import { createEditorHeightResize } from "./editor-height-resize";
import { renderEditorUi } from "./render";
import { createSelectionHighlightOverlay } from "./selection-highlight-overlay";

export interface EditorUiHandle {
  readonly controller: EditorController;
  destroy(): void;
}

export interface EditorUiOptions extends EditorControllerOptions {
  readonly controller?: EditorController;
}

type EditorPane = "timelines" | "timeline";

const EDITOR_PANES = ["timelines", "timeline"] as const;
const EDITOR_TIMELINE_BOUNDARY_SNAP_PIXELS = 1;
const EDITOR_MIN_ZOOM = 0.5;
const EDITOR_MAX_ZOOM = 4;

export function mountEditorUi(
  container: HTMLElement,
  options: EditorUiOptions = {},
): EditorUiHandle {
  const ownsController = options.controller === undefined;
  const controller = options.controller ?? createEditorController(options);
  const elements = createEditorUiElements();
  const selectionHighlight = createSelectionHighlightOverlay(container.ownerDocument);
  const eventController = new AbortController();
  const listenerOptions = { signal: eventController.signal };
  let destroyed = false;
  let dragPointerId: number | undefined;
  let inspectorTriggerKey: string | undefined;
  let inspectorTriggerClass: string | undefined;
  let timelineListVisible = true;
  let timelineZoom = 1;
  let timelineFit = false;

  const setInspectorOpen = (open: boolean): void => {
    elements.root.dataset.inspectorOpen = String(open);
    elements.inspectorPane.hidden = !open;
  };

  const closeInspector = (restoreFocus = false): void => {
    setInspectorOpen(false);
    controller.clearTrackSelection();
    if (!restoreFocus || !inspectorTriggerKey) return;
    [...elements.root.querySelectorAll<HTMLElement>("[data-track-key]")]
      .find((control) => control.dataset.trackKey === inspectorTriggerKey
        && control.className === inspectorTriggerClass)
      ?.focus();
  };

  const setTimelineListVisible = (visible: boolean): void => {
    timelineListVisible = visible;
    elements.root.dataset.timelinesVisible = String(visible);
    elements.timelineListToggle.setAttribute("aria-expanded", String(visible));
    const label = visible ? "Hide timelines pane" : "Show timelines pane";
    elements.timelineListToggle.setAttribute("aria-label", label);
    elements.timelineListToggle.title = label;
  };

  const setActivePane = (pane: EditorPane, focus = false): void => {
    closeInspector();
    elements.root.dataset.activePane = pane;
    for (const tab of elements.paneTabs) {
      const selected = tab.dataset.paneTarget === pane;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    }
    for (const panel of [
      elements.timelineListPane,
      elements.timelinePane,
    ]) {
      panel.dataset.active = String(panel.dataset.pane === pane);
    }
  };

  const render = (snapshot: EditorSnapshot): void => {
    if (destroyed) return;
    selectionHighlight.update(
      snapshot.selectedItem?.sources ?? [],
      snapshot.selectedItem?.label,
    );
    renderEditorUi(elements, snapshot.view, timelineZoom, timelineFit);
    elements.zoomLevel.value = timelineFit ? "Fit" : `${Math.round(timelineZoom * 100)}%`;
    elements.zoomLevel.textContent = elements.zoomLevel.value;
    elements.fitButton.setAttribute("aria-pressed", String(timelineFit));
    elements.zoomOutButton.disabled = timelineFit || timelineZoom <= EDITOR_MIN_ZOOM;
    elements.zoomInButton.disabled = !timelineFit && timelineZoom >= EDITOR_MAX_ZOOM;
  };

  const setTimelineZoom = (zoom: number): void => {
    const next = Math.min(EDITOR_MAX_ZOOM, Math.max(EDITOR_MIN_ZOOM, zoom));
    const progress = controller.getSnapshot().view.time?.progress ?? 0;
    const oldOffset = progress * elements.timelineContent.scrollWidth
      - elements.timelineViewport.scrollLeft;
    timelineZoom = next;
    timelineFit = false;
    render(controller.getSnapshot());
    elements.timelineViewport.scrollLeft = Math.max(
      0,
      progress * elements.timelineContent.scrollWidth - oldOffset,
    );
  };

  const fitTimeline = (): void => {
    timelineFit = true;
    elements.timelineViewport.scrollLeft = 0;
    render(controller.getSnapshot());
  };

  const onClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const pane = target.closest<HTMLElement>("[data-pane-target]")?.dataset.paneTarget;
    if (pane && EDITOR_PANES.includes(pane as EditorPane)) {
      setActivePane(pane as EditorPane);
      return;
    }
    const timelineId = target.closest<HTMLElement>("[data-timeline-id]")?.dataset.timelineId;
    if (timelineId) {
      if (controller.selectTimeline(timelineId)) setActivePane("timeline");
      return;
    }
    const trackKey = target.closest<HTMLElement>("[data-track-key]")?.dataset.trackKey;
    if (trackKey) {
      const clickedTrackControl = target.closest<HTMLElement>("[data-track-key]");
      const clickedClass = clickedTrackControl?.className;
      if (controller.selectTrack(trackKey)) {
        inspectorTriggerKey = trackKey;
        inspectorTriggerClass = clickedClass;
        setInspectorOpen(true);
      }
      return;
    }
    switch (target.closest<HTMLElement>("[data-action]")?.dataset.action) {
      case "close-inspector":
        closeInspector(true);
        break;
      case "toggle-timelines":
        setTimelineListVisible(!timelineListVisible);
        break;
      case "play":
        controller.play();
        break;
      case "pause":
        controller.pause();
        break;
      case "replay":
        controller.replay();
        break;
      case "toggle-reverse":
        controller.setReversed(!controller.getSnapshot().view.transport.reversed);
        break;
      case "toggle-loop":
        controller.setLooping(!controller.getSnapshot().view.transport.looping);
        break;
      case "fit-timeline":
        fitTimeline();
        break;
      case "zoom-out": {
        setTimelineZoom(timelineZoom / 1.25);
        break;
      }
      case "zoom-in": {
        setTimelineZoom(timelineFit ? 1 : timelineZoom * 1.25);
        break;
      }
    }
  };

  const onChange = (event: Event): void => {
    if (event.target !== elements.speedSelect) return;
    controller.setTimeScale(Number(elements.speedSelect.value));
  };

  const progressAt = (clientX: number): number | undefined => {
    const bounds = elements.timelineContent.getBoundingClientRect();
    const width = bounds.width - EDITOR_TIMELINE_EDGE_GUTTER * 2;
    if (width <= 0) return undefined;
    const progress = Math.min(1, Math.max(
      0,
      (clientX - bounds.left - EDITOR_TIMELINE_EDGE_GUTTER) / width,
    ));
    const time = controller.getSnapshot().timeWindow;
    if (!time?.repeating) return progress;
    const cycleProgress = time.sourceDuration / time.duration;
    const nearestBoundary = Math.round(progress / cycleProgress) * cycleProgress;
    return nearestBoundary > 0
      && nearestBoundary <= 1
      && Math.abs(progress - nearestBoundary) * width <= EDITOR_TIMELINE_BOUNDARY_SNAP_PIXELS
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
    controller.seek(progress);
  };

  const finishPlayheadDrag = (event: PointerEvent, seek: boolean): void => {
    if (event.pointerId !== dragPointerId) return;
    if (seek) seekFromPointer(event, true);
    if (elements.playhead.hasPointerCapture?.(event.pointerId)) {
      elements.playhead.releasePointerCapture(event.pointerId);
    }
    dragPointerId = undefined;
    elements.playhead.dataset.dragState = "idle";
  };

  const onTimelinePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !controller.getSnapshot().view.transport.canSeek) return;
    if (isScrollbarPointer(event)) return;
    if (event.target === elements.playhead) {
      event.preventDefault();
      dragPointerId = event.pointerId;
      elements.playhead.dataset.dragState = "active";
      elements.playhead.setPointerCapture?.(event.pointerId);
      controller.pause();
      return;
    }
    if (event.target instanceof Element && event.target.closest("[data-track-key]")) return;
    seekFromPointer(event, true);
  };
  const onPlayheadPointerMove = (event: PointerEvent): void => {
    if (event.pointerId === dragPointerId) seekFromPointer(event, true);
  };
  const onPlayheadPointerUp = (event: PointerEvent): void => {
    finishPlayheadDrag(event, true);
  };
  const onPlayheadPointerCancel = (event: PointerEvent): void => {
    finishPlayheadDrag(event, false);
  };
  const onPlayheadLostPointerCapture = (event: PointerEvent): void => {
    if (event.pointerId !== dragPointerId) return;
    dragPointerId = undefined;
    elements.playhead.dataset.dragState = "idle";
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const paneTab = event.target instanceof HTMLElement
      ? event.target.closest<HTMLButtonElement>("[data-pane-target]")
      : null;
    if (paneTab) {
      const currentIndex = elements.paneTabs.indexOf(paneTab);
      const nextIndex = event.code === "ArrowLeft"
        ? (currentIndex + elements.paneTabs.length - 1) % elements.paneTabs.length
        : event.code === "ArrowRight"
          ? (currentIndex + 1) % elements.paneTabs.length
          : event.code === "Home"
            ? 0
            : event.code === "End"
              ? elements.paneTabs.length - 1
              : undefined;
      if (nextIndex !== undefined) {
        event.preventDefault();
        const pane = elements.paneTabs[nextIndex]?.dataset.paneTarget as EditorPane | undefined;
        if (pane) setActivePane(pane, true);
        return;
      }
    }
    if (event.target === elements.playhead) {
      const progress = controller.getSnapshot().view.time?.progress ?? 0;
      const next = event.code === "ArrowLeft" || event.code === "ArrowDown"
        ? progress - 0.01
        : event.code === "ArrowRight" || event.code === "ArrowUp"
          ? progress + 0.01
          : event.code === "Home"
            ? 0
            : event.code === "End"
              ? 1
              : undefined;
      if (next !== undefined) {
        event.preventDefault();
        controller.pause();
        controller.seek(Math.min(1, Math.max(0, next)));
        return;
      }
    }
    const formControl = event.target instanceof HTMLSelectElement
      || event.target instanceof HTMLButtonElement
      || event.target instanceof HTMLInputElement;
    if (!formControl && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (event.code === "KeyL") {
        event.preventDefault();
        const transport = controller.getSnapshot().view.transport;
        controller.setLooping(!transport.looping);
        return;
      }
      if (event.code === "KeyF") {
        event.preventDefault();
        fitTimeline();
        return;
      }
    }
    if (event.code !== "Space" || formControl) return;
    event.preventDefault();
    const transport = controller.getSnapshot().view.transport;
    if (transport.canPause) controller.pause();
    else if (transport.canPlay) controller.play();
  };

  setTimelineListVisible(true);
  setActivePane("timeline");
  container.append(elements.root);
  const heightResize = createEditorHeightResize(
    container,
    elements.root,
    elements.heightSeparator,
  );
  elements.root.addEventListener("click", onClick, listenerOptions);
  elements.root.addEventListener("change", onChange, listenerOptions);
  elements.root.addEventListener("keydown", onKeyDown, listenerOptions);
  elements.timelineViewport.addEventListener(
    "pointerdown",
    onTimelinePointerDown,
    listenerOptions,
  );
  elements.playhead.addEventListener("pointermove", onPlayheadPointerMove, listenerOptions);
  elements.playhead.addEventListener("pointerup", onPlayheadPointerUp, listenerOptions);
  elements.playhead.addEventListener("pointercancel", onPlayheadPointerCancel, listenerOptions);
  elements.playhead.addEventListener(
    "lostpointercapture",
    onPlayheadLostPointerCapture,
    listenerOptions,
  );
  const unsubscribe = controller.subscribe(render);

  return {
    controller,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (dragPointerId !== undefined
        && elements.playhead.hasPointerCapture?.(dragPointerId)) {
        elements.playhead.releasePointerCapture(dragPointerId);
      }
      dragPointerId = undefined;
      eventController.abort();
      unsubscribe();
      heightResize.destroy();
      selectionHighlight.destroy();
      elements.root.remove();
      if (ownsController) controller.destroy();
    },
  };
}
