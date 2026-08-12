import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  CHARACTER_BANDS,
  CHARACTER_RECOGNITION_VERSION,
  CHARACTER_SAMPLE_SIZE,
  CHARACTERS_PER_BAND,
  buildCharacterRecognitionAnalysis,
  buildCharacterSample,
  estimateCharacterRecognition
} = require("./characterRecognition.js");

test("character recognition keeps six unique 15-character difficulty pools", () => {
  assert.equal(CHARACTER_RECOGNITION_VERSION, "2026-08-12-r4");
  assert.equal(CHARACTER_BANDS.length, 6);
  assert.ok(CHARACTER_BANDS.every((band) => band.length === 15));
  assert.equal(CHARACTERS_PER_BAND, 5);
  assert.equal(CHARACTER_SAMPLE_SIZE, 30);
  const characters = CHARACTER_BANDS.flat();
  assert.equal(new Set(characters).size, 90);
  assert.ok(characters.every((character) => /^\p{Script=Han}$/u.test(character)));
});

test("character recognition randomly selects five characters from every difficulty pool", () => {
  const firstSample = buildCharacterSample(() => 0.999999);
  const secondSample = buildCharacterSample(() => 0);
  const guaranteedRetestSample = buildCharacterSample(() => 0, secondSample);

  assert.equal(firstSample.length, 30);
  assert.equal(new Set(firstSample).size, 30);
  CHARACTER_BANDS.forEach((band, bandIndex) => {
    const sampledBand = firstSample.slice(bandIndex * 5, bandIndex * 5 + 5);
    assert.ok(sampledBand.every((character) => band.includes(character)));
  });
  assert.notDeepEqual(firstSample, secondSample);
  assert.notDeepEqual(guaranteedRetestSample, secondSample);
  assert.ok(guaranteedRetestSample.slice(0, 5).every((character) => CHARACTER_BANDS[0].includes(character)));
});

test("character recognition prioritizes characters not covered by earlier rounds", () => {
  const testedCharacters = CHARACTER_BANDS.flatMap((band) => band.slice(0, 5));
  const sample = buildCharacterSample(() => 0, [], testedCharacters);

  assert.equal(sample.length, 30);
  assert.ok(sample.every((character) => !testedCharacters.includes(character)));
});

test("character recognition returns a deliberately broad bounded estimate", () => {
  assert.deepEqual(estimateCharacterRecognition(Array(30).fill(0)), {
    recognizedCount: 0,
    sampledCount: 30,
    cumulativeRecognizedCount: 0,
    cumulativeSampledCount: 30,
    completedRounds: 1,
    estimatedMin: 0,
    estimatedMax: 150,
    estimateLabel: "0–150",
    reference: "仍在积累高频生活用字"
  });
  const middle = estimateCharacterRecognition([...Array(16).fill(1), ...Array(14).fill(0)]);
  assert.equal(middle.recognizedCount, 16);
  assert.equal(middle.estimateLabel, "1450–1750");
  assert.match(middle.reference, /第一学段/);
  assert.equal(estimateCharacterRecognition(Array(30).fill(1)).estimateLabel, "2850–3000+");
});

test("character recognition rejects incomplete or non-binary responses", () => {
  assert.throws(() => estimateCharacterRecognition(Array(29).fill(1)), /30/);
  assert.throws(() => estimateCharacterRecognition([...Array(29).fill(1), 2]), /认识或不认识/);
});

test("character recognition copy explains the parent-observed and non-diagnostic boundary", () => {
  const summary = estimateCharacterRecognition([...Array(18).fill(1), ...Array(12).fill(0)]);
  const analysis = buildCharacterRecognitionAnalysis(summary, "小圆子");
  assert.match(analysis.title, /小圆子本次认出 18 \/ 30/);
  assert.match(analysis.paragraphs.join(""), /6 个难度字库中各随机抽取 5 个/);
  assert.match(analysis.paragraphs.join(""), /不是让一个字固定代表 100 个字/);
  assert.match(analysis.paragraphs.join(""), /足够儿童样本标定、信效度检验并建立常模/);
  assert.match(analysis.paragraphs.join(""), /独立读出/);
  assert.match(analysis.paragraphs.join(""), /探索性换算区间/);
  assert.match(analysis.paragraphs.join(""), /不用于诊断/);
});

test("character recognition with fewer than five recognized samples does not present a quantity estimate", () => {
  const summary = estimateCharacterRecognition([1, ...Array(29).fill(0)]);
  const analysis = buildCharacterRecognitionAnalysis(summary, "小圆子");

  assert.equal(summary.estimateLabel, "0–250");
  assert.match(analysis.paragraphs.join(""), /不展示识字数量换算/);
  assert.doesNotMatch(analysis.paragraphs.join(""), /0–250/);
});
