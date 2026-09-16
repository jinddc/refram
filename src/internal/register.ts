/**
 * Defines a Custom Element once when a browser registry is available.
 *
 * Keeping this helper silent and idempotent makes component registration safe
 * across repeated imports and server-side module evaluation.
 */
export function register(
  name: string,
  ctor: CustomElementConstructor,
): void {
  if (
    typeof customElements === "undefined" ||
    customElements.get(name)
  ) {
    return;
  }

  customElements.define(name, ctor);
}
