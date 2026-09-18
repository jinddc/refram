import { gsap } from "gsap";

import {
  registerTimeline,
  type MotionTimelineRegistration,
} from "../../src/devtools/timeline-registry";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing editor sequence target: ${selector}`);
  return element;
}

export function registerEditorSequence(): MotionTimelineRegistration {
  const stage = requireElement<HTMLElement>("#editor-stage");
  const opening = requireElement<HTMLElement>("#opening");
  const focus = requireElement<HTMLElement>("#focus");
  const resolve = requireElement<HTMLElement>("#resolve");

  return registerTimeline({
    id: "playground/editor/sequence",
    label: "Editor sequence",
    root: stage,
    create: () => {
      let timeline!: gsap.core.Timeline;
      const context = gsap.context(() => {
        gsap.set(opening, { opacity: 0 })
        gsap.set(focus, { opacity: 0 })
        gsap.set(resolve, { opacity: 0 })

        timeline = gsap.timeline({
          paused: true,
          defaults: { duration: 1.6, ease: "power3.out" },
        });
        timeline
          .fromTo(
            opening,
            { opacity: 0, x: -70 },
            { opacity: 1, x: 0, immediateRender: false },
            0,
          )
          .fromTo(
            focus,
            { opacity: 0.25, y: 64, scale: 0.94 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 1.2,
              ease: "power2.out",
              immediateRender: false,
            },
            "<35%",
          )
          .fromTo(
            resolve,
            { opacity: 0.25, x: 70 },
            { opacity: 1, x: 0, duration: 0.9, immediateRender: false },
            ">-0.18",
          );
      }, stage);

      return {
        timeline,
        dispose: () => context.revert(),
      };
    },
  });
}
