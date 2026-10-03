import type { gsap } from "gsap";
import { readEditorTimeWindow } from "./editor-time";
import { createScrollTriggerMarkerPresentation } from "./scrolltrigger/marker-presentation";
import {
  buildEditorViewState,
  editorTrackKey,
  type EditorViewInput,
  type EditorViewState,
} from "./editor-view-state";
import {
  attachGsapTimelineSession,
  readTimelineScrollTrigger,
  type TimelineInspectionItem,
  type TimelineInspectionSnapshot,
  type TimelineSessionAttachment,
} from "./timeline-session";
import {
  defaultTimelineRegistry,
  type MotionTimelineRegistration,
  type MotionTimelineRegistry,
  type MotionTimelineRegistrySnapshot,
} from "./timeline-registry";

export interface EditorSnapshot extends EditorViewInput {
  readonly previewRoot: HTMLElement | undefined;
  readonly view: EditorViewState;
}

export interface EditorController {
  getSnapshot(): EditorSnapshot;
  subscribe(listener: (snapshot: EditorSnapshot) => void): () => void;
  selectTimeline(id: string): boolean;
  selectTrack(key: string): boolean;
  selectItem(index: number): boolean;
  clearTrackSelection(): boolean;
  play(): boolean;
  pause(): boolean;
  replay(): boolean;
  seek(progress: number): boolean;
  setTimeScale(value: number): boolean;
  setReversed(value: boolean): boolean;
  setLooping(value: boolean): boolean;
  jumpToScrollTriggerTarget(): boolean;
  toggleScrollTriggerMarkers(): boolean;
  destroy(): void;
}

export interface EditorControllerOptions {
  readonly registry?: MotionTimelineRegistry;
  readonly initialTimelineId?: string;
}

function selectedItem(
  inspection: TimelineInspectionSnapshot | undefined,
  trackKey: string | undefined,
  animation: gsap.core.Animation | undefined,
): TimelineInspectionItem | undefined {
  return inspection?.items.find((item) => editorTrackKey(item) === trackKey)
    ?? inspection?.items.find((item) => item.animation === animation);
}

function scrollTriggerTarget(timeline: gsap.core.Timeline): Element | undefined {
  const trigger = (timeline as gsap.core.Timeline & {
    readonly scrollTrigger?: { readonly trigger?: unknown };
  }).scrollTrigger;
  return trigger?.trigger instanceof Element ? trigger.trigger : undefined;
}

function timelineTarget(
  registration: MotionTimelineRegistration,
  hasScrollTrigger: boolean,
): Element | undefined {
  return hasScrollTrigger ? scrollTriggerTarget(registration.timeline) : registration.root;
}

