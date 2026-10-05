import type { EditorController } from "../controller";
import editorStyles from "./editor.css?raw";
import { mountEditorUi, type EditorUiHandle } from "./mount";

export const MOTION_DEVTOOLS_EDITOR_TAG = "rf-editor";

export interface MotionDevtoolsEditorElement extends HTMLElement {
  readonly controller: EditorController | undefined;
}

export function defineMotionDevtoolsEditor(
  registry: CustomElementRegistry = customElements,
): new () => MotionDevtoolsEditorElement {
  const registered = registry.get(MOTION_DEVTOOLS_EDITOR_TAG);
  if (registered) return registered as new () => MotionDevtoolsEditorElement;

  class EditorElement extends HTMLElement implements MotionDevtoolsEditorElement {
    static readonly observedAttributes = ["theme"];

    readonly #mountPoint: HTMLElement;
    #handle: EditorUiHandle | undefined;

    constructor() {
      super();
      const shadow = this.attachShadow({ mode: "open" });
      const style = this.ownerDocument.createElement("style");
      style.textContent = editorStyles;
      this.#mountPoint = this.ownerDocument.createElement("div");
      this.#mountPoint.dataset.rfMount = "";
      shadow.append(style, this.#mountPoint);
    }

    get controller(): EditorController | undefined {
      return this.#handle?.controller;
    }

    attributeChangedCallback(name: string): void {
      if (name !== "theme") return;
      this.#syncTheme();
    }

    connectedCallback(): void {
      this.setAttribute("data-lenis-prevent", "");
      this.#syncTheme();
      if (this.#handle) return;
      this.#handle = mountEditorUi(this.#mountPoint);
    }

    disconnectedCallback(): void {
      this.#handle?.destroy();
      this.#handle = undefined;
    }

    #syncTheme(): void {
      this.dataset.theme = this.getAttribute("theme") === "light" ? "light" : "dark";
    }
  }

  registry.define(MOTION_DEVTOOLS_EDITOR_TAG, EditorElement);
  return EditorElement;
}
