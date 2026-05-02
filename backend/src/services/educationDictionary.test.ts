import test from "node:test";
import assert from "node:assert/strict";
import { isHighQualityEducationTerm } from "./educationDictionary";

test("isHighQualityEducationTerm accepts education terms", () => {
  assert.equal(isHighQualityEducationTerm("执行功能"), true);
  assert.equal(isHighQualityEducationTerm("神经可塑性"), true);
  assert.equal(isHighQualityEducationTerm("家校协同"), true);
  assert.equal(isHighQualityEducationTerm("双减政策"), true);
  assert.equal(isHighQualityEducationTerm("LLM"), true);
});

test("isHighQualityEducationTerm rejects noisy or sentence-like terms", () => {
  assert.equal(isHighQualityEducationTerm("CHILL"), false);
  assert.equal(isHighQualityEducationTerm("KNOCK"), false);
  assert.equal(isHighQualityEducationTerm("包括他的内容是不具备这个能力"), false);
  assert.equal(isHighQualityEducationTerm("但大多数人不具备这个能力"), false);
  assert.equal(isHighQualityEducationTerm("但事实上它并不构成长尾理论"), false);
  assert.equal(isHighQualityEducationTerm("哎呀"), false);
});

