import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "./auth";

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
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
