import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";

import {
  registerTimeline,
  type MotionTimelineRegistration,
} from "../../src/devtools/timeline-registry";

gsap.registerPlugin(SplitText);

function requireElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing container animation target: ${selector}`);
  }
  return element;
}

export function registerContainerAnimationSequence(): MotionTimelineRegistration {
  const stage = requireElement<HTMLElement>(document, "#container-animation-stage");
  const text = requireElement<HTMLElement>(stage, ".motion-container-fixture__text");

  return registerTimeline({
    id: "playground/container-animation/sequence",
    label: "Container animation SplitText",
    root: stage,
    create: () => {
      let split!: SplitText;
      let timeline!: gsap.core.Timeline;
      const context = gsap.context(() => {
        split = SplitText.create(text, {
          type: "chars,words",
          charsClass: "motion-container-fixture__char",
          wordsClass: "motion-container-fixture__word",
        });

        timeline = gsap.timeline({ paused: true });
        timeline
          .to(
            text,
            {
              xPercent: -100,
              duration: 5,
              ease: "none",
            },
            0,
          )
          .from(
            split.chars,
            {
              yPercent: "random(-200, 200)",
              rotation: "random(-20, 20)",
              duration: 0.7,
              ease: "back.out(1.2)",
              stagger: 0.035,
            },
            0.15,
          );
      }, stage);

      return {
        timeline,
        tracks: [{
          id: "characters",
          label: "Characters",
          animation: timeline.getChildren(false, true, false)[1] as gsap.core.Tween,
          targets: split.chars,
        }],
        dispose: () => {
          context.revert();
          split.revert();
        },
      };
    },
  });
}
