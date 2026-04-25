const mongoose = require("mongoose");
const bcryptjs = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["admin", "user"], default: "user" },
  },
  { timestamps: true }
);

const programSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    coverImage: { type: String, required: true },
    episodes: [
      {
        title: { type: String, required: true },
        duration: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);
const Program = mongoose.models.Program || mongoose.model("Program", programSchema);

async function ensureAdmin() {
  const existing = await User.findOne({ username: "admin" });
  if (existing) return;

  const password = await bcryptjs.hash("admin123456", 10);
  await User.create({
    username: "admin",
    password,
    role: "admin",
  });
}

async function ensureProgram() {
  const existing = await Program.findOne({ title: "深度倾听：如何与正处于叛逆期的幼儿建立情感锚点" });
  if (existing) return;

  await Program.create({
    title: "深度倾听：如何与正处于叛逆期的幼儿建立情感锚点",
    description:
      "探讨如何通过积极的存在将日常互动转化为深层的情感纽带，应对幼儿成长过程中的心理挑战。",
    coverImage:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuD9kNK0Swlk0Z_8qKWeNY7pZRXiC8aQ5uXb7civ7JNln2ot7EXUUGXeU1g4OYo8pUPDqk_iwcI-Fqks1baa6f595CSw302ox2wCyWX3KGkcZq630cbJ0m9-DkHNLkbeKiJQoqTsFuQ41ThYMWb-CkI0xyoZ0sFJR5FyzlKpOAewSqoiZ6kmzawO5-T02uwzHQwHVvASQATN4dsVy6Gl1YGvmuTaEWHvnf3zRDSGoUeBDBsXQA9XGf2dJ2WS1cqnfOfRzJafzReWqXHu",
    episodes: [
      {
        title: "EPISODE 102",
        duration: "52分钟",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      },
    ],
    status: "published",
    publishedAt: new Date(),
  });
}

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:60014/xianfeng";
  await mongoose.connect(uri);
  await ensureAdmin();
  await ensureProgram();
  console.log("[seed-dev-data] admin and sample program ready");
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("[seed-dev-data] failed", error);
  process.exit(1);
});
