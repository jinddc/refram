// @vitest-environment happy-dom

import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";
import { afterEach, describe, expect, it } from "vitest";

import { createTimelineRegistry } from "../../../src/devtools/timeline/registry";
import { attachGsapTimelineSession } from "../../../src/devtools/timeline/session";

gsap.registerPlugin(SplitText);

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
});

describe("timeline registry stress: GreenSock Rolling text", () => {
  it("rebuilds four infinite SplitText lines 100 times without retaining wrappers or GSAP state", () => {
    // Reference: https://codepen.io/GreenSock/pen/dPMjJWv
    const root = document.createElement("div");
    const tube = document.createElement("div");
    root.className = "container";
    tube.className = "tube";
    root.append(tube);
    const lines = Array.from({ length: 4 }, (_, index) => {
      const line = document.createElement("h1");
      line.className = `line line${Math.min(index + 1, 3)}`;
      line.textContent = "SplitText";
      tube.append(line);
      return line;
    });
    document.body.append(root);

    const baseline = root.outerHTML;
    const registry = createTimelineRegistry();
    const globalChildrenBefore = gsap.globalTimeline.getChildren(true, true, true).length;
    const baselinesBeforeCreate: string[] = [];
    const splitCounts: number[] = [];
    let createCount = 0;
    let resetCount = 0;
    let disposeCount = 0;
    let activeRuntimes = 0;
    let maximumActiveRuntimes = 0;

    const registration = registry.register({
      id: "stress/rolling-text",
      root,
      reset: () => {
        resetCount += 1;
      },
      create: () => {
        baselinesBeforeCreate.push(root.outerHTML);
        createCount += 1;
        activeRuntimes += 1;
        maximumActiveRuntimes = Math.max(maximumActiveRuntimes, activeRuntimes);

        let splits!: SplitText[];
        let timeline!: gsap.core.Timeline;
        const context = gsap.context(() => {
          gsap.set(root, { visibility: "visible" });
          splits = lines.map((line) => SplitText.create(line, {
            type: "chars",
            charsClass: "char",
          }));

          const depth = -window.innerWidth / 8;
          const transformOrigin = `50% 50% ${depth}`;
          gsap.set(lines, { perspective: 700, transformStyle: "preserve-3d" });
          timeline = gsap.timeline({ paused: true, repeat: -1 });
          splits.forEach((split, index) => {
            timeline.fromTo(
              split.chars,
              { rotationX: -90 },
              {
                rotationX: 90,
                stagger: 0.08,
                duration: 0.9,
                ease: "none",
                transformOrigin,
              },
              index * 0.45,
            );
          });
        }, root);

        splitCounts.push(root.querySelectorAll(".char").length);
        return {
          timeline,
          dispose: () => {
            disposeCount += 1;
            context.revert();
            splits.forEach((split) => split.revert());
            activeRuntimes -= 1;
          },
        };
      },
    });

    const expectedCharacters = "SplitText".length * lines.length;
    const expectedGlobalChildren = gsap.globalTimeline.getChildren(true, true, true).length;
    expect(root.querySelectorAll(".char")).toHaveLength(expectedCharacters);
    expect(registration.timeline.getChildren(false, true, false)).toHaveLength(4);

    const session = attachGsapTimelineSession(registration.timeline, () => undefined);
    const inspection = session.read();
    expect(inspection.readiness).toBe("ready");
    expect(inspection.items).toHaveLength(4);
    expect(inspection.items.every((item) => item.source.classList.contains("char"))).toBe(true);
    expect(inspection.totalDuration).toBeGreaterThan(1_000_000_000);
    expect(session.seek(0.5)).toBe(true);
    expect(registration.timeline.totalTime()).toBeGreaterThan(1_000_000_000);
    registration.timeline.seek(0);
    session.detach();

    for (let cycle = 0; cycle < 100; cycle += 1) {
      const previous = registration.timeline;
      const oneLoop = previous.duration();
      switch (cycle % 4) {
        case 0:
          previous.seek(oneLoop * 0.95);
          break;
        case 1:
          previous.play().seek(oneLoop * 1.7).pause();
          break;
        case 2:
          previous.timeScale(2.5).seek(oneLoop * 3.25);
          break;
        default:
          previous.seek(oneLoop * 0.42).reverse().pause();
      }

      const replacement = registration.replay();
      expect(replacement).not.toBe(previous);
      expect(replacement.paused()).toBe(true);
      expect(replacement.totalTime()).toBe(0);
      expect(replacement.repeat()).toBe(-1);
      expect(root.querySelectorAll(".char")).toHaveLength(expectedCharacters);
      expect(root.querySelectorAll(".char .char")).toHaveLength(0);
      expect(activeRuntimes).toBe(1);
      expect(gsap.globalTimeline.getChildren(true, true, true)).toHaveLength(
        expectedGlobalChildren,
      );
    }

    expect(baselinesBeforeCreate).toHaveLength(101);
    expect(baselinesBeforeCreate.every((html) => html === baseline)).toBe(true);
    expect(splitCounts).toHaveLength(101);
    expect(splitCounts.every((count) => count === expectedCharacters)).toBe(true);
    expect(createCount).toBe(101);
    expect(resetCount).toBe(100);
    expect(disposeCount).toBe(100);
    expect(maximumActiveRuntimes).toBe(1);

    const finalSession = attachGsapTimelineSession(registration.timeline, () => undefined);
    expect(finalSession.read().readiness).toBe("ready");
    expect(finalSession.read().items).toHaveLength(4);
    finalSession.detach();

    registration.destroy();
    expect(disposeCount).toBe(101);
    expect(activeRuntimes).toBe(0);
    expect(root.outerHTML).toBe(baseline);
    expect(gsap.globalTimeline.getChildren(true, true, true)).toHaveLength(
      globalChildrenBefore,
    );
    registry.destroy();
  }, 20_000);
});
