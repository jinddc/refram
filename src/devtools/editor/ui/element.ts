import type { EditorController } from "../controller";
import editorStyles from "./editor.css?raw";
import { mountEditorUi, type EditorUiHandle } from "./mount";

export const MOTION_DEVTOOLS_EDITOR_TAG = "motion-devtools-editor";

export class MotionDevtoolsEditorElement extends HTMLElement {
  static readonly observedAttributes = ["theme"];

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

  attributeChangedCallback(name: string): void {
    if (name !== "theme") return;
    this.#syncTheme();
  }

  connectedCallback(): void {
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

export function defineMotionDevtoolsEditor(
  registry: CustomElementRegistry = customElements,
): typeof MotionDevtoolsEditorElement {
  const registered = registry.get(MOTION_DEVTOOLS_EDITOR_TAG);
  if (registered) return registered as typeof MotionDevtoolsEditorElement;
  registry.define(MOTION_DEVTOOLS_EDITOR_TAG, MotionDevtoolsEditorElement);
  return MotionDevtoolsEditorElement;
}
