// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, describe, expect, it } from "vitest";

import { createTimelineRegistry } from "../src/devtools/timeline-registry";
import { attachGsapTimelineSession } from "../src/devtools/timeline-session";

const POINTS_PER_PATH = 10;
const PATH_COUNT = 2;

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
});

describe("timeline registry stress: GreenSock SVG Shape Overlays", () => {
  it("rebuilds array-target SVG paths 100 times without retaining authored resources", () => {
    // Reference: https://codepen.io/GreenSock/pen/qBedXpg
    const root = document.createElement("div");
    const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    overlay.setAttribute("viewBox", "0 0 100 100");
    const paths = Array.from({ length: PATH_COUNT }, () => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      overlay.append(path);
      return path;
    });
    root.append(overlay);
    document.body.append(root);

    const baseline = overlay.outerHTML;
    const originalPathData = paths.map((path) => path.getAttribute("d"));
    const registry = createTimelineRegistry();
    const globalChildrenBefore = gsap.globalTimeline.getChildren(true, true, true).length;
    let createCount = 0;
    let disposeCount = 0;
    let resetCount = 0;
    let renderCount = 0;
    let clickCount = 0;
    let activeRuntimes = 0;
    let activeListeners = 0;
    let maximumRuntimes = 0;
    let maximumListeners = 0;
    let expectedGlobalChildren = 0;
    const baselinesBeforeCreate: string[] = [];

    const restorePaths = () => {
      paths.forEach((path, index) => {
        const original = originalPathData[index];
        if (original === null) path.removeAttribute("d");
        else path.setAttribute("d", original);
      });
    };

    const registration = registry.register({
      id: "stress/svg-shape-overlays",
      root,
      reset: () => {
        resetCount += 1;
        restorePaths();
      },
      create: () => {
        baselinesBeforeCreate.push(overlay.outerHTML);
        createCount += 1;
        activeRuntimes += 1;
        maximumRuntimes = Math.max(maximumRuntimes, activeRuntimes);

        const allPoints = Array.from(
          { length: PATH_COUNT },
          () => Array<number>(POINTS_PER_PATH).fill(100),
        );
        const pointDelays = Array.from(
          { length: POINTS_PER_PATH },
          (_, index) => (index * 0.037) % 0.3,
        );
        let isOpened = true;
        const render = () => {
          renderCount += 1;
          paths.forEach((path, index) => {
            const points = allPoints[index]!;
            let d = isOpened ? `M 0 0 V ${points[0]} C` : `M 0 ${points[0]} C`;
            for (let point = 0; point < POINTS_PER_PATH - 1; point += 1) {
              const x = ((point + 1) / (POINTS_PER_PATH - 1)) * 100;
              const controlX = x - 50 / (POINTS_PER_PATH - 1);
              d += ` ${controlX} ${points[point]} ${controlX} ${points[point + 1]} ${x} ${points[point + 1]}`;
            }
            d += isOpened ? " V 100 H 0" : " V 0 H 0";
            path.setAttribute("d", d);
          });
        };

        const timeline = gsap.timeline({
          paused: true,
          onUpdate: render,
          defaults: { ease: "power2.inOut", duration: 0.9 },
        });
        const toggle = () => {
          timeline.progress(0).clear();
          for (let path = 0; path < PATH_COUNT; path += 1) {
            const points = allPoints[path]!;
            const pathDelay = 0.25 * (isOpened ? path : PATH_COUNT - path - 1);
            for (let point = 0; point < POINTS_PER_PATH; point += 1) {
              timeline.to(points, { [point]: 0 }, pointDelays[point]! + pathDelay);
            }
          }
        };
        const onClick = () => {
          clickCount += 1;
          if (!timeline.isActive()) {
            isOpened = !isOpened;
            toggle();
          }
        };

        toggle();
        overlay.addEventListener("click", onClick);
        activeListeners += 1;
        maximumListeners = Math.max(maximumListeners, activeListeners);

        return {
          timeline,
          dispose: () => {
            disposeCount += 1;
            overlay.removeEventListener("click", onClick);
            activeListeners -= 1;
            timeline.kill();
            restorePaths();
            activeRuntimes -= 1;
          },
        };
      },
    });

    expectedGlobalChildren = gsap.globalTimeline.getChildren(true, true, true).length;
    expect(registration.timeline.getChildren(false, true, false)).toHaveLength(20);

    const session = attachGsapTimelineSession(registration.timeline, () => undefined);
    const inspection = session.read();
    expect(inspection.totalDuration).toBeGreaterThan(0);
      expect(inspection.items).toHaveLength(0);
      expect(inspection.readiness).toBe("empty");
    session.detach();

    for (let cycle = 0; cycle < 100; cycle += 1) {
      const previous = registration.timeline;
      switch (cycle % 5) {
        case 0:
          previous.totalProgress(1, false);
          break;
        case 1:
          previous.play().totalProgress(0.42, true).pause();
          break;
        case 2:
          previous.totalProgress(0.73, true);
          break;
        case 3:
          previous.timeScale(2.5).totalProgress(0.25, true);
          break;
        default: {
          const before = clickCount;
          overlay.dispatchEvent(new MouseEvent("click"));
          expect(clickCount - before).toBe(1);
          previous.totalProgress(0.6, false);
        }
      }
      expect(paths.every((path) => path.hasAttribute("d"))).toBe(true);

      const replacement = registration.replay();
      expect(replacement).not.toBe(previous);
      expect(replacement.paused()).toBe(true);
      expect(replacement.getChildren(false, true, false)).toHaveLength(20);
      expect(activeRuntimes).toBe(1);
      expect(activeListeners).toBe(1);
      expect(gsap.globalTimeline.getChildren(true, true, true)).toHaveLength(
        expectedGlobalChildren,
      );
    }

    expect(baselinesBeforeCreate).toHaveLength(101);
    expect(baselinesBeforeCreate.every((html) => html === baseline)).toBe(true);
    expect(createCount).toBe(101);
    expect(resetCount).toBe(100);
    expect(disposeCount).toBe(100);
    expect(clickCount).toBe(20);
    expect(renderCount).toBeGreaterThan(100);
    expect(maximumRuntimes).toBe(1);
    expect(maximumListeners).toBe(1);

    const finalSession = attachGsapTimelineSession(registration.timeline, () => undefined);
      expect(finalSession.read().items).toHaveLength(0);
      expect(finalSession.read().readiness).toBe("empty");
    finalSession.detach();

    registration.destroy();
    expect(disposeCount).toBe(101);
    expect(activeRuntimes).toBe(0);
    expect(activeListeners).toBe(0);
    expect(overlay.outerHTML).toBe(baseline);
    expect(gsap.globalTimeline.getChildren(true, true, true)).toHaveLength(
      globalChildrenBefore,
    );
    registry.destroy();
  }, 15_000);
});
