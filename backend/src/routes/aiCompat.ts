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
    "\n请输出严格 JSON，不要 Markdown。字段包括：brand, title, summary, verdict, strengths, risks, suggestions, recommendedAge, evidence。",
    "verdict 用一句话说明是否值得买；strengths/risks/suggestions/evidence 使用字符串数组。",
  ].filter(Boolean).join("\n\n");
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
        max_tokens: 1200,
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
      return res.json({ ...parsed, rag: { status: rag.status, provider: rag.provider, citationCount: rag.citations.length } });
    }
    return res.json({
      brand: searchTarget,
      title: searchTarget,
      summary: text || "资料中没有明确提到。",
      verdict: "需结合家庭需求进一步判断。",
      strengths: [],
      risks: [],
      suggestions: [],
      evidence: [],
      rag: { status: rag.status, provider: rag.provider, citationCount: rag.citations.length },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "analyze product failed" });
  }
});

export default router;
