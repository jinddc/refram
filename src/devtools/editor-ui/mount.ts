import {
  createEditorController,
  type EditorController,
  type EditorControllerOptions,
  type EditorSnapshot,
} from "../editor-controller";
import { createEditorUiElements } from "./dom";
import { renderEditorUi } from "./render";

export interface EditorUiHandle {
  readonly controller: EditorController;
  destroy(): void;
}

export interface EditorUiOptions extends EditorControllerOptions {
  readonly controller?: EditorController;
}

export function mountEditorUi(
  container: HTMLElement,
  options: EditorUiOptions = {},
): EditorUiHandle {
  const ownsController = options.controller === undefined;
  const controller = options.controller ?? createEditorController(options);
  const elements = createEditorUiElements();
  let destroyed = false;
  let mountedPreview: HTMLElement | undefined;
  let previewParent: Node | undefined;
  let previewNextSibling: Node | null | undefined;
  let selectedSources: readonly Element[] = [];
  let dragPointerId: number | undefined;

  const restorePreview = (): void => {
    if (!mountedPreview) return;
    if (previewParent) {
      const anchor = previewNextSibling?.parentNode === previewParent
        ? previewNextSibling
        : null;
      previewParent.insertBefore(mountedPreview, anchor);
    } else {
      mountedPreview.remove();
    }
    mountedPreview = undefined;
    previewParent = undefined;
    previewNextSibling = undefined;
  };

  const mountPreview = (root: HTMLElement | undefined): void => {
    if (mountedPreview === root) return;
    restorePreview();
    if (!root) {
      elements.emptyPreview.hidden = false;
      return;
    }
    previewParent = root.parentNode ?? undefined;
    previewNextSibling = root.nextSibling;
    mountedPreview = root;
    elements.emptyPreview.hidden = true;
    elements.previewSurface.append(root);
  };

  const highlightSelection = (snapshot: EditorSnapshot): void => {
    for (const source of selectedSources) source.removeAttribute("data-devtools-editor-selected");
    selectedSources = snapshot.selectedItem?.sources ?? [];
    for (const source of selectedSources) source.setAttribute("data-devtools-editor-selected", "true");
  };

  const render = (snapshot: EditorSnapshot): void => {
    if (destroyed) return;
    mountPreview(snapshot.previewRoot);
    highlightSelection(snapshot);
    renderEditorUi(elements, snapshot.view);
  };

  const onClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trackKey = target.closest<HTMLElement>("[data-track-key]")?.dataset.trackKey;
    if (trackKey) {
      controller.selectTrack(trackKey);
      return;
    }
    switch (target.closest<HTMLElement>("[data-action]")?.dataset.action) {
      case "play":
        controller.play();
        break;
      case "pause":
        controller.pause();
        break;
      case "replay":
        controller.replay();
        break;
    }
  };

  const onTimelineChange = (): void => {
    if (elements.timelineSelect.value) controller.selectTimeline(elements.timelineSelect.value);
  };

  const progressAt = (clientX: number): number | undefined => {
    const bounds = elements.timelineContent.getBoundingClientRect();
    if (bounds.width <= 0) return undefined;
    return Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
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

  const seekFromPointer = (event: PointerEvent): void => {
    const progress = progressAt(event.clientX);
    if (progress !== undefined) controller.seek(progress);
  };

  const finishPlayheadDrag = (event: PointerEvent, seek: boolean): void => {
    if (event.pointerId !== dragPointerId) return;
    if (seek) seekFromPointer(event);
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
    seekFromPointer(event);
  };
  const onPlayheadPointerMove = (event: PointerEvent): void => {
    if (event.pointerId === dragPointerId) seekFromPointer(event);
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
    if (event.code !== "Space" || event.target instanceof HTMLSelectElement
      || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    const transport = controller.getSnapshot().view.transport;
    if (transport.canPause) controller.pause();
    else if (transport.canPlay) controller.play();
  };

  container.append(elements.root);
  elements.root.addEventListener("click", onClick);
  elements.root.addEventListener("keydown", onKeyDown);
  elements.timelineSelect.addEventListener("change", onTimelineChange);
  elements.timelineViewport.addEventListener("pointerdown", onTimelinePointerDown);
  elements.playhead.addEventListener("pointermove", onPlayheadPointerMove);
  elements.playhead.addEventListener("pointerup", onPlayheadPointerUp);
  elements.playhead.addEventListener("pointercancel", onPlayheadPointerCancel);
  elements.playhead.addEventListener("lostpointercapture", onPlayheadLostPointerCapture);
  const unsubscribe = controller.subscribe(render);

  return {
    controller,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      elements.root.removeEventListener("click", onClick);
      elements.root.removeEventListener("keydown", onKeyDown);
      elements.timelineSelect.removeEventListener("change", onTimelineChange);
      elements.timelineViewport.removeEventListener("pointerdown", onTimelinePointerDown);
      elements.playhead.removeEventListener("pointermove", onPlayheadPointerMove);
      elements.playhead.removeEventListener("pointerup", onPlayheadPointerUp);
      elements.playhead.removeEventListener("pointercancel", onPlayheadPointerCancel);
      elements.playhead.removeEventListener("lostpointercapture", onPlayheadLostPointerCapture);
      for (const source of selectedSources) source.removeAttribute("data-devtools-editor-selected");
      selectedSources = [];
      restorePreview();
      elements.root.remove();
      if (ownsController) controller.destroy();
    },
  };
}
