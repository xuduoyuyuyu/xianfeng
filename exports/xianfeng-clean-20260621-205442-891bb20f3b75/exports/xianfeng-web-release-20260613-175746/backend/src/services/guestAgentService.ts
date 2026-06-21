import mongoose from "mongoose";
import GuestModel from "../models/Guest";
import Program from "../models/Program";
import GuestAgentChunkModel, { GuestAgentSourceType } from "../models/GuestAgentChunk";
import GuestAgentConversationModel from "../models/GuestAgentConversation";
import KnowledgeSourceModel from "../models/KnowledgeSource";
import { ensureStore, resolveAgentModelConfig } from "./agentModelRegistry";
import {
  WeknoraGuestDocument,
  WeknoraSearchHit,
  isWeknoraEnabled,
  searchGuestKnowledge,
  syncGuestKnowledgeDocuments,
} from "./weknoraClient";

export type GuestAgentChunkInput = {
  _id?: string;
  guestId?: string;
  sourceType: GuestAgentSourceType;
  sourceId: string;
  sourceTitle: string;
  locator: string;
  text: string;
  keywords: string[];
  weight: number;
  url?: string;
};

export type GuestAgentCitation = {
  chunkId: string;
  sourceType: GuestAgentSourceType;
  sourceId: string;
  sourceTitle: string;
  locator: string;
  text: string;
  url?: string;
};

export type GuestAgentRetrievalProvider = "local" | "weknora";

export type GuestAgentRetrievalResult = {
  provider: GuestAgentRetrievalProvider;
  citations: GuestAgentCitation[];
  syncStatus?: string;
};

type GuestAgentDocsInput = {
  guest: any;
  programs: any[];
};

