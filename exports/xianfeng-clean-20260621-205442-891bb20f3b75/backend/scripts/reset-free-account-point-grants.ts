import dotenv from "dotenv";
import mongoose from "mongoose";
import { resetFreeAccountPointGrants } from "../src/services/billing";

dotenv.config();

async function main() {
  const mongoUri = process.env.DB_URI || process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/xianfeng";
  await mongoose.connect(mongoUri);
  const result = await resetFreeAccountPointGrants();
  console.log(`[billing-reset] matched free accounts: ${result.matchedCount}`);
  console.log(`[billing-reset] reset free accounts: ${result.modifiedCount}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[billing-reset] failed", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
