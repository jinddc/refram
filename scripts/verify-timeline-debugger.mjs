import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  assert,
  evaluate,
  reportVisualFailure,
  runVisualHarness,
  screenshot,
  waitFor,
} from "./visual-harness.mjs";

async function settle(send, frames = 2) {
  await evaluate(send, `new Promise((resolve) => {
    let remaining = ${frames};
    const next = () => {
      remaining -= 1;
      if (remaining <= 0) resolve(true);
      else requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  })`, true);
}

function cssDurationMs(value) {
  if (value.endsWith("ms")) return Number.parseFloat(value);
  if (value.endsWith("s")) return Number.parseFloat(value) * 1_000;
  return Number.NaN;
}

async function captureElement(send, selector, path) {
  const clip = await evaluate(send, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error("Missing screenshot target: ${selector}");
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
      scale: 1,
    };
  })()`);
  const result = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip,
  });
  await writeFile(path, Buffer.from(result.data, "base64"));
  return result.data;
}

async function verifyTimelineDebugger({ artifactDirectory, send }) {
  const desktop = join(artifactDirectory, "timeline-debugger-desktop.png");
  const narrow = join(artifactDirectory, "timeline-debugger-500.png");
  const reduced = join(artifactDirectory, "timeline-debugger-reduced.png");
  const sourceWithout = join(
    artifactDirectory,
    "timeline-debugger-source-unmounted.png",
  );
  const sourceWith = join(
    artifactDirectory,
    "timeline-debugger-source-mounted.png",
  );

  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await waitFor(
    () => evaluate(send, `Boolean(window.__timelineDebuggerHarness) && document.querySelectorAll("#debugger-stress tbody tr").length === 20`),
    "the timeline debugger playground",
  );
  await waitFor(
    () => evaluate(send, `document.querySelector("#debugger-disconnected [data-role='readiness']")?.textContent === "disconnected"`),
    "the disconnected debugger state",
  );

  const initial = await evaluate(send, `(() => ({
    manualReadiness: document.querySelector("#debugger-manual [data-role='readiness']")?.textContent,
    manualDriver: document.querySelector("#debugger-manual [data-role='driver']")?.textContent,
    manualRows: document.querySelectorAll("#debugger-manual tbody tr").length,
    manualUnavailable: document.querySelectorAll("#debugger-manual [data-available='false']").length,
    emptyReadiness: document.querySelector("#debugger-empty [data-role='readiness']")?.textContent,
    unsupportedReadiness: document.querySelector("#debugger-unsupported [data-role='readiness']")?.textContent,
    disconnectedReadiness: document.querySelector("#debugger-disconnected [data-role='readiness']")?.textContent,
    stressRows: document.querySelectorAll("#debugger-stress tbody tr").length,
    authoredPositions: [...document.querySelectorAll("#debugger-manual .timeline-debugger__position")].map((node) => node.textContent),
  }))()`);
  assert(initial.manualReadiness === "ready", "Manual debugger was not ready.");
  assert(initial.manualDriver === "manual", "Manual debugger reported the wrong driver.");
  assert(initial.manualRows === 3, "Manual debugger did not render three authored rows.");
  assert(initial.manualUnavailable === 1, "Missing-to timing was not marked unavailable.");
  assert(initial.emptyReadiness === "empty", "Empty readiness was not rendered.");
  assert(initial.unsupportedReadiness === "missing-plugin", "Missing plugin readiness was not rendered.");
  assert(initial.disconnectedReadiness === "disconnected", "Disconnected readiness was not rendered.");
  assert(initial.stressRows === 20, "Stress debugger did not render 20 authored rows.");
  assert(
    initial.authoredPositions.includes("<35%") && initial.authoredPositions.includes(">-0.12"),
    "Authored string positions were not preserved verbatim.",
  );

  await evaluate(send, `(() => {
    window.__timelineDebuggerHarness.enableScrollDriver();
    return true;
  })()`);
  await waitFor(
    () => evaluate(send, `document.querySelector("#debugger-unsupported [data-role='readiness']")?.textContent === "ready" && window.__timelineDebuggerHarness.ScrollTrigger.getAll().length === 1`),
    "the real ScrollTrigger debugger state",
  );
  await evaluate(send, `(() => {
    const harness = window.__timelineDebuggerHarness;
    const trigger = harness.ScrollTrigger.getAll()[0];
    window.__debuggerScrollRow = document.querySelector("#debugger-unsupported tbody tr");
    window.__debuggerScrollProgress = 0.55;
    window.scrollTo(0, trigger.start + ((trigger.end - trigger.start) * window.__debuggerScrollProgress));
    harness.ScrollTrigger.update();
    return true;
  })()`);
  await settle(send);
  await waitFor(
    () => evaluate(send, `Number.parseFloat(document.querySelector("#debugger-unsupported [data-role='progress']")?.value ?? "0") > 40`),
    "the real ScrollTrigger debugger progress",
  );
  const scrollBeforeMutation = await evaluate(send, `(() => ({
    driver: document.querySelector("#debugger-unsupported [data-role='driver']")?.textContent,
    progress: (window.__debuggerScrollProgress = window.__timelineDebuggerHarness.ScrollTrigger.getAll()[0]?.progress),
  }))()`);
  assert(scrollBeforeMutation.driver === "scroll", "Real ScrollTrigger debugger reported the wrong driver.");
  assert(scrollBeforeMutation.progress > 0.4, "Real ScrollTrigger progress did not reach the inspection debugger.");

  await evaluate(send, `(() => {
    window.__timelineDebuggerHarness.mutateScrollTimeline();
    return true;
  })()`);
  await waitFor(
    () => evaluate(send, `(() => {
      const harness = window.__timelineDebuggerHarness;
      const trigger = harness.ScrollTrigger.getAll()[0];
      return harness.ScrollTrigger.getAll().length === 1 &&
        Math.abs(trigger.progress - window.__debuggerScrollProgress) < 0.04 &&
        window.__debuggerScrollRow === document.querySelector("#debugger-unsupported tbody tr");
    })()`),
    "the progress-preserving ScrollTrigger debugger rebuild",
  );

  const keyboard = await evaluate(send, `(() => {
    const buttons = document.querySelectorAll("#debugger-manual .timeline-debugger__row-button");
    buttons[1].focus();
    buttons[1].click();
    return {
      focused: document.activeElement === buttons[1],
      selected: buttons[1].getAttribute("aria-pressed"),
      details: document.querySelector("#debugger-manual [data-role='details']")?.textContent,
    };
  })()`);
  assert(keyboard.focused, "Row button did not retain keyboard focus.");
  assert(keyboard.selected === "true", "Row button selection was not exposed semantically.");
  assert(keyboard.details.includes("power3.out"), "Selected-item details did not update.");

  await evaluate(send, `(() => {
    window.__debuggerOriginalRow = document.querySelector("#debugger-manual tbody tr");
    void window.__timelineDebuggerHarness.playManual();
    return true;
  })()`);
  await new Promise((resolveWait) => setTimeout(resolveWait, 140));
  const progress = await evaluate(send, `(() => ({
    value: document.querySelector("#debugger-manual [data-role='progress']")?.value,
    sameRow: window.__debuggerOriginalRow === document.querySelector("#debugger-manual tbody tr"),
  }))()`);
  assert(progress.value !== "0.0%", "Progress sampling did not update the debugger.");
  assert(progress.sameRow, "Progress sampling rebuilt authored row DOM.");

  await evaluate(send, `(() => {
    window.__timelineDebuggerHarness.cancelManual();
    window.__timelineDebuggerHarness.mutateManualTimeline();
    return true;
  })()`);
  await waitFor(
    () => evaluate(send, `document.querySelectorAll("#debugger-manual tbody tr").length === 4`),
    "the debugger structural replacement",
  );

  await evaluate(send, `(() => {
    window.__timelineDebuggerHarness.reconnectTimeline();
    return true;
  })()`);
  await waitFor(
    () => evaluate(send, `document.querySelector("#debugger-disconnected [data-role='readiness']")?.textContent === "ready"`),
    "the reconnected debugger state",
  );
  await evaluate(send, `(() => {
    window.__timelineDebuggerHarness.disconnectTimeline();
    return true;
  })()`);
  await waitFor(
    () => evaluate(send, `document.querySelector("#debugger-disconnected [data-role='readiness']")?.textContent === "disconnected"`),
    "the second disconnected debugger state",
  );

  await evaluate(send, `(() => {
    window.__timelineDebuggerHarness.unmountDebugger("manual");
    document.querySelector("#debug-manual").scrollIntoView({ block: "center" });
    return true;
  })()`);
  await settle(send);
  const unmountedSource = await captureElement(send, "#debug-manual", sourceWithout);
  const hidden = await evaluate(send, `(() => ({
    panelHidden: document.querySelector("#debugger-manual").hidden,
    debuggerCount: document.querySelectorAll("#debugger-manual [data-timeline-debugger]").length,
  }))()`);
  assert(hidden.panelHidden && hidden.debuggerCount === 0, "Hidden suspension retained debugger DOM.");

  await evaluate(send, `(() => {
    window.__timelineDebuggerHarness.mountDebugger("manual");
    document.querySelector("#debug-manual").scrollIntoView({ block: "center" });
    return true;
  })()`);
  await settle(send);
  const mountedSource = await captureElement(send, "#debug-manual", sourceWith);
  assert(
    mountedSource === unmountedSource,
    "Mounting the debugger changed source timeline pixels.",
  );

  await evaluate(send, `document.querySelector("#debugger-manual").scrollIntoView({ block: "center" })`);
  await settle(send);
  await screenshot(send, desktop);

  await send("Emulation.setDeviceMetricsOverride", {
    width: 500,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(send, `document.querySelector("#debugger-manual").scrollIntoView({ block: "start" })`);
  await settle(send);
  const narrowState = await evaluate(send, `(() => {
    const viewport = document.querySelector("#debugger-manual .timeline-debugger__viewport");
    const button = document.querySelector("#debugger-manual .timeline-debugger__row-button");
    button.focus();
    return {
      debuggerWidth: document.querySelector("#debugger-manual").getBoundingClientRect().width,
      horizontalOverflow: viewport.scrollWidth > viewport.clientWidth,
      focusVisible: document.activeElement === button,
      rows: document.querySelectorAll("#debugger-manual tbody tr").length,
      details: Boolean(document.querySelector("#debugger-manual [data-role='details']")?.textContent),
    };
  })()`);
  assert(narrowState.debuggerWidth <= 500, "Narrow debugger exceeded the fixture width.");
  assert(narrowState.horizontalOverflow, "Narrow timeline viewport did not provide horizontal overflow.");
  assert(narrowState.focusVisible, "Narrow row selection was not keyboard focusable.");
  assert(narrowState.rows === 4 && narrowState.details, "Narrow debugger lost rows or details.");
  await screenshot(send, narrow);

  await send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await send("Page.reload", { ignoreCache: true });
  await waitFor(
    () => evaluate(send, `Boolean(window.__timelineDebuggerHarness) && document.querySelector("#debugger-manual [data-role='readiness']")?.textContent === "reduced-motion"`),
    "the reduced-motion debugger",
  );
  const reducedState = await evaluate(send, `(() => {
    const playhead = document.querySelector("#debugger-manual .timeline-debugger__playhead");
    return {
      readiness: document.querySelector("#debugger-manual [data-role='readiness']")?.textContent,
      progress: document.querySelector("#debugger-manual [data-role='progress']")?.value,
      rows: document.querySelectorAll("#debugger-manual tbody tr").length,
      transitionDuration: getComputedStyle(playhead).transitionDuration,
    };
  })()`);
  assert(reducedState.readiness === "reduced-motion", "Reduced readiness was not rendered.");
  assert(reducedState.progress === "100.0%", "Reduced progress did not remain readable.");
  assert(reducedState.rows === 3, "Reduced motion removed authored rows.");
  assert(
    cssDurationMs(reducedState.transitionDuration) <= 0.001,
    "Debugger transitions remained active under reduced motion.",
  );
  await evaluate(send, `document.querySelector("#debugger-manual").scrollIntoView({ block: "start" })`);
  await settle(send);
  await screenshot(send, reduced);

  console.log(JSON.stringify({
    status: "pass",
    checks: {
      authoredRows: "pass",
      progressRowReuse: "pass",
      structuralReplacement: "pass",
      keyboardSelection: "pass",
      readinessStates: "pass",
      realScrollTriggerPipeline: "pass",
      disconnectReconnect: "pass",
      hiddenSuspension: "pass",
      sourcePixelIsolation: "pass",
      stressItems: initial.stressRows,
      narrowWidth: narrowState.debuggerWidth,
      reducedMotion: "pass",
    },
    screenshots: [
      "artifacts/visual/timeline-debugger-desktop.png",
      "artifacts/visual/timeline-debugger-500.png",
      "artifacts/visual/timeline-debugger-reduced.png",
      "artifacts/visual/timeline-debugger-source-unmounted.png",
      "artifacts/visual/timeline-debugger-source-mounted.png",
    ],
  }));
}

async function main() {
  await runVisualHarness(
    {
      pagePath: "/timeline-debugger.html",
      profilePrefix: "motion-lab-timeline-debugger-",
    },
    verifyTimelineDebugger,
  );
}

main().catch(reportVisualFailure);
