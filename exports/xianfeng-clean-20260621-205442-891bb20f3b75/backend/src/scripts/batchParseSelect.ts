/**
 * 批量解析草稿节目 - 指定节目代码版
 * 用法：docker exec xianfeng_backend npx tsx src/scripts/batchParseSelect.ts
 */
import mongoose from "mongoose";
import Program from "../models/Program";

const DELAY_MS = 30000; // 30秒间隔，避免ASR并发压力
const TARGET_CODES = ["ep11", "ep12", "ep13", "ep14", "ep15", "ep16", "ep17", "ep18", "ep1991"];

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("[批量解析指定节目] 开始...");
  console.log("目标节目:", TARGET_CODES.join(", "));
  await mongoose.connect(process.env.MONGO_URI || "mongodb://xianfeng_mongo:27017/xianfeng");

  const programCtrl = await import("../controllers/program");

  const drafts = await Program.find({
    programCode: { $in: TARGET_CODES },
    status: "draft",
  }).lean();

  console.log(`找到: ${drafts.length} 个节目`);

  let triggered = 0;
  let failed = 0;

  for (let i = 0; i < drafts.length; i++) {
    const prog = drafts[i];
    const id = String(prog._id);
    const url = prog.episodes?.[0]?.url || "";

    const prefix = `[${i + 1}/${drafts.length}]`;
    console.log(`\n${prefix} ${prog.programCode}: ${(prog.title || "").slice(0, 40)}`);

    // Reset
    await Program.findByIdAndUpdate(id, {
      parseStatus: "idle",
      parseProgress: 0,
      parseStage: "idle",
      parseError: "",
    });

    try {
      programCtrl.runAsyncParseTask(id, url, { forceTranscriptRegenerate: true });
      triggered++;
      console.log(`   ✅ 已触发 (音频: ${url.slice(0, 80)}...)`);
    } catch (err: any) {
      failed++;
      console.log(`   ❌ ${err.message?.slice(0, 100)}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n===== 完成 =====`);
  console.log(`✅ 已触发: ${triggered} / ❌ 失败: ${failed}`);
  console.log(`⏳ 解析在后台异步执行，预计需要 1-2 分钟/节目`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
