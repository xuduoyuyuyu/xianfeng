import express from "express";
import bcryptjs from "bcryptjs";
import User from "../models/User";
import { grantFreeLoginPointsForUser } from "../services/billing";
import { fetchWechatMiniSession, signUserJwt } from "../services/wechatMiniAuth";

const router = express.Router();

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

router.post("/login", async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim();
    if (!code) {
      res.status(400).json({ error: "缺少微信登录 code" });
      return;
    }

    const session = await fetchWechatMiniSession(code);
    let user = await User.findOne({ wechatMiniOpenid: session.openid });

    if (!user && session.unionid) {
      user = await User.findOne({ wechatUnionid: session.unionid });
    }

    if (!user) {
      const suffix = session.openid.slice(-8) || Date.now().toString(36);
      user = new User({
        username: `wx_${suffix}`,
        password: await bcryptjs.hash(`wx-${session.openid}-${Date.now()}`, 10),
        name: "微信用户",
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
      user.wechatMiniOpenid = session.openid;
      if (session.unionid) user.wechatUnionid = session.unionid;
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

export default router;
