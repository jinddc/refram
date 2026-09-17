import type { MotionTimelineElement } from "../src/timeline/timeline-element";
import {
  attachTimelineInspector,
  type TimelineInspectionItem,
  type TimelineInspectionSnapshot,
  type TimelineInspectorAttachment,
} from "../src/timeline/timeline-inspection";

export interface TimelineDebuggerHandle {
  destroy(): void;
}

interface DebuggerElements {
  root: HTMLElement;
  driver: HTMLElement;
  readiness: HTMLElement;
  playState: HTMLElement;
  progress: HTMLOutputElement;
  duration: HTMLElement;
  rows: HTMLTableSectionElement;
  empty: HTMLElement;
  details: HTMLElement;
}

interface DebuggerRow {
  row: HTMLTableRowElement;
  button: HTMLButtonElement;
  position: HTMLTableCellElement;
  timing: HTMLTableCellElement;
  block: HTMLElement;
  timingText: HTMLElement;
}

interface DebuggerState {
  destroyed: boolean;
  attachment?: TimelineInspectorAttachment;
  frame?: number;
  pending?: TimelineInspectionSnapshot;
  snapshot?: TimelineInspectionSnapshot;
  renderedItems?: readonly TimelineInspectionItem[];
  selectedSource?: HTMLElement;
  rows: Map<HTMLElement, DebuggerRow>;
  elements: DebuggerElements;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  name: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(name);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createStatusItem(
  label: string,
  role: string,
): { item: HTMLElement; value: HTMLElement } {
  const item = createElement("div", "timeline-debugger__status-item");
  item.append(createElement("span", "timeline-debugger__status-label", label));
  const value = createElement("strong", "timeline-debugger__status-value", "—");
  value.dataset.role = role;
  item.append(value);
  return { item, value };
}

function createDebuggerElements(): DebuggerElements {
  const root = createElement("section", "timeline-debugger");
  root.dataset.timelineDebugger = "";
  root.style.setProperty("--timeline-debugger-progress", "0");

  const heading = createElement("div", "timeline-debugger__heading");
  const headingCopy = createElement("div");
  headingCopy.append(
    createElement("p", "timeline-debugger__eyebrow", "Internal inspection"),
    createElement("h2", "timeline-debugger__title", "Timeline debugger"),
  );
  heading.append(headingCopy);

  const status = createElement("div", "timeline-debugger__status");
  status.setAttribute("aria-label", "Timeline status");
  const driver = createStatusItem("Driver", "driver");
  const readiness = createStatusItem("Readiness", "readiness");
  const playState = createStatusItem("Play state", "play-state");
  const progress = createStatusItem("Progress", "progress");
  const duration = createStatusItem("Duration", "duration");
  const progressOutput = createElement("output", "timeline-debugger__status-value", "0.0%");
  progressOutput.dataset.role = "progress";
  progress.value.replaceWith(progressOutput);
  status.append(
    driver.item,
    readiness.item,
    playState.item,
    progress.item,
    duration.item,
  );

  const viewport = createElement("div", "timeline-debugger__viewport");
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", "Authored timeline visualization");

  const ruler = createElement("div", "timeline-debugger__ruler");
  for (const tick of ["0%", "25%", "50%", "75%", "100%"]) {
    ruler.append(createElement("span", "timeline-debugger__tick", tick));
  }
  const playhead = createElement("span", "timeline-debugger__playhead");
  playhead.setAttribute("aria-hidden", "true");
  ruler.append(playhead);

  const table = createElement("table", "timeline-debugger__table");
  const caption = createElement("caption", "timeline-debugger__sr-only", "Authored timeline items");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["Source", "Authored position", "Resolved timing"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headRow.append(cell);
  }
  head.append(headRow);
  const rows = document.createElement("tbody");
  rows.dataset.role = "rows";
  table.append(caption, head, rows);

  const empty = createElement("p", "timeline-debugger__empty", "No authored descriptors.");
  empty.dataset.role = "empty";
  viewport.append(ruler, table, empty);

  const detailsSection = createElement("section", "timeline-debugger__details");
  detailsSection.append(createElement("h3", "timeline-debugger__details-title", "Selected item"));
  const details = createElement("div", "timeline-debugger__details-content", "Select an authored row.");
  details.dataset.role = "details";
  detailsSection.append(details);

  root.append(heading, status, viewport, detailsSection);
  return {
    root,
    driver: driver.value,
    readiness: readiness.value,
    playState: playState.value,
    progress: progressOutput,
    duration: duration.value,
    rows,
    empty,
    details,
  };
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function formatSeconds(value: number): string {
  return `${Number(value.toFixed(3))}s`;
}

function formatPrimitive(value: unknown): string | undefined {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
    case "boolean":
    case "bigint":
      return String(value);
    case "undefined":
      return "undefined";
    case "symbol":
      return value.description ? `Symbol(${value.description})` : "Symbol";
    default:
      return undefined;
  }
}

function summarizeOpaque(value: unknown): string {
  const primitive = formatPrimitive(value);
  if (primitive !== undefined) return primitive;
  if (typeof value === "function") return "[Function]";
  if (typeof Element !== "undefined" && value instanceof Element) {
    return "[Element]";
  }
  if (Array.isArray(value)) return "[Array]";
  return "[Object]";
}

function summarizeRecord(value: unknown): readonly [string, string][] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [["value", summarizeOpaque(value)]];
  }

  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Object.entries(descriptors)
      .filter(([, descriptor]) => descriptor.enumerable)
      .map(([key, descriptor]) => [
        key,
        "value" in descriptor
          ? summarizeOpaque(descriptor.value)
          : "[Accessor]",
      ] as const);
  } catch {
    return [["value", "[Object]"]];
  }
}

