import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "ProgramListPage.tsx"), "utf8");

test("program list keeps a Xiaowanzi layer back button and layer links", () => {
  assert.match(source, /const navigate = useNavigate\(\);/, "program list should be able to go back in history");
  assert.match(source, /aria-label="返回小玩子"/, "Xiaowanzi layer should show the fixed back button");
  assert.match(source, /navigate\(-1\);/, "back button should return to the previous page when history exists");
  assert.match(
    source,
    /navigate\("\/programs\/list\?xw_restore=xiaowanzi"\);/,
    "back button should restore Xiaowanzi when no previous page exists"
  );
  assert.match(
    source,
    /href=\{`\/programs\/\$\{encodeURIComponent\(routeId\)\}\$\{superModePage \? "\?xw_layer=1" : ""\}`\}/,
    "program links from the layer list should preserve xw_layer=1"
  );
  assert.ok(source.includes("{!superModePage ? ("), "the normal public nav should be hidden inside Xiaowanzi layer mode");
});
