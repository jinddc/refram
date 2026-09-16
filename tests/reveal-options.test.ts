import { describe, expect, it } from "vitest";

import {
  copyRevealOptions,
  normalizeRevealOptions,
} from "../src/reveal/reveal-options";

describe("standalone reveal options", () => {
  it("removes invalid scalar values and trims a valid ease", () => {
    expect(
      normalizeRevealOptions({
        threshold: Number.POSITIVE_INFINITY,
        duration: Number.NaN,
        ease: "   ",
      }),
    ).toEqual({});

    expect(
      normalizeRevealOptions({
        threshold: -0.1,
        duration: -1,
        ease: " power3.out ",
      }),
    ).toEqual({ ease: "power3.out" });

    expect(normalizeRevealOptions({ threshold: 1.1 })).toEqual({});
  });

  it("retains inclusive threshold boundaries", () => {
    expect(normalizeRevealOptions({ threshold: 0 })).toEqual({
      threshold: 0,
    });
    expect(normalizeRevealOptions({ threshold: 1 })).toEqual({
      threshold: 1,
    });
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
