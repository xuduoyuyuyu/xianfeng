import { Router, Request, Response } from "express";
import Topic from "../models/Topic";
import { generateTopicLayers } from "../services/topicAiGenerator";

// 辅助：根据 _id 或 slug 查话题
async function findTopicBySlugOrId(param: string | string[]) {
  const p = Array.isArray(param) ? param[0] : String(param);
  // 尝试用 _id 查（适用于 24 位 hex）
  if (/^[a-f0-9]{24}$/i.test(p)) {
    const byId = await Topic.findById(p).lean();
    if (byId) return byId;
  }
  // 否则用 slug 查
  return Topic.findOne({ slug: p }).lean();
}

/** 计算 layers 中所有节点总数 */
function countLayerNodes(layers: any): number {
  if (!layers) return 20;
  let count = 0;
  for (const key of ["layer1", "layer2", "layer3", "layer4", "layer5"]) {
    count += (layers[key]?.length || 0);
  }
  return count || 20;
}

// ============================================================
// 前台 Router（无需认证）
// ============================================================
export const publicRouter = Router();

// GET /api/topic-hub — 返回 published 话题列表，支持筛选分页
publicRouter.get("/", async (req: Request, res: Response) => {
  try {
    const {
      tag,
      search,
      page = "1",
      limit = "20",
      userId,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));

    // 基础过滤：published 或当前用户自己的 pending
    const filter: Record<string, any> = {
      $or: [{ status: "published" }],
    };

    // 如果提供了 userId，也返回该用户的 pending 话题
    if (userId) {
      filter.$or.push({ status: "pending", createdBy: userId });
    }

    if (tag) {
      filter.tags = { $in: [tag] };
    }

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { title: { $regex: escaped, $options: "i" } },
          { subtitle: { $regex: escaped, $options: "i" } },
          { description: { $regex: escaped, $options: "i" } },
        ],
      });
    }

    const [topics, total] = await Promise.all([
      Topic.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Topic.countDocuments(filter),
    ]);

    // 计算 nodeCount
    const withNodeCount = topics.map((t: any) => {
      const layers = t.layers || {};
      let nodeCount = 0;
      for (const key of Object.keys(layers)) {
        if (Array.isArray(layers[key])) nodeCount += layers[key].length;
      }
      return { ...t, nodeCount };
    });

    res.json({ topics: withNodeCount, total, page: pageNum, limit: limitNum });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/topic-hub/:slug — 返回单个话题完整数据（含五层layers）
