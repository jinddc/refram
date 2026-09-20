import { join } from "node:path";

import {
  assert,
  evaluate,
  reportVisualFailure,
  runVisualHarness,
  screenshot,
  waitFor,
} from "./visual-harness.mjs";

async function verifyImageSequence({ artifactDirectory, send }) {
  await waitFor(
    () => evaluate(send, `Boolean(window.__imageSequenceHarness) && document.querySelector("#image-sequence")?.width === 1158`),
    "the standalone image-sequence demo",
  );
  const initial = await evaluate(send, `(() => ({
    frame: window.__imageSequenceHarness.state.frame,
    tween: window.__imageSequenceHarness.state.hasTween,
    scrollTrigger: window.__imageSequenceHarness.state.hasScrollTrigger,
    count: document.querySelector("#sequence-frame")?.textContent,
    scrollable: document.documentElement.scrollHeight > window.innerHeight * 2,
    backLink: document.querySelector(".sequence-header a")?.getAttribute("href"),
  }))()`);
  assert(initial.frame === 0 && initial.count === "001 / 147", "The initial sequence frame is wrong.");
  assert(initial.tween && initial.scrollTrigger, "The source-like Tween/ScrollTrigger is unavailable.");
  assert(initial.scrollable, "The page does not provide the reference's scroll range.");
  assert(initial.backLink === "/motion-devtools.html", "The demo does not link back to the playground.");

  await evaluate(send, `window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) * 0.5)`);
  await waitFor(
    () => evaluate(send, `window.__imageSequenceHarness.state.frame > 50 && window.__imageSequenceHarness.state.frame < 100`),
    "mid-sequence scrolling",
  );
  await screenshot(send, join(artifactDirectory, "image-sequence-midpoint.png"));

  await evaluate(send, `window.scrollTo(0, document.documentElement.scrollHeight)`);
  await waitFor(
    () => evaluate(send, `window.__imageSequenceHarness.state.frame > 140`),
    "scrolling to the final sequence frames",
  );
  await evaluate(send, `window.scrollTo(0, 0)`);
  await waitFor(
    () => evaluate(send, `window.__imageSequenceHarness.state.frame < 5`),
    "reverse scrubbing the image sequence",
  );
  assert(
    await evaluate(send, `window.__imageSequenceHarness.state.cacheSize <= 24`),
    "The image cache exceeded its bounded size.",
  );

  const pageUrl = await evaluate(send, `location.href`);
  await evaluate(send, `window.__imageSequenceHarness.destroy()`);
  assert(
    await evaluate(send, `window.__imageSequenceHarness.state.destroyed && !window.__imageSequenceHarness.state.hasTween && !window.__imageSequenceHarness.state.hasScrollTrigger && window.__imageSequenceHarness.state.cacheSize === 0`),
    "The image sequence did not release its authored resources.",
  );

  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await evaluate(send, `window.__imageSequenceHarness = undefined`);
  await send("Page.navigate", { url: pageUrl });
  await waitFor(
    () => evaluate(send, `window.__imageSequenceHarness?.state.reducedMotion && !window.__imageSequenceHarness.state.hasTween && window.__imageSequenceHarness.state.frame === 0`),
    "the reduced-motion still frame on page load",
  );

  console.log(JSON.stringify({
    status: "pass",
    checks: {
      standaloneRoute: "pass",
      tweenAndScrollTrigger: "pass",
      forwardAndReverseScrub: "pass",
      boundedImageCache: "pass",
      teardown: "pass",
      reducedMotionOnLoad: "pass",
    },
    screenshots: ["artifacts/visual/image-sequence-midpoint.png"],
  }));
}

try {
  await runVisualHarness(
    { pagePath: "/image-sequence.html", profilePrefix: "motion-lab-image-sequence-" },
    verifyImageSequence,
  );
} catch (error) {
  reportVisualFailure(error);
}
