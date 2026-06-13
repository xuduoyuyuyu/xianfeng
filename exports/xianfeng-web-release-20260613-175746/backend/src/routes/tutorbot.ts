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
import { buildXiaowanziContextPayload, type XiaowanziSiteCard } from "../services/xiaowanziContextService";

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

function getRecordId(item: any): string {
  return String(item?._id || item?.id || "").trim();
}

function buildProgramHref(item: any): string {
  const routeId = String(item?.programCode || getRecordId(item)).trim();
  return routeId ? `/programs/${encodeURIComponent(routeId)}` : "/programs/list";
}

function buildGuestHref(item: any): string {
  const id = getRecordId(item);
  return id ? `/experts/${encodeURIComponent(id)}` : "/experts";
}

function buildTopicHref(item: any): string {
  const slug = String(item?.slug || getRecordId(item)).trim();
  return slug ? `/topics/${encodeURIComponent(slug)}` : "/topics";
}

function buildBookHref(_item: any): string {
  return "/reading";
}

function buildMaterialHref(item: any): string {
  const title = compactText(item?.title, 80);
  if (!title) return "/materials";
  const params = new URLSearchParams({ q: title });
  return `/materials?${params.toString()}`;
}

function buildSiteReferencePolicy(hasSiteContext: boolean): string {
  if (hasSiteContext) {
    return [
      "[站内引用边界]",
      "本轮提供了已命中的站内节目、请教一下、资料、书单或嘉宾链接。只有这些明确列出的条目才可以作为站内推荐。",
      "推荐时必须列出下方条目的标题和链接；不要引导用户去搜索关键词，不要使用不确定的站内推荐话术。",
    ].join("\n");
  }
  return [
    "[站内引用边界]",
    "本轮没有提供任何已命中的站内节目、请教一下、资料、书单或嘉宾链接。",
    "不要说“家长先疯节目里也有聊过”、不要说“站内有相关专题”、不要暗示平台已有对应内容，也不要引导用户去搜索关键词。",
    "可以直接给通用建议；如果需要说明依据，只能说本轮未检索到可引用的站内内容。",
  ].join("\n");
}

async function buildSiteCards(content: string): Promise<XiaowanziSiteCard[]> {
  const terms = extractSearchTerms(content);
  if (!terms.length) return [];
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
      .select({ title: 1, slug: 1, subtitle: 1, shortSummary: 1, tags: 1, updatedAt: 1 })
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

  const cards: XiaowanziSiteCard[] = [];
  programs.forEach((item: any) => {
    cards.push({
      type: "program",
      typeLabel: "节目",
      title: compactText(item.title, 80),
      summary: compactText(item.description || item.summary?.body),
      href: buildProgramHref(item),
    });
  });
  guests.forEach((item: any) => {
    cards.push({
      type: "guest",
      typeLabel: "嘉宾",
      title: compactText([item.name, item.title].filter(Boolean).join(" "), 80),
      summary: compactText(item.bio || [...(item.mainAreas || []), ...(item.keywords || [])].join("、")),
      href: buildGuestHref(item),
    });
  });
  topics.forEach((item: any) => {
    cards.push({
      type: "topic",
      typeLabel: "请教一下",
      title: compactText(item.title, 80),
      summary: compactText(item.shortSummary || item.description || item.subtitle),
      href: buildTopicHref(item),
    });
  });
  books.forEach((item: any) => {
    cards.push({
      type: "book",
      typeLabel: "书单",
      title: compactText(item.title, 80),
      summary: compactText([item.author, item.topic, item.grade, item.recommendedGuest].filter(Boolean).join(" / ")),
      href: buildBookHref(item),
    });
  });
  materials.forEach((item: any) => {
    cards.push({
      type: "material",
      typeLabel: "资料",
      title: compactText(item.title, 80),
      summary: compactText(item.description || item.category),
      href: buildMaterialHref(item),
    });
  });
  return cards;
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
      const query = extractUserQuestion(content);
      const siteCards = isFrontendBot(botId) ? await buildSiteCards(content).catch(() => []) : [];
      const siteContext = siteCards.length ? "has_site_cards" : "";
      const rag = isFrontendBot(botId)
        ? await buildRagContext({ routeKey: "xiaowanzi", query, localContext: "" })
        : { promptBlock: "", status: "empty_query", provider: "none", citations: [] };
      const xiaowanziContext = isFrontendBot(botId)
        ? buildXiaowanziContextPayload({
            query,
            siteCards,
            rag: {
              status: rag.status,
              provider: rag.provider,
              citationCount: rag.citations.length,
            },
            localPromptBlock: rag.promptBlock,
          })
        : { trace: [], cards: [], promptBlock: "" };
      const siteReferencePolicy = isFrontendBot(botId) ? buildSiteReferencePolicy(Boolean(siteContext)) : "";
      const effectiveContent = [siteReferencePolicy, xiaowanziContext.promptBlock, content].filter(Boolean).join("\n\n");
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
        if (isFrontendBot(botId)) {
          writeSse(res, "context", xiaowanziContext);
        }
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
