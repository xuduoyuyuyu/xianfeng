import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import searchRoutes from "./search";
import adminSearchAnalyticsRoutes from "./adminSearchAnalytics";
import SearchAnalyticsEventModel from "../models/SearchAnalyticsEvent";

function eventPayload(clientEventId: string, sessionId: string, query: string, resultCounts: Record<string, number>) {
  return { clientEventId, sessionId, query, resultCounts };
}

test("search analytics records stable events, first clicks, and aggregate admin insights", async () => {
  const mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
  await mongoose.connect(mongo.getUri());
  const app = express();
  app.use(express.json());
  app.use("/api/search", searchRoutes);
  app.use("/api/admin", adminSearchAnalyticsRoutes);
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    const postEvent = async (payload: ReturnType<typeof eventPayload>) => {
      const response = await fetch(`${origin}/api/search/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      assert.equal(response.status, 200);
      return response.json() as Promise<{ eventId: string }>;
    };

    const first = await postEvent(eventPayload(
      "event_english_0001",
      "session_english_0001",
      "英语",
      { programs: 2, books: 3, materials: 1, topics: 0, experts: 0 }
    ));
    const duplicate = await postEvent(eventPayload(
      "event_english_0001",
      "session_english_0001",
      "输入前缀不应覆盖",
      { programs: 0, books: 0, materials: 0, topics: 0, experts: 0 }
    ));
    assert.equal(duplicate.eventId, first.eventId);
    assert.equal(await SearchAnalyticsEventModel.countDocuments(), 1);

    await postEvent(eventPayload(
      "event_english_0002",
      "session_english_0002",
      "英语",
      { programs: 1, books: 1, materials: 0, topics: 0, experts: 0 }
    ));
    await postEvent(eventPayload(
      "event_mars_0000001",
      "session_mars_0000001",
      "火星课程",
      { programs: 0, books: 0, materials: 0, topics: 0, experts: 0 }
    ));
    await postEvent(eventPayload(
      "event_mars_0000002",
      "session_mars_0000002",
      "火星课程",
      { programs: 0, books: 0, materials: 0, topics: 0, experts: 0 }
    ));

    const wrongSessionClick = await fetch(`${origin}/api/search/events/${first.eventId}/click`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "session_wrong_00001", resultType: "books", resultId: "book-1" }),
    });
    assert.equal(wrongSessionClick.status, 200);
    assert.equal((await SearchAnalyticsEventModel.findById(first.eventId).lean())?.clickedAt, null);

    const click = await fetch(`${origin}/api/search/events/${first.eventId}/click`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "session_english_0001", resultType: "books", resultId: "book-1" }),
    });
    assert.equal(click.status, 200);

    const unauthorized = await fetch(`${origin}/api/admin/search-analytics?days=7`);
    assert.equal(unauthorized.status, 401);

    const token = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: "admin" }, "your-secret-key");
    const analytics = await fetch(`${origin}/api/admin/search-analytics?days=7`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(analytics.status, 200);
    const payload: any = await analytics.json();
    assert.equal(payload.days, 7);
    assert.equal(payload.summary.totalSearches, 4);
    assert.equal(payload.summary.uniqueSessions, 4);
    assert.equal(payload.summary.uniqueQueries, 2);
    assert.equal(payload.summary.zeroResultSearches, 2);
    assert.equal(payload.summary.clickedSearches, 1);
    assert.deepEqual(payload.topQueries.map((row: any) => [row.query, row.count]), [["火星课程", 2], ["英语", 2]]);
    assert.deepEqual(payload.zeroResultQueries, [{ query: "火星课程", count: 2 }]);
    assert.equal(payload.resultTypeDistribution.find((row: any) => row.type === "books")?.count, 4);
    assert.deepEqual(payload.clickedTypeDistribution, [{ type: "books", count: 1 }]);
    assert.equal(payload.privacy.identitiesStored, false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test("search analytics masks phone-like queries before persistence", async () => {
  const mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
  await mongoose.connect(mongo.getUri());
  const app = express();
  app.use(express.json());
  app.use("/api/search", searchRoutes);
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/search/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(eventPayload(
        "event_sensitive_001",
        "session_sensitive_01",
        "联系 13800138000",
        { programs: 0, books: 0, materials: 0, topics: 0, experts: 0 }
      )),
    });
    assert.equal(response.status, 200);
    const stored = await SearchAnalyticsEventModel.findOne().lean();
    assert.equal(stored?.query, "[敏感内容已隐藏]");
    assert.equal(String(stored?.sessionHash || "").length, 64);
    assert.equal(JSON.stringify(stored).includes("session_sensitive_01"), false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await mongoose.disconnect();
    await mongo.stop();
  }
});
