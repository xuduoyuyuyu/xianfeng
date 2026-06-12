import express from "express";
import { ensureStore, resolveAgentModelConfig } from "../services/agentModelRegistry";
import { authenticate } from "../middlewares/auth";
import { requirePro } from "../middlewares/requirePro";
import { buildRagContext } from "../services/ragContextService";

const router = express.Router();

function latestSystemPrompt(store: any, agentCode: string): string {
  const promptBucket = store?.prompts?.[agentCode] || { current: null, items: [] };
  const promptCandidates = [promptBucket.current, ...(Array.isArray(promptBucket.items) ? promptBucket.items : [])].filter(Boolean);
  const latestPromptDoc = [...promptCandidates].sort((a: any, b: any) => {
    const at = String(a?.created_at || "");
    const bt = String(b?.created_at || "");
    if (at !== bt) return bt.localeCompare(at);
    return Number(b?.id || 0) - Number(a?.id || 0);
  })[0];
  return String(latestPromptDoc?.system_prompt || "").trim();
}

function jsonFromModelText(text: string): any {
  const clean = String(text || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
  }
  return null;
}

function productAnalysisPrompt(input: { searchTarget: string; productInfo: string; ragBlock: string }) {
  return [
    input.ragBlock,
    "[商品/品牌]",
    input.searchTarget,
    input.productInfo ? `\n[页面信息]\n${input.productInfo}` : "",
    `请输出严格 JSON，不要 Markdown。字段必须对齐知物详情页报告：
{
  "brand": "商品或品牌名",
  "score": 0-100,
  "isIqTax": true,
  "reason": "一句话总评",
  "pros": ["优点1", "优点2", "优点3"],
  "cons": ["缺点1", "缺点2", "缺点3"],
  "businessModel": "推荐人动机/商业模式分析",
  "commentAnalysis": "评论真实性分析",
  "recommendation": "综合推荐",
  "priceRange": "价格区间",
  "ratingDimensions": { "cost": 0-100, "quality": 0-100, "safety": 0-100, "experience": 0-100, "afterSales": 0-100 },
  "dataPoints": ["关键依据1", "关键依据2"],
  "suitableFor": ["适合人群1"],
  "notSuitableFor": ["不适合人群1"],
  "alternatives": [{ "name": "替代品", "price": "价格", "score": 0-100, "reason": "理由" }],
  "buyAdvice": "购买建议"
}`,
    "如果页面信息不足，要明确说明证据不足；不要编造具体销量、认证、评测机构或价格。",
  ].filter(Boolean).join("\n\n");
}

function clampScore(value: any, fallback = 50): number {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(0, number));
}

function asText(value: any): string {
  return String(value || "").trim();
}

function toStringArray(value: any, max = 5): string[] {
  return Array.isArray(value)
    ? value.map((item) => asText(item)).filter(Boolean).slice(0, max)
    : [];
}

function buildFallbackDataPoints(input: {
  title: string;
  reason: string;
  pros: string[];
  cons: string[];
  recommendation: string;
}): string[] {
  return [
    input.title ? `识别商品：${input.title}` : "",
    input.reason,
    ...input.pros.slice(0, 2),
    ...input.cons.slice(0, 2),
    input.recommendation,
  ].map(asText).filter(Boolean).slice(0, 6);
}

function buildFallbackBusinessModel(title: string, pros: string[], cons: string[]): string {
  const product = title || "该商品";
  const sellingPoint = pros[0] || "品牌、功能或使用场景";
  const risk = cons[0] || "参数和真实体验仍需核实";
  return `${product}的推荐动机通常围绕“${sellingPoint}”展开；如果来自达人种草、平台活动或返佣链接，需要同时核对价格、认证和真实使用反馈，避免只被卖点包装影响。当前主要不确定点是：${risk}。`;
}

function buildFallbackCommentAnalysis(title: string, dataPoints: string[]): string {
  const product = title || "该商品";
  const evidence = dataPoints[0] || "商品标题和现有分析依据";
  return `${product}目前缺少可量化的评论样本，不能仅凭单条分享文案判断口碑。建议重点查看差评、追评和带图评论，尤其核对护眼效果、稳定性、售后和长期使用体验；当前可用依据包括：${evidence}。`;
}

