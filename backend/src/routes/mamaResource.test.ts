import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import mamaResourceRoutes from "./mamaResource";
import adminMamaResourceRoutes from "./adminMamaResource";
import MamaResourceProfile from "../models/MamaResourceProfile";
import MamaResourceTask from "../models/MamaResourceTask";
import MamaResourceTaskAssignment from "../models/MamaResourceTaskAssignment";
import User from "../models/User";

type TestServer = {
  close: () => Promise<void>;
  publicUrl: string;
  adminUrl: string;
};

async function startServer(): Promise<TestServer> {
  const app = express();
  app.use(express.json());
  app.use("/api/mama-resources", mamaResourceRoutes);
  app.use("/api/admin/mama-resources", adminMamaResourceRoutes);

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected tcp server address");
  }
  const base = `http://127.0.0.1:${address.port}`;
  return {
    publicUrl: `${base}/api/mama-resources`,
    adminUrl: `${base}/api/admin/mama-resources`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }),
  };
}

describe("mama resource pool routes", () => {
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
    await MamaResourceProfile.deleteMany({});
    await MamaResourceTask.deleteMany({});
    await MamaResourceTaskAssignment.deleteMany({});
    await User.deleteMany({});
  });

  it("uploads a public Xiaohongshu account screenshot", async () => {
    const form = new FormData();
    form.append("file", new Blob(["demo image"], { type: "image/png" }), "account.png");

    const response = await fetch(`${server.publicUrl}/uploads`, {
      method: "POST",
      body: form,
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.match(data.url, /^\/uploads\/mama-resources\/.+\.png$/);
    await fs.unlink(path.join(process.cwd(), data.url.replace(/^\//, ""))).catch(() => undefined);
  });

  it("accepts WeChat screenshot uploads sent as octet-stream with an image filename", async () => {
    const form = new FormData();
    form.append("file", new Blob(["demo image"], { type: "application/octet-stream" }), "wechat-screenshot.jpg");

    const response = await fetch(`${server.publicUrl}/uploads`, {
      method: "POST",
      body: form,
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.match(data.url, /^\/uploads\/mama-resources\/.+\.jpg$/);
    await fs.unlink(path.join(process.cwd(), data.url.replace(/^\//, ""))).catch(() => undefined);
  });

  it("accepts a light public application without sensitive credentials", async () => {
    const response = await fetch(`${server.publicUrl}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "安安妈妈",
        contactWechat: "anan-mom",
        city: "上海",
        childStage: "小学",
        childGender: "男孩",
        xiaohongshuProfileUrl: "https://www.xiaohongshu.com/user/profile/abc123?xsec_token=secret",
        xiaohongshuScreenshotUrl: "/uploads/mama-resources/account.png",
        followerCount: "12800",
        realNameVerified: true,
        accountPositioning: "亲子阅读和学习用品",
        categories: ["亲子阅读", "学习用品"],
        rateRange: "300-500",
        availability: "每周 2 篇",
        caseLinksText: "https://www.xiaohongshu.com/explore/note-1\nhttps://www.xiaohongshu.com/explore/note-2",
        consentAccepted: true,
      }),
    });

    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(data.profile.status, "approved");
    assert.equal(data.profile.socialAccount.platform, "xiaohongshu");
    assert.equal(data.profile.socialAccount.profileUrl, "https://www.xiaohongshu.com/user/profile/abc123");
    assert.equal(data.profile.socialAccount.screenshotUrl, "/uploads/mama-resources/account.png");
    assert.equal(data.profile.socialAccount.followerCount, 12800);
    assert.equal(data.profile.socialAccount.realNameVerified, true);
    assert.equal(data.profile.contactWechat, "anan-mom");
    assert.equal(data.profile.contactPhone, "");
    assert.equal(data.profile.childGender, "男孩");
    assert.equal(data.profile.contentCases.length, 0);
    assert.equal(data.profile.rateCard.rateRange, "");
    assert.equal(data.profile.rateCard.availability, "");
    assert.equal("password" in data.profile, false);
  });

  it("accepts separated personal info with multiple media accounts while keeping a primary account", async () => {
    const response = await fetch(`${server.publicUrl}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "多账号妈妈",
        contactWechat: "multi-mom",
        contactPhone: "13800001111",
        city: "上海",
        childStage: "小学",
        childGender: "女孩",
        accountPositioning: "亲子阅读和家庭教育",
        categories: ["亲子阅读", "家庭消费"],
        blockedCategories: ["医美"],
        consentAccepted: true,
        mediaAccounts: [
          {
            platform: "xiaohongshu",
            profileUrl: "https://www.xiaohongshu.com/user/profile/primary?xsec_token=secret",
            screenshotUrl: "/uploads/mama-resources/primary.png",
            followerCount: "12000",
            realNameVerified: true,
          },
          {
            platform: "xiaohongshu",
            profileUrl: "https://www.xiaohongshu.com/user/profile/backup",
            followerCount: "3600",
          },
          {
            platform: "douyin",
            profileUrl: "https://www.douyin.com/user/abc",
            nickname: "抖音亲子号",
            followerCount: "8000",
          },
        ],
      }),
    });

    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(data.profile.status, "approved");
    assert.equal(data.profile.socialAccount.platform, "xiaohongshu");
    assert.equal(data.profile.socialAccount.profileUrl, "https://www.xiaohongshu.com/user/profile/primary");
    assert.equal(data.profile.socialAccount.normalizedProfileUrl, "xiaohongshu:user/profile/primary");
    assert.equal(data.profile.socialAccount.followerCount, 12000);
    assert.equal(data.profile.mediaAccounts.length, 3);
    assert.equal(data.profile.mediaAccounts[1].platform, "xiaohongshu");
    assert.equal(data.profile.mediaAccounts[1].followerCount, 3600);
    assert.equal(data.profile.mediaAccounts[2].platform, "douyin");
    assert.equal(data.profile.mediaAccounts[2].normalizedProfileUrl, "douyin:https://www.douyin.com/user/abc");
    assert.deepEqual(data.profile.rateCard.blockedCategories, ["医美"]);
  });

  it("requires WeChat as the primary contact instead of phone", async () => {
    const response = await fetch(`${server.publicUrl}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "安安妈妈",
        contactPhone: "13800000000",
        xiaohongshuProfileUrl: "https://www.xiaohongshu.com/user/profile/primary-contact",
        consentAccepted: true,
      }),
    });

    assert.equal(response.status, 400);
    const data = await response.json();
    assert.match(data.message, /微信/);
  });

  it("updates an existing Xiaohongshu profile when the same profile link is submitted again", async () => {
    await MamaResourceProfile.create({
      displayName: "原账号",
      contactPhone: "13800000000",
      contactWechat: "old-wechat",
      status: "pending",
      consentAccepted: true,
      socialAccount: {
        platform: "xiaohongshu",
        profileUrl: "https://www.xiaohongshu.com/user/profile/abc123",
        normalizedProfileUrl: "xiaohongshu:user/profile/abc123",
        nickname: "旧昵称",
      },
    });

    const response = await fetch(`${server.publicUrl}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "更新账号",
        contactPhone: "13900000000",
        contactWechat: "new-wechat",
        xiaohongshuProfileUrl: "https://www.xiaohongshu.com/user/profile/abc123?foo=bar",
        xiaohongshuNickname: "新昵称",
        consentAccepted: true,
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.profile.status, "approved");
    assert.equal(data.profile.displayName, "更新账号");
    assert.equal(data.profile.contactPhone, "13900000000");
    assert.equal(data.profile.contactWechat, "new-wechat");
    assert.equal(data.profile.socialAccount.nickname, "新昵称");
    assert.equal(await MamaResourceProfile.countDocuments(), 1);
  });

  it("updates the submitted Xiaohongshu profile when contact history has no valid account link", async () => {
    await MamaResourceProfile.create({
      displayName: "历史空资料",
      contactPhone: "13800000000",
      contactWechat: "old-wechat",
      status: "approved",
      consentAccepted: true,
      socialAccount: {
        platform: "xiaohongshu",
        profileUrl: "legacy-no-valid-xhs-url",
        normalizedProfileUrl: "legacy-no-valid-xhs-url",
      },
    });
    const linkedProfile = await MamaResourceProfile.create({
      displayName: "已提交账号",
      contactPhone: "13900000000",
      contactWechat: "linked-wechat",
      status: "approved",
      consentAccepted: true,
      socialAccount: {
        platform: "xiaohongshu",
        profileUrl: "https://www.xiaohongshu.com/user/profile/already-submitted",
        normalizedProfileUrl: "xiaohongshu:user/profile/already-submitted",
        nickname: "旧昵称",
      },
    });

    const response = await fetch(`${server.publicUrl}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "已提交账号",
        contactPhone: "13800000000",
        contactWechat: "new-wechat",
        xiaohongshuProfileUrl: "https://www.xiaohongshu.com/user/profile/already-submitted",
        xiaohongshuNickname: "新昵称",
        consentAccepted: true,
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.profile._id, String(linkedProfile._id));
    assert.equal(data.profile.contactPhone, "13800000000");
    assert.equal(data.profile.contactWechat, "new-wechat");
    assert.equal(data.profile.socialAccount.profileUrl, "https://www.xiaohongshu.com/user/profile/already-submitted");
    assert.equal(data.profile.socialAccount.nickname, "新昵称");
    assert.equal(await MamaResourceProfile.countDocuments(), 2);
  });

  it("allows repeated media account nicknames when profile links are different", async () => {
    const response = await fetch(`${server.publicUrl}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "同昵称账号",
        contactPhone: "13800000001",
        contactWechat: "same-nickname-mom",
        mediaAccounts: [
          {
            platform: "xiaohongshu",
            nickname: "测试昵称",
            profileUrl: "https://www.xiaohongshu.com/user/profile/same-nickname-xhs",
          },
          {
            platform: "douyin",
            nickname: "测试昵称",
            profileUrl: "https://www.douyin.com/user/same-nickname-douyin",
          },
        ],
        categories: ["亲子阅读"],
      }),
    });

    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(data.profile.mediaAccounts.length, 2);
    assert.equal(data.profile.mediaAccounts[0].nickname, "测试昵称");
    assert.equal(data.profile.mediaAccounts[1].nickname, "测试昵称");
    assert.notEqual(data.profile.mediaAccounts[0].normalizedProfileUrl, data.profile.mediaAccounts[1].normalizedProfileUrl);
  });

  it("updates an existing mama resource profile for the same contact phone", async () => {
    await MamaResourceProfile.create({
      displayName: "原账号",
      contactPhone: "13800000000",
      contactWechat: "old-wechat",
      status: "pending",
      consentAccepted: true,
      socialAccount: {
        platform: "xiaohongshu",
        profileUrl: "https://www.xiaohongshu.com/user/profile/abc123",
        normalizedProfileUrl: "xiaohongshu:user/profile/abc123",
      },
    });

    const response = await fetch(`${server.publicUrl}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "更新账号",
        contactPhone: "13800000000",
        contactWechat: "new-wechat",
        xiaohongshuProfileUrl: "https://www.xiaohongshu.com/user/profile/abc123?foo=bar",
        xiaohongshuNickname: "新昵称",
        categories: ["亲子阅读"],
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.profile.status, "approved");
    assert.equal(data.profile.displayName, "更新账号");
    assert.equal(data.profile.contactWechat, "new-wechat");
    assert.equal(data.profile.socialAccount.nickname, "新昵称");
    assert.deepEqual(data.profile.reviewNote.suitableCategories, ["亲子阅读"]);
    assert.equal(await MamaResourceProfile.countDocuments(), 1);
  });

  it("preserves the submitted Xiaohongshu link when an existing contact edits only profile details", async () => {
    await MamaResourceProfile.create({
      displayName: "旧账号",
      contactPhone: "13800000000",
      contactWechat: "same-wechat",
      status: "approved",
      consentAccepted: true,
      socialAccount: {
        platform: "xiaohongshu",
        profileUrl: "https://www.xiaohongshu.com/user/profile/original-link",
        normalizedProfileUrl: "xiaohongshu:user/profile/original-link",
        nickname: "旧昵称",
      },
      mediaAccounts: [
        {
          platform: "xiaohongshu",
          profileUrl: "https://www.xiaohongshu.com/user/profile/original-link",
          normalizedProfileUrl: "xiaohongshu:user/profile/original-link",
          nickname: "旧昵称",
          dataSource: "pending",
        },
      ],
    });

    const response = await fetch(`${server.publicUrl}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "旧账号",
        contactPhone: "13800000000",
        contactWechat: "same-wechat",
        xiaohongshuProfileUrl: "https://www.xiaohongshu.com/user/profile/changed-link",
        xiaohongshuNickname: "新昵称",
        followerCount: 4200,
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.profile.socialAccount.profileUrl, "https://www.xiaohongshu.com/user/profile/original-link");
    assert.equal(data.profile.socialAccount.normalizedProfileUrl, "xiaohongshu:user/profile/original-link");
    assert.equal(data.profile.socialAccount.nickname, "新昵称");
    assert.equal(data.profile.socialAccount.followerCount, 4200);
    assert.equal(data.profile.mediaAccounts[0].profileUrl, "https://www.xiaohongshu.com/user/profile/original-link");
    assert.equal(data.profile.mediaAccounts[0].nickname, "新昵称");
    assert.equal(await MamaResourceProfile.countDocuments(), 1);
  });

  it("lets a signed-in user fill missing nickname on their legacy profile without a stored phone", async () => {
    const user = await User.create({ username: "u13800001234", password: "hash", mobile: "13800001234", role: "user" });
    const token = jwt.sign({ id: String(user._id), role: "user" }, process.env.JWT_SECRET || "your-secret-key");
    await MamaResourceProfile.create({
      displayName: "旧账号",
      contactPhone: "",
      contactWechat: "same-wechat",
      status: "approved",
      consentAccepted: true,
      socialAccount: {
        platform: "xiaohongshu",
        profileUrl: "https://www.xiaohongshu.com/user/profile/legacy-no-phone",
        normalizedProfileUrl: "xiaohongshu:user/profile/legacy-no-phone",
        nickname: "",
      },
    });

    const response = await fetch(`${server.publicUrl}/applications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        displayName: "旧账号更新",
        contactPhone: "13800001234",
        contactWechat: "same-wechat",
        xiaohongshuProfileUrl: "https://www.xiaohongshu.com/user/profile/legacy-no-phone?foo=bar",
        xiaohongshuNickname: "补充昵称",
        categories: ["亲子阅读"],
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.profile.displayName, "旧账号更新");
    assert.equal(data.profile.contactPhone, "13800001234");
    assert.equal(data.profile.socialAccount.nickname, "补充昵称");
    assert.equal(await MamaResourceProfile.countDocuments(), 1);
  });

  it("uses the signed-in user's mobile as the application owner phone", async () => {
    const user = await User.create({ username: "u13800005555", password: "hash", mobile: "13800005555", role: "user" });
    const token = jwt.sign({ id: String(user._id), role: "user" }, process.env.JWT_SECRET || "your-secret-key");

    const response = await fetch(`${server.publicUrl}/applications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        displayName: "登录妈妈",
        contactPhone: "13999990000",
        contactWechat: "login-mom",
        mediaAccounts: [
          {
            platform: "xiaohongshu",
            nickname: "登录小红书",
            profileUrl: "https://www.xiaohongshu.com/user/profile/login-owner",
            followerCount: "6200",
          },
          {
            platform: "douyin",
            nickname: "登录抖音",
            profileUrl: "https://www.douyin.com/user/login-owner",
            followerCount: "9100",
          },
        ],
        consentAccepted: true,
      }),
    });

    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(data.profile.contactPhone, "13800005555");
    assert.equal(data.profile.mediaAccounts.length, 2);
    assert.equal(data.profile.mediaAccounts[0].nickname, "登录小红书");
    assert.equal(data.profile.mediaAccounts[1].platform, "douyin");

    const saved = await MamaResourceProfile.findById(data.profile._id).lean();
    assert.equal(saved?.contactPhone, "13800005555");
  });

  it("lets operators filter the resource pool and update review state", async () => {
    const [readingProfile, toyProfile] = await MamaResourceProfile.create([
      {
        displayName: "阅读妈妈",
        contactPhone: "13800000000",
        status: "pending",
        city: "上海",
        categories: ["亲子阅读"],
        consentAccepted: true,
        socialAccount: {
          platform: "xiaohongshu",
          profileUrl: "https://www.xiaohongshu.com/user/profile/read",
          normalizedProfileUrl: "xiaohongshu:user/profile/read",
          followerCount: 12000,
          dataSource: "manual",
        },
        rateCard: { rateRange: "300-500", availability: "每周 2 篇" },
      },
      {
        displayName: "玩具妈妈",
        contactPhone: "13700000000",
        status: "approved",
        city: "杭州",
        categories: ["玩具"],
        consentAccepted: true,
        socialAccount: {
          platform: "xiaohongshu",
          profileUrl: "https://www.xiaohongshu.com/user/profile/toy",
          normalizedProfileUrl: "xiaohongshu:user/profile/toy",
          followerCount: 800,
          dataSource: "manual",
        },
      },
    ]);

    const listResponse = await fetch(`${server.adminUrl}?status=pending&category=${encodeURIComponent("亲子阅读")}&minFollowers=1000`);
    assert.equal(listResponse.status, 200);
    const listData = await listResponse.json();
    assert.equal(listData.total, 1);
    assert.equal(listData.items[0]._id, String(readingProfile._id));
    assert.equal(listData.items[0].socialAccount.followerCount, 12000);

    const reviewResponse = await fetch(`${server.adminUrl}/${readingProfile._id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "approved",
        note: "亲子阅读账号质量可用",
        suitableCategories: ["亲子阅读", "学习用品"],
        riskTags: ["需补近期截图"],
        nextFollowUpAt: "2026-07-01T00:00:00.000Z",
      }),
    });
    assert.equal(reviewResponse.status, 200);
    const reviewData = await reviewResponse.json();
    assert.equal(reviewData.profile.status, "approved");
    assert.deepEqual(reviewData.profile.reviewNote.suitableCategories, ["亲子阅读", "学习用品"]);

    const approvedCount = await MamaResourceProfile.countDocuments({ status: "approved" });
    assert.equal(approvedCount, 2);
    assert.ok(toyProfile._id);
  });

  it("lets operators shelf a task, select matching accounts, and collect submitted proof", async () => {
    const user = await User.create({
      username: "u13800138000",
      password: "hash",
      mobile: "13800138000",
      role: "user",
    });
    const token = jwt.sign({ id: String(user._id), role: "user" }, process.env.JWT_SECRET || "your-secret-key");
    const profile = await MamaResourceProfile.create({
      displayName: "安安妈妈",
      contactPhone: "13800138000",
      contactWechat: "anan-mom",
      status: "approved",
      consentAccepted: true,
      categories: ["亲子阅读", "学习用品"],
      socialAccount: {
        platform: "xiaohongshu",
        profileUrl: "https://www.xiaohongshu.com/user/profile/anan",
        normalizedProfileUrl: "xiaohongshu:user/profile/anan",
        followerCount: 5730,
      },
    });

    const createTaskResponse = await fetch(`${server.adminUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "任推邦（红薯）评论",
        category: "小红书评论",
        difficulty: "简单",
        phase: "测试期",
        unitPriceCents: 100,
        trafficFeeCents: 2500,
        dataCycle: "T+9",
        settlementCycle: "T+9",
        promotionCount: 42527,
        latestDataDate: "2026-06-29T00:00:00.000Z",
        announcement: "测试期任务请先阅读项目重要通知。",
        settlementStandard: "按任务要求完成评论并提交回填，运营审核通过后计入已收录。",
        requirement: "按指定小红书链接完成评论，完成后必须提交回填。",
        exampleImageUrls: ["/uploads/admin/example-1.png", "/uploads/admin/example-2.png"],
      }),
    });
    assert.equal(createTaskResponse.status, 201);
    const created = await createTaskResponse.json();
    assert.equal(created.task.title, "任推邦（红薯）评论");
    assert.equal(created.task.status, "listed");
    assert.equal(created.task.trafficFeeCents, 2500);
    assert.equal(created.task.announcement, "测试期任务请先阅读项目重要通知。");
    assert.deepEqual(created.task.exampleImageUrls, ["/uploads/admin/example-1.png", "/uploads/admin/example-2.png"]);

    const updateTaskResponse = await fetch(`${server.adminUrl}/tasks/${created.task._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "任推邦（红薯）评论",
        category: "小红书评论",
        difficulty: "简单",
        phase: "测试期",
        unitPriceCents: 3000,
        trafficFeeCents: null,
        dataCycle: "T+9",
        settlementCycle: "T+9",
        promotionCount: 42527,
        latestDataDate: "2026-06-29T00:00:00.000Z",
        announcement: "更新后的项目公告。",
        settlementStandard: "按任务要求完成评论并提交回填，运营审核通过后计入已收录。",
        requirement: "按指定小红书链接完成评论，完成后必须提交回填，并参考展开的示意图。",
        exampleImageUrls: ["/uploads/admin/example-updated.png"],
      }),
    });
    assert.equal(updateTaskResponse.status, 200);
    const updated = await updateTaskResponse.json();
    assert.equal(updated.task.unitPriceCents, 3000);
    assert.equal(updated.task.trafficFeeCents, null);
    assert.equal(updated.task.announcement, "更新后的项目公告。");
    assert.equal(updated.task.requirement, "按指定小红书链接完成评论，完成后必须提交回填，并参考展开的示意图。");
    assert.deepEqual(updated.task.exampleImageUrls, ["/uploads/admin/example-updated.png"]);

    const candidatesResponse = await fetch(
      `${server.adminUrl}/tasks/${created.task._id}/candidates?category=${encodeURIComponent("亲子阅读")}&minFollowers=1`
    );
    assert.equal(candidatesResponse.status, 200);
    const candidates = await candidatesResponse.json();
    assert.equal(candidates.items.length, 1);
    assert.equal(candidates.items[0]._id, String(profile._id));
    assert.equal(candidates.items[0].assignmentStatus, "");

    const assignResponse = await fetch(`${server.adminUrl}/tasks/${created.task._id}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileIds: [String(profile._id)] }),
    });
    assert.equal(assignResponse.status, 201);
    const assigned = await assignResponse.json();
    assert.equal(assigned.assignments.length, 1);
    assert.equal(assigned.assignments[0].status, "assigned");
    assert.equal(assigned.assignments[0].task.title, "任推邦（红薯）评论");

    const listResponse = await fetch(`${server.publicUrl}/me/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(listResponse.status, 200);
    const listData = await listResponse.json();
    assert.equal(listData.profile.status, "approved");
    assert.equal(listData.tasks.length, 1);
    assert.equal(listData.tasks[0].unitPriceCents, 3000);
    assert.equal(listData.tasks[0].trafficFeeCents, null);
    assert.equal(listData.tasks[0].announcement, "更新后的项目公告。");
    assert.deepEqual(listData.tasks[0].exampleImageUrls, ["/uploads/admin/example-updated.png"]);
    assert.equal(listData.tasks[0]._id, assigned.assignments[0]._id);
    assert.equal(listData.tasks[0].taskId, created.task._id);

    const submitResponse = await fetch(`${server.publicUrl}/me/tasks/${assigned.assignments[0]._id}/submissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        proofLink: "https://www.xiaohongshu.com/explore/comment-proof",
        proofScreenshotUrl: "/uploads/mama-resources/proof.png",
      }),
    });
    assert.equal(submitResponse.status, 200);
    const submitted = await submitResponse.json();
    assert.equal(submitted.task.status, "submitted");
    assert.equal(submitted.task.proofLink, "https://www.xiaohongshu.com/explore/comment-proof");

    const reviewResponse = await fetch(`${server.adminUrl}/tasks/assignments/${assigned.assignments[0]._id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "collected", reviewNote: "已收录" }),
    });
    assert.equal(reviewResponse.status, 200);
    const reviewed = await reviewResponse.json();
    assert.equal(reviewed.task.status, "collected");
    assert.equal(reviewed.task.reviewNote, "已收录");
  });

  it("reports the active promotion count from live task assignments", async () => {
    const user = await User.create({
      username: "u13800138004",
      password: "hash",
      mobile: "13800138004",
      role: "user",
    });
    const token = jwt.sign({ id: String(user._id), role: "user" }, process.env.JWT_SECRET || "your-secret-key");
    const [currentProfile, submittedProfile, collectedProfile, rejectedProfile] = await MamaResourceProfile.create([
      {
        displayName: "当前妈妈",
        contactPhone: "13800138004",
        contactWechat: "current-mom",
        status: "approved",
        consentAccepted: true,
        categories: ["亲子阅读"],
        socialAccount: {
          platform: "xiaohongshu",
          profileUrl: "https://www.xiaohongshu.com/user/profile/current",
          normalizedProfileUrl: "xiaohongshu:user/profile/current",
        },
      },
      {
        displayName: "已提交妈妈",
        contactPhone: "13800138005",
        contactWechat: "submitted-mom",
        status: "approved",
        consentAccepted: true,
        categories: ["亲子阅读"],
        socialAccount: {
          platform: "xiaohongshu",
          profileUrl: "https://www.xiaohongshu.com/user/profile/submitted",
          normalizedProfileUrl: "xiaohongshu:user/profile/submitted",
        },
      },
      {
        displayName: "已收录妈妈",
        contactPhone: "13800138006",
        contactWechat: "collected-mom",
        status: "approved",
        consentAccepted: true,
        categories: ["亲子阅读"],
        socialAccount: {
          platform: "xiaohongshu",
          profileUrl: "https://www.xiaohongshu.com/user/profile/collected",
          normalizedProfileUrl: "xiaohongshu:user/profile/collected",
        },
      },
      {
        displayName: "已驳回妈妈",
        contactPhone: "13800138007",
        contactWechat: "rejected-mom",
        status: "approved",
        consentAccepted: true,
        categories: ["亲子阅读"],
        socialAccount: {
          platform: "xiaohongshu",
          profileUrl: "https://www.xiaohongshu.com/user/profile/rejected",
          normalizedProfileUrl: "xiaohongshu:user/profile/rejected",
        },
      },
    ]);
    const task = await MamaResourceTask.create({
      title: "迪桑娜评论",
      category: "小红书评论",
      unitPriceCents: 3000,
      trafficFeeCents: 1200,
      promotionCount: 42527,
      latestDataDate: "2026-06-29T00:00:00.000Z",
    });
    await MamaResourceTaskAssignment.create([
      { taskId: task._id, profileId: currentProfile._id, status: "assigned" },
      { taskId: task._id, profileId: submittedProfile._id, status: "submitted" },
      { taskId: task._id, profileId: collectedProfile._id, status: "collected" },
      { taskId: task._id, profileId: rejectedProfile._id, status: "rejected" },
    ]);

    const response = await fetch(`${server.publicUrl}/me/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].promotionCount, 42527);
    assert.equal(data.tasks[0].activePromotionCount, 2);
    assert.equal(data.tasks[0].trafficFeeCents, 1200);
  });

  it("returns only the signed-in profile's personal task content link", async () => {
    const [firstUser, secondUser] = await User.create([
      { username: "u13800138101", password: "hash", mobile: "13800138101", role: "user" },
      { username: "u13800138102", password: "hash", mobile: "13800138102", role: "user" },
    ]);
    const firstToken = jwt.sign({ id: String(firstUser._id), role: "user" }, process.env.JWT_SECRET || "your-secret-key");
    const [firstProfile, secondProfile] = await MamaResourceProfile.create([
      {
        displayName: "链接用户一",
        contactPhone: "13800138101",
        contactWechat: "content-owner-one",
        status: "approved",
        consentAccepted: true,
        categories: ["箱包"],
        socialAccount: {
          platform: "xiaohongshu",
          profileUrl: "https://www.xiaohongshu.com/user/profile/content-owner-one",
          normalizedProfileUrl: "xiaohongshu:user/profile/content-owner-one",
        },
      },
      {
        displayName: "链接用户二",
        contactPhone: "13800138102",
        contactWechat: "content-owner-two",
        status: "approved",
        consentAccepted: true,
        categories: ["箱包"],
        socialAccount: {
          platform: "xiaohongshu",
          profileUrl: "https://www.xiaohongshu.com/user/profile/content-owner-two",
          normalizedProfileUrl: "xiaohongshu:user/profile/content-owner-two",
        },
      },
    ]);
    const task = await MamaResourceTask.create({
      title: "迪桑娜饭盒包",
      category: "箱包",
      unitPriceCents: 3000,
      status: "listed",
    });
    const [firstAssignment, secondAssignment] = await MamaResourceTaskAssignment.create([
      {
        taskId: task._id,
        profileId: firstProfile._id,
        status: "assigned",
        contentUrl: "https://my.feishu.cn/wiki/owner-one",
        contentUpdatedAt: new Date("2026-07-14T00:00:00.000Z"),
      },
      {
        taskId: task._id,
        profileId: secondProfile._id,
        status: "assigned",
        contentUrl: "https://my.feishu.cn/wiki/owner-two",
        contentUpdatedAt: new Date("2026-07-14T01:00:00.000Z"),
      },
    ]);

    const listResponse = await fetch(`${server.publicUrl}/me/tasks`, {
      headers: { Authorization: `Bearer ${firstToken}` },
    });
    assert.equal(listResponse.status, 200);
    const listData = await listResponse.json();
    assert.equal(listData.tasks.length, 1);
    assert.equal(listData.tasks[0]._id, String(firstAssignment._id));
    assert.equal(listData.tasks[0].contentUrl, "https://my.feishu.cn/wiki/owner-one");
    assert.equal(listData.tasks.some((item: any) => item.contentUrl?.includes("owner-two")), false);

    const detailResponse = await fetch(`${server.publicUrl}/me/tasks/${firstAssignment._id}`, {
      headers: { Authorization: `Bearer ${firstToken}` },
    });
    assert.equal(detailResponse.status, 200);
    const detailData = await detailResponse.json();
    assert.equal(detailData.task.contentUrl, "https://my.feishu.cn/wiki/owner-one");

    const forbiddenResponse = await fetch(`${server.publicUrl}/me/tasks/${secondAssignment._id}`, {
      headers: { Authorization: `Bearer ${firstToken}` },
    });
    assert.equal(forbiddenResponse.status, 404);
  });

  it("lets approved users claim listed tasks until the claim limit is reached", async () => {
    const [firstUser, secondUser] = await User.create([
      { username: "u13800138101", password: "hash", mobile: "13800138101", role: "user" },
      { username: "u13800138102", password: "hash", mobile: "13800138102", role: "user" },
    ]);
    const firstToken = jwt.sign({ id: String(firstUser._id), role: "user" }, process.env.JWT_SECRET || "your-secret-key");
    const secondToken = jwt.sign({ id: String(secondUser._id), role: "user" }, process.env.JWT_SECRET || "your-secret-key");
    await MamaResourceProfile.create([
      {
        displayName: "先到妈妈",
        contactPhone: "13800138101",
        contactWechat: "first-mom",
        status: "approved",
        consentAccepted: true,
        categories: ["亲子阅读"],
        socialAccount: { platform: "xiaohongshu", profileUrl: "https://www.xiaohongshu.com/user/profile/first", normalizedProfileUrl: "xiaohongshu:user/profile/first" },
      },
      {
        displayName: "后到妈妈",
        contactPhone: "13800138102",
        contactWechat: "second-mom",
        status: "approved",
        consentAccepted: true,
        categories: ["亲子阅读"],
        socialAccount: { platform: "xiaohongshu", profileUrl: "https://www.xiaohongshu.com/user/profile/second", normalizedProfileUrl: "xiaohongshu:user/profile/second" },
      },
    ]);
    const task = await MamaResourceTask.create({
      title: "限量亲子阅读发图",
      category: "小红书发图+评论",
      unitPriceCents: 3000,
      trafficFeeCents: 10000,
      dataCycle: "T+9",
      settlementCycle: "T+9",
      claimLimit: 1,
      status: "listed",
      requirement: "发布小红书图文并评论。",
    });

    const beforeClaimResponse = await fetch(`${server.publicUrl}/me/tasks`, {
      headers: { Authorization: `Bearer ${firstToken}` },
    });
    assert.equal(beforeClaimResponse.status, 200);
    const beforeClaim = await beforeClaimResponse.json();
    assert.equal(beforeClaim.tasks.length, 0);
    assert.equal(beforeClaim.availableTasks.length, 1);
    assert.equal(beforeClaim.availableTasks[0].taskId, String(task._id));
    assert.equal(beforeClaim.availableTasks[0].claimLimit, 1);
    assert.equal(beforeClaim.availableTasks[0].remainingClaimCount, 1);

    const claimResponse = await fetch(`${server.publicUrl}/tasks/${task._id}/claims`, {
      method: "POST",
      headers: { Authorization: `Bearer ${firstToken}` },
    });
    assert.equal(claimResponse.status, 201);
    const claimData = await claimResponse.json();
    assert.equal(claimData.task.title, "限量亲子阅读发图");
    assert.equal(claimData.task.status, "assigned");
    assert.equal(claimData.task.remainingClaimCount, 0);

    const secondClaimResponse = await fetch(`${server.publicUrl}/tasks/${task._id}/claims`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secondToken}` },
    });
    assert.equal(secondClaimResponse.status, 409);
    const secondClaimData = await secondClaimResponse.json();
    assert.match(secondClaimData.message, /已被领完/);

    const storedAssignments = await MamaResourceTaskAssignment.find({ taskId: task._id }).lean();
    assert.equal(storedAssignments.length, 1);
    assert.equal(String(storedAssignments[0].profileId), String((await MamaResourceProfile.findOne({ contactPhone: "13800138101" }).lean())?._id));
  });

  it("matches an approved mama profile when the stored contact phone has formatting", async () => {
    const user = await User.create({ username: "u13501893069", password: "hash", mobile: "13501893069", role: "user" });
    const token = jwt.sign({ id: String(user._id), role: "user" }, process.env.JWT_SECRET || "your-secret-key");
    await MamaResourceProfile.create({
      displayName: "格式手机号妈妈",
      contactPhone: "+86 135 0189 3069",
      contactWechat: "formatted-phone-mom",
      status: "approved",
      consentAccepted: true,
      categories: ["亲子阅读"],
      socialAccount: {
        platform: "xiaohongshu",
        profileUrl: "https://www.xiaohongshu.com/user/profile/formatted-phone",
        normalizedProfileUrl: "xiaohongshu:user/profile/formatted-phone",
      },
    });

    const response = await fetch(`${server.publicUrl}/me/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.profile.status, "approved");
    assert.equal(data.profile.displayName, "格式手机号妈妈");
    assert.equal(data.profile.contactPhone, "+86 135 0189 3069");
  });

  it("prefers an existing approved mama profile over a newer pending profile for the same mobile", async () => {
    const user = await User.create({ username: "u13501893070", password: "hash", mobile: "13501893070", role: "user" });
    const token = jwt.sign({ id: String(user._id), role: "user" }, process.env.JWT_SECRET || "your-secret-key");
    await MamaResourceProfile.create({
      displayName: "已通过妈妈",
      contactPhone: "13501893070",
      contactWechat: "approved-mom",
      status: "approved",
      consentAccepted: true,
      categories: ["亲子阅读"],
      socialAccount: {
        platform: "xiaohongshu",
        profileUrl: "https://www.xiaohongshu.com/user/profile/approved-old",
        normalizedProfileUrl: "xiaohongshu:user/profile/approved-old",
      },
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    await MamaResourceProfile.create({
      displayName: "新提交妈妈",
      contactPhone: "13501893070",
      contactWechat: "pending-mom",
      status: "pending",
      consentAccepted: true,
      categories: ["亲子阅读"],
      socialAccount: {
        platform: "xiaohongshu",
        profileUrl: "https://www.xiaohongshu.com/user/profile/pending-new",
        normalizedProfileUrl: "xiaohongshu:user/profile/pending-new",
      },
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    });

    const response = await fetch(`${server.publicUrl}/me/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.profile.status, "approved");
    assert.equal(data.profile.displayName, "已通过妈妈");
  });

  it("auto-assigns approved profiles that match task creation criteria", async () => {
    const [readingProfile, toyProfile] = await MamaResourceProfile.create([
      {
        displayName: "阅读妈妈",
        contactPhone: "13800138002",
        contactWechat: "reading-mom",
        status: "approved",
        consentAccepted: true,
        categories: ["亲子阅读", "学习用品"],
        socialAccount: {
          platform: "xiaohongshu",
          profileUrl: "https://www.xiaohongshu.com/user/profile/reading-auto",
          normalizedProfileUrl: "xiaohongshu:user/profile/reading-auto",
          followerCount: 6200,
        },
        reviewNote: {
          suitableCategories: ["亲子阅读"],
          riskTags: ["内容稳定"],
        },
      },
      {
        displayName: "低粉玩具妈妈",
        contactPhone: "13800138003",
        contactWechat: "toy-mom",
        status: "approved",
        consentAccepted: true,
        categories: ["玩具"],
        socialAccount: {
          platform: "xiaohongshu",
          profileUrl: "https://www.xiaohongshu.com/user/profile/toy-auto",
          normalizedProfileUrl: "xiaohongshu:user/profile/toy-auto",
          followerCount: 800,
        },
      },
    ]);

    const response = await fetch(`${server.adminUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "绘本测评",
        category: "小红书笔记",
        matchCategories: ["亲子阅读"],
        matchRiskTags: ["内容稳定"],
        minFollowerCount: 5000,
        requirement: "发布小红书原创笔记，保留 7 天。",
        autoAssign: true,
      }),
    });

    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(data.task.title, "绘本测评");
    assert.deepEqual(data.task.matchCategories, ["亲子阅读"]);
    assert.deepEqual(data.task.matchRiskTags, ["内容稳定"]);
    assert.equal(data.task.minFollowerCount, 5000);
    assert.equal(data.assignments.length, 1);
    assert.equal(data.assignments[0].profileId, String(readingProfile._id));

    const unassigned = await MamaResourceTaskAssignment.findOne({ profileId: toyProfile._id }).lean();
    assert.equal(unassigned, null);
  });

  it("returns a legacy pending mama profile without forcing a new application form", async () => {
    const user = await User.create({
      username: "u13800138001",
      password: "hash",
      mobile: "13800138001",
      role: "user",
    });
    const token = jwt.sign({ id: String(user._id), role: "user" }, process.env.JWT_SECRET || "your-secret-key");
    await MamaResourceProfile.create({
      displayName: "待审妈妈",
      contactPhone: "13800138001",
      contactWechat: "pending-mom",
      status: "pending",
      consentAccepted: true,
      categories: ["亲子阅读"],
      socialAccount: {
        platform: "xiaohongshu",
        profileUrl: "https://www.xiaohongshu.com/user/profile/pending",
        normalizedProfileUrl: "xiaohongshu:user/profile/pending",
      },
    });

    const response = await fetch(`${server.publicUrl}/me/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.profile.status, "pending");
    assert.equal(data.profile.displayName, "待审妈妈");
    assert.deepEqual(data.tasks, []);
  });

  it("ignores removed offer and case sync fields in admin updates", async () => {
    const profile = await MamaResourceProfile.create({
      displayName: "案例妈妈",
      contactPhone: "13800000000",
      status: "needs_info",
      consentAccepted: true,
      socialAccount: {
        platform: "xiaohongshu",
        profileUrl: "https://www.xiaohongshu.com/user/profile/case",
        normalizedProfileUrl: "xiaohongshu:user/profile/case",
      },
      contentCases: [{ url: "https://www.xiaohongshu.com/explore/note-1", captureStatus: "failed" }],
    });

    const response = await fetch(`${server.adminUrl}/${profile._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        socialAccount: { followerCount: 5200, dataSource: "manual" },
        contentCases: [
          {
            url: "https://www.xiaohongshu.com/explore/note-1",
            title: "亲子阅读笔记",
            likeCount: 88,
            favoriteCount: 23,
            commentCount: 9,
            screenshotUrl: "https://cdn.example.com/screenshot.jpg",
            captureStatus: "manual_required",
          },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.profile.socialAccount.followerCount, 5200);
    assert.equal(data.profile.contentCases[0].screenshotUrl, "");
    assert.equal(data.profile.contentCases[0].captureStatus, "failed");
  });
});
