import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import * as XLSX from "xlsx";
import { MongoMemoryServer } from "mongodb-memory-server";
import mamaResourceRoutes from "./mamaResource";
import adminMamaResourceRoutes from "./adminMamaResource";
import MamaResourceProfile from "../models/MamaResourceProfile";
import MamaResourceTask from "../models/MamaResourceTask";
import MamaResourceTaskAssignment from "../models/MamaResourceTaskAssignment";
import MamaResourceTaskContentLink from "../models/MamaResourceTaskContentLink";
import User from "../models/User";

type TestServer = {
  close: () => Promise<void>;
  publicUrl: string;
  adminUrl: string;
};

function applicationHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

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
  let applicationToken: string;
  let applicationUserId: string;

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
    await MamaResourceTaskContentLink.deleteMany({});
    await User.deleteMany({});
    const applicationUser = await User.create({ username: "application-user", password: "hash", role: "user" });
    applicationUserId = String(applicationUser._id);
    applicationToken = jwt.sign({ id: applicationUserId, role: "user" }, process.env.JWT_SECRET || "your-secret-key");
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

  it("rejects an application without login", async () => {
    const response = await fetch(`${server.publicUrl}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "未登录用户" }),
    });

    assert.equal(response.status, 401);
    assert.equal((await response.json()).message, "未登录或登录已过期");
    assert.equal(await MamaResourceProfile.countDocuments(), 0);
  });

  it("accepts a signed-in application without sensitive credentials", async () => {
    const response = await fetch(`${server.publicUrl}/applications`, {
      method: "POST",
      headers: applicationHeaders(applicationToken),
      body: JSON.stringify({
        displayName: "安安妈妈",
        contactWechat: "anan-mom",
        alipayAccount: "anan@example.com",
        alipayVerifiedName: "安安妈妈",
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
    assert.match(data.profile.publicUid, /^\d{9}$/);
    assert.equal(String(data.profile.userId), applicationUserId);
    assert.equal("password" in data.profile, false);
  });

  it("accepts a pasted Xiaohongshu command with a short link", async () => {
    const command = "我在小红书收获了9105次赞与收藏，来看看我的主页>> https://xhslink.com/m/33T8SSC3sBq";
    const response = await fetch(`${server.publicUrl}/applications`, {
      method: "POST",
      headers: applicationHeaders(applicationToken),
      body: JSON.stringify({
        displayName: "短链接妈妈",
        contactWechat: "short-link-mom",
        alipayAccount: "short-link@example.com",
        alipayVerifiedName: "短链接妈妈",
        xiaohongshuProfileUrl: command,
      }),
    });

    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(data.profile.socialAccount.profileUrl, command);
    assert.equal(data.profile.socialAccount.normalizedProfileUrl, "xiaohongshu:https://xhslink.com/m/33t8ssc3sbq");
  });

  it("requires and trims Alipay payout details on applications", async () => {
    const basePayload = {
      displayName: "收款妈妈",
      contactWechat: "payout-mom",
      xiaohongshuProfileUrl: "https://www.xiaohongshu.com/user/profile/payout-mom",
      consentAccepted: true,
    };
    const missingResponse = await fetch(`${server.publicUrl}/applications`, {
      method: "POST",
      headers: applicationHeaders(applicationToken),
      body: JSON.stringify({ ...basePayload, alipayVerifiedName: "张三" }),
    });
    assert.equal(missingResponse.status, 400);
    assert.equal((await missingResponse.json()).message, "请填写支付宝账号");

    const response = await fetch(`${server.publicUrl}/applications`, {
      method: "POST",
      headers: applicationHeaders(applicationToken),
      body: JSON.stringify({
        ...basePayload,
        alipayAccount: "  payout@example.com  ",
        alipayVerifiedName: "  张三  ",
      }),
    });
    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(data.profile.alipayAccount, "payout@example.com");
    assert.equal(data.profile.alipayVerifiedName, "张三");
  });

  it("accepts separated personal info with multiple media accounts while keeping a primary account", async () => {
    const response = await fetch(`${server.publicUrl}/applications`, {
      method: "POST",
      headers: applicationHeaders(applicationToken),
      body: JSON.stringify({
        displayName: "多账号妈妈",
        contactWechat: "multi-mom",
        alipayAccount: "multi@example.com",
        alipayVerifiedName: "多账号妈妈",
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
      headers: applicationHeaders(applicationToken),
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
      headers: applicationHeaders(applicationToken),
      body: JSON.stringify({
        displayName: "更新账号",
        contactPhone: "13900000000",
        contactWechat: "new-wechat",
        alipayAccount: "new@example.com",
        alipayVerifiedName: "更新账号",
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

  it("keeps non-domain Xiaohongshu account text attached to its existing contact", async () => {
    const contactProfile = await MamaResourceProfile.create({
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
    await MamaResourceProfile.create({
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
      headers: applicationHeaders(applicationToken),
      body: JSON.stringify({
        displayName: "已提交账号",
        contactPhone: "13800000000",
        contactWechat: "new-wechat",
        alipayAccount: "linked@example.com",
        alipayVerifiedName: "已提交账号",
        xiaohongshuProfileUrl: "https://www.xiaohongshu.com/user/profile/already-submitted",
        xiaohongshuNickname: "新昵称",
        consentAccepted: true,
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.profile._id, String(contactProfile._id));
    assert.equal(data.profile.contactPhone, "13800000000");
    assert.equal(data.profile.contactWechat, "new-wechat");
    assert.equal(data.profile.socialAccount.profileUrl, "legacy-no-valid-xhs-url");
    assert.equal(data.profile.socialAccount.normalizedProfileUrl, "xiaohongshu:legacy-no-valid-xhs-url");
    assert.equal(data.profile.socialAccount.nickname, "新昵称");
    assert.equal(await MamaResourceProfile.countDocuments(), 2);
  });

  it("allows repeated media account nicknames when profile links are different", async () => {
    const response = await fetch(`${server.publicUrl}/applications`, {
      method: "POST",
      headers: applicationHeaders(applicationToken),
      body: JSON.stringify({
        displayName: "同昵称账号",
        contactPhone: "13800000001",
        contactWechat: "same-nickname-mom",
        alipayAccount: "same@example.com",
        alipayVerifiedName: "同昵称账号",
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
      headers: applicationHeaders(applicationToken),
      body: JSON.stringify({
        displayName: "更新账号",
        contactPhone: "13800000000",
        contactWechat: "new-wechat",
        alipayAccount: "update@example.com",
        alipayVerifiedName: "更新账号",
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
      headers: applicationHeaders(applicationToken),
      body: JSON.stringify({
        displayName: "旧账号",
        contactPhone: "13800000000",
        contactWechat: "same-wechat",
        alipayAccount: "same-wechat@example.com",
        alipayVerifiedName: "旧账号",
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
        alipayAccount: "legacy@example.com",
        alipayVerifiedName: "旧账号更新",
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
        alipayAccount: "login@example.com",
        alipayVerifiedName: "登录妈妈",
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
    const femaleUser = await User.create({ username: "resource-female", password: "hash", publicUid: "718292948", gender: "女", role: "user" });
    const [readingProfile, toyProfile] = await MamaResourceProfile.create([
      {
        userId: femaleUser._id,
        displayName: "阅读妈妈",
        contactPhone: "13800000000",
        status: "pending",
        city: "上海",
        childStage: "小学",
        childGender: "女孩",
        contentCapabilities: ["能拍", "能剪", "能写"],
        categories: ["亲子阅读"],
        consentAccepted: true,
        socialAccount: {
          platform: "xiaohongshu",
          profileUrl: "https://www.xiaohongshu.com/user/profile/read",
          normalizedProfileUrl: "xiaohongshu:user/profile/read",
          followerCount: 12000,
          dataSource: "manual",
        },
        mediaAccounts: [
          {
            platform: "xiaohongshu",
            profileUrl: "https://www.xiaohongshu.com/user/profile/read",
            normalizedProfileUrl: "xiaohongshu:user/profile/read",
            followerCount: 12000,
            dataSource: "manual",
          },
          {
            platform: "douyin",
            profileUrl: "https://www.douyin.com/user/read",
            normalizedProfileUrl: "douyin:https://www.douyin.com/user/read",
            followerCount: 3000,
            dataSource: "manual",
          },
        ],
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

    const uidSearchResponse = await fetch(`${server.adminUrl}?search=718292948`);
    assert.equal(uidSearchResponse.status, 200);
    const uidSearchData = await uidSearchResponse.json();
    assert.equal(uidSearchData.total, 1);
    assert.equal(uidSearchData.items[0]._id, String(readingProfile._id));

    const demographicResponse = await fetch(`${server.adminUrl}?childStage=${encodeURIComponent("小学")}&childGender=${encodeURIComponent("女孩")}&userGender=${encodeURIComponent("女")}&platform=douyin`);
    assert.equal(demographicResponse.status, 200);
    const demographicData = await demographicResponse.json();
    assert.equal(demographicData.total, 1);
    assert.equal(demographicData.items[0]._id, String(readingProfile._id));

    const capabilityResponse = await fetch(`${server.adminUrl}?contentCapabilities=${encodeURIComponent("能拍")}&contentCapabilities=${encodeURIComponent("能写")}`);
    assert.equal(capabilityResponse.status, 200);
    const capabilityData = await capabilityResponse.json();
    assert.equal(capabilityData.total, 1);
    assert.equal(capabilityData.items[0]._id, String(readingProfile._id));

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

  it("lets operators save manual data for every media account", async () => {
    const profile = await MamaResourceProfile.create({
      displayName: "多平台妈妈",
      contactWechat: "multi-platform",
      alipayAccount: "multi@example.com",
      alipayVerifiedName: "多平台妈妈",
      consentAccepted: true,
      socialAccount: {
        platform: "xiaohongshu",
        profileUrl: "https://www.xiaohongshu.com/user/profile/main",
        normalizedProfileUrl: "xiaohongshu:user/profile/main",
        nickname: "原小红书昵称",
      },
      mediaAccounts: [
        {
          platform: "xiaohongshu",
          profileUrl: "https://www.xiaohongshu.com/user/profile/main",
          normalizedProfileUrl: "xiaohongshu:user/profile/main",
          nickname: "原小红书昵称",
        },
        {
          platform: "douyin",
          profileUrl: "https://www.douyin.com/user/second",
          normalizedProfileUrl: "douyin:https://www.douyin.com/user/second",
          nickname: "原抖音昵称",
        },
      ],
    });

    const response = await fetch(`${server.adminUrl}/${profile._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alipayAccount: "multi@example.com",
        alipayVerifiedName: "多平台妈妈",
        mediaAccounts: [
          {
            platform: "xiaohongshu",
            profileUrl: "https://www.xiaohongshu.com/user/profile/revised?xsec_token=stale",
            normalizedProfileUrl: "xiaohongshu:user/profile/main",
            nickname: "新小红书昵称",
            followerCount: 12000,
          },
          {
            platform: "douyin",
            profileUrl: "https://www.douyin.com/user/revised",
            normalizedProfileUrl: "douyin:https://www.douyin.com/user/second",
            nickname: "新抖音昵称",
            followerCount: 8000,
          },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.profile.mediaAccounts.length, 2);
    assert.equal(data.profile.mediaAccounts[0].profileUrl, "https://www.xiaohongshu.com/user/profile/revised");
    assert.equal(data.profile.mediaAccounts[0].normalizedProfileUrl, "xiaohongshu:user/profile/revised");
    assert.equal(data.profile.mediaAccounts[1].platform, "douyin");
    assert.equal(data.profile.mediaAccounts[1].profileUrl, "https://www.douyin.com/user/revised");
    assert.equal(data.profile.mediaAccounts[1].normalizedProfileUrl, "douyin:https://www.douyin.com/user/revised");
    assert.equal(data.profile.mediaAccounts[1].nickname, "新抖音昵称");
    assert.equal(data.profile.mediaAccounts[1].followerCount, 8000);
    assert.equal(data.profile.socialAccount.nickname, "新小红书昵称");
    assert.equal(data.profile.socialAccount.followerCount, 12000);
    assert.equal(data.profile.socialAccount.profileUrl, "https://www.xiaohongshu.com/user/profile/revised");
    assert.equal(data.profile.socialAccount.normalizedProfileUrl, "xiaohongshu:user/profile/revised");
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
    assert.equal(candidates.items.length, 0);

    const assignResponse = await fetch(`${server.adminUrl}/tasks/${created.task._id}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileIds: [String(profile._id)] }),
    });
    assert.equal(assignResponse.status, 409);

    const claimResponse = await fetch(`${server.publicUrl}/tasks/${created.task._id}/claims`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(claimResponse.status, 201);

    const assignmentsResponse = await fetch(`${server.adminUrl}/tasks/${created.task._id}/assignments`);
    assert.equal(assignmentsResponse.status, 200);
    const assigned = await assignmentsResponse.json();
    assert.equal(assigned.assignments.length, 1);
    assert.equal(assigned.assignments[0].status, "assigned");
    assert.equal(assigned.assignments[0].task.title, "任推邦（红薯）评论");
    assert.equal(assigned.assignments[0].user._id, String(user._id));
    assert.equal(assigned.assignments[0].user.mobile, "13800138000");

    const listResponse = await fetch(`${server.publicUrl}/me/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(listResponse.status, 200);
    const listData = await listResponse.json();
    assert.equal(listData.profile.status, "approved");
    assert.match(listData.profile.publicUid, /^\d{9}$/);
    const savedUser = await User.findById(user._id).lean();
    assert.equal(savedUser?.publicUid, listData.profile.publicUid);
    assert.equal(listData.tasks.length, 1);
    assert.equal(listData.tasks[0].unitPriceCents, 3000);
    assert.equal(listData.tasks[0].trafficFeeCents, null);
    assert.equal(listData.tasks[0].announcement, "更新后的项目公告。");
    assert.deepEqual(listData.tasks[0].exampleImageUrls, ["/uploads/admin/example-updated.png"]);
    assert.equal(listData.tasks[0]._id, assigned.assignments[0]._id);
    assert.equal(listData.tasks[0].taskId, created.task._id);

    const repeatedListResponse = await fetch(`${server.publicUrl}/me/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const repeatedListData = await repeatedListResponse.json();
    assert.equal(repeatedListData.profile.publicUid, listData.profile.publicUid);

    const proofPayload = {
      proofLink: "https://www.xiaohongshu.com/explore/comment-proof",
      proofScreenshotUrl: "/uploads/mama-resources/proof.png",
    };
    const earlySubmitResponse = await fetch(`${server.publicUrl}/me/tasks/${assigned.assignments[0]._id}/submissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(proofPayload),
    });
    assert.equal(earlySubmitResponse.status, 409);

    const contentResponse = await fetch(`${server.adminUrl}/tasks/assignments/${assigned.assignments[0]._id}/content`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentUrl: "https://my.feishu.cn/wiki/assigned-content" }),
    });
    assert.equal(contentResponse.status, 200);

    const submitResponse = await fetch(`${server.publicUrl}/me/tasks/${assigned.assignments[0]._id}/submissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(proofPayload),
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

    const transferResponse = await fetch(`${server.adminUrl}/tasks/assignments/${assigned.assignments[0]._id}/transfer-screenshot`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transferScreenshotUrl: "/uploads/images/transfer.png" }),
    });
    assert.equal(transferResponse.status, 200);
    const transferred = await transferResponse.json();
    assert.equal(transferred.assignment.status, "collected");
    assert.equal(transferred.assignment.transferScreenshotUrl, "/uploads/images/transfer.png");
    assert.ok(transferred.assignment.transferScreenshotUpdatedAt);

    const detailResponse = await fetch(`${server.publicUrl}/me/tasks/${assigned.assignments[0]._id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json();
    assert.equal(detail.task.transferScreenshotUrl, "/uploads/images/transfer.png");
    assert.ok(detail.task.transferScreenshotUpdatedAt);
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

  it("lets operators edit and import personal task content links after preview", async () => {
    const [existingProfile, newProfile, pendingProfile] = await MamaResourceProfile.create([
      {
        displayName: "已有分配账号",
        contactWechat: "existing-content-account",
        status: "approved",
        consentAccepted: true,
        categories: ["箱包"],
        socialAccount: {
          platform: "xiaohongshu",
          profileUrl: "https://www.xiaohongshu.com/user/profile/existing-content",
          normalizedProfileUrl: "xiaohongshu:user/profile/existing-content",
        },
      },
      {
        displayName: "待新增分配账号",
        contactWechat: "new-content-account",
        status: "approved",
        consentAccepted: true,
        categories: ["箱包"],
        socialAccount: {
          platform: "xiaohongshu",
          profileUrl: "https://www.xiaohongshu.com/user/profile/new-content",
          normalizedProfileUrl: "xiaohongshu:user/profile/new-content",
        },
      },
      {
        displayName: "未审核账号",
        contactWechat: "pending-content-account",
        status: "pending",
        consentAccepted: true,
        categories: ["箱包"],
        socialAccount: {
          platform: "xiaohongshu",
          profileUrl: "https://www.xiaohongshu.com/user/profile/pending-content",
          normalizedProfileUrl: "xiaohongshu:user/profile/pending-content",
        },
      },
    ]);
    const task = await MamaResourceTask.create({
      title: "专属链接导入任务",
      category: "箱包",
      unitPriceCents: 3000,
      status: "listed",
    });
    const existingAssignment = await MamaResourceTaskAssignment.create({
      taskId: task._id,
      profileId: existingProfile._id,
      status: "assigned",
    });

    const manualResponse = await fetch(`${server.adminUrl}/tasks/assignments/${existingAssignment._id}/content`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentUrl: "https://my.feishu.cn/wiki/manual-link" }),
    });
    assert.equal(manualResponse.status, 200);
    const manualData = await manualResponse.json();
    assert.equal(manualData.assignment.contentUrl, "https://my.feishu.cn/wiki/manual-link");

    const clearManualResponse = await fetch(`${server.adminUrl}/tasks/assignments/${existingAssignment._id}/content`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentUrl: "" }),
    });
    assert.equal(clearManualResponse.status, 200);
    const clearManualData = await clearManualResponse.json();
    assert.equal(clearManualData.assignment.contentUrl, "");
    assert.equal(clearManualData.assignment.contentUpdatedAt, null);
    const clearedAssignment = await MamaResourceTaskAssignment.findById(existingAssignment._id).lean();
    assert.equal(clearedAssignment?.contentUrl, "");
    assert.equal(clearedAssignment?.contentUpdatedAt, null);

    const invalidManualResponse = await fetch(`${server.adminUrl}/tasks/assignments/${existingAssignment._id}/content`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentUrl: "ftp://my.feishu.cn/wiki/not-allowed" }),
    });
    assert.equal(invalidManualResponse.status, 400);

    const templateResponse = await fetch(`${server.adminUrl}/tasks/content-import/template`);
    assert.equal(templateResponse.status, 200);
    assert.equal(
      templateResponse.headers.get("content-type"),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    const templateBook = XLSX.read(Buffer.from(await templateResponse.arrayBuffer()));
    const templateRows = XLSX.utils.sheet_to_json<Record<string, string>>(templateBook.Sheets[templateBook.SheetNames[0]], { defval: "" });
    assert.deepEqual(Object.keys(templateRows[0]), ["好赚账号ID", "专属内容链接"]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      { 好赚账号ID: String(existingProfile._id), 专属内容链接: "https://my.feishu.cn/wiki/import-existing" },
      { 好赚账号ID: String(newProfile._id), 专属内容链接: "https://my.feishu.cn/wiki/import-new" },
      { 好赚账号ID: String(pendingProfile._id), 专属内容链接: "https://my.feishu.cn/wiki/import-pending" },
      { 好赚账号ID: "invalid-id", 专属内容链接: "https://my.feishu.cn/wiki/import-invalid" },
    ]), "专属链接");
    const form = new FormData();
    form.append("file", new Blob([XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })]), "content-links.xlsx");
    const previewResponse = await fetch(`${server.adminUrl}/tasks/${task._id}/content-import/preview`, {
      method: "POST",
      body: form,
    });
    assert.equal(previewResponse.status, 200);
    const previewData = await previewResponse.json();
    assert.equal(previewData.summary.valid, 1);
    assert.equal(previewData.summary.invalid, 3);
    assert.equal(previewData.rows.find((row: any) => row.profileId === String(existingProfile._id)).action, "update_link");
    assert.equal(previewData.rows.find((row: any) => row.profileId === String(newProfile._id)).action, "create_assignment");
    assert.deepEqual(
      previewData.rows.find((row: any) => row.profileId === String(newProfile._id)).errors,
      ["账号尚未领取该任务"]
    );
    assert.deepEqual(
      previewData.rows.find((row: any) => row.profileId === String(pendingProfile._id)).errors,
      ["账号尚未通过审核"]
    );
    assert.equal(await MamaResourceTaskAssignment.countDocuments({ taskId: task._id }), 1);

    const validRows = previewData.rows
      .filter((row: any) => row.valid)
      .map((row: any) => ({ profileId: row.profileId, contentUrl: row.contentUrl }));
    const commitResponse = await fetch(`${server.adminUrl}/tasks/${task._id}/content-import/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: validRows }),
    });
    assert.equal(commitResponse.status, 200);
    const commitData = await commitResponse.json();
    assert.deepEqual(commitData.summary, { created: 0, updated: 1, unchanged: 0 });
    assert.equal(await MamaResourceTaskAssignment.countDocuments({ taskId: task._id }), 1);
    assert.equal(await MamaResourceTaskAssignment.findOne({ taskId: task._id, profileId: newProfile._id }), null);

    const duplicateBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(duplicateBook, XLSX.utils.json_to_sheet([
      { 好赚账号ID: String(newProfile._id), 专属内容链接: "https://my.feishu.cn/wiki/duplicate-one" },
      { 妈妈好赚账号ID: String(newProfile._id), 专属内容链接: "https://my.feishu.cn/wiki/duplicate-two" },
    ]), "专属链接");
    const duplicateForm = new FormData();
    duplicateForm.append("file", new Blob([XLSX.write(duplicateBook, { type: "buffer", bookType: "xlsx" })]), "duplicates.xlsx");
    const duplicateResponse = await fetch(`${server.adminUrl}/tasks/${task._id}/content-import/preview`, {
      method: "POST",
      body: duplicateForm,
    });
    assert.equal(duplicateResponse.status, 200);
    const duplicateData = await duplicateResponse.json();
    assert.equal(duplicateData.summary.valid, 0);
    assert.equal(duplicateData.rows.every((row: any) => row.errors.includes("账号ID重复")), true);
  });

  it("assigns imported content links in order and lets new claims wait when the pool is exhausted", async () => {
    const user = await User.create({ username: "u13800138103", password: "hash", mobile: "13800138103", role: "user" });
    const token = jwt.sign({ id: String(user._id), role: "user" }, process.env.JWT_SECRET || "your-secret-key");
    const [manualProfile, firstProfile, secondProfile, claimProfile] = await MamaResourceProfile.create([
      {
        displayName: "手动链接账号",
        contactPhone: "13800138100",
        contactWechat: "manual-link-account",
        status: "approved",
        consentAccepted: true,
        socialAccount: { platform: "xiaohongshu", profileUrl: "https://www.xiaohongshu.com/user/profile/manual-link", normalizedProfileUrl: "xiaohongshu:user/profile/manual-link" },
      },
      {
        displayName: "顺序账号一",
        contactPhone: "13800138101",
        contactWechat: "ordered-link-one",
        status: "approved",
        consentAccepted: true,
        socialAccount: { platform: "xiaohongshu", profileUrl: "https://www.xiaohongshu.com/user/profile/ordered-one", normalizedProfileUrl: "xiaohongshu:user/profile/ordered-one" },
      },
      {
        displayName: "顺序账号二",
        contactPhone: "13800138102",
        contactWechat: "ordered-link-two",
        status: "approved",
        consentAccepted: true,
        socialAccount: { platform: "xiaohongshu", profileUrl: "https://www.xiaohongshu.com/user/profile/ordered-two", normalizedProfileUrl: "xiaohongshu:user/profile/ordered-two" },
      },
      {
        displayName: "补链领取账号",
        contactPhone: "13800138103",
        contactWechat: "replenished-link-account",
        status: "approved",
        consentAccepted: true,
        socialAccount: { platform: "xiaohongshu", profileUrl: "https://www.xiaohongshu.com/user/profile/replenished", normalizedProfileUrl: "xiaohongshu:user/profile/replenished" },
      },
    ]);
    const task = await MamaResourceTask.create({
      title: "顺序内容下发任务",
      category: "亲子阅读",
      unitPriceCents: 3000,
      status: "listed",
    });
    await MamaResourceTaskAssignment.create({
      taskId: task._id,
      profileId: manualProfile._id,
      status: "assigned",
      contentUrl: "https://my.feishu.cn/wiki/manual-existing",
      contentUpdatedAt: new Date(),
    });
    const firstAssignment = await MamaResourceTaskAssignment.create({ taskId: task._id, profileId: firstProfile._id, status: "assigned" });
    const secondAssignment = await MamaResourceTaskAssignment.create({ taskId: task._id, profileId: secondProfile._id, status: "assigned" });

    const importResponse = await fetch(`${server.adminUrl}/tasks/${task._id}/content-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        linksText: [
          "https://my.feishu.cn/wiki/pool-one",
          "https://my.feishu.cn/wiki/pool-two",
          "https://my.feishu.cn/wiki/pool-one",
        ].join("\n"),
      }),
    });
    assert.equal(importResponse.status, 200);
    const importData = await importResponse.json();
    assert.equal(importData.importedCount, 2);
    assert.equal(importData.skippedCount, 1);
    assert.equal(importData.assignedCount, 2);
    assert.equal(importData.task.contentLinkCount, 2);
    assert.equal(importData.task.contentLinkAssignedCount, 2);
    assert.equal(importData.task.contentLinkRemainingCount, 0);
    assert.equal(importData.task.status, "listed");
    assert.equal(importData.task.pausedForContent, false);

    assert.equal((await MamaResourceTaskAssignment.findById(firstAssignment._id).lean())?.contentUrl, "https://my.feishu.cn/wiki/pool-one");
    assert.equal((await MamaResourceTaskAssignment.findById(secondAssignment._id).lean())?.contentUrl, "https://my.feishu.cn/wiki/pool-two");
    assert.equal(
      (await MamaResourceTaskAssignment.findOne({ taskId: task._id, profileId: manualProfile._id }).lean())?.contentUrl,
      "https://my.feishu.cn/wiki/manual-existing"
    );

    const editPausedTaskResponse = await fetch(`${server.adminUrl}/tasks/${task._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "顺序内容下发任务（已编辑）",
        category: "亲子阅读",
        unitPriceCents: 3000,
        status: "listed",
      }),
    });
    assert.equal(editPausedTaskResponse.status, 200);
    const editPausedTaskData = await editPausedTaskResponse.json();
    assert.equal(editPausedTaskData.task.status, "listed");
    assert.equal(editPausedTaskData.task.pausedForContent, false);
    assert.equal(editPausedTaskData.task.contentLinkRemainingCount, 0);

    const availableTasksResponse = await fetch(`${server.publicUrl}/me/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(availableTasksResponse.status, 200);
    assert.equal((await availableTasksResponse.json()).availableTasks.length, 1);

    const claimResponse = await fetch(`${server.publicUrl}/tasks/${task._id}/claims`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(claimResponse.status, 201);
    const claimData = await claimResponse.json();
    assert.equal(claimData.task.profileId, String(claimProfile._id));
    assert.equal(claimData.task.contentUrl, "");
    assert.equal((await MamaResourceTask.findById(task._id).lean())?.status, "listed");
    assert.equal((await MamaResourceTask.findById(task._id).lean())?.pausedForContent, false);

    const replenishResponse = await fetch(`${server.adminUrl}/tasks/${task._id}/content-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linksText: "https://my.feishu.cn/wiki/pool-three" }),
    });
    assert.equal(replenishResponse.status, 200);
    const replenishData = await replenishResponse.json();
    assert.equal(replenishData.task.status, "listed");
    assert.equal(replenishData.task.pausedForContent, false);
    assert.equal(replenishData.task.contentLinkRemainingCount, 0);
    assert.equal(replenishData.assignedCount, 1);
    assert.equal(
      (await MamaResourceTaskAssignment.findOne({ taskId: task._id, profileId: claimProfile._id }).lean())?.contentUrl,
      "https://my.feishu.cn/wiki/pool-three"
    );
  });

  it("starts proof return timing only after the content link is configured", async () => {
    const task = await MamaResourceTask.create({
      title: "返图状态测试任务",
      category: "亲子阅读",
      unitPriceCents: 3000,
      status: "listed",
    });
    const [returnedProfile, missingProfile, overdueProfile] = await MamaResourceProfile.create([
      {
        displayName: "已返图账号",
        contactWechat: "returned-proof-account",
        status: "approved",
        consentAccepted: true,
        socialAccount: { platform: "xiaohongshu", profileUrl: "https://www.xiaohongshu.com/user/profile/returned-proof", normalizedProfileUrl: "xiaohongshu:user/profile/returned-proof" },
      },
      {
        displayName: "未返图账号",
        contactWechat: "missing-proof-account",
        status: "approved",
        consentAccepted: true,
        socialAccount: { platform: "xiaohongshu", profileUrl: "https://www.xiaohongshu.com/user/profile/missing-proof", normalizedProfileUrl: "xiaohongshu:user/profile/missing-proof" },
      },
      {
        displayName: "逾期未返图账号",
        contactWechat: "overdue-proof-account",
        status: "approved",
        consentAccepted: true,
        socialAccount: { platform: "xiaohongshu", profileUrl: "https://www.xiaohongshu.com/user/profile/overdue-proof", normalizedProfileUrl: "xiaohongshu:user/profile/overdue-proof" },
      },
    ]);
    const now = Date.now();
    await MamaResourceTaskAssignment.create([
      {
        taskId: task._id,
        profileId: returnedProfile._id,
        status: "submitted",
        proofScreenshotUrl: "/uploads/mama-resources/returned-proof.png",
        submittedAt: new Date(now - 60 * 60 * 1000),
        createdAt: new Date(now - 30 * 60 * 60 * 1000),
      },
      {
        taskId: task._id,
        profileId: missingProfile._id,
        status: "assigned",
        createdAt: new Date(now - 30 * 60 * 60 * 1000),
      },
      {
        taskId: task._id,
        profileId: overdueProfile._id,
        status: "assigned",
        createdAt: new Date(now - 25 * 60 * 60 * 1000),
        contentUrl: "https://my.feishu.cn/wiki/overdue-proof-content",
        contentUpdatedAt: new Date(now - 25 * 60 * 60 * 1000),
      },
    ]);

    const allResponse = await fetch(`${server.adminUrl}/tasks/${task._id}/assignments`);
    assert.equal(allResponse.status, 200);
    const allData = await allResponse.json();
    assert.deepEqual(
      Object.fromEntries(allData.assignments.map((assignment: any) => [assignment.profile.displayName, assignment.proofStatus])),
      {
        "已返图账号": "returned",
        "未返图账号": "missing",
        "逾期未返图账号": "overdue",
      }
    );

    const returnedResponse = await fetch(`${server.adminUrl}/tasks/${task._id}/assignments?proofStatus=returned`);
    assert.equal(returnedResponse.status, 200);
    const returnedData = await returnedResponse.json();
    assert.deepEqual(returnedData.assignments.map((assignment: any) => assignment.profile.displayName), ["已返图账号"]);

    const missingResponse = await fetch(`${server.adminUrl}/tasks/${task._id}/assignments?proofStatus=missing`);
    assert.equal(missingResponse.status, 200);
    const missingData = await missingResponse.json();
    assert.deepEqual(new Set(missingData.assignments.map((assignment: any) => assignment.profile.displayName)), new Set(["未返图账号", "逾期未返图账号"]));

    const overdueResponse = await fetch(`${server.adminUrl}/tasks/${task._id}/assignments?proofStatus=overdue`);
    assert.equal(overdueResponse.status, 200);
    const overdueData = await overdueResponse.json();
    assert.deepEqual(overdueData.assignments.map((assignment: any) => assignment.profile.displayName), ["逾期未返图账号"]);
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

  it("returns claimant identity fields and enforces operator tags and blocked ordering", async () => {
    const user = await User.create({
      username: "u13800138200",
      password: "hash",
      mobile: "13800138200",
      name: "圆圆妈妈",
      city: "上海",
      region: "长宁区",
      childGrade: "小学一年级",
      publicUid: "718292949",
      role: "user",
    });
    const token = jwt.sign({ id: String(user._id), role: "user" }, process.env.JWT_SECRET || "your-secret-key");
    const profile = await MamaResourceProfile.create({
      displayName: "圆圆妈妈的小红书",
      contactPhone: "138 0013 8200",
      contactWechat: "yuanyuan-mom",
      status: "approved",
      consentAccepted: true,
      categories: ["亲子阅读"],
      socialAccount: {
        platform: "xiaohongshu",
        profileUrl: "https://www.xiaohongshu.com/user/profile/claimant-identity",
        normalizedProfileUrl: "xiaohongshu:user/profile/claimant-identity",
        nickname: "小圆子",
        followerCount: 3200,
      },
    });
    const [claimedTask, otherTask] = await MamaResourceTask.create([
      { title: "已领取任务", category: "亲子阅读", unitPriceCents: 3000, status: "listed" },
      { title: "待领取任务", category: "亲子阅读", unitPriceCents: 3000, status: "listed" },
    ]);

    const claimResponse = await fetch(`${server.publicUrl}/tasks/${claimedTask._id}/claims`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(claimResponse.status, 201);
    assert.equal(String((await MamaResourceProfile.findById(profile._id).lean())?.userId), String(user._id));

    const operationsResponse = await fetch(`${server.adminUrl}/${profile._id}/operations`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operatorTags: ["配合度高", "母婴", "配合度高"], orderBlocked: true }),
    });
    assert.equal(operationsResponse.status, 200);
    const operations = await operationsResponse.json();
    assert.deepEqual(operations.profile.operatorTags, ["配合度高", "母婴"]);
    assert.equal(operations.profile.orderBlocked, true);

    const assignmentsResponse = await fetch(
      `${server.adminUrl}/tasks/${claimedTask._id}/assignments?search=${user._id}&operatorTag=${encodeURIComponent("配合度高")}&orderBlocked=true`
    );
    assert.equal(assignmentsResponse.status, 200);
    const assignments = await assignmentsResponse.json();
    assert.equal(assignments.assignments.length, 1);
    assert.equal(assignments.assignments[0].profileId, String(profile._id));
    assert.equal(assignments.assignments[0].user._id, String(user._id));
    assert.equal(assignments.assignments[0].user.name, "圆圆妈妈");
    assert.equal(assignments.assignments[0].user.region, "长宁区");
    assert.equal(assignments.assignments[0].user.childGrade, "小学一年级");

    const uidAssignmentsResponse = await fetch(
      `${server.adminUrl}/tasks/${claimedTask._id}/assignments?search=718292949`
    );
    assert.equal(uidAssignmentsResponse.status, 200);
    const uidAssignments = await uidAssignmentsResponse.json();
    assert.equal(uidAssignments.assignments.length, 1);
    assert.equal(uidAssignments.assignments[0].profileId, String(profile._id));

    const myTasksResponse = await fetch(`${server.publicUrl}/me/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(myTasksResponse.status, 200);
    const myTasks = await myTasksResponse.json();
    assert.equal(myTasks.tasks.length, 1);
    assert.equal(myTasks.availableTasks.length, 0);

    const blockedClaimResponse = await fetch(`${server.publicUrl}/tasks/${otherTask._id}/claims`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(blockedClaimResponse.status, 403);
    assert.equal((await blockedClaimResponse.json()).message, "账号已被暂停接单，请联系运营");
  });

  it("does not auto-assign approved profiles before they claim a task", async () => {
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
    assert.equal(data.assignments.length, 0);

    const matchedButUnclaimed = await MamaResourceTaskAssignment.findOne({ profileId: readingProfile._id }).lean();
    assert.equal(matchedButUnclaimed, null);

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
        alipayAccount: "case@example.com",
        alipayVerifiedName: "案例妈妈",
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
