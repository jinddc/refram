import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { MotionDevtoolsEditor } from "../src/devtools/editor/ui/editor";
import {
  defaultTimelineRegistry,
  type MotionTimelineRegistration,
} from "../src/devtools/timeline/registry";

gsap.registerPlugin(ScrollTrigger);

function requireElement<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing DevTools v2 fixture: ${selector}`);
  return value;
}

function registerFiniteTimeline(): MotionTimelineRegistration {
  const root = requireElement<HTMLElement>("#devtools-v2-finite");
  const panels = [...root.querySelectorAll<HTMLElement>(".devtools-v2-panel")];
  return defaultTimelineRegistry.register({
    id: "playground/v2/finite",
    label: "Editorial sequence",
    root,
    create() {
      let timeline!: gsap.core.Timeline;
      const context = gsap.context(() => {
        timeline = gsap.timeline({ paused: true });
        panels.forEach((panel, index) => {
          timeline.fromTo(
            panel,
            { opacity: 0.2, y: 28 },
            { opacity: 1, y: 0, duration: 0.8, ease: "power2.out", immediateRender: false },
            index * 0.42,
          );
        });
      }, root);
      return { timeline, dispose: () => context.revert() };
    },
  });
}

function registerParticleTimeline(): MotionTimelineRegistration {
  const root = requireElement<HTMLElement>("#devtools-v2-particles");
  const canvas = requireElement<HTMLCanvasElement>("#devtools-v2-canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is required.");
  return defaultTimelineRegistry.register({
    id: "playground/v2/particles",
    label: "Particle cycle",
    root,
    create() {
      let width = 1;
      let height = 1;
      let pixelRatio = 1;
      const particles = Array.from({ length: 99 }, (_, index) => ({
        angle: (index / 99) * Math.PI * 2,
        radius: 180,
        scale: 1,
      }));
      const draw = () => {
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.clearRect(0, 0, width, height);
        context.fillStyle = "#47d7e8";
        for (const particle of particles) {
          context.beginPath();
          context.arc(
            width / 2 + Math.cos(particle.angle) * particle.radius,
            height / 2 + Math.sin(particle.angle) * particle.radius,
            Math.max(1, particle.scale * 3),
            0,
            Math.PI * 2,
          );
          context.fill();
        }
      };
      const resize = () => {
        const bounds = root.getBoundingClientRect();
        width = Math.max(1, Math.round(bounds.width));
        height = Math.max(1, Math.round(bounds.height));
        pixelRatio = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
        const bitmapWidth = Math.round(width * pixelRatio);
        const bitmapHeight = Math.round(height * pixelRatio);
        if (canvas.width !== bitmapWidth) canvas.width = bitmapWidth;
        if (canvas.height !== bitmapHeight) canvas.height = bitmapHeight;
        draw();
      };
      const timeline = gsap.timeline({ paused: true, onUpdate: draw }).to(
        particles,
        {
          angle: `+=${Math.PI * 2}`,
          radius: 12,
          scale: 0.2,
          duration: 5,
          ease: "sine.inOut",
          stagger: { each: -0.05, repeat: -1 },
        },
      );
      const animation = timeline.getChildren(false, true, false)[0] as gsap.core.Tween;
      timeline.seek(99, false);
      const resizeObserver = typeof ResizeObserver === "function"
        ? new ResizeObserver(resize)
        : undefined;
      resizeObserver?.observe(root);
      resize();
      return {
        timeline,
        tracks: [{ id: "particles", label: "Particle field", animation, targets: canvas }],
        dispose() {
          resizeObserver?.disconnect();
          timeline.kill();
          context.clearRect(0, 0, canvas.width, canvas.height);
        },
      };
    },
  });
}

function registerScrollTimeline(
  id: string,
  rootSelector: string,
  scrollTrigger: ScrollTrigger.Vars,
): MotionTimelineRegistration {
  const root = requireElement<HTMLElement>(rootSelector);
  const target = requireElement<HTMLElement>(`${rootSelector} h2`);
  const timeline = gsap.timeline({
    scrollTrigger: {
      trigger: root,
      ...scrollTrigger,
    },
  }).fromTo(target, { x: -80, opacity: 0.3 }, { x: 80, opacity: 1, duration: 1 });
  return defaultTimelineRegistry.register({
    id,
    label: id,
    root,
    timeline,
  });
}

const registrations = [
  registerFiniteTimeline(),
  registerParticleTimeline(),
  registerScrollTimeline(
    "playground/v2/window-scroll",
    "#devtools-v2-window-scroll",
    {
      id: "Window scrub",
      start: "top bottom",
      end: "bottom top",
      scrub: true,
      // markers: {
      //   startColor: "#22c55e",
      //   endColor: "#ef4444",
      //   fontSize: "12px",
      //   fontWeight: "600",
      //   indent: 8,
      // },
    },
  ),
  registerScrollTimeline(
    "playground/v2/custom-scroll",
    "#devtools-v2-custom-scroll",
    {
      id: "Custom scrub",
      trigger: "#devtools-v2-custom-trigger",
      scroller: "#devtools-v2-custom-scroller",
      start: "top bottom",
      end: "bottom top",
      scrub: 0.5,
    },
  ),
  registerScrollTimeline(
    "playground/v2/action-scroll",
    "#devtools-v2-action-scroll",
    {
      id: "Trigger actions",
      start: "top 80%",
      end: "bottom 20%",
      toggleActions: "play pause resume reverse",
    },
  ),
];
let longTimelineRegistration: MotionTimelineRegistration | undefined;
let longTimeline: gsap.core.Timeline | undefined;

function registerLongTimeline(): string {
  if (longTimelineRegistration) return longTimelineRegistration.id;
  const root = requireElement<HTMLElement>("#devtools-v2-finite");
  const target = requireElement<HTMLElement>("#devtools-v2-finite .devtools-v2-panel");
  longTimeline = gsap.timeline({ paused: true }).to(target, { x: 160, duration: 16 });
  longTimelineRegistration = defaultTimelineRegistry.register({
    id: "playground/v2/long",
    label: "Long inspection",
    root,
    timeline: longTimeline,
  });
  return longTimelineRegistration.id;
}

function removeLongTimeline(): void {
  longTimelineRegistration?.destroy();
  longTimeline?.kill();
  longTimelineRegistration = undefined;
  longTimeline = undefined;
}

function createFixtureEditor(): MotionDevtoolsEditor {
  const fixtureEditor = new MotionDevtoolsEditor({
    // theme: "light",
  });
  const parameters = new URLSearchParams(location.search);
  const theme = parameters.get("theme");
  if (theme) fixtureEditor.domElement.setAttribute("theme", theme);
  return fixtureEditor;
}

let editor = createFixtureEditor();

const harness = {
  get editorRoot() {
    return editor.domElement.shadowRoot;
  },
  query(selector: string) {
    return editor.domElement.shadowRoot?.querySelector(selector);
  },
  queryAll(selector: string) {
    return editor.domElement.shadowRoot?.querySelectorAll(selector) ?? [];
  },
  get activeTimelineId() {
    return editor.controller.getSnapshot().activeTimelineId;
  },
  get view() {
    return editor.controller.getSnapshot().view;
  },
  get activeTimelinePaused() {
    const activeId = editor.controller.getSnapshot().activeTimelineId;
    return registrations.find(({ id }) => id === activeId)?.timeline.paused();
  },
  selectTimeline(id: string) {
    return editor.controller.selectTimeline(id);
  },
  seek(progress: number) {
    return editor.controller.seek(progress);
  },
  get activeScrollTrigger() {
    const activeId = editor.controller.getSnapshot().activeTimelineId;
    return registrations.find(({ id }) => id === activeId)?.timeline.scrollTrigger;
  },
  registerLongTimeline,
  removeLongTimeline,
  destroy() {
    editor.destroy();
  },
  remount() {
    if (!editor.domElement.isConnected) editor = createFixtureEditor();
  },
};

Object.assign(window, { __devtoolsEditorV2Harness: harness });

window.addEventListener("beforeunload", () => {
  harness.destroy();
  removeLongTimeline();
  for (const registration of registrations) registration.destroy();
}, { once: true });

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    harness.destroy();
    removeLongTimeline();
    for (const registration of registrations) registration.destroy();
  });
}
