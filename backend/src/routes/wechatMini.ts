import express from "express";
import bcryptjs from "bcryptjs";
import mongoose from "mongoose";
import User from "../models/User";
import Topic from "../models/Topic";
import XiaowanziShare from "../models/XiaowanziShare";
import { authenticate, AuthenticatedRequest } from "../middlewares/auth";
import { requirePro } from "../middlewares/requirePro";
import { grantFreeLoginPointsForUser } from "../services/billing";
import { fetchWechatMiniPhoneNumber, fetchWechatMiniSession, fetchWechatMiniUnlimitedQRCode, signUserJwt } from "../services/wechatMiniAuth";
import { recognizeXiaowanziImageDataUrl } from "../services/xiaowanziAttachmentRecognition";
import { makeQrPngWhitePixelsTransparent } from "../services/pngTransparency";

const router = express.Router();
const WECHAT_MINI_ENV_VERSIONS = new Set(["release", "trial", "develop"]);

function requestedMiniEnvVersion(value: unknown): string | undefined {
  const envVersion = String(value || "").trim();
  return WECHAT_MINI_ENV_VERSIONS.has(envVersion) ? envVersion : undefined;
}

function shouldCheckMiniPagePath(envVersion: string | undefined): boolean {
  return !envVersion || envVersion === "release";
}

function buildMiniProfile(user: any) {
  const safeName = String(user.name || user.username || "微信用户");
  return {
    id: user._id,
    username: user.username,
    role: user.role,
    mobile: user.mobile || "",
    name: safeName,
    grade: user.grade || user.childGrade || "",
    city: user.city || "",
    region: user.region || "",
    level: Number(user.level || 1),
    xp: Number(user.xp || 0),
    streak: Number(user.streak || 0),
    avatar_initial: String(user.avatar_initial || safeName[0] || "家"),
    avatar_image: user.avatar_image || "",
    gender: user.gender || "",
    parentRole: user.parentRole || "",
    proPointBalance: Number(user.proPointBalance || 0),
  };
}

function findUserByMobile(mobile: string) {
  return User.findOne({
    $or: [
      { mobile },
      { username: `u${mobile}` },
      { username: mobile },
    ],
  });
}

function findUserByWechatIdentity(session: { openid: string; unionid?: string }) {
  if (session.unionid) {
    return User.findOne({
      $or: [
        { wechatMiniOpenid: session.openid },
        { wechatUnionid: session.unionid },
      ],
    });
  }
  return User.findOne({ wechatMiniOpenid: session.openid });
}

function topicIdentityFilter(value: string) {
  const id = String(value || "").trim();
  if (!id) return null;
  if (mongoose.Types.ObjectId.isValid(id)) return { $or: [{ _id: id }, { slug: id }] };
  return { slug: id };
}

function normalizeShareText(value: unknown, limit: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizeShareContentText(value: unknown, limit: number) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit);
}

function sanitizeXiaowanziShareMessages(messages: unknown) {
  return (Array.isArray(messages) ? messages : [])
    .map((message: any) => {
      const role = message?.role === "user" ? "user" : "assistant";
      const content = normalizeShareContentText(message?.content, 4000);
      return content ? { role, content } : null;
    })
    .filter(Boolean)
    .slice(0, 8);
}

function buildXiaowanziShareTitle(messages: Array<{ role: "user" | "assistant"; content: string }>, fallback: unknown) {
  const explicit = normalizeShareText(fallback, 40);
  if (explicit) return explicit;
  const question = messages.find((message) => message.role === "user") || messages[0];
  const text = normalizeShareText(question?.content, 28);
  return text ? `小玩子：${text}` : "小玩子对话";
}

async function moveWechatIdentityToTarget(sourceUser: any, targetUser: any, session: { openid: string; unionid?: string }) {
  targetUser.wechatMiniOpenid = session.openid;
  if (session.unionid) targetUser.wechatUnionid = session.unionid;
  if (sourceUser && String(sourceUser._id) !== String(targetUser._id)) {
    sourceUser.wechatMiniOpenid = "";
    if (!session.unionid || sourceUser.wechatUnionid === session.unionid) sourceUser.wechatUnionid = "";
    await sourceUser.save();
  }
}

router.post("/login", async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim();
    const phoneCode = String(req.body?.phoneCode || "").trim();
    if (!code) {
      res.status(400).json({ error: "缺少微信登录 code" });
      return;
    }
    if (!phoneCode) {
      res.status(400).json({ error: "请授权手机号登录" });
      return;
    }

    const session = await fetchWechatMiniSession(code);
    const mobile = await fetchWechatMiniPhoneNumber(phoneCode);
    const openidUser = await findUserByWechatIdentity(session);
    const mobileUser = await findUserByMobile(mobile);
    let user = openidUser;

    if (mobileUser) {
      await moveWechatIdentityToTarget(openidUser, mobileUser, session);
      user = mobileUser;
    }

    if (!user) {
      user = new User({
        username: `u${mobile}`,
        password: await bcryptjs.hash(`wx-${session.openid}-${Date.now()}`, 10),
        name: "微信用户",
        mobile,
        grade: "",
        role: "user",
        level: 1,
        xp: 0,
        streak: 0,
        avatar_initial: "家",
        avatar_image: "",
        wechatMiniOpenid: session.openid,
        wechatUnionid: session.unionid || "",
      });
    } else {
      user.mobile = mobile;
      await moveWechatIdentityToTarget(openidUser, user, session);
      if (user.deletionRequestedAt) {
        user.deletionRequestedAt = null;
        user.deletionRestoreDeadline = null;
        user.deletionRestoredAt = new Date();
      }
    }

    await user.save();
    await grantFreeLoginPointsForUser(user);

    res.json({
      token: signUserJwt(user),
      user: buildMiniProfile(user),
      openidBound: true,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "微信登录失败" });
  }
});

