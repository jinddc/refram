import type { MotionTweenVars } from "./gsap.types";

const PRESENTATION_CONTROL_KEYS = new Set<string>([
  "callbackScope",
  "data",
  "delay",
  "duration",
  "ease",
  "easeReverse",
  "id",
  "immediateRender",
  "inherit",
  "keyframes",
  "lazy",
  "onComplete",
  "onCompleteParams",
  "onInterrupt",
  "onRepeat",
  "onRepeatParams",
  "onReverseComplete",
  "onReverseCompleteParams",
  "onStart",
  "onStartParams",
  "onUpdate",
  "onUpdateParams",
  "overwrite",
  "parent",
  "paused",
  "repeat",
  "repeatDelay",
  "repeatRefresh",
  "reversed",
  "runBackwards",
  "scrollTrigger",
  "stagger",
  "startAt",
  "yoyo",
  "yoyoEase",
]);

export function sanitizePresentationVars(
  vars: MotionTweenVars,
): MotionTweenVars {
  const presentation = { ...vars };

  for (const key of Object.keys(presentation)) {
    if (
      PRESENTATION_CONTROL_KEYS.has(key) ||
      /^on[A-Z]/u.test(key)
    ) {
      delete presentation[key];
    }
  }

  return presentation;
}
