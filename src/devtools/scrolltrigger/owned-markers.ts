import type { gsap } from "gsap";
import {
  calculateOwnedMarkerGeometry,
  type MarkerTriggerLike,
  type ScrollTriggerMarkerType,
} from "./marker-geometry";

const HIDDEN_ATTRIBUTE = "data-motion-devtools-marker-hidden";
const SELECTED_ATTRIBUTE = "data-motion-devtools-marker-selected";
const VIEWPORT_SCROLLER_ATTRIBUTE = "data-motion-devtools-marker-viewport-scroller";
const STYLE_ATTRIBUTE = "data-motion-devtools-marker-visibility";
const OWNED_ATTRIBUTE = "data-motion-devtools-owned-marker";
const OWNED_TYPE_ATTRIBUTE = "data-motion-devtools-owned-marker-type";
const EDITOR_SELECTOR = "motion-devtools-editor";
const INLINE_END_PROPERTY = "--motion-devtools-marker-inline-end";
const SCROLLER_WIDTH_PROPERTY = "--motion-devtools-marker-scroller-width";
const SCROLLER_START_TOP_PROPERTY = "--motion-devtools-marker-scroller-start-top";
const SCROLLER_END_TOP_PROPERTY = "--motion-devtools-marker-scroller-end-top";

interface OwnedMarkerSet {
  readonly document: Document;
  readonly nodes: Readonly<Record<ScrollTriggerMarkerType, HTMLElement>>;
}

interface MarkerDocumentState {
  readonly style: HTMLStyleElement;
  editor: Element | undefined;
  observer: ResizeObserver | undefined;
}

export interface ScrollTriggerOwnedMarkers {
  canCreate(trigger: MarkerTriggerLike | undefined): boolean;
  ensureDocument(document: Document): void;
  reconcile(
    timeline: gsap.core.Timeline,
    trigger: MarkerTriggerLike | undefined,
    visible: boolean,
  ): void;
  removeMissing(timelines: ReadonlySet<gsap.core.Timeline>): void;
  measureDocument(document: Document | undefined): () => void;
  sampleVisible(
    timeline: gsap.core.Timeline,
    trigger: MarkerTriggerLike,
    viewportScrollerAnchor: HTMLElement | undefined,
  ): void;
  destroy(): void;
}

function markerDocument(trigger: MarkerTriggerLike): Document | undefined {
  return trigger.trigger?.ownerDocument
    ?? (trigger.scroller instanceof Element ? trigger.scroller.ownerDocument : globalThis.document);
}

