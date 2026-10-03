import { gsap } from "gsap";

import {
  registerTimeline,
  type MotionTimelineRegistration,
} from "../../src/devtools/timeline/registry";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing detail sequence target: ${selector}`);
  return element;
}

export function registerDetailSequence(): MotionTimelineRegistration {
  const stage = requireElement<HTMLElement>("#detail-stage");
  const title = requireElement<HTMLElement>("#detail-title");
  const card = requireElement<HTMLElement>("#detail-card");

  return registerTimeline({
    id: "playground/detail/sequence",
    label: "Detail sequence",
    root: stage,
    create: () => {
      let timeline!: gsap.core.Timeline;
      const context = gsap.context(() => {
        timeline = gsap.timeline({ paused: true, defaults: { ease: "power2.out" } });
        timeline
          .fromTo(
            title,
            { opacity: 0, y: 36 },
            { opacity: 1, y: 0, duration: 0.8, immediateRender: false },
          )
          .fromTo(
            card,
            { opacity: 0.2, scale: 0.9 },
            { opacity: 1, scale: 1, duration: 1.1, immediateRender: false },
            "<25%",
          );
      }, stage);

      return {
        timeline,
        dispose: () => context.revert(),
      };
    },
  });
}
