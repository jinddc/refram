import {
  mountMotionDevTools,
  type MotionDevToolsHandle,
} from "./motion-devtools";
import {
  defaultTimelineRegistry,
  type MotionTimelineRegistration,
} from "../src/devtools/timeline-registry";
import { registerDetailSequence } from "./timelines/detail-sequence";
import { registerEditorSequence } from "./timelines/editor-sequence";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing Motion DevTools fixture: ${selector}`);
  return element;
}

const root = requireElement<HTMLElement>("#motion-devtools-root");
let handle: MotionDevToolsHandle | undefined;
const registrations: MotionTimelineRegistration[] = [
  registerEditorSequence(),
  registerDetailSequence(),
];

function mount(): void {
  handle = mountMotionDevTools(root);
}

mount();

const harness = {
  get timeline() {
    const active = registrations.find(({ id }) => id === handle?.activeTimelineId);
    if (!active) throw new Error("Motion DevTools fixture has no active timeline.");
    return active.timeline;
  },
  get activeTimelineId() {
    return handle?.activeTimelineId;
  },
  get registrationIds() {
    return defaultTimelineRegistry.getSnapshot().registrations.map(({ id }) => id);
  },
  selectTimeline(id: string): boolean {
    return handle?.setActiveTimeline(id) ?? false;
  },
  removeTimeline(id: string): boolean {
    const registration = registrations.find((candidate) => candidate.id === id);
    if (!registration) return false;
    registration.destroy();
    return true;
  },
  destroy(): void {
    handle?.destroy();
    handle = undefined;
  },
  remount(): void {
    if (handle) return;
    mount();
  },
};

Object.assign(window, { __motionDevToolsHarness: harness });

window.addEventListener("beforeunload", () => {
  harness.destroy();
  for (const registration of registrations) registration.destroy();
}, { once: true });

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    harness.destroy();
    for (const registration of registrations) registration.destroy();
  });
}
