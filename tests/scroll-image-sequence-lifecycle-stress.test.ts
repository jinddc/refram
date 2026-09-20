// @vitest-environment happy-dom

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { afterEach, describe, expect, it } from "vitest";

gsap.registerPlugin(ScrollTrigger);

const FRAME_COUNT = 147;
const REBUILDS = 100;

interface TestImage {
  readonly index: number;
  loaded: boolean;
  onload?: () => void;
}

interface SequenceGeneration {
  readonly playhead: { frame: number };
  readonly images: readonly TestImage[];
  readonly tween: gsap.core.Tween;
  updateImage(): void;
}

afterEach(() => {
  ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
});

describe("lifecycle stress: GreenSock scroll image sequence", () => {
  it("records repeated tween/trigger creation and stale image callbacks", () => {
    // Reference: https://codepen.io/GreenSock/pen/VwgevYW
    // Image loading and canvas drawing are counted stand-ins. GSAP's tween and
    // ScrollTrigger are real, but no browser network or pixels are measured.
    const canvas = document.createElement("canvas");
    canvas.width = 1158;
    canvas.height = 770;
    document.body.append(canvas);

    const generations: SequenceGeneration[] = [];
    const draws: Array<{ generation: number; frame: number }> = [];
    const triggersBefore = ScrollTrigger.getAll().length;
    let firstFailingRebuild: number | undefined;

    const initializeLikeSource = (generation: number): SequenceGeneration => {
      const playhead = { frame: 0 };
      const images: TestImage[] = Array.from({ length: FRAME_COUNT }, (_, index) => ({
        index,
        loaded: false,
      }));
      let currentFrame = -1;
      const updateImage = () => {
        const frame = Math.round(playhead.frame);
        if (frame === currentFrame) return;
        const image = images[frame];
        if (!image?.loaded) {
          throw new DOMException("The image has no data.", "InvalidStateError");
        }
        draws.push({ generation, frame: image.index });
        currentFrame = frame;
      };
      images[0]!.onload = updateImage;

      const tween = gsap.to(playhead, {
        frame: images.length - 1,
        ease: "none",
        onUpdate: updateImage,
        duration: images.length / 30,
        scrollTrigger: { start: 0, end: "max", scrub: true },
      });
      return { playhead, images, tween, updateImage };
    };

    try {
      for (let rebuild = 0; rebuild <= REBUILDS; rebuild += 1) {
        generations.push(initializeLikeSource(rebuild));
        const activeTriggers = ScrollTrigger.getAll().length - triggersBefore;
        const retainedFirstImageCallbacks = generations.filter(
          ({ images }) => typeof images[0]?.onload === "function",
        ).length;
        if (
          firstFailingRebuild === undefined &&
          (activeTriggers !== 1 || retainedFirstImageCallbacks !== 1)
        ) {
          firstFailingRebuild = rebuild;
        }
      }

      expect(firstFailingRebuild).toBe(1);
      expect(generations).toHaveLength(101);
      expect(generations.reduce((total, item) => total + item.images.length, 0)).toBe(14_847);
      expect(ScrollTrigger.getAll().length - triggersBefore).toBe(101);
      expect(generations.every(({ tween }) => Boolean(tween.scrollTrigger))).toBe(true);

      // A delayed first image from generation 0 can still redraw the canvas.
      generations[0]!.images[0]!.loaded = true;
      generations[0]!.images[0]!.onload?.();
      expect(draws.at(-1)).toEqual({ generation: 0, frame: 0 });

      // An early scrub into an unloaded frame has no source-level readiness guard.
      const latest = generations.at(-1)!;
      latest.playhead.frame = 40;
      expect(() => latest.updateImage()).toThrowError(/image has no data/i);
    } finally {
      // Test-only cleanup; the referenced Pen does not define this path.
      for (const generation of generations) {
        generation.tween.scrollTrigger?.kill();
        generation.tween.kill();
        generation.images[0]!.onload = undefined;
      }
    }

    expect(ScrollTrigger.getAll().length).toBe(triggersBefore);
    expect(generations.every(({ images }) => images[0]?.onload === undefined)).toBe(true);
  }, 20_000);
});
