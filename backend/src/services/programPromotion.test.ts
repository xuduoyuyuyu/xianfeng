import assert from "node:assert/strict";
import test from "node:test";
import { PROGRAM_PROMOTION_WINDOW_MS, isProgramInPromotionWindow } from "./programPromotion";

const NOW = Date.parse("2026-07-22T12:00:00.000Z");

test("keeps a newly published program promoted for seven days", () => {
  assert.equal(isProgramInPromotionWindow({ publishedAt: new Date(NOW - 1) }, NOW), true);
  assert.equal(isProgramInPromotionWindow({ publishedAt: new Date(NOW - PROGRAM_PROMOTION_WINDOW_MS + 1) }, NOW), true);
});

test("unlocks a promoted program at the seven-day boundary", () => {
  assert.equal(isProgramInPromotionWindow({ publishedAt: new Date(NOW - PROGRAM_PROMOTION_WINDOW_MS) }, NOW), false);
  assert.equal(isProgramInPromotionWindow({ publishedAt: new Date(NOW - PROGRAM_PROMOTION_WINDOW_MS - 1) }, NOW), false);
});

test("falls back to creation time and rejects invalid or future timestamps", () => {
  assert.equal(isProgramInPromotionWindow({ createdAt: new Date(NOW - 1) }, NOW), true);
  assert.equal(isProgramInPromotionWindow({}, NOW), false);
  assert.equal(isProgramInPromotionWindow({ publishedAt: new Date(NOW + 1) }, NOW), false);
});
