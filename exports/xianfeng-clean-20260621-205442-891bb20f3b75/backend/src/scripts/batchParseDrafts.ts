/**
 * 批量解析草稿节目
 * 直接导入并调用 runAsyncParseTask，走完整 AI 解析流程
 * 用法：docker exec xianfeng_backend npx tsx src/scripts/batchParseDrafts.ts
 */
import mongoose from "mongoose";
import Program from "../models/Program";

const DELAY_MS = 8000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("[批量解析草稿] 开始...");
  await mongoose.connect(process.env.MONGO_URI || "mongodb://xianfeng_mongo:27017/xianfeng");

  // 动态导入以获取 parsingProgramIds 和 runAsyncParseTask
  const programCtrl = await import("../controllers/program");

  const drafts = await Program.find({
    status: "draft",
    "episodes.0.url": { $exists: true, $ne: "" },
  }).lean();

  console.log(`草稿节目: ${drafts.length} 个`);

  let triggered = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < drafts.length; i++) {
    const prog = drafts[i];
    const id = String(prog._id);
    const url = prog.episodes?.[0]?.url || "";

    console.log(`\n[${i + 1}/${drafts.length}] ${(prog.title || "").slice(0, 40)}`);

    // 清除僵死状态
    if (prog.parseStatus === "parsing") {
      await Program.findByIdAndUpdate(id, {
        parseStatus: "idle",
        parseProgress: 0,
        parseStage: "idle",
        parseError: "",
      });
      console.log("   🔄 清除僵死状态");
    }

    try {
      // 直接调用 runAsyncParseTask 函数
      // 它在内部 setTimeout 0 后异步执行，不阻塞
      programCtrl.runAsyncParseTask(id, url, { forceTranscriptRegenerate: true });
      triggered++;
      console.log(`   ✅ 已触发解析 (音频: ${url.slice(0, 60)}...)`);
    } catch (err: any) {
      failed++;
      console.log(`   ❌ ${err.message?.slice(0, 100)}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n===== 完成 =====`);
  console.log(`✅ 已触发: ${triggered} / ❌ 失败: ${failed}`);
  console.log(`⏳ 解析在后台异步执行，请在管理后台查看进度`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
