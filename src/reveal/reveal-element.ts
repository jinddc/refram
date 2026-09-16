import { MotionElement } from "../core/motion-element";
import { StandaloneRevealController } from "./reveal-controller";
import {
  copyRevealOptions,
  normalizeRevealOptions,
} from "./reveal-options";
import type { StandaloneRevealOptions } from "./reveal.types";

export class MotionRevealElement extends MotionElement<
  StandaloneRevealOptions,
  StandaloneRevealController
> {
  public constructor() {
    super({});
    this.upgradeOptionsProperty();
  }

  protected normalizeOptions(
    value: StandaloneRevealOptions,
  ): StandaloneRevealOptions {
    return normalizeRevealOptions(value);
  }

  protected copyOptions(
    options: StandaloneRevealOptions,
  ): StandaloneRevealOptions {
    return copyRevealOptions(options);
  }

  protected createController(
    options: StandaloneRevealOptions,
  ): StandaloneRevealController {
    return new StandaloneRevealController(this, options);
  }
}
