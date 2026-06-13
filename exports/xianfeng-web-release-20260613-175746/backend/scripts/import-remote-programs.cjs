const fs = require("fs");
const mongoose = require("mongoose");
const bcryptjs = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    mobile: { type: String, default: "" },
    name: { type: String, default: "" },
    grade: { type: String, default: "" },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    avatar_initial: { type: String, default: "探" },
    avatar_image: { type: String, default: "" },
    city: { type: String, default: "" },
    region: { type: String, default: "" },
    childGrade: { type: String, default: "" },
  },
  { timestamps: true }
);

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
    programCode: { type: String, default: "", trim: true, lowercase: true, unique: true, sparse: true, index: true },
    title: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    coverImage: { type: String, required: true },
    episodes: [{ title: String, duration: String, url: String }],
    summary: {
      headline: { type: String, default: "" },
      body: { type: String, default: "" },
      highlightLabel: { type: String, default: "" },
      highlightText: { type: String, default: "" },
      tags: [{ type: String }],
    },
    transcript: [{ time: String, speaker: String, text: String, featured: Boolean }],
    termGlossary: [{ term: String, definition: String, sourceUrl: String, aliases: [{ type: String }] }],
    dictionaryEntryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "EducationDictionaryEntry" }],
    guestBindings: [{ guestId: mongoose.Schema.Types.ObjectId, order: Number, role: String }],
    guest: { name: String, title: String, bio: String, avatar: String, profileUrl: String },
    deepDive: {
      sectionTitle: { type: String, default: "" },
      curatedReading: [{ title: String, subtitle: String, url: String }],
    },
    contentPack: {
      quickView: [{ startTime: String, endTime: String, timeRangeLabel: String, summary: String }],
      minutes: { text: { type: String, default: "" } },
      showNotes: {
        guide: { type: String, default: "" },
        guestIntro: { type: String, default: "" },
        keyMoments: [{ time: String, point: String }],
        renderedText: { type: String, default: "" },
        templateOverride: { type: String, default: "" },
      },
    },
    agentOutputs: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    publishedAt: { type: Date, default: null },
    parseStatus: { type: String, enum: ["idle", "parsing", "success", "failed"], default: "idle" },
    parseStage: { type: String, default: "" },
    parseProgress: { type: Number, default: 0 },
    parseStartedAt: { type: Date, default: null },
    parseFinishedAt: { type: Date, default: null },
    parseError: { type: String, default: "" },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);
const Guest = mongoose.models.Guest || mongoose.model("Guest", guestSchema);
const Program = mongoose.models.Program || mongoose.model("Program", programSchema);

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeName(name) {
  return asText(name).toLowerCase();
}

function toPlainObject(value) {
  if (Array.isArray(value)) return value.map((item) => toPlainObject(item));
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, inner] of Object.entries(value)) {
      if (key === "__v") continue;
      output[key] = toPlainObject(inner);
    }
    return output;
  }
  return value;
}

async function ensureAdmin() {
  const existing = await User.findOne({ username: "admin" });
  if (existing) return false;
  const password = await bcryptjs.hash("admin123456", 10);
  await User.create({ username: "admin", password, role: "admin" });
  return true;
}

