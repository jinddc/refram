import {
  attachGsapTimelineSession,
  type TimelineInspectionSnapshot,
  type TimelineSessionAttachment,
} from "../timeline/session";
import type { MotionTimelineRegistration } from "../timeline/registry";

interface EditorActiveSessionCallbacks {
  isCurrent(registration: MotionTimelineRegistration): boolean;
  onSnapshot(
    snapshot: TimelineInspectionSnapshot,
    previous: TimelineInspectionSnapshot | undefined,
  ): void;
  onReplayStart(): void;
  onTimeline(registration: MotionTimelineRegistration): void;
  onError(error: unknown): void;
  onDestroy(): void;
}

export interface EditorActiveSession {
  readonly attachment: TimelineSessionAttachment | undefined;
  readonly inspection: TimelineInspectionSnapshot | undefined;
  readonly timeOrigin: number;
  activate(registration: MotionTimelineRegistration): void;
  setInspection(snapshot: TimelineInspectionSnapshot): void;
  ensureAttached(registration: MotionTimelineRegistration): void;
  detach(): void;
}

export function createEditorActiveSession(
  callbacks: EditorActiveSessionCallbacks,
): EditorActiveSession {
  let controlSubscription: (() => void) | undefined;
  let attachment: TimelineSessionAttachment | undefined;
  let inspection: TimelineInspectionSnapshot | undefined;
  let timeOrigin = 0;
  let generation = 0;

  const detachAttachment = (): void => {
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
        if (!callbacks.isCurrent(registration) || token !== generation) return;
        const previous = inspection;
        inspection = snapshot;
        callbacks.onSnapshot(snapshot, previous);
      },
      registration.tracks,
    );
    if (!callbacks.isCurrent(registration) || token !== generation) {
      next.detach();
      return;
    }
    attachment = next;
  };

  const detach = (): void => {
    generation += 1;
    controlSubscription?.();
    controlSubscription = undefined;
    detachAttachment();
  };

  const session: EditorActiveSession = {
    get attachment() {
      return attachment;
    },
    get inspection() {
      return inspection;
    },
    get timeOrigin() {
      return timeOrigin;
    },
    activate(registration) {
      controlSubscription = registration.subscribe((event) => {
        if (!callbacks.isCurrent(registration)) return;
        switch (event.type) {
          case "replay-start":
            detachAttachment();
            callbacks.onReplayStart();
            break;
          case "timeline":
            callbacks.onTimeline(registration);
            attach(registration);
            break;
          case "error":
            callbacks.onError(event.error);
            break;
          case "destroy":
            detachAttachment();
            callbacks.onDestroy();
            break;
        }
      });
      attach(registration);
    },
    setInspection(snapshot) {
      inspection = snapshot;
    },
    ensureAttached(registration) {
      if (!attachment) attach(registration);
    },
    detach,
  };

  return session;
}
