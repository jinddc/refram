import { gsap } from "gsap";

import {
  registerTimeline,
  type MotionTimelineRegistration,
} from "../../src/devtools/timeline/registry";

const POINT_COUNT = 10;
const POINT_DELAY_MAX = 0.3;
const PATH_DELAY = 0.25;

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing SVG shape overlay target: ${selector}`);
  return element;
}

export function registerSvgShapeOverlaysSequence(): MotionTimelineRegistration {
  const stage = requireElement<HTMLElement>(document, "#svg-shape-overlays-stage");
  const overlay = requireElement<SVGSVGElement>(stage, ".motion-shape-fixture__svg");
  const paths = [
    ...overlay.querySelectorAll<SVGPathElement>(".motion-shape-fixture__path"),
  ];
  const trigger = requireElement<HTMLButtonElement>(
    stage,
    ".motion-shape-fixture__trigger",
  );
  const originalPathData = paths.map((path) => path.getAttribute("d"));

  if (paths.length !== 2) {
    throw new Error("The SVG shape overlay demo requires exactly two paths.");
  }

  const restorePreview = () => {
    paths.forEach((path, index) => {
      const original = originalPathData[index];
      if (original === null) path.removeAttribute("d");
      else path.setAttribute("d", original);
    });
    trigger.textContent = "Open overlay";
    trigger.setAttribute("aria-pressed", "false");
  };

  return registerTimeline({
    id: "playground/svg-shape-overlays/sequence",
    label: "SVG shape overlays",
    root: stage,
    reset: restorePreview,
    create: () => {
      const allPoints = paths.map(() => Array<number>(POINT_COUNT).fill(100));
      const pointDelays = Array<number>(POINT_COUNT).fill(0);
      let isOpened = false;
      let timeline!: gsap.core.Timeline;

      const render = () => {
        paths.forEach((path, index) => {
          const points = allPoints[index]!;
          let d = isOpened ? `M 0 0 V ${points[0]} C` : `M 0 ${points[0]} C`;

          for (let point = 0; point < POINT_COUNT - 1; point += 1) {
            const x = ((point + 1) / (POINT_COUNT - 1)) * 100;
            const controlX = x - 50 / (POINT_COUNT - 1);
            d += ` ${controlX} ${points[point]} ${controlX} ${points[point + 1]} ${x} ${points[point + 1]}`;
          }

          d += isOpened ? " V 100 H 0" : " V 0 H 0";
          path.setAttribute("d", d);
        });
      };

      const populateTimeline = () => {
        timeline.pause(0).clear();
        for (let point = 0; point < POINT_COUNT; point += 1) {
          pointDelays[point] = Math.random() * POINT_DELAY_MAX;
        }
        paths.forEach((_, pathIndex) => {
          const points = allPoints[pathIndex]!;
          const pathDelay = PATH_DELAY * (
            isOpened ? pathIndex : paths.length - pathIndex - 1
          );
          for (let point = 0; point < POINT_COUNT; point += 1) {
            timeline.to(
              points,
              { [point]: 0 },
              pointDelays[point]! + pathDelay,
            );
          }
        });
      };

      const context = gsap.context(() => {
        timeline = gsap.timeline({
          paused: true,
          onUpdate: render,
          defaults: { duration: 0.9, ease: "power2.inOut" },
        });
        populateTimeline();
      }, stage);

      const onClick = () => {
        if (timeline.isActive()) return;
        isOpened = !isOpened;
        populateTimeline();
        trigger.textContent = isOpened ? "Close overlay" : "Open overlay";
        trigger.setAttribute("aria-pressed", String(isOpened));
        timeline.play(0);
      };
      stage.addEventListener("click", onClick);

      return {
        timeline,
        dispose: () => {
          stage.removeEventListener("click", onClick);
          context.revert();
          restorePreview();
        },
      };
    },
  });
}
