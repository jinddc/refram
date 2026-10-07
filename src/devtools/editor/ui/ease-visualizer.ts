import { gsap } from "gsap";
import type { TimelineInspectionItem } from "../../timeline/session";

const SAMPLE_COUNT = 257;
const MAX_STEP_COUNT = 1023;
const GRAPH_VIEW_BOX_LEFT = 27;
const GRAPH_VIEW_BOX_WIDTH = 206;
const GRAPH_HEIGHT = 180;
const PLOT_LEFT = 28;
const PLOT_RIGHT = 232;
const PLOT_TOP = 10;
const PLOT_BOTTOM = 156;

type EaseValue = string | gsap.EaseFunction | undefined;

interface EaseAnimationShape extends gsap.core.Animation {
  readonly vars?: Readonly<{
    ease?: unknown;
    easeReverse?: unknown;
    keyframes?: unknown;
    stagger?: unknown;
    yoyoEase?: unknown;
  }>;
}

interface SamplePoint {
  readonly input: number;
  readonly output: number;
}

export interface EaseVisualizerIdentity {
  readonly scope: "Track" | "Timeline";
  readonly timelineDefaultDeclared: boolean;
  readonly label: string;
  readonly animations: readonly gsap.core.Animation[];
  readonly eases: readonly EaseValue[];
  readonly composite: readonly boolean[];
  readonly reverse: readonly boolean[];
}

interface EaseVisualizationBase {
  readonly scope: "Track" | "Timeline";
  readonly label: string;
  readonly name: string;
  readonly type: string;
  readonly message: string;
  readonly reverseNote: boolean;
}

export type EaseVisualization = EaseVisualizationBase & (
  | Readonly<{
    readonly status: "ready";
    readonly path: string;
    readonly zeroY: number;
    readonly oneY: number;
    readonly outputRange: string;
    readonly graphDescription: string;
  }>
  | Readonly<{
    readonly status: "default" | "mixed" | "unsupported" | "unavailable" | "failed";
  }>
);

function animationShape(animation: gsap.core.Animation): EaseAnimationShape {
  return animation as EaseAnimationShape;
}

function easeValue(animation: gsap.core.Animation): EaseValue {
  const value = animationShape(animation).vars?.ease;
  return typeof value === "string" || typeof value === "function"
    ? value as EaseValue
    : undefined;
}

function isComposite(animation: gsap.core.Animation): boolean {
  const vars = animationShape(animation).vars;
  return animation instanceof gsap.core.Timeline
    || vars?.keyframes !== undefined
    || vars?.stagger !== undefined;
}

function hasReverseEase(animation: gsap.core.Animation): boolean {
  const vars = animationShape(animation).vars;
  return (vars?.easeReverse !== undefined && vars.easeReverse !== false)
    || (vars?.yoyoEase !== undefined && vars.yoyoEase !== false);
}

export function readEaseVisualizerIdentity(
  item: TimelineInspectionItem,
  displayLabel?: string,
): EaseVisualizerIdentity {
  return Object.freeze({
    scope: "Track",
    timelineDefaultDeclared: false,
    label: displayLabel?.trim() || item.label?.trim() || "Selected track",
    animations: Object.freeze([...item.animations]),
    eases: Object.freeze(item.animations.map(easeValue)),
    composite: Object.freeze(item.animations.map(isComposite)),
    reverse: Object.freeze(item.animations.map(hasReverseEase)),
  });
}

export function readTimelineEaseVisualizerIdentity(
  timeline: gsap.core.Timeline,
  displayLabel?: string,
): EaseVisualizerIdentity {
  const vars = timeline.vars as Readonly<{
    defaults?: Readonly<{ ease?: unknown }>;
  }>;
  const value = vars.defaults?.ease;
  const ease = typeof value === "string" || typeof value === "function"
    ? value as EaseValue
    : undefined;
  return Object.freeze({
    scope: "Timeline",
    timelineDefaultDeclared: value !== undefined,
    label: displayLabel?.trim() || "Active timeline",
    animations: Object.freeze([timeline]),
    eases: Object.freeze([ease]),
    composite: Object.freeze([false]),
    reverse: Object.freeze([false]),
  });
}

export function sameEaseVisualizerIdentity(
  first: EaseVisualizerIdentity | undefined,
  second: EaseVisualizerIdentity,
): boolean {
  if (!first
    || first.scope !== second.scope
    || first.label !== second.label
    || first.timelineDefaultDeclared !== second.timelineDefaultDeclared) return false;
  if (first.animations.length !== second.animations.length) return false;
  return second.animations.every((animation, index) => (
    first.animations[index] === animation
    && first.eases[index] === second.eases[index]
    && first.composite[index] === second.composite[index]
    && first.reverse[index] === second.reverse[index]
  ));
}

