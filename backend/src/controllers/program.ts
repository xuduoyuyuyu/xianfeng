import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import Program from "../models/Program";
import { resolveProgramAiProvider } from "../services/programAi";
import mongoose from "mongoose";
import { attachDictionaryEntriesToPrograms, removeProgramFromDictionary, syncProgramDictionaryEntries } from "../services/educationDictionary";

function statusUpdatePayload(status: "draft" | "published") {
  if (status === "published") {
    return { status, publishedAt: new Date() };
  }
  return { status, publishedAt: null };
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasText(value: unknown): boolean {
  return asText(value).length > 0;
}

function parseClockToSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  const raw = asText(value);
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.max(0, Number(raw));
  const parts = raw.split(":").map((item) => Number(item));
  if (parts.some((item) => Number.isNaN(item))) return null;
  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
  if (parts.length === 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return null;
}

function findClockTokens(value: unknown): string[] {
  const raw = asText(value);
  const tokens = raw.match(/\d{1,2}:\d{2}(?::\d{2})?/g);
  return Array.isArray(tokens) ? tokens : [];
}

function formatClockRange(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  if (hh > 0) return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function isTrivialTranscriptText(value: unknown): boolean {
  const compact = asText(value).toLowerCase().replace(/[，。！？、,.!?~\s]/g, "");
  if (!compact) return true;
  const fillers = new Set([
    "嗯", "呃", "啊", "哦", "诶", "哎", "唉",
    "嗯嗯", "啊啊", "呃呃",
    "对", "对对", "好", "好的", "是", "是的",
    "可以", "可以吗", "那个", "然后", "然后呢", "是吧",
  ]);
  if (fillers.has(compact)) return true;
  if (compact.length <= 2 && /^[嗯啊哦呃哎诶对是好行哈]+$/u.test(compact)) return true;
  return false;
}

function buildRangeLabel(startSec: number | null, endSec: number | null, fallbackTime: string): string {
  if (Number.isFinite(startSec) && Number.isFinite(endSec) && (endSec as number) > (startSec as number)) {
    return `${formatClockRange(startSec as number)}-${formatClockRange(endSec as number)}`;
  }
  if (Number.isFinite(startSec)) {
    const safeEnd = Math.max((startSec as number) + 4, Number.isFinite(endSec) ? (endSec as number) : (startSec as number) + 6);
    return `${formatClockRange(startSec as number)}-${formatClockRange(safeEnd)}`;
  }
  return fallbackTime || "00:00-00:06";
}

function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const deduped = new Set<string>();
  for (const item of input) {
    const tag = asText(item);
    if (tag) deduped.add(tag);
    if (deduped.size >= 8) break;
  }
  return Array.from(deduped);
}

function sanitizeTranscript(input: unknown) {
  if (!Array.isArray(input)) return [];
  const normalized = input
    .map((segment: any) => {
      const text = asText(segment?.text);
      if (!text || isTrivialTranscriptText(text)) return null;
      const speaker = asText(segment?.speaker) || "嘉宾";
      const fallbackTime = asText(segment?.time);
      const tokens = findClockTokens(fallbackTime);
      let startSec =
        parseClockToSeconds(segment?.startSec) ??
        parseClockToSeconds(segment?.start) ??
        parseClockToSeconds(segment?.startTime) ??
        parseClockToSeconds(segment?.from);
      let endSec =
        parseClockToSeconds(segment?.endSec) ??
        parseClockToSeconds(segment?.end) ??
        parseClockToSeconds(segment?.endTime) ??
        parseClockToSeconds(segment?.to);
      if (startSec === null && tokens[0]) startSec = parseClockToSeconds(tokens[0]);
      if (endSec === null && tokens[1]) endSec = parseClockToSeconds(tokens[1]);
      if (Number.isFinite(startSec) && Number.isFinite(endSec) && (endSec as number) < (startSec as number)) {
        endSec = (startSec as number) + 4;
      }
      return {
        speaker,
        text,
        featured: !!segment?.featured,
        fallbackTime,
        startSec,
        endSec,
      };
    })
    .filter(Boolean) as Array<{
      speaker: string;
      text: string;
      featured: boolean;
      fallbackTime: string;
      startSec: number | null;
      endSec: number | null;
    }>;

  if (!normalized.length) return [];

  const merged: Array<{
    speaker: string;
    text: string;
    featured: boolean;
    fallbackTime: string;
    startSec: number | null;
    endSec: number | null;
  }> = [];

  for (const item of normalized) {
    const prev = merged[merged.length - 1];
    const canMerge =
      !!prev &&
      prev.speaker === item.speaker &&
      prev.text.length + item.text.length <= 200 &&
      (!Number.isFinite(prev.endSec) || !Number.isFinite(item.startSec) || (item.startSec as number) - (prev.endSec as number) <= 10);

    if (!canMerge) {
      merged.push({ ...item });
      continue;
    }

    prev.text = /[。！？.!?]$/.test(prev.text) ? `${prev.text}${item.text}` : `${prev.text} ${item.text}`;
    prev.featured = prev.featured || item.featured;
    if (!Number.isFinite(prev.startSec) && Number.isFinite(item.startSec)) prev.startSec = item.startSec;
    if (Number.isFinite(item.endSec)) prev.endSec = item.endSec;
  }

  for (let i = 0; i < merged.length; i += 1) {
    const current = merged[i];
    const next = merged[i + 1];
    if (Number.isFinite(current.startSec) && !Number.isFinite(current.endSec)) {
      const nextStart = next && Number.isFinite(next.startSec) ? (next.startSec as number) : null;
      current.endSec =
        nextStart && nextStart > (current.startSec as number)
          ? Math.min(nextStart, (current.startSec as number) + 15)
          : (current.startSec as number) + 6;
    }
  }

  return merged
    .map((segment) => ({
      time: buildRangeLabel(segment.startSec, segment.endSec, segment.fallbackTime),
      speaker: segment.speaker || "嘉宾",
      text: segment.text,
      featured: segment.featured,
    }))
    .filter((segment) => segment.speaker && segment.text);
}

function sanitizeCuratedReading(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item: any) => ({
      title: asText(item?.title),
      subtitle: asText(item?.subtitle),
      url: asText(item?.url),
    }))
    .filter((item) => item.title);
}

