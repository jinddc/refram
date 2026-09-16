import type { MotionTweenVars } from "../gsap/gsap.types";

export type TimelinePosition = number | string;

export interface MotionTweenOptions {
  from?: MotionTweenVars;
  to?: MotionTweenVars;
  duration?: number;
  ease?: string;
  position?: TimelinePosition;
}

export interface TweenDefinition {
  readonly source: HTMLElement;
  readonly target: HTMLElement;
  readonly options: MotionTweenOptions;
  readonly authoredPosition?: TimelinePosition;
}
