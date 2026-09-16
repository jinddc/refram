import { register } from "../internal/register";
import { MotionTimelineElement } from "./timeline-element";
import { MotionTweenElement } from "./tween-element";

export function registerMotionTween(): void {
  register("motion-tween", MotionTweenElement);
}

export function registerMotionTimeline(): void {
  register("motion-timeline", MotionTimelineElement);
  registerMotionTween();
}