type GuestKnowledgeSourceInput = {
  _id?: string;
  title?: string;
  sourceKind?: string;
  summary?: string;
  rawText?: string;
  fileUrl?: string;
  status?: string;
  parseStatus?: string;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function compactText(parts: unknown[]): string {
  return parts.map(asText).filter(Boolean).join("\n").replace(/\s+/g, " ").trim();
}

function truncate(value: string, max = 900): string {
  const text = asText(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function splitLongText(value: string, max = 900): string[] {
  const text = asText(value);
  if (!text) return [];
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += max) {
    const chunk = text.slice(i, i + max).trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

function tokenize(value: string): string[] {
  const normalized = asText(value).toLowerCase();
  const latin: string[] = normalized.match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? [];
  const cjk: string[] = normalized.match(/[\u4e00-\u9fa5]{2,}/g) ?? [];
  const cjkPairs: string[] = [];
  cjk.forEach((word) => {
    if (word.length <= 6) {
      cjkPairs.push(word);
      return;
    }
    for (let i = 0; i < word.length - 1; i += 1) cjkPairs.push(word.slice(i, i + 2));
  });
  return Array.from(new Set([...latin, ...cjk, ...cjkPairs].filter((item) => item.length >= 2))).slice(0, 40);
}

function makeChunk(input: Omit<GuestAgentChunkInput, "keywords"> & { keywords?: string[] }): GuestAgentChunkInput | null {
  const text = truncate(input.text);
  if (!text || text.length < 8) return null;
  const keywords = Array.from(new Set([...(input.keywords || []), ...tokenize(`${input.sourceTitle} ${input.locator} ${text}`)])).slice(0, 50);
  return { ...input, text, keywords };
}

function pushChunk(chunks: GuestAgentChunkInput[], input: Omit<GuestAgentChunkInput, "keywords"> & { keywords?: string[] }) {
  const chunk = makeChunk(input);
  if (chunk) chunks.push(chunk);
}

function flattenMindMap(node: any, depth = 0): string[] {
  if (!node || typeof node !== "object" || depth > 4) return [];
  const self = compactText([node.title, node.summary]);
  const children = Array.isArray(node.children) ? node.children.flatMap((child: any) => flattenMindMap(child, depth + 1)) : [];
  return [self, ...children].filter(Boolean);
}

export function buildGuestAgentChunksFromDocs(input: GuestAgentDocsInput): GuestAgentChunkInput[] {
  const guest = input.guest || {};
  const guestId = String(guest._id || "");
  const guestName = asText(guest.name) || "嘉宾";
  const chunks: GuestAgentChunkInput[] = [];
  const guestKeywords = [
    ...((Array.isArray(guest.mainAreas) ? guest.mainAreas : []) as string[]),
    ...((Array.isArray(guest.keywords) ? guest.keywords : []) as string[]),
    asText(guest.name),
    asText(guest.title),
  ].filter(Boolean);

  pushChunk(chunks, {
    guestId,
    sourceType: "guest_profile",
    sourceId: guestId,
    sourceTitle: `${guestName} 嘉宾档案`,
    locator: "嘉宾档案",
    text: compactText([guest.name, guest.title, guest.bio, guest.profileMarkdown, guestKeywords.join(" / ")]),
    keywords: guestKeywords,
    weight: 2.2,
  });

  const references = Array.isArray(guest.profileReferences) ? guest.profileReferences : [];
  references.forEach((item: any, index: number) => {
    pushChunk(chunks, {
      guestId,
      sourceType: "public_material",
      sourceId: asText(item.url) || `${guestId}:reference:${index}`,
      sourceTitle: asText(item.title) || `${guestName} 公开资料`,
      locator: "公开资料",
      text: compactText([item.title, item.note, item.url]),
      weight: 1.3,
      url: asText(item.url),
    });
  });

  const publications = Array.isArray(guest.publications) ? guest.publications : [];
  publications.forEach((item: any, index: number) => {
    pushChunk(chunks, {
      guestId,
      sourceType: "public_material",
      sourceId: asText(item.url) || `${guestId}:publication:${index}`,
      sourceTitle: asText(item.title) || `${guestName} 公开成果`,
      locator: asText(item.source) || asText(item.type) || "公开成果",
      text: compactText([item.title, item.source, item.publishedAt, item.summary, item.note, item.url]),
      weight: 1.6,
      url: asText(item.url),
    });
  });

  const benefits = Array.isArray(guest.listenerBenefits) ? guest.listenerBenefits : [];
  benefits.forEach((item: any, index: number) => {
    pushChunk(chunks, {
      guestId,
      sourceType: "guest_profile",
      sourceId: `${guestId}:benefit:${index}`,
      sourceTitle: asText(item.title) || `${guestName} 听友福利`,
      locator: "听友福利",
      text: compactText([item.title, item.description, item.note]),
      weight: 1,
      url: asText(item.url),
    });
  });

  (input.programs || []).forEach((program: any) => {
    const programId = String(program._id || "");
    const programTitle = asText(program.title) || "关联节目";
    const routeId = asText(program.programCode) || programId;
    const programUrl = routeId ? `/programs/${encodeURIComponent(routeId)}` : "";
    pushChunk(chunks, {
      guestId,
      sourceType: "program_summary",
      sourceId: programId,
      sourceTitle: programTitle,
      locator: "节目摘要",
      text: compactText([program.summary?.headline, program.summary?.body, program.summary?.highlightText, Array.isArray(program.summary?.tags) ? program.summary.tags.join(" / ") : ""]),
      weight: 2,
      url: programUrl,
    });

    (Array.isArray(program.transcript) ? program.transcript : []).forEach((segment: any) => {
      pushChunk(chunks, {
        guestId,
        sourceType: "program_transcript",
        sourceId: programId,
        sourceTitle: programTitle,
        locator: asText(segment.time) || "逐字稿",
        text: compactText([segment.speaker, segment.text]),
        weight: asText(segment.speaker).includes(guestName) ? 2.4 : 1.8,
        url: programUrl,
      });
    });

    (Array.isArray(program.contentPack?.quickView) ? program.contentPack.quickView : []).forEach((item: any) => {
      pushChunk(chunks, {
        guestId,
        sourceType: "program_quickview",
        sourceId: programId,
        sourceTitle: programTitle,
        locator: asText(item.timeRangeLabel) || asText(item.startTime) || "节目速览",
        text: asText(item.summary),
        weight: 1.8,
        url: programUrl,
      });
    });

    const showNotes = program.contentPack?.showNotes || {};
    [showNotes.guide, showNotes.guestIntro, showNotes.renderedText].forEach((text, index) => {
      pushChunk(chunks, {
        guestId,
        sourceType: "program_shownotes",
        sourceId: programId,
        sourceTitle: programTitle,
        locator: index === 1 ? "嘉宾介绍" : "节目笔记",
        text: asText(text),
        weight: 1.5,
        url: programUrl,
      });
    });
    (Array.isArray(showNotes.keyMoments) ? showNotes.keyMoments : []).forEach((item: any) => {
      pushChunk(chunks, {
        guestId,
        sourceType: "program_shownotes",
        sourceId: programId,
        sourceTitle: programTitle,
        locator: asText(item.time) || "关键时刻",
        text: asText(item.point),
        weight: 1.7,
        url: programUrl,
      });
    });

    splitLongText(asText(program.contentPack?.minutes?.text), 900).forEach((text, index) => {
      pushChunk(chunks, {
        guestId,
        sourceType: "program_shownotes",
        sourceId: programId,
        sourceTitle: programTitle,
        locator: `纪要 ${index + 1}`,
        text,
        weight: 1.2,
        url: programUrl,
      });
    });

    (Array.isArray(program.deepDive?.curatedReading) ? program.deepDive.curatedReading : []).forEach((item: any) => {
      pushChunk(chunks, {
        guestId,
        sourceType: "program_deepdive",
        sourceId: programId,
        sourceTitle: asText(item.title) || programTitle,
        locator: "延伸阅读",
        text: compactText([item.title, item.subtitle, item.url]),
        weight: 1.2,
        url: asText(item.url) || programUrl,
      });
    });
    flattenMindMap(program.deepDive?.mindMap?.root).forEach((text, index) => {
      pushChunk(chunks, {
        guestId,
        sourceType: "program_deepdive",
        sourceId: programId,
        sourceTitle: programTitle,
        locator: `脉络图 ${index + 1}`,
        text,
        weight: 1.4,
        url: programUrl,
      });
    });
  });

  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    const key = `${chunk.sourceType}:${chunk.sourceId}:${chunk.locator}:${chunk.text.slice(0, 60)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function locatorForKnowledgeSource(sourceKind: string) {
  if (sourceKind === "learning_material") return "学习资料";
  if (sourceKind === "external_url") return "外部链接";
  if (sourceKind === "manual_note") return "后台手动资料";
  return "后台上传资料";
}

export function buildGuestAgentChunksFromKnowledgeSources(sources: GuestKnowledgeSourceInput[]): GuestAgentChunkInput[] {
  const chunks: GuestAgentChunkInput[] = [];
  (Array.isArray(sources) ? sources : []).forEach((source) => {
    if (source?.status && source.status !== "active") return;
    const text = compactText([source.summary, source.rawText]);
    if (!text) return;
    pushChunk(chunks, {
      sourceType: "public_material",
      sourceId: asText(source._id),
      sourceTitle: asText(source.title) || "后台知识库资料",
      locator: locatorForKnowledgeSource(asText(source.sourceKind)),
      text,
      weight: 1.7,
      url: asText(source.fileUrl),
    });
  });
  return chunks;
}

export function retrieveGuestAgentChunks(chunks: GuestAgentChunkInput[], question: string, limit = 8): GuestAgentChunkInput[] {
  const qTokens = tokenize(question);
  if (!qTokens.length) return [...chunks].sort((a, b) => b.weight - a.weight).slice(0, limit);
  return chunks
    .map((chunk) => {
      const text = `${chunk.sourceTitle} ${chunk.locator} ${chunk.text}`.toLowerCase();
      const keywordSet = new Set((chunk.keywords || []).map((item) => item.toLowerCase()));
      const overlap = qTokens.reduce((score, token) => {
        if (keywordSet.has(token)) return score + 4;
        if (text.includes(token)) return score + 2;
        return score;
      }, 0);
      return { chunk, score: overlap * chunk.weight + chunk.weight };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.chunk);
}

export function buildGuestAgentFallbackAnswer(guestName: string): string {
  return `当前资料库还没有足够信息回答这个问题。你可以换一个更具体的问题，或等待我们补充${guestName || "这位嘉宾"}的节目逐字稿、档案和公开资料后再试。`;
}

export function toCitation(chunk: any): GuestAgentCitation {
  return {
    chunkId: String(chunk._id || ""),
    sourceType: chunk.sourceType,
    sourceId: String(chunk.sourceId || ""),
    sourceTitle: asText(chunk.sourceTitle),
    locator: asText(chunk.locator),
    text: truncate(asText(chunk.text), 180),
    url: asText(chunk.url),
  };
}

function toWeknoraCitation(hit: WeknoraSearchHit): GuestAgentCitation {
  return {
    chunkId: asText(hit.chunkId),
    sourceType: hit.sourceType,
    sourceId: asText(hit.sourceId),
    sourceTitle: asText(hit.sourceTitle),
    locator: asText(hit.locator),
    text: truncate(asText(hit.text), 180),
    url: asText(hit.url),
  };
}

function sourceKeyForChunk(chunk: GuestAgentChunkInput, index: number): string {
  return [chunk.sourceType, chunk.sourceId, chunk.locator, index]
    .map((part) => encodeURIComponent(asText(part)))
    .join(":");
}

export function buildGuestWeknoraDocuments(chunks: GuestAgentChunkInput[]): WeknoraGuestDocument[] {
  return chunks.map((chunk, index) => ({
    sourceKey: sourceKeyForChunk(chunk, index),
    title: asText(chunk.sourceTitle) || `${chunk.sourceType} ${index + 1}`,
    content: asText(chunk.text),
    sourceType: chunk.sourceType,
    sourceId: asText(chunk.sourceId),
    locator: asText(chunk.locator),
    url: asText(chunk.url),
  })).filter((item) => item.content);
}

async function loadGuestAndPrograms(guestId: string) {
  const objectId = new mongoose.Types.ObjectId(guestId);
  const guest = await GuestModel.findOne({
    _id: objectId,
    $or: [{ status: "active" }, { status: { $exists: false } }, { status: null }],
  }).lean();
  if (!guest) return { guest: null, programs: [] };
  const programs = await Program.find(
    { "guestBindings.guestId": objectId, status: "published" },
    {
      _id: 1,
      programCode: 1,
      title: 1,
      summary: 1,
      transcript: 1,
      contentPack: 1,
      deepDive: 1,
      guestBindings: 1,
      updatedAt: 1,
    }
  )
    .sort({ publishedAt: -1, updatedAt: -1 })
    .limit(40)
    .lean();
  return { guest, programs };
}

export async function rebuildGuestAgentIndex(guestId: string) {
  const { guest, programs } = await loadGuestAndPrograms(guestId);
  if (!guest) return null;
  const objectId = new mongoose.Types.ObjectId(guestId);
  const knowledgeSources = await KnowledgeSourceModel.find({
    guestId: objectId,
    status: "active",
    parseStatus: "ready",
  })
    .sort({ updatedAt: -1 })
    .limit(120)
    .lean();
  const chunks = [
    ...buildGuestAgentChunksFromDocs({ guest, programs }),
    ...buildGuestAgentChunksFromKnowledgeSources(knowledgeSources as any),
  ];
  await GuestAgentChunkModel.deleteMany({ guestId: objectId });
  if (chunks.length) {
    await GuestAgentChunkModel.insertMany(chunks.map((chunk) => ({ ...chunk, guestId: objectId })));
  }
  let weknoraSync: any = { enabled: false, status: "disabled" };
  if (chunks.length) {
    try {
      weknoraSync = await syncGuestKnowledgeDocuments({
        guestId,
        guestName: asText((guest as any).name),
        documents: buildGuestWeknoraDocuments(chunks),
      });
    } catch (error: any) {
      weknoraSync = {
        enabled: isWeknoraEnabled(),
        status: "failed",
        message: error?.message || "WeKnora sync failed",
        code: error?.code || "",
      };
    }
  }
  return {
    guest,
    programs,
    chunkCount: chunks.length,
    sourceCounts: summarizeSourceCounts(chunks),
    weknoraSync,
  };
}

function summarizeSourceCounts(chunks: Array<{ sourceType: string }>) {
  return chunks.reduce<Record<string, number>>((acc, chunk) => {
    acc[chunk.sourceType] = (acc[chunk.sourceType] || 0) + 1;
    return acc;
  }, {});
}

function defaultQuestions(guest: any, chunks: Array<{ text: string; keywords?: string[] }>) {
  const name = asText(guest?.name) || "这位嘉宾";
  const keyword = chunks.flatMap((chunk) => chunk.keywords || []).find((item) => item && !item.includes(name)) || "家庭教育";
  return [
    `${name}的核心观点是什么？`,
    `关于${keyword}，${name}有哪些具体建议？`,
    `如果我想马上行动，可以先做哪三件事？`,
  ];
}

export async function getGuestAgentProfile(guestId: string, userId?: string) {
  const existingChunks = await GuestAgentChunkModel.find({ guestId: new mongoose.Types.ObjectId(guestId) }).lean();
  let chunks = existingChunks;
  let guest = await GuestModel.findById(guestId).lean();
  if (!guest || (guest as any).agentEnabled !== true) return null;
  let programs: any[] = [];
  if (!chunks.length) {
    const rebuilt = await rebuildGuestAgentIndex(guestId);
    if (!rebuilt) return null;
    guest = rebuilt.guest;
    programs = rebuilt.programs;
    chunks = await GuestAgentChunkModel.find({ guestId: new mongoose.Types.ObjectId(guestId) }).lean();
  } else {
    programs = await Program.find({ "guestBindings.guestId": new mongoose.Types.ObjectId(guestId), status: "published" }, { _id: 1 }).lean();
  }
  const recent = userId && mongoose.Types.ObjectId.isValid(userId)
    ? await GuestAgentConversationModel.findOne({ userId: new mongoose.Types.ObjectId(userId), guestId: new mongoose.Types.ObjectId(guestId) })
        .sort({ updatedAt: -1 })
        .lean()
    : null;
  return {
    agent: {
      guestId,
      name: asText((guest as any)?.name),
      title: asText((guest as any)?.title),
      avatar: asText((guest as any)?.avatar),
      bio: asText((guest as any)?.bio),
      chunkCount: chunks.length,
      programCount: programs.length,
      sourceCounts: summarizeSourceCounts(chunks as any),
      suggestedQuestions: defaultQuestions(guest, chunks as any),
      privacyNote: "对话内容仅用于当前账号的嘉宾智能体会话展示。",
      syncStatus: isWeknoraEnabled() ? "weknora_configured" : "local_only",
    },
    recentConversation: recent
      ? {
          _id: String(recent._id),
          updatedAt: recent.updatedAt,
          messageCount: Array.isArray(recent.messages) ? recent.messages.length : 0,
        }
      : null,
  };
}

function resolveGuestAgentConfig() {
  const store = ensureStore(() => ({
    agents: [],
    prompts: {},
    policies: {},
    strategies: {},
    runs: [],
  }));
  const agent = store.agents.find((x: any) => x.agent_code === "guest_agent") || store.agents.find((x: any) => x.agent_code === "chat_manager_agent");
  if (!agent) throw new Error("guest_agent/chat_manager_agent 未配置");
  const resolved = resolveAgentModelConfig(agent as any, store.model_registry || []);
  const modelCfg = resolved.primary;
  if (!modelCfg.api_key || !modelCfg.model_name) throw new Error("嘉宾智能体模型未配置完整");
  return { agent, modelCfg };
}

export function buildGuestAgentSystemPrompt(guestName: string) {
  const name = asText(guestName) || "嘉宾";
  const systemPrompt = [
    `你是“${name} AI 分身”，用于帮助用户理解这位嘉宾在家长先疯节目和公开资料中的观点。`,
    "你不是嘉宾本人实时回复，不能假装自己正在亲自接诊、承诺服务或编造经历。",
    "回答必须优先依据给定资料。资料没有明确提到时，请直接说明“资料中没有明确提到”。",
    "不能编造不存在的节目、书名、课程或资源。只允许推荐可用资料中出现的节目。",
    "只有当用户明确询问节目、收听、出处，或回答确实需要点出节目内容时，才简短说明可参考相关节目；不要固定引导用户收听下方推荐卡片。",
    "回答要使用这位嘉宾的表达视角和知识背景，但保持克制、可追溯、适合家庭教育场景。",
    "不要输出医疗、法律、金融等高风险诊断结论。不要在回答正文末尾输出参考来源、参考资料或引用资料列表，前端会单独展示引用资料卡片。",
  ].join("\n");
  return systemPrompt;
}

export async function retrieveGuestAgentCitations(params: {
  guestId: string;
  question: string;
  chunks: any[];
  limit?: number;
  weknoraSearch?: (params: { guestId: string; query: string; limit: number }) => Promise<WeknoraSearchHit[]>;
}): Promise<GuestAgentRetrievalResult> {
  const limit = Math.max(1, Math.floor(params.limit || 8));
  const shouldTryWeknora = Boolean(params.weknoraSearch) || isWeknoraEnabled();
  let syncStatus = "";
  if (shouldTryWeknora) {
    try {
      const hits = await (params.weknoraSearch || searchGuestKnowledge)({
        guestId: params.guestId,
        query: params.question,
        limit,
      });
      if (hits.length > 0) {
        return {
          provider: "weknora",
          citations: hits.map(toWeknoraCitation),
          syncStatus: "weknora_hit",
        };
      }
      syncStatus = "weknora_no_hits";
    } catch (error: any) {
      syncStatus = error?.code || "weknora_error";
    }
  }

  const localHits = retrieveGuestAgentChunks(params.chunks as any, params.question, limit);
  return {
    provider: "local",
    citations: localHits.map(toCitation),
    syncStatus: syncStatus || "local_only",
  };
}

async function callGuestAgentModel(params: { guest: any; question: string; citations: GuestAgentCitation[]; history: any[] }) {
  const { agent, modelCfg } = resolveGuestAgentConfig();
  const endpoint = `${String(modelCfg.base_url || "https://api.openai.com").replace(/\/+$/, "")}/v1/chat/completions`;
  const guestName = asText(params.guest?.name) || "嘉宾";
  const sourceBlock = params.citations
    .map((item, index) => `[${index + 1}] ${item.sourceTitle}${item.locator ? ` / ${item.locator}` : ""}\n${item.text}`)
    .join("\n\n");
  const systemPrompt = buildGuestAgentSystemPrompt(guestName);
  const messages = [
    { role: "system", content: systemPrompt },
    ...params.history.slice(-8).map((item) => ({ role: item.role, content: item.content })),
    { role: "user", content: `用户问题：${params.question}\n\n可用资料：\n${sourceBlock}` },
  ];
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${modelCfg.api_key}`,
    },
    body: JSON.stringify({
      model: modelCfg.model_name,
      messages,
      temperature: Number.isFinite(Number((agent as any).temperature)) ? Number((agent as any).temperature) : 0.2,
      top_p: Number.isFinite(Number((agent as any).top_p)) ? Number((agent as any).top_p) : 0.95,
      max_tokens: Number.isFinite(Number((agent as any).max_tokens)) ? Number((agent as any).max_tokens) : 1200,
      stream: false,
    }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    throw new Error(`上游调用失败(${modelCfg.provider}/${modelCfg.model_name}): ${upstream.status} ${data?.error?.message || data?.message || "unknown"}`);
  }
  return {
    answer: asText(data?.choices?.[0]?.message?.content) || "资料中没有明确提到。",
    model: String(modelCfg.model_name || ""),
    provider: String(modelCfg.provider || ""),
  };
}

export async function askGuestAgent(params: { guestId: string; userId: string; question: string }) {
  const { guest } = await loadGuestAndPrograms(params.guestId);
  if (!guest || (guest as any).agentEnabled !== true) return null;
  let chunks = await GuestAgentChunkModel.find({ guestId: new mongoose.Types.ObjectId(params.guestId) }).lean();
  if (!chunks.length) {
    await rebuildGuestAgentIndex(params.guestId);
    chunks = await GuestAgentChunkModel.find({ guestId: new mongoose.Types.ObjectId(params.guestId) }).lean();
  }
  const retrieval = await retrieveGuestAgentCitations({ guestId: params.guestId, question: params.question, chunks: chunks as any, limit: 8 });
  const citations = retrieval.citations;
  const userObjectId = new mongoose.Types.ObjectId(params.userId);
  const guestObjectId = new mongoose.Types.ObjectId(params.guestId);
  let conversation = await GuestAgentConversationModel.findOne({ userId: userObjectId, guestId: guestObjectId });
  if (!conversation) {
    conversation = await GuestAgentConversationModel.create({ userId: userObjectId, guestId: guestObjectId, messages: [] });
  }
  const history = Array.isArray(conversation.messages) ? conversation.messages.slice(-8) : [];
  let answer = buildGuestAgentFallbackAnswer(asText((guest as any).name));
  let model = "";
  let provider = "";
  if (citations.length > 0) {
    const modelResult = await callGuestAgentModel({ guest, question: params.question, citations, history });
    answer = modelResult.answer;
    model = modelResult.model;
    provider = modelResult.provider;
  }
  conversation.messages.push({ role: "user", content: params.question, createdAt: new Date() } as any);
  conversation.messages.push({ role: "assistant", content: answer, citations, model, provider, createdAt: new Date() } as any);
  await conversation.save();
  return {
    conversationId: String(conversation._id),
    answer,
    citations,
    suggestedQuestions: defaultQuestions(guest, citations.length ? citations.map((item) => ({ text: item.text, keywords: [] })) : chunks as any),
    retrievalProvider: retrieval.provider,
    syncStatus: retrieval.syncStatus,
  };
}

export async function getGuestAgentHistory(params: { guestId: string; userId: string }) {
  const guest = await GuestModel.findById(params.guestId, { agentEnabled: 1 }).lean();
  if (!guest || (guest as any).agentEnabled !== true) return { conversationId: "", messages: [], updatedAt: null };
  const conversation = await GuestAgentConversationModel.findOne({
    userId: new mongoose.Types.ObjectId(params.userId),
    guestId: new mongoose.Types.ObjectId(params.guestId),
  }).lean();
  return conversation
    ? {
        conversationId: String(conversation._id),
        messages: Array.isArray(conversation.messages) ? conversation.messages : [],
        updatedAt: conversation.updatedAt,
      }
    : { conversationId: "", messages: [], updatedAt: null };
}