router.post("/bind-phone", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const phoneCode = String(req.body?.phoneCode || "").trim();
    if (!phoneCode) {
      res.status(400).json({ error: "请授权手机号绑定" });
      return;
    }

    const user = await User.findById(req.user?.id);
    if (!user) {
      res.status(404).json({ error: "用户不存在" });
      return;
    }

    const mobile = await fetchWechatMiniPhoneNumber(phoneCode);
    const existingMobileUser = await findUserByMobile(mobile);
    let boundUser = user;

    if (existingMobileUser && String(existingMobileUser._id) !== String(user._id)) {
      existingMobileUser.wechatMiniOpenid = user.wechatMiniOpenid || existingMobileUser.wechatMiniOpenid || "";
      if (user.wechatUnionid) existingMobileUser.wechatUnionid = user.wechatUnionid;
      if (existingMobileUser.deletionRequestedAt) {
        existingMobileUser.deletionRequestedAt = null;
        existingMobileUser.deletionRestoreDeadline = null;
        existingMobileUser.deletionRestoredAt = new Date();
      }
      user.wechatMiniOpenid = "";
      if (user.wechatUnionid === existingMobileUser.wechatUnionid) user.wechatUnionid = "";
      await user.save();
      boundUser = existingMobileUser;
    } else {
      user.mobile = mobile;
    }

    await boundUser.save();
    await grantFreeLoginPointsForUser(boundUser);

    res.json({
      token: signUserJwt(boundUser),
      user: buildMiniProfile(boundUser),
      phoneBound: true,
      accountSwitched: String(boundUser._id) !== String(user._id),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "绑定手机号失败" });
  }
});

router.post("/xiaowanzi/attachments/recognize", authenticate, requirePro("xiaowanzi_file"), async (req, res) => {
  try {
    const result = await recognizeXiaowanziImageDataUrl({
      dataUrl: req.body?.dataUrl,
      prompt: req.body?.prompt,
    });
    res.json(result);
  } catch (error: any) {
    res.status(Number(error?.statusCode || 502)).json({ message: error?.message || "图片识别失败" });
  }
});

router.get("/topic-qrcode", async (req, res) => {
  try {
    const topicId = String(req.query.topicId || req.query.slug || "").trim();
    const filter = topicIdentityFilter(topicId);
    if (!filter) {
      res.status(400).json({ error: "缺少话题 ID" });
      return;
    }

    const topic = await Topic.findOne({
      $and: [
        filter,
        { status: { $ne: "hidden" } },
      ],
    }).select("_id").lean();
    if (!topic) {
      res.status(404).json({ error: "话题不存在" });
      return;
    }

    const envVersion = requestedMiniEnvVersion(req.query.envVersion);
    const code = await fetchWechatMiniUnlimitedQRCode({
      scene: `t=${String((topic as any)._id)}`,
      page: "pages/share/index",
      width: 280,
      envVersion,
      checkPath: shouldCheckMiniPagePath(envVersion),
    });
    res.setHeader("content-type", "image/png");
    res.setHeader("cache-control", "public, max-age=3600");
    res.send(code);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "生成小程序码失败" });
  }
});

router.post("/xiaowanzi-shares", async (req, res) => {
  try {
    const messages = sanitizeXiaowanziShareMessages(req.body?.messages) as Array<{ role: "user" | "assistant"; content: string }>;
    if (!messages.length) {
      res.status(400).json({ error: "缺少可分享的对话内容" });
      return;
    }

    const share = await XiaowanziShare.create({
      title: buildXiaowanziShareTitle(messages, req.body?.title),
      messages: sanitizeXiaowanziShareMessages(req.body?.messages),
    });

    res.json({
      id: String(share._id),
      title: share.title,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "保存分享内容失败" });
  }
});

router.get("/xiaowanzi-shares/:shareId", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.shareId)) {
      res.status(404).json({ error: "分享内容不存在" });
      return;
    }
    const share = await XiaowanziShare.findById(req.params.shareId).lean();
    if (!share) {
      res.status(404).json({ error: "分享内容不存在" });
      return;
    }
    res.json({
      id: String((share as any)._id),
      title: share.title || "小玩子对话",
      messages: Array.isArray((share as any).messages) ? (share as any).messages : [],
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "读取分享内容失败" });
  }
});

router.get("/xiaowanzi-share-qrcode", async (req, res) => {
  try {
    const shareId = String(req.query.shareId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(shareId)) {
      res.status(400).json({ error: "缺少分享 ID" });
      return;
    }
    const share = await XiaowanziShare.findById(shareId).select("_id").lean();
    if (!share) {
      res.status(404).json({ error: "分享内容不存在" });
      return;
    }

    const envVersion = requestedMiniEnvVersion(req.query.envVersion);
    const code = await fetchWechatMiniUnlimitedQRCode({
      scene: `s=${String(share._id)}`,
      page: "pages/share/index",
      width: 280,
      envVersion,
      checkPath: shouldCheckMiniPagePath(envVersion),
      isHyaline: true,
    });
    res.setHeader("content-type", "image/png");
    res.setHeader("cache-control", "no-store");
    res.send(makeQrPngWhitePixelsTransparent(code));
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "生成小程序码失败" });
  }
});

export default router;
