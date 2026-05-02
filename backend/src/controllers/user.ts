import { Request, Response } from "express";
import User from "../models/User";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { AuthenticatedRequest } from "../middlewares/auth";

dotenv.config();
const smsCodeStore = new Map<string, { code: string; expiresAt: number }>();

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
    level: Number(user.level || 1),
    xp: Number(user.xp || 0),
    streak: Number(user.streak || 0),
    avatar_initial: String(user.avatar_initial || safeName[0] || "探"),
    avatar_image: user.avatar_image || "",
  };
}

function canPublicRegister(): boolean {
  return process.env.ALLOW_PUBLIC_REGISTER === "true";
}

export class UserController {
  async sendMobileCode(req: Request, res: Response): Promise<void> {
    const mobile = normalizeMobile(req.body?.mobile);
    if (!/^1\d{10}$/.test(mobile)) {
      res.status(400).json({ error: "请输入正确的11位手机号" });
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    smsCodeStore.set(mobile, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
    res.status(200).json({ ok: true, debugCode: code });
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
      smsCodeStore.delete(mobile);

      let user = await User.findOne({ mobile });
      if (!user) {
        const username = `u${mobile}`;
        const password = await bcryptjs.hash(`mob-${mobile}-${Date.now()}`, 10);
        user = new User({
          username,
          password,
          mobile,
          name: username,
          grade: "初中八年级",
          role: "user",
          level: 1,
          xp: 0,
          streak: 0,
          avatar_initial: "探",
          avatar_image: "",
        });
        await user.save();
      }

      const expiresIn = (process.env.JWT_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"];
      const token = jwt.sign(
        { id: user._id, role: user.role },
        (process.env.JWT_SECRET || "your-secret-key") as jwt.Secret,
        { expiresIn }
      );
      res.status(200).json({ token, user: buildWelProfile(user) });
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
      const body = req.body || {};
      if (typeof body.name === "string") user.name = body.name.trim();
      if (typeof body.city === "string") user.city = body.city.trim();
      if (typeof body.grade === "string") user.grade = body.grade.trim();
      if (typeof body.avatar_initial === "string") user.avatar_initial = body.avatar_initial.trim().slice(0, 2) || "探";
      if (typeof body.avatar_image === "string") user.avatar_image = body.avatar_image.trim();
      await user.save();
      res.status(200).json(buildWelProfile(user));
    } catch (error) {
      res.status(500).json({ error: "更新资料失败", message: String((error as Error)?.message || error) });
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
      const expiresIn = (process.env.JWT_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"];
      const token = jwt.sign(
        { id: user._id, role: user.role },
        (process.env.JWT_SECRET || "your-secret-key") as jwt.Secret,
        { expiresIn }
      );
      res.status(200).json({
        token,
        user: { id: user._id, username: user.username, role: user.role },
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
      res.status(201).json({
        message: "用户注册成功",
        user: {
          _id: user._id,
          id: user._id,
          username: user.username,
          role: user.role,
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
      res.status(200).json(user);
    } catch (error) {
      res.status(500).json({ message: "获取用户信息失败", error });
    }
  }

  async getAll(_req: Request, res: Response): Promise<void> {
    try {
      const users = await User.find().select("-password");
      res.status(200).json(users);
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
      const { username, password, role, city, region, childGrade } = req.body || {};

      const user = await User.findById(id);
      if (!user) {
        res.status(404).json({ message: "用户不存在" });
        return;
      }

      if (typeof username === "string" && username.trim()) {
        const existing = await User.findOne({ username: username.trim(), _id: { $ne: id } });
        if (existing) {
          res.status(400).json({ message: "用户名已存在" });
          return;
        }
        user.username = username.trim();
      }
      if (typeof role === "string" && (role === "admin" || role === "user")) {
        if (String(req.user.id) === String(id) && role !== "admin") {
          res.status(400).json({ message: "不能取消当前登录账号的管理员权限" });
          return;
        }
        user.role = role;
      }
      if (typeof city === "string") user.city = city;
      if (typeof region === "string") user.region = region;
      if (typeof childGrade === "string") user.childGrade = childGrade;
      if (typeof password === "string" && password.trim()) {
        user.password = await bcryptjs.hash(password, 10);
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
