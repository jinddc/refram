import type { gsap } from "gsap";
import type { MotionTimelineReplayState } from "./timeline-control";
import type { EditorTimeWindow } from "./editor-time";
import type {
  TimelineInspectionItem,
  TimelineInspectionSnapshot,
  TimelinePlayState,
} from "./timeline-session";

export interface EditorViewTimeline {
  readonly id: string;
  readonly label: string;
}

export interface EditorViewInput {
  readonly timelines: readonly EditorViewTimeline[];
  readonly activeTimelineId: string | undefined;
  readonly replayState: MotionTimelineReplayState | undefined;
  readonly inspection: TimelineInspectionSnapshot | undefined;
  readonly timeWindow: EditorTimeWindow | undefined;
  readonly selectedItem: TimelineInspectionItem | undefined;
  readonly error: unknown;
}

export interface EditorViewTrackSpan {
  readonly start: number;
  readonly end: number;
}

export interface EditorViewTrack {
  readonly key: string;
  readonly index: number;
  readonly label: string;
  readonly trackId: string | undefined;
  readonly animatedTargetCount: number;
  readonly visualTargetCount: number;
  readonly selected: boolean;
  readonly spans: readonly EditorViewTrackSpan[];
}

export interface EditorViewInspector {
  readonly trackKey: string;
  readonly label: string;
  readonly mapping: "authored" | "automatic";
  readonly start: number;
  readonly duration: number;
  readonly end: number;
  readonly ease: string | undefined;
  readonly mixedEase: boolean;
  readonly animatedTargetCount: number;
  readonly visualTargetCount: number;
}

export type EditorViewStatus =
  | "empty"
  | "connecting"
  | "ready"
  | "not-ready"
  | "retryable"
  | "blocked"
  | "error";

export interface EditorViewTransport {
  readonly playState: TimelinePlayState | undefined;
  readonly timeScale: number | undefined;
  readonly canPlay: boolean;
  readonly canPause: boolean;
  readonly canSeek: boolean;
  readonly canSetTimeScale: boolean;
  readonly canReplay: boolean;
  readonly canRetryReplay: boolean;
}

export interface EditorViewState {
  readonly timelines: readonly EditorViewTimeline[];
  readonly activeTimelineId: string | undefined;
  readonly status: EditorViewStatus;
  readonly time: EditorTimeWindow | undefined;
  readonly tracks: readonly EditorViewTrack[];
  readonly selectedTrackKey: string | undefined;
  readonly inspector: EditorViewInspector | undefined;
  readonly transport: EditorViewTransport;
  readonly error: unknown;
}

export function editorTrackKey(item: TimelineInspectionItem): string {
  const sourceKey = (item.source as HTMLElement).dataset.key;
  if (sourceKey) return sourceKey;
  return item.trackId === undefined
    ? `animation:${item.index}`
    : `track:${item.trackId}`;
}

function trackLabel(item: TimelineInspectionItem): string {
  if (item.label) return item.label;
  const sourceLabel = (item.source as HTMLElement).dataset.label ?? item.source.localName;
  const source = item.source.id ? `#${item.source.id}` : sourceLabel;
  return item.sources.length > 1 ? `${source} × ${item.sources.length}` : source;
}

function status(input: EditorViewInput): EditorViewStatus {
  if (!input.activeTimelineId) return "empty";
  if (input.replayState === "blocked") return "blocked";
  if (input.replayState === "retryable") return "retryable";
  if (input.error !== undefined) return "error";
  if (!input.inspection) return "connecting";
  return input.inspection.readiness === "ready" ? "ready" : "not-ready";
}

function inspector(
  item: TimelineInspectionItem | undefined,
  timeWindow: EditorTimeWindow | undefined,
): EditorViewInspector | undefined {
  if (!item) return undefined;
  const eases = item.animations.map((animation) => {
    const tween = animation as gsap.core.Animation & {
      readonly vars?: Readonly<Record<string, unknown>>;
    };
    return tween.vars?.ease;
  });
  const firstEase = eases[0];
  const mixedEase = eases.some((ease) => ease !== firstEase);
  const timing = timeWindow?.trackTimings.find((candidate) => candidate.item === item);
  return Object.freeze({
    trackKey: editorTrackKey(item),
    label: trackLabel(item),
    mapping: item.trackId === undefined ? "automatic" : "authored",
    start: timing?.start ?? item.resolvedStart,
    duration: timing?.duration ?? item.resolvedDuration,
    end: timing?.end ?? item.resolvedEnd,
    ease: !mixedEase && typeof firstEase === "string" ? firstEase : undefined,
    mixedEase,
    animatedTargetCount: item.animatedTargetCount,
    visualTargetCount: item.sources.length,
  });
}

export function buildEditorViewState(input: EditorViewInput): EditorViewState {
  const inspection = input.inspection;
  const canControl = input.error === undefined
    && input.replayState === "ready"
    && inspection?.driver === "manual"
    && inspection.readiness === "ready";
  const spansByItem = new Map<TimelineInspectionItem, EditorViewTrackSpan[]>();
  for (const span of input.timeWindow?.tracks ?? []) {
    const spans = spansByItem.get(span.item) ?? [];
    spans.push(Object.freeze({ start: span.start, end: span.end }));
    spansByItem.set(span.item, spans);
  }
  const tracks = Object.freeze((inspection?.items ?? []).map((item): EditorViewTrack =>
    Object.freeze({
      key: editorTrackKey(item),
      index: item.index,
      label: trackLabel(item),
      trackId: item.trackId,
      animatedTargetCount: item.animatedTargetCount,
      visualTargetCount: item.sources.length,
      selected: item === input.selectedItem,
      spans: Object.freeze(spansByItem.get(item) ?? []),
    })));
  const playState = inspection?.playState;
  return Object.freeze({
    timelines: Object.freeze(input.timelines.map(({ id, label }) => Object.freeze({ id, label }))),
    activeTimelineId: input.activeTimelineId,
    status: status(input),
    time: input.timeWindow,
    tracks,
    selectedTrackKey: input.selectedItem ? editorTrackKey(input.selectedItem) : undefined,
    inspector: inspector(input.selectedItem, input.timeWindow),
    transport: Object.freeze({
      playState,
      timeScale: inspection?.timeScale,
      canPlay: canControl && playState !== "running",
      canPause: canControl && playState === "running",
      canSeek: canControl && input.timeWindow !== undefined,
      canSetTimeScale: canControl,
      canReplay: input.activeTimelineId !== undefined
        && input.replayState === "ready"
        && inspection !== undefined,
      canRetryReplay: input.activeTimelineId !== undefined && input.replayState === "retryable",
    }),
    error: input.error,
  });
}
