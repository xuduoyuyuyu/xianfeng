import express from "express";
import { authenticate } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";
import { tutorbotManager } from "../services/tutorbotManager";
import { ensureStore, resolveAgentModelConfig } from "../services/agentModelRegistry";

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get("/souls", (_req, res) => {
  res.json(tutorbotManager.listSouls());
});

router.post("/souls", (req, res) => {
  const { id, name, content } = req.body || {};
  if (!id || !name) {
    res.status(400).json({ detail: "id and name are required" });
    return;
  }
  if (tutorbotManager.getSoul(String(id))) {
    res.status(409).json({ detail: `Soul '${id}' already exists` });
    return;
  }
  res.status(201).json(tutorbotManager.createSoul(String(id), String(name), String(content || "")));
});

router.get("/souls/:soulId", (req, res) => {
  const soul = tutorbotManager.getSoul(req.params.soulId);
  if (!soul) {
    res.status(404).json({ detail: "Soul not found" });
    return;
  }
  res.json(soul);
});

router.put("/souls/:soulId", (req, res) => {
  const soul = tutorbotManager.updateSoul(req.params.soulId, req.body?.name, req.body?.content);
  if (!soul) {
    res.status(404).json({ detail: "Soul not found" });
    return;
  }
  res.json(soul);
});

router.delete("/souls/:soulId", (req, res) => {
  if (!tutorbotManager.deleteSoul(req.params.soulId)) {
    res.status(404).json({ detail: "Soul not found" });
    return;
  }
  res.json({ id: req.params.soulId, deleted: true });
});

router.get("", (_req, res) => {
  res.json(tutorbotManager.listBots());
});

router.get("/recent", (req, res) => {
  const limit = Number(req.query.limit || 3);
  res.json(tutorbotManager.getRecentActiveBots(limit));
});

router.post("", (req, res) => {
  const { bot_id: botId, name, description, persona, channels, model } = req.body || {};
  if (!botId) {
    res.status(400).json({ detail: "bot_id is required" });
    return;
  }
  const bot = tutorbotManager.startBot(String(botId), {
    name: name ? String(name) : String(botId),
    description: String(description || ""),
    persona: String(persona || ""),
    channels: typeof channels === "object" && channels ? channels : {},
    model: model ? String(model) : null,
  });
  res.json(bot);
});

router.get("/:botId", (req, res) => {
  const bot = tutorbotManager.getBot(req.params.botId);
  if (!bot) {
    res.status(404).json({ detail: "Bot not found" });
    return;
  }
  res.json(bot);
});

router.delete("/:botId", (req, res) => {
  const ok = tutorbotManager.stopBot(req.params.botId);
  if (!ok) {
    res.status(404).json({ detail: "Bot not found or not running" });
    return;
  }
  res.json({ bot_id: req.params.botId, stopped: true });
});

router.delete("/:botId/destroy", (req, res) => {
  const ok = tutorbotManager.destroyBot(req.params.botId);
  if (!ok) {
    res.status(404).json({ detail: "Bot not found" });
    return;
  }
  res.json({ bot_id: req.params.botId, destroyed: true });
});

router.patch("/:botId", (req, res) => {
  const existing = tutorbotManager.getBot(req.params.botId);
  if (!existing) {
    res.status(404).json({ detail: "Bot not found" });
    return;
  }
  const next = tutorbotManager.startBot(req.params.botId, {
    name: req.body?.name ?? existing.name,
    description: req.body?.description ?? existing.description,
    persona: req.body?.persona ?? existing.persona,
    channels: req.body?.channels ?? {},
    model: req.body?.model ?? existing.model,
  });
  res.json(next);
});

router.get("/:botId/files", (req, res) => {
  res.json(tutorbotManager.readAllBotFiles(req.params.botId));
});

router.get("/:botId/files/:filename", (req, res) => {
  const content = tutorbotManager.readBotFile(req.params.botId, req.params.filename);
  if (content === null) {
    res.status(400).json({ detail: `Not an editable file: ${req.params.filename}` });
    return;
  }
  res.json({ filename: req.params.filename, content });
});

router.put("/:botId/files/:filename", (req, res) => {
  const ok = tutorbotManager.writeBotFile(req.params.botId, req.params.filename, String(req.body?.content || ""));
  if (!ok) {
    res.status(400).json({ detail: `Not an editable file: ${req.params.filename}` });
    return;
  }
  res.json({ filename: req.params.filename, saved: true });
});

router.get("/:botId/history", (req, res) => {
  const limit = Number(req.query.limit || 100);
  res.json(tutorbotManager.getBotHistory(req.params.botId, limit));
});

router.post("/:botId/messages", (req, res) => {
  const bot = tutorbotManager.getBot(req.params.botId);
  if (!bot || !bot.running) {
    res.status(404).json({ detail: "Bot not found or not running" });
    return;
  }
  const content = String(req.body?.content || "").trim();
  if (!content) {
    res.status(400).json({ detail: "content is required" });
    return;
  }
  tutorbotManager.appendHistory(req.params.botId, "user", content);
  (async () => {
    try {
      const store = ensureStore(() => ({
        agents: [],
        prompts: {},
        policies: {},
        strategies: {},
        runs: [],
      }));
      const chatAgent = store.agents.find((x: any) => x.agent_code === "chat_manager_agent");
      if (!chatAgent) {
        throw new Error("chat_manager_agent 未配置");
      }
      const resolved = resolveAgentModelConfig(chatAgent as any, store.model_registry || []);
      const modelCfg = resolved.primary;
      const apiKey = String(modelCfg?.api_key || "").trim();
      const modelName = String(modelCfg?.model_name || "").trim();
      const provider = String(modelCfg?.provider || "").trim();
      const baseUrl = String(modelCfg?.base_url || "").trim() || "https://api.openai.com";
      if (!apiKey || !modelName) {
        throw new Error("小玩子主模型未配置完整（缺少 api_key 或 model_name）");
      }
      const endpoint = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content }],
          temperature: Number.isFinite(Number((chatAgent as any).temperature)) ? Number((chatAgent as any).temperature) : 0.2,
          top_p: Number.isFinite(Number((chatAgent as any).top_p)) ? Number((chatAgent as any).top_p) : 0.95,
          max_tokens: Number.isFinite(Number((chatAgent as any).max_tokens)) ? Number((chatAgent as any).max_tokens) : 1200,
          stream: false,
        }),
      });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        throw new Error(`上游调用失败(${provider}/${modelName}): ${upstream.status} ${data?.error?.message || data?.message || "unknown"}`);
      }
      const reply = String(data?.choices?.[0]?.message?.content || "").trim() || "（模型返回空响应）";
      tutorbotManager.appendHistory(req.params.botId, "assistant", reply);
      res.json({ type: "content", content: reply });
    } catch (error: any) {
      const reply = `⚠️ 小玩子调用失败：${error?.message || "unknown error"}`;
      tutorbotManager.appendHistory(req.params.botId, "assistant", reply);
      res.status(502).json({ type: "error", content: reply });
    }
  })();
});

export default router;
