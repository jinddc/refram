// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defineMotionDevtoolsEditor,
  MOTION_DEVTOOLS_EDITOR_TAG,
  type MotionDevtoolsEditorElement,
} from "../src/devtools/editor-ui/element";
import { mountEditorUi } from "../src/devtools/editor-ui/mount";
import {
  createTimelineRegistry,
  defaultTimelineRegistry,
} from "../src/devtools/timeline-registry";

let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;

beforeEach(() => {
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frames.delete(id)));
});

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function flush(): Promise<void> {
  await Promise.resolve();
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(16);
  await Promise.resolve();
}

function registration(id: string, label: string) {
  const root = document.createElement("section");
  const first = document.createElement("article");
  first.id = `${id}-first`;
  const second = document.createElement("article");
  second.id = `${id}-second`;
  root.append(first, second);
  const timeline = gsap.timeline({ paused: true });
  timeline.to(first, { x: 20, duration: 1 }, 0);
  timeline.to(second, { y: 20, duration: 1 }, 0.5);
  const [firstTween, secondTween] = timeline.getChildren(
    false,
    true,
    false,
  ) as gsap.core.Tween[];
  return {
    declaration: {
      id,
      label,
      root,
      timeline,
      tracks: [
        { id: "opening", label: "Opening", animation: firstTween!, targets: first },
        { id: "resolve", label: "Resolve", animation: secondTween!, targets: second },
      ],
    },
    root,
    first,
    timeline,
  };
}

