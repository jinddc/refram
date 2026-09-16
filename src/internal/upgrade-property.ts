/**
 * Replays a property assigned before a Custom Element definition upgraded the
 * instance so the value reaches the prototype setter.
 */
export function upgradeProperty<T extends object, K extends keyof T>(
  target: T,
  property: K,
): void {
  if (!Object.prototype.hasOwnProperty.call(target, property)) {
    return;
  }

  const value = target[property];
  delete target[property];
  target[property] = value;
}
