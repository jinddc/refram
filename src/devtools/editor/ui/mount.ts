import {
  createEditorController,
  type EditorController,
  type EditorControllerOptions,
  type EditorSnapshot,
} from "../controller";
import {
  copyTextToClipboard,
  createSelectedTrackDebugJson,
} from "../debug-snapshot";
import {
  createEditorUiElements,
  EDITOR_TIMELINE_EDGE_GUTTER,
} from "./dom";
import {
  createEditorHeightResize,
  type EditorHeightResizeHandle,
} from "./editor-height-resize";
import { getTimelineRulerScale, renderEditorUi } from "./render";
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
const EDITOR_BASE_ZOOM = 1;
const EDITOR_ZOOM_STEP = 0.05;
const EDITOR_FORWARD_FOLLOW_CONTEXT = 0.25;
const EDITOR_REVERSE_FOLLOW_CONTEXT = 0.75;
const EDITOR_MINIMAL_HEIGHT = 75;
const EDITOR_NARROW_MINIMAL_HEIGHT = 102;

function normalizeTimelineZoom(zoom: number): number {
  const clamped = Math.min(EDITOR_MAX_ZOOM, Math.max(EDITOR_MIN_ZOOM, zoom));
  const step = Math.round((clamped - EDITOR_MIN_ZOOM) / EDITOR_ZOOM_STEP);
  return Number((EDITOR_MIN_ZOOM + step * EDITOR_ZOOM_STEP).toFixed(2));
}

function ownsNativeKeyboardBehavior(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(
    "button, input, select, textarea, option, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='combobox'], [role='spinbutton'], [role='slider']",
  ) !== null;
}

