import { HTMLElementBase } from "../internal/html-element-base";
import { upgradeProperty } from "../internal/upgrade-property";
import {
  isTimelineCompositionHost,
  REQUEST_TIMELINE_SYNC,
  type TimelineCompositionHost,
} from "./timeline-protocol";
import {
  copyTweenOptions,
  normalizeTweenOptions,
} from "./tween-options";
import type { MotionTweenOptions } from "./tween.types";

export class MotionTweenElement extends HTMLElementBase {
  private currentOptions: MotionTweenOptions = {};
  private timelineOwner?: TimelineCompositionHost;
  private ownershipGeneration = 0;

  public constructor() {
    super();
    upgradeProperty(this, "options");
  }

  public get options(): MotionTweenOptions {
    return copyTweenOptions(this.currentOptions);
  }

  public set options(value: MotionTweenOptions) {
    this.currentOptions = normalizeTweenOptions(value);
    this.resolveOwner("options");
  }

  public connectedCallback(): void {
    const generation = ++this.ownershipGeneration;

    queueMicrotask(() => {
      if (
        !this.isConnected ||
        generation !== this.ownershipGeneration
      ) {
        return;
      }

      this.resolveOwner("structure");
    });
  }

  public disconnectedCallback(): void {
    const generation = ++this.ownershipGeneration;
    const previousOwner = this.timelineOwner;

    queueMicrotask(() => {
      if (
        this.isConnected ||
        generation !== this.ownershipGeneration ||
        this.timelineOwner !== previousOwner
      ) {
        return;
      }

      this.timelineOwner = undefined;
      previousOwner?.[REQUEST_TIMELINE_SYNC]("structure");
    });
  }

  private resolveOwner(reason: "structure" | "options"): void {
    if (!this.isConnected) {
      return;
    }

    const candidate = this.closest("motion-timeline");
    const nextOwner = isTimelineCompositionHost(candidate)
      ? candidate
      : undefined;
    const previousOwner = this.timelineOwner;

    if (previousOwner !== nextOwner) {
      this.timelineOwner = nextOwner;
      previousOwner?.[REQUEST_TIMELINE_SYNC]("structure");
      nextOwner?.[REQUEST_TIMELINE_SYNC]("structure");
      return;
    }

    nextOwner?.[REQUEST_TIMELINE_SYNC](reason);
  }
}
