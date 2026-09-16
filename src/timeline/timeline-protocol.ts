export const REQUEST_TIMELINE_SYNC = Symbol("requestTimelineSync");

export type TimelineChangeReason = "structure" | "options";

export interface TimelineCompositionHost extends HTMLElement {
  [REQUEST_TIMELINE_SYNC](reason?: TimelineChangeReason): void;
}

export function isTimelineCompositionHost(
  value: Element | null,
): value is TimelineCompositionHost {
  return value !== null && REQUEST_TIMELINE_SYNC in value;
}