export function createEditorController(
  options: EditorControllerOptions = {},
): EditorController {
  const registry = options.registry ?? defaultTimelineRegistry;
  const listeners = new Set<(snapshot: EditorSnapshot) => void>();
  const timelineLabels = new WeakMap<MotionTimelineRegistration, string>();
  const markerPresentation = createScrollTriggerMarkerPresentation();
  let registrySnapshot = registry.getSnapshot();
  let active: MotionTimelineRegistration | undefined;
  let activeIndex = 0;
  let controlSubscription: (() => void) | undefined;
  let attachment: TimelineSessionAttachment | undefined;
  let inspection: TimelineInspectionSnapshot | undefined;
  let timeOrigin = 0;
  let trackKey: string | undefined;
  let animation: gsap.core.Animation | undefined;
  let error: unknown;
  let replayDirection: boolean | undefined;
  let replayTimeScale: number | undefined;
  let looping = false;
  let rebuilding = false;
  let replayInProgress = false;
  let destroyed = false;
  let generation = 0;
  let markerTimelineId: string | undefined;
  let current: EditorSnapshot;

  const syncMarkers = (): void => {
    markerPresentation.sync(
      registrySnapshot.registrations,
      active?.id === markerTimelineId ? markerTimelineId : undefined,
    );
  };

  const timelineLabel = (registration: MotionTimelineRegistration): string => {
    const cached = timelineLabels.get(registration);
    if (cached) return cached;
    try {
      const trigger = readTimelineScrollTrigger(registration.timeline);
      const label = trigger?.id ?? trigger?.trigger ?? registration.label;
      timelineLabels.set(registration, label);
      return label;
    } catch {
      return registration.label;
    }
  };

  const makeSnapshot = (): EditorSnapshot => {
    const base = {
      timelines: Object.freeze(registrySnapshot.registrations.map((registration) => {
        return Object.freeze({
          id: registration.id,
          label: timelineLabel(registration),
        });
      })),
      activeTimelineId: active?.id,
      replayState: active?.replayState,
      rebuilding,
      previewRoot: active?.root,
      inspection,
      timeWindow: active && inspection
        ? readEditorTimeWindow(active.timeline, inspection, timeOrigin)
        : undefined,
      selectedItem: selectedItem(inspection, trackKey, animation),
      error,
      looping,
      canJumpToScrollTriggerTarget: Boolean(
        inspection && active && timelineTarget(active, inspection.scrollTrigger !== undefined),
      ),
      canToggleScrollTriggerMarkers: Boolean(
        inspection?.scrollTrigger
          && active
          && markerPresentation.canPresent(active.timeline),
      ),
      scrollTriggerMarkersVisible: Boolean(
        inspection?.scrollTrigger
          && active
          && active.id === markerTimelineId
          && markerPresentation.isVisible(active.id),
      ),
    } satisfies EditorViewInput & Pick<EditorSnapshot, "previewRoot">;
    return Object.freeze({ ...base, view: buildEditorViewState(base) });
  };

  const publish = (): void => {
    if (destroyed) return;
    current = makeSnapshot();
    for (const listener of [...listeners]) listener(current);
  };

  const detach = (): void => {
    generation += 1;
    controlSubscription?.();
    controlSubscription = undefined;
    attachment?.detach();
    attachment = undefined;
    inspection = undefined;
  };

  const attach = (registration: MotionTimelineRegistration): void => {
    const token = ++generation;
    timeOrigin = registration.timeline.totalTime();
    const next = attachGsapTimelineSession(
      registration.timeline,
      (snapshot) => {
        if (destroyed || active !== registration || token !== generation) return;
        const wasRunning = inspection?.playState === "running";
        inspection = snapshot;
        const reachedLoopBoundary = wasRunning && looping && snapshot.playState !== "running"
          && (snapshot.reversed ? snapshot.progress <= 0 : snapshot.playState === "finished");
        if (reachedLoopBoundary) {
          registration.timeline.totalProgress(snapshot.reversed ? 1 : 0, true);
          if (snapshot.reversed) registration.timeline.reverse();
          else registration.timeline.play();
          if (attachment) inspection = attachment.read();
        }
        const item = selectedItem(snapshot, trackKey, animation);
        if (item) {
          trackKey = editorTrackKey(item);
          animation = item.animation;
        }
        syncMarkers();
        publish();
      },
      registration.tracks,
    );
    if (destroyed || active !== registration || token !== generation) {
      next.detach();
      return;
    }
    attachment = next;
    syncMarkers();
  };

  const activate = (registration: MotionTimelineRegistration | undefined): void => {
    if (active === registration) return;
    detach();
    active = registration;
    replayDirection = undefined;
    replayTimeScale = undefined;
    rebuilding = false;
    trackKey = undefined;
    animation = undefined;
    error = undefined;
    if (registration) {
      activeIndex = registrySnapshot.registrations.indexOf(registration);
      controlSubscription = registration.subscribe((event) => {
        if (destroyed || active !== registration) return;
        switch (event.type) {
          case "replay-start":
            rebuilding = true;
            attachment?.detach();
            attachment = undefined;
            inspection = undefined;
            publish();
            break;
          case "timeline":
            rebuilding = false;
            error = undefined;
            timelineLabels.delete(registration);
            attach(registration);
            break;
          case "error":
            rebuilding = false;
            error = event.error;
            publish();
            break;
          case "destroy":
            rebuilding = false;
            attachment?.detach();
            attachment = undefined;
            inspection = undefined;
            publish();
            break;
        }
      });
      try {
        attach(registration);
      } catch (cause) {
        error = cause;
      }
    }
    syncMarkers();
    publish();
  };

  const handleRegistry = (snapshot: MotionTimelineRegistrySnapshot): void => {
    if (destroyed) return;
    registrySnapshot = snapshot;
    const registrations = snapshot.registrations;
    const retained = active && registrations.find(({ id }) => id === active?.id);
    if (retained) {
      activate(retained);
    } else {
      const initial = !active && options.initialTimelineId
        ? registrations.find(({ id }) => id === options.initialTimelineId)
        : undefined;
      activate(initial ?? registrations[Math.min(activeIndex, registrations.length - 1)]);
    }
    if (markerTimelineId && !registrations.some(({ id }) => id === markerTimelineId)) {
      markerTimelineId = undefined;
    }
    syncMarkers();
    publish();
  };

  current = makeSnapshot();
  const unsubscribeRegistry = registry.subscribe(handleRegistry);

  const canControl = (): boolean => Boolean(
    !destroyed && active && attachment && inspection?.driver === "manual"
      && inspection.readiness === "ready" && error === undefined,
  );

  const playInReverseFromStart = (): void => {
    const window = current.timeWindow;
    active?.timeline.totalTime(
      window ? window.start + window.sourceDuration : active.timeline.totalDuration(),
      true,
    );
    active?.timeline.reverse();
  };

  return {
    getSnapshot: () => current,
    subscribe(listener) {
      if (destroyed) return () => {};
      listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
    selectTimeline(id) {
      if (destroyed) return false;
      const registration = registrySnapshot.registrations.find((candidate) => candidate.id === id);
      if (!registration) return false;
      const alreadyActive = active === registration;
      markerTimelineId = id;
      markerPresentation.activate(registration.id, registration.timeline);
      activate(registration);
      syncMarkers();
      if (alreadyActive) publish();
      return true;
    },
    selectTrack(key) {
      if (destroyed) return false;
      const item = inspection?.items.find((candidate) => editorTrackKey(candidate) === key);
      if (!item) return false;
      trackKey = editorTrackKey(item);
      animation = item.animation;
      publish();
      return true;
    },
    selectItem(index) {
      if (destroyed) return false;
      const item = inspection?.items.find((candidate) => candidate.index === index);
      if (!item) return false;
      trackKey = editorTrackKey(item);
      animation = item.animation;
      publish();
      return true;
    },
    clearTrackSelection() {
      if (destroyed || (trackKey === undefined && animation === undefined)) return false;
      trackKey = undefined;
      animation = undefined;
      publish();
      return true;
    },
    play() {
      if (!canControl()) return false;
      if (inspection?.reversed) {
        if ((current.view.time?.progress ?? 0) <= 0) {
          playInReverseFromStart();
        } else {
          active?.timeline.reverse();
        }
      } else {
        if (inspection?.playState === "finished" && !this.replay()) return false;
        active?.timeline.play();
      }
      if (attachment) inspection = attachment.read();
      publish();
      return true;
    },
    pause() {
      if (!canControl()) return false;
      active?.timeline.pause();
      if (attachment) inspection = attachment.read();
      publish();
      return true;
    },
    replay() {
      if (destroyed || !active || replayInProgress) return false;
      if (active.replayState === "blocked") return false;
      replayInProgress = true;
      if (inspection) {
        replayDirection = inspection.reversed;
        replayTimeScale = inspection.timeScale;
      }
      try {
        active.replay();
        if (!attachment) attach(active);
        if (attachment && replayTimeScale !== undefined
          && attachment.read().timeScale !== replayTimeScale) {
          attachment.setTimeScale(replayTimeScale);
        }
        if (attachment && replayDirection !== undefined
          && attachment.read().reversed !== replayDirection) {
          attachment.setReversed(replayDirection);
        }
        if (attachment) inspection = attachment.read();
        replayDirection = undefined;
        replayTimeScale = undefined;
        error = undefined;
        publish();
        return true;
      } catch (cause) {
        error = cause;
        publish();
        return false;
      } finally {
        replayInProgress = false;
      }
    },
    seek(progress) {
      if (destroyed || !attachment || inspection?.readiness !== "ready"
        || !Number.isFinite(progress) || progress < 0 || progress > 1
        || !active || !inspection) return false;
      if (inspection.driver === "scroll") {
        const sought = attachment.seek(progress);
        if (sought) inspection = attachment.read();
        publish();
        return sought;
      }
      if (!canControl()) return false;
      const window = readEditorTimeWindow(active.timeline, inspection, timeOrigin);
      if (!window) return false;
      if (inspection.playState === "finished") active.timeline.pause();
      if (!window.repeating) {
        const requestedTime = window.start + progress * window.duration;
        const seekTime = Math.min(requestedTime, inspection.totalDuration);
        active.timeline.totalTime(seekTime, false);
        inspection = attachment!.read();
        publish();
        return true;
      }
      const requestedTime = progress * window.duration;
      const remainder = requestedTime % window.sourceDuration;
      const atPositiveBoundary = requestedTime > 0 && Math.abs(remainder) < 0.000001;
      const phase = atPositiveBoundary
        ? window.sourceDuration - Math.min(0.000001, window.sourceDuration / 2)
        : remainder;
      const time = window.start + phase;
      active.timeline.totalTime(time, false);
      inspection = attachment!.read();
      publish();
      return true;
    },
    setTimeScale(value) {
      if (!canControl()) return false;
      return attachment!.setTimeScale(value);
    },
    setReversed(value) {
      if (!canControl()) return false;
      if (value && inspection?.playState === "running"
        && current.timeWindow !== undefined
        && current.timeWindow.time <= current.timeWindow.start) {
        playInReverseFromStart();
        inspection = attachment!.read();
        publish();
        return true;
      }
      return attachment!.setReversed(value);
    },
    setLooping(value) {
      if (!canControl() || current.timeWindow === undefined || current.timeWindow.repeating) {
        return false;
      }
      if (looping === value) return true;
      looping = value;
      publish();
      return true;
    },
    jumpToScrollTriggerTarget() {
      if (destroyed || !active || !inspection) return false;
      const target = timelineTarget(active, inspection.scrollTrigger !== undefined);
      if (!target) return false;
      target.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "auto",
      });
      return true;
    },
    toggleScrollTriggerMarkers() {
      if (destroyed || !active || !inspection?.scrollTrigger) return false;
      const nextVisible = !(active.id === markerTimelineId
        && markerPresentation.isVisible(active.id));
      if (!markerPresentation.setVisible(active.id, active.timeline, nextVisible)) return false;
      markerTimelineId = active.id;
      syncMarkers();
      publish();
      return true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribeRegistry();
      detach();
      markerPresentation.destroy();
      active = undefined;
      listeners.clear();
      current = makeSnapshot();
    },
  };
}
