import type { gsap } from "gsap";
import { readEditorTimeWindow } from "./time";
import { createScrollTriggerMarkerPresentation } from "../scrolltrigger/marker-presentation";
import {
  buildEditorViewState,
  editorTrackKey,
  type EditorViewInput,
  type EditorViewState,
} from "./view-state";
import {
  readTimelineScrollTrigger,
  type TimelineInspectionItem,
  type TimelineInspectionSnapshot,
} from "../timeline/session";
import {
  defaultTimelineRegistry,
  type MotionTimelineRegistration,
  type MotionTimelineRegistry,
  type MotionTimelineRegistrySnapshot,
} from "../timeline/registry";
import { createEditorActiveSession } from "./active-session";
import { resolveTimelineTarget } from "./target-resolution";
import {
  canControlEditorTransport,
  captureReplayTransport,
  continueEditorLoop,
  playEditorTransport,
  playInReverseFromStart,
  restoreReplayTransport,
  seekEditorTransport,
  type ReplayTransportState,
} from "./transport";

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
  let trackKey: string | undefined;
  let animation: gsap.core.Animation | undefined;
  let error: unknown;
  let replayTransport: ReplayTransportState | undefined;
  let looping = false;
  let rebuilding = false;
  let replayInProgress = false;
  let destroyed = false;
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
      inspection: activeSession.inspection,
      timeWindow: active && activeSession.inspection
        ? readEditorTimeWindow(active.timeline, activeSession.inspection, activeSession.timeOrigin)
        : undefined,
      selectedItem: selectedItem(activeSession.inspection, trackKey, animation),
      error,
      looping,
      canJumpToScrollTriggerTarget: Boolean(
        activeSession.inspection && active
          && resolveTimelineTarget(active, activeSession.inspection.scrollTrigger !== undefined),
      ),
      canToggleScrollTriggerMarkers: Boolean(
        activeSession.inspection?.scrollTrigger
          && active
          && markerPresentation.canPresent(active.timeline),
      ),
      scrollTriggerMarkersVisible: Boolean(
        activeSession.inspection?.scrollTrigger
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

  const activeSession = createEditorActiveSession({
    isCurrent: (registration) => !destroyed && active === registration,
    onSnapshot(snapshot, previous) {
      const next = active
        ? continueEditorLoop(
            previous?.playState === "running",
            looping,
            snapshot,
            active.timeline,
            activeSession.attachment,
          )
        : snapshot;
      activeSession.setInspection(next);
      const item = selectedItem(next, trackKey, animation);
      if (item) {
        trackKey = editorTrackKey(item);
        animation = item.animation;
      }
      syncMarkers();
      publish();
    },
    onReplayStart() {
      rebuilding = true;
      publish();
    },
    onTimeline(registration) {
      rebuilding = false;
      error = undefined;
      timelineLabels.delete(registration);
    },
    onError(cause) {
      rebuilding = false;
      error = cause;
      publish();
    },
    onDestroy() {
      rebuilding = false;
      publish();
    },
  });

  const activate = (registration: MotionTimelineRegistration | undefined): void => {
    if (active === registration) return;
    activeSession.detach();
    active = registration;
    replayTransport = undefined;
    rebuilding = false;
    trackKey = undefined;
    animation = undefined;
    error = undefined;
    if (registration) {
      activeIndex = registrySnapshot.registrations.indexOf(registration);
      try {
        activeSession.activate(registration);
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

  const canControl = (): boolean => canControlEditorTransport(
    destroyed,
    active !== undefined,
    activeSession.attachment,
    activeSession.inspection,
    error,
  );

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
      const item = activeSession.inspection?.items.find(
        (candidate) => editorTrackKey(candidate) === key,
      );
      if (!item) return false;
      trackKey = editorTrackKey(item);
      animation = item.animation;
      publish();
      return true;
    },
    selectItem(index) {
      if (destroyed) return false;
      const item = activeSession.inspection?.items.find((candidate) => candidate.index === index);
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
      if (!canControl() || !active || !activeSession.inspection) return false;
      if (!playEditorTransport(
        () => active!.timeline,
        activeSession.inspection,
        current.timeWindow,
        () => this.replay(),
      )) return false;
      if (activeSession.attachment) {
        activeSession.setInspection(activeSession.attachment.read());
      }
      publish();
      return true;
    },
    pause() {
      if (!canControl()) return false;
      active?.timeline.pause();
      if (activeSession.attachment) {
        activeSession.setInspection(activeSession.attachment.read());
      }
      publish();
      return true;
    },
    replay() {
      if (destroyed || !active || replayInProgress) return false;
      if (active.replayState === "blocked") return false;
      replayInProgress = true;
      replayTransport = captureReplayTransport(activeSession.inspection) ?? replayTransport;
      try {
        active.replay();
        activeSession.ensureAttached(active);
        if (activeSession.attachment) {
          activeSession.setInspection(
            restoreReplayTransport(activeSession.attachment, replayTransport),
          );
        }
        replayTransport = undefined;
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
      const attachment = activeSession.attachment;
      const inspection = activeSession.inspection;
      if (destroyed || !attachment || inspection?.readiness !== "ready"
        || !Number.isFinite(progress) || progress < 0 || progress > 1
        || !active || !inspection) return false;
      if (inspection.driver !== "scroll" && !canControl()) return false;
      const next = seekEditorTransport(
        progress,
        active.timeline,
        attachment,
        inspection,
        readEditorTimeWindow(active.timeline, inspection, activeSession.timeOrigin),
      );
      if (!next) {
        if (inspection.driver === "scroll") publish();
        return false;
      }
      activeSession.setInspection(next);
      publish();
      return true;
    },
    setTimeScale(value) {
      if (!canControl()) return false;
      return activeSession.attachment!.setTimeScale(value);
    },
    setReversed(value) {
      if (!canControl()) return false;
      if (value && activeSession.inspection?.playState === "running"
        && current.timeWindow !== undefined
        && current.timeWindow.time <= current.timeWindow.start) {
        playInReverseFromStart(active!.timeline, current.timeWindow);
        activeSession.setInspection(activeSession.attachment!.read());
        publish();
        return true;
      }
      return activeSession.attachment!.setReversed(value);
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
      if (destroyed || !active || !activeSession.inspection) return false;
      const target = resolveTimelineTarget(
        active,
        activeSession.inspection.scrollTrigger !== undefined,
      );
      if (!target) return false;
      target.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "auto",
      });
      return true;
    },
    toggleScrollTriggerMarkers() {
      if (destroyed || !active || !activeSession.inspection?.scrollTrigger) return false;
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
      activeSession.detach();
      markerPresentation.destroy();
      active = undefined;
      listeners.clear();
      current = makeSnapshot();
    },
  };
}
