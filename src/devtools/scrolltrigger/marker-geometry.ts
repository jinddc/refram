export const MARKER_PAIR_GAP = 4;

export type ScrollTriggerMarkerType = "start" | "end" | "scroller-start" | "scroller-end";

export interface MarkerTriggerLike {
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

export interface MarkerRect {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface OwnedMarkerGeometryInput {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly editorTop?: number;
  readonly scrollerRect?: MarkerRect;
  readonly scroll: number;
  readonly start: number;
  readonly end: number;
  readonly scrollerMarkerWidth: number;
}

export interface OwnedMarkerGeometry {
  readonly positions: Readonly<Record<ScrollTriggerMarkerType, number>>;
  readonly scrollerInlineEnd: number;
  readonly contentInlineEnd: number;
}

export function calculateOwnedMarkerGeometry(
  input: OwnedMarkerGeometryInput,
): OwnedMarkerGeometry | undefined {
  const values = [
    input.viewportWidth,
    input.viewportHeight,
    input.scroll,
    input.start,
    input.end,
    input.scrollerMarkerWidth,
  ];
  if (!values.every(Number.isFinite)) return undefined;

  const visibleBottom = input.editorTop !== undefined && input.editorTop > 0
    ? input.editorTop
    : input.viewportHeight;
  const scrollerRect = input.scrollerRect ?? {
    top: 0,
    right: input.viewportWidth,
    bottom: visibleBottom,
  };
  if (![scrollerRect.top, scrollerRect.right, scrollerRect.bottom].every(Number.isFinite)) {
    return undefined;
  }

  const top = Math.max(0, scrollerRect.top);
  const bottom = Math.min(visibleBottom, scrollerRect.bottom);
  const scrollerInlineEnd = Math.max(0, input.viewportWidth - scrollerRect.right);
  return {
    positions: {
      start: bottom + (input.start - input.scroll),
      end: top + (input.end - input.scroll),
      "scroller-start": bottom,
      "scroller-end": top,
    },
    scrollerInlineEnd,
    contentInlineEnd: scrollerInlineEnd + input.scrollerMarkerWidth + MARKER_PAIR_GAP,
  };
}

export interface NativeMarkerGeometryInput {
  readonly scrollerStartWidth: number;
  readonly scrollerStartInlineEnd: number;
  readonly scrollerEndInlineEnd: number;
}

export interface NativeMarkerGeometry {
  readonly scrollerWidth: number;
  readonly startInlineEnd: number;
  readonly endInlineEnd: number;
}

export function calculateNativeMarkerGeometry(
  input: NativeMarkerGeometryInput,
): NativeMarkerGeometry | undefined {
  if (![
    input.scrollerStartWidth,
    input.scrollerStartInlineEnd,
    input.scrollerEndInlineEnd,
  ].every(Number.isFinite)) return undefined;

  return {
    scrollerWidth: input.scrollerStartWidth,
    startInlineEnd: input.scrollerStartInlineEnd
      + input.scrollerStartWidth
      + MARKER_PAIR_GAP,
    endInlineEnd: input.scrollerEndInlineEnd
      + input.scrollerStartWidth
      + MARKER_PAIR_GAP,
  };
}
