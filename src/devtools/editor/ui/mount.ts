import {
  createEditorController,
  type EditorController,
  type EditorControllerOptions,
  type EditorSnapshot,
} from "../controller";
import { createEditorUiElements } from "./dom";
import {
  createEditorHeightResize,
  type EditorHeightResizeHandle,
} from "./editor-height-resize";
import { createClipboardInteraction } from "./interactions/clipboard";
import {
  createPlayheadDrag,
  type PlayheadDragHandle,
} from "./interactions/playhead-drag";
import {
  createTimelineViewport,
  type TimelineViewportHandle,
} from "./interactions/timeline-viewport";
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
const EDITOR_MINIMAL_HEIGHT = 75;
const EDITOR_NARROW_MINIMAL_HEIGHT = 102;

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
  const selectionHighlight = createSelectionHighlightOverlay(container.ownerDocument);
  const clipboard = createClipboardInteraction(
    controller,
    elements,
    container.ownerDocument,
  );
  const eventController = new AbortController();
  const listenerOptions = { signal: eventController.signal };
  let destroyed = false;
  let inspectorTriggerKey: string | undefined;
  let inspectorTriggerClass: string | undefined;
  let timelineListVisible = true;
  let timelineCollapsed = false;
  let heightResize: EditorHeightResizeHandle | undefined;
  let timelineViewport: TimelineViewportHandle;
  let playheadDrag: PlayheadDragHandle | undefined;

  const minimalEditorHeight = (): number => {
    const scrubbed = elements.timelinePane.dataset.timelineMode === "scroll-scrub";
    const narrow = (container.ownerDocument.defaultView?.innerWidth ?? 1024) <= 700;
    return narrow && !scrubbed ? EDITOR_NARROW_MINIMAL_HEIGHT : EDITOR_MINIMAL_HEIGHT;
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

  const render = (snapshot: EditorSnapshot): void => {
    if (destroyed) return;
    clipboard.syncSelectedTrack(snapshot.view.selectedTrackKey);
    selectionHighlight.update(
      snapshot.selectedItem?.sources ?? [],
      snapshot.selectedItem?.label,
    );
    renderEditorUi(elements, snapshot.view, timelineViewport.getZoom());
    timelineViewport.render(snapshot);
    if (timelineCollapsed && snapshot.view.scrollTrigger?.scrubbed !== true) {
      elements.ruler.setAttribute("aria-label", "Timeline progress ruler from 0% to 100%");
    }
    if (timelineCollapsed) heightResize?.setCollapsed(true, minimalEditorHeight());
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
        void clipboard.copySelectedTrackDebugJson();
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
        timelineViewport.resetZoom();
        break;
      case "zoom-out": {
        timelineViewport.zoomBy(1 / 1.25);
        break;
      }
      case "zoom-in": {
        timelineViewport.zoomBy(1.25);
        break;
      }
    }
  };

  const onChange = (event: Event): void => {
    if (event.target === elements.zoomRange) {
      timelineViewport.flushPendingZoom();
      return;
    }
    if (event.target === elements.speedSelect) {
      controller.setTimeScale(Number(elements.speedSelect.value));
    }
  };

  const onInput = (event: Event): void => {
    if (event.target !== elements.zoomRange) return;
    timelineViewport.scheduleZoom(Number(elements.zoomRange.value));
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
      timelineViewport.resetZoom();
    } else if (transport.canPause) {
      controller.pause();
    } else if (transport.canPlay) {
      controller.play();
    }
  };

  timelineViewport = createTimelineViewport(controller, elements, {
    isDragging: () => playheadDrag?.isDragging() ?? false,
    renderSnapshot: render,
  });
  playheadDrag = createPlayheadDrag(controller, elements, {
    getTimelineZoom: timelineViewport.getZoom,
    isTimelineCollapsed: () => timelineCollapsed,
    invalidatePlayheadVisibility: timelineViewport.invalidatePlayheadVisibility,
  });

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
  const unsubscribe = controller.subscribe(render);

  return {
    controller,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      playheadDrag?.destroy();
      timelineViewport.destroy();
      clipboard.destroy();
      eventController.abort();
      unsubscribe();
      heightResize?.destroy();
      selectionHighlight.destroy();
      elements.root.remove();
      if (ownsController) controller.destroy();
    },
  };
}
