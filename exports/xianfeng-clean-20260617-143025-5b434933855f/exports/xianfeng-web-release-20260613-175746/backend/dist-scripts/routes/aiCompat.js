"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const agentModelRegistry_1 = require("../services/agentModelRegistry");
const router = express_1.default.Router();
router.post("/chat", async (req, res) => {
    try {
        const body = req.body || {};
        const prompt = String(body.prompt || "").trim();
        const incomingMessages = Array.isArray(body.messages) ? body.messages : [];
        if (!prompt && incomingMessages.length === 0) {
            return res.status(400).json({ error: "prompt or messages is required" });
        }
        const store = (0, agentModelRegistry_1.ensureStore)(() => ({
            agents: [],
            prompts: {},
            policies: {},
            strategies: {},
            runs: [],
        }));
        const chatAgent = store.agents.find((x) => x.agent_code === "chat_manager_agent");
        if (!chatAgent) {
            return res.status(500).json({ error: "chat_manager_agent 未配置" });
        }
        const resolved = (0, agentModelRegistry_1.resolveAgentModelConfig)(chatAgent, store.model_registry || []);
        const modelCfg = resolved.primary;
        const apiKey = String(modelCfg?.api_key || "").trim();
        const modelName = String(modelCfg?.model_name || "").trim();
        const provider = String(modelCfg?.provider || "").trim();
        const baseUrl = String(modelCfg?.base_url || "").trim() || "https://api.openai.com";
        if (!apiKey || !modelName) {
            return res.status(500).json({ error: "小玩子主模型未配置完整（缺少 api_key 或 model_name）" });
        }
        const history = incomingMessages
            .map((m) => ({
            role: String(m?.role || "").trim(),
            content: String(m?.content || ""),
        }))
            .filter((m) => (m.role === "user" || m.role === "assistant" || m.role === "system") && m.content);
        const promptBucket = store?.prompts?.chat_manager_agent || { current: null, items: [] };
        const promptCandidates = [promptBucket.current, ...(Array.isArray(promptBucket.items) ? promptBucket.items : [])].filter(Boolean);
        const latestPromptDoc = [...promptCandidates].sort((a, b) => {
            const at = String(a?.created_at || "");
            const bt = String(b?.created_at || "");
            if (at !== bt)
                return bt.localeCompare(at);
            return Number(b?.id || 0) - Number(a?.id || 0);
        })[0];
        const backendSystemPrompt = String(latestPromptDoc?.system_prompt || "").trim();
        const userPrompt = prompt || String(history[history.length - 1]?.content || "");
        // Do not allow client-side system messages to override server-managed persona.
        const clientHistory = history.filter((m) => m.role !== "system");
        const finalMessages = [
            ...(backendSystemPrompt ? [{ role: "system", content: backendSystemPrompt }] : []),
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
                temperature: Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : Number(chatAgent.temperature) || 0.2,
                top_p: Number.isFinite(Number(body.top_p)) ? Number(body.top_p) : Number(chatAgent.top_p) || 0.95,
                max_tokens: Number.isFinite(Number(body.max_tokens)) ? Number(body.max_tokens) : Number(chatAgent.max_tokens) || 1200,
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
        return res.json({ text });
    }
    catch (error) {
        return res.status(500).json({ error: error?.message || "ai chat failed" });
    }
});
exports.default = router;
