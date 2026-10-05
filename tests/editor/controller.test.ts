// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorController } from "../../src/devtools/editor/controller";
import { DEFAULT_FINITE_TIMELINE_DURATION } from "../../src/devtools/editor/time";
import { createTimelineRegistry } from "../../src/devtools/timeline/registry";

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
      mode: "to",
      propertyDetails: [{
        name: "x",
        from: { kind: "implicit" },
        to: { kind: "literal", value: 40 },
      }],
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
    timeline.to(first, { opacity: 0.5, scale: 1, y: 20, duration: 1 });
    timeline.to(second, { y: 40, scale: 1, opacity: 0.25, duration: 1 });
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
      properties: ["opacity", "scale", "y"],
      mode: "to",
      propertyDetails: [
        {
          name: "opacity",
          from: { kind: "implicit" },
          to: { kind: "mixed" },
        },
        {
          name: "scale",
          from: { kind: "implicit" },
          to: { kind: "literal", value: 1 },
        },
        {
          name: "y",
          from: { kind: "implicit" },
          to: { kind: "mixed" },
        },
      ],
    });

    editor.destroy();
    registry.destroy();
  });

  it("projects authored to, from, and fromTo endpoint semantics", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("section");
    const targets = Array.from({ length: 3 }, () => document.createElement("article"));
    root.append(...targets);
    const timeline = gsap.timeline({ paused: true });
    timeline.to(targets[0]!, { x: 10, duration: 1 });
    timeline.from(targets[1]!, { opacity: 0, duration: 1 });
    timeline.fromTo(targets[2]!, { y: 20 }, { y: 0, duration: 1 });
    registry.register({ id: "directions", root, timeline });
    const editor = createEditorController({ registry });

    expect(editor.selectItem(0)).toBe(true);
    expect(editor.getSnapshot().view.inspector).toMatchObject({
      mode: "to",
      propertyDetails: [{
        name: "x",
        from: { kind: "implicit" },
        to: { kind: "literal", value: 10 },
      }],
    });
    expect(editor.selectItem(1)).toBe(true);
    expect(editor.getSnapshot().view.inspector).toMatchObject({
      mode: "from",
      propertyDetails: [{
        name: "opacity",
        from: { kind: "literal", value: 0 },
        to: { kind: "implicit" },
      }],
    });
    expect(editor.selectItem(2)).toBe(true);
    expect(editor.getSnapshot().view.inspector).toMatchObject({
      mode: "fromTo",
      propertyDetails: [{
        name: "y",
        from: { kind: "literal", value: 20 },
        to: { kind: "literal", value: 0 },
      }],
    });

    editor.destroy();
    registry.destroy();
  });

  it("normalizes grouped missing, dynamic, complex, accessor, and bounded values safely", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("section");
    const first = document.createElement("article");
    const second = document.createElement("article");
    root.append(first, second);
    const timeline = gsap.timeline({ paused: true });
    timeline.to(first, { x: 10, opacity: 0.5, duration: 1 });
    timeline.from(second, { x: 20, y: 30, duration: 1 });
    const animations = timeline.getChildren(false, true, false) as gsap.core.Tween[];
    const getter = vi.fn(() => 100);
    Object.defineProperty(animations[0]!.vars, "accessorValue", {
      configurable: true,
      enumerable: true,
      get: getter,
    });
    animations[0]!.vars.dynamicValue = () => 100;
    animations[0]!.vars.pluginValue = { nested: "not inspected" };
    animations[0]!.vars.longValue = `line\n${"x".repeat(200)}`;
    registry.register({
      id: "safe-values",
      root,
      timeline,
      tracks: [{ id: "safe", animations, targets: [first, second] }],
    });
    const editor = createEditorController({ registry });

    expect(getter).not.toHaveBeenCalled();
    expect(editor.selectTrack("track:safe")).toBe(true);
    const inspector = editor.getSnapshot().view.inspector!;
    expect(getter).not.toHaveBeenCalled();
    expect(inspector.mode).toBe("mixed");
    expect(inspector.propertyDetails.find(({ name }) => name === "x")).toEqual({
      name: "x",
      from: { kind: "mixed" },
      to: { kind: "mixed" },
    });
    expect(inspector.propertyDetails.find(({ name }) => name === "opacity")).toEqual({
      name: "opacity",
      from: { kind: "mixed" },
      to: { kind: "mixed" },
    });
    expect(inspector.propertyDetails.find(({ name }) => name === "accessorValue")).toEqual({
      name: "accessorValue",
      from: { kind: "mixed" },
      to: { kind: "mixed" },
    });

    expect(editor.clearTrackSelection()).toBe(true);
    const isolatedTimeline = gsap.timeline({ paused: true }).to(first, { z: 1, duration: 1 });
    const isolatedTween = isolatedTimeline.getChildren(false, true, false)[0] as gsap.core.Tween;
    Object.defineProperty(isolatedTween.vars, "accessorValue", {
      configurable: true,
      enumerable: true,
      get: getter,
    });
    isolatedTween.vars.dynamicValue = () => 100;
    isolatedTween.vars.pluginValue = { nested: "not inspected" };
    isolatedTween.vars.longValue = `line\n${"x".repeat(200)}`;
    const isolatedRegistration = registry.register({
      id: "isolated-safe-values",
      root,
      timeline: isolatedTimeline,
    });
    expect(editor.selectTimeline("isolated-safe-values")).toBe(true);
    expect(editor.selectItem(0)).toBe(true);
    const isolated = editor.getSnapshot().view.inspector!;
    expect(getter).not.toHaveBeenCalled();
    expect(isolated.propertyDetails.find(({ name }) => name === "accessorValue")?.to)
      .toEqual({ kind: "dynamic" });
    expect(isolated.propertyDetails.find(({ name }) => name === "dynamicValue")?.to)
      .toEqual({ kind: "dynamic" });
    expect(isolated.propertyDetails.find(({ name }) => name === "pluginValue")?.to)
      .toEqual({ kind: "complex" });
    const bounded = isolated.propertyDetails.find(({ name }) => name === "longValue")?.to;
    expect(bounded).toMatchObject({ kind: "literal", truncated: true });
    expect(bounded?.kind === "literal" && typeof bounded.value === "string"
      ? bounded.value.length
      : 0).toBe(160);
    expect(bounded?.kind === "literal" ? bounded.value : "").not.toContain("\n");
    expect(Object.isFrozen(isolated.propertyDetails)).toBe(true);
    expect(isolated.propertyDetails.every((property) => (
      Object.isFrozen(property) && Object.isFrozen(property.from) && Object.isFrozen(property.to)
    ))).toBe(true);

    editor.destroy();
    isolatedRegistration.destroy();
    registry.destroy();
  });

  it.each([undefined, null])("treats an empty startAt (%s) as a to tween", (startAt) => {
    const registry = createTimelineRegistry();
    const fixture = directTimeline("empty-start-at");
    const tween = fixture.timeline.getChildren(false, true, false)[0]!;
    Object.defineProperty(tween.vars, "startAt", { configurable: true, value: startAt });
    registry.register(fixture);
    const editor = createEditorController({ registry });
    try {
      expect(editor.selectItem(0)).toBe(true);
      expect(editor.getSnapshot().view.inspector).toMatchObject({
        mode: "to",
        propertyDetails: [{
          name: "x",
          from: { kind: "implicit" },
          to: { kind: "literal", value: 40 },
        }],
      });
    } finally {
      editor.destroy();
      registry.destroy();
      fixture.timeline.kill();
    }
  });

  it("never reads a startAt getter during attach, selection, or frame sampling", () => {
    let sample: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      sample = callback;
      return 1;
    }));
    const registry = createTimelineRegistry();
    const fixture = directTimeline("accessor-start-at");
    const tween = fixture.timeline.getChildren(false, true, false)[0]!;
    const getter = vi.fn(() => { throw new Error("startAt getter must not execute"); });
    Object.defineProperty(tween.vars, "startAt", {
      configurable: true, enumerable: true, get: getter,
    });
    registry.register(fixture);
    const editor = createEditorController({ registry });
    try {
      expect(getter).not.toHaveBeenCalled();
      expect(editor.selectItem(0)).toBe(true);
      expect(editor.getSnapshot().view.inspector).toMatchObject({
        mode: "fromTo",
        propertyDetails: [{ name: "x", from: { kind: "dynamic" }, to: { kind: "literal", value: 40 } }],
      });
      expect(sample).toBeTypeOf("function");
      sample!(0);
      editor.clearTrackSelection();
      sample!(16);
      expect(getter).not.toHaveBeenCalled();
      expect(editor.getSnapshot().view.inspector).toBeUndefined();
    } finally {
      editor.destroy();
      registry.destroy();
      delete tween.vars.startAt;
      fixture.timeline.kill();
    }
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

  it("selects multiple ScrollTriggers independently and seeks only scrubbed ranges", () => {
    const registry = createTimelineRegistry();
    const first = directTimeline("first-scroll");
    const firstTriggerElement = document.createElement("section");
    firstTriggerElement.id = "first-trigger";
    let firstScroll = 100;
    const firstTrigger = {
      start: 100,
      end: 300,
      progress: 0,
      direction: 1,
      trigger: firstTriggerElement,
      scroller: window,
      vars: { id: "Pinned hero", scrub: 0.5 },
      scroll(position?: number) {
        if (position === undefined) return firstScroll;
        firstScroll = position;
      },
      update() {
        this.progress = (firstScroll - this.start) / (this.end - this.start);
      },
    };
    Object.defineProperty(first.timeline, "scrollTrigger", { value: firstTrigger });

    const second = directTimeline("second-scroll");
    const secondTriggerElement = document.createElement("article");
    secondTriggerElement.className = "chapter";
    let secondScroll = 0;
    Object.defineProperty(second.timeline, "scrollTrigger", {
      value: {
        start: 0,
        end: 400,
        progress: 0,
        direction: 0,
        trigger: secondTriggerElement,
        scroller: window,
        vars: { scrub: false },
        scroll(position?: number) {
          if (position === undefined) return secondScroll;
          secondScroll = position;
        },
      },
    });

    const firstRegistration = registry.register(first);
    const secondRegistration = registry.register(second);
    const editor = createEditorController({ registry });
    expect(editor.getSnapshot().view.timelines).toEqual([
      { id: "first-scroll", label: "Pinned hero" },
      { id: "second-scroll", label: "article.chapter" },
    ]);
    expect(editor.getSnapshot().inspection?.driver).toBe("scroll");
    expect(editor.getSnapshot().view.transport).toMatchObject({
      canSeek: true,
      canPlay: false,
      canSetTimeScale: false,
    });
    expect(editor.seek(0.5)).toBe(true);
    expect(firstScroll).toBe(200);
    expect(editor.getSnapshot().view.scrollTrigger).toMatchObject({
      progress: 0.5,
      animationProgress: 0,
    });

    expect(editor.selectTimeline("second-scroll")).toBe(true);
    expect(editor.getSnapshot().inspection?.driver).toBe("manual");
    expect(editor.getSnapshot().view.transport.canPlay).toBe(true);
    expect(editor.seek(0.5 / DEFAULT_FINITE_TIMELINE_DURATION)).toBe(true);
    expect(second.timeline.totalProgress()).toBeCloseTo(0.5);
    expect(secondScroll).toBe(0);

    editor.destroy();
    firstRegistration.destroy();
    secondRegistration.destroy();
    registry.destroy();
  });

  it("shows authored markers for a trigger-action timeline only after selection", () => {
    const registry = createTimelineRegistry();
    const marked = directTimeline("marked-scroll");
    const markerId = "Marked scroll";
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
    markerStart.style.setProperty(
      "--rf-marker-inline-end",
      "12px",
      "important",
    );
    scrollerEnd.style.setProperty(
      "--rf-marker-scroller-width",
      "99px",
      "important",
    );
    const markers = [markerStart, markerEnd, scrollerStart, scrollerEnd];
    const triggerElement = document.createElement("section");
    const scrollIntoView = vi.fn();
    triggerElement.scrollIntoView = scrollIntoView;
    const authoredMarkers = true;
    const markedTrigger = {
      start: 100,
      end: 500,
      progress: 0,
      direction: 0,
      trigger: triggerElement,
      markerStart,
      markerEnd,
      scroller: window,
      vars: { id: markerId, scrub: false, markers: authoredMarkers },
      scroll: () => 100,
    };
    Object.defineProperty(marked.timeline, "scrollTrigger", {
      value: markedTrigger,
    });
    const markedRegistration = registry.register(marked);
    const standard = directTimeline("standard");
    const standardScrollIntoView = vi.fn();
    standard.root.scrollIntoView = standardScrollIntoView;
    const standardRegistration = registry.register(standard);
    const editor = createEditorController({ registry });

    expect(markers.every((node) => node.hasAttribute(
      "data-rf-marker-hidden",
    ))).toBe(true);
    expect(editor.selectTimeline("marked-scroll")).toBe(true);
    expect(editor.getSnapshot().view.transport).toMatchObject({
      canJumpToScrollTriggerTarget: true,
      canToggleScrollTriggerMarkers: true,
      scrollTriggerMarkersVisible: true,
    });
    expect(editor.jumpToScrollTriggerTarget()).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
      behavior: "auto",
    });
    expect(markers.every((node) => !node.hasAttribute(
      "data-rf-marker-hidden",
    ))).toBe(true);
    expect(markers.every((node) => node.hasAttribute(
      "data-rf-marker-selected",
    ))).toBe(true);
    expect(markers.map((node) => node.textContent)).toEqual([
      "start",
      "end",
      "scroller start",
      "scroller end",
    ]);
    expect(markerStart.style.getPropertyValue(
      "--rf-marker-inline-end",
    )).toBe("4px");
    expect(markerEnd.style.getPropertyValue(
      "--rf-marker-inline-end",
    )).toBe("4px");
    expect(scrollerEnd.style.getPropertyValue(
      "--rf-marker-scroller-width",
    )).toBe("0px");

    expect(editor.toggleScrollTriggerMarkers()).toBe(true);
    expect((marked.timeline as gsap.core.Timeline & {
      readonly scrollTrigger: typeof markedTrigger;
    }).scrollTrigger).toBe(markedTrigger);
    expect(markedTrigger.vars.markers).toBe(authoredMarkers);
    expect(editor.getSnapshot().view.transport.scrollTriggerMarkersVisible).toBe(false);
    expect(markers.every((node) => node.hasAttribute(
      "data-rf-marker-hidden",
    ))).toBe(true);

    expect(editor.selectTimeline("standard")).toBe(true);
    expect(editor.getSnapshot().view.transport).toMatchObject({
      canJumpToScrollTriggerTarget: true,
      canToggleScrollTriggerMarkers: false,
      scrollTriggerMarkersVisible: false,
    });
    expect(editor.jumpToScrollTriggerTarget()).toBe(true);
    expect(standardScrollIntoView).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
      behavior: "auto",
    });
    expect(editor.toggleScrollTriggerMarkers()).toBe(false);
    expect(markers.every((node) => node.hasAttribute(
      "data-rf-marker-hidden",
    ))).toBe(true);
    expect(markers.every((node) => !node.hasAttribute(
      "data-rf-marker-selected",
    ))).toBe(true);
    expect(editor.selectTimeline("marked-scroll")).toBe(true);
    expect(editor.getSnapshot().view.transport.scrollTriggerMarkersVisible).toBe(false);
    expect(markers.every((node) => node.hasAttribute(
      "data-rf-marker-hidden",
    ))).toBe(true);
    expect(editor.toggleScrollTriggerMarkers()).toBe(true);
    expect(editor.getSnapshot().view.transport.scrollTriggerMarkersVisible).toBe(true);
    expect(markers.every((node) => !node.hasAttribute(
      "data-rf-marker-hidden",
    ))).toBe(true);
    editor.destroy();
    expect(markers.every((node) => !node.hasAttribute(
      "data-rf-marker-hidden",
    ))).toBe(true);
    expect(markers.map((node) => node.textContent)).toEqual([
      `start-${markerId}`,
      `end-${markerId}`,
      `scroller-start-${markerId}`,
      `scroller-end-${markerId}`,
    ]);
    expect(markers.every((node) => !node.hasAttribute(
      "data-rf-marker-selected",
    ))).toBe(true);
    expect(markerStart.style.getPropertyValue(
      "--rf-marker-inline-end",
    )).toBe("12px");
    expect(markerStart.style.getPropertyPriority(
      "--rf-marker-inline-end",
    )).toBe("important");
    expect(markerEnd.style.getPropertyValue(
      "--rf-marker-inline-end",
    )).toBe("");
    expect(scrollerEnd.style.getPropertyValue(
      "--rf-marker-scroller-width",
    )).toBe("99px");
    expect(scrollerEnd.style.getPropertyPriority(
      "--rf-marker-scroller-width",
    )).toBe("important");
    expect(document.querySelector("[data-rf-marker-visibility]")).toBeNull();

    markedRegistration.destroy();
    standardRegistration.destroy();
    registry.destroy();
  });

  it("owns fallback markers for marker-free trigger-action ScrollTriggers", () => {
    vi.stubGlobal("innerHeight", 800);
    const registry = createTimelineRegistry();
    const scrubbed = directTimeline("marker-free");
    const scroller = document.createElement("main");
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({
      top: 50,
      right: 700,
      bottom: 650,
      left: 100,
    } as DOMRect);
    let scrollPosition = 100;
    const vars = { id: "Marker free", scrub: false, markers: false };
    const trigger = {
      start: 100,
      end: 500,
      progress: 0,
      direction: 1,
      trigger: scrubbed.root,
      scroller,
      vars,
      scroll(position?: number) {
        if (position === undefined) return scrollPosition;
        scrollPosition = position;
      },
      update() {
        this.progress = (scrollPosition - this.start) / (this.end - this.start);
      },
    };
    Object.defineProperty(scrubbed.timeline, "scrollTrigger", { value: trigger });
    const registration = registry.register(scrubbed);
    const editor = createEditorController({ registry });

    expect(editor.selectTimeline("marker-free")).toBe(true);
    expect(editor.getSnapshot().view.transport).toMatchObject({
      canToggleScrollTriggerMarkers: true,
      scrollTriggerMarkersVisible: true,
    });
    const owned = () => [...document.querySelectorAll<HTMLElement>(
      "[data-rf-marker-owned]",
    )];
    expect(owned()).toHaveLength(4);
    expect(owned().every((marker) => marker.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(Object.fromEntries(owned().map((marker) => [
      marker.dataset.rfMarkerOwnedType,
      marker.style.top,
    ]))).toEqual({
      start: "650px",
      end: "450px",
      "scroller-start": "650px",
      "scroller-end": "50px",
    });
    expect(vars.markers).toBe(false);

    expect(editor.seek(0.5)).toBe(true);
    expect(scrollPosition).toBe(100);
    scrollPosition = 300;
    trigger.update();
    expect(editor.selectTimeline("marker-free")).toBe(true);
    expect(Object.fromEntries(owned().map((marker) => [
      marker.dataset.rfMarkerOwnedType,
      marker.style.top,
    ]))).toEqual({
      start: "450px",
      end: "250px",
      "scroller-start": "650px",
      "scroller-end": "50px",
    });
    expect(editor.toggleScrollTriggerMarkers()).toBe(true);
    expect(owned()).toHaveLength(0);
    expect(editor.toggleScrollTriggerMarkers()).toBe(true);
    expect(owned()).toHaveLength(4);

    editor.destroy();
    expect(owned()).toHaveLength(0);
    expect(document.querySelector("[data-rf-marker-visibility]")).toBeNull();
    expect(vars.markers).toBe(false);
    registration.destroy();
    registry.destroy();
  });

  it("replaces DevTools-owned fallback markers with a rebuilt timeline", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("section");
    const markerSets: Array<{ vars: { scrub: true; markers: false } }> = [];
    const registration = registry.register({
      id: "rebuilt-marker-free",
      root,
      create() {
        const target = document.createElement("div");
        root.replaceChildren(target);
        const timeline = gsap.timeline({ paused: true });
        timeline.to(target, { x: 40, duration: 1 });
        const vars = { scrub: true as const, markers: false as const };
        const trigger = {
          start: 0,
          end: 400,
          progress: 0,
          direction: 0,
          trigger: target,
          scroller: window,
          vars,
          scroll: () => 0,
        };
        Object.defineProperty(timeline, "scrollTrigger", { value: trigger });
        markerSets.push({ vars });
        return { timeline, dispose: () => timeline.pause() };
      },
    });
    const editor = createEditorController({ registry });
    expect(editor.selectTimeline("rebuilt-marker-free")).toBe(true);
    const before = [...document.querySelectorAll("[data-rf-marker-owned]")];
    expect(before).toHaveLength(4);

    expect(editor.replay()).toBe(true);
    const after = [...document.querySelectorAll("[data-rf-marker-owned]")];
    expect(after).toHaveLength(4);
    expect(after.every((marker) => !before.includes(marker))).toBe(true);
    expect(before.every((marker) => !marker.isConnected)).toBe(true);
    expect(markerSets).toHaveLength(2);
    expect(markerSets.every(({ vars }) => vars.markers === false)).toBe(true);

    editor.destroy();
    expect(document.querySelectorAll("[data-rf-marker-owned]")).toHaveLength(0);
    registration.destroy();
    registry.destroy();
  });
});
