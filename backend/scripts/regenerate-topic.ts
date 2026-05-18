/**
 * 重新生成话题的深度内容
 * 用法: npx ts-node scripts/regenerate-topic.ts <slug或标题关键词>
 * 示例: npx ts-node scripts/regenerate-topic.ts 拼音启蒙
 */
import mongoose from "mongoose";

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();

const MONGO_URI = process.env.MONGODB_URI || "mongodb://xianfeng_mongo:27017/xianfeng";

async function main() {
  const keyword = process.argv[2];
  if (!keyword) {
    console.error("Usage: npx ts-node scripts/regenerate-topic.ts <slug或标题关键词>");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const Topic = mongoose.model(
    "Topic",
    new mongoose.Schema({}, { strict: false, collection: "topics" })
  );

  const topic = await Topic.findOne({
    $or: [
      { slug: { $regex: keyword, $options: "i" } },
      { title: { $regex: keyword, $options: "i" } },
    ],
    status: "pending",
  });

  if (!topic) {
    console.error(`No pending topic found matching "${keyword}"`);
    process.exit(1);
  }

  console.log(`Found: "${topic.title}" (${topic.slug})`);
  console.log(`Current progress: ${JSON.stringify(topic.generatingProgress)}`);

  // 计算节点总数
  const layers = topic.layers || {};
  let totalNodes = 0;
  for (const key of Object.keys(layers)) {
    if (Array.isArray(layers[key])) totalNodes += layers[key].length;
  }
  console.log(`Total nodes: ${totalNodes}`);

  // 重置进度
  topic.generatingProgress = { total: totalNodes, done: 0, status: "pending" };
  await topic.save();
  console.log("Progress reset, starting deep generation...");

  // 动态导入 AI 服务
  const { generateTopicWithDeepContent } = await import(
    "../src/services/topicAiGenerator.js"
  );

  const deepLayers = await generateTopicWithDeepContent(
    { title: topic.title, subtitle: topic.subtitle, tags: topic.tags || [] },
    async (done: number, total: number) => {
      try {
        await Topic.findByIdAndUpdate(topic._id, {
          $set: { generatingProgress: { total, done, status: "generating" } },
        });
        console.log(`  Progress: ${done}/${total} (${Math.round((done / total) * 100)}%)`);
      } catch (_) {}
    }
  );

  const updated = await Topic.findById(topic._id);
  if (updated) {
    updated.layers = deepLayers;
    updated.generatingProgress = { total: 0, done: 0, status: "done" };
    await updated.save();
    console.log(`✅ Deep generation complete for "${topic.title}"`);
    console.log(`   Content lengths: ${JSON.stringify(
      Object.fromEntries(
        Object.entries(deepLayers as Record<string, any[]>).map(([k, v]) => [
          k,
          v.map((n: any) => `${n.title}: ${(n.content || "").length} chars`),
        ])
      )
    )}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
