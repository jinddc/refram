import { gsap } from "gsap";

import {
  registerTimeline,
  type MotionTimelineRegistration,
} from "../../src/devtools/timeline-registry";

interface Particle {
  x: number;
  y: number;
  scale: number;
  rotate: number;
  img: HTMLImageElement;
  color: string;
}

const PARTICLE_COUNT = 99;
const IMAGE_COUNT = 21;
const PARTICLE_COLORS = ["#ff8a56", "#ffdf9d", "#a98ff8", "#81d5cd", "#f5a6cf"];

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing canvas particles target: ${selector}`);
  return element;
}

export function registerCanvasParticlesSequence(): MotionTimelineRegistration {
  const stage = requireElement<HTMLElement>(document, "#canvas-particles-stage");
  const canvas = requireElement<HTMLCanvasElement>(stage, ".motion-particles-fixture__canvas");
  const trigger = requireElement<HTMLButtonElement>(
    stage,
    ".motion-particles-fixture__trigger",
  );
  const drawing = canvas.getContext("2d");
  if (!drawing) throw new Error("The canvas particles demo needs a 2D canvas context.");

  // Images are shared across rebuild generations and fetched only when played.
  const images = Array.from({ length: IMAGE_COUNT }, () => new Image());
  let imagesRequested = false;
  const requestImages = () => {
    if (imagesRequested) return;
    imagesRequested = true;
    images.forEach((image, index) => {
      image.src = `https://assets.codepen.io/16327/flair-${index + 2}.png`;
    });
  };
  const clearCanvas = () => drawing.clearRect(0, 0, canvas.width, canvas.height);
  const resetTrigger = () => {
    trigger.textContent = "Start particles";
    trigger.setAttribute("aria-pressed", "false");
  };

  return registerTimeline({
    id: "playground/canvas-particles/sequence",
    label: "Canvas particles",
    root: stage,
    reset: () => {
      clearCanvas();
      resetTrigger();
    },
    create: () => {
      let width = Math.max(1, canvas.width);
      let height = Math.max(1, canvas.height);
      let radius = Math.max(width, height);
      const particles: Particle[] = Array.from(
        { length: PARTICLE_COUNT },
        (_, index) => ({
          x: 0,
          y: 0,
          scale: 0,
          rotate: 0,
          img: images[index % IMAGE_COUNT]!,
          color: PARTICLE_COLORS[index % PARTICLE_COLORS.length]!,
        }),
      );

      const draw = () => {
        particles.sort((left, right) => left.scale - right.scale);
        drawing.clearRect(0, 0, width, height);
        particles.forEach((particle) => {
          if (particle.scale <= 0) return;
          drawing.translate(width / 2, height / 2);
          drawing.rotate(particle.rotate);
          if (particle.img.complete && particle.img.naturalWidth > 0) {
            drawing.drawImage(
              particle.img,
              particle.x,
              particle.y,
              particle.img.width * particle.scale,
              particle.img.height * particle.scale,
            );
          } else {
            drawing.beginPath();
            drawing.fillStyle = particle.color;
            drawing.arc(particle.x, particle.y, 13 * particle.scale, 0, Math.PI * 2);
            drawing.fill();
          }
          drawing.resetTransform();
        });
      };

      let timeline!: gsap.core.Timeline;
      const context = gsap.context(() => {
        timeline = gsap.timeline({ paused: true, onUpdate: draw }).fromTo(
          particles,
          {
            x: (index: number) => {
              const angle = (index / particles.length) * Math.PI * 2 - Math.PI / 2;
              return Math.cos(angle * 10) * radius;
            },
            y: (index: number) => {
              const angle = (index / particles.length) * Math.PI * 2 - Math.PI / 2;
              return Math.sin(angle * 10) * radius;
            },
            scale: 1.1,
            rotate: 0,
          },
          {
            duration: 5,
            ease: "sine",
            x: 0,
            y: 0,
            scale: 0,
            rotate: -3,
            stagger: { each: -0.05, repeat: -1 },
          },
          0,
        );
        // The original Pen runs immediately. A paused playground declaration
        // needs one explicit render at its authored starting phase.
        timeline.seek(99, false);
      }, stage);

      let transportTween: gsap.core.Tween | undefined;
      let started = false;
      let slowingToPause = false;
      const togglePlayback = () => {
        requestImages();
        transportTween?.kill();
        transportTween = undefined;

        if (!started || timeline.paused()) {
          started = true;
          slowingToPause = false;
          timeline.timeScale(1).play();
          trigger.textContent = "Pause particles";
          trigger.setAttribute("aria-pressed", "true");
          return;
        }

        slowingToPause = !slowingToPause;
        transportTween = gsap.to(timeline, {
          timeScale: slowingToPause ? 0 : 1,
          duration: 0.5,
        });
        trigger.textContent = slowingToPause ? "Resume particles" : "Pause particles";
        trigger.setAttribute("aria-pressed", String(!slowingToPause));
      };
      const onPointerUp = () => togglePlayback();
      const onButtonClick = () => togglePlayback();
      canvas.addEventListener("pointerup", onPointerUp);
      trigger.addEventListener("click", onButtonClick);

      const resize = () => {
        const bounds = stage.getBoundingClientRect();
        if ((bounds.width === 0 || bounds.height === 0) && started) {
          transportTween?.kill();
          transportTween = undefined;
          timeline.pause();
          trigger.textContent = "Resume particles";
          trigger.setAttribute("aria-pressed", "false");
        }
        const nextWidth = Math.max(1, Math.round(bounds.width));
        const nextHeight = Math.max(1, Math.round(bounds.height));
        if (nextWidth === width && nextHeight === height) return;
        width = canvas.width = nextWidth;
        height = canvas.height = nextHeight;
        radius = Math.max(width, height);
        timeline.invalidate().totalTime(timeline.totalTime(), false);
        draw();
      };
      let resizeObserver: ResizeObserver | undefined;
      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(stage);
      } else {
        window.addEventListener("resize", resize);
      }
      resize();

      const redrawOnImageLoad = () => draw();
      images.forEach((image) => {
        image.addEventListener("load", redrawOnImageLoad);
        image.addEventListener("error", redrawOnImageLoad);
      });

      return {
        timeline,
        dispose: () => {
          canvas.removeEventListener("pointerup", onPointerUp);
          trigger.removeEventListener("click", onButtonClick);
          resizeObserver?.disconnect();
          if (!resizeObserver) window.removeEventListener("resize", resize);
          images.forEach((image) => {
            image.removeEventListener("load", redrawOnImageLoad);
            image.removeEventListener("error", redrawOnImageLoad);
          });
          transportTween?.kill();
          context.revert();
          clearCanvas();
          resetTrigger();
        },
      };
    },
  });
}
