// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mountMotionDevTools } from "../playground/motion-devtools";

let nextFrame = 0;
let frames = new Map<number, FrameRequestCallback>();

beforeEach(() => {
  nextFrame = 0;
  frames = new Map();
  sessionStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false }) as MediaQueryList),
  );
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => frames.delete(id)),
  );
  vi.stubGlobal("innerHeight", 900);
});

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(16);
  await Promise.resolve();
}

function createFixture(): {
  container: HTMLElement;
  home: HTMLElement;
  stage: HTMLElement;
  timeline: gsap.core.Timeline;
  targets: HTMLElement[];
} {
  const container = document.createElement("div");
  const home = document.createElement("div");
  const stage = document.createElement("div");
  const targets = ["one", "two", "three"].map((id) => {
    const target = document.createElement("div");
    target.id = id;
    target.textContent = id;
    return target;
  });
  stage.append(...targets);
  home.append(stage);
  document.body.append(container, home);
  const timeline = gsap.timeline({ paused: true, defaults: { duration: 0.5 } });
  targets.forEach((target, index) => {
    timeline.fromTo(
      target,
      { opacity: 0 },
      { opacity: 1, x: index * 10 },
      index === 0 ? 0 : ">-0.1",
    );
  });
  return { container, home, stage, timeline, targets };
}

function mountFixture(fixture: ReturnType<typeof createFixture>) {
  const handle = mountMotionDevTools(fixture.container);
  const control = handle.addTimeline({
    id: "fixture-timeline",
    label: "Fixture timeline",
    root: fixture.stage,
    timeline: fixture.timeline,
  });
  return { handle, control };
}

