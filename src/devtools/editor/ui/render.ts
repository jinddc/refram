import type { EditorViewState } from "../view-state";
import type { EditorUiElements } from "./dom";
import { renderInspector } from "./render/inspector";
import {
  DEFAULT_RULER_DURATION,
  getTimelineRulerScale,
  renderTimeline,
  type TimelineRulerScale,
} from "./render/timeline";
import { renderTimelineList } from "./render/timeline-list";
import { renderTransport } from "./render/transport";

export { getTimelineRulerScale } from "./render/timeline";
export type { TimelineRulerScale } from "./render/timeline";

const BASE_ZOOM = 1;

export function renderEditorUi(
  elements: EditorUiElements,
  view: EditorViewState,
  zoom = BASE_ZOOM,
): void {
  const scale: TimelineRulerScale = view.scrollTrigger?.scrubbed
    ? {
      domainDuration: 1,
      visibleDuration: 1,
      majorStep: 0.25,
      minorStep: 0.05,
      contentScale: 1,
      unit: "seconds",
    }
    : getTimelineRulerScale(view.time?.duration ?? DEFAULT_RULER_DURATION, zoom);
  renderTimelineList(elements, view);
  renderTransport(elements, view, scale);
  renderTimeline(elements, view, scale);
  renderInspector(elements, view);
}
