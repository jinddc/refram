// @vitest-environment happy-dom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  REQUEST_TIMELINE_SYNC,
  type TimelineCompositionHost,
} from "../src/timeline/timeline-protocol";
import { MotionTweenElement } from "../src/timeline/tween-element";

async function flushOwnership(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeAll(() => {
  if (!customElements.get("motion-tween-test")) {
    customElements.define("motion-tween-test", MotionTweenElement);
  }
});

function createTween(): MotionTweenElement {
  return document.createElement("motion-tween-test") as MotionTweenElement;
}

function createHost(): TimelineCompositionHost {
  const host = document.createElement(
    "motion-timeline",
  ) as TimelineCompositionHost;
  host[REQUEST_TIMELINE_SYNC] = vi.fn();
  return host;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("MotionTweenElement", () => {
  it("is inert and keeps copied options outside a timeline", async () => {
    const tween = createTween();
    tween.textContent = "Readable";
    tween.options = { from: { x: 20 }, to: { x: 0 } };
    document.body.append(tween);
    await flushOwnership();

    const options = tween.options;
    options.from!.x = 99;

    expect(tween.textContent).toBe("Readable");
    expect(tween.options.from?.x).toBe(20);
    expect(tween.childElementCount).toBe(0);
  });

  it("notifies the nearest owner for structure and option changes", async () => {
    const outer = createHost();
    const inner = createHost();
    const tween = createTween();
    inner.append(tween);
    outer.append(inner);
    document.body.append(outer);
    await flushOwnership();

    expect(inner[REQUEST_TIMELINE_SYNC]).toHaveBeenCalledWith("structure");
    expect(outer[REQUEST_TIMELINE_SYNC]).not.toHaveBeenCalled();

    tween.options = { to: { opacity: 1 }, position: "<" };
    expect(inner[REQUEST_TIMELINE_SYNC]).toHaveBeenLastCalledWith("options");

    tween.remove();
    expect(inner[REQUEST_TIMELINE_SYNC]).toHaveBeenLastCalledWith("structure");
  });

  it("moves ownership without leaving stale notifications", async () => {
    const first = createHost();
    const second = createHost();
    const tween = createTween();
    first.append(tween);
    document.body.append(first, second);
    await flushOwnership();

    vi.mocked(first[REQUEST_TIMELINE_SYNC]).mockClear();
    vi.mocked(second[REQUEST_TIMELINE_SYNC]).mockClear();
    second.append(tween);
    await flushOwnership();

    expect(first[REQUEST_TIMELINE_SYNC]).toHaveBeenCalledWith("structure");
    expect(second[REQUEST_TIMELINE_SYNC]).toHaveBeenCalledWith("structure");

    tween.options = { to: { x: 0 } };
    expect(second[REQUEST_TIMELINE_SYNC]).toHaveBeenLastCalledWith("options");
  });

  it("cancels a pending ownership lookup after disconnect", async () => {
    const host = createHost();
    const tween = createTween();
    host.append(tween);
    document.body.append(host);
    tween.remove();
    await flushOwnership();

    expect(host[REQUEST_TIMELINE_SYNC]).not.toHaveBeenCalled();
  });
});
