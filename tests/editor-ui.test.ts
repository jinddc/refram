// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionDevtoolsEditor } from "../src/devtools/editor-ui/editor";
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
    const firstNextSibling = first.root.nextSibling;
    const secondNextSibling = second.root.nextSibling;

    const handle = mountEditorUi(container, { registry });
    await flush();
    expect(container.querySelector("[data-role='status']")).toBeNull();
    expect(container.querySelector(".devtools-editor__header")).toBeNull();
    expect(container.querySelector(".devtools-editor__identity")).toBeNull();
    expect(container.querySelector("[data-role='pane-switcher']")?.parentElement)
      .toBe(container.querySelector("[data-devtools-editor]"));
    expect(container.querySelectorAll(".devtools-editor__track-block")).toHaveLength(2);
    expect(container.querySelector("[data-role='duration']")?.textContent)
      .toBe("00:12.000");
    expect(container.querySelectorAll(".devtools-editor__tick").item(12).textContent)
      .toBe("12s");
    expect(container.querySelectorAll<HTMLElement>(".devtools-editor__track-block")[0]
      ?.style.getPropertyValue("--devtools-editor-track-width"))
      .toContain("8.333333333333332%");
    expect(container.querySelectorAll("[data-timeline-id]")).toHaveLength(2);
    expect(container.querySelector("[data-devtools-editor]")?.getAttribute("data-active-pane"))
      .toBe("timeline");
    expect(container.querySelector("[data-timeline-id='first']")?.getAttribute("aria-current"))
      .toBe("true");
    const root = container.querySelector<HTMLElement>("[data-devtools-editor]")!;
    const inspectorPane = container.querySelector<HTMLElement>("[data-role='inspector']")!;
    expect(root.dataset.inspectorOpen).toBe("false");
    expect(inspectorPane.hidden).toBe(true);
    expect(first.root.parentNode).toBe(sourceHome);
    expect(first.root.nextSibling).toBe(firstNextSibling);
    expect(sourceHome.contains(second.root)).toBe(true);

    container.querySelector<HTMLButtonElement>(
      ".devtools-editor__track-block[data-track-key='track:opening']",
    )?.click();
    expect(first.first.getAttribute("data-devtools-editor-selected")).toBe("true");
    expect(handle.controller.getSnapshot().view.selectedTrackKey).toBe("track:opening");
    expect(root.dataset.inspectorOpen).toBe("true");
    expect(inspectorPane.hidden).toBe(false);
    const inspector = container.querySelector<HTMLElement>("[data-role='inspector-content']")!;
    expect(inspector.hidden).toBe(false);
    expect(inspector.textContent).toContain("Opening");
    expect(inspector.textContent).toContain("track:opening");
    expect(inspector.textContent).toContain("Authored");
    expect(inspector.textContent).toContain("0.00s");
    expect(inspector.textContent).toContain("1.00s");

    container.querySelector<HTMLButtonElement>("[data-action='close-inspector']")?.click();
    expect(root.dataset.inspectorOpen).toBe("false");
    expect(inspectorPane.hidden).toBe(true);
    expect(handle.controller.getSnapshot().view.selectedTrackKey).toBeUndefined();
    expect(first.first.hasAttribute("data-devtools-editor-selected")).toBe(false);
    expect(container.querySelector("[data-track-key='track:opening']")
      ?.getAttribute("aria-pressed")).toBe("false");
    expect((document.activeElement as HTMLElement | null)?.dataset.trackKey)
      .toBe("track:opening");
    container.querySelector<HTMLButtonElement>(
      ".devtools-editor__track-block[data-track-key='track:opening']",
    )?.click();
    expect(inspectorPane.hidden).toBe(false);

    const timelineListToggle = container.querySelector<HTMLButtonElement>(
      "[data-action='toggle-timelines']",
    )!;
    timelineListToggle.click();
    expect(root.dataset.timelinesVisible).toBe("false");
    expect(timelineListToggle.getAttribute("aria-expanded")).toBe("false");
    expect(timelineListToggle.textContent).toBe("Show timelines");
    timelineListToggle.click();
    expect(root.dataset.timelinesVisible).toBe("true");

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
      clientX: 36.25,
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
      clientX: 84.75,
      clientY: 100,
      pointerId: 7,
    }));
    expect(first.timeline.totalProgress()).toBeCloseTo(0.75);
    playhead.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      clientX: 84.75,
      clientY: 100,
      pointerId: 7,
    }));
    expect(playhead.dataset.dragState).toBe("idle");
    expect(first.timeline.paused()).toBe(true);

    container.querySelector<HTMLButtonElement>("[data-pane-target='timelines']")?.click();
    expect(container.querySelector("[data-devtools-editor]")?.getAttribute("data-active-pane"))
      .toBe("timelines");
    container.querySelector<HTMLButtonElement>("[data-timeline-id='second']")?.click();
    await flush();
    expect(handle.controller.getSnapshot().activeTimelineId).toBe("second");
    expect(container.querySelector("[data-devtools-editor]")?.getAttribute("data-active-pane"))
      .toBe("timeline");
    expect(container.querySelector("[data-timeline-id='second']")?.getAttribute("aria-current"))
      .toBe("true");
    expect(container.querySelector<HTMLElement>("[data-role='inspector-empty']")?.hidden)
      .toBe(false);
    expect(inspector.hidden).toBe(true);
    expect(inspectorPane.hidden).toBe(true);
    expect(first.root.parentNode).toBe(sourceHome);
    expect(first.root.nextSibling).toBe(firstNextSibling);
    expect(second.root.parentNode).toBe(sourceHome);
    expect(second.root.nextSibling).toBe(secondNextSibling);
    expect(first.first.hasAttribute("data-devtools-editor-selected")).toBe(false);

    const releasePointerCapture = vi
      .spyOn(playhead, "releasePointerCapture")
      .mockImplementation(() => undefined);
    vi.spyOn(playhead, "hasPointerCapture").mockReturnValue(true);
    playhead.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 400,
      clientY: 100,
      pointerId: 9,
    }));
    const play = vi.spyOn(handle.controller, "play");
    const playButton = container.querySelector<HTMLButtonElement>("[data-action='play']")!;
    handle.destroy();
    expect(releasePointerCapture).toHaveBeenCalledWith(9);
    playButton.click();
    expect(play).not.toHaveBeenCalled();
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
    expect(container.querySelector("[data-role='status']")).toBeNull();
    expect(container.querySelector<HTMLButtonElement>("[data-action='play']")?.disabled).toBe(true);
    expect(container.querySelector("[data-role='timeline-list']")?.textContent)
      .toContain("No timelines registered.");
    expect(container.querySelectorAll(".devtools-editor__tick").item(12).textContent)
      .toBe("12s");
    expect(container.querySelectorAll(".devtools-editor__ruler-mark")).toHaveLength(121);
    expect(container.querySelector<HTMLElement>("[data-role='inspector-empty']")?.hidden)
      .toBe(false);
    expect(container.querySelector<HTMLElement>("[data-role='inspector']")?.hidden)
      .toBe(true);
    expect(container.querySelector("[data-role='preview-surface']")).toBeNull();
    handle.destroy();
    expect(handle.controller.selectTimeline("missing")).toBe(false);
    registry.destroy();
  });

  it("maps authored seconds onto the default twelve-second ruler", async () => {
    const registry = createTimelineRegistry();
    const container = document.createElement("div");
    const root = document.createElement("section");
    const target = document.createElement("div");
    root.append(target);
    document.body.append(container, root);
    const handle = mountEditorUi(container, { registry });

    expect(container.querySelectorAll(".devtools-editor__tick").item(12).textContent)
      .toBe("12s");

    const timeline = gsap.timeline({ paused: true });
    timeline.to(target, { x: 20, duration: 1 });
    const timelineRegistration = registry.register({ id: "one-second", root, timeline });
    await flush();

    expect(container.querySelector("[data-role='duration']")?.textContent)
      .toBe("00:12.000");
    expect(container.querySelectorAll(".devtools-editor__tick").item(12).textContent)
      .toBe("12s");
    expect(container.querySelector<HTMLElement>(".devtools-editor__track-block")
      ?.style.getPropertyValue("--devtools-editor-track-width"))
      .toContain("8.333333333333332%");

    handle.destroy();
    timelineRegistration.destroy();
    registry.destroy();
  });

  it("switches mobile panes with two tabs and opens the inspector from a track", async () => {
    const registry = createTimelineRegistry();
    const fixture = registration("panes", "Pane sequence");
    const timelineRegistration = registry.register(fixture.declaration);
    const container = document.createElement("div");
    document.body.append(container, fixture.root);
    const handle = mountEditorUi(container, { registry });
    await flush();

    const root = container.querySelector<HTMLElement>("[data-devtools-editor]")!;
    const timelines = container.querySelector<HTMLButtonElement>(
      "[data-pane-target='timelines']",
    )!;
    const timeline = container.querySelector<HTMLButtonElement>(
      "[data-pane-target='timeline']",
    )!;
    expect(container.querySelectorAll("[data-pane-target]")).toHaveLength(2);
    expect(container.querySelector("[data-pane-target='inspector']")).toBeNull();
    expect(timeline.getAttribute("aria-selected")).toBe("true");
    expect(timeline.tabIndex).toBe(0);

    timeline.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      code: "ArrowRight",
    }));
    expect(root.dataset.activePane).toBe("timelines");
    expect(timelines.getAttribute("aria-selected")).toBe("true");

    timelines.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      code: "End",
    }));
    expect(root.dataset.activePane).toBe("timeline");

    container.querySelector<HTMLButtonElement>("[data-track-key='track:opening']")?.click();
    const inspector = container.querySelector<HTMLElement>("[data-role='inspector']")!;
    expect(root.dataset.activePane).toBe("timeline");
    expect(root.dataset.inspectorOpen).toBe("true");
    expect(inspector.hidden).toBe(false);
    expect(inspector.textContent).toContain("Opening");

    container.querySelector<HTMLButtonElement>("[data-action='close-inspector']")?.click();
    expect(root.dataset.inspectorOpen).toBe("false");
    expect(inspector.hidden).toBe(true);
    expect(root.dataset.activePane).toBe("timeline");
    expect(handle.controller.getSnapshot().view.selectedTrackKey).toBeUndefined();

    handle.destroy();
    timelineRegistration.destroy();
    registry.destroy();
  });

  it("keeps playback paused when the timeline is click-seeked after finishing", async () => {
    const registry = createTimelineRegistry();
    const fixture = registration("finished-track", "Finished track");
    const timelineRegistration = registry.register(fixture.declaration);
    const container = document.createElement("div");
    document.body.append(fixture.root, container);
    const handle = mountEditorUi(container, { registry });
    await flush();

    expect(handle.controller.play()).toBe(true);
    expect(handle.controller.seek(1)).toBe(true);
    expect(handle.controller.getSnapshot().inspection?.playState).toBe("finished");
    expect(fixture.timeline.paused()).toBe(false);

    const timelineContent = container.querySelector<HTMLElement>(
      "[data-role='timeline-content']",
    )!;
    vi.spyOn(timelineContent, "getBoundingClientRect").mockReturnValue({
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
    container.querySelector<HTMLElement>("[data-role='timeline-viewport']")?.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 50.8,
        clientY: 100,
      }),
    );
    expect(fixture.timeline.paused()).toBe(true);
    expect(fixture.timeline.totalProgress()).toBeCloseTo(0.4);
    expect(handle.controller.getSnapshot().inspection?.playState).toBe("paused");

    handle.destroy();
    timelineRegistration.destroy();
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
    expect(handle.controller.getSnapshot().view.status).toBe("retryable");
    expect(replay.textContent).toBe("Retry");
    expect(replay.disabled).toBe(false);

    replay.click();
    expect(handle.controller.getSnapshot().view.status).toBe("ready");
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
    fixture.root.slot = "application-slot";
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
    expect(fixture.root.parentNode).toBe(sourceHome);
    expect(fixture.root.slot).toBe("application-slot");
    expect(shadow.querySelector("slot")).toBeNull();

    shadow.querySelector<HTMLButtonElement>(
      ".devtools-editor__track-block[data-track-key='track:opening']",
    )?.click();
    expect(fixture.first.style.outline).toContain("--devtools-editor-accent");

    editor.remove();
    expect(editor.controller).toBeUndefined();
    expect(sourceHome.contains(fixture.root)).toBe(true);
    expect(fixture.root.slot).toBe("application-slot");
    expect(fixture.first.style.outline).toBe("");
    expect(fixture.first.hasAttribute("data-devtools-editor-selected")).toBe(false);

    document.body.append(editor);
    await flush();
    expect(editor.controller).toBeDefined();
    expect(editor.controller).not.toBe(firstController);

    editor.remove();
    timelineRegistration.destroy();
  });

  it("owns one JavaScript-created editor per document without owning registrations", async () => {
    const sourceHome = document.createElement("div");
    const first = registration("owner-first", "Owner first");
    const second = registration("owner-second", "Owner second");
    first.root.slot = "application-preview";
    sourceHome.append(first.root, second.root);
    document.body.append(sourceHome);
    const firstParent = first.root.parentNode;
    const firstNextSibling = first.root.nextSibling;
    const firstRegistration = defaultTimelineRegistry.register(first.declaration);

    const editor = new MotionDevtoolsEditor();
    await flush();

    expect(editor.domElement.parentNode).toBe(document.body);
    expect(editor.controller.getSnapshot().view.timelines.map(({ id }) => id)).toEqual([
      "owner-first",
    ]);
    expect(() => new MotionDevtoolsEditor()).toThrowError(
      expect.objectContaining({ name: "InvalidStateError" }),
    );

    const firstController = editor.controller;
    const positionedContainer = document.createElement("aside");
    document.body.append(positionedContainer);
    positionedContainer.append(editor.domElement);
    await flush();
    expect(editor.controller).not.toBe(firstController);
    expect(editor.controller.getSnapshot().activeTimelineId).toBe("owner-first");

    const secondRegistration = defaultTimelineRegistry.register(second.declaration);
    await flush();
    expect(editor.controller.getSnapshot().view.timelines.map(({ id }) => id)).toEqual([
      "owner-first",
      "owner-second",
    ]);
    editor.controller.selectTrack("track:opening");
    expect(first.root.parentNode).toBe(firstParent);
    expect(first.root.nextSibling).toBe(firstNextSibling);
    expect(first.root.slot).toBe("application-preview");

    editor.destroy();
    editor.destroy();
    expect(editor.domElement.isConnected).toBe(false);
    expect(defaultTimelineRegistry.getSnapshot().registrations).toEqual([
      firstRegistration,
      secondRegistration,
    ]);
    expect(first.root.parentNode).toBe(firstParent);
    expect(first.root.nextSibling).toBe(firstNextSibling);
    expect(first.root.slot).toBe("application-preview");

    const container = document.createElement("aside");
    document.body.append(container);
    const replacement = new MotionDevtoolsEditor({ container });
    expect(replacement.domElement.parentNode).toBe(container);
    expect(replacement.controller.getSnapshot().view.timelines).toHaveLength(2);

    replacement.destroy();
    firstRegistration.destroy();
    secondRegistration.destroy();
  });
});
