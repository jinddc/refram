import type { gsap } from "gsap";
import type { MotionTimelineTrack } from "./control";

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

export type TimelineInspectionTweenMode = "to" | "from" | "fromTo" | "mixed";

export type TimelineInspectionPropertyValue =
  | Readonly<{
    readonly kind: "literal";
    readonly value: string | number | boolean | null;
    readonly truncated?: true;
  }>
  | Readonly<{ readonly kind: "undefined" }>
  | Readonly<{ readonly kind: "implicit" }>
  | Readonly<{ readonly kind: "dynamic" }>
  | Readonly<{ readonly kind: "complex" }>
  | Readonly<{ readonly kind: "mixed" }>;

export interface TimelineInspectionProperty {
  readonly name: string;
  readonly from: TimelineInspectionPropertyValue;
  readonly to: TimelineInspectionPropertyValue;
}

export interface TimelineInspectionProperties {
  readonly mode: TimelineInspectionTweenMode;
  readonly properties: readonly TimelineInspectionProperty[];
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

const GSAP_OPTION_KEYS = new Set([
  "autoRevert",
  "callbackScope",
  "data",
  "delay",
  "defaults",
  "duration",
  "ease",
  "id",
  "immediateRender",
  "inherit",
  "keyframes",
  "lazy",
  "onCompleteParams",
  "onInterruptParams",
  "onRepeatParams",
  "onReverseCompleteParams",
  "onStartParams",
  "onUpdateParams",
  "overwrite",
  "parent",
  "paused",
  "repeat",
  "repeatDelay",
  "reversed",
  "runBackwards",
  "scrollTrigger",
  "stagger",
  "startAt",
  "yoyo",
  "yoyoEase",
]);

const MAX_AUTHORED_STRING_LENGTH = 160;
const IMPLICIT_VALUE = Object.freeze({ kind: "implicit" } as const);
const DYNAMIC_VALUE = Object.freeze({ kind: "dynamic" } as const);
const COMPLEX_VALUE = Object.freeze({ kind: "complex" } as const);
const UNDEFINED_VALUE = Object.freeze({ kind: "undefined" } as const);
const MIXED_VALUE = Object.freeze({ kind: "mixed" } as const);

interface AnimationPropertyInspection {
  readonly mode: Exclude<TimelineInspectionTweenMode, "mixed">;
  readonly properties: ReadonlyMap<string, Readonly<{
    readonly from: TimelineInspectionPropertyValue;
    readonly to: TimelineInspectionPropertyValue;
  }>>;
}

function ownDescriptors(value: object): Readonly<Record<string, PropertyDescriptor>> {
  try {
    return Object.getOwnPropertyDescriptors(value);
  } catch {
    return Object.freeze({});
  }
}

function literalString(value: string): TimelineInspectionPropertyValue {
  const normalized = value.replace(/[\r\n\t]/g, " ");
  if (normalized.length <= MAX_AUTHORED_STRING_LENGTH) {
    return Object.freeze({ kind: "literal", value: normalized });
  }
  return Object.freeze({
    kind: "literal",
    value: `${normalized.slice(0, MAX_AUTHORED_STRING_LENGTH - 1)}…`,
    truncated: true,
  });
}

function propertyValue(descriptor: PropertyDescriptor | undefined): TimelineInspectionPropertyValue {
  if (!descriptor || !("value" in descriptor)) return DYNAMIC_VALUE;
  const value = descriptor.value;
  if (typeof value === "function") return DYNAMIC_VALUE;
  if (typeof value === "string") return literalString(value);
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? Object.freeze({ kind: "literal", value })
      : COMPLEX_VALUE;
  }
  if (typeof value === "boolean" || value === null) {
    return Object.freeze({ kind: "literal", value });
  }
  if (value === undefined) return UNDEFINED_VALUE;
  return COMPLEX_VALUE;
}

