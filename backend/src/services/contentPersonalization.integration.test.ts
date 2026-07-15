import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const programSource = fs.readFileSync(path.join(root, "controllers/program.ts"), "utf8");
const bookSource = fs.readFileSync(path.join(root, "controllers/book.ts"), "utf8");
const materialSource = fs.readFileSync(path.join(root, "controllers/learningMaterial.ts"), "utf8");
const topicSource = fs.readFileSync(path.join(root, "routes/topic.ts"), "utf8");

test("maps only approved real fields into advanced profile ranking", () => {
  assert.match(programSource, /structured:\s*\[\]/);
  assert.match(programSource, /tags:\s*\[item\.summary\?\.tags, item\.programShow\]/);
  assert.match(programSource, /title:\s*\[item\.title\]/);
  assert.match(programSource, /body:\s*\[item\.description, item\.summary\?\.headline, item\.summary\?\.body\]/);

  assert.match(bookSource, /structured:\s*\[plain\?\.grade\]/);
  assert.match(bookSource, /tags:\s*\[plain\?\.categoryLabel, plain\?\.topic, plain\?\.sourceName\]/);
  assert.match(bookSource, /scorePersonalizedContent/);
  assert.match(bookSource, /compareBookQualityScores\(left\.qualityScore, right\.qualityScore\)/);

  assert.match(materialSource, /tags:\s*\[item\.category\]/);
  assert.match(topicSource, /structured:\s*\[item\.suitableGrades\]/);
  assert.match(topicSource, /tags:\s*\[item\.tags\]/);
});

test("keeps profile ranking before pagination and outside explicit search", () => {
  assert.match(programSource, /const profile = q \? null : parseContentProfile/);
  assert.match(topicSource, /const profile = search \? null : parseContentProfile/);
  assert.match(programSource, /rankPersonalizedContent[\s\S]*\.slice\(skip, skip \+ pageSize\)/);
  assert.match(topicSource, /rankPersonalizedContent[\s\S]*\.slice\(\(pageNum - 1\) \* limitNum, pageNum \* limitNum\)/);

  const externalStart = bookSource.indexOf("async getExternalLibraryPublic");
  const publicStart = bookSource.indexOf("async getAllPublic", externalStart);
  const externalHandler = bookSource.slice(externalStart, publicStart);
  assert.doesNotMatch(externalHandler, /profileCity|rankPersonalizedContent|scorePersonalizedContent/);
});