function sanitizeTermGlossary(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item: any) => ({
      term: asText(item?.term),
      definition: asText(item?.definition),
      sourceUrl: asText(item?.sourceUrl),
    }))
    .filter((item) => item.term && item.definition);
}

async function buildProgramResponse(program: any, extra: Record<string, any> = {}) {
  const attached = await attachDictionaryEntriesToPrograms(program, false);
  return {
    ...attached,
    ...extra,
  };
}

function sanitizeProgramPayload(payload: any, requireEpisode: boolean) {
  const cleaned = { ...payload };
  delete cleaned.autoGenerate;
  delete cleaned.uploadedAudioUrl;

  if (cleaned.summary) {
    cleaned.summary = {
      headline: asText(cleaned.summary.headline),
      body: asText(cleaned.summary.body),
      highlightLabel: asText(cleaned.summary.highlightLabel),
      highlightText: asText(cleaned.summary.highlightText),
      tags: sanitizeTags(cleaned.summary.tags),
    };
  }

  if (cleaned.transcript !== undefined) {
    cleaned.transcript = sanitizeTranscript(cleaned.transcript);
  }

  if (cleaned.termGlossary !== undefined) {
    cleaned.termGlossary = sanitizeTermGlossary(cleaned.termGlossary);
  }

  if (cleaned.guest) {
    cleaned.guest = {
      name: asText(cleaned.guest.name),
      title: asText(cleaned.guest.title),
      bio: asText(cleaned.guest.bio),
      avatar: asText(cleaned.guest.avatar),
      profileUrl: asText(cleaned.guest.profileUrl),
    };
  }

  if (cleaned.deepDive) {
    cleaned.deepDive = {
      sectionTitle: asText(cleaned.deepDive.sectionTitle),
      curatedReading: sanitizeCuratedReading(cleaned.deepDive.curatedReading),
    };
  }

  if (cleaned.episodes !== undefined) {
    const episodes = Array.isArray(cleaned.episodes) ? cleaned.episodes : [];
    const sanitizedEpisodes = episodes
      .map((episode: any) => ({
        title: asText(episode?.title),
        duration: asText(episode?.duration),
        url: asText(episode?.url),
      }))
      .filter((episode: { title: string; duration: string; url: string }) => episode.title || episode.duration || episode.url);

    if (sanitizedEpisodes.length === 0) {
      throw new Error("请至少填写一条单集信息");
    }
    const first = sanitizedEpisodes[0];
    if (!first.title) throw new Error("单集标题不能为空");
    if (!first.duration) throw new Error("单集时长不能为空");
    if (!first.url) throw new Error("音频 URL 不能为空");
    cleaned.episodes = sanitizedEpisodes;
  } else if (requireEpisode) {
    throw new Error("请至少填写一条单集信息");
  }

  return cleaned;
}