function animatedDescriptors(
  descriptors: Readonly<Record<string, PropertyDescriptor>>,
): ReadonlyMap<string, PropertyDescriptor> {
  const properties = new Map<string, PropertyDescriptor>();
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (GSAP_OPTION_KEYS.has(key) || /^on[A-Z]/.test(key)) continue;
    properties.set(key, descriptor);
  }
  return properties;
}

function inspectAnimationProperties(
  animation: gsap.core.Animation,
): AnimationPropertyInspection {
  const vars = (animation as gsap.core.Animation & {
    readonly vars?: Readonly<Record<string, unknown>>;
  }).vars;
  const descriptors = vars && typeof vars === "object" ? ownDescriptors(vars) : {};
  const destination = animatedDescriptors(descriptors);
  const runBackwards = descriptors.runBackwards;
  const startAt = descriptors.startAt;
  const startAtValue = startAt && "value" in startAt ? startAt.value : undefined;
  const startAtIsDynamic = Boolean(startAt && !("value" in startAt));
  const hasStartingObject = startAtValue !== null && typeof startAtValue === "object";
  const mode = runBackwards && "value" in runBackwards && Boolean(runBackwards.value)
    ? "from"
    : hasStartingObject || startAtIsDynamic ? "fromTo" : "to";
  const start = hasStartingObject
    ? animatedDescriptors(ownDescriptors(startAtValue))
    : new Map<string, PropertyDescriptor>();
  const names = mode === "fromTo"
    ? new Set([...destination.keys(), ...start.keys()])
    : new Set(destination.keys());
  const properties = new Map<string, Readonly<{
    readonly from: TimelineInspectionPropertyValue;
    readonly to: TimelineInspectionPropertyValue;
  }>>();

  for (const name of names) {
    if (mode === "from") {
      properties.set(name, Object.freeze({
        from: propertyValue(destination.get(name)),
        to: IMPLICIT_VALUE,
      }));
    } else if (mode === "fromTo") {
      properties.set(name, Object.freeze({
        from: startAtIsDynamic ? DYNAMIC_VALUE
          : start.has(name) ? propertyValue(start.get(name)) : IMPLICIT_VALUE,
        to: destination.has(name) ? propertyValue(destination.get(name)) : IMPLICIT_VALUE,
      }));
    } else {
      properties.set(name, Object.freeze({
        from: IMPLICIT_VALUE,
        to: propertyValue(destination.get(name)),
      }));
    }
  }
  return { mode, properties };
}

function samePropertyValue(
  left: TimelineInspectionPropertyValue,
  right: TimelineInspectionPropertyValue,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind !== "literal" || right.kind !== "literal") return true;
  return Object.is(left.value, right.value) && left.truncated === right.truncated;
}

function aggregatePropertyValue(
  values: readonly (TimelineInspectionPropertyValue | undefined)[],
): TimelineInspectionPropertyValue {
  const first = values[0];
  if (!first || values.some((value) => !value || !samePropertyValue(first, value))) {
    return MIXED_VALUE;
  }
  return first;
}

export function inspectTimelineItemProperties(
  item: TimelineInspectionItem,
): TimelineInspectionProperties {
  const members = item.animations.map(inspectAnimationProperties);
  const firstMode = members[0]?.mode ?? "to";
  const mode = members.some((member) => member.mode !== firstMode) ? "mixed" : firstMode;
  const names = new Set(members.flatMap((member) => [...member.properties.keys()]));
  const properties = [...names]
    .sort((left, right) => left.localeCompare(right))
    .map((name): TimelineInspectionProperty => Object.freeze({
      name,
      from: aggregatePropertyValue(members.map((member) => member.properties.get(name)?.from)),
      to: aggregatePropertyValue(members.map((member) => member.properties.get(name)?.to)),
    }));
  return Object.freeze({ mode, properties: Object.freeze(properties) });
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
      const startAtDescriptor = Object.getOwnPropertyDescriptor(vars, "startAt");
      const startAt = startAtDescriptor && "value" in startAtDescriptor
        ? startAtDescriptor.value
        : undefined;
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