export function mountEditorUi(
  container: HTMLElement,
  options: EditorUiOptions = {},
): EditorUiHandle {
  const ownsController = options.controller === undefined;
  const controller = options.controller ?? createEditorController(options);
  const elements = createEditorUiElements();
  elements.zoomRange.min = String(EDITOR_MIN_ZOOM);
  elements.zoomRange.max = String(EDITOR_MAX_ZOOM);
  const selectionHighlight = createSelectionHighlightOverlay(container.ownerDocument);
  const eventController = new AbortController();
  const listenerOptions = { signal: eventController.signal };
  let destroyed = false;
  let dragPointerId: number | undefined;
  let inspectorTriggerKey: string | undefined;
  let inspectorTriggerClass: string | undefined;
  let timelineListVisible = true;
  let timelineZoom = EDITOR_BASE_ZOOM;
  let pendingTimelineZoom: number | undefined;
  let timelineZoomFrame: number | undefined;
  let playheadFollowFrame: number | undefined;
  let playheadWasVisible: boolean | undefined;
  let manualViewportChangePending = false;
  let copyRequest = 0;
  let copyTrackKey: string | undefined;
  let copyFeedbackTimer: ReturnType<typeof setTimeout> | undefined;
  let timelineCollapsed = false;
  let heightResize: EditorHeightResizeHandle | undefined;

  const minimalEditorHeight = (): number => {
    const scrubbed = elements.timelinePane.dataset.timelineMode === "scroll-scrub";
    const narrow = (container.ownerDocument.defaultView?.innerWidth ?? 1024) <= 700;
    return narrow && !scrubbed ? EDITOR_NARROW_MINIMAL_HEIGHT : EDITOR_MINIMAL_HEIGHT;
  };

  const clearCopyFeedbackTimer = (): void => {
    if (copyFeedbackTimer !== undefined) clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = undefined;
  };

  const resetCopyFeedback = (): void => {
    clearCopyFeedbackTimer();
    elements.copyDebugButton.textContent = "Copy debug JSON";
    elements.copyDebugStatus.textContent = "";
    elements.copyDebugStatus.dataset.state = "";
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
        && dragPointerId === undefined
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

  const setTimelineCollapsed = (collapsed: boolean): void => {
    timelineCollapsed = collapsed;
    elements.root.dataset.timelineCollapsed = String(collapsed);
    const label = collapsed ? "Show timeline" : "Hide timeline";
    elements.timelineVisibilityButton.setAttribute("aria-label", label);
    elements.timelineVisibilityButton.setAttribute("aria-expanded", String(!collapsed));
    elements.timelineVisibilityButton.title = label;
    heightResize?.setCollapsed(collapsed, minimalEditorHeight());
    if (heightResize) render(controller.getSnapshot());
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

  const renderZoomControls = (): void => {
    const displayedZoom = pendingTimelineZoom ?? timelineZoom;
    const zoomPercentage = Math.round(displayedZoom * 100);
    elements.zoomRange.value = String(zoomPercentage / 100);
    elements.zoomRange.setAttribute("aria-valuetext", `${zoomPercentage}%`);
    elements.zoomOutButton.disabled = displayedZoom <= EDITOR_MIN_ZOOM;
    elements.zoomInButton.disabled = displayedZoom >= EDITOR_MAX_ZOOM;
  };

  const render = (snapshot: EditorSnapshot): void => {
    if (destroyed) return;
    if (copyTrackKey !== snapshot.view.selectedTrackKey) {
      copyTrackKey = snapshot.view.selectedTrackKey;
      copyRequest += 1;
      resetCopyFeedback();
    }
    selectionHighlight.update(
      snapshot.selectedItem?.sources ?? [],
      snapshot.selectedItem?.label,
    );
    renderEditorUi(elements, snapshot.view, timelineZoom);
    renderZoomControls();
    if (timelineCollapsed && snapshot.view.scrollTrigger?.scrubbed !== true) {
      elements.ruler.setAttribute("aria-label", "Timeline progress ruler from 0% to 100%");
    }
    if (timelineCollapsed) heightResize?.setCollapsed(true, minimalEditorHeight());
    if (snapshot.view.transport.playState === "running") schedulePlayheadFollow();
  };

  const copyInspectorText = async (
    text: string,
    button: HTMLButtonElement,
    description: string,
  ): Promise<void> => {
    const snapshot = controller.getSnapshot();
    const request = ++copyRequest;
    const trackKey = snapshot.view.selectedTrackKey;
    clearCopyFeedbackTimer();
    elements.copyDebugButton.disabled = true;
    button.textContent = "Copying…";
    elements.copyDebugStatus.textContent = "Copying…";
    elements.copyDebugStatus.dataset.state = "pending";
    const copied = await copyTextToClipboard(text, container.ownerDocument);
    if (destroyed || request !== copyRequest
      || controller.getSnapshot().view.selectedTrackKey !== trackKey) return;
    elements.copyDebugButton.disabled = false;
    button.textContent = copied ? "Copied" : "Copy failed";
    elements.copyDebugStatus.textContent = copied
      ? `Copied ${description}.`
      : `Could not copy ${description}. Clipboard access is unavailable.`;
    elements.copyDebugStatus.dataset.state = copied ? "success" : "failure";
    copyFeedbackTimer = setTimeout(() => {
      copyFeedbackTimer = undefined;
      if (destroyed || request !== copyRequest
        || controller.getSnapshot().view.selectedTrackKey !== trackKey) return;
      resetCopyFeedback();
    }, 1_000);
  };

  const copySelectedTrackDebugJson = async (): Promise<void> => {
    const debugJson = createSelectedTrackDebugJson(controller.getSnapshot());
    if (debugJson) await copyInspectorText(debugJson, elements.copyDebugButton, "debug JSON");
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
    render(snapshot);
    const nextScale = getTimelineRulerScale(duration, timelineZoom);
    const nextTimelinePosition = progress * duration / nextScale.domainDuration;
    elements.timelineViewport.scrollLeft = Math.max(
      0,
      nextTimelinePosition * elements.timelineContent.scrollWidth - oldOffset,
    );
  };

  const cancelPendingTimelineZoom = (): void => {
    pendingTimelineZoom = undefined;
    if (timelineZoomFrame !== undefined) {
      cancelAnimationFrame(timelineZoomFrame);
      timelineZoomFrame = undefined;
    }
  };

  const flushPendingTimelineZoom = (): void => {
    if (pendingTimelineZoom === undefined) return;
    const next = pendingTimelineZoom;
    cancelPendingTimelineZoom();
    setTimelineZoom(next);
  };

  const scheduleTimelineZoom = (zoom: number): void => {
    const next = normalizeTimelineZoom(zoom);
    if (next === EDITOR_BASE_ZOOM) {
      cancelPendingTimelineZoom();
      setTimelineZoom(next);
      return;
    }
    pendingTimelineZoom = next;
    renderZoomControls();
    if (timelineZoomFrame !== undefined) return;
    timelineZoomFrame = requestAnimationFrame(() => {
      timelineZoomFrame = undefined;
      if (destroyed || pendingTimelineZoom === undefined) return;
      const next = pendingTimelineZoom;
      pendingTimelineZoom = undefined;
      setTimelineZoom(next);
    });
  };

  const resetTimelineZoom = (): void => {
    cancelPendingTimelineZoom();
    setTimelineZoom(EDITOR_BASE_ZOOM);
    elements.timelineViewport.scrollLeft = 0;
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
      case "toggle-timeline-visibility":
        setTimelineCollapsed(!timelineCollapsed);
        break;
      case "jump-to-scrolltrigger-target":
        controller.jumpToScrollTriggerTarget();
        break;
      case "toggle-scrolltrigger-markers":
        controller.toggleScrollTriggerMarkers();
        break;
      case "copy-debug-json":
        void copySelectedTrackDebugJson();
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
      case "reset-timeline-zoom":
        resetTimelineZoom();
        break;
      case "zoom-out": {
        flushPendingTimelineZoom();
        setTimelineZoom(timelineZoom / 1.25);
        break;
      }
      case "zoom-in": {
        flushPendingTimelineZoom();
        setTimelineZoom(timelineZoom * 1.25);
        break;
      }
    }
  };

  const onChange = (event: Event): void => {
    if (event.target === elements.zoomRange) {
      flushPendingTimelineZoom();
      return;
    }
    if (event.target === elements.speedSelect) {
      controller.setTimeScale(Number(elements.speedSelect.value));
    }
  };

  const onInput = (event: Event): void => {
    if (event.target !== elements.zoomRange) return;
    scheduleTimelineZoom(Number(elements.zoomRange.value));
  };

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
    if (timelineCollapsed && time) {
      return contentProgress * time.sourceDuration / time.duration;
    }
    const duration = time?.duration ?? 12;
    const scale = getTimelineRulerScale(duration, timelineZoom);
    const progress = Math.min(
      1,
      contentProgress * scale.domainDuration / duration,
    );
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
    playheadWasVisible = undefined;
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
    const playheadTarget = event.target instanceof Element
      && event.target.closest("[data-role='playhead']") === elements.playhead;
    if (playheadTarget) {
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
      const view = controller.getSnapshot().view;
      const progress = view.scrollTrigger?.scrubbed
        ? view.scrollTrigger.progress
        : timelineCollapsed && view.time
          ? Math.min(1, Math.max(
            0,
            (view.time.time - view.time.start) / view.time.sourceDuration,
          ))
          : view.time?.progress ?? 0;
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
        const clamped = Math.min(1, Math.max(0, next));
        const seekProgress = timelineCollapsed
          && view.scrollTrigger?.scrubbed !== true
          && view.time
          ? clamped * view.time.sourceDuration / view.time.duration
          : clamped;
        controller.seek(seekProgress);
        return;
      }
    }
    if (ownsNativeKeyboardBehavior(event.target)
      || event.altKey || event.ctrlKey || event.metaKey) return;
    const transport = controller.getSnapshot().view.transport;
    const shortcut = event.code === "Space"
      || event.code === "KeyR"
      || event.code === "KeyL"
      || event.code === "KeyF";
    if (!shortcut) return;
    event.preventDefault();
    if (event.repeat) return;
    if (event.code === "KeyR") {
      controller.setReversed(!transport.reversed);
    } else if (event.code === "KeyL") {
      controller.setLooping(!transport.looping);
    } else if (event.code === "KeyF") {
      resetTimelineZoom();
    } else if (transport.canPause) {
      controller.pause();
    } else if (transport.canPlay) {
      controller.play();
    }
  };

  setTimelineListVisible(true);
  setTimelineCollapsed(false);
  setActivePane("timeline");
  container.append(elements.root);
  heightResize = createEditorHeightResize(
    container,
    elements.root,
    elements.heightSeparator,
  );
  elements.root.addEventListener("click", onClick, listenerOptions);
  elements.root.addEventListener("change", onChange, listenerOptions);
  elements.root.addEventListener("input", onInput, listenerOptions);
  elements.root.addEventListener("keydown", onKeyDown, listenerOptions);
  elements.timelineViewport.addEventListener(
    "scroll",
    () => schedulePlayheadFollow(true),
    listenerOptions,
  );
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
      cancelPendingTimelineZoom();
      clearCopyFeedbackTimer();
      if (playheadFollowFrame !== undefined) cancelAnimationFrame(playheadFollowFrame);
      playheadFollowFrame = undefined;
      eventController.abort();
      unsubscribe();
      heightResize?.destroy();
      selectionHighlight.destroy();
      elements.root.remove();
      if (ownsController) controller.destroy();
    },
  };
}
