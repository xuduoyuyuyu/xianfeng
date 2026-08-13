import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  CHARACTER_BANK,
  BASE_CHARACTER_BANK,
  ADVANCED_CHARACTER_BANK,
  BASE_CHARACTER_RECOGNITION_VERSION,
  CHARACTER_PAGE_COUNT,
  CHARACTER_RECOGNITION_VERSION,
  CHARACTER_SAMPLE_SIZE,
  CHARACTER_STAGES,
  CHARACTERS_PER_PAGE,
  buildCharacterPage,
  buildCharacterRecognitionAnalysis,
  buildCharacterRecognitionSummary
} = require("./characterRecognition.js");

test("character recognition bank preserves the first 800 and adds 800 unique advanced characters", () => {
  assert.equal(BASE_CHARACTER_RECOGNITION_VERSION, "2026-08-13-r1");
  assert.equal(CHARACTER_RECOGNITION_VERSION, "2026-08-13-r3");
  assert.equal(CHARACTER_SAMPLE_SIZE, 1600);
  assert.equal(BASE_CHARACTER_BANK.length, 800);
  assert.equal(ADVANCED_CHARACTER_BANK.length, 800);
  assert.equal(CHARACTER_BANK.length, 1600);
  assert.equal(new Set(CHARACTER_BANK).size, 1600);
  assert.ok(CHARACTER_BANK.every((character) => /^\p{Script=Han}$/u.test(character)));
  assert.equal(CHARACTER_STAGES.length, 8);
  assert.ok(CHARACTER_STAGES.every((stage) => stage.end - stage.start === 200));
});

test("character recognition presents 20 characters per page from easy to hard", () => {
  assert.equal(CHARACTERS_PER_PAGE, 20);
  assert.equal(CHARACTER_PAGE_COUNT, 80);
  const firstPage = buildCharacterPage(0, Array(1600).fill(1));
  const lastPage = buildCharacterPage(79, Array(1600).fill(1));
  assert.equal(firstPage.characters.length, 20);
  assert.equal(firstPage.characters.map((item) => item.character).join(""), CHARACTER_BANK.slice(0, 20).join(""));
  assert.equal(firstPage.stage.id, "preschool-small");
  assert.equal(lastPage.stage.id, "advanced-four");
  assert.equal(lastPage.end, 1600);
  const secondGroupFirstPage = buildCharacterPage(0, Array(800).fill(1), 2);
  assert.equal(secondGroupFirstPage.characters.map((item) => item.character).join(""), ADVANCED_CHARACTER_BANK.slice(0, 20).join(""));
  assert.equal(secondGroupFirstPage.stage.id, "advanced-one");
});

test("character recognition marks only tapped characters as unknown", () => {
  const answers = Array(1600).fill(1);
  answers[3] = 0;
  const page = buildCharacterPage(0, answers);
  assert.equal(page.characters[3].unknown, true);
  assert.equal(page.characters[2].unknown, false);
});

test("character recognition returns an exact cumulative 1600-character checklist result", () => {
  const answers = [...Array(1235).fill(1), ...Array(365).fill(0)];
  const summary = buildCharacterRecognitionSummary(answers);
  assert.equal(summary.recognizedCount, 1235);
  assert.equal(summary.sampledCount, 1600);
  assert.equal(summary.estimatedMin, 1235);
  assert.equal(summary.estimatedMax, 1235);
  assert.equal(summary.estimateLabel, "1235");
  assert.equal(summary.stageResults.length, 8);
  assert.equal(summary.completedRounds, 2);
  assert.deepEqual(summary.stageResults.map((item) => item.recognizedCount), [200, 200, 200, 200, 200, 200, 35, 0]);
});

test("character recognition keeps both 800-character groups independent", () => {
  const firstGroup = buildCharacterRecognitionSummary([...Array(719).fill(1), ...Array(81).fill(0)], 1);
  const secondGroup = buildCharacterRecognitionSummary([...Array(200).fill(1), ...Array(600).fill(0)], 2);

  assert.equal(firstGroup.sampledCount, 800);
  assert.equal(firstGroup.recognizedCount, 719);
  assert.equal(firstGroup.reference, "第 1 组 800 字逐字筛选结果");
  assert.equal(secondGroup.sampledCount, 800);
  assert.equal(secondGroup.recognizedCount, 200);
  assert.equal(secondGroup.reference, "第 2 组 800 字逐字筛选结果");
  assert.deepEqual(secondGroup.stageResults.map((item) => item.id), ["advanced-one", "advanced-two", "advanced-three", "advanced-four"]);
  assert.deepEqual(secondGroup.stageResults.map((item) => item.recognizedCount), [200, 0, 0, 0]);
});

test("character recognition rejects incomplete or non-binary responses", () => {
  assert.throws(() => buildCharacterRecognitionSummary(Array(799).fill(1)), /800/);
  assert.throws(() => buildCharacterRecognitionSummary([...Array(1599).fill(1), 2]), /认识或不认识/);
});

test("character recognition copy explains exact checklist and non-diagnostic boundaries", () => {
  const summary = buildCharacterRecognitionSummary([...Array(1520).fill(1), ...Array(80).fill(0)]);
  const analysis = buildCharacterRecognitionAnalysis(summary, "小圆子");
  assert.equal(analysis.title, "小圆子已确认认识 1520 个字");
  assert.match(analysis.paragraphs.join(""), /逐字筛选/);
  assert.match(analysis.paragraphs.join(""), /不是用少量样本推算/);
  assert.match(analysis.paragraphs.join(""), /统编小学语文一年级上册、下册和二年级上册/);
  assert.match(analysis.paragraphs.join(""), /不是官方达标线/);
  assert.match(analysis.paragraphs.join(""), /不用于诊断/);
});
