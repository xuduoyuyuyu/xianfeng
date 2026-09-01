import dotenv from "dotenv";
import mongoose from "mongoose";
import { syncExternalBookSearchIndex } from "../services/externalBookSearchIndex";

dotenv.config();

async function main() {
  const mongoUri = process.env.DB_URI || process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/xianfeng";
  await mongoose.connect(mongoUri);
  const result = await syncExternalBookSearchIndex({
    onProgress: ({ completedPages, totalPages }) => {
      console.log(`[external-book-index] ${completedPages}/${totalPages}`);
    },
  });
  console.log(JSON.stringify(result));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
