import { Request, Response } from "express";
import mongoose from "mongoose";
import EducationDictionaryEntry from "../models/EducationDictionaryEntry";
import Program from "../models/Program";
import {
  importDictionaryEntriesFromPrograms,
  normalizeDictionaryTerm,
  recalculateAllRelatedDictionaryEntries,
  serializeDictionaryEntry,
  updateDictionaryEntry,
} from "../services/educationDictionary";

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class AdminDictionaryController {
  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const search = asText(req.query.search);
      const status = asText(req.query.status);
      const filter: Record<string, any> = {};

      if (status === "active" || status === "hidden") {
        filter.status = status;
      }

      if (search) {
        const pattern = new RegExp(escapeRegex(search), "i");
        filter.$or = [{ term: pattern }, { definition: pattern }, { aliases: pattern }];
      }

      const entries = await EducationDictionaryEntry.find(filter).sort({ updatedAt: -1 }).lean();
      res.status(200).json(
        entries.map((entry: any) => ({
          ...serializeDictionaryEntry(entry),
          programCount: Array.isArray(entry.programIds) ? entry.programIds.length : 0,
        }))
      );
    } catch (error) {
      res.status(500).json({ message: "获取教育词典失败", error });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const entry = await EducationDictionaryEntry.findById(req.params.id).lean();
      if (!entry) {
        res.status(404).json({ message: "词条不存在" });
        return;
      }

      const relatedEntries = Array.isArray(entry.relatedEntryIds)
        ? await EducationDictionaryEntry.find({ _id: { $in: entry.relatedEntryIds } }, { term: 1, status: 1 }).lean()
        : [];

      res.status(200).json({
        ...serializeDictionaryEntry(entry),
        relatedEntries: relatedEntries.map((item: any) => ({
          _id: String(item._id),
          term: item.term,
          status: item.status,
        })),
      });
    } catch (error) {
      res.status(500).json({ message: "获取词条详情失败", error });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const term = asText(req.body?.term);
      const definition = asText(req.body?.definition);
      const sourceUrl = asText(req.body?.sourceUrl);
      const normalizedTerm = normalizeDictionaryTerm(term);

      if (!term || !definition || !normalizedTerm) {
        res.status(400).json({ message: "词条名称和释义不能为空" });
        return;
      }

      const existing = await EducationDictionaryEntry.findOne({ normalizedTerm });
      if (existing) {
        res.status(409).json({ message: "词条已存在" });
        return;
      }

      const entry = await EducationDictionaryEntry.create({
        term,
        normalizedTerm,
        definition,
        sourceUrl,
        aliases: Array.isArray(req.body?.aliases)
          ? req.body.aliases.map((item: unknown) => asText(item)).filter(Boolean)
          : [],
        relatedEntryIds: [],
        programIds: [],
        createdFrom: "migration",
        status: req.body?.status === "hidden" ? "hidden" : "active",
      });

      await recalculateAllRelatedDictionaryEntries();
      res.status(201).json(serializeDictionaryEntry(entry.toObject()));
    } catch (error) {
      res.status(400).json({ message: "创建词条失败", error });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const updated = await updateDictionaryEntry(req.params.id, req.body || {});
      res.status(200).json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "更新词条失败", error });
    }
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = req.body?.status;
      if (status !== "active" && status !== "hidden") {
        res.status(400).json({ message: "状态仅支持 active 或 hidden" });
        return;
      }
      const updated = await updateDictionaryEntry(req.params.id, { status });
      res.status(200).json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "更新词条状态失败", error });
    }
  }

  async importFromPrograms(req: Request, res: Response): Promise<void> {
    try {
      const programIds = Array.isArray(req.body?.programIds) ? req.body.programIds.map((id: unknown) => asText(id)) : [];
      if (!programIds.length) {
        res.status(400).json({ message: "请选择至少一个节目" });
        return;
      }

      const importedPrograms = await importDictionaryEntriesFromPrograms(programIds);
      res.status(200).json({ importedPrograms });
    } catch (error) {
      res.status(500).json({ message: "导入节目词条失败", error });
    }
  }

  async getPrograms(req: Request, res: Response): Promise<void> {
    try {
      const entry = await EducationDictionaryEntry.findById(req.params.id).lean();
      if (!entry) {
        res.status(404).json({ message: "词条不存在" });
        return;
      }

      const programIds = Array.isArray(entry.programIds) ? entry.programIds.filter((id: any) => mongoose.Types.ObjectId.isValid(id)) : [];
      const programs = await Program.find(
        { _id: { $in: programIds } },
        { title: 1, status: 1, publishedAt: 1, updatedAt: 1, coverImage: 1 }
      )
        .sort({ publishedAt: -1, updatedAt: -1 })
        .lean();

      res.status(200).json(
        programs.map((program: any) => ({
          _id: String(program._id),
          title: program.title,
          status: program.status,
          coverImage: program.coverImage || "",
          publishedAt: program.publishedAt || null,
          updatedAt: program.updatedAt || null,
        }))
      );
    } catch (error) {
      res.status(500).json({ message: "获取关联节目失败", error });
    }
  }
}
