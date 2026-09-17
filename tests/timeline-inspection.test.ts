// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  attachTimelineInspector,
  type TimelineInspectionSnapshot,
} from "../src/timeline/timeline-inspection";
import { MotionTimelineElement } from "../src/timeline/timeline-element";
import { MotionTweenElement } from "../src/timeline/tween-element";
import {
  FakeScrollTrigger,
  installFakeScrollTrigger,
  removeFakeScrollTrigger,
} from "./scroll-trigger-fake";

let nextFrame = 0;
let frames = new Map<number, FrameRequestCallback>();

beforeAll(() => {
  if (!customElements.get("motion-timeline")) {
    customElements.define("motion-timeline", MotionTimelineElement);
  }
  if (!customElements.get("motion-tween")) {
    customElements.define("motion-tween", MotionTweenElement);
  }
});

beforeEach(() => {
  nextFrame = 0;
  frames = new Map();
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
    vi.fn((id: number) => {
      frames.delete(id);
    }),
  );
});

afterEach(() => {
  removeFakeScrollTrigger(gsap);
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function flushInspection(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function runFrame(time = 16): void {
  const pending = [...frames.entries()];
  frames.clear();
  for (const [, callback] of pending) {
    callback(time);
  }
}

function createTimeline(): MotionTimelineElement {
  return document.createElement("motion-timeline") as MotionTimelineElement;
}

function createTween(
  options: MotionTweenElement["options"],
): MotionTweenElement {
  const tween = document.createElement("motion-tween") as MotionTweenElement;
  tween.options = options;
  return tween;
}

describe("timeline inspection", () => {
  it("attaches before compilation and advances from an empty coherent snapshot", async () => {
    const timeline = createTimeline();
    const wrapper = document.createElement("div");
    const first = createTween({ to: { x: 10 }, duration: 0.2 });
    const second = createTween({ to: { x: 20 }, duration: 0.3 });
    const nestedTimeline = createTimeline();
    const nested = createTween({ to: { x: 30 }, duration: 4 });
    wrapper.append(first, second);
    nestedTimeline.append(nested);
    timeline.append(wrapper, nestedTimeline);
    document.body.append(timeline);

    const snapshots: TimelineInspectionSnapshot[] = [];
    const attachment = attachTimelineInspector(
      timeline,
      (snapshot) => snapshots.push(snapshot),
    );
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      revision: 0,
      readiness: "empty",
      progress: 0,
      totalDuration: 0,
    });

    await flushInspection();
    expect(snapshots.at(-1)).toMatchObject({
      revision: 1,
      readiness: "ready",
      totalDuration: 0.5,
    });
    expect(snapshots.at(-1)?.items.map((item) => item.source)).toEqual([
      first,
      second,
    ]);
    attachment.detach();
  });

  it("delivers one synchronous immutable snapshot and updates authored replacements", async () => {
    const timeline = createTimeline();
    const advanced = { label: "opaque" };
    const first = createTween({
      from: { opacity: 0 },
      to: { opacity: 1, callbackScope: advanced },
      duration: 0.5,
    });
    const inert = createTween({ from: { x: 10 } });
    timeline.append(first, inert);
    document.body.append(timeline);
    await flushInspection();

    const snapshots: TimelineInspectionSnapshot[] = [];
    const attachment = attachTimelineInspector(
      timeline,
      (snapshot) => snapshots.push(snapshot),
    );

    expect(snapshots).toHaveLength(1);
    expect(attachment.read()).toBe(snapshots[0]);
    expect(snapshots[0]).toMatchObject({
      revision: 0,
      driver: "manual",
      readiness: "ready",
      playState: "idle",
      progress: 0,
      totalDuration: 0.5,
    });
    expect(snapshots[0]?.items).toHaveLength(2);
    expect(snapshots[0]?.items[0]).toMatchObject({
      source: first,
      index: 0,
      runnable: true,
      authoredDuration: 0.5,
      resolvedStart: 0,
      resolvedDuration: 0.5,
      resolvedEnd: 0.5,
    });
    expect(snapshots[0]?.items[0]?.to?.callbackScope).toBe(advanced);
    expect(snapshots[0]?.items[1]).toMatchObject({
      source: inert,
      index: 1,
      runnable: false,
      resolvedStart: null,
      resolvedDuration: null,
      resolvedEnd: null,
    });
    expect(Object.isFrozen(snapshots[0])).toBe(true);
    expect(Object.isFrozen(snapshots[0]?.items)).toBe(true);

    first.options = { to: { x: 20 }, duration: 0.25 };
    await flushInspection();

    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]).toMatchObject({
      revision: 1,
      readiness: "ready",
      totalDuration: 0.25,
    });
    expect(snapshots[1]?.items).not.toBe(snapshots[0]?.items);

    attachment.detach();
    attachment.detach();
    expect(() => attachment.read()).toThrowError(expect.objectContaining({
      name: "InvalidStateError",
    }));
  });

  it("shares one opt-in frame loop and does not send progress frames to structural listeners", async () => {
    installFakeScrollTrigger(gsap);
    const timeline = createTimeline();
    timeline.options = {
      scrollTrigger: { trigger: document.body, scrub: true },
    };
    timeline.append(createTween({ to: { x: 100 }, duration: 1 }));
    document.body.append(timeline);
    await flushInspection();

    const structural: TimelineInspectionSnapshot[] = [];
    const progressA: TimelineInspectionSnapshot[] = [];
    const progressB: TimelineInspectionSnapshot[] = [];
    const structuralAttachment = attachTimelineInspector(
      timeline,
      (snapshot) => structural.push(snapshot),
    );
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    const firstProgressAttachment = attachTimelineInspector(
      timeline,
      (snapshot) => progressA.push(snapshot),
      { progress: true },
    );
    const secondProgressAttachment = attachTimelineInspector(
      timeline,
      (snapshot) => progressB.push(snapshot),
      { progress: true },
    );

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    const trigger = FakeScrollTrigger.instances.at(-1)!;
    trigger.setProgress(0.2);
    await flushInspection();
    const structuralCount = structural.length;
    const progressACount = progressA.length;
    const progressBCount = progressB.length;
    const items = progressA.at(-1)!.items;

    trigger.setProgress(0.35);
    runFrame();

    expect(structural).toHaveLength(structuralCount);
    expect(progressA).toHaveLength(progressACount + 1);
    expect(progressB).toHaveLength(progressBCount + 1);
    expect(progressA.at(-1)).toMatchObject({
      revision: 0,
      progress: 0.35,
      playState: "running",
    });
    expect(progressA.at(-1)?.items).toBe(items);
    expect(progressB.at(-1)?.items).toBe(items);

    firstProgressAttachment.detach();
    expect(cancelAnimationFrame).not.toHaveBeenCalled();
    secondProgressAttachment.detach();
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    structuralAttachment.detach();
  });

  it("isolates progress listener failures and keeps shared sampling alive", async () => {
    installFakeScrollTrigger(gsap);
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const timeline = createTimeline();
    timeline.options = {
      scrollTrigger: { trigger: document.body, scrub: true },
    };
    timeline.append(createTween({ to: { x: 100 }, duration: 1 }));
    document.body.append(timeline);
    await flushInspection();

    let shouldThrow = false;
    const firstAttachment = attachTimelineInspector(
      timeline,
      () => {
        if (shouldThrow) {
          throw new Error("debugger render failed");
        }
      },
      { progress: true },
    );
    const received: TimelineInspectionSnapshot[] = [];
    const secondAttachment = attachTimelineInspector(
      timeline,
      (snapshot) => received.push(snapshot),
      { progress: true },
    );
    const trigger = FakeScrollTrigger.instances.at(-1)!;
    trigger.setProgress(0.2);
    await flushInspection();
    shouldThrow = true;

    trigger.setProgress(0.4);
    expect(() => runFrame()).not.toThrow();
    expect(received.at(-1)?.progress).toBeCloseTo(0.4);
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "debugger render failed" }),
    );
    expect(frames.size).toBe(1);

    firstAttachment.detach();
    secondAttachment.detach();
  });

  it("defers listener-caused mutations and keeps semantic state changes on one revision", async () => {
    const timeline = createTimeline();
    const tween = createTween({ to: { x: 10 }, duration: 1 });
    timeline.append(tween);
    document.body.append(timeline);
    await flushInspection();
    const snapshots: TimelineInspectionSnapshot[] = [];
    let depth = 0;
    let maximumDepth = 0;
    const attachment = attachTimelineInspector(timeline, (snapshot) => {
      depth += 1;
      maximumDepth = Math.max(maximumDepth, depth);
      snapshots.push(snapshot);
      if (snapshots.length === 1) {
        tween.options = { to: { x: 20 }, duration: 0.5 };
      }
      depth -= 1;
    });

    expect(snapshots).toHaveLength(1);
    await flushInspection();
    expect(maximumDepth).toBe(1);
    expect(snapshots).toHaveLength(2);
    expect(snapshots.at(-1)).toMatchObject({
      revision: 1,
      totalDuration: 0.5,
    });

    const items = snapshots.at(-1)!.items;
    const run = timeline.play();
    gsap.ticker.tick();
    expect(timeline.playState).toBe("running");
    await flushInspection();
    expect(snapshots.at(-1)).toMatchObject({
      revision: 1,
      playState: "running",
    });
    expect(snapshots.at(-1)?.items).toBe(items);

    timeline.pause();
    await flushInspection();
    expect(snapshots.at(-1)).toMatchObject({
      revision: 1,
      playState: "paused",
    });
    expect(snapshots.at(-1)?.items).toBe(items);

    timeline.finish();
    await run;
    await flushInspection();
    expect(snapshots.at(-1)).toMatchObject({
      revision: 1,
      playState: "finished",
    });
    attachment.detach();
  });

  it("survives true disconnect and reconnect with coherent revisions", async () => {
    const timeline = createTimeline();
    const tween = createTween({ to: { x: 20 }, duration: 0.5 });
    timeline.append(tween);
    document.body.append(timeline);
    await flushInspection();
    const snapshots: TimelineInspectionSnapshot[] = [];
    const attachment = attachTimelineInspector(
      timeline,
      (snapshot) => snapshots.push(snapshot),
    );

    timeline.remove();
    await flushInspection();

    expect(snapshots.at(-1)).toMatchObject({
      revision: 1,
      readiness: "disconnected",
      playState: "idle",
      progress: 0,
      totalDuration: 0,
    });
    expect(snapshots.at(-1)?.items[0]).toMatchObject({
      source: tween,
      resolvedStart: null,
      resolvedDuration: null,
      resolvedEnd: null,
    });

    document.body.append(timeline);
    await flushInspection();

    expect(snapshots.at(-1)).toMatchObject({
      revision: 2,
      readiness: "ready",
      totalDuration: 0.5,
    });
    expect(snapshots.at(-1)?.items[0]?.resolvedDuration).toBeCloseTo(0.5);
    attachment.detach();
  });

  it("reports manual and scroll cancellation from their post-cancel resource state", async () => {
    const manual = createTimeline();
    manual.append(createTween({ to: { x: 10 }, duration: 1 }));
    document.body.append(manual);
    await flushInspection();
    const manualSnapshots: TimelineInspectionSnapshot[] = [];
    const manualAttachment = attachTimelineInspector(
      manual,
      (snapshot) => manualSnapshots.push(snapshot),
    );

    manual.cancel();
    await flushInspection();
    expect(manualSnapshots.at(-1)).toMatchObject({
      revision: 1,
      readiness: "ready",
      playState: "idle",
      progress: 0,
    });

    installFakeScrollTrigger(gsap);
    const scroll = createTimeline();
    scroll.options = {
      scrollTrigger: { trigger: document.body, scrub: true },
    };
    scroll.append(createTween({ to: { x: 20 }, duration: 2 }));
    document.body.append(scroll);
    await flushInspection();
    const scrollSnapshots: TimelineInspectionSnapshot[] = [];
    const scrollAttachment = attachTimelineInspector(
      scroll,
      (snapshot) => scrollSnapshots.push(snapshot),
    );

    scroll.cancel();
    await flushInspection();
    expect(scrollSnapshots.at(-1)).toMatchObject({
      revision: 1,
      driver: "scroll",
      readiness: "cancelled",
      playState: "idle",
      progress: 0,
      totalDuration: 0,
    });
    expect(scrollSnapshots.at(-1)?.items[0]?.resolvedStart).toBeNull();

    scroll.refresh();
    await flushInspection();
    expect(scrollSnapshots.at(-1)).toMatchObject({
      revision: 2,
      readiness: "ready",
      totalDuration: 2,
    });

    manualAttachment.detach();
    scrollAttachment.detach();
  });

  it("reports deterministic missing-plugin and reduced-motion values", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const missing = createTimeline();
    missing.options = {
      scrollTrigger: { trigger: document.body, scrub: true },
    };
    missing.append(createTween({ to: { x: 10 }, duration: 1 }));
    document.body.append(missing);
    await flushInspection();
    const missingAttachment = attachTimelineInspector(
      missing,
      vi.fn(),
    );
    expect(missingAttachment.read()).toMatchObject({
      readiness: "missing-plugin",
      playState: "idle",
      progress: 0,
      totalDuration: 0,
    });
    expect(missingAttachment.read().items[0]?.resolvedStart).toBeNull();
    expect(warning).toHaveBeenCalledTimes(1);

    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true }) as MediaQueryList),
    );
    const reduced = createTimeline();
    reduced.options = {
      scrollTrigger: { trigger: document.body, scrub: true },
    };
    reduced.append(createTween({ to: { opacity: 0.5 }, duration: 2 }));
    document.body.append(reduced);
    await flushInspection();
    const reducedAttachment = attachTimelineInspector(
      reduced,
      vi.fn(),
    );
    expect(reducedAttachment.read()).toMatchObject({
      readiness: "reduced-motion",
      playState: "finished",
      progress: 1,
      totalDuration: 0,
    });
    expect(reducedAttachment.read().items[0]).toMatchObject({
      resolvedStart: null,
      resolvedDuration: null,
      resolvedEnd: null,
    });

    missingAttachment.detach();
    reducedAttachment.detach();
  });

  it("rejects non-timeline targets without reading browser globals eagerly", () => {
    expect(() => attachTimelineInspector(
      document.createElement("div") as unknown as MotionTimelineElement,
      vi.fn(),
    )).toThrowError(TypeError);
  });
});
