import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import mongoose from "mongoose";
import AgentTaskModel, {
  AgentTaskStatus,
  AgentTaskTargetType,
  AgentTaskType,
} from "../models/AgentTask";
import Program from "../models/Program";
import GuestModel from "../models/Guest";
import { isHighQualityEducationTerm, syncProgramDictionaryEntries } from "./educationDictionary";
import { createInboxMessage } from "./adminInbox";
import { ensureStore, resolveAgentModelConfig } from "./agentModelRegistry";

type CreateTaskInput = {
  taskType: AgentTaskType;
  targetType: AgentTaskTargetType;
  targetId: string;
  options?: Record<string, any>;
  createdBy?: string;
  maxRetries?: number;
};

const POLL_MS = 1500;
let pollTimer: NodeJS.Timeout | null = null;
let working = false;

const TASK_AGENT_MAP: Partial<Record<AgentTaskType, string>> = {
  proofread_transcript: "textbook_structure_agent",
  enrich_program_content: "knowledge_split_agent",
  enrich_guest_profile: "question_quality_agent",
  generate_program_artwork: "image",
};

function getLatestPromptDoc(bucket: any): any | null {
  const candidates = [bucket?.current, ...(Array.isArray(bucket?.items) ? bucket.items : [])].filter(Boolean);
  if (!candidates.length) return null;
  return [...candidates].sort((a: any, b: any) => {
    const at = String(a?.created_at || "");
    const bt = String(b?.created_at || "");
    if (at !== bt) return bt.localeCompare(at);
    return Number(b?.id || 0) - Number(a?.id || 0);
  })[0] || null;
}

function resolveTaskConfig(taskType: AgentTaskType) {
  const agentCode = TASK_AGENT_MAP[taskType] || "";
  const store = ensureStore(() => ({ agents: [], prompts: {}, policies: {}, strategies: {}, runs: [] }));
  const agent = store.agents.find((x: any) => x.agent_code === agentCode) || null;
  const bucket = agentCode ? store.prompts?.[agentCode] : null;
  const promptDoc = getLatestPromptDoc(bucket);
  const model = agent ? resolveAgentModelConfig(agent as any, store.model_registry || []).primary : null;
  return {
    agentCode,
    promptDoc,
    model,
  };
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clipText(value: unknown, max = 200): string {
  const text = asText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}...`;
}

function normalizeTerm(value: unknown): string {
  return asText(value).toLowerCase().replace(/\s+/g, "");
}

export function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizePunctuation(text: string): string {
  return text
    .replace(/,/g, "，")
    .replace(/;/g, "；")
    .replace(/:/g, "：")
    .replace(/\?/g, "？")
    .replace(/!/g, "！");
}

export function titleCaseEnglishToken(text: string): string {
  return text.replace(/\b(ai|gpt|llm)\b/gi, (token) => token.toUpperCase());
}

function looksLikeReferenceUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function buildGlossaryDefinition(term: string): string {
  return `${term}：节目中提及的关键概念，建议结合上下文进一步核验并补充权威定义。`;
}

function termSourceUrl(term: string): string {
  return `https://baike.baidu.com/item/${encodeURIComponent(term)}`;
}

function isSearchEntryUrl(url: string): boolean {
  const u = asText(url).toLowerCase();
  return u.includes("bing.com/search?q=") || u.includes("google.com/search?q=") || u.includes("baidu.com/s?");
}

function isNoisyReadingTitle(title: string): boolean {
  const t = asText(title);
  if (!t) return true;
  return /(欢迎来到|最新一期|阶段的教育|因为从政策|意味着这个教育|JESSIE|^延伸阅读：)/i.test(t);
}

