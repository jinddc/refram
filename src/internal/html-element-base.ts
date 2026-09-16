/**
 * SSR-safe base for autonomous Custom Elements.
 *
 * The fallback supports module evaluation only. Element construction and
 * lifecycle remain browser-only operations.
 */
export const HTMLElementBase = (
  typeof globalThis.HTMLElement === "undefined"
    ? class {}
    : globalThis.HTMLElement
) as typeof HTMLElement;
