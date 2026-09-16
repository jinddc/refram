/**
 * Internal lifecycle contract shared by effect controllers.
 *
 * Options are complete, validated snapshots. Generic core intentionally does
 * not define partial or deep-merge behavior.
 */
export interface EffectController<TOptions> {
  connect(): void;
  update(options: TOptions): void;
  resize(): void;
  destroy(): void;
}
