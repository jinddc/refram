import { describe, expect, it } from "vitest";

import { upgradeProperty } from "../src/internal/upgrade-property";

class TestTarget {
  private storedValue = "default";
  public assignments = 0;

  public get options(): string {
    return this.storedValue;
  }

  public set options(value: string) {
    this.assignments += 1;
    this.storedValue = value;
  }
}

describe("upgradeProperty", () => {
  it("replays an own property through its prototype setter", () => {
    const target = new TestTarget();
    Object.defineProperty(target, "options", {
      configurable: true,
      enumerable: true,
      value: "assigned-before-upgrade",
      writable: true,
    });

    upgradeProperty(target, "options");

    expect(target.options).toBe("assigned-before-upgrade");
    expect(target.assignments).toBe(1);
    expect(Object.hasOwn(target, "options")).toBe(false);
  });

  it("does nothing when the property is not owned by the instance", () => {
    const target = new TestTarget();

    upgradeProperty(target, "options");

    expect(target.options).toBe("default");
    expect(target.assignments).toBe(0);
  });
});
