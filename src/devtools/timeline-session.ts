import type { gsap } from "gsap";
import type { MotionTimelineTrack } from "./timeline-control";

// Read-only sampling and transport for one live GSAP timeline instance.

export type TimelineInspectionDriver = "manual" | "scroll";
export type TimelineInspectionReadiness = "empty" | "ready";
export type TimelinePlayState = "idle" | "running" | "paused" | "finished";

export interface TimelineInspectionItem {
  readonly source: Element;
  readonly sources: readonly Element[];
  readonly animation: gsap.core.Animation;
  readonly animations: readonly gsap.core.Animation[];
  readonly trackId?: string;
  readonly label?: string;
  readonly animatedTargetCount: number;
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
  readonly reversed: boolean;
  readonly totalDuration: number;
  readonly items: readonly TimelineInspectionItem[];
  readonly scrollTrigger: TimelineScrollTriggerSnapshot | undefined;
}

export type TimelineScrollTriggerState = "before" | "active" | "after";

export interface TimelineScrollTriggerMarkerConfig {
  readonly startColor?: string;
  readonly endColor?: string;
  readonly fontSize?: string;
  readonly fontWeight?: string;
  readonly indent?: number;
}

export type TimelineScrollTriggerMarkers =
  | false
  | true
  | TimelineScrollTriggerMarkerConfig;

export interface TimelineScrollTriggerSnapshot {
  readonly id: string | undefined;
  readonly scrub: boolean | number | undefined;
  readonly scrubbed: boolean;
  readonly rawStart: string | number | undefined;
  readonly rawEnd: string | number | undefined;
  readonly start: number;
  readonly end: number;
  readonly distance: number;
  readonly scroll: number;
  readonly progress: number;
  readonly animationProgress: number;
  readonly state: TimelineScrollTriggerState;
  readonly direction: -1 | 0 | 1;
  readonly pin: string | undefined;
  readonly trigger: string | undefined;
  readonly scroller: string;
  readonly markers: TimelineScrollTriggerMarkers;
}

export interface TimelineSessionAttachment {
  read(): TimelineInspectionSnapshot;
  seek(progress: number): boolean;
  setTimeScale(value: number): boolean;
  setReversed(value: boolean): boolean;
  detach(): void;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

interface GsapScrollTriggerLike {
  readonly start: number;
  readonly end: number;
  readonly progress: number;
  readonly direction: number;
  readonly trigger?: Element;
  readonly scroller?: Element | Window;
  readonly pin?: Element;
  readonly vars?: Readonly<{
    id?: string;
    scrub?: boolean | number;
    start?: string | number | ((...args: readonly unknown[]) => string | number);
    end?: string | number | ((...args: readonly unknown[]) => string | number);
    markers?: boolean | Readonly<Record<string, unknown>>;
  }>;
  scroll(): number;
  scroll(position: number): void;
  update?(): void;
}

const MARKER_STRING_KEYS = [
  "startColor",
  "endColor",
  "fontSize",
  "fontWeight",
] as const;

function rawPosition(
  value: string | number | ((...args: readonly unknown[]) => string | number) | undefined,
): string | number | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "function") return "Function";
  return undefined;
}

function readMarkers(value: unknown): TimelineScrollTriggerMarkers {
  if (value === true) return true;
  if (!value || typeof value !== "object") return false;
  const source = value as Readonly<Record<string, unknown>>;
  const config: {
    startColor?: string;
    endColor?: string;
    fontSize?: string;
    fontWeight?: string;
    indent?: number;
  } = {};
  for (const key of MARKER_STRING_KEYS) {
    if (typeof source[key] === "string") config[key] = source[key];
  }
  if (typeof source.indent === "number" && Number.isFinite(source.indent)) {
    config.indent = source.indent;
  }
  return Object.freeze(config);
}

