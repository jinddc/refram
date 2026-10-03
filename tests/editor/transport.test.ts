// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorController } from "../../src/devtools/editor/controller";
import { DEFAULT_FINITE_TIMELINE_DURATION } from "../../src/devtools/editor/time";
import { createTimelineRegistry } from "../../src/devtools/timeline/registry";
import { directTimeline } from "../helpers/editor-test-fixtures";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("editor transport", () => {
  it("exposes manual transport capabilities and finite-window seeking", () => {
    const registry = createTimelineRegistry();
    const fixture = directTimeline("manual");
    const registration = registry.register(fixture);
    const editor = createEditorController({ registry });

    expect(editor.getSnapshot().view.transport).toMatchObject({
      canPlay: true,
      canPause: false,
      canSeek: true,
      canSetTimeScale: true,
      canSetDirection: true,
      canLoop: true,
    });
    expect(editor.seek(0.5 / DEFAULT_FINITE_TIMELINE_DURATION)).toBe(true);
    expect(fixture.timeline.totalTime()).toBeCloseTo(0.5);
    expect(editor.seek(-0.1)).toBe(false);
    expect(editor.seek(Number.NaN)).toBe(false);

    editor.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("preserves direction and time scale when replay replaces the runtime", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("section");
    const registration = registry.register({
      id: "rebuild",
      root,
      create() {
        const timeline = gsap.timeline({ paused: true }).to(root, { x: 40, duration: 1 });
        return { timeline, dispose: () => timeline.kill() };
      },
    });
    const editor = createEditorController({ registry });

    expect(editor.setReversed(true)).toBe(true);
    expect(editor.setTimeScale(0.5)).toBe(true);
    expect(editor.replay()).toBe(true);
    expect(editor.getSnapshot().view.transport).toMatchObject({
      reversed: true,
      timeScale: 0.5,
    });
    expect(registration.timeline.reversed()).toBe(true);
    expect(Math.abs(registration.timeline.timeScale())).toBe(0.5);

    editor.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("seeks one repeat cycle without exposing loop controls", () => {
    const registry = createTimelineRegistry();
    const fixture = directTimeline("repeating");
    fixture.timeline.repeat(-1);
    const registration = registry.register(fixture);
    const editor = createEditorController({ registry });

    expect(editor.getSnapshot().view.transport.canLoop).toBe(false);
    expect(editor.setLooping(true)).toBe(false);
    expect(editor.seek(0.5)).toBe(true);
    expect(fixture.timeline.totalTime()).toBeCloseTo(1);
    fixture.timeline.totalTime(1.25);
    expect(editor.seek(0.5)).toBe(true);
    expect(fixture.timeline.totalTime()).toBeCloseTo(2);

    editor.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("reverses from the start boundary and loops across both finite boundaries", () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    }));
    const registry = createTimelineRegistry();
    const fixture = directTimeline("boundaries");
    const registration = registry.register(fixture);
    const editor = createEditorController({ registry });

    expect(editor.play()).toBe(true);
    expect(editor.setReversed(true)).toBe(true);
    expect(fixture.timeline.totalProgress()).toBe(1);
    expect(fixture.timeline.reversed()).toBe(true);
    expect(fixture.timeline.paused()).toBe(false);

    expect(editor.setLooping(true)).toBe(true);
    expect(editor.getSnapshot().view.transport.looping).toBe(true);
    fixture.timeline.totalProgress(0, true).pause();
    frame?.(16);
    expect(fixture.timeline.totalProgress()).toBe(1);
    expect(fixture.timeline.reversed()).toBe(true);
    expect(fixture.timeline.paused()).toBe(false);

    expect(editor.setReversed(false)).toBe(true);
    fixture.timeline.totalProgress(1, true).pause();
    frame?.(32);
    expect(fixture.timeline.totalProgress()).toBe(0);
    expect(fixture.timeline.reversed()).toBe(false);
    expect(fixture.timeline.paused()).toBe(false);
    expect(editor.setLooping(false)).toBe(true);
    expect(editor.getSnapshot().view.transport.looping).toBe(false);

    editor.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("separates scrub transport from trigger-action time transport", () => {
    const registry = createTimelineRegistry();
    const scrubbed = directTimeline("scrubbed");
    let scroll = 100;
    Object.defineProperty(scrubbed.timeline, "scrollTrigger", {
      value: {
        start: 100,
        end: 300,
        progress: 0,
        direction: 1,
        trigger: scrubbed.target,
        scroller: window,
        vars: { scrub: true, markers: false },
        scroll(value?: number) {
          if (value === undefined) return scroll;
          scroll = value;
        },
        update() { this.progress = (scroll - this.start) / (this.end - this.start); },
      },
    });
    const action = directTimeline("action");
    Object.defineProperty(action.timeline, "scrollTrigger", {
      value: {
        start: 0,
        end: 400,
        progress: 0,
        direction: 0,
        trigger: action.target,
        scroller: window,
        vars: { scrub: false, markers: false },
        scroll: () => 0,
      },
    });
    const scrubRegistration = registry.register(scrubbed);
    const actionRegistration = registry.register(action);
    const editor = createEditorController({ registry });

    expect(editor.getSnapshot().view.transport).toMatchObject({
      canSeek: true,
      canPlay: false,
      canLoop: false,
    });
    expect(editor.seek(0.5)).toBe(true);
    expect(scroll).toBe(200);
    expect(editor.selectTimeline("action")).toBe(true);
    expect(editor.getSnapshot().view.transport).toMatchObject({
      canSeek: true,
      canPlay: true,
      canLoop: true,
    });
    expect(editor.seek(0.5 / DEFAULT_FINITE_TIMELINE_DURATION)).toBe(true);
    expect(action.timeline.totalProgress()).toBeCloseTo(0.5);

    editor.destroy();
    scrubRegistration.destroy();
    actionRegistration.destroy();
    registry.destroy();
  });
});
