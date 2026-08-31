import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const collectionName = "mamaresourceprofiles";
const indexKey = "socialAccount.normalizedProfileUrl";
const indexName = `${indexKey}_1`;

async function main() {
  const mongoUri = process.env.DB_URI || process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/xianfeng";
  await mongoose.connect(mongoUri);
  const collection = mongoose.connection.collection(collectionName);
  const indexes = await collection.indexes();
  const existing = indexes.find((index) => index.key && index.key[indexKey] === 1);

  if (existing?.unique === true && existing?.sparse === true) {
    console.log(`[mama-resource-index] ${existing.name} is already unique and sparse`);
    return;
  }
  if (existing?.name) await collection.dropIndex(existing.name);
  await collection.createIndex({ [indexKey]: 1 }, { name: indexName, unique: true, sparse: true });
  console.log(`[mama-resource-index] created ${indexName} as unique and sparse`);
}

main()
  .catch((error) => {
    console.error("[mama-resource-index] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
