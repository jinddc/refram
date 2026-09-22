import type { EditorController } from "../editor-controller";
import editorStyles from "./editor.css?raw";
import { mountEditorUi, type EditorUiHandle } from "./mount";

export const MOTION_DEVTOOLS_EDITOR_TAG = "motion-devtools-editor";

const PREVIEW_SLOT = "motion-preview";

export class MotionDevtoolsEditorElement extends HTMLElement {
  readonly #mountPoint: HTMLElement;
  #handle: EditorUiHandle | undefined;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = editorStyles;
    this.#mountPoint = document.createElement("div");
    this.#mountPoint.dataset.devtoolsEditorMount = "";
    shadow.append(style, this.#mountPoint);
  }

  get controller(): EditorController | undefined {
    return this.#handle?.controller;
  }

  connectedCallback(): void {
    if (this.#handle) return;
    this.#handle = mountEditorUi(this.#mountPoint, {
      previewHost: this,
      previewSlotName: PREVIEW_SLOT,
    });
  }

  disconnectedCallback(): void {
    this.#handle?.destroy();
    this.#handle = undefined;
  }
}

export function defineMotionDevtoolsEditor(
  registry: CustomElementRegistry = customElements,
): typeof MotionDevtoolsEditorElement {
  const registered = registry.get(MOTION_DEVTOOLS_EDITOR_TAG);
  if (registered) return registered as typeof MotionDevtoolsEditorElement;
  registry.define(MOTION_DEVTOOLS_EDITOR_TAG, MotionDevtoolsEditorElement);
  return MotionDevtoolsEditorElement;
}
