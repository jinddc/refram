import type { EditorViewState } from "../../view-state";
import type { EditorUiElements } from "../dom";
import { createRenderNode } from "./shared";

export function renderTimelineList(
  elements: EditorUiElements,
  view: EditorViewState,
): void {
  const signature = view.timelines
    .map(({ id, label }) => `${id}:${label}:${id === view.activeTimelineId}`)
    .join("|");
  if (elements.timelineList.dataset.signature === signature) return;
  elements.timelineList.dataset.signature = signature;
  const entries: HTMLElement[] = view.timelines.map(({ id, label }) => {
    const button = createRenderNode("button", "rf__timeline-item");
    button.type = "button";
    button.dataset.timelineId = id;
    button.setAttribute("aria-current", String(id === view.activeTimelineId));
    button.append(createRenderNode("span", "rf__timeline-item-label", label));
    return button;
  });
  if (entries.length === 0) {
    entries.push(createRenderNode("p", "rf__timeline-empty", "No timelines registered."));
  }
  elements.timelineList.replaceChildren(...entries);
}
