import type { EditorController } from "../controller";
import {
  defineMotionDevtoolsEditor,
  MOTION_DEVTOOLS_EDITOR_TAG,
  type MotionDevtoolsEditorElement,
} from "./element";

export interface ReframOptions {
  readonly container?: HTMLElement;
  readonly theme?: "dark" | "light";
}

/** @deprecated Use `ReframOptions` instead. */
export type MotionDevtoolsEditorOptions = ReframOptions;

const liveEditors = new WeakMap<Document, Refram>();

function invalidState(message: string): DOMException {
  return new DOMException(message, "InvalidStateError");
}

export class Refram {
  readonly domElement: HTMLElement;

  readonly #document: Document;
  readonly #element: MotionDevtoolsEditorElement;
  #destroyed = false;

  get controller(): EditorController {
    const controller = this.#element.controller;
    if (!controller) {
      throw invalidState("Motion DevTools editor is not connected.");
    }
    return controller;
  }

  constructor(options: ReframOptions = {}) {
    const ownerDocument = options.container?.ownerDocument ?? document;
    if (liveEditors.has(ownerDocument)) {
      throw invalidState("A Motion DevTools editor already exists in this document.");
    }

    const registry = ownerDocument.defaultView?.customElements ?? customElements;
    defineMotionDevtoolsEditor(registry);
    const element = ownerDocument.createElement(
      MOTION_DEVTOOLS_EDITOR_TAG,
    ) as MotionDevtoolsEditorElement;
    if (options.theme) element.setAttribute("theme", options.theme);
    const container = options.container ?? ownerDocument.body;
    container.append(element);

    const controller = element.controller;
    if (!controller) {
      element.remove();
      throw invalidState("Motion DevTools editor must be mounted in a connected container.");
    }

    this.#document = ownerDocument;
    this.#element = element;
    this.domElement = element;
    liveEditors.set(ownerDocument, this);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.domElement.remove();
    if (liveEditors.get(this.#document) === this) liveEditors.delete(this.#document);
  }
}

/** @deprecated Use `Refram` instead. */
export { Refram as MotionDevtoolsEditor };
