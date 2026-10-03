import type { gsap } from "gsap";
import type { MotionTimelineRegistration } from "../timeline-registry";
import type { MarkerTriggerLike } from "./marker-geometry";
import { createScrollTriggerNativeMarkers } from "./native-markers";
import { createScrollTriggerOwnedMarkers } from "./owned-markers";

function scrollTriggerOf(timeline: gsap.core.Timeline): MarkerTriggerLike | undefined {
  return (timeline as gsap.core.Timeline & {
    readonly scrollTrigger?: MarkerTriggerLike;
  }).scrollTrigger;
}

export interface ScrollTriggerMarkerPresentation {
  activate(timelineId: string, timeline: gsap.core.Timeline): boolean;
  canPresent(timeline: gsap.core.Timeline): boolean;
  isVisible(timelineId: string): boolean;
  setVisible(timelineId: string, timeline: gsap.core.Timeline, visible: boolean): boolean;
  sync(
    registrations: readonly MotionTimelineRegistration[],
    selectedTimelineId: string | undefined,
  ): void;
  destroy(): void;
}

interface ReconciledRegistration {
  readonly id: string;
  readonly timeline: gsap.core.Timeline;
}

function sameRegistrations(
  previous: readonly ReconciledRegistration[],
  registrations: readonly MotionTimelineRegistration[],
): boolean {
  return previous.length === registrations.length && previous.every((entry, index) => (
    entry.id === registrations[index]?.id
      && entry.timeline === registrations[index]?.timeline
  ));
}

export function createScrollTriggerMarkerPresentation(): ScrollTriggerMarkerPresentation {
  const ownedMarkers = createScrollTriggerOwnedMarkers();
  const nativeMarkers = createScrollTriggerNativeMarkers(ownedMarkers.ensureDocument);
  const visibilityByTimeline = new Map<string, boolean>();
  let reconciledRegistrations: readonly ReconciledRegistration[] = [];
  let reconciledSelection: string | undefined;
  let reconciledSelectionUsesNative: boolean | undefined;
  let reconciliationDirty = true;

  const canPresent = (timeline: gsap.core.Timeline): boolean => {
    const trigger = scrollTriggerOf(timeline);
    return nativeMarkers.nodesFor(timeline, trigger).length > 0 || ownedMarkers.canCreate(trigger);
  };

  return {
    activate(timelineId, timeline) {
      if (!canPresent(timeline)) return false;
      if (!visibilityByTimeline.has(timelineId)) {
        visibilityByTimeline.set(timelineId, true);
        reconciliationDirty = true;
      }
      return true;
    },
    canPresent,
    isVisible(timelineId) {
      return visibilityByTimeline.get(timelineId) === true;
    },
    setVisible(timelineId, timeline, visible) {
      if (!canPresent(timeline)) return false;
      if (visibilityByTimeline.get(timelineId) !== visible) {
        visibilityByTimeline.set(timelineId, visible);
        reconciliationDirty = true;
      }
      return true;
    },
    sync(registrations, selectedTimelineId) {
      const selected = registrations.find(({ id }) => id === selectedTimelineId);
      const selectedTrigger = selected ? scrollTriggerOf(selected.timeline) : undefined;
      const selectedNodes = selected
        ? nativeMarkers.nodesFor(selected.timeline, selectedTrigger)
        : [];
      const selectedUsesNative = selectedNodes.length > 0;
      const registrationsChanged = !sameRegistrations(reconciledRegistrations, registrations);
      const selectionChanged = reconciledSelection !== selectedTimelineId;
      const selectedMarkerModeChanged = !selectionChanged
        && selected !== undefined
        && reconciledSelectionUsesNative !== undefined
        && reconciledSelectionUsesNative !== selectedUsesNative;
      if (reconciliationDirty || registrationsChanged || selectionChanged
        || selectedMarkerModeChanged) {
        const currentTimelineIds = new Set(registrations.map(({ id }) => id));
        const currentTimelines = new Set(registrations.map(({ timeline }) => timeline));
        const entries = registrations.map((registration) => {
          const isSelected = registration === selected;
          const trigger = isSelected ? selectedTrigger : scrollTriggerOf(registration.timeline);
          const nodes = isSelected
            ? selectedNodes
            : nativeMarkers.nodesFor(registration.timeline, trigger);
          const visible = registration.id === selectedTimelineId
            && visibilityByTimeline.get(registration.id) === true;
          ownedMarkers.reconcile(
            registration.timeline,
            trigger,
            visible && nodes.length === 0,
          );
          return { timeline: registration.timeline, trigger, visible };
        });
        nativeMarkers.reconcile(entries);
        ownedMarkers.removeMissing(currentTimelines);
        for (const timelineId of visibilityByTimeline.keys()) {
          if (!currentTimelineIds.has(timelineId)) visibilityByTimeline.delete(timelineId);
        }
        reconciledRegistrations = registrations.map(({ id, timeline }) => ({ id, timeline }));
        reconciledSelection = selectedTimelineId;
        reconciledSelectionUsesNative = selected ? selectedUsesNative : undefined;
        reconciliationDirty = false;
      }

      let applyDocumentGeometry = (): void => {};
      if (selected && visibilityByTimeline.get(selected.id) === true) {
        if (selectedTrigger) {
          if (selectedNodes.length > 0) {
            applyDocumentGeometry = ownedMarkers.measureDocument(
              selectedNodes[0]?.ownerDocument,
            );
            nativeMarkers.sampleVisible(selectedTrigger, selectedNodes);
          } else {
            ownedMarkers.sampleVisible(selected.timeline, selectedTrigger);
          }
        }
      }
      applyDocumentGeometry();
    },
    destroy() {
      nativeMarkers.destroy();
      ownedMarkers.destroy();
      visibilityByTimeline.clear();
      reconciledRegistrations = [];
      reconciledSelection = undefined;
      reconciledSelectionUsesNative = undefined;
      reconciliationDirty = true;
    },
  };
}
