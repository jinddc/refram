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

  await waitFor(
    () => evaluate(send, `Boolean(window.__motionDevToolsHarness) && document.querySelectorAll(".motion-editor__block").length === 3 && document.querySelector("[data-role='readiness']")?.textContent === "ready"`),
    "the Motion DevTools workspace",
  );

  const distributedRegistry = await evaluate(send, `(() => ({
    ids: window.__motionDevToolsHarness.registrationIds,
    active: window.__motionDevToolsHarness.activeTimelineId,
    options: [...document.querySelector("[data-role='timeline-selector']").options].map(({ value, textContent }) => ({ value, textContent })),
  }))()`);
  assert(distributedRegistry.ids.length === 2, "Distributed timeline modules were not both registered.");
  assert(distributedRegistry.active === "playground/editor/sequence", "The first registration was not initially active.");
  assert(
    distributedRegistry.options[1]?.textContent.includes("playground/detail/sequence"),
    "The timeline selector did not expose the stable timeline ID.",
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
    () => evaluate(send, `window.__motionDevToolsHarness.activeTimelineId === "playground/editor/sequence" && window.__motionDevToolsHarness.registrationIds.length === 1 && document.querySelector("[data-role='timeline-selector']").options.length === 1 && document.querySelectorAll(".motion-editor__block").length === 3 && document.querySelector("#motion-source-home").contains(document.querySelector("#detail-stage"))`),
    "the fallback after active timeline removal",
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
    },
    screenshots: [
      "artifacts/visual/motion-devtools-desktop.png",
      "artifacts/visual/motion-devtools-resized.png",
      "artifacts/visual/motion-devtools-narrow.png",
      "artifacts/visual/motion-devtools-collapsed.png",
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
