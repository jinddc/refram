const EDITOR_HEIGHT_PROPERTY = "height";
const EDITOR_HEIGHT_STORAGE_KEY = "motion-lab-devtools-editor-height-ratio";
const MIN_EDITOR_HEIGHT = 180;
const MIN_PREVIEW_HEIGHT = 280;
const KEYBOARD_STEP = 16;
const KEYBOARD_LARGE_STEP = 64;

export interface EditorHeightResizeHandle {
  setCollapsed(collapsed: boolean, collapsedHeight: number): void;
  destroy(): void;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function resizeTarget(container: HTMLElement): HTMLElement {
  const root = container.getRootNode();
  return root instanceof ShadowRoot && root.host instanceof HTMLElement
    ? root.host
    : container;
}

function viewportHeight(target: HTMLElement): number {
  return target.ownerDocument.defaultView?.innerHeight || globalThis.innerHeight || 800;
}

function maximumHeight(target: HTMLElement): number {
  return Math.max(MIN_EDITOR_HEIGHT, viewportHeight(target) - MIN_PREVIEW_HEIGHT);
}

function sessionStorageFor(view: Window | null): Storage | undefined {
  try {
    return view?.sessionStorage;
  } catch {
    return undefined;
  }
}

function readStoredRatio(storage: Storage | undefined): number | undefined {
  if (!storage) return undefined;
  try {
    const ratio = Number(storage.getItem(EDITOR_HEIGHT_STORAGE_KEY));
    return Number.isFinite(ratio) && ratio > 0 ? ratio : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredRatio(storage: Storage | undefined, ratio: number): void {
  if (!storage) return;
  try {
    storage.setItem(EDITOR_HEIGHT_STORAGE_KEY, String(ratio));
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

function clearStoredRatio(storage: Storage | undefined): void {
  if (!storage) return;
  try {
    storage.removeItem(EDITOR_HEIGHT_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

export function createEditorHeightResize(
  container: HTMLElement,
  editorRoot: HTMLElement,
  separator: HTMLElement,
): EditorHeightResizeHandle {
  const target = resizeTarget(container);
  const view = target.ownerDocument.defaultView;
  const storage = sessionStorageFor(view);
  const originalValue = target.style.getPropertyValue(EDITOR_HEIGHT_PROPERTY);
  const originalPriority = target.style.getPropertyPriority(EDITOR_HEIGHT_PROPERTY);
  const eventController = new AbortController();
  const listenerOptions = { signal: eventController.signal };
  let destroyed = false;
  let pointerId: number | undefined;
  let pendingHeight: number | undefined;
  let resizeFrame: number | undefined;
  let overrideRatio = readStoredRatio(storage);
  let currentHeight = MIN_EDITOR_HEIGHT;
  let expandedHeight = MIN_EDITOR_HEIGHT;
  let collapsed = false;

  const measuredHeight = (): number => {
    const measured = target.getBoundingClientRect().height
      || editorRoot.getBoundingClientRect().height;
    return measured > 0
      ? measured
      : clamp(viewportHeight(target) * 0.45, MIN_EDITOR_HEIGHT, maximumHeight(target));
  };

  const updateSemantics = (height: number): void => {
    separator.setAttribute("aria-valuemin", String(MIN_EDITOR_HEIGHT));
    separator.setAttribute("aria-valuemax", String(Math.round(maximumHeight(target))));
    separator.setAttribute("aria-valuenow", String(Math.round(height)));
    separator.setAttribute("aria-valuetext", `${Math.round(height)} pixels high`);
  };

  const applyHeight = (height: number, persist = false): void => {
    currentHeight = clamp(height, MIN_EDITOR_HEIGHT, maximumHeight(target));
    expandedHeight = currentHeight;
    target.style.setProperty(EDITOR_HEIGHT_PROPERTY, `${currentHeight}px`);
    overrideRatio = currentHeight / viewportHeight(target);
    updateSemantics(currentHeight);
    if (persist) writeStoredRatio(storage, overrideRatio);
  };

  const cancelPendingFrame = (): void => {
    if (resizeFrame === undefined) return;
    globalThis.cancelAnimationFrame?.(resizeFrame);
    resizeFrame = undefined;
  };

  const scheduleHeight = (height: number): void => {
    pendingHeight = height;
    if (resizeFrame !== undefined) return;
    const apply = () => {
      resizeFrame = undefined;
      if (destroyed || pendingHeight === undefined) return;
      applyHeight(pendingHeight);
      pendingHeight = undefined;
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
    applyHeight(pendingHeight ?? currentHeight, true);
    pendingHeight = undefined;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (collapsed || event.button !== 0) return;
    event.preventDefault();
    pointerId = event.pointerId;
    separator.dataset.resizeState = "active";
    separator.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    scheduleHeight(viewportHeight(target) - event.clientY);
  };

  const onPointerFinish = (event: PointerEvent): void => {
    finishResize(event, true);
  };

  const onLostPointerCapture = (event: PointerEvent): void => {
    finishResize(event, false);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (collapsed || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const direction = event.key === "ArrowUp" ? 1 : -1;
    const step = event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;
    applyHeight(currentHeight + direction * step, true);
  };

  const reset = (): void => {
    cancelPendingFrame();
    pendingHeight = undefined;
    overrideRatio = undefined;
    if (originalValue) {
      target.style.setProperty(EDITOR_HEIGHT_PROPERTY, originalValue, originalPriority);
    } else {
      target.style.removeProperty(EDITOR_HEIGHT_PROPERTY);
    }
    clearStoredRatio(storage);
    currentHeight = measuredHeight();
    updateSemantics(currentHeight);
  };

  const onViewportResize = (): void => {
    if (collapsed) {
      if (overrideRatio !== undefined) {
        expandedHeight = clamp(
          viewportHeight(target) * overrideRatio,
          MIN_EDITOR_HEIGHT,
          maximumHeight(target),
        );
      }
      return;
    }
    if (overrideRatio !== undefined) {
      applyHeight(viewportHeight(target) * overrideRatio);
    } else {
      currentHeight = clamp(measuredHeight(), MIN_EDITOR_HEIGHT, maximumHeight(target));
      updateSemantics(currentHeight);
    }
  };

  separator.addEventListener("pointerdown", onPointerDown, listenerOptions);
  separator.addEventListener("pointermove", onPointerMove, listenerOptions);
  separator.addEventListener("pointerup", onPointerFinish, listenerOptions);
  separator.addEventListener("pointercancel", onPointerFinish, listenerOptions);
  separator.addEventListener("lostpointercapture", onLostPointerCapture, listenerOptions);
  separator.addEventListener("keydown", onKeyDown, listenerOptions);
  separator.addEventListener("dblclick", reset, listenerOptions);
  view?.addEventListener("resize", onViewportResize, listenerOptions);

  if (overrideRatio !== undefined) {
    applyHeight(viewportHeight(target) * overrideRatio);
  } else {
    currentHeight = clamp(measuredHeight(), MIN_EDITOR_HEIGHT, maximumHeight(target));
    updateSemantics(currentHeight);
  }

  return {
    setCollapsed(nextCollapsed: boolean, collapsedHeight: number): void {
      if (destroyed) return;
      if (nextCollapsed === collapsed) {
        if (collapsed) {
          target.style.setProperty(EDITOR_HEIGHT_PROPERTY, `${collapsedHeight}px`);
        }
        return;
      }
      collapsed = nextCollapsed;
      cancelPendingFrame();
      pendingHeight = undefined;
      if (pointerId !== undefined && separator.hasPointerCapture?.(pointerId)) {
        separator.releasePointerCapture(pointerId);
      }
      pointerId = undefined;
      separator.dataset.resizeState = "idle";
      separator.hidden = collapsed;
      separator.tabIndex = collapsed ? -1 : 0;
      separator.setAttribute("aria-hidden", String(collapsed));
      if (collapsed) {
        expandedHeight = currentHeight;
        target.style.setProperty(EDITOR_HEIGHT_PROPERTY, `${collapsedHeight}px`);
      } else {
        applyHeight(expandedHeight);
      }
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      eventController.abort();
      cancelPendingFrame();
      pendingHeight = undefined;
      if (pointerId !== undefined && separator.hasPointerCapture?.(pointerId)) {
        separator.releasePointerCapture(pointerId);
      }
      pointerId = undefined;
      separator.dataset.resizeState = "idle";
      if (originalValue) {
        target.style.setProperty(EDITOR_HEIGHT_PROPERTY, originalValue, originalPriority);
      } else {
        target.style.removeProperty(EDITOR_HEIGHT_PROPERTY);
      }
    },
  };
}
