import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("admin knowledge-source controller exposes list, create, upload, and guest sync actions", () => {
  const source = readFileSync(resolve(__dirname, "adminKnowledgeSource.ts"), "utf8");

  assert.match(source, /async list/);
  assert.match(source, /async create/);
  assert.match(source, /async upload/);
  assert.match(source, /async syncGuest/);
  assert.match(source, /rebuildGuestAgentIndex/);
});

test("admin knowledge-source routes are protected admin endpoints", () => {
  const source = readFileSync(resolve(__dirname, "..", "routes", "adminKnowledgeSource.ts"), "utf8");

  assert.match(source, /router\.use\(authenticate,\s*requireAdmin\)/);
  assert.match(source, /router\.get\("\/"/);
  assert.match(source, /router\.post\("\/"/);
  assert.match(source, /router\.post\("\/upload"/);
  assert.match(source, /router\.post\("\/guests\/:guestId\/sync"/);
});