publicRouter.get("/:slug", async (req: Request, res: Response) => {
  try {
    const { userId } = req.query as Record<string, string>;

    // 查 published 或当前用户的 pending
    const filter: Record<string, any> = {
      slug: req.params.slug,
      $or: [{ status: "published" }],
    };
    if (userId) {
      filter.$or.push({ status: "pending", createdBy: userId });
    }

    const topic = await Topic.findOne(filter).lean();

    if (!topic) {
      return res.status(404).json({ error: "未找到该话题" });
    }

    res.json({ topic });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/topic-hub/submit — 兼容前端提交入口（映射到 search-generate）
publicRouter.post("/submit", async (req: Request, res: Response) => {
  try {
    const search = String(req.body?.search || req.body?.keyword || "").trim();
    const userId = String(req.body?.userId || "").trim();
    if (!search) {
      return res.status(400).json({ error: "search 为必填项" });
    }

    const creatorId = userId || req.ip || "anonymous";
    const topic = await Topic.create({
      title: search,
      subtitle: `关于${search}的讨论与实践`,
      coverEmoji: "🙏",
      tags: [search],
      status: "pending",
      source: "user",
      createdBy: creatorId,
    });

    return res.status(201).json({ ok: true, topicId: String(topic._id), status: "pending" });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/topic-hub/search-generate — 搜索无结果时，AI 自动生成话题
publicRouter.post("/search-generate", async (req: Request, res: Response) => {
  try {
    const { keyword, userId } = req.body || {};
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ error: "keyword 为必填项" });
    }

    const kw = keyword.trim();
    const creatorId = userId || req.ip || "anonymous";

    // 先检查是否已存在类似话题
    const existing = await Topic.findOne({
      status: "published",
      $or: [
        { title: { $regex: kw.slice(0, 4), $options: "i" } },
        { tags: { $regex: kw, $options: "i" } },
      ],
    }).lean();

    if (existing) {
      return res.json({ topic: existing, source: "existing" });
    }

    // AI 根据关键词生成话题标题（去掉生硬的"怎么办"后缀）
    let title = kw;
    let subtitle = `关于${kw}的深度分析与解决方案`;
    try {
      const { generateTopicTitle } = await import("../services/topicAiGenerator.js");
      const aiTitle = await generateTopicTitle(kw);
      if (aiTitle) {
        title = aiTitle.title || title;
        subtitle = aiTitle.subtitle || subtitle;
      }
    } catch (e: any) {
      console.error("Title generation failed, using keyword:", e.message);
    }

    // 创建话题（用户提交，直接发布）
    const topic = await Topic.create({
      title,
      subtitle,
      coverEmoji: "🔍",
      tags: [kw],
      status: "published",
      source: "user",
      createdBy: creatorId,
    });

    // AI 生成五层知识树（快速骨架）
    try {
      const { generateTopicLayers } = await import("../services/topicAiGenerator.js");
      const layers = await generateTopicLayers({ title, subtitle: topic.subtitle, tags: [kw] });
      topic.layers = layers;
      await topic.save();
    } catch (aiErr: any) {
      console.error("AI generation failed, keeping pending:", aiErr.message);
    }

    // 骨架生成完后，立即标注生成状态（预计算 total 节点数）
    const totalNodes = countLayerNodes(topic.layers);
    topic.generatingProgress = { total: totalNodes, done: 0, status: "pending" };
    await topic.save();

    res.status(201).json({ topic: topic.toJSON(), source: "generated" });

    // 异步逐节点深度生成（不阻塞返回）
    const topicId = topic._id;
    setImmediate(async () => {
      try {
        const { generateTopicWithDeepContent } = await import("../services/topicAiGenerator.js");
        const deepLayers = await generateTopicWithDeepContent(
          { title, subtitle: topic.subtitle, tags: [kw] },
          async (done: number, total: number) => {
            // 实时更新进度到数据库
            try {
              await Topic.findByIdAndUpdate(topicId, {
                $set: { generatingProgress: { total, done, status: "generating" } }
              });
            } catch (_) {}
          }
        );
        const updatedTopic = await Topic.findById(topicId);
        if (updatedTopic) {
          updatedTopic.layers = deepLayers;
          updatedTopic.generatingProgress = { total: 0, done: 0, status: "done" };
          await updatedTopic.save();
          console.log(`Deep gen complete for "${title}"`);
        }
      } catch (e: any) {
        console.error("Deep gen error:", e.message);
        // 标记失败
        try {
          await Topic.findByIdAndUpdate(topicId, {
            $set: { generatingProgress: { total: 0, done: 0, status: "error" } }
          });
        } catch (_) {}
      }
    });
    // --- 异步任务结束 ---
  } catch (e: any) {
    console.error("search-generate error:", e.message, e.stack);
    res.status(500).json({ error: e.message || "AI 生成失败，请稍后再试" });
  }
});

// POST /api/topic-hub/:slug/view — 增加 viewCount
publicRouter.post("/:slug/view", async (req: Request, res: Response) => {
  try {
    const topic = await Topic.findOneAndUpdate(
      { slug: req.params.slug, status: "published" },
      { $inc: { viewCount: 1 } },
      { new: true }
    ).lean();

    if (!topic) {
      return res.status(404).json({ error: "未找到该话题" });
    }

    res.json({ viewCount: topic.viewCount });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/topic-hub/:slug/expand — AI 实时生成展开讲讲内容
publicRouter.post("/:slug/expand", async (req: Request, res: Response) => {
  try {
    const { nodeKey, nodeTitle, topicTitle, deep, existingContent: passedContent } = req.body || {};
    if (!nodeKey || !nodeTitle) {
      return res.status(400).json({ error: "nodeKey 和 nodeTitle 为必填项" });
    }

    const topic = await Topic.findOne({ slug: req.params.slug }).lean();
    if (!topic) return res.status(404).json({ error: "未找到该话题" });

    // 先从 layers 中查找节点
    let existingContent = "";
    let layerKey = "";
    for (const key of ["layer1", "layer2", "layer3", "layer4", "layer5"] as const) {
      const found = (topic.layers as any)[key]?.find((n: any) => n.key === nodeKey || n.title === nodeTitle);
      if (found) {
        layerKey = key;
        if (found.content && found.content.length > 50) {
          existingContent = found.content;
        }
        break;
      }
    }

    // 深度模式：基于已有内容继续扩展（即使 content 已有内容，也扩展）
    if (deep && passedContent) {
      // 如果已有内容包含分隔线，说明已经扩展过，直接返回缓存
      if (passedContent.includes("\n---\n")) {
        return res.json({ expanded: passedContent, source: "cached" });
      }

      const { generateDeepExpandContent } = await import("../services/topicAiGenerator.js");
      let aiExpand = await generateDeepExpandContent({
        topicTitle: topicTitle || topic.title,
        nodeTitle: nodeTitle,
        existingContent: passedContent,
      });
      aiExpand = aiExpand.replace(/[（(]全文\d+字[）)]/g, "").trim();

      // 原文 + AI 扩展拼接（用分隔线隔开）
      const merged = passedContent + "\n\n---\n\n" + aiExpand;

      // 回写到 MongoDB
      try {
        await Topic.updateOne(
          { slug: req.params.slug },
          { $set: { [`layers.${layerKey}.$[elem].content`]: merged } },
          { arrayFilters: [{ "elem.key": nodeKey }] }
        );
      } catch (e) { console.error("persist err", e); }

      return res.json({ expanded: merged, source: "deep" });
    }

    // 如果已有完整内容，直接返回
    if (existingContent.length > 100) {
      return res.json({ expanded: existingContent, source: "cached" });
    }

    // 调用 AI 生成
    const { generateExpandContent } = await import("../services/topicAiGenerator.js");
    let aiResult = await generateExpandContent({
      topicTitle: topicTitle || topic.title,
      nodeTitle: nodeTitle,
      existingSummary: existingContent,
    });

    // 清理 AI 自动添加的字数标注：匹配中文/英文括号 + 全文 + 数字 + 字
    aiResult = aiResult.replace(/[（(]全文\d+字[）)]/g, "").trim();

    // 回写到 MongoDB，下次直接读取
    try {
      await Topic.updateOne(
        { slug: req.params.slug },
        { $set: { [`layers.${layerKey}.$[elem].content`]: aiResult } },
        { arrayFilters: [{ "elem.key": nodeKey }] }
      );
    } catch (saveErr) {
      console.error("Failed to persist expand content:", saveErr);
    }

    res.json({ expanded: aiResult, source: "ai" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/topic-hub/:slug/nodes/:nodeKey — 获取单个节点的展开讲讲内容
publicRouter.get("/:slug/nodes/:nodeKey", async (req: Request, res: Response) => {
  try {
    const { slug, nodeKey } = req.params;

    const topic = await Topic.findOne({ slug, status: "published" }).lean();
    if (!topic) {
      return res.status(404).json({ error: "未找到该话题" });
    }

    // 在五层中搜索该 node
    const layers = topic.layers;
    let node: any = null;
    let layerName = "";

    for (const key of ["layer1", "layer2", "layer3", "layer4", "layer5"] as const) {
      const found = (layers as any)[key]?.find((n: any) => n.key === nodeKey);
      if (found) {
        node = found;
        layerName = key;
        break;
      }
    }

    if (!node) {
      return res.status(404).json({ error: "未找到该节点" });
    }

    res.json({ node, layerName, topicSlug: slug });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/topic-hub/:slug/ask — 用户提问（存储问题，记录 questionCount）
publicRouter.post("/:slug/ask", async (req: Request, res: Response) => {
  try {
    const { question, userId } = req.body || {};

    if (!question) {
      return res.status(400).json({ error: "question 为必填项" });
    }

    const topic = await Topic.findOneAndUpdate(
      { slug: req.params.slug, status: "published" },
      { $inc: { questionCount: 1 } },
      { new: true }
    ).lean();

    if (!topic) {
      return res.status(404).json({ error: "未找到该话题" });
    }

    // TODO: 将问题存储到独立的 Question 集合（后续实现）
    res.json({
      message: "问题已收到",
      question,
      userId: userId || "",
      questionCount: topic.questionCount,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/topic-hub/:slug/questions — 兼容前端提问入口（映射到 ask）
publicRouter.post("/:slug/questions", async (req: Request, res: Response) => {
  try {
    const question = String(req.body?.question || "").trim();
    const userId = String(req.body?.userId || "").trim();
    if (!question) {
      return res.status(400).json({ error: "question 为必填项" });
    }

    const topic = await Topic.findOneAndUpdate(
      { slug: req.params.slug, status: "published" },
      { $inc: { questionCount: 1 } },
      { new: true }
    ).lean();

    if (!topic) {
      return res.status(404).json({ error: "未找到该话题" });
    }

    return res.json({
      ok: true,
      question,
      userId,
      questionCount: topic.questionCount,
      aiAnswer: "已收到你的问题，稍后会由内容团队与 AI 一起补充到该话题。",
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// DELETE /api/topic-hub/:slug — 删除话题
publicRouter.delete("/:slug", async (req: Request, res: Response) => {
  try {
    const topic = await Topic.findOneAndDelete({ slug: req.params.slug }).lean();
    if (!topic) {
      return res.status(404).json({ error: "未找到该话题" });
    }
    res.json({ message: "已删除", slug: req.params.slug });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// 后台 Router（需 admin 认证，由 index.ts 挂载中间件）
// ============================================================
export const adminRouter = Router();

// GET /api/admin/topic-hub — 全量列表（含 pending/hidden）
adminRouter.get("/", async (req: Request, res: Response) => {
  try {
    const {
      all,
      tag,
      search,
      page = "1",
      limit = "20",
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));

    const filter: Record<string, any> = {};

    // 非 all 模式只返回 published
    if (!all || all === "false") {
      filter.status = "published";
    }

    if (tag) {
      filter.tags = { $in: [tag] };
    }

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { title: { $regex: escaped, $options: "i" } },
        { subtitle: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
      ];
    }

    const [topics, total] = await Promise.all([
      Topic.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Topic.countDocuments(filter),
    ]);

    // 计算 nodeCount
    const withNodeCount = topics.map((t: any) => {
      const layers = t.layers || {};
      let nodeCount = 0;
      for (const key of Object.keys(layers)) {
        if (Array.isArray(layers[key])) nodeCount += layers[key].length;
      }
      return { ...t, nodeCount };
    });

    res.json({ topics: withNodeCount, total, page: pageNum, limit: limitNum });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/topic-hub/:slug — 获取单个话题完整数据（含 pending）
adminRouter.get("/:slug", async (req: Request, res: Response) => {
  try {
    const topic = await findTopicBySlugOrId(req.params.slug);
    if (!topic) {
      return res.status(404).json({ error: "未找到该话题" });
    }
    res.json({ topic });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/topic-hub/generate — AI 生成话题
adminRouter.post("/generate", async (req: Request, res: Response) => {
  try {
    const { title, subtitle, coverEmoji, tags } = req.body || {};

    if (!title) {
      return res.status(400).json({ error: "title 为必填项" });
    }

    // 1. 先创建话题（status=pending）
    const topic = await Topic.create({
      title,
      subtitle: subtitle || "",
      coverEmoji: coverEmoji || "📚",
      tags: tags || [],
      status: "pending",
      source: "ai",
    });

    // 2. AI 生成五层知识树
    try {
      const layers = await generateTopicLayers({
        title: topic.title,
        subtitle: topic.subtitle,
        tags: topic.tags,
      });

      // 3. 更新话题
      topic.layers = layers;
      topic.status = "published";
      await topic.save();
    } catch (aiErr: any) {
      console.error("AI generation failed, keeping pending:", aiErr.message);
      // AI 生成失败时保持 pending 状态，话题已创建
    }

    res.status(201).json({ topic: topic.toObject() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/admin/topic-hub/:slug — 编辑话题
adminRouter.put("/:slug", async (req: Request, res: Response) => {
  try {
    const existing = await findTopicBySlugOrId(req.params.slug);
    if (!existing) {
      return res.status(404).json({ error: "未找到该话题" });
    }
    const {
      title,
      subtitle,
      description,
      coverEmoji,
      tags,
      layers,
      questionCount,
      viewCount,
    } = req.body || {};

    const update: Record<string, any> = {};

    if (title !== undefined) update.title = title;
    if (subtitle !== undefined) update.subtitle = subtitle;
    if (description !== undefined) update.description = description;
    if (coverEmoji !== undefined) update.coverEmoji = coverEmoji;
    if (tags !== undefined) update.tags = tags;
    if (layers !== undefined) update.layers = layers;
    if (questionCount !== undefined) update.questionCount = questionCount;
    if (viewCount !== undefined) update.viewCount = viewCount;

    // 如果更新了 title，同步更新 slug
    if (title !== undefined) {
      update.slug =
        title
          .replace(/[^\w\u4e00-\u9fff]+/g, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase()
          .slice(0, 80) || `topic-${Date.now()}`;
    }

    const topic = await Topic.findByIdAndUpdate(
      existing._id,
      update,
      { new: true, runValidators: true }
    ).lean();

    res.json({ topic });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/topic-hub/:slug — 删除话题
adminRouter.delete("/:slug", async (req: Request, res: Response) => {
  try {
    const existing = await findTopicBySlugOrId(req.params.slug);
    if (!existing) {
      return res.status(404).json({ error: "未找到该话题" });
    }
    await Topic.findByIdAndDelete(existing._id);

    res.json({ message: "话题已删除", slug: existing.slug });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/admin/topic-hub/:slug/status — 状态切换
adminRouter.patch("/:slug/status", async (req: Request, res: Response) => {
  try {
    const { status } = req.body || {};

    if (!["pending", "published", "hidden"].includes(status)) {
      return res
        .status(400)
        .json({ error: "status 只能为 pending/published/hidden" });
    }

    const existing = await findTopicBySlugOrId(req.params.slug);
    if (!existing) {
      return res.status(404).json({ error: "未找到该话题" });
    }

    const topic = await Topic.findByIdAndUpdate(
      existing._id,
      { status },
      { new: true }
    ).lean();

    res.json({ topic });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/topic-hub/:slug/expand — 管理员展开知识树
adminRouter.post("/:slug/expand", async (req: Request, res: Response) => {
  try {
    const existing = await findTopicBySlugOrId(req.params.slug);
    if (!existing) {
      return res.status(404).json({ error: "未找到该话题" });
    }
    const existingNodes = countLayerNodes(existing.layers);
    if (existingNodes > 0) {
      return res.json({ nodeCount: existingNodes, source: "existing" });
    }
    const { generateTopicLayers } = await import("../services/topicAiGenerator.js");
    const layers = await generateTopicLayers({
      title: existing.title,
      subtitle: existing.subtitle,
      tags: existing.tags || [],
    });
    await Topic.findByIdAndUpdate(existing._id, { layers });
    const nodeCount = countLayerNodes(layers);
    res.json({ nodeCount, source: "generated" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
