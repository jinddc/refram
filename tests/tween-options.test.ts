import { describe, expect, it, vi } from "vitest";

import {
  copyTweenOptions,
  normalizeTweenOptions,
} from "../src/timeline/tween-options";

describe("tween options", () => {
  it("copies renderer var containers and preserves nested references", () => {
    const nested = { amount: 2 };
    const callback = vi.fn();
    const options = {
      from: { x: 10, custom: nested },
      to: { x: 0, onComplete: callback },
      position: "<25%",
    };

    const copy = copyTweenOptions(options);

    expect(copy).toEqual(options);
    expect(copy).not.toBe(options);
    expect(copy.from).not.toBe(options.from);
    expect(copy.to).not.toBe(options.to);
    expect(copy.from?.custom).toBe(nested);
    expect(copy.to?.onComplete).toBe(callback);
  });

  it("normalizes scalar inputs without parsing GSAP position syntax", () => {
    expect(
      normalizeTweenOptions({
        duration: -1,
        ease: "  power3.out  ",
        position: "  <40%  ",
      }),
    ).toEqual({
      ease: "power3.out",
      position: "<40%",
    });

    expect(
      normalizeTweenOptions({ position: Number.POSITIVE_INFINITY }),
    ).toEqual({});
    expect(normalizeTweenOptions({ position: "   " })).toEqual({});
  });
});
