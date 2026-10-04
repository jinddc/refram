// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionDevtoolsEditor } from "../../src/devtools/editor/ui/editor";
import { createEditorController } from "../../src/devtools/editor/controller";
import {
  defineMotionDevtoolsEditor,
  MOTION_DEVTOOLS_EDITOR_TAG,
  type MotionDevtoolsEditorElement,
} from "../../src/devtools/editor/ui/element";
import { mountEditorUi } from "../../src/devtools/editor/ui/mount";
import { DEFAULT_FINITE_TIMELINE_DURATION } from "../../src/devtools/editor/time";
import {
  createTimelineRegistry,
  defaultTimelineRegistry,
} from "../../src/devtools/timeline/registry";

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
  vi.useRealTimers();
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
    container.style.setProperty("height", "260px");
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
    expect(container.style.getPropertyValue("height")).toBe("276px");
    expect(separator.getAttribute("aria-valuetext")).toBe("276 pixels high");

    for (let index = 0; index < 10; index += 1) {
      separator.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        key: "ArrowUp",
        shiftKey: true,
      }));
    }
    expect(container.style.getPropertyValue("height")).toBe("520px");

    for (let index = 0; index < 10; index += 1) {
      separator.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        key: "ArrowDown",
        shiftKey: true,
      }));
    }
    expect(container.style.getPropertyValue("height")).toBe("180px");

    separator.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(container.style.getPropertyValue("height")).toBe("260px");
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
    expect(container.style.getPropertyValue("height")).toBe("260px");
    registry.destroy();
  });

  it("batches pointer resizing and releases resize resources on every finish path", async () => {
    vi.stubGlobal("innerHeight", 800);
    const registry = createTimelineRegistry();
    const container = document.createElement("div");
    container.style.setProperty("height", "250px", "important");
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
    expect(container.style.getPropertyValue("height")).toBe("250px");

    await flush();
    expect(container.style.getPropertyValue("height")).toBe("420px");
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
    expect(container.style.getPropertyValue("height")).toBe("520px");
    expect(frames.size).toBe(0);

    vi.stubGlobal("innerHeight", 1000);
    window.dispatchEvent(new Event("resize"));
    expect(container.style.getPropertyValue("height")).toBe("650px");
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
    expect(container.style.getPropertyValue("height")).toBe("250px");
    expect(container.style.getPropertyPriority("height")).toBe("important");
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
    expect(firstContainer.style.getPropertyValue("height")).toBe("400px");
    firstHandle.destroy();

    vi.stubGlobal("innerHeight", 1000);
    const secondContainer = document.createElement("div");
    document.body.append(secondContainer);
    const secondHandle = mountEditorUi(secondContainer, { registry });
    expect(secondContainer.style.getPropertyValue("height")).toBe("500px");
    expect(secondContainer.querySelector("[data-role='height-separator']")
      ?.getAttribute("aria-valuenow")).toBe("500");

    secondHandle.destroy();
    registry.destroy();
  });

  it("collapses to a seekable minimal timeline and restores expanded state and height", async () => {
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("innerWidth", 1000);
    const registry = createTimelineRegistry();
    const fixture = registration("minimal", "Minimal timeline");
    const registered = registry.register(fixture.declaration);
    const container = document.createElement("div");
    container.style.height = "340px";
    vi.spyOn(container, "getBoundingClientRect")
      .mockReturnValue(bounds(0, 460, 1000, 340));
    document.body.append(container, fixture.root);

    const handle = mountEditorUi(container, { registry });
    await flush();
    const root = container.querySelector<HTMLElement>("[data-rf]")!;
    const separator = container.querySelector<HTMLElement>("[data-role='height-separator']")!;
    const toggle = container.querySelector<HTMLButtonElement>(
      "[data-action='toggle-timeline-visibility']",
    )!;
    const content = container.querySelector<HTMLElement>("[data-role='timeline-content']")!;
    const ruler = container.querySelector<HTMLElement>("[data-role='ruler']")!;
    const playhead = container.querySelector<HTMLElement>("[data-role='playhead']")!;
    vi.spyOn(content, "getBoundingClientRect").mockReturnValue(bounds(0, 0, 200, 20));

    separator.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      key: "ArrowUp",
    }));
    expect(container.style.height).toBe("356px");
    const storedExpandedRatio = sessionStorage.getItem(
      "motion-lab-devtools-editor-height-ratio",
    );
    container.querySelector<HTMLButtonElement>(
      ".rf__track-block[data-track-key='track:opening']",
    )!.click();
    expect(handle.controller.seek(0.25)).toBe(true);
    const selectedTrackKey = handle.controller.getSnapshot().view.selectedTrackKey;
    const progressBeforeCollapse = fixture.timeline.totalProgress();

    expect(toggle.type).toBe("button");
    expect(toggle.getAttribute("aria-label")).toBe("Hide timeline");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.title).toBe("Hide timeline");
    expect(toggle.querySelector("svg")?.getAttribute("data-icon"))
      .toBe("timeline-visibility");
    expect([...toggle.querySelectorAll("path")].map((path) => path.getAttribute("d")))
      .toEqual([
        "M18 2H6a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V5a3 3 0 0 0-3-3ZM6 4h12a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z",
        "M14.914 15.57 12 18.482 9.086 15.57 7.67 16.983l3.268 3.268a1.5 1.5 0 0 0 2.121 0l3.268-3.268-1.414-1.414Z",
      ]);

    toggle.click();
    expect(root.dataset.timelineCollapsed).toBe("true");
    expect(toggle.getAttribute("aria-label")).toBe("Show timeline");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.title).toBe("Show timeline");
    expect(container.style.height).toBe("75px");
    expect(content.style.getPropertyValue("--rf-playhead-position"))
      .toBe(playhead.style.left);
    expect(ruler.getAttribute("aria-label"))
      .toBe("Timeline progress ruler from 0% to 100%");
    expect(separator.hidden).toBe(true);
    expect(separator.tabIndex).toBe(-1);
    expect(separator.getAttribute("aria-hidden")).toBe("true");
    expect(sessionStorage.getItem("motion-lab-devtools-editor-height-ratio"))
      .toBe(storedExpandedRatio);
    expect(handle.controller.getSnapshot().view.selectedTrackKey).toBe(selectedTrackKey);
    expect(fixture.timeline.totalProgress()).toBeCloseTo(progressBeforeCollapse);

    ruler.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 30,
      pointerId: 10,
    }));
    expect(fixture.timeline.totalProgress()).not.toBe(progressBeforeCollapse);
    const progressAfterPointerSeek = fixture.timeline.totalProgress();
    playhead.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      code: "ArrowRight",
    }));
    expect(fixture.timeline.totalProgress()).not.toBe(progressAfterPointerSeek);
    const progressAfterKeyboardSeek = fixture.timeline.totalProgress();

    toggle.click();
    expect(root.dataset.timelineCollapsed).toBe("false");
    expect(container.style.height).toBe("356px");
    expect(separator.hidden).toBe(false);
    expect(separator.tabIndex).toBe(0);
    expect(toggle.getAttribute("aria-label")).toBe("Hide timeline");
    expect(handle.controller.getSnapshot().view.selectedTrackKey).toBe(selectedTrackKey);
    expect(fixture.timeline.totalProgress()).toBeCloseTo(progressAfterKeyboardSeek);

    toggle.click();
    handle.destroy();
    expect(container.style.height).toBe("340px");
    const remounted = mountEditorUi(container, { registry });
    await flush();
    expect(container.querySelector<HTMLElement>("[data-rf]")
      ?.dataset.timelineCollapsed).toBe("false");
    expect(container.style.height).toBe("356px");
    expect(container.querySelector("[data-action='toggle-timeline-visibility']")
      ?.getAttribute("aria-expanded")).toBe("true");

    remounted.destroy();
    registered.destroy();
    registry.destroy();
  });

  it("keeps minimal mode coherent while switching between scrubbed and standard timelines", async () => {
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("innerWidth", 600);
    const registry = createTimelineRegistry();
    const scrubbed = registration("minimal-scroll", "Minimal scroll");
    let scrollPosition = 100;
    const trigger = {
      start: 100,
      end: 500,
      progress: 0,
      direction: 1,
      vars: { id: "Minimal scrub", scrub: true },
      scroll(position?: number) {
        if (position === undefined) return scrollPosition;
        scrollPosition = position;
      },
      update() {
        this.progress = (scrollPosition - this.start) / (this.end - this.start);
      },
    };
    Object.defineProperty(scrubbed.timeline, "scrollTrigger", { value: trigger });
    const scrubRegistration = registry.register(scrubbed.declaration);
    const standard = registration("minimal-standard", "Minimal standard");
    const standardRegistration = registry.register(standard.declaration);
    const container = document.createElement("div");
    container.style.height = "300px";
    vi.spyOn(container, "getBoundingClientRect")
      .mockReturnValue(bounds(0, 500, 600, 300));
    document.body.append(container, scrubbed.root, standard.root);

    const handle = mountEditorUi(container, { registry, initialTimelineId: "minimal-scroll" });
    await flush();
    const toggle = container.querySelector<HTMLButtonElement>(
      "[data-action='toggle-timeline-visibility']",
    )!;
    const content = container.querySelector<HTMLElement>("[data-role='timeline-content']")!;
    const ruler = container.querySelector<HTMLElement>("[data-role='ruler']")!;
    const playhead = container.querySelector<HTMLElement>("[data-role='playhead']")!;
    const playback = container.querySelector<HTMLElement>(".rf__playback")!;
    const hint = container.querySelector<HTMLElement>(".rf__transport-hint")!;
    vi.spyOn(content, "getBoundingClientRect").mockReturnValue(bounds(0, 0, 200, 20));

    toggle.click();
    expect(container.style.height).toBe("75px");
    expect(playback.hidden).toBe(true);
    expect(hint.hidden).toBe(false);
    ruler.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 100,
      pointerId: 11,
    }));
    expect(scrollPosition).toBe(300);
    expect(handle.controller.getSnapshot().view.scrollTrigger?.progress).toBe(0.5);
    expect(content.style.getPropertyValue("--rf-playhead-position"))
      .toBe(playhead.style.left);

    expect(handle.controller.selectTimeline("minimal-standard")).toBe(true);
    await flush();
    expect(container.style.height).toBe("102px");
    expect(playback.hidden).toBe(false);
    expect(hint.hidden).toBe(true);
    expect(handle.controller.seek(1)).toBe(true);
    expect(content.style.getPropertyValue("--rf-progress-position"))
      .toBe("calc(100% + -12px)");
    expect(content.style.getPropertyValue("--rf-minimal-progress-position"))
      .toBe("calc(100% + -10px)");
    expect(content.style.getPropertyValue("--rf-minimal-icon-progress-position"))
      .toBe("calc(100% + -16px)");
    expect(ruler.getAttribute("aria-label"))
      .toBe("Timeline progress ruler from 0% to 100%");
    container.querySelector<HTMLButtonElement>("[data-action='play']")!.click();
    expect(standard.timeline.paused()).toBe(false);

    expect(handle.controller.selectTimeline("minimal-scroll")).toBe(true);
    await flush();
    expect(container.style.height).toBe("75px");
    expect(playback.hidden).toBe(true);
    expect(hint.hidden).toBe(false);
    expect(handle.controller.getSnapshot().view.scrollTrigger?.progress).toBe(0.5);

    toggle.click();
    expect(container.style.height).toBe("300px");
    handle.destroy();
    scrubRegistration.destroy();
    standardRegistration.destroy();
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
    fixture.first.setAttribute("data-rf-selected", "consumer");
    let targetBounds = bounds(24, 36, 120, 48);
    vi.spyOn(fixture.first, "getBoundingClientRect")
      .mockImplementation(() => targetBounds);

    const handle = mountEditorUi(container, { registry });
    await flush();
    container.querySelector<HTMLButtonElement>(
      ".rf__track-block[data-track-key='track:opening']",
    )?.click();

    const overlayRoot = document.querySelector<HTMLElement>(
      "[data-rf-highlight-root]",
    )!;
    const overlay = overlayRoot.querySelector<HTMLElement>(
      "[data-rf-highlight]",
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
    expect(fixture.first.getAttribute("data-rf-selected")).toBe("true");

    targetBounds = bounds(80, 92, 180, 64);
    await flush();
    expect(overlay.style.left).toBe("80px");
    expect(overlay.style.top).toBe("92px");
    expect(overlay.style.width).toBe("180px");
    expect(overlay.style.height).toBe("64px");

    container.querySelector<HTMLButtonElement>("[data-action='close-inspector']")?.click();
    expect(document.querySelector("[data-rf-highlight-root]")).toBeNull();
    expect(fixture.first.getAttribute("data-rf-selected")).toBe("consumer");
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
    const playhead = container.querySelector<HTMLElement>("[data-role='playhead']")!;

    expect(handle.controller.seek(8.94 / DEFAULT_FINITE_TIMELINE_DURATION)).toBe(true);
    expect(handle.controller.getSnapshot().view.time).toMatchObject({
      time: 1.5,
      progress: 1.5 / DEFAULT_FINITE_TIMELINE_DURATION,
    });
    expect(playhead.style.left)
      .toBe("calc(12.5% + 9px)");
    expect(container.querySelector("[data-role='current-time']")?.textContent)
      .toBe("00:01.500");

    handle.destroy();
    registered.destroy();
    registry.destroy();
  });

  it("preserves copy feedback through zoom reset and clears its timer on destroy", async () => {
    vi.useFakeTimers();
    const registry = createTimelineRegistry();
    const fixture = registration("copy-lifecycle", "Copy lifecycle");
    const registered = registry.register(fixture.declaration);
    const container = document.createElement("div");
    document.body.append(container, fixture.root);
    const handle = mountEditorUi(container, { registry });
    const clipboard = vi.spyOn(window.navigator, "clipboard", "get").mockReturnValue({
      writeText: vi.fn().mockResolvedValue(undefined),
    } as unknown as Clipboard);

    expect(handle.controller.selectItem(0)).toBe(true);
    const copyDebug = container.querySelector<HTMLButtonElement>(
      "[data-action='copy-debug-json']",
    )!;
    const baselineTimerCount = vi.getTimerCount();
    copyDebug.click();
    await flush();
    expect(copyDebug.textContent).toBe("Copied");
    expect(vi.getTimerCount()).toBe(baselineTimerCount + 1);

    container.querySelector<HTMLButtonElement>(
      "[data-action='reset-timeline-zoom']",
    )?.click();
    expect(copyDebug.textContent).toBe("Copied");
    expect(vi.getTimerCount()).toBe(baselineTimerCount + 1);

    handle.destroy();
    expect(vi.getTimerCount()).toBeLessThanOrEqual(baselineTimerCount);
    clipboard.mockRestore();
    registered.destroy();
    registry.destroy();
  });

  it("renders controller state and routes timeline, track, transport, and seek actions", async () => {
    vi.useFakeTimers();
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
    expect(container.querySelector(".rf__header")).toBeNull();
    expect(container.querySelector(".rf__identity")).toBeNull();
    expect(container.querySelector("[data-role='pane-switcher']")?.parentElement)
      .toBe(container.querySelector("[data-rf]"));
    expect(container.querySelectorAll(".rf__track-block")).toHaveLength(2);
    expect(container.querySelector("[data-role='track-count']")?.textContent)
      .toBe("2 tracks");
    expect(container.querySelector("[data-role='duration']")?.textContent)
      .toBe("00:01.500");
    expect(container.querySelectorAll(".rf__tick").item(12).textContent)
      .toBe("12s");
    expect(container.querySelectorAll<HTMLElement>(".rf__track-block")[0]
      ?.style.width)
      .toContain("8.333333333333332%");
    expect(container.querySelectorAll("[data-timeline-id]")).toHaveLength(2);
    const playback = container.querySelector(".rf__playback")!;
    expect([...playback.children].map((child) => (
      (child as HTMLElement).dataset.action ?? (child as HTMLElement).className
    ))).toEqual([
      "rf__playback-actions",
      "rf__clock",
      "set-speed",
    ]);
    expect([...playback.querySelector(".rf__playback-actions")!.children].map((child) => (
      (child as HTMLElement).dataset.action
    ))).toEqual(["replay", "play", "toggle-loop", "toggle-reverse"]);
    expect(container.querySelector("[data-action='set-speed']")?.parentElement)
      .toBe(playback);
    expect([...container.querySelectorAll(".rf__transport-group")].map((group) => ({
      role: group.getAttribute("role"),
      label: group.getAttribute("aria-label"),
    }))).toEqual([
      { role: "group", label: "Timeline actions" },
      { role: "group", label: "Playback controls" },
      { role: "group", label: "Timeline viewport" },
    ]);
    expect(["toggle-reverse", "toggle-loop", "replay"].map((name) => ({
      name,
      icon: container.querySelector(`[data-action='${name}'] [data-icon]`)?.getAttribute("data-icon"),
    }))).toEqual([
      { name: "toggle-reverse", icon: "reverse" },
      { name: "toggle-loop", icon: "loop" },
      { name: "replay", icon: "replay" },
    ]);
    expect([...container.querySelectorAll("[data-action='play'] [data-icon]")].map((icon) => (
      icon.getAttribute("data-icon")
    ))).toEqual(["play", "pause"]);
    const timelineToggleIcon = container.querySelector(
      "[data-action='toggle-timelines'] [data-icon='previous']",
    );
    const inspectorCloseIcon = container.querySelector(
      "[data-action='close-inspector'] [data-icon='close']",
    );
    for (const icon of [timelineToggleIcon, inspectorCloseIcon]) {
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
      expect(icon?.querySelector("path")?.getAttribute("fill")).toBe("currentColor");
    }
    expect(container.querySelector("[data-action='close-inspector']")?.getAttribute("aria-label"))
      .toBe("Close inspector");
    expect(container.querySelector<HTMLButtonElement>("[data-action='close-inspector']")?.title)
      .toBe("Close inspector");
    expect(container.querySelector(".rf__timeline-item-id")).toBeNull();
    expect(container.querySelector("[data-timeline-id='first']")?.textContent)
      .toBe("First sequence");
    expect(container.querySelector("[data-rf]")?.getAttribute("data-active-pane"))
      .toBe("timeline");
    expect(container.querySelector("[data-timeline-id='first']")?.getAttribute("aria-current"))
      .toBe("true");
    const root = container.querySelector<HTMLElement>("[data-rf]")!;
    const inspectorPane = container.querySelector<HTMLElement>("[data-role='inspector']")!;
    expect(root.dataset.inspectorOpen).toBe("false");
    expect(inspectorPane.hidden).toBe(true);
    expect(first.root.parentNode).toBe(sourceHome);
    expect(first.root.nextSibling).toBe(firstNextSibling);
    expect(sourceHome.contains(second.root)).toBe(true);

    container.querySelector<HTMLButtonElement>(
      ".rf__track-block[data-track-key='track:opening']",
    )?.click();
    expect(first.first.getAttribute("data-rf-selected")).toBe("true");
    expect(handle.controller.getSnapshot().view.selectedTrackKey).toBe("track:opening");
    expect(root.dataset.inspectorOpen).toBe("true");
    expect(inspectorPane.hidden).toBe(false);
    const inspector = container.querySelector<HTMLElement>("[data-role='inspector-content']")!;
    expect(inspector.hidden).toBe(false);
    expect(inspector.textContent).toContain("Opening");
    expect(inspector.textContent).not.toContain("track:opening");
    expect(inspector.textContent).not.toContain("Authored");
    expect(inspector.querySelector(".rf__inspector-key")).toBeNull();
    expect(inspector.querySelector(".rf__inspector-mapping")).toBeNull();
    expect(container.querySelector(".rf__track-heading")?.textContent)
      .toBe("2 tracks");
    expect(inspector.textContent).toContain("0.00s");
    expect(inspector.textContent).toContain("1.00s");
    expect(inspector.textContent).toContain("Targets1");
    expect(inspector.textContent).toContain("Propertiesx");
    expect(inspectorPane.querySelector(".rf__pane-heading")?.textContent)
      .toContain("Inspector");
    const copyDebug = container.querySelector<HTMLButtonElement>(
      "[data-action='copy-debug-json']",
    )!;
    expect(copyDebug.disabled).toBe(false);
    expect(copyDebug.getAttribute("aria-describedby")).toBe("rf-copy-debug-status");
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboard = vi.spyOn(window.navigator, "clipboard", "get").mockReturnValue({
      writeText,
    } as unknown as Clipboard);
    copyDebug.click();
    await flush();
    expect(writeText).toHaveBeenCalledOnce();
    expect(JSON.parse(writeText.mock.calls[0]![0])).toMatchObject({
      schemaVersion: 1,
      timeline: { id: "first", label: "First sequence" },
      track: {
        label: "Opening",
        type: "authored",
        start: 0,
        duration: 1,
        end: 1,
        ease: "Unavailable",
        targets: {
          animatedCount: 1,
          visualCount: 1,
          descriptors: ["article#first-first"],
        },
        properties: ["x"],
      },
    });
    expect(container.querySelector("[data-role='copy-debug-status']")?.textContent)
      .toBe("Copied debug JSON.");
    expect(copyDebug.textContent).toBe("Copied");
    expect(copyDebug.disabled).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(copyDebug.textContent).toBe("Copy debug JSON");
    expect(container.querySelector("[data-role='copy-debug-status']")?.textContent).toBe("");

    writeText.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    copyDebug.click();
    await flush();
    expect(container.querySelector("[data-role='copy-debug-status']")?.textContent)
      .toBe("Could not copy debug JSON. Clipboard access is unavailable.");
    expect(copyDebug.textContent).toBe("Copy failed");
    expect(copyDebug.disabled).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(copyDebug.textContent).toBe("Copy debug JSON");
    clipboard.mockRestore();

    container.querySelector<HTMLButtonElement>("[data-action='close-inspector']")?.click();
    expect(root.dataset.inspectorOpen).toBe("false");
    expect(inspectorPane.hidden).toBe(true);
    expect(handle.controller.getSnapshot().view.selectedTrackKey).toBeUndefined();
    expect(first.first.hasAttribute("data-rf-selected")).toBe(false);
    expect(container.querySelector("[data-track-key='track:opening']")
      ?.getAttribute("aria-pressed")).toBe("false");
    expect((document.activeElement as HTMLElement | null)?.dataset.trackKey)
      .toBe("track:opening");
    container.querySelector<HTMLButtonElement>(
      ".rf__track-block[data-track-key='track:opening']",
    )?.click();
    expect(inspectorPane.hidden).toBe(false);

    const timelineListToggle = container.querySelector<HTMLButtonElement>(
      "[data-action='toggle-timelines']",
    )!;
    timelineListToggle.click();
    expect(root.dataset.timelinesVisible).toBe("false");
    expect(timelineListToggle.getAttribute("aria-expanded")).toBe("false");
    expect(timelineListToggle.getAttribute("aria-label")).toBe("Show timelines pane");
    expect(timelineListToggle.title).toBe("Show timelines pane");
    expect(timelineListToggle.querySelector("[data-icon='previous']")).toBe(timelineToggleIcon);
    timelineListToggle.click();
    expect(root.dataset.timelinesVisible).toBe("true");
    expect(timelineListToggle.getAttribute("aria-label")).toBe("Hide timelines pane");
    expect(timelineListToggle.title).toBe("Hide timelines pane");

    const speed = container.querySelector<HTMLSelectElement>("[data-action='set-speed']")!;
    speed.value = "0.5";
    speed.dispatchEvent(new Event("change", { bubbles: true }));
    expect(first.timeline.timeScale()).toBe(0.5);
    const reverse = container.querySelector<HTMLButtonElement>("[data-action='toggle-reverse']")!;
    reverse.click();
    expect(reverse.getAttribute("aria-pressed")).toBe("true");
    expect(speed.value).toBe("0.5");
    const loop = container.querySelector<HTMLButtonElement>("[data-action='toggle-loop']")!;
    loop.click();
    expect(loop.getAttribute("aria-pressed")).toBe("true");

    const zoomIn = container.querySelector<HTMLButtonElement>("[data-action='zoom-in']")!;
    zoomIn.click();
    expect(container.querySelector<HTMLInputElement>("[data-role='zoom-range']")?.value)
      .toBe("1.25");
    container.querySelector<HTMLButtonElement>("[data-action='reset-timeline-zoom']")?.click();
    expect(container.querySelector<HTMLInputElement>("[data-role='zoom-range']")?.value)
      .toBe("1");
    expect(container.querySelector<HTMLElement>("[data-role='timeline-content']")?.style.width)
      .toBe("100%");

    container.querySelector<HTMLButtonElement>("[data-action='play']")?.click();
    expect(first.timeline.paused()).toBe(false);
    const pauseButton = container.querySelector<HTMLButtonElement>("[data-action='pause']");
    expect(pauseButton?.getAttribute("aria-label")).toBe("Pause");
    expect(pauseButton?.querySelector("[data-icon='play']")?.hasAttribute("hidden")).toBe(true);
    expect(pauseButton?.querySelector("[data-icon='pause']")?.hasAttribute("hidden")).toBe(false);

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
      ".rf__track-lane",
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
    expect(container.querySelector("[data-rf]")?.getAttribute("data-active-pane"))
      .toBe("timelines");
    container.querySelector<HTMLButtonElement>("[data-timeline-id='second']")?.click();
    await flush();
    expect(handle.controller.getSnapshot().activeTimelineId).toBe("second");
    expect(container.querySelector("[data-rf]")?.getAttribute("data-active-pane"))
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
    expect(first.first.hasAttribute("data-rf-selected")).toBe(false);

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
    expect(container.querySelector("[data-rf]")).toBeNull();
    expect(sourceHome.contains(second.root)).toBe(true);
    firstRegistration.destroy();
    secondRegistration.destroy();
    registry.destroy();
  });

  it("controls timeline zoom with an accessible synchronized range input", async () => {
    const registry = createTimelineRegistry();
    const registered = registration("zoom", "Zoom sequence");
    const registrationHandle = registry.register(registered.declaration);
    const container = document.createElement("div");
    document.body.append(container, registered.root);
    const handle = mountEditorUi(container, { registry });
    await flush();

    const range = container.querySelector<HTMLInputElement>("[data-role='zoom-range']")!;
    const reset = container.querySelector<HTMLButtonElement>(
      "[data-action='reset-timeline-zoom']",
    )!;
    const zoomOut = container.querySelector<HTMLButtonElement>("[data-action='zoom-out']")!;
    const zoomIn = container.querySelector<HTMLButtonElement>("[data-action='zoom-in']")!;
    const content = container.querySelector<HTMLElement>("[data-role='timeline-content']")!;
    const viewport = container.querySelector<HTMLElement>("[data-role='timeline-viewport']")!;
    const ruler = container.querySelector<HTMLElement>("[data-role='ruler']")!;
    const tickLabels = (): string[] => [
      ...container.querySelectorAll<HTMLElement>(".rf__tick"),
    ].map((tick) => tick.textContent ?? "");

    expect(range.type).toBe("range");
    expect(range.min).toBe("0.5");
    expect(range.max).toBe("4");
    expect(range.step).toBe("0.05");
    expect(range.getAttribute("aria-label")).toBe("Timeline zoom");
    expect(range.value).toBe("1");
    expect(range.getAttribute("aria-valuetext")).toBe("100%");
    expect(reset.textContent).toBe("Reset");
    expect(reset.getAttribute("aria-label")).toBe("Reset timeline zoom");
    expect(reset.title).toBe("Fit timeline (F)");
    expect(reset.hasAttribute("aria-pressed")).toBe(false);
    expect(container.querySelector("[data-action='fit-timeline']")).toBeNull();
    expect([zoomOut, zoomIn].map((button) => ({
      action: button.dataset.action,
      className: button.className,
      label: button.getAttribute("aria-label"),
      title: button.title,
      text: button.textContent,
      icon: button.querySelector("svg")?.dataset.icon,
      width: button.querySelector("svg")?.getAttribute("width"),
      height: button.querySelector("svg")?.getAttribute("height"),
      viewBox: button.querySelector("svg")?.getAttribute("viewBox"),
      role: button.querySelector("svg")?.getAttribute("role"),
      hidden: button.querySelector("svg")?.getAttribute("aria-hidden"),
      fills: [...button.querySelectorAll("path")].map((path) => path.getAttribute("fill")),
    }))).toEqual([
      {
        action: "zoom-out",
        className: "rf__action rf__action--icon",
        label: "Zoom out timeline",
        title: "Zoom out timeline",
        text: "",
        icon: "zoom-out",
        width: "16",
        height: "16",
        viewBox: "0 0 24 24",
        role: "presentation",
        hidden: "true",
        fills: ["currentColor", "currentColor"],
      },
      {
        action: "zoom-in",
        className: "rf__action rf__action--icon",
        label: "Zoom in timeline",
        title: "Zoom in timeline",
        text: "",
        icon: "zoom-in",
        width: "16",
        height: "16",
        viewBox: "0 0 24 24",
        role: "presentation",
        hidden: "true",
        fills: ["currentColor", "currentColor"],
      },
    ]);

    Object.defineProperty(content, "scrollWidth", {
      configurable: true,
      get: () => {
        const visibleDuration = Number(ruler.dataset.visibleDuration);
        const contentScale = Math.max(12, visibleDuration) / visibleDuration;
        return contentScale * 1000 - (contentScale - 1) * 24;
      },
    });
    viewport.scrollLeft = 100;
    const snapshot = handle.controller.getSnapshot();
    vi.spyOn(handle.controller, "getSnapshot").mockReturnValue({
      ...snapshot,
      view: {
        ...snapshot.view,
        time: { ...snapshot.view.time!, progress: 0.5 },
      },
    });
    range.value = "2";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    const intermediateVisibleDuration = 12 * (((14 / 60) / 12) ** (1 / 3));
    const intermediateContentScale = 12 / intermediateVisibleDuration;
    const intermediateContentWidth = intermediateContentScale * 1000
      - (intermediateContentScale - 1) * 24;
    expect(Number(ruler.dataset.visibleDuration)).toBeCloseTo(intermediateVisibleDuration);
    expect(Number(ruler.dataset.majorStep)).toBeCloseTo(0.25);
    expect(ruler.dataset.unit).toBe("frames");
    expect(content.style.width).toBe(
      `calc(${intermediateContentScale * 100}% - ${(intermediateContentScale - 1) * 24}px)`,
    );
    expect(viewport.scrollLeft).toBeCloseTo(intermediateContentWidth * 0.5 - 400);
    expect(range.getAttribute("aria-valuetext")).toBe("200%");

    zoomIn.click();
    expect(range.value).toBe("2.5");
    expect(range.getAttribute("aria-valuetext")).toBe("250%");
    zoomOut.click();
    expect(range.value).toBe("2");

    range.value = range.min;
    range.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    expect(zoomOut.disabled).toBe(true);
    expect(zoomIn.disabled).toBe(false);
    expect(ruler.dataset.visibleDuration).toBe("35");
    expect(ruler.dataset.majorStep).toBe("5");
    expect(ruler.dataset.unit).toBe("seconds");
    expect(content.style.width).toBe("100%");
    expect(tickLabels()).toEqual([
      "0s",
      "5s",
      "10s",
      "15s",
      "20s",
      "25s",
      "30s",
      "35s",
    ]);
    expect(ruler.getAttribute("role")).toBe("img");
    expect(ruler.getAttribute("aria-label"))
      .toBe("Timeline ruler: 35s visible, major ticks every 5s");
    vi.spyOn(content, "getBoundingClientRect")
      .mockReturnValue(bounds(0, 0, 3524, 400));
    const seek = vi.spyOn(handle.controller, "seek");
    viewport.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 12 + 3500 * 6 / 35,
      clientY: 100,
    }));
    expect(seek).toHaveBeenLastCalledWith(0.5);

    range.value = range.max;
    range.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    expect(zoomOut.disabled).toBe(false);
    expect(zoomIn.disabled).toBe(true);
    expect(Number(ruler.dataset.visibleDuration)).toBeCloseTo(14 / 60);
    expect(Number(ruler.dataset.majorStep)).toBeCloseTo(2 / 60);
    expect(ruler.dataset.unit).toBe("frames");
    expect(tickLabels().slice(0, 8)).toEqual([
      "0f",
      "2f",
      "4f",
      "6f",
      "8f",
      "10f",
      "12f",
      "14f",
    ]);
    expect(ruler.getAttribute("aria-label")).toBe(
      "Timeline ruler: 14 frames visible (approximately 233 milliseconds), major ticks every 2 frames (approximately 33 milliseconds)",
    );

    const fitShortcut = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "KeyF",
    });
    container.querySelector<HTMLElement>("[data-rf]")!
      .dispatchEvent(fitShortcut);
    expect(fitShortcut.defaultPrevented).toBe(true);
    expect(range.value).toBe("1");
    expect(Number(ruler.dataset.visibleDuration)).toBe(12);

    viewport.scrollLeft = 321;
    reset.click();
    expect(range.value).toBe("1");
    expect(range.getAttribute("aria-valuetext")).toBe("100%");
    expect(viewport.scrollLeft).toBe(0);
    expect(content.style.width).toBe("100%");
    expect(ruler.dataset.visibleDuration).toBe("12");
    expect(tickLabels().at(-1)).toBe("12s");
    reset.click();
    expect(range.value).toBe("1");
    expect(range.getAttribute("aria-valuetext")).toBe("100%");
    expect(viewport.scrollLeft).toBe(0);
    expect(content.style.width).toBe("100%");
    expect(ruler.dataset.visibleDuration).toBe("12");
    zoomIn.click();
    expect(range.value).toBe("1.25");

    reset.click();
    const resetWidthOldValues: (string | null)[] = [];
    const resetWidthObserver = new MutationObserver((records) => {
      resetWidthOldValues.push(...records.map((record) => record.oldValue));
    });
    resetWidthObserver.observe(content, {
      attributes: true,
      attributeFilter: ["style"],
      attributeOldValue: true,
    });
    range.value = "1.1";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    reset.click();
    await Promise.resolve();
    resetWidthObserver.disconnect();
    expect(resetWidthOldValues.some((value) => value?.includes("114.036%"))).toBe(false);
    expect(range.value).toBe("1");
    expect(content.style.width).toBe("100%");

    range.value = "1.25";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.value = "1.5";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
    const oneFiftyVisibleDuration = 12 * (((14 / 60) / 12) ** (1 / 6));
    expect(Number(ruler.dataset.visibleDuration)).toBeCloseTo(oneFiftyVisibleDuration);
    expect(content.style.width).toContain("calc(");
    expect(range.getAttribute("aria-valuetext")).toBe("150%");
    await flush();
    expect(Number(ruler.dataset.visibleDuration)).toBeCloseTo(oneFiftyVisibleDuration);

    handle.destroy();
    registrationHandle.destroy();
    registry.destroy();
  });

  it("owns playback shortcuts only inside the editor and leaves form editing alone", () => {
    const registry = createTimelineRegistry();
    const registered = registration("shortcuts", "Shortcut sequence");
    const registrationHandle = registry.register(registered.declaration);
    const container = document.createElement("div");
    document.body.append(container, registered.root);
    const handle = mountEditorUi(container, { registry });
    const root = container.querySelector<HTMLElement>("[data-rf]")!;
    const reverse = container.querySelector<HTMLButtonElement>("[data-action='toggle-reverse']")!;
    const loop = container.querySelector<HTMLButtonElement>("[data-action='toggle-loop']")!;
    const play = container.querySelector<HTMLButtonElement>("[data-action='play']")!;

    expect(reverse.title).toBe("Reverse (R)");
    expect(loop.title).toBe("Loop (L)");
    expect(play.title).toBe("Play (Space)");

    const press = (target: Element, code: string, repeat = false): KeyboardEvent => {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        code,
        repeat,
      });
      target.dispatchEvent(event);
      return event;
    };

    expect(press(root, "Space").defaultPrevented).toBe(true);
    expect(registered.timeline.paused()).toBe(false);
    expect(container.querySelector<HTMLButtonElement>("[data-action='pause']")?.title)
      .toBe("Pause (Space)");
    expect(press(root, "Space").defaultPrevented).toBe(true);
    expect(registered.timeline.paused()).toBe(true);

    expect(press(root, "KeyR").defaultPrevented).toBe(true);
    expect(reverse.getAttribute("aria-pressed")).toBe("true");
    expect(press(root, "KeyR", true).defaultPrevented).toBe(true);
    expect(reverse.getAttribute("aria-pressed")).toBe("true");
    expect(press(root, "KeyL").defaultPrevented).toBe(true);
    expect(loop.getAttribute("aria-pressed")).toBe("true");

    const textarea = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    root.append(textarea, editable);
    expect(press(textarea, "Space").defaultPrevented).toBe(false);
    expect(press(editable, "KeyR").defaultPrevented).toBe(false);
    expect(reverse.getAttribute("aria-pressed")).toBe("true");

    expect(press(document.body, "KeyL").defaultPrevented).toBe(false);
    expect(loop.getAttribute("aria-pressed")).toBe("true");

    handle.destroy();
    registrationHandle.destroy();
    registry.destroy();
  });

  it("auto-follows only when an actively playing playhead exits the viewport", async () => {
    const registry = createTimelineRegistry();
    const registered = registration("auto-follow", "Auto-follow sequence");
    const registrationHandle = registry.register(registered.declaration);
    const container = document.createElement("div");
    document.body.append(container, registered.root);
    const handle = mountEditorUi(container, { registry });
    const viewport = container.querySelector<HTMLElement>("[data-role='timeline-viewport']")!;
    const playhead = container.querySelector<HTMLElement>("[data-role='playhead']")!;
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 800 },
    });
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(bounds(0, 0, 200, 180));
    vi.spyOn(playhead, "getBoundingClientRect").mockImplementation(() => {
      const progress = registered.timeline.totalProgress();
      return bounds(progress * 800 - viewport.scrollLeft, 0, 0, 180);
    });
    const sampleAndFollow = async (): Promise<void> => {
      await flush();
      await flush();
    };

    expect(handle.controller.play()).toBe(true);
    await sampleAndFollow();
    expect(viewport.scrollLeft).toBe(0);

    registered.timeline.totalProgress(0.3, false);
    registered.timeline.play();
    await sampleAndFollow();
    expect(viewport.scrollLeft).toBeCloseTo(190);

    viewport.scrollLeft = 500;
    viewport.dispatchEvent(new Event("scroll"));
    await flush();
    registered.timeline.totalProgress(0.4, false);
    registered.timeline.play();
    await sampleAndFollow();
    expect(viewport.scrollLeft).toBe(500);

    registered.timeline.totalProgress(0.8, false);
    registered.timeline.play();
    await sampleAndFollow();
    expect(viewport.scrollLeft).toBe(500);
    registered.timeline.totalProgress(0.9, false);
    registered.timeline.play();
    await sampleAndFollow();
    expect(viewport.scrollLeft).toBe(600);

    viewport.scrollLeft = 600;
    viewport.dispatchEvent(new Event("scroll"));
    expect(handle.controller.setReversed(true)).toBe(true);
    registered.timeline.totalProgress(0.8, false);
    registered.timeline.reverse();
    await sampleAndFollow();
    registered.timeline.totalProgress(0.7, false);
    registered.timeline.reverse();
    await sampleAndFollow();
    expect(viewport.scrollLeft).toBeCloseTo(410);

    handle.destroy();
    registrationHandle.destroy();
    registry.destroy();
  });

  it("keeps the ruler coherent through rapid range sweeps and Reset interruptions", async () => {
    const registry = createTimelineRegistry();
    const registered = registration("zoom-stress", "Zoom stress sequence");
    const registrationHandle = registry.register(registered.declaration);
    const container = document.createElement("div");
    document.body.append(container, registered.root);
    const handle = mountEditorUi(container, { registry });
    await flush();

    const range = container.querySelector<HTMLInputElement>("[data-role='zoom-range']")!;
    const reset = container.querySelector<HTMLButtonElement>(
      "[data-action='reset-timeline-zoom']",
    )!;
    const viewport = container.querySelector<HTMLElement>("[data-role='timeline-viewport']")!;
    const ruler = container.querySelector<HTMLElement>("[data-role='ruler']")!;
    const content = container.querySelector<HTMLElement>("[data-role='timeline-content']")!;
    const playhead = container.querySelector<HTMLElement>("[data-role='playhead']")!;
    const defaultGeometry = {
      contentWidth: content.style.width,
      contentMinWidth: content.style.minWidth,
      rulerSignature: ruler.dataset.signature,
      startTickLeft: container.querySelector<HTMLElement>(".rf__tick")!.style.left,
      endTickLeft: container.querySelector<HTMLElement>(".rf__tick:last-child")!
        .style.left,
      trackLeft: container.querySelector<HTMLElement>(".rf__track-block")!.style.left,
      trackWidth: container.querySelector<HTMLElement>(".rf__track-block")!.style.width,
      playheadLeft: playhead.style.left,
    };
    const input = (value: number): void => {
      range.value = String(value);
      range.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const frameRequestsBeforeStress = vi.mocked(requestAnimationFrame).mock.calls.length;

    for (let pass = 0; pass < 4; pass += 1) {
      for (let step = 50; step <= 400; step += 1) input(step / 100);
      reset.click();
      for (let step = 400; step >= 50; step -= 1) input(step / 100);
    }
    input(4);
    expect(
      vi.mocked(requestAnimationFrame).mock.calls.length - frameRequestsBeforeStress,
    ).toBeLessThanOrEqual(14);
    await flush();

    const labels = [
      ...container.querySelectorAll<HTMLElement>(".rf__tick"),
    ].map((tick) => tick.textContent);
    expect(range.value).toBe("4");
    expect(range.getAttribute("aria-valuetext")).toBe("400%");
    expect(ruler.dataset.unit).toBe("frames");
    expect(Number(ruler.dataset.visibleDuration)).toBeCloseTo(14 / 60);
    expect(Number(ruler.dataset.majorStep)).toBeCloseTo(2 / 60);
    expect(labels.slice(0, 8)).toEqual([
      "0f",
      "2f",
      "4f",
      "6f",
      "8f",
      "10f",
      "12f",
      "14f",
    ]);
    expect(labels.at(-1)).toBe("720f");
    expect(new Set(labels).size).toBe(labels.length);
    expect(container.querySelectorAll(".rf__tick")).toHaveLength(361);
    expect(container.querySelectorAll(".rf__ruler-mark")).toHaveLength(721);
    expect(content.style.width).not.toContain("NaN");
    expect(content.style.width).not.toContain("Infinity");

    input(0.95);
    await flush();
    expect(range.value).toBe("0.95");
    expect(range.getAttribute("aria-valuetext")).toBe("95%");
    input(1.05);
    await flush();
    expect(range.value).toBe("1.05");
    expect(range.getAttribute("aria-valuetext")).toBe("105%");
    content.style.width = "calc(95% - 24px)";
    content.style.minWidth = "calc(95% - 24px)";
    viewport.scrollLeft = 173;
    reset.click();
    expect(viewport.scrollLeft).toBe(0);
    expect({
      contentWidth: content.style.width,
      contentMinWidth: content.style.minWidth,
      rulerSignature: ruler.dataset.signature,
      startTickLeft: container.querySelector<HTMLElement>(".rf__tick")!.style.left,
      endTickLeft: container.querySelector<HTMLElement>(".rf__tick:last-child")!
        .style.left,
      trackLeft: container.querySelector<HTMLElement>(".rf__track-block")!.style.left,
      trackWidth: container.querySelector<HTMLElement>(".rf__track-block")!.style.width,
      playheadLeft: playhead.style.left,
    }).toEqual(defaultGeometry);

    const finalSignature = ruler.dataset.signature;
    const frameCancellationsBeforeDestroy = vi.mocked(cancelAnimationFrame).mock.calls.length;
    input(0.5);
    handle.destroy();
    expect(vi.mocked(cancelAnimationFrame).mock.calls.length)
      .toBeGreaterThan(frameCancellationsBeforeDestroy);
    await flush();
    expect(ruler.dataset.signature).toBe(finalSignature);
    registrationHandle.destroy();
    registry.destroy();
  });

  it("keeps each discrete range step distinct around the exact 100% baseline", async () => {
    const registry = createTimelineRegistry();
    const registered = registration("zoom-baseline", "Zoom baseline sequence");
    const registrationHandle = registry.register(registered.declaration);
    const container = document.createElement("div");
    document.body.append(container, registered.root);
    const handle = mountEditorUi(container, { registry });
    await flush();

    const range = container.querySelector<HTMLInputElement>("[data-role='zoom-range']")!;
    const ruler = container.querySelector<HTMLElement>("[data-role='ruler']")!;
    const content = container.querySelector<HTMLElement>("[data-role='timeline-content']")!;
    const input = async (value: number): Promise<void> => {
      range.value = String(value);
      range.dispatchEvent(new Event("input", { bubbles: true }));
      await flush();
    };

    await input(1.05);
    expect(range.value).toBe("1.05");
    expect(range.getAttribute("aria-valuetext")).toBe("105%");
    expect(Number(ruler.dataset.visibleDuration)).toBeLessThan(12);
    expect(content.style.width).toContain("calc(");

    await input(0.95);
    expect(range.value).toBe("0.95");
    expect(range.getAttribute("aria-valuetext")).toBe("95%");
    expect(Number(ruler.dataset.visibleDuration)).toBeGreaterThan(12);
    expect(content.style.width).toBe("100%");

    await input(1);
    expect(range.value).toBe("1");
    expect(range.getAttribute("aria-valuetext")).toBe("100%");
    expect(ruler.dataset.visibleDuration).toBe("12");
    expect(ruler.dataset.majorStep).toBe("1");
    expect(content.style.width).toBe("100%");

    await input(0.98);
    expect(range.value).toBe("1");
    expect(ruler.dataset.visibleDuration).toBe("12");
    handle.destroy();
    registrationHandle.destroy();
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
    expect(container.querySelectorAll(".rf__tick").item(12).textContent)
      .toBe("12s");
    expect(container.querySelectorAll(".rf__ruler-mark")).toHaveLength(121);
    expect(container.querySelector<HTMLElement>("[data-role='inspector-empty']")?.hidden)
      .toBe(false);
    expect(container.querySelector<HTMLElement>("[data-role='inspector']")?.hidden)
      .toBe(true);
    expect(container.querySelector("[data-role='preview-surface']")).toBeNull();
    handle.destroy();
    expect(handle.controller.selectTimeline("missing")).toBe(false);
    registry.destroy();
  });

  it("does not destroy an externally supplied controller", () => {
    const registry = createTimelineRegistry();
    const fixture = registration("external-controller", "External controller");
    const registered = registry.register(fixture.declaration);
    const controller = createEditorController({ registry });
    const destroyController = vi.spyOn(controller, "destroy");
    const container = document.createElement("div");
    document.body.append(container, fixture.root);
    const handle = mountEditorUi(container, { controller });

    handle.destroy();
    handle.destroy();

    expect(destroyController).not.toHaveBeenCalled();
    expect(controller.selectTimeline("external-controller")).toBe(true);

    controller.destroy();
    registered.destroy();
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

    expect(container.querySelectorAll(".rf__tick").item(12).textContent)
      .toBe("12s");

    const timeline = gsap.timeline({ paused: true });
    timeline.to(target, { x: 20, duration: 1 });
    const timelineRegistration = registry.register({ id: "one-second", root, timeline });
    await flush();

    expect(container.querySelector("[data-role='duration']")?.textContent)
      .toBe("00:01.000");
    expect(container.querySelectorAll(".rf__tick").item(12).textContent)
      .toBe("12s");
    expect(container.querySelector<HTMLElement>(".rf__track-block")
      ?.style.width)
      .toContain("8.333333333333332%");
    const endMarker = container.querySelector<HTMLElement>("[data-role='timeline-end-marker']")!;
    const postDuration = container.querySelector<HTMLElement>("[data-role='post-duration']")!;
    expect(endMarker.hidden).toBe(false);
    expect(endMarker.style.left).toContain("8.333333333333332%");
    expect(endMarker.getAttribute("aria-label")).toBe("Animation ends at 1.00s");
    expect(postDuration.hidden).toBe(false);
    expect(postDuration.style.left).toBe(endMarker.style.left);
    expect(container.querySelector("[data-role='track-count']")?.textContent)
      .toBe("1 track");

    handle.destroy();
    timelineRegistration.destroy();
    registry.destroy();
  });

  it("maps full-duration tracks onto the shared inset lane content box", async () => {
    const registry = createTimelineRegistry();
    const container = document.createElement("div");
    const root = document.createElement("section");
    const target = document.createElement("div");
    root.append(target);
    document.body.append(container, root);
    const handle = mountEditorUi(container, { registry });
    const timeline = gsap.timeline({ paused: true });
    timeline.to(target, { x: 20, duration: DEFAULT_FINITE_TIMELINE_DURATION });
    const timelineRegistration = registry.register({ id: "full-duration", root, timeline });
    await flush();

    const block = container.querySelector<HTMLElement>(".rf__track-block")!;
    expect(block.style.left).toBe("0%");
    expect(block.style.width).toBe("100%");
    expect(container.querySelector<HTMLElement>("[data-role='timeline-end-marker']")?.hidden)
      .toBe(true);

    handle.destroy();
    timelineRegistration.destroy();
    registry.destroy();
  });

  it("extends long timelines at the default pixels-per-second scale", async () => {
    const registry = createTimelineRegistry();
    const container = document.createElement("div");
    const root = document.createElement("section");
    const target = document.createElement("div");
    root.append(target);
    document.body.append(container, root);
    const timeline = gsap.timeline({ paused: true }).to(target, { x: 20, duration: 16 });
    const registration = registry.register({ id: "sixteen-seconds", root, timeline });
    const handle = mountEditorUi(container, { registry });
    await flush();

    const viewport = container.querySelector<HTMLElement>("[data-role='timeline-viewport']")!;
    const content = container.querySelector<HTMLElement>("[data-role='timeline-content']")!;
    const playhead = container.querySelector<HTMLElement>("[data-role='playhead']")!;
    expect(handle.controller.getSnapshot().timeWindow?.duration).toBe(16);
    expect(content.style.width).toContain("calc(133.33333333333331%");
    expect(content.style.minWidth).toBe("");
    expect(container.querySelectorAll(".rf__tick")).toHaveLength(17);
    expect(container.querySelectorAll(".rf__tick").item(16).textContent)
      .toBe("16s");
    expect(container.querySelector<HTMLElement>(".rf__track-block")?.style.width)
      .toBe("100%");

    const contentWidth = 1600;
    const contentLeft = -400;
    vi.spyOn(content, "getBoundingClientRect")
      .mockReturnValue(bounds(contentLeft, 0, contentWidth, 400));
    vi.spyOn(viewport, "getBoundingClientRect")
      .mockReturnValue(bounds(0, 0, 900, 200));
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 900 },
      clientHeight: { configurable: true, value: 180 },
      offsetHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 180 },
      scrollWidth: { configurable: true, value: contentWidth },
    });
    viewport.scrollLeft = 400;
    const twelveSecondX = contentLeft + 12 + (contentWidth - 24) * 12 / 16;
    viewport.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: twelveSecondX,
      clientY: 100,
    }));
    expect(timeline.totalProgress()).toBeCloseTo(0.75);
    expect(playhead.style.left).toBe("calc(75% + -6px)");

    handle.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("clamps repeat clicks and playhead drags to a discovered non-five-second cycle", async () => {
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
    const loop = container.querySelector<HTMLButtonElement>("[data-action='toggle-loop']")!;
    expect(loop.disabled).toBe(true);
    expect(loop.getAttribute("aria-pressed")).toBe("false");
    const content = container.querySelector<HTMLElement>("[data-role='timeline-content']")!;
    const playhead = container.querySelector<HTMLElement>("[data-role='playhead']")!;
    const endMarker = container.querySelector<HTMLElement>("[data-role='timeline-end-marker']")!;
    const postDuration = container.querySelector<HTMLElement>("[data-role='post-duration']")!;
    expect(endMarker.hidden).toBe(false);
    expect(endMarker.style.left).toBe("calc(25% + 6px)");
    expect(endMarker.getAttribute("aria-label")).toBe("Cycle ends at 3.00s");
    expect(postDuration.hidden).toBe(false);
    expect(postDuration.style.left).toBe(endMarker.style.left);
    vi.spyOn(content, "getBoundingClientRect").mockReturnValue(bounds(0, 0, 1200, 400));

    content.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 698,
      clientY: 100,
    }));
    expect(handle.controller.getSnapshot().timeWindow?.progress).toBeCloseTo(3 / 12);
    expect(container.querySelector("[data-role='current-time']")?.textContent).toBe("00:03.000");

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

    const root = container.querySelector<HTMLElement>("[data-rf]")!;
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

  it("keeps the Pause visual when reverse is toggled during playback at zero", () => {
    const registry = createTimelineRegistry();
    const fixture = registration("reverse-at-zero", "Reverse at zero");
    const timelineRegistration = registry.register(fixture.declaration);
    const container = document.createElement("div");
    document.body.append(fixture.root, container);
    const handle = mountEditorUi(container, { registry });

    container.querySelector<HTMLButtonElement>("[data-action='play']")?.click();
    expect(handle.controller.getSnapshot().view.time?.progress).toBe(0);
    container.querySelector<HTMLButtonElement>("[data-action='toggle-reverse']")?.click();

    expect(fixture.timeline.totalProgress()).toBe(1);
    const pause = container.querySelector<HTMLButtonElement>("[data-action='pause']");
    expect(pause?.getAttribute("aria-label")).toBe("Pause");
    expect(pause?.disabled).toBe(false);

    handle.destroy();
    timelineRegistration.destroy();
    registry.destroy();
  });

  it("shows the Play visual after reverse finishes at zero without looping", () => {
    const registry = createTimelineRegistry();
    const fixture = registration("reverse-complete", "Reverse complete");
    const timelineRegistration = registry.register(fixture.declaration);
    const container = document.createElement("div");
    document.body.append(fixture.root, container);
    const handle = mountEditorUi(container, { registry });

    expect(handle.controller.setReversed(true)).toBe(true);
    expect(handle.controller.play()).toBe(true);
    fixture.timeline.totalProgress(0, true);
    expect(fixture.timeline.isActive()).toBe(false);
    expect(handle.controller.setTimeScale(1)).toBe(true);

    const play = container.querySelector<HTMLButtonElement>("[data-action='play']");
    expect(play?.getAttribute("aria-label")).toBe("Play");
    expect(play?.disabled).toBe(false);

    handle.destroy();
    timelineRegistration.destroy();
    registry.destroy();
  });

  it("exposes and guards the transient rebuild state", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("section");
    const target = document.createElement("div");
    root.append(target);
    const observed: Array<{ disabled: boolean; label: string | null; nested: boolean }> = [];
    let creates = 0;
    let handle: ReturnType<typeof mountEditorUi>;
    const registrationHandle = registry.register({
      id: "rebuild-feedback",
      root,
      reset() {
        const replay = root.nextElementSibling?.querySelector<HTMLButtonElement>(
          "[data-action='replay']",
        );
        if (!replay) throw new Error("Replay control was not mounted.");
        replay.click();
        observed.push({
          disabled: replay.disabled,
          label: replay.getAttribute("aria-label"),
          nested: handle.controller.replay(),
        });
      },
      create() {
        creates += 1;
        const timeline = gsap.timeline({ paused: true });
        timeline.to(target, { x: 20, duration: 1 });
        return { timeline, dispose: () => timeline.kill() };
      },
    });
    const container = document.createElement("div");
    document.body.append(root, container);
    handle = mountEditorUi(container, { registry });

    container.querySelector<HTMLButtonElement>("[data-action='replay']")?.click();

    expect(observed).toEqual([{
      disabled: true,
      label: "Rebuilding…",
      nested: false,
    }]);
    expect(creates).toBe(2);
    expect(handle.controller.getSnapshot().view.status).toBe("ready");
    expect(handle.controller.getSnapshot().view.transport.rebuilding).toBe(false);

    handle.destroy();
    registrationHandle.destroy();
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
    expect(replay.getAttribute("aria-label")).toBe("Retry");
    expect(replay.disabled).toBe(false);

    replay.click();
    expect(handle.controller.getSnapshot().view.status).toBe("ready");
    expect(replay.getAttribute("aria-label")).toBe("Replay");
    expect(attempts).toBe(3);
    handle.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("preserves Reverse and playback speed visuals when Replay rebuilds the runtime", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("section");
    const target = document.createElement("div");
    root.append(target);
    const registration = registry.register({
      id: "replay-direction",
      root,
      create() {
        const timeline = gsap.timeline({ paused: true });
        timeline.to(target, { x: 20, duration: 1 });
        return { timeline, dispose: () => timeline.kill() };
      },
    });
    const container = document.createElement("div");
    document.body.append(container, root);
    const handle = mountEditorUi(container, { registry });
    const reverse = container.querySelector<HTMLButtonElement>("[data-action='toggle-reverse']")!;
    const speed = container.querySelector<HTMLSelectElement>("[data-action='set-speed']")!;

    speed.value = "0.5";
    speed.dispatchEvent(new Event("change", { bubbles: true }));
    reverse.click();
    expect(reverse.getAttribute("aria-pressed")).toBe("true");
    expect(speed.value).toBe("0.5");
    container.querySelector<HTMLButtonElement>("[data-action='replay']")?.click();
    expect(reverse.getAttribute("aria-pressed")).toBe("true");
    expect(speed.value).toBe("0.5");
    expect(handle.controller.getSnapshot().view.transport.reversed).toBe(true);
    expect(handle.controller.getSnapshot().view.transport.timeScale).toBe(0.5);
    expect(Math.abs(registration.timeline.timeScale())).toBe(0.5);

    handle.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("isolates editor styles and reconnects through the custom element lifecycle", async () => {
    defineMotionDevtoolsEditor();
    expect(MOTION_DEVTOOLS_EDITOR_TAG).toBe("rf-editor");
    expect(customElements.get("rf-editor")).toBe(defineMotionDevtoolsEditor());
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
    expect(shadow.querySelector("[data-rf]")).not.toBeNull();
    expect(document.querySelector(".rf")).toBeNull();
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
    const resizedHeight = editor.style.getPropertyValue("height");
    expect(Number.parseFloat(resizedHeight)).toBeCloseTo(initialHeight + 16, 0);
    expect(shadow.querySelector<HTMLElement>("[data-rf]")
      ?.style.getPropertyValue("height")).toBe("");

    shadow.querySelector<HTMLButtonElement>(
      ".rf__track-block[data-track-key='track:opening']",
    )?.click();
    expect(document.querySelectorAll("[data-rf-highlight]")).toHaveLength(1);
    expect(fixture.first.style.outline).toBe("");

    editor.remove();
    expect(editor.controller).toBeUndefined();
    expect(editor.style.getPropertyValue("height")).toBe("");
    expect(sourceHome.contains(fixture.root)).toBe(true);
    expect(fixture.root.slot).toBe("application-slot");
    expect(fixture.first.style.outline).toBe("");
    expect(fixture.first.hasAttribute("data-rf-selected")).toBe(false);
    expect(document.querySelector("[data-rf-highlight-root]")).toBeNull();

    document.body.append(editor);
    await flush();
    expect(editor.controller).toBeDefined();
    expect(editor.controller).not.toBe(firstController);
    expect(editor.style.getPropertyValue("height")).toBe(resizedHeight);

    editor.remove();
    timelineRegistration.destroy();
  });

  it("resolves missing and invalid editor themes to dark", async () => {
    defineMotionDevtoolsEditor();
    const editor = document.createElement(
      MOTION_DEVTOOLS_EDITOR_TAG,
    ) as MotionDevtoolsEditorElement;
    document.body.append(editor);
    await flush();

    expect(editor.dataset.theme).toBe("dark");
    editor.setAttribute("theme", "sepia");
    expect(editor.dataset.theme).toBe("dark");
    editor.removeAttribute("theme");
    expect(editor.dataset.theme).toBe("dark");

    editor.remove();
  });

  it("applies explicit themes and responds to runtime attribute changes", async () => {
    defineMotionDevtoolsEditor();
    const editor = document.createElement(
      MOTION_DEVTOOLS_EDITOR_TAG,
    ) as MotionDevtoolsEditorElement;
    editor.setAttribute("theme", "light");
    document.body.append(editor);
    await flush();

    expect(editor.dataset.theme).toBe("light");
    editor.setAttribute("theme", "dark");
    expect(editor.dataset.theme).toBe("dark");
    editor.setAttribute("theme", "light");
    expect(editor.dataset.theme).toBe("light");

    editor.remove();
  });

  it("configures constructor themes before mounting into the requested container", () => {
    const container = document.createElement("aside");
    document.body.append(container);
    const append = container.append.bind(container);
    const appendSpy = vi.spyOn(container, "append").mockImplementation((...nodes) => {
      expect((nodes[0] as Element).getAttribute("theme")).toBe("light");
      append(...nodes);
    });

    const editor = new MotionDevtoolsEditor({ container, theme: "light" });

    expect(appendSpy).toHaveBeenCalledOnce();
    expect(editor.domElement.parentNode).toBe(container);
    expect(editor.domElement.getAttribute("theme")).toBe("light");
    expect(editor.domElement.dataset.theme).toBe("light");
    editor.destroy();
  });

  it("supports explicit dark and missing constructor theme options", () => {
    const container = document.createElement("aside");
    document.body.append(container);

    const darkEditor = new MotionDevtoolsEditor({ container, theme: "dark" });
    expect(darkEditor.domElement.parentNode).toBe(container);
    expect(darkEditor.domElement.getAttribute("theme")).toBe("dark");
    expect(darkEditor.domElement.dataset.theme).toBe("dark");
    darkEditor.destroy();

    const defaultEditor = new MotionDevtoolsEditor({ container });
    expect(defaultEditor.domElement.parentNode).toBe(container);
    expect(defaultEditor.domElement.hasAttribute("theme")).toBe(false);
    expect(defaultEditor.domElement.dataset.theme).toBe("dark");
    defaultEditor.destroy();
  });

  it("renders scrubbed ScrollTriggers with a percentage ruler and real scroller seeking", async () => {
    const registry = createTimelineRegistry();
    const container = document.createElement("div");
    const customScroller = document.createElement("main");
    customScroller.id = "scroll-shell";
    document.body.append(container, customScroller);
    const scrubbed = registration("scroll-scrub", "Fallback scroll label");
    scrubbed.first.className = "hero section-with-an-intentionally-long-class-name feature-panel-active";
    const scrollIntoView = vi.fn();
    scrubbed.first.scrollIntoView = scrollIntoView;
    const marker = (type: "start" | "end" | "scroller-start" | "scroller-end") => {
      const element = document.createElement("div");
      element.className = `gsap-marker-${type}`;
      element.textContent = `${type}-Hero scroll`;
      customScroller.append(element);
      return element;
    };
    const markerStart = marker("start");
    const markerEnd = marker("end");
    const scrollerStart = marker("scroller-start");
    const scrollerEnd = marker("scroller-end");
    const markers = [markerStart, markerEnd, scrollerStart, scrollerEnd];
    let scrollPosition = 100;
    const trigger = {
      start: 100,
      end: 500,
      progress: 0,
      direction: 1,
      trigger: scrubbed.first,
      scroller: customScroller,
      pin: scrubbed.first,
      markerStart,
      markerEnd,
      vars: {
        id: "Hero scroll",
        scrub: 0.75,
        start: "top 80%",
        end: "bottom 20%",
        markers: {
          startColor: "#22c55e",
          endColor: "#ef4444",
          fontSize: "12px",
          fontWeight: "600",
          indent: 8,
        },
      },
      scroll(position?: number) {
        if (position === undefined) return scrollPosition;
        scrollPosition = position;
      },
      update() {
        this.progress = (scrollPosition - this.start) / (this.end - this.start);
      },
    };
    Object.defineProperty(scrubbed.timeline, "scrollTrigger", { value: trigger });
    const scrollRegistration = registry.register(scrubbed.declaration);
    const standard = registration("standard", "Standard timeline");
    const standardRegistration = registry.register(standard.declaration);

    const handle = mountEditorUi(container, { registry });
    await flush();
    container.querySelector<HTMLButtonElement>("[data-timeline-id='scroll-scrub']")!.click();
    await flush();
    const transport = container.querySelector<HTMLElement>(".rf__transport")!;
    const transportHint = container.querySelector<HTMLElement>(
      ".rf__transport-hint",
    )!;
    const playback = container.querySelector<HTMLElement>(".rf__playback")!;
    const viewportControls = container.querySelector<HTMLElement>(".rf__viewport-controls")!;
    const scrollTriggerActions = container.querySelector<HTMLElement>(
      ".rf__transport-settings",
    )!;
    const jumpToTarget = container.querySelector<HTMLButtonElement>(
      "[data-action='jump-to-scrolltrigger-target']",
    )!;
    const toggleMarkers = container.querySelector<HTMLButtonElement>(
      "[data-action='toggle-scrolltrigger-markers']",
    )!;
    const resetZoom = viewportControls.querySelector<HTMLButtonElement>(
      "[data-action='reset-timeline-zoom']",
    )!;
    const zoomControl = viewportControls.querySelector<HTMLElement>(
      ".rf__zoom-control",
    )!;
    const ruler = container.querySelector<HTMLElement>("[data-role='ruler']")!;
    const content = container.querySelector<HTMLElement>("[data-role='timeline-content']")!;
    const playhead = container.querySelector<HTMLElement>("[data-role='playhead']")!;
    const pill = container.querySelector<HTMLElement>(".rf__playhead-progress")!;
    expect(container.querySelector("[data-timeline-id='scroll-scrub']")?.textContent)
      .toBe("Hero scroll");
    expect(transport.hidden).toBe(false);
    expect(playback.hidden).toBe(true);
    expect(transportHint.hidden).toBe(false);
    expect(transportHint.textContent).toBe("Scroll the page to preview");
    expect(scrollTriggerActions.getAttribute("aria-hidden")).toBeNull();
    expect(jumpToTarget.hidden).toBe(false);
    expect(toggleMarkers.hidden).toBe(false);
    expect(jumpToTarget.disabled).toBe(false);
    expect(jumpToTarget.getAttribute("aria-label")).toBe("Jump to target");
    expect(toggleMarkers.disabled).toBe(false);
    expect(toggleMarkers.getAttribute("aria-pressed")).toBe("true");
    expect(toggleMarkers.getAttribute("aria-label")).toBe("Hide ScrollTrigger markers");
    jumpToTarget.click();
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
      behavior: "auto",
    });
    toggleMarkers.click();
    expect(toggleMarkers.getAttribute("aria-pressed")).toBe("false");
    expect(toggleMarkers.getAttribute("aria-label")).toBe("Show ScrollTrigger markers");
    expect(markers.every((node) => node.hasAttribute(
      "data-rf-marker-hidden",
    ))).toBe(true);
    toggleMarkers.click();
    expect(toggleMarkers.getAttribute("aria-pressed")).toBe("true");
    expect(markers.every((node) => !node.hasAttribute(
      "data-rf-marker-hidden",
    ))).toBe(true);
    expect(viewportControls.hidden).toBe(false);
    expect(resetZoom.hidden).toBe(true);
    expect(zoomControl.hidden).toBe(true);
    expect(ruler.getAttribute("aria-label")).toBe("Scroll progress ruler from 0% to 100%");
    expect([...ruler.querySelectorAll(".rf__tick")].map((tick) => tick.textContent))
      .toEqual(["0%", "25%", "50%", "75%", "100%"]);
    expect(pill.hidden).toBe(false);
    expect(pill.textContent).toBe("0%");
    expect(pill.style.getPropertyValue("--rf-playhead-pill-translate")).toBe("0%");
    expect(pill.style.getPropertyValue("--rf-playhead-pill-overlap")).toBe("-1px");
    expect(playhead.getAttribute("aria-label")).toBe("Scroll progress playhead");
    expect(playhead.getAttribute("aria-valuetext")).toBe("0%");

    vi.spyOn(content, "getBoundingClientRect").mockReturnValue(bounds(0, 0, 200, 200));
    ruler.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 100,
      pointerId: 2,
    }));
    expect(scrollPosition).toBe(300);
    expect(pill.textContent).toBe("50%");
    expect(pill.style.getPropertyValue("--rf-playhead-pill-translate")).toBe("-50%");
    expect(pill.style.getPropertyValue("--rf-playhead-pill-overlap")).toBe("0px");
    expect(scrubbed.timeline.totalProgress()).toBe(0);

    const setPointerCapture = vi.spyOn(playhead, "setPointerCapture")
      .mockImplementation(() => undefined);
    pill.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 100,
      pointerId: 3,
    }));
    expect(playhead.dataset.dragState).toBe("active");
    expect(setPointerCapture).toHaveBeenCalledWith(3);
    playhead.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      button: 0,
      clientX: 56,
      pointerId: 3,
    }));
    expect(scrollPosition).toBe(200);
    playhead.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      clientX: 56,
      pointerId: 3,
    }));
    expect(playhead.dataset.dragState).toBe("idle");
    expect(handle.controller.seek(0.5)).toBe(true);

    container.querySelector<HTMLButtonElement>("[data-track-key='track:opening']")!.click();
    const inspector = container.querySelector<HTMLElement>("[data-role='inspector-content']")!;
    expect(inspector.textContent).toContain("ScrollTrigger stateActive");
    expect(inspector.textContent).toContain("Raw starttop 80%");
    expect(inspector.textContent).toContain("Raw endbottom 20%");
    expect(inspector.textContent).toContain("Resolved start100.00px");
    expect(inspector.textContent).toContain("Resolved end500.00px");
    expect(inspector.textContent).toContain("Scroll distance400.00px");
    expect(inspector.textContent).toContain("Scrub0.75s");
    const triggerField = [...inspector.querySelectorAll(".rf__inspector-field")]
      .find((field) => field.querySelector("dt")?.textContent === "Trigger")!;
    expect(triggerField.querySelector(".rf__inspector-term")?.textContent)
      .toBe("Trigger");
    const triggerValue = triggerField.querySelector<HTMLElement>(
      ".rf__inspector-value",
    )!;
    const fullTriggerValue =
      "article#scroll-scrub-first.hero.section-with-an-intentionally-long-class-name";
    expect(triggerValue.textContent).toBe(fullTriggerValue);
    expect(triggerValue.title).toBe(fullTriggerValue);
    expect(triggerValue.classList.contains("rf__inspector-value--truncate")).toBe(true);
    const scrollerValue = [...inspector.querySelectorAll(".rf__inspector-field")]
      .find((field) => field.querySelector("dt")?.textContent === "Scroller")!
      .querySelector<HTMLElement>(".rf__inspector-value")!;
    expect(scrollerValue.textContent).toBe("main#scroll-shell");
    expect(scrollerValue.title).toBe("main#scroll-shell");
    expect(scrollerValue.classList.contains("rf__inspector-value--truncate"))
      .toBe(true);
    expect(inspector.textContent).toContain("Scrollermain#scroll-shell");
    expect(inspector.textContent).toContain("MarkersOn (custom)");
    expect(inspector.textContent).toContain("Scroll progress50%");
    expect(inspector.textContent).toContain("Animation progress0%");
    expect(container.querySelector("[data-action='copy-markers-config']")).toBeNull();

    expect(handle.controller.seek(0.025)).toBe(true);
    expect(Number.parseFloat(
      pill.style.getPropertyValue("--rf-playhead-pill-translate"),
    )).toBeCloseTo(-25);
    expect(Number.parseFloat(
      pill.style.getPropertyValue("--rf-playhead-pill-overlap"),
    )).toBeCloseTo(-0.5);
    expect(handle.controller.seek(0.975)).toBe(true);
    expect(Number.parseFloat(
      pill.style.getPropertyValue("--rf-playhead-pill-translate"),
    )).toBeCloseTo(-75);
    expect(Number.parseFloat(
      pill.style.getPropertyValue("--rf-playhead-pill-overlap"),
    )).toBeCloseTo(0.5);
    expect(handle.controller.seek(1)).toBe(true);
    expect(pill.textContent).toBe("100%");
    expect(pill.style.getPropertyValue("--rf-playhead-pill-translate")).toBe("-100%");
    expect(pill.style.getPropertyValue("--rf-playhead-pill-overlap")).toBe("1px");
    expect(handle.controller.seek(0.5)).toBe(true);

    container.querySelector<HTMLButtonElement>("[data-timeline-id='standard']")!.click();
    await flush();
    expect(transport.hidden).toBe(false);
    expect(playback.hidden).toBe(false);
    expect(transportHint.hidden).toBe(true);
    expect(scrollTriggerActions.getAttribute("aria-hidden")).toBeNull();
    expect(jumpToTarget.hidden).toBe(false);
    expect(jumpToTarget.disabled).toBe(false);
    expect(toggleMarkers.hidden).toBe(true);
    expect(resetZoom.hidden).toBe(false);
    expect(zoomControl.hidden).toBe(false);
    expect(pill.hidden).toBe(true);
    expect(container.querySelector("[data-action='copy-markers-config']")).toBeNull();
    expect(ruler.getAttribute("aria-label")).toContain("Timeline ruler:");
    expect(playhead.getAttribute("aria-label")).toBe("Timeline playhead");

    handle.destroy();
    expect(markers.every((node) => !node.hasAttribute(
      "data-rf-marker-hidden",
    ))).toBe(true);
    expect(cancelAnimationFrame).toHaveBeenCalled();
    const remounted = mountEditorUi(container, { registry, initialTimelineId: "scroll-scrub" });
    await flush();
    expect(container.querySelector(".rf__playhead-progress")?.textContent).toBe("50%");
    remounted.destroy();
    scrollRegistration.destroy();
    standardRegistration.destroy();
    registry.destroy();
  });

  it("shows marker controls for authored and marker-free trigger-action timelines", async () => {
    const registry = createTimelineRegistry();
    const container = document.createElement("div");
    const authored = registration("action-authored", "Authored trigger actions");
    const markerFree = registration("action-marker-free", "Marker-free trigger actions");
    const ordinary = registration("action-ordinary", "Ordinary timeline");
    document.body.append(container, authored.root, markerFree.root, ordinary.root);

    const markerId = "Authored trigger actions";
    const marker = (type: "start" | "end" | "scroller-start" | "scroller-end") => {
      const element = document.createElement("div");
      element.className = `gsap-marker-${type}`;
      element.textContent = `${type}-${markerId}`;
      document.body.append(element);
      return element;
    };
    const markerStart = marker("start");
    const markerEnd = marker("end");
    const scrollerStart = marker("scroller-start");
    const scrollerEnd = marker("scroller-end");
    const authoredMarkers = { startColor: "green", endColor: "red" };
    const authoredTrigger = {
      start: 100,
      end: 500,
      progress: 0,
      direction: 1,
      trigger: authored.first,
      scroller: window,
      markerStart,
      markerEnd,
      vars: {
        id: markerId,
        scrub: false,
        toggleActions: "play pause resume reverse",
        markers: authoredMarkers,
      },
      scroll: () => 100,
    };
    const markerFreeVars = {
      id: "Marker-free trigger actions",
      scrub: false,
      toggleActions: "play pause resume reverse",
      markers: false,
    };
    const markerFreeTrigger = {
      start: 200,
      end: 600,
      progress: 0,
      direction: 1,
      trigger: markerFree.first,
      scroller: window,
      vars: markerFreeVars,
      scroll: () => 200,
    };
    Object.defineProperty(authored.timeline, "scrollTrigger", { value: authoredTrigger });
    Object.defineProperty(markerFree.timeline, "scrollTrigger", { value: markerFreeTrigger });

    const authoredRegistration = registry.register(authored.declaration);
    const markerFreeRegistration = registry.register(markerFree.declaration);
    const ordinaryRegistration = registry.register(ordinary.declaration);
    const handle = mountEditorUi(container, { registry });
    await flush();

    const toggleMarkers = container.querySelector<HTMLButtonElement>(
      "[data-action='toggle-scrolltrigger-markers']",
    )!;
    const playback = container.querySelector<HTMLElement>(".rf__playback")!;
    const ruler = container.querySelector<HTMLElement>("[data-role='ruler']")!;
    const pill = container.querySelector<HTMLElement>(".rf__playhead-progress")!;

    container.querySelector<HTMLButtonElement>("[data-timeline-id='action-authored']")!.click();
    await flush();
    expect(toggleMarkers.hidden).toBe(false);
    expect(toggleMarkers.disabled).toBe(false);
    expect(toggleMarkers.getAttribute("aria-pressed")).toBe("true");
    expect(playback.hidden).toBe(false);
    expect(ruler.getAttribute("aria-label")).toContain("Timeline ruler:");
    expect(pill.hidden).toBe(true);
    toggleMarkers.click();
    expect(toggleMarkers.getAttribute("aria-pressed")).toBe("false");
    expect(authoredTrigger.vars.markers).toBe(authoredMarkers);
    toggleMarkers.click();
    expect(authoredTrigger.vars.markers).toBe(authoredMarkers);

    container.querySelector<HTMLButtonElement>("[data-timeline-id='action-marker-free']")!.click();
    await flush();
    expect(toggleMarkers.hidden).toBe(false);
    expect(toggleMarkers.disabled).toBe(false);
    expect(toggleMarkers.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll("[data-rf-marker-owned]")).toHaveLength(4);
    expect(playback.hidden).toBe(false);
    expect(ruler.getAttribute("aria-label")).toContain("Timeline ruler:");
    expect(pill.hidden).toBe(true);
    toggleMarkers.click();
    expect(document.querySelectorAll("[data-rf-marker-owned]")).toHaveLength(0);
    expect(markerFreeTrigger.vars).toBe(markerFreeVars);
    expect(markerFreeTrigger.vars.markers).toBe(false);

    container.querySelector<HTMLButtonElement>("[data-timeline-id='action-ordinary']")!.click();
    await flush();
    expect(toggleMarkers.hidden).toBe(true);
    expect(document.querySelectorAll("[data-rf-marker-owned]")).toHaveLength(0);
    expect(ruler.getAttribute("aria-label")).toContain("Timeline ruler:");

    handle.destroy();
    markerStart.remove();
    markerEnd.remove();
    scrollerStart.remove();
    scrollerEnd.remove();
    authoredRegistration.destroy();
    markerFreeRegistration.destroy();
    ordinaryRegistration.destroy();
    registry.destroy();
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
