import { gsap } from "gsap";

import {
  defineMotionDevtoolsEditor,
  type MotionDevtoolsEditorElement,
} from "../src/devtools/editor-ui/element";
import {
  defaultTimelineRegistry,
  type MotionTimelineRegistration,
} from "../src/devtools/timeline-registry";

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

const registrations = [registerFiniteTimeline(), registerParticleTimeline()];
defineMotionDevtoolsEditor();
const editor = requireElement<MotionDevtoolsEditorElement>("#devtools-editor-v2-root");
const editorParent = editor.parentNode;
const editorNextSibling = editor.nextSibling;

const harness = {
  get editorRoot() {
    return editor.shadowRoot;
  },
  query(selector: string) {
    return editor.shadowRoot?.querySelector(selector);
  },
  queryAll(selector: string) {
    return editor.shadowRoot?.querySelectorAll(selector) ?? [];
  },
  get activeTimelineId() {
    return editor.controller?.getSnapshot().activeTimelineId;
  },
  get view() {
    return editor.controller?.getSnapshot().view;
  },
  selectTimeline(id: string) {
    return editor.controller?.selectTimeline(id) ?? false;
  },
  destroy() {
    editor.remove();
  },
  remount() {
    if (!editor.isConnected && editorParent) {
      const anchor = editorNextSibling?.parentNode === editorParent
        ? editorNextSibling
        : null;
      editorParent.insertBefore(editor, anchor);
    }
  },
};

Object.assign(window, { __devtoolsEditorV2Harness: harness });

window.addEventListener("beforeunload", () => {
  harness.destroy();
  for (const registration of registrations) registration.destroy();
}, { once: true });

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const registration of registrations) registration.destroy();
  });
}
