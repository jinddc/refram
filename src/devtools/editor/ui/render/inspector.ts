import type { EditorViewState } from "../../view-state";
import type { EditorUiElements } from "../dom";
import { createRenderNode, formatInspectorTime } from "./shared";

function inspectorField(label: string, value: string, truncate = false): HTMLDivElement {
  const field = createRenderNode("div", "rf__inspector-field");
  const valueNode = createRenderNode("dd", "rf__inspector-value", value);
  if (truncate) {
    valueNode.classList.add("rf__inspector-value--truncate");
    valueNode.title = value;
  }
  field.append(createRenderNode("dt", "rf__inspector-term", label), valueNode);
  return field;
}

function formatInspectorProgress(value: number): string {
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

function formatRawScrollPosition(value: string | number | undefined): string {
  if (typeof value === "number") return `${value}px`;
  return value ?? "Default";
}

function formatMarkersStatus(markers: false | true | object): string {
  if (markers === false) return "Off";
  return markers === true ? "On" : "On (custom)";
}

export function renderInspector(elements: EditorUiElements, view: EditorViewState): void {
  const inspector = view.inspector;
  elements.inspectorEmpty.hidden = inspector !== undefined;
  elements.inspectorContent.hidden = inspector === undefined;
  elements.inspectorActions.hidden = inspector === undefined;
  const statusTrackKey = elements.copyDebugStatus.dataset.trackKey;
  if (statusTrackKey !== inspector?.trackKey) {
    elements.copyDebugStatus.textContent = "";
    elements.copyDebugStatus.dataset.state = "";
    elements.copyDebugStatus.dataset.trackKey = inspector?.trackKey ?? "";
  }
  elements.copyDebugButton.disabled = inspector === undefined
    || elements.copyDebugStatus.dataset.state === "pending";
  if (!inspector) {
    elements.inspectorContent.replaceChildren();
    elements.inspectorContent.dataset.signature = "";
    return;
  }
  const ease = inspector.mixedEase ? "Mixed" : inspector.ease ?? "Unavailable";
  const signature = [
    inspector.trackKey, inspector.label, inspector.start, inspector.duration, inspector.end,
    ease, inspector.animatedTargetCount, inspector.visualTargetCount,
    inspector.properties.join(","), view.scrollTrigger?.start, view.scrollTrigger?.end,
    view.scrollTrigger?.rawStart, view.scrollTrigger?.rawEnd, view.scrollTrigger?.distance,
    view.scrollTrigger?.progress, view.scrollTrigger?.animationProgress,
    view.scrollTrigger?.state, view.scrollTrigger?.direction, view.scrollTrigger?.scrub,
    view.scrollTrigger?.pin, view.scrollTrigger?.trigger, view.scrollTrigger?.scroller,
    JSON.stringify(view.scrollTrigger?.markers),
  ].join("|");
  if (elements.inspectorContent.dataset.signature === signature) return;
  elements.inspectorContent.dataset.signature = signature;

  const identity = createRenderNode("div", "rf__inspector-identity");
  identity.append(createRenderNode("div", "rf__inspector-label", inspector.label));
  const details = createRenderNode("dl", "rf__inspector-details");
  const targetFields = inspector.animatedTargetCount === inspector.visualTargetCount
    ? [inspectorField("Targets", String(inspector.animatedTargetCount))]
    : [
      inspectorField("Animated objects", String(inspector.animatedTargetCount)),
      inspectorField("Preview elements", String(inspector.visualTargetCount)),
    ];
  const scrollTrigger = view.scrollTrigger;
  const scrollTriggerFields = scrollTrigger
    ? [
      inspectorField("ScrollTrigger state", scrollTrigger.state[0]!.toUpperCase()
        + scrollTrigger.state.slice(1)),
      inspectorField("Raw start", formatRawScrollPosition(scrollTrigger.rawStart)),
      inspectorField("Raw end", formatRawScrollPosition(scrollTrigger.rawEnd)),
      inspectorField("Resolved start", `${scrollTrigger.start.toFixed(2)}px`),
      inspectorField("Resolved end", `${scrollTrigger.end.toFixed(2)}px`),
      inspectorField("Scroll distance", `${scrollTrigger.distance.toFixed(2)}px`),
      inspectorField("Scrub", typeof scrollTrigger.scrub === "number"
        ? `${scrollTrigger.scrub}s`
        : scrollTrigger.scrub ? "Enabled" : "Disabled"),
      inspectorField("Pin", scrollTrigger.pin ?? "None"),
      inspectorField("Trigger", scrollTrigger.trigger ?? "Unavailable", true),
      inspectorField("Scroller", scrollTrigger.scroller, true),
      inspectorField("Markers", formatMarkersStatus(scrollTrigger.markers)),
      inspectorField("Direction", scrollTrigger.direction < 0
        ? "Backward"
        : scrollTrigger.direction > 0 ? "Forward" : "Idle"),
      inspectorField("Scroll progress", formatInspectorProgress(scrollTrigger.progress)),
      ...(typeof scrollTrigger.scrub === "number"
        ? [inspectorField(
          "Animation progress",
          formatInspectorProgress(scrollTrigger.animationProgress),
        )]
        : []),
    ]
    : [];
  details.append(
    inspectorField("Start", formatInspectorTime(inspector.start)),
    inspectorField("Duration", formatInspectorTime(inspector.duration)),
    inspectorField("End", formatInspectorTime(inspector.end)),
    inspectorField("Ease", ease),
    ...targetFields,
    inspectorField("Properties", inspector.properties.length > 0
      ? inspector.properties.join(", ")
      : "Unavailable"),
    ...scrollTriggerFields,
  );
  elements.inspectorContent.replaceChildren(identity, details);
}