function stepsCount(value: EaseValue): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^steps\(\s*(\d+)\s*\)$/i.exec(value.trim());
  if (!match) return undefined;
  const count = Number(match[1]);
  return Number.isSafeInteger(count) && count > 0
    ? Math.min(count, MAX_STEP_COUNT)
    : undefined;
}

function sampleEase(
  ease: gsap.EaseFunction,
  stepCount: number | undefined,
): readonly SamplePoint[] | undefined {
  const points: SamplePoint[] = [];
  try {
    if (stepCount !== undefined) {
      let previous = ease(0);
      if (!Number.isFinite(previous)) return undefined;
      points.push({ input: 0, output: previous });
      for (let index = 1; index <= stepCount; index += 1) {
        const input = index / stepCount;
        const output = ease(input);
        if (!Number.isFinite(output)) return undefined;
        points.push({ input, output: previous }, { input, output });
        previous = output;
      }
    } else {
      for (let index = 0; index < SAMPLE_COUNT; index += 1) {
        const input = index / (SAMPLE_COUNT - 1);
        const output = ease(input);
        if (!Number.isFinite(output)) return undefined;
        points.push({ input, output });
      }
    }
  } catch {
    return undefined;
  }
  return Object.freeze(points);
}

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

function rangeValue(value: number): string {
  const result = rounded(value);
  return Object.is(result, -0) ? "0" : String(result);
}

function graphGeometry(points: readonly SamplePoint[]): Pick<
  Extract<EaseVisualization, { readonly status: "ready" }>,
  "path" | "zeroY" | "oneY" | "outputRange" | "graphDescription"
> {
  const outputs = points.map(({ output }) => output);
  const minimum = Math.min(0, 1, ...outputs);
  const maximum = Math.max(0, 1, ...outputs);
  const span = Math.max(maximum - minimum, Number.EPSILON);
  const x = (input: number): number => (
    PLOT_LEFT + input * (PLOT_RIGHT - PLOT_LEFT)
  );
  const y = (output: number): number => (
    PLOT_BOTTOM - ((output - minimum) / span) * (PLOT_BOTTOM - PLOT_TOP)
  );
  const path = points.map((point, index) => (
    `${index === 0 ? "M" : "L"}${rounded(x(point.input))} ${rounded(y(point.output))}`
  )).join(" ");
  const outputRange = `${rangeValue(minimum)} to ${rangeValue(maximum)}`;
  return Object.freeze({
    path,
    zeroY: rounded(y(0)),
    oneY: rounded(y(1)),
    outputRange,
    graphDescription: `Sampled input from 0 to 1. Output range ${outputRange}.`,
  });
}

function unavailable(
  identity: EaseVisualizerIdentity,
  status: "default" | "mixed" | "unsupported" | "unavailable" | "failed",
  name: string,
  type: string,
  message: string,
): EaseVisualization {
  return Object.freeze({
    status,
    scope: identity.scope,
    label: identity.label,
    name,
    type,
    message,
    reverseNote: identity.reverse.some(Boolean),
  });
}

