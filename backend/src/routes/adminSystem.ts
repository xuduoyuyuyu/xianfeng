import express from "express";
import mongoose from "mongoose";
import { authenticate } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";
import Program from "../models/Program";
import Book from "../models/Book";
import LearningMaterial from "../models/LearningMaterial";
import User from "../models/User";
import { getDefaultShowNotesTemplate, getShowNotesDefaultTemplate, saveShowNotesDefaultTemplate } from "../services/showNotes";

const router = express.Router();

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

    res.status(200).json({
      serverTime: new Date().toISOString(),
      uptimeSec: Math.floor(process.uptime()),
      nodeVersion: process.version,
      env: {
        allowPublicRegister: process.env.ALLOW_PUBLIC_REGISTER === "true",
        corsOrigin: process.env.CORS_ORIGIN || "",
        showNotesDefaultTemplate: await getShowNotesDefaultTemplate(),
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
