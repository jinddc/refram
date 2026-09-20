import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Adapted for this standalone playground page from GreenSock's Scroll Shader Pen:
// https://codepen.io/GreenSock/pen/EaVbXeM
// The original credits Jan Kohlbach's Real World Shader and Codrops article.

gsap.registerPlugin(ScrollTrigger);

const IMAGE_URLS = [
  "site-landscape-13.jpg",
  "site-landscape-12.jpg",
  "site-landscape-11.jpg",
  "site-landscape-10.jpg",
  "site-landscape-9.jpg",
  "site-landscape-8.jpg",
  "site-landscape-7.jpg",
  "site-landscape-6.jpg",
  "site-landscape-5.jpeg",
  "site-landscape-4.jpg",
  "site-landscape-3.jpg",
  "site-landscape-2.jpg",
  "site-landscape-1.jpg",
] as const;

const VERTEX_SHADER = `
  attribute vec2 aPosition;
  attribute vec2 aUv;
  uniform vec2 uTextureSize;
  uniform vec2 uQuadSize;
  varying vec2 vUvCover;

  void main() {
    float textureRatio = uTextureSize.x / uTextureSize.y;
    float quadRatio = uQuadSize.x / uQuadSize.y;
    vec2 cover = vec2(1.0);
    if (quadRatio > textureRatio) {
      cover.y = textureRatio / quadRatio;
    } else {
      cover.x = quadRatio / textureRatio;
    }
    vUvCover = aUv * cover + (1.0 - cover) * 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uScrollVelocity;
  uniform float uVelocityStrength;
  varying vec2 vUvCover;

  void main() {
    vec2 coordinates = vUvCover;
    float amount = 0.03 * uVelocityStrength;
    float time = uTime * 0.8;
    coordinates.y += sin(coordinates.x * 8.0 + time) * amount;
    coordinates.x += cos(coordinates.y * 6.0 - time * 0.8) * amount * 0.6;
    float direction = sign(uScrollVelocity);
    float red = texture2D(uTexture, coordinates + vec2(amount * 0.50 * direction, 0.0)).r;
    float green = texture2D(uTexture, coordinates + vec2(amount * 0.25 * direction, 0.0)).g;
    float blue = texture2D(uTexture, coordinates + vec2(-amount * 0.35 * direction, 0.0)).b;
    gl_FragColor = vec4(red, green, blue, 1.0);
  }
`;

interface ShaderFrame {
  readonly element: HTMLElement;
  readonly image: HTMLImageElement;
  readonly canvas: HTMLCanvasElement;
  readonly onImageError: () => void;
  visible: boolean;
  renderer?: {
    resize(): void;
    render(time: number, velocity: number, strength: number): void;
    dispose(): void;
  };
}

function createFallbackImage(index: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  if (!context) return "";

  const hue = (185 + index * 23) % 360;
  const sky = context.createLinearGradient(0, 0, 0, 360);
  sky.addColorStop(0, `hsl(${hue} 38% 12%)`);
  sky.addColorStop(0.62, `hsl(${(hue + 28) % 360} 34% 31%)`);
  sky.addColorStop(1, `hsl(${(hue + 55) % 360} 30% 44%)`);
  context.fillStyle = sky;
  context.fillRect(0, 0, 640, 360);

  context.fillStyle = "rgba(255, 222, 159, 0.75)";
  context.beginPath();
  context.arc(450 - index * 17, 112 + index * 4, 35, 0, Math.PI * 2);
  context.fill();

  const ridge = (base: number, height: number, color: string, offset: number) => {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(0, 360);
    for (let x = 0; x <= 640; x += 8) {
      const wave = Math.sin(x * 0.012 + offset) * height + Math.sin(x * 0.029 - offset) * height * 0.28;
      context.lineTo(x, base + wave);
    }
    context.lineTo(640, 360);
    context.closePath();
    context.fill();
  };
  ridge(235, 22, `hsl(${hue} 20% 34%)`, index * 0.8);
  ridge(290, 30, `hsl(${hue} 25% 19%)`, index * 1.1);
  return canvas.toDataURL("image/png");
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create a WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader compilation error.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createFrameRenderer(frame: ShaderFrame): ShaderFrame["renderer"] {
  const gl = frame.canvas.getContext("webgl", { antialias: true, alpha: false });
  if (!gl) return undefined;

  let vertex: WebGLShader | undefined;
  let fragment: WebGLShader | undefined;
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let texture: WebGLTexture | null = null;
  const disposeResources = () => {
    if (texture) gl.deleteTexture(texture);
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
  };

  try {
    vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    program = gl.createProgram();
    if (!program) throw new Error("Unable to create a WebGL program.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link the shader.");
    }

    buffer = gl.createBuffer();
    texture = gl.createTexture();
    if (!buffer || !texture) throw new Error("Unable to allocate WebGL resources.");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1,
    ]), gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame.image);
    gl.useProgram(program);

    const position = gl.getAttribLocation(program, "aPosition");
    const uv = gl.getAttribLocation(program, "aUv");
    if (position < 0 || uv < 0) throw new Error("Shader attributes are unavailable.");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);

    const textureSize = gl.getUniformLocation(program, "uTextureSize");
    const quadSize = gl.getUniformLocation(program, "uQuadSize");
    const time = gl.getUniformLocation(program, "uTime");
    const scrollVelocity = gl.getUniformLocation(program, "uScrollVelocity");
    const velocityStrength = gl.getUniformLocation(program, "uVelocityStrength");
    gl.uniform2f(textureSize, frame.image.naturalWidth, frame.image.naturalHeight);
    gl.uniform1i(gl.getUniformLocation(program, "uTexture"), 0);

    const renderer = {
      resize() {
        const bounds = frame.element.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        frame.canvas.width = Math.max(1, Math.round(bounds.width * ratio));
        frame.canvas.height = Math.max(1, Math.round(bounds.height * ratio));
        gl.viewport(0, 0, frame.canvas.width, frame.canvas.height);
        gl.useProgram(program);
        gl.uniform2f(quadSize, bounds.width, bounds.height);
      },
      render(elapsed: number, velocity: number, strength: number) {
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1f(time, elapsed);
        gl.uniform1f(scrollVelocity, velocity);
        gl.uniform1f(velocityStrength, strength);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      dispose() {
        frame.canvas.hidden = true;
        disposeResources();
      },
    };
    renderer.resize();
    return renderer;
  } catch (error) {
    disposeResources();
    frame.element.dataset.shaderState = "fallback";
    console.warn("Scroll Shader is showing the image fallback.", error);
    return undefined;
  }
}

