import { describe, expect, it } from "vitest";

describe("standalone reveal SSR entry", () => {
  it("imports and tolerates explicit registration without DOM globals", async () => {
    expect(globalThis.HTMLElement).toBeUndefined();
    expect(globalThis.customElements).toBeUndefined();

    const entry = await import("../src/index");

    expect(entry.MotionRevealElement).toEqual(expect.any(Function));
    expect(entry.registerMotionReveal).not.toThrow();
  });
});
