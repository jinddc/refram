import type { MotionTweenVars } from "../gsap/gsap.types";
import type { MotionTimelineElement } from "./timeline-element";
import type { MotionPlaybackState } from "./timeline.types";
import type { TweenDefinition } from "./tween.types";

export type TimelineInspectionDriver = "manual" | "scroll";

export type TimelineInspectionReadiness =
  | "empty"
  | "ready"
  | "missing-plugin"
  | "reduced-motion"
  | "cancelled"
  | "disconnected";

export interface TimelineInspectionItem {
  readonly source: HTMLElement;
  readonly index: number;
  readonly runnable: boolean;
  readonly authoredPosition?: number | string;
  readonly from?: Readonly<MotionTweenVars>;
  readonly to?: Readonly<MotionTweenVars>;
  readonly authoredDuration?: number;
  readonly authoredEase?: string;
  readonly resolvedStart: number | null;
  readonly resolvedDuration: number | null;
  readonly resolvedEnd: number | null;
}

export interface TimelineInspectionSnapshot {
  readonly driver: TimelineInspectionDriver;
  readonly readiness: TimelineInspectionReadiness;
  readonly playState: MotionPlaybackState;
  readonly progress: number;
  readonly totalDuration: number;
  readonly items: readonly TimelineInspectionItem[];
}

export interface TimelineInspectorOptions {
  progress?: boolean;
}

export interface TimelineInspectorAttachment {
  read(): TimelineInspectionSnapshot;
  detach(): void;
}

export type TimelineInspectionListener = (
  snapshot: TimelineInspectionSnapshot,
) => void;

export interface TimelineControllerInspectionItem {
  readonly definition: TweenDefinition;
  readonly resolvedStart: number | null;
  readonly resolvedDuration: number | null;
  readonly resolvedEnd: number | null;
}

export interface TimelineControllerInspection {
  readonly driver: TimelineInspectionDriver;
  readonly readiness: TimelineInspectionReadiness;
  readonly progress: number;
  readonly totalDuration: number;
  readonly items: readonly TimelineControllerInspectionItem[];
}

export const ATTACH_TIMELINE_INSPECTOR = Symbol(
  "attachTimelineInspector",
);

export interface TimelineInspectionHost extends HTMLElement {
  [ATTACH_TIMELINE_INSPECTOR](
    listener: TimelineInspectionListener,
    options?: TimelineInspectorOptions,
  ): TimelineInspectorAttachment;
}

interface InspectionEntry {
  active: boolean;
  listener?: TimelineInspectionListener;
  progress: boolean;
  snapshot?: TimelineInspectionSnapshot;
}

interface InspectionNotification {
  replacement?: boolean;
  preserveAuthored?: boolean;
}

function reportInspectionError(error: unknown): void {
  const reporter = (globalThis as typeof globalThis & {
    reportError?: (cause: unknown) => void;
  }).reportError;
  if (typeof reporter === "function") {
    reporter(error);
    return;
  }

  queueMicrotask(() => {
    throw error;
  });
}

function createInspectorAttachment(
  owner: TimelineInspectionHub | undefined,
  entry: InspectionEntry | undefined,
): TimelineInspectorAttachment {
  return {
    read() {
      if (!entry?.active || !entry.snapshot) {
        throw new DOMException(
          "Timeline inspector attachment is detached.",
          "InvalidStateError",
        );
      }
      return entry.snapshot;
    },
    detach() {
      const activeOwner = owner;
      const activeEntry = entry;
      owner = undefined;
      entry = undefined;
      activeOwner?.detachEntry(activeEntry);
    },
  };
}

type SnapshotReader = (
  previousItems: readonly TimelineInspectionItem[] | undefined,
  rebuildItems: boolean,
  preserveAuthored: boolean,
) => TimelineInspectionSnapshot;

function sameSnapshot(
  left: TimelineInspectionSnapshot,
  right: TimelineInspectionSnapshot,
): boolean {
  return (
    left.driver === right.driver &&
    left.readiness === right.readiness &&
    left.playState === right.playState &&
    left.progress === right.progress &&
    left.totalDuration === right.totalDuration &&
    left.items === right.items
  );
}

export class TimelineInspectionHub {
  private readonly entries = new Set<InspectionEntry>();
  private current?: TimelineInspectionSnapshot;
  private connected: boolean;
  private flushPending = false;
  private pendingReplacement = false;
  private pendingPreserveAuthored = false;
  private frame?: number;

