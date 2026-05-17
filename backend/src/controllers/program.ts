import { Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import Program from "../models/Program";
import GuestModel from "../models/Guest";
import { resolveProgramAiProvider } from "../services/programAi";
import mongoose from "mongoose";
import { attachDictionaryEntriesToPrograms, isHighQualityEducationTerm, removeProgramFromDictionary, syncProgramDictionaryEntries } from "../services/educationDictionary";
import { buildShowNotesKeyMomentsText, getShowNotesDefaultTemplate, renderShowNotesTemplate, truncateByChars } from "../services/showNotes";
import { isTransientAiGenerationFailure } from "../utils/aiFailure";
import { AuthenticatedRequest } from "../middlewares/auth";
import { createAgentTask } from "../services/agentTaskDispatcher";
import { createInboxMessage } from "../services/adminInbox";

const execFileAsync = promisify(execFile);

function statusUpdatePayload(status: "draft" | "published") {
  if (status === "published") {
    return { status, publishedAt: new Date() };
  }
  return { status, publishedAt: null };
}

function previewSecret(): string {
  return process.env.PROGRAM_PREVIEW_SECRET || process.env.JWT_SECRET || "program-preview-dev-secret";
}

function signPreviewToken(input: { idOrCode: string; exp: number }): string {
  const payload = `${input.idOrCode}:${input.exp}`;
  return crypto.createHmac("sha256", previewSecret()).update(payload).digest("hex");
}

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asObjectIdText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value instanceof mongoose.Types.ObjectId) return value.toHexString();
  if (value && typeof (value as any).toHexString === "function") {
    return String((value as any).toHexString()).trim();
  }
  return "";
}

function hasText(value: unknown): boolean {
  return asText(value).length > 0;
}

function normalizeProgramCode(value: unknown): string {
  const raw = asText(value).toLowerCase();
  if (!raw) return "";
  return raw.replace(/\s+/g, "").replace(/[^a-z0-9_-]/g, "");
}

function normalizeGuestName(value: unknown): string {
  return asText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

async function buildNextProgramCode(): Promise<string> {
  const rows = await Program.find(
    { programCode: { $regex: /^ep\d+$/i } },
    { programCode: 1 }
  ).lean();
  let maxNo = 0;
  for (const row of rows) {
    const code = normalizeProgramCode((row as any)?.programCode);
    const match = code.match(/^ep(\d+)$/);
    if (!match) continue;
    const num = Number(match[1]);
    if (Number.isFinite(num) && num > maxNo) maxNo = num;
  }
  return `ep${maxNo + 1}`;
}

function buildPendingProgramTitle(now = new Date()): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `待解析节目-${stamp}-${suffix}`;
}

function buildProgramTitleFromSourceFileName(value: unknown): string {
  const raw = asText(value);
  if (!raw) return "";
  const parsedName = path.parse(raw).name || raw;
  const normalized = parsedName
    .replace(/^\d{10,}[-_ ]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncateByChars(normalized, 80);
}

function resolvePublicBaseUrl(req: Request): string {
  const configured = asText(process.env.VOLCENGINE_PUBLIC_BASE_URL) || asText(process.env.PUBLIC_BASE_URL);
  if (configured) return configured.replace(/\/+$/, "");
  const host = asText(req.get("host"));
  if (!host) return `${req.protocol}://${host}`;
  if (host.includes("localhost") || host.startsWith("127.0.0.1")) {
    return `${req.protocol}://${host}`;
  }
  return `https://${host}`;
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
    .filter((item) => item.title)
    .filter((item) => !/^延伸阅读：/.test(item.title))
    .filter((item) => !/(概念词条与背景知识|概念入门与背景梳理)/.test(item.subtitle || ""))
    .filter((item) => {
      const url = item.url || "";
      if (!url) return true;
      if (url.includes("bing.com/search") || url.includes("google.com/search") || url.includes("baidu.com/s?")) return false;
      if (url.includes("baike.baidu.com/item/") && /^延伸阅读：/.test(item.title)) return false;
      return true;
    });
}

function sanitizeTermGlossary(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item: any) => ({
      term: asText(item?.term),
      definition: asText(item?.definition),
      sourceUrl: asText(item?.sourceUrl),
      aliases: Array.isArray(item?.aliases)
        ? item.aliases.map((alias: unknown) => asText(alias)).filter(Boolean).slice(0, 12)
        : [],
    }))
    .filter((item) => item.term && item.definition)
    .filter((item) => isHighQualityEducationTerm(item.term));
}

function sanitizeQuickView(input: unknown) {
  if (!Array.isArray(input)) return [];
  const normalized = input
    .map((item: any, index: number) => {
      const startRaw = asText(item?.startTime || item?.start || item?.from);
      const endRaw = asText(item?.endTime || item?.end || item?.to);
      const label = asText(item?.timeRangeLabel || item?.timeRange || item?.time);
      const tokens = label.match(/\d{1,2}:\d{2}(?::\d{2})?/g) || [];
      let startSec = parseClockToSeconds(startRaw) ?? parseClockToSeconds(tokens[0]);
      let endSec = parseClockToSeconds(endRaw) ?? parseClockToSeconds(tokens[1]);
      if (!Number.isFinite(startSec) && Number.isFinite(endSec)) startSec = Math.max(0, (endSec as number) - 90);
      if (!Number.isFinite(startSec)) startSec = index * 300;
      if (!Number.isFinite(endSec) || (endSec as number) <= (startSec as number)) {
        endSec = (startSec as number) + 90;
      }
      const summary = truncateByChars(item?.summary || item?.text, 300);
      if (!summary) return null;
      const startTime = formatClockRange(startSec as number);
      const endTime = formatClockRange(endSec as number);
      return {
        startTime,
        endTime,
        timeRangeLabel: `${startTime}-${endTime}`,
        summary,
        __startSec: startSec as number,
      };
    })
    .filter(Boolean) as Array<{ startTime: string; endTime: string; timeRangeLabel: string; summary: string; __startSec: number }>;
  normalized.sort((a, b) => a.__startSec - b.__startSec);
  return normalized.slice(0, 12).map(({ __startSec, ...item }) => item);
}

