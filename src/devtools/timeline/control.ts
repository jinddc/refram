import type { gsap } from "gsap";

// Framework-agnostic connection lifecycle shared by Motion DevTools consumers.

export type MotionTimelineReplayStrategy = "restart" | "rebuild";
export type MotionTimelineReplayState = "ready" | "retryable" | "blocked";

export type MotionTimelineTrackDeclaration = {
  readonly id: string;
  readonly label?: string;
} & (
  | { readonly animation: gsap.core.Tween; readonly animations?: never }
  | { readonly animations: readonly gsap.core.Tween[]; readonly animation?: never }
) & { readonly targets: Element | readonly Element[] };

export interface MotionTimelineTrack {
  readonly id: string;
  readonly label: string;
  readonly animations: readonly gsap.core.Tween[];
  readonly targets: readonly Element[];
}

interface MotionTimelineDeclarationBase {
  readonly id: string;
  readonly label?: string;
  readonly root: HTMLElement;
}

export interface DirectMotionTimelineDeclaration
  extends MotionTimelineDeclarationBase {
  readonly timeline: gsap.core.Timeline;
  readonly tracks?: readonly MotionTimelineTrackDeclaration[];
  readonly replay?: "restart";
  readonly create?: never;
  readonly reset?: never;
}

export interface RebuildableMotionTimelineRuntime {
  readonly timeline: gsap.core.Timeline;
  readonly tracks?: readonly MotionTimelineTrackDeclaration[];
  dispose(): void;
}

export interface RebuildableMotionTimelineDeclaration
  extends MotionTimelineDeclarationBase {
  readonly create: () => RebuildableMotionTimelineRuntime;
  readonly reset?: () => void;
  readonly replay?: "rebuild";
  readonly timeline?: never;
}

export type MotionTimelineDeclaration =
  | DirectMotionTimelineDeclaration
  | RebuildableMotionTimelineDeclaration;

export type MotionTimelineControlEvent =
  | { readonly type: "replay-start" }
  | { readonly type: "timeline"; readonly timeline: gsap.core.Timeline; readonly tracks: readonly MotionTimelineTrack[] }
  | { readonly type: "error"; readonly error: unknown }
  | { readonly type: "destroy" };

export interface MotionTimelineControl {
  readonly id: string;
  readonly label: string;
  readonly root: HTMLElement;
  readonly replayStrategy: MotionTimelineReplayStrategy;
  readonly replayState: MotionTimelineReplayState;
  readonly timeline: gsap.core.Timeline;
  readonly tracks: readonly MotionTimelineTrack[];
  subscribe(listener: (event: MotionTimelineControlEvent) => void): () => void;
  replay(): gsap.core.Timeline;
  destroy(): void;
}

function invalidState(message: string): DOMException {
  return new DOMException(message, "InvalidStateError");
}

class RuntimeCleanupError extends Error {
  constructor(operationError: unknown, cleanupError: unknown) {
    super("Timeline runtime operation and cleanup both failed.", { cause: cleanupError });
    this.name = "RuntimeCleanupError";
    this.operationError = operationError;
  }

  readonly operationError: unknown;
}

function normalizeTracks(
  timeline: gsap.core.Timeline,
  declarations: readonly MotionTimelineTrackDeclaration[] = [],
): readonly MotionTimelineTrack[] {
  const ids = new Set<string>();
  const children = new Set(timeline.getChildren(false, true, false));
  const mappedAnimations = new Set<gsap.core.Tween>();
  return Object.freeze(declarations.map((declaration) => {
    const id = declaration.id.trim();
    if (!id || ids.has(id)) {
      throw new TypeError(`A timeline track needs a unique, non-empty id: "${declaration.id}".`);
    }
    ids.add(id);
    const animations = declaration.animation !== undefined
      ? [declaration.animation]
      : [...declaration.animations!];
    const targets = Array.isArray(declaration.targets)
      ? [...declaration.targets]
      : [declaration.targets as Element];
    if (animations.length === 0 || targets.length === 0) {
      throw new TypeError(`Timeline track "${id}" needs animations and targets.`);
    }
    if (!targets.every((target) => target instanceof Element)) {
      throw new TypeError(`Timeline track "${id}" needs Element targets.`);
    }
    for (const animation of animations) {
      if (!children.has(animation)) {
        throw new TypeError(`Timeline track "${id}" references an animation outside its timeline.`);
      }
      if (mappedAnimations.has(animation)) {
        throw new TypeError(`Animation in timeline track "${id}" is already mapped.`);
      }
      mappedAnimations.add(animation);
    }
    return Object.freeze({
      id,
      label: declaration.label ?? id,
      animations: Object.freeze(animations),
      targets: Object.freeze(targets),
    });
  }));
}

