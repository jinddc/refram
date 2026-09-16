import { describe, expect, it } from "vitest";

import {
  copyRevealOptions,
  normalizeRevealOptions,
} from "../src/reveal/reveal-options";

describe("standalone reveal options", () => {
  it("removes invalid scalar values and trims a valid ease", () => {
    expect(
      normalizeRevealOptions({
        duration: Number.NaN,
        ease: "   ",
      }),
    ).toEqual({});

    expect(
      normalizeRevealOptions({ duration: -1, ease: " power3.out " }),
    ).toEqual({ ease: "power3.out" });
  });

  it("shallow-copies renderer vars while retaining nested references", () => {
    const nested = { amount: 0.5 };
    const source = {
      from: { y: 10, stagger: nested },
      to: { y: 0 },
    };

    const copy = copyRevealOptions(source);

    expect(copy).not.toBe(source);
    expect(copy.from).not.toBe(source.from);
    expect(copy.to).not.toBe(source.to);
    expect(copy.from?.stagger).toBe(nested);
  });
});
