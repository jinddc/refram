// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mountTimelineDebugger } from "../playground/timeline-debugger";
import {
  ATTACH_TIMELINE_INSPECTOR,
  type TimelineInspectionHost,
  type TimelineInspectionItem,
  type TimelineInspectionListener,
  type TimelineInspectionSnapshot,
  type TimelineInspectorAttachment,
  type TimelineInspectorOptions,
} from "../src/timeline/timeline-inspection";
import {
  MotionTimelineElement,
  MotionTweenElement,
  registerMotionTimeline,
} from "../src/timeline";

interface FakeTimeline {
  element: MotionTimelineElement;
  emit(snapshot: TimelineInspectionSnapshot): void;
  activeAttachments(): number;
  detachCount(): number;
}

function inspectionItem(
  source: HTMLElement,
  overrides: Partial<TimelineInspectionItem> = {},
): TimelineInspectionItem {
  return {
    source,
    index: 0,
    runnable: true,
    authoredPosition: 0,
    from: { opacity: 0 },
    to: { opacity: 1 },
    authoredDuration: 1,
    authoredEase: "power2.out",
    resolvedStart: 0,
    resolvedDuration: 1,
    resolvedEnd: 1,
    ...overrides,
  };
}

function inspectionSnapshot(
  items: readonly TimelineInspectionItem[],
  overrides: Partial<TimelineInspectionSnapshot> = {},
): TimelineInspectionSnapshot {
  return {
    revision: 0,
    driver: "manual",
    readiness: items.length ? "ready" : "empty",
    playState: "idle",
    progress: 0,
    totalDuration: items.length ? 1 : 0,
    items,
    ...overrides,
  };
}

function createFakeTimeline(initial: TimelineInspectionSnapshot): FakeTimeline {
  let snapshot = initial;
  let detached = 0;
  const listeners = new Set<TimelineInspectionListener>();
  const element = document.createElement("div") as unknown as (
    MotionTimelineElement & TimelineInspectionHost
  );

  Object.defineProperty(element, ATTACH_TIMELINE_INSPECTOR, {
    configurable: true,
    value(
      listener: TimelineInspectionListener,
      _options: TimelineInspectorOptions = {},
    ): TimelineInspectorAttachment {
      let active = true;
      listeners.add(listener);
      listener(snapshot);
      return {
        read: () => {
          if (!active) {
            throw new DOMException("Detached", "InvalidStateError");
          }
          return snapshot;
        },
        detach: () => {
          if (!active) return;
          active = false;
          detached += 1;
          listeners.delete(listener);
        },
      };
    },
  });

  return {
    element,
    emit(next) {
      snapshot = next;
      for (const listener of [...listeners]) listener(next);
    },
    activeAttachments: () => listeners.size,
    detachCount: () => detached,
  };
}

