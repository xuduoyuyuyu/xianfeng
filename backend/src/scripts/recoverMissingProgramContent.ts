import mongoose from "mongoose";
import Program from "../models/Program.js";
import { runAsyncParseTask } from "../controllers/program.js";

const CHECKPOINT_SIZE = 3;
const CHECKPOINT_DELAY_MS = 15_000;

function hasGeneratedContent(program: any): boolean {
  const hasTranscript = Boolean(program?.transcript?.length);
  const hasContentPack = Boolean(
    program?.contentPack?.quickView?.length ||
    program?.contentPack?.minutes?.text?.trim() ||
    program?.contentPack?.showNotes?.keyMoments?.length
  );
  const hasDeepDive = Boolean(
    program?.deepDive?.curatedReading?.length ||
    program?.deepDive?.mindMap?.root?.title?.trim()
  );
  return hasTranscript && hasContentPack && hasDeepDive;
}

function durationSeconds(value: unknown): number {
  const text = typeof value === "string" ? value.trim() : "";
  if (/^\d+$/.test(text)) return Number(text);
  const parts = text.split(":").map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return Number.MAX_SAFE_INTEGER;
}

function normalizeRecoveryAudioUrl(value: string): string {
  const match = value.match(
    /^https:\/\/dts-api\.xiaoyuzhoufm\.com\/track\/[^/]+\/[^/]+\/(media\.xyzcdn\.net\/.*)$/
  );
  return match ? `https://${match[1]}` : value;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://xianfeng_mongo:27017/xianfeng");
  const forcedProgramCodes = new Set(
    (process.env.RECOVERY_REPROCESS_PROGRAM_CODES || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const onlyProgramCodes = new Set(
    (process.env.RECOVERY_ONLY_PROGRAM_CODES || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const visiblePrograms = await Program.find({
    status: { $in: ["published", "group-only"] },
    "episodes.0.url": { $exists: true, $ne: "" },
  }).lean();
  const targets = visiblePrograms
    .filter((program) =>
      (!onlyProgramCodes.size || onlyProgramCodes.has(program.programCode || "")) &&
      (!hasGeneratedContent(program) || forcedProgramCodes.has(program.programCode || ""))
    )
    .sort((a, b) => durationSeconds(a.episodes?.[0]?.duration) - durationSeconds(b.episodes?.[0]?.duration));

  console.log(JSON.stringify({ event: "recovery_targets", count: targets.length, codes: targets.map((p) => p.programCode) }));
  if (process.env.RECOVERY_DRY_RUN === "1") {
    await mongoose.disconnect();
    return;
  }

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const current = await Program.findById(target._id);
    const forceReprocess = forcedProgramCodes.has(target.programCode || "");
    if (!current || (hasGeneratedContent(current) && !forceReprocess)) {
      skipped += 1;
      console.log(JSON.stringify({ event: "recovery_skip", index: index + 1, programCode: target.programCode }));
      continue;
    }
    const audioUrl = normalizeRecoveryAudioUrl(current.episodes?.[0]?.url || "");
    await runAsyncParseTask(String(current._id), audioUrl, { forceTranscriptRegenerate: true });
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const result = await Program.findById(current._id).lean();
    const success = result?.parseStatus === "success" && hasGeneratedContent(result);
    if (success) succeeded += 1;
    else failed += 1;
    console.log(JSON.stringify({
      event: "recovery_result",
      index: index + 1,
      total: targets.length,
      programCode: target.programCode,
      title: target.title,
      parseStatus: result?.parseStatus || "missing",
      parseError: result?.parseError || "",
      transcript: result?.transcript?.length || 0,
      quickView: result?.contentPack?.quickView?.length || 0,
    }));
    if ((index + 1) % CHECKPOINT_SIZE === 0 && index + 1 < targets.length) {
      console.log(JSON.stringify({ event: "recovery_checkpoint", processed: index + 1, succeeded, failed, skipped }));
      await new Promise((resolve) => setTimeout(resolve, CHECKPOINT_DELAY_MS));
    }
  }
  console.log(JSON.stringify({ event: "recovery_complete", total: targets.length, succeeded, failed, skipped }));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(JSON.stringify({ event: "recovery_fatal", message: error?.message || String(error) }));
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
