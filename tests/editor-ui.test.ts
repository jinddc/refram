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
import { DEFAULT_FINITE_TIMELINE_DURATION } from "../src/devtools/editor-time";
import {
  createTimelineRegistry,
  defaultTimelineRegistry,
} from "../src/devtools/timeline-registry";

let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;

beforeEach(() => {
  frames = new Map();
  nextFrame = 0;
  sessionStorage.clear();
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

function bounds(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
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
  it("exposes keyboard height resizing, clamps values, and resets to the CSS default", () => {
    vi.stubGlobal("innerHeight", 800);
    const registry = createTimelineRegistry();
    const container = document.createElement("div");
    container.style.setProperty("--devtools-editor-height", "260px");
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue(bounds(0, 540, 1000, 260));
    document.body.append(container);

    const handle = mountEditorUi(container, { registry });
    const separator = container.querySelector<HTMLElement>("[data-role='height-separator']")!;
    expect(separator.getAttribute("role")).toBe("separator");
    expect(separator.getAttribute("aria-orientation")).toBe("horizontal");
    expect(separator.getAttribute("aria-label")).toBe("Resize DevTools editor height");
    expect(separator.getAttribute("aria-valuemin")).toBe("180");
    expect(separator.getAttribute("aria-valuemax")).toBe("520");
    expect(separator.getAttribute("aria-valuenow")).toBe("260");

    separator.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "ArrowUp",
    }));
    expect(container.style.getPropertyValue("--devtools-editor-height")).toBe("276px");
    expect(separator.getAttribute("aria-valuetext")).toBe("276 pixels high");

    for (let index = 0; index < 10; index += 1) {
      separator.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        key: "ArrowUp",
        shiftKey: true,
      }));
    }
    expect(container.style.getPropertyValue("--devtools-editor-height")).toBe("520px");

    for (let index = 0; index < 10; index += 1) {
      separator.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        key: "ArrowDown",
        shiftKey: true,
      }));
    }
    expect(container.style.getPropertyValue("--devtools-editor-height")).toBe("180px");

    separator.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(container.style.getPropertyValue("--devtools-editor-height")).toBe("260px");
    expect(sessionStorage.getItem("motion-lab-devtools-editor-height-ratio")).toBeNull();

    const storagePrototype = Object.getPrototypeOf(sessionStorage) as Storage;
    vi.spyOn(storagePrototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(() => separator.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "ArrowUp",
    }))).not.toThrow();

    handle.destroy();
    expect(container.style.getPropertyValue("--devtools-editor-height")).toBe("260px");
    registry.destroy();
  });

  it("batches pointer resizing and releases resize resources on every finish path", async () => {
    vi.stubGlobal("innerHeight", 800);
    const registry = createTimelineRegistry();
    const container = document.createElement("div");
    container.style.setProperty("--devtools-editor-height", "250px", "important");
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue(bounds(0, 550, 1000, 250));
    document.body.append(container);
    const handle = mountEditorUi(container, { registry });
    const separator = container.querySelector<HTMLElement>("[data-role='height-separator']")!;
    const setPointerCapture = vi.spyOn(separator, "setPointerCapture")
      .mockImplementation(() => undefined);
    const releasePointerCapture = vi.spyOn(separator, "releasePointerCapture")
      .mockImplementation(() => undefined);
    vi.spyOn(separator, "hasPointerCapture").mockReturnValue(true);

    separator.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      pointerId: 4,
    }));
    separator.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      clientY: 400,
      pointerId: 4,
    }));
    separator.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      clientY: 380,
      pointerId: 4,
    }));
    expect(setPointerCapture).toHaveBeenCalledWith(4);
    expect(separator.dataset.resizeState).toBe("active");
    expect(frames.size).toBe(1);
    expect(container.style.getPropertyValue("--devtools-editor-height")).toBe("250px");

    await flush();
    expect(container.style.getPropertyValue("--devtools-editor-height")).toBe("420px");
    separator.dispatchEvent(new PointerEvent("pointercancel", {
      bubbles: true,
      pointerId: 4,
    }));
    expect(releasePointerCapture).toHaveBeenCalledWith(4);
    expect(separator.dataset.resizeState).toBe("idle");
    expect(Number(sessionStorage.getItem("motion-lab-devtools-editor-height-ratio")))
      .toBeCloseTo(0.525);

    separator.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      pointerId: 5,
    }));
    separator.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      clientY: 100,
      pointerId: 5,
    }));
    separator.dispatchEvent(new PointerEvent("lostpointercapture", {
      bubbles: true,
      pointerId: 5,
    }));
    expect(container.style.getPropertyValue("--devtools-editor-height")).toBe("520px");
    expect(frames.size).toBe(0);

    vi.stubGlobal("innerHeight", 1000);
    window.dispatchEvent(new Event("resize"));
    expect(container.style.getPropertyValue("--devtools-editor-height")).toBe("650px");
    expect(separator.getAttribute("aria-valuemax")).toBe("720");

    separator.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      pointerId: 6,
    }));
    separator.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      clientY: 500,
      pointerId: 6,
    }));
    handle.destroy();
    expect(releasePointerCapture).toHaveBeenCalledWith(6);
    expect(frames.size).toBe(0);
    expect(container.style.getPropertyValue("--devtools-editor-height")).toBe("250px");
    expect(container.style.getPropertyPriority("--devtools-editor-height")).toBe("important");
    registry.destroy();
  });

  it("restores a stored height ratio on remount at a new viewport size", () => {
    vi.stubGlobal("innerHeight", 800);
    const registry = createTimelineRegistry();
    const firstContainer = document.createElement("div");
    vi.spyOn(firstContainer, "getBoundingClientRect")
      .mockReturnValue(bounds(0, 500, 1000, 300));
    document.body.append(firstContainer);
    const firstHandle = mountEditorUi(firstContainer, { registry });
    const firstSeparator = firstContainer.querySelector<HTMLElement>(
      "[data-role='height-separator']",
    )!;
    vi.spyOn(firstSeparator, "setPointerCapture").mockImplementation(() => undefined);
    vi.spyOn(firstSeparator, "hasPointerCapture").mockReturnValue(false);
    firstSeparator.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      pointerId: 7,
    }));
    firstSeparator.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      clientY: 400,
      pointerId: 7,
    }));
    firstSeparator.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 7,
    }));
    expect(firstContainer.style.getPropertyValue("--devtools-editor-height")).toBe("400px");
    firstHandle.destroy();

    vi.stubGlobal("innerHeight", 1000);
    const secondContainer = document.createElement("div");
    document.body.append(secondContainer);
    const secondHandle = mountEditorUi(secondContainer, { registry });
    expect(secondContainer.style.getPropertyValue("--devtools-editor-height")).toBe("500px");
    expect(secondContainer.querySelector("[data-role='height-separator']")
      ?.getAttribute("aria-valuenow")).toBe("500");

    secondHandle.destroy();
    registry.destroy();
  });

  it("renders a non-interactive selection overlay that follows the target", async () => {
    const registry = createTimelineRegistry();
    const fixture = registration("overlay", "Overlay sequence");
    const registered = registry.register(fixture.declaration);
    const container = document.createElement("div");
    document.body.append(container, fixture.root);
    fixture.first.style.outline = "3px dashed tomato";
    const originalOutline = fixture.first.style.outline;
    fixture.first.setAttribute("data-devtools-editor-selected", "consumer");
    let targetBounds = bounds(24, 36, 120, 48);
    vi.spyOn(fixture.first, "getBoundingClientRect")
      .mockImplementation(() => targetBounds);

    const handle = mountEditorUi(container, { registry });
    await flush();
    container.querySelector<HTMLButtonElement>(
      ".devtools-editor__track-block[data-track-key='track:opening']",
    )?.click();

    const overlayRoot = document.querySelector<HTMLElement>(
      "[data-devtools-editor-highlight-root]",
    )!;
    const overlay = overlayRoot.querySelector<HTMLElement>(
      "[data-devtools-editor-highlight]",
    )!;
    expect(overlayRoot.style.pointerEvents).toBe("none");
    expect(overlayRoot.style.zIndex).toBe("2147483646");
    expect(overlay.getAttribute("aria-hidden")).toBeNull();
    expect(overlay.style.left).toBe("24px");
    expect(overlay.style.top).toBe("36px");
    expect(overlay.style.width).toBe("120px");
    expect(overlay.style.height).toBe("48px");
    expect(overlay.textContent).toContain("Opening");
    expect(overlay.textContent).toContain("article#overlay-first");
    expect(fixture.first.style.outline).toBe(originalOutline);
    expect(fixture.first.getAttribute("data-devtools-editor-selected")).toBe("true");

    targetBounds = bounds(80, 92, 180, 64);
    await flush();
    expect(overlay.style.left).toBe("80px");
    expect(overlay.style.top).toBe("92px");
    expect(overlay.style.width).toBe("180px");
    expect(overlay.style.height).toBe("64px");

    container.querySelector<HTMLButtonElement>("[data-action='close-inspector']")?.click();
    expect(document.querySelector("[data-devtools-editor-highlight-root]")).toBeNull();
    expect(fixture.first.getAttribute("data-devtools-editor-selected")).toBe("consumer");
    expect(fixture.first.style.outline).toBe(originalOutline);

    handle.destroy();
    registered.destroy();
    registry.destroy();
  });

  it("clamps the playhead to the authored animation duration", async () => {
    const registry = createTimelineRegistry();
    const finite = registration("play-from-empty-time", "Play from empty time");
    const registered = registry.register(finite.declaration);
    const container = document.createElement("div");
    document.body.append(container);
    const handle = mountEditorUi(container, { registry });
    await flush();
    const root = container.querySelector<HTMLElement>("[data-devtools-editor]")!;

    expect(handle.controller.seek(8.94 / DEFAULT_FINITE_TIMELINE_DURATION)).toBe(true);
    expect(handle.controller.getSnapshot().view.time).toMatchObject({
      time: 1.5,
      progress: 1.5 / DEFAULT_FINITE_TIMELINE_DURATION,
    });
    expect(root.style.getPropertyValue("--devtools-editor-playhead-position"))
      .toBe("calc(12.5% + 9px)");
    expect(container.querySelector("[data-role='current-time']")?.textContent)
      .toBe("00:01.500");

    handle.destroy();
    registered.destroy();
    registry.destroy();
  });

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
      .toBe("00:01.500");
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
      .toBe("00:01.000");
    expect(container.querySelectorAll(".devtools-editor__tick").item(12).textContent)
      .toBe("12s");
    expect(container.querySelector<HTMLElement>(".devtools-editor__track-block")
      ?.style.getPropertyValue("--devtools-editor-track-width"))
      .toContain("8.333333333333332%");

    handle.destroy();
    timelineRegistration.destroy();
    registry.destroy();
  });

  it("clamps repeat playhead drags to a discovered non-five-second cycle", async () => {
    const registry = createTimelineRegistry();
    const container = document.createElement("div");
    const root = document.createElement("section");
    const target = document.createElement("div");
    root.append(target);
    document.body.append(container, root);
    const timeline = gsap.timeline({ paused: true }).to(target, { x: 30, duration: 3 });
    timeline.repeat(-1);
    const timelineRegistration = registry.register({ id: "three-second-loop", root, timeline });
    const handle = mountEditorUi(container, { registry });
    await flush();

    expect(handle.controller.getSnapshot().timeWindow).toMatchObject({
      duration: DEFAULT_FINITE_TIMELINE_DURATION,
      sourceDuration: 3,
    });
    const content = container.querySelector<HTMLElement>("[data-role='timeline-content']")!;
    const playhead = container.querySelector<HTMLElement>("[data-role='playhead']")!;
    vi.spyOn(content, "getBoundingClientRect").mockReturnValue(bounds(0, 0, 1200, 400));

    playhead.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 12,
      clientY: 100,
      pointerId: 31,
    }));
    playhead.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      button: 0,
      clientX: 900,
      clientY: 100,
      pointerId: 31,
    }));
    expect(handle.controller.getSnapshot().timeWindow?.progress).toBeCloseTo(3 / 12);
    expect(container.querySelector("[data-role='current-time']")?.textContent).toBe("00:03.000");
    expect(timeline.paused()).toBe(true);

    playhead.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      clientX: 1188,
      clientY: 100,
      pointerId: 31,
    }));
    await flush();
    await flush();
    expect(playhead.dataset.dragState).toBe("idle");
    expect(handle.controller.getSnapshot().timeWindow?.progress).toBeCloseTo(3 / 12);
    expect(container.querySelector("[data-role='current-time']")?.textContent).toBe("00:03.000");

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

    const heightSeparator = shadow.querySelector<HTMLElement>(
      "[data-role='height-separator']",
    )!;
    const initialHeight = Number(heightSeparator.getAttribute("aria-valuenow"));
    heightSeparator.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "ArrowUp",
    }));
    const resizedHeight = editor.style.getPropertyValue("--devtools-editor-height");
    expect(Number.parseFloat(resizedHeight)).toBeCloseTo(initialHeight + 16, 0);
    expect(shadow.querySelector<HTMLElement>("[data-devtools-editor]")
      ?.style.getPropertyValue("--devtools-editor-height")).toBe("");

    shadow.querySelector<HTMLButtonElement>(
      ".devtools-editor__track-block[data-track-key='track:opening']",
    )?.click();
    expect(document.querySelectorAll("[data-devtools-editor-highlight]")).toHaveLength(1);
    expect(fixture.first.style.outline).toBe("");

    editor.remove();
    expect(editor.controller).toBeUndefined();
    expect(editor.style.getPropertyValue("--devtools-editor-height")).toBe("");
    expect(sourceHome.contains(fixture.root)).toBe(true);
    expect(fixture.root.slot).toBe("application-slot");
    expect(fixture.first.style.outline).toBe("");
    expect(fixture.first.hasAttribute("data-devtools-editor-selected")).toBe(false);
    expect(document.querySelector("[data-devtools-editor-highlight-root]")).toBeNull();

    document.body.append(editor);
    await flush();
    expect(editor.controller).toBeDefined();
    expect(editor.controller).not.toBe(firstController);
    expect(editor.style.getPropertyValue("--devtools-editor-height")).toBe(resizedHeight);

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
