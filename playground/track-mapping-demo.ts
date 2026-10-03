/// <reference types="vite/client" />

import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";
import { registerTimeline } from "../src/devtools/timeline/registry";
import type {
  MotionTimelineTrack,
  RebuildableMotionTimelineRuntime,
} from "../src/devtools/timeline/control";

gsap.registerPlugin(SplitText);

interface InspectedTrack {
  readonly definition: MotionTimelineTrack;
  readonly start: number;
  readonly end: number;
  readonly animatedTargetCount: number;
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing track mapping demo element: ${selector}`);
  return element;
}

const heading = requireElement<HTMLElement>("#mapping-heading");
const canvas = requireElement<HTMLCanvasElement>("#mapping-particles");
const path = requireElement<SVGPathElement>("#mapping-path");
const tracksElement = requireElement<HTMLElement>("#mapping-tracks");
const authorOutput = requireElement<HTMLElement>("#mapping-author");
const debuggerOutput = requireElement<HTMLElement>("#mapping-debugger");
const devtoolsOutput = requireElement<HTMLElement>("#mapping-devtools");
const playButton = requireElement<HTMLButtonElement>("#mapping-play");
const replayButton = requireElement<HTMLButtonElement>("#mapping-replay");
const playhead = requireElement<HTMLElement>("#mapping-playhead");
const timeOutput = requireElement<HTMLOutputElement>("#mapping-time");
const drawing = (() => {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The track mapping demo needs Canvas 2D support.");
  return context;
})();

function createRuntime(): RebuildableMotionTimelineRuntime {
  const split = SplitText.create(heading, {
    type: "words,chars",
    wordsClass: "mapping-demo__word",
    charsClass: "mapping-demo__char",
  });
  const particles = Array.from({ length: 99 }, (_, index) => ({
    angle: (index / 99) * Math.PI * 2,
    radius: 36 + (index % 9) * 6,
    size: 2 + (index % 4),
  }));
  const points = Array.from({ length: 20 }, (_, index) => ({
    x: (index / 19) * 440,
    y: 110,
  }));

  const renderParticles = (): void => {
    drawing.clearRect(0, 0, canvas.width, canvas.height);
    drawing.fillStyle = "#60dce8";
    for (const particle of particles) {
      drawing.beginPath();
      drawing.arc(
        canvas.width / 2 + Math.cos(particle.angle) * particle.radius,
        canvas.height / 2 + Math.sin(particle.angle) * particle.radius * 0.55,
        particle.size,
        0,
        Math.PI * 2,
      );
      drawing.fill();
    }
  };
  const renderPath = (): void => {
    path.setAttribute(
      "d",
      points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "),
    );
  };

  let timeline!: gsap.core.Timeline;
  let textTween!: gsap.core.Tween;
  let particleTween!: gsap.core.Tween;
  const pathTweens: gsap.core.Tween[] = [];
  const context = gsap.context(() => {
    timeline = gsap.timeline({ paused: true, onUpdate: () => {
      renderParticles();
      renderPath();
    } });
    textTween = gsap.fromTo(
      split.chars,
      { yPercent: 45, opacity: 0.35 },
      {
        yPercent: 0,
        opacity: 1,
        immediateRender: false,
        stagger: 0.045,
        duration: 0.8,
        ease: "power2.out",
      },
    );
    particleTween = gsap.to(particles, {
      radius: (index: number) => 66 + (index % 9) * 8,
      angle: (index: number, target: (typeof particles)[number]) => target.angle + Math.PI * 0.7,
      stagger: 0.006,
      duration: 1.35,
      ease: "power2.inOut",
    });
    timeline.add(textTween, 0.12).add(particleTween, 0.55);
    points.forEach((point, index) => {
      const tween = gsap.to(point, {
        y: 60 + Math.sin(index * 0.65) * 45,
        duration: 0.9,
        ease: "power2.inOut",
      });
      pathTweens.push(tween);
      timeline.add(tween, 1.05 + index * 0.025);
    });
  });
  renderParticles();
  renderPath();

  return {
    timeline,
    tracks: [
      {
        id: "text",
        label: "SplitText",
        animation: textTween,
        targets: split.chars,
      },
      {
        id: "particles",
        label: "Particles",
        animation: particleTween,
        targets: canvas,
      },
      {
        id: "path",
        label: "SVG path",
        animations: pathTweens,
        targets: path,
      },
    ],
    dispose(): void {
      context.revert();
      split.revert();
      drawing.clearRect(0, 0, canvas.width, canvas.height);
      path.removeAttribute("d");
    },
  };
}

// Debugger role: read timing from the supplied live animations; never touch DOM.
function inspectTrack(definition: MotionTimelineTrack): InspectedTrack {
  return {
    definition,
    start: Math.min(...definition.animations.map((animation) => animation.startTime())),
    end: Math.max(...definition.animations.map(
      (animation) => animation.startTime() + animation.totalDuration(),
    )),
    animatedTargetCount: new Set(definition.animations.flatMap((animation) => animation.targets())).size,
  };
}

const registration = registerTimeline({
  id: "playground/track-mapping-demo",
  root: requireElement<HTMLElement>(".mapping-demo"),
  create: createRuntime,
});
let selectedId: string | undefined;
let selectedTargets: readonly Element[] = [];
let frame: number | undefined;

// DevTools role: apply and clean up the visual highlight for the selected row.
function selectTrack(id: string): void {
  for (const target of selectedTargets) target.classList.remove("is-inspected");
  const track = registration.tracks.find((candidate) => candidate.id === id);
  selectedId = track?.id;
  selectedTargets = track?.targets ?? [];
  for (const target of selectedTargets) target.classList.add("is-inspected");
  for (const button of tracksElement.querySelectorAll<HTMLButtonElement>("button[data-track-id]")) {
    button.setAttribute("aria-pressed", String(button.dataset.trackId === selectedId));
  }
  if (!track) return;

  const inspection = inspectTrack(track);
  authorOutput.textContent = `Connects ${inspection.animatedTargetCount} animated target${inspection.animatedTargetCount === 1 ? "" : "s"} to ${selectedTargets.length} visual output${selectedTargets.length === 1 ? "" : "s"}.`;
  debuggerOutput.textContent = `${track.animations.length} live tween${track.animations.length === 1 ? "" : "s"} · ${inspection.start.toFixed(2)}–${inspection.end.toFixed(2)}s`;
  devtoolsOutput.textContent = `Highlights ${selectedTargets.length} visual target${selectedTargets.length === 1 ? "" : "s"}; clears the previous selection.`;
}

function renderTracks(): void {
  const inspections = registration.tracks.map(inspectTrack);
  const duration = Math.max(...inspections.map(({ end }) => end));
  tracksElement.replaceChildren();
  for (const inspection of inspections) {
    const definition = inspection.definition;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mapping-demo__track";
    button.dataset.trackId = definition.id;
    button.setAttribute("aria-pressed", "false");
    const label = document.createElement("span");
    label.className = "mapping-demo__track-label";
    label.textContent = definition.label;
    const lane = document.createElement("span");
    lane.className = "mapping-demo__lane";
    const clip = document.createElement("span");
    clip.className = "mapping-demo__clip";
    clip.style.left = `${(inspection.start / duration) * 100}%`;
    clip.style.width = `${((inspection.end - inspection.start) / duration) * 100}%`;
    lane.append(clip);
    button.append(label, lane);
    button.addEventListener("click", () => selectTrack(definition.id));
    tracksElement.append(button);
  }
  selectTrack(selectedId ?? "text");
}

function updateClock(): void {
  const time = registration.timeline.time();
  playhead.style.left = `${registration.timeline.progress() * 100}%`;
  timeOutput.value = `00:${time.toFixed(2).padStart(5, "0")}`;
  timeOutput.textContent = timeOutput.value;
  playButton.textContent = registration.timeline.paused() || registration.timeline.progress() >= 1
    ? "Play"
    : "Pause";
  frame = requestAnimationFrame(updateClock);
}

function replay(andPlay = false): void {
  const activeId = selectedId;
  for (const target of selectedTargets) target.classList.remove("is-inspected");
  selectedTargets = [];
  registration.replay();
  selectedId = activeId;
  renderTracks();
  if (andPlay) void registration.timeline.play();
}

function handlePlay(): void {
  if (registration.timeline.progress() >= 1) {
    replay(true);
  } else if (registration.timeline.paused()) {
    void registration.timeline.play();
  } else {
    registration.timeline.pause();
  }
}

function handleReplay(): void {
  replay(true);
}

playButton.addEventListener("click", handlePlay);
replayButton.addEventListener("click", handleReplay);
renderTracks();
updateClock();

let disposed = false;
function disposeDemo(): void {
  if (disposed) return;
  disposed = true;
  if (frame !== undefined) cancelAnimationFrame(frame);
  playButton.removeEventListener("click", handlePlay);
  replayButton.removeEventListener("click", handleReplay);
  for (const target of selectedTargets) target.classList.remove("is-inspected");
  registration.destroy();
}

window.addEventListener("beforeunload", disposeDemo, { once: true });

import.meta.hot?.dispose(() => {
  window.removeEventListener("beforeunload", disposeDemo);
  disposeDemo();
});
