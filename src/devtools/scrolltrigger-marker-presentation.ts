import type { gsap } from "gsap";
import type { MotionTimelineRegistration } from "./timeline-registry";

const HIDDEN_ATTRIBUTE = "data-motion-devtools-marker-hidden";
const SELECTED_ATTRIBUTE = "data-motion-devtools-marker-selected";
const VIEWPORT_SCROLLER_ATTRIBUTE = "data-motion-devtools-marker-viewport-scroller";
const STYLE_ATTRIBUTE = "data-motion-devtools-marker-visibility";
const OWNED_ATTRIBUTE = "data-motion-devtools-owned-marker";
const OWNED_TYPE_ATTRIBUTE = "data-motion-devtools-owned-marker-type";
const EDITOR_SELECTOR = "motion-devtools-editor";
const INLINE_END_PROPERTY = "--motion-devtools-marker-inline-end";
const SCROLLER_WIDTH_PROPERTY = "--motion-devtools-marker-scroller-width";
const MARKER_PAIR_GAP = 4;
const OWNED_MARKER_HEIGHT = 15;

interface MarkerTriggerLike {
  readonly start?: number;
  readonly end?: number;
  readonly markerStart?: HTMLElement;
  readonly markerEnd?: HTMLElement;
  readonly trigger?: Element;
  readonly scroller?: Element | Window;
  readonly vars?: Readonly<{
    id?: string;
    markers?: unknown;
  }>;
  scroll?(): number;
}

type MarkerType = "start" | "end" | "scroller-start" | "scroller-end";

interface OwnedMarkerSet {
  readonly document: Document;
  readonly nodes: Readonly<Record<MarkerType, HTMLElement>>;
}

interface OriginalMarkerState {
  readonly text: string | null;
  readonly hiddenAttribute: string | null;
  readonly selectedAttribute: string | null;
  readonly viewportScrollerAttribute: string | null;
  readonly inlineEndProperty: string;
  readonly inlineEndPriority: string;
  readonly scrollerWidthProperty: string;
  readonly scrollerWidthPriority: string;
}

interface MarkerDocumentState {
  readonly style: HTMLStyleElement;
  editor: Element | undefined;
  observer: ResizeObserver | undefined;
}

function scrollTriggerOf(timeline: gsap.core.Timeline): MarkerTriggerLike | undefined {
  return (timeline as gsap.core.Timeline & {
    readonly scrollTrigger?: MarkerTriggerLike;
  }).scrollTrigger;
}

function markerLabel(marker: HTMLElement): string | undefined {
  if (marker.classList.contains("gsap-marker-scroller-start")) return "scroller start";
  if (marker.classList.contains("gsap-marker-scroller-end")) return "scroller end";
  if (marker.classList.contains("gsap-marker-start")) return "start";
  if (marker.classList.contains("gsap-marker-end")) return "end";
  return undefined;
}

function expectedMarkerParent(trigger: MarkerTriggerLike, document: Document): Node {
  return trigger.scroller instanceof Element ? trigger.scroller : document.body;
}

function findScrollerMarker(
  trigger: MarkerTriggerLike,
  document: Document,
  type: "scroller-start" | "scroller-end",
): HTMLElement | undefined {
  const id = trigger.vars?.id?.trim();
  const expectedText = id ? `${type}-${id}` : type;
  const parent = expectedMarkerParent(trigger, document);
  const matches = [...document.querySelectorAll<HTMLElement>(`.gsap-marker-${type}`)]
    .filter((marker) => marker.parentNode === parent && marker.textContent === expectedText);
  return matches.length === 1 ? matches[0] : undefined;
}

function markerNodes(timeline: gsap.core.Timeline): readonly HTMLElement[] {
  const trigger = scrollTriggerOf(timeline);
  if (!trigger?.vars?.markers) return [];
  const document = trigger.markerStart?.ownerDocument
    ?? trigger.markerEnd?.ownerDocument
    ?? (trigger.scroller instanceof Element ? trigger.scroller.ownerDocument : globalThis.document);
  if (!document) return [];
  return [...new Set([
    trigger.markerStart,
    trigger.markerEnd,
    findScrollerMarker(trigger, document, "scroller-start"),
    findScrollerMarker(trigger, document, "scroller-end"),
  ].filter((marker): marker is HTMLElement => marker instanceof HTMLElement))];
}

export interface ScrollTriggerMarkerPresentation {
  activate(timelineId: string, timeline: gsap.core.Timeline): boolean;
  canPresent(timeline: gsap.core.Timeline): boolean;
  isVisible(timelineId: string): boolean;
  setVisible(timelineId: string, timeline: gsap.core.Timeline, visible: boolean): boolean;
  sync(
    registrations: readonly MotionTimelineRegistration[],
    selectedTimelineId: string | undefined,
  ): void;
  destroy(): void;
}

