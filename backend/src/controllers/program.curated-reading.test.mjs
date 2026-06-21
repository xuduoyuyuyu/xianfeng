import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "program.ts"), "utf8");

test("auto-generated curated reading does not publish directly before verification", () => {
  assert.doesNotMatch(
    source,
    /curatedReading:\s*mergePreferManualArray\(next\.deepDive\?\.curatedReading,\s*generated\?\.deepDive\?\.curatedReading\)/,
    "AI-generated curated reading should not merge straight into the published deep-dive payload"
  );
});
