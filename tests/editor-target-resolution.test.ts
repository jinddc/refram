// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorController } from "../src/devtools/editor-controller";
import { createTimelineRegistry } from "../src/devtools/timeline-registry";
import { directTimeline } from "./helpers/editor-test-fixtures";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("editor target resolution", () => {
  it("uses the registration root for ordinary timelines and follows selection", () => {
    const registry = createTimelineRegistry();
    const first = directTimeline("first");
    const second = directTimeline("second");
    const firstScroll = vi.fn();
    const secondScroll = vi.fn();
    first.root.scrollIntoView = firstScroll;
    second.root.scrollIntoView = secondScroll;
    const firstRegistration = registry.register(first);
    const secondRegistration = registry.register(second);
    const editor = createEditorController({ registry });

    expect(editor.jumpToScrollTriggerTarget()).toBe(true);
    expect(firstScroll).toHaveBeenCalledOnce();
    expect(editor.selectTimeline("second")).toBe(true);
    expect(editor.jumpToScrollTriggerTarget()).toBe(true);
    expect(secondScroll).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
      behavior: "auto",
    });

    editor.destroy();
    firstRegistration.destroy();
    secondRegistration.destroy();
    registry.destroy();
  });

  it("uses the live ScrollTrigger trigger without mutating the trigger", () => {
    const registry = createTimelineRegistry();
    const fixture = directTimeline("scroll");
    const triggerElement = document.createElement("article");
    const scrollIntoView = vi.fn();
    triggerElement.scrollIntoView = scrollIntoView;
    const vars = { id: "Scroll", scrub: true, markers: false };
    const trigger = {
      start: 0,
      end: 400,
      progress: 0,
      direction: 1,
      trigger: triggerElement,
      scroller: window,
      vars,
      scroll: () => 0,
    };
    Object.defineProperty(fixture.timeline, "scrollTrigger", { value: trigger });
    const registration = registry.register(fixture);
    const editor = createEditorController({ registry });

    expect(editor.jumpToScrollTriggerTarget()).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect((fixture.timeline as gsap.core.Timeline & { scrollTrigger: unknown }).scrollTrigger)
      .toBe(trigger);
    expect(trigger.vars).toBe(vars);

    editor.destroy();
    registration.destroy();
    registry.destroy();
  });

  it.each([undefined, "#missing", { nodeType: 1 }])(
    "declines an invalid ScrollTrigger target %#",
    (target) => {
      const registry = createTimelineRegistry();
      const fixture = directTimeline("invalid");
      Object.defineProperty(fixture.timeline, "scrollTrigger", {
        value: {
          start: 0,
          end: 100,
          progress: 0,
          direction: 0,
          trigger: target,
          scroller: window,
          vars: { scrub: true },
          scroll: () => 0,
        },
      });
      const registration = registry.register(fixture);
      const editor = createEditorController({ registry });

      expect(editor.getSnapshot().view.transport.canJumpToScrollTriggerTarget).toBe(false);
      expect(editor.jumpToScrollTriggerTarget()).toBe(false);

      editor.destroy();
      registration.destroy();
      registry.destroy();
    },
  );
});
