import {
  registerMotionTimeline,
  type MotionTimelineElement,
  type MotionTweenElement,
} from "../src";
import {
  mountTimelineDebugger,
  type TimelineDebuggerHandle,
} from "./timeline-debugger";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing debugger fixture: ${selector}`);
  return element;
}

const manual = requireElement<MotionTimelineElement>("#debug-manual");
const manualA = requireElement<MotionTweenElement>("#debug-manual-a");
const manualB = requireElement<MotionTweenElement>("#debug-manual-b");
const manualC = requireElement<MotionTweenElement>("#debug-manual-c");
const empty = requireElement<MotionTimelineElement>("#debug-empty");
const unsupported = requireElement<MotionTimelineElement>("#debug-unsupported");
const unsupportedTween = requireElement<MotionTweenElement>("#debug-unsupported-a");
const disconnected = requireElement<MotionTimelineElement>("#debug-disconnected");
const disconnectedTween = requireElement<MotionTweenElement>("#debug-disconnected-a");
const stress = requireElement<MotionTimelineElement>("#debug-stress");

manual.options = { defaults: { duration: 1.4, ease: "power2.out" } };
manualA.options = {
  from: { opacity: 0.2, x: -44 },
  to: { opacity: 1, x: 0 },
  position: 0,
};
manualB.options = {
  from: { opacity: 0.2, y: 36, scale: 0.94 },
  to: { opacity: 1, y: 0, scale: 1 },
  duration: 1,
  ease: "power3.out",
  position: "<35%",
};
manualC.options = {
  from: { opacity: 0.2, x: 44 },
  duration: 0.7,
  position: ">-0.12",
};

unsupported.options = {
  defaults: { duration: 1, ease: "none" },
  scrollTrigger: {
    trigger: "#debug-unsupported-source",
    start: "top center",
    end: "+=600",
    scrub: true,
  },
};
unsupportedTween.options = {
  from: { opacity: 0.2, x: -30 },
  to: { opacity: 1, x: 0 },
};

disconnectedTween.options = {
  from: { opacity: 0, y: 20 },
  to: { opacity: 1, y: 0 },
  duration: 0.5,
};

stress.options = { defaults: { duration: 0.12, ease: "none" } };
for (let index = 0; index < 20; index += 1) {
  const tween = document.createElement("motion-tween") as MotionTweenElement;
  tween.id = `debug-stress-${index + 1}`;
  tween.textContent = String(index + 1).padStart(2, "0");
  tween.options = {
    from: { opacity: 0.25, y: 8 },
    to: { opacity: 1, y: 0 },
    position: index === 0 ? 0 : "<0.02",
  };
  stress.append(tween);
}

registerMotionTimeline();

type FixtureKey = "manual" | "empty" | "unsupported" | "disconnected" | "stress";

const timelines: Record<FixtureKey, MotionTimelineElement> = {
  manual,
  empty,
  unsupported,
  disconnected,
  stress,
};

const containers: Record<FixtureKey, HTMLElement> = {
  manual: requireElement("#debugger-manual"),
  empty: requireElement("#debugger-empty"),
  unsupported: requireElement("#debugger-unsupported"),
  disconnected: requireElement("#debugger-disconnected"),
  stress: requireElement("#debugger-stress"),
};

const handles = new Map<FixtureKey, TimelineDebuggerHandle>();

function mountDebugger(key: FixtureKey): void {
  if (handles.has(key)) return;
  containers[key].hidden = false;
  handles.set(key, mountTimelineDebugger(containers[key], timelines[key]));
}

function unmountDebugger(key: FixtureKey): void {
  handles.get(key)?.destroy();
  handles.delete(key);
  containers[key].hidden = true;
}

for (const key of Object.keys(timelines) as FixtureKey[]) mountDebugger(key);

const disconnectedHome = requireElement<HTMLElement>("#debug-disconnected-home");
queueMicrotask(() => disconnected.remove());

function reconnectTimeline(): void {
  if (!disconnected.isConnected) disconnectedHome.append(disconnected);
}

function disconnectTimeline(): void {
  disconnected.remove();
}

function mutateManualTimeline(): void {
  const existing = manual.querySelector<MotionTweenElement>("#debug-manual-late");
  if (existing) {
    existing.options = {
      from: { opacity: 0, y: 24 },
      to: { opacity: 1, y: 0 },
      duration: 0.55,
      position: "<0.08",
    };
    return;
  }

  const tween = document.createElement("motion-tween") as MotionTweenElement;
  tween.id = "debug-manual-late";
  tween.className = "debug-source__card";
  tween.textContent = "Late";
  tween.options = {
    from: { opacity: 0, y: 24 },
    to: { opacity: 1, y: 0 },
    duration: 0.45,
    position: "<0.04",
  };
  manual.append(tween);
}

document.querySelector("[data-debug-action='play']")?.addEventListener("click", () => {
  void manual.play();
});
document.querySelector("[data-debug-action='pause']")?.addEventListener("click", () => {
  manual.pause();
});
document.querySelector("[data-debug-action='cancel']")?.addEventListener("click", () => {
  manual.cancel();
});
document.querySelector("[data-debug-action='mutate']")?.addEventListener("click", mutateManualTimeline);
document.querySelector("[data-debug-action='hide']")?.addEventListener("click", () => {
  unmountDebugger("manual");
});
document.querySelector("[data-debug-action='show']")?.addEventListener("click", () => {
  mountDebugger("manual");
});
document.querySelector("[data-debug-action='disconnect']")?.addEventListener("click", disconnectTimeline);
document.querySelector("[data-debug-action='reconnect']")?.addEventListener("click", reconnectTimeline);

Object.assign(window, {
  __timelineDebuggerHarness: {
    manual,
    empty,
    unsupported,
    disconnected,
    stress,
    mountDebugger,
    unmountDebugger,
    mutateManualTimeline,
    reconnectTimeline,
    disconnectTimeline,
    playManual: () => manual.play(),
    pauseManual: () => manual.pause(),
    cancelManual: () => manual.cancel(),
  },
});