export function buildEaseVisualization(
  identity: EaseVisualizerIdentity,
): EaseVisualization {
  if (identity.composite.some(Boolean)) {
    return unavailable(
      identity,
      "unsupported",
      "Unsupported composite",
      "Composite",
      "Keyframes, stagger, and nested timelines are not graphed as one ease.",
    );
  }
  const first = identity.eases[0];
  if (identity.eases.some((ease) => ease !== first)) {
    return unavailable(
      identity,
      "mixed",
      "Mixed",
      "Multiple eases",
      "Track này có nhiều ease",
    );
  }
  if (first === undefined) {
    if (identity.scope === "Timeline") {
      if (identity.timelineDefaultDeclared) {
        return unavailable(
          identity,
          "unavailable",
          "Unavailable",
          "Unreadable timeline default",
          "The configured timeline default could not be read.",
        );
      }
      return unavailable(
        identity,
        "default",
        "Default",
        "Timeline default",
        "No defaults.ease declared",
      );
    }
    return unavailable(
      identity,
      "unavailable",
      "Unavailable",
      "No readable ease",
      "No configured ease is available to inspect.",
    );
  }
  let parsed: gsap.EaseFunction | undefined;
  try {
    parsed = gsap.parseEase(first);
  } catch {
    parsed = undefined;
  }
  if (typeof parsed !== "function") {
    return unavailable(
      identity,
      "unavailable",
      "Unavailable",
      typeof first === "string" ? "Unrecognized string" : "Function ease",
      "The configured ease could not be resolved.",
    );
  }
  const stepCount = stepsCount(first);
  const points = sampleEase(parsed, stepCount);
  const name = typeof first === "string"
    ? first
    : first.name.trim() || "Function ease";
  const type = stepCount !== undefined
    ? "Steps"
    : typeof first === "string"
      ? "Configured string"
      : "Function";
  if (!points) {
    return unavailable(
      identity,
      "failed",
      name,
      type,
      "Sampling failed",
    );
  }
  const sampleLabel = stepCount !== undefined
    ? stepCount === Number(/^steps\(\s*(\d+)/i.exec(String(first))?.[1])
      ? `Sampled · ${stepCount} steps`
      : `Sampled · ${stepCount}-step preview`
    : `Sampled · ${SAMPLE_COUNT} points`;
  return Object.freeze({
    status: "ready",
    scope: identity.scope,
    label: identity.label,
    name,
    type,
    message: sampleLabel,
    reverseNote: identity.reverse.some(Boolean),
    ...graphGeometry(points),
  });
}

export const EASE_GRAPH_VIEW_BOX = `${GRAPH_VIEW_BOX_LEFT} 0 ${GRAPH_VIEW_BOX_WIDTH} ${GRAPH_HEIGHT}`;

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing Ease visualizer element: ${selector}`);
  return node;
}

export function renderEaseVisualization(
  dialog: HTMLElement,
  visualization: EaseVisualization,
): void {
  requiredElement<HTMLElement>(dialog, "[data-role='ease-track']").textContent =
    `${visualization.scope} · ${visualization.label}`;
  requiredElement<HTMLElement>(dialog, "[data-role='ease-name']").textContent =
    visualization.name;
  requiredElement<HTMLElement>(dialog, "[data-role='ease-type']").textContent =
    visualization.type;
  const status = requiredElement<HTMLElement>(dialog, "[data-role='ease-status']");
  status.textContent = visualization.message;
  status.hidden = visualization.status === "ready";
  const graph = requiredElement<SVGSVGElement>(dialog, "[data-role='ease-graph']");
  const reverseNote = requiredElement<HTMLElement>(dialog, "[data-role='ease-reverse-note']");
  graph.toggleAttribute("hidden", visualization.status !== "ready");
  reverseNote.hidden = !visualization.reverseNote;
  dialog.dataset.easeStatus = visualization.status;
  if (visualization.status !== "ready") {
    requiredElement<SVGPathElement>(dialog, "[data-role='ease-curve']").removeAttribute("d");
    return;
  }
  const zeroLine = requiredElement<SVGLineElement>(dialog, "[data-role='ease-zero-line']");
  zeroLine.setAttribute("y1", String(visualization.zeroY));
  zeroLine.setAttribute("y2", String(visualization.zeroY));
  const oneLine = requiredElement<SVGLineElement>(dialog, "[data-role='ease-one-line']");
  oneLine.setAttribute("y1", String(visualization.oneY));
  oneLine.setAttribute("y2", String(visualization.oneY));
  requiredElement<SVGPathElement>(dialog, "[data-role='ease-curve']")
    .setAttribute("d", visualization.path);
  requiredElement<SVGElement>(dialog, "[data-role='ease-graph-description']").textContent =
    visualization.graphDescription;
}

export function clearEaseVisualization(dialog: HTMLElement): void {
  requiredElement<HTMLElement>(dialog, "[data-role='ease-track']").textContent =
    "Track · Selected track";
  requiredElement<HTMLElement>(dialog, "[data-role='ease-name']").textContent = "Unavailable";
  requiredElement<HTMLElement>(dialog, "[data-role='ease-type']").textContent = "No readable ease";
  const status = requiredElement<HTMLElement>(dialog, "[data-role='ease-status']");
  status.textContent = "Unavailable";
  status.hidden = false;
  requiredElement<SVGSVGElement>(dialog, "[data-role='ease-graph']")
    .setAttribute("hidden", "");
  requiredElement<SVGPathElement>(dialog, "[data-role='ease-curve']").removeAttribute("d");
  requiredElement<HTMLElement>(dialog, "[data-role='ease-reverse-note']").hidden = true;
  dialog.dataset.easeStatus = "unavailable";
}
