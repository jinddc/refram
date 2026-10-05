import type { TimelineInspectionPropertyValue } from "../../../timeline/session";
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

function formatTweenMode(mode: "to" | "from" | "fromTo" | "mixed"): string {
  if (mode === "fromTo") return "FromTo";
  return mode[0]!.toUpperCase() + mode.slice(1);
}

function formatPropertyValue(value: TimelineInspectionPropertyValue): string {
  if (value.kind === "literal") return typeof value.value === "string"
    ? JSON.stringify(value.value)
    : String(value.value);
  if (value.kind === "undefined") return "Undefined";
  if (value.kind === "implicit") return "Current";
  return value.kind[0]!.toUpperCase() + value.kind.slice(1);
}

function formatPropertyDisplayValue(value: TimelineInspectionPropertyValue): string {
  if (value.kind !== "literal" || typeof value.value !== "string") {
    return formatPropertyValue(value);
  }
  const relativeNumber = /^([+-]=)(-?(?:\d+(?:\.\d*)?|\.\d+))([a-z%]*)$/i.exec(value.value);
  if (!relativeNumber) return formatPropertyValue(value);
  const numericValue = Number(relativeNumber[2]);
  if (!Number.isFinite(numericValue)) return formatPropertyValue(value);
  const roundedValue = Math.round(numericValue * 100) / 100;
  return JSON.stringify(`${relativeNumber[1]}${roundedValue}${relativeNumber[3]}`);
}

function propertyValueNode(value: TimelineInspectionPropertyValue): HTMLTableCellElement {
  const exactValue = formatPropertyValue(value);
  const displayValue = formatPropertyDisplayValue(value);
  const node = createRenderNode("td", "rf__property-value", displayValue);
  if (value.kind === "literal" && typeof value.value === "string") {
    node.title = exactValue;
  }
  return node;
}

function propertyTable(
  properties: NonNullable<EditorViewState["inspector"]>["propertyDetails"],
): HTMLTableElement {
  const table = createRenderNode("table", "rf__property-table");
  const columns = createRenderNode("colgroup", "");
  columns.append(
    createRenderNode("col", "rf__property-name-column"),
    createRenderNode("col", "rf__property-value-column"),
    createRenderNode("col", "rf__property-value-column"),
  );
  table.append(
    createRenderNode("caption", "rf__visually-hidden", "Authored property values"),
    columns,
  );
  const head = createRenderNode("thead", "");
  const headingRow = createRenderNode("tr", "");
  for (const label of ["Property", "From", "To"]) {
    const heading = createRenderNode("th", "rf__property-heading", label);
    heading.scope = "col";
    headingRow.append(heading);
  }
  head.append(headingRow);
  const body = createRenderNode("tbody", "");
  for (const property of properties) {
    const row = createRenderNode("tr", "");
    const name = createRenderNode("th", "rf__property-name", property.name);
    name.scope = "row";
    name.title = property.name;
    row.append(
      name,
      propertyValueNode(property.from),
      propertyValueNode(property.to),
    );
    body.append(row);
  }
  table.append(head, body);
  return table;
}

export function renderInspector(elements: EditorUiElements, view: EditorViewState): void {
  const inspector = view.inspector;
  elements.inspectorEmpty.hidden = inspector !== undefined;
  elements.inspectorContent.hidden = inspector === undefined;
  if (!inspector) {
    elements.inspectorContent.replaceChildren();
    elements.inspectorContent.dataset.signature = "";
    return;
  }
  const ease = inspector.mixedEase ? "Mixed" : inspector.ease ?? "Unavailable";
  const signature = [
    inspector.trackKey, inspector.label, inspector.start, inspector.duration, inspector.end,
    ease, inspector.animatedTargetCount, inspector.visualTargetCount,
    inspector.mode,
    ...inspector.propertyDetails.flatMap((property) => [
      property.name,
      formatPropertyValue(property.from),
      property.from.kind === "literal" && property.from.truncated ? "truncated" : "",
      formatPropertyValue(property.to),
      property.to.kind === "literal" && property.to.truncated ? "truncated" : "",
    ]),
    view.scrollTrigger?.start, view.scrollTrigger?.end,
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
    inspectorField("Tween type", formatTweenMode(inspector.mode)),
    ...(inspector.propertyDetails.length === 0
      ? [inspectorField("Properties", "Unavailable")]
      : []),
    ...scrollTriggerFields,
  );
  elements.inspectorContent.replaceChildren(
    identity,
    details,
    ...(inspector.propertyDetails.length > 0 ? [propertyTable(inspector.propertyDetails)] : []),
  );
}
