import { Router, Request, Response } from "express";
import Topic from "../models/Topic";
import { generateTopicLayers, validateTopicKeyword } from "../services/topicAiGenerator";

// 中文搜索关键词切词：按停用词和标点拆分，提取有意义的短词
function extractSearchTerms(text: string): string[] {
  // 停用词列表（会被用来切分句子）
  const STOP_PATTERN = /几岁|应该|怎么|该如何|如何|什么|为什么|要不要|能不能|可不可以|是不是|请问|请教|一下|啊|吗|呢|吧|想和|想|各位|前辈|妈妈|们|现在|非常|比较|已经|还|就|都|也|不|可以|需要|去做|做|给|帮|我|你|他|她|小朋友|孩子|的|了|是|去|有|在|和|与|请教一下/g;
  
  // 步骤1：用停用词把句子切开，提取有意义片段
  let cleaned = text.replace(STOP_PATTERN, '|').replace(/[，。！？、；：\s\[\]【】（）()《》""''…—\-/,]+/g, '|');
  const chunks = cleaned.split('|').map(s => s.trim()).filter(s => s.length >= 2);
  
  // 步骤2：对每个片段，生成子串（2-4字滑动窗口）做模糊匹配
  const terms = new Set<string>();
  for (const chunk of chunks) {
    terms.add(chunk); // 完整片段
    if (chunk.length >= 3) {
      for (let i = 0; i <= chunk.length - 2; i++) {
        for (let len = 2; len <= 4 && i + len <= chunk.length; len++) {
          const sub = chunk.slice(i, i + len);
          if (sub.length >= 2) terms.add(sub);
        }
      }
    }
  }
  
  // 步骤3：去重、转义，返回用于正则匹配的词列表
  const escaped = [...terms].map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return escaped.length > 0 ? escaped : [text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")];
}

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
      limit = "21",
      sort = "viewCount",
      userId,
      grade,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 21));

    // 排序：默认按浏览量降序，支持 createdAt
    const sortField = sort === "createdAt" ? "createdAt" : "viewCount";
    const sortObj: Record<string, any> = {};
    sortObj[sortField] = -1;
    // 浏览量相同时按创建时间降序
    if (sortField === "viewCount") sortObj.createdAt = -1;

    // 基础过滤：published 或当前用户自己的 pending
    const filter: Record<string, any> = {
      $or: [{ status: "published" }],
    };

    // 如果提供了 userId，也返回该用户的 pending 话题
    if (userId) {
      filter.$or.push({ status: "pending", createdBy: userId });
      // 排除该用户已隐藏的话题
      filter.hiddenForUsers = { $ne: userId };
    } else {
      // 匿名用户排除 ip 已隐藏的
      const clientIp = req.ip || "anonymous";
      filter.hiddenForUsers = { $ne: clientIp };
    }

    if (tag) {
      filter.tags = { $in: [tag] };
    }

    // 年级过滤：只返回匹配该年级的话题（含"全学段"的话题对所有人可见）
    if (grade && grade !== "all" && grade !== "全部") {
      filter.suitableGrades = { $in: [grade, "全学段"] };
    }

    if (search) {
      // 中文分词：拆成单关键词，同时保留原始搜索词做精确匹配
      const searchTerms = extractSearchTerms(search);
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: searchTerms.flatMap((term: string) => [
          { title: { $regex: term, $options: "i" } },
          { subtitle: { $regex: term, $options: "i" } },
          { tags: { $regex: term, $options: "i" } },
        ]),
      });
    }

    const [topics, total] = await Promise.all([
      Topic.find(filter)
        .sort(sortObj)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Topic.countDocuments(filter),
    ]);

    // 计算 nodeCount 的工具函数
    const calcNodeCount = (t: any) => {
      const layers = t.layers || {};
      let count = 0;
      for (const key of Object.keys(layers)) {
        if (Array.isArray(layers[key])) count += layers[key].length;
      }
      return count;
    };

    // 如果是第一页且有 userId，把用户自己提交的所有话题排在前面
    if (userId && pageNum === 1) {
      const userTopics = await Topic.find({
        createdBy: userId,
        hiddenForUsers: { $ne: userId },
      })
        .sort({ createdAt: -1 })
        .lean();

      // 从主结果中移除重复项（主查询可能已有用户的话题）
      const userSlugs = new Set(userTopics.map((t: any) => t.slug));
      const filtered = topics.filter((t: any) => !userSlugs.has(t.slug));

      // 合并：用户自己的话题在前，其他 topic 在后
      const merged = [
        ...userTopics.map((t: any) => ({ ...t, nodeCount: calcNodeCount(t) })),
        ...filtered.map((t: any) => ({ ...t, nodeCount: calcNodeCount(t) })),
      ];

      res.json({ topics: merged, total: total + userTopics.length, page: pageNum, limit: limitNum });
      return;
    }

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

    // 将 layers 转换为 tree 格式供前端使用
    const layerOrder = ["layer1", "layer2", "layer3", "layer4", "layer5"] as const;
    const layerNames: Record<string, string> = {
      layer1: "认知篇", layer2: "诊断篇", layer3: "方法篇", layer4: "工具篇", layer5: "行动篇",
    };
    const tree = layerOrder
      .filter((key) => {
        const layer = (topic.layers as any)?.[key];
        return layer && Array.isArray(layer) && layer.length > 0;
      })
      .map((key, idx) => ({
        id: idx + 1,
        nodeKey: key,
        title: layerNames[key] || key,
        nodeType: "branch",
        sortOrder: idx,
        children: ((topic.layers as any)?.[key] || []).map((n: any, ci: number) => ({
          id: idx * 100 + ci + 1,
          nodeKey: n.key || `${key}-${ci}`,
          title: n.title || "",
          nodeType: "leaf",
          summary: n.summary || "",
          questionCount: 0,
          hasQuiz: false,
        })),
      }));

    // 关联话题：根据 tags 找到 3 个相关话题
    let relatedTopics: any[] = [];
    try {
      const topicTags = (topic as any).tags || [];
      if (topicTags.length > 0) {
        const topicId = (topic as any)._id;
        relatedTopics = await Topic.find({
          _id: { $ne: topicId },
          status: "published",
          tags: { $in: topicTags },
        })
          .select("title slug tags")
          .limit(3)
          .lean();
      }
    } catch (_) {}

    res.json({ topic, tree, relatedTopics });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/topic-hub/validate — AI 校验话题有效性
