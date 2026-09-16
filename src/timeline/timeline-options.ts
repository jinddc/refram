import type {
  MotionTimelineOptions,
  TimelineDefinition,
} from "./timeline.types";
import type { TweenDefinition } from "./tween.types";

type RuntimeTimelineOptions = MotionTimelineOptions & {
  paused?: boolean;
  reversed?: boolean;
};

export function copyTimelineOptions(
  value: MotionTimelineOptions,
): MotionTimelineOptions {
  const options: RuntimeTimelineOptions = { ...(value ?? {}) };

  delete options.paused;
  delete options.reversed;

  if (options.defaults) {
    options.defaults = { ...options.defaults };
  }

  if (options.scrollTrigger) {
    options.scrollTrigger = { ...options.scrollTrigger };
  }

  return options;
}

export function createTimelineDefinition(
  options: MotionTimelineOptions,
  items: readonly TweenDefinition[],
): TimelineDefinition {
  const optionCopy = copyTimelineOptions(options);
  if (optionCopy.defaults) {
    Object.freeze(optionCopy.defaults);
  }
  if (optionCopy.scrollTrigger) {
    Object.freeze(optionCopy.scrollTrigger);
  }
  const optionSnapshot = Object.freeze(optionCopy);
  const itemSnapshots = items.map((item) => Object.freeze({
    source: item.source,
    target: item.target,
    options: Object.freeze({
      ...item.options,
      from: item.options.from
        ? Object.freeze({ ...item.options.from })
        : undefined,
      to: item.options.to
        ? Object.freeze({ ...item.options.to })
        : undefined,
    }),
    authoredPosition: item.authoredPosition,
  }));

  return Object.freeze({
    options: optionSnapshot,
    items: Object.freeze(itemSnapshots),
  });
}
