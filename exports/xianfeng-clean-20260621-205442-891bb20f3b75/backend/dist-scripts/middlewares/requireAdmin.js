"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = requireAdmin;
function requireAdmin(req, res, next) {
    if (!req.user) {
        res.status(401).json({ message: "未登录或登录已过期" });
        return;
    }
    if (req.user.role !== "admin") {
        res.status(403).json({ message: "无权限访问管理接口" });
        return;
    }
    next();
}
