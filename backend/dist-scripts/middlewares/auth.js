"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.optionalAuthenticate = optionalAuthenticate;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function parseToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return null;
    }
    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
        return null;
    }
    return token;
}
function verifyAndAttachUser(req, token) {
    const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || "your-secret-key");
    req.user = {
        id: decoded.id,
        role: decoded.role,
    };
}
function authenticate(req, res, next) {
    const token = parseToken(req);
    if (!token) {
        res.status(401).json({ message: "未登录或登录已过期" });
        return;
    }
    try {
        verifyAndAttachUser(req, token);
        next();
    }
    catch (error) {
        res.status(401).json({ message: "无效的登录凭证", error });
    }
}
function optionalAuthenticate(req, _res, next) {
    const token = parseToken(req);
    if (!token) {
        next();
        return;
    }
    try {
        verifyAndAttachUser(req, token);
    }
    catch (_error) {
        // Keep request anonymous when optional auth fails.
    }
    next();
}
