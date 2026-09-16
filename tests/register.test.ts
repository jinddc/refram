// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { register } from "../src/internal/register";

const registry = globalThis.customElements;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("register", () => {
  it("defines an element once", () => {
    class TestElement extends HTMLElement {}

    register("motion-register-test", TestElement);
    register("motion-register-test", TestElement);

    expect(customElements.get("motion-register-test")).toBe(TestElement);
  });

  it("does not replace an existing definition", () => {
    class ExistingElement extends HTMLElement {}
    class ReplacementElement extends HTMLElement {}

    registry.define("motion-existing-test", ExistingElement);
    register("motion-existing-test", ReplacementElement);

    expect(registry.get("motion-existing-test")).toBe(ExistingElement);
  });

  it("is safe when Custom Elements are unavailable", () => {
    vi.stubGlobal("customElements", undefined);

    expect(() => {
      register("motion-ssr-test", class extends HTMLElement {});
    }).not.toThrow();
  });
});
