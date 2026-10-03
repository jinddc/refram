// @vitest-environment happy-dom

import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";
import { afterEach, describe, expect, it } from "vitest";

import { createTimelineRegistry } from "../../../src/devtools/timeline/registry";

gsap.registerPlugin(SplitText);

const SOURCE_TEXT =
  "The containerAnimation property allows us to create ScrollTriggered animations within a container that's animated horizontally.";

interface DomSnapshot {
  readonly html: string;
  readonly className: string;
  readonly style: string | null;
  readonly applicationState: string | undefined;
}

function snapshot(root: HTMLElement, text: HTMLElement): DomSnapshot {
  return {
    html: text.innerHTML,
    className: text.className,
    style: text.getAttribute("style"),
    applicationState: root.dataset.applicationState,
  };
}

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
});

describe("timeline registry stress: GreenSock containerAnimation reference", () => {
  it("rebuilds a SplitText container timeline 100 times without accumulating DOM or GSAP state", () => {
    // Reference: https://codepen.io/GreenSock/pen/MYyBrZw
    // ScrollTrigger is intentionally replaced by an ordinary authored timeline.
    const root = document.createElement("section");
    const text = document.createElement("h3");
    root.className = "Horizontal";
    root.dataset.applicationState = "idle";
    text.className = "Horizontal__text heading-xl";
    text.textContent = SOURCE_TEXT;
    root.append(text);
    document.body.append(root);

    const baseline = snapshot(root, text);
    const registry = createTimelineRegistry();
    const globalChildrenBefore = gsap.globalTimeline.getChildren(true, true, true).length;
    const baselinesBeforeCreate: DomSnapshot[] = [];
    let createCount = 0;
    let resetCount = 0;
    let disposeCount = 0;
    let completionCount = 0;
    let activeRuntimeCount = 0;
    let maximumActiveRuntimeCount = 0;
    let expectedCharacterCount = 0;
    let expectedGlobalChildren = 0;

    const registration = registry.register({
      id: "stress/container-animation-split-text",
      label: "Container animation SplitText stress fixture",
      root,
      reset: () => {
        resetCount += 1;
        root.dataset.applicationState = "idle";
        text.classList.remove("is-complete");
      },
      create: () => {
        baselinesBeforeCreate.push(snapshot(root, text));
        createCount += 1;
        activeRuntimeCount += 1;
        maximumActiveRuntimeCount = Math.max(
          maximumActiveRuntimeCount,
          activeRuntimeCount,
        );

        let split!: SplitText;
        let timeline!: gsap.core.Timeline;
        const context = gsap.context(() => {
          split = SplitText.create(text, {
            type: "chars,words",
            charsClass: "stress-char",
            wordsClass: "stress-word",
          });
          timeline = gsap.timeline({
            paused: true,
            onComplete: () => {
              completionCount += 1;
              root.dataset.applicationState = "complete";
              text.classList.add("is-complete");
            },
          });

          timeline.to(text, {
            xPercent: -100,
            duration: 5,
            ease: "none",
          });
          split.chars.forEach((character, index) => {
            const progress = index / Math.max(1, split.chars.length - 1);
            timeline.from(
              character,
              {
                yPercent: "random(-200, 200)",
                rotation: "random(-20, 20)",
                duration: 0.7,
                ease: "back.out(1.2)",
              },
              progress * 4.3,
            );
          });
        }, root);

        expectedCharacterCount ||= split.chars.length;

        return {
          timeline,
          dispose: () => {
            disposeCount += 1;
            context.revert();
            split.revert();
            activeRuntimeCount -= 1;
          },
        };
      },
    });

    expectedGlobalChildren = gsap.globalTimeline.getChildren(true, true, true).length;
    expect(expectedCharacterCount).toBeGreaterThan(0);
    expect(root.querySelectorAll(".stress-char")).toHaveLength(
      expectedCharacterCount,
    );

    for (let cycle = 0; cycle < 100; cycle += 1) {
      const previousTimeline = registration.timeline;

      switch (cycle % 4) {
        case 0:
          previousTimeline.totalProgress(1, false);
          break;
        case 1:
          previousTimeline.play().totalProgress(0.42, true).pause();
          break;
        case 2:
          previousTimeline.totalProgress(0.73, true);
          break;
        default:
          previousTimeline.timeScale(2.5).totalProgress(0.25, true);
      }

      const replacement = registration.replay();

      expect(replacement).not.toBe(previousTimeline);
      expect(replacement.paused()).toBe(true);
      expect(activeRuntimeCount).toBe(1);
      expect(root.querySelectorAll(".stress-char")).toHaveLength(
        expectedCharacterCount,
      );
      expect(root.querySelectorAll(".stress-word .stress-word")).toHaveLength(0);
      expect(gsap.globalTimeline.getChildren(true, true, true)).toHaveLength(
        expectedGlobalChildren,
      );
    }

    expect(baselinesBeforeCreate).toHaveLength(101);
    expect(baselinesBeforeCreate.every((value) =>
      JSON.stringify(value) === JSON.stringify(baseline))).toBe(true);
    expect(createCount).toBe(101);
    expect(resetCount).toBe(100);
    expect(disposeCount).toBe(100);
    expect(completionCount).toBe(25);
    expect(maximumActiveRuntimeCount).toBe(1);

    registration.destroy();

    expect(disposeCount).toBe(101);
    expect(activeRuntimeCount).toBe(0);
    expect(snapshot(root, text)).toEqual(baseline);
    expect(gsap.globalTimeline.getChildren(true, true, true)).toHaveLength(
      globalChildrenBefore,
    );
    registry.destroy();
  }, 15_000);
});
