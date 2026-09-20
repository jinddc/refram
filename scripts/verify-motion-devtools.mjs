import { join } from "node:path";

import {
  assert,
  evaluate,
  reportVisualFailure,
  runVisualHarness,
  screenshot,
  waitFor,
} from "./visual-harness.mjs";

async function clickAt(send, x, y) {
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
}

async function verifyMotionDevTools({ artifactDirectory, send }) {
  const desktop = join(artifactDirectory, "motion-devtools-desktop.png");
  const resized = join(artifactDirectory, "motion-devtools-resized.png");
  const narrow = join(artifactDirectory, "motion-devtools-narrow.png");
  const collapsed = join(artifactDirectory, "motion-devtools-collapsed.png");
  const containerAnimationShot = join(
    artifactDirectory,
    "motion-devtools-container-animation.png",
  );
  const shapeOverlayShot = join(artifactDirectory, "motion-devtools-shape-overlay.png");
  const canvasParticlesShot = join(artifactDirectory, "motion-devtools-canvas-particles.png");
  const rollingTextShot = join(artifactDirectory, "motion-devtools-rolling-text.png");

  await waitFor(
    () => evaluate(send, `Boolean(window.__motionDevToolsHarness) && document.querySelectorAll(".motion-editor__block").length === 3 && document.querySelector("[data-role='readiness']")?.textContent === "ready"`),
    "the Motion DevTools workspace",
  );
  assert(
    await evaluate(send, `document.querySelector(".motion-editor__demo-link")?.getAttribute("href") === "/scroll-shader.html"`),
    "The standalone Scroll Shader demo was not linked from the playground.",
  );
  assert(
    await evaluate(send, `document.querySelector(".motion-editor__demo-link[href='/image-sequence.html']") !== null`),
    "The standalone Image Sequence demo was not linked from the playground.",
  );

  const distributedRegistry = await evaluate(send, `(() => ({
    ids: window.__motionDevToolsHarness.registrationIds,
    active: window.__motionDevToolsHarness.activeTimelineId,
    options: [...document.querySelector("[data-role='timeline-selector']").options].map(({ value, textContent }) => ({ value, textContent })),
  }))()`);
  assert(distributedRegistry.ids.length === 6, "Distributed timeline modules were not all registered.");
  assert(distributedRegistry.active === "playground/editor/sequence", "The first registration was not initially active.");
  assert(
    distributedRegistry.options[1]?.textContent.includes("playground/detail/sequence"),
    "The timeline selector did not expose the stable timeline ID.",
  );
  assert(
    distributedRegistry.options[2]?.textContent.includes("playground/container-animation/sequence"),
    "The timeline selector did not expose the container-animation demo.",
  );
  assert(
    distributedRegistry.options[3]?.textContent.includes("playground/svg-shape-overlays/sequence"),
    "The timeline selector did not expose the SVG shape overlays demo.",
  );
  assert(
    distributedRegistry.options[4]?.textContent.includes("playground/canvas-particles/sequence"),
    "The timeline selector did not expose the canvas particles demo.",
  );
  assert(
    distributedRegistry.options[5]?.textContent.includes("playground/rolling-text/sequence"),
    "The timeline selector did not expose the rolling text demo.",
  );
  await evaluate(send, `document.querySelector("[data-role='timeline-selector']").focus()`);
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowDown",
    code: "ArrowDown",
    windowsVirtualKeyCode: 40,
    nativeVirtualKeyCode: 40,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "ArrowDown",
    code: "ArrowDown",
    windowsVirtualKeyCode: 40,
    nativeVirtualKeyCode: 40,
  });
  await waitFor(
    () => evaluate(send, `window.__motionDevToolsHarness.activeTimelineId === "playground/detail/sequence" && document.querySelectorAll(".motion-editor__block").length === 2 && document.querySelector("#motion-source-home").contains(document.querySelector("#editor-stage"))`),
    "the distributed detail timeline",
  );
  assert(
    await evaluate(send, `window.__motionDevToolsHarness.removeTimeline("playground/detail/sequence")`),
    "The active distributed timeline could not be removed.",
  );
  await waitFor(
    () => evaluate(send, `window.__motionDevToolsHarness.activeTimelineId === "playground/container-animation/sequence" && window.__motionDevToolsHarness.registrationIds.length === 5 && document.querySelector("[data-role='timeline-selector']").options.length === 5 && document.querySelector("[data-role='preview-surface']").contains(document.querySelector("#container-animation-stage")) && document.querySelector("#motion-source-home").contains(document.querySelector("#detail-stage"))`),
    "the fallback after active timeline removal",
  );

  const containerAnimation = await evaluate(send, `(() => ({
    characters: document.querySelectorAll(".motion-container-fixture__char").length,
    words: document.querySelectorAll(".motion-container-fixture__word").length,
    driver: document.querySelector("[data-role='driver']")?.textContent,
    tracks: document.querySelectorAll(".motion-editor__block").length,
  }))()`);
  assert(containerAnimation.characters > 80, "SplitText did not create the expected character targets.");
  assert(containerAnimation.words > 10, "SplitText did not create the expected word targets.");
  assert(containerAnimation.driver === "manual", "The container-animation demo was not treated as a manual timeline.");
  assert(containerAnimation.tracks === 2, "The container-animation demo did not expose its two authored tracks.");
  assert(
    await evaluate(send, `document.querySelectorAll(".motion-editor__block")[0]?.textContent === "Characters"`),
    "The authored SplitText group did not appear as one named track.",
  );
  await evaluate(send, `document.querySelectorAll(".motion-editor__block")[0].click()`);
  assert(
    await evaluate(send, `[...document.querySelectorAll(".motion-container-fixture__char")].every((char) => char.getAttribute("data-motion-editor-selected") === "true")`),
    "The container-animation SplitText track selected only part of its character group.",
  );
  await screenshot(send, containerAnimationShot);

  await evaluate(send, `(() => {
    window.__motionDevToolsHarness.timeline.totalProgress(1, true);
    return true;
  })()`);
  await waitFor(
    () => evaluate(send, `Number.parseFloat(document.querySelector("[data-motion-editor]").style.getPropertyValue("--motion-editor-progress")) >= 0.999`),
    "the completed container-animation timeline",
  );
  await evaluate(send, `(() => {
    window.__containerAnimationTimelineBeforeReplay = window.__motionDevToolsHarness.timeline;
    document.querySelector("[data-action='toggle-play']").click();
  })()`);
  await waitFor(
    () => evaluate(send, `window.__motionDevToolsHarness.timeline !== window.__containerAnimationTimelineBeforeReplay && !window.__motionDevToolsHarness.timeline.paused() && document.querySelectorAll(".motion-container-fixture__char").length === ${containerAnimation.characters}`),
    "a clean container-animation replay",
  );

  assert(
    await evaluate(send, `window.__motionDevToolsHarness.selectTimeline("playground/svg-shape-overlays/sequence")`),
    "The SVG shape overlays demo could not be selected.",
  );
  await waitFor(
    () => evaluate(send, `window.__motionDevToolsHarness.activeTimelineId === "playground/svg-shape-overlays/sequence" && document.querySelector("[data-role='preview-surface']").contains(document.querySelector("#svg-shape-overlays-stage")) && document.querySelector("[data-role='readiness']")?.textContent === "empty"`),
    "the SVG shape overlays preview",
  );
  const shapeBefore = await evaluate(send, `(() => ({
    paths: document.querySelectorAll(".motion-shape-fixture__path").length,
    pathData: [...document.querySelectorAll(".motion-shape-fixture__path")].map((path) => path.getAttribute("d")),
    driver: document.querySelector("[data-role='driver']")?.textContent,
    tracks: document.querySelectorAll(".motion-editor__block").length,
    playDisabled: document.querySelector("[data-action='toggle-play']")?.disabled,
  }))()`);
  assert(shapeBefore.paths === 2, "The SVG shape overlay did not render two paths.");
  assert(shapeBefore.pathData.every((value) => value === null), "The SVG path baseline was not clean.");
  assert(shapeBefore.driver === "manual", "The SVG shape overlay was not a manual timeline.");
  assert(shapeBefore.tracks === 0 && shapeBefore.playDisabled, "The SVG array-target tweens unexpectedly appeared as DOM tracks.");

  await evaluate(send, `(() => {
    document.querySelector(".motion-shape-fixture__trigger").click();
    window.__motionDevToolsHarness.timeline.pause().totalProgress(0.45, false);
    return true;
  })()`);
  const shapeMidpoint = await evaluate(send, `(() => ({
    pathData: [...document.querySelectorAll(".motion-shape-fixture__path")].map((path) => path.getAttribute("d")),
    pressed: document.querySelector(".motion-shape-fixture__trigger")?.getAttribute("aria-pressed"),
  }))()`);
  assert(shapeMidpoint.pathData.every((value) => value?.includes(" C ")), "The overlay paths did not draw at mid-progress.");
  assert(shapeMidpoint.pressed === "true", "The overlay trigger did not expose its open state.");
  await screenshot(send, shapeOverlayShot);

  await evaluate(send, `(() => {
    window.__motionDevToolsHarness.timeline.totalProgress(1, false);
    document.querySelector(".motion-shape-fixture__trigger").click();
    window.__motionDevToolsHarness.timeline.pause().totalProgress(0.45, false);
    return true;
  })()`);
  assert(
    await evaluate(send, `document.querySelector(".motion-shape-fixture__trigger")?.getAttribute("aria-pressed") === "false"`),
    "The SVG overlay did not toggle closed.",
  );
  await evaluate(send, `(() => {
    window.__shapeTimelineBeforeReplay = window.__motionDevToolsHarness.timeline;
    return window.__motionDevToolsHarness.replayActiveTimeline();
  })()`);
  await waitFor(
    () => evaluate(send, `window.__motionDevToolsHarness.timeline !== window.__shapeTimelineBeforeReplay && [...document.querySelectorAll(".motion-shape-fixture__path")].every((path) => !path.hasAttribute("d")) && document.querySelector(".motion-shape-fixture__trigger")?.getAttribute("aria-pressed") === "false"`),
    "a clean SVG shape overlay replay",
  );

  assert(
    await evaluate(send, `window.__motionDevToolsHarness.selectTimeline("playground/canvas-particles/sequence")`),
    "The canvas particles demo could not be selected.",
  );
  await waitFor(
    () => evaluate(send, `window.__motionDevToolsHarness.activeTimelineId === "playground/canvas-particles/sequence" && document.querySelector("[data-role='preview-surface']").contains(document.querySelector("#canvas-particles-stage")) && document.querySelector(".motion-particles-fixture__canvas")?.width > 400`),
    "the resized canvas particles preview",
  );
  const particlesBefore = await evaluate(send, `(() => ({
    phase: window.__motionDevToolsHarness.timeline.totalTime(),
    particleCount: window.__motionDevToolsHarness.timeline.getChildren(false, true, false)[0]?.targets().length,
    readiness: document.querySelector("[data-role='readiness']")?.textContent,
    playDisabled: document.querySelector("[data-action='toggle-play']")?.disabled,
    tracks: document.querySelectorAll(".motion-editor__block").length,
    width: document.querySelector(".motion-particles-fixture__canvas")?.width,
    height: document.querySelector(".motion-particles-fixture__canvas")?.height,
  }))()`);
  assert(Math.abs(particlesBefore.phase - 99) < 0.001, "The authored particle phase was not 99 initially.");
  assert(particlesBefore.particleCount === 99, "The canvas timeline did not author 99 particle targets.");
  assert(particlesBefore.width > 400 && particlesBefore.height > 200, "The canvas did not fit its preview.");
  assert(particlesBefore.readiness === "empty" && particlesBefore.playDisabled && particlesBefore.tracks === 0, "The infinite canvas timeline unexpectedly appeared as a finite track.");

  await evaluate(send, `document.querySelector(".motion-particles-fixture__trigger").click()`);
  await waitFor(
    () => evaluate(send, `window.__motionDevToolsHarness.timeline.totalTime() > 99.1 && !window.__motionDevToolsHarness.timeline.paused() && document.querySelector(".motion-particles-fixture__trigger")?.getAttribute("aria-pressed") === "true"`),
    "canvas particles playback",
  );
  await screenshot(send, canvasParticlesShot);

  await evaluate(send, `document.querySelector(".motion-particles-fixture__canvas").dispatchEvent(new PointerEvent("pointerup"))`);
  await waitFor(
    () => evaluate(send, `window.__motionDevToolsHarness.timeline.timeScale() < 0.05 && document.querySelector(".motion-particles-fixture__trigger")?.textContent === "Resume particles"`),
    "canvas particles slow-to-pause interaction",
  );
  await evaluate(send, `document.querySelector(".motion-particles-fixture__canvas").dispatchEvent(new PointerEvent("pointerup"))`);
  await waitFor(
    () => evaluate(send, `window.__motionDevToolsHarness.timeline.timeScale() > 0.95 && document.querySelector(".motion-particles-fixture__trigger")?.textContent === "Pause particles"`),
    "canvas particles resume interaction",
  );
  await evaluate(send, `(() => {
    window.__particlesTimelineBeforeHide = window.__motionDevToolsHarness.timeline;
    return window.__motionDevToolsHarness.selectTimeline("playground/editor/sequence");
  })()`);
  await waitFor(
    () => evaluate(send, `window.__particlesTimelineBeforeHide.paused() && document.querySelector("#motion-source-home").contains(document.querySelector("#canvas-particles-stage"))`),
    "canvas particles stopping when their preview is hidden",
  );
  assert(
    await evaluate(send, `window.__motionDevToolsHarness.selectTimeline("playground/canvas-particles/sequence")`),
    "The canvas particles demo could not be restored after switching away.",
  );
  await waitFor(
    () => evaluate(send, `document.querySelector(".motion-particles-fixture__canvas")?.width > 400 && document.querySelector(".motion-particles-fixture__trigger")?.textContent === "Resume particles"`),
    "the stopped canvas particles preview after switching back",
  );
  await evaluate(send, `(() => {
    window.__particlesTimelineBeforeReplay = window.__motionDevToolsHarness.timeline;
    return window.__motionDevToolsHarness.replayActiveTimeline();
  })()`);
  await waitFor(
    () => evaluate(send, `window.__motionDevToolsHarness.timeline !== window.__particlesTimelineBeforeReplay && Math.abs(window.__motionDevToolsHarness.timeline.totalTime() - 99) < 0.001 && document.querySelector(".motion-particles-fixture__trigger")?.textContent === "Start particles"`),
    "canvas particles replay at its authored starting phase",
  );

  assert(
    await evaluate(send, `window.__motionDevToolsHarness.selectTimeline("playground/rolling-text/sequence")`),
    "The rolling text demo could not be selected.",
  );
  await waitFor(
    () => evaluate(send, `window.__motionDevToolsHarness.activeTimelineId === "playground/rolling-text/sequence" && document.querySelector("[data-role='preview-surface']").contains(document.querySelector("#rolling-text-stage")) && document.querySelector("[data-role='readiness']")?.textContent === "ready" && document.querySelectorAll(".motion-editor__block").length === 4`),
    "the inspectable rolling text preview",
  );
  const rollingBefore = await evaluate(send, `(() => ({
    characters: document.querySelectorAll(".motion-rolling-fixture__char").length,
    nestedCharacters: document.querySelectorAll(".motion-rolling-fixture__char .motion-rolling-fixture__char").length,
    repeat: window.__motionDevToolsHarness.timeline.repeat(),
    duration: window.__motionDevToolsHarness.timeline.totalDuration(),
    displayedDuration: document.querySelector("[data-role='duration']")?.textContent,
    firstBlockWidth: Number.parseFloat(document.querySelector(".motion-editor__block")?.style.width),
    playDisabled: document.querySelector("[data-action='toggle-play']")?.disabled,
  }))()`);
  assert(rollingBefore.characters === 36 && rollingBefore.nestedCharacters === 0, "SplitText did not create four clean character lines.");
  assert(rollingBefore.repeat === -1 && rollingBefore.duration > 1_000_000_000, "The rolling text timeline did not retain its infinite loop.");
  assert(/^00:0[0-9]\.\d{3}$/.test(rollingBefore.displayedDuration), "The infinite timeline did not display one loop's duration.");
  assert(rollingBefore.firstBlockWidth > 20, "The rolling text blocks collapsed against the huge GSAP total duration.");
  assert(!rollingBefore.playDisabled, "The DOM-target rolling text timeline was not playable in DevTools.");
  const firstRollingLine = ".motion-rolling-fixture__line:nth-child(1) .motion-rolling-fixture__char";
  const secondRollingLine = ".motion-rolling-fixture__line:nth-child(2) .motion-rolling-fixture__char";
  assert(
    await evaluate(send, `[...document.querySelectorAll("${firstRollingLine}")].every((char) => char.getAttribute("data-motion-editor-selected") === "true")`),
    "The first rolling-text track did not select all of its characters.",
  );
  await evaluate(send, `document.querySelectorAll(".motion-editor__block")[1].click()`);
  assert(
    await evaluate(send, `[...document.querySelectorAll("${secondRollingLine}")].every((char) => char.getAttribute("data-motion-editor-selected") === "true") && [...document.querySelectorAll("${firstRollingLine}")].every((char) => !char.hasAttribute("data-motion-editor-selected"))`),
    "Switching rolling-text tracks did not transfer selection to the whole second line.",
  );
  await evaluate(send, `document.querySelector("[data-action='toggle-play']").click()`);
  await waitFor(
    () => evaluate(send, `window.__motionDevToolsHarness.timeline.totalTime() > 0.5 && !window.__motionDevToolsHarness.timeline.paused() && Number.parseFloat(document.querySelector("[data-motion-editor]").style.getPropertyValue("--motion-editor-progress")) > 0.1 && document.querySelector("[data-role='time']")?.textContent.startsWith("00:00.")`),
    "rolling text playback and moving playhead",
  );
  await screenshot(send, rollingTextShot);
  const rollingTrack = await evaluate(send, `(() => {
    const rect = document.querySelector(".motion-editor__track-content").getBoundingClientRect();
    return { x: rect.left + rect.width * 0.25, y: rect.top + 14 };
  })()`);
  await clickAt(send, rollingTrack.x, rollingTrack.y);
  await waitFor(
    () => evaluate(send, `Math.abs(window.__motionDevToolsHarness.timeline.time() - window.__motionDevToolsHarness.timeline.duration() * 0.25) < 0.05 && window.__motionDevToolsHarness.timeline.totalTime() < window.__motionDevToolsHarness.timeline.duration()`),
    "rolling text one-loop scrubbing",
  );
  await waitFor(
    () => evaluate(send, `document.querySelector("[data-action='toggle-play']")?.textContent === "Play"`),
    "rolling text paused transport after scrubbing",
  );
  await evaluate(send, `document.querySelector("[data-action='toggle-play']").click()`);
  await waitFor(
    () => evaluate(send, `!window.__motionDevToolsHarness.timeline.paused()`),
    "rolling text resuming after scrubbing",
  );
  await evaluate(send, `(() => {
    window.__rollingTimelineBeforeHide = window.__motionDevToolsHarness.timeline;
    return window.__motionDevToolsHarness.selectTimeline("playground/editor/sequence");
  })()`);
  await waitFor(
    () => evaluate(send, `window.__rollingTimelineBeforeHide.paused() && document.querySelector("#motion-source-home").contains(document.querySelector("#rolling-text-stage"))`),
    "rolling text stopping when its preview is hidden",
  );
  assert(
    await evaluate(send, `window.__motionDevToolsHarness.selectTimeline("playground/rolling-text/sequence")`),
    "The rolling text demo could not be restored after switching away.",
  );
  await evaluate(send, `(() => {
    window.__rollingTimelineBeforeReplay = window.__motionDevToolsHarness.timeline;
    return window.__motionDevToolsHarness.replayActiveTimeline();
  })()`);
  await waitFor(
    () => evaluate(send, `window.__motionDevToolsHarness.timeline !== window.__rollingTimelineBeforeReplay && window.__motionDevToolsHarness.timeline.totalTime() === 0 && document.querySelectorAll(".motion-rolling-fixture__char").length === 36 && document.querySelectorAll(".motion-rolling-fixture__char .motion-rolling-fixture__char").length === 0 && document.querySelectorAll(".motion-editor__block").length === 4`),
    "clean rolling text replay",
  );
  assert(
    await evaluate(send, `window.__motionDevToolsHarness.selectTimeline("playground/editor/sequence")`),
    "The editor sequence could not be restored after the container-animation demo.",
  );
  await waitFor(
    () => evaluate(send, `window.__motionDevToolsHarness.activeTimelineId === "playground/editor/sequence" && document.querySelectorAll(".motion-editor__block").length === 3`),
    "the editor sequence after the container-animation demo",
  );

  const initial = await evaluate(send, `(() => {
    const root = document.querySelector("[data-motion-editor]");
    const preview = document.querySelector(".motion-editor__preview-pane");
    const timeline = document.querySelector(".motion-editor__timeline-pane");
    const divider = document.querySelector("[data-role='splitter']");
    return {
      rootHeight: root.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
      previewHeight: preview.getBoundingClientRect().height,
      timelineHeight: timeline.getBoundingClientRect().height,
      dividerTop: divider.getBoundingClientRect().top,
      dividerHeight: divider.getBoundingClientRect().height,
      dividerCenterX: divider.getBoundingClientRect().left + divider.getBoundingClientRect().width / 2,
      dividerValue: divider.getAttribute("aria-valuetext"),
      driver: document.querySelector("[data-role='driver']")?.textContent,
      duration: document.querySelector("[data-role='duration']")?.textContent,
    };
  })()`);
  assert(
    Math.abs(initial.rootHeight - initial.viewportHeight) < 2,
    "Workspace did not fill the viewport.",
  );
  assert(initial.previewHeight >= 280, "Preview started below its minimum height.");
  assert(initial.timelineHeight >= 240, "Timeline started below its minimum height.");
  assert(initial.dividerValue?.includes("timeline"), "Splitter did not expose its accessible value.");
  assert(initial.dividerHeight <= 10, "Resize target was not limited to the thin top divider.");
  assert(initial.driver === "manual", "Manual fixture reported the wrong driver.");
  assert(initial.duration !== "00:00.000", "Compiled timeline duration was unavailable.");

  await screenshot(send, desktop);

  const splitterHit = await evaluate(
    send,
    `document.elementFromPoint(${initial.dividerCenterX}, ${initial.dividerTop + initial.dividerHeight - 1})?.className`,
  );
  assert(
    String(splitterHit).includes("motion-editor__splitter"),
    `Splitter hit target was covered by ${String(splitterHit)} at top ${initial.dividerTop}, height ${initial.dividerHeight}, preview ${initial.previewHeight}, timeline ${initial.timelineHeight}.`,
  );

  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: initial.dividerCenterX,
    y: initial.dividerTop + initial.dividerHeight - 1,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: initial.dividerCenterX,
    y: initial.dividerTop - 140,
    button: "left",
    buttons: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: initial.dividerCenterX,
    y: initial.dividerTop - 140,
    button: "left",
    clickCount: 1,
  });
  await waitFor(
    () => evaluate(send, `Number.parseFloat(document.querySelector("[data-motion-editor]").style.getPropertyValue("--motion-editor-timeline-height")) > ${initial.timelineHeight + 100}`),
    "the splitter resize state",
  );
  await waitFor(
    () => evaluate(send, `document.querySelector(".motion-editor__timeline-pane").getBoundingClientRect().height > ${initial.timelineHeight + 100}`),
    "the vertically resized timeline",
  );
  await screenshot(send, resized);

  await evaluate(send, `document.querySelectorAll(".motion-editor__block")[1].click(); document.querySelector("[data-action='show-details']").click()`);
  const selection = await evaluate(send, `(() => ({
    selected: document.querySelectorAll(".motion-editor__block")[1].getAttribute("aria-pressed"),
    targetSelected: document.querySelector("#focus").getAttribute("data-motion-editor-selected"),
    inspectorVisible: !document.querySelector("[data-role='inspector']").hidden,
    details: document.querySelector(".motion-editor__inspector-content")?.textContent,
    removedTools: document.querySelectorAll("[data-action='restart'], [data-action='step-back'], [data-action='set-in'], [data-role='contextual-toolbar']").length,
    inspectorButtons: document.querySelectorAll("[data-action='show-details']").length,
  }))()`);
  assert(selection.selected === "true", "Timeline block selection was not exposed.");
  assert(selection.targetSelected === "true", "Selected track did not highlight its preview target.");
  assert(selection.inspectorVisible && selection.details.includes("#focus"), "Inspector did not follow selection.");
  assert(selection.removedTools === 0, "Removed preview or transport tools are still rendered.");
  assert(selection.inspectorButtons === 1, "Inspector was not the only remaining preview tool.");

  const zoomState = await evaluate(send, `(() => {
    const content = document.querySelector(".motion-editor__track-content");
    const before = content.getBoundingClientRect().width;
    const zoom = document.querySelector(".motion-editor__zoom");
    zoom.value = "300";
    zoom.dispatchEvent(new Event("input", { bubbles: true }));
    return { before, after: content.getBoundingClientRect().width };
  })()`);
  assert(zoomState.after > zoomState.before * 2, "Timeline zoom did not change its working width.");

  const track = await evaluate(send, `(() => {
    const content = document.querySelector(".motion-editor__track-content").getBoundingClientRect();
    const viewport = document.querySelector("[data-role='track-viewport']").getBoundingClientRect();
    return { x: viewport.left + viewport.width * 0.55, y: content.top + 18 };
  })()`);
  await clickAt(send, track.x, track.y);
  await waitFor(
    () => evaluate(send, `document.querySelector("[data-role='time']")?.value !== "00:00.000"`),
    "playhead scrubbing",
  );

  await evaluate(send, `(() => {
    const select = document.querySelector(".motion-editor__select");
    select.value = "0.5";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector("[data-action='toggle-play']").click();
    return true;
  })()`);
  await waitFor(
    () => evaluate(send, `document.querySelector("[data-action='toggle-play']")?.textContent === "Pause"`),
    "manual timeline playback",
  );

  await evaluate(send, `(() => {
    document.querySelector("[data-action='toggle-loop']").click();
    window.__motionDevToolsHarness.timeline.totalProgress(1, true);
    return true;
  })()`);
  await waitFor(
    () => evaluate(send, `window.__motionDevToolsHarness.timeline.totalProgress() < 0.5 && !window.__motionDevToolsHarness.timeline.paused()`),
    "full-timeline loop restart",
  );

  await evaluate(send, `document.querySelector("[data-action='toggle-timeline']").click()`);
  await waitFor(
    () => evaluate(send, `document.querySelector(".motion-editor__timeline-pane").getBoundingClientRect().height < 2 && document.querySelector("[data-action='toggle-play']").getBoundingClientRect().height > 0 && document.querySelector("[data-role='inspector']").hidden`),
    "collapsed timeline transport",
  );
  await screenshot(send, collapsed);
  await evaluate(send, `document.querySelector("[data-action='toggle-timeline']").click()`);
  await waitFor(
    () => evaluate(send, `document.querySelector(".motion-editor__timeline-pane").getBoundingClientRect().height >= 240`),
    "expanded timeline",
  );

  await send("Emulation.setDeviceMetricsOverride", {
    width: 720,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const narrowState = await evaluate(send, `(() => ({
    rootWidth: document.querySelector("[data-motion-editor]").getBoundingClientRect().width,
    viewportScrollable: document.querySelector("[data-role='track-viewport']").scrollWidth > document.querySelector("[data-role='track-viewport']").clientWidth,
    previewVisible: document.querySelector(".motion-editor__preview-surface").getBoundingClientRect().height > 0,
  }))()`);
  assert(narrowState.rootWidth <= 720, "Narrow workspace overflowed its viewport.");
  assert(narrowState.viewportScrollable, "Narrow timeline did not preserve horizontal scrolling.");
  assert(narrowState.previewVisible, "Narrow layout lost the live preview.");
  await screenshot(send, narrow);

  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  const reducedMotion = await evaluate(send, `(() => ({
    matches: matchMedia("(prefers-reduced-motion: reduce)").matches,
    transitionDuration: getComputedStyle(document.querySelector(".motion-editor__block")).transitionDuration,
    animationDuration: getComputedStyle(document.querySelector(".motion-editor__block")).animationDuration,
  }))()`);
  assert(reducedMotion.matches, "Reduced-motion emulation was not active.");
  assert(
    reducedMotion.transitionDuration === "1e-06s" && reducedMotion.animationDuration === "1e-06s",
    "Reduced-motion styling did not suppress editor motion.",
  );

  await evaluate(send, `window.__motionDevToolsHarness.destroy()`);
  assert(
    await evaluate(send, `document.querySelectorAll("[data-motion-editor]").length === 0 && document.querySelector("#motion-source-home").contains(document.querySelector("#editor-stage"))`),
    "Destroy did not remove the workspace and restore its source.",
  );
  await evaluate(send, `window.__motionDevToolsHarness.remount()`);
  await waitFor(
    () => evaluate(send, `document.querySelectorAll("[data-motion-editor]").length === 1 && document.querySelectorAll(".motion-editor__block").length === 3`),
    "a clean Motion DevTools remount",
  );

  console.log(JSON.stringify({
    status: "pass",
    checks: {
      viewportWorkspace: "pass",
      verticalResize: "pass",
      selectionHighlight: "pass",
      inspector: "pass",
      seekAndPlayback: "pass",
      loop: "pass",
      zoom: "pass",
      collapsedTimeline: "pass",
      narrowLayout: "pass",
      reducedMotion: "pass",
      destroyAndRemount: "pass",
      distributedRegistry: "pass",
      timelineSelectorKeyboard: "pass",
      activeTimelineRemoval: "pass",
      containerAnimationDemo: "pass",
      svgShapeOverlaysDemo: "pass",
      canvasParticlesDemo: "pass",
      rollingTextDemo: "pass",
    },
    screenshots: [
      "artifacts/visual/motion-devtools-desktop.png",
      "artifacts/visual/motion-devtools-resized.png",
      "artifacts/visual/motion-devtools-narrow.png",
      "artifacts/visual/motion-devtools-collapsed.png",
      "artifacts/visual/motion-devtools-container-animation.png",
      "artifacts/visual/motion-devtools-shape-overlay.png",
      "artifacts/visual/motion-devtools-canvas-particles.png",
      "artifacts/visual/motion-devtools-rolling-text.png",
    ],
  }));
}

try {
  await runVisualHarness(
    {
      pagePath: "/motion-devtools.html",
      profilePrefix: "motion-lab-motion-devtools-",
    },
    verifyMotionDevTools,
  );
} catch (error) {
  reportVisualFailure(error);
}
