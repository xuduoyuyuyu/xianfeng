"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const User_1 = __importDefault(require("../models/User"));
const UserPageVisit_1 = __importDefault(require("../models/UserPageVisit"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const smsCodeStore = new Map();
const WEL_ADMIN_KEY = process.env.WEL_ADMIN_KEY || "weladmin2024";
const WEL_SYNC_URL = process.env.WEL_SYNC_URL || "http://172.19.0.1:18888/api/auth/sync";
async function syncUserToWel(mobile, name, grade, city) {
    try {
        const res = await fetch(WEL_SYNC_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ admin_key: WEL_ADMIN_KEY, mobile, name, grade, city }),
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok)
            return null;
        const data = await res.json();
        return data?.token || null;
    }
    catch {
        return null;
    }
}
function normalizeMobile(input) {
    return String(input || "").replace(/\D/g, "").slice(-11);
}
function buildWelProfile(user) {
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
    };
}
function canPublicRegister() {
    return process.env.ALLOW_PUBLIC_REGISTER === "true";
}
function normalizeText(value) {
    return String(value || "").trim();
}
function classifyDeviceType(value) {
    const ua = normalizeText(value).toLowerCase();
    if (!ua)
        return "other";
    if (/bot|crawler|spider|slurp/.test(ua))
        return "bot";
    if (/ipad|tablet|playbook|silk/.test(ua))
        return "tablet";
    if (/mobile|iphone|android|windows phone|blackberry/.test(ua))
        return "mobile";
    return "desktop";
}
function topBuckets(rows, getter, max = 6) {
    const map = {};
    rows.forEach((row) => {
        const key = normalizeText(getter(row)) || "未填写";
        map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, max);
}
class UserController {
    async trackPageView(req, res) {
        try {
            const pagePath = normalizeText(req.body?.pagePath);
            const pageTitle = normalizeText(req.body?.pageTitle);
            const sessionId = normalizeText(req.body?.sessionId);
            const requestedDeviceType = normalizeText(req.body?.deviceType).toLowerCase();
            const deviceType = requestedDeviceType === "desktop" ||
                requestedDeviceType === "mobile" ||
                requestedDeviceType === "tablet" ||
                requestedDeviceType === "bot"
                ? requestedDeviceType
                : classifyDeviceType(String(req.headers["user-agent"] || ""));
            if (!pagePath.startsWith("/") || !sessionId) {
                res.status(400).json({ message: "页面访问参数不完整" });
                return;
            }
            const dedupeQuery = {
                sessionId,
                pagePath,
            };
            if (req.user?.id) {
                dedupeQuery.userId = req.user.id;
            }
            else {
                dedupeQuery.userId = null;
            }
            const recent = await UserPageVisit_1.default.findOne(dedupeQuery).sort({ visitedAt: -1 }).lean();
            if (recent?.visitedAt && Date.now() - new Date(recent.visitedAt).getTime() < 8000) {
                res.status(200).json({ ok: true, deduped: true });
                return;
            }
            await UserPageVisit_1.default.create({
                userId: req.user?.id || null,
                sessionId,
                pagePath,
                pageTitle,
                deviceType,
                visitedAt: new Date(),
            });
            res.status(201).json({ ok: true });
        }
        catch (error) {
            res.status(500).json({ message: "记录页面访问失败", error });
        }
    }
    async getPortrait(req, res) {
        try {
            const roleFilter = normalizeText(req.query?.role);
            const cityFilter = normalizeText(req.query?.city);
            const gradeFilter = normalizeText(req.query?.grade);
            const userQuery = {};
            if (roleFilter && roleFilter !== "all")
                userQuery.role = roleFilter;
            if (cityFilter && cityFilter !== "all")
                userQuery.city = cityFilter === "未填写" ? "" : cityFilter;
            if (gradeFilter && gradeFilter !== "all") {
                userQuery.$or = [
                    { grade: gradeFilter === "未填写" ? "" : gradeFilter },
                    { childGrade: gradeFilter === "未填写" ? "" : gradeFilter },
                ];
            }
            const users = await User_1.default.find(userQuery)
                .select("_id username role city region childGrade grade name avatar_initial createdAt")
                .lean();
            const total = users.length;
            const admins = users.filter((row) => row.role === "admin").length;
            const standardUsers = total - admins;
            const completed = users.filter((row) => normalizeText(row.city) && normalizeText(row.region) && (normalizeText(row.childGrade) || normalizeText(row.grade))).length;
            const completionRate = total ? Math.round((completed / total) * 100) : 0;
            const roleBreakdown = [
                { label: "管理员", count: admins },
                { label: "普通用户", count: standardUsers },
            ];
            const cityTop = topBuckets(users, (row) => row.city ?? "");
            const gradeTop = topBuckets(users, (row) => row.childGrade ?? "");
            const regionTop = topBuckets(users, (row) => row.region ?? "");
            const monthlyMap = {};
            users.forEach((row) => {
                const raw = row.createdAt ? new Date(row.createdAt) : null;
                if (!raw || Number.isNaN(raw.getTime()))
                    return;
                const key = `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, "0")}`;
                monthlyMap[key] = (monthlyMap[key] || 0) + 1;
            });
            const monthlyTrend = Object.entries(monthlyMap)
                .map(([month, count]) => ({ month, count }))
                .sort((a, b) => a.month.localeCompare(b.month))
                .slice(-8);
            const userIds = users.map((row) => row._id);
            const visits = userIds.length
                ? await UserPageVisit_1.default.find({ userId: { $in: userIds } })
                    .select("userId sessionId pagePath pageTitle deviceType visitedAt")
                    .sort({ visitedAt: -1 })
                    .lean()
                : [];
            const deviceMap = {
                desktop: 0,
                mobile: 0,
                tablet: 0,
                bot: 0,
                other: 0,
            };
            const pageMap = new Map();
            visits.forEach((row) => {
                const pagePath = normalizeText(row.pagePath) || "/";
                const pageTitle = normalizeText(row.pageTitle) || pagePath;
                const deviceType = normalizeText(row.deviceType) || "other";
                const userId = String(row.userId || "");
                deviceMap[deviceType] = (deviceMap[deviceType] || 0) + 1;
                const current = pageMap.get(pagePath) ||
                    {
                        pagePath,
                        pageTitle,
                        pv: 0,
                        uvUsers: new Set(),
                        pc: 0,
                        mobile: 0,
                    };
                current.pv += 1;
                if (userId)
                    current.uvUsers.add(userId);
                if (deviceType === "desktop")
                    current.pc += 1;
                if (deviceType === "mobile" || deviceType === "tablet")
                    current.mobile += 1;
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
                    totalUv: new Set(visits.map((item) => String(item.userId || "")).filter(Boolean)).size,
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
        }
        catch (error) {
            res.status(500).json({ message: "获取用户画像数据失败", error });
        }
    }
    async sendMobileCode(req, res) {
        const mobile = normalizeMobile(req.body?.mobile);
        if (!/^1\d{10}$/.test(mobile)) {
            res.status(400).json({ error: "请输入正确的11位手机号" });
            return;
        }
        const code = String(Math.floor(100000 + Math.random() * 900000));
        smsCodeStore.set(mobile, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
        res.status(200).json({ ok: true, debugCode: code });
    }
    async mobileAuth(req, res) {
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
            let user = await User_1.default.findOne({ mobile });
            if (!user) {
                const username = `u${mobile}`;
                const password = await bcryptjs_1.default.hash(`mob-${mobile}-${Date.now()}`, 10);
                user = new User_1.default({
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
            const expiresIn = (process.env.JWT_EXPIRES_IN || "7d");
            const token = jsonwebtoken_1.default.sign({ id: user._id, role: user.role }, (process.env.JWT_SECRET || "your-secret-key"), { expiresIn });
            // Sync user to wel main database (fire-and-forget)
            syncUserToWel(mobile, user.name || "", user.grade || "", user.city || "")
                .then((welToken) => {
                if (welToken) {
                    res.status(200).json({ token, welToken, user: buildWelProfile(user) });
                }
                else {
                    res.status(200).json({ token, user: buildWelProfile(user) });
                }
            })
                .catch(() => {
                // wel sync failed, still return xianfeng token
                res.status(200).json({ token, user: buildWelProfile(user) });
            });
            return;
        }
        catch (error) {
            res.status(500).json({ error: "登录失败", message: String(error?.message || error) });
        }
    }
    async meCompat(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ error: "未登录或登录已过期" });
                return;
            }
            const user = await User_1.default.findById(req.user.id);
            if (!user) {
                res.status(404).json({ error: "用户不存在" });
                return;
            }
            res.status(200).json(buildWelProfile(user));
        }
        catch (error) {
            res.status(500).json({ error: "获取用户信息失败", message: String(error?.message || error) });
        }
    }
    async patchMeCompat(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ error: "未登录或登录已过期" });
                return;
            }
            const user = await User_1.default.findById(req.user.id);
            if (!user) {
                res.status(404).json({ error: "用户不存在" });
                return;
            }
            const body = req.body || {};
            if (typeof body.name === "string")
                user.name = body.name.trim();
            if (typeof body.city === "string")
                user.city = body.city.trim();
            if (typeof body.region === "string")
                user.region = body.region.trim();
            if (typeof body.grade === "string")
                user.grade = body.grade.trim();
            if (typeof body.avatar_initial === "string")
                user.avatar_initial = body.avatar_initial.trim().slice(0, 2) || "探";
            if (typeof body.avatar_image === "string")
                user.avatar_image = body.avatar_image.trim();
            await user.save();
            res.status(200).json(buildWelProfile(user));
        }
        catch (error) {
            res.status(500).json({ error: "更新资料失败", message: String(error?.message || error) });
        }
    }
    async uploadAvatar(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ error: "未登录或登录已过期" });
                return;
            }
            const file = req.file;
            if (!file) {
                res.status(400).json({ message: "请上传图片文件" });
                return;
            }
            const host = `${req.protocol}://${req.get("host")}`;
            const url = `${host}/uploads/avatars/${file.filename}`;
            // 同时写入用户表
            const user = await User_1.default.findById(req.user.id);
            if (user) {
                user.avatar_image = url;
                await user.save();
            }
            res.status(201).json({ url });
        }
        catch (error) {
            res.status(500).json({ error: "头像上传失败", message: String(error?.message || error) });
        }
    }
    async login(req, res) {
        try {
            const { username, password } = req.body;
            const user = await User_1.default.findOne({ username });
            if (!user) {
                res.status(401).json({ message: "用户名或密码错误" });
                return;
            }
            const isPasswordValid = await bcryptjs_1.default.compare(password, user.password);
            if (!isPasswordValid) {
                res.status(401).json({ message: "用户名或密码错误" });
                return;
            }
            const expiresIn = (process.env.JWT_EXPIRES_IN || "7d");
            const token = jsonwebtoken_1.default.sign({ id: user._id, role: user.role }, (process.env.JWT_SECRET || "your-secret-key"), { expiresIn });
            // Sync to wel main database if mobile exists
            let welToken = null;
            if (user.mobile) {
                welToken = await syncUserToWel(user.mobile, user.name || "", user.grade || "", user.city || "");
            }
            res.status(200).json({
                token,
                welToken: welToken || undefined,
                user: buildWelProfile(user),
            });
        }
        catch (error) {
            res.status(500).json({ message: "登录失败", error });
        }
    }
    async register(req, res) {
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
            const existingUser = await User_1.default.findOne({ username: safeUsername });
            if (existingUser) {
                res.status(400).json({ message: "用户名已存在" });
                return;
            }
            const isAdminCreator = req.user?.role === "admin";
            const safeRole = isAdminCreator && role === "admin" ? "admin" : "user";
            const hashedPassword = await bcryptjs_1.default.hash(safePassword, 10);
            const user = new User_1.default({
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
        }
        catch (error) {
            res.status(400).json({ message: "注册失败", error });
        }
    }
    async me(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ message: "未登录或登录已过期" });
                return;
            }
            const user = await User_1.default.findById(req.user.id).select("-password");
            if (!user) {
                res.status(404).json({ message: "用户不存在" });
                return;
            }
            res.status(200).json(user);
        }
        catch (error) {
            res.status(500).json({ message: "获取用户信息失败", error });
        }
    }
    async getAll(_req, res) {
        try {
            const users = await User_1.default.find().select("-password");
            res.status(200).json(users);
        }
        catch (error) {
            res.status(500).json({ message: "获取用户列表失败", error });
        }
    }
    async update(req, res) {
        try {
            if (!req.user || req.user.role !== "admin") {
                res.status(403).json({ message: "当前账号没有管理员权限" });
                return;
            }
            const { id } = req.params;
            const { username, password, role, city, region, childGrade, grade, name } = req.body || {};
            const user = await User_1.default.findById(id);
            if (!user) {
                res.status(404).json({ message: "用户不存在" });
                return;
            }
            if (typeof username === "string" && username.trim()) {
                const existing = await User_1.default.findOne({ username: username.trim(), _id: { $ne: id } });
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
            if (typeof city === "string")
                user.city = city;
            if (typeof region === "string")
                user.region = region;
            if (typeof childGrade === "string")
                user.childGrade = childGrade;
            if (typeof grade === "string")
                user.grade = grade;
            if (typeof name === "string")
                user.name = name;
            if (typeof password === "string" && password.trim()) {
                user.password = await bcryptjs_1.default.hash(password, 10);
            }
            await user.save();
            const saved = await User_1.default.findById(id).select("-password");
            res.status(200).json(saved);
        }
        catch (error) {
            res.status(400).json({ message: "更新用户失败", error });
        }
    }
    async delete(req, res) {
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
            const deleted = await User_1.default.findByIdAndDelete(id);
            if (!deleted) {
                res.status(404).json({ message: "用户不存在" });
                return;
            }
            res.status(200).json({ message: "删除成功" });
        }
        catch (error) {
            res.status(400).json({ message: "删除用户失败", error });
        }
    }
}
exports.UserController = UserController;