export function normalizeWorthBuyAnalysis(raw: any, fallbackBrand: string, fallbackText = "") {
  const pros = toStringArray(raw?.pros?.length ? raw.pros : raw?.strengths, 5);
  const cons = toStringArray(raw?.cons?.length ? raw.cons : raw?.risks, 5);
  const reason = asText(raw?.reason) || asText(raw?.verdict) || asText(raw?.summary) || fallbackText || "资料不足，需结合实际需求进一步判断。";
  const recommendation = asText(raw?.recommendation) || toStringArray(raw?.suggestions, 3).join("；") || reason;
  const brand = asText(raw?.brand) || asText(raw?.title) || fallbackBrand;
  const evidence = toStringArray(raw?.dataPoints?.length ? raw.dataPoints : raw?.evidence, 8);
  const dataPoints = evidence.length ? evidence : buildFallbackDataPoints({ title: brand, reason, pros, cons, recommendation });

  return {
    brand,
    score: clampScore(raw?.score, 50),
    isIqTax: Boolean(raw?.isIqTax),
    reason,
    pros,
    cons,
    businessModel: asText(raw?.businessModel) || buildFallbackBusinessModel(brand, pros, cons),
    commentAnalysis: asText(raw?.commentAnalysis) || buildFallbackCommentAnalysis(brand, dataPoints),
    recommendation,
    analyzedAt: new Date().toISOString(),
    priceRange: asText(raw?.priceRange),
    ratingDimensions: {
      cost: clampScore(raw?.ratingDimensions?.cost, 50),
      quality: clampScore(raw?.ratingDimensions?.quality, 50),
      safety: clampScore(raw?.ratingDimensions?.safety, 50),
      experience: clampScore(raw?.ratingDimensions?.experience, 50),
      afterSales: clampScore(raw?.ratingDimensions?.afterSales, 50),
    },
    dataPoints,
    references: Array.isArray(raw?.references) ? raw.references.slice(0, 6) : [],
    suitableFor: toStringArray(raw?.suitableFor, 5),
    notSuitableFor: toStringArray(raw?.notSuitableFor, 5),
    alternatives: Array.isArray(raw?.alternatives)
      ? raw.alternatives.slice(0, 3).map((item: any) => ({
          name: asText(item?.name),
          price: asText(item?.price),
          score: clampScore(item?.score, 50),
          reason: asText(item?.reason),
        })).filter((item: any) => item.name || item.reason)
      : [],
    buyAdvice: asText(raw?.buyAdvice),
  };
}

