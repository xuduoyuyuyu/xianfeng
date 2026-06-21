import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "AdminGuestsPage.tsx"), "utf8");

test("admin guests table keeps action controls anchored on the right", () => {
  assert.match(
    source,
    /<table className="w-full min-w-\[1180px\] table-fixed text-left">/,
    "guest table should fill the admin card instead of stopping mid-screen"
  );
  assert.match(source, /<col \/>\s*<col className="w-\[160px\]" \/>/, "guest name column should take remaining width before fixed right columns");
  assert.match(source, /<col className="w-\[176px\]" \/>/, "action column should have a stable fixed width");
  assert.match(source, /<th className="px-4 py-3 text-right whitespace-nowrap">操作<\/th>/, "action header should align to the fixed right edge");
  assert.match(source, /<td className="px-4 py-4 text-right whitespace-nowrap">/, "action cells should align to the fixed right edge");
  assert.match(source, /className="flex justify-end gap-2 whitespace-nowrap"/, "edit and delete buttons should stay right-aligned inside the action cell");
});

test("admin guests editor includes guest knowledge-source upload and sync controls", () => {
  assert.match(source, /AI 分身知识库/, "guest editor should expose the WeKnora-backed knowledge-source panel");
  assert.match(source, /getKnowledgeSources/, "guest editor should load existing knowledge sources");
  assert.match(source, /uploadKnowledgeSource/, "guest editor should upload new source files");
  assert.match(source, /syncGuestKnowledgeSources/, "guest editor should trigger guest knowledge sync");
});
