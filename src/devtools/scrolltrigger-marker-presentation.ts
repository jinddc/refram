import type { gsap } from "gsap";
import type { MotionTimelineRegistration } from "./timeline-registry";

const HIDDEN_ATTRIBUTE = "data-motion-devtools-marker-hidden";
const SELECTED_ATTRIBUTE = "data-motion-devtools-marker-selected";
const VIEWPORT_SCROLLER_ATTRIBUTE = "data-motion-devtools-marker-viewport-scroller";
const STYLE_ATTRIBUTE = "data-motion-devtools-marker-visibility";
const EDITOR_SELECTOR = "motion-devtools-editor";
const INLINE_END_PROPERTY = "--motion-devtools-marker-inline-end";
const SCROLLER_WIDTH_PROPERTY = "--motion-devtools-marker-scroller-width";
const MARKER_PAIR_GAP = 4;

interface MarkerTriggerLike {
  readonly markerStart?: HTMLElement;
  readonly markerEnd?: HTMLElement;
  readonly scroller?: Element | Window;
  readonly vars?: Readonly<{
    id?: string;
    markers?: unknown;
  }>;
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

  return {
    sync(registrations, selectedTimelineId) {
      const current = new Set<HTMLElement>();
      for (const registration of registrations) {
        const visible = registration.id === selectedTimelineId;
        const trigger = scrollTriggerOf(registration.timeline);
        const nodes = nodesByTimeline.get(registration.timeline)
          ?? markerNodes(registration.timeline);
        nodesByTimeline.set(registration.timeline, nodes);
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
    },
    destroy() {
      for (const marker of [...originals.keys()]) restore(marker);
      for (const state of documents.values()) {
        state.observer?.disconnect();
        state.style.remove();
      }
      documents.clear();
    },
  };
}
