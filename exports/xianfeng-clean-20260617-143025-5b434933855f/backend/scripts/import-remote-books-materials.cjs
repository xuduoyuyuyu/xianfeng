const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, unique: true },
    categoryLabel: { type: String, default: "", trim: true },
    topic: { type: String, default: "", trim: true },
    author: { type: String, default: "", trim: true },
    translator: { type: String, default: "", trim: true },
    publisher: { type: String, default: "", trim: true },
    grade: { type: String, default: "", trim: true },
    coverImage: { type: String, required: true },
    recommendedGuest: { type: String, default: "", trim: true },
    sourceName: { type: String, default: "" },
    sourceGuestId: { type: mongoose.Schema.Types.ObjectId, ref: "Guest", default: null, index: true },
    status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const learningMaterialSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    fileUrl: { type: String, required: true },
    category: { type: String, required: true },
    status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Book = mongoose.models.Book || mongoose.model("Book", bookSchema);
const LearningMaterial =
  mongoose.models.LearningMaterial || mongoose.model("LearningMaterial", learningMaterialSchema);

function asText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function toStatus(value) {
  return String(value || "").toLowerCase() === "draft" ? "draft" : "published";
}

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`请求失败 ${url}: ${resp.status}`);
  }
  return resp.json();
}

async function importBooks(remoteBooks) {
  let imported = 0;
  for (const item of remoteBooks) {
    const title = asText(item?.title);
    if (!title) continue;
    const status = toStatus(item?.status);
    await Book.updateOne(
      { title },
      {
        $set: {
          title,
          categoryLabel: asText(item?.categoryLabel),
          topic: asText(item?.topic),
          author: asText(item?.author),
          translator: asText(item?.translator),
          publisher: asText(item?.publisher),
          grade: asText(item?.grade),
          coverImage: asText(item?.coverImage, "https://via.placeholder.com/240x320/630ed4/ffffff?text=Book"),
          recommendedGuest: asText(item?.recommendedGuest),
          sourceName: asText(item?.sourceName),
          sourceGuestId: item?.sourceGuestId || null,
          status,
          publishedAt: status === "published" ? new Date(item?.publishedAt || Date.now()) : null,
        },
      },
      { upsert: true }
    );
    imported += 1;
  }
  return imported;
}

async function importLearningMaterials(remoteMaterials) {
  let imported = 0;
  for (const item of remoteMaterials) {
    const title = asText(item?.title);
    const fileUrl = asText(item?.fileUrl);
    if (!title || !fileUrl) continue;
    const status = toStatus(item?.status);
    await LearningMaterial.updateOne(
      { title },
      {
        $set: {
          title,
          description: asText(item?.description),
          fileUrl,
          category: asText(item?.category, "未分类"),
          status,
          publishedAt: status === "published" ? new Date(item?.publishedAt || Date.now()) : null,
        },
      },
      { upsert: true }
    );
    imported += 1;
  }
  return imported;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:60014/xianfeng";
  const apiBase = process.env.REMOTE_API_BASE || "https://xianfeng.xinzhi.info";

  await mongoose.connect(mongoUri);
  const [remoteBooks, remoteMaterials] = await Promise.all([
    fetchJson(`${apiBase}/api/books`),
    fetchJson(`${apiBase}/api/learning-materials`),
  ]);

  const importedBooks = await importBooks(Array.isArray(remoteBooks) ? remoteBooks : []);
  const importedMaterials = await importLearningMaterials(Array.isArray(remoteMaterials) ? remoteMaterials : []);

  const [bookCount, materialCount] = await Promise.all([
    Book.countDocuments({}),
    LearningMaterial.countDocuments({}),
  ]);

  console.log(
    JSON.stringify(
      {
        importedBooks,
        importedMaterials,
        bookCount,
        materialCount,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[import-remote-books-materials] failed", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

