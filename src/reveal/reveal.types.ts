import type { gsap } from "gsap";

export type MotionTweenVars = Parameters<typeof gsap.to>[1];

export interface StandaloneRevealOptions {
  duration?: number;
  ease?: string;
  from?: MotionTweenVars;
  to?: MotionTweenVars;
}
