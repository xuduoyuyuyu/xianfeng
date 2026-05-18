/**
 * 批量给已有话题生成 shortSummary
 * 用法：在 backend 目录下执行
 *   npx tsx src/scripts/backfillShortSummary.ts
 */
import mongoose from "mongoose";
import Topic from "../models/Topic";
import { generateTopicTitle } from "../services/topicAiGenerator";

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/xianfeng";
  await mongoose.connect(MONGODB_URI);
  console.log("MongoDB connected");

  // 找到所有没有 shortSummary 的话题
  const topics = await Topic.find({
    $or: [
      { shortSummary: { $exists: false } },
      { shortSummary: "" },
      { shortSummary: null },
    ],
  }).lean();

  console.log(`Found ${topics.length} topics without shortSummary`);

  let updated = 0;
  for (const t of topics) {
    const keyword = t.title;
    console.log(`[${updated + 1}/${topics.length}] ${keyword} ...`);
    try {
      const aiResult = await generateTopicTitle(keyword);
      if (aiResult && aiResult.shortSummary && aiResult.shortSummary !== keyword) {
        const update: Record<string, any> = { shortSummary: aiResult.shortSummary };
        // 如果老 emoji 是默认的 💡 或 📚，用 AI 生成的替换
        if (t.coverEmoji === "💡" || t.coverEmoji === "📚" || t.coverEmoji === "🔍") {
          if (aiResult.coverEmoji && aiResult.coverEmoji !== "💡") {
            update.coverEmoji = aiResult.coverEmoji;
          }
        }
        await Topic.findByIdAndUpdate(t._id, { $set: update });
        updated++;
        console.log(`  ✅ ${aiResult.shortSummary} | ${update.coverEmoji || t.coverEmoji}`);
      } else {
        // AI 返回不理想，用 subtitle 前 30 字降级
        const fallback = (t.subtitle || "").slice(0, 30);
        if (fallback) {
          await Topic.findByIdAndUpdate(t._id, { $set: { shortSummary: fallback } });
          updated++;
          console.log(`  ⚠️ fallback: ${fallback}`);
        }
      }
    } catch (e: any) {
      console.error(`  ❌ ${e.message}`);
    }
    // 避免太快
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nDone! Updated ${updated}/${topics.length} topics`);
  await mongoose.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
