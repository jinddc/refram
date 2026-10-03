// @vitest-environment node

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const editorUiDirectory = fileURLToPath(
  new URL("../../src/devtools/editor/ui/", import.meta.url),
);

describe("DevTools editor CSS variables", () => {
  it("does not expose or use the removed public variable prefix", () => {
    const productionSource = readdirSync(editorUiDirectory)
      .filter((name) => name.endsWith(".ts") || name.endsWith(".css"))
      .map((name) => readFileSync(`${editorUiDirectory}/${name}`, "utf8"))
      .join("\n");

    expect(productionSource).not.toContain("--devtools-editor-");
  });
});
