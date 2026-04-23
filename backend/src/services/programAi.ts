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
};

export type ProgramAiProvider = {
  transcribeAudio(
    filePath: string,
    options?: { sourceUrl?: string }
  ): Promise<{ transcript: TranscriptSegment[]; plainText: string; durationSeconds: number }>;
  extractProgramMetadata(input: { transcript: TranscriptSegment[]; plainText: string; durationSeconds: number }): Promise<ProgramAiResult>;
};

type ArkMetadataConfig = {
  apiKey: string;
  modelId: string;
  baseUrl: string;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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

function isMeaningfulText(value: string): boolean {
  const normalized = normalizeFillerCheckText(value);
  if (!normalized) return false;
  if (isFillerOnlyText(value)) return false;
  if (normalized.length >= 10) return true;
  return /[0-9a-z\u4e00-\u9fa5]{6,}/u.test(normalized);
}

function buildParagraphTranscriptFromTimedItems(items: TimedUtterance[], fallbackDurationSeconds = 180): TranscriptSegment[] {
  const normalizedItems = items
    .map((item) => ({
      startSec: Math.max(0, Math.floor(Number(item.startSec) || 0)),
      endSec: Math.max(0, Math.floor(Number(item.endSec) || 0)),
      text: asText(item.text),
      speakerKey: getTimedUtteranceSpeakerKey(item, Math.max(0, Math.floor(Number(item.startSec) || 0))),
    }))
    .filter((item) => !!item.text && !isFillerOnlyText(item.text))
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

  const finalParagraphs = mergedParagraphs.slice(0, 18);
  const speakerLabels = resolveRoleLabels(finalParagraphs);
  const transcript = finalParagraphs.map((item, idx) => ({
    time: `${formatClock(item.startSec)}-${formatClock(item.endSec)}`,
    speaker: speakerLabels[idx] || "嘉宾",
    text: item.text,
    featured: idx < 2,
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
  const grouped: string[] = [];
  for (let i = 0; i < segments.length; i += 3) {
    grouped.push(segments.slice(i, i + 3).join("。"));
  }
  const paragraphs = grouped.length > 0 ? grouped : [normalized];
  const safeDuration = Math.max(60, durationSeconds || 120);
  const gap = Math.max(15, Math.floor(safeDuration / paragraphs.length));
  return paragraphs.slice(0, 18).map((item, idx) => ({
    time: `${formatClock(idx * gap)}-${formatClock(Math.min(safeDuration, (idx + 1) * gap))}`,
    speaker: idx % 2 === 0 ? "主持人" : "嘉宾",
    text: item.endsWith("。") ? item : `${item}。`,
    featured: idx < 2,
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
  };
}

function resolveArkMetadataConfig(): ArkMetadataConfig | null {
  const apiKey = asText(process.env.ARK_API_KEY);
  const modelId = asText(process.env.ARK_MODEL_ID) || asText(process.env.VOLCENGINE_ARK_ENDPOINT_ID);
  const baseUrl = asText(process.env.ARK_BASE_URL) || "https://ark.cn-beijing.volces.com/api/v3";
  if (!apiKey || !modelId) return null;
  return { apiKey, modelId, baseUrl };
}

async function extractMetadataWithArk(
  input: { transcript: TranscriptSegment[]; plainText: string; durationSeconds: number },
  fallbackTitle: string
): Promise<ProgramAiResult | null> {
  const config = resolveArkMetadataConfig();
  if (!config) return null;
  const prompt = [
    "你是播客内容运营助手。请根据文本提取节目详情页结构化字段。",
    "只输出 JSON，不要输出任何解释。",
    "JSON 结构：",
    "{",
    '  "episodeTitle": "单集标题",',
    '  "summary": { "headline": "", "body": "", "highlightLabel": "", "highlightText": "", "tags": [""] },',
    '  "termGlossary": [{ "term": "术语", "definition": "通俗解释", "sourceUrl": "可选链接" }],',
    '  "guest": { "name": "", "title": "", "bio": "", "avatar": "", "profileUrl": "" },',
    '  "deepDive": { "sectionTitle": "", "curatedReading": [{ "title": "", "subtitle": "", "url": "" }] }',
    "}",
    "规则：",
    "1) 中文表达，简洁专业。",
    "2) tags 返回 2-5 个。",
    "3) 无法确定嘉宾姓名时使用“节目特邀嘉宾”。",
    "4) 术语表 termGlossary 返回 3-10 个，definition 用一句话解释，避免空值。",
    "",
    "文本内容：",
    input.plainText.slice(0, 12000),
  ].join("\n");

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
          { role: "system", content: "你是教育播客内容运营助手，只输出 JSON。" },
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
    };
  } catch (_error) {
    return null;
  }
}

class OpenAIProgramAiProvider implements ProgramAiProvider {
  private readonly apiKey: string;
  private readonly transcribeModel: string;
  private readonly textModel: string;

  constructor() {
    this.apiKey = asText(process.env.OPENAI_API_KEY);
    this.transcribeModel = asText(process.env.AI_TRANSCRIBE_MODEL) || "gpt-4o-mini-transcribe";
    this.textModel = asText(process.env.AI_TEXT_MODEL) || "gpt-4o-mini";
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
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY 未配置");
    }
    const prompt = [
      "请基于以下播客逐字稿内容，输出用于内容发布的结构化 JSON。",
      "只返回合法 JSON，不要输出其它文本。",
      "JSON 结构：",
      "{",
      '  "episodeTitle": "单集标题",',
      '  "summary": { "headline": "", "body": "", "highlightLabel": "", "highlightText": "", "tags": [""] },',
      '  "termGlossary": [{ "term": "术语", "definition": "通俗解释", "sourceUrl": "可选链接" }],',
      '  "guest": { "name": "", "title": "", "bio": "", "avatar": "", "profileUrl": "" },',
      '  "deepDive": { "sectionTitle": "", "curatedReading": [{ "title": "", "subtitle": "", "url": "" }] }',
      "}",
      "字段要求：",
      "1) 保持中文表达；2) tags 控制在 2-5 个；3) 若无法判断嘉宾姓名可使用“节目特邀嘉宾”；4) termGlossary 给出 3-10 个术语及一句话解释。",
      "",
      "逐字稿：",
      input.plainText.slice(0, 12000),
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.textModel,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你是教育播客内容运营助手，只输出 JSON。" },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`元信息提取失败: ${text}`);
    }
    const json: any = await response.json();
    const content = asText(json?.choices?.[0]?.message?.content);
    if (!content) {
      return {};
    }
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch (_error) {
      return {};
    }

    return {
      episodeTitle: asText(parsed?.episodeTitle),
      episodeDuration: input.durationSeconds > 0 ? `${Math.max(1, Math.round(input.durationSeconds / 60))} 分钟` : "",
      summary: {
        headline: asText(parsed?.summary?.headline),
        body: asText(parsed?.summary?.body),
        highlightLabel: asText(parsed?.summary?.highlightLabel),
        highlightText: asText(parsed?.summary?.highlightText),
        tags: Array.isArray(parsed?.summary?.tags)
          ? parsed.summary.tags
              .map((item: unknown) => asText(item))
              .filter((item: string) => !!item)
              .slice(0, 8)
          : [],
      },
      termGlossary: Array.isArray(parsed?.termGlossary)
        ? parsed.termGlossary
            .map((item: any) => ({
              term: asText(item?.term),
              definition: asText(item?.definition),
              sourceUrl: asText(item?.sourceUrl),
            }))
            .filter((item: { term: string; definition: string }) => item.term && item.definition)
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
              .filter((item: { title: string }) => item.title)
          : [],
      },
    };
  }
}

class VolcengineProgramAiProvider implements ProgramAiProvider {
  private readonly appId: string;
  private readonly accessToken: string;
  private readonly apiKey: string;
  private readonly resourceIds: string[];
  private readonly mode: string;

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
    if (this.mode === "standard") return true;
    if (this.mode === "flash") return false;
    return /^Speech_Recognition_Seed_/i.test(resourceId);
  }

  private isLocalUrl(url: string): boolean {
    if (!url) return true;
    try {
      const u = new URL(url);
      return ["localhost", "127.0.0.1", "0.0.0.0"].includes(u.hostname);
    } catch (_error) {
      return true;
    }
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
    const submitResp = await fetch("https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit", {
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
    for (let i = 0; i < 30; i += 1) {
      const queryResp = await fetch("https://openspeech.bytedance.com/api/v3/auc/bigmodel/query", {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      const queryJson: any = await queryResp.json().catch(() => ({}));
      lastJson = queryJson;
      const queryCode = asText((queryResp.headers.get("X-Api-Status-Code") || queryJson?.code || "").toString());
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
    return { transcript: transcript.length ? transcript : splitToTranscriptParagraphs(plainText, durationSeconds || 180), plainText, durationSeconds: durationSeconds || 180 };
  }

  async transcribeAudio(filePath: string, options?: { sourceUrl?: string }): Promise<{ transcript: TranscriptSegment[]; plainText: string; durationSeconds: number }> {
    const bytes = await fs.readFile(filePath);
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
      if (this.shouldUseStandard(resourceId)) {
        try {
          return await this.transcribeByStandard(asText(options?.sourceUrl), resourceId);
        } catch (error: any) {
          lastErrorMessage = asText(error?.message);
          continue;
        }
      }
      const requestId = randomUUID();
      const response = await fetch("https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash", {
        method: "POST",
        headers: this.buildHeaders(requestId, resourceId),
        body: JSON.stringify(payload),
      });
      json = await response.json().catch(() => ({}));
      const statusCode = asText((response.headers.get("X-Api-Status-Code") || json?.code || "").toString());
      if (response.ok && (!statusCode || statusCode === "20000000")) {
        lastErrorMessage = "";
        break;
      }
      const message = asText(response.headers.get("X-Api-Message")) || asText(json?.message) || asText(json?.msg) || `HTTP ${response.status}`;
      lastErrorMessage = `[resource_id=${resourceId}] ${message}`;
      if (!message.toLowerCase().includes("not granted")) {
        break;
      }
    }
    if (lastErrorMessage) {
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
    return { transcript: transcript.length ? transcript : splitToTranscriptParagraphs(plainText, durationSeconds), plainText, durationSeconds };
  }

  async extractProgramMetadata(input: {
    transcript: TranscriptSegment[];
    plainText: string;
    durationSeconds: number;
  }): Promise<ProgramAiResult> {
    const arkResult = await extractMetadataWithArk(input, "火山语音解析节目");
    if (arkResult) {
      return arkResult;
    }
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
    const arkResult = await extractMetadataWithArk(input, "AI 自动生成：家校协同实践");
    if (arkResult) {
      return arkResult;
    }
    return buildHeuristicMetadata({
      ...input,
      fallbackTitle: "AI 自动生成：家校协同实践",
    });
  }
}

export function resolveProgramAiProvider(): ProgramAiProvider {
  const provider = asText(process.env.AI_PROVIDER) || "openai";
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
