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
    () => evaluate(send, `Boolean(window.__devtoolsEditorV2Harness) && window.__devtoolsEditorV2Harness.query("[data-role='duration']")?.textContent === "00:01.640" && window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__track-block").length === 3`),
    "the new DevTools editor",
  );
  const desktopState = await evaluate(send, `(() => ({
    timelines: window.__devtoolsEditorV2Harness.queryAll("[data-timeline-id]").length,
    visibleTimelineIds: window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__timeline-item-id").length,
    hasPreviewSurface: Boolean(window.__devtoolsEditorV2Harness.query("[data-role='preview-surface']")),
    tracks: window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__track-block").length,
    trackCount: window.__devtoolsEditorV2Harness.query("[data-role='track-count']")?.textContent,
    trackLabelWidth: window.__devtoolsEditorV2Harness.query("[data-role='track-labels']").getBoundingClientRect().width,
    trackLabels: [...window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__track-label")].map((label) => ({ text: label.textContent, title: label.title, ariaLabel: label.getAttribute("aria-label") })),
    endMarkerHidden: window.__devtoolsEditorV2Harness.query("[data-role='timeline-end-marker']").hidden,
    endMarkerLabel: window.__devtoolsEditorV2Harness.query("[data-role='timeline-end-marker']").getAttribute("aria-label"),
    postDurationHidden: window.__devtoolsEditorV2Harness.query("[data-role='post-duration']").hidden,
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
    hostHeight: document.querySelector("motion-devtools-editor").getBoundingClientRect().height,
    hostComputedHeight: getComputedStyle(document.querySelector("motion-devtools-editor")).height,
    hostInlineHeight: document.querySelector("motion-devtools-editor").style.height,
    rootComputedHeight: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-devtools-editor]")).height,
    userSelect: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-devtools-editor]")).userSelect,
    trackPointerEvents: getComputedStyle(window.__devtoolsEditorV2Harness.query(".devtools-editor__track-block")).pointerEvents,
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
    transportGroups: [...window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__transport-group")].map((group) => {
      const style = getComputedStyle(group);
      const bounds = group.getBoundingClientRect();
      return {
        role: group.getAttribute("role"),
        label: group.getAttribute("aria-label"),
        height: bounds.height,
        borderWidth: style.borderTopWidth,
        backgroundColor: style.backgroundColor,
      };
    }),
    speedParent: window.__devtoolsEditorV2Harness.query("[data-action='set-speed']").parentElement?.className,
    playbackOrder: [...window.__devtoolsEditorV2Harness.query(".devtools-editor__playback").children].map((child) => child.dataset.action || child.className),
    playbackActionOrder: [...window.__devtoolsEditorV2Harness.query(".devtools-editor__playback-actions").children].map((child) => child.dataset.action),
    playbackCenterOffset: (() => {
      const transport = window.__devtoolsEditorV2Harness.query(".devtools-editor__transport").getBoundingClientRect();
      const playback = window.__devtoolsEditorV2Harness.query(".devtools-editor__playback").getBoundingClientRect();
      return Math.abs((transport.left + transport.width / 2) - (playback.left + playback.width / 2));
    })(),
    playBackground: getComputedStyle(window.__devtoolsEditorV2Harness.query(".devtools-editor__action--primary")).backgroundColor,
    playButtonGeometry: (() => {
      const button = window.__devtoolsEditorV2Harness.query(".devtools-editor__action--primary");
      const bounds = button.getBoundingClientRect();
      return {
        width: bounds.width,
        height: bounds.height,
        radius: getComputedStyle(button).borderRadius,
        label: button.getAttribute("aria-label"),
        playIconHidden: button.querySelector("[data-icon='play']").hasAttribute("hidden"),
        pauseIconHidden: button.querySelector("[data-icon='pause']").hasAttribute("hidden"),
        playIconDisplay: getComputedStyle(button.querySelector("[data-icon='play']")).display,
        pauseIconDisplay: getComputedStyle(button.querySelector("[data-icon='pause']")).display,
      };
    })(),
    transportIconActions: ["toggle-reverse", "toggle-loop", "replay", "play"].map((action) => {
      const button = window.__devtoolsEditorV2Harness.query("[data-action='" + action + "']");
      return {
        action,
        label: button.getAttribute("aria-label"),
        icons: [...button.querySelectorAll(".devtools-editor__transport-icon")].map((icon) => icon.dataset.icon),
      };
    }),
    replayBackground: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-action='replay']")).backgroundColor,
    replayBorderWidth: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-action='replay']")).borderTopWidth,
    editorTop: window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").getBoundingClientRect().top,
    workspaceTop: window.__devtoolsEditorV2Harness.query("[data-role='workspace']").getBoundingClientRect().top,
  }))()`);
  assert(desktopState.timelines === 2, "The new editor did not list both fixture timelines.");
  assert(desktopState.visibleTimelineIds === 0, "Timeline IDs are still visible in the list UI.");
  assert(!desktopState.hasPreviewSurface, "The removed embedded preview surface is still rendered.");
  assert(desktopState.tracks === 3, "The finite timeline did not render three tracks.");
  assert(
    desktopState.trackCount === "3 tracks"
      && Math.abs(desktopState.trackLabelWidth - 168) <= 0.5
      && desktopState.trackLabels.length === 3
      && desktopState.trackLabels[0].text === "Something"
      && desktopState.trackLabels[0].title === "Something"
      && desktopState.trackLabels[0].ariaLabel === "Something"
      && desktopState.trackLabels.slice(1).every(({ text, title, ariaLabel }) => text === "article.devtools-v2-panel" && title === text && ariaLabel === text),
    `Track count, compact pane, or selector labels are incorrect: ${JSON.stringify(desktopState)}`,
  );
  assert(
    !desktopState.endMarkerHidden
      && !desktopState.postDurationHidden
      && desktopState.endMarkerLabel === "Animation ends at 1.64s",
    `The finite duration boundary is not exposed: ${JSON.stringify(desktopState)}`,
  );
  assert(
    desktopState.rulerEnd === "12s"
      && desktopState.rulerMarks === 121
      && desktopState.zeroTickInset >= 10
      && desktopState.firstBlockRatio < 0.2,
    `The default ruler or absolute track scale is incorrect: ${JSON.stringify(desktopState)}`,
  );
  assert(
    desktopState.rootHeight >= 300 && desktopState.rootHeight <= 421,
    `The editor is not docked at the expected size: ${JSON.stringify(desktopState)}`,
  );
  assert(desktopState.playheadIcon, "The SVG playhead handle was not rendered.");
  assert(
    desktopState.transportGroups.length === 2
      && desktopState.transportGroups.every(({ role, label, height, borderWidth, backgroundColor }) => (
        role === "group"
          && Boolean(label)
          && Math.abs(height - 28) <= 1
          && borderWidth === "0px"
          && backgroundColor === "rgba(0, 0, 0, 0)"
      ))
      && desktopState.speedParent.includes("devtools-editor__playback")
      && desktopState.playbackOrder.join("|") === "devtools-editor__playback-actions|devtools-editor__clock|set-speed"
      && desktopState.playbackActionOrder.join("|") === "replay|play|toggle-loop|toggle-reverse"
      && desktopState.playbackCenterOffset <= 1
      && desktopState.playButtonGeometry.width === 28
      && desktopState.playButtonGeometry.height === 28
      && desktopState.playButtonGeometry.radius === "50%"
      && desktopState.playButtonGeometry.label === "Play"
      && desktopState.playButtonGeometry.playIconHidden === false
      && desktopState.playButtonGeometry.pauseIconHidden === true
      && desktopState.playButtonGeometry.playIconDisplay === "block"
      && desktopState.playButtonGeometry.pauseIconDisplay === "none"
      && JSON.stringify(desktopState.transportIconActions) === JSON.stringify([
        { action: "toggle-reverse", label: "Reverse", icons: ["reverse"] },
        { action: "toggle-loop", label: "Loop", icons: ["loop"] },
        { action: "replay", label: "Replay", icons: ["replay"] },
        { action: "play", label: "Play", icons: ["play", "pause"] },
      ])
      && desktopState.playBackground === "rgb(255, 255, 255)"
      && desktopState.playBackground !== desktopState.replayBackground
      && desktopState.replayBorderWidth === "0px",
    `The transport hierarchy or grouping is incorrect: ${JSON.stringify(desktopState)}`,
  );
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
    listWidth: window.__devtoolsEditorV2Harness.query("[data-pane='timelines']").getBoundingClientRect().width,
    expanded: window.__devtoolsEditorV2Harness.query("[data-action='toggle-timelines']").getAttribute("aria-expanded"),
    timelineWidth: window.__devtoolsEditorV2Harness.query("[data-pane='timeline']").getBoundingClientRect().width,
    workspaceWidth: window.__devtoolsEditorV2Harness.query("[data-role='workspace']").getBoundingClientRect().width,
  }))()`);
  assert(
    collapsedTimelineList.visible === "false"
      && collapsedTimelineList.listDisplay === "flex"
      && Math.abs(collapsedTimelineList.listWidth - 40) <= 1
      && collapsedTimelineList.expanded === "false"
      && Math.abs(
        collapsedTimelineList.timelineWidth + collapsedTimelineList.listWidth
          - collapsedTimelineList.workspaceWidth,
      ) <= 1,
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
  const resizeHitTarget = await evaluate(send, `(() => {
    const separator = window.__devtoolsEditorV2Harness.query("[data-role='height-separator']");
    const bounds = separator.getBoundingClientRect();
    const hit = window.__devtoolsEditorV2Harness.editorRoot.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    return {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
      height: bounds.height,
      cursor: getComputedStyle(separator).cursor,
      role: separator.getAttribute("role"),
      orientation: separator.getAttribute("aria-orientation"),
      hitRole: hit?.dataset.role,
      viewportHeight: window.innerHeight,
    };
  })()`);
  assert(
    resizeHitTarget.height === 9
      && resizeHitTarget.cursor === "row-resize"
      && resizeHitTarget.role === "separator"
      && resizeHitTarget.orientation === "horizontal"
      && resizeHitTarget.hitRole === "height-separator",
    `The editor height separator is not a usable top-edge hit target: ${JSON.stringify(resizeHitTarget)}`,
  );
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: resizeHitTarget.x,
    y: resizeHitTarget.y,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: resizeHitTarget.x,
    y: resizeHitTarget.viewportHeight - 500,
    button: "left",
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: resizeHitTarget.x,
    y: resizeHitTarget.viewportHeight - 500,
    button: "left",
    clickCount: 1,
  });
  const enlargedHeight = await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").getBoundingClientRect().height`);
  assert(
    Math.abs(enlargedHeight - 500) <= 1,
    `Dragging the editor border upward did not enlarge it: ${enlargedHeight}`,
  );
  const enlargedHandle = await evaluate(send, `(() => {
    const separator = window.__devtoolsEditorV2Harness.query("[data-role='height-separator']");
    const bounds = separator.getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  })()`);
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...enlargedHandle,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: enlargedHandle.x,
    y: resizeHitTarget.viewportHeight - 420,
    button: "left",
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: enlargedHandle.x,
    y: resizeHitTarget.viewportHeight - 420,
    button: "left",
    clickCount: 1,
  });
  const reducedHeight = await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").getBoundingClientRect().height`);
  assert(
    Math.abs(reducedHeight - 420) <= 1,
    `Dragging the editor border downward did not reduce it: ${reducedHeight}`,
  );
  const keyboardResize = await evaluate(send, `(() => {
    const separator = window.__devtoolsEditorV2Harness.query("[data-role='height-separator']");
    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    const normal = window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").getBoundingClientRect().height;
    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true, bubbles: true }));
    const large = window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").getBoundingClientRect().height;
    separator.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const reset = window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").getBoundingClientRect().height;
    return {
      normal,
      large,
      reset,
      stored: sessionStorage.getItem("motion-lab-devtools-editor-height-ratio"),
    };
  })()`);
  assert(
    Math.abs(keyboardResize.normal - 436) <= 1
      && Math.abs(keyboardResize.large - 500) <= 1
      && keyboardResize.reset >= 230
      && keyboardResize.reset <= 301
      && keyboardResize.stored === null,
    `Keyboard resize or double-click reset failed: ${JSON.stringify(keyboardResize)}`,
  );
  await evaluate(send, `(() => {
    const separator = window.__devtoolsEditorV2Harness.query("[data-role='height-separator']");
    for (let index = 0; index < 3; index += 1) {
      separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true, bubbles: true }));
    }
  })()`);
  const persistedDesktopHeight = await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").getBoundingClientRect().height`);
  assert(
    persistedDesktopHeight >= 420 && persistedDesktopHeight <= 500,
    `The resized desktop height was not retained for persistence checks: ${persistedDesktopHeight}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-track-key='animation:1']").click()`);
  const highlightState = await evaluate(send, `(() => {
    const target = document.querySelector("[data-devtools-editor-selected='true']");
    const overlay = document.querySelector("[data-devtools-editor-highlight]");
    const targetBounds = target?.getBoundingClientRect();
    const overlayBounds = overlay?.getBoundingClientRect();
    return {
      selectedTargets: document.querySelectorAll("[data-devtools-editor-selected='true']").length,
      overlays: document.querySelectorAll("[data-devtools-editor-highlight]").length,
      pointerEvents: getComputedStyle(document.querySelector("[data-devtools-editor-highlight-root]")).pointerEvents,
      overlayZIndex: Number(getComputedStyle(document.querySelector("[data-devtools-editor-highlight-root]")).zIndex),
      editorZIndex: Number(getComputedStyle(document.querySelector("motion-devtools-editor")).zIndex),
      label: overlay?.textContent,
      targetOutline: target?.style.outline,
      aligned: Boolean(targetBounds && overlayBounds
        && Math.abs(targetBounds.left - overlayBounds.left) <= 1
        && Math.abs(targetBounds.top - overlayBounds.top) <= 1
        && Math.abs(targetBounds.width - overlayBounds.width) <= 1
        && Math.abs(targetBounds.height - overlayBounds.height) <= 1),
      pressed: window.__devtoolsEditorV2Harness.query("[data-track-key='animation:1']").getAttribute("aria-pressed"),
    };
  })()`);
  assert(
    highlightState.selectedTargets === 1
      && highlightState.overlays === 1
      && highlightState.pointerEvents === "none"
      && highlightState.overlayZIndex < highlightState.editorZIndex
      && highlightState.label
      && highlightState.targetOutline === ""
      && highlightState.aligned
      && highlightState.pressed === "true",
    `Track selection overlay did not synchronize with the preview: ${JSON.stringify(highlightState)}`,
  );
  const inspectorState = await evaluate(send, `(() => {
    const content = window.__devtoolsEditorV2Harness.query("[data-role='inspector-content']");
    const labels = window.__devtoolsEditorV2Harness.query("[data-role='track-labels']");
    const viewport = window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']");
    const trackLabelStyle = getComputedStyle(
      window.__devtoolsEditorV2Harness.query(".devtools-editor__track-label"),
    );
    const termStyle = getComputedStyle(
      window.__devtoolsEditorV2Harness.query(".devtools-editor__inspector-term"),
    );
    const valueStyle = getComputedStyle(
      window.__devtoolsEditorV2Harness.query(".devtools-editor__inspector-value"),
    );
    const before = labels.getBoundingClientRect();
    viewport.scrollLeft = 120;
    const after = labels.getBoundingClientRect();
    const horizontalScroll = viewport.scrollLeft;
    viewport.scrollLeft = 0;
    return {
      hidden: content.hidden,
      paneHidden: window.__devtoolsEditorV2Harness.query("[data-role='inspector']").hidden,
      text: content.textContent,
      activePane: window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").dataset.activePane,
      inspectorOpen: window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").dataset.inspectorOpen,
      trackHeading: window.__devtoolsEditorV2Harness.query(".devtools-editor__track-heading")?.textContent,
      hasMapping: Boolean(content.querySelector(".devtools-editor__inspector-mapping")),
      hasKey: Boolean(content.querySelector(".devtools-editor__inspector-key")),
      labelColumnLeftBefore: before.left,
      labelColumnLeftAfter: after.left,
      labelColumnWidthBefore: before.width,
      labelColumnWidthAfter: after.width,
      horizontalScroll,
      trackLabelFontSize: trackLabelStyle.fontSize,
      termFontSize: termStyle.fontSize,
      valueFontSize: valueStyle.fontSize,
      termFontFamily: termStyle.fontFamily,
      valueFontFamily: valueStyle.fontFamily,
      termColor: termStyle.color,
      valueColor: valueStyle.color,
    };
  })()`);
  assert(
    !inspectorState.hidden
      && !inspectorState.paneHidden
      && !inspectorState.text.includes("Automatic")
      && !inspectorState.text.includes("animation:1")
      && inspectorState.text.includes("Start")
      && inspectorState.text.includes("Duration")
      && inspectorState.text.includes("End")
      && inspectorState.activePane === "timeline"
      && inspectorState.inspectorOpen === "true"
      && inspectorState.trackHeading === "3 tracks"
      && inspectorState.text.includes("Targets1")
      && inspectorState.text.includes("Propertiesopacity, y")
      && !inspectorState.hasMapping
      && !inspectorState.hasKey
      && inspectorState.horizontalScroll > 0
      && Math.abs(inspectorState.labelColumnLeftBefore - inspectorState.labelColumnLeftAfter) <= 0.5
      && Math.abs(inspectorState.labelColumnWidthBefore - inspectorState.labelColumnWidthAfter) <= 0.5
      && inspectorState.trackLabelFontSize === "12px"
      && inspectorState.termFontSize === "11px"
      && inspectorState.valueFontSize === "11px"
      && inspectorState.termFontFamily.includes("monospace")
      && inspectorState.valueFontFamily.includes("monospace")
      && inspectorState.termColor !== inspectorState.valueColor,
    `Track inspector did not render without changing panes: ${JSON.stringify(inspectorState)}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='toggle-timelines']").click()`);
  const collapsedWithInspector = await evaluate(send, `(() => {
    const workspace = window.__devtoolsEditorV2Harness.query("[data-role='workspace']").getBoundingClientRect();
    const list = window.__devtoolsEditorV2Harness.query("[data-pane='timelines']").getBoundingClientRect();
    const timeline = window.__devtoolsEditorV2Harness.query("[data-pane='timeline']").getBoundingClientRect();
    const inspector = window.__devtoolsEditorV2Harness.query("[data-role='inspector']").getBoundingClientRect();
    return {
      workspaceLeft: workspace.left,
      workspaceRight: workspace.right,
      listRight: list.right,
      timelineLeft: timeline.left,
      timelineRight: timeline.right,
      inspectorLeft: inspector.left,
      inspectorRight: inspector.right,
    };
  })()`);
  assert(
    Math.abs(collapsedWithInspector.timelineLeft - collapsedWithInspector.listRight) <= 1
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
    () => evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='pause']")?.getAttribute("aria-label") === "Pause" && window.__devtoolsEditorV2Harness.query("[data-action='pause'] [data-icon='play']").hasAttribute("hidden") && !window.__devtoolsEditorV2Harness.query("[data-action='pause'] [data-icon='pause']").hasAttribute("hidden") && getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-action='pause'] [data-icon='play']")).display === "none" && getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-action='pause'] [data-icon='pause']")).display === "block"`),
    "finite timeline playback",
  );
  assert(
    await evaluate(send, `(() => {
      const target = document.querySelector("[data-devtools-editor-selected='true']")?.getBoundingClientRect();
      const overlay = document.querySelector("[data-devtools-editor-highlight]")?.getBoundingClientRect();
      return Boolean(target && overlay
        && Math.abs(target.left - overlay.left) <= 1
        && Math.abs(target.top - overlay.top) <= 1
        && Math.abs(target.width - overlay.width) <= 1
        && Math.abs(target.height - overlay.height) <= 1);
    })()`),
    "The selection overlay did not follow the animated target.",
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
  const verticalScrollState = await evaluate(send, `(() => {
    const viewport = window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']");
    const lanes = window.__devtoolsEditorV2Harness.query("[data-role='track-lanes']");
    const sourceLane = lanes.querySelector(".devtools-editor__track-lane");
    const clones = Array.from({ length: 18 }, () => {
      const clone = sourceLane.cloneNode(true);
      clone.dataset.verticalScrollFixture = "";
      lanes.append(clone);
      return clone;
    });
    const ruler = window.__devtoolsEditorV2Harness.query("[data-role='ruler']");
    const playhead = window.__devtoolsEditorV2Harness.query("[data-role='playhead']");
    const icon = playhead.querySelector(".devtools-editor__playhead-icon");
    viewport.scrollTop = 160;
    const viewportBounds = viewport.getBoundingClientRect();
    const rulerBounds = ruler.getBoundingClientRect();
    const playheadBounds = playhead.getBoundingClientRect();
    const iconBounds = icon.getBoundingClientRect();
    const state = {
      scrollTop: viewport.scrollTop,
      viewportTop: viewportBounds.top,
      viewportBottom: viewportBounds.bottom,
      rulerTop: rulerBounds.top,
      iconTop: iconBounds.top,
      playheadTop: playheadBounds.top,
      playheadBottom: playheadBounds.bottom,
      playheadCenterX: playheadBounds.left + playheadBounds.width / 2,
      iconCenterX: iconBounds.left + iconBounds.width / 2,
    };
    viewport.scrollTop = 0;
    for (const clone of clones) clone.remove();
    return state;
  })()`);
  assert(
    verticalScrollState.scrollTop >= 150
      && Math.abs(verticalScrollState.rulerTop - verticalScrollState.viewportTop) <= 1
      && Math.abs(verticalScrollState.iconTop - verticalScrollState.viewportTop - 1) <= 1
      && verticalScrollState.playheadTop < verticalScrollState.viewportTop
      && verticalScrollState.playheadBottom >= verticalScrollState.viewportBottom
      && Math.abs(verticalScrollState.playheadCenterX - verticalScrollState.iconCenterX) <= 0.5,
    `The ruler or playhead did not remain aligned during vertical scrolling: ${JSON.stringify(verticalScrollState)}`,
  );
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
  const clampedSeek = await evaluate(send, `(() => ({
    time: window.__devtoolsEditorV2Harness.view.time.time,
    sourceDuration: window.__devtoolsEditorV2Harness.view.time.sourceDuration,
    progress: window.__devtoolsEditorV2Harness.view.time.progress,
  }))()`);
  assert(
    Math.abs(clampedSeek.time - clampedSeek.sourceDuration) <= 0.000001
      && clampedSeek.progress > 0
      && clampedSeek.progress < 0.2,
    `Seeking into empty timeline space was not clamped to the authored duration: ${JSON.stringify(clampedSeek)}`,
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

  await evaluate(send, `window.__devtoolsEditorV2Harness.selectTimeline(window.__devtoolsEditorV2Harness.registerLongTimeline())`);
  await waitFor(
    () => evaluate(send, `window.__devtoolsEditorV2Harness.view.time?.duration === 16 && [...window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__tick")].at(-1)?.textContent === "16s"`),
    "the expanded sixteen-second inspection window",
  );
  const longTimelineState = await evaluate(send, `(() => {
    const viewport = window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']");
    const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']");
    const ticks = [...window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__tick")];
    const overflow = viewport.scrollWidth - viewport.clientWidth;
    viewport.scrollLeft = Math.min(240, overflow);
    const contentBounds = content.getBoundingClientRect();
    const viewportBounds = viewport.getBoundingClientRect();
    const clientX = contentBounds.left + 12 + (contentBounds.width - 24) * 12 / 16;
    viewport.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX,
      clientY: viewportBounds.top + 60,
    }));
    const playheadBounds = window.__devtoolsEditorV2Harness.query("[data-role='playhead']").getBoundingClientRect();
    const state = {
      duration: window.__devtoolsEditorV2Harness.view.time.duration,
      progress: window.__devtoolsEditorV2Harness.view.time.progress,
      contentWidth: contentBounds.width,
      viewportWidth: viewportBounds.width,
      scrollWidth: viewport.scrollWidth,
      clientWidth: viewport.clientWidth,
      scrollLeft: viewport.scrollLeft,
      ticks: ticks.map((tick) => tick.textContent),
      playheadCenterX: playheadBounds.left + playheadBounds.width / 2,
      expectedX: clientX,
    };
    viewport.scrollLeft = 0;
    return state;
  })()`);
  assert(
    longTimelineState.duration === 16
      && longTimelineState.contentWidth > longTimelineState.viewportWidth
      && longTimelineState.scrollWidth > longTimelineState.clientWidth
      && longTimelineState.scrollLeft > 0
      && longTimelineState.ticks.length === 17
      && longTimelineState.ticks.every((tick, index) => tick === `${index}s`)
      && Math.abs(longTimelineState.progress - 0.75) < 0.001
      && Math.abs(longTimelineState.playheadCenterX - longTimelineState.expectedX) <= 1,
    `The long timeline scale, overflow, ticks, seek, or playhead alignment is incorrect: ${JSON.stringify(longTimelineState)}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.removeLongTimeline()`);

  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-timeline-id='playground/v2/particles']").click()`);
  await waitFor(
    () => evaluate(send, `window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__track-block").length === 1 && window.__devtoolsEditorV2Harness.query("[data-role='duration']").textContent === "00:05.000" && [...window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__tick")].at(-1)?.textContent === "12s"`),
    "the finite particle window",
  );
  const particleZeroState = await evaluate(send, `(() => {
    const tick = window.__devtoolsEditorV2Harness.query(".devtools-editor__tick[data-edge='start']").getBoundingClientRect();
    const icon = window.__devtoolsEditorV2Harness.query("[data-role='playhead'] .devtools-editor__playhead-icon").getBoundingClientRect();
    const marker = window.__devtoolsEditorV2Harness.query("[data-role='timeline-end-marker']");
    const postDuration = window.__devtoolsEditorV2Harness.query("[data-role='post-duration']");
    const block = window.__devtoolsEditorV2Harness.query(".devtools-editor__track-block").getBoundingClientRect();
    const markerBounds = marker.getBoundingClientRect();
    const markerStyle = getComputedStyle(marker);
    return {
      tickLeft: tick.left,
      iconRight: icon.right,
      trackCount: window.__devtoolsEditorV2Harness.query("[data-role='track-count']")?.textContent,
      endMarkerHidden: marker.hidden,
      endMarkerLabel: marker.getAttribute("aria-label"),
      postDurationHidden: postDuration.hidden,
      markerLeft: markerBounds.left,
      markerInlineLeft: marker.style.left,
      markerDisplay: markerStyle.display,
      markerWidth: markerStyle.width,
      markerBackground: markerStyle.backgroundColor,
      blockRight: block.right,
      postDurationLeft: postDuration.getBoundingClientRect().left,
      postDurationInlineLeft: postDuration.style.left,
    };
  })()`);
  assert(
    particleZeroState.tickLeft > particleZeroState.iconRight,
    `The zero-second ruler label overlaps the playhead: ${JSON.stringify(particleZeroState)}`,
  );
  assert(
    particleZeroState.trackCount === "1 track"
      && !particleZeroState.endMarkerHidden
      && !particleZeroState.postDurationHidden
      && particleZeroState.endMarkerLabel === "Cycle ends at 5.00s"
      && particleZeroState.markerDisplay !== "none"
      && particleZeroState.markerWidth === "1px"
      && particleZeroState.markerBackground !== "rgba(0, 0, 0, 0)"
      && particleZeroState.markerInlineLeft === particleZeroState.postDurationInlineLeft
      && Math.abs(particleZeroState.postDurationLeft - particleZeroState.blockRight) <= 1,
    `The repeating timeline cycle boundary is incorrect: ${JSON.stringify(particleZeroState)}`,
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
  const particleTiming = await evaluate(send, `(() => ({
    sourceDuration: window.__devtoolsEditorV2Harness.view.time.sourceDuration,
    spans: window.__devtoolsEditorV2Harness.view.tracks[0].spans,
    inspector: window.__devtoolsEditorV2Harness.view.inspector,
    inspectorText: window.__devtoolsEditorV2Harness.query("[data-role='inspector-content']").textContent,
  }))()`);
  assert(
    await evaluate(send, `document.querySelector("#devtools-v2-canvas").getAttribute("data-devtools-editor-selected") === "true"`)
      && particleTiming.sourceDuration === 5
      && particleTiming.spans.length === 1
      && particleTiming.spans[0].start === 0
      && Math.abs(particleTiming.spans[0].end - 5 / 12) < 0.000001
      && particleTiming.inspector.start === 0
      && particleTiming.inspector.duration === 5
      && particleTiming.inspector.end === 5
      && particleTiming.inspectorText.includes("5.00s")
      && !particleTiming.inspectorText.includes("∞"),
    `The particle cycle geometry, inspector timing, or target highlight is incorrect: ${JSON.stringify(particleTiming)}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.seek(0)`);
  const canvasAtCycleStart = await evaluate(send, `(() => {
    const canvas = document.querySelector("#devtools-v2-canvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0;
    for (let index = 0; index < data.length; index += 97) hash = (hash * 31 + data[index]) >>> 0;
    return hash;
  })()`);
  await evaluate(send, `window.__devtoolsEditorV2Harness.seek(7 / 12)`);
  const pausedSeekState = await evaluate(send, `(() => {
    const canvas = document.querySelector("#devtools-v2-canvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0;
    for (let index = 0; index < data.length; index += 97) hash = (hash * 31 + data[index]) >>> 0;
    return { hash, paused: window.__devtoolsEditorV2Harness.activeTimelinePaused };
  })()`);
  assert(
    pausedSeekState.paused && pausedSeekState.hash !== canvasAtCycleStart,
    `Paused seeking did not redraw the Canvas particle phase: ${JSON.stringify({ canvasAtCycleStart, pausedSeekState })}`,
  );
  for (const [rulerTime, cycleTime] of [[2, 2], [5, 5], [7, 2], [10, 5], [12, 2]]) {
    await evaluate(send, `window.__devtoolsEditorV2Harness.seek(${rulerTime} / 12)`);
    const seekState = await evaluate(send, `(() => ({
      progress: window.__devtoolsEditorV2Harness.view.time.progress,
      currentTime: window.__devtoolsEditorV2Harness.query("[data-role='current-time']").textContent,
      blocks: window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__track-block").length,
    }))()`);
    assert(
      Math.abs(seekState.progress - cycleTime / 12) < 0.000001
        && seekState.currentTime === `00:0${cycleTime}.000`
        && seekState.blocks === 1,
      `Seeking to ${rulerTime}s did not resolve to the ${cycleTime}s loop phase: ${JSON.stringify(seekState)}`,
    );
  }
  const readEndpointDragState = () => evaluate(send, `(() => {
    const canvas = document.querySelector("#devtools-v2-canvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0;
    for (let index = 0; index < data.length; index += 97) hash = (hash * 31 + data[index]) >>> 0;
    return {
      currentTime: window.__devtoolsEditorV2Harness.query("[data-role='current-time']").textContent,
      progress: window.__devtoolsEditorV2Harness.view.time.progress,
      paused: window.__devtoolsEditorV2Harness.activeTimelinePaused,
      hash,
    };
  })()`);
  for (const rulerTime of [5, 6, 7, 12]) {
    await evaluate(send, `window.__devtoolsEditorV2Harness.seek(0)`);
    const endpointDrag = await evaluate(send, `(() => {
      const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']").getBoundingClientRect();
      const icon = window.__devtoolsEditorV2Harness.query("[data-role='playhead'] .devtools-editor__playhead-icon").getBoundingClientRect();
      return {
        from: { x: icon.left + icon.width / 2, y: icon.top + icon.height / 2 },
        to: {
          x: Math.round(content.left + 12 + (content.width - 24) * ${rulerTime} / 12),
          y: icon.top + icon.height / 2,
        },
      };
    })()`);
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...endpointDrag.from,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      ...endpointDrag.to,
      button: "left",
      buttons: 1,
    });
    const endpointDuringDrag = await readEndpointDragState();
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...endpointDrag.to,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await evaluate(send, `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    const endpointAfterRefresh = await readEndpointDragState();
    assert(
      endpointDuringDrag.currentTime === "00:05.000"
        && Math.abs(endpointDuringDrag.progress - 5 / 12) < 0.000001
        && endpointDuringDrag.paused
        && endpointAfterRefresh.currentTime === "00:05.000"
        && Math.abs(endpointAfterRefresh.progress - 5 / 12) < 0.000001
        && endpointAfterRefresh.paused
        && endpointAfterRefresh.hash === endpointDuringDrag.hash,
      `Dragging to ${rulerTime}s did not clamp and hold the cycle endpoint: ${JSON.stringify({ endpointDuringDrag, endpointAfterRefresh })}`,
    );
  }
  await screenshot(send, particles);

  await send("Emulation.setDeviceMetricsOverride", {
    width: 640,
    height: 820,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const expectedNarrowHeight = persistedDesktopHeight
    / resizeHitTarget.viewportHeight
    * 820;
  await waitFor(
    () => evaluate(send, `Math.abs(window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").getBoundingClientRect().height - ${expectedNarrowHeight}) <= 2`),
    "the persisted editor ratio to adapt to the narrow viewport",
  );
  const narrowState = await evaluate(send, `(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    activePane: window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").dataset.activePane,
    selectedTab: window.__devtoolsEditorV2Harness.query("[data-pane-target][aria-selected='true']")?.dataset.paneTarget,
    visiblePanes: [...window.__devtoolsEditorV2Harness.queryAll("[data-pane]")].filter((pane) => getComputedStyle(pane).display !== "none").map((pane) => pane.dataset.pane),
    timelineHeight: window.__devtoolsEditorV2Harness.query(".devtools-editor__timeline").getBoundingClientRect().height,
    inspectorHidden: window.__devtoolsEditorV2Harness.query("[data-role='inspector']").hidden,
    inspectorDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-role='inspector']")).display,
    inspectorTab: Boolean(window.__devtoolsEditorV2Harness.query("[data-pane-target='inspector']")),
    editorHeight: window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").getBoundingClientRect().height,
    editorTop: window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").getBoundingClientRect().top,
  }))()`);
  assert(
    narrowState.scrollWidth <= 640
      && narrowState.activePane === "timeline"
      && narrowState.selectedTab === "timeline"
      && narrowState.visiblePanes.length === 0
      && !narrowState.inspectorHidden
      && narrowState.inspectorDisplay !== "none"
      && !narrowState.inspectorTab
      && Math.abs(narrowState.editorHeight - expectedNarrowHeight) <= 2
      && narrowState.editorTop >= 280,
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
    await evaluate(send, `document.querySelectorAll("motion-devtools-editor").length === 0 && document.querySelectorAll("[data-devtools-editor-highlight-root]").length === 0 && document.querySelector("#devtools-v2-finite").parentElement?.id === "devtools-v2-sources" && document.querySelector("#devtools-v2-finite").nextElementSibling?.id === "devtools-v2-particles"`),
    "Destroying the editor removed or moved application roots.",
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.remount()`);
  await waitFor(
    () => evaluate(send, `window.__devtoolsEditorV2Harness.queryAll("[data-devtools-editor]").length === 1`),
    "editor destroy and remount",
  );
  const remountedResizeState = await evaluate(send, `(() => ({
    height: window.__devtoolsEditorV2Harness.query("[data-devtools-editor]").getBoundingClientRect().height,
    resizeState: window.__devtoolsEditorV2Harness.query("[data-role='height-separator']").dataset.resizeState,
    valueNow: window.__devtoolsEditorV2Harness.query("[data-role='height-separator']").getAttribute("aria-valuenow"),
  }))()`);
  assert(
    Math.abs(remountedResizeState.height - expectedNarrowHeight) <= 2
      && remountedResizeState.resizeState === "idle"
      && Math.abs(Number(remountedResizeState.valueNow) - remountedResizeState.height) <= 1,
    `The editor height ratio or resize lifecycle did not survive remount: ${JSON.stringify(remountedResizeState)}`,
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
      "editor-height-hit-target",
      "editor-height-pointer-resize",
      "editor-height-keyboard-resize",
      "editor-height-reset",
      "editor-height-session-persistence",
      "editor-height-preview-clamp",
      "seek-preserves-playback",
      "scrollbar-does-not-seek",
      "vertical-scroll-sticky-ruler-and-playhead",
      "long-timeline-stable-time-scale",
      "long-timeline-horizontal-scroll-alignment",
      "playhead-drag-states",
      "application-root-ownership",
      "stable-track-selection",
      "transport-visual-hierarchy",
      "transport",
      "replay",
      "replay-preserves-inspector-detail",
      "finished-play-preserves-inspector-detail",
      "seek-clamped-to-authored-duration",
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
