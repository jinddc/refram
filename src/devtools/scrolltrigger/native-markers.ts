import type { gsap } from "gsap";
import {
  calculateNativeMarkerGeometry,
  type MarkerTriggerLike,
} from "./marker-geometry";

const HIDDEN_ATTRIBUTE = "data-motion-devtools-marker-hidden";
const SELECTED_ATTRIBUTE = "data-motion-devtools-marker-selected";
const VIEWPORT_SCROLLER_ATTRIBUTE = "data-motion-devtools-marker-viewport-scroller";
const INLINE_END_PROPERTY = "--motion-devtools-marker-inline-end";
const SCROLLER_WIDTH_PROPERTY = "--motion-devtools-marker-scroller-width";

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

export interface NativeMarkerReconciliation {
  readonly timeline: gsap.core.Timeline;
  readonly trigger: MarkerTriggerLike | undefined;
  readonly visible: boolean;
}

export interface ScrollTriggerNativeMarkers {
  nodesFor(
    timeline: gsap.core.Timeline,
    trigger: MarkerTriggerLike | undefined,
  ): readonly HTMLElement[];
  reconcile(entries: readonly NativeMarkerReconciliation[]): void;
  sampleVisible(trigger: MarkerTriggerLike, nodes: readonly HTMLElement[]): void;
  destroy(): void;
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

function discoverMarkerNodes(trigger: MarkerTriggerLike | undefined): readonly HTMLElement[] {
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

export function createScrollTriggerNativeMarkers(
  ensureDocument: (document: Document) => void,
): ScrollTriggerNativeMarkers {
  const originals = new Map<HTMLElement, OriginalMarkerState>();
  const nodesByTimeline = new WeakMap<gsap.core.Timeline, readonly HTMLElement[]>();

  const nodesFor = (
    timeline: gsap.core.Timeline,
    trigger: MarkerTriggerLike | undefined,
  ): readonly HTMLElement[] => {
    const cached = nodesByTimeline.get(timeline);
    if (cached?.length) return cached;
    const nodes = discoverMarkerNodes(trigger);
    nodesByTimeline.set(timeline, nodes);
    return nodes;
  };

  const remember = (marker: HTMLElement): void => {
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

  return {
    nodesFor,
    reconcile(entries) {
      const current = new Set<HTMLElement>();
      const currentDocuments = new Set<Document>();
      for (const { timeline, trigger, visible } of entries) {
        const nodes = nodesFor(timeline, trigger);
        for (const marker of nodes) {
          current.add(marker);
          currentDocuments.add(marker.ownerDocument);
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
      }
      for (const document of currentDocuments) ensureDocument(document);
      for (const marker of [...originals.keys()]) {
        if (!current.has(marker)) restore(marker);
      }
    },
    sampleVisible(trigger, nodes) {
      const scrollerStart = nodes.find((marker) => (
        marker.classList.contains("gsap-marker-scroller-start")
      ));
      const scrollerEnd = nodes.find((marker) => (
        marker.classList.contains("gsap-marker-scroller-end")
      ));
      if (!scrollerStart || !scrollerEnd) return;
      const view = scrollerStart.ownerDocument.defaultView;
      const startInlineEnd = Number.parseFloat(view?.getComputedStyle(scrollerStart).right ?? "");
      const endInlineEnd = Number.parseFloat(view?.getComputedStyle(scrollerEnd).right ?? "");
      const geometry = calculateNativeMarkerGeometry({
        scrollerStartWidth: scrollerStart.getBoundingClientRect().width,
        scrollerStartInlineEnd: Number.isFinite(startInlineEnd) ? startInlineEnd : 0,
        scrollerEndInlineEnd: Number.isFinite(endInlineEnd) ? endInlineEnd : 0,
      });
      if (!geometry) return;

      scrollerEnd.style.setProperty(SCROLLER_WIDTH_PROPERTY, `${geometry.scrollerWidth}px`);
      trigger.markerStart?.style.setProperty(INLINE_END_PROPERTY, `${geometry.startInlineEnd}px`);
      trigger.markerEnd?.style.setProperty(INLINE_END_PROPERTY, `${geometry.endInlineEnd}px`);
    },
    destroy() {
      for (const marker of [...originals.keys()]) restore(marker);
    },
  };
}
