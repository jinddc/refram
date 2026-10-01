// @vitest-environment happy-dom

import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSelectedTrackDebugJson } from "../src/devtools/editor-debug-snapshot";
import { createEditorController } from "../src/devtools/editor-controller";
import { createTimelineRegistry } from "../src/devtools/timeline-registry";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("selected track debug snapshot", () => {
  it("serializes only the active timeline and selected track diagnostics", () => {
    const registry = createTimelineRegistry();
    const root = document.createElement("section");
    const target = document.createElement("article");
    target.id = "hero";
    target.className = "panel active";
    target.textContent = "Private application content";
    root.append(target);
    const timeline = gsap.timeline({ paused: true });
    timeline.to(target, { opacity: 0, y: 20, duration: 1.25, ease: "power2.out" }, 0.5);
    const registration = registry.register({
      id: "demo/hero",
      label: "Hero sequence",
      root,
      timeline,
    });
    const editor = createEditorController({ registry });

    expect(createSelectedTrackDebugJson(editor.getSnapshot())).toBeUndefined();
    expect(editor.selectItem(0)).toBe(true);
    const debug = JSON.parse(createSelectedTrackDebugJson(editor.getSnapshot())!);
    expect(debug).toEqual({
      schemaVersion: 1,
      timeline: { id: "demo/hero", label: "Hero sequence" },
      track: {
        label: "article.panel",
        type: "automatic",
        start: 0.5,
        duration: 1.25,
        end: 1.75,
        ease: "power2.out",
        targets: {
          animatedCount: 1,
          visualCount: 1,
          descriptors: ["article#hero.panel.active"],
        },
        properties: ["opacity", "y"],
      },
    });
    expect(createSelectedTrackDebugJson(editor.getSnapshot())).not.toContain(
      "Private application content",
    );

    editor.destroy();
    registration.destroy();
    registry.destroy();
  });
});
