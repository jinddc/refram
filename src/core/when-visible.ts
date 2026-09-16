const DEFAULT_THRESHOLD = 0.15;

/**
 * Invokes a callback once when an element first intersects the viewport.
 *
 * The fallback runs immediately when IntersectionObserver is unavailable.
 * Cleanup is idempotent and prevents queued observations from invoking the
 * callback after ownership has been released.
 */
export function whenVisible(
  element: Element,
  callback: () => void,
  threshold = DEFAULT_THRESHOLD,
): () => void {
  if (typeof IntersectionObserver === "undefined") {
    callback();
    return () => {};
  }

  let completed = false;
  const observer = new IntersectionObserver(
    (entries) => {
      if (
        completed ||
        !entries.some((entry) => entry.isIntersecting)
      ) {
        return;
      }

      completed = true;
      observer.disconnect();
      callback();
    },
    { threshold },
  );

  observer.observe(element);

  return () => {
    if (completed) {
      return;
    }

    completed = true;
    observer.disconnect();
  };
}
