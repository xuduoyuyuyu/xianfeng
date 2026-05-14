/**
 * 批量 AI 格式化话题正文
 * 遍历所有 published 话题的 nodes，用 AI 重新排版 content
 *
 * 用法：npx ts-node src/scripts/formatContent.ts
 */

import mongoose from "mongoose";
import Topic from "../models/Topic";
import axios from "axios";

const VOLC_ENDPOINT = process.env.VOLCENGINE_PUBLIC_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
const VOLC_API_KEY = process.env.VOLCENGINE_API_KEY || "";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/xianfeng";

interface NodeInfo {
  topicId: string;
  topicTitle: string;
  layer: string;
  index: number;
  title: string;
  content: string;
}

async function formatContentWithAI(raw: string, nodeTitle: string, topicTitle: string): Promise<string> {
  if (!VOLC_API_KEY) {
    console.warn("No API KEY, skipping AI format");
    return raw;
  }

  const prompt = `你是一位资深教育内容编辑。请对以下话题知识树节点的正文进行排版优化。

话题：${topicTitle}
节点标题：${nodeTitle}

原始正文：
${raw.slice(0, 800)}

请重新排版，要求：
1. 保留全部内容和知识点，不要缩减
2. 按逻辑分段，每段 2-5 句话
3. 核心观点和关键数据用 **加粗**
4. 如果有步骤、方法、建议，用 "1. " "2. " 序号列出
5. 段落之间用空行分隔
6. 语言保持温暖专业，适合家长阅读
7. 不要添加新内容，只做排版优化

请直接返回排版后的纯文本。`;

  try {
    const res = await axios.post(
      `${VOLC_ENDPOINT}/chat/completions`,
      {
        model: "deepseek-v3-250324",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 2048,
      },
      {
        headers: {
          Authorization: `Bearer ${VOLC_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const text = res.data?.choices?.[0]?.message?.content || "";
    return text.trim() || raw;
  } catch (e: any) {
    console.error(`Format error for "${nodeTitle}":`, e.message);
    return raw;
  }
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const topics = await Topic.find({ status: "published" }).lean();
  console.log(`Found ${topics.length} published topics`);

  let totalNodes = 0;
  let formatted = 0;
  let skipped = 0;

  for (const topic of topics) {
    const layers = (topic as any).layers;
    if (!layers) continue;

    const layerKeys = ["layer1", "layer2", "layer3", "layer4", "layer5"];

    for (const key of layerKeys) {
      const nodes = layers[key];
      if (!nodes || !Array.isArray(nodes)) continue;

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node.content || node.content.length < 30) {
          skipped++;
          continue;
        }

        totalNodes++;
        console.log(`  [${topic.title}] ${node.title} (${node.content.length} chars)...`);

        const newContent = await formatContentWithAI(
          node.content,
          node.title,
          topic.title
        );

        if (newContent !== node.content) {
          await Topic.updateOne(
            { _id: topic._id, [`layers.${key}.${i}.key`]: node.key },
            { $set: { [`layers.${key}.${i}.content`]: newContent } }
          );
          formatted++;
          console.log(`    ✅ formatted (${newContent.length} chars)`);
        } else {
          console.log(`    ⏭️  unchanged`);
        }

        // 小延时避免 API 限流
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  console.log(`\nDone! Total: ${totalNodes} nodes, Formatted: ${formatted}, Skipped: ${skipped}`);
  await mongoose.disconnect();
}

main().catch(console.error);
