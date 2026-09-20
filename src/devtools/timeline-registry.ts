import {
  createMotionTimelineControl,
  type MotionTimelineControl,
  type MotionTimelineControlEvent,
  type MotionTimelineDeclaration,
  type MotionTimelineReplayStrategy,
} from "./timeline-control";

export interface MotionTimelineRegistration {
  readonly id: string;
  readonly label: string;
  readonly root: HTMLElement;
  readonly replayStrategy: MotionTimelineReplayStrategy;
  readonly timeline: MotionTimelineControl["timeline"];
  readonly tracks: MotionTimelineControl["tracks"];
  subscribe(listener: (event: MotionTimelineControlEvent) => void): () => void;
  replay(): MotionTimelineControl["timeline"];
  destroy(): void;
}

export interface MotionTimelineRegistrySnapshot {
  readonly version: number;
  readonly registrations: readonly MotionTimelineRegistration[];
}

export interface MotionTimelineRegistry {
  register(declaration: MotionTimelineDeclaration): MotionTimelineRegistration;
  getSnapshot(): MotionTimelineRegistrySnapshot;
  subscribe(listener: (snapshot: MotionTimelineRegistrySnapshot) => void): () => void;
  destroy(): void;
}

interface RegistryEntry {
  readonly control: MotionTimelineControl;
  readonly registration: MotionTimelineRegistration;
  removed: boolean;
}

function invalidState(message: string): DOMException {
  return new DOMException(message, "InvalidStateError");
}

function snapshot(
  version: number,
  entries: readonly RegistryEntry[],
): MotionTimelineRegistrySnapshot {
  return Object.freeze({
    version,
    registrations: Object.freeze(entries.map(({ registration }) => registration)),
  });
}

export function createTimelineRegistry(): MotionTimelineRegistry {
  const entries: RegistryEntry[] = [];
  const entriesById = new Map<string, RegistryEntry>();
  const listeners = new Set<(value: MotionTimelineRegistrySnapshot) => void>();
  let destroyed = false;
  let version = 0;
  let currentSnapshot = snapshot(version, entries);

  const requireActive = (): void => {
    if (destroyed) {
      throw invalidState("Timeline registry is destroyed.");
    }
  };

  const publish = (): void => {
    version += 1;
    currentSnapshot = snapshot(version, entries);
    for (const listener of [...listeners]) listener(currentSnapshot);
  };

  const remove = (entry: RegistryEntry): void => {
    if (entry.removed) return;
    entry.removed = true;
    entriesById.delete(entry.control.id);
    const index = entries.indexOf(entry);
    if (index >= 0) entries.splice(index, 1);
    entry.control.destroy();
    if (!destroyed) publish();
  };

  return {
    register(declaration) {
      requireActive();
      const id = declaration.id.trim();
      if (entriesById.has(id)) {
        throw new Error(`Timeline "${id}" is already registered.`);
      }

      const control = createMotionTimelineControl({
        ...declaration,
        id,
      } as MotionTimelineDeclaration);
      let entry!: RegistryEntry;
      const registration: MotionTimelineRegistration = {
        id: control.id,
        label: control.label,
        root: control.root,
        replayStrategy: control.replayStrategy,
        get timeline() {
          return control.timeline;
        },
        get tracks() {
          return control.tracks;
        },
        subscribe(listener) {
          return control.subscribe(listener);
        },
        replay() {
          return control.replay();
        },
        destroy() {
          remove(entry);
        },
      };
      entry = { control, registration, removed: false };
      entries.push(entry);
      entriesById.set(id, entry);
      publish();
      return registration;
    },
    getSnapshot() {
      return currentSnapshot;
    },
    subscribe(listener) {
      requireActive();
      listeners.add(listener);
      listener(currentSnapshot);
      return () => listeners.delete(listener);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const entry of entries) {
        entry.removed = true;
        entry.control.destroy();
      }
      entries.length = 0;
      entriesById.clear();
      version += 1;
      currentSnapshot = snapshot(version, entries);
      for (const listener of [...listeners]) listener(currentSnapshot);
      listeners.clear();
    },
  };
}

export const defaultTimelineRegistry = createTimelineRegistry();

export function registerTimeline(
  declaration: MotionTimelineDeclaration,
  registry: MotionTimelineRegistry = defaultTimelineRegistry,
): MotionTimelineRegistration {
  return registry.register(declaration);
}
