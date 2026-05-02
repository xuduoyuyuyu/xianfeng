import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGlossaryDefinition,
  extractCandidateTerms,
  normalizePunctuation,
  normalizeSpaces,
  titleCaseEnglishToken,
} from "./agentTaskDispatcher";

test("normalizeSpaces collapses repeated whitespace", () => {
  assert.equal(normalizeSpaces("  hello   world  "), "hello world");
  assert.equal(normalizeSpaces("a\t\tb\n\nc"), "a b c");
});

test("normalizePunctuation converts common ASCII punctuation", () => {
  assert.equal(normalizePunctuation("A,B;C:D?!"), "A，B；C：D？！");
});

test("titleCaseEnglishToken normalizes ai/gpt/llm tokens", () => {
  assert.equal(titleCaseEnglishToken("ai with gpt and llm"), "AI with GPT and LLM");
  assert.equal(titleCaseEnglishToken("AI GPT LLM"), "AI GPT LLM");
});

test("extractCandidateTerms prefers meaningful repeated keywords", () => {
  const text = [
    "这一期我们讨论神经可塑性、执行功能和家校协同。",
    "神经可塑性在儿童发展中非常关键，执行功能影响学习策略。",
    "我们还会提到 GPT 和 LLM 在教育场景中的应用。",
  ].join("\n");
  const terms = extractCandidateTerms(text);
  assert.ok(terms.length > 0);
  assert.ok(terms.some((item) => item.includes("神经可塑性")));
  assert.ok(terms.some((item) => item.includes("执行功能")));
  assert.ok(terms.some((item) => item === "GPT" || item === "LLM"));
});

test("extractCandidateTerms filters filler words and spoken noise", () => {
  const text = [
    "哎呀 对对对 嗯嗯 呃呃 这一块来说我们主要聊执行功能和神经可塑性。",
    "对对 然后呢 其实孩子的执行功能会影响专注力和学习策略。",
    "本期还会提到家校协同和双减政策。",
  ].join("\n");
  const terms = extractCandidateTerms(text);
  assert.ok(terms.includes("执行功能"));
  assert.ok(terms.includes("神经可塑性"));
  assert.ok(terms.includes("家校协同"));
  assert.ok(!terms.includes("哎呀"));
  assert.ok(!terms.includes("对对"));
  assert.ok(!terms.includes("对对对"));
  assert.ok(!terms.includes("嗯嗯"));
  assert.ok(!terms.includes("呃呃"));
  assert.ok(!terms.includes("来说"));
});

test("buildGlossaryDefinition returns non-empty guidance", () => {
  const value = buildGlossaryDefinition("执行功能");
  assert.ok(value.includes("执行功能"));
  assert.ok(value.length > 10);
});
