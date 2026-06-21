import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBookMetadataPayload,
  getMetadataStatusForScore,
  shouldProtectExistingBookMetadata,
} from "./bookMetadataService";

test("getMetadataStatusForScore auto-approves high-confidence metadata only", () => {
  assert.equal(getMetadataStatusForScore(0.85), "auto_approved");
  assert.equal(getMetadataStatusForScore(1), "auto_approved");
  assert.equal(getMetadataStatusForScore(0.8499), "needs_review");
  assert.equal(getMetadataStatusForScore(0), "needs_review");
});

test("buildBookMetadataPayload keeps source book identity and candidate fields", () => {
  const payload = buildBookMetadataPayload({
    sourceBook: {
      _id: "book-1",
      title: "俗世奇人",
      author: "冯骥才",
      publisher: "作家出版社",
      coverImage: "https://local/cover.jpg",
    },
    bestMatch: {
      title: "俗世奇人",
      author: "冯骥才",
      publisher: "人民文学出版社",
      isbn: "",
      cover: "https://weread/cover.jpg",
      description: "短篇小说和散文作品。",
      source: "weread_web",
      sourceId: "31283907",
      rating: 890,
      ratingCount: 1218,
      ratingLabel: "好评如潮",
      matchScore: 0.9,
      matchReason: ["title:exact", "author:exact"],
    },
    candidates: [],
    errors: [],
  });

  assert.equal(payload.bookId, "book-1");
  assert.equal(payload.title, "俗世奇人");
  assert.equal(payload.author, "冯骥才");
  assert.equal(payload.publisher, "人民文学出版社");
  assert.equal(payload.cover, "https://weread/cover.jpg");
  assert.equal(payload.description, "短篇小说和散文作品。");
  assert.equal(payload.source, "weread_web");
  assert.equal(payload.sourceId, "31283907");
  assert.equal(payload.rating, 890);
  assert.equal(payload.ratingCount, 1218);
  assert.equal(payload.ratingLabel, "好评如潮");
  assert.equal(payload.matchScore, 0.9);
  assert.equal(payload.status, "auto_approved");
});

test("buildBookMetadataPayload sends low-confidence metadata to review", () => {
  const payload = buildBookMetadataPayload({
    sourceBook: {
      _id: "book-2",
      title: "低分书",
      author: "作者",
      publisher: "",
      coverImage: "",
    },
    bestMatch: {
      title: "低分书",
      author: "作者",
      source: "weread_web",
      matchScore: 0.6,
      matchReason: ["title:exact"],
    },
    candidates: [],
    errors: [],
  });

  assert.equal(payload.status, "needs_review");
});

test("shouldProtectExistingBookMetadata protects reviewed or rejected records from auto overwrite", () => {
  assert.equal(shouldProtectExistingBookMetadata(null), false);
  assert.equal(shouldProtectExistingBookMetadata({ status: "auto_approved" }), false);
  assert.equal(shouldProtectExistingBookMetadata({ status: "needs_review" }), true);
  assert.equal(shouldProtectExistingBookMetadata({ status: "rejected" }), true);
  assert.equal(shouldProtectExistingBookMetadata({ status: "auto_approved", reviewedAt: new Date() }), true);
});
