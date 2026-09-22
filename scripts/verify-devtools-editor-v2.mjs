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
  const desktop = join(artifactDirectory, "devtools-editor-v2-desktop.png");
  const particles = join(artifactDirectory, "devtools-editor-v2-particles.png");
  const narrow = join(artifactDirectory, "devtools-editor-v2-narrow.png");

  await waitFor(
    () => evaluate(send, `Boolean(window.__devtoolsEditorV2Harness) && window.__devtoolsEditorV2Harness.query("[data-role='status']")?.textContent === "Ready" && window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__track-block").length === 3`),
    "the new DevTools editor",
  );
  const desktopState = await evaluate(send, `(() => ({
    timelines: window.__devtoolsEditorV2Harness.query("[data-role='timeline-select']").options.length,
    preview: window.__devtoolsEditorV2Harness.query("[data-role='preview-surface']").querySelector("slot").assignedElements().includes(document.querySelector("#devtools-v2-finite")),
    tracks: window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__track-block").length,
    rootHeight: window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").getBoundingClientRect().height,
    userSelect: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-devtools-editor]")).userSelect,
    statusPointerEvents: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-role='status']")).pointerEvents,
    trackPointerEvents: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-track-key='animation:0']")).pointerEvents,
    viewportPointerEvents: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']")).pointerEvents,
    playheadIcon: Boolean(window.__devtoolsEditorV2Harness.query("[data-role='playhead'] .devtools-editor__playhead-icon")),
    shadowStyle: Boolean(window.__devtoolsEditorV2Harness.editorRoot.querySelector("style")),
    lightEditorRoot: Boolean(document.querySelector("[data-devtools-editor]")),
    previewDisplay: getComputedStyle(document.querySelector("#devtools-v2-finite .devtools-v2-panel")).display,
  }))()`);
  assert(desktopState.timelines === 2, "The new editor did not list both fixture timelines.");
  assert(desktopState.preview, "The finite preview was not mounted.");
  assert(desktopState.tracks === 3, "The finite timeline did not render three tracks.");
  assert(desktopState.rootHeight >= 900, "The editor did not fill the desktop viewport.");
  assert(desktopState.playheadIcon, "The SVG playhead handle was not rendered.");
  assert(
    desktopState.shadowStyle
      && !desktopState.lightEditorRoot
      && desktopState.previewDisplay === "flex",
    `Editor CSS isolation or slotted preview styling failed: ${JSON.stringify(desktopState)}`,
  );
  assert(
    desktopState.userSelect === "none"
      && desktopState.statusPointerEvents === "none"
      && desktopState.trackPointerEvents === "auto"
      && desktopState.viewportPointerEvents === "auto",
    `Editor interaction styles are incorrect: ${JSON.stringify(desktopState)}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-track-key='animation:1']").click()`);
  assert(
    await evaluate(send, `document.querySelectorAll("[data-devtools-editor-selected='true']").length === 1 && window.__devtoolsEditorV2Harness.query("[data-track-key='animation:1']").getAttribute("aria-pressed") === "true"`),
    "Track selection did not synchronize with the preview.",
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='play']").click()`);
  await waitFor(
    () => evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='pause']")?.textContent === "Pause"`),
    "finite timeline playback",
  );
  const seekPoint = await evaluate(send, `(() => {
    const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']").getBoundingClientRect();
    const lanes = window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__track-lane");
    const lane = lanes[lanes.length - 1].getBoundingClientRect();
    return { x: content.left + content.width * 0.25, y: lane.top + lane.height / 2 };
  })()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", ...seekPoint, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...seekPoint, button: "left", clickCount: 1 });
  const runningSeek = await evaluate(send, `(() => ({
    progress: window.__devtoolsEditorV2Harness.view.time.progress,
    playState: window.__devtoolsEditorV2Harness.view.transport.playState,
  }))()`);
  assert(
    runningSeek.progress >= 0.24
      && runningSeek.progress <= 0.27
      && runningSeek.playState === "running",
    `Click seek did not preserve playback: ${JSON.stringify(runningSeek)}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='pause']").click()`);
  const scrollbarProbe = await evaluate(send, `(() => {
    const viewport = window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']");
    const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']");
    content.style.minWidth = "1800px";
    content.style.minHeight = "800px";
    const bounds = viewport.getBoundingClientRect();
    return {
      horizontal: {
        x: bounds.left + viewport.clientWidth / 2,
        y: bounds.top + viewport.clientHeight + Math.max(1, (viewport.offsetHeight - viewport.clientHeight) / 2),
      },
      vertical: {
        x: bounds.left + viewport.clientWidth + Math.max(1, (viewport.offsetWidth - viewport.clientWidth) / 2),
        y: bounds.top + viewport.clientHeight / 2,
      },
      progress: window.__devtoolsEditorV2Harness.view.time.progress,
    };
  })()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", ...scrollbarProbe.horizontal, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...scrollbarProbe.horizontal, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", ...scrollbarProbe.vertical, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...scrollbarProbe.vertical, button: "left", clickCount: 1 });
  const scrollbarResult = await evaluate(send, `(() => {
    const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']");
    content.style.removeProperty("min-width");
    content.style.removeProperty("min-height");
    return window.__devtoolsEditorV2Harness.view.time.progress;
  })()`);
  assert(
    Math.abs(scrollbarResult - scrollbarProbe.progress) < 0.01,
    `A timeline scrollbar triggered seek: ${JSON.stringify({ scrollbarProbe, scrollbarResult })}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='play']").click()`);
  await waitFor(
    () => evaluate(send, `window.__devtoolsEditorV2Harness.view.transport.playState === "running"`),
    "playback before playhead drag",
  );
  const playheadPoint = await evaluate(send, `(() => {
    const bounds = window.__devtoolsEditorV2Harness.query("[data-role='playhead']").getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2, y: bounds.top + 12 };
  })()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", ...playheadPoint, button: "left", clickCount: 1 });
  const activeDrag = await evaluate(send, `(() => ({
    dragState: window.__devtoolsEditorV2Harness.query("[data-role='playhead']").dataset.dragState,
    playState: window.__devtoolsEditorV2Harness.view.transport.playState,
  }))()`);
  const dragTarget = await evaluate(send, `(() => {
    const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']").getBoundingClientRect();
    return { x: content.left + content.width * 0.65, y: window.__devtoolsEditorV2Harness.query("[data-role='playhead']").getBoundingClientRect().top + 12 };
  })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...dragTarget, button: "left" });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...dragTarget, button: "left", clickCount: 1 });
  const finishedDrag = await evaluate(send, `(() => ({
    cursor: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-role='playhead']")).cursor,
    dragState: window.__devtoolsEditorV2Harness.query("[data-role='playhead']").dataset.dragState,
    playState: window.__devtoolsEditorV2Harness.view.transport.playState,
    progress: window.__devtoolsEditorV2Harness.view.time.progress,
  }))()`);
  assert(
    activeDrag.dragState === "active"
      && activeDrag.playState === "paused"
      && finishedDrag.dragState === "idle"
      && finishedDrag.playState === "paused"
      && finishedDrag.progress >= 0.64
      && finishedDrag.progress <= 0.66
      && finishedDrag.cursor.includes("ew-resize"),
    `Playhead drag states are incorrect: ${JSON.stringify({ activeDrag, finishedDrag })}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='replay']").click()`);
  assert(
    await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-role='current-time']").textContent === "00:00.000"`),
    "Replay did not return the finite timeline to its authored start.",
  );
  await screenshot(send, desktop);

  await evaluate(send, `window.__devtoolsEditorV2Harness.selectTimeline("playground/v2/particles")`);
  await waitFor(
    () => evaluate(send, `window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__track-block").length === 1 && window.__devtoolsEditorV2Harness.query("[data-role='duration']").textContent === "00:05.000"`),
    "the finite particle window",
  );
  assert(
    await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-role='preview-surface']").querySelector("slot").assignedElements().includes(document.querySelector("#devtools-v2-particles")) && window.__devtoolsEditorV2Harness.view.time.start === 99`),
    "The particle preview or authored phase window is incorrect.",
  );
  await waitFor(
    () => evaluate(send, `document.querySelector("#devtools-v2-canvas").height > 1`),
    "the particle Canvas resize",
  );
  const canvasSize = await evaluate(send, `(() => {
    const canvas = document.querySelector("#devtools-v2-canvas");
    const stage = document.querySelector("#devtools-v2-particles");
    const canvasBounds = canvas.getBoundingClientRect();
    const stageBounds = stage.getBoundingClientRect();
    const surfaceBounds = window.__devtoolsEditorV2Harness.query("[data-role='preview-surface']").getBoundingClientRect();
    const editorBounds = window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").getBoundingClientRect();
    const timelineBounds = window.__devtoolsEditorV2Harness.query(".devtools-editor__timeline").getBoundingClientRect();
    return {
      canvasHeight: canvasBounds.height,
      stageHeight: stageBounds.height,
      surfaceHeight: surfaceBounds.height,
      bitmapHeight: canvas.height,
      pixelRatio: window.devicePixelRatio,
      editorHeight: editorBounds.height,
      viewportHeight: window.innerHeight,
      timelineBottom: timelineBounds.bottom,
    };
  })()`);
  assert(
    Math.abs(canvasSize.canvasHeight - canvasSize.stageHeight) < 1
      && Math.abs(canvasSize.bitmapHeight - canvasSize.stageHeight * canvasSize.pixelRatio) < 2
      && Math.abs(canvasSize.editorHeight - canvasSize.viewportHeight) < 1
      && canvasSize.timelineBottom <= canvasSize.viewportHeight + 1,
    `The Canvas height does not match its preview: ${JSON.stringify(canvasSize)}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-track-key='track:particles']").click()`);
  assert(
    await evaluate(send, `document.querySelector("#devtools-v2-canvas").getAttribute("data-devtools-editor-selected") === "true"`),
    "The mapped Canvas target was not highlighted.",
  );
  await screenshot(send, particles);

  await send("Emulation.setDeviceMetricsOverride", {
    width: 640,
    height: 820,
    deviceScaleFactor: 1,
    mobile: false,
  });
  assert(
    await evaluate(send, `document.documentElement.scrollWidth <= 640 && window.__devtoolsEditorV2Harness.query(".devtools-editor__timeline").getBoundingClientRect().height >= 250`),
    "The new editor overflows or collapses its timeline at narrow width.",
  );
  await screenshot(send, narrow);

  await evaluate(send, `window.__devtoolsEditorV2Harness.destroy(); window.__devtoolsEditorV2Harness.remount()`);
  await waitFor(
    () => evaluate(send, `window.__devtoolsEditorV2Harness.queryAll("[data-devtools-editor]").length === 1 && window.__devtoolsEditorV2Harness.query("[data-role='status']")?.textContent === "Ready"`),
    "editor destroy and remount",
  );

  console.log(JSON.stringify({
    status: "pass",
    checks: [
      "timeline-selection",
      "shadow-css-isolation",
      "noninteractive-hit-testing",
      "seek-preserves-playback",
      "scrollbar-does-not-seek",
      "playhead-drag-states",
      "preview-lifecycle",
      "stable-track-selection",
      "transport",
      "replay",
      "finite-particle-window",
      "mapped-highlight",
      "narrow-layout",
      "destroy-remount",
    ],
    screenshots: [
      "artifacts/visual/devtools-editor-v2-desktop.png",
      "artifacts/visual/devtools-editor-v2-particles.png",
      "artifacts/visual/devtools-editor-v2-narrow.png",
    ],
  }));
}

try {
  await runVisualHarness(
    { pagePath: "/devtools-editor-v2.html", profilePrefix: "motion-lab-editor-v2-" },
    verify,
  );
} catch (error) {
  reportVisualFailure(error);
}
