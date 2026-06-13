import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

function parseToken(req: Request): string | null {
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

function verifyAndAttachUser(req: AuthenticatedRequest, token: string): void {
  const decoded = jwt.verify(
    token,
    process.env.JWT_SECRET || "your-secret-key"
  ) as {
    id: string;
    role: string;
  };
  req.user = {
    id: decoded.id,
    role: decoded.role,
  };
}

export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = parseToken(req);
  if (!token) {
    res.status(401).json({ message: "未登录或登录已过期" });
    return;
  }
  try {
    verifyAndAttachUser(req, token);
    next();
  } catch (error) {
    res.status(401).json({ message: "无效的登录凭证", error });
  }
}

export function optionalAuthenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const token = parseToken(req);
  if (!token) {
    next();
    return;
  }
  try {
    verifyAndAttachUser(req, token);
  } catch (_error) {
    // Keep request anonymous when optional auth fails.
  }
  next();
}
