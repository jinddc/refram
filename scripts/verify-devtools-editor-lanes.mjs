import { join } from "node:path";

import {
  assert,
  evaluate,
  reportVisualFailure,
  runVisualHarness,
  screenshot,
  waitFor,
} from "./visual-harness.mjs";

function readLaneState(send) {
  return evaluate(send, `(() => {
    const lanes = window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__track-lane");
    const block = window.__devtoolsEditorV2Harness.query(".devtools-editor__track-block");
    const lane = lanes[0];
    const alternateLane = lanes[1];
    const label = window.__devtoolsEditorV2Harness.query(".devtools-editor__track-label");
    const content = window.__devtoolsEditorV2Harness.query("[data-role='timeline-content']");
    const editor = window.__devtoolsEditorV2Harness.query("[data-devtools-editor]");
    const marks = window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__ruler-mark");
    const laneBounds = lane.getBoundingClientRect();
    const blockBounds = block.getBoundingClientRect();
    const contentBounds = content.getBoundingClientRect();
    const firstMarkBounds = marks[0].getBoundingClientRect();
    const lastMarkBounds = marks[marks.length - 1].getBoundingClientRect();
    const span = window.__devtoolsEditorV2Harness.view.tracks[0].spans[0];
    const laneStyle = getComputedStyle(lane);
    const alternateLaneStyle = getComputedStyle(alternateLane);
    const labelStyle = getComputedStyle(label);
    const blockStyle = getComputedStyle(block);
    return {
      laneBackground: laneStyle.backgroundColor,
      laneShadow: laneStyle.boxShadow,
      alternateLaneBackground: alternateLaneStyle.backgroundColor,
      labelBackground: labelStyle.backgroundColor,
      labelColor: labelStyle.color,
      laneDivider: laneStyle.borderBottomColor,
      laneHeight: laneBounds.height,
      blockBackground: blockStyle.backgroundColor,
      blockBorderWidth: blockStyle.borderWidth,
      blockColor: blockStyle.color,
      blockRadius: blockStyle.borderRadius,
      blockShadow: blockStyle.boxShadow,
      blockHeight: blockBounds.height,
      blockTopOffset: blockBounds.top - laneBounds.top,
      laneRadius: laneStyle.borderRadius,
      laneLeftInset: laneBounds.left - contentBounds.left,
      laneRightInset: contentBounds.right - laneBounds.right,
      laneStartDelta: laneBounds.left - firstMarkBounds.left,
      laneEndDelta: laneBounds.right - lastMarkBounds.left,
      blockStartDelta: blockBounds.left - (
        laneBounds.left + span.start * laneBounds.width
      ),
      blockEndDelta: blockBounds.right - (
        laneBounds.left + span.end * laneBounds.width
      ),
      selected: block.dataset.selected,
      theme: document.querySelector("motion-devtools-editor").dataset.theme,
      editorBackground: getComputedStyle(editor).backgroundColor,
    };
  })()`);
}