function mergePreferManualText(manual: unknown, generated: unknown): string {
  return hasText(manual) ? asText(manual) : asText(generated);
}

function mergePreferManualArray<T>(manual: T[] | undefined, generated: T[] | undefined): T[] {
  if (Array.isArray(manual) && manual.length > 0) return manual;
  return Array.isArray(generated) ? generated : [];
}

function mergeAiIntoPayload(payload: any, generated: any, transcript: any[]) {
  const next = { ...payload };
  const episode = (next.episodes && next.episodes[0]) || {};
  next.episodes = [
    {
      title: mergePreferManualText(episode.title, generated?.episodeTitle),
      duration: mergePreferManualText(episode.duration, generated?.episodeDuration),
      url: mergePreferManualText(episode.url, payload.uploadedAudioUrl),
    },
  ];

  next.summary = {
    headline: mergePreferManualText(next.summary?.headline, generated?.summary?.headline),
    body: mergePreferManualText(next.summary?.body, generated?.summary?.body),
    highlightLabel: mergePreferManualText(next.summary?.highlightLabel, generated?.summary?.highlightLabel),
    highlightText: mergePreferManualText(next.summary?.highlightText, generated?.summary?.highlightText),
    tags: mergePreferManualArray(next.summary?.tags, generated?.summary?.tags),
  };

  next.transcript = mergePreferManualArray(next.transcript, transcript);
  next.termGlossary = mergePreferManualArray(next.termGlossary, generated?.termGlossary);

  next.guest = {
    name: mergePreferManualText(next.guest?.name, generated?.guest?.name),
    title: mergePreferManualText(next.guest?.title, generated?.guest?.title),
    bio: mergePreferManualText(next.guest?.bio, generated?.guest?.bio),
    avatar: mergePreferManualText(next.guest?.avatar, generated?.guest?.avatar),
    profileUrl: mergePreferManualText(next.guest?.profileUrl, generated?.guest?.profileUrl),
  };

  next.deepDive = {
    sectionTitle: mergePreferManualText(next.deepDive?.sectionTitle, generated?.deepDive?.sectionTitle),
    curatedReading: mergePreferManualArray(next.deepDive?.curatedReading, generated?.deepDive?.curatedReading),
  };

  return next;
}

function resolveLocalAudioPath(uploadedAudioUrl: string): string | null {
  const marker = "/uploads/audio/";
  const idx = uploadedAudioUrl.indexOf(marker);
  if (idx < 0) return null;
  const filename = uploadedAudioUrl.slice(idx + marker.length);
  if (!filename) return null;
  const safeName = path.basename(filename);
  return path.join(process.cwd(), "uploads", "audio", safeName);
}

function ensureEpisodeFallbackOnAiFailure(payload: any, uploadedAudioUrl: string) {
  const firstEpisode = payload?.episodes?.[0] || {};
  const safeUrl = asText(firstEpisode.url) || asText(uploadedAudioUrl);
  if (!safeUrl) return payload;
  const safeTitle = asText(firstEpisode.title) || "AI 解析待补标题";
  const safeDuration = asText(firstEpisode.duration) || "待补时长";
  return {
    ...payload,
    episodes: [
      {
        title: safeTitle,
        duration: safeDuration,
        url: safeUrl,
      },
    ],
  };
}

function ensureBaseFieldFallbackOnAiFailure(payload: any) {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return {
    ...payload,
    title: asText(payload?.title) || `AI解析节目-${stamp}`,
    description: asText(payload?.description) || "基于上传音频自动创建，等待 AI 解析与运营优化。",
    coverImage:
      asText(payload?.coverImage) ||
      "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?q=80&w=1200&auto=format&fit=crop",
  };
}

function ensureBaseFieldsFromGenerated(payload: any, generated: any, transcript: any[]) {
  const transcriptText = Array.isArray(transcript)
    ? transcript
        .slice(0, 2)
        .map((item: any) => asText(item?.text))
        .filter(Boolean)
        .join(" ")
    : "";
  const summaryBody = asText(generated?.summary?.body);
  return {
    ...payload,
    title: mergePreferManualText(payload?.title, generated?.episodeTitle),
    description: mergePreferManualText(payload?.description, summaryBody || transcriptText),
    coverImage:
      asText(payload?.coverImage) ||
      "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?q=80&w=1200&auto=format&fit=crop",
  };
}