function sanitizeShowNotesKeyMoments(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item: any) => ({
      time: asText(item?.time || item?.range),
      point: truncateByChars(item?.point || item?.title || item?.summary, 120),
    }))
    .filter((item) => item.time && item.point)
    .slice(0, 20);
}

function sanitizeContentPack(input: unknown) {
  const raw = input || {};
  const quickView = sanitizeQuickView((raw as any)?.quickView);
  const minutesText = truncateByChars((raw as any)?.minutes?.text, 1000);
  const showNotes = {
    guide: truncateByChars((raw as any)?.showNotes?.guide, 300),
    guestIntro: truncateByChars((raw as any)?.showNotes?.guestIntro, 300),
    keyMoments: sanitizeShowNotesKeyMoments((raw as any)?.showNotes?.keyMoments),
    renderedText: asText((raw as any)?.showNotes?.renderedText),
    templateOverride: asText((raw as any)?.showNotes?.templateOverride),
  };
  return {
    quickView,
    minutes: { text: minutesText },
    showNotes,
  };
}

function sanitizeGuestBindings(input: unknown) {
  if (!Array.isArray(input)) return [];
  const byGuestId = new Map<string, { guestId: string; order: number; role: string }>();
  input.forEach((item: any, idx: number) => {
    const guestId = asObjectIdText(item?.guestId);
    if (!guestId || !mongoose.Types.ObjectId.isValid(guestId)) return;
    const orderRaw = Number(item?.order);
    const order = Number.isFinite(orderRaw) && orderRaw > 0 ? Math.floor(orderRaw) : (idx + 1);
    const role = asText(item?.role) || "main_guest";
    if (!byGuestId.has(guestId)) {
      byGuestId.set(guestId, { guestId, order, role });
    }
  });
  return Array.from(byGuestId.values())
    .sort((a, b) => a.order - b.order)
    .map((item, idx) => ({ ...item, order: idx + 1 }));
}

