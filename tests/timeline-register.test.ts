// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import {
  MotionTimelineElement,
  MotionTweenElement,
  registerMotionTimeline,
  registerMotionTween,
} from "../src/timeline";

describe("timeline registration", () => {
  it("registers the complete composition unit idempotently", () => {
    registerMotionTimeline();
    registerMotionTimeline();

    expect(customElements.get("motion-timeline")).toBe(MotionTimelineElement);
    expect(customElements.get("motion-tween")).toBe(MotionTweenElement);
  });

  it("allows the passive descriptor to be registered independently", () => {
    registerMotionTween();
    expect(customElements.get("motion-tween")).toBe(MotionTweenElement);
  });
});
