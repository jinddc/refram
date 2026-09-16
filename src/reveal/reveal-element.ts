import { MotionElement } from "../core/motion-element";
import { StandaloneRevealController } from "./reveal-controller";
import {
  copyRevealOptions,
  DEFAULT_REVEAL_THRESHOLD,
  normalizeRevealOptions,
} from "./reveal-options";
import type { StandaloneRevealOptions } from "./reveal.types";

const THRESHOLD_ATTRIBUTE = "threshold";

function parseThreshold(value: string | null): number | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }

  const threshold = Number(value);

  return (
    Number.isFinite(threshold) &&
    threshold >= 0 &&
    threshold <= 1
  )
    ? threshold
    : undefined;
}

export class MotionRevealElement extends MotionElement<
  StandaloneRevealOptions,
  StandaloneRevealController
> {
  public static readonly observedAttributes = [THRESHOLD_ATTRIBUTE];

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

  public attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    if (name !== THRESHOLD_ATTRIBUTE || oldValue === newValue) {
      return;
    }

    this.controller?.update(
      this.prepareControllerOptions(this.options),
    );
  }

  protected prepareControllerOptions(
    options: StandaloneRevealOptions,
  ): StandaloneRevealOptions {
    return {
      ...options,
      threshold:
        options.threshold ??
        parseThreshold(this.getAttribute(THRESHOLD_ATTRIBUTE)) ??
        DEFAULT_REVEAL_THRESHOLD,
    };
  }

  protected createController(
    options: StandaloneRevealOptions,
  ): StandaloneRevealController {
    return new StandaloneRevealController(this, options);
  }
}