const parsingProgramIds = new Set<string>();

function parseMetaPatch(status: "idle" | "parsing" | "success" | "failed", message = "") {
  if (status === "parsing") {
    return {
      parseStatus: "parsing",
      parseStartedAt: new Date(),
      parseFinishedAt: null,
      parseError: "",
    };
  }
  if (status === "success") {
    return {
      parseStatus: "success",
      parseFinishedAt: new Date(),
      parseError: "",
    };
  }
  if (status === "failed") {
    return {
      parseStatus: "failed",
      parseFinishedAt: new Date(),
      parseError: message || "解析失败",
    };
  }
  return {
    parseStatus: "idle",
    parseError: "",
  };
}

function normalizeProgramForAiSource(
  program: any,
  uploadedAudioUrl: string,
  options?: { forceTranscriptRegenerate?: boolean }
) {
  const normalized = {
    ...program,
    autoGenerate: true,
    uploadedAudioUrl,
  };
  if (options?.forceTranscriptRegenerate) {
    normalized.transcript = [];
  }
  return normalized;
}

async function runAsyncParseTask(
  programId: string,
  uploadedAudioUrl: string,
  options?: { forceTranscriptRegenerate?: boolean }
) {
  if (parsingProgramIds.has(programId)) return;
  parsingProgramIds.add(programId);
  try {
    await Program.findByIdAndUpdate(programId, parseMetaPatch("parsing"), { new: false });
    const currentProgram = await Program.findById(programId);
    if (!currentProgram) {
      parsingProgramIds.delete(programId);
      return;
    }
    const sourcePayload = normalizeProgramForAiSource(
      currentProgram.toObject(),
      uploadedAudioUrl,
      options
    );
    const aiResult = await tryAutoGenerate(sourcePayload);
    const payload = sanitizeProgramPayload(aiResult.payload, false);
    const status = aiResult.aiStatus === "generated" ? "success" : "failed";
    const parsePatch = parseMetaPatch(status, aiResult.aiMessage || "");
    await Program.findByIdAndUpdate(programId, { ...payload, ...parsePatch }, { new: false });
    if (payload.termGlossary !== undefined) {
      await syncProgramDictionaryEntries(programId, payload.termGlossary, "ai_program");
    }
  } catch (error: any) {
    await Program.findByIdAndUpdate(
      programId,
      parseMetaPatch("failed", error?.message || "解析任务执行失败"),
      { new: false }
    );
  } finally {
    parsingProgramIds.delete(programId);
  }
}

function startAsyncParseTask(
  programId: string,
  uploadedAudioUrl: string,
  options?: { forceTranscriptRegenerate?: boolean }
) {
  setTimeout(() => {
    runAsyncParseTask(programId, uploadedAudioUrl, options).catch(() => {});
  }, 0);
}

async function tryAutoGenerate(payload: any): Promise<{ payload: any; aiStatus?: string; aiMessage?: string }> {
  const autoGenerate = payload.autoGenerate === true || payload.autoGenerate === "true";
  if (!autoGenerate) {
    return { payload, aiStatus: "skipped" };
  }
  const uploadedAudioUrl = asText(payload.uploadedAudioUrl) || asText(payload?.episodes?.[0]?.url);
  if (!uploadedAudioUrl) {
    return { payload, aiStatus: "failed", aiMessage: "未提供音频地址，跳过 AI 生成" };
  }
  const localFilePath = resolveLocalAudioPath(uploadedAudioUrl);
  if (!localFilePath || !fs.existsSync(localFilePath)) {
    return { payload, aiStatus: "failed", aiMessage: "仅支持后台上传音频进行 AI 生成" };
  }

  try {
    const provider = resolveProgramAiProvider();
    console.log("[ai-program] start transcription", { localFilePath });
    const transcription = await provider.transcribeAudio(localFilePath, { sourceUrl: uploadedAudioUrl });
    console.log("[ai-program] transcription done", { segments: transcription.transcript.length });
    const generated = await provider.extractProgramMetadata(transcription);
    console.log("[ai-program] metadata extraction done");
    const merged = mergeAiIntoPayload(payload, generated, transcription.transcript);
    const mergedWithBase = ensureBaseFieldsFromGenerated(merged, generated, transcription.transcript);
    return { payload: mergedWithBase, aiStatus: "generated" };
  } catch (error: any) {
    console.error("[ai-program] generation failed", error);
    const fallbackPayload = ensureBaseFieldFallbackOnAiFailure(
      ensureEpisodeFallbackOnAiFailure(payload, uploadedAudioUrl)
    );
    return {
      payload: fallbackPayload,
      aiStatus: "failed",
      aiMessage: error?.message || "AI 生成失败",
    };
  }
}

