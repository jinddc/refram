import type { gsap } from "gsap";
import type { TimelineInspectionItem, TimelineInspectionSnapshot } from "./timeline-session";

export const DEFAULT_FINITE_TIMELINE_DURATION = 12;

export interface EditorTrackSpan {
  readonly item: TimelineInspectionItem;
  readonly start: number;
  readonly end: number;
}

export interface EditorTimeWindow {
  readonly start: number;
  readonly end: number;
  readonly duration: number;
  readonly sourceDuration: number;
  readonly time: number;
  readonly progress: number;
  readonly repeating: boolean;
  readonly tracks: readonly EditorTrackSpan[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function repeatingPeriods(timeline: gsap.core.Timeline): readonly number[] {
  const periods: number[] = [];
  const visited = new Set<gsap.core.Animation>();
  const visit = (animation: gsap.core.Animation): void => {
    if (visited.has(animation)) return;
    visited.add(animation);
    if (animation.repeat() === -1) {
      periods.push(animation.duration() + animation.repeatDelay());
    }
    const children = animation as gsap.core.Animation & {
      getChildren?: (nested: boolean, tweens: boolean, timelines: boolean) => gsap.core.Animation[];
      timeline?: gsap.core.Timeline;
    };
    for (const child of children.getChildren?.(false, true, true) ?? []) visit(child);
    if (children.timeline) visit(children.timeline);
  };
  visit(timeline);
  return periods;
}

function cycleDuration(timeline: gsap.core.Timeline): number | undefined {
  const periods = repeatingPeriods(timeline);
  if (periods.length === 0) return undefined;
  const first = periods[0]!;
  if (!Number.isFinite(first) || first <= 0) return undefined;
  return periods.every((period) => Math.abs(period - first) < 0.000001)
    ? first
    : undefined;
}

function visibleTracks(
  inspection: TimelineInspectionSnapshot,
  start: number,
  end: number,
  duration: number,
  repeatPeriod: number | undefined,
): readonly EditorTrackSpan[] {
  const spans: EditorTrackSpan[] = [];
  for (const item of inspection.items) {
    const offsets: number[] = [];
    if (repeatPeriod !== undefined && item.resolvedDuration <= repeatPeriod) {
      let offset = Math.floor((start - item.resolvedEnd) / repeatPeriod) * repeatPeriod;
      const limit = Math.ceil(duration / repeatPeriod) + 2;
      for (let index = 0; index < limit; index += 1, offset += repeatPeriod) {
        if (item.resolvedStart + offset >= end) break;
        if (item.resolvedEnd + offset > start) offsets.push(offset);
      }
    } else {
      offsets.push(0);
    }
    for (const offset of new Set(offsets)) {
      const visibleStart = Math.max(start, item.resolvedStart + offset);
      const visibleEnd = Math.min(end, item.resolvedEnd + offset);
      if (visibleEnd <= visibleStart) continue;
      spans.push(Object.freeze({
        item,
        start: clamp((visibleStart - start) / duration, 0, 1),
        end: clamp((visibleEnd - start) / duration, 0, 1),
      }));
    }
  }
  return Object.freeze(spans);
}

export function readEditorTimeWindow(
  timeline: gsap.core.Timeline,
  inspection: TimelineInspectionSnapshot,
  origin: number,
): EditorTimeWindow | undefined {
  const periods = repeatingPeriods(timeline);
  const repeating = periods.length > 0;
  const repeatPeriod = repeating ? cycleDuration(timeline) : undefined;
  const sourceDuration = repeating ? repeatPeriod : inspection.totalDuration;
  if (sourceDuration === undefined || !Number.isFinite(sourceDuration) || sourceDuration <= 0) {
    return undefined;
  }
  const duration = Math.max(DEFAULT_FINITE_TIMELINE_DURATION, sourceDuration);

  const time = timeline.totalTime();
  const start = repeating
    ? Math.max(0, origin + Math.floor((time - origin) / duration) * duration)
    : 0;
  const end = start + duration;
  return Object.freeze({
    start,
    end,
    duration,
    sourceDuration,
    time,
    progress: clamp((time - start) / duration, 0, 1),
    repeating,
    tracks: visibleTracks(inspection, start, end, duration, repeatPeriod),
  });
}
