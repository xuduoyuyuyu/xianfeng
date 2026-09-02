import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./program.ts", import.meta.url), "utf8");

test("published program updates accept legacy incomplete episode fields", () => {
  assert.match(
    source,
    /function sanitizeProgramPayload\(payload: any, requireEpisode: boolean, allowIncompleteEpisodeFields = false\)/
  );
  assert.match(
    source,
    /const canSaveIncompleteVisibleProgram = existing\.status === "published" \|\| existing\.status === "group-only";[\s\S]*sanitizeProgramPayload\(aiResult\.payload, false, canSaveIncompleteVisibleProgram\)/
  );
  assert.match(source, /if \(!allowIncompleteEpisodeFields && !first\.title\)/);
  assert.match(source, /if \(!allowIncompleteEpisodeFields && !first\.duration\)/);
  assert.match(source, /if \(!allowIncompleteEpisodeFields && !first\.url\)/);
});

test("editing an already visible program preserves its original published time", () => {
  assert.match(
    source,
    /payload\.publishedAt = canSaveIncompleteVisibleProgram[\s\S]*\? existing\.publishedAt \|\| new Date\(\)[\s\S]*: new Date\(\);/
  );
});