function sourceLabel(source: HTMLElement): string {
  return `${source.localName}${source.id ? `#${source.id}` : ""}`;
}

function authoredPosition(item: TimelineInspectionItem): string {
  return item.authoredPosition === undefined
    ? "append"
    : String(item.authoredPosition);
}

function createRow(item: TimelineInspectionItem): DebuggerRow {
  const row = document.createElement("tr");
  row.className = "timeline-debugger__row";
  row.dataset.index = String(item.index);

  const sourceCell = document.createElement("th");
  sourceCell.scope = "row";
  const button = createElement("button", "timeline-debugger__row-button", sourceLabel(item.source));
  button.type = "button";
  button.dataset.index = String(item.index);
  button.setAttribute("aria-pressed", "false");
  sourceCell.append(button);

  const position = document.createElement("td");
  position.className = "timeline-debugger__position";

  const timing = document.createElement("td");
  timing.className = "timeline-debugger__timing";
  const track = createElement("div", "timeline-debugger__track");
  const block = createElement("span", "timeline-debugger__block");
  block.setAttribute("aria-hidden", "true");
  track.append(block);
  const timingText = createElement("span", "timeline-debugger__timing-text");
  timing.append(track, timingText);

  row.append(sourceCell, position, timing);
  return { row, button, position, timing, block, timingText };
}

function updateRow(
  row: DebuggerRow,
  item: TimelineInspectionItem,
  totalDuration: number,
): void {
  row.row.dataset.index = String(item.index);
  row.button.dataset.index = String(item.index);
  row.button.textContent = sourceLabel(item.source);
  row.position.textContent = authoredPosition(item);

  if (
    item.resolvedStart === null ||
    item.resolvedDuration === null ||
    item.resolvedEnd === null ||
    totalDuration <= 0
  ) {
    row.timing.dataset.available = "false";
    row.block.style.removeProperty("--timeline-debugger-start");
    row.block.style.removeProperty("--timeline-debugger-duration");
    row.timingText.textContent = "Unavailable";
    return;
  }

  row.timing.dataset.available = "true";
  row.block.style.setProperty(
    "--timeline-debugger-start",
    String(clampUnit(item.resolvedStart / totalDuration)),
  );
  row.block.style.setProperty(
    "--timeline-debugger-duration",
    String(clampUnit(item.resolvedDuration / totalDuration)),
  );
  row.timingText.textContent = `${formatSeconds(item.resolvedStart)}–${formatSeconds(item.resolvedEnd)}`;
}

function appendDetail(
  list: HTMLDListElement,
  term: string,
  description: string,
): void {
  list.append(
    createElement("dt", "timeline-debugger__detail-term", term),
    createElement("dd", "timeline-debugger__detail-value", description),
  );
}

function appendSummary(
  container: HTMLElement,
  label: string,
  value: unknown,
): void {
  const section = createElement("section", "timeline-debugger__summary");
  section.append(createElement("h4", "timeline-debugger__summary-title", label));
  const list = createElement("dl", "timeline-debugger__summary-list");
  const entries = summarizeRecord(value);
  if (entries.length === 0) {
    appendDetail(list, "value", "[Object]");
  } else {
    for (const [key, summary] of entries) appendDetail(list, key, summary);
  }
  section.append(list);
  container.append(section);
}

function renderDetails(state: DebuggerState): void {
  const { details } = state.elements;
  details.replaceChildren();
  const item = state.snapshot?.items.find(
    (candidate) => candidate.source === state.selectedSource,
  );
  if (!item) {
    details.textContent = state.snapshot?.items.length
      ? "Select an authored row."
      : "No authored item is available.";
    return;
  }

  const facts = createElement("dl", "timeline-debugger__facts");
  appendDetail(facts, "Index", String(item.index));
  appendDetail(facts, "Runnable", item.runnable ? "Yes" : "No");
  appendDetail(
    facts,
    "Duration",
    item.authoredDuration === undefined
      ? "Inherited"
      : formatSeconds(item.authoredDuration),
  );
  appendDetail(facts, "Ease", item.authoredEase ?? "Inherited");
  details.append(facts);
  appendSummary(details, "From", item.from);
  appendSummary(details, "To", item.to);
}

