// @vitest-environment happy-dom

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MotionTimelineElement } from "../src/timeline/timeline-element";
import {
  attachTimelineInspector,
  type TimelineInspectionSnapshot,
} from "../src/timeline/timeline-inspection";
import { MotionTweenElement } from "../src/timeline/tween-element";

beforeAll(() => {
  gsap.registerPlugin(ScrollTrigger);

  if (!customElements.get("motion-timeline")) {
    customElements.define(
      "motion-timeline",
      MotionTimelineElement,
    );
  }
  if (!customElements.get("motion-tween")) {
    customElements.define(
      "motion-tween",
      MotionTweenElement,
    );
  }
});

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false }) as MediaQueryList),
  );
});

afterEach(() => {
  document.body.replaceChildren();
  ScrollTrigger.getAll().forEach((trigger) => trigger.kill(true));
  gsap.globalTimeline.clear();
  vi.unstubAllGlobals();
});

async function flushComposition(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("timeline ScrollTrigger integration", () => {
  it("owns one real root trigger across refresh and disconnect", async () => {
    const timeline = document.createElement(
      "motion-timeline",
    ) as MotionTimelineElement;
    const tween = document.createElement(
      "motion-tween",
    ) as MotionTweenElement;
    tween.style.opacity = "1";
    tween.options = {
      from: { opacity: 0 },
      to: { opacity: 1 },
      duration: 1,
    };
    timeline.options = {
      scrollTrigger: {
        trigger: timeline,
        start: 0,
        end: 100,
        scrub: true,
        pin: true,
      },
    };
    timeline.append(tween);
    document.body.append(timeline);
    await flushComposition();

    const snapshots: TimelineInspectionSnapshot[] = [];
    const attachment = attachTimelineInspector(
      timeline,
      (snapshot) => snapshots.push(snapshot),
    );

    expect(ScrollTrigger.getAll()).toHaveLength(1);
    expect(tween.style.opacity).toBe("0");
    expect(timeline.totalDuration()).toBeCloseTo(1);

    timeline.refresh();
    expect(ScrollTrigger.getAll()).toHaveLength(1);
    await flushComposition();
    expect(snapshots.some(
      (snapshot) => snapshot.readiness === "disconnected",
    )).toBe(false);

    timeline.cancel();
    expect(ScrollTrigger.getAll()).toHaveLength(0);
    expect(document.querySelectorAll(".pin-spacer")).toHaveLength(0);
    await flushComposition();
    expect(snapshots.at(-1)?.readiness).toBe("cancelled");

    timeline.refresh();
    expect(ScrollTrigger.getAll()).toHaveLength(1);
    await flushComposition();
    expect(snapshots.at(-1)?.readiness).toBe("ready");

    timeline.remove();
    await flushComposition();
    expect(ScrollTrigger.getAll()).toHaveLength(0);
    expect(snapshots.at(-1)?.readiness).toBe("disconnected");
    attachment.detach();
  });
});
