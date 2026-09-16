// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import {
  isTimelineCompositionHost,
  REQUEST_TIMELINE_SYNC,
} from "../src/timeline/timeline-protocol";

describe("timeline composition protocol", () => {
  it("recognizes only elements with the internal sync capability", () => {
    const ordinary = document.createElement("div");
    const host = document.createElement("motion-timeline") as HTMLElement & {
      [REQUEST_TIMELINE_SYNC]: ReturnType<typeof vi.fn>;
    };
    host[REQUEST_TIMELINE_SYNC] = vi.fn();

    expect(isTimelineCompositionHost(null)).toBe(false);
    expect(isTimelineCompositionHost(ordinary)).toBe(false);
    expect(isTimelineCompositionHost(host)).toBe(true);
  });
});
