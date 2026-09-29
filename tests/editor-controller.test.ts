// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorController } from "../src/devtools/editor-controller";
import { DEFAULT_FINITE_TIMELINE_DURATION } from "../src/devtools/editor-time";
import { createTimelineRegistry } from "../src/devtools/timeline-registry";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function directTimeline(id: string) {
  const root = document.createElement("section");
  const target = document.createElement("div");
  root.append(target);
  const timeline = gsap.timeline({ paused: true });
  timeline.to(target, { x: 40, duration: 1 });
  return { id, label: id, root, timeline };
}

describe("headless editor controller", () => {
  it("follows late registrations, switches the active timeline, and falls back on removal", () => {
    const registry = createTimelineRegistry();
    const editor = createEditorController({ registry });
    const states: Array<string | undefined> = [];
    const unsubscribe = editor.subscribe((snapshot) => states.push(snapshot.activeTimelineId));
    expect(editor.getSnapshot().activeTimelineId).toBeUndefined();
    expect(editor.getSnapshot().view.status).toBe("empty");

    const first = registry.register(directTimeline("first"));
    const second = registry.register(directTimeline("second"));
    expect(editor.getSnapshot().activeTimelineId).toBe("first");
    expect(editor.getSnapshot().view.timelines.map(({ id }) => id)).toEqual(["first", "second"]);
    expect(editor.selectTimeline("second")).toBe(true);
    expect(editor.getSnapshot().previewRoot).toBe(second.root);
    expect(editor.selectTimeline("missing")).toBe(false);

    second.destroy();
    expect(editor.getSnapshot().activeTimelineId).toBe("first");
    expect(editor.getSnapshot().inspection?.items).toHaveLength(1);
    first.destroy();
    expect(editor.getSnapshot().activeTimelineId).toBeUndefined();
    expect(states).toContain("second");

    unsubscribe();
    editor.destroy();
    registry.destroy();
  });

  it("gates transport, selects tracks, and detaches on destroy", () => {
    const registry = createTimelineRegistry();
    const { root, timeline } = directTimeline("manual");
    const registration = registry.register({ id: "manual", root, timeline });
    const editor = createEditorController({ registry });
    expect(editor.selectItem(0)).toBe(true);
    expect(editor.getSnapshot().selectedItem?.source).toBe(root.firstElementChild);
    expect(editor.getSnapshot().view.tracks[0]).toMatchObject({
      key: "animation:0",
      selected: true,
      spans: [{ start: 0, end: 1 / DEFAULT_FINITE_TIMELINE_DURATION }],
    });
    expect(editor.getSnapshot().timeWindow?.duration).toBe(DEFAULT_FINITE_TIMELINE_DURATION);
    expect(editor.getSnapshot().view.inspector).toEqual({
      trackKey: "animation:0",
      label: "div",
      mapping: "automatic",
      start: 0,
      duration: 1,
      end: 1,
      ease: undefined,
      mixedEase: false,
      animatedTargetCount: 1,
      visualTargetCount: 1,
      properties: ["x"],
    });
    expect(Object.isFrozen(editor.getSnapshot().view.inspector)).toBe(true);
    expect(editor.getSnapshot().view.transport.canSeek).toBe(true);
    expect(editor.selectTrack("animation:0")).toBe(true);
    expect(editor.selectTrack("animation:missing")).toBe(false);
    expect(editor.clearTrackSelection()).toBe(true);
    expect(editor.getSnapshot().view.selectedTrackKey).toBeUndefined();
    expect(editor.getSnapshot().view.inspector).toBeUndefined();
    expect(editor.clearTrackSelection()).toBe(false);
    expect(editor.selectTrack("animation:0")).toBe(true);
    expect(editor.seek(0.5 / DEFAULT_FINITE_TIMELINE_DURATION)).toBe(true);
    expect(timeline.totalProgress()).toBeCloseTo(0.5);
    expect(editor.seek(Number.NaN)).toBe(false);
    expect(editor.setTimeScale(2)).toBe(true);
    expect(timeline.timeScale()).toBe(2);
    expect(editor.play()).toBe(true);
    expect(timeline.paused()).toBe(false);
    expect(editor.getSnapshot().view.transport.canPause).toBe(true);
    expect(editor.seek(0.75 / DEFAULT_FINITE_TIMELINE_DURATION)).toBe(true);
    expect(timeline.totalProgress()).toBeCloseTo(0.75);
    expect(timeline.paused()).toBe(false);
    expect(editor.pause()).toBe(true);
    expect(timeline.paused()).toBe(true);
    expect(editor.replay()).toBe(true);
    expect(timeline.totalProgress()).toBe(0);
    expect(editor.seek(0.25 / DEFAULT_FINITE_TIMELINE_DURATION)).toBe(true);

    const notifications = vi.fn();
    editor.subscribe(notifications);
    editor.destroy();
    const count = notifications.mock.calls.length;
    expect(editor.play()).toBe(false);
    expect(editor.seek(0.2)).toBe(false);
    registration.replay();
    expect(notifications).toHaveBeenCalledTimes(count);
    expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalled();
    registry.destroy();
  });

  it("changes playback direction in place and loops across both boundaries", () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    }));
    const registry = createTimelineRegistry();
    const { root, timeline } = directTimeline("direction");
    const registration = registry.register({ id: "direction", root, timeline });
    const editor = createEditorController({ registry });

    expect(editor.setReversed(true)).toBe(true);
    expect(editor.getSnapshot().view.transport.reversed).toBe(true);
    expect(editor.getSnapshot().view.transport.timeScale).toBe(1);
    expect(timeline.totalProgress()).toBe(0);
    expect(editor.play()).toBe(true);
    expect(timeline.totalProgress()).toBe(1);
    expect(timeline.reversed()).toBe(true);
    expect(timeline.paused()).toBe(false);

    timeline.totalProgress(0.5, true);
    expect(editor.setReversed(false)).toBe(true);
    expect(timeline.totalProgress()).toBeCloseTo(0.5);
    expect(timeline.reversed()).toBe(false);
    expect(timeline.paused()).toBe(false);

    expect(editor.setLooping(true)).toBe(true);
    expect(editor.getSnapshot().view.transport.looping).toBe(true);
    timeline.totalProgress(1, true).pause();
    frame?.(16);
    expect(timeline.totalProgress()).toBe(0);
    expect(timeline.paused()).toBe(false);

    expect(editor.setReversed(true)).toBe(true);
    expect(editor.setTimeScale(0.5)).toBe(true);
    expect(editor.getSnapshot().view.transport.reversed).toBe(true);
    expect(editor.getSnapshot().view.transport.timeScale).toBe(0.5);
    timeline.totalProgress(0, true).pause();
    frame?.(32);
    expect(timeline.totalProgress()).toBe(1);
    expect(timeline.reversed()).toBe(true);
    expect(timeline.paused()).toBe(false);

    editor.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("keeps playback running when reverse is toggled at the forward start boundary", () => {
    const registry = createTimelineRegistry();
    const { root, timeline } = directTimeline("reverse-at-start");
    const registration = registry.register({ id: "reverse-at-start", root, timeline });
    const editor = createEditorController({ registry });

    expect(editor.play()).toBe(true);
    expect(editor.getSnapshot().view.time?.progress).toBe(0);
    expect(editor.getSnapshot().view.transport.canPause).toBe(true);

    expect(editor.setReversed(true)).toBe(true);
    expect(timeline.totalProgress()).toBe(1);
    expect(timeline.reversed()).toBe(true);
    expect(timeline.paused()).toBe(false);
    expect(editor.getSnapshot().view.transport.canPause).toBe(true);
    expect(editor.getSnapshot().view.transport.canPlay).toBe(false);

    editor.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("reports reverse completion at zero as idle when looping is off", () => {
    const registry = createTimelineRegistry();
    const { root, timeline } = directTimeline("reverse-complete");
    const registration = registry.register({ id: "reverse-complete", root, timeline });
    const editor = createEditorController({ registry });

    expect(editor.setReversed(true)).toBe(true);
    expect(editor.play()).toBe(true);
    timeline.totalProgress(0, true);
    expect(timeline.paused()).toBe(false);
    expect(timeline.isActive()).toBe(false);
    expect(editor.setTimeScale(1)).toBe(true);

    expect(editor.getSnapshot().inspection?.playState).toBe("idle");
    expect(editor.getSnapshot().view.transport.canPlay).toBe(true);
    expect(editor.getSnapshot().view.transport.canPause).toBe(false);

    editor.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("distinguishes duplicate automatic tracks and deduplicates animated properties", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("section");
    const lead = document.createElement("article");
    const supporting = document.createElement("article");
    const named = document.createElement("article");
    lead.className = "is-active story lead";
    supporting.className = "u-hidden supporting-story";
    named.className = "story named";
    named.dataset.label = "Named story";
    root.append(lead, supporting, named);
    const timeline = gsap.timeline({ paused: true });
    timeline.to(lead, { opacity: 0.5, y: 20, duration: 1 });
    timeline.to(supporting, { y: 40, opacity: 0.25, duration: 1 });
    timeline.to(named, { opacity: 1, duration: 1 });
    registry.register({ id: "duplicate-automatic", root, timeline });
    const editor = createEditorController({ registry });

    expect(editor.getSnapshot().view.tracks.map(({ label, fullLabel }) => ({
      label,
      fullLabel,
    }))).toEqual([
      { label: "article.story", fullLabel: "article.is-active.story.lead" },
      { label: "article.supporting-story", fullLabel: "article.u-hidden.supporting-story" },
      { label: "Named story", fullLabel: "Named story" },
    ]);
    expect(editor.selectItem(0)).toBe(true);
    expect(editor.getSnapshot().view.inspector?.properties).toEqual(["opacity", "y"]);

    editor.destroy();
    registry.destroy();
  });

  it("collects properties and preserves unequal target counts across an authored group", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("section");
    const first = document.createElement("article");
    const second = document.createElement("article");
    root.append(first, second);
    const timeline = gsap.timeline({ paused: true });
    timeline.to(first, { opacity: 0.5, y: 20, duration: 1 });
    timeline.to(second, { y: 40, opacity: 0.25, duration: 1 });
    const animations = timeline.getChildren(false, true, false) as gsap.core.Tween[];
    registry.register({
      id: "grouped-properties",
      root,
      timeline,
      tracks: [{
        id: "stories",
        animations,
        targets: first,
      }],
    });
    const editor = createEditorController({ registry });

    expect(editor.selectTrack("track:stories")).toBe(true);
    expect(editor.getSnapshot().view.inspector).toMatchObject({
      animatedTargetCount: 2,
      visualTargetCount: 1,
      properties: ["opacity", "y"],
    });

    editor.destroy();
    registry.destroy();
  });

  it("keeps playback paused when seeking from a finished timeline", () => {
    const registry = createTimelineRegistry();
    const { root, timeline } = directTimeline("finished-selection");
    registry.register({ id: "finished-selection", root, timeline });
    const editor = createEditorController({ registry });

    expect(editor.play()).toBe(true);
    expect(editor.seek(1)).toBe(true);
    expect(editor.getSnapshot().inspection?.playState).toBe("finished");
    expect(timeline.paused()).toBe(false);

    expect(editor.seek(0.4 / DEFAULT_FINITE_TIMELINE_DURATION)).toBe(true);
    expect(timeline.paused()).toBe(true);
    expect(timeline.totalProgress()).toBeCloseTo(0.4);
    expect(editor.getSnapshot().inspection?.playState).toBe("paused");

    editor.destroy();
    registry.destroy();
  });

  it("clamps the editor cursor to the authored animation duration", () => {
    const registry = createTimelineRegistry();
    const { root, timeline } = directTimeline("empty-time");
    registry.register({ id: "empty-time", root, timeline });
    const editor = createEditorController({ registry });

    expect(editor.seek(8.94 / DEFAULT_FINITE_TIMELINE_DURATION)).toBe(true);
    expect(timeline.totalTime()).toBe(1);
    expect(editor.getSnapshot().view.time).toMatchObject({
      duration: DEFAULT_FINITE_TIMELINE_DURATION,
      time: 1,
      progress: 1 / DEFAULT_FINITE_TIMELINE_DURATION,
    });

    editor.destroy();
    registry.destroy();
  });

  it("preserves an authored track selection when replay replaces tweens", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("section");
    let disposed = 0;
    const registration = registry.register({
      id: "rebuild",
      root,
      create() {
        const target = document.createElement("span");
        root.replaceChildren(target);
        const timeline = gsap.timeline({ paused: true });
        const tween = gsap.to(target, { x: 100, duration: 1, paused: true });
        timeline.add(tween);
        return {
          timeline,
          tracks: [{ id: "title", animation: tween, targets: target }],
          dispose() { disposed += 1; timeline.kill(); },
        };
      },
    });
    const editor = createEditorController({ registry });
    const replayAvailability: boolean[] = [];
    editor.subscribe((snapshot) => replayAvailability.push(snapshot.view.transport.canReplay));
    expect(editor.selectItem(0)).toBe(true);
    const before = editor.getSnapshot().selectedItem;
    expect(before?.trackId).toBe("title");
    expect(editor.getSnapshot().view.selectedTrackKey).toBe("track:title");
    expect(editor.getSnapshot().view.inspector).toMatchObject({
      trackKey: "track:title",
      label: "title",
      mapping: "authored",
      start: 0,
      duration: 1,
      end: 1,
      animatedTargetCount: 1,
      visualTargetCount: 1,
    });
    expect(editor.replay()).toBe(true);
    expect(replayAvailability).toContain(false);
    const after = editor.getSnapshot().selectedItem;
    expect(after?.trackId).toBe("title");
    expect(after?.animation).not.toBe(before?.animation);
    expect(after?.source).not.toBe(before?.source);
    expect(editor.getSnapshot().view.selectedTrackKey).toBe("track:title");
    expect(disposed).toBe(1);
    editor.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("preserves an automatic track selection through replay and play from finished", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("section");
    const target = document.createElement("span");
    root.append(target);
    const registration = registry.register({
      id: "automatic-rebuild",
      root,
      create() {
        const timeline = gsap.timeline({ paused: true });
        timeline.to(target, { x: 100, duration: 1 });
        return { timeline, dispose: () => timeline.kill() };
      },
    });
    const editor = createEditorController({ registry });

    expect(editor.selectTrack("animation:0")).toBe(true);
    expect(editor.getSnapshot().view.inspector?.trackKey).toBe("animation:0");
    expect(editor.setReversed(true)).toBe(true);
    expect(editor.setTimeScale(0.5)).toBe(true);
    expect(editor.replay()).toBe(true);
    expect(editor.getSnapshot().view.inspector?.trackKey).toBe("animation:0");
    expect(editor.getSnapshot().view.transport.reversed).toBe(true);
    expect(editor.getSnapshot().view.transport.timeScale).toBe(0.5);
    expect(Math.abs(registration.timeline.timeScale())).toBe(0.5);

    expect(editor.setReversed(false)).toBe(true);

    expect(editor.play()).toBe(true);
    expect(editor.seek(1)).toBe(true);
    expect(editor.getSnapshot().inspection?.playState).toBe("finished");
    expect(editor.play()).toBe(true);
    expect(editor.getSnapshot().view.inspector?.trackKey).toBe("animation:0");
    expect(editor.getSnapshot().inspection?.playState).toBe("running");

    editor.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("retries a failed factory without disposing the old runtime twice", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("section");
    let attempts = 0;
    let disposed = 0;
    const registration = registry.register({
      id: "broken",
      root,
      create() {
        attempts += 1;
        if (attempts === 2) throw new Error("factory failed");
        const timeline = gsap.timeline({ paused: true });
        timeline.to(root, { x: 10, duration: 1 });
        return { timeline, dispose() { disposed += 1; timeline.kill(); } };
      },
    });
    const editor = createEditorController({ registry });
    expect(editor.setReversed(true)).toBe(true);
    expect(editor.replay()).toBe(false);
    expect(editor.getSnapshot().error).toBeInstanceOf(Error);
    expect(editor.getSnapshot().inspection).toBeUndefined();
    expect(editor.getSnapshot().replayState).toBe("retryable");
    expect(editor.getSnapshot().view.status).toBe("retryable");
    expect(editor.getSnapshot().view.transport.canRetryReplay).toBe(true);
    expect(editor.getSnapshot().view.transport.canPlay).toBe(false);
    expect(disposed).toBe(1);
    expect(() => registration.timeline).toThrow(/no live runtime/i);
    expect(editor.replay()).toBe(true);
    expect(editor.getSnapshot().error).toBeUndefined();
    expect(editor.getSnapshot().replayState).toBe("ready");
    expect(editor.getSnapshot().view.status).toBe("ready");
    expect(editor.getSnapshot().view.transport.canRetryReplay).toBe(false);
    expect(editor.getSnapshot().view.transport.reversed).toBe(true);
    expect(editor.getSnapshot().inspection?.readiness).toBe("ready");
    expect(attempts).toBe(3);
    expect(disposed).toBe(1);
    editor.destroy();
    registry.destroy();
    expect(disposed).toBe(2);
  });

  it.each(["dispose", "reset"] as const)(
    "blocks retry after an unsafe %s failure",
    (stage) => {
      const registry = createTimelineRegistry();
      let created = 0;
      let disposed = 0;
      let reset = 0;
      const registration = registry.register({
        id: `unsafe-${stage}`,
        root: document.createElement("section"),
        reset() {
          reset += 1;
          if (stage === "reset") throw new Error("reset failed");
        },
        create() {
          created += 1;
          const timeline = gsap.timeline({ paused: true });
          timeline.to({}, { x: 10, duration: 1 });
          return {
            timeline,
            dispose() {
              disposed += 1;
              timeline.kill();
              if (stage === "dispose") throw new Error("dispose failed");
            },
          };
        },
      });
      const editor = createEditorController({ registry });
      expect(editor.replay()).toBe(false);
      expect(editor.getSnapshot().replayState).toBe("blocked");
      expect(editor.getSnapshot().view.status).toBe("blocked");
      expect(editor.getSnapshot().view.transport.canRetryReplay).toBe(false);
      expect(editor.getSnapshot().inspection).toBeUndefined();
      expect(editor.replay()).toBe(false);
      expect(created).toBe(1);
      expect(reset).toBe(stage === "reset" ? 1 : 0);
      expect(disposed).toBe(1);
      editor.destroy();
      registration.destroy();
      registry.destroy();
      expect(disposed).toBe(1);
    },
  );

  it("blocks retry when an invalid replacement also fails cleanup", () => {
    const registry = createTimelineRegistry();
    let attempts = 0;
    let disposed = 0;
    const root = document.createElement("section");
    const registration = registry.register({
      id: "invalid-cleanup",
      root,
      create() {
        attempts += 1;
        const timeline = gsap.timeline({ paused: true });
        timeline.to(root, { x: 10, duration: 1 });
        const unrelated = gsap.to({}, { x: 20, duration: 1, paused: true });
        return {
          timeline,
          tracks: attempts === 1 ? [] : [{ id: "invalid", animation: unrelated, targets: root }],
          dispose() {
            disposed += 1;
            unrelated.kill();
            timeline.kill();
            if (attempts === 2) throw new Error("cleanup failed");
          },
        };
      },
    });
    const editor = createEditorController({ registry });
    expect(editor.replay()).toBe(false);
    expect(editor.getSnapshot().replayState).toBe("blocked");
    expect(editor.getSnapshot().error).toBeInstanceOf(Error);
    expect(editor.replay()).toBe(false);
    expect(attempts).toBe(2);
    expect(disposed).toBe(2);
    editor.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("disposes a replacement that fails activation before blocking retry", () => {
    const registry = createTimelineRegistry();
    let attempts = 0;
    let disposed = 0;
    const registration = registry.register({
      id: "activation-failure",
      root: document.createElement("section"),
      create() {
        attempts += 1;
        const timeline = gsap.timeline({ paused: true });
        timeline.to({}, { x: 10, duration: 1 });
        if (attempts === 2) {
          vi.spyOn(timeline, "pause").mockImplementation(() => {
            throw new Error("pause failed");
          });
        }
        return {
          timeline,
          dispose() { disposed += 1; timeline.kill(); },
        };
      },
    });
    const editor = createEditorController({ registry });
    expect(editor.replay()).toBe(false);
    expect(editor.getSnapshot().replayState).toBe("blocked");
    expect(disposed).toBe(2);
    expect(() => registration.timeline).toThrow(/no live runtime/i);
    editor.destroy();
    registration.destroy();
    registry.destroy();
    expect(disposed).toBe(2);
  });

  it("uses one five-second particle cycle as the complete editor domain", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("section");
    const canvas = document.createElement("canvas");
    let renderCount = 0;
    root.append(canvas);
    const registration = registry.register({
      id: "particles",
      root,
      create() {
        const particles = Array.from({ length: 99 }, () => ({ x: 0, scale: 0 }));
        const timeline = gsap.timeline({ paused: true, onUpdate: () => { renderCount += 1; } }).fromTo(
          particles,
          { x: 100, scale: 1 },
          { x: 0, scale: 0, duration: 5, stagger: { each: -0.05, repeat: -1 } },
          0,
        );
        const tween = timeline.getChildren(false, true, false)[0] as gsap.core.Tween;
        timeline.seek(99);
        return {
          timeline,
          tracks: [{ id: "particles", animation: tween, targets: canvas }],
          dispose() { timeline.kill(); },
        };
      },
    });
    const editor = createEditorController({ registry });
    const initial = editor.getSnapshot().timeWindow;
    expect(initial?.duration).toBe(DEFAULT_FINITE_TIMELINE_DURATION);
    expect(initial?.start).toBeCloseTo(99);
    expect(initial?.sourceDuration).toBe(5);
    expect(initial?.repeating).toBe(true);
    expect(editor.getSnapshot().view.transport.canLoop).toBe(false);
    expect(editor.setLooping(true)).toBe(false);
    expect(initial?.progress).toBeCloseTo(0);
    expect(initial?.trackTimings[0]).toMatchObject({ start: 0, duration: 5, end: 5 });
    expect(initial?.tracks).toHaveLength(1);
    expect(initial?.tracks.map(({ start, end }) => ({ start, end }))).toEqual([
      { start: 0, end: 5 / 12 },
    ]);
    expect(editor.getSnapshot().view.tracks[0]).toMatchObject({
      key: "track:particles",
      label: "particles",
      animatedTargetCount: 99,
      visualTargetCount: 1,
      spans: [{ start: 0, end: 5 / 12 }],
    });
    expect(editor.selectTrack("track:particles")).toBe(true);
    expect(editor.getSnapshot().view.inspector).toMatchObject({
      start: 0,
      duration: 5,
      end: 5,
    });
    registration.timeline.totalTime(103.999, true);
    expect(editor.setTimeScale(1)).toBe(true);
    expect(editor.getSnapshot().timeWindow?.progress).toBeCloseTo(4.999 / 12);
    expect(
      editor.getSnapshot().timeWindow!.progress * editor.getSnapshot().timeWindow!.duration,
    ).toBeCloseTo(4.999);
    registration.timeline.totalTime(104, true);
    expect(editor.setTimeScale(1)).toBe(true);
    expect(editor.getSnapshot().timeWindow).toMatchObject({ start: 104, progress: 0 });
    const rendersBeforePausedSeek = renderCount;
    expect(editor.seek(2 / 12)).toBe(true);
    expect(registration.timeline.totalTime()).toBeCloseTo(106);
    expect(editor.getSnapshot().timeWindow?.progress).toBeCloseTo(2 / 12);
    expect(registration.timeline.paused()).toBe(true);
    expect(renderCount).toBeGreaterThan(rendersBeforePausedSeek);
    expect(editor.seek(7 / 12)).toBe(true);
    expect(registration.timeline.totalTime()).toBeCloseTo(106);
    expect(editor.getSnapshot().timeWindow?.progress).toBeCloseTo(2 / 12);
    expect(editor.seek(5 / 12)).toBe(true);
    expect(registration.timeline.totalTime()).toBeCloseTo(109);
    expect(editor.getSnapshot().timeWindow?.progress).toBeCloseTo(5 / 12);
    expect(editor.seek(10 / 12)).toBe(true);
    expect(registration.timeline.totalTime()).toBeCloseTo(109);
    expect(editor.getSnapshot().timeWindow?.progress).toBeCloseTo(5 / 12);
    expect(editor.play()).toBe(true);
    registration.timeline.totalTime(109.25, true);
    expect(editor.setTimeScale(1)).toBe(true);
    expect(editor.getSnapshot().timeWindow).toMatchObject({ start: 109 });
    expect(editor.getSnapshot().timeWindow?.progress).toBeCloseTo(0.25 / 12);
    expect(editor.pause()).toBe(true);
    expect(editor.seek(1)).toBe(true);
    expect(registration.timeline.totalTime()).toBeCloseTo(111);
    expect(editor.getSnapshot().timeWindow?.progress).toBeCloseTo(2 / 12);

    expect(editor.replay()).toBe(true);
    expect(registration.timeline.totalTime()).toBeCloseTo(99);
    expect(editor.getSnapshot().timeWindow?.start).toBeCloseTo(99);
    expect(editor.getSnapshot().timeWindow?.progress).toBeCloseTo(0);
    editor.destroy();
    registration.destroy();
    registry.destroy();
  });

  it("uses a parent repeat cycle and declines ambiguous descendant periods", () => {
    const registry = createTimelineRegistry();
    const repeating = directTimeline("repeating");
    repeating.timeline.repeat(-1);
    const registration = registry.register(repeating);
    const editor = createEditorController({ registry });
    expect(editor.getSnapshot().timeWindow?.duration).toBe(DEFAULT_FINITE_TIMELINE_DURATION);
    expect(editor.getSnapshot().view.transport.canLoop).toBe(false);
    expect(editor.setLooping(true)).toBe(false);
    expect(editor.seek(0.5)).toBe(true);
    expect(repeating.timeline.totalTime()).toBeCloseTo(1);
    repeating.timeline.totalTime(1.25);
    expect(editor.seek(0.5)).toBe(true);
    expect(repeating.timeline.totalTime()).toBeCloseTo(2);
    expect(editor.getSnapshot().timeWindow?.tracks).toHaveLength(1);
    editor.destroy();
    registration.destroy();

    const root = document.createElement("section");
    const firstTarget = document.createElement("div");
    const secondTarget = document.createElement("div");
    root.append(firstTarget, secondTarget);
    const timeline = gsap.timeline({ paused: true });
    const first = gsap.to(firstTarget, { x: 1, duration: 2, repeat: -1 });
    const second = gsap.to(secondTarget, { x: 1, duration: 3, repeat: -1 });
    timeline.add(first, 0).add(second, 0);
    const ambiguous = registry.register({
      id: "ambiguous",
      root,
      timeline,
      tracks: [
        { id: "first", animation: first, targets: root },
        { id: "second", animation: second, targets: root },
      ],
    });
    const secondEditor = createEditorController({ registry });
    expect(secondEditor.getSnapshot().timeWindow).toBeUndefined();
    expect(secondEditor.getSnapshot().view.transport.canSeek).toBe(false);
    expect(secondEditor.getSnapshot().view.transport.canLoop).toBe(false);
    expect(secondEditor.seek(0.5)).toBe(false);
    expect(secondEditor.setLooping(true)).toBe(false);
    secondEditor.destroy();
    ambiguous.destroy();
    registry.destroy();
  });
});
