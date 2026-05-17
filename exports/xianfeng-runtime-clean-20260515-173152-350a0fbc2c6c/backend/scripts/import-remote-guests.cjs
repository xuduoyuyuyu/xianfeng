const fs = require("fs");
const mongoose = require("mongoose");

const guestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true, index: true, unique: true },
    title: { type: String, default: "", trim: true },
    bio: { type: String, default: "", trim: true },
    avatar: { type: String, default: "", trim: true },
    profileUrl: { type: String, default: "", trim: true },
    profileMarkdown: { type: String, default: "", trim: true },
    profileReferences: [
      {
        title: { type: String, default: "", trim: true },
        url: { type: String, default: "", trim: true },
        note: { type: String, default: "", trim: true },
      },
    ],
    socialProfiles: [
      {
        platform: { type: String, default: "", trim: true },
        label: { type: String, default: "", trim: true },
        url: { type: String, default: "", trim: true },
        note: { type: String, default: "", trim: true },
        order: { type: Number, default: 0 },
        status: { type: String, enum: ["active", "inactive"], default: "active" },
      },
    ],
    publications: [
      {
        type: { type: String, enum: ["paper", "book", "interview", "media", "other"], default: "other" },
        title: { type: String, default: "", trim: true },
        url: { type: String, default: "", trim: true },
        source: { type: String, default: "", trim: true },
        publishedAt: { type: String, default: "", trim: true },
        summary: { type: String, default: "", trim: true },
        note: { type: String, default: "", trim: true },
        order: { type: Number, default: 0 },
        status: { type: String, enum: ["active", "inactive"], default: "active" },
      },
    ],
    profileAvatarCandidates: [
      {
        url: { type: String, default: "", trim: true },
        label: { type: String, default: "", trim: true },
        sourceUrl: { type: String, default: "", trim: true },
      },
    ],
    profileGeneratedAt: { type: Date, default: null },
    status: { type: String, enum: ["active", "inactive"], default: "active", index: true },
  },
  { timestamps: true }
);

const programSchema = new mongoose.Schema(
  {
    guestBindings: [
      {
        guestId: { type: mongoose.Schema.Types.ObjectId, ref: "Guest", required: true },
        order: { type: Number, default: 1 },
        role: { type: String, default: "main_guest" },
      },
    ],
    guest: {
      name: { type: String, default: "" },
      title: { type: String, default: "" },
      bio: { type: String, default: "" },
      avatar: { type: String, default: "" },
      profileUrl: { type: String, default: "" },
    },
  },
  { strict: false }
);

const Guest = mongoose.models.Guest || mongoose.model("Guest", guestSchema);
const Program = mongoose.models.Program || mongoose.model("Program", programSchema, "programs");

function toPlainObject(value) {
  if (Array.isArray(value)) return value.map((item) => toPlainObject(item));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      if (key === "__v") continue;
      out[key] = toPlainObject(inner);
    }
    return out;
  }
  return value;
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("请传入嘉宾 JSON 路径");
  const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:60014/xianfeng";

  const raw = fs.readFileSync(inputPath, "utf8");
  const incoming = JSON.parse(raw);
  if (!Array.isArray(incoming)) throw new Error("嘉宾 JSON 必须是数组");

  await mongoose.connect(mongoUri);

  const desired = incoming.map((item) => toPlainObject(item)).filter((item) => item && item._id && item.name);
  const desiredIds = new Set(desired.map((item) => String(item._id)));
  const idMap = new Map();

  for (const guest of desired) {
    const id = String(guest._id);
    await Guest.replaceOne({ _id: id }, guest, { upsert: true });
    idMap.set(id, id);
  }

  // Remove placeholder guests not present in source (e.g. "节目特邀嘉宾")
  await Guest.deleteMany({ _id: { $nin: Array.from(desiredIds) } });

  // Normalize program bindings: keep only valid source guest IDs.
  const programs = await Program.find({}).lean();
  for (const program of programs) {
    const currentBindings = Array.isArray(program.guestBindings) ? program.guestBindings : [];
    const nextBindings = currentBindings
      .filter((b) => desiredIds.has(String(b.guestId)))
      .map((b, idx) => ({
        guestId: b.guestId,
        order: Number(b.order) || idx + 1,
        role: b.role || "main_guest",
      }));

    const guestBlock =
      nextBindings.length > 0
        ? undefined
        : {
            name: "",
            title: "",
            bio: "",
            avatar: "",
            profileUrl: "",
          };

    await Program.updateOne({ _id: program._id }, { guestBindings: nextBindings, ...(guestBlock ? { guest: guestBlock } : {}) });
  }

  const finalCount = await Guest.countDocuments({});
  console.log(JSON.stringify({ imported: desired.length, finalCount }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[import-remote-guests] failed", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
