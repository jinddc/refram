// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MotionTimelineElement } from "../src/timeline/timeline-element";
import { MotionTweenElement } from "../src/timeline/tween-element";
import {
  FakeScrollTrigger,
  installFakeScrollTrigger,
  removeFakeScrollTrigger,
} from "./scroll-trigger-fake";

beforeAll(() => {
  if (!customElements.get("motion-timeline")) {
    customElements.define("motion-timeline", MotionTimelineElement);
  }
  if (!customElements.get("motion-tween")) {
    customElements.define("motion-tween", MotionTweenElement);
  }
});

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false }) as MediaQueryList),
  );
});

afterEach(() => {
  removeFakeScrollTrigger(gsap);
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function flushComposition(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
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

describe("MotionTimelineElement", () => {
  it("owns wrapped tweens in document order but excludes nested timelines", async () => {
    const outer = createTimeline();
    const wrapper = document.createElement("div");
    const first = createTween({ to: { x: 10 }, duration: 0.2 });
    const second = createTween({ to: { x: 20 }, duration: 0.3 });
    const inner = createTimeline();
    const nested = createTween({ to: { x: 30 }, duration: 4 });
    wrapper.append(first, second);
    inner.append(nested);
    outer.append(wrapper, inner);
    document.body.append(outer);
    await flushComposition();

    expect(outer.totalDuration()).toBeCloseTo(0.5);
    expect(inner.totalDuration()).toBeCloseTo(4);
  });

  it("keeps idle content readable and applies from on explicit play", async () => {
    const timeline = createTimeline();
    const tween = createTween({
      from: { opacity: 0 },
      to: { opacity: 1 },
      duration: 1,
    });
    tween.style.opacity = "1";
    timeline.append(tween);
    document.body.append(timeline);
    await flushComposition();

    expect(tween.style.opacity).toBe("1");
    const run = timeline.play();
    expect(tween.style.opacity).toBe("0");
    await vi.waitFor(() => {
      expect(timeline.playState).toBe("running");
    });
    timeline.finish();
    await run;
    expect(timeline.playState).toBe("finished");
    expect(tween.style.opacity).toBe("1");
  });

  it("records empty play intent and starts when a tween is added", async () => {
    const timeline = createTimeline();
    document.body.append(timeline);
    await flushComposition();
    const run = timeline.play();
    let settled = false;
    void run.then(() => { settled = true; });

    const tween = createTween({ to: { opacity: 0.5 }, duration: 1 });
    timeline.append(tween);
    await flushComposition();

    expect(settled).toBe(false);
    await vi.waitFor(() => {
      expect(timeline.playState).toBe("running");
    });
    timeline.finish();
    await run;
    expect(settled).toBe(true);
  });

  it("settles cancellation once and emits the semantic state", async () => {
    const timeline = createTimeline();
    timeline.append(createTween({ to: { x: 10 }, duration: 1 }));
    document.body.append(timeline);
    await flushComposition();
    const details: string[] = [];
    timeline.addEventListener("motion-cancel", (event) => {
      details.push((event as CustomEvent).detail.playState);
    });
    const run = timeline.play();

    timeline.cancel();
    await run;

    expect(timeline.playState).toBe("idle");
    expect(details).toEqual(["idle"]);
  });

  it("appends a new batch after completion without replaying old targets", async () => {
    const timeline = createTimeline();
    const first = createTween({ to: { x: 10 }, duration: 0.1 });
    timeline.append(first);
    document.body.append(timeline);
    await flushComposition();
    timeline.play();
    timeline.finish();
    const priorDuration = timeline.totalDuration();

    const second = createTween({
      from: { opacity: 0 },
      to: { opacity: 1 },
      duration: 0.2,
    });
    timeline.append(second);
    await flushComposition();

    expect(timeline.playState).toBe("running");
    expect(second.style.opacity).toBe("0");
    expect(timeline.totalDuration()).toBeCloseTo(priorDuration + 0.2);
    timeline.finish();
    await timeline.finished;
  });

  it("does not create a pending promise when play is called at the forward endpoint", async () => {
    const timeline = createTimeline();
    const tween = createTween({
      from: { opacity: 0 },
      to: { opacity: 1 },
      duration: 0.1,
    });
    timeline.append(tween);
    document.body.append(timeline);
    await flushComposition();
    timeline.play();
    timeline.finish();
    await timeline.finished;
    expect(tween.style.opacity).toBe("1");

    const endpointPromise = timeline.play();

    expect(tween.style.opacity).toBe("1");
    await expect(endpointPromise).resolves.toBeUndefined();
    expect(timeline.playState).toBe("finished");
  });

  it("can play forward again after reverse reaches the start", async () => {
    const timeline = createTimeline();
    timeline.append(createTween({
      from: { x: 0 },
      to: { x: 100 },
      duration: 0.2,
    }));
    document.body.append(timeline);
    await flushComposition();
    timeline.play();
    timeline.finish();
    await timeline.finished;

    const reverseRun = timeline.reverse();
    await reverseRun;

    const replay = timeline.play();

    expect(replay).not.toBe(reverseRun);
    await vi.waitFor(() => expect(timeline.playState).toBe("running"));
    timeline.finish();
    await replay;
    expect(timeline.playState).toBe("finished");
  });

  it("defers active tween changes until restart", async () => {
    const timeline = createTimeline();
    const tween = createTween({ to: { x: 10 }, duration: 1 });
    timeline.append(tween);
    document.body.append(timeline);
    await flushComposition();
    timeline.play();

    tween.options = { to: { x: 20 }, duration: 2 };
    await flushComposition();
    expect(timeline.totalDuration()).toBeCloseTo(1);

    timeline.restart();
    expect(timeline.totalDuration()).toBeCloseTo(2);
    timeline.cancel();
  });

  it("forces active changes through refresh and keeps playback intent", async () => {
    const timeline = createTimeline();
    const tween = createTween({ to: { x: 10 }, duration: 1 });
    timeline.append(tween);
    document.body.append(timeline);
    await flushComposition();
    timeline.play();
    tween.options = { to: { x: 20 }, duration: 0.25 };

    timeline.refresh();

    expect(timeline.totalDuration()).toBeCloseTo(0.25);
    await vi.waitFor(() => expect(timeline.playState).toBe("running"));
    timeline.cancel();
  });

  it("rejects manual progress methods while ScrollTrigger owns progress", async () => {
    installFakeScrollTrigger(gsap);
    const timeline = createTimeline();
    timeline.options = {
      scrollTrigger: { trigger: document.body, scrub: true },
    };
    timeline.append(createTween({ to: { x: 10 }, duration: 1 }));
    document.body.append(timeline);
    await flushComposition();

    for (const invoke of [
      () => timeline.play(),
      () => timeline.pause(),
      () => timeline.reverse(),
      () => timeline.restart(),
      () => timeline.finish(),
    ]) {
      expect(invoke).toThrowError(expect.objectContaining({
        name: "InvalidStateError",
      }));
    }

    expect(() => timeline.totalDuration()).not.toThrow();
    expect(() => timeline.refresh()).not.toThrow();
    expect(() => timeline.cancel()).not.toThrow();
  });

  it("creates one promise and event pair per scroll endpoint traversal", async () => {
    installFakeScrollTrigger(gsap);
    const timeline = createTimeline();
    timeline.options = {
      scrollTrigger: { trigger: document.body, scrub: true },
    };
    timeline.append(createTween({
      from: { x: 0 },
      to: { x: 100 },
      duration: 1,
    }));
    const events: string[] = [];
    let traversal: Promise<void> | undefined;
    timeline.addEventListener("motion-start", () => {
      events.push(`start:${timeline.playState}`);
      traversal = timeline.finished;
    });
    timeline.addEventListener("motion-finish", () => {
      events.push(`finish:${timeline.playState}`);
    });
    document.body.append(timeline);
    await flushComposition();

    const trigger = FakeScrollTrigger.instances[0]!;
    trigger.setProgress(0.2);
    const forwardTraversal = traversal;
    trigger.setProgress(0.7);
    trigger.setProgress(0.4);
    expect(timeline.finished).toBe(forwardTraversal);
    trigger.setProgress(1);
    await forwardTraversal;

    trigger.setProgress(0.8);
    const reverseTraversal = traversal;
    expect(reverseTraversal).not.toBe(forwardTraversal);
    trigger.setProgress(0);
    await reverseTraversal;

    expect(events).toEqual([
      "start:running",
      "finish:finished",
      "start:running",
      "finish:finished",
    ]);
  });

  it("rebuilds scroll mutations once while preserving progress", async () => {
    installFakeScrollTrigger(gsap);
    const timeline = createTimeline();
    const tween = createTween({ to: { x: 10 }, duration: 1 });
    timeline.options = {
      scrollTrigger: { trigger: document.body, scrub: true },
    };
    timeline.append(tween);
    document.body.append(timeline);
    await flushComposition();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const initialBuildCount = FakeScrollTrigger.instances.length;
    const original = FakeScrollTrigger.instances.at(-1)!;
    original.setProgress(0.4);
    const traversal = timeline.finished;
    tween.options = { to: { x: 20 }, duration: 2 };
    tween.options = { to: { x: 30 }, duration: 3 };
    await flushComposition();

    expect(FakeScrollTrigger.instances).toHaveLength(initialBuildCount + 1);
    expect(original.kill).toHaveBeenCalledWith(true);
    const replacement = FakeScrollTrigger.instances.at(-1)!;
    expect(replacement.animation.totalProgress()).toBeCloseTo(0.4);
    expect(timeline.totalDuration()).toBeCloseTo(3);
    expect(timeline.playState).toBe("running");

    replacement.setProgress(1);
    await traversal;
    expect(timeline.playState).toBe("finished");
  });

  it("retries missing plugin setup on refresh", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const timeline = createTimeline();
    timeline.options = {
      scrollTrigger: { trigger: document.body, scrub: true },
    };
    timeline.append(createTween({
      from: { opacity: 0 },
      to: { opacity: 1 },
    }));
    document.body.append(timeline);
    await flushComposition();

    expect(timeline.playState).toBe("idle");
    expect(FakeScrollTrigger.instances).toHaveLength(0);
    expect(warning).toHaveBeenCalledTimes(1);

    installFakeScrollTrigger(gsap);
    timeline.refresh();

    expect(FakeScrollTrigger.instances).toHaveLength(1);
  });

  it("uses final presentation without lifecycle events in reduced motion", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true }) as MediaQueryList),
    );
    installFakeScrollTrigger(gsap);
    const timeline = createTimeline();
    const tween = createTween({
      from: { opacity: 0 },
      to: { opacity: 0.6 },
    });
    timeline.options = {
      scrollTrigger: { trigger: document.body, pin: true },
    };
    const events: string[] = [];
    timeline.addEventListener("motion-start", () => events.push("start"));
    timeline.addEventListener("motion-finish", () => events.push("finish"));
    timeline.append(tween);
    document.body.append(timeline);
    await flushComposition();

    expect(FakeScrollTrigger.instances).toHaveLength(0);
    expect(tween.style.opacity).toBe("0.6");
    expect(timeline.playState).toBe("finished");
    await expect(timeline.finished).resolves.toBeUndefined();
    expect(events).toEqual([]);
  });
});
