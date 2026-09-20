// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, describe, expect, it } from "vitest";

import { createTimelineRegistry } from "../src/devtools/timeline-registry";
import { attachGsapTimelineSession } from "../src/devtools/timeline-session";

interface Particle {
  x: number;
  y: number;
  scale: number;
  rotate: number;
  img: { readonly width: number; readonly height: number };
}

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
});

describe("timeline registry stress: GreenSock Canvas particles", () => {
  it("rebuilds an infinite particle timeline without losing its authored seek phase", () => {
    // Reference: https://codepen.io/GreenSock/pen/NWZRRNb
    // Fake image dimensions and drawing calls isolate lifecycle from remote assets.
    const root = document.createElement("main");
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    root.append(canvas);
    document.body.append(root);

    const baseline = canvas.outerHTML;
    const images = Array.from({ length: 21 }, () => ({ width: 32, height: 32 }));
    const drawing = {
      clearCount: 0,
      imageCount: 0,
      clearRect: () => { drawing.clearCount += 1; },
      translate: () => undefined,
      rotate: () => undefined,
      drawImage: () => { drawing.imageCount += 1; },
      resetTransform: () => undefined,
    };

    const registry = createTimelineRegistry();
    const globalChildrenBefore = gsap.globalTimeline.getChildren(true, true, true).length;
    const baselinesBeforeCreate: string[] = [];
    const authoredPhases: number[] = [];
    let createCount = 0;
    let disposeCount = 0;
    let resetCount = 0;
    let resizeCount = 0;
    let pointerCount = 0;
    let activeRuntimes = 0;
    let activeResizeListeners = 0;
    let activePointerListeners = 0;
    let activeTransportTweens = 0;
    let maximumRuntimes = 0;
    let maximumResizeListeners = 0;
    let maximumPointerListeners = 0;
    let maximumTransportTweens = 0;
    let expectedGlobalChildren = 0;
    let viewportWidth = 640;
    let viewportHeight = 360;

    const registration = registry.register({
      id: "stress/canvas-particles",
      root,
      reset: () => {
        resetCount += 1;
        canvas.width = 640;
        canvas.height = 360;
        drawing.clearRect();
      },
      create: () => {
        baselinesBeforeCreate.push(canvas.outerHTML);
        createCount += 1;
        activeRuntimes += 1;
        maximumRuntimes = Math.max(maximumRuntimes, activeRuntimes);

        let width = canvas.width;
        let height = canvas.height;
        let radius = Math.max(width, height);
        const particles: Particle[] = Array.from({ length: 99 }, (_, index) => ({
          x: 0,
          y: 0,
          scale: 0,
          rotate: 0,
          img: images[index % images.length]!,
        }));
        const draw = () => {
          particles.sort((left, right) => left.scale - right.scale);
          drawing.clearRect();
          particles.forEach((particle) => {
            drawing.translate();
            drawing.rotate();
            drawing.drawImage();
            drawing.resetTransform();
          });
        };

        let timeline!: gsap.core.Timeline;
        const context = gsap.context(() => {
          timeline = gsap.timeline({ paused: true, onUpdate: draw }).fromTo(
            particles,
            {
              x: (index: number) => {
                const angle = (index / particles.length) * Math.PI * 2 - Math.PI / 2;
                return Math.cos(angle * 10) * radius;
              },
              y: (index: number) => {
                const angle = (index / particles.length) * Math.PI * 2 - Math.PI / 2;
                return Math.sin(angle * 10) * radius;
              },
              scale: 1.1,
              rotate: 0,
            },
            {
              duration: 5,
              ease: "sine",
              x: 0,
              y: 0,
              scale: 0,
              rotate: -3,
              stagger: { each: -0.05, repeat: -1 },
            },
            0,
          );
          // The Pen runs immediately after seek(99); force its first draw because
          // this registry fixture intentionally starts the timeline paused.
          timeline.seek(99, false);
          authoredPhases.push(timeline.totalTime());
        }, root);

        let transportTween: gsap.core.Tween | undefined;
        const onResize = () => {
          resizeCount += 1;
          width = canvas.width = viewportWidth;
          height = canvas.height = viewportHeight;
          radius = Math.max(width, height);
          timeline.invalidate();
        };
        const onPointerUp = () => {
          pointerCount += 1;
          if (transportTween) {
            transportTween.kill();
            activeTransportTweens -= 1;
          }
          transportTween = gsap.to(timeline, {
            timeScale: timeline.isActive() ? 0 : 1,
            duration: 0.5,
          });
          activeTransportTweens += 1;
          maximumTransportTweens = Math.max(
            maximumTransportTweens,
            activeTransportTweens,
          );
        };

        window.addEventListener("resize", onResize);
        canvas.addEventListener("pointerup", onPointerUp);
        activeResizeListeners += 1;
        activePointerListeners += 1;
        maximumResizeListeners = Math.max(
          maximumResizeListeners,
          activeResizeListeners,
        );
        maximumPointerListeners = Math.max(
          maximumPointerListeners,
          activePointerListeners,
        );

        return {
          timeline,
          dispose: () => {
            disposeCount += 1;
            window.removeEventListener("resize", onResize);
            canvas.removeEventListener("pointerup", onPointerUp);
            activeResizeListeners -= 1;
            activePointerListeners -= 1;
            if (transportTween) {
              transportTween.kill();
              activeTransportTweens -= 1;
              transportTween = undefined;
            }
            context.revert();
            drawing.clearRect();
            activeRuntimes -= 1;
          },
        };
      },
    });

    expectedGlobalChildren = gsap.globalTimeline.getChildren(true, true, true).length;
    expect(registration.timeline.totalTime()).toBeCloseTo(99, 5);
    expect(drawing.imageCount).toBeGreaterThanOrEqual(99);

    const session = attachGsapTimelineSession(registration.timeline, () => undefined);
      expect(session.read().items).toHaveLength(0);
      expect(session.read().readiness).toBe("empty");
    session.detach();

    for (let cycle = 0; cycle < 100; cycle += 1) {
      const previous = registration.timeline;
      switch (cycle % 5) {
        case 0:
          previous.seek(105);
          break;
        case 1:
          previous.play().seek(99.5).pause();
          break;
        case 2: {
          const before = resizeCount;
          viewportWidth = 800;
          viewportHeight = 420;
          window.dispatchEvent(new Event("resize"));
          expect(resizeCount - before).toBe(1);
          expect(canvas.width).toBe(800);
          previous.seek(105);
          break;
        }
        case 3:
        case 4: {
          const before = pointerCount;
          canvas.dispatchEvent(new Event("pointerup"));
          if (cycle % 5 === 4) canvas.dispatchEvent(new Event("pointerup"));
          expect(pointerCount - before).toBe(cycle % 5 === 4 ? 2 : 1);
          expect(activeTransportTweens).toBe(1);
          break;
        }
      }

      const replacement = registration.replay();
      expect(replacement).not.toBe(previous);
      expect(replacement.paused()).toBe(true);
      expect(replacement.totalTime()).toBeCloseTo(99, 5);
      expect(activeRuntimes).toBe(1);
      expect(activeResizeListeners).toBe(1);
      expect(activePointerListeners).toBe(1);
      expect(activeTransportTweens).toBe(0);
      expect(gsap.globalTimeline.getChildren(true, true, true)).toHaveLength(
        expectedGlobalChildren,
      );
    }

    expect(baselinesBeforeCreate).toHaveLength(101);
    expect(baselinesBeforeCreate.every((html) => html === baseline)).toBe(true);
    expect(authoredPhases).toHaveLength(101);
    expect(authoredPhases.every((phase) => Math.abs(phase - 99) < 0.00001)).toBe(true);
    expect(createCount).toBe(101);
    expect(resetCount).toBe(100);
    expect(disposeCount).toBe(100);
    expect(maximumRuntimes).toBe(1);
    expect(maximumResizeListeners).toBe(1);
    expect(maximumPointerListeners).toBe(1);
    expect(maximumTransportTweens).toBe(1);
    expect(activeTransportTweens).toBe(0);

    registration.destroy();
    expect(disposeCount).toBe(101);
    expect(activeRuntimes).toBe(0);
    expect(activeResizeListeners).toBe(0);
    expect(activePointerListeners).toBe(0);
    expect(canvas.outerHTML).toBe(baseline);
    expect(gsap.globalTimeline.getChildren(true, true, true)).toHaveLength(
      globalChildrenBefore,
    );
    registry.destroy();
  }, 20_000);
});