async function attachGuestBindingsToPrograms(programOrPrograms: any): Promise<any> {
  const rows = Array.isArray(programOrPrograms) ? programOrPrograms : [programOrPrograms];
  const normalizedRows = rows.map((row) => (typeof row?.toObject === "function" ? row.toObject() : { ...(row || {}) }));
  const guestIds = Array.from(
    new Set(
      normalizedRows.flatMap((row) =>
        (Array.isArray(row?.guestBindings) ? row.guestBindings : [])
          .map((binding: any) => asObjectIdText(binding?.guestId))
          .filter((id: string) => !!id && mongoose.Types.ObjectId.isValid(id))
      )
    )
  );
  if (!guestIds.length) {
    return Array.isArray(programOrPrograms) ? normalizedRows : normalizedRows[0];
  }
  const guests = await GuestModel.find({ _id: { $in: guestIds } }).lean();
  const guestMap = new Map(guests.map((guest: any) => [String(guest._id), {
    _id: String(guest._id),
    name: guest.name || "",
    title: guest.title || "",
    bio: guest.bio || "",
    avatar: guest.avatar || "",
    profileUrl: guest.profileUrl || "",
    status: guest.status || "active",
  }]));
  const enriched = normalizedRows.map((row) => {
    const bindings = Array.isArray(row?.guestBindings) ? row.guestBindings : [];
    return {
      ...row,
      guestBindings: bindings
        .map((binding: any, idx: number) => {
          const guestId = asObjectIdText(binding?.guestId);
          if (!guestId) return null;
          return {
            guestId,
            order: Number(binding?.order) || (idx + 1),
            role: asText(binding?.role) || "main_guest",
            guest: guestMap.get(guestId) || null,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.order - b.order),
    };
  });
  return Array.isArray(programOrPrograms) ? enriched : enriched[0];
}

async function buildProgramResponse(program: any, extra: Record<string, any> = {}) {
  const attached = await attachDictionaryEntriesToPrograms(program, false);
  const withGuestBindings = await attachGuestBindingsToPrograms(attached);
  const withShowNotes = await applyShowNotesRendering(withGuestBindings);
  return {
    ...withShowNotes,
    ...extra,
  };
}

function sanitizeProgramPayload(payload: any, requireEpisode: boolean) {
  const cleaned = { ...payload };
  delete cleaned.autoGenerate;
  delete cleaned.uploadedAudioUrl;
  if (cleaned.programCode !== undefined) {
    cleaned.programCode = normalizeProgramCode(cleaned.programCode);
  }

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

  if (cleaned.guestBindings !== undefined) {
    cleaned.guestBindings = sanitizeGuestBindings(cleaned.guestBindings);
  }

  if (cleaned.deepDive) {
    cleaned.deepDive = {
      sectionTitle: asText(cleaned.deepDive.sectionTitle),
      curatedReading: sanitizeCuratedReading(cleaned.deepDive.curatedReading),
    };
  }

  if (cleaned.contentPack !== undefined) {
    cleaned.contentPack = sanitizeContentPack(cleaned.contentPack);
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

function mergeContentPack(manual: any, generated: any) {
  const manualPack = manual || {};
  const generatedPack = generated || {};
  const manualShowNotes = manualPack.showNotes || {};
  const generatedShowNotes = generatedPack.showNotes || {};
  return {
    quickView: mergePreferManualArray(manualPack.quickView, generatedPack.quickView),
    minutes: {
      text: mergePreferManualText(manualPack.minutes?.text, generatedPack.minutes?.text),
    },
    showNotes: {
      guide: mergePreferManualText(manualShowNotes.guide, generatedShowNotes.guide),
      guestIntro: mergePreferManualText(manualShowNotes.guestIntro, generatedShowNotes.guestIntro),
      keyMoments: mergePreferManualArray(manualShowNotes.keyMoments, generatedShowNotes.keyMoments),
      renderedText: mergePreferManualText(manualShowNotes.renderedText, generatedShowNotes.renderedText),
      templateOverride: mergePreferManualText(manualShowNotes.templateOverride, generatedShowNotes.templateOverride),
    },
  };
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

  next.contentPack = mergeContentPack(next.contentPack, generated?.contentPack);

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

function shouldTranscodeAudioForAsr(filePath: string): boolean {
  // 已移除 ffmpeg 依赖，火山引擎支持多种音频格式直接处理
  return false;
}

async function transcodeAudioToAsrMp3(filePath: string): Promise<string> {
  // 已移除 ffmpeg 依赖，此函数不再使用
  throw new Error("ffmpeg 转码功能已移除，请直接上传 mp3 格式或使用火山引擎支持的格式");
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

function shouldClearAiFieldsAfterParseFailure(payload: any): boolean {
  const title = asText(payload?.title);
  return title.startsWith("待解析节目-") || payload?.parseStatus === "parsing";
}

function buildParseFailurePayload(payload: any, uploadedAudioUrl: string) {
  const withEpisode = ensureEpisodeFallbackOnAiFailure(payload, uploadedAudioUrl);
  if (!shouldClearAiFieldsAfterParseFailure(withEpisode)) {
    return withEpisode;
  }
  const {
    summary: _summary,
    contentPack: _contentPack,
    deepDive: _deepDive,
    guest: _guest,
    termGlossary: _termGlossary,
    transcript: _transcript,
    dictionaryEntryIds: _dictionaryEntryIds,
    ...rest
  } = withEpisode;
  return {
    ...rest,
    description: asText(rest.description) || "音频已上传，正在解析中。",
    summary: {
      headline: "",
      body: "",
      highlightLabel: "",
      highlightText: "",
      tags: [],
    },
    transcript: [],
    termGlossary: [],
    dictionaryEntryIds: [],
    guest: {
      name: "",
      title: "",
      bio: "",
      avatar: "",
      profileUrl: "",
    },
    deepDive: {
      sectionTitle: "",
      curatedReading: [],
    },
    contentPack: {
      quickView: [],
      minutes: { text: "" },
      showNotes: {
        guide: "",
        guestIntro: "",
        keyMoments: [],
        renderedText: "",
        templateOverride: "",
      },
    },
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

async function validateGuestBindingsOrThrow(bindings: Array<{ guestId: string; order: number; role: string }>) {
  if (!Array.isArray(bindings) || bindings.length === 0) return;
  const guestIds = Array.from(new Set(bindings.map((item) => asText(item.guestId)).filter(Boolean)));
  const guests = await GuestModel.find({ _id: { $in: guestIds } }, { _id: 1, status: 1 }).lean();
  const guestMap = new Map(guests.map((guest: any) => [String(guest._id), guest]));
  for (const guestId of guestIds) {
    if (!guestMap.has(guestId)) {
      throw new Error(`嘉宾不存在：${guestId}`);
    }
    const guest = guestMap.get(guestId);
    if (guest?.status !== "active") {
      throw new Error(`嘉宾已停用，无法新增绑定：${guestId}`);
    }
  }
}

async function ensureGuestBindingsWithLazyMigration(payload: any, existingProgram?: any) {
  const hasIncomingBindings = Array.isArray(payload?.guestBindings) && payload.guestBindings.length > 0;
  if (hasIncomingBindings) return payload;
  const existingBindings = Array.isArray(existingProgram?.guestBindings) ? existingProgram.guestBindings : [];
  if (existingBindings.length > 0) {
    return {
      ...payload,
      guestBindings: existingBindings
        .map((item: any) => ({
          guestId: asObjectIdText(item?.guestId || item?.guest?._id),
          order: Number(item?.order) || 1,
          role: asText(item?.role) || "main_guest",
        }))
        .filter((item: any) => item.guestId && mongoose.Types.ObjectId.isValid(item.guestId)),
    };
  }
  const legacyGuest = payload?.guest || existingProgram?.guest || {};
  const guestName = asText(legacyGuest?.name);
  const normalizedName = normalizeGuestName(guestName);
  if (!guestName || !normalizedName) return payload;
  let guest = await GuestModel.findOne({ normalizedName }).lean();
  if (!guest) {
    guest = (
      await GuestModel.create({
        name: guestName,
        normalizedName,
        title: asText(legacyGuest?.title),
        bio: asText(legacyGuest?.bio),
        avatar: asText(legacyGuest?.avatar),
        profileUrl: asText(legacyGuest?.profileUrl),
        status: "active",
      })
    ).toObject();
  }
  return {
    ...payload,
    guestBindings: [{ guestId: String(guest._id), order: 1, role: "main_guest" }],
  };
}

async function applyShowNotesRendering(payload: any, defaultTemplate?: string) {
  const next = { ...(payload || {}) };
  const contentPack = sanitizeContentPack(next.contentPack || {});
  const showNotes = (contentPack.showNotes || {}) as any;
  const quickView = Array.isArray(contentPack.quickView) ? contentPack.quickView : [];
  const fallbackKeyMoments = quickView
    .slice(0, 8)
    .map((item: any) => ({ time: asText(item?.timeRangeLabel), point: truncateByChars(item?.summary, 90) }))
    .filter((item: any) => item.time && item.point);
  const keyMoments = Array.isArray(showNotes.keyMoments) && showNotes.keyMoments.length > 0
    ? showNotes.keyMoments
    : fallbackKeyMoments;
  const guide = asText(showNotes.guide) || asText(next?.summary?.body);
  const guestName = asText(next?.guest?.name) || "节目特邀嘉宾";
  const hasRenderableShowNotesContent = !!guide || keyMoments.length > 0 || !!asText(contentPack?.minutes?.text) || !!asText(showNotes.guestIntro);
  const guestIntro = hasRenderableShowNotesContent
    ? (asText(showNotes.guestIntro) || `${guestName}，围绕本期主题提供实操经验与关键洞察。`)
    : "";
  const minutesText = asText(contentPack?.minutes?.text) || asText(next?.summary?.body);
  const templateOverride = asText(showNotes.templateOverride);
  const template = templateOverride || defaultTemplate || (await getShowNotesDefaultTemplate());
  const renderedText = hasRenderableShowNotesContent
    ? renderShowNotesTemplate({
        template,
        programTitle: asText(next?.title),
        guestName,
        guide,
        guestIntro,
        keyMomentsText: buildShowNotesKeyMomentsText(keyMoments),
        minutes: minutesText,
      })
    : "";

  next.contentPack = {
    ...contentPack,
    minutes: {
      text: truncateByChars(minutesText, 1000),
    },
    showNotes: {
      guide: truncateByChars(guide, 300),
      guestIntro: truncateByChars(guestIntro, 300),
      keyMoments: sanitizeShowNotesKeyMoments(keyMoments),
      renderedText,
      templateOverride,
    },
  };
  return next;
}

const parsingProgramIds = new Set<string>();
function getParseStaleTimeoutMs(): number {
  const configured = Number(process.env.PARSE_STALE_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 30 * 60 * 1000) return Math.floor(configured);
  return 90 * 60 * 1000;
}
const STALE_PARSE_ERROR_MESSAGE = "解析任务超时未完成，已自动回收，请重新解析";

function parseMetaPatch(
  status: "idle" | "parsing" | "success" | "failed",
  message = "",
  progress = 0,
  stage = "idle"
) {
  const safeProgress = Math.max(0, Math.min(100, Math.floor(progress)));
  if (status === "parsing") {
    return {
      parseStatus: "parsing",
      parseStartedAt: new Date(),
      parseFinishedAt: null,
      parseError: "",
      parseProgress: safeProgress,
      parseStage: stage || "queued",
    };
  }
  if (status === "success") {
    return {
      parseStatus: "success",
      parseFinishedAt: new Date(),
      parseError: "",
      parseProgress: 100,
      parseStage: "completed",
    };
  }
  if (status === "failed") {
    return {
      parseStatus: "failed",
      parseFinishedAt: new Date(),
      parseError: message || "解析失败",
      parseProgress: safeProgress > 0 ? safeProgress : 100,
      parseStage: stage || "failed",
    };
  }
  return {
    parseStatus: "idle",
    parseError: "",
    parseProgress: 0,
    parseStage: "idle",
  };
}

function normalizeParseFailureMessage(message: string): string {
  const raw = asText(message);
  if (!raw) return "解析失败，请稍后重试";
  if (/status code 502|bad gateway|gateway/i.test(raw)) {
    return "上游语音服务暂时不可用（网关错误 502），请稍后重试";
  }
  if (/status code 503|service unavailable/i.test(raw)) {
    return "上游语音服务暂时不可用（503），请稍后重试";
  }
  if (/status code 504|gateway timeout|timed out|timeout/i.test(raw)) {
    return "上游语音服务响应超时（504），请稍后重试";
  }
  return raw;
}

function buildProgramSourceTextForDictionary(payload: any): string {
  const transcriptText = Array.isArray(payload?.transcript)
    ? payload.transcript.map((item: any) => asText(item?.text)).filter(Boolean).join("\n")
    : "";
  const title = asText(payload?.title);
  const summaryBody = asText(payload?.summary?.body);
  const quickViewText = Array.isArray(payload?.contentPack?.quickView)
    ? payload.contentPack.quickView.map((item: any) => asText(item?.summary)).filter(Boolean).join("\n")
    : "";
  return [title, summaryBody, quickViewText, transcriptText].filter(Boolean).join("\n");
}

function isStaleParsingProgram(program: any, now = Date.now()): boolean {
  if (!program || program.parseStatus !== "parsing") return false;
  const id = asObjectIdText(program._id);
  if (id && parsingProgramIds.has(id)) return false;
  const parseStartedAt = program.parseStartedAt ? new Date(program.parseStartedAt).getTime() : 0;
  if (!parseStartedAt || Number.isNaN(parseStartedAt)) return false;
  return now - parseStartedAt >= getParseStaleTimeoutMs();
}

async function recycleStaleParsingPrograms(programs: any[]): Promise<void> {
  if (!Array.isArray(programs) || !programs.length) return;
  const now = Date.now();
  const staleIds: mongoose.Types.ObjectId[] = [];
  for (const program of programs) {
    if (!isStaleParsingProgram(program, now)) continue;
    const id = asObjectIdText(program._id);
    if (!mongoose.Types.ObjectId.isValid(id)) continue;
    staleIds.push(new mongoose.Types.ObjectId(id));
    Object.assign(program, parseMetaPatch("failed", STALE_PARSE_ERROR_MESSAGE, 100, "failed"));
  }
  if (!staleIds.length) return;
  await Program.updateMany(
    {
      _id: { $in: staleIds },
      parseStatus: "parsing",
    },
    parseMetaPatch("failed", STALE_PARSE_ERROR_MESSAGE, 100, "failed")
  );
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
  const parseRunId = crypto.randomUUID();
  parsingProgramIds.add(programId);
  try {
    await Program.findByIdAndUpdate(programId, parseMetaPatch("parsing", "", 5, "queued"), { new: false });
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
    const aiResult = await tryAutoGenerate(sourcePayload, async (progress, stage) => {
      await Program.findByIdAndUpdate(
        programId,
        {
          parseStatus: "parsing",
          parseProgress: Math.max(0, Math.min(99, Math.floor(progress))),
          parseStage: asText(stage) || "parsing",
          parseError: "",
        },
        { new: false }
      );
    });
    await Program.findByIdAndUpdate(programId, { parseProgress: 96, parseStage: "saving" }, { new: false });
    const payload = await applyShowNotesRendering(sanitizeProgramPayload(aiResult.payload, false));
    const status = aiResult.aiStatus === "generated" ? "success" : "failed";
    const parsePatch = parseMetaPatch(status, aiResult.aiMessage || "", status === "failed" ? 100 : 100, status === "failed" ? "failed" : "completed");
    await Program.findByIdAndUpdate(programId, { ...payload, ...parsePatch }, { new: false });
    await createInboxMessage({
      sourceType: "program_parse_task",
      sourceId: parseRunId,
      taskType: "program_parse",
      taskStatus: status === "success" ? "succeeded" : "failed",
      targetType: "program",
      targetId: programId,
      summary: status === "success" ? "节目解析完成，可查看逐字稿与摘要结果。" : (aiResult.aiMessage || "节目解析失败"),
      payload: {
        programId,
        parseRunId,
        parseStatus: status,
        parseMessage: aiResult.aiMessage || "",
        parsePatch,
      },
    }).catch(() => {});
    const dictionarySourceText = buildProgramSourceTextForDictionary(payload);
    await syncProgramDictionaryEntries(programId, payload.termGlossary, "ai_program", {
      sourceText: dictionarySourceText,
    });
    if (status === "success") {
      await createAgentTask({
        taskType: "proofread_transcript",
        targetType: "program",
        targetId: programId,
        options: { trigger: "auto_after_parse" },
        createdBy: "system",
      }).catch(() => {});
    }
  } catch (error: any) {
    const parseMessage = normalizeParseFailureMessage(asText(error?.message || "解析任务执行失败"));
    await Program.findByIdAndUpdate(
      programId,
      parseMetaPatch("failed", parseMessage, 100, "failed"),
      { new: false }
    );
    await createInboxMessage({
      sourceType: "program_parse_task",
      sourceId: parseRunId,
      taskType: "program_parse",
      taskStatus: "failed",
      targetType: "program",
      targetId: programId,
      summary: parseMessage,
      payload: {
        programId,
        parseRunId,
        parseStatus: "failed",
        parseMessage,
      },
    }).catch(() => {});
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

async function tryAutoGenerate(
  payload: any,
  onProgress?: (progress: number, stage: string) => Promise<void> | void
): Promise<{ payload: any; aiStatus?: string; aiMessage?: string }> {
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
    const transcribePath = localFilePath;
    const sourceUrlForAsr: string | undefined = uploadedAudioUrl; // 始终保留 sourceUrl，支持 Standard 模式
    await onProgress?.(12, "transcribing");
    console.log("[ai-program] start transcription", { transcribePath, sourceUrlForAsr: sourceUrlForAsr || "(local-only)" });
    const transcription = await provider.transcribeAudio(transcribePath, {
      sourceUrl: sourceUrlForAsr,
      onProgress: async (progress, stage) => {
        const normalizedStage = asText(stage) || "transcribing";
        const safeProgress = Math.max(12, Math.min(60, Math.floor(progress)));
        await onProgress?.(safeProgress, normalizedStage);
      },
    });
    await onProgress?.(62, "transcribed");
    console.log("[ai-program] transcription done", { segments: transcription.transcript.length });
    await onProgress?.(76, "extracting");
    const generated = await provider.extractProgramMetadata(transcription);
    await onProgress?.(90, "extracted");
    console.log("[ai-program] metadata extraction done");
    const merged = mergeAiIntoPayload(payload, generated, transcription.transcript);
    const mergedWithBase = ensureBaseFieldsFromGenerated(merged, generated, transcription.transcript);
    return { payload: mergedWithBase, aiStatus: "generated" };
  } catch (error: any) {
    console.error("[ai-program] generation failed", error);
    const fallbackPayload = buildParseFailurePayload(payload, uploadedAudioUrl);
    const message = normalizeParseFailureMessage(asText(error?.message || "AI 生成失败"));
    return {
      payload: fallbackPayload,
      aiStatus: "failed",
      aiMessage: isTransientAiGenerationFailure(message)
        ? `${message}；已保留音频资源，未写入自动生成内容`
        : message,
    };
  }
}

export class ProgramController {
  async acceptProofread(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = asText(req.params.id);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: "无效的节目 ID" });
        return;
      }
      const program = await Program.findById(id);
      if (!program) {
        res.status(404).json({ message: "节目不存在" });
        return;
      }
      const corrected = (program as any)?.agentOutputs?.proofread?.correctedTranscript;
      if (!Array.isArray(corrected) || corrected.length === 0) {
        res.status(400).json({ message: "当前没有可接受的校对结果" });
        return;
      }
      await Program.findByIdAndUpdate(
        id,
        {
          $set: {
            transcript: corrected,
            "agentOutputs.proofread.acceptedAt": new Date(),
            "agentOutputs.proofread.acceptedBy": asText(req.user?.id),
          },
        },
        { new: false }
      );

      const latest = await Program.findById(id);
      if (!latest) {
        res.status(500).json({ message: "应用成功，但读取失败" });
        return;
      }
      const attached = await attachDictionaryEntriesToPrograms(latest, true);
      const attachedGuest = await attachGuestBindingsToPrograms(attached);
      res.status(200).json(await applyShowNotesRendering(attachedGuest));
    } catch (error: any) {
      res.status(400).json({ message: error?.message || "接受校对失败", error });
    }
  }

  async getRelatedPublic(req: Request, res: Response): Promise<void> {
    try {
      const id = asText(req.params.id);
      const query = mongoose.Types.ObjectId.isValid(id)
        ? { _id: id, status: "published" as const }
        : { programCode: normalizeProgramCode(id), status: "published" as const };
      const current = await Program.findOne(query).lean();
      if (!current) {
        res.status(404).json({ message: "节目不存在或未上架" });
        return;
      }

      const currentGuestIds = new Set(
        (Array.isArray((current as any)?.guestBindings) ? (current as any).guestBindings : [])
          .map((item: any) => asObjectIdText(item?.guestId))
          .filter(Boolean)
      );
      const currentTags = new Set(
        (Array.isArray((current as any)?.summary?.tags) ? (current as any).summary.tags : [])
          .map((x: any) => asText(x).toLowerCase())
          .filter(Boolean)
      );
      const currentTerms = new Set(
        (Array.isArray((current as any)?.termGlossary) ? (current as any).termGlossary : [])
          .map((x: any) => asText(x?.term).toLowerCase())
          .filter(Boolean)
      );

      const baseFilter: Record<string, any> = { status: "published", _id: { $ne: (current as any)._id } };
      const orFilters: Record<string, any>[] = [];
      if (currentGuestIds.size) {
        orFilters.push({
          "guestBindings.guestId": {
            $in: Array.from(currentGuestIds)
              .map((x) => String(x))
              .filter((x) => mongoose.Types.ObjectId.isValid(x))
              .map((x) => new mongoose.Types.ObjectId(x)),
          },
        });
      }
      if (currentTags.size) {
        orFilters.push({ "summary.tags": { $in: Array.from(currentTags) } });
      }
      const filter = orFilters.length ? { ...baseFilter, $or: orFilters } : baseFilter;
      const candidatesRaw = await Program.find(filter)
        .sort({ publishedAt: -1, updatedAt: -1 })
        .limit(80)
        .lean();
      const candidates = await attachGuestBindingsToPrograms(candidatesRaw as any[]);

      const scored = (candidates as any[])
        .map((item) => {
          const guestIds = new Set(
            (Array.isArray(item?.guestBindings) ? item.guestBindings : [])
              .map((b: any) => asObjectIdText(b?.guestId))
              .filter(Boolean)
          );
          const tagSet = new Set(
            (Array.isArray(item?.summary?.tags) ? item.summary.tags : [])
              .map((x: any) => asText(x).toLowerCase())
              .filter(Boolean)
          );
          const termSet = new Set(
            (Array.isArray(item?.termGlossary) ? item.termGlossary : [])
              .map((x: any) => asText(x?.term).toLowerCase())
              .filter(Boolean)
          );
          const sameGuestCount = Array.from(guestIds).filter((x) => currentGuestIds.has(x)).length;
          const tagOverlap = Array.from(tagSet).filter((x) => currentTags.has(x)).length;
          const termOverlap = Array.from(termSet).filter((x) => currentTerms.has(x)).length;

          const reasons: string[] = [];
          if (sameGuestCount > 0) reasons.push("同嘉宾");
          if (tagOverlap > 0) reasons.push(`同标签${tagOverlap}项`);
          if (termOverlap > 0) reasons.push(`同词条${termOverlap}项`);
          const score = sameGuestCount * 100 + tagOverlap * 10 + termOverlap * 3;
          return {
            _id: String(item._id),
            programCode: asText(item?.programCode),
            title: asText(item?.title),
            coverImage: asText(item?.coverImage),
            summary: item?.summary || {},
            guestBindings: Array.isArray(item?.guestBindings) ? item.guestBindings : [],
            score,
            reasons: reasons.length ? reasons : ["近期更新"],
          };
        })
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .slice(0, 6);

      res.status(200).json({
        current: {
          _id: String((current as any)._id),
          programCode: asText((current as any).programCode),
          title: asText((current as any).title),
        },
        recommendedPrograms: scored,
      });
    } catch (error) {
      res.status(500).json({ message: "获取关联内容失败", error });
    }
  }

  async getAllPublic(req: Request, res: Response): Promise<void> {
    try {
      const pageRaw = Number(req.query.page);
      const pageSizeRaw = Number(req.query.pageSize);
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
      const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(100, Math.floor(pageSizeRaw)) : 20;

      // 列表页只取必要字段，排除大字段提升性能（transcript/deepDive 可几十KB）
      const total = await Program.countDocuments({ status: "published" });
      const skip = (page - 1) * pageSize;
      const programs = await Program.find({ status: "published" })
        .select({
          programCode: 1, title: 1, description: 1, coverImage: 1,
          publishedAt: 1, createdAt: 1, updatedAt: 1,
          summary: 1, episodes: 1, status: 1,
          dictionaryEntryIds: 1, guestBindings: 1,
        })
        .sort({ publishedAt: -1, createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean();
      const attached = await attachDictionaryEntriesToPrograms(programs, false);
      const attachedGuests = await attachGuestBindingsToPrograms(attached);
      // 补充轻量布尔字段（transcript/deepDive 原始数据不返回，节省数百KB）
      const listWithFlags = attachedGuests.map((p: any) => ({
        ...p,
        hasTranscript: Array.isArray(p.transcript) ? p.transcript.length : 0,
        hasDeepDive: !!(p.deepDive?.curatedReading?.length),
      }));
      res.status(200).json({
        programs: listWithFlags,
        data: listWithFlags,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      });
    } catch (error) {
      res.status(500).json({ message: "获取节目列表失败", error });
    }
  }

  async getByIdPublic(req: Request, res: Response): Promise<void> {
    try {
      const id = asText(req.params.id);
      const previewSig = asText(req.query.preview);
      const previewExp = Number(req.query.exp);
      const isPreviewCandidate = !!previewSig && Number.isFinite(previewExp);
      // 优先按 programCode 匹配（兼容 ObjectId 格式的 code），其次按 _id
      const normalizedCode = normalizeProgramCode(id);
      const isObjectId = mongoose.Types.ObjectId.isValid(id);
      let baseQuery: any = isObjectId
        ? { $or: [{ programCode: normalizedCode }, { _id: id }] }
        : { programCode: normalizedCode };
      const program = await Program.findOne(baseQuery);
      if (!program) {
        res.status(404).json({ message: "节目不存在或未上架" });
        return;
      }
      if (program.status !== "published") {
        if (!isPreviewCandidate) {
          res.status(404).json({ message: "节目不存在或未上架" });
          return;
        }
        const safeExp = Math.floor(previewExp);
        if (safeExp < Math.floor(Date.now() / 1000)) {
          res.status(403).json({ message: "预览链接已过期" });
          return;
        }
        const expected = signPreviewToken({ idOrCode: id, exp: safeExp });
        if (!safeCompare(expected, previewSig)) {
          res.status(403).json({ message: "预览链接无效" });
          return;
        }
      }
      const attached = await attachDictionaryEntriesToPrograms(program, false);
      const attachedGuest = await attachGuestBindingsToPrograms(attached);
      const result = await applyShowNotesRendering(attachedGuest);
      // 如果 guest 无数据，从 guestBindings 第一项补全
      if (!result.guest?.name && Array.isArray(result.guestBindings)) {
        const firstGuest = result.guestBindings.find((b: any) => b?.guest);
        if (firstGuest?.guest) {
          result.guest = {
            _id: firstGuest.guestId || firstGuest.guest._id || "",
            name: firstGuest.guest.name || "",
            title: firstGuest.guest.title || "",
            bio: firstGuest.guest.bio || "",
            avatar: firstGuest.guest.avatar || "",
            profileUrl: firstGuest.guest.profileUrl || "",
          };
        }
      }
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ message: "获取节目失败", error });
    }
  }

  async getAllAdmin(req: Request, res: Response): Promise<void> {
    try {
      const { status } = req.query;
      const pageRaw = Number(req.query?.page);
      const pageSizeRaw = Number(req.query?.pageSize);
      const search = asText(req.query?.search);
      const shouldUsePagination = Number.isFinite(pageRaw) || Number.isFinite(pageSizeRaw) || hasText(search);
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
      const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(100, Math.floor(pageSizeRaw)) : 20;
      const filter =
        status === "draft" || status === "published" ? { status } : {};

      if (!shouldUsePagination) {
        const programs = await Program.find(filter)
          .select({
            programCode: 1, title: 1, description: 1, coverImage: 1,
            publishedAt: 1, createdAt: 1, updatedAt: 1,
            summary: 1, episodes: 1, status: 1, parseStatus: 1, parseProgress: 1, parseStage: 1,
            transcript: 1, dictionaryEntryIds: 1, guestBindings: 1,
            deepDive: 1, contentPack: 1,
          })
          .sort({ updatedAt: -1 })
          .lean();
        await recycleStaleParsingPrograms(programs as any[]);
        const attached = await attachDictionaryEntriesToPrograms(programs, true);
        const attachedGuests = await attachGuestBindingsToPrograms(attached);
        const template = await getShowNotesDefaultTemplate();
        res.status(200).json(await Promise.all((attachedGuests as any[]).map((item) => applyShowNotesRendering(item, template))));
        return;
      }

      const keywordFilter = hasText(search)
        ? {
            $or: [
              { title: { $regex: search, $options: "i" } },
              { programCode: { $regex: search, $options: "i" } },
            ],
          }
        : {};
      const finalFilter = {
        ...filter,
        ...keywordFilter,
      };
      const total = await Program.countDocuments(finalFilter);
      const skip = (page - 1) * pageSize;
      const programs = await Program.find(finalFilter)
        .select({
          programCode: 1, title: 1, description: 1, coverImage: 1,
          publishedAt: 1, createdAt: 1, updatedAt: 1,
          summary: 1, episodes: 1, status: 1, parseStatus: 1, parseProgress: 1, parseStage: 1,
          transcript: 1, dictionaryEntryIds: 1, guestBindings: 1,
          deepDive: 1, contentPack: 1,
        })
        .sort({ updatedAt: -1 }).skip(skip).limit(pageSize)
        .lean();
      await recycleStaleParsingPrograms(programs as any[]);
      const attached = await attachDictionaryEntriesToPrograms(programs, true);
      const attachedGuests = await attachGuestBindingsToPrograms(attached);
      const template = await getShowNotesDefaultTemplate();
      const rows = await Promise.all((attachedGuests as any[]).map((item) => applyShowNotesRendering(item, template)));
      res.status(200).json({
        items: rows,
        data: rows,
        programs: rows,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      });
    } catch (error) {
      res.status(500).json({ message: "获取管理节目列表失败", error });
    }
  }

  async createPreviewLink(req: Request, res: Response): Promise<void> {
    try {
      const id = asText(req.params.id);
      if (!id) {
        res.status(400).json({ message: "缺少节目ID" });
        return;
      }
      const ttlHoursRaw = Number(req.body?.ttlHours);
      const ttlHours = Number.isFinite(ttlHoursRaw) ? Math.max(1, Math.min(24 * 30, Math.floor(ttlHoursRaw))) : 72;
      const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { programCode: normalizeProgramCode(id) };
      const program = await Program.findOne(query).lean();
      if (!program) {
        res.status(404).json({ message: "节目不存在" });
        return;
      }
      const idOrCode = asText((program as any).programCode) || String((program as any)._id);
      const exp = Math.floor(Date.now() / 1000) + ttlHours * 3600;
      const preview = signPreviewToken({ idOrCode, exp });
      const path = `/programs/${encodeURIComponent(idOrCode)}?preview=${preview}&exp=${exp}`;
      res.status(200).json({ path, idOrCode, exp, ttlHours });
    } catch (error) {
      res.status(500).json({ message: "生成预览链接失败", error });
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
      const attached = await attachDictionaryEntriesToPrograms(program, true);
      const attachedGuest = await attachGuestBindingsToPrograms(attached);
      res.status(200).json(await applyShowNotesRendering(attachedGuest));
    } catch (error) {
      res.status(500).json({ message: "获取节目失败", error });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const aiResult = await tryAutoGenerate(req.body || {});
      let payload = await applyShowNotesRendering(sanitizeProgramPayload(aiResult.payload, true));
      payload = await ensureGuestBindingsWithLazyMigration(payload);
      await validateGuestBindingsOrThrow(Array.isArray(payload.guestBindings) ? payload.guestBindings : []);
      if (!hasText(payload.programCode)) {
        payload.programCode = await buildNextProgramCode();
      }
      if (payload.status && !["draft", "published"].includes(payload.status)) {
        res.status(400).json({ message: "无效的状态值" });
        return;
      }
      if (payload.status === "published" && !payload.publishedAt) {
        payload.publishedAt = new Date();
      }
      const program = new Program(payload);
      await program.save();
      await syncProgramDictionaryEntries(String(program._id), payload.termGlossary, "ai_program", {
        sourceText: buildProgramSourceTextForDictionary(payload),
      });
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
      if (error?.code === 11000 && String(Object.keys(error?.keyPattern || {})[0] || "") === "programCode") {
        res.status(400).json({ message: "节目编号已存在，请换一个，例如 ep12", error });
        return;
      }
      res.status(400).json({ message: error?.message || "创建节目失败", error });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const existing = await Program.findById(id);
      if (!existing) {
        res.status(404).json({ message: "节目不存在" });
        return;
      }
      const aiResult = await tryAutoGenerate(req.body || {});
      let payload = await applyShowNotesRendering(sanitizeProgramPayload(aiResult.payload, false));
      const hasIncomingGuestBindings = Array.isArray(req.body?.guestBindings);
      payload = await ensureGuestBindingsWithLazyMigration(payload, existing.toObject());
      if (hasIncomingGuestBindings) {
        await validateGuestBindingsOrThrow(Array.isArray(payload.guestBindings) ? payload.guestBindings : []);
      }
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
      await syncProgramDictionaryEntries(String(program._id), payload.termGlossary, "ai_program", {
        sourceText: buildProgramSourceTextForDictionary(payload),
      });
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
      if (error?.code === 11000 && String(Object.keys(error?.keyPattern || {})[0] || "") === "programCode") {
        res.status(400).json({ message: "节目编号已存在，请换一个，例如 ep12", error });
        return;
      }
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
      const baseUrl = resolvePublicBaseUrl(req);
      const audioUrl = `${baseUrl}/uploads/audio/${file.filename}`;
      const sourceFileName = asText(req.body?.sourceFileName);
      res.status(201).json({
        url: audioUrl,
        filename: file.filename,
        originalName: sourceFileName || file.originalname,
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
      const sourceTitle = buildProgramTitleFromSourceFileName(req.body?.sourceFileName || req.body?.originalName);
      if (!uploadedAudioUrl) {
        res.status(400).json({ message: "缺少 uploadedAudioUrl" });
        return;
      }
      const localPath = resolveLocalAudioPath(uploadedAudioUrl);
      if (!localPath || !fs.existsSync(localPath)) {
        res.status(400).json({ message: "仅支持后台已上传的音频地址" });
        return;
      }
      const nextCode = await buildNextProgramCode();
      const program = new Program({
        programCode: nextCode,
        title: sourceTitle || buildPendingProgramTitle(),
        description: "音频已上传，正在解析中。",
        coverImage: "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?q=80&w=1200&auto=format&fit=crop",
        episodes: [{ title: sourceTitle || "待解析", duration: "待解析", url: uploadedAudioUrl }],
        status: "draft",
        ...parseMetaPatch("parsing", "", 5, "queued"),
      });
      await program.save();
      startAsyncParseTask(String(program._id), uploadedAudioUrl);
      res.status(201).json({
        programId: String(program._id),
        parseStatus: "parsing",
        parseStage: "queued",
        parseProgress: 5,
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
        const parseStartedAt = program.parseStartedAt ? new Date(program.parseStartedAt).getTime() : 0;
        const now = Date.now();
        const isStale = !parsingProgramIds.has(id) && parseStartedAt > 0 && now - parseStartedAt >= getParseStaleTimeoutMs();
        if (!isStale) {
          res.status(409).json({ message: "解析任务进行中，请稍后刷新状态", parseStatus: "parsing" });
          return;
        }
        await Program.findByIdAndUpdate(
          id,
          parseMetaPatch("failed", STALE_PARSE_ERROR_MESSAGE, 100, "failed"),
          { new: false }
        );
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
          ...parseMetaPatch("parsing", "", 5, "queued"),
          transcript: [],
          summary: {
            headline: "",
            body: "",
            highlightLabel: "",
            highlightText: "",
            tags: [],
          },
          termGlossary: [],
          deepDive: {
            sectionTitle: "",
            curatedReading: [],
          },
          contentPack: {
            quickView: [],
            minutes: { text: "" },
            showNotes: {
              guide: "",
              guestIntro: "",
              keyMoments: [],
              renderedText: "",
              templateOverride: "",
            },
          },
        },
        { new: false }
      );
      startAsyncParseTask(id, uploadedAudioUrl, { forceTranscriptRegenerate: true });
      res.status(202).json({ programId: id, parseStatus: "parsing", parseStage: "queued", parseProgress: 5 });
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
      if (isStaleParsingProgram(program)) {
        await Program.findByIdAndUpdate(
          id,
          parseMetaPatch("failed", STALE_PARSE_ERROR_MESSAGE, 100, "failed"),
          { new: false }
        );
        Object.assign(program, parseMetaPatch("failed", STALE_PARSE_ERROR_MESSAGE, 100, "failed"));
      }
      res.status(200).json({
        programId: String(program._id),
        parseStatus: program.parseStatus || "idle",
        parseStage: asText((program as any).parseStage) || "idle",
        parseProgress: Number((program as any).parseProgress) || 0,
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
      const attached = await attachDictionaryEntriesToPrograms(program, true);
      const attachedGuest = await attachGuestBindingsToPrograms(attached);
      res.status(200).json(await applyShowNotesRendering(attachedGuest));
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
