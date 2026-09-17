import { describe, expect, it } from "vitest";

describe("timeline SSR entry", () => {
  it("imports without DOM globals and registration remains explicit", async () => {
    expect(globalThis.HTMLElement).toBeUndefined();
    expect(globalThis.customElements).toBeUndefined();

    const entry = await import("../src/index");

    expect(entry.MotionTimelineElement).toEqual(expect.any(Function));
    expect(entry.MotionTweenElement).toEqual(expect.any(Function));
    expect(entry.registerMotionTimeline).not.toThrow();
    expect(entry.registerMotionTween).not.toThrow();
    expect(entry).not.toHaveProperty("attachTimelineInspector");
    expect(entry).not.toHaveProperty("ATTACH_TIMELINE_INSPECTOR");
  });
});
