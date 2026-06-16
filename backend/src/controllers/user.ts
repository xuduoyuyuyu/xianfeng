import { Request, Response } from "express";
import User from "../models/User";
import UserPageVisit from "../models/UserPageVisit";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { AuthenticatedRequest } from "../middlewares/auth";
import { sendMobileCodeByVolcengine } from "../services/smsVolcengine";
import UserChildMemory from "../models/UserChildMemory";
import { splitChildMemoryItems } from "../services/childMemory";
import { grantFreeLoginPointsForUser } from "../services/billing";

dotenv.config();
const smsCodeStore = new Map<string, { code: string; expiresAt: number }>();
const smsSendLock = new Map<string, number>();

const WEL_ADMIN_KEY = process.env.WEL_ADMIN_KEY || "weladmin2024";
const WEL_SYNC_URL = process.env.WEL_SYNC_URL || "http://172.19.0.1:18888/api/auth/sync";
const ACCOUNT_DELETE_CONFIRMATION = "确认注销";
const ACCOUNT_RESTORE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

type AdminChildMemoryDoc = {
  userId?: unknown;
  childId?: unknown;
  enabled?: boolean;
  summary?: unknown;
  updatedAt?: unknown;
};

export function summarizeAdminChildMemories(docs: AdminChildMemoryDoc[]) {
  const grouped = new Map<
    string,
    {
      memoryItemCount: number;
      memoryPreview: string;
      latestMemoryAt: Date | null;
      childMemories: Array<{
        childId: string;
        enabled: boolean;
        itemCount: number;
        summary: string;
        preview: string;
        updatedAt: unknown;
      }>;
    }
  >();

  docs.forEach((doc) => {
    const userId = String(doc.userId || "");
    const childId = String(doc.childId || "default");
    if (!userId) return;

    const summary = String(doc.summary || "");
    const items = splitChildMemoryItems(summary);
    const preview = items
      .map((item) => item.text)
      .filter(Boolean)
      .slice(0, 3)
      .join(" / ");
    const updatedAt = doc.updatedAt ? new Date(String(doc.updatedAt)) : null;
    const current =
      grouped.get(userId) ||
      {
        memoryItemCount: 0,
        memoryPreview: "",
        latestMemoryAt: null,
        childMemories: [],
      };

    current.memoryItemCount += items.length;
    if (!current.memoryPreview && preview) current.memoryPreview = preview;
    if (updatedAt && !Number.isNaN(updatedAt.getTime())) {
      if (!current.latestMemoryAt || updatedAt.getTime() > current.latestMemoryAt.getTime()) {
        current.latestMemoryAt = updatedAt;
      }
    }
    current.childMemories.push({
      childId,
      enabled: doc.enabled !== false,
      itemCount: items.length,
      summary,
      preview,
      updatedAt: doc.updatedAt,
    });
    grouped.set(userId, current);
  });

  grouped.forEach((value) => {
    value.childMemories.sort((a, b) => {
      const left = a.updatedAt ? new Date(String(a.updatedAt)).getTime() : 0;
      const right = b.updatedAt ? new Date(String(b.updatedAt)).getTime() : 0;
      return right - left;
    });
  });

  return grouped;
}

async function syncUserToWel(mobile: string, name: string, grade: string, city: string): Promise<string | null> {
  try {
    const res = await fetch(WEL_SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_key: WEL_ADMIN_KEY, mobile, name, grade, city }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.token || null;
  } catch {
    return null;
  }
}