function scrollTriggerOf(timeline: gsap.core.Timeline): GsapScrollTriggerLike | undefined {
  return (timeline as gsap.core.Timeline & {
    scrollTrigger?: GsapScrollTriggerLike;
  }).scrollTrigger;
}

function isScrubbed(trigger: GsapScrollTriggerLike | undefined): boolean {
  const scrub = trigger?.vars?.scrub;
  return scrub === true || (typeof scrub === "number" && Number.isFinite(scrub));
}

function describeElement(value: unknown): string | undefined {
  if (typeof Element === "undefined" || !(value instanceof Element)) return undefined;
  const id = value.id ? `#${value.id}` : "";
  const classes = [...value.classList]
    .filter((name) => name.trim().length > 0)
    .slice(0, 2)
    .map((name) => `.${name}`)
    .join("");
  return `${value.localName}${id}${classes}`;
}

function describeScroller(value: unknown): string {
  if (typeof window !== "undefined" && value === window) return "Window";
  return describeElement(value) ?? "Window";
}

function rangeState(scroll: number, start: number, end: number): TimelineScrollTriggerState {
  if (start === end) {
    if (scroll === start) return "active";
    return scroll < start ? "before" : "after";
  }
  const rangeProgress = (scroll - start) / (end - start);
  if (rangeProgress < 0) return "before";
  if (rangeProgress > 1) return "after";
  return "active";
}

export function readTimelineScrollTrigger(
  timeline: gsap.core.Timeline,
): TimelineScrollTriggerSnapshot | undefined {
  const trigger = scrollTriggerOf(timeline);
  if (!trigger) return undefined;
  const start = Number.isFinite(trigger.start) ? trigger.start : 0;
  const end = Number.isFinite(trigger.end) ? trigger.end : start;
  const scroll = trigger.scroll();
  const direction = trigger.direction < 0 ? -1 : trigger.direction > 0 ? 1 : 0;
  return Object.freeze({
    id: trigger.vars?.id?.trim() || undefined,
    scrub: trigger.vars?.scrub,
    scrubbed: isScrubbed(trigger),
    rawStart: rawPosition(trigger.vars?.start),
    rawEnd: rawPosition(trigger.vars?.end),
    start,
    end,
    distance: Math.abs(end - start),
    scroll: Number.isFinite(scroll) ? scroll : start,
    progress: clamp(trigger.progress),
    animationProgress: clamp(timeline.totalProgress()),
    state: rangeState(Number.isFinite(scroll) ? scroll : start, start, end),
    direction,
    pin: describeElement(trigger.pin),
    trigger: describeElement(trigger.trigger),
    scroller: describeScroller(trigger.scroller),
    markers: readMarkers(trigger.vars?.markers),
  });
}

function animationTargets(animation: gsap.core.Animation): readonly unknown[] {
  const candidate = animation as gsap.core.Animation & {
    targets?: () => readonly unknown[];
  };
  return typeof candidate.targets === "function" ? candidate.targets() : [];
}

