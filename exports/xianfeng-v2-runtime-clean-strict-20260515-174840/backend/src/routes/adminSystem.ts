import express from "express";
import mongoose from "mongoose";
import { authenticate } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";
import Program from "../models/Program";
import Book from "../models/Book";
import LearningMaterial from "../models/LearningMaterial";
import User from "../models/User";
import { getDefaultShowNotesTemplate, getShowNotesDefaultTemplate, saveShowNotesDefaultTemplate } from "../services/showNotes";
import { ensureStore } from "../services/agentModelRegistry";

const router = express.Router();

function hasEnv(name: string): boolean {
  return typeof process.env[name] === "string" && process.env[name]!.trim().length > 0;
}

function envPreview(name: string): string {
  const value = typeof process.env[name] === "string" ? process.env[name]!.trim() : "";
  if (!value) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

router.get("/system-info", authenticate, requireAdmin, async (_req, res) => {
  try {
    const [programs, books, materials, users] = await Promise.all([
      Program.countDocuments(),
      Book.countDocuments(),
      LearningMaterial.countDocuments(),
      User.countDocuments(),
    ]);

    const conn = mongoose.connection;
    const mongoReadyState = conn.readyState;
    const mongoMeta = {
      readyState: mongoReadyState,
      name: conn.name || "",
      host: (conn as any).host || "",
      port: (conn as any).port || "",
    };

    const multiAgentStore = ensureStore(() => ({
      agents: [],
      prompts: {},
      policies: {},
      strategies: {},
      runs: [],
    }));
    const modelRegistrySummary = {
      total: multiAgentStore.model_registry.length,
      enabled: multiAgentStore.model_registry.filter((x) => x.enabled).length,
      byProvider: multiAgentStore.model_registry.reduce((acc: Record<string, number>, item) => {
        const key = String(item.provider || "unknown");
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    };

    res.status(200).json({
      serverTime: new Date().toISOString(),
      uptimeSec: Math.floor(process.uptime()),
      nodeVersion: process.version,
      env: {
        allowPublicRegister: process.env.ALLOW_PUBLIC_REGISTER === "true",
        corsOrigin: process.env.CORS_ORIGIN || "",
        showNotesDefaultTemplate: await getShowNotesDefaultTemplate(),
        ai: {
          provider: process.env.AI_PROVIDER || "mock",
          modelRegistrySummary,
          volcengine: {
            appIdSet: hasEnv("VOLCENGINE_APP_ID"),
            accessTokenSet: hasEnv("VOLCENGINE_ACCESS_TOKEN"),
            apiKeySet: hasEnv("VOLCENGINE_API_KEY"),
            secretKeySet: hasEnv("VOLCENGINE_SECRET_KEY"),
            activeAuth: hasEnv("VOLCENGINE_API_KEY") ? "apiKey" : "appAccessToken",
            resourceId: process.env.VOLCENGINE_RESOURCE_ID || "",
            mode: process.env.VOLCENGINE_MODE || "",
            publicBaseUrl: process.env.VOLCENGINE_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || "",
            apiKeyPreview: envPreview("VOLCENGINE_API_KEY"),
            secretKeyPreview: envPreview("VOLCENGINE_SECRET_KEY"),
            tosBridge: {
              enabled:
                hasEnv("VOLCENGINE_TOS_ACCESS_KEY_ID") &&
                hasEnv("VOLCENGINE_TOS_ACCESS_KEY_SECRET") &&
                hasEnv("VOLCENGINE_TOS_REGION") &&
                hasEnv("VOLCENGINE_TOS_ENDPOINT") &&
                hasEnv("VOLCENGINE_TOS_BUCKET"),
              region: process.env.VOLCENGINE_TOS_REGION || "",
              endpoint: process.env.VOLCENGINE_TOS_ENDPOINT || "",
              bucketSet: hasEnv("VOLCENGINE_TOS_BUCKET"),
              keyPrefix: process.env.VOLCENGINE_TOS_KEY_PREFIX || "program-audio",
              signedUrlTtlSeconds: Number(process.env.VOLCENGINE_TOS_SIGNED_URL_TTL_SECONDS || 1800),
            },
          },
        },
      },
      mongo: mongoMeta,
      stats: {
        programs,
        books,
        materials,
        users,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "获取系统信息失败", error });
  }
});

router.get("/show-notes-template", authenticate, requireAdmin, async (_req, res) => {
  try {
    const template = await getShowNotesDefaultTemplate();
    res.status(200).json({
      template,
      fallbackTemplate: getDefaultShowNotesTemplate(),
    });
  } catch (error) {
    res.status(500).json({ message: "获取 Shownotes 模板失败", error });
  }
});

router.put("/show-notes-template", authenticate, requireAdmin, async (req, res) => {
  try {
    const template = typeof req.body?.template === "string" ? req.body.template : "";
    const saved = await saveShowNotesDefaultTemplate(template);
    res.status(200).json({
      template: saved,
      fallbackTemplate: getDefaultShowNotesTemplate(),
    });
  } catch (error) {
    res.status(500).json({ message: "保存 Shownotes 模板失败", error });
  }
});

export default router;