describe("DevTools editor UI v2", () => {
  it("renders controller state and routes timeline, track, transport, and seek actions", async () => {
    const registry = createTimelineRegistry();
    const sourceHome = document.createElement("div");
    const first = registration("first", "First sequence");
    const second = registration("second", "Second sequence");
    sourceHome.append(first.root, second.root);
    const firstRegistration = registry.register(first.declaration);
    const secondRegistration = registry.register(second.declaration);
    const container = document.createElement("div");
    document.body.append(container, sourceHome);

    const handle = mountEditorUi(container, { registry });
    await flush();
    expect(container.querySelector("[data-role='status']")?.textContent).toBe("Ready");
    expect(container.querySelectorAll(".devtools-editor__track-block")).toHaveLength(2);
    expect(container.querySelector("[data-role='preview-surface']")?.contains(first.root)).toBe(true);
    expect(sourceHome.contains(second.root)).toBe(true);

    container.querySelector<HTMLButtonElement>(
      ".devtools-editor__track-block[data-track-key='track:opening']",
    )?.click();
    expect(first.first.getAttribute("data-devtools-editor-selected")).toBe("true");
    expect(handle.controller.getSnapshot().view.selectedTrackKey).toBe("track:opening");

    container.querySelector<HTMLButtonElement>("[data-action='play']")?.click();
    expect(first.timeline.paused()).toBe(false);
    expect(container.querySelector("[data-action='pause']")?.textContent).toBe("Pause");

    const viewport = container.querySelector<HTMLElement>("[data-role='timeline-viewport']")!;
    const content = container.querySelector<HTMLElement>("[data-role='timeline-content']")!;
    const playhead = container.querySelector<HTMLElement>("[data-role='playhead']")!;
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 200,
      width: 800,
      height: 200,
      toJSON: () => ({}),
    });
    vi.spyOn(content, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 400,
      width: 800,
      height: 400,
      toJSON: () => ({}),
    });
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 180 },
      clientWidth: { configurable: true, value: 780 },
      scrollHeight: { configurable: true, value: 400 },
      scrollWidth: { configurable: true, value: 800 },
    });
    const emptyLaneArea = container.querySelectorAll<HTMLElement>(
      ".devtools-editor__track-lane",
    )[1]!;
    expect(emptyLaneArea.dataset.trackKey).toBeUndefined();
    emptyLaneArea.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 200,
      clientY: 100,
    }));
    expect(first.timeline.totalProgress()).toBeCloseTo(0.25);
    expect(first.timeline.paused()).toBe(false);

    viewport.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 400,
      clientY: 190,
    }));
    expect(first.timeline.totalProgress()).toBeCloseTo(0.25);
    expect(first.timeline.paused()).toBe(false);

    playhead.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 400,
      clientY: 100,
      pointerId: 7,
    }));
    expect(playhead.dataset.dragState).toBe("active");
    expect(first.timeline.paused()).toBe(true);
    playhead.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      button: 0,
      clientX: 600,
      clientY: 100,
      pointerId: 7,
    }));
    expect(first.timeline.totalProgress()).toBeCloseTo(0.75);
    playhead.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      clientX: 600,
      clientY: 100,
      pointerId: 7,
    }));
    expect(playhead.dataset.dragState).toBe("idle");
    expect(first.timeline.paused()).toBe(true);

    const select = container.querySelector<HTMLSelectElement>("[data-role='timeline-select']")!;
    select.value = "second";
    select.dispatchEvent(new Event("change"));
    await flush();
    expect(handle.controller.getSnapshot().activeTimelineId).toBe("second");
    expect(container.querySelector("[data-role='preview-surface']")?.contains(second.root)).toBe(true);
    expect(sourceHome.contains(first.root)).toBe(true);
    expect(first.first.hasAttribute("data-devtools-editor-selected")).toBe(false);

    handle.destroy();
    expect(container.querySelector("[data-devtools-editor]")).toBeNull();
    expect(sourceHome.contains(second.root)).toBe(true);
    firstRegistration.destroy();
    secondRegistration.destroy();
    registry.destroy();
  });

  it("shows an empty state and releases its owned controller on destroy", () => {
    const registry = createTimelineRegistry();
    const container = document.createElement("div");
    document.body.append(container);
    const handle = mountEditorUi(container, { registry });
    expect(container.querySelector("[data-role='status']")?.textContent).toBe("Empty");
    expect(container.querySelector<HTMLButtonElement>("[data-action='play']")?.disabled).toBe(true);
    expect(container.querySelector(".devtools-editor__preview-empty")?.textContent).toContain("Register");
    handle.destroy();
    expect(handle.controller.selectTimeline("missing")).toBe(false);
    registry.destroy();
  });

  it("presents a retryable Replay failure and recovers through the same action", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("section");
    const target = document.createElement("div");
    root.append(target);
    let attempts = 0;
    const registration = registry.register({
      id: "retryable",
      root,
      create() {
        attempts += 1;
        if (attempts === 2) throw new Error("factory failed");
        const timeline = gsap.timeline({ paused: true });
        timeline.to(target, { x: 20, duration: 1 });
        return { timeline, dispose: () => timeline.kill() };
      },
    });
    const container = document.createElement("div");
    document.body.append(container, root);
    const handle = mountEditorUi(container, { registry });
    const replay = container.querySelector<HTMLButtonElement>("[data-action='replay']")!;

    replay.click();
    expect(container.querySelector("[data-role='status']")?.textContent).toContain("Retry");
    expect(replay.textContent).toBe("Retry");
    expect(replay.disabled).toBe(false);

    replay.click();
    expect(container.querySelector("[data-role='status']")?.textContent).toBe("Ready");
    expect(replay.textContent).toBe("Replay");
    expect(attempts).toBe(3);
    handle.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("isolates editor styles and reconnects through the custom element lifecycle", async () => {
    defineMotionDevtoolsEditor();
    const sourceHome = document.createElement("div");
    const fixture = registration("element", "Element sequence");
    sourceHome.append(fixture.root);
    const timelineRegistration = defaultTimelineRegistry.register(fixture.declaration);
    const editor = document.createElement(
      MOTION_DEVTOOLS_EDITOR_TAG,
    ) as MotionDevtoolsEditorElement;
    document.body.append(sourceHome, editor);
    await flush();

    const shadow = editor.shadowRoot!;
    const firstController = editor.controller;
    expect(firstController).toBeDefined();
    expect(shadow.querySelector("style")).not.toBeNull();
    expect(shadow.querySelector("[data-devtools-editor]")).not.toBeNull();
    expect(document.querySelector(".devtools-editor")).toBeNull();
    expect(editor.contains(fixture.root)).toBe(true);
    expect(fixture.root.slot).toBe("motion-preview");
    expect(shadow.querySelector<HTMLSlotElement>("slot")?.assignedElements()).toContain(
      fixture.root,
    );

    shadow.querySelector<HTMLButtonElement>(
      ".devtools-editor__track-block[data-track-key='track:opening']",
    )?.click();
    expect(fixture.first.style.outline).toContain("--devtools-editor-accent");

    editor.remove();
    expect(editor.controller).toBeUndefined();
    expect(sourceHome.contains(fixture.root)).toBe(true);
    expect(fixture.root.hasAttribute("slot")).toBe(false);
    expect(fixture.first.style.outline).toBe("");
    expect(fixture.first.hasAttribute("data-devtools-editor-selected")).toBe(false);

    document.body.append(editor);
    await flush();
    expect(editor.controller).toBeDefined();
    expect(editor.controller).not.toBe(firstController);

    editor.remove();
    timelineRegistration.destroy();
  });
});