function readItems(
  timeline: gsap.core.Timeline,
  tracks: readonly MotionTimelineTrack[],
): readonly TimelineInspectionItem[] {
  const children = timeline.getChildren(false, true, false);
  const mapped = new Set<gsap.core.Animation>();
  const grouped = tracks.map((track, index): TimelineInspectionItem => {
    for (const animation of track.animations) {
      if (!children.includes(animation)) {
        throw new TypeError(`Timeline track "${track.id}" references an animation outside its timeline.`);
      }
      if (mapped.has(animation)) {
        throw new TypeError(`Animation in timeline track "${track.id}" is already mapped.`);
      }
      mapped.add(animation);
    }
    const start = Math.min(...track.animations.map((animation) => animation.startTime()));
    const end = Math.max(...track.animations.map(
      (animation) => animation.startTime() + animation.totalDuration(),
    ));
    return {
      source: track.targets[0]!,
      sources: track.targets,
      animation: track.animations[0]!,
      animations: track.animations,
      trackId: track.id,
      label: track.label,
      animatedTargetCount: new Set(track.animations.flatMap(animationTargets)).size,
      index,
      runnable: true,
      authoredPosition: start,
      to: track.animations[0]!.vars as Readonly<Record<string, unknown>>,
      authoredDuration: end - start,
      resolvedStart: start,
      resolvedDuration: end - start,
      resolvedEnd: end,
    };
  });

  const ungrouped = children
    .flatMap((animation, index) => {
      if (mapped.has(animation)) return [];
      const targets = animationTargets(animation);
      const sources = targets.filter(
        (target): target is HTMLElement => target instanceof HTMLElement,
      );
      const source = sources[0];
      if (!source) return [];

      const vars = animation.vars as Record<string, unknown>;
      const start = animation.startTime();
      const duration = animation.totalDuration();
      const startAt = vars.startAt;
      return [{
        source,
        sources,
        animation,
        animations: [animation],
        animatedTargetCount: targets.length,
        index: tracks.length + index,
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
  return [...grouped, ...ungrouped];
}

function playState(timeline: gsap.core.Timeline): TimelinePlayState {
  const progress = timeline.totalProgress();
  if (progress >= 1 && !timeline.reversed()) return "finished";
  if (progress <= 0 && timeline.reversed()) return "idle";
  if (!timeline.paused()) return "running";
  return progress > 0 ? "paused" : "idle";
}

function sameAnimations(
  left: readonly TimelineInspectionItem[],
  right: readonly TimelineInspectionItem[],
): boolean {
  return left.length === right.length && left.every(
    (item, index) => item.animation === right[index]?.animation
      && item.trackId === right[index]?.trackId
      && item.animations.length === right[index]?.animations.length
      && item.animations.every((animation, animationIndex) => (
        animation === right[index]?.animations[animationIndex]
      )),
  );
}

export function attachGsapTimelineSession(
  timeline: gsap.core.Timeline,
  listener: (snapshot: TimelineInspectionSnapshot) => void,
  tracks: readonly MotionTimelineTrack[] = [],
): TimelineSessionAttachment {
  let active = true;
  let frame: number | undefined;
  let items = readItems(timeline, tracks);
  let snapshot: TimelineInspectionSnapshot;

  const readSnapshot = (): TimelineInspectionSnapshot => {
    const nextItems = readItems(timeline, tracks);
    if (!sameAnimations(items, nextItems)) items = nextItems;
    const duration = timeline.totalDuration();
    const scrollTrigger = readTimelineScrollTrigger(timeline);
    return {
      driver: scrollTrigger?.scrubbed ? "scroll" : "manual",
      readiness: items.length > 0 && duration > 0 ? "ready" : "empty",
      playState: playState(timeline),
      progress: clamp(timeline.totalProgress()),
      timeScale: Math.abs(timeline.timeScale()),
      reversed: timeline.reversed(),
      totalDuration: Number.isFinite(duration) ? duration : 0,
      items,
      scrollTrigger,
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
      const trigger = scrollTriggerOf(timeline);
      if (isScrubbed(trigger)) {
        const start = Number.isFinite(trigger!.start) ? trigger!.start : 0;
        const end = Number.isFinite(trigger!.end) ? trigger!.end : start;
        trigger!.scroll(start + clamp(progress) * (end - start));
        trigger!.update?.();
        deliver();
        return true;
      }
      timeline.totalProgress(clamp(progress), true);
      deliver();
      return true;
    },
    setTimeScale(value) {
      requireActive();
      if (isScrubbed(scrollTriggerOf(timeline)) || !Number.isFinite(value) || value <= 0) return false;
      const reversed = timeline.reversed();
      timeline.timeScale(value);
      if (reversed) timeline.reversed(true);
      deliver();
      return true;
    },
    setReversed(value) {
      requireActive();
      if (isScrubbed(scrollTriggerOf(timeline))) return false;
      timeline.reversed(value);
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