function isGeneratedFallbackReading(item: { title?: unknown; subtitle?: unknown; url?: unknown }): boolean {
  const title = asText(item?.title);
  const subtitle = asText(item?.subtitle);
  const url = asText(item?.url);
  if (isSearchEntryUrl(url) || isSearchLikeUrl(url)) return true;
  if (/^延伸阅读：/.test(title)) return true;
  if (subtitle === "概念词条与背景知识" || subtitle === "概念入门与背景梳理") return true;
  if (url.includes("baike.baidu.com/item/") && /^延伸阅读：/.test(title)) return true;
  return false;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlContent(text: string): string {
  return normalizeSpaces(decodeXmlEntities(stripHtmlTags(text || "")));
}

function isImageAssetUrl(url: string): boolean {
  const value = asText(url).toLowerCase();
  return /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(value);
}

function isSearchLikeUrl(url: string): boolean {
  const value = asText(url).toLowerCase();
  return (
    value.includes("/search?") ||
    value.includes("query=") ||
    value.includes("keyword=") ||
    value.includes("/s?wd=") ||
    value.includes("/s?q=")
  );
}

function isRealReferenceUrl(url: string): boolean {
  const value = asText(url);
  return looksLikeReferenceUrl(value) && !isSearchEntryUrl(value) && !isSearchLikeUrl(value);
}

function isPlaceholderAvatarUrl(url: string): boolean {
  const value = asText(url).toLowerCase();
  return (
    value.includes("ui-avatars.com") ||
    value.includes("source.unsplash.com/featured") ||
    value.includes("placehold") ||
    value.includes("dummyimage.com")
  );
}

function inferSocialPlatform(url: string): string {
  const value = asText(url).toLowerCase();
  if (value.includes("weibo.com")) return "微博";
  if (value.includes("xiaohongshu.com")) return "小红书";
  if (value.includes("mp.weixin.qq.com") || value.includes("wechat.com")) return "微信公众号";
  if (value.includes("zhihu.com")) return "知乎";
  if (value.includes("douyin.com")) return "抖音";
  if (value.includes("bilibili.com")) return "Bilibili";
  if (value.includes("x.com") || value.includes("twitter.com")) return "X";
  if (value.includes("linkedin.com")) return "LinkedIn";
  return "";
}

function inferPublicationType(materialType: string, url: string): "paper" | "book" | "interview" | "media" | "other" {
  const type = asText(materialType).toLowerCase();
  const link = asText(url).toLowerCase();
  if (type === "paper" || type === "book" || type === "interview" || type === "media" || type === "other") {
    return type;
  }
  if (type.includes("论文") || link.includes("scholar") || link.includes("cnki") || link.includes("doi.org")) return "paper";
  if (type.includes("著作") || type.includes("图书") || type.includes("书")) return "book";
  if (type.includes("访谈") || type.includes("采访")) return "interview";
  if (type.includes("公开言论") || type.includes("公开资料") || type.includes("媒体")) return "media";
  return "other";
}

async function fetchReferenceDocument(url: string): Promise<{ title: string; description: string; image: string }> {
  const target = asText(url);
  if (!isRealReferenceUrl(target)) return { title: "", description: "", image: "" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(target, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) return { title: "", description: "", image: "" };
    const html = await response.text();
    const title =
      decodeHtmlContent(html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"]*?)["']/i)?.[1] || "") ||
      decodeHtmlContent(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
    const description =
      decodeHtmlContent(html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"]*?)["']/i)?.[1] || "") ||
      decodeHtmlContent(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"]*?)["']/i)?.[1] || "");
    const image =
      asText(html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"]*?)["']/i)?.[1] || "") ||
      asText(html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"]*?)["']/i)?.[1] || "");
    return {
      title: clipText(title, 120),
      description: clipText(description, 220),
      image: looksLikeReferenceUrl(image) ? image : "",
    };
  } catch (_error) {
    return { title: "", description: "", image: "" };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchNewsArticlesByKeyword(keyword: string, limit = 2): Promise<Array<{ title: string; url: string; note: string }>> {
  const q = asText(keyword);
  if (!q) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2600);
  try {
    const resp = await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "Accept": "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.1",
      },
    });
    if (!resp.ok) return [];
    const xml = await resp.text();
    const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    const rows: Array<{ title: string; url: string; note: string }> = [];
    for (const item of itemMatches) {
      const title = decodeXmlEntities(stripHtmlTags((item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").trim()));
      const url = decodeXmlEntities((item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "").trim());
      const source = decodeXmlEntities(stripHtmlTags((item.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || "").trim()));
      if (!title || !url || !/^https?:\/\//i.test(url)) continue;
      rows.push({ title, url, note: source ? `来源：${source}` : "相关新闻" });
      if (rows.length >= limit) break;
    }
    return rows;
  } catch (_error) {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeModelNameForUpstream(provider: string, modelName: string): string {
  const p = asText(provider).toLowerCase();
  const m = asText(modelName);
  const ml = m.toLowerCase();
  if (ml === "pro") return "deepseek-v4-pro";
  if (ml === "flash") return "deepseek-v4-flash";
  if (p === "deepseek" && ml === "deepseek-chat") return "deepseek-v4-flash";
  return m;
}

function normalizeImageModelNameForUpstream(modelConfig: any): string {
  const provider = asText(modelConfig?.provider).toLowerCase();
  const modelId = asText(modelConfig?.id);
  const modelName = asText(modelConfig?.model_name);
  const normalizedName = normalizeModelNameForUpstream(provider, modelName);
  const normalizedId = asText(modelId).toLowerCase();
  if (provider === "doubao") {
    if (normalizedId.includes("seedream")) return modelId;
    const nameKey = normalizedName.toLowerCase();
    if (nameKey === "doubao-seedream-5.0") return "doubao-seedream-5-0-260128";
    if (nameKey === "doubao-seedream-5.0-lite") return "doubao-seedream-5-0-lite-250428";
  }
  return normalizedName;
}

function stripJsonFence(text: string): string {
  const raw = asText(text);
  if (!raw) return "";
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? asText(fenced[1]) : raw;
}

function parseJsonFromModelText(text: string): any | null {
  const cleaned = stripJsonFence(text);
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch (_error) {
    return null;
  }
}

async function callAgentModelForJson(
  taskConfig: ReturnType<typeof resolveTaskConfig>,
  userPrompt: string
): Promise<{ parsed: any | null; rawText: string; error?: string }> {
  const modelConfig: any = taskConfig.model || {};
  const apiKey = asText(modelConfig?.api_key);
  const modelName = normalizeModelNameForUpstream(modelConfig?.provider, modelConfig?.model_name);
  const baseUrl = asText(modelConfig?.base_url) || "https://api.openai.com";
  if (!apiKey || !modelName) {
    return { parsed: null, rawText: "", error: "模型未配置完整（缺少 api_key 或 model_name）" };
  }
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
  const systemPrompt =
    asText(taskConfig.promptDoc?.system_prompt) ||
    "你是嘉宾资料收集助手，只输出严格 JSON，不要输出解释文字。";
  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: Number.isFinite(Number(modelConfig?.temperature)) ? Number(modelConfig?.temperature) : 0.2,
        top_p: Number.isFinite(Number(modelConfig?.top_p)) ? Number(modelConfig?.top_p) : 0.95,
        max_tokens: Number.isFinite(Number(modelConfig?.max_tokens)) ? Number(modelConfig?.max_tokens) : 1200,
        stream: false,
      }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return {
        parsed: null,
        rawText: "",
        error: `上游调用失败: ${upstream.status} ${asText(data?.error?.message || data?.message || "unknown")}`,
      };
    }
    const rawText = asText(data?.choices?.[0]?.message?.content);
    return { parsed: parseJsonFromModelText(rawText), rawText };
  } catch (error: any) {
    return { parsed: null, rawText: "", error: asText(error?.message) || "模型调用失败" };
  }
}

type ArtworkStyle = "oriental_ink_series";

function normalizeArtworkStyle(value: unknown): ArtworkStyle {
  void value;
  return "oriental_ink_series";
}

function styleLabel(style: ArtworkStyle): string {
  if (style === "oriental_ink_series") return "东方美学系列";
  return "东方美学系列";
}

function pickSemanticMotif(keywords: string[]) {
  const text = keywords.join(" ");
  if (/(困局|焦虑|压力|内耗|迷茫|冲突)/.test(text)) return "张力回环";
  if (/(成长|孩子|亲子|家庭|陪伴)/.test(text)) return "家园共振";
  if (/(方法|策略|体系|框架|模型|步骤)/.test(text)) return "秩序骨架";
  if (/(精神|心理|情绪|安全感|自我)/.test(text)) return "情绪涟漪";
  return "思想微光";
}

function clipByChars(value: string, max = 28): string {
  const text = asText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}...`;
}

function pickInsightLine(summary: string, fallback: string): string {
  const clean = asText(summary).replace(/\s+/g, " ");
  const candidates = clean.split(/[。！？!?；;]/).map((x) => asText(x)).filter(Boolean);
  const first = candidates.find((x) => x.length >= 10) || candidates[0] || fallback;
  return clipByChars(first, 34);
}

function renderPromptTemplate(template: string, variables: Record<string, string>): string {
  const raw = asText(template);
  if (!raw) return "";
  return raw.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => variables[key] ?? "");
}

function buildDefaultArtworkPromptPackage(input: {
  title: string;
  keywords: string[];
  motif: string;
  insight: string;
  themeElement: string;
}) {
  const styleDef = {
    unified:
      "艺术海报设计，等轴构图，东方美学，极致抽象极简红色水墨画，红黑金配色，版式高级，精准构图，大气克制，留白充足，极简主义",
    palette: "red, black, gold",
    layout:
      "大标题使用清晰宋体“东方美学”，主体构图稳定，留白明确，对比强烈，没有多余元素、线条或装饰噪音",
  };
  const fullPrompt = [
    "为一档家庭教育播客节目生成统一系列封面图。",
    "画幅为横版，接近 1072 x 714 px。",
    styleDef.unified,
    `色彩体系：${styleDef.palette}。`,
    `版式要求：${styleDef.layout}。`,
    "系列规则：所有节目封面统一保持“东方美学系列”视觉系统，只根据每期节目的关键词变化核心意象，不改变整体版式、字体气质与审美方向。",
    `节目标题仅作语义参考：${input.title}。`,
    `本期关键词：${input.keywords.join("、") || input.title}。`,
    `核心意象：${input.motif}。`,
    `叙事聚焦：${input.themeElement}`,
    "文字规则：只允许出现一个清晰、可读、占据视觉重心的中文宋体大标题“东方美学”。",
    "画面气质：高级、克制、当代、文化感强、情绪准确、抽象而有思想性。",
    "优先使用象征性、观念化、编辑感的视觉表达，不要直白人物摆拍，不要常规商业海报套路。",
    "不要额外英文，不要 logo，不要水印，不要 UI，不要花哨纹理，不要冗余线条，不要无关小元素。",
    "输出应适合官网节目列表与详情页直接使用。"
  ].join(" ");
  return {
    cover_size: "1072 x 714 px",
    unified_style: styleDef.unified,
    theme_element: input.themeElement,
    full_prompt: fullPrompt,
    negative_prompt: [
      "文字模糊, 多余文字, 英文字符, 水印, logo, 二维码, UI元素, 低清晰度, 模糊失焦",
      "廉价素材感, 幼稚卡通, 搞笑表情包, 杂乱构图, 背景拥挤, 人物肢体畸形",
      "重复主体, 高光过曝, 颜色发脏, 随机拼贴噪点, 粗糙插画",
      "紫色主色, 赛博霓虹, 装饰过密, 线条过多, 非极简风格"
    ].join(", "),
  };
}

function buildArtworkPromptPackage(input: {
  semanticCore: string[];
  parsedSignals: string[];
  style: ArtworkStyle;
  title: string;
  summaryText: string;
  promptDoc?: any | null;
}) {
  const semanticCore = (Array.isArray(input.semanticCore) ? input.semanticCore : []).filter(Boolean).slice(0, 6);
  const parsedSignals = (Array.isArray(input.parsedSignals) ? input.parsedSignals : []).filter(Boolean).slice(0, 10);
  const keywords = [...semanticCore, ...parsedSignals];
  const motif = pickSemanticMotif(keywords);
  const title = clipByChars(input.title || "教育播客", 36);
  const insight = pickInsightLine(input.summaryText, keywords[0] || title || "教育现场观察");
  const themeElement = `围绕「${keywords.slice(0, 4).join(" / ") || title}」构建视觉主意象，核心意象采用「${motif}」，突出「${insight}」所代表的问题张力、行动意味与思考空间。`;
  const fallbackPackage = buildDefaultArtworkPromptPackage({
    title,
    keywords,
    motif,
    insight,
    themeElement,
  });
  const variables: Record<string, string> = {
    cover_size: fallbackPackage.cover_size,
    unified_style: fallbackPackage.unified_style,
    theme_element: themeElement,
    title,
    focus_keywords: keywords.join(" / ") || title,
    keyword_csv: keywords.join("、") || title,
    semantic_core: semanticCore.join(" / "),
    parsed_signals: parsedSignals.join(" / "),
    motif,
    insight,
    summary_text: asText(input.summaryText),
    negative_prompt: fallbackPackage.negative_prompt,
  };
  const managedTemplate = renderPromptTemplate(asText(input.promptDoc?.prompt_template), variables);
  const managedJson = parseJsonFromModelText(managedTemplate);
  if (managedJson && typeof managedJson === "object") {
    return {
      cover_size: asText(managedJson.cover_size) || fallbackPackage.cover_size,
      unified_style: asText(managedJson.unified_style) || fallbackPackage.unified_style,
      theme_element: asText(managedJson.theme_element) || themeElement,
      full_prompt: asText(managedJson.full_prompt) || fallbackPackage.full_prompt,
      negative_prompt: asText(managedJson.negative_prompt) || fallbackPackage.negative_prompt,
    };
  }
  if (managedTemplate) {
    return {
      ...fallbackPackage,
      full_prompt: managedTemplate,
    };
  }
  return fallbackPackage;
}

function resolveImageGenerationEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/images/generations`;
}

function resolveGeneratedImagePublicBaseUrl(): string {
  const nodeEnv = asText(process.env.NODE_ENV).toLowerCase();
  if (nodeEnv !== "production") {
    return `http://localhost:${process.env.PORT || "3001"}`;
  }
  const explicit = asText(process.env.VOLCENGINE_PUBLIC_BASE_URL);
  if (explicit) return explicit.replace(/\/+$/, "");
  return `http://localhost:${process.env.PORT || "3001"}`;
}

function inferImageExtension(contentType: string, fallbackUrl = ""): string {
  const type = asText(contentType).toLowerCase();
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("jpeg") || type.includes("jpg")) return ".jpg";
  const pathname = fallbackUrl ? new URL(fallbackUrl).pathname : "";
  const ext = path.extname(pathname).toLowerCase();
  return ext || ".png";
}

async function persistGeneratedImage(sourceUrl: string): Promise<string> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`下载生图结果失败: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const ext = inferImageExtension(response.headers.get("content-type") || "", sourceUrl);
  const fileName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
  const imageDir = path.resolve(process.cwd(), "uploads", "images");
  await fs.mkdir(imageDir, { recursive: true });
  await fs.writeFile(path.join(imageDir, fileName), Buffer.from(arrayBuffer));
  return `${resolveGeneratedImagePublicBaseUrl()}/uploads/images/${fileName}`;
}

async function callAgentImageModel(
  taskConfig: ReturnType<typeof resolveTaskConfig>,
  promptPackage: { full_prompt: string; negative_prompt: string }
): Promise<string> {
  const modelConfig: any = taskConfig.model || {};
  const apiKey = asText(modelConfig?.api_key);
  const modelName = normalizeImageModelNameForUpstream(modelConfig);
  const baseUrl = asText(modelConfig?.base_url);
  if (!apiKey || !modelName || !baseUrl) {
    throw new Error("配图模型未配置完整（缺少 api_key、model_name 或 base_url）");
  }
  const endpoint = resolveImageGenerationEndpoint(baseUrl);
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      prompt: promptPackage.full_prompt,
      negative_prompt: promptPackage.negative_prompt,
      response_format: "url",
      size: "2K",
      watermark: false,
    }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    throw new Error(`Seedream 生图失败: ${upstream.status} ${asText(data?.error?.message || data?.message || "unknown")}`);
  }
  const remoteUrl = asText(data?.data?.[0]?.url || data?.data?.[0]?.image_url);
  if (!remoteUrl) {
    throw new Error("Seedream 未返回有效图片地址");
  }
  return persistGeneratedImage(remoteUrl);
}

async function collectParsedSignals(program: any): Promise<string[]> {
  const scoreMap = new Map<string, number>();
  const push = (term: unknown, weight = 1) => {
    const text = asText(term);
    if (!text) return;
    scoreMap.set(text, (scoreMap.get(text) || 0) + weight);
  };

  const tags = Array.isArray(program?.summary?.tags) ? program.summary.tags : [];
  for (const tag of tags) push(tag, 3);

  const glossary = Array.isArray(program?.termGlossary) ? program.termGlossary : [];
  for (const item of glossary) push((item as any)?.term, 4);

  const dictionaryEntries = Array.isArray(program?.dictionaryEntries) ? program.dictionaryEntries : [];
  for (const item of dictionaryEntries) push((item as any)?.term, 3);

  const curatedReading = Array.isArray(program?.deepDive?.curatedReading) ? program.deepDive.curatedReading : [];
  for (const item of curatedReading) {
    push((item as any)?.title, 2);
    push((item as any)?.subtitle, 1);
  }

  const keyMoments = Array.isArray(program?.contentPack?.showNotes?.keyMoments) ? program.contentPack.showNotes.keyMoments : [];
  for (const item of keyMoments) {
    push((item as any)?.title, 2);
    push((item as any)?.detail, 1);
  }

  const quickView = Array.isArray(program?.contentPack?.quickView) ? program.contentPack.quickView : [];
  for (const item of quickView) {
    push((item as any)?.label, 2);
    push((item as any)?.value, 1);
  }

  const parsedText = [
    asText(program?.summary?.body),
    JSON.stringify(program?.deepDive || {}),
    JSON.stringify(program?.contentPack || {}),
    JSON.stringify(program?.termGlossary || []),
  ].join("\n");
  const extracted = extractCandidateTerms(parsedText).slice(0, 12);
  for (const item of extracted) push(item, 1);

  return Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([term]) => term);
}

export function extractCandidateTerms(rawText: string): string[] {
  const text = normalizeSpaces(rawText);
  if (!text) return [];

  const stopwords = new Set([
    "我们",
    "你们",
    "他们",
    "这个",
    "那个",
    "就是",
    "因为",
    "所以",
    "然后",
    "可以",
    "需要",
    "如果",
    "已经",
    "老师",
    "家长",
    "孩子",
    "节目",
    "今天",
    "本期",
    "问题",
    "方法",
    "内容",
    "还有",
    "这个时候",
    "这种",
    "那个时候",
    "然后呢",
    "其实",
    "比如说",
    "可以说",
    "来说",
    "的话",
    "以及",
    "这样",
    "那样",
    "就是这样",
    "对吧",
    "对吗",
    "哎呀",
    "哎哟",
    "嗯嗯",
    "呃呃",
    "哈哈",
    "呵呵",
    "对对",
    "对对对",
    "来讲",
    "这一块",
  ]);
  const fillerTokenPattern = /^(?:[啊呀嗯哦呃哎欸诶唉哈喂啦呢嘛吧]+|[对嗯啊哦呃哈]{2,}|[A-Za-z]{1,2})$/;
  const repeatedCharPattern = /^([\u4e00-\u9fa5A-Za-z])\1{1,}$/;
  const englishStopwords = new Set([
    "THE",
    "AND",
    "FOR",
    "WITH",
    "THIS",
    "THAT",
    "FROM",
    "INTO",
    "ABOUT",
    "THERE",
    "THEIR",
    "THEM",
    "THEY",
    "WHAT",
    "WHEN",
    "WHERE",
    "WHICH",
    "WOULD",
    "COULD",
    "SHOULD",
    "HAVE",
    "HAS",
    "HAD",
    "WERE",
    "WAS",
    "YOU",
    "YOUR",
    "OURS",
  ]);
  const knownShortEduTerms = new Set(["双减", "家校", "德育", "智育", "美育", "体育"]);

  function shouldKeepChineseToken(token: string): boolean {
    if (!token) return false;
    if (stopwords.has(token)) return false;
    if (fillerTokenPattern.test(token)) return false;
    if (repeatedCharPattern.test(token)) return false;
    if (token.length <= 2 && !knownShortEduTerms.has(token)) return false;
    return true;
  }

  function cleanChineseToken(token: string): string {
    if (!token) return "";
    const explicitMatch = token.match(
      /(神经可塑性|执行功能|家校协同|学习策略|专注力|双减政策|双减|元认知|成长型思维|项目式学习|差异化教学)/
    );
    if (explicitMatch?.[0]) return explicitMatch[0];

    return token
      .replace(/^(我们|你们|他们|其实|主要|关于|对于|围绕|提到|讨论|聊聊|以及|还有|孩子的|家长的|本期|这一期)+/g, "")
      .replace(/^(和|与|及|并|会|将|把|对|在|从|向|给|还|又|就|来|去|说|讲)+/g, "")
      .replace(/^(欢迎来到|欢迎收听|欢迎来到最新一期|这一期我们聊|本期我们聊)+/g, "")
      .replace(/(这个问题|这个话题|这一块|这一点)$/g, "")
      .trim();
  }

  function isNoisyToken(token: string): boolean {
    const t = asText(token);
    if (!t) return true;
    if (/(欢迎来到|最新一期|人间教育|因为从|意味着这个|这个教育|阶段的教育|这个阶段)/.test(t)) return true;
    if (/^[A-Z]{2,}$/.test(t) && t.length <= 5) return true;
    if (/^[\u4e00-\u9fa5]{2,4}$/.test(t) && /(这个|那个|阶段|问题)/.test(t)) return true;
    return false;
  }

  const counts = new Map<string, number>();
  const addCount = (value: string) => {
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  };

  const normalizedChineseText = text.replace(/[，。！？；：“”‘’（）()、]/g, " ");
  const explicitPattern = /(神经可塑性|执行功能|家校协同|学习策略|专注力|双减政策|双减|元认知|成长型思维|项目式学习|差异化教学)/g;
  const suffixPattern =
    /[\u4e00-\u9fa5]{2,12}(?:能力|素养|思维|策略|课程|教育|心理|发展|训练|模型|机制|理论|方法|协同|政策|干预|评估|反馈|动机|认知|记忆|专注力|执行功能|可塑性)/g;

  const explicitMatches = normalizedChineseText.match(explicitPattern) || [];
  for (const token of explicitMatches) {
    const cleanedToken = cleanChineseToken(token);
    if (!shouldKeepChineseToken(cleanedToken)) continue;
    addCount(cleanedToken);
  }

  const suffixMatches = normalizedChineseText.match(suffixPattern) || [];
  for (const token of suffixMatches) {
    const cleanedToken = cleanChineseToken(token);
    if (!shouldKeepChineseToken(cleanedToken)) continue;
    addCount(cleanedToken);
  }

  // Conservative fallback for short Chinese chunks when no better term patterns are found.
  if (counts.size === 0) {
    const chinese = normalizedChineseText.match(/[\u4e00-\u9fa5]{2,8}/g) || [];
    for (const token of chinese) {
      const cleanedToken = cleanChineseToken(token);
      if (!shouldKeepChineseToken(cleanedToken)) continue;
      addCount(cleanedToken);
    }
  }

  const english = text.match(/\b[A-Za-z][A-Za-z0-9\-]{2,20}\b/g) || [];
  for (const token of english) {
    const cleaned = token.toUpperCase();
    if (englishStopwords.has(cleaned)) continue;
    addCount(cleaned);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .slice(0, 12)
    .map(([term]) => term)
    .filter((term) => !isNoisyToken(term))
    .filter((term) => isHighQualityEducationTerm(term));
}

async function runProofreadTask(task: any) {
  const taskConfig = resolveTaskConfig(task.taskType as AgentTaskType);
  const program = await Program.findById(task.targetId);
  if (!program) throw new Error("节目不存在");

  const transcript = Array.isArray((program as any).transcript)
    ? ((program as any).transcript as Array<any>)
    : [];
  if (transcript.length === 0) {
    return {
      outputSummary: "节目暂无逐字稿可校对",
      output: { correctedTranscript: [], report: { typoCount: 0, punctuationChanges: 0, terminologyWarnings: 0, summary: "暂无可校对文本" } },
    };
  }

  const typoMap: Array<[RegExp, string]> = [
    [/\bai\b/g, "AI"],
    [/\bgpt\b/g, "GPT"],
    [/  +/g, " "],
  ];
  let typoCount = 0;
  let punctuationChanges = 0;

  const correctedTranscript = transcript.map((segment) => {
    let text = asText(segment?.text);
    const original = text;
    text = normalizeSpaces(text);
    const normalizedPunctuation = normalizePunctuation(text);
    if (normalizedPunctuation !== text) punctuationChanges += 1;
    text = normalizedPunctuation;
    const normalizedCase = titleCaseEnglishToken(text);
    if (normalizedCase !== text) typoCount += 1;
    text = normalizedCase;

    for (const [pattern, replacement] of typoMap) {
      const before = text;
      text = text.replace(pattern, replacement);
      if (before !== text) typoCount += 1;
    }
    if (original === text) {
      return {
        time: asText(segment?.time),
        speaker: asText(segment?.speaker) || "嘉宾",
        text: original,
        featured: !!segment?.featured,
      };
    }
    return {
      time: asText(segment?.time),
      speaker: asText(segment?.speaker) || "嘉宾",
      text,
      featured: !!segment?.featured,
    };
  });

  const report = {
    typoCount,
    punctuationChanges,
    terminologyWarnings: 0,
    summary:
      typoCount + punctuationChanges > 0
        ? `完成逐字稿校对：修正 ${typoCount} 处词形/术语，规范 ${punctuationChanges} 处标点。`
        : "未检测到明显可自动修正问题。",
  };

  await Program.findByIdAndUpdate(
    task.targetId,
    {
      $set: {
        "agentOutputs.proofread.taskId": task._id,
        "agentOutputs.proofread.generatedAt": new Date(),
        "agentOutputs.proofread.correctedTranscript": correctedTranscript,
        "agentOutputs.proofread.report": report,
      },
    },
    { new: false }
  );

  return {
    outputSummary: report.summary,
    output: {
      correctedTranscript,
      report,
      runtimeConfig: {
        agent_code: taskConfig.agentCode,
        prompt_version: asText(taskConfig.promptDoc?.version),
        prompt_created_at: asText(taskConfig.promptDoc?.created_at),
        model_provider: asText(taskConfig.model?.provider),
        model_name: asText(taskConfig.model?.model_name),
      },
    },
  };
}

async function runProgramEnrichmentTask(task: any) {
  const taskConfig = resolveTaskConfig(task.taskType as AgentTaskType);
  const program = await Program.findById(task.targetId);
  if (!program) throw new Error("节目不存在");

  const forceOverwrite = task?.options?.forceOverwrite === true;
  const transcriptText = (Array.isArray((program as any).transcript) ? (program as any).transcript : [])
    .map((segment: any) => asText(segment?.text))
    .filter(Boolean)
    .join("\n");
  const summaryText = asText((program as any)?.summary?.body);
  const sourceText = [summaryText, transcriptText].filter(Boolean).join("\n");

  const extracted = extractCandidateTerms(sourceText);
  const existingGlossary = Array.isArray((program as any).termGlossary)
    ? (program as any).termGlossary
    : [];
  const existingTermSet = new Set(existingGlossary.map((item: any) => normalizeTerm(item?.term)));

  const suggestedGlossary = extracted.slice(0, 8).map((term) => ({
    term,
    definition: buildGlossaryDefinition(term),
    sourceUrl: termSourceUrl(term),
    aliases: [],
  }));

  const readingTerms = extracted
    .slice(0, 8)
    .filter((term) => !/(欢迎来到|最新一期|因为从|意味着这个|这个教育|阶段的教育)/.test(term));
  const fetchedGroups = await Promise.all(
    readingTerms.slice(0, 4).map((term) => fetchNewsArticlesByKeyword(term, 2))
  );
  const suggestedReadings: Array<{ title: string; subtitle: string; url: string }> = [];
  const usedUrls = new Set<string>();
  fetchedGroups.forEach((rows, idx) => {
    const term = readingTerms[idx];
    for (const row of rows) {
      if (usedUrls.has(row.url)) continue;
      usedUrls.add(row.url);
      suggestedReadings.push({
        title: row.title || `延伸阅读：${term}`,
        subtitle: row.note || "相关文章",
        url: row.url,
      });
      if (suggestedReadings.length >= 6) break;
    }
  });
  let nextGlossary = existingGlossary;
  if (forceOverwrite) {
    nextGlossary = suggestedGlossary;
  } else {
    const appended = suggestedGlossary.filter((item) => !existingTermSet.has(normalizeTerm(item.term)));
    nextGlossary = [...existingGlossary, ...appended];
  }

  const currentDeepDive = (program as any).deepDive || {};
  const existingReadings = Array.isArray(currentDeepDive?.curatedReading)
    ? currentDeepDive.curatedReading
    : [];
  const sanitizedExistingReadings = existingReadings.filter((item: any) => {
    const title = asText(item?.title);
    const url = asText(item?.url);
    if (!title || !url) return false;
    if (isSearchEntryUrl(url)) return false;
    if (isNoisyReadingTitle(title)) return false;
    if (isGeneratedFallbackReading(item)) return false;
    return true;
  });
  const readingKeys = new Set(sanitizedExistingReadings.map((item: any) => asText(item?.title).toLowerCase()));
  const mergedReadings = forceOverwrite
    ? suggestedReadings
    : [
        ...sanitizedExistingReadings,
        ...suggestedReadings.filter((item) => !readingKeys.has(asText(item.title).toLowerCase())),
      ];

  await Program.findByIdAndUpdate(
    task.targetId,
    {
      $set: {
        termGlossary: nextGlossary,
        deepDive: {
          sectionTitle: asText(currentDeepDive?.sectionTitle) || "延伸阅读",
          curatedReading: mergedReadings,
        },
        "agentOutputs.enrichment.taskId": task._id,
        "agentOutputs.enrichment.generatedAt": new Date(),
        "agentOutputs.enrichment.forceOverwrite": forceOverwrite,
        "agentOutputs.enrichment.suggestedGlossary": suggestedGlossary,
        "agentOutputs.enrichment.suggestedReadings": suggestedReadings,
      },
    },
    { new: false }
  );

  await syncProgramDictionaryEntries(String(task.targetId), nextGlossary, "ai_program");

  return {
    outputSummary: `完成资料收集：建议术语 ${suggestedGlossary.length} 项，延伸阅读 ${suggestedReadings.length} 项。`,
    output: {
      forceOverwrite,
      suggestedGlossary,
      suggestedReadings,
      mergedGlossaryCount: nextGlossary.length,
      runtimeConfig: {
        agent_code: taskConfig.agentCode,
        prompt_version: asText(taskConfig.promptDoc?.version),
        prompt_created_at: asText(taskConfig.promptDoc?.created_at),
        model_provider: asText(taskConfig.model?.provider),
        model_name: asText(taskConfig.model?.model_name),
      },
    },
  };
}

async function runGuestProfileTask(task: any) {
  const taskConfig = resolveTaskConfig(task.taskType as AgentTaskType);
  const guest = await GuestModel.findById(task.targetId);
  if (!guest) throw new Error("嘉宾不存在");

  const overrides = task?.options?.guestProfileContext || {};
  const guestName = asText(overrides?.name) || asText((guest as any).name) || "嘉宾";
  const guestTitle = asText(overrides?.title) || asText((guest as any).title) || "特邀嘉宾";
  const guestBio = asText(overrides?.bio) || asText((guest as any).bio);
  const profileUrl = asText(overrides?.profileUrl) || asText((guest as any).profileUrl);
  const existingReferences = (Array.isArray((guest as any).profileReferences) ? (guest as any).profileReferences : [])
    .map((item: any) => ({
      title: asText(item?.title),
      url: asText(item?.url),
      note: asText(item?.note) || "手工维护来源",
    }))
    .filter((item) => item.url && looksLikeReferenceUrl(item.url));
  const overrideReferences = (Array.isArray(overrides?.profileReferences) ? overrides.profileReferences : [])
    .map((item: any) => ({
      title: asText(item?.title),
      url: asText(item?.url),
      note: asText(item?.note) || "手工维护来源",
    }))
    .filter((item) => item.url && looksLikeReferenceUrl(item.url));
  const existingSocialProfiles = (Array.isArray((guest as any).socialProfiles) ? (guest as any).socialProfiles : [])
    .map((item: any, index: number) => ({
      platform: asText(item?.platform) || inferSocialPlatform(asText(item?.url)),
      label: asText(item?.label) || asText(item?.platform) || "公开账号",
      url: asText(item?.url),
      note: asText(item?.note),
      order: Number(item?.order) || index + 1,
      status: item?.status === "inactive" ? "inactive" : "active",
    }))
    .filter((item) => item.url && item.platform);
  const overrideSocialProfiles = (Array.isArray(overrides?.socialProfiles) ? overrides.socialProfiles : [])
    .map((item: any, index: number) => ({
      platform: asText(item?.platform) || inferSocialPlatform(asText(item?.url)),
      label: asText(item?.label) || asText(item?.platform) || "公开账号",
      url: asText(item?.url),
      note: asText(item?.note),
      order: Number(item?.order) || index + 1,
      status: item?.status === "inactive" ? "inactive" : "active",
    }))
    .filter((item) => item.url && item.platform);
  const existingPublications = (Array.isArray((guest as any).publications) ? (guest as any).publications : [])
    .map((item: any, index: number) => ({
      type: inferPublicationType(asText(item?.type), asText(item?.url)),
      title: asText(item?.title),
      url: asText(item?.url),
      source: asText(item?.source),
      publishedAt: asText(item?.publishedAt),
      summary: asText(item?.summary),
      note: asText(item?.note),
      order: Number(item?.order) || index + 1,
      status: item?.status === "inactive" ? "inactive" : "active",
    }))
    .filter((item) => item.title && item.url);
  const overridePublications = (Array.isArray(overrides?.publications) ? overrides.publications : [])
    .map((item: any, index: number) => ({
      type: inferPublicationType(asText(item?.type), asText(item?.url)),
      title: asText(item?.title),
      url: asText(item?.url),
      source: asText(item?.source),
      publishedAt: asText(item?.publishedAt),
      summary: asText(item?.summary),
      note: asText(item?.note),
      order: Number(item?.order) || index + 1,
      status: item?.status === "inactive" ? "inactive" : "active",
    }))
    .filter((item) => item.title && item.url);
  const relatedPrograms = await Program.find(
    { "guestBindings.guestId": (guest as any)._id },
    { _id: 1, title: 1, programCode: 1, summary: 1, updatedAt: 1 }
  )
    .sort({ updatedAt: -1 })
    .limit(5)
    .lean();

  const fallbackReferences = [
    ...overrideReferences,
    ...existingReferences,
    profileUrl && looksLikeReferenceUrl(profileUrl)
      ? { title: `${guestName} 官方档案`, url: profileUrl, note: "手工维护来源" }
      : null,
    {
      title: `${guestName} 百科`,
      url: `https://baike.baidu.com/item/${encodeURIComponent(guestName)}`,
      note: "公开参考链接",
    },
    {
      title: `${guestName} 维基`,
      url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(guestName)}`,
      note: "公开参考链接",
    },
  ].filter(Boolean) as Array<{ title: string; url: string; note: string }>;
  const dedupedFallbackReferences = fallbackReferences.filter((item, index, list) => {
    const normalizedUrl = asText(item?.url);
    if (!normalizedUrl) return false;
    return list.findIndex((entry) => asText(entry?.url) === normalizedUrl) === index;
  });

  const fallbackAvatarCandidates = [
    asText((guest as any).avatar)
      ? { url: asText((guest as any).avatar), label: "当前头像", sourceUrl: asText((guest as any).avatar) }
      : null,
  ].filter(Boolean) as Array<{ url: string; label: string; sourceUrl: string }>;

  const userPrompt = [
    `目标嘉宾：${guestName}`,
    `现有头衔：${guestTitle || "未知"}`,
    `现有简介：${guestBio || "无"}`,
    profileUrl ? `已有人工链接：${profileUrl}` : "",
    (overrideReferences.length || existingReferences.length)
      ? `已有公开参考链接：${[...overrideReferences, ...existingReferences]
          .filter((item, index, list) => list.findIndex((entry) => asText(entry?.url) === asText(item?.url)) === index)
          .map((item) => `${item.title || "未命名"}｜${item.url}${item.note ? `｜${item.note}` : ""}`)
          .join("；")}`
      : "",
    relatedPrograms.length
      ? `关联节目上下文：${relatedPrograms
          .map((item: any) => {
            const summaryHeadline = asText(item?.summary?.headline);
            return `${asText(item?.title)}${asText(item?.programCode) ? `（${asText(item?.programCode)}）` : ""}${summaryHeadline ? `｜${summaryHeadline}` : ""}`;
          })
          .join("；")}`
      : "",
    "",
    "请输出 JSON，字段必须包含：",
    "{",
    '  "brief_intro": "string",',
    '  "main_areas": ["string"],',
    '  "keywords": ["string"],',
    '  "materials": [{"material_type":"访谈/著作/论文/公开言论","title":"string","source":"string","publish_time":"string","core_content":"string","source_link":"https://..."}],',
    '  "references": [{"title":"string","url":"https://...","note":"string"}],',
    '  "avatar_candidates": [{"url":"https://...","label":"string","sourceUrl":"https://..."}],',
    '  "note": "string"',
    "}",
    "要求：",
    "0) 必须结合姓名、头衔、简介、已有人工链接和关联节目上下文做人名消歧，只能寻找与这些身份线索一致的同一位嘉宾。",
    "1) 仅保留公开可核验资料，不确定就留空或在 note 说明。",
    "2) references/materials/source_link 尽量使用可访问链接，优先作者官网、机构页、百科词条页、出版页、访谈原文页。",
    "3) 禁止返回任何搜索入口页、搜索结果页、图片检索页、占位头像或图库检索链接。",
    "4) avatar_candidates 只返回真实人物照片或机构页公开头像，拿不到就留空数组。",
    "5) 如果出现同名人物冲突，优先选择与头衔、机构、节目主题全部匹配的结果；如果无法确认，就不要编造链接，并在 note 里明确说明冲突原因。",
    "6) 不要输出 markdown，不要输出代码块，只输出 JSON 对象。",
  ]
    .filter(Boolean)
    .join("\n");

  const aiResult = await callAgentModelForJson(taskConfig, userPrompt);
  const parsed = aiResult.parsed || {};

  const references = (Array.isArray(parsed?.references) ? parsed.references : [])
    .map((item: any) => ({
      title: asText(item?.title),
      url: asText(item?.url),
      note: asText(item?.note) || "公开参考链接",
    }))
    .filter((item: any) => item.title && isRealReferenceUrl(item.url));
  const nextReferences = [...overrideReferences, ...existingReferences, ...(references.length ? references : dedupedFallbackReferences)]
    .filter((item, index, list) => {
      const normalizedUrl = asText(item?.url);
      if (!normalizedUrl) return false;
      return list.findIndex((entry) => asText(entry?.url) === normalizedUrl) === index;
    })
    .slice(0, 8);
  const nextSocialProfiles = [...overrideSocialProfiles, ...existingSocialProfiles, ...nextReferences
    .map((item, index) => {
      const platform = inferSocialPlatform(item.url);
      if (!platform) return null;
      return {
        platform,
        label: item.title || platform,
        url: item.url,
        note: item.note,
        order: index + 1,
        status: "active" as const,
      };
    })
    .filter(Boolean) as Array<{ platform: string; label: string; url: string; note: string; order: number; status: "active" | "inactive" }>]
    .filter((item, index, list) => {
      const normalizedUrl = asText(item?.url);
      if (!normalizedUrl) return false;
      return list.findIndex((entry) => asText(entry?.url) === normalizedUrl) === index;
    })
    .slice(0, 8)
    .map((item, index) => ({ ...item, order: index + 1 }));

  const avatarCandidates = (Array.isArray(parsed?.avatar_candidates) ? parsed.avatar_candidates : [])
    .map((item: any) => ({
      url: asText(item?.url),
      label: asText(item?.label) || "候选头像",
      sourceUrl: asText(item?.sourceUrl),
    }))
    .filter((item: any) => looksLikeReferenceUrl(item.url) && !isPlaceholderAvatarUrl(item.url));

  const referenceDocs = await Promise.all(
    nextReferences
      .filter((item) => isRealReferenceUrl(item.url))
      .slice(0, 4)
      .map(async (item) => ({
        reference: item,
        doc: await fetchReferenceDocument(item.url),
      }))
  );

  const enrichedAvatarCandidates = referenceDocs
    .map(({ reference, doc }) => {
      if (!looksLikeReferenceUrl(doc.image) || isPlaceholderAvatarUrl(doc.image)) return null;
      return {
        url: doc.image,
        label: reference.title || doc.title || "公开头像候选",
        sourceUrl: reference.url,
      };
    })
    .filter(Boolean) as Array<{ url: string; label: string; sourceUrl: string }>;

  const nextAvatarCandidates = [...avatarCandidates, ...enrichedAvatarCandidates, ...fallbackAvatarCandidates]
    .filter((item, index, list) => {
      const url = asText(item?.url);
      if (!url || isPlaceholderAvatarUrl(url)) return false;
      return list.findIndex((entry) => asText(entry?.url) === url) === index;
    })
    .slice(0, 6);

  const keywords = (Array.isArray(parsed?.keywords) ? parsed.keywords : [])
    .map((x: any) => asText(x))
    .filter(Boolean)
    .slice(0, 8);

  const materials = (Array.isArray(parsed?.materials) ? parsed.materials : [])
    .map((item: any) => ({
      material_type: asText(item?.material_type) || "公开资料",
      title: asText(item?.title),
      source: asText(item?.source),
      publish_time: asText(item?.publish_time),
      core_content: asText(item?.core_content),
      source_link: asText(item?.source_link),
    }))
    .filter((item: any) => item.title && (item.source || isRealReferenceUrl(item.source_link)))
    .slice(0, 12);

  const fallbackMaterials = referenceDocs
    .map(({ reference, doc }) => {
      if (!reference.url) return null;
      return {
        material_type: "公开资料",
        title: reference.title || doc.title || guestName,
        source: reference.note || doc.title || "公开页面",
        publish_time: "",
        core_content: doc.description || `${guestName} 相关公开资料页，建议人工补充代表观点与经历。`,
        source_link: reference.url,
      };
    })
    .filter((item) => item && item.title && isRealReferenceUrl(item.source_link))
    .slice(0, 6) as Array<{
      material_type: string;
      title: string;
      source: string;
      publish_time: string;
      core_content: string;
      source_link: string;
    }>;

  const nextMaterials = materials.length ? materials : fallbackMaterials;
  const nextPublications = [...overridePublications, ...existingPublications, ...nextMaterials
    .map((item, index) => ({
      type: inferPublicationType(item.material_type, item.source_link),
      title: item.title,
      url: item.source_link,
      source: item.source,
      publishedAt: item.publish_time,
      summary: item.core_content,
      note: "",
      order: index + 1,
      status: "active" as const,
    }))
    .filter((item) => item.title && isRealReferenceUrl(item.url))]
    .filter((item, index, list) => {
      const normalizedUrl = asText(item?.url);
      if (!normalizedUrl) return false;
      return list.findIndex((entry) => asText(entry?.url) === normalizedUrl) === index;
    })
    .slice(0, 12)
    .map((item, index) => ({ ...item, order: index + 1 }));

  const briefIntro = asText(parsed?.brief_intro) || guestBio || "暂无完整简介，建议结合公开访谈、出版物和机构介绍补全。";
  const mainAreas = (Array.isArray(parsed?.main_areas) ? parsed.main_areas : [])
    .map((x: any) => asText(x))
    .filter(Boolean)
    .slice(0, 6);
  const note = asText(parsed?.note);

  const markdown = [
    `# ${guestName}`,
    "",
    `> ${guestTitle}`,
    "",
    "## 简介",
    briefIntro,
    "",
    "## 主要领域",
    ...(mainAreas.length ? mainAreas.map((x) => `- ${x}`) : ["- 待补充"]),
    "",
    "## 关键词",
    ...(keywords.length ? keywords.map((x) => `- ${x}`) : [`- ${guestTitle}`, "- 节目嘉宾"]),
    "",
    "## 资料条目",
    ...(nextMaterials.length
      ? nextMaterials.map(
          (item) =>
            `- ${item.material_type}｜${item.title}${item.source ? `（${item.source}）` : ""}${item.publish_time ? `｜${item.publish_time}` : ""}${item.source_link ? `\n  - 链接：${item.source_link}` : ""}${item.core_content ? `\n  - 摘要：${item.core_content}` : ""}`
        )
      : ["- 暂无可核验条目，请人工补充。"]),
    "",
    "## 资料索引",
    ...nextReferences.map((item) => `- [${item.title}](${item.url})${item.note ? ` - ${item.note}` : ""}`),
    "",
    "## 节目相关备注",
    `- ${note || "建议在节目详情中同步维护嘉宾核心观点与代表案例。"}${aiResult.error ? `（模型调用异常：${aiResult.error}）` : ""}`,
  ].join("\n");

  await GuestModel.findByIdAndUpdate(
    task.targetId,
    {
      $set: {
        profileMarkdown: markdown,
        profileReferences: nextReferences,
        socialProfiles: nextSocialProfiles,
        publications: nextPublications,
        profileAvatarCandidates: nextAvatarCandidates,
        profileGeneratedAt: new Date(),
      },
    },
    { new: false }
  );

  return {
    outputSummary: "已生成嘉宾资料草稿、外链索引与头像候选。",
    output: {
      profileMarkdown: markdown,
      profileReferences: nextReferences,
      socialProfiles: nextSocialProfiles,
      publications: nextPublications,
      avatarCandidates: nextAvatarCandidates,
      materials: nextMaterials,
      aiError: aiResult.error || "",
      runtimeConfig: {
        agent_code: taskConfig.agentCode,
        prompt_version: asText(taskConfig.promptDoc?.version),
        prompt_created_at: asText(taskConfig.promptDoc?.created_at),
        model_provider: asText(taskConfig.model?.provider),
        model_name: asText(taskConfig.model?.model_name),
      },
    },
  };
}

async function runProgramArtworkTask(task: any) {
  const taskConfig = resolveTaskConfig(task.taskType as AgentTaskType);
  const program = await Program.findById(task.targetId);
  if (!program) throw new Error("节目不存在");

  const forceOverwrite = task?.options?.forceOverwrite === true;
  const title = asText((program as any)?.title);
  const tags = Array.isArray((program as any)?.summary?.tags) ? (program as any).summary.tags : [];
  const summaryText = asText((program as any)?.summary?.body);
  const transcriptText = (Array.isArray((program as any)?.transcript) ? (program as any)?.transcript : [])
    .map((x: any) => asText(x?.text))
    .filter(Boolean)
    .join(" ");
  const terms = extractCandidateTerms(`${title} ${summaryText} ${transcriptText}`).slice(0, 8);
  const keyword = asText(tags[0]) || terms[0] || title || "教育";
  const parsedSignals = await collectParsedSignals(program);
  const artworkStyle = normalizeArtworkStyle(task?.options?.artworkStyle);
  const promptPackage = buildArtworkPromptPackage({
    semanticCore: tags.length ? tags.slice(0, 6) : terms.slice(0, 6),
    parsedSignals,
    style: artworkStyle,
    title,
    summaryText: summaryText || transcriptText,
    promptDoc: taskConfig.promptDoc,
  });
  const generatedUrl = await callAgentImageModel(taskConfig, promptPackage);
  const currentCover = asText((program as any)?.coverImage);
  const shouldApplyCover = forceOverwrite || !currentCover;

  if (shouldApplyCover) {
    await Program.findByIdAndUpdate(
      task.targetId,
      {
        $set: {
          coverImage: generatedUrl,
        },
      },
      { new: false }
    );
  }

  return {
    outputSummary: shouldApplyCover
      ? "配图 agent 已基于节目关键词按统一东方美学系列调用 Seedream 生图并应用封面。"
      : "配图 agent 已基于节目关键词按统一东方美学系列调用 Seedream 生成候选封面（未覆盖现有封面）。",
    output: {
      forceOverwrite,
      artworkStyle,
      generatedCoverImage: generatedUrl,
      previousCoverImage: currentCover,
      applied: shouldApplyCover,
      keyword,
      semanticCore: tags.length ? tags.slice(0, 6) : terms.slice(0, 6),
      parsedSignals,
      promptPackage,
      runtimeConfig: {
        agent_code: taskConfig.agentCode,
        prompt_version: asText(taskConfig.promptDoc?.version),
        prompt_created_at: asText(taskConfig.promptDoc?.created_at),
        model_provider: asText(taskConfig.model?.provider),
        model_name: asText(taskConfig.model?.model_name),
      },
    },
  };
}

async function runTaskByType(task: any): Promise<{ outputSummary: string; output: Record<string, any> }> {
  if (task.taskType === "proofread_transcript") return runProofreadTask(task);
  if (task.taskType === "enrich_program_content") return runProgramEnrichmentTask(task);
  if (task.taskType === "enrich_guest_profile") return runGuestProfileTask(task);
  if (task.taskType === "generate_program_artwork") return runProgramArtworkTask(task);
  throw new Error(`未知任务类型: ${task.taskType}`);
}

async function finalizeTaskSuccess(task: any, result: { outputSummary: string; output: Record<string, any> }) {
  const nextTask = await AgentTaskModel.findByIdAndUpdate(task._id, {
    $set: {
      status: "succeeded",
      progress: 100,
      stage: "completed",
      outputSummary: clipText(result.outputSummary, 300),
      output: result.output,
      finishedAt: new Date(),
      lockToken: "",
    },
  }, { new: true });
  if (nextTask) {
    await createInboxMessage({
      sourceType: "agent_task",
      sourceId: String(nextTask._id),
      taskType: nextTask.taskType as any,
      taskStatus: "succeeded",
      targetType: nextTask.targetType as any,
      targetId: String(nextTask.targetId),
      summary: asText(nextTask.outputSummary),
      payload: {
        taskId: String(nextTask._id),
        taskType: nextTask.taskType,
        targetType: nextTask.targetType,
        targetId: String(nextTask.targetId),
        outputSummary: asText(nextTask.outputSummary),
        output: nextTask.output || {},
        finishedAt: nextTask.finishedAt || null,
      },
    }).catch(() => {});
  }
}

async function finalizeTaskFailure(task: any, message: string) {
  const nextTask = await AgentTaskModel.findByIdAndUpdate(task._id, {
    $set: {
      status: "failed",
      progress: 100,
      stage: "failed",
      lastError: message,
      finishedAt: new Date(),
      lockToken: "",
    },
    $inc: { retries: 1 },
  }, { new: true });
  if (nextTask) {
    await createInboxMessage({
      sourceType: "agent_task",
      sourceId: String(nextTask._id),
      taskType: nextTask.taskType as any,
      taskStatus: "failed",
      targetType: nextTask.targetType as any,
      targetId: String(nextTask.targetId),
      summary: asText(nextTask.lastError) || "任务执行失败",
      payload: {
        taskId: String(nextTask._id),
        taskType: nextTask.taskType,
        targetType: nextTask.targetType,
        targetId: String(nextTask.targetId),
        lastError: asText(nextTask.lastError),
        retries: Number(nextTask.retries || 0),
        finishedAt: nextTask.finishedAt || null,
      },
    }).catch(() => {});
  }
}

async function processTaskLifecycle(task: any): Promise<void> {
  try {
    const result = await runTaskByType(task);
    await finalizeTaskSuccess(task, result);
  } catch (error: any) {
    const message = asText(error?.message) || "任务执行失败";
    await finalizeTaskFailure(task, message);
  }
}

function shouldRunDirectly(taskType: AgentTaskType): boolean {
  return taskType === "generate_program_artwork" || taskType === "enrich_guest_profile";
}

function kickoffDirectTask(task: any) {
  setTimeout(() => {
    processTaskLifecycle(task).catch((error) => {
      console.error("[agent-task] direct task failed", error);
    });
  }, 0);
}

async function processOneTask(): Promise<void> {
  if (working) return;
  working = true;
  try {
    const lockToken = crypto.randomUUID();
    const task = await AgentTaskModel.findOneAndUpdate(
      { status: "queued" },
      {
        $set: {
          status: "running",
          progress: 5,
          stage: "running",
          startedAt: new Date(),
          finishedAt: null,
          lastError: "",
          lockToken,
        },
      },
      {
        new: true,
        sort: { createdAt: 1 },
      }
    );
    if (!task) return;
    await processTaskLifecycle(task);
  } finally {
    working = false;
  }
}

export async function recoverRunningAgentTasks() {
  await AgentTaskModel.updateMany(
    { status: "running" },
    {
      $set: {
        status: "queued",
        stage: "recovered",
        progress: 0,
        lockToken: "",
      },
    }
  );
}

export async function startAgentTaskDispatcher() {
  await recoverRunningAgentTasks();
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    processOneTask().catch(() => {});
  }, POLL_MS);
}

export function stopAgentTaskDispatcher() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

export async function validateTaskTarget(targetType: AgentTaskTargetType, targetId: string) {
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    throw new Error("targetId 非法");
  }
  if (targetType === "program") {
    const exists = await Program.exists({ _id: new mongoose.Types.ObjectId(targetId) });
    if (!exists) throw new Error("目标节目不存在");
    return;
  }
  if (targetType === "guest") {
    const exists = await GuestModel.exists({ _id: new mongoose.Types.ObjectId(targetId) });
    if (!exists) throw new Error("目标嘉宾不存在");
    return;
  }
  throw new Error("未知目标类型");
}

