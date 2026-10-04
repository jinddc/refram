import type { EditorController } from "../../controller";
import {
  copyTextToClipboard,
  createSelectedTrackDebugJson,
} from "../../debug-snapshot";
import type { EditorUiElements } from "../dom";

export interface ClipboardInteractionHandle {
  syncSelectedTrack(trackKey: string | undefined): void;
  copySelectedTrackDebugJson(): Promise<void>;
  destroy(): void;
}

export function createClipboardInteraction(
  controller: EditorController,
  elements: EditorUiElements,
  document: Document,
): ClipboardInteractionHandle {
  let destroyed = false;
  let request = 0;
  let selectedTrackKey: string | undefined;
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

  const clearFeedbackTimer = (): void => {
    if (feedbackTimer !== undefined) clearTimeout(feedbackTimer);
    feedbackTimer = undefined;
  };

  const resetFeedback = (): void => {
    clearFeedbackTimer();
    elements.copyDebugButton.textContent = "Copy debug JSON";
    elements.copyDebugStatus.textContent = "";
    elements.copyDebugStatus.dataset.state = "";
  };

  const copyInspectorText = async (text: string, description: string): Promise<void> => {
    const snapshot = controller.getSnapshot();
    const currentRequest = ++request;
    const trackKey = snapshot.view.selectedTrackKey;
    clearFeedbackTimer();
    elements.copyDebugButton.disabled = true;
    elements.copyDebugButton.textContent = "Copying…";
    elements.copyDebugStatus.textContent = "Copying…";
    elements.copyDebugStatus.dataset.state = "pending";
    const copied = await copyTextToClipboard(text, document);
    if (destroyed || currentRequest !== request
      || controller.getSnapshot().view.selectedTrackKey !== trackKey) return;
    elements.copyDebugButton.disabled = false;
    elements.copyDebugButton.textContent = copied ? "Copied" : "Copy failed";
    elements.copyDebugStatus.textContent = copied
      ? `Copied ${description}.`
      : `Could not copy ${description}. Clipboard access is unavailable.`;
    elements.copyDebugStatus.dataset.state = copied ? "success" : "failure";
    feedbackTimer = setTimeout(() => {
      feedbackTimer = undefined;
      if (destroyed || currentRequest !== request
        || controller.getSnapshot().view.selectedTrackKey !== trackKey) return;
      resetFeedback();
    }, 1_000);
  };

  return {
    syncSelectedTrack(trackKey) {
      if (selectedTrackKey === trackKey) return;
      selectedTrackKey = trackKey;
      request += 1;
      resetFeedback();
    },
    async copySelectedTrackDebugJson() {
      const debugJson = createSelectedTrackDebugJson(controller.getSnapshot());
      if (debugJson) await copyInspectorText(debugJson, "debug JSON");
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      request += 1;
      clearFeedbackTimer();
    },
  };
}
