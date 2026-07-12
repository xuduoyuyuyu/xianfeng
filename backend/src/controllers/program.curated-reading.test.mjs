import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "program.ts"), "utf8");
const modelSource = readFileSync(resolve(__dirname, "../models/Program.ts"), "utf8");
const dispatcherSource = readFileSync(resolve(__dirname, "../services/agentTaskDispatcher.ts"), "utf8");

test("auto-generated curated reading does not publish directly before verification", () => {
  assert.doesNotMatch(
    source,
    /curatedReading:\s*mergePreferManualArray\(next\.deepDive\?\.curatedReading,\s*generated\?\.deepDive\?\.curatedReading\)/,
    "AI-generated curated reading should not merge straight into the published deep-dive payload"
  );
});

test("public program detail keeps concrete reading copy but only exposes verified links", () => {
  assert.match(
    source,
    /function buildPublicCuratedReading\(program:\s*any\)/,
    "public program detail should have one display-safe reading builder"
  );
  assert.match(
    source,
    /result\.deepDive = await buildPublicCuratedReading\(result\);/,
    "public detail response should preserve displayable deep-dive content"
  );
  assert.match(source, /item\?\.passed === true/);
  assert.match(source, /item\?\.titleMatched === true/);
  assert.match(source, /url:\s*verified\s*\?[\s\S]*:\s*""/);
  assert.doesNotMatch(source, /if \(!verified\) return \[\];/);
});

test("public curated reading preserves book metadata and links exact published site books", () => {
  assert.match(source, /import Book from "\.\.\/models\/Book";/);
  assert.match(source, /async function buildPublicCuratedReading\(program:\s*any\)/);
  assert.match(source, /Book\.find\(\s*\{[\s\S]*status:\s*"published"[\s\S]*title:\s*\{\s*\$in:\s*lookupTitles\s*\}/);
  assert.match(source, /subtitle:\s*asText\(reading\?\.subtitle \|\| reading\?\.description \|\| reading\?\.reason\)/);
  assert.match(source, /author:\s*asText\(matchedBook\?\.author\) \|\| asText\(reading\?\.author\)/);
  assert.match(source, /translator:\s*asText\(matchedBook\?\.translator\) \|\| asText\(reading\?\.translator\)/);
  assert.match(source, /publisher:\s*asText\(matchedBook\?\.publisher\) \|\| asText\(reading\?\.publisher\)/);
  assert.match(source, /book:\s*matchedBook\s*\?[\s\S]*id:\s*asObjectIdText\(matchedBook\?\._id\)/);
  assert.match(source, /author:\s*asText\(item\?\.author\)/);
  assert.match(source, /reason:\s*asText\(item\?\.reason\)/);
  assert.match(modelSource, /interface CuratedReadingItem \{[\s\S]*author\?: string;[\s\S]*translator\?: string;[\s\S]*publisher\?: string;[\s\S]*reason\?: string;/);
});

test("generic curated-reading category placeholders never publish as recommendations", () => {
  assert.match(
    source,
    /function isCuratedReadingPlaceholder\(item:\s*any\)/,
    "program normalization should recognize generic category placeholders"
  );
  assert.match(
    source,
    /\["教育相关推荐",\s*"延伸阅读",\s*"参考书目"\]/,
    "known generic category titles should be rejected"
  );
  assert.match(
    source,
    /if \(isCuratedReadingPlaceholder\(reading\)\) return \[\];/,
    "public program detail should remove placeholders even if verification data is incorrect"
  );
  assert.match(
    source,
    /\.filter\(\(item\) => !isCuratedReadingPlaceholder\(item\)\)/,
    "admin and imported program payloads should not persist placeholder recommendations"
  );
  assert.match(
    dispatcherSource,
    /\["教育相关推荐",\s*"延伸阅读",\s*"参考书目"\]\.includes\(title\.replace\(\/\\s\+\/g,\s*""\)\)/,
    "enrichment reruns should discard legacy placeholder recommendations before merging"
  );
});
