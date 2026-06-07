import express from "express";
import { authenticate } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";
import { requirePro } from "../middlewares/requirePro";
import { tutorbotManager } from "../services/tutorbotManager";
import { ensureStore, resolveAgentModelConfig } from "../services/agentModelRegistry";
import Program from "../models/Program";
import Guest from "../models/Guest";
import Topic from "../models/Topic";
import Book from "../models/Book";
import LearningMaterial from "../models/LearningMaterial";
import { buildRagContext } from "../services/ragContextService";

const router = express.Router();
const FRONTEND_BOT_ID = "xiaowanzi_debug_bot";

function isFrontendBot(botId: string): boolean {
  return botId === FRONTEND_BOT_ID;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractUserQuestion(content: string): string {
  const match = content.match(/\[用户问题\]\s*([\s\S]+)$/);
  return String(match?.[1] || content || "").trim();
}

function extractSearchTerms(content: string): string[] {
  const question = extractUserQuestion(content)
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[，。！？、,.!?;；:："'“”‘’（）()【】]/g, " ");
  const terms = question
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 18 && !/^(请问|帮我|一下|怎么|如何|什么|哪些|可以|能不能|有没有)$/.test(item));
  const compact = question.replace(/\s+/g, "");
  const phraseTerms = Array.from(compact.matchAll(/[\u4e00-\u9fff]{2,8}/g)).map((item) => item[0]);
  return Array.from(new Set([...terms, ...phraseTerms])).slice(0, 8);
}

function compactText(value: any, limit = 140): string {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

async function buildSiteContext(content: string): Promise<string> {
  const terms = extractSearchTerms(content);
  if (!terms.length) return "";
  const regex = new RegExp(terms.map(escapeRegex).join("|"), "i");
  const [programs, guests, topics, books, materials] = await Promise.all([
    Program.find({
      status: { $in: ["published", "group-only"] },
      $or: [
        { title: regex },
        { description: regex },
        { "summary.body": regex },
        { "summary.tags": regex },
        { "contentPack.showNotes.renderedText": regex },
      ],
    })
      .select({ title: 1, description: 1, summary: 1, programCode: 1, updatedAt: 1 })
      .sort({ updatedAt: -1 })
      .limit(4)
      .lean(),
    Guest.find({
      status: "active",
      $or: [{ name: regex }, { title: regex }, { bio: regex }, { keywords: regex }, { mainAreas: regex }, { profileMarkdown: regex }],
    })
      .select({ name: 1, title: 1, bio: 1, keywords: 1, mainAreas: 1 })
      .sort({ updatedAt: -1 })
      .limit(3)
      .lean(),
    Topic.find({
      status: "published",
      $or: [{ title: regex }, { subtitle: regex }, { description: regex }, { shortSummary: regex }, { tags: regex }],
    })
      .select({ title: 1, subtitle: 1, shortSummary: 1, tags: 1, updatedAt: 1 })
      .sort({ updatedAt: -1 })
      .limit(3)
      .lean(),
    Book.find({
      status: "published",
      $or: [{ title: regex }, { author: regex }, { topic: regex }, { categoryLabel: regex }, { recommendedGuest: regex }],
    })
      .select({ title: 1, author: 1, topic: 1, grade: 1, recommendedGuest: 1 })
      .sort({ updatedAt: -1 })
      .limit(3)
      .lean(),
    LearningMaterial.find({
      status: "published",
      $or: [{ title: regex }, { description: regex }, { category: regex }],
    })
      .select({ title: 1, description: 1, category: 1 })
      .sort({ updatedAt: -1 })
      .limit(3)
      .lean(),
  ]);

  const lines: string[] = [];
  programs.forEach((item: any, index) => {
    lines.push(`节目${index + 1}: ${compactText(item.title)} - ${compactText(item.description || item.summary?.body)}`);
  });
  guests.forEach((item: any, index) => {
    lines.push(`嘉宾${index + 1}: ${compactText([item.name, item.title].filter(Boolean).join(" "))} - ${compactText(item.bio || [...(item.mainAreas || []), ...(item.keywords || [])].join("、"))}`);
  });
  topics.forEach((item: any, index) => {
    lines.push(`话题${index + 1}: ${compactText(item.title)} - ${compactText(item.shortSummary || item.description || item.subtitle)}`);
  });
  books.forEach((item: any, index) => {
    lines.push(`书单${index + 1}: ${compactText(item.title)} - ${compactText([item.author, item.topic, item.grade, item.recommendedGuest].filter(Boolean).join(" / "))}`);
  });
  materials.forEach((item: any, index) => {
    lines.push(`资料${index + 1}: ${compactText(item.title)} - ${compactText(item.description || item.category)}`);
  });
  if (!lines.length) return "";
  return `[站内相关内容]\n${lines.slice(0, 12).join("\n")}`;
}

function startBot(req: express.Request, res: express.Response): void {
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
}

function getBotHistory(req: express.Request, res: express.Response): void {
  const botId = String(req.params.botId);
  const limit = Number(req.query.limit || 100);
  res.json(tutorbotManager.getBotHistory(botId, limit));
}

function writeSse(res: express.Response, event: string, data: Record<string, any>): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sendBotMessage(req: express.Request, res: express.Response): void {
  const botId = String(req.params.botId);
  let bot = tutorbotManager.getBot(botId);
  if ((!bot || !bot.running) && isFrontendBot(botId)) {
    bot = tutorbotManager.startBot(botId, {
      name: "小玩子",
      description: "前台小玩子实例",
      model: "chat_manager_agent",
    });
  }
  if (!bot || !bot.running) {
    res.status(404).json({ detail: "Bot not found or not running" });
    return;
  }
  const content = String(req.body?.content || "").trim();
  if (!content) {
    res.status(400).json({ detail: "content is required" });
    return;
  }
  tutorbotManager.appendHistory(botId, "user", content);
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
      const flashModelCfg = (store.model_registry || []).find((item: any) => item?.enabled && item?.id === "deepseek-v4-flash");
      const modelCfg = flashModelCfg
        ? {
            id: flashModelCfg.id,
            name: flashModelCfg.name,
            provider: flashModelCfg.provider,
            model_name: flashModelCfg.model_name,
            api_key: flashModelCfg.api_key,
            base_url: flashModelCfg.base_url,
            meta: flashModelCfg.meta,
          }
        : resolved.primary;
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
      const latestPromptDoc = [...promptCandidates].sort((a: any, b: any) => {
        const at = String(a?.created_at || "");
        const bt = String(b?.created_at || "");
        if (at !== bt) return bt.localeCompare(at);
        return Number(b?.id || 0) - Number(a?.id || 0);
      })[0];
      const latestPrompt = String(latestPromptDoc?.system_prompt || "").trim();
      const workspaceAgentDoc = String(tutorbotManager.readBotFile(botId, "AGENTS.md") || "").trim();
      const systemPrompt = latestPrompt || workspaceAgentDoc;
      const recentHistory = tutorbotManager
        .getBotHistory(botId, 12)
        .slice(0, -1)
        .filter((item: any) => item.role === "user" || item.role === "assistant")
        .map((item: any) => ({ role: item.role, content: String(item.content || "") }))
        .filter((item: any) => item.content);
      const siteContext = isFrontendBot(botId) ? await buildSiteContext(content).catch(() => "") : "";
      const rag = isFrontendBot(botId)
        ? await buildRagContext({ routeKey: "xiaowanzi", query: extractUserQuestion(content), localContext: siteContext })
        : { promptBlock: "", status: "empty_query", provider: "none", citations: [] };
      const effectiveContent = rag.promptBlock ? `${rag.promptBlock}\n\n${content}` : content;
      const messages = [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        ...recentHistory,
        { role: "user", content: effectiveContent },
      ];
      const wantsStream = Boolean(req.body?.stream);
      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages,
          temperature: Number.isFinite(Number((chatAgent as any).temperature)) ? Number((chatAgent as any).temperature) : 0.2,
          top_p: Number.isFinite(Number((chatAgent as any).top_p)) ? Number((chatAgent as any).top_p) : 0.95,
          max_tokens: Number.isFinite(Number((chatAgent as any).max_tokens)) ? Number((chatAgent as any).max_tokens) : 1200,
          stream: wantsStream,
        }),
      });
      if (wantsStream) {
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();
        if (!upstream.ok || !upstream.body) {
          const data = await upstream.json().catch(() => ({}));
          throw new Error(`上游调用失败(${provider}/${modelName}): ${upstream.status} ${data?.error?.message || data?.message || "unknown"}`);
        }
        const reader = (upstream.body as any).getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let reply = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          for (const part of parts) {
            const lines = part.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("data:"));
            for (const line of lines) {
              const raw = line.replace(/^data:\s*/, "");
              if (!raw || raw === "[DONE]") continue;
              const chunk = JSON.parse(raw);
              const delta = String(chunk?.choices?.[0]?.delta?.content || "");
              if (!delta) continue;
              reply += delta;
              writeSse(res, "delta", { content: delta });
            }
          }
        }
        const finalReply = reply.trim() || "（模型返回空响应）";
        tutorbotManager.appendHistory(botId, "assistant", finalReply);
        writeSse(res, "done", { content: finalReply });
        res.end();
        return;
      }
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        throw new Error(`上游调用失败(${provider}/${modelName}): ${upstream.status} ${data?.error?.message || data?.message || "unknown"}`);
      }
      const reply = String(data?.choices?.[0]?.message?.content || "").trim() || "（模型返回空响应）";
      tutorbotManager.appendHistory(botId, "assistant", reply);
      res.json({ type: "content", content: reply });
    } catch (error: any) {
      const reply = `⚠️ 小玩子调用失败：${error?.message || "unknown error"}`;
      tutorbotManager.appendHistory(botId, "assistant", reply);
      if (Boolean(req.body?.stream) && !res.headersSent) {
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        writeSse(res, "error", { content: reply });
        res.end();
        return;
      }
      if (Boolean(req.body?.stream)) {
        writeSse(res, "error", { content: reply });
        res.end();
        return;
      }
      res.status(502).json({ type: "error", content: reply });
    }
  })();
}

router.use(authenticate);

router.post("", (req, res, next) => {
  if (!isFrontendBot(String(req.body?.bot_id || ""))) return next("route");
  startBot(req, res);
});

router.get("/:botId/history", (req, res, next) => {
  if (!isFrontendBot(req.params.botId)) return next("route");
  getBotHistory(req, res);
});

router.post("/:botId/messages", (req, res, next) => {
  if (!isFrontendBot(req.params.botId)) return next("route");
  return requirePro("xiaowanzi")(req as any, res, () => sendBotMessage(req, res));
});

router.use(requireAdmin);

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

router.post("", startBot);

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

router.get("/:botId/history", getBotHistory);

router.post("/:botId/messages", sendBotMessage);

export default router;
