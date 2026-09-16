import type { StandaloneRevealOptions } from "./reveal.types";

export const DEFAULT_REVEAL_THRESHOLD = 0.15;

export function copyRevealOptions(
  options: StandaloneRevealOptions,
): StandaloneRevealOptions {
  const copy = { ...options };

  if (options.from) {
    copy.from = { ...options.from };
  }

  if (options.to) {
    copy.to = { ...options.to };
  }

  return copy;
}

export function normalizeRevealOptions(
  value: StandaloneRevealOptions,
): StandaloneRevealOptions {
  const options = copyRevealOptions(value ?? {});

  if (
    options.threshold !== undefined &&
    (
      !Number.isFinite(options.threshold) ||
      options.threshold < 0 ||
      options.threshold > 1
    )
  ) {
    delete options.threshold;
  }

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

  return options;
}