// POST /api/topic-hub/validate — AI 校验话题有效性
// POST /api/topic-hub/refine — AI 从长文本中提炼核心话题关键词（二次确认用）
publicRouter.post("/refine", async (req: Request, res: Response) => {
  try {
    const { keyword } = req.body || {};
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ error: "keyword 为必填项" });
    }

    const text = keyword.trim();

    // 短文本直接可用，不需要二次确认
    if (text.length <= 15) {
      return res.json({ refined: text, needConfirm: false });
    }

    // AI 提炼核心问题，让用户确认
    try {
      const { generateKeywordFromLongText } = await import("../services/topicAiGenerator.js");
      const refined = await generateKeywordFromLongText(text);
      if (refined && refined.length >= 2 && refined.length <= 30) {
        // 提炼成功，让用户确认
        return res.json({ original: text, refined, needConfirm: true });
      }
    } catch (e: any) {
      console.error("Refine failed:", e.message);
    }

    // 提炼失败：降级截取
    return res.json({ refined: text.slice(0, 50), needConfirm: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

publicRouter.post("/validate", async (req: Request, res: Response) => {
  try {
    const { keyword } = req.body || {};
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ valid: false, reason: "请输入话题内容" });
    }
    const result = await validateTopicKeyword(keyword.trim());
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ valid: false, reason: "校验服务异常，请稍后再试" });
  }
});

