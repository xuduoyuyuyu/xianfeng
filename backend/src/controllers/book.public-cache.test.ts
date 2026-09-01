import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Book from "../models/Book";
import { BookController } from "./book";

function createResponse() {
  return {
    statusCode: 0,
    payload: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.payload = payload;
      return this;
    },
  };
}

test("public book pages reuse their ranking source until a book mutation invalidates it", { timeout: 30_000 }, async () => {
  const mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
  await mongoose.connect(mongo.getUri());
  const originalFind = (Book as any).find;
  let publicBookFinds = 0;

  try {
    const created = await Book.create({
      title: "缓存测试书",
      author: "测试作者",
      coverImage: "https://example.com/book.jpg",
      description: "用于验证中文书单排序源缓存会复用数据库读取，并在内容变化后失效。",
      status: "published",
      publishedAt: new Date(),
    });
    (Book as any).find = function (...args: any[]) {
      publicBookFinds += 1;
      return originalFind.apply(this, args);
    };

    const controller = new BookController();
    const request = { query: { current: "1", size: "24" } } as any;
    const firstResponse = createResponse();
    await controller.getAllPublic(request, firstResponse as any);
    const secondResponse = createResponse();
    await controller.getAllPublic(request, secondResponse as any);

    assert.equal(firstResponse.statusCode, 200);
    assert.equal(secondResponse.statusCode, 200);
    assert.equal(firstResponse.payload.records[0].title, "缓存测试书");
    assert.equal(publicBookFinds, 1);

    const mutationResponse = createResponse();
    await controller.updateStatus({ params: { id: String(created._id) }, body: { status: "published" } } as any, mutationResponse as any);
    const thirdResponse = createResponse();
    await controller.getAllPublic(request, thirdResponse as any);

    assert.equal(mutationResponse.statusCode, 200);
    assert.equal(thirdResponse.statusCode, 200);
    assert.equal(publicBookFinds, 2);
  } finally {
    (Book as any).find = originalFind;
    await mongoose.disconnect();
    await mongo.stop();
  }
});
