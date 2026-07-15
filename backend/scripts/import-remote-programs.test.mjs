import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "import-remote-programs.cjs"), "utf8");

test("program import updates supplied fields without replacing stored generated content", () => {
  assert.match(
    source,
    /Program\.updateOne\(\{ _id: programId \}, \{ \$set: doc \}, \{ upsert: true \}\)/,
    "partial public exports must not replace the complete stored program document"
  );
  assert.doesNotMatch(
    source,
    /Program\.replaceOne/,
    "program import must not erase transcript, deepDive, or contentPack fields omitted by the source"
  );
});

test("program import preserves all supported visibility statuses", () => {
  assert.match(
    source,
    /\["draft", "published", "group-only"\]\.includes\(doc\.status\)/,
    "group-only programs must not be silently converted to published during import"
  );
});