// POST /api/topic-hub/search-generate — 搜索无结果时，AI 自动生成话题
publicRouter.post("/search-generate", async (req: Request, res: Response) => {
  try {
    const { keyword, userId } = req.body || {};
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ error: "keyword 为必填项" });
    }

    let kw = keyword.trim();
    const originalInput = kw; // 保存用户原始输入
    const creatorId = userId || req.ip || "anonymous";

    // 长文本先提炼关键词再搜索（避免用长原文匹配到不相关话题）
    let searchTerm = kw.slice(0, 4);
    if (kw.length > 15) {
      try {
        const { generateKeywordFromLongText } = await import("../services/topicAiGenerator.js");
        const refined = await generateKeywordFromLongText(kw);
        if (refined && refined.length >= 2 && refined.length <= 30) {
          searchTerm = refined; // 用提炼后的关键词搜索
        }
      } catch { /* 提炼失败用原文前4字 */ }
    }

    // 搜索关联话题（不拦截创建，仅附带返回给前端参考）
    let relatedTopics: any[] = [];
    try {
      relatedTopics = await Topic.find({
        status: "published",
        $or: [
          { title: { $regex: searchTerm, $options: "i" } },
          { tags: { $regex: searchTerm, $options: "i" } },
        ],
      }).limit(5).lean();
    } catch { /* 搜索失败不影响创建 */ }

    // AI 生成话题标题、标签（失败时 fallback，不拒绝提交）
    let title: string;
    let subtitle: string;
    let shortSummary: string;
    let matchedEmoji: string;
    let tags: string[];
    let suitableGrades: string[];
    try {
      const { generateTopicTitle } = await import("../services/topicAiGenerator.js");
      const aiTitle = await generateTopicTitle(kw);
      if (aiTitle && aiTitle.title) {
        title = aiTitle.title;
        subtitle = aiTitle.subtitle || kw;
        shortSummary = aiTitle.shortSummary || kw;
        matchedEmoji = aiTitle.coverEmoji || "💡";
        tags = aiTitle.tags?.length ? aiTitle.tags : [kw];
        suitableGrades = aiTitle.suitableGrades || ["全学段"];
      } else {
        // AI 生成失败，用 key 语义关键词做简单话题摘要
        title = kw.length > 30 ? kw.slice(0, 30) + "…" : kw;
        subtitle = `关于${kw.slice(0, 12)}的讨论`;
        shortSummary = kw.slice(0, 50);
        matchedEmoji = "💬";
        tags = [kw.slice(0, 6)];
        suitableGrades = ["全学段"];
      }
    } catch (e: any) {
      console.error("Title generation failed:", e.message);
      // fallback 不拒绝
      title = kw.length > 30 ? kw.slice(0, 30) + "…" : kw;
      subtitle = `关于${kw.slice(0, 12)}的讨论`;
      shortSummary = kw.slice(0, 50);
      matchedEmoji = "💬";
      tags = [kw.slice(0, 6)];
      suitableGrades = ["全学段"];
    }

    // 生成唯一 slug（避免重复键冲突）
    let slug = title
      .replace(/[^\w\u4e00-\u9fff]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 80) || `topic-${Date.now()}`;
    const slugConflict = await Topic.findOne({ slug });
    if (slugConflict) {
      // 已有相同 slug，加数字后缀
      let counter = 2;
      while (await Topic.findOne({ slug: `${slug}-${counter}` })) {
        counter++;
      }
      slug = `${slug}-${counter}`;
    }

    // 创建话题（用户提交，初始仅本人可见，待审核后公开）
    const topic = await Topic.create({
      title,
      subtitle,
      shortSummary,
      coverEmoji: matchedEmoji,
      tags,
      suitableGrades,
      slug,
      status: "pending",
      source: "user",
      createdBy: creatorId,
      userOriginalInput: originalInput,
      generatingProgress: { total: 15, done: 0, status: "pending" },
    });

    // AI 生成五层知识树（快速骨架）
    try {
      const { generateTopicLayers } = await import("../services/topicAiGenerator.js");
      const layers = await generateTopicLayers({ title, subtitle: topic.subtitle, tags });
      topic.layers = layers;
      await topic.save();
    } catch (aiErr: any) {
      console.error("AI generation failed, keeping pending:", aiErr.message);
    }

    // 骨架生成完后，立即标注生成状态（预计算 total 节点数）
    const totalNodes = countLayerNodes(topic.layers);
    topic.generatingProgress = { total: totalNodes, done: 0, status: "pending" };
    await topic.save();

    res.status(201).json({ topic: topic.toJSON(), source: "generated", relatedTopics });

    // 异步逐节点深度生成（不阻塞返回）
    const topicId = topic._id;
    setImmediate(async () => {
      try {
        const { generateTopicWithDeepContent } = await import("../services/topicAiGenerator.js");
        const deepLayers = await generateTopicWithDeepContent(
          { title, subtitle: topic.subtitle, tags },
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

    // 深度模式：基于已有内容继续扩展（每次都追加新内容）
    if (deep && passedContent) {
      const { generateDeepExpandContent } = await import("../services/topicAiGenerator.js");
      let aiExpand = await generateDeepExpandContent({
        topicTitle: topicTitle || topic.title,
        nodeTitle: nodeTitle,
        existingContent: passedContent,
      });
      aiExpand = aiExpand.replace(/[（(]全文\d+字[）)]/g, "").trim();

      // 已有内容 + 新 AI 扩展追加
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

    const { userId } = req.query as Record<string, string>;

    const filter: Record<string, any> = {
      slug,
      $or: [{ status: "published" }],
    };
    if (userId) {
      filter.$or.push({ status: "pending", createdBy: userId });
    }

    const topic = await Topic.findOne(filter).lean();
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

    // 返回同一层中的兄弟节点
    const siblings = ((layers as any)[layerName] || [])
      .filter((n: any) => n.key !== nodeKey)
      .map((n: any) => ({ nodeKey: n.key, title: n.title }));

    res.json({ node, layerName, topicSlug: slug, siblings, questions: [] });
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

// DELETE /api/topic-hub/:slug — 对当前用户隐藏话题（不物理删除，不影响其他用户）
publicRouter.delete("/:slug", async (req: Request, res: Response) => {
  try {
    const { userId } = req.body || {};
    const filter: any = { slug: req.params.slug };
    if (userId) {
      filter.createdBy = userId;
    }
    const topic = await Topic.findOne(filter).lean();
    if (!topic) {
      return res.status(404).json({ error: "未找到该话题或无权删除" });
    }
    // 将当前用户加入 hiddenFor 列表，不物理删除
    const hider = userId || req.ip || "anonymous";
    await Topic.findByIdAndUpdate(topic._id, {
      $addToSet: { hiddenForUsers: hider },
    });
    res.json({ message: "已隐藏", slug: req.params.slug });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/topic-hub/:slug/progress — 查询生成进度
publicRouter.get("/:slug/progress", async (req: Request, res: Response) => {
  try {
    const topic = await Topic.findOne({ slug: req.params.slug })
      .select("generatingProgress")
      .lean();
    if (!topic) {
      return res.status(404).json({ error: "未找到该话题" });
    }
    res.json({ progress: topic.generatingProgress || null });
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
      shortSummary,
      description,
      coverEmoji,
      tags,
      suitableGrades,
      layers,
      questionCount,
      viewCount,
    } = req.body || {};

    const update: Record<string, any> = {};

    if (title !== undefined) update.title = title;
    if (subtitle !== undefined) update.subtitle = subtitle;
    if (shortSummary !== undefined) update.shortSummary = shortSummary;
    if (description !== undefined) update.description = description;
    if (coverEmoji !== undefined) update.coverEmoji = coverEmoji;
    if (tags !== undefined) update.tags = tags;
    if (suitableGrades !== undefined) update.suitableGrades = suitableGrades;
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

// POST /api/admin/topic-hub/:slug/regenerate — 重新触发 AI 深度生成
adminRouter.post("/:slug/regenerate", async (req: Request, res: Response) => {
  try {
    const existing = await findTopicBySlugOrId(req.params.slug);
    if (!existing) {
      return res.status(404).json({ error: "未找到该话题" });
    }

    // 计算节点总数
    const totalNodes = countLayerNodes(existing.layers);
    if (totalNodes === 0) {
      // 还没有骨架，先创建骨架
      const { generateTopicLayers } = await import("../services/topicAiGenerator.js");
      const layers = await generateTopicLayers({
        title: existing.title,
        subtitle: existing.subtitle,
        tags: existing.tags || [],
      });
      await Topic.findByIdAndUpdate(existing._id, { layers });
      existing.layers = layers;
    }

    const finalTotal = countLayerNodes(existing.layers);
    await Topic.findByIdAndUpdate(existing._id, {
      $set: { generatingProgress: { total: finalTotal, done: 0, status: "pending" } },
    });

    // 立即返回，后台异步生成
    res.json({ message: "重新生成已启动", slug: existing.slug, totalNodes: finalTotal });

    // 异步深度生成
    const topicId = existing._id;
    const title = existing.title;
    const subtitle = existing.subtitle;
    const tags = existing.tags || [];

    setImmediate(async () => {
      try {
        const { generateTopicWithDeepContent } = await import("../services/topicAiGenerator.js");
        const deepLayers = await generateTopicWithDeepContent(
          { title, subtitle, tags },
          async (done: number, total: number) => {
            try {
              await Topic.findByIdAndUpdate(topicId, {
                $set: { generatingProgress: { total, done, status: "generating" } },
              });
            } catch (_) {}
          }
        );
        await Topic.findByIdAndUpdate(topicId, {
          $set: {
            layers: deepLayers,
            generatingProgress: { total: 0, done: 0, status: "done" },
          },
        });
        console.log(`Regenerate complete for "${title}"`);
      } catch (e: any) {
        console.error(`Regenerate error for "${title}":`, e.message);
        try {
          await Topic.findByIdAndUpdate(topicId, {
            $set: { generatingProgress: { total: 0, done: 0, status: "error" } },
          });
        } catch (_) {}
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
