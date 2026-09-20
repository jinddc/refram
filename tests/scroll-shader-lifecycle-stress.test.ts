// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, describe, expect, it } from "vitest";

const FRAME_COUNT = 13;
const REBUILDS = 100;

interface SourceLikeGeneration {
  readonly proxy: { v: number; s: number };
  readonly canvases: readonly HTMLCanvasElement[];
  readonly ticks: readonly ((time: number) => void)[];
  readonly trigger: { update(velocity: number): void; kill(): void };
}

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
});

describe("lifecycle stress: GreenSock Scroll Shader", () => {
  it("records source-like resource accumulation across 100 reinitializations", () => {
    // Reference: https://codepen.io/GreenSock/pen/EaVbXeM
    // Three.js and ScrollTrigger are represented by counted resources here.
    // This probes the source's missing teardown, not real GPU memory or scroll behavior.
    const root = document.createElement("main");
    const frames = Array.from({ length: FRAME_COUNT }, () => document.createElement("div"));
    root.append(...frames);
    document.body.append(root);

    const generations: SourceLikeGeneration[] = [];
    const pendingTextureLoads: Array<() => void> = [];
    const activeTicks = new Set<(time: number) => void>();
    let activeTriggers = 0;
    let activeRenderers = 0;
    let activeGeometries = 0;
    let activeMaterials = 0;
    let completedTextureLoads = 0;
    let firstFailingRebuild: number | undefined;

    const initializeLikeSource = (): SourceLikeGeneration => {
      const proxy = { v: 0, s: 0 };
      activeTriggers += 1;
      const trigger = {
        update(velocity: number) {
          const normalized = gsap.utils.clamp(-2000, 2000, velocity) / 1000;
          const strength = Math.min(1, Math.abs(normalized));
          if (strength > Math.abs(proxy.s)) {
            proxy.v = normalized;
            proxy.s = strength;
            gsap.to(proxy, {
              v: 0,
              s: 0,
              duration: 0.8,
              ease: "sine.inOut",
              overwrite: true,
            });
          }
        },
        kill() {
          activeTriggers -= 1;
        },
      };

      const canvases: HTMLCanvasElement[] = [];
      const ticks: Array<(time: number) => void> = [];
      for (const frame of frames) {
        const canvas = document.createElement("canvas");
        frame.append(canvas);
        canvases.push(canvas);
        activeRenderers += 1;
        activeGeometries += 1;
        activeMaterials += 1;

        const uniforms = { time: 0, velocity: 0, strength: 0, textureReady: false };
        pendingTextureLoads.push(() => {
          uniforms.textureReady = true;
          completedTextureLoads += 1;
        });
        const tick = (time: number) => {
          uniforms.time = time;
          uniforms.velocity = proxy.v;
          uniforms.strength = proxy.s;
        };
        ticks.push(tick);
        activeTicks.add(tick);
        gsap.ticker.add(tick);
      }
      return { proxy, canvases, ticks, trigger };
    };

    try {
      for (let rebuild = 0; rebuild <= REBUILDS; rebuild += 1) {
        const generation = initializeLikeSource();
        generations.push(generation);
        generation.trigger.update(1500);

        const expectedSingleGeneration =
          activeTriggers === 1 &&
          activeTicks.size === FRAME_COUNT &&
          root.querySelectorAll("canvas").length === FRAME_COUNT;
        if (!expectedSingleGeneration && firstFailingRebuild === undefined) {
          firstFailingRebuild = rebuild;
        }
      }

      expect(firstFailingRebuild).toBe(1);
      expect(generations).toHaveLength(101);
      expect(activeTriggers).toBe(101);
      expect(activeTicks.size).toBe(1313);
      expect(activeRenderers).toBe(1313);
      expect(activeGeometries).toBe(1313);
      expect(activeMaterials).toBe(1313);
      expect(root.querySelectorAll("canvas")).toHaveLength(1313);
      expect(pendingTextureLoads).toHaveLength(1313);

      // A late load from the first generation still runs after 100 rebuilds.
      pendingTextureLoads[0]!();
      expect(completedTextureLoads).toBe(1);
    } finally {
      // Test-only cleanup; the referenced Pen does not contain this disposal path.
      for (const generation of generations) {
        generation.trigger.kill();
        gsap.killTweensOf(generation.proxy);
        for (const tick of generation.ticks) {
          gsap.ticker.remove(tick);
          activeTicks.delete(tick);
        }
        for (const canvas of generation.canvases) canvas.remove();
      }
      pendingTextureLoads.length = 0;
    }

    expect(activeTriggers).toBe(0);
    expect(activeTicks.size).toBe(0);
    expect(root.querySelectorAll("canvas")).toHaveLength(0);
  }, 20_000);
});
