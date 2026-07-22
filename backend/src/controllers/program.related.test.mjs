import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "program.ts"), "utf8");

test("public related programs require a shared bound guest", () => {
  assert.match(
    source,
    /if \(!currentGuestIds\.size\) \{[\s\S]*recommendedPrograms: \[\][\s\S]*return;/,
    "programs without a bound guest should not receive generic recommendations"
  );
  assert.match(
    source,
    /"guestBindings\.guestId": \{[\s\S]*\$in: Array\.from\(currentGuestIds\)/,
    "candidate filtering should require at least one shared guest id"
  );
  assert.match(
    source,
    /const dictionaryOverlap = Array\.from\(dictionaryEntryIds\)\.filter\(\(x\) => currentDictionaryEntryIds\.has\(x\)\)\.length;/,
    "same-guest candidates may still use dictionary overlap for ordering"
  );
  assert.match(
    source,
    /const score = sameGuestCount \* 100 \+ dictionaryOverlap \* 20 \+ tagOverlap \* 10 \+ termOverlap \* 3;/,
    "shared guest should remain the dominant ranking signal"
  );
});
