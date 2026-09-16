import type { MotionTweenVars } from "../gsap/gsap.types";

export type { MotionTweenVars } from "../gsap/gsap.types";

export interface StandaloneRevealOptions {
  threshold?: number;
  duration?: number;
  ease?: string;
  from?: MotionTweenVars;
  to?: MotionTweenVars;
}
