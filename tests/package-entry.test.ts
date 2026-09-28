// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import {
  createTimelineRegistry,
  defaultTimelineRegistry,
  MotionDevtoolsEditor,
  registerTimeline,
  type MotionDevtoolsEditorOptions,
  type MotionTimelineDeclaration,
  type MotionTimelineRegistration,
  type MotionTimelineRegistry,
  type MotionTimelineTrackDeclaration,
} from "../src";

describe("local package entry", () => {
  it("exposes the approved DevTools runtime surface", () => {
    expect(MotionDevtoolsEditor).toBeTypeOf("function");
    expect(registerTimeline).toBeTypeOf("function");
    expect(createTimelineRegistry).toBeTypeOf("function");
    expect(defaultTimelineRegistry.getSnapshot()).toBeDefined();

    const declarationsCompile: readonly [
      MotionDevtoolsEditorOptions?,
      MotionTimelineDeclaration?,
      MotionTimelineRegistration?,
      MotionTimelineRegistry?,
      MotionTimelineTrackDeclaration?,
    ] = [];
    expect(declarationsCompile).toHaveLength(0);
  });
});
