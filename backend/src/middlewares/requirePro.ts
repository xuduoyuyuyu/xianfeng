import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "./auth";
import { consumeProPoints, getPointCostForFeature, isProBillingEnabled } from "../services/billing";

type RequireProOptions = {
  cost?: number;
};

export function requirePro(featureKey: string, options: RequireProOptions = {}) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!isProBillingEnabled()) {
        next();
        return;
      }
      if (!req.user?.id) {
        res.status(401).json({ message: "未登录或登录已过期" });
        return;
      }
      if (req.user.role === "admin") {
        next();
        return;
      }
      const spend = await consumeProPoints({
        userId: req.user.id,
        featureKey,
        points: getPointCostForFeature(featureKey, options.cost),
      });
      if (!spend.ok) {
        res.status(402).json({
          code: "PRO_REQUIRED",
          featureKey,
          upgradeUrl: "/pro",
          message: spend.message || "该功能需要订阅后使用",
          remainingPointBalance: spend.remainingPointBalance,
        });
        return;
      }
      next();
    } catch (error) {
      res.status(500).json({ message: "校验 Pro 权限失败", error });
    }
  };
}
