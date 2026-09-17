import type { gsap } from "gsap";
import type { ScrollTrigger } from "gsap/ScrollTrigger";

import type { MotionTweenVars } from "../gsap/gsap.types";
import type { TweenDefinition } from "./tween.types";

type GsapTimelineVars = NonNullable<Parameters<typeof gsap.timeline>[0]>;
type TimelineInterruptVars = Pick<
  MotionTweenVars,
  "onInterrupt" | "onInterruptParams"
>;

export type MotionTimelineOptions = Omit<
  GsapTimelineVars,
  "paused" | "reversed" | "scrollTrigger"
> & TimelineInterruptVars & {
  scrollTrigger?: ScrollTrigger.Vars;
};

export type MotionPlaybackState =
  | "idle"
  | "running"
  | "paused"
  | "finished";

export interface MotionPlaybackEventDetail {
  readonly playState: MotionPlaybackState;
}

export interface TimelineDefinition {
  readonly options: Readonly<MotionTimelineOptions>;
  readonly items: readonly TweenDefinition[];
}

export interface TimelineLifecycleHooks {
  onStart(): void;
  onComplete(): void;
  onInterrupt(): void;
  onScrollReady(progress: number, reducedMotion: boolean): void;
  onInspectionChange(replacement: boolean): void;
}
