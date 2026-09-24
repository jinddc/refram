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
    () => evaluate(send, `Boolean(window.__devtoolsEditorV2Harness) && window.__devtoolsEditorV2Harness.query("[data-role='duration']")?.textContent === "00:12.000" && window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__track-block").length === 3`),
    "the new DevTools editor",
  );
  const desktopState = await evaluate(send, `(() => ({
    timelines: window.__devtoolsEditorV2Harness.queryAll("[data-timeline-id]").length,
    hasPreviewSurface: Boolean(window.__devtoolsEditorV2Harness.query("[data-role='preview-surface']")),
    tracks: window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__track-block").length,
    rulerEnd: [...window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__tick")].at(-1)?.textContent,
    rulerMarks: window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__ruler-mark").length,
    zeroTickInset: (() => {
      const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']").getBoundingClientRect();
      const tick = window.__devtoolsEditorV2Harness.query(".devtools-editor__tick").getBoundingClientRect();
      return tick.left + tick.width / 2 - content.left;
    })(),
    firstBlockRatio: (() => {
      const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']").getBoundingClientRect();
      const block = window.__devtoolsEditorV2Harness.query(".devtools-editor__track-block").getBoundingClientRect();
      return block.width / content.width;
    })(),
    rootHeight: window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").getBoundingClientRect().height,
    userSelect: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-devtools-editor]")).userSelect,
    trackPointerEvents: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-track-key='animation:0']")).pointerEvents,
    viewportPointerEvents: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']")).pointerEvents,
    playheadIcon: Boolean(window.__devtoolsEditorV2Harness.query("[data-role='playhead'] .devtools-editor__playhead-icon")),
    shadowStyle: Boolean(window.__devtoolsEditorV2Harness.editorRoot.querySelector("style")),
    lightEditorRoot: Boolean(document.querySelector("[data-devtools-editor]")),
    applicationDisplay: getComputedStyle(document.querySelector("#devtools-v2-finite .devtools-v2-panel")).display,
    finiteParent: document.querySelector("#devtools-v2-finite").parentElement?.id,
    finiteNextSibling: document.querySelector("#devtools-v2-finite").nextElementSibling?.id,
    finiteSlot: document.querySelector("#devtools-v2-finite").getAttribute("slot"),
    activeTimeline: window.__devtoolsEditorV2Harness.query("[data-timeline-id][aria-current='true']")?.dataset.timelineId,
    paneDisplays: [...window.__devtoolsEditorV2Harness.queryAll("[data-pane]")].map((pane) => getComputedStyle(pane).display),
    paneBounds: [...window.__devtoolsEditorV2Harness.queryAll("[data-pane]")].map((pane) => {
      const bounds = pane.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, width: bounds.width };
    }),
    listOverflow: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-role='timeline-list']")).overflowY,
    inspectorOverflow: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-role='inspector-content']")).overflowY,
    inspectorEmpty: !window.__devtoolsEditorV2Harness.query("[data-role='inspector-empty']").hidden,
    inspectorHidden: window.__devtoolsEditorV2Harness.query("[data-role='inspector']").hidden,
    inspectorDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-role='inspector']")).display,
    inspectorOpen: window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").dataset.inspectorOpen,
    timelinesVisible: window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").dataset.timelinesVisible,
    hasHeader: Boolean(window.__devtoolsEditorV2Harness.query(".devtools-editor__header")),
    editorTop: window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").getBoundingClientRect().top,
    workspaceTop: window.__devtoolsEditorV2Harness.query("[data-role='workspace']").getBoundingClientRect().top,
  }))()`);
  assert(desktopState.timelines === 2, "The new editor did not list both fixture timelines.");
  assert(!desktopState.hasPreviewSurface, "The removed embedded preview surface is still rendered.");
  assert(desktopState.tracks === 3, "The finite timeline did not render three tracks.");
  assert(
    desktopState.rulerEnd === "12s"
      && desktopState.rulerMarks === 121
      && desktopState.zeroTickInset >= 10
      && desktopState.firstBlockRatio < 0.2,
    `The default ruler or absolute track scale is incorrect: ${JSON.stringify(desktopState)}`,
  );
  assert(desktopState.rootHeight >= 300 && desktopState.rootHeight <= 421, "The editor is not docked at the expected size.");
  assert(desktopState.playheadIcon, "The SVG playhead handle was not rendered.");
  assert(
    desktopState.activeTimeline === "playground/v2/finite"
      && desktopState.paneDisplays.length === 2
      && desktopState.paneDisplays.every((display) => display !== "none")
      && desktopState.paneBounds[0].right <= desktopState.paneBounds[1].left + 1
      && desktopState.listOverflow === "auto"
      && desktopState.inspectorOverflow === "auto"
      && desktopState.inspectorEmpty
      && desktopState.inspectorHidden
      && desktopState.inspectorDisplay === "none"
      && desktopState.inspectorOpen === "false"
      && desktopState.timelinesVisible === "true"
      && !desktopState.hasHeader
      && Math.abs(desktopState.workspaceTop - desktopState.editorTop) <= 1,
    `The desktop idle workspace is incorrect: ${JSON.stringify(desktopState)}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='toggle-timelines']").click()`);
  const collapsedTimelineList = await evaluate(send, `(() => ({
    visible: window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").dataset.timelinesVisible,
    listDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-pane='timelines']")).display,
    expanded: window.__devtoolsEditorV2Harness.query("[data-action='toggle-timelines']").getAttribute("aria-expanded"),
    timelineWidth: window.__devtoolsEditorV2Harness.query("[data-pane='timeline']").getBoundingClientRect().width,
    workspaceWidth: window.__devtoolsEditorV2Harness.query("[data-role='workspace']").getBoundingClientRect().width,
  }))()`);
  assert(
    collapsedTimelineList.visible === "false"
      && collapsedTimelineList.listDisplay === "none"
      && collapsedTimelineList.expanded === "false"
      && Math.abs(collapsedTimelineList.timelineWidth - collapsedTimelineList.workspaceWidth) <= 1,
    `The desktop timeline-list toggle did not collapse the pane: ${JSON.stringify(collapsedTimelineList)}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='toggle-timelines']").click()`);
  assert(
    desktopState.shadowStyle
      && !desktopState.lightEditorRoot
      && desktopState.applicationDisplay === "flex"
      && desktopState.finiteParent === "devtools-v2-sources"
      && desktopState.finiteNextSibling === "devtools-v2-particles"
      && desktopState.finiteSlot === null,
    `Editor CSS isolation or application-root ownership failed: ${JSON.stringify(desktopState)}`,
  );
  assert(
    desktopState.userSelect === "none"
      && desktopState.trackPointerEvents === "auto"
      && desktopState.viewportPointerEvents === "auto",
    `Editor interaction styles are incorrect: ${JSON.stringify(desktopState)}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-track-key='animation:1']").click()`);
  assert(
    await evaluate(send, `document.querySelectorAll("[data-devtools-editor-selected='true']").length === 1 && window.__devtoolsEditorV2Harness.query("[data-track-key='animation:1']").getAttribute("aria-pressed") === "true"`),
    "Track selection did not synchronize with the preview.",
  );
  const inspectorState = await evaluate(send, `(() => ({
    hidden: window.__devtoolsEditorV2Harness.query("[data-role='inspector-content']").hidden,
    paneHidden: window.__devtoolsEditorV2Harness.query("[data-role='inspector']").hidden,
    text: window.__devtoolsEditorV2Harness.query("[data-role='inspector-content']").textContent,
    activePane: window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").dataset.activePane,
    inspectorOpen: window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").dataset.inspectorOpen,
  }))()`);
  assert(
    !inspectorState.hidden
      && !inspectorState.paneHidden
      && inspectorState.text.includes("Automatic")
      && inspectorState.text.includes("Start")
      && inspectorState.text.includes("Duration")
      && inspectorState.text.includes("End")
      && inspectorState.activePane === "timeline"
      && inspectorState.inspectorOpen === "true",
    `Track inspector did not render without changing panes: ${JSON.stringify(inspectorState)}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='toggle-timelines']").click()`);
  const collapsedWithInspector = await evaluate(send, `(() => {
    const workspace = window.__devtoolsEditorV2Harness.query("[data-role='workspace']").getBoundingClientRect();
    const timeline = window.__devtoolsEditorV2Harness.query("[data-pane='timeline']").getBoundingClientRect();
    const inspector = window.__devtoolsEditorV2Harness.query("[data-role='inspector']").getBoundingClientRect();
    return {
      workspaceLeft: workspace.left,
      workspaceRight: workspace.right,
      timelineLeft: timeline.left,
      timelineRight: timeline.right,
      inspectorLeft: inspector.left,
      inspectorRight: inspector.right,
    };
  })()`);
  assert(
    Math.abs(collapsedWithInspector.timelineLeft - collapsedWithInspector.workspaceLeft) <= 1
      && Math.abs(collapsedWithInspector.timelineRight - collapsedWithInspector.inspectorLeft) <= 1
      && Math.abs(collapsedWithInspector.inspectorRight - collapsedWithInspector.workspaceRight) <= 1,
    `Hiding timelines with the inspector open left a grid gap: ${JSON.stringify(collapsedWithInspector)}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='toggle-timelines']").click()`);
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='close-inspector']").click()`);
  assert(
    await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-role='inspector']").hidden && window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").dataset.inspectorOpen === "false" && window.__devtoolsEditorV2Harness.view.selectedTrackKey === undefined && document.querySelectorAll("[data-devtools-editor-selected='true']").length === 0 && window.__devtoolsEditorV2Harness.query("[data-track-key='animation:1']").getAttribute("aria-pressed") === "false"`),
    "The desktop inspector close button did not return the track to idle.",
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-track-key='animation:1']").click()`);
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='play']").click()`);
  await waitFor(
    () => evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='pause']")?.textContent === "Pause"`),
    "finite timeline playback",
  );
  const seekPoint = await evaluate(send, `(() => {
    const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']").getBoundingClientRect();
    const lanes = window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__track-lane");
    const lane = lanes[lanes.length - 1].getBoundingClientRect();
    return { x: content.left + 12 + (content.width - 24) * 0.03, y: lane.top + lane.height / 2 };
  })()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", ...seekPoint, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...seekPoint, button: "left", clickCount: 1 });
  const runningSeek = await evaluate(send, `(() => ({
    progress: window.__devtoolsEditorV2Harness.view.time.progress,
    playState: window.__devtoolsEditorV2Harness.view.transport.playState,
  }))()`);
  assert(
    runningSeek.progress >= 0.029
      && runningSeek.progress <= 0.033
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
    return { x: content.left + 12 + (content.width - 24) * 0.08, y: window.__devtoolsEditorV2Harness.query("[data-role='playhead']").getBoundingClientRect().top + 12 };
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
      && finishedDrag.progress >= 0.079
      && finishedDrag.progress <= 0.081
      && finishedDrag.cursor.includes("ew-resize"),
    `Playhead drag states are incorrect: ${JSON.stringify({ activeDrag, finishedDrag })}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='replay']").click()`);
  assert(
    await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-role='current-time']").textContent === "00:00.000"`),
    "Replay did not return the finite timeline to its authored start.",
  );
  assert(
    await evaluate(send, `window.__devtoolsEditorV2Harness.view.selectedTrackKey === "animation:1" && window.__devtoolsEditorV2Harness.view.inspector?.trackKey === "animation:1" && window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").dataset.inspectorOpen === "true" && !window.__devtoolsEditorV2Harness.query("[data-role='inspector-content']").hidden`),
    "Replay discarded the open automatic-track inspector detail.",
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='play']").click(); window.__devtoolsEditorV2Harness.seek(1)`);
  assert(
    await evaluate(send, `window.__devtoolsEditorV2Harness.view.transport.playState === "finished" && window.__devtoolsEditorV2Harness.activeTimelinePaused === false`),
    "The fixture did not reach the running-finished seek boundary.",
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='play']").click()`);
  await waitFor(
    () => evaluate(send, `window.__devtoolsEditorV2Harness.view.transport.playState === "running"`),
    "playback restart from the finished state",
  );
  assert(
    await evaluate(send, `window.__devtoolsEditorV2Harness.view.selectedTrackKey === "animation:1" && window.__devtoolsEditorV2Harness.view.inspector?.trackKey === "animation:1" && !window.__devtoolsEditorV2Harness.query("[data-role='inspector-content']").hidden`),
    "Playing from the finished state discarded inspector detail.",
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.seek(1)`);
  const finishedSeekPoint = await evaluate(send, `(() => {
    const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']").getBoundingClientRect();
    const lanes = window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__track-lane");
    const lane = lanes[lanes.length - 1].getBoundingClientRect();
    return { x: content.left + 12 + (content.width - 24) * 0.05, y: lane.top + lane.height / 2 };
  })()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", ...finishedSeekPoint, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...finishedSeekPoint, button: "left", clickCount: 1 });
  assert(
    await evaluate(send, `window.__devtoolsEditorV2Harness.activeTimelinePaused === true && window.__devtoolsEditorV2Harness.view.transport.playState === "paused" && window.__devtoolsEditorV2Harness.view.time.progress >= 0.049 && window.__devtoolsEditorV2Harness.view.time.progress <= 0.051`),
    "Click-seeking a finished timeline resumed playback.",
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-track-key='animation:1']").click()`);
  await screenshot(send, desktop);

  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-timeline-id='playground/v2/particles']").click()`);
  await waitFor(
    () => evaluate(send, `window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__track-block").length === 1 && window.__devtoolsEditorV2Harness.query("[data-role='duration']").textContent === "00:12.000"`),
    "the finite particle window",
  );
  const particleZeroState = await evaluate(send, `(() => {
    const tick = window.__devtoolsEditorV2Harness.query(".devtools-editor__tick[data-edge='start']").getBoundingClientRect();
    const icon = window.__devtoolsEditorV2Harness.query("[data-role='playhead'] .devtools-editor__playhead-icon").getBoundingClientRect();
    return { tickLeft: tick.left, iconRight: icon.right };
  })()`);
  assert(
    particleZeroState.tickLeft > particleZeroState.iconRight,
    `The zero-second ruler label overlaps the playhead: ${JSON.stringify(particleZeroState)}`,
  );
  assert(
    await evaluate(send, `document.querySelector("#devtools-v2-particles").parentElement?.id === "devtools-v2-sources" && document.querySelector("#devtools-v2-finite").nextElementSibling?.id === "devtools-v2-particles" && window.__devtoolsEditorV2Harness.view.time.start === 99`),
    "The application roots moved or the authored phase window is incorrect.",
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
    const editorBounds = window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").getBoundingClientRect();
    const timelineBounds = window.__devtoolsEditorV2Harness.query(".devtools-editor__timeline").getBoundingClientRect();
    return {
      canvasHeight: canvasBounds.height,
      stageHeight: stageBounds.height,
      bitmapHeight: canvas.height,
      pixelRatio: window.devicePixelRatio,
      editorHeight: editorBounds.height,
      viewportHeight: window.innerHeight,
      editorBottom: editorBounds.bottom,
      timelineBottom: timelineBounds.bottom,
    };
  })()`);
  assert(
    Math.abs(canvasSize.canvasHeight - canvasSize.stageHeight) < 1
      && Math.abs(canvasSize.bitmapHeight - canvasSize.stageHeight * canvasSize.pixelRatio) < 2
      && canvasSize.editorHeight >= 300
      && Math.abs(canvasSize.editorBottom - canvasSize.viewportHeight) < 1
      && canvasSize.timelineBottom <= canvasSize.viewportHeight + 1,
    `The Canvas or docked editor size is incorrect: ${JSON.stringify(canvasSize)}`,
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
  const narrowState = await evaluate(send, `(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    activePane: window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").dataset.activePane,
    selectedTab: window.__devtoolsEditorV2Harness.query("[data-pane-target][aria-selected='true']")?.dataset.paneTarget,
    visiblePanes: [...window.__devtoolsEditorV2Harness.queryAll("[data-pane]")].filter((pane) => getComputedStyle(pane).display !== "none").map((pane) => pane.dataset.pane),
    timelineHeight: window.__devtoolsEditorV2Harness.query(".devtools-editor__timeline").getBoundingClientRect().height,
    inspectorHidden: window.__devtoolsEditorV2Harness.query("[data-role='inspector']").hidden,
    inspectorDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-role='inspector']")).display,
    inspectorTab: Boolean(window.__devtoolsEditorV2Harness.query("[data-pane-target='inspector']")),
  }))()`);
  assert(
    narrowState.scrollWidth <= 640
      && narrowState.activePane === "timeline"
      && narrowState.selectedTab === "timeline"
      && narrowState.visiblePanes.length === 0
      && !narrowState.inspectorHidden
      && narrowState.inspectorDisplay !== "none"
      && !narrowState.inspectorTab,
    `The mobile track-triggered inspector is incorrect: ${JSON.stringify(narrowState)}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='close-inspector']").click()`);
  const closedInspectorState = await evaluate(send, `(() => ({
    activePane: window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").dataset.activePane,
    visiblePanes: [...window.__devtoolsEditorV2Harness.queryAll("[data-pane]")].filter((pane) => getComputedStyle(pane).display !== "none").map((pane) => pane.dataset.pane),
    inspectorHidden: window.__devtoolsEditorV2Harness.query("[data-role='inspector']").hidden,
    selectedTrackKey: window.__devtoolsEditorV2Harness.view.selectedTrackKey,
    highlightedTargets: document.querySelectorAll("[data-devtools-editor-selected='true']").length,
  }))()`);
  assert(
    closedInspectorState.activePane === "timeline"
      && closedInspectorState.visiblePanes.length === 1
      && closedInspectorState.visiblePanes[0] === "timeline"
      && closedInspectorState.inspectorHidden
      && closedInspectorState.selectedTrackKey === undefined
      && closedInspectorState.highlightedTargets === 0,
    `Closing the mobile inspector did not restore an idle timeline: ${JSON.stringify(closedInspectorState)}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-track-key='track:particles']").click()`);
  await screenshot(send, narrow);

  await evaluate(send, `window.__devtoolsEditorV2Harness.destroy()`);
  assert(
    await evaluate(send, `document.querySelectorAll("motion-devtools-editor").length === 0 && document.querySelector("#devtools-v2-finite").parentElement?.id === "devtools-v2-sources" && document.querySelector("#devtools-v2-finite").nextElementSibling?.id === "devtools-v2-particles"`),
    "Destroying the editor removed or moved application roots.",
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.remount()`);
  await waitFor(
    () => evaluate(send, `window.__devtoolsEditorV2Harness.queryAll("[data-devtools-editor]").length === 1`),
    "editor destroy and remount",
  );

  console.log(JSON.stringify({
    status: "pass",
    checks: [
      "timeline-selection",
      "default-twelve-second-ruler",
      "absolute-track-time-scale",
      "standard-particle-ruler",
      "ruler-detail-and-edge-spacing",
      "header-removed",
      "idle-inspector-hidden",
      "desktop-timeline-list-toggle",
      "desktop-timeline-list-toggle-with-inspector",
      "track-inspector",
      "shadow-css-isolation",
      "noninteractive-hit-testing",
      "seek-preserves-playback",
      "scrollbar-does-not-seek",
      "playhead-drag-states",
      "application-root-ownership",
      "stable-track-selection",
      "transport",
      "replay",
      "replay-preserves-inspector-detail",
      "finished-play-preserves-inspector-detail",
      "finished-seek-pauses",
      "finite-particle-window",
      "mapped-highlight",
      "narrow-layout",
      "mobile-track-triggered-inspector",
      "inspector-close",
      "inspector-close-clears-selection",
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
