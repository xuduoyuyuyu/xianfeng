import express from "express";
import mongoose from "mongoose";
import { authenticate } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";
import Program from "../models/Program";
import Book from "../models/Book";
import LearningMaterial from "../models/LearningMaterial";
import User from "../models/User";

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

export default router;

