import { gsap } from "gsap";
import {
  mountMotionDevTools,
  type MotionDevToolsHandle,
} from "./motion-devtools";
import type { MotionTimelineControl } from "./motion-timeline-control";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing Motion DevTools fixture: ${selector}`);
  return element;
}

const stage = requireElement<HTMLElement>("#editor-stage");
const opening = requireElement<HTMLElement>("#opening");
const focus = requireElement<HTMLElement>("#focus");
const resolve = requireElement<HTMLElement>("#resolve");

function createFixtureTimeline() {
  let timeline!: gsap.core.Timeline;
  const context = gsap.context(() => {
    timeline = gsap.timeline({
      paused: true,
      defaults: { duration: 1.6, ease: "power3.out" },
    });
    timeline
      .fromTo(
        opening,
        { opacity: 0.25, x: -70 },
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
}

const root = requireElement<HTMLElement>("#motion-devtools-root");
let handle: MotionDevToolsHandle | undefined;
let control: MotionTimelineControl | undefined;

function mount(): void {
  handle = mountMotionDevTools(root);
  control = handle.addTimeline({
    id: "editor-sequence",
    label: "Editor sequence",
    root: stage,
    create: createFixtureTimeline,
  });
}

mount();

const harness = {
  get timeline() {
    if (!control) throw new Error("Motion DevTools fixture is not mounted.");
    return control.timeline;
  },
  destroy(): void {
    handle?.destroy();
    handle = undefined;
    control = undefined;
  },
  remount(): void {
    if (handle) return;
    mount();
  },
};

Object.assign(window, { __motionDevToolsHarness: harness });

window.addEventListener("beforeunload", () => {
  harness.destroy();
}, { once: true });
