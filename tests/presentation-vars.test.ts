import { describe, expect, it, vi } from "vitest";

import { sanitizePresentationVars } from "../src/gsap/presentation-vars";

describe("sanitizePresentationVars", () => {
  it("keeps presentation values without mutating the input", () => {
    const vars = {
      autoAlpha: 0,
      x: 24,
      backgroundColor: "red",
    };

    expect(sanitizePresentationVars(vars)).toEqual(vars);
    expect(sanitizePresentationVars(vars)).not.toBe(vars);
  });

  it("removes timing, playback, sequencing, and callback controls", () => {
    const onStart = vi.fn();

    expect(
      sanitizePresentationVars({
        opacity: 0,
        duration: 2,
        delay: 1,
        ease: "power2.out",
        paused: true,
        repeat: 2,
        stagger: 0.1,
        startAt: { opacity: 1 },
        scrollTrigger: {} as never,
        onStart,
        onCustomLifecycle: vi.fn(),
      }),
    ).toEqual({ opacity: 0 });
  });
});
