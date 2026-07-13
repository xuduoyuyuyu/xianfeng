import test from "node:test";
import assert from "node:assert/strict";

import { calculateBookQualityScore, compareBookQualityScores } from "./bookQualityScore";

const completeBook = {
  title: "完整图书",
  author: "作者",
  publisher: "出版社",
  isbn: "9780000000000",
  publishedDate: "2026-01-01",
  grade: "一年级、二年级",
  categoryLabel: "文学",
  topic: "成长/勇气",
  coverImage: "https://example.com/real-cover.jpg",
  sourceName: "真实书单",
  sourceGuestId: "guest-1",
  description: "这".repeat(50),
};

test("a complete manually confirmed book receives 100 points", () => {
  const result = calculateBookQualityScore(completeBook, {
    source: "真实书单",
    sourceId: "program-1",
    reviewedAt: new Date(),
  });

  assert.deepEqual(result, {
    totalScore: 100,
    rawScore: 100,
    contentScore: 75,
    confidenceScore: 25,
    tier: "normal",
    level: "完整可信",
    reasons: [],
  });
});

test("tag scoring deduplicates values and rejects placeholders", () => {
  const result = calculateBookQualityScore({
    ...completeBook,
    grade: "一年级、一年级",
    categoryLabel: "暂无",
    topic: "成长/其他",
  }, { reviewedAt: new Date() });

  assert.equal(result.contentScore, 67);
  assert.ok(result.reasons.includes("有效标签仅2个"));
});

test("match scores in 0-1 and 0-100 ranges produce the same confidence", () => {
  const decimal = calculateBookQualityScore(completeBook, { matchScore: 0.8, source: "来源", sourceId: "source-1" });
  const percentage = calculateBookQualityScore(completeBook, { matchScore: 80, source: "来源", sourceId: "source-1" });

  assert.equal(decimal.confidenceScore, 21);
  assert.equal(decimal.confidenceScore, percentage.confidenceScore);
});

test("confidence falls back to book source relationships without metadata", () => {
  assert.equal(calculateBookQualityScore(completeBook, null).confidenceScore, 15);
  assert.equal(calculateBookQualityScore({ ...completeBook, sourceGuestId: null }, null).confidenceScore, 10);
  assert.equal(calculateBookQualityScore({ ...completeBook, sourceGuestId: null, sourceName: "" }, null).confidenceScore, 0);
});

test("a missing description is placed in the penultimate tier and capped at 30", () => {
  const result = calculateBookQualityScore({ ...completeBook, description: "" }, { reviewedAt: new Date() });

  assert.equal(result.rawScore, 80);
  assert.equal(result.totalScore, 30);
  assert.equal(result.tier, "missing_description");
  assert.equal(result.level, "强降级");
  assert.ok(result.reasons.includes("简介为空，进入倒数第二组并封顶30分"));
});

test("fallback covers are last and capped according to description availability", () => {
  const withDescription = calculateBookQualityScore({ ...completeBook, coverImage: "https://via.placeholder.com/book" }, { reviewedAt: new Date() });
  const withoutDescription = calculateBookQualityScore({ ...completeBook, coverImage: "/assets/menu/jiyue-logo.png", description: "" }, { reviewedAt: new Date() });

  assert.equal(withDescription.totalScore, 15);
  assert.equal(withDescription.tier, "fallback_cover");
  assert.ok(withDescription.reasons.includes("兜底封面，强制末位并封顶15分"));
  assert.equal(withoutDescription.totalScore, 10);
  assert.equal(withoutDescription.tier, "fallback_cover");
  assert.ok(withoutDescription.reasons.includes("兜底封面且简介为空，强制末位并封顶10分"));
});

test("quality tiers outrank scores and equal scores remain stable", () => {
  const normal = { ...calculateBookQualityScore(completeBook, null), totalScore: 1, tier: "normal" as const };
  const missing = { ...normal, totalScore: 30, tier: "missing_description" as const };
  const fallback = { ...normal, totalScore: 15, tier: "fallback_cover" as const };

  assert.ok(compareBookQualityScores(normal, missing) < 0);
  assert.ok(compareBookQualityScores(missing, fallback) < 0);
  assert.equal(compareBookQualityScores(normal, { ...normal }), 0);
});
