import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import welfareRoutes from "./welfare";
import adminWelfareRoutes from "./adminWelfare";
import WelfareActivationCode from "../models/WelfareActivationCode";
import WelfareCampaign from "../models/WelfareCampaign";
import WelfareClaim from "../models/WelfareClaim";
import User from "../models/User";
import UserXiaowanziSync from "../models/UserXiaowanziSync";

type TestServer = {
  close: () => Promise<void>;
  publicUrl: string;
  adminUrl: string;
};

async function startServer(): Promise<TestServer> {
  const app = express();
  app.use(express.json());
  app.use("/api/welfare", welfareRoutes);
  app.use("/api/admin/welfare", adminWelfareRoutes);

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected tcp server address");
  }
  const base = `http://127.0.0.1:${address.port}`;
  return {
    publicUrl: `${base}/api/welfare`,
    adminUrl: `${base}/api/admin/welfare`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

function userToken(userId: string) {
  return jwt.sign({ id: userId, role: "user" }, process.env.JWT_SECRET || "your-secret-key");
}

describe("welfare campaign routes", () => {
  let mongo: MongoMemoryServer;
  let server: TestServer;

  before(async () => {
    mongo = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    await mongoose.connect(mongo.getUri());
    server = await startServer();
  });

  after(async () => {
    await server.close();
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await WelfareCampaign.deleteMany({});
    await WelfareActivationCode.deleteMany({});
    await WelfareClaim.deleteMany({});
    await User.deleteMany({});
    await UserXiaowanziSync.deleteMany({});
  });

  it("lets operators configure welfare campaigns and public users see active plus historical welfare", async () => {
    const now = new Date("2026-07-02T08:00:00.000Z");
    const activeResponse = await fetch(`${server.adminUrl}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "暑期资料包",
        subtitle: "限量 2 份",
        description: "领取后获得暑期规划资料。",
        coverImageUrl: "/assets/welfare-gift-icon.png",
        claimInstructions: "添加运营微信领取资料。",
        totalStock: 2,
        startsAt: "2026-07-01T00:00:00.000Z",
        endsAt: "2026-07-08T00:00:00.000Z",
        status: "published",
        sortOrder: 9,
      }),
    });
    assert.equal(activeResponse.status, 201);
    const activeData = await activeResponse.json();
    assert.equal(activeData.campaign.title, "暑期资料包");
    assert.equal(activeData.campaign.availability, "active");
    assert.equal(activeData.campaign.remainingStock, 2);

    await WelfareCampaign.create({
      title: "已过期试听课",
      subtitle: "历史福利",
      totalStock: 20,
      claimedCount: 4,
      startsAt: new Date("2026-06-01T00:00:00.000Z"),
      endsAt: new Date("2026-06-05T00:00:00.000Z"),
      status: "published",
    });
    await WelfareCampaign.create({
      title: "已抢完绘本",
      totalStock: 1,
      claimedCount: 1,
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
      endsAt: new Date("2026-07-08T00:00:00.000Z"),
      status: "published",
    });
    await WelfareCampaign.create({
      title: "隐藏草稿",
      totalStock: 5,
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
      endsAt: new Date("2026-07-08T00:00:00.000Z"),
      status: "draft",
    });

    const listResponse = await fetch(`${server.publicUrl}/campaigns?now=${encodeURIComponent(now.toISOString())}`);
    assert.equal(listResponse.status, 200);
    const listData = await listResponse.json();
    assert.deepEqual(
      listData.active.map((item: any) => item.title),
      ["暑期资料包"]
    );
    assert.deepEqual(
      listData.history.map((item: any) => item.title).sort(),
      ["已抢完绘本", "已过期试听课"].sort()
    );
    assert.equal(listData.active[0].remainingStock, 2);
    assert.equal(listData.history.find((item: any) => item.title === "已过期试听课").availability, "expired");
    assert.equal(listData.history.find((item: any) => item.title === "已抢完绘本").availability, "sold_out");
  });

  it("keeps activation-code campaign stock within claimed and code counts", async () => {
    const created = await WelfareCampaign.create({ title: "激活码福利", totalStock: 3, claimedCount: 0, status: "draft" });
    await WelfareActivationCode.insertMany([
      { campaignId: created._id, code: "CODE-A", importIndex: 0 },
      { campaignId: created._id, code: "CODE-B", importIndex: 1 },
      { campaignId: created._id, code: "CODE-C", importIndex: 2 },
    ]);

    const cappedResponse = await fetch(`${server.adminUrl}/${created._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: created.title, totalStock: 10, status: "draft" }),
    });
    assert.equal(cappedResponse.status, 200);
    assert.equal((await cappedResponse.json()).campaign.totalStock, 3);

    const lowerResponse = await fetch(`${server.adminUrl}/${created._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: created.title, totalStock: 2, status: "draft" }),
    });
    assert.equal(lowerResponse.status, 200);
    assert.equal((await lowerResponse.json()).campaign.totalStock, 2);

    await WelfareCampaign.updateOne({ _id: created._id }, { $set: { claimedCount: 2 } });
    const floorResponse = await fetch(`${server.adminUrl}/${created._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: created.title, totalStock: 1, status: "draft" }),
    });
    assert.equal(floorResponse.status, 200);
    assert.equal((await floorResponse.json()).campaign.totalStock, 2);

    await WelfareCampaign.updateOne({ _id: created._id }, { $set: { claimedCount: 0 } });
    await WelfareClaim.insertMany([
      { campaignId: created._id, userId: new mongoose.Types.ObjectId(), status: "claimed" },
      { campaignId: created._id, userId: new mongoose.Types.ObjectId(), status: "claimed" },
    ]);
    const documentFloorResponse = await fetch(`${server.adminUrl}/${created._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: created.title, totalStock: 1, status: "draft" }),
    });
    assert.equal(documentFloorResponse.status, 200);
    assert.equal((await documentFloorResponse.json()).campaign.totalStock, 2);

    await WelfareClaim.insertMany([
      { campaignId: created._id, userId: new mongoose.Types.ObjectId(), status: "claimed" },
      { campaignId: created._id, userId: new mongoose.Types.ObjectId(), status: "claimed" },
    ]);
    const inconsistentResponse = await fetch(`${server.adminUrl}/${created._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "不应保存", totalStock: 1, status: "published" }),
    });
    assert.equal(inconsistentResponse.status, 409);
    const unchanged = await WelfareCampaign.findById(created._id).lean();
    assert.equal(unchanged?.title, created.title);
    assert.equal(unchanged?.totalStock, 2);
    assert.equal(unchanged?.claimedCount, 2);
  });

  it("rejects a stock update when claimed count changes concurrently", async () => {
    const created = await WelfareCampaign.create({ title: "并发库存", totalStock: 3, claimedCount: 0, status: "draft" });
    await WelfareActivationCode.insertMany([
      { campaignId: created._id, code: "RACE-A", importIndex: 0 },
      { campaignId: created._id, code: "RACE-B", importIndex: 1 },
      { campaignId: created._id, code: "RACE-C", importIndex: 2 },
    ]);
    const originalCountDocuments = WelfareClaim.countDocuments.bind(WelfareClaim);
    WelfareClaim.countDocuments = (async (...args: any[]) => {
      const count = await originalCountDocuments(...args);
      await WelfareCampaign.updateOne({ _id: created._id }, { $set: { claimedCount: 3 } });
      return count;
    }) as any;

    try {
      const response = await fetch(`${server.adminUrl}/${created._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "不应覆盖并发领取", totalStock: 2, status: "published" }),
      });
      assert.equal(response.status, 409);
      const unchanged = await WelfareCampaign.findById(created._id).lean();
      assert.equal(unchanged?.title, created.title);
      assert.equal(unchanged?.totalStock, 3);
      assert.equal(unchanged?.claimedCount, 3);
    } finally {
      WelfareClaim.countDocuments = originalCountDocuments as any;
    }
  });

  it("requires login to claim welfare and prevents duplicate or unavailable claims", async () => {
    const now = new Date("2026-07-02T08:00:00.000Z");
    const user = await User.create({
      username: "welfare-user",
      password: "hash",
      mobile: "13800138000",
      role: "user",
    });
    const token = userToken(String(user._id));
    const active = await WelfareCampaign.create({
      title: "限量福利",
      totalStock: 1,
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
      endsAt: new Date("2026-07-08T00:00:00.000Z"),
      status: "published",
    });
    const expired = await WelfareCampaign.create({
      title: "过期福利",
      totalStock: 10,
      startsAt: new Date("2026-06-01T00:00:00.000Z"),
      endsAt: new Date("2026-06-08T00:00:00.000Z"),
      status: "published",
    });

    const unauthenticated = await fetch(`${server.publicUrl}/campaigns/${active._id}/claims`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ now: now.toISOString() }),
    });
    assert.equal(unauthenticated.status, 401);

    const claimResponse = await fetch(`${server.publicUrl}/campaigns/${active._id}/claims`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ now: now.toISOString() }),
    });
    assert.equal(claimResponse.status, 201);
    const claimData = await claimResponse.json();
    assert.equal(claimData.claim.userId, String(user._id));
    assert.equal(claimData.campaign.remainingStock, 0);
    assert.equal(claimData.campaign.availability, "sold_out");

    const duplicateResponse = await fetch(`${server.publicUrl}/campaigns/${active._id}/claims`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ now: now.toISOString() }),
    });
    assert.equal(duplicateResponse.status, 200);
    const duplicateData = await duplicateResponse.json();
    assert.equal(duplicateData.claim._id, claimData.claim._id);
    assert.equal(await WelfareClaim.countDocuments({ campaignId: active._id }), 1);
    assert.equal((await WelfareCampaign.findById(active._id).lean())?.claimedCount, 1);

    const expiredResponse = await fetch(`${server.publicUrl}/campaigns/${expired._id}/claims`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ now: now.toISOString() }),
    });
    assert.equal(expiredResponse.status, 410);
    const expiredData = await expiredResponse.json();
    assert.match(expiredData.message, /已过期/);
  });

  it("imports activation codes, assigns them in order, and exports claim reconciliation data", async () => {
    const now = new Date("2026-07-02T08:00:00.000Z");
    const firstUser = await User.create({
      username: "first-code-user",
      password: "hash",
      mobile: "13800138003",
      name: "用户一",
      role: "user",
    });
    const secondUser = await User.create({
      username: "second-code-user",
      password: "hash",
      mobile: "13800138004",
      name: "用户二",
      role: "user",
    });
    const thirdUser = await User.create({
      username: "third-code-user",
      password: "hash",
      mobile: "13800138005",
      role: "user",
    });
    const createResponse = await fetch(`${server.adminUrl}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "奇奇学会员",
        totalStock: 0,
        startsAt: "2026-07-01T00:00:00.000Z",
        endsAt: "2026-07-08T00:00:00.000Z",
        status: "published",
      }),
    });
    assert.equal(createResponse.status, 201);
    const createData = await createResponse.json();

    const importResponse = await fetch(`${server.adminUrl}/${createData.campaign._id}/activation-codes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codesText: "QIQI-A\nQIQI-B\nQIQI-A" }),
    });
    assert.equal(importResponse.status, 200);
    const importData = await importResponse.json();
    assert.equal(importData.importedCount, 2);
    assert.equal(importData.skippedCount, 1);
    assert.equal(importData.campaign.totalStock, 2);
    assert.equal(importData.campaign.activationCodeCount, 2);
    assert.equal(importData.campaign.activationCodeRemainingCount, 2);

    const firstClaimResponse = await fetch(`${server.publicUrl}/campaigns/${createData.campaign._id}/claims`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken(String(firstUser._id))}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ now: now.toISOString() }),
    });
    assert.equal(firstClaimResponse.status, 201);
    const firstClaim = await firstClaimResponse.json();
    assert.equal(firstClaim.claim.activationCode, "QIQI-A");

    const duplicateResponse = await fetch(`${server.publicUrl}/campaigns/${createData.campaign._id}/claims`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken(String(firstUser._id))}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ now: now.toISOString() }),
    });
    assert.equal(duplicateResponse.status, 200);
    const duplicateData = await duplicateResponse.json();
    assert.equal(duplicateData.claim.activationCode, "QIQI-A");

    const listResponse = await fetch(`${server.publicUrl}/campaigns?now=${encodeURIComponent(now.toISOString())}`, {
      headers: { Authorization: `Bearer ${userToken(String(firstUser._id))}` },
    });
    assert.equal(listResponse.status, 200);
    const listData = await listResponse.json();
    assert.equal(listData.active[0].claimedByMe, true);
    assert.equal(listData.active[0].activationCode, "QIQI-A");

    const secondClaimResponse = await fetch(`${server.publicUrl}/campaigns/${createData.campaign._id}/claims`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken(String(secondUser._id))}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ now: now.toISOString() }),
    });
    assert.equal(secondClaimResponse.status, 201);
    const secondClaim = await secondClaimResponse.json();
    assert.equal(secondClaim.claim.activationCode, "QIQI-B");

    const soldOutResponse = await fetch(`${server.publicUrl}/campaigns/${createData.campaign._id}/claims`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken(String(thirdUser._id))}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ now: now.toISOString() }),
    });
    assert.equal(soldOutResponse.status, 409);

    const claimsResponse = await fetch(`${server.adminUrl}/${createData.campaign._id}/claims`);
    assert.equal(claimsResponse.status, 200);
    const claimsData = await claimsResponse.json();
    assert.deepEqual(
      claimsData.claims.map((claim: any) => claim.activationCode).sort(),
      ["QIQI-A", "QIQI-B"]
    );

    const exportResponse = await fetch(`${server.adminUrl}/${createData.campaign._id}/claims/export`);
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get("content-type") || "", /text\/csv/);
    const csv = await exportResponse.text();
    assert.match(csv, /福利标题,领取时间,状态,用户ID,昵称,用户名,手机号,城市,地区,孩子档案,激活码/);
    assert.match(csv, /QIQI-A/);
    assert.match(csv, /QIQI-B/);
  });

  it("marks campaigns already claimed by the current user on the public list", async () => {
    const now = new Date("2026-07-02T08:00:00.000Z");
    const user = await User.create({
      username: "claimed-user",
      password: "hash",
      mobile: "13800138001",
      role: "user",
    });
    const otherUser = await User.create({
      username: "other-user",
      password: "hash",
      mobile: "13800138002",
      role: "user",
    });
    const claimed = await WelfareCampaign.create({
      title: "已领福利",
      totalStock: 10,
      claimedCount: 1,
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
      endsAt: new Date("2026-07-08T00:00:00.000Z"),
      status: "published",
      sortOrder: 2,
    });
    const unclaimed = await WelfareCampaign.create({
      title: "未领福利",
      totalStock: 10,
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
      endsAt: new Date("2026-07-08T00:00:00.000Z"),
      status: "published",
      sortOrder: 1,
    });
    await WelfareClaim.create({
      campaignId: claimed._id,
      userId: user._id,
      claimedAt: now,
    });
    await WelfareClaim.create({
      campaignId: unclaimed._id,
      userId: otherUser._id,
      claimedAt: now,
    });

    const anonymousResponse = await fetch(`${server.publicUrl}/campaigns?now=${encodeURIComponent(now.toISOString())}`);
    assert.equal(anonymousResponse.status, 200);
    const anonymousData = await anonymousResponse.json();
    assert.equal(anonymousData.active.find((item: any) => item.title === "已领福利").claimedByMe, false);

    const authenticatedResponse = await fetch(`${server.publicUrl}/campaigns?now=${encodeURIComponent(now.toISOString())}`, {
      headers: { Authorization: `Bearer ${userToken(String(user._id))}` },
    });
    assert.equal(authenticatedResponse.status, 200);
    const authenticatedData = await authenticatedResponse.json();
    assert.equal(authenticatedData.active.find((item: any) => item.title === "已领福利").claimedByMe, true);
    assert.equal(authenticatedData.active.find((item: any) => item.title === "未领福利").claimedByMe, false);
  });

  it("returns user and child profile details in admin claim history", async () => {
    const now = new Date("2026-07-02T08:00:00.000Z");
    const user = await User.create({
      username: "u13800138000",
      password: "hash",
      mobile: "13800138000",
      name: "阿力",
      childGrade: "一年级",
      role: "user",
    });
    await UserXiaowanziSync.create({
      userId: user._id,
      childProfiles: [
        { id: "child-1", displayName: "小圆子", accurateAge: "6岁2个月", grade: "一年级" },
        { id: "child-2", displayName: "已删除", age: "4岁" },
      ],
      childProfileDeletions: [{ id: "child-2", removedAt: now.toISOString() }],
    });
    const campaign = await WelfareCampaign.create({
      title: "资料包",
      totalStock: 10,
      status: "published",
    });
    await WelfareClaim.create({
      campaignId: campaign._id,
      userId: user._id,
      claimedAt: now,
    });

    const response = await fetch(`${server.adminUrl}/${campaign._id}/claims`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.claims[0].user.nickname, "阿力");
    assert.equal(data.claims[0].user.mobile, "13800138000");
    assert.equal(data.claims[0].user.childGrade, "一年级");
    assert.deepEqual(data.claims[0].children, [
      { id: "child-1", name: "小圆子", age: "6岁2个月", grade: "一年级" },
    ]);
  });
});
