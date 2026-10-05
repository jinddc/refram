// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { Refram } from "../../src";
import { mountEditorUi } from "../../src/devtools/editor/ui/mount";
import { createTimelineRegistry } from "../../src/devtools/timeline/registry";

describe("editor native-scroll boundary", () => {
  it.each(["wheel", "touchmove"])("excludes Shadow DOM %s events from page smooth scrolling across reconnect", (type) => {
    const intercepted = vi.fn();
    // Lenis checks the composed path for this attribute before preventing native scrolling.
    const pageSmoothScroll = (event: Event) => {
      if (event.composedPath().some((node) => (
        node instanceof HTMLElement && node.hasAttribute("data-lenis-prevent")
      ))) return;
      intercepted();
      event.preventDefault();
    };
    window.addEventListener(type, pageSmoothScroll, { passive: false });
    const editor = new Refram();
    try {
      for (let connection = 0; connection < 2; connection += 1) {
        const shadow = editor.domElement.shadowRoot!;
        for (const selector of [".rf__inspector-content", ".rf__timeline-viewport", ".rf__timeline-list"]) {
          const event = new Event(type, { bubbles: true, composed: true, cancelable: true });
          shadow.querySelector(selector)!.dispatchEvent(event);
          expect(event.defaultPrevented).toBe(false);
        }
        expect(intercepted).not.toHaveBeenCalled();
        editor.domElement.remove();
        document.body.append(editor.domElement);
      }
      const outside = new Event(type, { bubbles: true, composed: true, cancelable: true });
      document.body.dispatchEvent(outside);
      expect(outside.defaultPrevented).toBe(true);
      expect(intercepted).toHaveBeenCalledOnce();
    } finally {
      editor.destroy();
      window.removeEventListener(type, pageSmoothScroll);
    }
  });

  it("also excludes a directly mounted editor without shielding its application container", () => {
    const registry = createTimelineRegistry();
    const container = document.createElement("div");
    document.body.append(container);
    const handle = mountEditorUi(container, { registry });
    let prevented: boolean | undefined;
    const listener = (event: Event) => {
      prevented = event.composedPath().some((node) => (
        node instanceof HTMLElement && node.hasAttribute("data-lenis-prevent")
      ));
    };
    window.addEventListener("wheel", listener);
    try {
      container.querySelector(".rf__timeline-viewport")!.dispatchEvent(
        new Event("wheel", { bubbles: true, composed: true }),
      );
      expect(prevented).toBe(true);
      container.dispatchEvent(new Event("wheel", { bubbles: true, composed: true }));
      expect(prevented).toBe(false);
    } finally {
      window.removeEventListener("wheel", listener);
      handle.destroy();
      registry.destroy();
      container.remove();
    }
  });
});
