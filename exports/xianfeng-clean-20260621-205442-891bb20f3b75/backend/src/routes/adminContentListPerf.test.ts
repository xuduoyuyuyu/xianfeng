import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import WorthBuyAnalysis from "../models/WorthBuyAnalysis";
import Topic from "../models/Topic";
import { adminRouter as adminTopicRouter } from "./topic";
import adminWorthbuyRouter from "./adminWorthbuy";

type TestServer = {
  close: () => Promise<void>;
  url: string;
};

async function startServer(routerPath: string, router: express.Router): Promise<TestServer> {
  const app = express();
  app.use(express.json());
  app.use(routerPath, router);

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected tcp server address");
  }
  return {
    url: `http://127.0.0.1:${address.port}${routerPath}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }),
  };
}

describe("admin content list routes", () => {
  let mongo: MongoMemoryServer;
  let topicServer: TestServer;
  let worthbuyServer: TestServer;

  before(async () => {
    mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await mongoose.connect(mongo.getUri());
    topicServer = await startServer("/api/admin/topic-hub", adminTopicRouter);
    worthbuyServer = await startServer("/api/admin/worthbuy", adminWorthbuyRouter);
  });

  after(async () => {
    await topicServer.close();
    await worthbuyServer.close();
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      Topic.deleteMany({}),
      WorthBuyAnalysis.deleteMany({}),
    ]);
  });

  it("paginates admin topic list and keeps heavy layer content out of list responses", async () => {
    await Topic.create([
      {
        title: "第一条",
        slug: "topic-1",
        subtitle: "a",
        status: "pending",
        createdBy: "user-1",
        layers: {
          layer1: [{ title: "节点1", summary: "摘要", content: "很长的详情内容-1" }],
          layer2: [],
          layer3: [],
          layer4: [],
          layer5: [],
        },
      },
      {
        title: "第二条",
        slug: "topic-2",
        subtitle: "b",
        status: "published",
        createdBy: "user-2",
        layers: {
          layer1: [{ title: "节点2", summary: "摘要", content: "很长的详情内容-2" }],
          layer2: [],
          layer3: [],
          layer4: [],
          layer5: [],
        },
      },
    ]);

    const listRes = await fetch(`${topicServer.url}?page=2&limit=1`);
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();

    assert.equal(listData.page, 2);
    assert.equal(listData.limit, 1);
    assert.equal(listData.total, 2);
    assert.equal(listData.topics.length, 1);
    assert.ok(["topic-1", "topic-2"].includes(listData.topics[0].slug));
    assert.equal(listData.topics[0].nodeCount, 1);
    assert.equal("layers" in listData.topics[0], false);
    assert.equal("userOriginalInput" in listData.topics[0], false);

    const detailRes = await fetch(`${topicServer.url}/topic-1`);
    assert.equal(detailRes.status, 200);
    const detailData = await detailRes.json();
    assert.equal(detailData.topic.layers.layer1[0].content, "很长的详情内容-1");
  });

  it("paginates admin worthbuy list and reserves full analysis for the detail route", async () => {
    await WorthBuyAnalysis.create([
      {
        brand: "品牌A",
        query: "品牌A 查询",
        status: "draft",
        result: {
          score: 81,
          reason: "一句话总评",
          recommendation: "详细推荐理由A",
          pros: ["优点A"],
          cons: ["缺点A"],
        },
      },
      {
        brand: "品牌B",
        query: "品牌B 查询",
        status: "published",
        result: {
          score: 67,
          reason: "一句话总评B",
          recommendation: "详细推荐理由B",
          pros: ["优点B"],
          cons: ["缺点B"],
        },
      },
    ]);

    const listRes = await fetch(`${worthbuyServer.url}?page=2&limit=1`);
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();

    assert.equal(listData.page, 2);
    assert.equal(listData.limit, 1);
    assert.equal(listData.total, 2);
    assert.equal(listData.items.length, 1);
    assert.ok(["品牌A", "品牌B"].includes(listData.items[0].brand));
    assert.equal(typeof listData.items[0].result.score, "number");
    assert.equal("recommendation" in listData.items[0].result, false);
    assert.equal("pros" in listData.items[0].result, false);

    const detailRes = await fetch(`${worthbuyServer.url}/${listData.items[0]._id}`);
    assert.equal(detailRes.status, 200);
    const detailData = await detailRes.json();
    assert.ok(detailData.item.result.recommendation);
    assert.ok(Array.isArray(detailData.item.result.pros));
  });

  it("soft deletes admin worthbuy items and hides them from the default list", async () => {
    const [deletedTarget, activeTarget] = await WorthBuyAnalysis.create([
      {
        brand: "待删除品牌",
        query: "待删除品牌",
        status: "published",
        result: { score: 82, reason: "可删除", recommendation: "完整内容" },
      },
      {
        brand: "保留品牌",
        query: "保留品牌",
        status: "published",
        result: { score: 91, reason: "保留", recommendation: "完整内容" },
      },
    ]);

    const deleteRes = await fetch(`${worthbuyServer.url}/${deletedTarget._id}`, { method: "DELETE" });
    assert.equal(deleteRes.status, 200);

    const deletedInDb = await WorthBuyAnalysis.findById(deletedTarget._id).lean();
    assert.equal(deletedInDb?.status, "deleted");

    const defaultListRes = await fetch(`${worthbuyServer.url}?page=1&limit=20`);
    assert.equal(defaultListRes.status, 200);
    const defaultListData = await defaultListRes.json();
    assert.deepEqual(defaultListData.items.map((item: any) => item.brand), [activeTarget.brand]);
    assert.equal(defaultListData.total, 1);

    const deletedListRes = await fetch(`${worthbuyServer.url}?status=deleted&page=1&limit=20`);
    assert.equal(deletedListRes.status, 200);
    const deletedListData = await deletedListRes.json();
    assert.deepEqual(deletedListData.items.map((item: any) => item.brand), [deletedTarget.brand]);
    assert.equal(deletedListData.total, 1);

    const restoreRes = await fetch(`${worthbuyServer.url}/${deletedTarget._id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "hidden" }),
    });
    assert.equal(restoreRes.status, 200);
    const restored = await WorthBuyAnalysis.findById(deletedTarget._id).lean();
    assert.equal(restored?.status, "hidden");
  });
});