const gallery = document.querySelector<HTMLElement>("#shader-gallery");
if (!gallery) throw new Error("Scroll Shader gallery is missing.");

const frames: ShaderFrame[] = IMAGE_URLS.map((name, index) => {
  const element = document.createElement("figure");
  element.className = "shader-frame";
  const image = document.createElement("img");
  image.crossOrigin = "anonymous";
  image.loading = "lazy";
  image.alt = `Landscape image ${index + 1}`;
  element.dataset.assetSource = "codepen";
  const onImageError = () => {
    if (element.dataset.assetSource === "fallback") return;
    element.dataset.assetSource = "fallback";
    image.src = createFallbackImage(index);
  };
  image.addEventListener("error", onImageError);
  image.src = `https://assets.codepen.io/16327/${name}`;
  const canvas = document.createElement("canvas");
  canvas.hidden = true;
  canvas.setAttribute("aria-hidden", "true");
  element.append(image, canvas);
  gallery.append(element);
  return { element, image, canvas, onImageError, visible: false };
});

const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
let disposed = false;
let motionCleanup: (() => void) | undefined;

function startMotion(): () => void {
  const proxy = { v: 0, s: 0 };
  let decay: gsap.core.Tween | undefined;
  const trigger = ScrollTrigger.create({
    start: 0,
    end: () => document.documentElement.scrollHeight - window.innerHeight,
    onUpdate(self) {
      const velocity = gsap.utils.clamp(-2000, 2000, self.getVelocity()) / 1000;
      const strength = Math.min(1, Math.abs(velocity));
      if (strength <= Math.abs(proxy.s)) return;
      proxy.v = velocity;
      proxy.s = strength;
      decay?.kill();
      decay = gsap.to(proxy, {
        v: 0,
        s: 0,
        duration: 0.8,
        ease: "sine.inOut",
        overwrite: true,
      });
    },
  });

  const onImageLoad = (frame: ShaderFrame) => () => {
    if (disposed || preference.matches || frame.renderer || !frame.image.naturalWidth) return;
    frame.renderer = createFrameRenderer(frame);
    if (frame.renderer) {
      frame.canvas.hidden = false;
      frame.element.dataset.shaderState = "ready";
    }
  };
  const loadListeners = frames.map((frame) => {
    const listener = onImageLoad(frame);
    frame.image.addEventListener("load", listener);
    if (frame.image.complete && frame.image.naturalWidth) listener();
    return listener;
  });
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const frame = frames.find(({ element }) => element === entry.target);
      if (frame) frame.visible = entry.isIntersecting;
    }
  }, { rootMargin: "50% 0px" });
  frames.forEach(({ element }) => observer.observe(element));

  const resize = () => frames.forEach(({ renderer }) => renderer?.resize());
  window.addEventListener("resize", resize);
  const tick = (time: number) => {
    if (document.hidden) return;
    for (const frame of frames) {
      if (frame.visible) frame.renderer?.render(time, proxy.v, proxy.s);
    }
  };
  gsap.ticker.add(tick);

  return () => {
    gsap.ticker.remove(tick);
    window.removeEventListener("resize", resize);
    observer.disconnect();
    trigger.kill();
    decay?.kill();
    gsap.killTweensOf(proxy);
    frames.forEach((frame, index) => {
      frame.image.removeEventListener("load", loadListeners[index]!);
      frame.renderer?.dispose();
      frame.renderer = undefined;
      frame.visible = false;
      delete frame.element.dataset.shaderState;
    });
  };
}

function updateMotionPreference(): void {
  motionCleanup?.();
  motionCleanup = undefined;
  if (!disposed && !preference.matches) motionCleanup = startMotion();
}

function destroy(): void {
  if (disposed) return;
  disposed = true;
  motionCleanup?.();
  motionCleanup = undefined;
  frames.forEach(({ image, onImageError }) => image.removeEventListener("error", onImageError));
  preference.removeEventListener("change", updateMotionPreference);
  window.removeEventListener("beforeunload", destroy);
}

preference.addEventListener("change", updateMotionPreference);
window.addEventListener("beforeunload", destroy);
updateMotionPreference();

Object.assign(window, {
  __scrollShaderHarness: {
    get state() {
      return {
        frames: frames.length,
        ready: frames.filter(({ renderer }) => Boolean(renderer)).length,
        visible: frames.filter(({ visible }) => visible).length,
        reducedMotion: preference.matches,
        disposed,
      };
    },
    destroy,
  },
});

if (import.meta.hot) import.meta.hot.dispose(destroy);
