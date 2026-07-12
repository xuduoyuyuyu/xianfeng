import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { BookController } from "./book";
import Book from "../models/Book";
import BookMetadata from "../models/BookMetadata";

async function requestBookPage(current: number, size: number) {
  let statusCode = 0;
  let payload: any;
  const req = { query: { current: String(current), size: String(size) } } as any;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: any) {
      payload = value;
      return this;
    },
  } as any;

  await new BookController().getAllPublic(req, res);
  assert.equal(statusCode, 200);
  return payload;
}

test("paged public books globally prioritize metadata and base descriptions", async () => {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  try {
    const dates = [1, 2, 3, 4, 5].map((day) => new Date(`2026-01-0${day}T00:00:00.000Z`));
    const [metadataDescription, baseDescription, emptyMetadata, missingNewest, missingOldest] = await Book.create([
      { title: "元数据简介", author: "A", coverImage: "a", description: "", status: "published", publishedAt: dates[0] },
      { title: "原始简介", author: "B", coverImage: "b", description: "真实原始简介", status: "published", publishedAt: dates[1] },
      { title: "空元数据", author: "C", coverImage: "c", description: "", status: "published", publishedAt: dates[2] },
      { title: "无简介较新", author: "D", coverImage: "d", description: "", status: "published", publishedAt: dates[4] },
      { title: "无简介较旧", author: "E", coverImage: "e", description: "", status: "published", publishedAt: dates[3] },
    ]);
    await BookMetadata.create([
      { bookId: metadataDescription._id, description: "真实元数据简介", status: "auto_approved" },
      { bookId: emptyMetadata._id, description: "", status: "auto_approved" },
    ]);

    const firstPage = await requestBookPage(1, 2);
    const secondPage = await requestBookPage(2, 2);
    const thirdPage = await requestBookPage(3, 2);
    const titles = [...firstPage.records, ...secondPage.records, ...thirdPage.records].map((book) => book.title);

    assert.deepEqual(firstPage.records.map((book: any) => book.title), ["原始简介", "元数据简介"]);
    assert.deepEqual(titles, ["原始简介", "元数据简介", "无简介较新", "无简介较旧", "空元数据"]);
    assert.equal(new Set(titles).size, 5);
    assert.equal(firstPage.total, 5);
  } finally {
    await mongoose.disconnect();
    await mongod.stop();
  }
});
