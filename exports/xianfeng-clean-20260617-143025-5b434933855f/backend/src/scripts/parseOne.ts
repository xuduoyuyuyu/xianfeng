/**
 * 单节目解析触发器
 * Usage: npx tsx src/scripts/parseOne.ts <programCode>
 */
import mongoose from "mongoose";

async function main() {
  const code = process.argv[2];
  if (!code) {
    console.error("Usage: npx tsx src/scripts/parseOne.ts <programCode>");
    process.exit(1);
  }

  const mongoUri = process.env.MONGO_URI || "mongodb://xianfeng_mongo:27017/xianfeng";
  await mongoose.connect(mongoUri);

  const Program = mongoose.model("Program");
  const p = await Program.findOne({ programCode: code }).lean();
  if (!p) {
    console.error("NOT FOUND:", code);
    process.exit(1);
  }

  // Log relevant info
  const audioUrl = p.episodes?.[0]?.url || "";
  console.log(`节目: ${p.title}`);
  console.log(`音频: ${audioUrl.substring(0, 100)}`);

  // Reset status
  await Program.updateOne(
    { _id: p._id },
    { $set: { parseStatus: "idle", parseStage: "idle", parseError: "", parseProgress: 0 } }
  );

  // Import and call runAsyncParseTask
  // Must use dynamic import to avoid double model registration
  const mod = await import("../controllers/program");
  await mod.runAsyncParseTask(p._id.toString(), mongoUri, code);

  console.log(`✅ ${code} 已触发异步解析`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
