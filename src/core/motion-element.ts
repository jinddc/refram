import type { EffectController } from "./effect-controller";
import { HTMLElementBase } from "../internal/html-element-base";
import { upgradeProperty } from "../internal/upgrade-property";

/**
 * Internal Custom Element base for controller-backed effects.
 *
 * Subclasses own effect-specific parsing, normalization, copying, and public
 * API. This base only coordinates replacement-style options and controller
 * lifecycle.
 */
export abstract class MotionElement<
  TOptions,
  TController extends EffectController<TOptions>,
> extends HTMLElementBase {
  private currentOptions: TOptions;
  private currentController?: TController;
  private connected = false;

  protected constructor(initialOptions: TOptions) {
    super();
    this.currentOptions = initialOptions;
  }

  public get options(): TOptions {
    return this.copyOptions(this.currentOptions);
  }

  public set options(value: TOptions) {
    const nextOptions = this.normalizeOptions(value);
    this.currentOptions = nextOptions;
    this.currentController?.update(
      this.prepareControllerOptions(this.copyOptions(nextOptions)),
    );
  }

  public connectedCallback(): void {
    if (this.connected) {
      return;
    }

    this.connected = true;
    this.currentController = this.createController(
      this.prepareControllerOptions(
        this.copyOptions(this.currentOptions),
      ),
    );
    this.currentController.connect();
  }

  public disconnectedCallback(): void {
    if (!this.connected) {
      return;
    }

    this.connected = false;
    this.currentController?.destroy();
    this.currentController = undefined;
  }

  /**
   * Replays an `options` value assigned before Custom Element upgrade.
   *
   * A concrete element must call this from its constructor body, after `super`
   * and after any subclass field initializers that option normalization uses.
   */
  protected upgradeOptionsProperty(): void {
    upgradeProperty(this, "options");
  }

  /** Gives a concrete element access for approved imperative methods. */
  protected get controller(): TController | undefined {
    return this.currentController;
  }

  /**
   * Produces the complete typed snapshot owned by a controller.
   *
   * Concrete elements may combine approved attribute inputs here without
   * changing the public options value stored by this base.
   */
  protected prepareControllerOptions(options: TOptions): TOptions {
    return options;
  }

  protected abstract normalizeOptions(value: TOptions): TOptions;

  protected abstract copyOptions(options: TOptions): TOptions;

  protected abstract createController(options: TOptions): TController;
}
