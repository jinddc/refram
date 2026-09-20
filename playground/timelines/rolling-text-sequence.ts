import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";

import {
  registerTimeline,
  type MotionTimelineRegistration,
} from "../../src/devtools/timeline-registry";

gsap.registerPlugin(SplitText);

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing rolling text target: ${selector}`);
  return element;
}

export function registerRollingTextSequence(): MotionTimelineRegistration {
  const stage = requireElement<HTMLElement>(document, "#rolling-text-stage");
  const lines = Array.from(stage.querySelectorAll<HTMLElement>(".motion-rolling-fixture__line"));
  if (lines.length !== 4) throw new Error("The rolling text demo needs four lines.");

  return registerTimeline({
    id: "playground/rolling-text/sequence",
    label: "Rolling text SplitText",
    root: stage,
    create: () => {
      let splits!: SplitText[];
      let timeline!: gsap.core.Timeline;
      const context = gsap.context(() => {
        gsap.set(stage, { visibility: "visible" });
        splits = lines.map((line) => SplitText.create(line, {
          type: "chars",
          charsClass: "motion-rolling-fixture__char",
        }));

        const transformOrigin = `50% 50% ${-window.innerWidth / 8}`;
        gsap.set(lines, { perspective: 700, transformStyle: "preserve-3d" });
        timeline = gsap.timeline({ paused: true, repeat: -1 });
        splits.forEach((split, index) => {
          timeline.fromTo(
            split.chars,
            { rotationX: -90 },
            {
              rotationX: 90,
              stagger: 0.08,
              duration: 0.9,
              ease: "none",
              transformOrigin,
            },
            index * 0.45,
          );
        });
      }, stage);

      // Inactive previews live under a hidden source container. Do not leave
      // this infinite timeline ticking after the user selects another demo.
      const pauseWhenHidden = () => {
        if (stage.getClientRects().length === 0) timeline.pause();
      };
      let resizeObserver: ResizeObserver | undefined;
      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(pauseWhenHidden);
        resizeObserver.observe(stage);
      }

      return {
        timeline,
        dispose: () => {
          resizeObserver?.disconnect();
          context.revert();
          splits.forEach((split) => split.revert());
        },
      };
    },
  });
}
