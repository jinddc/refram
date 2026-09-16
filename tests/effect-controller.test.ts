import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { EffectController } from "../src/core/effect-controller";

interface TestOptions {
  duration: number;
  enabled: boolean;
}

describe("EffectController", () => {
  it("accepts a complete options snapshot for update", () => {
    expectTypeOf<Parameters<EffectController<TestOptions>["update"]>[0]>()
      .toEqualTypeOf<TestOptions>();

    const update = vi.fn<(options: TestOptions) => void>();
    const controller: EffectController<TestOptions> = {
      connect: vi.fn(),
      update,
      resize: vi.fn(),
      destroy: vi.fn(),
    };
    const options: TestOptions = { duration: 0.4, enabled: true };

    controller.update(options);

    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(options);
  });
});