  public constructor(
    private readonly readSnapshot: SnapshotReader,
    connected: boolean,
  ) {
    this.connected = connected;
  }

  public attach(
    listener: TimelineInspectionListener,
    options: TimelineInspectorOptions = {},
  ): TimelineInspectorAttachment {
    const entry: InspectionEntry = {
      active: true,
      listener,
      progress: options.progress === true,
    };
    const snapshot = this.current ?? this.readSnapshot(
      undefined,
      true,
      false,
    );
    this.current = snapshot;
    entry.snapshot = snapshot;
    this.entries.add(entry);

    try {
      listener(snapshot);
    } catch (error) {
      this.detachEntry(entry);
      throw error;
    }

    this.updateSampling();
    return createInspectorAttachment(this, entry);
  }

  public detachEntry(entry: InspectionEntry | undefined): void {
    if (!entry?.active) {
      return;
    }

    entry.active = false;
    entry.listener = undefined;
    entry.snapshot = undefined;
    this.entries.delete(entry);
    this.updateSampling();

    if (this.entries.size === 0) {
      this.current = undefined;
      this.pendingReplacement = false;
      this.pendingPreserveAuthored = false;
    }
  }

  public notify(notification: InspectionNotification = {}): void {
    if (this.entries.size === 0) {
      return;
    }

    this.pendingReplacement ||= notification.replacement === true;
    this.pendingPreserveAuthored ||=
      notification.preserveAuthored === true;

    if (this.flushPending) {
      return;
    }

    this.flushPending = true;
    queueMicrotask(() => this.flush());
  }

  public setConnected(connected: boolean): void {
    if (this.connected === connected) {
      return;
    }

    this.connected = connected;
    this.updateSampling();
  }

  private flush(): void {
    this.flushPending = false;
    if (this.entries.size === 0) {
      return;
    }

    const replacement = this.pendingReplacement;
    const preserveAuthored = this.pendingPreserveAuthored;
    this.pendingReplacement = false;
    this.pendingPreserveAuthored = false;

    const previous = this.current;
    const snapshot = this.readSnapshot(
      previous?.items,
      replacement || !previous,
      preserveAuthored,
    );
    if (previous && sameSnapshot(previous, snapshot)) {
      return;
    }

    this.deliver(snapshot, false);
  }

  private deliver(
    snapshot: TimelineInspectionSnapshot,
    progressOnly: boolean,
  ): void {
    this.current = snapshot;
    const errors: unknown[] = [];
    for (const entry of [...this.entries]) {
      if (
        !entry.active ||
        !entry.listener ||
        (progressOnly && !entry.progress)
      ) {
        continue;
      }

      entry.snapshot = snapshot;
      try {
        entry.listener(snapshot);
      } catch (error) {
        errors.push(error);
      }
    }

    for (const error of errors) {
      reportInspectionError(error);
    }
  }

  private updateSampling(): void {
    const shouldSample = (
      this.connected &&
      [...this.entries].some((entry) => entry.active && entry.progress)
    );

    if (!shouldSample) {
      this.stopSampling();
      return;
    }

    if (
      this.frame === undefined &&
      typeof globalThis.requestAnimationFrame === "function"
    ) {
      this.frame = globalThis.requestAnimationFrame(() => this.sample());
    }
  }

  private sample(): void {
    this.frame = undefined;
    if (
      !this.connected ||
      ![...this.entries].some((entry) => entry.active && entry.progress)
    ) {
      return;
    }

    try {
      const previous = this.current;
      const snapshot = this.readSnapshot(
        previous?.items,
        false,
        false,
      );
      if (!previous || !sameSnapshot(previous, snapshot)) {
        this.deliver(snapshot, true);
      }
    } finally {
      this.updateSampling();
    }
  }

  private stopSampling(): void {
    if (this.frame === undefined) {
      return;
    }

    if (typeof globalThis.cancelAnimationFrame === "function") {
      globalThis.cancelAnimationFrame(this.frame);
    }
    this.frame = undefined;
  }
}

export function attachTimelineInspector(
  timeline: MotionTimelineElement,
  listener: TimelineInspectionListener,
  options?: TimelineInspectorOptions,
): TimelineInspectorAttachment {
  if (!(ATTACH_TIMELINE_INSPECTOR in timeline)) {
    throw new TypeError(
      "Timeline inspection requires a MotionTimelineElement.",
    );
  }

  return (timeline as TimelineInspectionHost)[ATTACH_TIMELINE_INSPECTOR](
    listener,
    options,
  );
}
