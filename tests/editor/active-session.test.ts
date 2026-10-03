// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorController } from "../../src/devtools/editor/controller";
import { createTimelineRegistry } from "../../src/devtools/timeline/registry";
import { directTimeline } from "../helpers/editor-test-fixtures";

let frames: FrameRequestCallback[];

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("editor active-session lifecycle", () => {
  it("retains an active id across registry replacement and falls back after removal", () => {
    const registry = createTimelineRegistry();
    const first = registry.register(directTimeline("first"));
    const secondRoot = document.createElement("section");
    const second = registry.register({
      id: "second",
      root: secondRoot,
      create() {
        const target = document.createElement("div");
        secondRoot.replaceChildren(target);
        const timeline = gsap.timeline({ paused: true }).to(target, { x: 40, duration: 1 });
        return { timeline, dispose: () => timeline.kill() };
      },
    });
    const editor = createEditorController({ registry });

    expect(editor.selectTimeline("second")).toBe(true);
    const previousTimeline = second.timeline;
    vi.mocked(cancelAnimationFrame).mockClear();
    vi.mocked(requestAnimationFrame).mockClear();

    second.replay();

    expect(second.timeline).not.toBe(previousTimeline);
    expect(editor.getSnapshot().activeTimelineId).toBe("second");
    expect(editor.getSnapshot().previewRoot).toBe(secondRoot);
    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();

    second.destroy();
    expect(editor.getSnapshot().activeTimelineId).toBe("first");
    expect(editor.getSnapshot().previewRoot).toBe(first.root);

    editor.destroy();
    first.destroy();
    registry.destroy();
  });

  it("ignores a stale sampling callback after switching sessions", () => {
    const registry = createTimelineRegistry();
    const first = registry.register(directTimeline("first"));
    const editor = createEditorController({ registry });
    const staleFrame = frames[0]!;
    const second = registry.register(directTimeline("second"));
    expect(editor.selectTimeline("second")).toBe(true);
    const listener = vi.fn();
    editor.subscribe(listener);
    const callsBeforeStaleFrame = listener.mock.calls.length;

    staleFrame(16);

    expect(listener).toHaveBeenCalledTimes(callsBeforeStaleFrame);
    expect(editor.getSnapshot().activeTimelineId).toBe("second");

    editor.destroy();
    first.destroy();
    second.destroy();
    registry.destroy();
  });

  it("reattaches once after replay and makes destroy idempotent", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("section");
    let created = 0;
    let disposed = 0;
    const registration = registry.register({
      id: "replay",
      root,
      create() {
        created += 1;
        const target = document.createElement("div");
        root.replaceChildren(target);
        const timeline = gsap.timeline({ paused: true }).to(target, { x: 40, duration: 1 });
        return { timeline, dispose: () => { disposed += 1; timeline.kill(); } };
      },
    });
    const editor = createEditorController({ registry });

    expect(editor.replay()).toBe(true);
    expect(created).toBe(2);
    expect(disposed).toBe(1);
    expect(editor.getSnapshot().inspection?.readiness).toBe("ready");
    editor.destroy();
    editor.destroy();
    expect(editor.play()).toBe(false);
    expect(disposed).toBe(1);

    registration.destroy();
    expect(disposed).toBe(2);
    registry.destroy();
  });
});
