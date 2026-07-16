import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { escapeSearchRegex } from "./search";
import searchRoutes from "./search";
import Program from "../models/Program";
import Book from "../models/Book";
import LearningMaterial from "../models/LearningMaterial";
import GuestModel from "../models/Guest";
import Topic from "../models/Topic";

test("search treats user input as literal text", () => {
  const input = "教育.*(1+1)?";
  const expression = new RegExp(escapeSearchRegex(input), "i");
  assert.equal(expression.test(input), true);
  assert.equal(expression.test("教育 xyz 11"), false);
});

test("search returns only matched public card summaries", async () => {
  const mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
  await mongoose.connect(mongo.getUri());
  const app = express();
  app.use("/api/search", searchRoutes);
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  try {
    await Promise.all([
      Program.create({ programCode: "family-education", title: "家庭教育讲座", description: "帮助父母建立家庭规则", coverImage: "/program.png", status: "published" }),
      Program.create({ programCode: "education-draft", title: "内部教育草稿", description: "不应出现", coverImage: "/draft.png", status: "draft" }),
      Book.create({ title: "教育的方法", coverImage: "/book.png", status: "published" }),
      LearningMaterial.create({ title: "家庭教育指南", description: "实用资料", fileUrl: "https://example.com/guide.pdf", category: "通用", status: "published" }),
      GuestModel.create({ name: "教育专家", normalizedName: "教育专家", title: "家庭教育研究者", status: "active" }),
      Topic.create({ slug: "family-education", title: "家庭教育", status: "published" }),
    ]);

    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/search?q=${encodeURIComponent("教育")}`);
    assert.equal(response.status, 200);
    const payload: any = await response.json();
    assert.deepEqual(payload.programs.map((item: any) => item.title), ["家庭教育讲座"]);
    assert.equal(payload.books.length, 1);
    assert.equal(payload.materials.length, 1);
    assert.equal(payload.topics.length, 1);
    assert.equal(payload.experts.length, 1);
    assert.equal(JSON.stringify(payload).includes("内部教育草稿"), false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await mongoose.disconnect();
    await mongo.stop();
  }
});
