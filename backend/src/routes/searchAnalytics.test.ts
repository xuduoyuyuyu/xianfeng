import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import searchRoutes from "./search";
import adminSearchAnalyticsRoutes from "./adminSearchAnalytics";
import SearchAnalyticsEventModel from "../models/SearchAnalyticsEvent";
import SearchIdentityConsentModel, { SEARCH_IDENTITY_NOTICE_VERSION } from "../models/SearchIdentityConsent";
import User from "../models/User";
import UserXiaowanziSync from "../models/UserXiaowanziSync";

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
    assert.equal(payload.privacy.identitiesStored, true);
    assert.equal(payload.privacy.identityRequiresRecordedConsent, true);
    assert.deepEqual(payload.wordCloud.map((row: any) => [row.query, row.count]), [["火星课程", 2], ["英语", 2]]);

    const stream = await fetch(`${origin}/api/admin/search-analytics/events?days=7&pageSize=100`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(stream.status, 200);
    const streamPayload: any = await stream.json();
    assert.equal(streamPayload.total, 4);
    assert.equal(streamPayload.items.every((row: any) => row.user === null), true);
    assert.equal(streamPayload.items.every((row: any) => /^匿名-[A-F0-9]{12}$/.test(row.anonymousKey)), true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test("search identity requires a recorded consent, backfills history, exposes user detail, and supports revocation", async () => {
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
    const [user, admin] = await Promise.all([
      User.create({
        username: "search-parent",
        password: "not-returned",
        mobile: "13800138000",
        name: "搜索家长",
        publicUid: "123456789",
        city: "上海",
        region: "浦东新区",
        childGrade: "三年级",
      }),
      User.create({ username: "search-admin", password: "not-returned", role: "admin" }),
    ]);
    await UserXiaowanziSync.create({
      userId: user._id,
      childProfiles: [{ id: "child-1", name: "小明", grade: "三年级", city: "上海" }],
    });
    const userToken = jwt.sign({ id: String(user._id), role: "user" }, "your-secret-key");
    const adminToken = jwt.sign({ id: String(admin._id), role: "admin" }, "your-secret-key");
    const sessionId = "session_identity_0001";
    const headers = { "content-type": "application/json", authorization: `Bearer ${userToken}` };

    const anonymous = await fetch(`${origin}/api/search/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(eventPayload("event_identity_0001", sessionId, "三年级阅读", { programs: 1, books: 2 })),
    });
    assert.equal(anonymous.status, 200);
    const authenticatedWithoutConsent = await fetch(`${origin}/api/search/events`, {
      method: "POST",
      headers,
      body: JSON.stringify(eventPayload("event_identity_0002", sessionId, "英语启蒙", { programs: 1, books: 1 })),
    });
    assert.equal(authenticatedWithoutConsent.status, 200);
    assert.equal(await SearchAnalyticsEventModel.countDocuments({ userId: user._id }), 0);

    const forgedConsent = await fetch(`${origin}/api/search/identity-consent`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId, accepted: true, noticeVersion: "old-or-forged-version" }),
    });
    assert.equal(forgedConsent.status, 400);
    assert.equal(await SearchIdentityConsentModel.countDocuments(), 0);

    const consent = await fetch(`${origin}/api/search/identity-consent`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId, accepted: true, noticeVersion: SEARCH_IDENTITY_NOTICE_VERSION }),
    });
    assert.equal(consent.status, 200);
    assert.equal((await consent.json() as any).linkedCount, 2);
    assert.equal(await SearchAnalyticsEventModel.countDocuments({ userId: user._id }), 2);
    assert.equal(await SearchIdentityConsentModel.countDocuments({ userId: user._id, status: "accepted" }), 1);

    await fetch(`${origin}/api/search/events`, {
      method: "POST",
      headers,
      body: JSON.stringify(eventPayload("event_identity_0003", sessionId, "数学思维", { programs: 0, books: 0 })),
    });
    assert.equal(await SearchAnalyticsEventModel.countDocuments({ userId: user._id }), 3);

    const identifiedStream = await fetch(`${origin}/api/admin/search-analytics/events?days=30&identity=identified&query=英语`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(identifiedStream.status, 200);
    const identifiedStreamPayload: any = await identifiedStream.json();
    assert.equal(identifiedStreamPayload.total, 1);
    assert.equal(identifiedStreamPayload.items[0].query, "英语启蒙");
    assert.equal(identifiedStreamPayload.items[0].user.id, String(user._id));

    const userList = await fetch(`${origin}/api/admin/search-analytics/users?days=30`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(userList.status, 200);
    const listPayload: any = await userList.json();
    assert.equal(listPayload.total, 1);
    assert.equal(listPayload.items[0].user.publicUid, "123456789");
    assert.equal(listPayload.items[0].user.mobile, "13800138000");
    assert.equal(listPayload.items[0].user.password, undefined);
    assert.equal(listPayload.items[0].children[0].name, "小明");
    assert.deepEqual(listPayload.items[0].behavior.topQueries.map((row: any) => row.query).sort(), ["三年级阅读", "数学思维", "英语启蒙"].sort());

    const detail = await fetch(`${origin}/api/admin/search-analytics/users/${user._id}?days=30`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(detail.status, 200);
    const detailPayload: any = await detail.json();
    assert.equal(detailPayload.total, 3);
    assert.equal(detailPayload.events.length, 3);
    assert.equal(detailPayload.behaviorProfile.clickThroughRate, 0);
    assert.equal(detailPayload.behaviorProfile.zeroResultRate, 1 / 3);
    assert.equal(detailPayload.user.wechatMiniOpenid, undefined);
    assert.equal(detailPayload.user.password, undefined);

    const revoke = await fetch(`${origin}/api/search/identity-consent`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ sessionId }),
    });
    assert.equal(revoke.status, 200);
    assert.equal((await revoke.json() as any).unlinkedCount, 3);
    assert.equal(await SearchAnalyticsEventModel.countDocuments({ userId: user._id }), 0);
    assert.equal(await SearchIdentityConsentModel.countDocuments({ userId: user._id, status: "revoked" }), 1);
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
