/**
 * 重新生成话题的深度内容（直接可运行脚本）
 * 用法: node regenerate-topic.js <slug关键词>
 */
const { default: axios } = require("axios");
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGODB_URI || "mongodb://xianfeng_mongo:27017/xianfeng";

const AI_ENDPOINT = process.env.AI_API_BASE_URL || "https://api.deepseek.com/v1";
const AI_API_KEY = process.env.AI_API_KEY || process.env.VOLCENGINE_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "deepseek-v4-flash";

async function generateExpandContent(topicTitle, nodeTitle, existingSummary) {
  const baseContent = existingSummary || "";
  const prompt = `你是一位资深教育专家。请针对以下话题节点，生成深度的"展开讲讲"内容。

话题：${topicTitle}
节点：${nodeTitle}
${baseContent ? `已有摘要：${baseContent.slice(0, 200)}` : ""}

请生成250-400字的深度内容，严格按以下结构输出：

## 格式结构（必须遵守）
1. **首段：核心观点提炼** — 开篇直接用1句话提炼最核心的观点，用**加粗**，后跟2-3句展开说明
2. **中段：案例/研究支撑** — 用具体案例或研究数据支撑观点
3. **末段：可操作建议** — 给出2-3条具体建议，用编号列表

## 严禁
- 禁止任何开场白/引导语/过渡词
- 禁止"首先/其次/第一/第二/最后/总而言之"等废话
- 禁止重复节点标题作为开篇`;

  if (!AI_API_KEY) return existingSummary || "";

  try {
    const res = await axios.post(
      `${AI_ENDPOINT}/chat/completions`,
      { model: AI_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0.7, max_tokens: 1500 },
      { headers: { Authorization: `Bearer ${AI_API_KEY}`, "Content-Type": "application/json" }, timeout: 90000 }
    );
    const text = res.data?.choices?.[0]?.message?.content || "";
    if (text.trim().length > 80) return text.trim();
  } catch (e) {
    console.error(`  AI error (attempt 1): ${e.message}`);
    try {
      const res2 = await axios.post(
        `${AI_ENDPOINT}/chat/completions`,
        { model: AI_MODEL, messages: [{ role: "user", content: prompt }], temperature: 0.7, max_tokens: 1200 },
        { headers: { Authorization: `Bearer ${AI_API_KEY}`, "Content-Type": "application/json" }, timeout: 60000 }
      );
      const text2 = res2.data?.choices?.[0]?.message?.content || "";
      if (text2.trim().length > 80) return text2.trim();
    } catch (e2) {
      console.error(`  AI error (retry): ${e2.message}`);
    }
  }
  return existingSummary || "";
}

async function main() {
  const keyword = process.argv[2];
  if (!keyword) { console.error("Usage: node regenerate-topic.js <slug关键词>"); process.exit(1); }

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const Topic = mongoose.model("Topic", new mongoose.Schema({}, { strict: false, collection: "topics" }));
  const topic = await Topic.findOne({
    $or: [{ slug: { $regex: keyword, $options: "i" } }, { title: { $regex: keyword, $options: "i" } }],
    status: "pending",
  });

  if (!topic) { console.error(`No pending topic found matching "${keyword}"`); process.exit(1); }

  console.log(`Found: "${topic.title}" (${topic.slug})`);
  console.log(`Current progress: ${JSON.stringify(topic.generatingProgress)}`);

  const layers = topic.layers || {};
  const allNodes = [];
  for (const key of ["layer1", "layer2", "layer3", "layer4", "layer5"]) {
    (layers[key] || []).forEach((node, idx) => {
      if (!node.content || node.content.length < 80) {
        allNodes.push({ layer: key, idx, node });
      }
    });
  }

  const total = allNodes.length;
  console.log(`Nodes needing content: ${total}`);

  if (total === 0) {
    console.log("All nodes already have content, setting done...");
    topic.generatingProgress = { total: 0, done: 0, status: "done" };
    await topic.save();
    process.exit(0);
  }

  topic.generatingProgress = { total, done: 0, status: "generating" };
  await topic.save();

  let done = 0;
  const CONCURRENCY = 2; // 降低并发，减少超时风险
  for (let i = 0; i < allNodes.length; i += CONCURRENCY) {
    const batch = allNodes.slice(i, i + CONCURRENCY);
    await Promise.allSettled(batch.map(async (item) => {
      try {
        const content = await generateExpandContent(topic.title, item.node.title, item.node.summary);
        if (content && content.length > 80) {
          layers[item.layer][item.idx].content = content;
          await Topic.findByIdAndUpdate(topic._id, { $set: { [`layers.${item.layer}.${item.idx}.content`]: content } });
          console.log(`  OK [${done + 1}/${total}]: "${item.node.title}" → ${content.length} chars`);
        } else {
          console.log(`  EMPTY [${done + 1}/${total}]: "${item.node.title}"`);
        }
      } catch (e) {
        console.error(`  FAIL [${done + 1}/${total}]: "${item.node.title}" — ${e.message}`);
      }
    }));
    done += batch.length;
    await Topic.findByIdAndUpdate(topic._id, { $set: { generatingProgress: { total, done, status: "generating" } } });
    console.log(`Progress: ${done}/${total}`);
  }

  topic.generatingProgress = { total: 0, done: 0, status: "done" };
  await topic.save();
  console.log("✅ Done!");
  process.exit(0);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
