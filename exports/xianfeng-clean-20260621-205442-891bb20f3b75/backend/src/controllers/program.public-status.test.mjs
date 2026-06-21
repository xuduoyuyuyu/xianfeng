import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "program.ts"), "utf8");

test("public program reads treat group-only as a public tag", () => {
  assert.match(
    source,
    /const PUBLIC_PROGRAM_STATUSES = \["published", "group-only"\] as const;/,
    "public program controllers should share the same public status set"
  );
  assert.match(
    source,
    /status:\s*\{\s*\$in:\s*PUBLIC_PROGRAM_STATUSES\s*\}/,
    "public list and detail filters should include group-only programs"
  );
  assert.doesNotMatch(
    source,
    /program\.status !== "published"/,
    "public detail should not reject group-only as if it were unpublished"
  );
});
