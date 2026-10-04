import { gsap } from "gsap";

export function directTimeline(id: string, label = id) {
  const root = document.createElement("section");
  const target = document.createElement("div");
  root.append(target);
  const timeline = gsap.timeline({ paused: true });
  timeline.to(target, { x: 40, duration: 1 });
  return { id, label, root, target, timeline };
}

export function bounds(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

export type MarkerType = "start" | "end" | "scroller-start" | "scroller-end";

export function nativeMarker(type: MarkerType, id?: string, parent = document.body): HTMLElement {
  const marker = document.createElement("div");
  marker.className = `gsap-marker-${type}`;
  marker.textContent = id ? `${type}-${id}` : type;
  parent.append(marker);
  return marker;
}

export function ownedMarkers(): readonly HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-rf-marker-owned]")];
}

export function markerPositions(): Readonly<Record<string, { top: string; right: string }>> {
  return Object.fromEntries(ownedMarkers().map((marker) => [
    marker.dataset.rfMarkerOwnedType!,
    { top: marker.style.top, right: marker.style.right },
  ]));
}