export async function createAgentTask(input: CreateTaskInput) {
  await validateTaskTarget(input.targetType, input.targetId);
  const directRun = shouldRunDirectly(input.taskType);
  const lockToken = directRun ? crypto.randomUUID() : "";
  const created = await AgentTaskModel.create({
    taskType: input.taskType,
    targetType: input.targetType,
    targetId: new mongoose.Types.ObjectId(input.targetId),
    options: input.options || {},
    createdBy: asText(input.createdBy),
    maxRetries: Number.isFinite(Number(input.maxRetries)) ? Number(input.maxRetries) : 2,
    status: directRun ? "running" : "queued",
    progress: directRun ? 5 : 0,
    stage: directRun ? "running" : "queued",
    startedAt: directRun ? new Date() : null,
    lockToken,
  });
  if (directRun) kickoffDirectTask(created);
  return created;
}

export async function retryAgentTask(taskId: string) {
  if (!mongoose.Types.ObjectId.isValid(taskId)) throw new Error("任务 ID 非法");
  const task = await AgentTaskModel.findById(taskId);
  if (!task) throw new Error("任务不存在");
  if (task.status !== "failed" && task.status !== "canceled") {
    throw new Error("仅失败或已取消任务可重试");
  }
  const directRun = shouldRunDirectly(task.taskType as AgentTaskType);
  const lockToken = directRun ? crypto.randomUUID() : "";
  const nextTask = await AgentTaskModel.findByIdAndUpdate(taskId, {
    $set: {
      status: directRun ? "running" : "queued",
      stage: directRun ? "running" : "queued",
      progress: directRun ? 5 : 0,
      startedAt: directRun ? new Date() : null,
      finishedAt: null,
      lastError: "",
      lockToken,
    },
  }, { new: true });
  if (directRun && nextTask) kickoffDirectTask(nextTask);
  return nextTask;
}

export function normalizeTaskResponse(task: any) {
  if (!task) return null;
  return {
    _id: String(task._id),
    taskType: task.taskType as AgentTaskType,
    targetType: task.targetType as AgentTaskTargetType,
    targetId: String(task.targetId),
    status: task.status as AgentTaskStatus,
    options: task.options || {},
    retries: Number(task.retries) || 0,
    maxRetries: Number(task.maxRetries) || 0,
    progress: Number(task.progress) || 0,
    stage: asText(task.stage),
    createdBy: asText(task.createdBy),
    startedAt: task.startedAt || null,
    finishedAt: task.finishedAt || null,
    lastError: asText(task.lastError),
    outputSummary: asText(task.outputSummary),
    output: task.output || {},
    createdAt: task.createdAt || null,
    updatedAt: task.updatedAt || null,
  };
}
