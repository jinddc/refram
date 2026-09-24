import type { gsap } from "gsap";
import { readEditorTimeWindow } from "./editor-time";
import {
  buildEditorViewState,
  editorTrackKey,
  type EditorViewInput,
  type EditorViewState,
} from "./editor-view-state";
import {
  attachGsapTimelineSession,
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
  let registrySnapshot = registry.getSnapshot();
  let active: MotionTimelineRegistration | undefined;
  let activeIndex = 0;
  let controlSubscription: (() => void) | undefined;
  let attachment: TimelineSessionAttachment | undefined;
  let inspection: TimelineInspectionSnapshot | undefined;
  let timeOrigin = 0;
  let cursorTime: number | undefined;
  let cursorPinned = false;
  let trackKey: string | undefined;
  let animation: gsap.core.Animation | undefined;
  let error: unknown;
  let destroyed = false;
  let generation = 0;
  let current: EditorSnapshot;

  const makeSnapshot = (): EditorSnapshot => {
    const base = {
      timelines: Object.freeze(registrySnapshot.registrations.map(({ id, label }) =>
        Object.freeze({ id, label }))),
      activeTimelineId: active?.id,
      replayState: active?.replayState,
      previewRoot: active?.root,
      inspection,
      timeWindow: active && inspection
        ? readEditorTimeWindow(
          active.timeline,
          inspection,
          timeOrigin,
          cursorPinned ? cursorTime : undefined,
        )
        : undefined,
      selectedItem: selectedItem(inspection, trackKey, animation),
      error,
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
    cursorTime = undefined;
    cursorPinned = false;
  };

  const attach = (registration: MotionTimelineRegistration): void => {
    const token = ++generation;
    timeOrigin = registration.timeline.totalTime();
    cursorTime = timeOrigin;
    cursorPinned = false;
    const next = attachGsapTimelineSession(
      registration.timeline,
      (snapshot) => {
        if (destroyed || active !== registration || token !== generation) return;
        inspection = snapshot;
        if (!cursorPinned) cursorTime = registration.timeline.totalTime();
        const item = selectedItem(snapshot, trackKey, animation);
        if (item) {
          trackKey = editorTrackKey(item);
          animation = item.animation;
        }
        publish();
      },
      registration.tracks,
    );
    if (destroyed || active !== registration || token !== generation) {
      next.detach();
      return;
    }
    attachment = next;
  };

  const activate = (registration: MotionTimelineRegistration | undefined): void => {
    if (active === registration) return;
    detach();
    active = registration;
    trackKey = undefined;
    animation = undefined;
    error = undefined;
    if (registration) {
      activeIndex = registrySnapshot.registrations.indexOf(registration);
      controlSubscription = registration.subscribe((event) => {
        if (destroyed || active !== registration) return;
        switch (event.type) {
          case "replay-start":
            attachment?.detach();
            attachment = undefined;
            inspection = undefined;
            publish();
            break;
          case "timeline":
            error = undefined;
            attach(registration);
            break;
          case "error":
            error = event.error;
            publish();
            break;
          case "destroy":
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
    publish();
  };

  current = makeSnapshot();
  const unsubscribeRegistry = registry.subscribe(handleRegistry);

  const canControl = (): boolean => Boolean(
    !destroyed && active && attachment && inspection?.driver === "manual"
      && inspection.readiness === "ready" && error === undefined,
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
      activate(registration);
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
      if (inspection?.playState === "finished" && !this.replay()) return false;
      active?.timeline.play();
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
      if (destroyed || !active) return false;
      if (active.replayState === "blocked") return false;
      try {
        active.replay();
        if (!attachment) attach(active);
        if (attachment) inspection = attachment.read();
        error = undefined;
        publish();
        return true;
      } catch (cause) {
        error = cause;
        publish();
        return false;
      }
    },
    seek(progress) {
      if (!canControl() || !Number.isFinite(progress) || progress < 0 || progress > 1
        || !active || !inspection) return false;
      const window = readEditorTimeWindow(active.timeline, inspection, timeOrigin);
      if (!window) return false;
      if (inspection.playState === "finished") active.timeline.pause();
      if (!window.repeating) {
        const requestedTime = window.start + progress * window.duration;
        active.timeline.totalTime(requestedTime, true);
        inspection = attachment!.read();
        cursorTime = requestedTime;
        cursorPinned = requestedTime > inspection.totalDuration;
        publish();
        return true;
      }
      const time = progress === 1
        ? window.end - Math.min(0.000001, window.duration / 2)
        : window.start + progress * window.duration;
      active.timeline.totalTime(time, true);
      inspection = attachment!.read();
      publish();
      return true;
    },
    setTimeScale(value) {
      if (!canControl()) return false;
      return attachment!.setTimeScale(value);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribeRegistry();
      detach();
      active = undefined;
      listeners.clear();
      current = makeSnapshot();
    },
  };
}