export function createScrollTriggerOwnedMarkers(): ScrollTriggerOwnedMarkers {
  const documents = new Map<Document, MarkerDocumentState>();
  const ownedByTimeline = new Map<gsap.core.Timeline, OwnedMarkerSet>();

  const visibleBottom = (document: Document, state: MarkerDocumentState): number | undefined => {
    const editorTop = state.editor?.getBoundingClientRect().top;
    return editorTop !== undefined && editorTop > 0
      ? editorTop
      : document.defaultView?.innerHeight;
  };

  const renderStyle = (
    state: MarkerDocumentState,
    measuredVisibleBottom: number | undefined,
  ): void => {
    const scrollerStartRule = measuredVisibleBottom === undefined
      ? ""
      : `[${SELECTED_ATTRIBUTE}][${VIEWPORT_SCROLLER_ATTRIBUTE}].gsap-marker-scroller-start { top: var(${SCROLLER_START_TOP_PROPERTY}, ${Math.max(0, measuredVisibleBottom - 2)}px) !important; }`;
    state.style.textContent = `
[${HIDDEN_ATTRIBUTE}] { display: none !important; }
[${OWNED_ATTRIBUTE}] {
  position: fixed;
  z-index: 2147483646;
  box-sizing: content-box;
  width: max-content;
  height: auto;
  padding: 4px 8px;
  border-top: 1px solid currentColor;
  pointer-events: none;
  white-space: nowrap;
  font: normal 16px/normal sans-serif, Arial;
  color: green;
}
[${OWNED_ATTRIBUTE}][${OWNED_TYPE_ATTRIBUTE}="end"],
[${OWNED_ATTRIBUTE}][${OWNED_TYPE_ATTRIBUTE}="scroller-end"] {
  color: red;
}
[${OWNED_ATTRIBUTE}][${OWNED_TYPE_ATTRIBUTE}^="scroller-"] {
  box-sizing: border-box;
  border-top-style: dashed;
  opacity: 0.8;
  text-align: left;
}
[${OWNED_ATTRIBUTE}][${OWNED_TYPE_ATTRIBUTE}="start"],
[${OWNED_ATTRIBUTE}][${OWNED_TYPE_ATTRIBUTE}="scroller-start"] {
  transform: translateY(-100%);
  border-top: 0;
  border-bottom: 1px solid currentColor;
}
[${OWNED_ATTRIBUTE}][${OWNED_TYPE_ATTRIBUTE}="scroller-start"] {
  border-bottom-style: dashed;
}
[${SELECTED_ATTRIBUTE}].gsap-marker-start,
[${SELECTED_ATTRIBUTE}].gsap-marker-end {
  left: auto !important;
  right: var(${INLINE_END_PROPERTY}, 0px) !important;
}
[${SELECTED_ATTRIBUTE}].gsap-marker-scroller-end {
  box-sizing: border-box !important;
  width: var(${SCROLLER_WIDTH_PROPERTY}, auto) !important;
}
${scrollerStartRule}
[${SELECTED_ATTRIBUTE}][${VIEWPORT_SCROLLER_ATTRIBUTE}].gsap-marker-scroller-end {
  top: var(${SCROLLER_END_TOP_PROPERTY}, 0px) !important;
}
`;
  };

  const syncEditor = (document: Document, state: MarkerDocumentState): void => {
    const editor = document.querySelector(EDITOR_SELECTOR) ?? undefined;
    if (state.editor === editor) return;
    state.observer?.disconnect();
    state.editor = editor;
    state.observer = undefined;
    if (editor && typeof ResizeObserver !== "undefined") {
      state.observer = new ResizeObserver(() => {
        renderStyle(state, visibleBottom(document, state));
      });
      state.observer.observe(editor);
    }
  };

  const ensureDocument = (document: Document): void => {
    const existing = documents.get(document);
    if (existing) {
      syncEditor(document, existing);
      return;
    }
    const style = document.createElement("style");
    style.setAttribute(STYLE_ATTRIBUTE, "");
    document.head.append(style);
    const state: MarkerDocumentState = { style, editor: undefined, observer: undefined };
    documents.set(document, state);
    syncEditor(document, state);
    renderStyle(state, visibleBottom(document, state));
  };

  const canCreate = (trigger: MarkerTriggerLike | undefined): boolean => Boolean(
    trigger
      && markerDocument(trigger)
      && Number.isFinite(trigger.start)
      && Number.isFinite(trigger.end)
      && typeof trigger.scroll === "function",
  );

  const remove = (timeline: gsap.core.Timeline): void => {
    const owned = ownedByTimeline.get(timeline);
    if (!owned) return;
    for (const marker of Object.values(owned.nodes)) marker.remove();
    ownedByTimeline.delete(timeline);
  };

  const create = (
    timeline: gsap.core.Timeline,
    trigger: MarkerTriggerLike,
  ): OwnedMarkerSet | undefined => {
    const document = markerDocument(trigger);
    if (!document) return undefined;
    ensureDocument(document);
    const createNode = (type: ScrollTriggerMarkerType, label: string): HTMLElement => {
      const marker = document.createElement("div");
      marker.setAttribute(OWNED_ATTRIBUTE, "");
      marker.setAttribute(OWNED_TYPE_ATTRIBUTE, type);
      marker.setAttribute("aria-hidden", "true");
      marker.textContent = label;
      document.body.append(marker);
      return marker;
    };
    const owned = {
      document,
      nodes: {
        start: createNode("start", "start"),
        end: createNode("end", "end"),
        "scroller-start": createNode("scroller-start", "scroller start"),
        "scroller-end": createNode("scroller-end", "scroller end"),
      },
    } satisfies OwnedMarkerSet;
    ownedByTimeline.set(timeline, owned);
    return owned;
  };

  return {
    canCreate,
    ensureDocument,
    reconcile(timeline, trigger, visible) {
      if (visible && canCreate(trigger)) {
        if (!ownedByTimeline.has(timeline)) create(timeline, trigger!);
      } else {
        remove(timeline);
      }
    },
    removeMissing(timelines) {
      for (const timeline of ownedByTimeline.keys()) {
        if (!timelines.has(timeline)) remove(timeline);
      }
    },
    measureDocument(document) {
      const state = document ? documents.get(document) : undefined;
      if (document && state) syncEditor(document, state);
      const measuredVisibleBottom = document && state
        ? visibleBottom(document, state)
        : undefined;
      return () => {
        if (state) renderStyle(state, measuredVisibleBottom);
      };
    },
    sampleVisible(timeline, trigger, viewportScrollerAnchor) {
      const owned = ownedByTimeline.get(timeline);
      const view = owned?.document.defaultView;
      if (!owned || !view || typeof trigger.scroll !== "function") return;

      const scroll = trigger.scroll();
      const start = trigger.start;
      const end = trigger.end;
      if (![scroll, start, end].every(Number.isFinite)) return;
      const editorTop = owned.document.querySelector(EDITOR_SELECTOR)?.getBoundingClientRect().top;
      const scrollerRect = trigger.scroller instanceof Element
        ? trigger.scroller.getBoundingClientRect()
        : undefined;
      const viewportScrollerAnchorRect = viewportScrollerAnchor?.getBoundingClientRect();
      const scrollerMarkerWidth = Math.max(
        owned.nodes["scroller-start"].getBoundingClientRect().width,
        owned.nodes["scroller-end"].getBoundingClientRect().width,
      );
      owned.nodes["scroller-start"].style.width = `${scrollerMarkerWidth}px`;
      owned.nodes["scroller-end"].style.width = `${scrollerMarkerWidth}px`;
      const geometry = calculateOwnedMarkerGeometry({
        viewportWidth: view.innerWidth,
        viewportHeight: view.innerHeight,
        editorTop,
        scrollerRect,
        viewportScrollerAnchorRect,
        scroll,
        start: start!,
        end: end!,
        scrollerMarkerWidth,
      });
      if (!geometry) return;

      for (const [type, marker] of Object.entries(owned.nodes) as [
        ScrollTriggerMarkerType,
        HTMLElement,
      ][]) {
        marker.style.top = `${geometry.positions[type]}px`;
        marker.style.left = "auto";
        marker.style.right = `${type.startsWith("scroller-")
          ? geometry.scrollerInlineEnd
          : geometry.contentInlineEnd}px`;
      }
    },
    destroy() {
      for (const timeline of [...ownedByTimeline.keys()]) remove(timeline);
      for (const state of documents.values()) {
        state.observer?.disconnect();
        state.style.remove();
      }
      documents.clear();
    },
  };
}
