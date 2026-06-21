import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const AI_ENDPOINT = process.env.AI_API_BASE_URL || "https://api.deepseek.com/v1";
const AI_API_KEY = process.env.AI_API_KEY || process.env.VOLCENGINE_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "deepseek-v4-flash";

console.log("Testing generateMindMap...");
console.log("Endpoint:", AI_ENDPOINT);
console.log("Model:", AI_MODEL);
console.log("API Key:", AI_API_KEY ? "SET (first 8 chars: " + AI_API_KEY.slice(0, 8) + "...)" : "NOT SET");

if (!AI_API_KEY) {
  console.error("ERROR: AI_API_KEY is not set");
  process.exit(1);
}

// 模拟一个节目的数据
const input = {
  title: "家庭作业的正确打开方式——如何让孩子高效完成作业",
  summaryBody: "本期节目讨论了孩子写作业拖拉磨蹭的根本原因，以及家长该如何有效介入。核心观点是家长不应该直接代劳，而是通过建立规律作息、拆解大任务、正面激励等方式帮助孩子建立自主学习能力。",
  highlightText: "不要把孩子的作业变成家长的作业。建立固定的作业时间窗口，每次只安排15-20分钟集中注意力的小任务，用「完成」而非「完美」作为评价标准。",
  dictionaryEntries: [
    { term: "执行功能", definition: "大脑前额叶负责计划、组织、时间管理等高级认知过程的能力" },
    { term: "番茄工作法", definition: "25分钟专注工作+5分钟休息的循环时间管理方法" },
    { term: "成长型思维", definition: "相信能力可以通过努力和学习来发展的思维模式" },
    { term: "脚手架教学", definition: "教师/家长提供适当支持，逐步撤除让学生独立完成的教育方法" },
  ],
  quickView: [
    { timeRangeLabel: "00:00-03:20", summary: "开场引出主题：作业是家长最头疼的事" },
    { timeRangeLabel: "03:20-08:45", summary: "分析孩子拖拉的三大根源：注意力碎片化、任务感压迫、缺乏掌控感" },
    { timeRangeLabel: "08:45-15:30", summary: "拆解大作业为小任务的实操方法，番茄钟用25分钟太久？" },
    { timeRangeLabel: "15:30-22:00", summary: "家长角色转变：从监工到环境设计师，创造低干扰作业空间" },
    { timeRangeLabel: "22:00-28:15", summary: "正面激励vs威胁惩罚，案例对比哪个更有效" },
    { timeRangeLabel: "28:15-33:40", summary: "总结合理期待&行动建议" },
  ],
};

const prompt = `你是一位教育播客的知识结构分析师。请根据以下节目信息，生成一个层级知识树。

节目标题：${input.title}
内容摘要：${input.summaryBody.slice(0, 300)}
核心观点：${input.highlightText.slice(0, 200)}

关键术语：
${input.dictionaryEntries.slice(0, 10).map(d => `${d.term}: ${d.definition.slice(0, 80)}`).join("\n")}

时间线摘要：
${input.quickView.slice(0, 8).map(q => `[${q.timeRangeLabel}] ${q.summary.slice(0, 120)}`).join("\n")}

请输出一个完整的知识树 JSON，结构为：
{
  "root": {
    "title": "一句话概括本期主题",
    "summary": "50字以内概述，说明本期核心议题",
    "emoji": "1个最贴切的emoji",
    "children": [
      {
        "title": "核心观点标题（简洁，10字以内）",
        "summary": "该观点的详细阐述，包含节目中的具体论据（30-60字）",
        "emoji": "匹配内容的1个emoji",
        "children": [
          {
            "title": "具体论据或案例",
            "summary": "节目中提到的具体例证或数据（20-40字）",
            "source": { "type": "transcript", "time": "对应的时间段如00:15:30" }
          }
        ]
      }
    ]
  }
}

要求：
1. root.children 必须有 3-5 个核心观点节点
2. 每个核心观点下面有 1-3 个子节点（论据/案例/方法/术语解释）
3. root.children 的最后一项固定为标题"行动建议"，包含 2-3 条家长可执行的具体建议作为子节点
4. 如果术语表中有重要概念，整合到相关观点下而不是单独列出
5. emoji 要精准匹配内容语义，不同节点用不同 emoji
6. source.time 根据 quickView 时间线填写，确保时间格式为 HH:MM:SS（如 00:15:30）
7. 只输出 JSON，不要任何解释文字、不要 markdown 代码块标记

请直接返回 JSON：`;

try {
  const startTime = Date.now();
  console.log("\nSending request...");
  
  const res = await axios.post(`${AI_ENDPOINT}/chat/completions`, {
    model: AI_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
    max_tokens: 3000,
    response_format: { type: "json_object" },
  }, {
    headers: {
      Authorization: `Bearer ${AI_API_KEY}`,
      "Content-Type": "application/json",
    },
    timeout: 60000,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Response received in ${elapsed}s`);
  
  const content = res.data?.choices?.[0]?.message?.content;
  if (!content) {
    console.error("No content in response");
    console.log("Full response:", JSON.stringify(res.data, null, 2).slice(0, 500));
    process.exit(1);
  }

  const parsed = JSON.parse(content);
  const mindMap = parsed.root || parsed;
  
  console.log("\n✅ Success! Generated MindMap:");
  console.log(JSON.stringify(mindMap, null, 2));
  
  // Count nodes
  function countNodes(node, level = 0) {
    let count = 1;
    const indent = "  ".repeat(level);
    console.log(`${indent}${node.emoji || "📌"} ${node.title}${node.children ? ` (${node.children.length} children)` : ""}`);
    if (node.children) {
      for (const child of node.children) {
        count += countNodes(child, level + 1);
      }
    }
    return count;
  }
  
  console.log(`\nTotal nodes: ${countNodes(mindMap)}`);
  
} catch (error) {
  console.error("\n❌ Error:");
  if (error.response) {
    console.error("Status:", error.response.status);
    console.error("Data:", JSON.stringify(error.response.data, null, 2).slice(0, 500));
  } else {
    console.error(error.message);
  }
  process.exit(1);
}
