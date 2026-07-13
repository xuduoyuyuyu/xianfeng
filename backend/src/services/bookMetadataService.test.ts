import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import {
  buildBookMetadataPayload,
  getMetadataStatusForScore,
  listApprovedBookMetadataBookIds,
  listApprovedBookMetadataByBookIds,
  shouldProtectExistingBookMetadata,
  upsertBookMetadataManually,
} from "./bookMetadataService";
import BookMetadata from "../models/BookMetadata";

test("getMetadataStatusForScore auto-approves metadata at every confidence level", () => {
  assert.equal(getMetadataStatusForScore(0.85), "auto_approved");
  assert.equal(getMetadataStatusForScore(1), "auto_approved");
  assert.equal(getMetadataStatusForScore(0.8499), "auto_approved");
  assert.equal(getMetadataStatusForScore(0), "auto_approved");
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

test("buildBookMetadataPayload auto-approves low-confidence metadata", () => {
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

  assert.equal(payload.status, "auto_approved");
});

test("shouldProtectExistingBookMetadata only protects records that were manually reviewed", () => {
  assert.equal(shouldProtectExistingBookMetadata(null), false);
  assert.equal(shouldProtectExistingBookMetadata({ status: "auto_approved" }), false);
  assert.equal(shouldProtectExistingBookMetadata({ status: "needs_review" }), false);
  assert.equal(shouldProtectExistingBookMetadata({ status: "rejected" }), false);
  assert.equal(shouldProtectExistingBookMetadata({ status: "auto_approved", reviewedAt: new Date() }), true);
});

test("upsertBookMetadataManually creates and updates one detail row per book", { timeout: 30_000 }, async () => {
  const mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
  await mongoose.connect(mongo.getUri());

  try {
    const bookId = new mongoose.Types.ObjectId().toString();
    const created = await upsertBookMetadataManually(bookId, {
      title: "手动详情图书",
      description: "首次录入的详情",
    });

    assert.ok(created);
    assert.equal(created.title, "手动详情图书");
    assert.equal(created.description, "首次录入的详情");
    assert.equal(created.status, "auto_approved");

    const updated = await upsertBookMetadataManually(bookId, {
      description: "更新后的详情",
      status: "needs_review",
    });

    assert.ok(updated);
    assert.equal(updated.description, "更新后的详情");
    assert.equal(updated.status, "auto_approved");
    assert.equal(await BookMetadata.countDocuments({ bookId }), 1);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test("approved metadata readers include legacy review statuses", { timeout: 30_000 }, async () => {
  const mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
  await mongoose.connect(mongo.getUri());

  try {
    const approvedBookId = new mongoose.Types.ObjectId();
    const pendingBookId = new mongoose.Types.ObjectId();
    const rejectedBookId = new mongoose.Types.ObjectId();
    await BookMetadata.insertMany([
      { bookId: approvedBookId, title: "已采纳", description: "已采纳简介", status: "auto_approved" },
      { bookId: pendingBookId, title: "待审", description: "待审简介", status: "needs_review" },
      { bookId: rejectedBookId, title: "忽略", description: "忽略简介", status: "rejected" },
    ]);

    const metadataRows = await listApprovedBookMetadataByBookIds([
      String(approvedBookId),
      String(pendingBookId),
      String(rejectedBookId),
    ]);
    const metadataBookIds = await listApprovedBookMetadataBookIds();

    assert.equal(metadataRows.length, 3);
    assert.deepEqual(
      metadataRows.map((row) => String(row.bookId)).sort(),
      [String(approvedBookId), String(pendingBookId), String(rejectedBookId)].sort()
    );
    assert.deepEqual(
      metadataBookIds.sort(),
      [String(approvedBookId), String(pendingBookId), String(rejectedBookId)].sort()
    );
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
