import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { ANSWER_LABELS, CHILD_DIMENSIONS, DIMENSIONS, buildAnalysis, dimensionsForMode, levelForTotal, scoreAssessment } = require("./talentAssessment.js");

test("talent assessment keeps the requested dimension and question order", () => {
  assert.deepEqual(DIMENSIONS.map((item) => item.name), ["记忆", "推演", "表达", "感知", "数理", "操作", "狂热", "创造"]);
  assert.equal(DIMENSIONS.length, 8);
  assert.ok(DIMENSIONS.every((item) => item.questions.length === 5));
  assert.equal(ANSWER_LABELS[1], "完全不符合");
  assert.equal(ANSWER_LABELS[5], "完全符合");
});

test("child proxy mode uses a complete learning-and-life question set", () => {
  assert.deepEqual(CHILD_DIMENSIONS.map((item) => item.name), DIMENSIONS.map((item) => item.name));
  assert.equal(CHILD_DIMENSIONS.length, 8);
  assert.ok(CHILD_DIMENSIONS.every((item) => item.questions.length === 5));
  assert.ok(CHILD_DIMENSIONS.flatMap((item) => item.questions).every((question) => /孩子/.test(question)));
  assert.match(CHILD_DIMENSIONS.flatMap((item) => item.questions).join(""), /上课|作业|阅读|家庭|同伴|课堂/);
  assert.equal(dimensionsForMode("child"), CHILD_DIMENSIONS);
  assert.equal(dimensionsForMode("self"), DIMENSIONS);
});

test("talent assessment maps five answers to an integer 1-5 radar value", () => {
  const scores = scoreAssessment([
    ...Array(5).fill(5),
    ...Array(5).fill(4),
    ...Array(5).fill(3),
    ...Array(5).fill(2),
    ...Array(5).fill(1),
    5, 5, 4, 4, 4,
    4, 4, 4, 3, 3,
    5, 4, 3, 2, 1
  ]);

  assert.deepEqual(scores.map((item) => item.radarValue), [5, 4, 3, 2, 1, 4, 4, 3]);
  assert.deepEqual(scores.slice(0, 5).map((item) => item.level), [
    "顶级核心天赋",
    "顶级核心天赋",
    "优势可发展能力",
    "普通中等能力",
    "弱势短板能力"
  ]);
});

test("talent assessment rejects incomplete or invalid answers", () => {
  assert.throws(() => scoreAssessment(Array(39).fill(3)), /40/);
  assert.throws(() => scoreAssessment([...Array(39).fill(3), 0]), /1 到 5/);
});

test("talent assessment uses the requested total score bands", () => {
  assert.equal(levelForTotal(25), "顶级核心天赋");
  assert.equal(levelForTotal(20), "顶级核心天赋");
  assert.equal(levelForTotal(19), "优势可发展能力");
  assert.equal(levelForTotal(15), "优势可发展能力");
  assert.equal(levelForTotal(14), "普通中等能力");
  assert.equal(levelForTotal(10), "普通中等能力");
  assert.equal(levelForTotal(9), "弱势短板能力");
});

test("talent analysis changes the observation note for self and child modes without exposing scores", () => {
  const scores = scoreAssessment(Array(40).fill(4));
  const self = buildAnalysis(scores, "self");
  const child = buildAnalysis(scores, "child");

  assert.match(self.paragraphs.at(-1), /自测/);
  assert.match(child.paragraphs.at(-1), /代孩子作答/);
  assert.match(self.paragraphs[2], /均衡不等于/);
  assert.doesNotMatch(self.paragraphs[2], /相对不显眼|相对较弱/);
  assert.doesNotMatch(self.paragraphs.join(""), /20|4分|4\.0/);
});
