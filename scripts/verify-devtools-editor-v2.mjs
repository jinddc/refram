import { join } from "node:path";

import {
  assert,
  evaluate,
  reportVisualFailure,
  runVisualHarness,
  screenshot,
  waitFor,
} from "./visual-harness.mjs";

function validScrubEdgeGeometry(samples) {
  if (!Array.isArray(samples) || samples.length !== 3) return false;
  const [start, middle, end] = samples;
  return samples.every((sample) => (
    Math.abs(sample.lineX - sample.expectedLineX) <= 1
      && sample.pillLeft >= sample.viewportLeft - 0.5
      && sample.pillRight <= sample.viewportRight + 0.5
  ))
    && start.progress === 0
    && start.text === "0%"
    && start.pillLeft <= start.lineX - 0.5
    && start.pillLeft >= start.lineX - 1.5
    && middle.progress === 0.5
    && middle.text === "50%"
    && Math.abs((middle.pillLeft + middle.pillRight) / 2 - middle.lineX) <= 0.5
    && end.progress === 1
    && end.text === "100%"
    && end.pillRight >= end.lineX + 0.5
    && end.pillRight <= end.lineX + 1.5;
}

async function verify({ artifactDirectory, send }) {
  const desktop = join(artifactDirectory, "devtools-editor-v2-desktop.png");
  const particles = join(artifactDirectory, "devtools-editor-v2-particles.png");
  const narrow = join(artifactDirectory, "devtools-editor-v2-narrow.png");
  const scrollScrub = join(artifactDirectory, "devtools-editor-v2-scroll-scrub.png");
  const scrollScrubNarrow = join(artifactDirectory, "devtools-editor-v2-scroll-scrub-narrow.png");
  const scrollScrubDpr2 = join(artifactDirectory, "devtools-editor-v2-scroll-scrub-dpr2.png");
  const scrollScrubNarrowDpr2 = join(artifactDirectory, "devtools-editor-v2-scroll-scrub-narrow-dpr2.png");
  const scrollScrubMinimal = join(artifactDirectory, "devtools-editor-v2-scroll-scrub-minimal.png");
  const standardMinimalNarrow = join(artifactDirectory, "devtools-editor-v2-standard-minimal-narrow.png");
  const scrollScrubMinimalNarrow = join(artifactDirectory, "devtools-editor-v2-scroll-scrub-minimal-narrow.png");

  await waitFor(
    () => evaluate(send, `Boolean(window.__devtoolsEditorV2Harness) && window.__devtoolsEditorV2Harness.query("[data-role='duration']")?.textContent === "00:01.640" && window.__devtoolsEditorV2Harness.queryAll(".rf__track-block").length === 3`),
    "the new DevTools editor",
  );
  const desktopState = await evaluate(send, `(() => ({
    timelines: window.__devtoolsEditorV2Harness.queryAll("[data-timeline-id]").length,
    visibleTimelineIds: window.__devtoolsEditorV2Harness.queryAll(".rf__timeline-item-id").length,
    hasPreviewSurface: Boolean(window.__devtoolsEditorV2Harness.query("[data-role='preview-surface']")),
    tracks: window.__devtoolsEditorV2Harness.queryAll(".rf__track-block").length,
    trackCount: window.__devtoolsEditorV2Harness.query("[data-role='track-count']")?.textContent,
    trackLabelWidth: window.__devtoolsEditorV2Harness.query("[data-role='track-labels']").getBoundingClientRect().width,
    trackLabels: [...window.__devtoolsEditorV2Harness.queryAll(".rf__track-label")].map((label) => ({ text: label.textContent, title: label.title, ariaLabel: label.getAttribute("aria-label") })),
    endMarkerHidden: window.__devtoolsEditorV2Harness.query("[data-role='timeline-end-marker']").hidden,
    endMarkerLabel: window.__devtoolsEditorV2Harness.query("[data-role='timeline-end-marker']").getAttribute("aria-label"),
    postDurationHidden: window.__devtoolsEditorV2Harness.query("[data-role='post-duration']").hidden,
    rulerEnd: [...window.__devtoolsEditorV2Harness.queryAll(".rf__tick")].at(-1)?.textContent,
    rulerMarks: window.__devtoolsEditorV2Harness.queryAll(".rf__ruler-mark").length,
    zeroTickInset: (() => {
      const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']").getBoundingClientRect();
      const tick = window.__devtoolsEditorV2Harness.query(".rf__tick").getBoundingClientRect();
      return tick.left + tick.width / 2 - content.left;
    })(),
    firstBlockRatio: (() => {
      const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']").getBoundingClientRect();
      const block = window.__devtoolsEditorV2Harness.query(".rf__track-block").getBoundingClientRect();
      return block.width / content.width;
    })(),
    rootHeight: window.__devtoolsEditorV2Harness.query("[data-rf]").getBoundingClientRect().height,
    hostHeight: document.querySelector("rf-editor").getBoundingClientRect().height,
    hostComputedHeight: getComputedStyle(document.querySelector("rf-editor")).height,
    hostInlineHeight: document.querySelector("rf-editor").style.height,
    rootComputedHeight: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-rf]")).height,
    userSelect: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-rf]")).userSelect,
    trackPointerEvents: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__track-block")).pointerEvents,
    viewportPointerEvents: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']")).pointerEvents,
    playheadIcon: Boolean(window.__devtoolsEditorV2Harness.query("[data-role='playhead'] .rf__playhead-icon")),
    shadowStyle: Boolean(window.__devtoolsEditorV2Harness.editorRoot.querySelector("style")),
    lightEditorRoot: Boolean(document.querySelector("[data-rf]")),
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
    inspectorOpen: window.__devtoolsEditorV2Harness.query("[data-rf]").dataset.inspectorOpen,
    timelinesVisible: window.__devtoolsEditorV2Harness.query("[data-rf]").dataset.timelinesVisible,
    hasHeader: Boolean(window.__devtoolsEditorV2Harness.query(".rf__header")),
    transportGroups: [...window.__devtoolsEditorV2Harness.queryAll(".rf__transport-group")].map((group) => {
      const style = getComputedStyle(group);
      const bounds = group.getBoundingClientRect();
      return {
        role: group.getAttribute("role"),
        label: group.getAttribute("aria-label"),
        display: style.display,
        height: bounds.height,
        borderWidth: style.borderTopWidth,
        backgroundColor: style.backgroundColor,
      };
    }),
    speedParent: window.__devtoolsEditorV2Harness.query("[data-action='set-speed']").parentElement?.className,
    playbackOrder: [...window.__devtoolsEditorV2Harness.query(".rf__playback").children].map((child) => child.dataset.action || child.className),
    playbackActionOrder: [...window.__devtoolsEditorV2Harness.query(".rf__playback-actions").children].map((child) => child.dataset.action),
    playbackCenterOffset: (() => {
      const transport = window.__devtoolsEditorV2Harness.query(".rf__transport").getBoundingClientRect();
      const playback = window.__devtoolsEditorV2Harness.query(".rf__playback").getBoundingClientRect();
      return Math.abs((transport.left + transport.width / 2) - (playback.left + playback.width / 2));
    })(),
    playBackground: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__action--primary")).backgroundColor,
    playButtonGeometry: (() => {
      const button = window.__devtoolsEditorV2Harness.query(".rf__action--primary");
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
        icons: [...button.querySelectorAll(".rf__transport-icon")].map((icon) => icon.dataset.icon),
      };
    }),
    jumpAction: (() => {
      const button = window.__devtoolsEditorV2Harness.query("[data-action='jump-to-scrolltrigger-target']");
      return {
        hidden: button.hidden,
        disabled: button.disabled,
        label: button.getAttribute("aria-label"),
      };
    })(),
    replayBackground: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-action='replay']")).backgroundColor,
    replayBorderWidth: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-action='replay']")).borderTopWidth,
    editorTop: window.__devtoolsEditorV2Harness.query("[data-rf]").getBoundingClientRect().top,
    workspaceTop: window.__devtoolsEditorV2Harness.query("[data-role='workspace']").getBoundingClientRect().top,
  }))()`);
  assert(desktopState.timelines === 5, "The new editor did not list all fixture timelines.");
  assert(
    await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='copy-timeline-report'], [data-action='copy-debug-json']") === null`),
    "Removed copy actions are still rendered.",
  );
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
    desktopState.transportGroups.length === 3
      && desktopState.transportGroups.every(({ role, label, display, height, borderWidth, backgroundColor }) => (
        role === "group"
          && Boolean(label)
          && Math.abs(height - (label === "Playback controls" ? 32 : 28)) <= 1
          && borderWidth === "0px"
          && backgroundColor === "rgba(0, 0, 0, 0)"
      ))
      && desktopState.speedParent.includes("rf__playback")
      && desktopState.playbackOrder.join("|") === "rf__playback-actions|rf__clock|set-speed"
      && desktopState.playbackActionOrder.join("|") === "replay|play|toggle-loop|toggle-reverse"
      && desktopState.playbackCenterOffset <= 1
      && desktopState.playButtonGeometry.width === 32
      && desktopState.playButtonGeometry.height === 32
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
    `The transport hierarchy or grouping is incorrect: ${JSON.stringify({
      transportGroups: desktopState.transportGroups,
      speedParent: desktopState.speedParent,
      playbackOrder: desktopState.playbackOrder,
      playbackActionOrder: desktopState.playbackActionOrder,
      playbackCenterOffset: desktopState.playbackCenterOffset,
      playButtonGeometry: desktopState.playButtonGeometry,
      transportIconActions: desktopState.transportIconActions,
      playBackground: desktopState.playBackground,
      replayBackground: desktopState.replayBackground,
      replayBorderWidth: desktopState.replayBorderWidth,
    })}`,
  );
  assert(
    !desktopState.jumpAction.hidden
      && !desktopState.jumpAction.disabled
      && desktopState.jumpAction.label === "Jump to target",
    `The ordinary timeline target action is incorrect: ${JSON.stringify(desktopState.jumpAction)}`,
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
  assert(
    await evaluate(send, `[...document.querySelectorAll(".gsap-marker-start, .gsap-marker-end, .gsap-marker-scroller-start, .gsap-marker-scroller-end")].every((marker) => getComputedStyle(marker).display === "none")`),
    "Native ScrollTrigger markers were visible before an explicit timeline selection.",
  );
  const windowScrollState = await evaluate(send, `(async () => {
    window.__devtoolsEditorV2Harness.query("[data-timeline-id='playground/v2/window-scroll']").click();
    const trigger = window.__devtoolsEditorV2Harness.activeScrollTrigger;
    const jumpButton = window.__devtoolsEditorV2Harness.query("[data-action='jump-to-scrolltrigger-target']");
    const markersButton = window.__devtoolsEditorV2Harness.query("[data-action='toggle-scrolltrigger-markers']");
    const markerConfig = trigger.vars.markers;
    const markersOnColor = getComputedStyle(markersButton).color;
    jumpButton.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const triggerBoundsAfterJump = trigger.trigger.getBoundingClientRect();
    const jumpTargetOffset = Math.abs(
      triggerBoundsAfterJump.top + triggerBoundsAfterJump.height / 2 - innerHeight / 2,
    );
    const expected = trigger.start + (trigger.end - trigger.start) * 0.5;
    const sought = window.__devtoolsEditorV2Harness.seek(0.5);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const markerTops = (types) => Object.fromEntries(
      [...document.querySelectorAll("[data-rf-marker-owned]")]
        .filter((marker) => types.includes(marker.dataset.rfMarkerOwnedType))
        .map((marker) => [
          marker.dataset.rfMarkerOwnedType,
          marker.getBoundingClientRect().top,
        ]),
    );
    const contentBeforeScroll = markerTops(["start", "end"]);
    const scrollerBeforeScroll = markerTops(["scroller-start", "scroller-end"]);
    trigger.scroll(expected + 20);
    trigger.update();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const contentAfterScroll = markerTops(["start", "end"]);
    const scrollerAfterScroll = markerTops(["scroller-start", "scroller-end"]);
    trigger.scroll(expected);
    trigger.update();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const previewBottom = document.querySelector("rf-editor").getBoundingClientRect().top;
    const ownedMarkers = [...document.querySelectorAll("[data-rf-marker-owned]")].map((marker) => {
      const rect = marker.getBoundingClientRect();
      return {
        type: marker.dataset.rfMarkerOwnedType,
        text: marker.textContent,
        display: getComputedStyle(marker).display,
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        visibleInPreview: rect.top >= -0.5
          && rect.bottom <= previewBottom + 0.5
          && rect.right > 0
          && rect.left < window.innerWidth,
      };
    });
    const markersDoNotOverlap = ownedMarkers.every((marker, index) => (
      ownedMarkers.slice(index + 1).every((other) => (
        marker.rect.bottom <= other.rect.top + 0.5
          || other.rect.bottom <= marker.rect.top + 0.5
          || marker.rect.right <= other.rect.left + 0.5
          || other.rect.right <= marker.rect.left + 0.5
      ))
    ));
    markersButton.click();
    const markersCleanedAfterToggle = document.querySelectorAll(
      "[data-rf-marker-owned]",
    ).length === 0;
    const markersOffColor = getComputedStyle(markersButton).color;
    const markersPressedOff = markersButton.getAttribute("aria-pressed");
    markersButton.click();
    return {
      sought,
      expected,
      actual: trigger.scroll(),
      windowScroll: window.scrollY,
      label: window.__devtoolsEditorV2Harness.query("[data-timeline-id='playground/v2/window-scroll']")?.textContent,
      ruler: window.__devtoolsEditorV2Harness.query("[data-role='ruler']")?.getAttribute("aria-label"),
      ticks: [...window.__devtoolsEditorV2Harness.queryAll(".rf__tick")].map((tick) => tick.textContent),
      markerMotion: {
        content: Object.keys(contentBeforeScroll).map((label) => (
          contentAfterScroll[label] - contentBeforeScroll[label]
        )),
        scroller: Object.keys(scrollerBeforeScroll).map((label) => (
          scrollerAfterScroll[label] - scrollerBeforeScroll[label]
        )),
      },
      scrollerStartInset: previewBottom - ownedMarkers
        .find(({ type }) => type === "scroller-start").rect.bottom,
      scrollerEndInset: ownedMarkers
        .find(({ type }) => type === "scroller-end").rect.top,
      copyMarkersAbsent: window.__devtoolsEditorV2Harness.query(
        "[data-action='copy-markers-config']",
      ) === null,
      ownedMarkers,
      markersDoNotOverlap,
      markers: window.__devtoolsEditorV2Harness.view.scrollTrigger?.markers,
      actions: {
        display: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__transport-settings")).display,
        jumpDisabled: jumpButton.disabled,
        jumpLabel: jumpButton.getAttribute("aria-label"),
        jumpIcon: jumpButton.querySelector("svg")?.dataset.icon,
        jumpTargetOffset,
        markersDisabled: markersButton.disabled,
        markersPressed: markersButton.getAttribute("aria-pressed"),
        markersLabel: markersButton.getAttribute("aria-label"),
        markersIcon: markersButton.querySelector("svg")?.dataset.icon,
        markersCleanedAfterToggle,
        markersPressedOff,
        markersOnColor,
        markersOffColor,
        markerConfigPreserved: trigger.vars.markers === markerConfig,
        triggerPreserved: window.__devtoolsEditorV2Harness.activeScrollTrigger === trigger,
      },
      transportDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__transport")).display,
      playbackDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__playback")).display,
      viewportControlsDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__viewport-controls")).display,
      resetDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-action='reset-timeline-zoom']")).display,
      zoomDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__zoom-control")).display,
      pill: window.__devtoolsEditorV2Harness.query(".rf__playhead-progress")?.textContent,
      pillHidden: window.__devtoolsEditorV2Harness.query(".rf__playhead-progress")?.hidden,
      playheadValue: window.__devtoolsEditorV2Harness.query("[data-role='playhead']")?.getAttribute("aria-valuetext"),
    };
  })()`, true);
  assert(
    windowScrollState.sought
      && Math.abs(windowScrollState.actual - windowScrollState.expected) <= 2
      && Math.abs(windowScrollState.windowScroll - windowScrollState.expected) <= 2
      && windowScrollState.label === "Window scrub"
      && windowScrollState.ruler === "Scroll progress ruler from 0% to 100%"
      && windowScrollState.ticks.join("|") === "0%|25%|50%|75%|100%"
      && windowScrollState.ownedMarkers.length === 4
      && windowScrollState.ownedMarkers.map(({ text }) => text).sort().join("|")
        === "end|scroller end|scroller start|start"
      && windowScrollState.ownedMarkers.every(({ display }) => display !== "none")
      && windowScrollState.ownedMarkers
        .filter(({ type }) => type.startsWith("scroller-"))
        .every(({ visibleInPreview }) => visibleInPreview)
      && windowScrollState.ownedMarkers.every(({ rect }) => rect.width > 0 && rect.height > 0)
      && windowScrollState.markersDoNotOverlap
      && windowScrollState.markerMotion.content.every((delta) => Math.abs(delta + 20) <= 1)
      && windowScrollState.markerMotion.scroller.every((delta) => Math.abs(delta) <= 1)
      && Math.abs(windowScrollState.scrollerStartInset) <= 0.5
      && Math.abs(windowScrollState.scrollerEndInset) <= 0.5
      && windowScrollState.copyMarkersAbsent
      && windowScrollState.markers === false
      && windowScrollState.actions.display === "flex"
      && !windowScrollState.actions.jumpDisabled
      && windowScrollState.actions.jumpLabel === "Jump to target"
      && windowScrollState.actions.jumpIcon === "jump-to-target"
      && windowScrollState.actions.jumpTargetOffset <= 2
      && !windowScrollState.actions.markersDisabled
      && windowScrollState.actions.markersPressed === "true"
      && windowScrollState.actions.markersLabel === "Hide ScrollTrigger markers"
      && windowScrollState.actions.markersIcon === "markers"
      && windowScrollState.actions.markersCleanedAfterToggle
      && windowScrollState.actions.markersPressedOff === "false"
      && windowScrollState.actions.markersOnColor !== windowScrollState.actions.markersOffColor
      && windowScrollState.actions.markerConfigPreserved
      && windowScrollState.actions.triggerPreserved
      && windowScrollState.transportDisplay === "grid"
      && windowScrollState.playbackDisplay === "none"
      && windowScrollState.viewportControlsDisplay === "flex"
      && windowScrollState.resetDisplay === "none"
      && windowScrollState.zoomDisplay === "none"
      && !windowScrollState.pillHidden
      && windowScrollState.pill === "50%"
      && windowScrollState.playheadValue === "50%",
    `The real window ScrollTrigger inspection mode is incorrect: ${JSON.stringify(windowScrollState)}`,
  );
  await screenshot(send, scrollScrub);
  const desktopScrollExpandedHeight = await evaluate(send, `document.querySelector("rf-editor").getBoundingClientRect().height`);
  const desktopScrollMinimalState = await evaluate(send, `(() => {
    const toggle = window.__devtoolsEditorV2Harness.query("[data-action='toggle-timeline-visibility']");
    toggle.click();
    const root = window.__devtoolsEditorV2Harness.query("[data-rf]");
    const host = document.querySelector("rf-editor");
    const transport = window.__devtoolsEditorV2Harness.query(".rf__transport");
    const viewport = window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']");
    const playhead = window.__devtoolsEditorV2Harness.query("[data-role='playhead']");
    const ruler = window.__devtoolsEditorV2Harness.query("[data-role='ruler']");
    const toggleBounds = toggle.getBoundingClientRect();
    const transportBounds = transport.getBoundingClientRect();
    const viewportBounds = viewport.getBoundingClientRect();
    const rulerBounds = ruler.getBoundingClientRect();
    const railStyle = getComputedStyle(ruler, "::after");
    return {
      collapsed: root.dataset.timelineCollapsed,
      rootHeight: root.getBoundingClientRect().height,
      hostHeight: host.getBoundingClientRect().height,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      transportHeight: transportBounds.height,
      viewportHeight: viewportBounds.height,
      playheadHeight: playhead.getBoundingClientRect().height,
      toggleRightGap: transportBounds.right - toggleBounds.right,
      toggleBorderLeft: getComputedStyle(toggle).borderLeftWidth,
      toggleSeparatorDisplay: getComputedStyle(toggle, "::before").display,
      iconStrokeWidth: getComputedStyle(toggle.querySelector("path")).strokeWidth,
      label: toggle.getAttribute("aria-label"),
      expanded: toggle.getAttribute("aria-expanded"),
      separatorDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-role='height-separator']")).display,
      playbackDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__playback")).display,
      actionsDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__transport-settings")).display,
      hintDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__transport-hint")).display,
      inspectorDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-role='inspector']")).display,
      trackLabelsDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-role='track-labels']")).display,
      trackLanesDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-role='track-lanes']")).display,
      progressPillDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__playhead-progress")).display,
      zoomDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__zoom-control")).display,
      resetDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-action='reset-timeline-zoom']")).display,
      railProgressWidth: Number.parseFloat(getComputedStyle(ruler, "::before").width),
      railProgressColor: getComputedStyle(ruler, "::before").backgroundColor,
      railTop: railStyle.top,
      railTopGap: rulerBounds.top + Number.parseFloat(railStyle.top) - transportBounds.bottom,
    };
  })()`);
  assert(
    desktopScrollMinimalState.collapsed === "true"
      && Math.abs(desktopScrollMinimalState.rootHeight - 75) <= 1
      && Math.abs(desktopScrollMinimalState.hostHeight - 75) <= 1
      && desktopScrollMinimalState.documentWidth <= desktopScrollMinimalState.viewportWidth
      && Math.abs(desktopScrollMinimalState.transportHeight - 48) <= 1
      && Math.abs(desktopScrollMinimalState.viewportHeight - 20) <= 1
      && Math.abs(desktopScrollMinimalState.playheadHeight - 20) <= 1
      && Math.abs(desktopScrollMinimalState.toggleRightGap - 10) <= 1
      && desktopScrollMinimalState.toggleBorderLeft === "0px"
      && desktopScrollMinimalState.toggleSeparatorDisplay === "none"
      && Number.parseFloat(desktopScrollMinimalState.iconStrokeWidth) >= 0.6
      && desktopScrollMinimalState.label === "Show timeline"
      && desktopScrollMinimalState.expanded === "false"
      && desktopScrollMinimalState.separatorDisplay === "none"
      && desktopScrollMinimalState.playbackDisplay === "none"
      && desktopScrollMinimalState.actionsDisplay === "flex"
      && desktopScrollMinimalState.hintDisplay !== "none"
      && desktopScrollMinimalState.inspectorDisplay === "none"
      && desktopScrollMinimalState.trackLabelsDisplay === "none"
      && desktopScrollMinimalState.trackLanesDisplay === "none"
      && desktopScrollMinimalState.progressPillDisplay === "flex"
      && desktopScrollMinimalState.zoomDisplay === "none"
      && desktopScrollMinimalState.resetDisplay === "none"
      && desktopScrollMinimalState.railProgressWidth > 0
      && desktopScrollMinimalState.railProgressColor === "rgb(85, 173, 255)"
      && desktopScrollMinimalState.railTop === "10px"
      && Math.abs(desktopScrollMinimalState.railTopGap - 10) <= 0.5,
    `The desktop ScrollTrigger minimal layout is incorrect: ${JSON.stringify(desktopScrollMinimalState)}`,
  );
  await screenshot(send, scrollScrubMinimal);
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='toggle-timeline-visibility']").click()`);
  await evaluate(send, `new Promise((resolve) => setTimeout(resolve, 160))`);
  assert(
    Math.abs(await evaluate(send, `document.querySelector("rf-editor").getBoundingClientRect().height`) - desktopScrollExpandedHeight) <= 1,
    "Expanding the desktop ScrollTrigger timeline did not restore its height.",
  );
  const customScrollState = await evaluate(send, `(async () => {
    document.querySelector("#devtools-v2-custom-trigger").className =
      "section-with-an-intentionally-long-class-name feature-panel-active-with-extra-detail";
    window.__devtoolsEditorV2Harness.query("[data-timeline-id='playground/v2/custom-scroll']").click();
    const trigger = window.__devtoolsEditorV2Harness.activeScrollTrigger;
    const expected = trigger.start + (trigger.end - trigger.start) * 0.75;
    const sought = window.__devtoolsEditorV2Harness.seek(0.75);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const markerSelector = "[data-rf-marker-owned]";
    const markerTops = () => Object.fromEntries([...document.querySelectorAll(markerSelector)].map((marker) => [
      marker.dataset.rfMarkerOwnedType,
      marker.getBoundingClientRect().top,
    ]));
    const ownedBeforeScroll = markerTops();
    trigger.scroll(expected + 20);
    trigger.update();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const ownedAfterScroll = markerTops();
    trigger.scroll(expected);
    trigger.update();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const markerConfig = trigger.vars.markers;
    const markersButton = window.__devtoolsEditorV2Harness.query("[data-action='toggle-scrolltrigger-markers']");
    markersButton.click();
    const ownedCountAfterToggleOff = document.querySelectorAll(markerSelector).length;
    markersButton.click();
    window.__devtoolsEditorV2Harness.query("[data-track-key]")?.click();
    const inspectorContent = window.__devtoolsEditorV2Harness.query("[data-role='inspector-content']");
    const triggerField = [...inspectorContent.querySelectorAll(".rf__inspector-field")]
      .find((field) => field.querySelector("dt")?.textContent === "Trigger");
    const triggerTerm = triggerField.querySelector(".rf__inspector-term");
    const triggerValue = triggerField.querySelector(".rf__inspector-value");
    const inspectorBounds = inspectorContent.getBoundingClientRect();
    const triggerTermBounds = triggerTerm.getBoundingClientRect();
    const triggerValueBounds = triggerValue.getBoundingClientRect();
    const triggerValueStyle = getComputedStyle(triggerValue);
    const transportElement = window.__devtoolsEditorV2Harness.query(".rf__transport");
    const hintElement = window.__devtoolsEditorV2Harness.query(".rf__transport-hint");
    const transportBounds = transportElement.getBoundingClientRect();
    const hintBounds = hintElement.getBoundingClientRect();
    const viewportControlBounds = window.__devtoolsEditorV2Harness
      .query(".rf__viewport-controls").getBoundingClientRect();
    const actionBounds = window.__devtoolsEditorV2Harness
      .query(".rf__transport-settings").getBoundingClientRect();
    return {
      sought,
      expected,
      actual: trigger.scroll(),
      elementScroll: document.querySelector("#devtools-v2-custom-scroller").scrollTop,
      progress: window.__devtoolsEditorV2Harness.view.scrollTrigger?.progress,
      animationProgress: window.__devtoolsEditorV2Harness.view.scrollTrigger?.animationProgress,
      nativeMarkersHidden: [...document.querySelectorAll(".gsap-marker-start, .gsap-marker-end, .gsap-marker-scroller-start, .gsap-marker-scroller-end")]
        .every((marker) => getComputedStyle(marker).display === "none"),
      ownedMarkers: {
        count: document.querySelectorAll(markerSelector).length,
        types: [...document.querySelectorAll(markerSelector)].map((marker) => (
          marker.dataset.rfMarkerOwnedType
        )).sort(),
        contentMotion: ["start", "end"].map((type) => (
          ownedAfterScroll[type] - ownedBeforeScroll[type]
        )),
        scrollerMotion: ["scroller-start", "scroller-end"].map((type) => (
          ownedAfterScroll[type] - ownedBeforeScroll[type]
        )),
        countAfterToggleOff: ownedCountAfterToggleOff,
        configPreserved: trigger.vars.markers === markerConfig && !markerConfig,
        triggerPreserved: window.__devtoolsEditorV2Harness.activeScrollTrigger === trigger,
      },
      inspector: inspectorContent.textContent,
      inspectorLayout: {
        clientWidth: inspectorContent.clientWidth,
        scrollWidth: inspectorContent.scrollWidth,
        left: inspectorBounds.left,
        right: inspectorBounds.right,
        termRight: triggerTermBounds.right,
        valueLeft: triggerValueBounds.left,
        valueRight: triggerValueBounds.right,
        valueHeight: triggerValueBounds.height,
        valueLineHeight: Number.parseFloat(triggerValueStyle.lineHeight),
        valueScrollWidth: triggerValue.scrollWidth,
        valueClientWidth: triggerValue.clientWidth,
        valueOverflowWrap: triggerValueStyle.overflowWrap,
        valueWhiteSpace: triggerValueStyle.whiteSpace,
        valueTextOverflow: triggerValueStyle.textOverflow,
        valueOverflowX: triggerValueStyle.overflowX,
        valueText: triggerValue.textContent,
        valueTitle: triggerValue.title,
        valueTruncated: triggerValue.classList.contains(
          "rf__inspector-value--truncate",
        ),
      },
      hint: {
        text: hintElement.textContent,
        display: getComputedStyle(hintElement).display,
        centerX: hintBounds.left + hintBounds.width / 2,
        transportCenterX: transportBounds.left + transportBounds.width / 2,
        right: hintBounds.right,
        viewportControlsLeft: viewportControlBounds.left,
        actionsRight: actionBounds.right,
      },
      actions: {
        display: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__transport-settings")).display,
        jumpDisabled: window.__devtoolsEditorV2Harness.query("[data-action='jump-to-scrolltrigger-target']").disabled,
        markersDisabled: window.__devtoolsEditorV2Harness.query("[data-action='toggle-scrolltrigger-markers']").disabled,
      },
      pillBounds: (() => {
        const bounds = window.__devtoolsEditorV2Harness.query(".rf__playhead-progress").getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, width: bounds.width };
      })(),
      viewportBounds: (() => {
        const bounds = window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']").getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, width: bounds.width };
      })(),
      endMarkerDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-role='timeline-end-marker']")).display,
      transport: (() => {
        const element = window.__devtoolsEditorV2Harness.query(".rf__transport");
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          height: bounds.height,
          display: style.display,
          backgroundColor: style.backgroundColor,
          borderBottomWidth: style.borderBottomWidth,
          columns: style.gridTemplateColumns.split(" ").length,
          right: bounds.right,
        };
      })(),
      playbackDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__playback")).display,
      viewportControlsDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__viewport-controls")).display,
      resetDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-action='reset-timeline-zoom']")).display,
      zoomDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__zoom-control")).display,
      viewportControlsRight: window.__devtoolsEditorV2Harness.query(".rf__viewport-controls").getBoundingClientRect().right,
      playhead: (() => {
        const element = window.__devtoolsEditorV2Harness.query("[data-role='playhead']");
        const bounds = element.getBoundingClientRect();
        const line = getComputedStyle(element, "::after");
        const icon = getComputedStyle(element.querySelector(".rf__playhead-icon"));
        const pill = element.querySelector(".rf__playhead-progress").getBoundingClientRect();
        return {
          top: bounds.top,
          bottom: bounds.bottom,
          centerX: bounds.left + bounds.width / 2,
          lineTop: Number.parseFloat(line.top),
          lineBottom: line.bottom,
          lineWidth: line.width,
          lineColor: line.backgroundColor,
          iconDisplay: icon.display,
          pillTop: pill.top,
          pillBottom: pill.bottom,
          pillCenterX: pill.left + pill.width / 2,
        };
      })(),
      rulerTop: window.__devtoolsEditorV2Harness.query("[data-role='ruler']").getBoundingClientRect().top,
      lanesBottom: window.__devtoolsEditorV2Harness.query("[data-role='track-lanes']").getBoundingClientRect().bottom,
      edgeGeometry: [0, 0.5, 1].map((progress) => {
        window.__devtoolsEditorV2Harness.seek(progress);
        const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']").getBoundingClientRect();
        const viewport = window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']").getBoundingClientRect();
        const playhead = window.__devtoolsEditorV2Harness.query("[data-role='playhead']").getBoundingClientRect();
        const pill = window.__devtoolsEditorV2Harness.query(".rf__playhead-progress").getBoundingClientRect();
        return {
          progress,
          text: window.__devtoolsEditorV2Harness.query(".rf__playhead-progress").textContent,
          lineX: playhead.left + playhead.width / 2,
          expectedLineX: content.left + 12 + (content.width - 24) * progress,
          pillLeft: pill.left,
          pillRight: pill.right,
          viewportLeft: viewport.left,
          viewportRight: viewport.right,
        };
      }),
    };
  })()`, true);
  assert(
    customScrollState.sought
      && Math.abs(customScrollState.actual - customScrollState.expected) <= 2
      && Math.abs(customScrollState.elementScroll - customScrollState.expected) <= 2
      && customScrollState.progress >= 0.74
      && customScrollState.progress <= 0.76
      && customScrollState.nativeMarkersHidden
      && customScrollState.ownedMarkers.count === 4
      && customScrollState.ownedMarkers.types.join("|") === "end|scroller-end|scroller-start|start"
      && customScrollState.ownedMarkers.contentMotion.every((delta) => Math.abs(delta + 20) <= 1)
      && customScrollState.ownedMarkers.scrollerMotion.every((delta) => Math.abs(delta) <= 1)
      && customScrollState.ownedMarkers.countAfterToggleOff === 0
      && customScrollState.ownedMarkers.configPreserved
      && customScrollState.ownedMarkers.triggerPreserved
      && customScrollState.inspector.includes("ScrollTrigger stateActive")
      && customScrollState.inspector.includes("Raw starttop bottom")
      && customScrollState.inspector.includes("Raw endbottom top")
      && customScrollState.inspector.includes("Resolved start")
      && customScrollState.inspector.includes("Resolved end")
      && customScrollState.inspector.includes("Scroll distance")
      && customScrollState.inspector.includes("MarkersOff")
      && customScrollState.inspector.includes("Scrub0.5s")
      && customScrollState.inspector.includes("Scrollerdiv#devtools-v2-custom-scroller.devtools-v2-custom-scroller")
      && customScrollState.inspector.includes("Animation progress")
      && customScrollState.inspectorLayout.valueText.includes("section-with-an-intentionally-long-class-name")
      && customScrollState.inspectorLayout.scrollWidth <= customScrollState.inspectorLayout.clientWidth
      && customScrollState.inspectorLayout.termRight < customScrollState.inspectorLayout.valueLeft
      && customScrollState.inspectorLayout.valueRight <= customScrollState.inspectorLayout.right + 0.5
      && customScrollState.inspectorLayout.valueScrollWidth > customScrollState.inspectorLayout.valueClientWidth
      && customScrollState.inspectorLayout.valueHeight <= customScrollState.inspectorLayout.valueLineHeight + 1
      && customScrollState.inspectorLayout.valueOverflowWrap === "normal"
      && customScrollState.inspectorLayout.valueWhiteSpace === "nowrap"
      && customScrollState.inspectorLayout.valueTextOverflow === "ellipsis"
      && customScrollState.inspectorLayout.valueOverflowX === "hidden"
      && customScrollState.inspectorLayout.valueTitle === customScrollState.inspectorLayout.valueText
      && customScrollState.inspectorLayout.valueTruncated
      && customScrollState.hint.text === "Scroll the page to preview"
      && customScrollState.hint.display !== "none"
      && Math.abs(customScrollState.hint.centerX - customScrollState.hint.transportCenterX) <= 0.5
      && customScrollState.hint.right <= customScrollState.hint.viewportControlsLeft
      && customScrollState.hint.actionsRight <= customScrollState.hint.transportCenterX
      && customScrollState.actions.display === "flex"
      && !customScrollState.actions.jumpDisabled
      && !customScrollState.actions.markersDisabled
      && customScrollState.pillBounds.width > 0
      && customScrollState.pillBounds.left >= customScrollState.viewportBounds.left
      && customScrollState.pillBounds.right <= customScrollState.viewportBounds.right
      && customScrollState.endMarkerDisplay === "none"
      && customScrollState.transport.display === "grid"
      && Math.abs(customScrollState.transport.height - 48) <= 1
      && customScrollState.transport.borderBottomWidth === "1px"
      && customScrollState.transport.backgroundColor !== "rgba(0, 0, 0, 0)"
      && customScrollState.transport.columns === 3
      && customScrollState.playbackDisplay === "none"
      && customScrollState.viewportControlsDisplay === "flex"
      && customScrollState.resetDisplay === "none"
      && customScrollState.zoomDisplay === "none"
      && Math.abs(customScrollState.transport.right - customScrollState.viewportControlsRight - 10) <= 1
      && customScrollState.playhead.lineTop >= 0
      && customScrollState.playhead.lineTop
        <= customScrollState.playhead.pillBottom - customScrollState.playhead.top
      && customScrollState.playhead.lineBottom === "0px"
      && customScrollState.playhead.lineWidth === "1px"
      && customScrollState.playhead.iconDisplay === "none"
      && Math.abs(customScrollState.playhead.top - customScrollState.rulerTop) <= 1
      && customScrollState.playhead.bottom >= customScrollState.lanesBottom
      && Math.abs(customScrollState.playhead.centerX - customScrollState.playhead.pillCenterX) <= 0.5
      && customScrollState.playhead.pillTop >= customScrollState.playhead.top
      && validScrubEdgeGeometry(customScrollState.edgeGeometry),
    `The real custom-scroller ScrollTrigger inspection mode is incorrect: ${JSON.stringify(customScrollState)}`,
  );
  const elementScrollerBoundaryState = await evaluate(send, `(async () => {
    const trigger = window.__devtoolsEditorV2Harness.activeScrollTrigger;
    const scroller = document.querySelector("#devtools-v2-custom-scroller");
    const originalHeight = scroller.style.height;
    scroller.style.height = innerHeight + "px";
    trigger.refresh();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const editorTop = document.querySelector("rf-editor").getBoundingClientRect().top;
    const scrollerBounds = scroller.getBoundingClientRect();
    const markerBounds = document.querySelector(
      "[data-rf-marker-owned-type='scroller-start']",
    ).getBoundingClientRect();
    const state = {
      editorTop,
      scrollerBottom: scrollerBounds.bottom,
      markerTop: markerBounds.top,
      markerBottom: markerBounds.bottom,
    };
    scroller.style.height = originalHeight;
    trigger.refresh();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return state;
  })()`, true);
  assert(
    elementScrollerBoundaryState.scrollerBottom > elementScrollerBoundaryState.editorTop
      && Math.abs(
        elementScrollerBoundaryState.markerBottom - elementScrollerBoundaryState.scrollerBottom,
      ) <= 0.5,
    `The element-scroller start marker did not follow its live scroller boundary: ${JSON.stringify(elementScrollerBoundaryState)}`,
  );
  const scrubPillDragStart = await evaluate(send, `(() => {
    window.__devtoolsEditorV2Harness.seek(0.5);
    const playhead = window.__devtoolsEditorV2Harness.query("[data-role='playhead']").getBoundingClientRect();
    const pill = window.__devtoolsEditorV2Harness.query(".rf__playhead-progress").getBoundingClientRect();
    return {
      x: pill.left + 2,
      y: pill.top + pill.height / 2,
      outsidePlayhead: pill.left + 2 < playhead.left,
    };
  })()`);
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: scrubPillDragStart.x,
    y: scrubPillDragStart.y,
    button: "left",
    clickCount: 1,
  });
  const scrubPillDragActive = await evaluate(
    send,
    `window.__devtoolsEditorV2Harness.query("[data-role='playhead']").dataset.dragState`,
  );
  const scrubPillDragTarget = await evaluate(send, `(() => {
    const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']").getBoundingClientRect();
    return {
      x: content.left + 12 + (content.width - 24) * 0.6,
      y: ${scrubPillDragStart.y},
    };
  })()`);
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...scrubPillDragTarget,
    button: "left",
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...scrubPillDragTarget,
    button: "left",
    clickCount: 1,
  });
  const scrubPillDragFinished = await evaluate(send, `(() => ({
    dragState: window.__devtoolsEditorV2Harness.query("[data-role='playhead']").dataset.dragState,
    progress: window.__devtoolsEditorV2Harness.view.scrollTrigger?.progress,
  }))()`);
  assert(
    scrubPillDragStart.outsidePlayhead
      && scrubPillDragActive === "active"
      && scrubPillDragFinished.dragState === "idle"
      && Math.abs(scrubPillDragFinished.progress - 0.6) <= 0.01,
    `The outer ScrollTrigger progress pill edge is not draggable: ${JSON.stringify({ scrubPillDragStart, scrubPillDragActive, scrubPillDragFinished })}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.seek(1)`);
  const desktopMetrics = await evaluate(send, `({ width: innerWidth, height: innerHeight })`);
  await send("Emulation.setDeviceMetricsOverride", {
    width: desktopMetrics.width,
    height: desktopMetrics.height,
    deviceScaleFactor: 2,
    mobile: false,
  });
  const desktopDpr2State = await evaluate(send, `(() => ({
    devicePixelRatio,
    edgeGeometry: [0, 0.5, 1].map((progress) => {
      window.__devtoolsEditorV2Harness.seek(progress);
      const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']").getBoundingClientRect();
      const viewport = window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']").getBoundingClientRect();
      const playhead = window.__devtoolsEditorV2Harness.query("[data-role='playhead']").getBoundingClientRect();
      const pill = window.__devtoolsEditorV2Harness.query(".rf__playhead-progress").getBoundingClientRect();
      return {
        progress,
        text: window.__devtoolsEditorV2Harness.query(".rf__playhead-progress").textContent,
        lineX: playhead.left + playhead.width / 2,
        expectedLineX: content.left + 12 + (content.width - 24) * progress,
        pillLeft: pill.left,
        pillRight: pill.right,
        viewportLeft: viewport.left,
        viewportRight: viewport.right,
      };
    }),
  }))()`);
  assert(
    desktopDpr2State.devicePixelRatio === 2
      && validScrubEdgeGeometry(desktopDpr2State.edgeGeometry),
    `The DPR 2 desktop scrub endpoint join is incorrect: ${JSON.stringify(desktopDpr2State)}`,
  );
  await screenshot(send, scrollScrubDpr2);
  await send("Emulation.setDeviceMetricsOverride", {
    width: desktopMetrics.width,
    height: desktopMetrics.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='close-inspector']")?.click()`);
  const actionScrollState = await evaluate(send, `(() => {
    window.__devtoolsEditorV2Harness.selectTimeline("playground/v2/action-scroll");
    const trigger = window.__devtoolsEditorV2Harness.activeScrollTrigger;
    const markerConfig = trigger.vars.markers;
    const markerButton = window.__devtoolsEditorV2Harness.query(
      "[data-action='toggle-scrolltrigger-markers']",
    );
    const markerBounds = [...document.querySelectorAll("[data-rf-marker-owned]")]
      .map((marker) => {
        const rect = marker.getBoundingClientRect();
        return {
          type: marker.dataset.rfMarkerOwnedType,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      });
    markerButton.click();
    const ownedAfterToggleOff = document.querySelectorAll(
      "[data-rf-marker-owned]",
    ).length;
    const pressedAfterToggleOff = markerButton.getAttribute("aria-pressed");
    markerButton.click();
    return {
      scrubbed: window.__devtoolsEditorV2Harness.view.scrollTrigger?.scrubbed,
      canPlay: window.__devtoolsEditorV2Harness.view.transport.canPlay,
      canPause: window.__devtoolsEditorV2Harness.view.transport.canPause,
      transportDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__transport")).display,
      playbackDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__playback")).display,
      viewportControlsDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__viewport-controls")).display,
      actionsDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__transport-settings")).display,
      hintDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__transport-hint")).display,
      pillHidden: window.__devtoolsEditorV2Harness.query(".rf__playhead-progress")?.hidden,
      ruler: window.__devtoolsEditorV2Harness.query("[data-role='ruler']")?.getAttribute("aria-label"),
      ticks: [...window.__devtoolsEditorV2Harness.queryAll(".rf__tick")]
        .map((tick) => tick.textContent),
      markerButton: {
        hidden: markerButton.hidden,
        disabled: markerButton.disabled,
        pressed: markerButton.getAttribute("aria-pressed"),
        pressedAfterToggleOff,
      },
      markerBounds,
      ownedAfterToggleOff,
      markerConfigPreserved: trigger.vars.markers === markerConfig,
      triggerPreserved: window.__devtoolsEditorV2Harness.activeScrollTrigger === trigger,
      start: trigger.vars.start,
      end: trigger.vars.end,
      toggleActions: trigger.vars.toggleActions,
    };
  })()`);
  assert(
    actionScrollState.scrubbed === false
      && (actionScrollState.canPlay || actionScrollState.canPause)
      && actionScrollState.transportDisplay === "grid"
      && actionScrollState.actionsDisplay === "flex"
      && actionScrollState.playbackDisplay === "flex"
      && actionScrollState.viewportControlsDisplay === "flex"
      && actionScrollState.hintDisplay === "none"
      && actionScrollState.pillHidden
      && actionScrollState.ruler.startsWith("Timeline ruler:")
      && actionScrollState.ticks.every((tick) => !tick.endsWith("%"))
      && !actionScrollState.markerButton.hidden
      && !actionScrollState.markerButton.disabled
      && actionScrollState.markerButton.pressed === "true"
      && actionScrollState.markerButton.pressedAfterToggleOff === "false"
      && actionScrollState.markerBounds.length === 4
      && actionScrollState.markerBounds.every(({ width, height }) => width > 0 && height > 0)
      && actionScrollState.ownedAfterToggleOff === 0
      && actionScrollState.markerConfigPreserved
      && actionScrollState.triggerPreserved
      && actionScrollState.start === "top 80%"
      && actionScrollState.end === "bottom 20%"
      && actionScrollState.toggleActions === "play pause resume reverse",
    `The trigger-action ScrollTrigger did not retain time transport: ${JSON.stringify(actionScrollState)}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.selectTimeline("playground/v2/finite")`);
  assert(
    await evaluate(send, `document.querySelectorAll("[data-rf-marker-owned]").length === 0 && window.__devtoolsEditorV2Harness.query("[data-action='toggle-scrolltrigger-markers']").hidden`),
    "Trigger-action fallback markers were not cleaned up after selecting an ordinary timeline.",
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='toggle-timelines']").click()`);
  const collapsedTimelineList = await evaluate(send, `(() => ({
    visible: window.__devtoolsEditorV2Harness.query("[data-rf]").dataset.timelinesVisible,
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
  const enlargedHeight = await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-rf]").getBoundingClientRect().height`);
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
  const reducedHeight = await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-rf]").getBoundingClientRect().height`);
  assert(
    Math.abs(reducedHeight - 420) <= 1,
    `Dragging the editor border downward did not reduce it: ${reducedHeight}`,
  );
  const keyboardResize = await evaluate(send, `(() => {
    const separator = window.__devtoolsEditorV2Harness.query("[data-role='height-separator']");
    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    const normal = window.__devtoolsEditorV2Harness.query("[data-rf]").getBoundingClientRect().height;
    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true, bubbles: true }));
    const large = window.__devtoolsEditorV2Harness.query("[data-rf]").getBoundingClientRect().height;
    separator.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const reset = window.__devtoolsEditorV2Harness.query("[data-rf]").getBoundingClientRect().height;
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
  const persistedDesktopHeight = await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-rf]").getBoundingClientRect().height`);
  assert(
    persistedDesktopHeight >= 420 && persistedDesktopHeight <= 500,
    `The resized desktop height was not retained for persistence checks: ${persistedDesktopHeight}`,
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-track-key='animation:1']").click()`);
  const highlightState = await evaluate(send, `(() => {
    const target = document.querySelector("[data-rf-selected='true']");
    const overlay = document.querySelector("[data-rf-highlight]");
    const targetBounds = target?.getBoundingClientRect();
    const overlayBounds = overlay?.getBoundingClientRect();
    return {
      selectedTargets: document.querySelectorAll("[data-rf-selected='true']").length,
      overlays: document.querySelectorAll("[data-rf-highlight]").length,
      pointerEvents: getComputedStyle(document.querySelector("[data-rf-highlight-root]")).pointerEvents,
      overlayZIndex: Number(getComputedStyle(document.querySelector("[data-rf-highlight-root]")).zIndex),
      editorZIndex: Number(getComputedStyle(document.querySelector("rf-editor")).zIndex),
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
  await evaluate(send, `(() => {
    const range = window.__devtoolsEditorV2Harness.query("[data-role='zoom-range']");
    range.value = "2";
    range.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await waitFor(
    () => evaluate(send, `Number(window.__devtoolsEditorV2Harness.query("[data-role='ruler']").dataset.visibleDuration) < 12`),
    "timeline zoom before sticky-label inspection",
  );
  const inspectorState = await evaluate(send, `(() => {
    const content = window.__devtoolsEditorV2Harness.query("[data-role='inspector-content']");
    const labels = window.__devtoolsEditorV2Harness.query("[data-role='track-labels']");
    const viewport = window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']");
    const trackLabelStyle = getComputedStyle(
      window.__devtoolsEditorV2Harness.query(".rf__track-label"),
    );
    const termStyle = getComputedStyle(
      window.__devtoolsEditorV2Harness.query(".rf__inspector-term"),
    );
    const valueStyle = getComputedStyle(
      window.__devtoolsEditorV2Harness.query(".rf__inspector-value"),
    );
    const propertyTable = content.querySelector(".rf__property-table");
    const propertyTableBounds = propertyTable.getBoundingClientRect();
    const contentBounds = content.getBoundingClientRect();
    const before = labels.getBoundingClientRect();
    viewport.scrollLeft = 120;
    const after = labels.getBoundingClientRect();
    const horizontalScroll = viewport.scrollLeft;
    viewport.scrollLeft = 0;
    return {
      hidden: content.hidden,
      paneHidden: window.__devtoolsEditorV2Harness.query("[data-role='inspector']").hidden,
      text: content.textContent,
      activePane: window.__devtoolsEditorV2Harness.query("[data-rf]").dataset.activePane,
      inspectorOpen: window.__devtoolsEditorV2Harness.query("[data-rf]").dataset.inspectorOpen,
      trackHeading: window.__devtoolsEditorV2Harness.query(".rf__track-heading")?.textContent,
      hasMapping: Boolean(content.querySelector(".rf__inspector-mapping")),
      hasKey: Boolean(content.querySelector(".rf__inspector-key")),
      heading: window.__devtoolsEditorV2Harness.query("[data-role='inspector'] .rf__pane-heading-label")?.textContent,
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
      propertyCaption: propertyTable.querySelector("caption")?.textContent,
      propertyHeadings: [...propertyTable.querySelectorAll("thead th")]
        .map((heading) => heading.textContent),
      propertyRows: [...propertyTable.querySelectorAll("tbody tr")]
        .map((row) => row.textContent),
      propertyTableLeft: propertyTableBounds.left,
      propertyTableRight: propertyTableBounds.right,
      contentLeft: contentBounds.left,
      contentRight: contentBounds.right,
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
      && inspectorState.text.includes("Tween typeFromTo")
      && inspectorState.propertyCaption === "Authored property values"
      && JSON.stringify(inspectorState.propertyHeadings) === JSON.stringify(["Property", "From", "To"])
      && JSON.stringify(inspectorState.propertyRows) === JSON.stringify([
        "opacity0.21",
        "y280",
      ])
      && inspectorState.propertyTableLeft >= inspectorState.contentLeft - 0.5
      && inspectorState.propertyTableRight <= inspectorState.contentRight + 0.5
      && !inspectorState.hasMapping
      && !inspectorState.hasKey
      && inspectorState.heading === "Inspector"
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
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='reset-timeline-zoom']").click()`);
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
    await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-role='inspector']").hidden && window.__devtoolsEditorV2Harness.query("[data-rf]").dataset.inspectorOpen === "false" && window.__devtoolsEditorV2Harness.view.selectedTrackKey === undefined && document.querySelectorAll("[data-rf-selected='true']").length === 0 && window.__devtoolsEditorV2Harness.query("[data-track-key='animation:1']").getAttribute("aria-pressed") === "false"`),
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
      const target = document.querySelector("[data-rf-selected='true']")?.getBoundingClientRect();
      const overlay = document.querySelector("[data-rf-highlight]")?.getBoundingClientRect();
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
    const lanes = window.__devtoolsEditorV2Harness.queryAll(".rf__track-lane");
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
    const sourceLane = lanes.querySelector(".rf__track-lane");
    const clones = Array.from({ length: 18 }, () => {
      const clone = sourceLane.cloneNode(true);
      clone.dataset.verticalScrollFixture = "";
      lanes.append(clone);
      return clone;
    });
    const ruler = window.__devtoolsEditorV2Harness.query("[data-role='ruler']");
    const playhead = window.__devtoolsEditorV2Harness.query("[data-role='playhead']");
    const icon = playhead.querySelector(".rf__playhead-icon");
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
    await evaluate(send, `window.__devtoolsEditorV2Harness.view.selectedTrackKey === "animation:1" && window.__devtoolsEditorV2Harness.view.inspector?.trackKey === "animation:1" && window.__devtoolsEditorV2Harness.query("[data-rf]").dataset.inspectorOpen === "true" && !window.__devtoolsEditorV2Harness.query("[data-role='inspector-content']").hidden`),
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
    const lanes = window.__devtoolsEditorV2Harness.queryAll(".rf__track-lane");
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
    () => evaluate(send, `window.__devtoolsEditorV2Harness.view.time?.duration === 16 && [...window.__devtoolsEditorV2Harness.queryAll(".rf__tick")].at(-1)?.textContent === "16s"`),
    "the expanded sixteen-second inspection window",
  );
  const longTimelineState = await evaluate(send, `(() => {
    const viewport = window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']");
    const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']");
    const ticks = [...window.__devtoolsEditorV2Harness.queryAll(".rf__tick")];
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
    () => evaluate(send, `window.__devtoolsEditorV2Harness.queryAll(".rf__track-block").length === 1 && window.__devtoolsEditorV2Harness.query("[data-role='duration']").textContent === "00:05.000" && [...window.__devtoolsEditorV2Harness.queryAll(".rf__tick")].at(-1)?.textContent === "12s"`),
    "the finite particle window",
  );
  const particleZeroState = await evaluate(send, `(() => {
    const tick = window.__devtoolsEditorV2Harness.query(".rf__tick[data-edge='start']").getBoundingClientRect();
    const icon = window.__devtoolsEditorV2Harness.query("[data-role='playhead'] .rf__playhead-icon").getBoundingClientRect();
    const marker = window.__devtoolsEditorV2Harness.query("[data-role='timeline-end-marker']");
    const postDuration = window.__devtoolsEditorV2Harness.query("[data-role='post-duration']");
    const block = window.__devtoolsEditorV2Harness.query(".rf__track-block").getBoundingClientRect();
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
    const editorBounds = window.__devtoolsEditorV2Harness.query("[data-rf]").getBoundingClientRect();
    const timelineBounds = window.__devtoolsEditorV2Harness.query(".rf__timeline").getBoundingClientRect();
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
  const particleTiming = await evaluate(send, `(() => {
    const inspectorContent = window.__devtoolsEditorV2Harness.query("[data-role='inspector-content']");
    const angleRow = [...inspectorContent.querySelectorAll(".rf__property-table tbody tr")]
      .find((row) => row.querySelector("th")?.textContent === "angle");
    const angleTo = angleRow?.querySelectorAll("td")[1];
    const angleToStyle = angleTo ? getComputedStyle(angleTo) : undefined;
    return {
      sourceDuration: window.__devtoolsEditorV2Harness.view.time.sourceDuration,
      spans: window.__devtoolsEditorV2Harness.view.tracks[0].spans,
      inspector: window.__devtoolsEditorV2Harness.view.inspector,
      inspectorText: inspectorContent.textContent,
      angleToText: angleTo?.textContent,
      angleToTitle: angleTo?.title,
      angleToOverflow: angleToStyle?.overflowX,
      angleToOverflowWrap: angleToStyle?.overflowWrap,
      angleToTextOverflow: angleToStyle?.textOverflow,
      angleToWhiteSpace: angleToStyle?.whiteSpace,
    };
  })()`);
  assert(
    await evaluate(send, `document.querySelector("#devtools-v2-canvas").getAttribute("data-rf-selected") === "true"`)
      && particleTiming.sourceDuration === 5
      && particleTiming.spans.length === 1
      && particleTiming.spans[0].start === 0
      && Math.abs(particleTiming.spans[0].end - 5 / 12) < 0.000001
      && particleTiming.inspector.start === 0
      && particleTiming.inspector.duration === 5
      && particleTiming.inspector.end === 5
      && particleTiming.inspectorText.includes("5.00s")
      && particleTiming.angleToText === '"+=6.28"'
      && particleTiming.angleToTitle === '"+=6.283185307179586"'
      && particleTiming.angleToOverflow === "hidden"
      && particleTiming.angleToOverflowWrap === "normal"
      && particleTiming.angleToTextOverflow === "ellipsis"
      && particleTiming.angleToWhiteSpace === "nowrap"
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
      blocks: window.__devtoolsEditorV2Harness.queryAll(".rf__track-block").length,
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
      const icon = window.__devtoolsEditorV2Harness.query("[data-role='playhead'] .rf__playhead-icon").getBoundingClientRect();
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
    () => evaluate(send, `Math.abs(window.__devtoolsEditorV2Harness.query("[data-rf]").getBoundingClientRect().height - ${expectedNarrowHeight}) <= 2`),
    "the persisted editor ratio to adapt to the narrow viewport",
  );
  const narrowState = await evaluate(send, `(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    activePane: window.__devtoolsEditorV2Harness.query("[data-rf]").dataset.activePane,
    selectedTab: window.__devtoolsEditorV2Harness.query("[data-pane-target][aria-selected='true']")?.dataset.paneTarget,
    visiblePanes: [...window.__devtoolsEditorV2Harness.queryAll("[data-pane]")].filter((pane) => getComputedStyle(pane).display !== "none").map((pane) => pane.dataset.pane),
    timelineHeight: window.__devtoolsEditorV2Harness.query(".rf__timeline").getBoundingClientRect().height,
    inspectorHidden: window.__devtoolsEditorV2Harness.query("[data-role='inspector']").hidden,
    inspectorDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-role='inspector']")).display,
    inspectorTab: Boolean(window.__devtoolsEditorV2Harness.query("[data-pane-target='inspector']")),
    editorHeight: window.__devtoolsEditorV2Harness.query("[data-rf]").getBoundingClientRect().height,
    editorTop: window.__devtoolsEditorV2Harness.query("[data-rf]").getBoundingClientRect().top,
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
    activePane: window.__devtoolsEditorV2Harness.query("[data-rf]").dataset.activePane,
    visiblePanes: [...window.__devtoolsEditorV2Harness.queryAll("[data-pane]")].filter((pane) => getComputedStyle(pane).display !== "none").map((pane) => pane.dataset.pane),
    inspectorHidden: window.__devtoolsEditorV2Harness.query("[data-role='inspector']").hidden,
    selectedTrackKey: window.__devtoolsEditorV2Harness.view.selectedTrackKey,
    highlightedTargets: document.querySelectorAll("[data-rf-selected='true']").length,
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
  const narrowStandardMinimalState = await evaluate(send, `(() => {
    const toggle = window.__devtoolsEditorV2Harness.query("[data-action='toggle-timeline-visibility']");
    toggle.click();
    const root = window.__devtoolsEditorV2Harness.query("[data-rf]");
    const timeline = window.__devtoolsEditorV2Harness.query("[data-pane='timeline']");
    const transport = window.__devtoolsEditorV2Harness.query(".rf__transport");
    const viewport = window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']");
    const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']");
    const playhead = window.__devtoolsEditorV2Harness.query("[data-role='playhead']");
    const playheadIcon = window.__devtoolsEditorV2Harness.query(".rf__playhead-icon");
    const contentBounds = content.getBoundingClientRect();
    const playheadBounds = playhead.getBoundingClientRect();
    const playheadIconBounds = playheadIcon.getBoundingClientRect();
    return {
      rootHeight: root.getBoundingClientRect().height,
      hostHeight: document.querySelector("rf-editor").getBoundingClientRect().height,
      timelineHeight: timeline.getBoundingClientRect().height,
      transportHeight: transport.getBoundingClientRect().height,
      viewportHeight: viewport.getBoundingClientRect().height,
      documentWidth: document.documentElement.scrollWidth,
      rootWidth: root.getBoundingClientRect().width,
      playbackDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__playback")).display,
      playheadIconDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__playhead-icon")).display,
      progressPillDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__playhead-progress")).display,
      zoomDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__zoom-control")).display,
      resetDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-action='reset-timeline-zoom']")).display,
      progressPosition: content.style.getPropertyValue("--rf-progress-position"),
      progressPercentage: Number.parseFloat(
        content.style.getPropertyValue("--rf-progress-position").slice(5),
      ),
      playheadRightInset: contentBounds.right
        - (playheadBounds.left + playheadBounds.width / 2),
      playheadIconRightInset: contentBounds.right - playheadIconBounds.right,
      label: toggle.getAttribute("aria-label"),
    };
  })()`);
  assert(
    Math.abs(narrowStandardMinimalState.rootHeight - 102) <= 1
      && Math.abs(narrowStandardMinimalState.hostHeight - 102) <= 1
      && Math.abs(narrowStandardMinimalState.timelineHeight - 102) <= 1
      && Math.abs(narrowStandardMinimalState.transportHeight - 82) <= 1
      && Math.abs(narrowStandardMinimalState.viewportHeight - 20) <= 1
      && narrowStandardMinimalState.documentWidth <= 640
      && narrowStandardMinimalState.rootWidth <= 640
      && narrowStandardMinimalState.playbackDisplay !== "none"
      && narrowStandardMinimalState.playheadIconDisplay === "block"
      && narrowStandardMinimalState.progressPillDisplay === "none"
      && narrowStandardMinimalState.zoomDisplay === "none"
      && narrowStandardMinimalState.resetDisplay === "none"
      && narrowStandardMinimalState.progressPercentage >= 99.9
      && Math.abs(narrowStandardMinimalState.playheadRightInset - 16) <= 0.5
      && Math.abs(narrowStandardMinimalState.playheadIconRightInset - 10) <= 0.5
      && narrowStandardMinimalState.label === "Show timeline",
    `The narrow standard minimal layout overflowed or hid playback: ${JSON.stringify(narrowStandardMinimalState)}`,
  );
  await screenshot(send, standardMinimalNarrow);
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='toggle-timeline-visibility']").click()`);
  await evaluate(send, `new Promise((resolve) => setTimeout(resolve, 160))`);
  assert(
    Math.abs(await evaluate(send, `document.querySelector("rf-editor").getBoundingClientRect().height`) - expectedNarrowHeight) <= 2,
    "Expanding the narrow standard timeline did not restore its persisted height.",
  );
  const narrowScrollState = await evaluate(send, `(() => {
    window.__devtoolsEditorV2Harness.selectTimeline("playground/v2/custom-scroll");
    const root = window.__devtoolsEditorV2Harness.query("[data-rf]").getBoundingClientRect();
    const timeline = window.__devtoolsEditorV2Harness.query("[data-pane='timeline']").getBoundingClientRect();
    return {
      documentWidth: document.documentElement.scrollWidth,
      rootWidth: root.width,
      rootLeft: root.left,
      rootRight: root.right,
      timelineWidth: timeline.width,
      transportDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__transport")).display,
      transportHeight: window.__devtoolsEditorV2Harness.query(".rf__transport").getBoundingClientRect().height,
      transportColumns: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__transport")).gridTemplateColumns.split(" ").length,
      playbackDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__playback")).display,
      viewportControlsDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__viewport-controls")).display,
      actionsDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__transport-settings")).display,
      jumpDisabled: window.__devtoolsEditorV2Harness.query("[data-action='jump-to-scrolltrigger-target']").disabled,
      markersDisabled: window.__devtoolsEditorV2Harness.query("[data-action='toggle-scrolltrigger-markers']").disabled,
      resetDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query("[data-action='reset-timeline-zoom']")).display,
      zoomDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__zoom-control")).display,
      hint: (() => {
        const transport = window.__devtoolsEditorV2Harness.query(".rf__transport").getBoundingClientRect();
        const hint = window.__devtoolsEditorV2Harness.query(".rf__transport-hint");
        const bounds = hint.getBoundingClientRect();
        const viewport = window.__devtoolsEditorV2Harness
          .query(".rf__viewport-controls").getBoundingClientRect();
        return {
          display: getComputedStyle(hint).display,
          text: hint.textContent,
          centerX: bounds.left + bounds.width / 2,
          transportCenterX: transport.left + transport.width / 2,
          right: bounds.right,
          viewportLeft: viewport.left,
        };
      })(),
      pillHidden: window.__devtoolsEditorV2Harness.query(".rf__playhead-progress").hidden,
      mode: window.__devtoolsEditorV2Harness.query("[data-pane='timeline']").dataset.timelineMode,
      pillBounds: (() => {
        const bounds = window.__devtoolsEditorV2Harness.query(".rf__playhead-progress").getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, width: bounds.width };
      })(),
      viewportBounds: (() => {
        const bounds = window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']").getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, width: bounds.width };
      })(),
      edgeGeometry: [0, 0.5, 1].map((progress) => {
        window.__devtoolsEditorV2Harness.seek(progress);
        const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']").getBoundingClientRect();
        const viewport = window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']").getBoundingClientRect();
        const playhead = window.__devtoolsEditorV2Harness.query("[data-role='playhead']").getBoundingClientRect();
        const pill = window.__devtoolsEditorV2Harness.query(".rf__playhead-progress").getBoundingClientRect();
        return {
          progress,
          text: window.__devtoolsEditorV2Harness.query(".rf__playhead-progress").textContent,
          lineX: playhead.left + playhead.width / 2,
          expectedLineX: content.left + 12 + (content.width - 24) * progress,
          pillLeft: pill.left,
          pillRight: pill.right,
          viewportLeft: viewport.left,
          viewportRight: viewport.right,
        };
      }),
    };
  })()`);
  assert(
    narrowScrollState.documentWidth <= 640
      && narrowScrollState.rootWidth <= 640
      && narrowScrollState.timelineWidth <= narrowScrollState.rootWidth
      && narrowScrollState.transportDisplay === "grid"
      && Math.abs(narrowScrollState.transportHeight - 48) <= 1
      && narrowScrollState.transportColumns === 3
      && narrowScrollState.playbackDisplay === "none"
      && narrowScrollState.viewportControlsDisplay === "flex"
      && narrowScrollState.actionsDisplay === "flex"
      && !narrowScrollState.jumpDisabled
      && !narrowScrollState.markersDisabled
      && narrowScrollState.resetDisplay === "none"
      && narrowScrollState.zoomDisplay === "none"
      && narrowScrollState.hint.display !== "none"
      && narrowScrollState.hint.text === "Scroll the page to preview"
      && Math.abs(narrowScrollState.hint.centerX - narrowScrollState.hint.transportCenterX) <= 0.5
      && narrowScrollState.hint.right <= narrowScrollState.hint.viewportLeft
      && !narrowScrollState.pillHidden
      && narrowScrollState.mode === "scroll-scrub"
      && narrowScrollState.pillBounds.width > 0
      && narrowScrollState.pillBounds.left >= narrowScrollState.viewportBounds.left
      && narrowScrollState.pillBounds.right <= narrowScrollState.viewportBounds.right
      && validScrubEdgeGeometry(narrowScrollState.edgeGeometry),
    `The narrow ScrollTrigger inspection layout overflowed or exposed time transport: ${JSON.stringify(narrowScrollState)}`,
  );
  const narrowInspectorState = await evaluate(send, `(() => {
    window.__devtoolsEditorV2Harness.query("[data-track-key]")?.click();
    const inspector = window.__devtoolsEditorV2Harness.query("[data-role='inspector-content']");
    const field = [...inspector.querySelectorAll(".rf__inspector-field")]
      .find((candidate) => candidate.querySelector("dt")?.textContent === "Trigger");
    const term = field.querySelector(".rf__inspector-term");
    const value = field.querySelector(".rf__inspector-value");
    const inspectorBounds = inspector.getBoundingClientRect();
    const termBounds = term.getBoundingClientRect();
    const valueBounds = value.getBoundingClientRect();
    const valueStyle = getComputedStyle(value);
    const state = {
      clientWidth: inspector.clientWidth,
      scrollWidth: inspector.scrollWidth,
      inspectorRight: inspectorBounds.right,
      termText: term.textContent,
      termRight: termBounds.right,
      valueText: value.textContent,
      valueLeft: valueBounds.left,
      valueRight: valueBounds.right,
      valueHeight: valueBounds.height,
      lineHeight: Number.parseFloat(valueStyle.lineHeight),
      valueClientWidth: value.clientWidth,
      valueScrollWidth: value.scrollWidth,
      valueTitle: value.title,
      valueWhiteSpace: valueStyle.whiteSpace,
      valueTextOverflow: valueStyle.textOverflow,
      valueOverflowX: valueStyle.overflowX,
      valueTruncated: value.classList.contains("rf__inspector-value--truncate"),
    };
    window.__devtoolsEditorV2Harness.query("[data-action='close-inspector']").click();
    return {
      ...state,
      timelineRestored: getComputedStyle(
        window.__devtoolsEditorV2Harness.query("[data-pane='timeline']"),
      ).display !== "none",
    };
  })()`);
  assert(
    narrowInspectorState.termText === "Trigger"
      && narrowInspectorState.valueText.includes("section-with-an-intentionally-long-class-name")
      && narrowInspectorState.scrollWidth <= narrowInspectorState.clientWidth
      && narrowInspectorState.termRight < narrowInspectorState.valueLeft
      && narrowInspectorState.valueRight <= narrowInspectorState.inspectorRight + 0.5
      && narrowInspectorState.valueScrollWidth > narrowInspectorState.valueClientWidth
      && narrowInspectorState.valueHeight <= narrowInspectorState.lineHeight + 1
      && narrowInspectorState.valueTitle === narrowInspectorState.valueText
      && narrowInspectorState.valueWhiteSpace === "nowrap"
      && narrowInspectorState.valueTextOverflow === "ellipsis"
      && narrowInspectorState.valueOverflowX === "hidden"
      && narrowInspectorState.valueTruncated
      && narrowInspectorState.timelineRestored,
    `The narrow Inspector did not wrap the long selector safely: ${JSON.stringify(narrowInspectorState)}`,
  );
  await screenshot(send, scrollScrubNarrow);
  const narrowScrollExpandedHeight = await evaluate(send, `document.querySelector("rf-editor").getBoundingClientRect().height`);
  const narrowScrollMinimalState = await evaluate(send, `(() => {
    const toggle = window.__devtoolsEditorV2Harness.query("[data-action='toggle-timeline-visibility']");
    toggle.click();
    const root = window.__devtoolsEditorV2Harness.query("[data-rf]");
    const transport = window.__devtoolsEditorV2Harness.query(".rf__transport");
    const viewport = window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']");
    return {
      rootHeight: root.getBoundingClientRect().height,
      hostHeight: document.querySelector("rf-editor").getBoundingClientRect().height,
      transportHeight: transport.getBoundingClientRect().height,
      viewportHeight: viewport.getBoundingClientRect().height,
      documentWidth: document.documentElement.scrollWidth,
      playbackDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__playback")).display,
      actionsDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__transport-settings")).display,
      hintDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__transport-hint")).display,
      progressPillDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__playhead-progress")).display,
      zoomDisplay: getComputedStyle(window.__devtoolsEditorV2Harness.query(".rf__zoom-control")).display,
      label: toggle.getAttribute("aria-label"),
    };
  })()`);
  assert(
    Math.abs(narrowScrollMinimalState.rootHeight - 75) <= 1
      && Math.abs(narrowScrollMinimalState.hostHeight - 75) <= 1
      && Math.abs(narrowScrollMinimalState.transportHeight - 48) <= 1
      && Math.abs(narrowScrollMinimalState.viewportHeight - 20) <= 1
      && narrowScrollMinimalState.documentWidth <= 640
      && narrowScrollMinimalState.playbackDisplay === "none"
      && narrowScrollMinimalState.actionsDisplay === "flex"
      && narrowScrollMinimalState.hintDisplay !== "none"
      && narrowScrollMinimalState.progressPillDisplay === "flex"
      && narrowScrollMinimalState.zoomDisplay === "none"
      && narrowScrollMinimalState.label === "Show timeline",
    `The narrow ScrollTrigger minimal layout overflowed or lost its hint: ${JSON.stringify(narrowScrollMinimalState)}`,
  );
  await screenshot(send, scrollScrubMinimalNarrow);
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-action='toggle-timeline-visibility']").click()`);
  await evaluate(send, `new Promise((resolve) => setTimeout(resolve, 160))`);
  assert(
    Math.abs(await evaluate(send, `document.querySelector("rf-editor").getBoundingClientRect().height`) - narrowScrollExpandedHeight) <= 2,
    "Expanding the narrow ScrollTrigger timeline did not restore its height.",
  );
  await send("Emulation.setDeviceMetricsOverride", {
    width: 640,
    height: 820,
    deviceScaleFactor: 2,
    mobile: false,
  });
  const narrowDpr2State = await evaluate(send, `(() => ({
    devicePixelRatio,
    edgeGeometry: [0, 0.5, 1].map((progress) => {
      window.__devtoolsEditorV2Harness.seek(progress);
      const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']").getBoundingClientRect();
      const viewport = window.__devtoolsEditorV2Harness.query("[data-role='timeline-viewport']").getBoundingClientRect();
      const playhead = window.__devtoolsEditorV2Harness.query("[data-role='playhead']").getBoundingClientRect();
      const pill = window.__devtoolsEditorV2Harness.query(".rf__playhead-progress").getBoundingClientRect();
      return {
        progress,
        text: window.__devtoolsEditorV2Harness.query(".rf__playhead-progress").textContent,
        lineX: playhead.left + playhead.width / 2,
        expectedLineX: content.left + 12 + (content.width - 24) * progress,
        pillLeft: pill.left,
        pillRight: pill.right,
        viewportLeft: viewport.left,
        viewportRight: viewport.right,
      };
    }),
  }))()`);
  assert(
    narrowDpr2State.devicePixelRatio === 2
      && validScrubEdgeGeometry(narrowDpr2State.edgeGeometry),
    `The DPR 2 narrow scrub endpoint join is incorrect: ${JSON.stringify(narrowDpr2State)}`,
  );
  await screenshot(send, scrollScrubNarrowDpr2);
  await send("Emulation.setDeviceMetricsOverride", {
    width: 640,
    height: 820,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(send, `window.__devtoolsEditorV2Harness.selectTimeline("playground/v2/particles")`);
  await evaluate(send, `window.__devtoolsEditorV2Harness.query("[data-track-key='track:particles']").click()`);
  await screenshot(send, narrow);

  await evaluate(send, `window.__devtoolsEditorV2Harness.selectTimeline("playground/v2/custom-scroll")`);
  const ownedMarkersBeforeEditorDestroy = await evaluate(send, `document.querySelectorAll("[data-rf-marker-owned]").length`);
  const nativeMarkersBeforeEditorDestroy = await evaluate(send, `document.querySelectorAll(".gsap-marker-start, .gsap-marker-end, .gsap-marker-scroller-start, .gsap-marker-scroller-end").length`);
  await evaluate(send, `window.__devtoolsEditorV2Harness.destroy()`);
  assert(
    await evaluate(send, `(() => {
      const markers = [...document.querySelectorAll(".gsap-marker-start, .gsap-marker-end, .gsap-marker-scroller-start, .gsap-marker-scroller-end")];
      return document.querySelectorAll("rf-editor").length === 0
        && document.querySelectorAll("[data-rf-highlight-root]").length === 0
        && ${ownedMarkersBeforeEditorDestroy} === 4
        && document.querySelectorAll("[data-rf-marker-owned]").length === 0
        && markers.length === ${nativeMarkersBeforeEditorDestroy}
        && markers.every((marker) => getComputedStyle(marker).display !== "none")
        && markers.every((marker) => marker.textContent.endsWith("Window scrub"))
        && document.querySelector("#devtools-v2-finite").parentElement?.id === "devtools-v2-sources"
        && document.querySelector("#devtools-v2-finite").nextElementSibling?.id === "devtools-v2-particles";
    })()`),
    "Destroying the editor removed or moved application roots.",
  );
  await evaluate(send, `window.__devtoolsEditorV2Harness.remount()`);
  await waitFor(
    () => evaluate(send, `window.__devtoolsEditorV2Harness.queryAll("[data-rf]").length === 1`),
    "editor destroy and remount",
  );
  const remountedResizeState = await evaluate(send, `(() => ({
    height: window.__devtoolsEditorV2Harness.query("[data-rf]").getBoundingClientRect().height,
    resizeState: window.__devtoolsEditorV2Harness.query("[data-role='height-separator']").dataset.resizeState,
    valueNow: window.__devtoolsEditorV2Harness.query("[data-role='height-separator']").getAttribute("aria-valuenow"),
  }))()`);
  assert(
    Math.abs(remountedResizeState.height - expectedNarrowHeight) <= 2
      && remountedResizeState.resizeState === "idle"
      && Math.abs(Number(remountedResizeState.valueNow) - remountedResizeState.height) <= 1
      && await evaluate(send, `(() => {
        const markers = [...document.querySelectorAll(".gsap-marker-start, .gsap-marker-end, .gsap-marker-scroller-start, .gsap-marker-scroller-end")];
        return markers.length === ${nativeMarkersBeforeEditorDestroy}
          && markers.every((marker) => getComputedStyle(marker).display === "none");
      })()`),
    `The editor height ratio or resize lifecycle did not survive remount: ${JSON.stringify(remountedResizeState)}`,
  );

  console.log(JSON.stringify({
    status: "pass",
    checks: [
      "timeline-selection",
      "scrolltrigger-window-scrub-seek",
      "scrolltrigger-native-marker-ownership",
      "scrolltrigger-owned-marker-fallback",
      "scrolltrigger-custom-scroller-seek",
      "scrolltrigger-numeric-smoothing-diagnostics",
      "scrolltrigger-trigger-action-time-transport",
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
      "scrolltrigger-narrow-layout",
      "scrolltrigger-endpoint-join-dpr2",
      "timeline-minimal-desktop-scrolltrigger",
      "timeline-minimal-narrow-standard",
      "timeline-minimal-narrow-scrolltrigger",
      "timeline-minimal-height-restoration",
      "mobile-track-triggered-inspector",
      "inspector-close",
      "inspector-close-clears-selection",
      "destroy-remount",
    ],
    screenshots: [
      "artifacts/visual/devtools-editor-v2-desktop.png",
      "artifacts/visual/devtools-editor-v2-particles.png",
      "artifacts/visual/devtools-editor-v2-narrow.png",
      "artifacts/visual/devtools-editor-v2-scroll-scrub.png",
      "artifacts/visual/devtools-editor-v2-scroll-scrub-narrow.png",
      "artifacts/visual/devtools-editor-v2-scroll-scrub-dpr2.png",
      "artifacts/visual/devtools-editor-v2-scroll-scrub-narrow-dpr2.png",
      "artifacts/visual/devtools-editor-v2-scroll-scrub-minimal.png",
      "artifacts/visual/devtools-editor-v2-standard-minimal-narrow.png",
      "artifacts/visual/devtools-editor-v2-scroll-scrub-minimal-narrow.png",
    ],
  }));
}

try {
  await runVisualHarness(
    { pagePath: "/index.html", profilePrefix: "motion-lab-editor-v2-" },
    verify,
  );
} catch (error) {
  reportVisualFailure(error);
}
