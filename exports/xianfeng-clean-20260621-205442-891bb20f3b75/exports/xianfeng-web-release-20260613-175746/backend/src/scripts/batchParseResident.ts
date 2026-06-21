/**
 * 批量解析草稿节目 - 长驻进程版
 * 触发后不退出，持续监控直到所有任务完成
 * 用法：docker exec xianfeng_backend npx tsx src/scripts/batchParseResident.ts
 */
import mongoose from "mongoose";
import Program from "../models/Program";

const DELAY_MS = 30000;
const POLL_INTERVAL_MS = 10000;
const TARGET_CODES = ["ep12", "ep13", "ep14", "ep15", "ep16", "ep17", "ep18", "ep1991"];

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("[常驻批量解析] 开始...");
  console.log("目标节目:", TARGET_CODES.join(", "));
  await mongoose.connect(process.env.MONGO_URI || "mongodb://xianfeng_mongo:27017/xianfeng");

  // 直接触发后不退出，持续监控
  const drafts = await Program.find({
    programCode: { $in: TARGET_CODES },
    status: "draft",
  }).lean();

  console.log(`找到: ${drafts.length} 个节目`);

  // 重置所有
  for (const d of drafts) {
    await Program.findByIdAndUpdate(d._id, {
      parseStatus: "idle", parseProgress: 0, parseStage: "idle", parseError: "",
    });
  }

  // 获取 runAsyncParseTask 函数
  const { parsingProgramIds } = await import("../controllers/program");
  const programCtrl = await import("../controllers/program");

  let idx = 0;
  for (const prog of drafts) {
    idx++;
    const id = String(prog._id);
    const url = prog.episodes?.[0]?.url || "";
    console.log(`\n[${idx}/${drafts.length}] ${prog.programCode}: ${(prog.title || "").slice(0, 40)}`);
    
    try {
      programCtrl.runAsyncParseTask(id, url, { forceTranscriptRegenerate: true });
      console.log(`   ✅ 已触发 (音频: ${url.slice(0, 80)}...)`);
    } catch (err: any) {
      console.log(`   ❌ ${err.message?.slice(0, 100)}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n全部触发完成，等待解析结束...`);
  console.log(`当前解析中: ${parsingProgramIds.size} 个\n`);

  // 持续轮询直到全部完成
  const maxWait = 30 * 60 * 1000; // 最多等 30 分钟
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    await sleep(POLL_INTERVAL_MS);
    
    const remaining = await Program.countDocuments({
      programCode: { $in: TARGET_CODES },
      parseStatus: "parsing",
    });
    
    const completed = await Program.countDocuments({
      programCode: { $in: TARGET_CODES },
      parseStatus: "parsing",
      "transcript.0": { $exists: true },
    });
    
    const failed = await Program.countDocuments({
      programCode: { $in: TARGET_CODES },
      parseStatus: "failed",
    });
    
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[${elapsed}s] 解析中:${remaining} | 有逐字稿:${completed} | 失败:${failed}`);
    
    if (remaining === 0) {
      console.log("\n✅ 全部解析完成！");
      break;
    }
  }

  // 最终汇总
  console.log("\n===== 最终状态 =====");
  const results = await Program.find({
    programCode: { $in: TARGET_CODES },
  }, { programCode: 1, parseStatus: 1, parseStage: 1, transcript: { $size: "$transcript" } }).lean();
  for (const r of results) {
    const t = (r as any).transcript || 0;
    console.log(`${r.programCode} | ${r.parseStatus}/${r.parseStage} | 逐字稿:${t}条`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
