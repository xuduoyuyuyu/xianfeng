/**
 * 存量话题补全 suitableGrades 脚本
 * 直接在容器内运行
 */

import mongoose from "mongoose";
import axios from "axios";

const AI_ENDPOINT = process.env.AI_API_BASE_URL || "https://api.deepseek.com/v1";
const AI_API_KEY = process.env.AI_API_KEY || process.env.VOLCENGINE_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "deepseek-v4-flash";
const MONGO_URI = process.env.MONGO_URI || "mongodb://xianfeng_mongo:27017/knowledge-base";

const topicSchema = new mongoose.Schema({}, { strict: false, timestamps: true, collection: "topics" });
const Topic = mongoose.model("Topic", topicSchema, "topics");

async function generateGrades(title: string, subtitle: string, tags: string[]): Promise<string[]> {
  if (!AI_API_KEY) return ["全学段"];

  const prompt = `你是一位教育话题分类专家。请根据话题信息判断最适合哪些年级段的家长。

标题：${title}
副标题：${subtitle || ""}
标签：${tags.join(", ") || "无"}

从以下选项选1-3个：["孕期","0-3岁","幼儿园小班","幼儿园中班","幼儿园大班","小学1-3年级","小学4-6年级","初中","高中","全学段"]

规则：通用话题选"全学段"，有明显年级针对选具体学段。只返回 JSON 数组。`;

  try {
    const res = await axios.post(`${AI_ENDPOINT}/chat/completions`, {
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5, max_tokens: 100,
      response_format: { type: "json_object" },
    }, {
      headers: { Authorization: `Bearer ${AI_API_KEY}`, "Content-Type": "application/json" },
      timeout: 15000,
    });

    const text = res.data?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.suitableGrades) ? parsed.suitableGrades :
           Array.isArray(parsed) ? parsed : ["全学段"];
  } catch (e: any) {
    console.warn(`  AI failed: ${e.message}`);
    return [];
  }
}

async function main() {
  console.log("Connecting...");
  await mongoose.connect(MONGO_URI);
  console.log("Connected\n");

  const topics = await Topic.find({
    $or: [{ suitableGrades: { $exists: false } }, { suitableGrades: { $size: 0 } }],
  });

  console.log(`Found ${topics.length} topics\n`);
  let ok = 0, skip = 0;

  for (let i = 0; i < topics.length; i++) {
    const t = topics[i];
    const tags = Array.isArray(t.get("tags")) ? t.get("tags") : [];
    console.log(`[${i + 1}/${topics.length}] ${t.get("title")}`);
    
    const grades = await generateGrades(t.get("title"), t.get("subtitle") || "", tags);
    if (grades.length > 0) {
      await Topic.findByIdAndUpdate(t._id, { suitableGrades: grades });
      console.log(`  -> [${grades.join(", ")}]`);
      ok++;
    } else {
      skip++;
    }
    await new Promise(r => setTimeout(r, 800));
  }

  console.log(`\nDone: ${ok} ok, ${skip} skipped`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
