// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import {
  createTimelineRegistry,
  defaultTimelineRegistry,
  MotionDevtoolsEditor,
  Refram,
  registerTimeline,
  type MotionDevtoolsEditorOptions,
  type MotionTimelineDeclaration,
  type MotionTimelineRegistration,
  type MotionTimelineRegistry,
  type MotionTimelineTrackDeclaration,
  type ReframOptions,
} from "../src";

describe("local package entry", () => {
  it("exposes the approved DevTools runtime surface", () => {
    expect(Refram).toBeTypeOf("function");
    expect(MotionDevtoolsEditor).toBe(Refram);
    expect(registerTimeline).toBeTypeOf("function");
    expect(createTimelineRegistry).toBeTypeOf("function");
    expect(defaultTimelineRegistry.getSnapshot()).toBeDefined();

    const declarationsCompile: readonly [
      ReframOptions?,
      MotionDevtoolsEditorOptions?,
      MotionTimelineDeclaration?,
      MotionTimelineRegistration?,
      MotionTimelineRegistry?,
      MotionTimelineTrackDeclaration?,
    ] = [];
    expect(declarationsCompile).toHaveLength(0);
  });

  it("shares document ownership across the primary and deprecated names", () => {
    const editor = new Refram();

    expect(() => new MotionDevtoolsEditor()).toThrowError(
      "A Motion DevTools editor already exists in this document.",
    );

    editor.destroy();
    const legacyEditor = new MotionDevtoolsEditor();
    legacyEditor.destroy();
  });
});
