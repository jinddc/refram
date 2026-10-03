import type { gsap } from "gsap";
import type {
  TimelineInspectionSnapshot,
  TimelineSessionAttachment,
} from "../timeline/session";
import type { EditorTimeWindow } from "./time";

export interface ReplayTransportState {
  readonly reversed: boolean;
  readonly timeScale: number;
}

export function canControlEditorTransport(
  destroyed: boolean,
  hasActiveRegistration: boolean,
  attachment: TimelineSessionAttachment | undefined,
  inspection: TimelineInspectionSnapshot | undefined,
  error: unknown,
): boolean {
  return Boolean(
    !destroyed && hasActiveRegistration && attachment && inspection?.driver === "manual"
      && inspection.readiness === "ready" && error === undefined,
  );
}

export function playEditorTransport(
  timeline: () => gsap.core.Timeline,
  inspection: TimelineInspectionSnapshot,
  timeWindow: EditorTimeWindow | undefined,
  replay: () => boolean,
): boolean {
  if (inspection.reversed) {
    if ((timeWindow?.progress ?? 0) <= 0) {
      playInReverseFromStart(timeline(), timeWindow);
    } else {
      timeline().reverse();
    }
  } else {
    if (inspection.playState === "finished" && !replay()) return false;
    timeline().play();
  }
  return true;
}

export function playInReverseFromStart(
  timeline: gsap.core.Timeline,
  timeWindow: EditorTimeWindow | undefined,
): void {
  timeline.totalTime(
    timeWindow ? timeWindow.start + timeWindow.sourceDuration : timeline.totalDuration(),
    true,
  );
  timeline.reverse();
}

export function seekEditorTransport(
  progress: number,
  timeline: gsap.core.Timeline,
  attachment: TimelineSessionAttachment,
  inspection: TimelineInspectionSnapshot,
  timeWindow: EditorTimeWindow | undefined,
): TimelineInspectionSnapshot | undefined {
  if (inspection.driver === "scroll") {
    return attachment.seek(progress) ? attachment.read() : undefined;
  }
  if (!timeWindow) return undefined;
  if (inspection.playState === "finished") timeline.pause();
  if (!timeWindow.repeating) {
    const requestedTime = timeWindow.start + progress * timeWindow.duration;
    timeline.totalTime(Math.min(requestedTime, inspection.totalDuration), false);
    return attachment.read();
  }
  const requestedTime = progress * timeWindow.duration;
  const remainder = requestedTime % timeWindow.sourceDuration;
  const atPositiveBoundary = requestedTime > 0 && Math.abs(remainder) < 0.000001;
  const phase = atPositiveBoundary
    ? timeWindow.sourceDuration - Math.min(0.000001, timeWindow.sourceDuration / 2)
    : remainder;
  timeline.totalTime(timeWindow.start + phase, false);
  return attachment.read();
}

export function continueEditorLoop(
  wasRunning: boolean,
  looping: boolean,
  snapshot: TimelineInspectionSnapshot,
  timeline: gsap.core.Timeline,
  attachment: TimelineSessionAttachment | undefined,
): TimelineInspectionSnapshot {
  const reachedBoundary = wasRunning && looping && snapshot.playState !== "running"
    && (snapshot.reversed ? snapshot.progress <= 0 : snapshot.playState === "finished");
  if (!reachedBoundary) return snapshot;
  timeline.totalProgress(snapshot.reversed ? 1 : 0, true);
  if (snapshot.reversed) timeline.reverse();
  else timeline.play();
  return attachment?.read() ?? snapshot;
}

export function captureReplayTransport(
  inspection: TimelineInspectionSnapshot | undefined,
): ReplayTransportState | undefined {
  return inspection
    ? { reversed: inspection.reversed, timeScale: inspection.timeScale }
    : undefined;
}

export function restoreReplayTransport(
  attachment: TimelineSessionAttachment,
  state: ReplayTransportState | undefined,
): TimelineInspectionSnapshot {
  if (state && attachment.read().timeScale !== state.timeScale) {
    attachment.setTimeScale(state.timeScale);
  }
  if (state && attachment.read().reversed !== state.reversed) {
    attachment.setReversed(state.reversed);
  }
  return attachment.read();
}
