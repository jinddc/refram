import { join } from "node:path";

import {
  assert,
  evaluate,
  reportVisualFailure,
  runVisualHarness,
  screenshot,
  waitFor,
} from "./visual-harness.mjs";

async function verifyScrollShader({ artifactDirectory, send }) {
  await waitFor(
    () => evaluate(send, `Boolean(window.__scrollShaderHarness) && document.querySelectorAll(".shader-frame").length === 13`),
    "the standalone Scroll Shader playground",
  );
  const initial = await evaluate(send, `(() => ({
    frames: window.__scrollShaderHarness.state.frames,
    reducedMotion: window.__scrollShaderHarness.state.reducedMotion,
    images: document.querySelectorAll(".shader-frame img").length,
    backLink: document.querySelector(".shader-back")?.getAttribute("href"),
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
  }))()`);
  assert(initial.frames === 13 && initial.images === 13, "The source's image frames were not present.");
  assert(initial.backLink === "/motion-devtools.html", "The demo did not link back to the playground.");
  assert(!initial.reducedMotion, "The browser unexpectedly started in reduced-motion mode.");
  assert(!initial.horizontalOverflow, "The demo overflowed the viewport horizontally.");

  await evaluate(send, `window.scrollTo(0, document.querySelector(".shader-frame").offsetTop - 130)`);
  await waitFor(() => evaluate(send, `window.scrollY > 100`), "scrolling the image gallery");
  await waitFor(
    () => evaluate(send, `document.querySelector(".shader-frame img")?.naturalWidth > 0`),
    "the first gallery image or its fallback",
    15_000,
  );
  const firstImage = await evaluate(send, `(() => ({
    loaded: document.querySelector(".shader-frame img")?.naturalWidth > 0,
    state: document.querySelector(".shader-frame")?.dataset.shaderState ?? "pending",
    assetSource: document.querySelector(".shader-frame")?.dataset.assetSource,
    ready: window.__scrollShaderHarness.state.ready,
    visible: window.__scrollShaderHarness.state.visible,
  }))()`);
  assert(firstImage.visible > 0, "The scroll gallery did not observe a visible frame.");
  assert(firstImage.loaded, "Neither the CodePen image nor the procedural fallback loaded.");
  assert(firstImage.state === "ready" && firstImage.ready > 0, "The first WebGL shader was not ready.");
  await screenshot(send, join(artifactDirectory, "scroll-shader.png"));

  const pageUrl = await evaluate(send, `location.href`);
  await evaluate(send, `window.__scrollShaderHarness.destroy()`);
  assert(
    await evaluate(send, `window.__scrollShaderHarness.state.disposed && window.__scrollShaderHarness.state.ready === 0 && [...document.querySelectorAll(".shader-frame canvas")].every((canvas) => canvas.hidden)`),
    "The shader demo did not release its visible renderers on destroy.",
  );
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await evaluate(send, `window.__scrollShaderHarness = undefined`);
  await send("Page.navigate", { url: pageUrl });
  await waitFor(
    () => evaluate(send, `window.__scrollShaderHarness?.state.reducedMotion && !window.__scrollShaderHarness.state.disposed && window.__scrollShaderHarness.state.ready === 0 && [...document.querySelectorAll(".shader-frame canvas")].every((canvas) => canvas.hidden)`),
    "the reduced-motion image fallback on page load",
  );

  console.log(JSON.stringify({
    status: "pass",
    checks: {
      standaloneRoute: "pass",
      imageAsset: firstImage.assetSource,
      webglShader: "pass",
      scrollVisibility: "pass",
      reducedMotionOnLoad: "pass",
      teardown: "pass",
    },
    screenshots: ["artifacts/visual/scroll-shader.png"],
  }));
}

try {
  await runVisualHarness(
    { pagePath: "/scroll-shader.html", profilePrefix: "motion-lab-scroll-shader-" },
    verifyScrollShader,
  );
} catch (error) {
  reportVisualFailure(error);
}
