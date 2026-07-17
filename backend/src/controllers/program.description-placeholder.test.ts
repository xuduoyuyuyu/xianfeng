import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("./program.ts", import.meta.url), "utf8");

describe("formal program descriptions", () => {
  it("does not preserve audio parsing placeholders as generated descriptions", () => {
    assert.match(source, /function isProgramDescriptionPlaceholder/);
    assert.match(source, /isProgramDescriptionPlaceholder\(payload\?\.description\) \? "" : payload\?\.description/);
  });

  it("sanitizes public list and detail descriptions", () => {
    assert.match(source, /description: resolveFormalProgramDescription\(program\)/);
    assert.match(source, /result\.description = resolveFormalProgramDescription\(result\)/);
  });
});