async function verify({ artifactDirectory, send }) {
  const dark = join(artifactDirectory, "devtools-editor-lanes-dark.png");
  const darkSelected = join(
    artifactDirectory,
    "devtools-editor-lanes-dark-selected.png",
  );
  const lightSelected = join(
    artifactDirectory,
    "devtools-editor-lanes-light-selected.png",
  );

  await waitFor(
    () => evaluate(
      send,
      `Boolean(window.__devtoolsEditorV2Harness)
        && window.__devtoolsEditorV2Harness.queryAll(".devtools-editor__track-block").length === 3`,
    ),
    "the DevTools editor lanes",
  );

  const typographyState = await evaluate(send, `(() => {
    const nodes = Array.from(window.__devtoolsEditorV2Harness.queryAll(
      "[data-devtools-editor], [data-devtools-editor] *",
    ));
    const styles = nodes.map((node) => getComputedStyle(node));
    return {
      fontSizes: [...new Set(styles.map((style) => style.fontSize))],
      lineHeights: [...new Set(styles.map((style) => style.lineHeight))],
      fontFamilies: [...new Set(styles.map((style) => style.fontFamily))],
    };
  })()`);
  assert(
    typographyState.fontSizes.includes("12px")
      && typographyState.fontSizes.includes("10px")
      && typographyState.fontSizes.length === 2
      && typographyState.lineHeights.includes("17.4px")
      && typographyState.lineHeights.includes("14.5px")
      && typographyState.fontFamilies.some((family) => family.includes('"SF Pro Text"'))
      && typographyState.fontFamilies.some((family) => family.includes("monospace")),
    `Editor typography hierarchy is incorrect: ${JSON.stringify(typographyState)}`,
  );

  const darkState = await readLaneState(send);
  assert(
    darkState.theme === "dark"
      && darkState.laneBackground === "rgba(255, 255, 255, 0.03)"
      && darkState.laneShadow === "none"
      && darkState.alternateLaneBackground === "rgba(255, 255, 255, 0.03)"
      && darkState.labelBackground === "rgba(0, 0, 0, 0)"
      && darkState.blockBackground === "rgb(55, 57, 60)"
      && darkState.blockBorderWidth === "0px"
      && darkState.blockColor === "rgb(216, 221, 226)"
      && darkState.blockRadius === "6px"
      && darkState.blockShadow === "none"
      && darkState.laneHeight === 24
      && darkState.blockHeight === 24
      && darkState.blockTopOffset === 0
      && darkState.laneRadius === "6px"
      && darkState.laneLeftInset === 12
      && darkState.laneRightInset === 12
      && Math.abs(darkState.laneStartDelta) <= 0.5
      && Math.abs(darkState.laneEndDelta) <= 0.5
      && Math.abs(darkState.blockStartDelta) <= 0.5
      && Math.abs(darkState.blockEndDelta) <= 0.5,
    `Dark lane styling does not match the compact neutral treatment: ${JSON.stringify(darkState)}`,
  );
  await screenshot(send, dark);

  const blockCenter = await evaluate(send, `(() => {
    const bounds = window.__devtoolsEditorV2Harness
      .query(".devtools-editor__track-block")
      .getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  })()`);
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: blockCenter.x,
    y: blockCenter.y,
  });
  const hoverState = await readLaneState(send);
  assert(
    hoverState.blockBackground === "color(srgb 0.291451 0.300706 0.313412)"
      && hoverState.blockBorderWidth === "0px",
    `Dark lane hover is not a restrained neutral state: ${JSON.stringify(hoverState)}`,
  );

  await evaluate(
    send,
    `window.__devtoolsEditorV2Harness.query(".devtools-editor__track-block").click()`,
  );
  const darkSelectedState = await readLaneState(send);
  assert(
    darkSelectedState.selected === "true"
      && darkSelectedState.laneBackground === "rgba(255, 255, 255, 0.03)"
      && darkSelectedState.labelBackground === "rgba(0, 0, 0, 0)"
      && darkSelectedState.labelColor === "rgb(85, 173, 255)"
      && darkSelectedState.laneShadow === "none"
      && darkSelectedState.blockBackground === "color(srgb 0.367216 0.377882 0.391529)"
      && darkSelectedState.blockBorderWidth === "0px"
      && darkSelectedState.blockColor === "rgb(216, 221, 226)"
      && darkSelectedState.blockShadow === "none",
    `Dark lane selection is not a restrained neutral state: ${JSON.stringify(darkSelectedState)}`,
  );
  await screenshot(send, darkSelected);

  const focusState = await evaluate(send, `(() => {
    const block = window.__devtoolsEditorV2Harness.query(".devtools-editor__track-block");
    block.focus({ focusVisible: true });
    const style = getComputedStyle(block);
    return { outlineColor: style.outlineColor, outlineWidth: style.outlineWidth };
  })()`);
  assert(
    focusState.outlineColor === "rgb(85, 173, 255)"
      && focusState.outlineWidth === "2px",
    `Keyboard focus is not visibly distinct from neutral lane states: ${JSON.stringify(focusState)}`,
  );

  await evaluate(
    send,
    `document.querySelector("motion-devtools-editor").setAttribute("theme", "light")`,
  );
  const lightSelectedState = await readLaneState(send);
  assert(
    lightSelectedState.theme === "light"
      && lightSelectedState.laneBackground === "rgb(243, 244, 245)"
      && lightSelectedState.alternateLaneBackground === "rgb(243, 244, 245)"
      && lightSelectedState.labelBackground === "rgba(0, 0, 0, 0)"
      && lightSelectedState.labelColor === "rgb(8, 123, 138)"
      && lightSelectedState.laneShadow === "none"
      && lightSelectedState.blockBackground === "color(srgb 0.559843 0.586039 0.607529)"
      && lightSelectedState.blockBorderWidth === "0px"
      && lightSelectedState.blockColor === "rgb(47, 59, 66)"
      && lightSelectedState.blockRadius === "6px"
      && lightSelectedState.laneRadius === "6px"
      && lightSelectedState.blockShadow === "none",
    `Light lane styling is not a deliberate neutral counterpart: ${JSON.stringify(lightSelectedState)}`,
  );
  await screenshot(send, lightSelected);

  console.log(JSON.stringify({
    status: "pass",
    checks: [
      "dark-neutral-lanes",
      "reference-proportions",
      "ruler-gutter-alignment",
      "unchanged-track-time-geometry",
      "rounded-lane-surface",
      "borderless-block-surface",
      "flat-block-surface",
      "restrained-hover",
      "restrained-selection",
      "keyboard-focus",
      "light-neutral-lanes",
      "runtime-theme-update",
      "track-and-metadata-typography-hierarchy",
    ],
    screenshots: [
      "artifacts/visual/devtools-editor-lanes-dark.png",
      "artifacts/visual/devtools-editor-lanes-dark-selected.png",
      "artifacts/visual/devtools-editor-lanes-light-selected.png",
    ],
  }));
}

try {
  await runVisualHarness(
    {
      pagePath: "/devtools-editor-v2.html",
      profilePrefix: "motion-lab-editor-lanes-",
    },
    verify,
  );
} catch (error) {
  reportVisualFailure(error);
}
