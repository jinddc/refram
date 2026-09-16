import type { MotionTweenOptions } from "./tween.types";

export function copyTweenOptions(
  options: MotionTweenOptions,
): MotionTweenOptions {
  const copy = { ...options };

  if (options.from) {
    copy.from = { ...options.from };
  }

  if (options.to) {
    copy.to = { ...options.to };
  }

  return copy;
}

export function normalizeTweenOptions(
  value: MotionTweenOptions,
): MotionTweenOptions {
  const options = copyTweenOptions(value ?? {});

  if (
    options.duration !== undefined &&
    (!Number.isFinite(options.duration) || options.duration < 0)
  ) {
    delete options.duration;
  }

  if (options.ease !== undefined) {
    const ease = options.ease.trim();

    if (ease === "") {
      delete options.ease;
    } else {
      options.ease = ease;
    }
  }

  if (typeof options.position === "number") {
    if (!Number.isFinite(options.position)) {
      delete options.position;
    }
  } else if (typeof options.position === "string") {
    const position = options.position.trim();

    if (position === "") {
      delete options.position;
    } else {
      options.position = position;
    }
  }

  return options;
}
