import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import {
  registerMotionTimeline,
  type MotionTimelineElement,
  type MotionTweenElement,
} from "../src";

gsap.registerPlugin(ScrollTrigger);

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing timeline fixture: ${selector}`);
  return element;
}

const sequence = requireElement<MotionTimelineElement>("#sequence");
const nested = requireElement<MotionTimelineElement>("#nested");
const empty = requireElement<MotionTimelineElement>("#empty");
const stress = requireElement<MotionTimelineElement>("#stress");
const scrollSequence = requireElement<MotionTimelineElement>("#scroll-sequence");
const scrollSection = requireElement<HTMLElement>("#scroll-driver");
const state = requireElement<HTMLOutputElement>("#timeline-state");
const scrollState = requireElement<HTMLOutputElement>("#scroll-state");
const first = requireElement<MotionTweenElement>("#sequence-a");
const second = requireElement<MotionTweenElement>("#sequence-b");
const third = requireElement<MotionTweenElement>("#sequence-c");
const nestedTween = requireElement<MotionTweenElement>("#nested-tween");
const scrollFirst = requireElement<MotionTweenElement>("#scroll-a");
const scrollSecond = requireElement<MotionTweenElement>("#scroll-b");
const scrollThird = requireElement<MotionTweenElement>("#scroll-c");
const scrollNestedTween = requireElement<MotionTweenElement>("#scroll-nested-tween");

sequence.options = { defaults: { duration: 0.55, ease: "power3.out" }};
first.options = {
  from: { opacity: 0.18, x: -72, rotate: -2 },
  to: { opacity: 1, x: 0, rotate: 0 },
};
second.options = {
  from: { opacity: 0.18, y: 56, scale: 0.94 },
  to: { opacity: 1, y: 0, scale: 1 },
  position: "<35%",
};
third.options = {
  from: { opacity: 0.18, x: 72, borderRadius: "48px" },
  to: { opacity: 1, x: 0, borderRadius: "0px" },
  position: ">-0.12",
};
nestedTween.options = {
  from: { opacity: 0, y: 20 },
  to: { opacity: 1, y: 0 },
  duration: 0.3,
};

scrollSequence.options = {
  defaults: { duration: 1, ease: "none" },
  scrollTrigger: {
    trigger: scrollSection,
    start: "top top",
    end: "+=1800",
    scrub: true,
    pin: true,
    invalidateOnRefresh: true,
  },
};
scrollFirst.options = {
  from: { opacity: 0.12, xPercent: -36, rotate: -5 },
  to: { opacity: 1, xPercent: 0, rotate: 0 },
};
scrollSecond.options = {
  from: { opacity: 0.12, yPercent: 45, scale: 0.88 },
  to: { opacity: 1, yPercent: 0, scale: 1 },
  position: "<35%",
};
scrollThird.options = {
  from: { opacity: 0.12, xPercent: 36, rotate: 5 },
  to: { opacity: 1, xPercent: 0, rotate: 0 },
  position: "<45%",
};
scrollNestedTween.options = {
  from: { opacity: 0, y: 18 },
  to: { opacity: 1, y: 0 },
  duration: 0.25,
};

for (let index = 1; index <= 20; index += 1) {
  const tween = document.createElement("motion-tween") as MotionTweenElement;
  tween.textContent = String(index).padStart(2, "0");
  tween.options = {
    from: { opacity: 0.35, y: 8 },
    to: { opacity: 1, y: 0 },
    duration: 0.05,
    position: index === 1 ? 0 : "<0.02",
  };
  stress.append(tween);
}

for (const type of ["motion-start", "motion-finish", "motion-cancel", "motion-interrupt"]) {
  sequence.addEventListener(type, () => {
    state.value = `${type.replace("motion-", "")} / ${sequence.playState}`;
  });
}

for (const type of ["motion-start", "motion-finish", "motion-cancel", "motion-interrupt"]) {
  scrollSequence.addEventListener(type, () => {
    scrollState.value = `${type.replace("motion-", "")} / ${scrollSequence.playState}`;
  });
}

document.querySelector(".controls")?.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "play") void sequence.play();
  else if (action === "pause") sequence.pause();
  else if (action === "reverse") void sequence.reverse();
  else if (action === "restart") void sequence.restart();
  else if (action === "finish") sequence.finish();
  else if (action === "cancel") sequence.cancel();
});

function appendAsyncTween(): MotionTweenElement {
  const tween = document.createElement("motion-tween") as MotionTweenElement;
  tween.className = "late-tween";
  tween.textContent = "Late content joined the authored timeline.";
  tween.options = {
    from: { opacity: 0, x: -28 },
    to: { opacity: 1, x: 0 },
    duration: 0.35,
  };
  empty.append(tween);
  return tween;
}

document.querySelector("#append-async")?.addEventListener("click", () => {
  void empty.play();
  window.setTimeout(appendAsyncTween, 120);
});

registerMotionTimeline();
queueMicrotask(() => {
  scrollState.value = scrollSequence.playState;
});

function mutateScrollTimeline(): void {
  scrollThird.options = {
    from: { opacity: 0.12, xPercent: 36, rotate: 5 },
    to: { opacity: 1, xPercent: 0, rotate: 0, scale: 1.04 },
    duration: 1.2,
    position: "<45%",
  };
}

document.querySelector("#mutate-scroll")?.addEventListener(
  "click",
  mutateScrollTimeline,
);

Object.assign(window, {
  __timelineHarness: {
    sequence,
    nested,
    empty,
    stress,
    scrollSequence,
    scrollSection,
    scrollNestedTween,
    ScrollTrigger,
    appendAsyncTween,
    mutateScrollTimeline,
  },
});
