/**
 * 存量话题补全 suitableGrades 脚本
 * 
 * 用法：
 *   npx tsx scripts/backfill-suitable-grades.ts
 * 
 * 功能：
 *   遍历所有 suitableGrades 为空的话题，调用 AI 生成适配年级
 *   每次更新一条，间隔 800ms 避免限流
 */

import "dotenv/config";
import mongoose from "mongoose";
import Topic from "../src/models/Topic";
import axios from "axios";

const AI_ENDPOINT = process.env.AI_API_BASE_URL || "https://api.deepseek.com/v1";
const AI_API_KEY = process.env.AI_API_KEY || process.env.VOLCENGINE_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "deepseek-v4-flash";

const MONGO_URI = process.env.MONGO_URI || "mongodb://xianfeng_mongo:27017/knowledge-base";

async function generateGrades(title: string, subtitle: string, tags: string[]): Promise<string[]> {
  if (!AI_API_KEY) {
    console.warn("  ⚠️ No AI API key, using default");
    return ["全学段"];
  }

  const prompt = `你是一位教育话题分类专家。请根据以下话题信息，判断该话题最适合哪些年级段的家长。

话题标题：${title}
话题副标题：${subtitle || ""}
话题标签：${tags.join(", ") || "无"}

请从以下选项中选择1-3个最合适的年级：["孕期","0-3岁","幼儿园小班","幼儿园中班","幼儿园大班","小学1-3年级","小学4-6年级","初中","高中","全学段"]

规则：
- 如果话题对所有年级都有价值（如亲子沟通、心理健康、营养健康），选"全学段"
- 如果话题有明显年级针对性（如"拼音启蒙"→幼儿园大班~小学1-3年级，"青春叛逆"→初中高中），则选择具体学段
- 只有确实通用的才选全学段，否则尽量精确
- 只返回 JSON 数组，如：["小学1-3年级","小学4-6年级"]`;

  try {
    const res = await axios.post(
      `${AI_ENDPOINT}/chat/completions`,
      {
        model: AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: 100,
        response_format: { type: "json_object" },
      },
      {
        headers: {
          Authorization: `Bearer ${AI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const text = res.data?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(text);
    const grades = Array.isArray(parsed.suitableGrades) ? parsed.suitableGrades :
                   Array.isArray(parsed) ? parsed : ["全学段"];
    return grades;
  } catch (e: any) {
    console.warn(`  ⚠️ AI failed: ${e.message}`);
    return [];
  }
}

async function main() {
  console.log("🔌 Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected\n");

  // 查找 suitableGrades 为空的话题
  const topics = await Topic.find({
    $or: [
      { suitableGrades: { $exists: false } },
      { suitableGrades: { $size: 0 } },
    ],
  });

  console.log(`📊 Found ${topics.length} topics without suitableGrades\n`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < topics.length; i++) {
    const t = topics[i];
    const tags = Array.isArray(t.tags) ? t.tags : [];
    
    console.log(`[${i + 1}/${topics.length}] ${t.title}`);
    
    const grades = await generateGrades(t.title, t.subtitle || "", tags);
    
    if (grades.length > 0) {
      try {
        await Topic.findByIdAndUpdate(t._id, { suitableGrades: grades });
        console.log(`  ✅ → [${grades.join(", ")}]`);
        success++;
      } catch (e: any) {
        console.log(`  ❌ save failed: ${e.message}`);
        failed++;
      }
    } else {
      console.log(`  ⏭️ skipped (AI returned empty)`);
      skipped++;
    }

    // 间隔 800ms 避免 API 限流
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log(`\n=== Done ===`);
  console.log(`✅ Success: ${success}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️ Skipped: ${skipped}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
