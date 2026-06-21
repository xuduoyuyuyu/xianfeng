import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "program.ts"), "utf8");

test("public related programs include education dictionary overlap in candidate selection", () => {
  assert.match(
    source,
    /const currentDictionaryEntryIds = new Set[\s\S]*dictionaryEntryIds[\s\S]*filter\(Boolean\)/,
    "related scoring should read the current program's dictionary entry ids"
  );
  assert.match(
    source,
    /if \(currentDictionaryEntryIds\.size\) \{[\s\S]*orFilters\.push\(\{[\s\S]*dictionaryEntryIds:\s*\{[\s\S]*\$in:/,
    "related candidate filtering should include programs sharing dictionary entries"
  );
  assert.match(
    source,
    /const dictionaryOverlap = Array\.from\(dictionaryEntryIds\)\.filter\(\(x\) => currentDictionaryEntryIds\.has\(x\)\)\.length;/,
    "related scoring should count dictionary overlap per candidate"
  );
  assert.match(
    source,
    /if \(dictionaryOverlap > 0\) reasons\.push\(`同词条\$\{dictionaryOverlap\}项`\);/,
    "related reasons should expose dictionary overlap to callers"
  );
  assert.match(
    source,
    /const score = sameGuestCount \* 100 \+ dictionaryOverlap \* 20 \+ tagOverlap \* 10 \+ termOverlap \* 3;/,
    "dictionary overlap should meaningfully influence ranking"
  );
});
