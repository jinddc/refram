import { describe, expect, it } from "vitest";

describe("MotionElement SSR module evaluation", () => {
  it("loads without a browser HTMLElement global", async () => {
    expect(globalThis.HTMLElement).toBeUndefined();

    await expect(import("../src/core/motion-element")).resolves.toEqual(
      expect.objectContaining({ MotionElement: expect.any(Function) }),
    );
  });
});
