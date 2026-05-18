import axios from "axios";

// DeepSeek API endpoint（替换已失效的 Volcengine）
const AI_ENDPOINT =
  process.env.AI_API_BASE_URL ||
  "https://api.deepseek.com/v1";
const AI_API_KEY = process.env.AI_API_KEY || process.env.VOLCENGINE_API_KEY || "";
// DeepSeek 模型（v4-flash 速度快、质量好，适合批量生成）
const AI_MODEL = process.env.AI_MODEL || "deepseek-v4-flash";

export interface GenerateTopicInput {
  title: string;
  subtitle?: string;
  tags?: string[];
}

export interface TopicLayerNode {
  key: string;
  title: string;
  summary: string;
  content: string;
  icon?: string;
}

export interface TopicLayersResult {
  layer1: TopicLayerNode[];
  layer2: TopicLayerNode[];
  layer3: TopicLayerNode[];
  layer4: TopicLayerNode[];
  layer5: TopicLayerNode[];
}

/* ===== AI 话题标题生成 ===== */

export async function generateTopicTitle(keyword: string): Promise<{ title: string; subtitle: string; shortSummary: string; coverEmoji: string; tags: string[]; suitableGrades: string[] } | null> {
  // 截断过长输入，避免 prompt 太大导致 JSON 截断
  const input = keyword.length > 100 ? keyword.slice(0, 100) + "…" : keyword;
  const prompt = `你是一位资深教育领域的话题编辑。请根据用户输入的关键词，整理话题名称、副标题、概念简介和最贴切的 Emoji。

用户输入：${input}

要求：
1. 标题：克制、客观、教育视角。用简洁的陈述句式概括教育问题本身，不要感叹号、不追求耸动、不模仿新闻标题。把用户的长篇描述浓缩为教育话题名称
   ✅ 好标题：「隔代教养中的情绪管理」「孩子作业拖拉怎么引导」
   ❌ 坏标题：「监控拍下震惊一幕」「家长崩溃了！」——禁止这种新闻标题风格
2. subtitle 15字以内，简短吸引人的副标题或疑问句
3. shortSummary 30-50字，是话题的概念总结。冷静精准地定义问题本质，与subtitle不同——subtitle负责用疑问/口号吸引点击，shortSummary是概念定义
4. coverEmoji 是1个最贴切的 Emoji，根据话题语义精准对应，禁止使用📚📖📝💡这类通用表情
5. tags 是1-3个核心教育关键词。例如"大路灯是不是智商税"提炼为["大路灯","护眼灯"]，"奶奶带娃发脾气"提炼为["隔代教养","情绪管理"]
6. suitableGrades 是该话题最适合的家长群体年级，从以下选项中选择1-3个（只从列表中选，不要自己编）：["孕期","0-3岁","幼儿园小班","幼儿园中班","幼儿园大班","小学1-3年级","小学4-6年级","初中","高中","全学段"]。如果话题面向所有家长，选["全学段"]。只有确实通用的（如亲子沟通、营养健康等）才选全学段

示例1：关键词"拖延症" → {"title":"告别拖延症","subtitle":"帮孩子找回行动力","shortSummary":"拖延是大脑前额叶执行功能的发育滞后，表现为明知该做却无法启动，与意志力无关，需要科学的策略引导","coverEmoji":"⏰","tags":["拖延症","执行力"],"suitableGrades":["小学1-3年级","小学4-6年级"]}
示例2：关键词"蛀牙" → {"title":"儿童蛀牙防治","subtitle":"一口好牙从小抓起","shortSummary":"蛀牙是口腔细菌利用食物残渣产酸，持续腐蚀牙釉质和牙本质的过程，早期无症状但进展不可逆","coverEmoji":"🦷","tags":["蛀牙","口腔健康"],"suitableGrades":["幼儿园小班","幼儿园中班","幼儿园大班"]}
示例3：关键词"奶奶带娃打骂孩子" → {"title":"隔代教养中的情绪管理","subtitle":"老人发脾气时如何沟通","shortSummary":"隔代教养中老人因体力精力不足、教育观念差异易产生情绪失控，需要建立温和的沟通机制而非指责","coverEmoji":"👵","tags":["隔代教养","情绪管理"],"suitableGrades":["全学段"]}

请直接返回 JSON：{"title":"...","subtitle":"...","shortSummary":"...","coverEmoji":"...","tags":["..."],"suitableGrades":["..."]}`;

  if (!AI_API_KEY) {
    return { title: keyword, subtitle: `关于${keyword}的深度解读`, shortSummary: keyword, coverEmoji: "💡", tags: [keyword], suitableGrades: ["全学段"] };
  }

  try {
    const res = await axios.post(
      `${AI_ENDPOINT}/chat/completions`,
      {
        model: AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 800,
        response_format: { type: "json_object" },
      },
      {
        headers: {
          Authorization: `Bearer ${AI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const text = res.data?.choices?.[0]?.message?.content || "";
    const extractResult = (parsed: any) => ({
      title: parsed.title.trim(),
      subtitle: parsed.subtitle || `关于${keyword}的深度解读`,
      shortSummary: parsed.shortSummary || keyword,
      coverEmoji: (parsed.coverEmoji || "💡").trim(),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 3) : [keyword],
      suitableGrades: Array.isArray(parsed.suitableGrades) ? parsed.suitableGrades : ["全学段"],
    });
    try {
      const parsed = JSON.parse(text);
      if (parsed.title && typeof parsed.title === "string") {
        return extractResult(parsed);
      }
    } catch (parseErr) {
      // JSON 可能被截断，尝试修复
      console.warn("generateTopicTitle JSON parse failed, trying repair:", (parseErr as Error).message);
      try {
        // 尝试找最后一个完整的 key:value 对，截断后补全
        const fixed = text.replace(/,\s*"[^"]*"\s*:\s*[^\]]*$/, "");
        const lastBrace = fixed.lastIndexOf("}");
        const repaired = lastBrace > 0 ? fixed.slice(0, lastBrace + 1) : fixed;
        const parsed = JSON.parse(repaired);
        if (parsed.title && typeof parsed.title === "string") {
          return extractResult(parsed);
        }
      } catch {
        // 修复也失败了
      }
    }
    return null;
  } catch (e) {
    console.error("generateTopicTitle error:", e);
    return null;
  }
}

export async function generateTopicLayers(
  input: GenerateTopicInput
): Promise<TopicLayersResult> {
  const prompt = `你是一位资深教育专家。请根据下面的话题，生成一个完整的五层知识树。

话题：${input.title}${input.subtitle ? `（${input.subtitle}）` : ""}

请严格按照以下五层结构输出，每层3-5个节点（总节点数不少于15个，允许多于15个）：

第1层「认知篇」—— 是什么？提供核心概念、常见误区和基础理论
第2层「诊断篇」—— 怎么判断？提供风险识别、评估方法和自查工具
第3层「方法篇」—— 怎么解决？提供方法论、案例分析和步骤指导
第4层「工具篇」—— 用什么？提供推荐资源、实用工具和评分对比
第5层「行动篇」—— 现在做什么？提供行动计划、检查清单和常见陷阱

每个节点包含：
- title: 简要标题（10字以内，必须针对"${input.title}"定制）
- summary: 一句话概述（25字以内，必须包含话题关键词）
- icon: 相关emoji图标
- content: 先填空字符串 ""，正式内容稍后生成

⚠️ 重要：
1. 三个节点的 title 和 summary 必须完全不同，各有侧重
2. 每个节点必须紧密围绕"${input.title}"
3. 不要生成 content，留空即可

请直接返回 JSON（不要markdown代码块）：
{
  "layer1": [
    {"key": "cog-1", "title": "...", "summary": "...", "content": "", "icon": "💡"},
    ...
  ],
  ...所有5层
}`;

  if (!AI_API_KEY) {
    // 无 API KEY 时返回模板数据
    return generateTemplateLayers(input);
  }

  try {
    const res = await axios.post(
      `${AI_ENDPOINT}/chat/completions`,
      {
        model: AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 8192,
      },
      {
        headers: {
          Authorization: `Bearer ${AI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 60000,
      }
    );

    const text = res.data?.choices?.[0]?.message?.content || "";
    // 尝试提取 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return validateAndFill(parsed, input);
    }
    return generateTemplateLayers(input);
  } catch (e) {
    console.error("AI generateTopicLayers error:", e);
    return generateTemplateLayers(input);
  }
}

export function generateTemplateLayers(
  input: GenerateTopicInput
): TopicLayersResult {
  const t = input.title;
  return {
    layer1: [
      {
        key: "cog-1",
        title: "核心概念",
        summary: `理解${t}的本质与关键定义`,
        content: `「${t}」是一个被广泛讨论但常被误解的话题。从教育学的角度看，父母需要首先准确理解这个话题的内涵与外延，而不是被各种碎片化信息所误导。本文将从底层逻辑出发，帮您建立清晰认知。`,
        icon: "💡",
      },
      {
        key: "cog-2",
        title: "常见误区",
        summary: `关于${t}最常见的3个误解`,
        content: `很多家长和教育者容易陷入以下误区：1. 将表现等同于问题本身，忽略背后的深层原因；2. 急于求成，期望立竿见影的改变；3. 过度依赖外部干预，忽视家庭环境的基础作用。了解这些误区是科学应对的第一步。`,
        icon: "⚠️",
      },
      {
        key: "cog-3",
        title: "理论框架",
        summary: `支撑${t}的学术理论与模型`,
        content: `从发展心理学到认知科学，${t}有多个理论支撑：皮亚杰的认知发展理论帮助我们理解不同年龄段的特点；维果茨基的最近发展区理论指导我们设定合理期望；生态系统理论则提醒我们关注家庭、学校、社会等多层环境的影响。`,
        icon: "📖",
      },
    ],
    layer2: [
      {
        key: "diag-1",
        title: "风险信号",
        summary: `识别${t}问题的早期预警信号`,
        content: `及早发现${t}相关问题的关键在于关注以下信号：行为模式的突然改变、情绪波动的频率和强度增加、社交退缩或攻击性增强、学业表现的明显下滑。这些信号如果持续2周以上，建议进行系统评估。`,
        icon: "🔍",
      },
      {
        key: "diag-2",
        title: "评估工具",
        summary: `科学评估${t}状况的工具与方法`,
        content: `推荐以下经过验证的评估工具：1. 标准化量表——如Achenbach儿童行为量表(CBCL)，适用于4-18岁；2. 专业访谈——由心理咨询师进行的结构化访谈；3. 观察记录——连续2周的行为观察日志。建议结合多种方法综合判断。`,
        icon: "📊",
      },
      {
        key: "diag-3",
        title: "自查清单",
        summary: `家长自测${t}状况的快速清单`,
        content: `请对照以下清单进行初步判断：□ 问题行为每周出现3次以上？□ 持续时间超过1个月？□ 对日常生活/学习造成明显影响？□ 尝试过的方法均无明显改善？□ 孩子本人表达过困扰？如果3项以上打勾，建议寻求专业支持。`,
        icon: "✅",
      },
    ],
    layer3: [
      {
        key: "met-1",
        title: "科学方法",
        summary: `解决${t}问题的系统方法论`,
        content: `针对${t}，建议采用以下分阶段方法：第一阶段（1-2周）观察与记录——建立行为基线；第二阶段（2-4周）温和干预——从最容易改变的环节入手；第三阶段（4-8周）系统调整——结合认知行为方法进行深度干预；第四阶段巩固维护。`,
        icon: "🎯",
      },
      {
        key: "met-2",
        title: "成功案例",
        summary: `改善${t}的真实案例分享`,
        content: `以下是一些真实的改善案例：案例一——8岁男孩通过\"情绪日记+亲子游戏\"组合方案，6周后情绪爆发频率下降70%；案例二——12岁女孩借助\"番茄钟学习法+正向反馈\"，2个月后专注力显著改善。每个案例都遵循了\"评估-干预-反馈\"的闭环原则。`,
        icon: "🌟",
      },
      {
        key: "met-3",
        title: "分步指南",
        summary: `解决${t}的具体操作步骤`,
        content: `步骤一：建立信任关系——每天15分钟\"不打断倾听时间\"；步骤二：设定小目标——将大目标分解为可量化的周目标；步骤三：正向强化——及时肯定每一个微小进步；步骤四：复盘调整——每周日晚上与孩子一起回顾本周进展。`,
        icon: "📝",
      },
    ],
    layer4: [
      {
        key: "tool-1",
        title: "推荐书单",
        summary: `${t}主题的经典必读书目`,
        content: `《如何说孩子才会听》——亲子沟通的经典之作，豆瓣评分8.8；《正面管教》——不惩罚不骄纵的育儿方法，全球销量超500万册；《游戏力》——通过游戏建立亲子连接的方法论。每本书均附有详细的实践练习。`,
        icon: "📚",
      },
      {
        key: "tool-2",
        title: "实用工具",
        summary: `辅助解决${t}的App和工具`,
        content: `推荐App：1. 小日常——习惯养成打卡工具，支持亲子共享；2. 潮汐——专注与放松训练，适合注意力相关话题；3. 简单心理——专业心理咨询平台。推荐网站：中国心理学会官网、教育部家庭教育指导平台。`,
        icon: "🛠️",
      },
      {
        key: "tool-3",
        title: "专业资源",
        summary: `可获取${t}专业支持的渠道`,
        content: `心理咨询热线：全国24小时心理援助热线 400-161-9995；专业机构：各地妇幼保健院儿童心理科、三甲医院精神科；线上课程：中国大学MOOC平台\"儿童发展心理学\"课程免费开放。建议优先选择有资质的机构和持证专业人员。`,
        icon: "🏥",
      },
    ],
    layer5: [
      {
        key: "act-1",
        title: "今日行动",
        summary: `从今天开始可以立即做的3件事`,
        content: `1. 今天晚饭后，放下手机，给孩子15分钟的全神贯注陪伴时间——不说话、不评判，只是观察和倾听；2. 拿出一张纸，写下孩子最近一周表现出的3个优点——哪怕是最微小的；3. 睡前对孩子说一句具体的肯定——\"今天我注意到你...\"，而不是笼统的\"你真棒\"。`,
        icon: "🚀",
      },
      {
        key: "act-2",
        title: "30天计划",
        summary: `${t}的月度改善计划模板`,
        content: `第1周：观察记录周——每天记录3条行为数据和1条积极发现；第2周：微调实验周——引入1个新的家庭规则或习惯，观察反应；第3周：深度沟通周——每天安排10分钟\"特殊时光\"，建立情感连接；第4周：复盘规划周——总结变化，制定下一阶段的调整方案。`,
        icon: "📅",
      },
      {
        key: "act-3",
        title: "避坑指南",
        summary: `解决${t}问题中常见的陷阱`,
        content: `在改善${t}的过程中，最容易掉入的坑：1. 过度比较——每个孩子的发展节奏不同，拿别人家的孩子做标尺会加重焦虑；2. 急于求成——行为改变通常需要6-8周才能稳定，中途放弃等于前功尽弃；3. 全家不一致——父母态度不统一会让孩子无所适从，一致性比完美更重要。`,
        icon: "🕳️",
      },
    ],
  };
}

function validateAndFill(
  parsed: any,
  input: GenerateTopicInput
): TopicLayersResult {
  // 确保所有5层都有数据
  const result = generateTemplateLayers(input);
  if (parsed.layer1?.length) result.layer1 = parsed.layer1;
  if (parsed.layer2?.length) result.layer2 = parsed.layer2;
  if (parsed.layer3?.length) result.layer3 = parsed.layer3;
  if (parsed.layer4?.length) result.layer4 = parsed.layer4;
  if (parsed.layer5?.length) result.layer5 = parsed.layer5;
  return result;
}

/* ===== 展开讲讲 AI 生成 ===== */

export interface ExpandInput {
  topicTitle: string;
  nodeTitle: string;
  existingSummary?: string;
}

export async function generateExpandContent(input: ExpandInput): Promise<string> {
  const { topicTitle, nodeTitle, existingSummary } = input;
  const baseContent = existingSummary || "";

  const prompt = `你是一位资深教育专家。请针对以下话题节点，生成深度的"展开讲讲"内容。

话题：${topicTitle}
节点：${nodeTitle}
${baseContent ? `已有摘要：${baseContent.slice(0, 200)}` : ""}

请生成250-400字的深度内容，严格按以下结构输出：

## 格式结构（必须遵守）
1. **首段：核心观点提炼** — 开篇直接用1句话提炼最核心的观点，用**加粗**，后跟2-3句展开说明
2. **中段：案例/研究支撑** — 用具体案例或研究数据支撑观点，可分段（空行分隔）
3. **末段：可操作建议** — 给出2-3条具体建议，用编号列表（1. 2. 3.）

## 内容要求
1. 必须紧紧围绕"${topicTitle}"，不能写成通用模板
2. 语言温暖专业接地气，适合家长阅读
3. 控制全文250-400字，精炼不啰嗦
4. 每段核心观点用**加粗**标记

## 严禁
- 禁止任何开场白/引导语/过渡词
- 禁止"首先/其次/第一/第二/最后/总而言之/综上所述"等废话
- 禁止重复节点标题作为开篇
- 开篇即核心观点，不寒暄

## 示例（话题：孩子爱攀比，节点：攀比根源）
**攀比心理的根源在于孩子的自我认同尚未建立。** 6-12岁的孩子处于社会比较敏感期，通过与他人对比确认自己的位置，这本质上是寻求认同感的表现。研究表明，过度攀比的孩子往往在家庭中长期缺乏具体的、有针对性的表扬。

北京市某小学的调查显示，72%的"攀比型"孩子家长平时只夸"真棒""真聪明"，而很少指出孩子具体哪里做得好。这种空洞的表扬反而让孩子更依赖外部评价。

1. 停止横向比较，改用纵向对比——只跟昨天的自己比
2. 每天记录3件"今天我进步了"的小事
3. 帮孩子建立"进步日记"，用具体事例替代空泛夸赞`;

  if (!AI_API_KEY) {
    return generateFallbackExpand(topicTitle, nodeTitle, baseContent);
  }

  try {
    const res = await axios.post(
      `${AI_ENDPOINT}/chat/completions`,
      {
        model: AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 1500,
      },
      {
        headers: {
          Authorization: `Bearer ${AI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 90000,
      }
    );

    const text = res.data?.choices?.[0]?.message?.content || "";
    const result = text.trim();
    if (result && result.length > 80) return result;
    return generateFallbackExpand(topicTitle, nodeTitle, baseContent);
  } catch (e) {
    console.error("AI expand error (attempt 1):", (e as any)?.message);
    // 重试一次
    try {
      const res2 = await axios.post(
        `${AI_ENDPOINT}/chat/completions`,
        {
          model: AI_MODEL,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 1200,
        },
        {
          headers: {
            Authorization: `Bearer ${AI_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 60000,
        }
      );
      const text2 = res2.data?.choices?.[0]?.message?.content || "";
      if (text2.trim().length > 80) return text2.trim();
    } catch (e2) {
      console.error("AI expand error (retry):", (e2 as any)?.message);
    }
    return generateFallbackExpand(topicTitle, nodeTitle, baseContent);
  }
}

function generateFallbackExpand(topic: string, node: string, existing: string): string {
  if (existing && existing.length > 100) return existing;

  return `「${node}」是「${topic}」这个主题中非常关键的一个环节。

很多家长在面对这个问题时，往往容易陷入两个极端：要么过度焦虑急于求成，要么完全忽视以为孩子大了自然会好。实际上，找到适合自己家庭节奏的方法才是关键。

建议从三个方面入手：
1. 观察先行——先花一周时间客观记录，不做任何干预；
2. 小步试验——选择最小可行的方法试3天，看孩子的反应再调整；
3. 建立仪式感——把改变变成一项家庭共同的任务而非孩子的负担。

每个孩子都是独特的，没有放之四海皆准的答案。如果你是第一次面对这类问题，不必苛责自己——你已经迈出了最重要的一步：愿意学习和改变。`;
}

/* ===== 深度展开（基于已有内容进一步扩展） ===== */

export interface DeepExpandInput {
  topicTitle: string;
  nodeTitle: string;
  existingContent: string;
}

export async function generateDeepExpandContent(input: DeepExpandInput): Promise<string> {
  const { topicTitle, nodeTitle, existingContent } = input;

  const prompt = `你是一位资深教育专家。

目标话题：${topicTitle}
当前分析节点：${nodeTitle}

已有的参考内容（不要重复）：
${existingContent.slice(0, 600)}

请基于已有内容，直接进入更深度的学术解读。严格遵循：

## 输出格式要求
1. 以自然段落书写，直接深入分析
2. 引用1-2个相关的心理学/教育学理论或研究，解释"${topicTitle}"中的现象
3. 对核心观点做更深入分析，补充不同角度的看法或常见争议
4. 用家长能理解的语言解释学术概念
5. 内容不少于200字，确保分析有深度

## 严禁
- 禁止输出任何开场白、引导语、过渡句（如"以下是为您续写的…""接下来我将从…"等）
- 禁止使用"学术视角""深度解析"等小标题
- 禁止重复已有内容
- 直接输出干货分析，不要任何寒暄`;

  if (!AI_API_KEY) {
    return existingContent;
  }

  try {
    const res = await axios.post(
      `${AI_ENDPOINT}/chat/completions`,
      {
        model: AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 2000,
      },
      {
        headers: {
          Authorization: `Bearer ${AI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 45000,
      }
    );

    const text = res.data?.choices?.[0]?.message?.content || "";
    return text.trim() || existingContent;
  } catch (e) {
    console.error("AI deep expand error:", e);
    return existingContent;
  }
}

/* ===== 异步逐节点深度生成 ===== */

/**
 * 先快速生成话题骨架（浅层 content），再逐节点深度生成。
 * 返回 { topic, totalNodes }，调用方可以轮询 /api/topic-hub/:slug 查看进度。
 */
export async function generateTopicWithDeepContent(
  input: GenerateTopicInput,
  onProgress?: (done: number, total: number) => void
): Promise<TopicLayersResult> {
  // Step 1: 快速生成骨架
  const skeleton = await generateTopicLayers(input);

  if (!AI_API_KEY) return skeleton;

  // Step 2: 收集所有节点
  const allNodes: { layer: keyof TopicLayersResult; idx: number; node: TopicLayerNode }[] = [];
  for (const key of ["layer1", "layer2", "layer3", "layer4", "layer5"] as const) {
    (skeleton[key] || []).forEach((node, idx) => {
      allNodes.push({ layer: key, idx, node });
    });
  }

  const total = allNodes.length;
  let done = 0;

  // Step 3: 并行批量生成深度内容（每批 3 个并发，15 个节点约 2-3 分钟）
  const CONCURRENCY = 3;
  for (let i = 0; i < allNodes.length; i += CONCURRENCY) {
    const batch = allNodes.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        try {
          const deep = await generateExpandContent({
            topicTitle: input.title,
            nodeTitle: item.node.title,
            existingSummary: item.node.summary || item.node.title,
          });
          if (deep && deep.length > 80) {
            skeleton[item.layer][item.idx].content = deep;
            console.log(`  Deep gen OK: "${item.node.title}" → ${deep.length} chars`);
          }
        } catch (e) {
          console.error(`Deep gen failed for ${item.node.title}:`, e);
        }
      })
    );
    done += batch.length;
    if (onProgress) onProgress(done, total);
  }

  return skeleton;
}

/* ===== AI 话题有效性校验 ===== */

export interface ValidateResult {
  valid: boolean;
  reason: string;
  title?: string;
}

/**
 * 从长文本中提炼核心搜索关键词
 * 用户输入一整句话/段落时，AI 提取教育话题关键词
 */
export async function generateKeywordFromLongText(text: string): Promise<string | null> {
  const prompt = `用户输入了一段话，请从中提取最核心的教育话题关键词（5-20字）。忽略寒暄、表情、无关描述，只保留核心问题。

用户输入：${text}

直接输出提炼后的关键词，不要任何解释：`;

  if (!AI_API_KEY) return null;

  try {
    const res = await axios.post(
      `${AI_ENDPOINT}/chat/completions`,
      {
        model: AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 50,
      },
      {
        headers: {
          Authorization: `Bearer ${AI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    const text = res.data?.choices?.[0]?.message?.content?.trim() || "";
    // 去掉可能的引号、换行
    return text.replace(/^["']|["']$/g, "").replace(/\n/g, "").slice(0, 30) || null;
  } catch (e) {
    console.error("generateKeywordFromLongText error:", e);
    return null;
  }
}

/**
 * 校验用户输入的话题关键词是否合规（仅本地基础过滤，不调用 AI）
 * 用户提交不再被 AI 阻拦，由后台审核
 */
export async function validateTopicKeyword(keyword: string): Promise<ValidateResult> {
  const trimmed = keyword.trim();

  // 仅拦截明显无效的输入：空、纯乱敲字符
  if (trimmed.length <= 1) {
    return { valid: false, reason: "请输入有意义的话题内容" };
  }
  if (/^[\d\s\.\,\!\?\-\+\=@#\$%\^&\*\(\)\[\]\{\}\/\\|~`]+$/.test(trimmed)) {
    return { valid: false, reason: "请输入有意义的话题内容" };
  }
  if (/^(.)\1{2,}$/.test(trimmed)) {
    return { valid: false, reason: "请输入有意义的话题内容" };
  }
  // 纯英文+数字短词可能是乱敲（排除大写缩写如 ADHD、PBL、RAZ）
  if (/^[a-zA-Z0-9]{1,8}$/.test(trimmed) && !/^[A-Z]{2,}/.test(trimmed)) {
    return { valid: false, reason: "请输入有意义的话题内容" };
  }

  // 其他所有输入直接放行
  return { valid: true, reason: "" };
}

/**
 * AI 根据话题语义自动匹配适配 Emoji
 */
export async function matchTopicEmoji(title: string, subtitle?: string): Promise<string> {
  const prompt = `你是一个表情符号推荐助手。请根据以下教育话题内容，推荐一个最贴切的 Emoji。

话题标题：${title}
副标题：${subtitle || ""}

要求：
1. 只返回 1 个 Emoji，不要任何其他文字
2. 优先选择与话题语义精准对应的 Emoji
3. 避免使用太通用的 📚📖📝（除非确实最合适）

示例：
- 睡眠话题 → 😴 或 🌙
- ADHD → 🧠
- 拖延症 → ⏰
- 亲子沟通 → 💬
- 情绪管理 → 🎭
- 数学学习 → 🧮
- 阅读习惯 → 📖

请直接返回一个 emoji 字符。`;

  if (!AI_API_KEY) return "💡";

  try {
    const res = await axios.post(
      `${AI_ENDPOINT}/chat/completions`,
      {
        model: AI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 10,
      },
      {
        headers: {
          Authorization: `Bearer ${AI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      }
    );

    const text = (res.data?.choices?.[0]?.message?.content || "").trim();
    // 提取第一个 emoji
    const emojiMatch = text.match(/[\p{Emoji_Presentation}\p{Emoji}\u200d]/u);
    return emojiMatch ? emojiMatch[0] : "💡";
  } catch (e: any) {
    console.error("matchTopicEmoji error:", e.message);
    return "💡";
  }
}
