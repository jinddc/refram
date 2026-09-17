import { describe, expect, it } from "vitest";

describe("timeline inspection SSR entry", () => {
  it("imports without DOM globals or scheduled work", async () => {
    expect(globalThis.HTMLElement).toBeUndefined();
    expect(globalThis.customElements).toBeUndefined();

    const inspection = await import("../src/timeline/timeline-inspection");

    expect(inspection.attachTimelineInspector).toEqual(expect.any(Function));
    expect(inspection.ATTACH_TIMELINE_INSPECTOR).toEqual(expect.any(Symbol));
  });
});
