import dotenv from "dotenv";
import mongoose from "mongoose";
import { migrateExistingProgramGlossaries } from "../src/services/educationDictionary";

dotenv.config();

async function main() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/xianfeng";
  await mongoose.connect(mongoUri);
  const result = await migrateExistingProgramGlossaries();
  console.log(`[dictionary-migrate] migrated programs: ${result.migratedPrograms}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[dictionary-migrate] failed", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
