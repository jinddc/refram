import type { gsap } from "gsap";
import type { TimelineInspectionItem, TimelineInspectionSnapshot } from "./timeline-session";

export const DEFAULT_FINITE_TIMELINE_DURATION = 12;

export interface EditorTrackSpan {
  readonly item: TimelineInspectionItem;
  readonly start: number;
  readonly end: number;
}

export interface EditorTrackTiming {
  readonly item: TimelineInspectionItem;
  readonly start: number;
  readonly duration: number;
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
  readonly trackTimings: readonly EditorTrackTiming[];
  readonly tracks: readonly EditorTrackSpan[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function repeatingPeriods(animation: gsap.core.Animation): readonly number[] {
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
  visit(animation);
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

function trackTimings(
  inspection: TimelineInspectionSnapshot,
  repeatPeriod: number | undefined,
): readonly EditorTrackTiming[] {
  return Object.freeze(inspection.items.map((item) => {
    const periods = item.animations.flatMap((animation) => repeatingPeriods(animation));
    const usesCommonPeriod = repeatPeriod !== undefined
      && periods.length > 0
      && periods.every((period) => Math.abs(period - repeatPeriod) < 0.000001);
    const duration = usesCommonPeriod ? repeatPeriod : item.resolvedDuration;
    return Object.freeze({
      item,
      start: item.resolvedStart,
      duration,
      end: item.resolvedStart + duration,
    });
  }));
}

function visibleTracks(
  timings: readonly EditorTrackTiming[],
  start: number,
  end: number,
  duration: number,
  repeatPeriod: number | undefined,
): readonly EditorTrackSpan[] {
  const spans: EditorTrackSpan[] = [];
  for (const timing of timings) {
    const domainStart = repeatPeriod === undefined ? start : 0;
    const domainEnd = repeatPeriod === undefined ? end : repeatPeriod;
    const visibleStart = Math.max(domainStart, timing.start);
    const visibleEnd = Math.min(domainEnd, timing.end);
    if (visibleEnd <= visibleStart) continue;
    spans.push(Object.freeze({
      item: timing.item,
      start: clamp((visibleStart - domainStart) / duration, 0, 1),
      end: clamp((visibleEnd - domainStart) / duration, 0, 1),
    }));
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
  const duration = Math.max(
    DEFAULT_FINITE_TIMELINE_DURATION,
    Math.ceil(sourceDuration - 0.000000001),
  );
  const timings = trackTimings(inspection, repeatPeriod);

  const time = timeline.totalTime();
  const start = repeating
    ? Math.max(0, origin + Math.floor((time - origin) / sourceDuration) * sourceDuration)
    : 0;
  const end = start + duration;
  const displayedTime = repeating ? time - start : time;
  return Object.freeze({
    start,
    end,
    duration,
    sourceDuration,
    time,
    progress: clamp(displayedTime / duration, 0, 1),
    repeating,
    trackTimings: timings,
    tracks: visibleTracks(timings, start, end, duration, repeatPeriod),
  });
}