router.post("/chat", authenticate, requirePro("ai_chat"), async (req, res) => {
  try {
    const body = req.body || {};
    const prompt = String(body.prompt || "").trim();
    const incomingMessages = Array.isArray(body.messages) ? body.messages : [];
    if (!prompt && incomingMessages.length === 0) {
      return res.status(400).json({ error: "prompt or messages is required" });
    }

    const store = ensureStore(() => ({
      agents: [],
      prompts: {},
      policies: {},
      strategies: {},
      runs: [],
    }));
    const chatAgent = store.agents.find((x: any) => x.agent_code === "chat_manager_agent");
    if (!chatAgent) {
      return res.status(500).json({ error: "chat_manager_agent 未配置" });
    }

    const resolved = resolveAgentModelConfig(chatAgent as any, store.model_registry || []);
    const modelCfg = resolved.primary;
    const apiKey = String(modelCfg?.api_key || "").trim();
    const modelName = String(modelCfg?.model_name || "").trim();
    const provider = String(modelCfg?.provider || "").trim();
    const baseUrl = String(modelCfg?.base_url || "").trim() || "https://api.openai.com";
    if (!apiKey || !modelName) {
      return res.status(500).json({ error: "小玩子主模型未配置完整（缺少 api_key 或 model_name）" });
    }

    const history = incomingMessages
      .map((m: any) => ({
        role: String(m?.role || "").trim(),
        content: String(m?.content || ""),
      }))
      .filter((m: any) => (m.role === "user" || m.role === "assistant" || m.role === "system") && m.content);

    const backendSystemPrompt = latestSystemPrompt(store, "chat_manager_agent");

    const userPrompt = prompt || String(history[history.length - 1]?.content || "");
    const rag = await buildRagContext({ routeKey: "ai_chat", query: userPrompt });
    // Do not allow client-side system messages to override server-managed persona.
    const clientHistory = history.filter((m: any) => m.role !== "system");
    const finalMessages = [
      ...(backendSystemPrompt ? [{ role: "system", content: backendSystemPrompt }] : []),
      ...(rag.promptBlock ? [{ role: "system", content: rag.promptBlock }] : []),
      ...clientHistory.slice(-12),
      ...(prompt ? [{ role: "user", content: userPrompt }] : []),
    ];
    const endpoint = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: finalMessages.length ? finalMessages : [{ role: "user", content: userPrompt }],
        temperature: Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : Number((chatAgent as any).temperature) || 0.2,
        top_p: Number.isFinite(Number(body.top_p)) ? Number(body.top_p) : Number((chatAgent as any).top_p) || 0.95,
        max_tokens: Number.isFinite(Number(body.max_tokens)) ? Number(body.max_tokens) : Number((chatAgent as any).max_tokens) || 1200,
        stream: false,
      }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(502).json({
        error: `上游调用失败(${provider}/${modelName}): ${upstream.status} ${data?.error?.message || data?.message || "unknown"}`,
      });
    }
    const text = String(data?.choices?.[0]?.message?.content || "").trim() || "（模型返回空响应）";
    return res.json({ text, rag: { status: rag.status, provider: rag.provider, citationCount: rag.citations.length } });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "ai chat failed" });
  }
});

router.post("/analyze-product", async (req, res) => {
  try {
    const body = req.body || {};
    const searchTarget = String(body.url || body.brand || body.query || "").trim();
    const productInfo = String(body.productInfo || "").trim();
    if (!searchTarget) {
      return res.status(400).json({ error: "url or brand is required" });
    }

    const store = ensureStore(() => ({
      agents: [],
      prompts: {},
      policies: {},
      strategies: {},
      runs: [],
    }));
    const chatAgent = store.agents.find((x: any) => x.agent_code === "chat_manager_agent");
    if (!chatAgent) return res.status(500).json({ error: "chat_manager_agent 未配置" });
    const resolved = resolveAgentModelConfig(chatAgent as any, store.model_registry || []);
    const modelCfg = resolved.primary;
    const apiKey = String(modelCfg?.api_key || "").trim();
    const modelName = String(modelCfg?.model_name || "").trim();
    const provider = String(modelCfg?.provider || "").trim();
    const baseUrl = String(modelCfg?.base_url || "").trim() || "https://api.openai.com";
    if (!apiKey || !modelName) return res.status(500).json({ error: "商品分析模型未配置完整（缺少 api_key 或 model_name）" });

    const query = [searchTarget, productInfo].filter(Boolean).join("\n");
    const rag = await buildRagContext({ routeKey: "worthbuy_analysis", query });
    const endpoint = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: "system",
            content: "你是家长先疯的教育产品分析助手。只输出 JSON，判断要克制，不能编造证据。",
          },
          { role: "user", content: productAnalysisPrompt({ searchTarget, productInfo, ragBlock: rag.promptBlock }) },
        ],
        temperature: 0.2,
        top_p: 0.95,
        max_tokens: 3000,
        stream: false,
      }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(502).json({
        error: `上游调用失败(${provider}/${modelName}): ${upstream.status} ${data?.error?.message || data?.message || "unknown"}`,
      });
    }
    const text = String(data?.choices?.[0]?.message?.content || "").trim();
    const parsed = jsonFromModelText(text);
    if (parsed && typeof parsed === "object") {
      return res.json({
        ...normalizeWorthBuyAnalysis(parsed, searchTarget),
        rag: { status: rag.status, provider: rag.provider, citationCount: rag.citations.length },
      });
    }
    return res.json({
      ...normalizeWorthBuyAnalysis({}, searchTarget, text || "资料中没有明确提到。"),
      rag: { status: rag.status, provider: rag.provider, citationCount: rag.citations.length },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "analyze product failed" });
  }
});

export default router;
