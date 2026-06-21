/**
 * 批量生成 AI 脉络图
 * 直接在进程内调用 generateMindMap，不通过 HTTP
 * 用法：docker exec xianfeng_backend npx tsx src/scripts/batchGenerateMindMaps.ts
 */
import mongoose from "mongoose";
import Program from "../models/Program";
import { generateMindMap } from "../services/programAi";

const DELAY_MS = 5000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("[批量脉络图生成] 开始...");

  const programs = await Program.find({
    "contentPack.quickView": { $exists: true, $not: { $size: 0 } },
    $or: [
      { "deepDive.mindMap": { $exists: false } },
      { "deepDive.mindMap.root": { $exists: false } },
      { "deepDive.mindMap.root": null },
    ],
  }).lean();

  console.log(`待生成: ${programs.length} 个节目`);

  let success = 0;
  let fail = 0;

  for (let i = 0; i < programs.length; i++) {
    const p = programs[i] as any;
    const id = String(p._id);
    const title = (p.title || "未命名").slice(0, 60);
    process.stdout.write(`[${i + 1}/${programs.length}] ${title}... `);

    try {
      const quickView = Array.isArray(p.contentPack?.quickView) ? p.contentPack.quickView : [];
      const summary = p.summary || {};
      const dictionaryEntries = Array.isArray(p.deepDive?.dictionaryEntries)
        ? p.deepDive.dictionaryEntries
        : [];

      const node = await generateMindMap({
        title: p.title || "未命名",
        summaryBody: summary.body || p.description || "",
        highlightText: summary.highlightText || "",
        dictionaryEntries,
        quickView: quickView.map((q: any) => ({
          timeRangeLabel: q.timeRangeLabel || `${q.startTime}-${q.endTime}`,
          summary: q.summary || "",
        })),
      });

      if (node && (node.title || (node.children && node.children.length > 0))) {
        const mindMap = { root: node, generatedAt: new Date() };
        await Program.findByIdAndUpdate(id, {
          $set: { "deepDive.mindMap": mindMap },
        } as any);
        console.log("✅");
        success++;
      } else {
        console.log("⚠️ AI 返回空");
        fail++;
      }
    } catch (err: any) {
      console.log(`❌ ${err.message?.slice(0, 100)}`);
      fail++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n完成！成功: ${success}, 失败: ${fail}`);
  process.exit(0);
}

mongoose
  .connect(process.env.MONGODB_URI || "mongodb://xianfeng_mongo:27017/xianfeng")
  .then(() => {
    console.log("MongoDB connected");
    return main();
  })
  .catch((err: any) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
