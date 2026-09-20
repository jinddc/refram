import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Scroll-controlled Tween study adapted from GreenSock's image-sequence helper:
// https://codepen.io/GreenSock/pen/VwgevYW
// Original image URLs are hosted by Apple; procedural frames remain available offline.

gsap.registerPlugin(ScrollTrigger);

const FRAME_COUNT = 147;
const LAST_FRAME = FRAME_COUNT - 1;
const IMAGE_BASE = "https://www.apple.com/105/media/us/airpods-pro/2019/1299e2f5_9206_4470_b28e_08307a42f19b/anim/sequence/large/01-hero-lightpass/";
const MAX_CACHED_IMAGES = 24;

interface CachedImage {
  readonly image: HTMLImageElement;
  state: "loading" | "ready" | "failed";
}

const canvas = document.querySelector<HTMLCanvasElement>("#image-sequence");
const counter = document.querySelector<HTMLOutputElement>("#sequence-frame");
const assetStatus = document.querySelector<HTMLElement>("#sequence-asset-status");
if (!canvas || !counter || !assetStatus) throw new Error("Image sequence playground is incomplete.");
const context = canvas.getContext("2d");
if (!context) throw new Error("This browser cannot render the canvas image sequence.");

const imageCache = new Map<number, CachedImage>();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let tween: gsap.core.Tween | undefined;
let destroyed = false;
let currentFrame = 0;
let lastDrawnFrame = -1;
let loadedImages = 0;
let failedImages = 0;

function updateAssetStatus(): void {
  if (reducedMotion.matches) {
    assetStatus.textContent = "Reduced motion: still frame";
  } else if (loadedImages > 0) {
    assetStatus.textContent = `Original frames available: ${loadedImages} · procedural fallback for remaining frames`;
  } else if (failedImages > 0) {
    assetStatus.textContent = "Original frames unavailable · procedural fallback active";
  } else {
    assetStatus.textContent = "Loading original frames · procedural preview active";
  }
}