describe("video-editor Motion DevTools", () => {
  it("renders authored tracks, selection details, and live transport state", async () => {
    const fixture = createFixture();
    const { container, timeline, targets } = fixture;
    const { handle } = mountFixture(fixture);
    await flush();

    expect(container.querySelectorAll(".motion-editor__block")).toHaveLength(3);
    expect(container.querySelector("[data-action='restart']")).toBeNull();
    expect(container.querySelector("[data-action='step-back']")).toBeNull();
    expect(container.querySelector("[data-action='set-in']")).toBeNull();
    expect(container.querySelector("[data-role='contextual-toolbar']")).toBeNull();
    expect(container.querySelectorAll("[data-action='show-details']")).toHaveLength(1);
    expect(container.querySelector("[data-role='readiness']")?.textContent).toBe("ready");
    expect(container.querySelector("[data-role='duration']")?.textContent).toBe("00:01.300");

    const second = container.querySelectorAll<HTMLButtonElement>(".motion-editor__block")[1]!;
    second.click();
    expect(targets[1]?.getAttribute("data-motion-editor-selected")).toBe("true");
    expect(second.getAttribute("aria-pressed")).toBe("true");

    container.querySelector<HTMLButtonElement>("[data-action='show-details']")?.click();
    expect(container.querySelector<HTMLElement>("[data-role='inspector']")?.hidden).toBe(false);
    expect(container.querySelector(".motion-editor__inspector-content")?.textContent).toContain("#two");

    container.querySelector<HTMLButtonElement>("[data-action='toggle-play']")?.click();
    gsap.ticker.tick();
    await flush();
    expect(timeline.paused()).toBe(false);
    expect(container.querySelector("[data-action='toggle-play']")?.textContent).toBe("Pause");

    handle.destroy();
  });

  it("resizes with the accessible splitter and restores the source on destroy", async () => {
    const fixture = createFixture();
    const { container, home, stage, timeline } = fixture;
    const { handle } = mountFixture(fixture);
    await flush();
    const root = container.querySelector<HTMLElement>("[data-motion-editor]")!;
    const splitter = container.querySelector<HTMLElement>("[data-role='splitter']")!;
    expect(splitter.classList.contains("motion-editor__splitter")).toBe(true);
    expect(splitter.parentElement?.classList.contains("motion-editor__divider")).toBe(true);
    expect(splitter.contains(container.querySelector("[data-action='toggle-play']"))).toBe(false);
    const initial = Number.parseFloat(
      root.style.getPropertyValue("--motion-editor-timeline-height"),
    );

    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    const increased = Number.parseFloat(
      root.style.getPropertyValue("--motion-editor-timeline-height"),
    );
    expect(increased).toBe(initial + 16);
    expect(splitter.getAttribute("aria-valuetext")).toContain("timeline");

    splitter.dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowDown",
      shiftKey: true,
      bubbles: true,
    }));
    expect(Number.parseFloat(
      root.style.getPropertyValue("--motion-editor-timeline-height"),
    )).toBe(Math.max(240, increased - 64));
    expect(sessionStorage.getItem("motion-lab-devtools-timeline-ratio")).not.toBeNull();

    handle.destroy();
    handle.destroy();
    expect(home.contains(stage)).toBe(true);
    expect(container.childElementCount).toBe(0);

    const remounted = mountMotionDevTools(container);
    remounted.addTimeline({
      id: "fixture-timeline",
      root: stage,
      timeline,
    });
    await flush();
    expect(container.querySelectorAll("[data-motion-editor]")).toHaveLength(1);
    remounted.destroy();
  });

  it("zooms, loops, collapses, and capability-gates native GSAP controls", async () => {
    const manual = createFixture();
    const { handle: manualHandle } = mountFixture(manual);
    await flush();

    const root = manual.container.querySelector<HTMLElement>("[data-motion-editor]")!;
    const content = manual.container.querySelector<HTMLElement>(".motion-editor__track-content")!;
    const zoom = manual.container.querySelector<HTMLInputElement>(".motion-editor__zoom")!;
    const widthBefore = Number.parseFloat(content.style.width);
    zoom.value = "300";
    zoom.dispatchEvent(new Event("input", { bubbles: true }));
    expect(Number.parseFloat(content.style.width)).toBeGreaterThan(widthBefore * 2);

    manual.container.querySelector<HTMLButtonElement>("[data-action='toggle-loop']")?.click();
    manual.timeline.totalProgress(1, true);
    await flush();
    await flush();
    expect(manual.timeline.totalProgress()).toBeLessThan(1);
    expect(manual.timeline.paused()).toBe(false);

    const collapse = manual.container.querySelector<HTMLButtonElement>("[data-action='toggle-timeline']")!;
    manual.container.querySelector<HTMLButtonElement>("[data-action='show-details']")?.click();
    collapse.click();
    expect(root.dataset.timelineCollapsed).toBe("true");
    expect(collapse.getAttribute("aria-expanded")).toBe("false");
    expect(manual.container.querySelector<HTMLElement>("[data-role='inspector']")?.hidden).toBe(true);
    expect(manual.container.querySelector<HTMLElement>("[data-role='splitter']")?.tabIndex).toBe(-1);
    collapse.click();
    expect(root.dataset.timelineCollapsed).toBe("false");
    manualHandle.destroy();

    const scroll = createFixture();
    const { container, timeline } = scroll;
    Object.defineProperty(timeline, "scrollTrigger", {
      configurable: true,
      value: {},
    });
    const { handle } = mountFixture(scroll);
    await flush();

    container.querySelector<HTMLButtonElement>("[data-action='toggle-play']")?.click();
    expect(timeline.paused()).toBe(true);
    expect(container.querySelector("[data-role='driver']")?.textContent).toBe("scroll");

    handle.destroy();
  });

  it("rebuilds a declared timeline before replaying a completed run", async () => {
    const fixture = createFixture();
    let createCount = 0;
    let disposeCount = 0;
    let resetCount = 0;

    const handle = mountMotionDevTools(fixture.container);
    const control = handle.addTimeline({
      id: "rebuildable-timeline",
      root: fixture.stage,
      reset: () => {
        resetCount += 1;
        fixture.stage.dataset.runState = "idle";
      },
      create: () => {
        createCount += 1;
        const timeline = gsap.timeline({ paused: true });
        timeline.to(fixture.targets[0]!, { opacity: 1, duration: 0.5 });
        return {
          timeline,
          dispose: () => {
            disposeCount += 1;
            timeline.kill();
          },
        };
      },
    });
    const firstTimeline = control.timeline;
    await flush();

    fixture.stage.dataset.runState = "finished";
    firstTimeline.totalProgress(1, true);
    await flush();
    await flush();
    fixture.container
      .querySelector<HTMLButtonElement>("[data-action='toggle-play']")
      ?.click();
    await flush();

    expect(control.replayStrategy).toBe("rebuild");
    expect(control.timeline).not.toBe(firstTimeline);
    expect(createCount).toBe(2);
    expect(disposeCount).toBe(1);
    expect(resetCount).toBe(1);
    expect(fixture.stage.dataset.runState).toBe("idle");
    expect(control.timeline.paused()).toBe(false);

    const secondTimeline = control.timeline;
    control.replay();
    await flush();
    expect(control.timeline).not.toBe(secondTimeline);
    expect(fixture.container.querySelector("[data-role='readiness']")?.textContent).toBe("ready");
    expect(createCount).toBe(3);
    expect(disposeCount).toBe(2);
    expect(resetCount).toBe(2);

    handle.destroy();
    expect(disposeCount).toBe(3);
  });

  it("reports a failed rebuild without disposing the previous runtime twice", async () => {
    const fixture = createFixture();
    let createCount = 0;
    let disposeCount = 0;
    const handle = mountMotionDevTools(fixture.container);
    const control = handle.addTimeline({
      id: "failing-timeline",
      root: fixture.stage,
      create: () => {
        createCount += 1;
        if (createCount > 1) throw new Error("Fixture rebuild failed.");
        const timeline = gsap.timeline({ paused: true });
        timeline.to(fixture.targets[0]!, { opacity: 1, duration: 0.5 });
        return {
          timeline,
          dispose: () => {
            disposeCount += 1;
            timeline.kill();
          },
        };
      },
    });
    await flush();

    control.timeline.totalProgress(1, true);
    await flush();
    await flush();
    fixture.container
      .querySelector<HTMLButtonElement>("[data-action='toggle-play']")
      ?.click();

    const root = fixture.container.querySelector<HTMLElement>("[data-motion-editor]")!;
    expect(root.dataset.connectionState).toBe("error");
    expect(fixture.container.querySelector("[data-role='readiness']")?.textContent).toBe("error");
    expect(disposeCount).toBe(1);

    handle.destroy();
    expect(disposeCount).toBe(1);
  });
});