export function createScrollTriggerMarkerPresentation(): ScrollTriggerMarkerPresentation {
  const originals = new Map<HTMLElement, OriginalMarkerState>();
  const documents = new Map<Document, MarkerDocumentState>();
  const nodesByTimeline = new WeakMap<gsap.core.Timeline, readonly HTMLElement[]>();
  const ownedByTimeline = new Map<gsap.core.Timeline, OwnedMarkerSet>();
  const visibilityByTimeline = new Map<string, boolean>();

  const nodesFor = (timeline: gsap.core.Timeline): readonly HTMLElement[] => {
    const cached = nodesByTimeline.get(timeline);
    if (cached?.length) return cached;
    const nodes = markerNodes(timeline);
    nodesByTimeline.set(timeline, nodes);
    return nodes;
  };

  const renderStyle = (document: Document, state: MarkerDocumentState): void => {
    const editorTop = state.editor?.getBoundingClientRect().top;
    const visibleBottom = editorTop !== undefined && editorTop > 0
      ? editorTop
      : document.defaultView?.innerHeight;
    const scrollerStartRule = visibleBottom === undefined
      ? ""
      : `[${SELECTED_ATTRIBUTE}][${VIEWPORT_SCROLLER_ATTRIBUTE}].gsap-marker-scroller-start { top: ${Math.max(0, visibleBottom - 2)}px !important; }`;
    state.style.textContent = `
[${HIDDEN_ATTRIBUTE}] { display: none !important; }
[${OWNED_ATTRIBUTE}] {
  position: fixed;
  z-index: 2147483646;
  box-sizing: border-box;
  width: max-content;
  min-width: 44px;
  height: ${OWNED_MARKER_HEIGHT}px;
  padding-left: 8px;
  border-top: 1px solid currentColor;
  pointer-events: none;
  font: 600 10px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-align: right;
  color: #22c55e;
}
[${OWNED_ATTRIBUTE}][${OWNED_TYPE_ATTRIBUTE}="end"],
[${OWNED_ATTRIBUTE}][${OWNED_TYPE_ATTRIBUTE}="scroller-end"] {
  color: #ef4444;
}
[${OWNED_ATTRIBUTE}][${OWNED_TYPE_ATTRIBUTE}^="scroller-"] {
  border-top-style: dashed;
  opacity: 0.8;
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
`;
  };

  const ensureStyle = (document: Document): void => {
    const existing = documents.get(document);
    const editor = document.querySelector(EDITOR_SELECTOR) ?? undefined;
    if (existing) {
      if (existing.editor !== editor) {
        existing.observer?.disconnect();
        existing.editor = editor;
        if (editor && typeof ResizeObserver !== "undefined") {
          existing.observer = new ResizeObserver(() => renderStyle(document, existing));
          existing.observer.observe(editor);
        } else {
          existing.observer = undefined;
        }
      }
      renderStyle(document, existing);
      return;
    }
    const style = document.createElement("style");
    style.setAttribute(STYLE_ATTRIBUTE, "");
    document.head.append(style);
    const state: MarkerDocumentState = {
      style,
      editor,
      observer: undefined,
    };
    if (editor && typeof ResizeObserver !== "undefined") {
      state.observer = new ResizeObserver(() => renderStyle(document, state));
      state.observer.observe(editor);
    }
    documents.set(document, state);
    renderStyle(document, state);
  };

  const remember = (marker: HTMLElement): void => {
    ensureStyle(marker.ownerDocument);
    if (originals.has(marker)) return;
    originals.set(marker, {
      text: marker.textContent,
      hiddenAttribute: marker.getAttribute(HIDDEN_ATTRIBUTE),
      selectedAttribute: marker.getAttribute(SELECTED_ATTRIBUTE),
      viewportScrollerAttribute: marker.getAttribute(VIEWPORT_SCROLLER_ATTRIBUTE),
      inlineEndProperty: marker.style.getPropertyValue(INLINE_END_PROPERTY),
      inlineEndPriority: marker.style.getPropertyPriority(INLINE_END_PROPERTY),
      scrollerWidthProperty: marker.style.getPropertyValue(SCROLLER_WIDTH_PROPERTY),
      scrollerWidthPriority: marker.style.getPropertyPriority(SCROLLER_WIDTH_PROPERTY),
    });
  };

  const restore = (marker: HTMLElement): void => {
    const original = originals.get(marker);
    if (!original) return;
    marker.textContent = original.text;
    if (original.hiddenAttribute === null) marker.removeAttribute(HIDDEN_ATTRIBUTE);
    else marker.setAttribute(HIDDEN_ATTRIBUTE, original.hiddenAttribute);
    if (original.selectedAttribute === null) marker.removeAttribute(SELECTED_ATTRIBUTE);
    else marker.setAttribute(SELECTED_ATTRIBUTE, original.selectedAttribute);
    if (original.viewportScrollerAttribute === null) {
      marker.removeAttribute(VIEWPORT_SCROLLER_ATTRIBUTE);
    } else {
      marker.setAttribute(VIEWPORT_SCROLLER_ATTRIBUTE, original.viewportScrollerAttribute);
    }
    if (original.inlineEndProperty) {
      marker.style.setProperty(
        INLINE_END_PROPERTY,
        original.inlineEndProperty,
        original.inlineEndPriority,
      );
    } else {
      marker.style.removeProperty(INLINE_END_PROPERTY);
    }
    if (original.scrollerWidthProperty) {
      marker.style.setProperty(
        SCROLLER_WIDTH_PROPERTY,
        original.scrollerWidthProperty,
        original.scrollerWidthPriority,
      );
    } else {
      marker.style.removeProperty(SCROLLER_WIDTH_PROPERTY);
    }
    originals.delete(marker);
  };

  const matchScrollerMarkerWidths = (
    scrollerStart: HTMLElement | undefined,
    scrollerEnd: HTMLElement | undefined,
  ): void => {
    if (!scrollerStart || !scrollerEnd) return;
    scrollerEnd.style.setProperty(
      SCROLLER_WIDTH_PROPERTY,
      `${scrollerStart.getBoundingClientRect().width}px`,
    );
  };

  const alignMarkerPair = (
    marker: HTMLElement | undefined,
    scrollerMarker: HTMLElement | undefined,
  ): void => {
    if (!marker || !scrollerMarker) return;
    const scrollerRight = Number.parseFloat(
      scrollerMarker.ownerDocument.defaultView?.getComputedStyle(scrollerMarker).right ?? "",
    );
    const inlineEnd = (Number.isFinite(scrollerRight) ? scrollerRight : 0)
      + scrollerMarker.getBoundingClientRect().width
      + MARKER_PAIR_GAP;
    marker.style.setProperty(INLINE_END_PROPERTY, `${inlineEnd}px`);
  };

  const markerDocument = (trigger: MarkerTriggerLike): Document | undefined => (
    trigger.trigger?.ownerDocument
    ?? (trigger.scroller instanceof Element ? trigger.scroller.ownerDocument : globalThis.document)
  );

  const canCreateOwnedMarkers = (trigger: MarkerTriggerLike | undefined): boolean => Boolean(
    trigger
      && markerDocument(trigger)
      && Number.isFinite(trigger.start)
      && Number.isFinite(trigger.end)
      && typeof trigger.scroll === "function",
  );

  const createOwnedMarkers = (
    timeline: gsap.core.Timeline,
    trigger: MarkerTriggerLike,
  ): OwnedMarkerSet | undefined => {
    const document = markerDocument(trigger);
    if (!document) return undefined;
    ensureStyle(document);
    const create = (type: MarkerType, label: string): HTMLElement => {
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
        start: create("start", "start"),
        end: create("end", "end"),
        "scroller-start": create("scroller-start", "scroller start"),
        "scroller-end": create("scroller-end", "scroller end"),
      },
    } satisfies OwnedMarkerSet;
    ownedByTimeline.set(timeline, owned);
    return owned;
  };

  const removeOwnedMarkers = (timeline: gsap.core.Timeline): void => {
    const owned = ownedByTimeline.get(timeline);
    if (!owned) return;
    for (const marker of Object.values(owned.nodes)) marker.remove();
    ownedByTimeline.delete(timeline);
  };

  const updateOwnedMarkers = (
    timeline: gsap.core.Timeline,
    trigger: MarkerTriggerLike,
  ): void => {
    const owned = ownedByTimeline.get(timeline) ?? createOwnedMarkers(timeline, trigger);
    const view = owned?.document.defaultView;
    if (!owned || !view || typeof trigger.scroll !== "function") return;
    const scroll = trigger.scroll();
    const start = trigger.start;
    const end = trigger.end;
    if (![scroll, start, end].every(Number.isFinite)) return;
    const editorTop = owned.document.querySelector(EDITOR_SELECTOR)?.getBoundingClientRect().top;
    const visibleBottom = editorTop !== undefined && editorTop > 0
      ? editorTop
      : view.innerHeight;
    const scrollerRect = trigger.scroller instanceof Element
      ? trigger.scroller.getBoundingClientRect()
      : { top: 0, right: view.innerWidth, bottom: visibleBottom, left: 0 };
    const top = Math.max(0, scrollerRect.top);
    const bottom = Math.min(visibleBottom, scrollerRect.bottom);
    const right = Math.max(0, view.innerWidth - scrollerRect.right);
    const positions: Readonly<Record<MarkerType, number>> = {
      start: bottom + (start! - scroll),
      end: top + (end! - scroll),
      "scroller-start": bottom,
      "scroller-end": top,
    };
    const scrollerMarkerWidth = Math.max(
      owned.nodes["scroller-start"].getBoundingClientRect().width,
      owned.nodes["scroller-end"].getBoundingClientRect().width,
    );
    for (const [type, marker] of Object.entries(owned.nodes) as [MarkerType, HTMLElement][]) {
      marker.style.top = `${positions[type]}px`;
      marker.style.left = "auto";
      marker.style.right = `${right + (type.startsWith("scroller-")
        ? 0
        : scrollerMarkerWidth + MARKER_PAIR_GAP)}px`;
    }
  };

  return {
    activate(timelineId, timeline) {
      const trigger = scrollTriggerOf(timeline);
      if (nodesFor(timeline).length === 0 && !canCreateOwnedMarkers(trigger)) return false;
      if (!visibilityByTimeline.has(timelineId)) visibilityByTimeline.set(timelineId, true);
      return true;
    },
    canPresent(timeline) {
      const trigger = scrollTriggerOf(timeline);
      return nodesFor(timeline).length > 0 || canCreateOwnedMarkers(trigger);
    },
    isVisible(timelineId) {
      return visibilityByTimeline.get(timelineId) === true;
    },
    setVisible(timelineId, timeline, visible) {
      const trigger = scrollTriggerOf(timeline);
      if (nodesFor(timeline).length === 0 && !canCreateOwnedMarkers(trigger)) return false;
      visibilityByTimeline.set(timelineId, visible);
      return true;
    },
    sync(registrations, selectedTimelineId) {
      const current = new Set<HTMLElement>();
      const currentTimelineIds = new Set(registrations.map(({ id }) => id));
      for (const registration of registrations) {
        const visible = registration.id === selectedTimelineId
          && visibilityByTimeline.get(registration.id) === true;
        const trigger = scrollTriggerOf(registration.timeline);
        const nodes = nodesFor(registration.timeline);
        if (nodes.length === 0 && visible && canCreateOwnedMarkers(trigger)) {
          updateOwnedMarkers(registration.timeline, trigger!);
        } else {
          removeOwnedMarkers(registration.timeline);
        }
        for (const marker of nodes) {
          current.add(marker);
          remember(marker);
          const label = markerLabel(marker);
          if (label) marker.textContent = label;
          marker.toggleAttribute(HIDDEN_ATTRIBUTE, !visible);
          marker.toggleAttribute(SELECTED_ATTRIBUTE, visible);
          marker.toggleAttribute(
            VIEWPORT_SCROLLER_ATTRIBUTE,
            visible
              && !(trigger?.scroller instanceof Element)
              && marker.classList.contains("gsap-marker-scroller-start"),
          );
        }
        if (visible) {
          const scrollerStart = nodes.find((marker) => (
            marker.classList.contains("gsap-marker-scroller-start")
          ));
          const scrollerEnd = nodes.find((marker) => (
            marker.classList.contains("gsap-marker-scroller-end")
          ));
          matchScrollerMarkerWidths(scrollerStart, scrollerEnd);
          alignMarkerPair(
            trigger?.markerStart,
            scrollerStart,
          );
          alignMarkerPair(
            trigger?.markerEnd,
            scrollerEnd,
          );
        }
      }
      for (const marker of [...originals.keys()]) {
        if (!current.has(marker)) restore(marker);
      }
      const currentTimelines = new Set(registrations.map(({ timeline }) => timeline));
      for (const timeline of ownedByTimeline.keys()) {
        if (!currentTimelines.has(timeline)) removeOwnedMarkers(timeline);
      }
      for (const timelineId of visibilityByTimeline.keys()) {
        if (!currentTimelineIds.has(timelineId)) visibilityByTimeline.delete(timelineId);
      }
    },
    destroy() {
      for (const marker of [...originals.keys()]) restore(marker);
      for (const timeline of [...ownedByTimeline.keys()]) removeOwnedMarkers(timeline);
      for (const state of documents.values()) {
        state.observer?.disconnect();
        state.style.remove();
      }
      documents.clear();
      visibilityByTimeline.clear();
    },
  };
}
