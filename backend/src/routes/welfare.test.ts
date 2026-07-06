import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import welfareRoutes from "./welfare";
import adminWelfareRoutes from "./adminWelfare";
import WelfareCampaign from "../models/WelfareCampaign";
import WelfareClaim from "../models/WelfareClaim";
import User from "../models/User";

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
    await WelfareClaim.deleteMany({});
    await User.deleteMany({});
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
});