async function resolveCityFromIP(req: Request): Promise<string> {
  try {
    const ip = String(req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "");
    if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.") || ip.startsWith("192.168.") || ip.startsWith("10.")) return "";
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=city&lang=zh-CN`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return "";
    const data = await res.json();
    return data?.city || "";
  } catch {
    return "";
  }
}

function normalizeMobile(input: unknown): string {
  return String(input || "").replace(/\D/g, "").slice(-11);
}

function buildWelProfile(user: any) {
  const safeName = String(user.name || user.username || "用户");
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
    avatar_initial: String(user.avatar_initial || safeName[0] || "探"),
    avatar_image: user.avatar_image || "",
    gender: user.gender || "",
    parentRole: user.parentRole || "",
    proPointBalance: Number(user.proPointBalance || 0),
  };
}

function stringifyAuditValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function isSoftDeleted(user: any): boolean {
  return !!user?.deletionRequestedAt;
}

function canRestoreSoftDeletedUser(user: any): boolean {
  const deadline = user?.deletionRestoreDeadline ? new Date(user.deletionRestoreDeadline).getTime() : 0;
  return isSoftDeleted(user) && deadline >= Date.now();
}

async function restoreSoftDeletedUser(user: any): Promise<boolean> {
  if (!canRestoreSoftDeletedUser(user)) return false;
  user.deletionRequestedAt = null;
  user.deletionRestoreDeadline = null;
  user.deletionRestoredAt = new Date();
  await user.save();
  return true;
}

function canPublicRegister(): boolean {
  return process.env.ALLOW_PUBLIC_REGISTER === "true";
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

export function canAuthenticateWithMobileInvite(input: {
  existingUser: unknown;
  configuredInviteCode: unknown;
  submittedInviteCode: unknown;
}): boolean {
  if (input.existingUser) return true;
  const configuredInviteCode = normalizeText(input.configuredInviteCode);
  if (!configuredInviteCode) return true;
  return normalizeText(input.submittedInviteCode) === configuredInviteCode;
}

export function canVerifyLoginInvite(input: {
  configuredInviteCode: unknown;
  submittedInviteCode: unknown;
}): boolean {
  const configuredInviteCode = normalizeText(input.configuredInviteCode);
  if (!configuredInviteCode) return true;
  return normalizeText(input.submittedInviteCode) === configuredInviteCode;
}

function classifyDeviceType(value: string): "desktop" | "mobile" | "tablet" | "bot" | "other" {
  const ua = normalizeText(value).toLowerCase();
  if (!ua) return "other";
  if (/bot|crawler|spider|slurp/.test(ua)) return "bot";
  if (/ipad|tablet|playbook|silk/.test(ua)) return "tablet";
  if (/mobile|iphone|android|windows phone|blackberry/.test(ua)) return "mobile";
  return "desktop";
}

function topBuckets<T>(rows: T[], getter: (row: T) => string, max = 6) {
  const map: Record<string, number> = {};
  rows.forEach((row) => {
    const key = normalizeText(getter(row)) || "未填写";
    map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

export class UserController {
  async trackPageView(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const pagePath = normalizeText(req.body?.pagePath);
      const pageTitle = normalizeText(req.body?.pageTitle);
      const sessionId = normalizeText(req.body?.sessionId);
      const requestedDeviceType = normalizeText(req.body?.deviceType).toLowerCase();
      const deviceType =
        requestedDeviceType === "desktop" ||
        requestedDeviceType === "mobile" ||
        requestedDeviceType === "tablet" ||
        requestedDeviceType === "bot"
          ? requestedDeviceType
          : classifyDeviceType(String(req.headers["user-agent"] || ""));

      if (!pagePath.startsWith("/") || !sessionId) {
        res.status(400).json({ message: "页面访问参数不完整" });
        return;
      }

      const dedupeQuery: any = {
        sessionId,
        pagePath,
      };
      if (req.user?.id) {
        dedupeQuery.userId = req.user.id;
      } else {
        dedupeQuery.userId = null;
      }
      const recent = await UserPageVisit.findOne(dedupeQuery).sort({ visitedAt: -1 }).lean();
      if (recent?.visitedAt && Date.now() - new Date(recent.visitedAt).getTime() < 8000) {
        res.status(200).json({ ok: true, deduped: true });
        return;
      }

      await UserPageVisit.create({
        userId: req.user?.id || null,
        sessionId,
        pagePath,
        pageTitle,
        deviceType,
        visitedAt: new Date(),
      });
      res.status(201).json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "记录页面访问失败", error });
    }
  }

  async getPortrait(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const roleFilter = normalizeText(req.query?.role);
      const cityFilter = normalizeText(req.query?.city);
      const gradeFilter = normalizeText(req.query?.grade);

      const userQuery: Record<string, any> = {};
      if (roleFilter && roleFilter !== "all") userQuery.role = roleFilter;
      if (cityFilter && cityFilter !== "all") userQuery.city = cityFilter === "未填写" ? "" : cityFilter;
      if (gradeFilter && gradeFilter !== "all") {
        userQuery.$or = [
          { grade: gradeFilter === "未填写" ? "" : gradeFilter },
          { childGrade: gradeFilter === "未填写" ? "" : gradeFilter },
        ];
      }

      const users = await User.find(userQuery)
        .select("_id username role city region childGrade grade name avatar_initial createdAt")
        .lean();

      const total = users.length;
      const admins = users.filter((row: any) => row.role === "admin").length;
      const standardUsers = total - admins;
      const completed = users.filter(
        (row: any) => normalizeText(row.city) && normalizeText(row.region) && (normalizeText(row.childGrade) || normalizeText(row.grade))
      ).length;
      const completionRate = total ? Math.round((completed / total) * 100) : 0;
      const roleBreakdown = [
        { label: "管理员", count: admins },
        { label: "普通用户", count: standardUsers },
      ];
      const cityTop = topBuckets(users, (row: any) => row.city ?? "");
      const gradeTop = topBuckets(users, (row: any) => row.childGrade ?? "");
      const regionTop = topBuckets(users, (row: any) => row.region ?? "");

      const monthlyMap: Record<string, number> = {};
      users.forEach((row: any) => {
        const raw = row.createdAt ? new Date(row.createdAt) : null;
        if (!raw || Number.isNaN(raw.getTime())) return;
        const key = `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, "0")}`;
        monthlyMap[key] = (monthlyMap[key] || 0) + 1;
      });
      const monthlyTrend = Object.entries(monthlyMap)
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(-8);

      const userIds = users.map((row: any) => row._id);
      const visits = userIds.length
        ? await UserPageVisit.find({ userId: { $in: userIds } })
            .select("userId sessionId pagePath pageTitle deviceType visitedAt")
            .sort({ visitedAt: -1 })
            .lean()
        : [];

      const deviceMap: Record<string, number> = {
        desktop: 0,
        mobile: 0,
        tablet: 0,
        bot: 0,
        other: 0,
      };
      const pageMap = new Map<
        string,
        {
          pagePath: string;
          pageTitle: string;
          pv: number;
          uvUsers: Set<string>;
          pc: number;
          mobile: number;
        }
      >();

      visits.forEach((row: any) => {
        const pagePath = normalizeText(row.pagePath) || "/";
        const pageTitle = normalizeText(row.pageTitle) || pagePath;
        const deviceType = normalizeText(row.deviceType) || "other";
        const userId = String(row.userId || "");
        deviceMap[deviceType] = (deviceMap[deviceType] || 0) + 1;

        const current =
          pageMap.get(pagePath) ||
          {
            pagePath,
            pageTitle,
            pv: 0,
            uvUsers: new Set<string>(),
            pc: 0,
            mobile: 0,
          };
        current.pv += 1;
        if (userId) current.uvUsers.add(userId);
        if (deviceType === "desktop") current.pc += 1;
        if (deviceType === "mobile" || deviceType === "tablet") current.mobile += 1;
        pageMap.set(pagePath, current);
      });

      const pageStats = Array.from(pageMap.values())
        .map((item) => ({
          pagePath: item.pagePath,
          pageTitle: item.pageTitle,
          pv: item.pv,
          uv: item.uvUsers.size,
          pc: item.pc,
          mobile: item.mobile,
        }))
        .sort((a, b) => b.pv - a.pv)
        .slice(0, 12);

      const deviceBreakdown = [
        { label: "PC", count: deviceMap.desktop || 0 },
        { label: "移动端", count: (deviceMap.mobile || 0) + (deviceMap.tablet || 0) },
        { label: "其他", count: (deviceMap.other || 0) + (deviceMap.bot || 0) },
      ];

      res.status(200).json({
        stats: {
          total,
          admins,
          users: standardUsers,
          completed,
          completionRate,
          totalPageViews: visits.length,
          totalUv: new Set(visits.map((item: any) => String(item.userId || "")).filter(Boolean)).size,
          totalPcViews: deviceMap.desktop || 0,
        },
        roleBreakdown,
        cityTop,
        gradeTop,
        regionTop,
        monthlyTrend,
        deviceBreakdown,
        pageStats,
      });
    } catch (error) {
      res.status(500).json({ message: "获取用户画像数据失败", error });
    }
  }

  async sendMobileCode(req: Request, res: Response): Promise<void> {
    const mobile = normalizeMobile(req.body?.mobile);
    if (!canVerifyLoginInvite({
      configuredInviteCode: process.env.LOGIN_INVITE_CODE,
      submittedInviteCode: req.body?.inviteCode,
    })) {
      res.status(403).json({ error: "请输入正确的邀请码" });
      return;
    }
    if (!/^1\d{10}$/.test(mobile)) {
      res.status(400).json({ error: "请输入正确的11位手机号" });
      return;
    }
    const now = Date.now();
    const lastSentAt = smsSendLock.get(mobile) || 0;
    if (now - lastSentAt < 60 * 1000) {
      res.status(429).json({ error: "请求过于频繁，请60秒后再试" });
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const sendResult = await sendMobileCodeByVolcengine({ mobile, code });
    if (!sendResult.ok) {
      const failedResult = sendResult as { ok: false; error?: string; code?: string };
      const errMsg = failedResult.code
        ? `${failedResult.error || "短信发送失败"} (${failedResult.code})`
        : (failedResult.error || "短信发送失败");
      res.status(500).json({ error: errMsg });
      return;
    }
    smsSendLock.set(mobile, now);
    smsCodeStore.set(mobile, { code, expiresAt: now + 10 * 60 * 1000 });
    res.status(200).json({ ok: true, expireSeconds: 600 });
  }

  async verifyInviteCode(req: Request, res: Response): Promise<void> {
    if (!canVerifyLoginInvite({
      configuredInviteCode: process.env.LOGIN_INVITE_CODE,
      submittedInviteCode: req.body?.inviteCode,
    })) {
      res.status(403).json({ error: "请输入正确的邀请码" });
      return;
    }
    res.status(200).json({ ok: true });
  }

  async mobileAuth(req: Request, res: Response): Promise<void> {
    try {
      const mobile = normalizeMobile(req.body?.mobile);
      const code = String(req.body?.code || "").trim();
      if (!/^1\d{10}$/.test(mobile)) {
        res.status(400).json({ error: "请输入正确的11位手机号" });
        return;
      }
      const rec = smsCodeStore.get(mobile);
      if (!rec || rec.expiresAt < Date.now() || rec.code !== code) {
        res.status(400).json({ error: "验证码错误或已过期" });
        return;
      }

      let user = await User.findOne({ mobile });
      // Backfill legacy accounts that were created before `mobile` was reliably persisted.
      // Some rows only kept `username` as `u<mobile>` or raw `<mobile>`.
      if (!user) {
        user = await User.findOne({
          $or: [{ username: `u${mobile}` }, { username: mobile }],
        });
        if (user && !user.mobile) {
          user.mobile = mobile;
          await user.save();
        }
      }
      if (!canAuthenticateWithMobileInvite({
        existingUser: user,
        configuredInviteCode: process.env.LOGIN_INVITE_CODE,
        submittedInviteCode: req.body?.inviteCode,
      })) {
        res.status(403).json({ error: "请输入正确的邀请码" });
        return;
      }
      smsCodeStore.delete(mobile);

      if (!user) {
        const username = `u${mobile}`;
        const password = await bcryptjs.hash(`mob-${mobile}-${Date.now()}`, 10);
        const ipCity = await resolveCityFromIP(req);
        user = new User({
          username,
          password,
          mobile,
          name: username,
          grade: "",
          city: ipCity,
          role: "user",
          level: 1,
          xp: 0,
          streak: 0,
          avatar_initial: "探",
          avatar_image: "",
        });
        await user.save();
      } else if (isSoftDeleted(user)) {
        const restored = await restoreSoftDeletedUser(user);
        if (!restored) {
          res.status(410).json({ error: "账号已注销，恢复窗口已过期" });
          return;
        }
      }
      await grantFreeLoginPointsForUser(user);

      // 登录时如果 city 为空，用 IP 推断补填
      if (!user.city) {
        const ipCity = await resolveCityFromIP(req);
        if (ipCity) {
          user.city = ipCity;
          await user.save();
        }
      }

      const expiresIn = (process.env.JWT_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"];
      const token = jwt.sign(
        { id: user._id, role: user.role },
        (process.env.JWT_SECRET || "your-secret-key") as jwt.Secret,
        { expiresIn }
      );

      // Sync user to wel main database (fire-and-forget, don't block login response)
      syncUserToWel(mobile, user.name || "", user.grade || "", user.city || "").catch(() => {});
      res.status(200).json({ token, user: buildWelProfile(user) });
      return;
    } catch (error) {
      res.status(500).json({ error: "登录失败", message: String((error as Error)?.message || error) });
    }
  }

  async meCompat(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "未登录或登录已过期" });
        return;
      }
      const user = await User.findById(req.user.id);
      if (!user) {
        res.status(404).json({ error: "用户不存在" });
        return;
      }
      if (isSoftDeleted(user)) {
        res.status(410).json({ error: "账号已注销，请在3天内重新登录恢复" });
        return;
      }
      await grantFreeLoginPointsForUser(user);
      res.status(200).json(buildWelProfile(user));
    } catch (error) {
      res.status(500).json({ error: "获取用户信息失败", message: String((error as Error)?.message || error) });
    }
  }

  async patchMeCompat(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "未登录或登录已过期" });
        return;
      }
      const user = await User.findById(req.user.id);
      if (!user) {
        res.status(404).json({ error: "用户不存在" });
        return;
      }
      if (isSoftDeleted(user)) {
        res.status(410).json({ error: "账号已注销，请在3天内重新登录恢复" });
        return;
      }
      const body = req.body || {};
      if (typeof body.name === "string") user.name = body.name.trim();
      if (typeof body.city === "string") user.city = body.city.trim();
      if (typeof body.region === "string") user.region = body.region.trim();
      if (typeof body.grade === "string") user.grade = body.grade.trim();
      if (typeof body.avatar_initial === "string") user.avatar_initial = body.avatar_initial.trim().slice(0, 2) || "探";
      if (typeof body.avatar_image === "string") user.avatar_image = body.avatar_image.trim();
      if (typeof body.gender === "string") user.gender = body.gender.trim().slice(0, 4);
      if (typeof body.parentRole === "string") user.parentRole = body.parentRole.trim().slice(0, 12);
      await user.save();
      res.status(200).json(buildWelProfile(user));
    } catch (error) {
      res.status(500).json({ error: "更新资料失败", message: String((error as Error)?.message || error) });
    }
  }

  async uploadAvatar(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "未登录或登录已过期" });
        return;
      }
      const file = (req as any).file;
      if (!file) {
        res.status(400).json({ message: "请上传图片文件" });
        return;
      }
      const host = `${req.protocol}://${req.get("host")}`;
      const url = `${host}/uploads/avatars/${file.filename}`;
      // 同时写入用户表
      const user = await User.findById(req.user.id);
      if (user && isSoftDeleted(user)) {
        res.status(410).json({ error: "账号已注销，请在3天内重新登录恢复" });
        return;
      }
      if (user) {
        user.avatar_image = url;
        await user.save();
      }
      res.status(201).json({ url });
    } catch (error) {
      res.status(500).json({ error: "头像上传失败", message: String((error as Error)?.message || error) });
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body;
      const user = await User.findOne({ username });
      if (!user) {
        res.status(401).json({ message: "用户名或密码错误" });
        return;
      }
      const isPasswordValid = await bcryptjs.compare(password, user.password);
      if (!isPasswordValid) {
        res.status(401).json({ message: "用户名或密码错误" });
        return;
      }
      if (isSoftDeleted(user)) {
        const restored = await restoreSoftDeletedUser(user);
        if (!restored) {
          res.status(410).json({ message: "账号已注销，恢复窗口已过期" });
          return;
        }
      }
      await grantFreeLoginPointsForUser(user);
      const expiresIn = (process.env.JWT_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"];
      const token = jwt.sign(
        { id: user._id, role: user.role },
        (process.env.JWT_SECRET || "your-secret-key") as jwt.Secret,
        { expiresIn }
      );
      // Sync to wel main database if mobile exists
      let welToken: string | null = null;
      if (user.mobile) {
        welToken = await syncUserToWel(user.mobile, user.name || "", user.grade || "", user.city || "");
      }

      res.status(200).json({
        token,
        welToken: welToken || undefined,
        user: buildWelProfile(user),
      });
    } catch (error) {
      res.status(500).json({ message: "登录失败", error });
    }
  }

  async register(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!canPublicRegister()) {
        if (!req.user || req.user.role !== "admin") {
          res.status(403).json({
            message: "当前环境不允许公开注册，仅管理员可创建账号",
          });
          return;
        }
      }
      const { username, password, role, city, region, childGrade } = req.body;
      const safeUsername = typeof username === "string" ? username.trim() : "";
      const safePassword = typeof password === "string" ? password.trim() : "";
      if (!safeUsername || !safePassword) {
        res.status(400).json({ message: "请填写用户名和密码" });
        return;
      }
      const existingUser = await User.findOne({ username: safeUsername });
      if (existingUser) {
        res.status(400).json({ message: "用户名已存在" });
        return;
      }
      const isAdminCreator = req.user?.role === "admin";
      const safeRole = isAdminCreator && role === "admin" ? "admin" : "user";
      const hashedPassword = await bcryptjs.hash(safePassword, 10);
      const user = new User({
        username: safeUsername,
        password: hashedPassword,
        role: safeRole,
        city: typeof city === "string" ? city : "",
        region: typeof region === "string" ? region : "",
        childGrade: typeof childGrade === "string" ? childGrade : "",
      });
      await user.save();
      await grantFreeLoginPointsForUser(user);
      res.status(201).json({
        message: "用户注册成功",
        user: {
          _id: user._id,
          id: user._id,
          username: user.username,
          role: user.role,
          proPointBalance: Number(user.proPointBalance || 0),
          city: user.city,
          region: user.region,
          childGrade: user.childGrade,
        },
      });
    } catch (error) {
      res.status(400).json({ message: "注册失败", error });
    }
  }

  async me(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ message: "未登录或登录已过期" });
        return;
      }
      const user = await User.findById(req.user.id).select("-password");
      if (!user) {
        res.status(404).json({ message: "用户不存在" });
        return;
      }
      if (isSoftDeleted(user)) {
        res.status(410).json({ message: "账号已注销，请在3天内重新登录恢复" });
        return;
      }
      res.status(200).json(user);
    } catch (error) {
      res.status(500).json({ message: "获取用户信息失败", error });
    }
  }

  async deleteMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ message: "未登录或登录已过期" });
        return;
      }
      const confirmation = String(req.body?.confirmation || "").trim();
      if (confirmation !== ACCOUNT_DELETE_CONFIRMATION) {
        res.status(400).json({ message: `请输入“${ACCOUNT_DELETE_CONFIRMATION}”后再注销账号` });
        return;
      }
      const user = await User.findById(req.user.id);
      if (!user) {
        res.status(404).json({ message: "用户不存在" });
        return;
      }
      const now = new Date();
      user.deletionRequestedAt = now;
      user.deletionRestoreDeadline = new Date(now.getTime() + ACCOUNT_RESTORE_WINDOW_MS);
      user.deletionRestoredAt = null;
      await user.save();
      res.status(200).json({
        message: "账号已申请注销，3天内重新登录可恢复",
        restoreDeadline: user.deletionRestoreDeadline,
      });
    } catch (error) {
      res.status(400).json({ message: "注销账号失败", error });
    }
  }

  async getAll(_req: Request, res: Response): Promise<void> {
    try {
      const users = await User.find().select("-password").lean();
      const userIds = users.map((user: any) => user._id);
      const memories = userIds.length
        ? await UserChildMemory.find({ userId: { $in: userIds } })
            .select("userId childId enabled summary updatedAt")
            .lean()
        : [];
      const memoryMap = summarizeAdminChildMemories(memories as AdminChildMemoryDoc[]);
      const rows = users.map((user: any) => {
        const memorySummary = memoryMap.get(String(user._id));
        return {
          ...user,
          childMemories: memorySummary?.childMemories || [],
          memoryItemCount: memorySummary?.memoryItemCount || 0,
          memoryPreview: memorySummary?.memoryPreview || "",
          latestMemoryAt: memorySummary?.latestMemoryAt || null,
        };
      });
      res.status(200).json(rows);
    } catch (error) {
      res.status(500).json({ message: "获取用户列表失败", error });
    }
  }

  async update(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== "admin") {
        res.status(403).json({ message: "当前账号没有管理员权限" });
        return;
      }
      const { id } = req.params;
      const { username, password, role, city, region, childGrade, grade, name, proPointBalance } = req.body || {};

      const user = await User.findById(id);
      if (!user) {
        res.status(404).json({ message: "用户不存在" });
        return;
      }

      const changes: Array<{ field: string; oldValue: string; newValue: string }> = [];
      const setTrackedString = (field: "city" | "region" | "childGrade" | "grade" | "name", value: unknown) => {
        if (typeof value !== "string") return;
        const oldValue = stringifyAuditValue((user as any)[field]);
        const newValue = value.trim();
        if (oldValue !== newValue) {
          changes.push({ field, oldValue, newValue });
        }
        (user as any)[field] = newValue;
      };

      if (typeof username === "string" && username.trim()) {
        const nextUsername = username.trim();
        const existing = await User.findOne({ username: nextUsername, _id: { $ne: id } });
        if (existing) {
          res.status(400).json({ message: "用户名已存在" });
          return;
        }
        if (user.username !== nextUsername) {
          changes.push({ field: "username", oldValue: stringifyAuditValue(user.username), newValue: nextUsername });
        }
        user.username = nextUsername;
      }
      if (typeof role === "string" && (role === "admin" || role === "user")) {
        if (String(req.user.id) === String(id) && role !== "admin") {
          res.status(400).json({ message: "不能取消当前登录账号的管理员权限" });
          return;
        }
        if (user.role !== role) {
          changes.push({ field: "role", oldValue: stringifyAuditValue(user.role), newValue: role });
        }
        user.role = role;
      }
      setTrackedString("city", city);
      setTrackedString("region", region);
      setTrackedString("childGrade", childGrade);
      setTrackedString("grade", grade);
      setTrackedString("name", name);
      if (proPointBalance !== undefined) {
        const nextBalance = Number(proPointBalance);
        if (!Number.isFinite(nextBalance) || nextBalance < 0) {
          res.status(400).json({ message: "当前点数必须是大于等于 0 的数字" });
          return;
        }
        const normalizedBalance = Math.round(nextBalance * 100) / 100;
        const oldValue = stringifyAuditValue((user as any).proPointBalance || 0);
        const newValue = stringifyAuditValue(normalizedBalance);
        if (oldValue !== newValue) {
          changes.push({ field: "proPointBalance", oldValue, newValue });
        }
        (user as any).proPointBalance = normalizedBalance;
      }
      if (typeof password === "string" && password.trim()) {
        changes.push({ field: "password", oldValue: "", newValue: "已重置" });
        user.password = await bcryptjs.hash(password, 10);
      }
      if (changes.length) {
        const entries = changes.map((change) => ({
          ...change,
          changedAt: new Date(),
          changedBy: String(req.user.id || ""),
        }));
        const history = Array.isArray((user as any).changeHistory) ? (user as any).changeHistory : [];
        (user as any).changeHistory = [...history, ...entries].slice(-80);
      }

      await user.save();
      const saved = await User.findById(id).select("-password");
      res.status(200).json(saved);
    } catch (error) {
      res.status(400).json({ message: "更新用户失败", error });
    }
  }

  async delete(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== "admin") {
        res.status(403).json({ message: "当前账号没有管理员权限" });
        return;
      }
      const { id } = req.params;
      if (String(req.user.id) === String(id)) {
        res.status(400).json({ message: "不能删除当前登录账号" });
        return;
      }
      const deleted = await User.findByIdAndDelete(id);
      if (!deleted) {
        res.status(404).json({ message: "用户不存在" });
        return;
      }
      res.status(200).json({ message: "删除成功" });
    } catch (error) {
      res.status(400).json({ message: "删除用户失败", error });
    }
  }
}
