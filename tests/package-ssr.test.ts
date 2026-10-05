// @vitest-environment node

import { describe, expect, it } from "vitest";
import { Refram, MotionDevtoolsEditor, createTimelineRegistry } from "../src";

describe("package entry without a DOM", () => {
  it("imports runtime APIs and supports headless registries", () => {
    expect(typeof document).toBe("undefined");
    expect(MotionDevtoolsEditor).toBe(Refram);
    const registry = createTimelineRegistry();
    expect(registry.getSnapshot().registrations).toHaveLength(0);
    registry.destroy();
  });

  it("explains the client lifecycle requirement when mounting on the server", () => {
    expect(() => new Refram()).toThrow("Refram requires a browser document.");
    expect(() => new MotionDevtoolsEditor()).toThrow("client-side lifecycle hook");
  });
});