function updateSelection(state: DebuggerState): void {
  for (const [source, row] of state.rows) {
    const selected = source === state.selectedSource;
    row.row.dataset.selected = String(selected);
    row.button.setAttribute("aria-pressed", String(selected));
  }
  renderDetails(state);
}

function reconcileRows(
  state: DebuggerState,
  snapshot: TimelineInspectionSnapshot,
): void {
  const nextSources = new Set(snapshot.items.map((item) => item.source));
  for (const [source, row] of state.rows) {
    if (!nextSources.has(source)) {
      row.row.remove();
      state.rows.delete(source);
    }
  }

  const fragment = document.createDocumentFragment();
  for (const item of snapshot.items) {
    let row = state.rows.get(item.source);
    if (!row) {
      row = createRow(item);
      state.rows.set(item.source, row);
    }
    updateRow(row, item, snapshot.totalDuration);
    fragment.append(row.row);
  }
  state.elements.rows.replaceChildren(fragment);
  state.elements.empty.hidden = snapshot.items.length > 0;

  if (!state.selectedSource || !nextSources.has(state.selectedSource)) {
    state.selectedSource = snapshot.items[0]?.source;
  }
  state.renderedItems = snapshot.items;
  updateSelection(state);
}

function renderSnapshot(
  state: DebuggerState,
  snapshot: TimelineInspectionSnapshot,
): void {
  if (state.destroyed) return;
  state.snapshot = snapshot;
  state.elements.root.dataset.readiness = snapshot.readiness;
  state.elements.root.style.setProperty(
    "--timeline-debugger-progress",
    String(clampUnit(snapshot.progress)),
  );
  state.elements.driver.textContent = snapshot.driver;
  state.elements.readiness.textContent = snapshot.readiness;
  state.elements.playState.textContent = snapshot.playState;
  state.elements.progress.value = `${(clampUnit(snapshot.progress) * 100).toFixed(1)}%`;
  state.elements.progress.textContent = state.elements.progress.value;
  state.elements.duration.textContent = formatSeconds(snapshot.totalDuration);

  if (snapshot.items !== state.renderedItems) {
    reconcileRows(state, snapshot);
  }
}

function scheduleSnapshot(
  state: DebuggerState,
  snapshot: TimelineInspectionSnapshot,
): void {
  if (state.destroyed) return;
  if (!state.snapshot) {
    renderSnapshot(state, snapshot);
    return;
  }

  state.pending = snapshot;
  if (state.frame !== undefined) return;
  if (typeof requestAnimationFrame !== "function") {
    const pending = state.pending;
    state.pending = undefined;
    if (pending) renderSnapshot(state, pending);
    return;
  }

  state.frame = requestAnimationFrame(() => {
    state.frame = undefined;
    const pending = state.pending;
    state.pending = undefined;
    if (pending) renderSnapshot(state, pending);
  });
}

export function mountTimelineDebugger(
  container: HTMLElement,
  timeline: MotionTimelineElement,
): TimelineDebuggerHandle {
  const elements = createDebuggerElements();
  const state: DebuggerState = {
    destroyed: false,
    rows: new Map(),
    elements,
  };

  const handleClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>(".timeline-debugger__row-button");
    if (!button || !elements.root.contains(button)) return;
    const index = Number(button.dataset.index);
    const item = state.snapshot?.items.find((candidate) => candidate.index === index);
    if (!item) return;
    state.selectedSource = item.source;
    updateSelection(state);
  };

  elements.root.addEventListener("click", handleClick);
  container.append(elements.root);

  try {
    state.attachment = attachTimelineInspector(
      timeline,
      (snapshot) => scheduleSnapshot(state, snapshot),
      { progress: true },
    );
  } catch (error) {
    elements.root.removeEventListener("click", handleClick);
    elements.root.remove();
    state.destroyed = true;
    throw error;
  }

  return {
    destroy(): void {
      if (state.destroyed) return;
      state.destroyed = true;
      if (state.frame !== undefined && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(state.frame);
      }
      state.frame = undefined;
      state.pending = undefined;
      state.attachment?.detach();
      state.attachment = undefined;
      elements.root.removeEventListener("click", handleClick);
      elements.root.remove();
      state.rows.clear();
      state.selectedSource = undefined;
      state.renderedItems = undefined;
      state.snapshot = undefined;
    },
  };
}
