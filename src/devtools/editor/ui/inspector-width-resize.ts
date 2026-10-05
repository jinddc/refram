import type { EditorUiElements } from "./dom";

const INSPECTOR_WIDTH_PROPERTY = "--rf-inspector-width";
const MIN_INSPECTOR_WIDTH = 240;
const DEFAULT_INSPECTOR_WIDTH = 300;
const MIN_TIMELINE_WIDTH = 520;
const DESKTOP_MIN_WIDTH = 961;
const KEYBOARD_STEP = 16;
const KEYBOARD_LARGE_STEP = 64;

export interface InspectorWidthResizeHandle {
  setOpen(open: boolean): void;
  revalidate(): void;
  destroy(): void;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createInspectorWidthResize(
  elements: EditorUiElements,
): InspectorWidthResizeHandle {
  const { root, inspectorWidthSeparator: separator } = elements;
  const view = root.ownerDocument.defaultView;
  const originalValue = root.style.getPropertyValue(INSPECTOR_WIDTH_PROPERTY);
  const originalPriority = root.style.getPropertyPriority(INSPECTOR_WIDTH_PROPERTY);
  const eventController = new AbortController();
  const listenerOptions = { signal: eventController.signal };
  let destroyed = false;
  let open = false;
  let pointerId: number | undefined;
  let pointerStartX = 0;
  let pointerStartWidth = DEFAULT_INSPECTOR_WIDTH;
  let pendingWidth: number | undefined;
  let resizeFrame: number | undefined;
  let currentWidth = DEFAULT_INSPECTOR_WIDTH;

  const isDesktop = (): boolean => (view?.innerWidth ?? globalThis.innerWidth ?? 1024)
    >= DESKTOP_MIN_WIDTH;

  const maximumWidth = (): number => {
    const workspace = root.querySelector<HTMLElement>("[data-role='workspace']");
    if (!workspace) return MIN_INSPECTOR_WIDTH;
    const workspaceWidth = workspace.getBoundingClientRect().width;
    const timelineOffset = elements.timelinePane.getBoundingClientRect().left
      - workspace.getBoundingClientRect().left;
    return Math.max(
      MIN_INSPECTOR_WIDTH,
      workspaceWidth - Math.max(0, timelineOffset) - MIN_TIMELINE_WIDTH,
    );
  };

  const updateSemantics = (width: number): void => {
    separator.setAttribute("aria-valuemin", String(MIN_INSPECTOR_WIDTH));
    separator.setAttribute("aria-valuemax", String(Math.round(maximumWidth())));
    separator.setAttribute("aria-valuenow", String(Math.round(width)));
    separator.setAttribute("aria-valuetext", `${Math.round(width)} pixels wide`);
  };

  const applyWidth = (width: number): void => {
    currentWidth = clamp(width, MIN_INSPECTOR_WIDTH, maximumWidth());
    root.style.setProperty(INSPECTOR_WIDTH_PROPERTY, `${currentWidth}px`);
    updateSemantics(currentWidth);
  };

  const cancelPendingFrame = (): void => {
    if (resizeFrame === undefined) return;
    globalThis.cancelAnimationFrame?.(resizeFrame);
    resizeFrame = undefined;
  };

  const scheduleWidth = (width: number): void => {
    pendingWidth = width;
    if (resizeFrame !== undefined) return;
    const apply = () => {
      resizeFrame = undefined;
      if (destroyed || pendingWidth === undefined) return;
      applyWidth(pendingWidth);
      pendingWidth = undefined;
    };
    resizeFrame = typeof globalThis.requestAnimationFrame === "function"
      ? globalThis.requestAnimationFrame(apply)
      : (apply(), undefined);
  };

  const finishResize = (event: PointerEvent, releaseCapture: boolean): void => {
    if (event.pointerId !== pointerId) return;
    pointerId = undefined;
    if (releaseCapture && separator.hasPointerCapture?.(event.pointerId)) {
      separator.releasePointerCapture(event.pointerId);
    }
    separator.dataset.resizeState = "idle";
    cancelPendingFrame();
    applyWidth(pendingWidth ?? currentWidth);
    pendingWidth = undefined;
  };

  const cancelActiveResize = (): void => {
    cancelPendingFrame();
    pendingWidth = undefined;
    if (pointerId !== undefined && separator.hasPointerCapture?.(pointerId)) {
      separator.releasePointerCapture(pointerId);
    }
    pointerId = undefined;
    separator.dataset.resizeState = "idle";
  };

  const syncAvailability = (): void => {
    const available = open && isDesktop();
    if (!available) cancelActiveResize();
    separator.hidden = !available;
    separator.tabIndex = available ? 0 : -1;
    separator.setAttribute("aria-hidden", String(!available));
    if (available) applyWidth(currentWidth);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!open || !isDesktop() || event.button !== 0) return;
    event.preventDefault();
    pointerId = event.pointerId;
    pointerStartX = event.clientX;
    pointerStartWidth = currentWidth;
    separator.dataset.resizeState = "active";
    separator.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    scheduleWidth(pointerStartWidth + pointerStartX - event.clientX);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const maximum = maximumWidth();
    const next = event.key === "ArrowLeft"
      ? currentWidth + (event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP)
      : event.key === "ArrowRight"
        ? currentWidth - (event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP)
        : event.key === "Home"
          ? MIN_INSPECTOR_WIDTH
          : event.key === "End"
            ? maximum
            : undefined;
    if (next === undefined) return;
    event.preventDefault();
    applyWidth(next);
  };

  const reset = (): void => {
    cancelPendingFrame();
    pendingWidth = undefined;
    applyWidth(DEFAULT_INSPECTOR_WIDTH);
  };

  const onViewportResize = (): void => {
    syncAvailability();
    if (open && isDesktop()) scheduleWidth(currentWidth);
  };

  separator.addEventListener("pointerdown", onPointerDown, listenerOptions);
  separator.addEventListener("pointermove", onPointerMove, listenerOptions);
  separator.addEventListener("pointerup", (event) => finishResize(event, true), listenerOptions);
  separator.addEventListener("pointercancel", (event) => finishResize(event, true), listenerOptions);
  separator.addEventListener(
    "lostpointercapture",
    (event) => finishResize(event, false),
    listenerOptions,
  );
  separator.addEventListener("keydown", onKeyDown, listenerOptions);
  separator.addEventListener("dblclick", reset, listenerOptions);
  view?.addEventListener("resize", onViewportResize, listenerOptions);

  return {
    setOpen(nextOpen: boolean): void {
      if (destroyed) return;
      open = nextOpen;
      syncAvailability();
    },
    revalidate(): void {
      if (destroyed || !open || !isDesktop()) return;
      applyWidth(currentWidth);
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      eventController.abort();
      cancelActiveResize();
      if (originalValue) {
        root.style.setProperty(INSPECTOR_WIDTH_PROPERTY, originalValue, originalPriority);
      } else {
        root.style.removeProperty(INSPECTOR_WIDTH_PROPERTY);
      }
    },
  };
}
