import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "adminGuest.ts"), "utf8");

test("admin guest agent reindex response includes WeKnora sync metadata", () => {
  assert.match(source, /weknoraSync:\s*result\.weknoraSync/);
});
