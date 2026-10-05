import assert from "node:assert/strict";
import { Refram, MotionDevtoolsEditor, createTimelineRegistry } from "refram";

assert.equal(typeof document, "undefined");
assert.equal(Refram, MotionDevtoolsEditor);
assert.throws(() => new Refram(), /Refram requires a browser document/);
const registry = createTimelineRegistry();
assert.equal(registry.getSnapshot().registrations.length, 0);
registry.destroy();

// Reuse the module imported on the server after a browser environment arrives.
const { Window } = await import("happy-dom");
const browser = new Window({ url: "http://localhost" });
const globals = [
  "window", "document", "HTMLElement", "Element", "Node", "ShadowRoot", "customElements",
  "navigator", "localStorage", "ResizeObserver", "requestAnimationFrame",
  "cancelAnimationFrame", "getComputedStyle",
];
for (const key of globals) {
  const value = browser[key];
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: typeof value === "function" && /^[a-z]/.test(key)
      ? value.bind(browser)
      : value,
  });
}
try {
  const editor = new Refram();
  assert.equal(editor.domElement.localName, "rf-editor");
  assert.ok(editor.domElement.isConnected);
  assert.ok(editor.controller.getSnapshot());
  assert.throws(() => new MotionDevtoolsEditor(), /already exists/);
  editor.destroy();
  editor.destroy();
  assert.equal(editor.domElement.isConnected, false);
  const remounted = new MotionDevtoolsEditor();
  remounted.destroy();
  console.log("Built package: SSR import, server mount error, browser mount/destroy/remount passed.");
} finally {
  await browser.happyDOM.close();
}
