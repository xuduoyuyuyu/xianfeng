"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middlewares/auth");
const requireAdmin_1 = require("../middlewares/requireAdmin");
const tutorbotManager_1 = require("../services/tutorbotManager");
const agentModelRegistry_1 = require("../services/agentModelRegistry");
const router = express_1.default.Router();
router.use(auth_1.authenticate, requireAdmin_1.requireAdmin);
router.get("/souls", (_req, res) => {
    res.json(tutorbotManager_1.tutorbotManager.listSouls());
});
router.post("/souls", (req, res) => {
    const { id, name, content } = req.body || {};
    if (!id || !name) {
        res.status(400).json({ detail: "id and name are required" });
        return;
    }
    if (tutorbotManager_1.tutorbotManager.getSoul(String(id))) {
        res.status(409).json({ detail: `Soul '${id}' already exists` });
        return;
    }
    res.status(201).json(tutorbotManager_1.tutorbotManager.createSoul(String(id), String(name), String(content || "")));
});
router.get("/souls/:soulId", (req, res) => {
    const soul = tutorbotManager_1.tutorbotManager.getSoul(req.params.soulId);
    if (!soul) {
        res.status(404).json({ detail: "Soul not found" });
        return;
    }
    res.json(soul);
});
router.put("/souls/:soulId", (req, res) => {
    const soul = tutorbotManager_1.tutorbotManager.updateSoul(req.params.soulId, req.body?.name, req.body?.content);
    if (!soul) {
        res.status(404).json({ detail: "Soul not found" });
        return;
    }
    res.json(soul);
});
router.delete("/souls/:soulId", (req, res) => {
    if (!tutorbotManager_1.tutorbotManager.deleteSoul(req.params.soulId)) {
        res.status(404).json({ detail: "Soul not found" });
        return;
    }
    res.json({ id: req.params.soulId, deleted: true });
});
router.get("", (_req, res) => {
    res.json(tutorbotManager_1.tutorbotManager.listBots());
});
router.get("/recent", (req, res) => {
    const limit = Number(req.query.limit || 3);
    res.json(tutorbotManager_1.tutorbotManager.getRecentActiveBots(limit));
});
router.post("", (req, res) => {
    const { bot_id: botId, name, description, persona, channels, model } = req.body || {};
    if (!botId) {
        res.status(400).json({ detail: "bot_id is required" });
        return;
    }
    const bot = tutorbotManager_1.tutorbotManager.startBot(String(botId), {
        name: name ? String(name) : String(botId),
        description: String(description || ""),
        persona: String(persona || ""),
        channels: typeof channels === "object" && channels ? channels : {},
        model: model ? String(model) : null,
    });
    res.json(bot);
});
router.get("/:botId", (req, res) => {
    const bot = tutorbotManager_1.tutorbotManager.getBot(req.params.botId);
    if (!bot) {
        res.status(404).json({ detail: "Bot not found" });
        return;
    }
    res.json(bot);
});
router.delete("/:botId", (req, res) => {
    const ok = tutorbotManager_1.tutorbotManager.stopBot(req.params.botId);
    if (!ok) {
        res.status(404).json({ detail: "Bot not found or not running" });
        return;
    }
    res.json({ bot_id: req.params.botId, stopped: true });
});
router.delete("/:botId/destroy", (req, res) => {
    const ok = tutorbotManager_1.tutorbotManager.destroyBot(req.params.botId);
    if (!ok) {
        res.status(404).json({ detail: "Bot not found" });
        return;
    }
    res.json({ bot_id: req.params.botId, destroyed: true });
});
router.patch("/:botId", (req, res) => {
    const existing = tutorbotManager_1.tutorbotManager.getBot(req.params.botId);
    if (!existing) {
        res.status(404).json({ detail: "Bot not found" });
        return;
    }
    const next = tutorbotManager_1.tutorbotManager.startBot(req.params.botId, {
        name: req.body?.name ?? existing.name,
        description: req.body?.description ?? existing.description,
        persona: req.body?.persona ?? existing.persona,
        channels: req.body?.channels ?? {},
        model: req.body?.model ?? existing.model,
    });
    res.json(next);
});
router.get("/:botId/files", (req, res) => {
    res.json(tutorbotManager_1.tutorbotManager.readAllBotFiles(req.params.botId));
});
router.get("/:botId/files/:filename", (req, res) => {
    const content = tutorbotManager_1.tutorbotManager.readBotFile(req.params.botId, req.params.filename);
    if (content === null) {
        res.status(400).json({ detail: `Not an editable file: ${req.params.filename}` });
        return;
    }
    res.json({ filename: req.params.filename, content });
});
router.put("/:botId/files/:filename", (req, res) => {
    const ok = tutorbotManager_1.tutorbotManager.writeBotFile(req.params.botId, req.params.filename, String(req.body?.content || ""));
    if (!ok) {
        res.status(400).json({ detail: `Not an editable file: ${req.params.filename}` });
        return;
    }
    res.json({ filename: req.params.filename, saved: true });
});
router.get("/:botId/history", (req, res) => {
    const limit = Number(req.query.limit || 100);
    res.json(tutorbotManager_1.tutorbotManager.getBotHistory(req.params.botId, limit));
});
router.post("/:botId/messages", (req, res) => {
    const bot = tutorbotManager_1.tutorbotManager.getBot(req.params.botId);
    if (!bot || !bot.running) {
        res.status(404).json({ detail: "Bot not found or not running" });
        return;
    }
    const content = String(req.body?.content || "").trim();
    if (!content) {
        res.status(400).json({ detail: "content is required" });
        return;
    }
    tutorbotManager_1.tutorbotManager.appendHistory(req.params.botId, "user", content);
    (async () => {
        try {
            const store = (0, agentModelRegistry_1.ensureStore)(() => ({
                agents: [],
                prompts: {},
                policies: {},
                strategies: {},
                runs: [],
            }));
            const chatAgent = store.agents.find((x) => x.agent_code === "chat_manager_agent");
            if (!chatAgent) {
                throw new Error("chat_manager_agent 未配置");
            }
            const resolved = (0, agentModelRegistry_1.resolveAgentModelConfig)(chatAgent, store.model_registry || []);
            const modelCfg = resolved.primary;
            const apiKey = String(modelCfg?.api_key || "").trim();
            const modelName = String(modelCfg?.model_name || "").trim();
            const provider = String(modelCfg?.provider || "").trim();
            const baseUrl = String(modelCfg?.base_url || "").trim() || "https://api.openai.com";
            if (!apiKey || !modelName) {
                throw new Error("小玩子主模型未配置完整（缺少 api_key 或 model_name）");
            }
            const endpoint = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
            const promptBucket = store?.prompts?.chat_manager_agent || { current: null, items: [] };
            const promptCandidates = [promptBucket.current, ...(Array.isArray(promptBucket.items) ? promptBucket.items : [])].filter(Boolean);
            const latestPromptDoc = [...promptCandidates].sort((a, b) => {
                const at = String(a?.created_at || "");
                const bt = String(b?.created_at || "");
                if (at !== bt)
                    return bt.localeCompare(at);
                return Number(b?.id || 0) - Number(a?.id || 0);
            })[0];
            const latestPrompt = String(latestPromptDoc?.system_prompt || "").trim();
            const workspaceAgentDoc = String(tutorbotManager_1.tutorbotManager.readBotFile(req.params.botId, "AGENTS.md") || "").trim();
            const systemPrompt = latestPrompt || workspaceAgentDoc;
            const recentHistory = tutorbotManager_1.tutorbotManager
                .getBotHistory(req.params.botId, 12)
                .filter((item) => item.role === "user" || item.role === "assistant")
                .map((item) => ({ role: item.role, content: String(item.content || "") }))
                .filter((item) => item.content);
            const messages = [
                ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
                ...recentHistory,
            ];
            const upstream = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: messages.length ? messages : [{ role: "user", content }],
                    temperature: Number.isFinite(Number(chatAgent.temperature)) ? Number(chatAgent.temperature) : 0.2,
                    top_p: Number.isFinite(Number(chatAgent.top_p)) ? Number(chatAgent.top_p) : 0.95,
                    max_tokens: Number.isFinite(Number(chatAgent.max_tokens)) ? Number(chatAgent.max_tokens) : 1200,
                    stream: false,
                }),
            });
            const data = await upstream.json().catch(() => ({}));
            if (!upstream.ok) {
                throw new Error(`上游调用失败(${provider}/${modelName}): ${upstream.status} ${data?.error?.message || data?.message || "unknown"}`);
            }
            const reply = String(data?.choices?.[0]?.message?.content || "").trim() || "（模型返回空响应）";
            tutorbotManager_1.tutorbotManager.appendHistory(req.params.botId, "assistant", reply);
            res.json({ type: "content", content: reply });
        }
        catch (error) {
            const reply = `⚠️ 小玩子调用失败：${error?.message || "unknown error"}`;
            tutorbotManager_1.tutorbotManager.appendHistory(req.params.botId, "assistant", reply);
            res.status(502).json({ type: "error", content: reply });
        }
    })();
});
exports.default = router;
