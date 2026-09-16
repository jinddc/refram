// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EffectController } from "../src/core/effect-controller";
import { MotionElement } from "../src/core/motion-element";

interface TestOptions {
  count: number;
  nested: {
    label: string;
  };
}

class TestController implements EffectController<TestOptions> {
  public readonly connect = vi.fn();
  public readonly update = vi.fn<(options: TestOptions) => void>();
  public readonly resize = vi.fn();
  public readonly destroy = vi.fn();

  public constructor(public readonly initialOptions: TestOptions) {}
}

let controllers: TestController[] = [];

class TestMotionElement extends MotionElement<
  TestOptions,
  TestController
> {
  public constructor() {
    super({ count: 0, nested: { label: "default" } });
    this.upgradeOptionsProperty();
  }

  public get activeController(): TestController | undefined {
    return this.controller;
  }

  protected normalizeOptions(value: TestOptions): TestOptions {
    const count = Number.isFinite(value?.count) ? value.count : 0;
    const label = value?.nested?.label?.trim() || "default";

    return { count, nested: { label } };
  }

  protected copyOptions(options: TestOptions): TestOptions {
    return { ...options, nested: { ...options.nested } };
  }

  protected createController(options: TestOptions): TestController {
    const controller = new TestController(options);
    controllers.push(controller);
    return controller;
  }
}

customElements.define("motion-element-test", TestMotionElement);

class PreparedMotionElement extends TestMotionElement {
  protected override prepareControllerOptions(
    options: TestOptions,
  ): TestOptions {
    return {
      ...options,
      count: options.count + 10,
    };
  }
}

customElements.define(
  "motion-element-prepared-test",
  PreparedMotionElement,
);

beforeEach(() => {
  controllers = [];
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("MotionElement", () => {
  it("creates and connects one controller while connected", () => {
    const element = document.createElement(
      "motion-element-test",
    ) as TestMotionElement;

    document.body.append(element);
    element.connectedCallback();

    expect(controllers).toHaveLength(1);
    expect(controllers[0]?.connect).toHaveBeenCalledOnce();
    expect(element.activeController).toBe(controllers[0]);
  });

  it("updates a connected controller with a normalized full snapshot", () => {
    const element = document.createElement(
      "motion-element-test",
    ) as TestMotionElement;
    document.body.append(element);

    element.options = {
      count: Number.NaN,
      nested: { label: "  updated  " },
    };

    expect(controllers[0]?.update).toHaveBeenCalledOnce();
    expect(controllers[0]?.update).toHaveBeenCalledWith({
      count: 0,
      nested: { label: "updated" },
    });
  });

  it("stores disconnected updates for the next controller", () => {
    const element = document.createElement(
      "motion-element-test",
    ) as TestMotionElement;

    element.options = { count: 3, nested: { label: "next" } };
    expect(controllers).toHaveLength(0);

    document.body.append(element);

    expect(controllers[0]?.initialOptions).toEqual({
      count: 3,
      nested: { label: "next" },
    });
  });

  it("returns a defensive copy of the current options", () => {
    const element = document.createElement(
      "motion-element-test",
    ) as TestMotionElement;
    const returnedOptions = element.options;

    returnedOptions.count = 9;
    returnedOptions.nested.label = "mutated";

    expect(element.options).toEqual({
      count: 0,
      nested: { label: "default" },
    });
  });

  it("prepares controller snapshots without changing public options", () => {
    const element = document.createElement(
      "motion-element-prepared-test",
    ) as PreparedMotionElement;
    element.options = { count: 2, nested: { label: "public" } };
    document.body.append(element);

    expect(element.options).toEqual({
      count: 2,
      nested: { label: "public" },
    });
    expect(controllers[0]?.initialOptions).toEqual({
      count: 12,
      nested: { label: "public" },
    });

    element.options = { count: 4, nested: { label: "updated" } };
    expect(controllers[0]?.update).toHaveBeenCalledWith({
      count: 14,
      nested: { label: "updated" },
    });
    expect(element.options.count).toBe(4);
  });

  it("destroys once and creates a fresh controller on reconnect", () => {
    const element = document.createElement(
      "motion-element-test",
    ) as TestMotionElement;
    document.body.append(element);
    const firstController = controllers[0];

    element.remove();
    element.disconnectedCallback();

    expect(firstController?.destroy).toHaveBeenCalledOnce();
    expect(element.activeController).toBeUndefined();

    document.body.append(element);

    expect(controllers).toHaveLength(2);
    expect(controllers[1]).not.toBe(firstController);
    expect(controllers[1]?.connect).toHaveBeenCalledOnce();
  });

  it("replays options assigned before Custom Element upgrade", () => {
    const name = "motion-pre-upgrade-test";
    const element = document.createElement(name) as HTMLElement & {
      options: TestOptions;
    };
    element.options = { count: 7, nested: { label: "early" } };
    document.body.append(element);

    class PreUpgradeElement extends TestMotionElement {}
    customElements.define(name, PreUpgradeElement);

    expect(element).toBeInstanceOf(PreUpgradeElement);
    expect(element.options).toEqual({
      count: 7,
      nested: { label: "early" },
    });
  });
});