function managedRuntime(
  create: () => RebuildableMotionTimelineRuntime,
): RebuildableMotionTimelineRuntime {
  const runtime = create();
  let disposed = false;
  return {
    timeline: runtime.timeline,
    tracks: runtime.tracks,
    dispose() {
      if (disposed) return;
      disposed = true;
      runtime.dispose();
    },
  };
}

function createTrackedRuntime(
  create: () => RebuildableMotionTimelineRuntime,
): { runtime: RebuildableMotionTimelineRuntime; tracks: readonly MotionTimelineTrack[] } {
  const runtime = managedRuntime(create);
  try {
    return { runtime, tracks: normalizeTracks(runtime.timeline, runtime.tracks) };
  } catch (error) {
    try {
      runtime.dispose();
    } catch (cleanupError) {
      throw new RuntimeCleanupError(error, cleanupError);
    }
    throw error;
  }
}

export function createMotionTimelineControl(
  declaration: MotionTimelineDeclaration,
): MotionTimelineControl {
  if (!declaration.id.trim()) {
    throw new TypeError("A Motion DevTools timeline requires a non-empty id.");
  }

  let destroyed = false;
  const listeners = new Set<(event: MotionTimelineControlEvent) => void>();
  const requireActive = (): void => {
    if (destroyed) {
      throw invalidState(`Timeline control \"${declaration.id}\" is destroyed.`);
    }
  };
  const subscribe = (
    listener: (event: MotionTimelineControlEvent) => void,
  ): (() => void) => {
    requireActive();
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const notify = (event: MotionTimelineControlEvent): void => {
    for (const listener of listeners) listener(event);
  };

  if (typeof declaration.create === "function") {
    let current: ReturnType<typeof createTrackedRuntime> | undefined =
      createTrackedRuntime(declaration.create);
    let replayState: MotionTimelineReplayState = "ready";

    const fail = (error: unknown, state: MotionTimelineReplayState): never => {
      replayState = state;
      notify({ type: "error", error });
      throw error;
    };

    return {
      id: declaration.id,
      label: declaration.label ?? declaration.id,
      root: declaration.root,
      replayStrategy: "rebuild",
      get replayState() {
        return replayState;
      },
      get timeline() {
        requireActive();
        if (!current) throw invalidState("Rebuildable timeline has no live runtime.");
        return current.runtime.timeline;
      },
      get tracks() {
        requireActive();
        if (!current) throw invalidState("Rebuildable timeline has no live runtime.");
        return current.tracks;
      },
      subscribe,
      replay() {
        requireActive();
        if (replayState === "blocked") {
          throw invalidState("Timeline replay is blocked after an unsafe rebuild failure.");
        }
        notify({ type: "replay-start" });
        let stage: "dispose" | "reset" | "create" | "activate" = "dispose";
        let replacement!: ReturnType<typeof createTrackedRuntime>;
        try {
          if (current) {
            current.runtime.timeline.pause();
            const previous = current;
            current = undefined;
            previous.runtime.dispose();
          }
          stage = "reset";
          declaration.reset?.();
          stage = "create";
          replacement = createTrackedRuntime(declaration.create);
          stage = "activate";
          replacement.runtime.timeline.pause();
        } catch (error) {
          let failure = error;
          if (stage === "activate") {
            try {
              replacement.runtime.dispose();
            } catch (cleanupError) {
              failure = new RuntimeCleanupError(error, cleanupError);
            }
          }
          const recovery = stage === "create" && !(failure instanceof RuntimeCleanupError)
            ? "retryable"
            : "blocked";
          return fail(failure, recovery);
        }
        current = replacement;
        replayState = "ready";
        notify({ type: "timeline", timeline: replacement.runtime.timeline, tracks: replacement.tracks });
        return replacement.runtime.timeline;
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        current?.runtime.dispose();
        current = undefined;
        notify({ type: "destroy" });
        listeners.clear();
      },
    };
  }

  const timeline = declaration.timeline;
  const tracks = normalizeTracks(timeline, declaration.tracks);
  return {
    id: declaration.id,
    label: declaration.label ?? declaration.id,
    root: declaration.root,
    replayStrategy: "restart",
    replayState: "ready",
    get timeline() {
      requireActive();
      return timeline;
    },
    get tracks() {
      requireActive();
      return tracks;
    },
    subscribe,
    replay() {
      requireActive();
      timeline.pause().totalProgress(0, true);
      return timeline;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      notify({ type: "destroy" });
      listeners.clear();
    },
  };
}
