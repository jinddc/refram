import type { gsap } from "gsap";

export type TimelineInspectionDriver = "manual" | "scroll";
export type TimelineInspectionReadiness = "empty" | "ready";
export type TimelinePlayState = "idle" | "running" | "paused" | "finished";

export interface TimelineInspectionItem {
  readonly source: HTMLElement;
  readonly animation: gsap.core.Animation;
  readonly index: number;
  readonly runnable: true;
  readonly authoredPosition: number;
  readonly from?: Readonly<Record<string, unknown>>;
  readonly to: Readonly<Record<string, unknown>>;
  readonly authoredDuration: number;
  readonly authoredEase?: string;
  readonly resolvedStart: number;
  readonly resolvedDuration: number;
  readonly resolvedEnd: number;
}

export interface TimelineInspectionSnapshot {
  readonly driver: TimelineInspectionDriver;
  readonly readiness: TimelineInspectionReadiness;
  readonly playState: TimelinePlayState;
  readonly progress: number;
  readonly timeScale: number;
  readonly totalDuration: number;
  readonly items: readonly TimelineInspectionItem[];
}

export interface TimelineSessionAttachment {
  read(): TimelineInspectionSnapshot;
  seek(progress: number): boolean;
  setTimeScale(value: number): boolean;
  detach(): void;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isScrollOwned(timeline: gsap.core.Timeline): boolean {
  return Boolean((timeline as gsap.core.Timeline & { scrollTrigger?: unknown }).scrollTrigger);
}

function animationTargets(animation: gsap.core.Animation): readonly unknown[] {
  const candidate = animation as gsap.core.Animation & {
    targets?: () => readonly unknown[];
  };
  return typeof candidate.targets === "function" ? candidate.targets() : [];
}

function readItems(timeline: gsap.core.Timeline): readonly TimelineInspectionItem[] {
  return timeline
    .getChildren(false, true, false)
    .flatMap((animation, index) => {
      const source = animationTargets(animation).find(
        (target): target is HTMLElement => target instanceof HTMLElement,
      );
      if (!source) return [];

      const vars = animation.vars as Record<string, unknown>;
      const start = animation.startTime();
      const duration = animation.totalDuration();
      const startAt = vars.startAt;
      return [{
        source,
        animation,
        index,
        runnable: true as const,
        authoredPosition: start,
        from: startAt && typeof startAt === "object"
          ? startAt as Readonly<Record<string, unknown>>
          : undefined,
        to: vars,
        authoredDuration: duration,
        authoredEase: typeof vars.ease === "string" ? vars.ease : undefined,
        resolvedStart: start,
        resolvedDuration: duration,
        resolvedEnd: start + duration,
      }];
    });
}

function playState(timeline: gsap.core.Timeline): TimelinePlayState {
  const progress = timeline.totalProgress();
  if (progress >= 1) return "finished";
  if (!timeline.paused()) return "running";
  return progress > 0 ? "paused" : "idle";
}

function sameAnimations(
  left: readonly TimelineInspectionItem[],
  right: readonly TimelineInspectionItem[],
): boolean {
  return left.length === right.length && left.every(
    (item, index) => item.animation === right[index]?.animation,
  );
}

export function attachGsapTimelineSession(
  timeline: gsap.core.Timeline,
  listener: (snapshot: TimelineInspectionSnapshot) => void,
): TimelineSessionAttachment {
  let active = true;
  let frame: number | undefined;
  let items = readItems(timeline);
  let snapshot: TimelineInspectionSnapshot;

  const readSnapshot = (): TimelineInspectionSnapshot => {
    const nextItems = readItems(timeline);
    if (!sameAnimations(items, nextItems)) items = nextItems;
    const duration = timeline.totalDuration();
    return {
      driver: isScrollOwned(timeline) ? "scroll" : "manual",
      readiness: items.length > 0 && duration > 0 ? "ready" : "empty",
      playState: playState(timeline),
      progress: clamp(timeline.totalProgress()),
      timeScale: timeline.timeScale(),
      totalDuration: Number.isFinite(duration) ? duration : 0,
      items,
    };
  };

  const deliver = (): void => {
    snapshot = readSnapshot();
    listener(snapshot);
  };

  const sample = (): void => {
    frame = undefined;
    if (!active) return;
    deliver();
    if (typeof requestAnimationFrame === "function") {
      frame = requestAnimationFrame(sample);
    }
  };

  deliver();
  if (typeof requestAnimationFrame === "function") {
    frame = requestAnimationFrame(sample);
  }

  const requireActive = (): void => {
    if (!active) {
      throw new DOMException("GSAP timeline session is detached.", "InvalidStateError");
    }
  };

  return {
    read() {
      requireActive();
      snapshot = readSnapshot();
      return snapshot;
    },
    seek(progress) {
      requireActive();
      if (isScrollOwned(timeline)) return false;
      timeline.pause().totalProgress(clamp(progress), true);
      deliver();
      return true;
    },
    setTimeScale(value) {
      requireActive();
      if (isScrollOwned(timeline) || !Number.isFinite(value) || value <= 0) return false;
      timeline.timeScale(value);
      deliver();
      return true;
    },
    detach() {
      if (!active) return;
      active = false;
      if (frame !== undefined && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frame);
      }
      frame = undefined;
    },
  };
}
