import { assert, evaluate, reportVisualFailure, runVisualHarness, waitFor } from "./visual-harness.mjs";

// Controlled page-scroll interception fixture using Lenis's documented exclusion rule.
// No external code is loaded; this verifies native scrolling, not an installed Lenis runtime.
async function verify({ send }) {
  await waitFor(() => evaluate(send, "Boolean(window.__devtoolsEditorV2Harness)"), "editor fixture");
  const setup = await evaluate(send, `(() => {
    window.__pageScrollTest = (event) => {
      if (event.composedPath().some(node => node instanceof HTMLElement
        && node.hasAttribute("data-lenis-prevent"))) return;
      event.preventDefault();
      window.scrollBy({ top: event.deltaY, behavior: "instant" });
    };
    window.addEventListener("wheel", window.__pageScrollTest, { passive: false });
    const harness = window.__devtoolsEditorV2Harness;
    harness.query(".rf__track-label").click();
    const host = document.querySelector("rf-editor");
    const root = harness.query("[data-rf]");
    const inspector = harness.query(".rf__inspector-content");
    const shielded = host.hasAttribute("data-lenis-prevent") && root.hasAttribute("data-lenis-prevent");
    host.removeAttribute("data-lenis-prevent");
    root.removeAttribute("data-lenis-prevent");
    const blocked = new WheelEvent("wheel", { deltaY: 100, bubbles: true, composed: true, cancelable: true });
    inspector.dispatchEvent(blocked);
    host.setAttribute("data-lenis-prevent", "");
    root.setAttribute("data-lenis-prevent", "");
    window.scrollTo({ top: 0, behavior: "instant" });
    return { reproduced: blocked.defaultPrevented, shielded };
  })()`);
  assert(setup.reproduced, "Page-scroll fixture did not reproduce the original interception.");
  assert(setup.shielded, "Editor host or UI is missing its native-scroll boundary.");

  for (const selector of [".rf__inspector-content", ".rf__timeline-list", ".rf__timeline-viewport"]) {
    const geometry = await evaluate(send, `(() => {
      const node = window.__devtoolsEditorV2Harness.query(${JSON.stringify(selector)});
      node.style.height = "80px";
      node.style.maxHeight = "80px";
      node.style.flex = "none";
      const filler = document.createElement("div");
      filler.style.height = "900px";
      filler.style.width = "3000px";
      node.append(filler);
      node.scrollTop = 0;
      node.scrollLeft = 0;
      const bounds = node.getBoundingClientRect();
      const event = new WheelEvent("wheel", { deltaY: 80, bubbles: true, composed: true, cancelable: true });
      node.dispatchEvent(event);
      return {
        x: bounds.left + Math.min(bounds.width / 2, 40),
        y: bounds.top + Math.min(bounds.height / 2, 40),
        pageScroll: window.scrollY,
        cancelled: event.defaultPrevented,
        overscroll: getComputedStyle(node).overscrollBehavior,
      };
    })()`);
    assert(!geometry.cancelled, selector + " wheel still intercepted by the page-scroll fixture.");
    assert(geometry.overscroll === "contain", selector + " scroll chaining is not contained.");
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: geometry.x, y: geometry.y, deltaX: 0, deltaY: 90 });
    await waitFor(() => evaluate(send, `window.__devtoolsEditorV2Harness.query(${JSON.stringify(selector)}).scrollTop > 0`), selector + " native vertical scroll");
    const position = await evaluate(send, "window.scrollY");
    assert(Math.abs(position - geometry.pageScroll) < 1, selector + " moved the page.");
    if (selector === ".rf__timeline-viewport") {
      await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: geometry.x, y: geometry.y, deltaX: 90, deltaY: 0 });
      await waitFor(() => evaluate(send, `window.__devtoolsEditorV2Harness.query(".rf__timeline-viewport").scrollLeft > 0`), "native horizontal timeline scroll");
    }
    await evaluate(send, `(() => {
      const node = window.__devtoolsEditorV2Harness.query(${JSON.stringify(selector)});
      node.scrollTop = node.scrollHeight;
    })()`);
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: geometry.x, y: geometry.y, deltaX: 0, deltaY: 120 });
    // A following input is delivered after the prior browser input; inspect on the next frame.
    const atEdge = await evaluate(send, "new Promise(resolve => requestAnimationFrame(() => resolve(window.scrollY)))", true);
    assert(Math.abs(atEdge - geometry.pageScroll) < 1, selector + " chained at its bottom edge.");
  }

  const pageBaseline = await evaluate(send, "window.scrollY");
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 600, y: 100, deltaX: 0, deltaY: 180 });
  await waitFor(() => evaluate(send, `window.scrollY > ${pageBaseline} + 10`), "page scrolling outside editor");
  await evaluate(send, 'window.removeEventListener("wheel", window.__pageScrollTest)');
  console.log(JSON.stringify({ status: "pass", fixture: "local Lenis-compatible exclusion rule", checks: ["original-interception-reproduced", "inspector-native-scroll", "timeline-list-native-scroll", "timeline-vertical-horizontal-scroll", "edge-containment", "outside-page-scroll"] }));
}

runVisualHarness({ pagePath: "index.html", profilePrefix: "refram-lenis-" }, verify).catch(reportVisualFailure);
