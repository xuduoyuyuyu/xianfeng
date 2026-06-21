import dotenv from "dotenv";
import mongoose from "mongoose";
import { ensureAdminAccount } from "../src/services/adminAccountRecovery";

dotenv.config();

async function main() {
  const username = String(process.argv[2] || "admin").trim();
  const password = String(process.argv[3] || "").trim();

  if (!password) {
    console.error("Usage: npx tsx scripts/reset-admin-password.ts <username=admin> <new-password>");
    process.exit(1);
  }

  const mongoUri =
    process.env.DB_URI ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    "mongodb://localhost:27017/xianfeng";

  await mongoose.connect(mongoUri);
  try {
    const result = await ensureAdminAccount({ username, password });
    console.log(
      result.created
        ? `Created admin account "${username}" with the supplied password.`
        : `Reset password and ensured admin role for "${username}".`
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("[reset-admin-password] failed", error);
  process.exit(1);
});
