import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import ExternalBookSearchDocument from "../models/ExternalBookSearchDocument";
import SystemSetting from "../models/SystemSetting";
import {
  EXTERNAL_BOOK_SEARCH_INDEX_SETTING_KEY,
  searchExternalBookIndex,
  syncExternalBookSearchIndex,
} from "./externalBookSearchIndex";

test("external book search index stays out of the request path until a complete sync", async () => {
  const mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
  await mongoose.connect(mongo.getUri());

  try {
    await ExternalBookSearchDocument.syncIndexes();
    await ExternalBookSearchDocument.create({
      externalBookId: "book-1",
      title: "Monkey Island",
      author: "Paula Fox",
      tags: "Fiction",
      record: { id: "book-1", title: "Monkey Island", author: "Paula Fox" },
      syncedAt: new Date(),
    });
    await SystemSetting.findOneAndUpdate(
      { key: EXTERNAL_BOOK_SEARCH_INDEX_SETTING_KEY },
      { $set: { value: { ready: false, status: "syncing" } } },
      { upsert: true }
    );

    const result = await searchExternalBookIndex(1, 20, "monkey");
    assert.equal(result, null);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test("external book search index syncs pages and serves new keywords without another upstream query", async () => {
  const mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
  await mongoose.connect(mongo.getUri());
  const requestedPages: number[] = [];

  try {
    await ExternalBookSearchDocument.syncIndexes();
    await syncExternalBookSearchIndex({
      pageSize: 2,
      concurrency: 2,
      fetchPage: async (current, size) => {
        requestedPages.push(current);
        const records = current === 1
          ? [
            { id: "book-1", title: "Monkey Island", author: "Paula Fox", tags: "Fiction" },
            { id: "book-2", title: "A Different Animal", author: "Jane Doe", tags: "Nature" },
          ]
          : [{ id: "book-3", title: "Monkey King", author: "Wu Cheng'en", tags: "Classics" }];
        return { records, total: 3, size, current, pages: 2 };
      },
    });

    const result = await searchExternalBookIndex(1, 20, "monkey");
    const phraseResult = await searchExternalBookIndex(1, 20, "Monkey King");
    const missingPhraseResult = await searchExternalBookIndex(1, 20, "Monkey King Uproar");
    const state = await SystemSetting.findOne({ key: EXTERNAL_BOOK_SEARCH_INDEX_SETTING_KEY }).lean();

    assert.deepEqual(requestedPages, [1, 2]);
    assert.equal(result?.total, 2);
    assert.deepEqual(result?.records.map((record) => record.title).sort(), ["Monkey Island", "Monkey King"]);
    assert.deepEqual(phraseResult?.records.map((record) => record.title), ["Monkey King"]);
    assert.equal(missingPhraseResult?.total, 0);
    assert.equal((state?.value as any)?.ready, true);
    assert.equal((state?.value as any)?.indexedCount, 3);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test("external book search index resumes a failed sync without rewriting completed pages", async () => {
  const mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
  await mongoose.connect(mongo.getUri());
  const startedAt = new Date("2026-09-01T12:00:00.000Z");

  try {
    await ExternalBookSearchDocument.syncIndexes();
    await ExternalBookSearchDocument.create({
      externalBookId: "book-1",
      title: "Existing Monkey",
      record: { id: "book-1", title: "Existing Monkey" },
      syncedAt: startedAt,
    });
    await SystemSetting.findOneAndUpdate(
      { key: EXTERNAL_BOOK_SEARCH_INDEX_SETTING_KEY },
      { $set: { value: { ready: false, status: "failed", nextPage: 2, startedAt } } },
      { upsert: true }
    );

    await syncExternalBookSearchIndex({
      pageSize: 1,
      concurrency: 1,
      fetchPage: async (current, size) => ({
        records: current === 1
          ? [{ id: "book-1", title: "Rewritten Monkey" }]
          : [{ id: "book-2", title: "Second Monkey" }],
        total: 2,
        size,
        current,
        pages: 2,
      }),
    });

    const documents = await ExternalBookSearchDocument.find({}).sort({ externalBookId: 1 }).lean();
    assert.deepEqual(documents.map((document) => document.title), ["Existing Monkey", "Second Monkey"]);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});
