import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

type TranscriptSegment = {
  time: string;
  speaker: string;
  text: string;
  featured?: boolean;
};

type TimedUtterance = {
  startSec: number;
  endSec: number;
  text: string;
  speaker?: string;
};

type ProgramAiResult = {
  episodeTitle?: string;
  episodeDuration?: string;
  summary?: {
    headline?: string;
    body?: string;
    highlightLabel?: string;
    highlightText?: string;
    tags?: string[];
  };
  transcript?: TranscriptSegment[];
  termGlossary?: Array<{ term: string; definition: string; sourceUrl?: string }>;
  guest?: {
    name?: string;
    title?: string;
    bio?: string;
    avatar?: string;
    profileUrl?: string;
  };
  deepDive?: {
    sectionTitle?: string;
    curatedReading?: Array<{ title: string; subtitle?: string; url?: string }>;
  };
  contentPack?: {
    quickView?: Array<{ startTime?: string; endTime?: string; timeRangeLabel?: string; summary?: string }>;
    minutes?: { text?: string };
    showNotes?: {
      guide?: string;
      guestIntro?: string;
      keyMoments?: Array<{ time?: string; point?: string }>;
      renderedText?: string;
      templateOverride?: string;
    };
  };
};

export type ProgramAiProvider = {
  transcribeAudio(
    filePath: string,
    options?: { sourceUrl?: string }
  ): Promise<{ transcript: TranscriptSegment[]; plainText: string; durationSeconds: number }>;
  extractProgramMetadata(input: { transcript: TranscriptSegment[]; plainText: string; durationSeconds: number }): Promise<ProgramAiResult>;
};

type MetadataLlmConfig = {
  apiKey: string;
  modelId: string;
  baseUrl: string;
  providerName: string;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isLocalSourceUrl(url: string): boolean {
  if (!url) return true;
  try {
    const u = new URL(url);
    return ["localhost", "127.0.0.1", "0.0.0.0"].includes(u.hostname) || u.hostname.endsWith("_backend");
  } catch (_error) {
    return true;
  }
}

export function normalizeVolcenginePublicSourceUrl(sourceUrl: string, publicBaseUrl: string): string {
  const raw = asText(sourceUrl);
  const publicBase = asText(publicBaseUrl);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (publicBase && (isLocalSourceUrl(raw) || parsed.pathname.startsWith("/uploads/"))) {
      return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, publicBase).toString();
    }
    return parsed.toString();
  } catch (_error) {
    if (!publicBase) return raw;
    const normalizedPath = raw.startsWith("/") ? raw : `/${raw}`;
    try {
      return new URL(normalizedPath, publicBase).toString();
    } catch (_secondError) {
      return raw;
    }
  }
}

export function shouldUseVolcengineStandardEndpoint(resourceId: string, mode: string): boolean {
  const normalizedMode = asText(mode).toLowerCase();
  const normalizedResourceId = asText(resourceId);
  if (normalizedMode === "standard") return true;
  if (/^Speech_Recognition_Seed_/i.test(normalizedResourceId)) return true;
  return normalizedResourceId === "volc.bigasr.auc";
}

export function shouldAttemptVolcengineFlashEndpoint(resourceId: string, mode: string): boolean {
  return !shouldUseVolcengineStandardEndpoint(resourceId, mode);
}

function getVolcengineFetchTimeoutMs(): number {
  const timeoutMs = Number(process.env.VOLCENGINE_FETCH_TIMEOUT_MS);
  if (Number.isFinite(timeoutMs) && timeoutMs >= 5000) return Math.floor(timeoutMs);
  return 180000;
}

export function getVolcengineFlashMaxLocalBytes(): number {
  const maxBytes = Number(process.env.VOLCENGINE_FLASH_MAX_LOCAL_BYTES);
  if (Number.isFinite(maxBytes) && maxBytes > 0) return Math.floor(maxBytes);
  return 25 * 1024 * 1024;
}

export function shouldContinueVolcengineStandardPolling(statusCode: string): boolean {
  const normalized = asText(statusCode);
  return normalized === "20000001" || normalized === "20000002";
}

