import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import mongoose from "mongoose";
import KnowledgeSourceModel from "../models/KnowledgeSource";
import { buildKnowledgeSourcePayload } from "../services/knowledgeSourceService";
import { rebuildGuestAgentIndex } from "../services/guestAgentService";

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeFilename(name: string) {
  const ext = path.extname(name).toLowerCase();
  const base = path
    .basename(name, ext)
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${base || "knowledge"}${ext}`;
}

function saveUploadedKnowledgeFile(file: Express.Multer.File) {
  const uploadDir = path.join(process.cwd(), "uploads", "knowledge");
  fs.mkdirSync(uploadDir, { recursive: true });
  const filename = safeFilename(file.originalname || "knowledge-file");
  fs.writeFileSync(path.join(uploadDir, filename), file.buffer);
  return `/uploads/knowledge/${filename}`;
}

function serializeSource(source: any) {
  return {
    _id: String(source._id),
    guestId: source.guestId ? String(source.guestId) : "",
    ownerType: source.ownerType || "guest",
    ownerId: source.ownerId || "",
    sourceKind: source.sourceKind || "manual_note",
    title: source.title || "",
    summary: source.summary || "",
    rawText: source.rawText || "",
    fileUrl: source.fileUrl || "",
    originalFileName: source.originalFileName || "",
    mimeType: source.mimeType || "",
    status: source.status || "active",
    parseStatus: source.parseStatus || "pending",
    syncStatus: source.syncStatus || "pending",
    syncError: source.syncError || "",
    weknoraKnowledgeId: source.weknoraKnowledgeId || "",
    lastSyncedAt: source.lastSyncedAt || null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

export class AdminKnowledgeSourceController {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const guestId = asText(req.query.guestId);
      const filter: Record<string, any> = {};
      if (guestId) {
        if (!mongoose.Types.ObjectId.isValid(guestId)) {
          res.status(400).json({ message: "无效的嘉宾 ID" });
          return;
        }
        filter.guestId = new mongoose.Types.ObjectId(guestId);
      }
      const sources = await KnowledgeSourceModel.find(filter).sort({ updatedAt: -1 }).limit(300).lean();
      const counts = sources.reduce<Record<string, number>>((acc, source: any) => {
        const key = source.syncStatus || "pending";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      res.status(200).json({ sources: sources.map(serializeSource), counts });
    } catch (error) {
      res.status(500).json({ message: "获取知识库资料失败", error });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const payload = buildKnowledgeSourcePayload(req.body || {});
      const source = await KnowledgeSourceModel.create(payload);
      res.status(201).json(serializeSource(source));
    } catch (error) {
      res.status(400).json({ message: "创建知识库资料失败", error });
    }
  }

  async upload(req: Request, res: Response): Promise<void> {
    try {
      const file = req.file as Express.Multer.File | undefined;
      if (!file) {
        res.status(400).json({ message: "未提供文件" });
        return;
      }
      const url = saveUploadedKnowledgeFile(file);
      const payload = buildKnowledgeSourcePayload(req.body || {}, { ...file, url });
      const source = await KnowledgeSourceModel.create(payload);
      res.status(201).json(serializeSource(source));
    } catch (error) {
      res.status(400).json({ message: "上传知识库资料失败", error });
    }
  }

  async syncGuest(req: Request, res: Response): Promise<void> {
    try {
      const guestId = asText(req.params.guestId);
      if (!mongoose.Types.ObjectId.isValid(guestId)) {
        res.status(400).json({ message: "无效的嘉宾 ID" });
        return;
      }
      const result = await rebuildGuestAgentIndex(guestId);
      if (!result) {
        res.status(404).json({ message: "嘉宾不存在" });
        return;
      }
      const failed = result.weknoraSync?.status === "failed";
      await KnowledgeSourceModel.updateMany(
        { guestId: new mongoose.Types.ObjectId(guestId), status: "active", parseStatus: "ready" },
        {
          $set: {
            syncStatus: failed ? "failed" : "synced",
            syncError: failed ? result.weknoraSync?.message || "同步失败" : "",
            lastSyncedAt: new Date(),
          },
        }
      );
      res.status(200).json({
        ok: true,
        guestId,
        chunkCount: result.chunkCount,
        sourceCounts: result.sourceCounts,
        weknoraSync: result.weknoraSync,
      });
    } catch (error) {
      res.status(500).json({ message: "同步嘉宾知识库失败", error });
    }
  }
}
