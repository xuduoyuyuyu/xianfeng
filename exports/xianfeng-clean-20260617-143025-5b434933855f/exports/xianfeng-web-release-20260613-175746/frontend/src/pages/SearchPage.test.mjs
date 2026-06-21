import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "SearchPage.tsx"), "utf8");

test("global search material results open the materials page with the result title as query", () => {
  assert.match(source, /function buildMaterialSearchUrl\(title: string\)/);
  assert.match(source, /new URLSearchParams\(\{ q: clean \}\)/);
  assert.match(source, /url: buildMaterialSearchUrl\(material\.title\)/);
  assert.doesNotMatch(source, /url:\s*"\/materials"/);
});
