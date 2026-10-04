export function createRenderNode<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

export function formatInspectorTime(value: number): string {
  if (value >= 1_000_000_000) return "∞";
  return `${Math.max(0, value).toFixed(2)}s`;
}