async function fetchVolcengine(url: string, init: RequestInit): Promise<Response> {
  const timeoutMs = getVolcengineFetchTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: init.signal || controller.signal });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error(`火山请求超时（${Math.round(timeoutMs / 1000)}秒）: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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

function truncateByChars(value: unknown, maxChars: number): string {
  const text = asText(value);
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars)).trim();
}

function normalizeQuickView(
  input: unknown,
  transcript: TranscriptSegment[],
  durationSeconds: number
): Array<{ startTime: string; endTime: string; timeRangeLabel: string; summary: string }> {
  const list = Array.isArray(input) ? input : [];
  const fallbackTranscript = Array.isArray(transcript) ? transcript : [];
  const fromTranscript = fallbackTranscript
    .slice(0, 12)
    .map((item) => {
      const token = String(item?.time || "").match(/\d{1,2}:\d{2}(?::\d{2})?/g) || [];
      const start = token[0] || "00:00";
      const end = token[1] || start;
      return {
        startTime: start,
        endTime: end,
        timeRangeLabel: `${start}-${end}`,
        summary: truncateByChars(item?.text, 280),
      };
    })
    .filter((item) => item.summary);
  const source = list.length > 0 ? list : fromTranscript;

  const normalized = source
    .map((item: any, index: number) => {
      const startToken = asText(item?.startTime || item?.start || item?.from || item?.timeStart);
      const endToken = asText(item?.endTime || item?.end || item?.to || item?.timeEnd);
      const labelToken = asText(item?.timeRangeLabel || item?.time || item?.range);
      const labelTokens = labelToken.match(/\d{1,2}:\d{2}(?::\d{2})?/g) || [];
      let startSec = parseClockToSeconds(startToken) ?? parseClockToSeconds(labelTokens[0]);
      let endSec = parseClockToSeconds(endToken) ?? parseClockToSeconds(labelTokens[1]);
      if (!Number.isFinite(startSec) && Number.isFinite(endSec)) startSec = Math.max(0, (endSec as number) - 90);
      if (!Number.isFinite(startSec)) startSec = Math.max(0, index * 300);
      if (!Number.isFinite(endSec) || (endSec as number) <= (startSec as number)) {
        endSec = Math.min(Math.max((startSec as number) + 90, (startSec as number) + 30), Math.max(120, durationSeconds || 0));
      }
      const summary = truncateByChars(item?.summary || item?.text || item?.point, 300);
      if (!summary) return null;
      const startTime = formatClock(startSec as number);
      const endTime = formatClock(endSec as number);
      return {
        startTime,
        endTime,
        timeRangeLabel: `${startTime}-${endTime}`,
        summary,
        startSec: startSec as number,
      };
    })
    .filter(Boolean) as Array<{ startTime: string; endTime: string; timeRangeLabel: string; summary: string; startSec: number }>;

  normalized.sort((a, b) => a.startSec - b.startSec);
  return normalized.slice(0, 12).map((item) => ({
    startTime: item.startTime,
    endTime: item.endTime,
    timeRangeLabel: item.timeRangeLabel,
    summary: item.summary,
  }));
}

function normalizeShowNotesKeyMoments(input: unknown): Array<{ time: string; point: string }> {
  const list = Array.isArray(input) ? input : [];
  return list
    .map((item: any) => ({
      time: asText(item?.time || item?.range || item?.timestamp),
      point: truncateByChars(item?.point || item?.title || item?.summary, 120),
    }))
    .filter((item) => item.time && item.point)
    .slice(0, 20);
}

function normalizeSpeakerToken(value: unknown): string {
  return asText(value).toLowerCase().replace(/[\s_-]+/g, "");
}

function isExplicitHostSpeaker(value: unknown): boolean {
  const normalized = normalizeSpeakerToken(value);
  if (!normalized) return false;
  return /主持|host|speakera|主持人a|主持人b|anchor|mc|jessie/.test(normalized);
}

function isExplicitGuestSpeaker(value: unknown): boolean {
  const normalized = normalizeSpeakerToken(value);
  if (!normalized) return false;
  return /嘉宾|guest|speakerb|expert|老师|博士/.test(normalized);
}

function looksLikeHostParagraph(text: string): boolean {
  const normalized = asText(text).replace(/\s+/g, "");
  if (!normalized) return false;
  return /欢迎回到|欢迎来到|今天我们|这一期|本期节目|接下来我们|我想追问|我想请教|先聊聊|大家好|感谢来到/.test(normalized);
}

function looksLikeQuestionPrompt(text: string): boolean {
  const normalized = asText(text);
  if (!normalized) return false;
  return /[？?]/.test(normalized) || /为什么|怎么|如何|能不能|可不可以|是不是|请你|请您|想请教/.test(normalized);
}

function getTimedUtteranceSpeakerKey(item: TimedUtterance, index: number): string {
  const rawSpeaker = asText(item.speaker);
  if (rawSpeaker) return rawSpeaker;
  return index === 0 ? "__unknown_lead__" : "__unknown__";
}

function resolveRoleLabels(
  paragraphs: Array<{ startSec: number; endSec: number; speakerKey: string; text: string }>
): string[] {
  const firstSeenKeys: string[] = [];
  const keyCounts = new Map<string, number>();
  const hostScores = new Map<string, number>();

  for (const paragraph of paragraphs) {
    if (!firstSeenKeys.includes(paragraph.speakerKey)) {
      firstSeenKeys.push(paragraph.speakerKey);
    }
    keyCounts.set(paragraph.speakerKey, (keyCounts.get(paragraph.speakerKey) || 0) + 1);
    const hostScoreBoost =
      (isExplicitHostSpeaker(paragraph.speakerKey) ? 5 : 0) +
      (looksLikeHostParagraph(paragraph.text) ? 3 : 0) +
      (looksLikeQuestionPrompt(paragraph.text) ? 1 : 0);
    hostScores.set(paragraph.speakerKey, (hostScores.get(paragraph.speakerKey) || 0) + hostScoreBoost);
  }

  let hostKey = "";
  let hostKeyScore = 0;
  for (const key of firstSeenKeys) {
    const score = hostScores.get(key) || 0;
    if (score > hostKeyScore) {
      hostKey = key;
      hostKeyScore = score;
    }
  }

  if (!hostKey && paragraphs[0] && looksLikeHostParagraph(paragraphs[0].text)) {
    hostKey = paragraphs[0].speakerKey;
  }

  const guestLabelMap = new Map<string, string>();
  let guestIndex = 1;

  return paragraphs.map((paragraph, index) => {
    if (paragraph.speakerKey === hostKey && hostKeyScore > 0) {
      return "主持人";
    }

    const explicitSpeaker = paragraph.speakerKey;
    if (isExplicitHostSpeaker(explicitSpeaker)) {
      return "主持人";
    }

    const isUnknownSpeaker = explicitSpeaker.startsWith("__unknown");

    if (!guestLabelMap.has(explicitSpeaker) && !isUnknownSpeaker) {
      guestLabelMap.set(explicitSpeaker, `嘉宾${guestIndex}`);
      guestIndex += 1;
    }

    if (guestLabelMap.has(explicitSpeaker)) {
      return guestLabelMap.get(explicitSpeaker)!;
    }

    if (index === 0 && !hostKeyScore && looksLikeHostParagraph(paragraph.text)) {
      return "主持人";
    }

    return guestIndex <= 1 || isUnknownSpeaker ? "嘉宾" : `嘉宾${Math.max(1, guestIndex - 1)}`;
  });
}

function titleFromAudioPath(filePath: string): string {
  const basename = path.basename(filePath, path.extname(filePath));
  const normalized = basename
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || "本期节目";
}

function estimateDurationFromBytes(byteLength: number): number {
  if (!Number.isFinite(byteLength) || byteLength <= 0) return 0;
  return Math.max(60, Math.min(7200, Math.round(byteLength / 24000)));
}

function normalizeFillerCheckText(value: string): string {
  return asText(value)
    .replace(/[，。！？、,.!?\s~～…]/g, "")
    .toLowerCase();
}

function isFillerOnlyText(value: string): boolean {
  const normalized = normalizeFillerCheckText(value);
  if (!normalized) return true;
  const fillerSet = new Set([
    "嗯",
    "嗯嗯",
    "啊",
    "啊啊",
    "哦",
    "哦哦",
    "呃",
    "呃呃",
    "唉",
    "哎",
    "诶",
    "对",
    "对对",
    "是",
    "是的",
    "好的",
    "好",
    "行",
    "可以",
    "没错",
    "然后呢",
    "就是",
  ]);
  if (fillerSet.has(normalized)) return true;
  if (normalized.length <= 3 && /^([嗯啊哦呃哎诶对是好行])+$/u.test(normalized)) return true;
  return false;
}

function isLikelyLyricText(value: string): boolean {
  const raw = asText(value);
  if (!raw) return true;
  if (/[♪♫🎵]/u.test(raw)) return true;
  if (/作词|作曲|编曲|演唱|歌词|副歌|主歌|music/i.test(raw)) return true;
  const lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length >= 3) {
    const unique = new Set(lines.map((line) => line.replace(/[，。！？、,.!?\s~～…]/g, "")));
    if (unique.size <= Math.max(1, Math.floor(lines.length / 2))) return true;
  }
  return false;
}

function isMeaningfulText(value: string): boolean {
  const normalized = normalizeFillerCheckText(value);
  if (!normalized) return false;
  if (isFillerOnlyText(value)) return false;
  if (isLikelyLyricText(value)) return false;
  if (normalized.length >= 10) return true;
  return /[0-9a-z\u4e00-\u9fa5]{6,}/u.test(normalized);
}

function scoreFeaturedParagraph(text: string): number {
  const normalized = asText(text);
  if (!normalized) return -1;
  let score = 0;
  const compactLength = normalizeFillerCheckText(normalized).length;
  if (compactLength >= 40) score += 3;
  if (compactLength >= 70) score += 2;
  if (/[。！？!?]/.test(normalized)) score += 1;
  if (/关键|核心|总结|结论|建议|方法|步骤|重点|模型|原则|框架/.test(normalized)) score += 3;
  if (/就是|那个|然后|嗯|啊/.test(normalized) && compactLength < 20) score -= 2;
  return score;
}

function buildParagraphTranscriptFromTimedItems(items: TimedUtterance[], fallbackDurationSeconds = 180): TranscriptSegment[] {
  const normalizedItems = items
    .map((item) => ({
      startSec: Math.max(0, Math.floor(Number(item.startSec) || 0)),
      endSec: Math.max(0, Math.floor(Number(item.endSec) || 0)),
      text: asText(item.text),
      speakerKey: getTimedUtteranceSpeakerKey(item, Math.max(0, Math.floor(Number(item.startSec) || 0))),
    }))
    .filter((item) => !!item.text && !isFillerOnlyText(item.text) && !isLikelyLyricText(item.text))
    .sort((a, b) => a.startSec - b.startSec);
  if (!normalizedItems.length) return [];

  const minParagraphChars = 70;
  const maxParagraphChars = 180;
  const maxParagraphSentences = 4;
  const maxGapSeconds = 3;

  const paragraphs: Array<{ startSec: number; endSec: number; speakerKey: string; texts: string[] }> = [];
  let current: { startSec: number; endSec: number; speakerKey: string; texts: string[] } | null = null;

  for (const item of normalizedItems) {
    const safeEnd = item.endSec > item.startSec ? item.endSec : item.startSec + 4;
    if (!current) {
      current = { startSec: item.startSec, endSec: safeEnd, speakerKey: item.speakerKey, texts: [item.text] };
      continue;
    }
    const currentText = current.texts.join("");
    const gapSeconds = item.startSec - current.endSec;
    const shouldBreak =
      gapSeconds > maxGapSeconds ||
      currentText.length >= maxParagraphChars ||
      current.texts.length >= maxParagraphSentences ||
      (item.speakerKey !== current.speakerKey && currentText.length >= minParagraphChars);
    if (shouldBreak) {
      paragraphs.push(current);
      current = { startSec: item.startSec, endSec: safeEnd, speakerKey: item.speakerKey, texts: [item.text] };
      continue;
    }
    current.endSec = Math.max(current.endSec, safeEnd);
    current.texts.push(item.text);
  }
  if (current) paragraphs.push(current);

  const mergedParagraphs: Array<{ startSec: number; endSec: number; speakerKey: string; text: string }> = [];
  for (const paragraph of paragraphs) {
    const text = paragraph.texts.join(" ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const meaningful = isMeaningfulText(text);
    if (!meaningful && mergedParagraphs.length > 0) {
      const last = mergedParagraphs[mergedParagraphs.length - 1];
      last.endSec = Math.max(last.endSec, paragraph.endSec);
      last.text = `${last.text} ${text}`.replace(/\s+/g, " ").trim();
      continue;
    }
    mergedParagraphs.push({
      startSec: paragraph.startSec,
      endSec: paragraph.endSec,
      speakerKey: paragraph.speakerKey,
      text,
    });
  }

  // Keep full transcript by default; optionally cap via env for extreme payloads.
  const maxParagraphs = Number(process.env.AI_TRANSCRIPT_MAX_PARAGRAPHS || 0);
  const finalParagraphs =
    Number.isFinite(maxParagraphs) && maxParagraphs > 0
      ? mergedParagraphs.slice(0, Math.floor(maxParagraphs))
      : mergedParagraphs;
  const speakerLabels = resolveRoleLabels(finalParagraphs);
  const ranked = finalParagraphs
    .map((item, idx) => ({ idx, score: scoreFeaturedParagraph(item.text) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  const featuredIndexes = new Set(ranked.map((item) => item.idx));
  const transcript = finalParagraphs.map((item, idx) => ({
    time: `${formatClock(item.startSec)}-${formatClock(item.endSec)}`,
    speaker: speakerLabels[idx] || "嘉宾",
    text: item.text,
    featured: featuredIndexes.has(idx),
  }));
  if (transcript.length > 0) return transcript;

  return splitToTranscriptParagraphs(normalizedItems.map((item) => item.text).join(" "), fallbackDurationSeconds);
}

function splitToTranscriptParagraphs(text: string, durationSeconds: number): TranscriptSegment[] {
  const normalized = asText(text).replace(/\s+/g, " ");
  if (!normalized) return [];
  const pieces = normalized
    .split(/[。！？!?\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const segments = pieces.length > 0 ? pieces : [normalized];
  const filteredSegments = segments.filter((item) => !isLikelyLyricText(item));
  const effectiveSegments = filteredSegments.length > 0 ? filteredSegments : segments;
  const grouped: string[] = [];
  for (let i = 0; i < effectiveSegments.length; i += 3) {
    grouped.push(effectiveSegments.slice(i, i + 3).join("。"));
  }
  const paragraphs = grouped.length > 0 ? grouped : [normalized];
  const safeDuration = Math.max(60, durationSeconds || 120);
  const gap = Math.max(15, Math.floor(safeDuration / paragraphs.length));
  const maxParagraphs = Number(process.env.AI_TRANSCRIPT_MAX_PARAGRAPHS || 0);
  const outputParagraphs =
    Number.isFinite(maxParagraphs) && maxParagraphs > 0
      ? paragraphs.slice(0, Math.floor(maxParagraphs))
      : paragraphs;
  const ranked = outputParagraphs
    .map((item, idx) => ({ idx, score: scoreFeaturedParagraph(item) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  const featuredIndexes = new Set(ranked.map((item) => item.idx));
  return outputParagraphs.map((item, idx) => ({
    time: `${formatClock(idx * gap)}-${formatClock(Math.min(safeDuration, (idx + 1) * gap))}`,
    speaker: idx % 2 === 0 ? "主持人" : "嘉宾",
    text: item.endsWith("。") ? item : `${item}。`,
    featured: featuredIndexes.has(idx),
  }));
}

function buildHeuristicMetadata(input: {
  transcript: TranscriptSegment[];
  plainText: string;
  durationSeconds: number;
  fallbackTitle?: string;
}): ProgramAiResult {
  const fallbackTitle = asText(input.fallbackTitle) || "AI 自动解析节目";
  const firstLine = asText(input.transcript[0]?.text) || asText(input.plainText).slice(0, 40);
  const secondLine = asText(input.transcript[1]?.text) || "";
  const summaryBody = [firstLine, secondLine].filter(Boolean).join(" ");
  const quickView = normalizeQuickView([], input.transcript, input.durationSeconds);
  const minutesText = truncateByChars(
    [summaryBody, asText(input.plainText).slice(0, 800)].filter(Boolean).join("\n\n"),
    1000
  );
  const keyMoments = quickView.slice(0, 6).map((item) => ({
    time: item.timeRangeLabel,
    point: truncateByChars(item.summary, 90),
  }));
  return {
    episodeTitle: fallbackTitle,
    episodeDuration: `${Math.max(1, Math.round((input.durationSeconds || 180) / 60))} 分钟`,
    summary: {
      headline: "AI 解析摘要",
      body: summaryBody || "本期节目聚焦教育场景中的关键问题与可执行方法。",
      highlightLabel: "核心观点",
      highlightText: firstLine || "先识别问题，再拆解执行路径。",
      tags: ["播客解析", "家庭教育", "实践方法"],
    },
    termGlossary: [
      { term: "保研", definition: "通常指本科阶段通过推免方式获得研究生录取资格。", sourceUrl: "" },
      { term: "推免", definition: "推荐免试攻读研究生，不参加统一初试。", sourceUrl: "" },
      { term: "夏令营", definition: "高校面向优秀本科生组织的提前选拔活动。", sourceUrl: "" },
    ],
    guest: {
      name: "节目特邀嘉宾",
      title: "教育实践分享者",
      bio: "围绕真实教育场景分享经验与方法，帮助家长形成可执行策略。",
      avatar: "",
      profileUrl: "",
    },
    deepDive: {
      sectionTitle: "延伸阅读",
      curatedReading: [
        { title: "从问题识别到行动落地", subtitle: "教育场景方法论", url: "" },
        { title: "家庭沟通节奏设计", subtitle: "每周复盘模板", url: "" },
      ],
    },
    contentPack: {
      quickView,
      minutes: {
        text: minutesText || "本期内容围绕真实教育场景展开，重点是把讨论沉淀为可执行的家庭行动清单。",
      },
      showNotes: {
        guide: truncateByChars(summaryBody || firstLine, 220),
        guestIntro: "节目特邀嘉宾，围绕家庭教育与成长实践展开分享。",
        keyMoments,
        renderedText: "",
        templateOverride: "",
      },
    },
  };
}

function buildMetadataPrompt(input: { plainText: string }): string {
  return [
    "你是播客内容运营助手。请根据文本提取节目详情页结构化字段。",
    "只输出 JSON，不要输出任何解释。",
    "JSON 结构：",
    "{",
    '  "episodeTitle": "单集标题",',
    '  "summary": { "headline": "", "body": "", "highlightLabel": "", "highlightText": "", "tags": [""] },',
    '  "termGlossary": [{ "term": "术语", "definition": "通俗解释", "sourceUrl": "可选链接" }],',
    '  "guest": { "name": "", "title": "", "bio": "", "avatar": "", "profileUrl": "" },',
    '  "deepDive": { "sectionTitle": "", "curatedReading": [{ "title": "", "subtitle": "", "url": "" }] },',
    '  "contentPack": {',
    '    "quickView": [{ "startTime": "01:23", "endTime": "03:40", "timeRangeLabel": "01:23-03:40", "summary": "" }],',
    '    "minutes": { "text": "" },',
    '    "showNotes": {',
    '      "guide": "",',
    '      "guestIntro": "",',
    '      "keyMoments": [{ "time": "01:23-03:40", "point": "" }],',
    '      "templateOverride": ""',
    "    }",
    "  }",
    "}",
    "规则：",
    "1) 中文表达，简洁专业。",
    "2) tags 返回 2-5 个。",
    "3) 无法确定嘉宾姓名时使用“节目特邀嘉宾”。",
    "4) 术语表 termGlossary 返回 3-10 个，definition 用一句话解释，避免空值。",
    "5) quickView 生成 5-12 段，按时间递增，每段 summary 不超过 300 字。",
    "6) minutes.text 为整期纪要，不基于时间戳，控制在 1000 字以内。",
    "7) showNotes.keyMoments 使用“时间 + 要点”，要点尽量可直接转发。",
    "",
    "文本内容：",
    input.plainText.slice(0, 12000),
  ].join("\n");
}

function normalizeMetadataResult(
  parsed: any,
  input: { durationSeconds: number; transcript?: TranscriptSegment[] },
  fallbackTitle: string
): ProgramAiResult {
  const quickView = normalizeQuickView(parsed?.contentPack?.quickView, input.transcript || [], input.durationSeconds);
  const minutesText = truncateByChars(parsed?.contentPack?.minutes?.text, 1000);
  const showNotesKeyMoments = normalizeShowNotesKeyMoments(parsed?.contentPack?.showNotes?.keyMoments);
  return {
    episodeTitle: asText(parsed?.episodeTitle) || fallbackTitle,
    episodeDuration: `${Math.max(1, Math.round((input.durationSeconds || 180) / 60))} 分钟`,
    summary: {
      headline: asText(parsed?.summary?.headline),
      body: asText(parsed?.summary?.body),
      highlightLabel: asText(parsed?.summary?.highlightLabel),
      highlightText: asText(parsed?.summary?.highlightText),
      tags: Array.isArray(parsed?.summary?.tags)
        ? parsed.summary.tags.map((item: unknown) => asText(item)).filter(Boolean).slice(0, 8)
        : [],
    },
    termGlossary: Array.isArray(parsed?.termGlossary)
      ? parsed.termGlossary
          .map((item: any) => ({
            term: asText(item?.term),
            definition: asText(item?.definition),
            sourceUrl: asText(item?.sourceUrl),
          }))
          .filter((item: { term: string; definition: string }) => !!item.term && !!item.definition)
          .slice(0, 20)
      : [],
    guest: {
      name: asText(parsed?.guest?.name),
      title: asText(parsed?.guest?.title),
      bio: asText(parsed?.guest?.bio),
      avatar: asText(parsed?.guest?.avatar),
      profileUrl: asText(parsed?.guest?.profileUrl),
    },
    deepDive: {
      sectionTitle: asText(parsed?.deepDive?.sectionTitle),
      curatedReading: Array.isArray(parsed?.deepDive?.curatedReading)
        ? parsed.deepDive.curatedReading
            .map((item: any) => ({
              title: asText(item?.title),
              subtitle: asText(item?.subtitle),
              url: asText(item?.url),
            }))
            .filter((item: { title: string }) => !!item.title)
        : [],
    },
    contentPack: {
      quickView,
      minutes: {
        text: minutesText,
      },
      showNotes: {
        guide: truncateByChars(parsed?.contentPack?.showNotes?.guide, 260),
        guestIntro: truncateByChars(parsed?.contentPack?.showNotes?.guestIntro, 260),
        keyMoments: showNotesKeyMoments,
        renderedText: "",
        templateOverride: asText(parsed?.contentPack?.showNotes?.templateOverride),
      },
    },
  };
}

function resolveDeepSeekMetadataConfig(): MetadataLlmConfig | null {
  const apiKey = asText(process.env.DEEPSEEK_API_KEY);
  const modelId = asText(process.env.DEEPSEEK_MODEL_ID) || "jiahewanshi";
  const baseUrl = asText(process.env.DEEPSEEK_BASE_URL) || "https://api.deepseek.com";
  if (!apiKey || !modelId) return null;
  return { apiKey, modelId, baseUrl, providerName: "DeepSeek" };
}

function resolveArkMetadataConfig(): MetadataLlmConfig | null {
  const apiKey = asText(process.env.ARK_API_KEY);
  const modelId = asText(process.env.ARK_MODEL_ID) || asText(process.env.VOLCENGINE_ARK_ENDPOINT_ID);
  const baseUrl = asText(process.env.ARK_BASE_URL) || "https://ark.cn-beijing.volces.com/api/v3";
  if (!apiKey || !modelId) return null;
  return { apiKey, modelId, baseUrl, providerName: "Ark" };
}

async function extractMetadataWithOpenAiCompatibleProvider(
  input: { transcript: TranscriptSegment[]; plainText: string; durationSeconds: number },
  fallbackTitle: string,
  config: MetadataLlmConfig | null
): Promise<ProgramAiResult | null> {
  if (!config) return null;
  const prompt = buildMetadataPrompt(input);

  try {
    const endpoint = config.baseUrl.replace(/\/$/, "") + "/chat/completions";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelId,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `你是教育播客内容运营助手，通过 ${config.providerName} 只输出 JSON。` },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) {
      return null;
    }
    const json: any = await response.json().catch(() => ({}));
    const content = asText(json?.choices?.[0]?.message?.content);
    if (!content) return null;
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch (_error) {
      return null;
    }
    return normalizeMetadataResult(parsed, input, fallbackTitle);
  } catch (_error) {
    return null;
  }
}

async function extractMetadataWithDeepSeek(
  input: { transcript: TranscriptSegment[]; plainText: string; durationSeconds: number },
  fallbackTitle: string
): Promise<ProgramAiResult | null> {
  return extractMetadataWithOpenAiCompatibleProvider(input, fallbackTitle, resolveDeepSeekMetadataConfig());
}

async function extractMetadataWithArk(
  input: { transcript: TranscriptSegment[]; plainText: string; durationSeconds: number },
  fallbackTitle: string
): Promise<ProgramAiResult | null> {
  return extractMetadataWithOpenAiCompatibleProvider(input, fallbackTitle, resolveArkMetadataConfig());
}

async function extractMetadataWithPreferredTextProvider(
  input: { transcript: TranscriptSegment[]; plainText: string; durationSeconds: number },
  fallbackTitle: string
): Promise<ProgramAiResult | null> {
  const deepSeekResult = await extractMetadataWithDeepSeek(input, fallbackTitle);
  if (deepSeekResult) return deepSeekResult;
  return extractMetadataWithArk(input, fallbackTitle);
}

class OpenAIProgramAiProvider implements ProgramAiProvider {
  private readonly apiKey: string;
  private readonly transcribeModel: string;

  constructor() {
    this.apiKey = asText(process.env.OPENAI_API_KEY);
    this.transcribeModel = asText(process.env.AI_TRANSCRIBE_MODEL) || "gpt-4o-mini-transcribe";
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async transcribeAudio(filePath: string): Promise<{ transcript: TranscriptSegment[]; plainText: string; durationSeconds: number }> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY 未配置");
    }
    const bytes = await fs.readFile(filePath);
    const blob = new Blob([bytes], { type: "audio/mpeg" });
    const form = new FormData();
    form.append("file", blob, path.basename(filePath));
    form.append("model", this.transcribeModel);
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: this.headers(),
      body: form,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`音频转写失败: ${text}`);
    }
    const json: any = await response.json();
    const segments = Array.isArray(json?.segments) ? json.segments : [];
    const transcript = buildParagraphTranscriptFromTimedItems(
      segments.map((segment: any, idx: number) => {
        const start = Number(segment?.start);
        const end = Number(segment?.end);
        const safeStart = Number.isFinite(start) ? start : idx * 8;
        const safeEnd = Number.isFinite(end) ? end : safeStart + 8;
        return {
          startSec: Math.max(0, Math.floor(safeStart)),
          endSec: Math.max(Math.floor(safeStart) + 1, Math.floor(safeEnd)),
          text: asText(segment?.text),
          speaker: asText(segment?.speaker) || asText(segment?.speaker_id) || "",
        };
      }),
      Number(json?.duration) || 0
    );
    const plainText = asText(json?.text) || transcript.map((item) => item.text).join("\n");
    const durationSeconds = Number(json?.duration) || 0;
    return { transcript, plainText, durationSeconds };
  }

  async extractProgramMetadata(input: { transcript: TranscriptSegment[]; plainText: string; durationSeconds: number }): Promise<ProgramAiResult> {
    const generated = await extractMetadataWithPreferredTextProvider(input, "AI 自动生成：家校协同实践");
    if (generated) return generated;
    return buildHeuristicMetadata({
      ...input,
      fallbackTitle: "AI 自动生成：家校协同实践",
    });
  }
}

class VolcengineProgramAiProvider implements ProgramAiProvider {
  private readonly appId: string;
  private readonly accessToken: string;
  private readonly apiKey: string;
  private readonly resourceIds: string[];
  private readonly mode: string;
  private readonly publicBaseUrl: string;

  constructor() {
    this.appId = asText(process.env.VOLCENGINE_APP_ID);
    this.accessToken = asText(process.env.VOLCENGINE_ACCESS_TOKEN);
    this.apiKey = asText(process.env.VOLCENGINE_API_KEY);
    const envIds = asText(process.env.VOLCENGINE_RESOURCE_ID);
    const parsedIds = (envIds ? envIds.split(",") : ["volc.bigasr.auc_turbo", "volc.bigasr.auc"])
      .map((item) => asText(item))
      .filter(Boolean);
    this.resourceIds = parsedIds.length > 0 ? parsedIds : ["volc.bigasr.auc_turbo", "volc.bigasr.auc"];
    this.mode = asText(process.env.VOLCENGINE_MODE) || "auto";
    this.publicBaseUrl = asText(process.env.VOLCENGINE_PUBLIC_BASE_URL) || asText(process.env.PUBLIC_BASE_URL);
  }

  private detectFormat(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase().replace(".", "");
    if (!ext) return "wav";
    if (["wav", "mp3", "ogg", "opus", "m4a"].includes(ext)) return ext;
    return "wav";
  }

  private buildHeaders(requestId: string, resourceId: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Api-Resource-Id": resourceId,
      "X-Api-Request-Id": requestId,
      "X-Api-Sequence": "-1",
    };
    if (this.apiKey) {
      headers["X-Api-Key"] = this.apiKey;
      return headers;
    }
    if (!this.appId || !this.accessToken) {
      throw new Error("VOLCENGINE_API_KEY 或 VOLCENGINE_APP_ID + VOLCENGINE_ACCESS_TOKEN 未配置");
    }
    headers["X-Api-App-Key"] = this.appId;
    headers["X-Api-Access-Key"] = this.accessToken;
    return headers;
  }

  private shouldUseStandard(resourceId: string): boolean {
    return shouldUseVolcengineStandardEndpoint(resourceId, this.mode);
  }

  private isLocalUrl(url: string): boolean {
    return isLocalSourceUrl(url);
  }

  private toPublicSourceUrl(sourceUrl: string): string {
    return normalizeVolcenginePublicSourceUrl(sourceUrl, this.publicBaseUrl);
  }

  private isPayloadTooLarge(response: Response, message: string): boolean {
    const normalized = message.toLowerCase();
    return response.status === 413 || normalized.includes("payload too large") || normalized.includes("request entity too large");
  }

  private normalizeUtterances(utterances: any[]): TranscriptSegment[] {
    return buildParagraphTranscriptFromTimedItems(
      utterances.map((item: any, idx: number) => {
        const startMs = Number(item?.start_time) || idx * 1000;
        const endMs = Number(item?.end_time) || (startMs + 8000);
        return {
          startSec: Math.max(0, Math.floor(startMs / 1000)),
          endSec: Math.max(Math.floor(startMs / 1000) + 1, Math.floor(endMs / 1000)),
          speaker:
            asText(item?.speaker) ||
            asText(item?.speaker_id) ||
            asText(item?.spk) ||
            asText(item?.speaker_label) ||
            "",
          text: asText(item?.text),
        };
      })
    );
  }

  private async transcribeByStandard(sourceUrl: string, resourceId: string): Promise<{ transcript: TranscriptSegment[]; plainText: string; durationSeconds: number }> {
    if (this.isLocalUrl(sourceUrl)) {
      throw new Error("火山标准版需要公网可访问音频 URL；当前是本地地址 localhost/127.0.0.1");
    }
    const requestId = randomUUID();
    const headers = this.buildHeaders(requestId, resourceId);
    const submitResp = await fetchVolcengine("https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit", {
      method: "POST",
      headers,
      body: JSON.stringify({
        user: { uid: this.appId || "podcast-admin" },
        audio: { url: sourceUrl },
        request: {
          model_name: "bigmodel",
          show_utterances: true,
          enable_punc: true,
        },
      }),
    });
    const submitJson: any = await submitResp.json().catch(() => ({}));
    const submitCode = asText((submitResp.headers.get("X-Api-Status-Code") || submitJson?.code || "").toString());
    if (!submitResp.ok || (submitCode && submitCode !== "20000000")) {
      const msg = asText(submitResp.headers.get("X-Api-Message")) || asText(submitJson?.message) || asText(submitJson?.msg) || `HTTP ${submitResp.status}`;
      throw new Error(`[resource_id=${resourceId}] 标准版提交失败: ${msg}`);
    }

    let lastJson: any = {};
    const deadlineAt = Date.now() + Math.max(getVolcengineFetchTimeoutMs(), 60000);
    for (let i = 0; Date.now() < deadlineAt; i += 1) {
      const queryResp = await fetchVolcengine("https://openspeech.bytedance.com/api/v3/auc/bigmodel/query", {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      const queryJson: any = await queryResp.json().catch(() => ({}));
      lastJson = queryJson;
      const queryCode = asText((queryResp.headers.get("X-Api-Status-Code") || queryJson?.code || "").toString());
      if (shouldContinueVolcengineStandardPolling(queryCode)) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      if (!queryResp.ok || (queryCode && queryCode !== "20000000")) {
        const msg = asText(queryResp.headers.get("X-Api-Message")) || asText(queryJson?.message) || asText(queryJson?.msg) || `HTTP ${queryResp.status}`;
        throw new Error(`[resource_id=${resourceId}] 标准版查询失败: ${msg}`);
      }
      const status = Number(queryJson?.result?.status_code ?? queryJson?.result?.status);
      if (status === 1 || status === 2 || status === 2000) break;
      if (status === 0 || status === 1000 || Number.isNaN(status)) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      const msg = asText(queryJson?.result?.status_text) || "状态异常";
      throw new Error(`[resource_id=${resourceId}] 标准版任务失败: ${msg}`);
    }
    const utterances = Array.isArray(lastJson?.result?.utterances) ? lastJson.result.utterances : [];
    const transcript = this.normalizeUtterances(utterances);
    const plainText = asText(lastJson?.result?.text) || transcript.map((item) => item.text).join(" ");
    const durationMs = Number(lastJson?.audio_info?.duration) || Number(lastJson?.result?.additions?.duration) || 0;
    const durationSeconds = durationMs > 1000 ? Math.round(durationMs / 1000) : 0;
    if (!plainText && transcript.length === 0) {
      throw new Error(`[resource_id=${resourceId}] 标准版返回空转写结果，请检查音频 URL 是否公网可访问: ${sourceUrl}`);
    }
    return { transcript: transcript.length ? transcript : splitToTranscriptParagraphs(plainText, durationSeconds || 180), plainText, durationSeconds: durationSeconds || 180 };
  }

  async transcribeAudio(filePath: string, options?: { sourceUrl?: string }): Promise<{ transcript: TranscriptSegment[]; plainText: string; durationSeconds: number }> {
    const bytes = await fs.readFile(filePath);
    const sourceUrl = this.toPublicSourceUrl(asText(options?.sourceUrl));
    const isLocalSourceUrl = this.isLocalUrl(sourceUrl);
    const maxFlashLocalBytes = getVolcengineFlashMaxLocalBytes();
    if (isLocalSourceUrl && bytes.length > maxFlashLocalBytes) {
      throw new Error(
        `火山请求超时风险：本地音频 ${Math.round(bytes.length / 1024 / 1024)}MB 超过 flash 直传建议上限 ${Math.round(maxFlashLocalBytes / 1024 / 1024)}MB；请配置 VOLCENGINE_PUBLIC_BASE_URL 使用公网 URL 转写，或上传更小音频`
      );
    }
    const payload = {
      user: { uid: this.appId || "podcast-admin" },
      audio: {
        format: this.detectFormat(filePath),
        data: bytes.toString("base64"),
      },
      request: {
        model_name: "bigmodel",
        show_utterances: true,
        enable_punc: true,
      },
    };
    let json: any = {};
    let lastErrorMessage = "";
    for (const resourceId of this.resourceIds) {
      if (this.shouldUseStandard(resourceId) && !isLocalSourceUrl) {
        try {
          return await this.transcribeByStandard(sourceUrl, resourceId);
        } catch (error: any) {
          lastErrorMessage = asText(error?.message);
          continue;
        }
      }
      if (!shouldAttemptVolcengineFlashEndpoint(resourceId, this.mode)) {
        if (!lastErrorMessage) {
          lastErrorMessage = `[resource_id=${resourceId}] 标准版需要公网可访问音频 URL；请配置 VOLCENGINE_PUBLIC_BASE_URL 为公网域名`;
        }
        continue;
      }
      let shouldTryNextResource = false;
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const requestId = randomUUID();
        const response = await fetchVolcengine("https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash", {
          method: "POST",
          headers: this.buildHeaders(requestId, resourceId),
          body: JSON.stringify(payload),
        });
        json = await response.json().catch(() => ({}));
        const statusCode = asText((response.headers.get("X-Api-Status-Code") || json?.code || "").toString());
        if (response.ok && (!statusCode || statusCode === "20000000")) {
          lastErrorMessage = "";
          shouldTryNextResource = false;
          break;
        }
        const message = asText(response.headers.get("X-Api-Message")) || asText(json?.message) || asText(json?.msg) || `HTTP ${response.status}`;
        lastErrorMessage = `[resource_id=${resourceId}] ${message}`;
        const lowerMessage = message.toLowerCase();
        const isPermissionIssue = lowerMessage.includes("not granted");
        const isPayloadTooLarge = this.isPayloadTooLarge(response, message);
        if (isPayloadTooLarge && !isLocalSourceUrl) {
          try {
            return await this.transcribeByStandard(sourceUrl, resourceId);
          } catch (error: any) {
            lastErrorMessage = `[resource_id=${resourceId}] flash 请求体过大，标准版 fallback 失败: ${asText(error?.message) || message}`;
          }
        } else if (isPayloadTooLarge && isLocalSourceUrl) {
          lastErrorMessage = `[resource_id=${resourceId}] flash 请求体过大（HTTP 413）；请配置 VOLCENGINE_PUBLIC_BASE_URL 为公网域名以启用标准版 URL 转写`;
        }
        const isTransientGatewayIssue =
          response.status >= 500 ||
          lowerMessage.includes("timeout") ||
          lowerMessage.includes("timed out") ||
          lowerMessage.includes("gateway") ||
          lowerMessage.includes("bad gateway") ||
          lowerMessage.includes("upstream");
        if (isTransientGatewayIssue && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
          continue;
        }
        shouldTryNextResource = isPermissionIssue || isTransientGatewayIssue || isPayloadTooLarge;
        break;
      }
      if (!lastErrorMessage) {
        break;
      }
      if (!shouldTryNextResource) {
        break;
      }
    }
    if (lastErrorMessage) {
      if (asText(process.env.OPENAI_API_KEY)) {
        try {
          const openAiFallback = new OpenAIProgramAiProvider();
          return await openAiFallback.transcribeAudio(filePath);
        } catch (_fallbackError) {
          // ignore fallback errors and return original volcengine error for clearer diagnosis
        }
      }
      throw new Error(`火山语音转写失败: ${lastErrorMessage}`);
    }
    const utterances = Array.isArray(json?.result?.utterances) ? json.result.utterances : [];
    const transcript = buildParagraphTranscriptFromTimedItems(
      utterances.map((item: any, idx: number) => {
        const startMs = Number(item?.start_time) || idx * 1000;
        const endMs = Number(item?.end_time) || (startMs + 8000);
        return {
          startSec: Math.max(0, Math.floor(startMs / 1000)),
          endSec: Math.max(Math.floor(startMs / 1000) + 1, Math.floor(endMs / 1000)),
          speaker:
            asText(item?.speaker) ||
            asText(item?.speaker_id) ||
            asText(item?.spk) ||
            asText(item?.speaker_label) ||
            "",
          text: asText(item?.text),
        };
      }),
      estimateDurationFromBytes(bytes.length)
    );
    const plainText = asText(json?.result?.text) || transcript.map((item: TranscriptSegment) => item.text).join(" ");
    const durationMs = Number(json?.audio_info?.duration) || Number(json?.result?.additions?.duration) || 0;
    const durationSeconds = durationMs > 1000 ? Math.round(durationMs / 1000) : estimateDurationFromBytes(bytes.length);
    if (!plainText && transcript.length === 0) {
      throw new Error("火山语音转写失败: flash 返回空转写结果，请检查资源 ID、鉴权配置和音频格式");
    }
    return { transcript: transcript.length ? transcript : splitToTranscriptParagraphs(plainText, durationSeconds), plainText, durationSeconds };
  }

  async extractProgramMetadata(input: {
    transcript: TranscriptSegment[];
    plainText: string;
    durationSeconds: number;
  }): Promise<ProgramAiResult> {
    const generated = await extractMetadataWithPreferredTextProvider(input, "火山语音解析节目");
    if (generated) return generated;
    return buildHeuristicMetadata({
      ...input,
      fallbackTitle: "火山语音解析节目",
    });
  }
}

class MockProgramAiProvider implements ProgramAiProvider {
  async transcribeAudio(filePath: string): Promise<{ transcript: TranscriptSegment[]; plainText: string; durationSeconds: number }> {
    const stats = await fs.stat(filePath);
    const inferredDuration = Math.max(180, Math.min(3600, Math.round(stats.size / 24000)));
    const topic = titleFromAudioPath(filePath);
    const transcript: TranscriptSegment[] = [
      { time: "00:00-00:55", speaker: "主持人", text: `欢迎来到《${topic}》。今天我们聚焦家校协同中的关键挑战，先厘清为什么很多家庭在执行层面容易失速。`, featured: true },
      { time: "00:55-01:45", speaker: "嘉宾", text: "很多家庭的问题不在于方法缺失，而在于执行节奏和沟通顺序。要先建立最小可执行动作，再逐步迭代，而不是一开始就追求全面覆盖。", featured: true },
      { time: "01:45-02:40", speaker: "主持人", text: "那我们先从一个最容易落地的观察动作开始，帮助家长建立反馈闭环。通过固定时间复盘，把行为变化与情绪反馈放到同一张记录表里。", featured: false },
      { time: "02:40-03:30", speaker: "嘉宾", text: "建议每周固定一次复盘，把具体行为与情绪体验都记录下来。连续三周后再判断策略效果，这样更容易看到稳定改善。", featured: false },
    ];
    return {
      transcript,
      plainText: transcript.map((item) => `${item.speaker}：${item.text}`).join("\n"),
      durationSeconds: inferredDuration,
    };
  }

  async extractProgramMetadata(input: { transcript: TranscriptSegment[]; plainText: string; durationSeconds: number }): Promise<ProgramAiResult> {
    const generated = await extractMetadataWithPreferredTextProvider(input, "AI 自动生成：家校协同实践");
    if (generated) return generated;
    return buildHeuristicMetadata({
      ...input,
      fallbackTitle: "AI 自动生成：家校协同实践",
    });
  }
}

export function resolveProgramAiProvider(): ProgramAiProvider {
  const provider = asText(process.env.AI_PROVIDER) || "openai";
  const isProduction = asText(process.env.NODE_ENV).toLowerCase() === "production";
  if (provider === "mock" && isProduction) {
    throw new Error("生产环境禁止使用 AI_PROVIDER=mock，请改为 volcengine 或 openai");
  }
  if (provider === "openai") {
    return new OpenAIProgramAiProvider();
  }
  if (provider === "mock") {
    return new MockProgramAiProvider();
  }
  if (provider === "volcengine" || provider === "volc") {
    return new VolcengineProgramAiProvider();
  }
  throw new Error(`不支持的 AI_PROVIDER: ${provider}`);
}