function buildGuestDocs(programs) {
  const map = new Map();

  for (const program of programs) {
    const inlineGuests = [];
    if (program?.guest && (program.guest.name || program.guest.title || program.guest.bio || program.guest.avatar)) {
      const binding = Array.isArray(program.guestBindings) ? program.guestBindings[0] : null;
      inlineGuests.push({
        _id: binding?.guestId || undefined,
        ...program.guest,
      });
    }

    if (Array.isArray(program?.guestBindings)) {
      for (const item of program.guestBindings) {
        if (item?.guest) {
          inlineGuests.push({
            _id: item.guestId || item.guest?._id || undefined,
            ...item.guest,
          });
        }
      }
    }

    if (Array.isArray(program?.guests)) {
      inlineGuests.push(...program.guests);
    }

    for (const rawGuest of inlineGuests) {
      const name = asText(rawGuest?.name);
      if (!name) continue;
      const normalizedName = normalizeName(name);
      const existing = map.get(normalizedName) || {};
      const merged = {
        ...existing,
        _id: rawGuest?._id || existing._id,
        name,
        normalizedName,
        title: asText(rawGuest?.title) || existing.title || "",
        bio: asText(rawGuest?.bio) || existing.bio || "",
        avatar: asText(rawGuest?.avatar) || existing.avatar || "",
        profileUrl: asText(rawGuest?.profileUrl) || existing.profileUrl || "",
        profileMarkdown: asText(rawGuest?.profileMarkdown) || existing.profileMarkdown || "",
        profileReferences: Array.isArray(rawGuest?.profileReferences) ? toPlainObject(rawGuest.profileReferences) : existing.profileReferences || [],
        socialProfiles: Array.isArray(rawGuest?.socialProfiles) ? toPlainObject(rawGuest.socialProfiles) : existing.socialProfiles || [],
        publications: Array.isArray(rawGuest?.publications) ? toPlainObject(rawGuest.publications) : existing.publications || [],
        profileAvatarCandidates: Array.isArray(rawGuest?.profileAvatarCandidates)
          ? toPlainObject(rawGuest.profileAvatarCandidates)
          : existing.profileAvatarCandidates || [],
        profileGeneratedAt: rawGuest?.profileGeneratedAt || existing.profileGeneratedAt || null,
        status: rawGuest?.status === "inactive" ? "inactive" : "active",
      };
      map.set(normalizedName, merged);
    }
  }

  return Array.from(map.values());
}

async function importGuests(programs) {
  const guestDocs = buildGuestDocs(programs);
  let imported = 0;

  for (const doc of guestDocs) {
    const selector = doc._id ? { _id: doc._id } : { normalizedName: doc.normalizedName };
    await Guest.replaceOne(selector, doc, { upsert: true });
    imported += 1;
  }

  const finalGuests = await Guest.find({}, { _id: 1, normalizedName: 1 }).lean();
  const guestIdByName = new Map(finalGuests.map((item) => [item.normalizedName, String(item._id)]));
  return { imported, guestIdByName };
}

function normalizeGuestBindings(program, guestIdByName) {
  const bindings = Array.isArray(program?.guestBindings) ? program.guestBindings : [];
  return bindings
    .map((item, index) => {
      const guestId = item?.guestId || guestIdByName.get(normalizeName(item?.guest?.name));
      if (!guestId) return null;
      return {
        guestId,
        order: Number(item?.order) || index + 1,
        role: asText(item?.role) || "main_guest",
      };
    })
    .filter(Boolean);
}

function sanitizeProgram(program, guestIdByName) {
  const doc = toPlainObject(program);
  delete doc.__v;
  delete doc.dictionaryEntries;
  doc.guestBindings = normalizeGuestBindings(doc, guestIdByName);
  if (!Array.isArray(doc.guestBindings)) doc.guestBindings = [];
  if (doc.guest && typeof doc.guest === "object") {
    doc.guest = {
      name: asText(doc.guest.name),
      title: asText(doc.guest.title),
      bio: asText(doc.guest.bio),
      avatar: asText(doc.guest.avatar),
      profileUrl: asText(doc.guest.profileUrl),
    };
  }
  doc.status = doc.status === "draft" ? "draft" : "published";
  return doc;
}

async function importPrograms(programs, guestIdByName) {
  let imported = 0;
  for (const program of programs) {
    const doc = sanitizeProgram(program, guestIdByName);
    await Program.replaceOne({ _id: doc._id }, doc, { upsert: true });
    imported += 1;
  }
  return imported;
}

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:60014/xianfeng";
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("请传入节目 JSON 文件路径");
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  const programs = JSON.parse(raw);
  if (!Array.isArray(programs)) {
    throw new Error("节目 JSON 必须是数组");
  }

  await mongoose.connect(uri);
  const adminCreated = await ensureAdmin();
  const { imported: guestCount, guestIdByName } = await importGuests(programs);
  const programCount = await importPrograms(programs, guestIdByName);
  console.log(JSON.stringify({ adminCreated, guestCount, programCount }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[import-remote-programs] failed", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
