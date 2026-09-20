import {
  mountMotionDevTools,
  type MotionDevToolsHandle,
} from "./motion-devtools";
import {
  defaultTimelineRegistry,
  type MotionTimelineRegistration,
} from "../src/devtools/timeline-registry";
import { registerContainerAnimationSequence } from "./timelines/container-animation-sequence";
import { registerCanvasParticlesSequence } from "./timelines/canvas-particles-sequence";
import { registerDetailSequence } from "./timelines/detail-sequence";
import { registerEditorSequence } from "./timelines/editor-sequence";
import { registerSvgShapeOverlaysSequence } from "./timelines/svg-shape-overlays-sequence";
import { registerRollingTextSequence } from "./timelines/rolling-text-sequence";

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
  registerContainerAnimationSequence(),
  registerSvgShapeOverlaysSequence(),
  registerCanvasParticlesSequence(),
  registerRollingTextSequence(),
];

function mount(): void {
  handle = mountMotionDevTools(root);
  const status = root.querySelector(".motion-editor__timeline-status");
  const demoLinks = document.createElement("nav");
  demoLinks.className = "motion-editor__demo-links";
  demoLinks.setAttribute("aria-label", "Standalone playground demos");
  const shaderLink = document.createElement("a");
  shaderLink.className = "motion-editor__demo-link";
  shaderLink.href = "/scroll-shader.html";
  shaderLink.textContent = "Shader ↗";
  shaderLink.setAttribute("aria-label", "Open Scroll Shader playground demo");
  const sequenceLink = document.createElement("a");
  sequenceLink.className = "motion-editor__demo-link";
  sequenceLink.href = "/image-sequence.html";
  sequenceLink.textContent = "Sequence ↗";
  sequenceLink.setAttribute("aria-label", "Open Image Sequence playground demo");
  demoLinks.append(shaderLink, sequenceLink);
  status?.append(demoLinks);
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
  replayActiveTimeline(): boolean {
    const registration = registrations.find(({ id }) => id === handle?.activeTimelineId);
    if (!registration) return false;
    registration.replay();
    return true;
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
