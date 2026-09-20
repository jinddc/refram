import { join } from "node:path";

import {
  assert,
  evaluate,
  reportVisualFailure,
  runVisualHarness,
  screenshot,
  waitFor,
} from "./visual-harness.mjs";

async function verify({ artifactDirectory, send }) {
  await waitFor(
    () => evaluate(send, `document.querySelectorAll("[data-track-id]").length === 3 && document.querySelectorAll(".mapping-demo__char").length > 6`),
    "the grouped track demo",
  );

  const initialCharacters = await evaluate(send, `document.querySelectorAll(".mapping-demo__char").length`);
  assert(
    await evaluate(send, `[...document.querySelectorAll("[data-track-id]")].every((track) => track.children.length === 2) && document.querySelector("#mapping-author").textContent.includes(${JSON.stringify(`${initialCharacters} animated targets`)})`),
    "Track rows should show only a label and clip while selection details remain below.",
  );
  const clipWidths = await evaluate(send, `[...document.querySelectorAll(".mapping-demo__clip")].map((clip) => ({ inline: clip.style.width, rendered: clip.getBoundingClientRect().width }))`);
  assert(
    clipWidths.every(({ rendered }) => rendered > 60),
    `The grouped clips are not readable: ${JSON.stringify(clipWidths)}`,
  );
  assert(
    await evaluate(send, `document.querySelectorAll(".mapping-demo__char.is-inspected").length === ${initialCharacters}`),
    "Selecting the text track did not highlight every character.",
  );
  assert(
    await evaluate(send, `getComputedStyle(document.querySelector(".mapping-demo__char")).opacity !== "0"`),
    "The selected SplitText characters are visually hidden.",
  );
  await screenshot(send, join(artifactDirectory, "track-mapping-text.png"));

  await evaluate(send, `document.querySelector("[data-track-id='particles']").click()`);
  assert(
    await evaluate(send, `document.querySelector("#mapping-particles").classList.contains("is-inspected") && document.querySelectorAll(".mapping-demo__char.is-inspected").length === 0 && document.querySelector("#mapping-debugger").textContent.includes("1 live tween") && document.querySelector("#mapping-author").textContent.includes("99 animated targets")`),
    "Selecting particles did not transfer highlight from characters to canvas.",
  );
  await screenshot(send, join(artifactDirectory, "track-mapping-particles.png"));

  await evaluate(send, `document.querySelector("[data-track-id='path']").click()`);
  assert(
    await evaluate(send, `document.querySelector("#mapping-path").classList.contains("is-inspected") && !document.querySelector("#mapping-particles").classList.contains("is-inspected") && document.querySelector("#mapping-debugger").textContent.includes("20 live tweens") && document.querySelector("#mapping-author").textContent.includes("20 animated targets")`),
    "Selecting the path did not map its numeric tweens to the SVG output.",
  );
  await screenshot(send, join(artifactDirectory, "track-mapping-path.png"));

  const pathBeforePlay = await evaluate(send, `document.querySelector("#mapping-path").getAttribute("d")`);
  const canvasBeforePlay = await evaluate(send, `document.querySelector("#mapping-particles").toDataURL()`);
  await evaluate(send, `document.querySelector("#mapping-play").click()`);
  await waitFor(
    () => evaluate(send, `document.querySelector("#mapping-path").getAttribute("d") !== ${JSON.stringify(pathBeforePlay)}`),
    "visible SVG path motion during Play",
  );
  assert(
    await evaluate(send, `document.querySelector("#mapping-particles").toDataURL() !== ${JSON.stringify(canvasBeforePlay)}`),
    "Play moved the path but did not render particle motion.",
  );
  const timeBeforeReplay = await evaluate(send, `Number.parseFloat(document.querySelector("#mapping-time").textContent.slice(3))`);
  await evaluate(send, `document.querySelector("#mapping-replay").click()`);
  assert(
    await evaluate(send, `document.querySelectorAll(".mapping-demo__char").length === ${initialCharacters} && document.querySelectorAll(".mapping-demo__char .mapping-demo__char").length === 0 && document.querySelector("#mapping-path").classList.contains("is-inspected") && document.querySelectorAll("[data-track-id]").length === 3 && document.querySelector("#mapping-path").getAttribute("d") === ${JSON.stringify(pathBeforePlay)}`),
    "Replay did not restore the path baseline and clean the prior SplitText DOM.",
  );
  await waitFor(
    () => evaluate(send, `Number.parseFloat(document.querySelector("#mapping-time").textContent.slice(3)) < ${timeBeforeReplay} && document.querySelector("#mapping-play").textContent === "Pause"`),
    "Replay to restart playback",
  );
  await waitFor(
    () => evaluate(send, `document.querySelector("#mapping-path").getAttribute("d") !== ${JSON.stringify(pathBeforePlay)}`),
    "visible SVG path motion after Replay",
  );
  await waitFor(
    () => evaluate(send, `document.querySelector("#mapping-play").textContent === "Play" && document.querySelector("#mapping-time").textContent !== "00:00.00"`),
    "completed replay",
  );
  await evaluate(send, `document.querySelector("#mapping-play").click()`);
  await waitFor(
    () => evaluate(send, `document.querySelector("#mapping-play").textContent === "Pause" && Number.parseFloat(document.querySelector("#mapping-time").textContent.slice(3)) < 0.5`),
    "Play to restart a completed timeline",
  );

  await send("Emulation.setDeviceMetricsOverride", {
    width: 720,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  assert(
    await evaluate(send, `document.documentElement.scrollWidth <= 720 && [...document.querySelectorAll("[data-track-id]")].every((track) => track.getBoundingClientRect().width > 0)`),
    "The narrow demo layout overflows or hides its grouped tracks.",
  );

  console.log(JSON.stringify({
    status: "pass",
    checks: ["text-group", "canvas-mapping", "svg-mapping", "playback", "replay-cleanup", "narrow-layout"],
    screenshots: [
      "artifacts/visual/track-mapping-text.png",
      "artifacts/visual/track-mapping-particles.png",
      "artifacts/visual/track-mapping-path.png",
    ],
  }));
}

try {
  await runVisualHarness(
    { pagePath: "/track-mapping-demo.html", profilePrefix: "motion-lab-track-mapping-" },
    verify,
  );
} catch (error) {
  reportVisualFailure(error);
}
