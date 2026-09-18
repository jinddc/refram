import type { gsap } from "gsap";

export type MotionTimelineReplayStrategy = "restart" | "rebuild";

interface MotionTimelineDeclarationBase {
  readonly id: string;
  readonly label?: string;
  readonly root: HTMLElement;
}

export interface DirectMotionTimelineDeclaration
  extends MotionTimelineDeclarationBase {
  readonly timeline: gsap.core.Timeline;
  readonly replay?: "restart";
  readonly create?: never;
  readonly reset?: never;
}

export interface RebuildableMotionTimelineRuntime {
  readonly timeline: gsap.core.Timeline;
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
  | { readonly type: "timeline"; readonly timeline: gsap.core.Timeline }
  | { readonly type: "error"; readonly error: unknown }
  | { readonly type: "destroy" };

export interface MotionTimelineControl {
  readonly id: string;
  readonly label: string;
  readonly root: HTMLElement;
  readonly replayStrategy: MotionTimelineReplayStrategy;
  readonly timeline: gsap.core.Timeline;
  subscribe(listener: (event: MotionTimelineControlEvent) => void): () => void;
  replay(): gsap.core.Timeline;
  destroy(): void;
}

function invalidState(message: string): DOMException {
  return new DOMException(message, "InvalidStateError");
}

function managedRuntime(
  create: () => RebuildableMotionTimelineRuntime,
): RebuildableMotionTimelineRuntime {
  const runtime = create();
  let disposed = false;
  return {
    timeline: runtime.timeline,
    dispose() {
      if (disposed) return;
      disposed = true;
      runtime.dispose();
    },
  };
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
    let runtime = managedRuntime(declaration.create);

    return {
      id: declaration.id,
      label: declaration.label ?? declaration.id,
      root: declaration.root,
      replayStrategy: "rebuild",
      get timeline() {
        requireActive();
        return runtime.timeline;
      },
      subscribe,
      replay() {
        requireActive();
        notify({ type: "replay-start" });
        try {
          runtime.timeline.pause();
          runtime.dispose();
          declaration.reset?.();
          runtime = managedRuntime(declaration.create);
          runtime.timeline.pause().totalProgress(0, true);
          notify({ type: "timeline", timeline: runtime.timeline });
          return runtime.timeline;
        } catch (error) {
          notify({ type: "error", error });
          throw error;
        }
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        runtime.dispose();
        notify({ type: "destroy" });
        listeners.clear();
      },
    };
  }

  const timeline = declaration.timeline;
  return {
    id: declaration.id,
    label: declaration.label ?? declaration.id,
    root: declaration.root,
    replayStrategy: "restart",
    get timeline() {
      requireActive();
      return timeline;
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