describe("timeline debugger", () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;

  beforeEach(() => {
    document.body.innerHTML = "";
    frames = new Map();
    nextFrame = 0;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => {
      frames.delete(id);
    }));
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function runFrame(): void {
    const pending = [...frames.entries()];
    frames.clear();
    for (const [, callback] of pending) callback(performance.now());
  }

  it("renders the initial authored view synchronously with safe shallow details", () => {
    let getterCalls = 0;
    const sourceA = document.createElement("motion-tween");
    sourceA.id = "alpha";
    const sourceB = document.createElement("motion-tween");
    sourceB.id = "beta";
    const from = {
      opacity: 0,
      callback: () => undefined,
      targets: [sourceA],
      element: sourceA,
      nested: { y: 20 },
    } as Record<string, unknown>;
    Object.defineProperty(from, "lazy", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "unsafe";
      },
    });
    const items = [
      inspectionItem(sourceA, { from, authoredPosition: "<35%" }),
      inspectionItem(sourceB, {
        index: 1,
        authoredPosition: ">-0.2",
        runnable: false,
        resolvedStart: null,
        resolvedDuration: null,
        resolvedEnd: null,
      }),
    ];
    const timeline = createFakeTimeline(inspectionSnapshot(items));
    const container = document.createElement("div");
    document.body.append(container);

    const handle = mountTimelineDebugger(container, timeline.element);

    expect(container.querySelectorAll("[data-role='rows'] tr")).toHaveLength(2);
    expect(container.textContent).toContain("motion-tween#alpha");
    expect(container.textContent).toContain("<35%");
    expect(container.textContent).toContain(">-0.2");
    expect(container.textContent).toContain("Unavailable");
    expect(container.textContent).toContain("[Function]");
    expect(container.textContent).toContain("[Array]");
    expect(container.textContent).toContain("[Element]");
    expect(container.textContent).toContain("[Object]");
    expect(container.textContent).toContain("[Accessor]");
    expect(getterCalls).toBe(0);
    expect(frames).toHaveLength(0);

    handle.destroy();
  });

  it("changes keyboard-operable selection without mutating the source", () => {
    const sourceA = document.createElement("motion-tween");
    sourceA.id = "first";
    const sourceB = document.createElement("motion-tween");
    sourceB.id = "second";
    sourceB.setAttribute("data-preserve", "yes");
    const before = sourceB.outerHTML;
    const items = [
      inspectionItem(sourceA),
      inspectionItem(sourceB, {
        index: 1,
        authoredDuration: 0.4,
        authoredEase: "none",
        from: { x: 40 },
        to: { x: 0 },
      }),
    ];
    const timeline = createFakeTimeline(inspectionSnapshot(items));
    const container = document.createElement("div");
    document.body.append(container);
    const handle = mountTimelineDebugger(container, timeline.element);
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      ".timeline-debugger__row-button",
    );

    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
    buttons[1]?.click();

    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-role='details']")?.textContent)
      .toContain("0.4s");
    expect(container.querySelector("[data-role='details']")?.textContent)
      .toContain("none");
    expect(sourceB.outerHTML).toBe(before);
    expect(document.activeElement).not.toBe(sourceB);

    handle.destroy();
  });

  it("coalesces progress writes and preserves authored row identity", () => {
    const source = document.createElement("motion-tween");
    const items = [inspectionItem(source)];
    const timeline = createFakeTimeline(inspectionSnapshot(items));
    const container = document.createElement("div");
    const handle = mountTimelineDebugger(container, timeline.element);
    const row = container.querySelector("tr");

    timeline.emit(inspectionSnapshot(items, {
      playState: "running",
      progress: 0.2,
    }));
    timeline.emit(inspectionSnapshot(items, {
      playState: "running",
      progress: 0.5,
    }));
    timeline.emit(inspectionSnapshot(items, {
      playState: "running",
      progress: 0.75,
    }));

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(1);
    runFrame();
    expect(container.querySelector("tr")).toBe(row);
    expect(container.querySelector<HTMLOutputElement>("[data-role='progress']")?.value)
      .toBe("75.0%");
    expect(container.querySelector<HTMLElement>("[data-timeline-debugger]")?.style
      .getPropertyValue("--timeline-debugger-progress")).toBe("0.75");

    handle.destroy();
  });

  it("reconciles item-array replacements and preserves only surviving selection", () => {
    const sourceA = document.createElement("motion-tween");
    sourceA.id = "a";
    const sourceB = document.createElement("motion-tween");
    sourceB.id = "b";
    const timeline = createFakeTimeline(inspectionSnapshot([
      inspectionItem(sourceA),
      inspectionItem(sourceB, { index: 1 }),
    ]));
    const container = document.createElement("div");
    const handle = mountTimelineDebugger(container, timeline.element);
    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    buttons[1]?.click();
    const selectedRow = buttons[1]?.closest("tr");

    const survivingItems = [inspectionItem(sourceB, {
      index: 0,
      resolvedDuration: 0.5,
      resolvedEnd: 0.5,
    })];
    timeline.emit(inspectionSnapshot(survivingItems, {
      revision: 1,
      totalDuration: 0.5,
    }));
    runFrame();

    expect(container.querySelector("tbody tr")).toBe(selectedRow);
    expect(container.querySelector<HTMLButtonElement>("button")?.getAttribute("aria-pressed"))
      .toBe("true");

    const sourceC = document.createElement("motion-tween");
    sourceC.id = "c";
    timeline.emit(inspectionSnapshot([inspectionItem(sourceC)], { revision: 2 }));
    runFrame();
    expect(container.textContent).toContain("motion-tween#c");
    expect(container.textContent).not.toContain("motion-tween#b");
    expect(container.querySelector<HTMLButtonElement>("button")?.getAttribute("aria-pressed"))
      .toBe("true");

    handle.destroy();
  });

  it("destroys idempotently, stops pending work, and remounts as a fresh session", () => {
    const source = document.createElement("motion-tween");
    const items = [inspectionItem(source)];
    const timeline = createFakeTimeline(inspectionSnapshot(items));
    const container = document.createElement("div");
    const first = mountTimelineDebugger(container, timeline.element);
    timeline.emit(inspectionSnapshot(items, { progress: 0.4 }));

    expect(frames).toHaveLength(1);
    first.destroy();
    first.destroy();
    expect(timeline.activeAttachments()).toBe(0);
    expect(timeline.detachCount()).toBe(1);
    expect(frames).toHaveLength(0);
    expect(container.childElementCount).toBe(0);

    timeline.emit(inspectionSnapshot(items, { progress: 0.8 }));
    expect(frames).toHaveLength(0);

    const second = mountTimelineDebugger(container, timeline.element);
    expect(timeline.activeAttachments()).toBe(1);
    expect(container.querySelector<HTMLOutputElement>("[data-role='progress']")?.value)
      .toBe("80.0%");
    second.destroy();
    expect(timeline.detachCount()).toBe(2);
  });

  it("isolates multiple panels and handles all explicit readiness states", () => {
    const states: TimelineInspectionSnapshot["readiness"][] = [
      "empty",
      "ready",
      "missing-plugin",
      "reduced-motion",
      "cancelled",
      "disconnected",
    ];
    const handles: ReturnType<typeof mountTimelineDebugger>[] = [];

    for (const [index, readiness] of states.entries()) {
      const source = document.createElement("motion-tween");
      source.id = `source-${index}`;
      const unavailable = readiness !== "ready";
      const items = readiness === "empty"
        ? []
        : [inspectionItem(source, unavailable ? {
            resolvedStart: null,
            resolvedDuration: null,
            resolvedEnd: null,
          } : {})];
      const timeline = createFakeTimeline(inspectionSnapshot(items, {
        readiness,
        progress: readiness === "reduced-motion" ? 1 : 0,
        totalDuration: unavailable ? 0 : 1,
        playState: readiness === "reduced-motion" ? "finished" : "idle",
      }));
      const container = document.createElement("div");
      document.body.append(container);
      handles.push(mountTimelineDebugger(container, timeline.element));
      expect(container.querySelector("[data-role='readiness']")?.textContent)
        .toBe(readiness);
      if (items.length && unavailable) {
        expect(container.textContent).toContain("Unavailable");
      }
    }

    handles[0]?.destroy();
    expect(document.querySelectorAll("[data-timeline-debugger]")).toHaveLength(
      states.length - 1,
    );
    for (const handle of handles.slice(1)) handle.destroy();
  });

  it("consumes a real timeline through the internal inspection boundary", async () => {
    registerMotionTimeline();
    const timeline = document.createElement("motion-timeline") as MotionTimelineElement;
    const tween = document.createElement("motion-tween") as MotionTweenElement;
    tween.id = "real-item";
    tween.options = {
      from: { opacity: 0 },
      to: { opacity: 1 },
      duration: 0.4,
    };
    timeline.append(tween);
    document.body.append(timeline);
    await Promise.resolve();
    await Promise.resolve();
    const container = document.createElement("div");
    document.body.append(container);

    const handle = mountTimelineDebugger(container, timeline);

    expect(container.textContent).toContain("motion-tween#real-item");
    expect(container.querySelector("[data-role='readiness']")?.textContent)
      .toBe("ready");
    expect(container.textContent).toContain("0.4s");
    handle.destroy();
  });
});