function drawCapsule(x: number, y: number, angle: number, scale: number): void {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.scale(scale, scale);
  context.shadowColor = "rgba(190, 211, 225, 0.25)";
  context.shadowBlur = 42;
  const surface = context.createLinearGradient(-54, -120, 60, 130);
  surface.addColorStop(0, "#7d8d98");
  surface.addColorStop(0.23, "#f5f7f4");
  surface.addColorStop(0.62, "#cbd3d8");
  surface.addColorStop(1, "#697882");
  context.fillStyle = surface;
  context.beginPath();
  context.roundRect(-48, -132, 96, 264, 48);
  context.fill();
  context.shadowBlur = 0;
  context.fillStyle = "rgba(30, 42, 52, 0.7)";
  context.beginPath();
  context.ellipse(0, -78, 25, 10, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "rgba(255, 255, 255, 0.7)";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(-19, -105);
  context.bezierCurveTo(-42, -25, -33, 53, -8, 101);
  context.stroke();
  context.restore();
}

function drawProceduralFrame(frame: number): void {
  const progress = frame / LAST_FRAME;
  const width = canvas.width;
  const height = canvas.height;
  const backdrop = context.createRadialGradient(width * 0.5, height * 0.48, 30, width * 0.5, height * 0.48, 600);
  backdrop.addColorStop(0, "#18212a");
  backdrop.addColorStop(0.52, "#0a1016");
  backdrop.addColorStop(1, "#030506");
  context.fillStyle = backdrop;
  context.fillRect(0, 0, width, height);

  const orbit = (progress - 0.5) * Math.PI * 1.5;
  const spread = 155 + Math.sin(progress * Math.PI) * 75;
  const vertical = Math.sin(progress * Math.PI * 2) * 45;
  context.strokeStyle = "rgba(154, 186, 203, 0.10)";
  context.lineWidth = 2;
  context.beginPath();
  context.ellipse(width / 2, height / 2 + 100, 310, 65, 0, 0, Math.PI * 2);
  context.stroke();
  drawCapsule(width / 2 - spread, height / 2 + vertical, -0.3 + orbit * 0.4, 1.05);
  drawCapsule(width / 2 + spread, height / 2 - vertical, 0.3 - orbit * 0.4, 1.05);

  context.fillStyle = "rgba(223, 239, 247, 0.42)";
  context.font = "600 18px ui-monospace, monospace";
  context.letterSpacing = "4px";
  context.fillText("MOTION STUDY / IMAGE SEQUENCE", 62, height - 56);
}

function drawFrame(frame: number, force = false): void {
  if (destroyed) return;
  const index = Math.max(0, Math.min(LAST_FRAME, Math.round(frame)));
  if (index === lastDrawnFrame && !force) return;
  currentFrame = index;
  lastDrawnFrame = index;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const cached = imageCache.get(index);
  if (cached?.state === "ready" && cached.image.naturalWidth > 0) {
    context.drawImage(cached.image, 0, 0, canvas.width, canvas.height);
  } else {
    drawProceduralFrame(index);
  }
  counter.value = `${String(index + 1).padStart(3, "0")} / ${FRAME_COUNT}`;
  counter.textContent = counter.value;
}

function requestImage(index: number): void {
  if (destroyed || reducedMotion.matches || index < 0 || index > LAST_FRAME) return;
  const existing = imageCache.get(index);
  if (existing) {
    imageCache.delete(index);
    imageCache.set(index, existing);
    return;
  }

  const image = new Image();
  image.decoding = "async";
  const cached: CachedImage = { image, state: "loading" };
  image.onload = () => {
    if (destroyed || imageCache.get(index) !== cached) return;
    cached.state = "ready";
    loadedImages += 1;
    updateAssetStatus();
    if (index === currentFrame) drawFrame(index, true);
  };
  image.onerror = () => {
    if (destroyed || imageCache.get(index) !== cached) return;
    cached.state = "failed";
    failedImages += 1;
    updateAssetStatus();
  };
  image.src = `${IMAGE_BASE}${String(index + 1).padStart(4, "0")}.jpg`;
  imageCache.set(index, cached);

  while (imageCache.size > MAX_CACHED_IMAGES) {
    const oldestIndex = imageCache.keys().next().value;
    if (oldestIndex === undefined) break;
    const oldest = imageCache.get(oldestIndex)!;
    oldest.image.onload = null;
    oldest.image.onerror = null;
    imageCache.delete(oldestIndex);
  }
}

function requestNearbyImages(frame: number): void {
  const index = Math.round(frame);
  for (let offset = -2; offset <= 2; offset += 1) requestImage(index + offset);
}

function stopMotion(): void {
  tween?.scrollTrigger?.kill();
  tween?.kill();
  tween = undefined;
}

function updateMotionPreference(): void {
  stopMotion();
  if (destroyed) return;
  updateAssetStatus();
  if (reducedMotion.matches) {
    drawFrame(0, true);
    return;
  }

  const playhead = { frame: 0 };
  tween = gsap.to(playhead, {
    frame: LAST_FRAME,
    ease: "none",
    duration: FRAME_COUNT / 30,
    scrollTrigger: { start: 0, end: "max", scrub: true },
    onUpdate: () => {
      drawFrame(playhead.frame);
      requestNearbyImages(playhead.frame);
    },
  });
  const initial = Math.round((window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight)) * LAST_FRAME);
  drawFrame(initial, true);
  requestNearbyImages(initial);
}

function destroy(): void {
  if (destroyed) return;
  destroyed = true;
  stopMotion();
  reducedMotion.removeEventListener("change", updateMotionPreference);
  window.removeEventListener("beforeunload", destroy);
  for (const cached of imageCache.values()) {
    cached.image.onload = null;
    cached.image.onerror = null;
  }
  imageCache.clear();
}

reducedMotion.addEventListener("change", updateMotionPreference);
window.addEventListener("beforeunload", destroy);
updateMotionPreference();

Object.assign(window, {
  __imageSequenceHarness: {
    get state() {
      return {
        frame: currentFrame,
        cacheSize: imageCache.size,
        loadedImages,
        failedImages,
        hasTween: Boolean(tween),
        hasScrollTrigger: Boolean(tween?.scrollTrigger),
        reducedMotion: reducedMotion.matches,
        destroyed,
      };
    },
    destroy,
  },
});

if (import.meta.hot) import.meta.hot.dispose(destroy);