export class ProgramController {
  async getAllPublic(_req: Request, res: Response): Promise<void> {
    try {
      const programs = await Program.find({ status: "published" }).sort({
        publishedAt: -1,
      });
      res.status(200).json(await attachDictionaryEntriesToPrograms(programs, false));
    } catch (error) {
      res.status(500).json({ message: "获取节目列表失败", error });
    }
  }

  async getByIdPublic(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const program = await Program.findOne({ _id: id, status: "published" });
      if (!program) {
        res.status(404).json({ message: "节目不存在或未上架" });
        return;
      }
      res.status(200).json(await attachDictionaryEntriesToPrograms(program, false));
    } catch (error) {
      res.status(500).json({ message: "获取节目失败", error });
    }
  }

  async getAllAdmin(req: Request, res: Response): Promise<void> {
    try {
      const { status } = req.query;
      const filter =
        status === "draft" || status === "published" ? { status } : {};
      const programs = await Program.find(filter).sort({ updatedAt: -1 });
      res.status(200).json(await attachDictionaryEntriesToPrograms(programs, true));
    } catch (error) {
      res.status(500).json({ message: "获取管理节目列表失败", error });
    }
  }

  async getByIdAdmin(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const program = await Program.findById(id);
      if (!program) {
        res.status(404).json({ message: "节目不存在" });
        return;
      }
      res.status(200).json(await attachDictionaryEntriesToPrograms(program, true));
    } catch (error) {
      res.status(500).json({ message: "获取节目失败", error });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const aiResult = await tryAutoGenerate(req.body || {});
      const payload = sanitizeProgramPayload(aiResult.payload, true);
      if (payload.status && !["draft", "published"].includes(payload.status)) {
        res.status(400).json({ message: "无效的状态值" });
        return;
      }
      if (payload.status === "published" && !payload.publishedAt) {
        payload.publishedAt = new Date();
      }
      const program = new Program(payload);
      await program.save();
      if (payload.termGlossary !== undefined) {
        await syncProgramDictionaryEntries(String(program._id), payload.termGlossary, "ai_program");
      }
      const latestProgram = await Program.findById(program._id);
      if (!latestProgram) {
        res.status(500).json({ message: "节目创建成功，但读取结果失败" });
        return;
      }
      res.status(201).json(
        await buildProgramResponse(latestProgram, {
          aiStatus: aiResult.aiStatus || "skipped",
          aiMessage: aiResult.aiMessage || "",
        })
      );
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "创建节目失败", error });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const aiResult = await tryAutoGenerate(req.body || {});
      const payload = sanitizeProgramPayload(aiResult.payload, false);
      if (payload.status && !["draft", "published"].includes(payload.status)) {
        res.status(400).json({ message: "无效的状态值" });
        return;
      }
      if (payload.status === "published" && !payload.publishedAt) {
        payload.publishedAt = new Date();
      }
      if (payload.status === "draft") {
        payload.publishedAt = null;
      }
      const program = await Program.findByIdAndUpdate(id, payload, { new: true });
      if (!program) {
        res.status(404).json({ message: "节目不存在" });
        return;
      }
      if (payload.termGlossary !== undefined) {
        await syncProgramDictionaryEntries(String(program._id), payload.termGlossary, "ai_program");
      }
      const latestProgram = await Program.findById(program._id);
      if (!latestProgram) {
        res.status(500).json({ message: "节目更新成功，但读取结果失败" });
        return;
      }
      res.status(200).json(
        await buildProgramResponse(latestProgram, {
          aiStatus: aiResult.aiStatus || "skipped",
          aiMessage: aiResult.aiMessage || "",
        })
      );
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "更新节目失败", error });
    }
  }

  async uploadAudio(req: Request, res: Response): Promise<void> {
    try {
      const file = (req as any).file;
      if (!file) {
        res.status(400).json({ message: "请上传音频文件" });
        return;
      }
      const host = `${req.protocol}://${req.get("host")}`;
      const audioUrl = `${host}/uploads/audio/${file.filename}`;
      res.status(201).json({
        url: audioUrl,
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      });
    } catch (error) {
      res.status(500).json({ message: "音频上传失败", error });
    }
  }

  async uploadImage(req: Request, res: Response): Promise<void> {
    try {
      const file = (req as any).file;
      if (!file) {
        res.status(400).json({ message: "请上传图片文件" });
        return;
      }
      const host = `${req.protocol}://${req.get("host")}`;
      const imageUrl = `${host}/uploads/images/${file.filename}`;
      res.status(201).json({
        url: imageUrl,
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      });
    } catch (error) {
      res.status(500).json({ message: "图片上传失败", error });
    }
  }

  async createFromAudio(req: Request, res: Response): Promise<void> {
    try {
      const uploadedAudioUrl = asText(req.body?.uploadedAudioUrl);
      if (!uploadedAudioUrl) {
        res.status(400).json({ message: "缺少 uploadedAudioUrl" });
        return;
      }
      const localPath = resolveLocalAudioPath(uploadedAudioUrl);
      if (!localPath || !fs.existsSync(localPath)) {
        res.status(400).json({ message: "仅支持后台已上传的音频地址" });
        return;
      }
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      const program = new Program({
        title: `待解析节目-${stamp}`,
        description: "音频已上传，正在解析中。",
        coverImage: "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?q=80&w=1200&auto=format&fit=crop",
        episodes: [{ title: "待解析", duration: "待解析", url: uploadedAudioUrl }],
        status: "draft",
        ...parseMetaPatch("parsing"),
      });
      await program.save();
      startAsyncParseTask(String(program._id), uploadedAudioUrl);
      res.status(201).json({
        programId: String(program._id),
        parseStatus: "parsing",
      });
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "创建解析草稿失败", error });
    }
  }

  async triggerParse(req: Request, res: Response): Promise<void> {
    try {
      const id = asText(req.params?.id);
      if (!id) {
        res.status(400).json({ message: "无效的节目 ID" });
        return;
      }
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: "无效的节目 ID" });
        return;
      }
      const program = await Program.findById(id);
      if (!program) {
        res.status(404).json({ message: "节目不存在" });
        return;
      }
      if (program.parseStatus === "parsing" || parsingProgramIds.has(id)) {
        res.status(409).json({ message: "解析任务进行中，请稍后刷新状态", parseStatus: "parsing" });
        return;
      }
      const uploadedAudioUrl = asText(program?.episodes?.[0]?.url);
      if (!uploadedAudioUrl) {
        res.status(400).json({ message: "节目缺少音频 URL，无法触发解析" });
        return;
      }
      const localPath = resolveLocalAudioPath(uploadedAudioUrl);
      if (!localPath || !fs.existsSync(localPath)) {
        res.status(400).json({ message: "当前音频非后台上传资源，无法解析" });
        return;
      }
      await Program.findByIdAndUpdate(
        id,
        {
          ...parseMetaPatch("parsing"),
          transcript: [],
        },
        { new: false }
      );
      startAsyncParseTask(id, uploadedAudioUrl, { forceTranscriptRegenerate: true });
      res.status(202).json({ programId: id, parseStatus: "parsing" });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "触发解析失败", error });
    }
  }

  async getParseStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = asText(req.params?.id);
      if (!id) {
        res.status(400).json({ message: "无效的节目 ID" });
        return;
      }
      const program = await Program.findById(id);
      if (!program) {
        res.status(404).json({ message: "节目不存在" });
        return;
      }
      res.status(200).json({
        programId: String(program._id),
        parseStatus: program.parseStatus || "idle",
        parseError: program.parseError || "",
        parseStartedAt: program.parseStartedAt || null,
        parseFinishedAt: program.parseFinishedAt || null,
      });
    } catch (error) {
      res.status(500).json({ message: "获取解析状态失败", error });
    }
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (status !== "draft" && status !== "published") {
        res.status(400).json({ message: "状态仅允许 draft 或 published" });
        return;
      }
      const program = await Program.findByIdAndUpdate(
        id,
        statusUpdatePayload(status),
        { new: true }
      );
      if (!program) {
        res.status(404).json({ message: "节目不存在" });
        return;
      }
      res.status(200).json(await attachDictionaryEntriesToPrograms(program, true));
    } catch (error) {
      res.status(400).json({ message: "更新节目状态失败", error });
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const program = await Program.findByIdAndDelete(id);
      if (!program) {
        res.status(404).json({ message: "节目不存在" });
        return;
      }
      await removeProgramFromDictionary(String(program._id));
      res.status(200).json({ message: "节目删除成功" });
    } catch (error) {
      res.status(500).json({ message: "删除节目失败", error });
    }
  }
}
