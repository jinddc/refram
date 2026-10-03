import type { gsap } from "gsap";
import type { MotionTimelineRegistration } from "../timeline/registry";

function scrollTriggerTarget(timeline: gsap.core.Timeline): Element | undefined {
  const trigger = (timeline as gsap.core.Timeline & {
    readonly scrollTrigger?: { readonly trigger?: unknown };
  }).scrollTrigger;
  return trigger?.trigger instanceof Element ? trigger.trigger : undefined;
}

export function resolveTimelineTarget(
  registration: MotionTimelineRegistration,
  hasScrollTrigger: boolean,
): Element | undefined {
  return hasScrollTrigger ? scrollTriggerTarget(registration.timeline) : registration.root;
}
