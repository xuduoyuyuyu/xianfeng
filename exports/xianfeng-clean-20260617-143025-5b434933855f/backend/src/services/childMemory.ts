const MEMORY_SUMMARY_LIMIT = 800;
const MEMORY_ITEM_SEPARATOR = "\n";
const MEMORY_QUEUE_KEY_PREFIX = "child_memory_queue:";

export function cleanChildMemoryText(value: unknown, limit = 240): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, limit);
}

export function splitChildMemoryItems(summary: string) {
  return compactChildMemoryTexts(String(summary || "")
    .split(/\n+|；+/)
    .map((item) => cleanChildMemoryText(item, 260))
    .filter(Boolean))
    .map((text, index) => ({ id: String(index), text }));
}

export function joinChildMemoryItems(items: Array<{ text: string }>): string {
  return compactChildMemoryTexts(items.map((item) => item.text)).join(MEMORY_ITEM_SEPARATOR);
}

export function normalizeChildMemorySummary(summary: string): string {
  return joinChildMemoryItems(splitChildMemoryItems(summary));
}

/**
 * 构建待处理队列 key（按用户+孩子维度）
 */
export function memoryQueueKey(userId: string, childId: string): string {
  return `${MEMORY_QUEUE_KEY_PREFIX}${userId}:${childId}`;
}

/**
 * 队列项：对话消息片段，午夜批量提取
 */
export interface MemoryQueueItem {
  userMessage: string;
  assistantSummary: string; // 助手的简短回复摘要（前 200 字）
  ts: string;
}

// ── 第一层：页面噪声过滤 ──

function isPageNoise(text: string): boolean {
  return /浏览了页面|当前浏览上下文|当前页面|页面摘要|页面上下文|路径[:：]|\/programs|\/reading|\/worthbuy|\/topics|已读取|超能模式内浏览|你可以继续问我|你可以直接点下方/.test(text);
}

// ── 第二层：关键词快速筛选 ──

function hasDurableSignal(text: string): boolean {
  return /性格|特征|特点|偏好|喜欢|不喜欢|擅长|薄弱|能力|习惯|状态|问题|困难|遇到|最近|长期|总是|经常|容易|怕|抗拒|焦虑|敏感|内向|外向|胆小|哭|拖拉|专注|阅读|写作|作文|数学|睡眠|情绪|社交|沟通|压力|进步|退步|变化|成绩|分数|年级|班|老师|学校|同学|考试|作业/.test(text);
}

function hasChildSubject(text: string): boolean {
  return /孩子|小朋友|娃|儿子|女儿|宝贝|学生|咨询人/.test(text);
}

/**
 * 添加一条对话到待处理队列（不调 LLM，仅追加）
 */
export function enqueueChildMemory(input: {
  userMessage?: string;
  assistantReply?: string;
  childProfile?: string;
}): MemoryQueueItem | null {
  const userMessage = cleanChildMemoryText(input.userMessage, 600);
  if (!userMessage) return null;
  if (isPageNoise(userMessage)) return null;
  if (!hasDurableSignal(userMessage)) return null;

  const assistantSummary = cleanChildMemoryText(input.assistantReply, 200);
  return {
    userMessage,
    assistantSummary,
    ts: new Date().toISOString(),
  };
}

// ── 定时批量提取：用 LLM 从队列中提取核心记忆 ──

interface MemoryFilterResult {
  facts: string[];  // 提炼后的核心事实
  raw: string;      // LLM 原始输出
}

/**
 * 批量调用 LLM 从待处理队列中提取核心长期记忆
 */
export async function batchExtractChildMemory(items: MemoryQueueItem[]): Promise<MemoryFilterResult> {
  if (!items.length) return { facts: [], raw: "" };

  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_API_BASE_URL || "https://api.deepseek.com/v1").replace(/\/+$/, "");
  const model = process.env.AI_MODEL || "deepseek-chat";

  if (!apiKey) {
    // 降级：无 API Key 时直接用关键词提取
    return keywordBasedExtract(items);
  }

  const conversationText = items
    .map((item, i) => `[${i + 1}] 家长说：${item.userMessage}`)
    .join("\n");

  const systemPrompt = `你是家长育儿助手的长期记忆提取器。从多轮对话中提取孩子的核心信息。

只记录以下类型的长期记忆（每条 ≤ 40 字）：
- 孩子的性格特质（内向、敏感、要强等）
- 持续性问题或困难（写作业拖延、社交退缩等）
- 能力特点、偏好（喜欢画画、数学薄弱等）
- 成长变化或关键事件（换班主任、升学、比赛等）
- 家庭教养中的核心矛盾

不记录：
- 通用咨询问题（"怎么培养阅读习惯"等）
- 页面浏览行为
- 家长情绪发泄
- 一次性提问

只输出 JSON：
{"facts": ["核心事实1", "核心事实2", ...]}

如果没有任何值得记录的长期信息，返回 {"facts": []}`;

  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `对话记录：\n${conversationText}\n\n请提取核心长期记忆。` },
        ],
        temperature: 0.1,
        max_tokens: 600,
        stream: false,
      }),
    });
    if (!res.ok) return keywordBasedExtract(items);
    const data = await res.json().catch(() => ({}));
    const rawText = String(data?.choices?.[0]?.message?.content || "").trim();
    const parsed = tryParseJson(rawText);
    if (parsed && Array.isArray(parsed.facts)) {
      return {
        facts: parsed.facts.map((f: any) => cleanChildMemoryText(String(f), 80)).filter(Boolean),
        raw: rawText,
      };
    }
    return keywordBasedExtract(items);
  } catch (_error) {
    return keywordBasedExtract(items);
  }
}

function keywordBasedExtract(items: MemoryQueueItem[]): MemoryFilterResult {
  const facts: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const msg = item.userMessage;
    if (!hasChildSubject(msg)) continue;
    const key = msg.replace(/[，,。.；;！!？?\s]+/g, "").toLowerCase().slice(0, 20);
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(cleanChildMemoryText(msg, 60));
  }
  return { facts, raw: "" };
}

function tryParseJson(text: string): any | null {
  try {
    const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function stripMemoryDate(text: string): string {
  return text.replace(/^\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?\s+/, "").trim();
}

function stripMemoryLabel(text: string): string {
  return stripMemoryDate(text).replace(/^(孩子档案|孩子情况|长期事实|旧记录)[:：]\s*/, "").trim();
}

function memoryItemKind(text: string): "profile" | "fact" {
  const body = stripMemoryLabel(text);
  if (/^(咨询人|关系|出生日期|当前日期|准确年龄|年级|关注标签)[:：]/.test(body)) return "profile";
  if (/孩子档案[:：]/.test(stripMemoryDate(text))) return "profile";
  return "fact";
}

function semanticMemoryKey(text: string): string {
  const kind = memoryItemKind(text);
  if (kind === "profile") return "profile";
  const body = stripMemoryLabel(text)
    .replace(/[，,。.；;！!？?\s]+/g, "")
    .toLowerCase();
  return body.slice(0, 80);
}

function compactChildMemoryTexts(values: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const text = cleanChildMemoryText(value, 260);
    if (!text) continue;
    const body = stripMemoryLabel(text);
    if (!body || isPageNoise(text) || isPageNoise(body)) continue;
    const key = semanticMemoryKey(text);
    if (!key) continue;
    if (byKey.has(key)) byKey.delete(key);
    byKey.set(key, text);
  }
  return Array.from(byKey.values());
}

// ── 午夜定时作业：从队列中提取并合并记忆 ──

/**
 * 每天午夜调用一次：从队列中提取记忆，合并进现有 summary
 * 返回更新后的 summary 和提取结果
 */
export async function processChildMemoryBatch(input: {
  queueItems: MemoryQueueItem[];
  previousSummary: string;
  childProfile?: string;
}): Promise<{ summary: string; factsAdded: string[] }> {
  const { queueItems, previousSummary } = input;

  if (!queueItems.length) {
    return { summary: previousSummary, factsAdded: [] };
  }

  // 批量 LLM 提取
  const { facts } = await batchExtractChildMemory(queueItems);

  if (!facts.length) {
    return { summary: previousSummary, factsAdded: [] };
  }

  // 合并到现有记忆
  const previousItems = splitChildMemoryItems(previousSummary).map((item) => item.text);

  // 追加档案（如果变化）
  const profile = cleanChildMemoryText(input.childProfile, 220);
  if (profile) {
    const existingProfileIndex = previousItems.findIndex((p) => memoryItemKind(p) === "profile");
    const nextProfile = `${formatMemoryDate(new Date())} 孩子档案: ${profile}`;
    if (existingProfileIndex >= 0) previousItems[existingProfileIndex] = nextProfile;
    else previousItems.push(nextProfile);
  }

  // 追加新事实，避免语义重复
  const factsAdded: string[] = [];
  for (const fact of facts) {
    const normalizedNew = fact.replace(/[，,。.；;！!？?\s]+/g, "").toLowerCase();
    const isDuplicate = previousItems.concat(factsAdded.map((f) => `${formatMemoryDate(new Date())} 孩子情况: ${f}`)).some((old) => {
      const normalizedOld = old.replace(/[，,。.；;！!？?\s]+/g, "").toLowerCase();
      const lenRatio = Math.min(normalizedNew.length, normalizedOld.length) / Math.max(normalizedNew.length, normalizedOld.length);
      if (lenRatio < 0.4) return false;
      return normalizedOld.includes(normalizedNew.slice(0, 10)) || normalizedNew.includes(normalizedOld.slice(0, 10));
    });
    if (!isDuplicate) {
      const entry = `${formatMemoryDate(new Date())} 孩子情况: ${fact}`;
      previousItems.push(entry);
      factsAdded.push(fact);
    }
  }

  // 容量控制（保留最新的 800 字）
  const kept: string[] = [];
  let total = 0;
  const allUnique = compactChildMemoryTexts(previousItems);
  for (const piece of [...allUnique].reverse()) {
    const nextTotal = total + piece.length + MEMORY_ITEM_SEPARATOR.length;
    if (nextTotal > MEMORY_SUMMARY_LIMIT && kept.length) break;
    kept.unshift(piece);
    total = nextTotal;
  }

  return {
    summary: kept.join(MEMORY_ITEM_SEPARATOR).slice(-MEMORY_SUMMARY_LIMIT),
    factsAdded,
  };
}

function formatMemoryDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// ── 兼容旧接口：buildChildMemorySummary 现在只做 enqueue，不调 LLM ──

export async function buildChildMemorySummary(input: {
  previous: string;
  childProfile?: string;
  userMessage?: string;
  assistantReply?: string;
  now?: Date;
}): Promise<{ summary: string; queued: boolean }> {
  // 只是把消息加入队列，不修改 summary
  // 实际的压缩提取由午夜定时任务完成
  // 这里保留 archive 兼容性：如果 previous 为空，初始化档案
  let summary = normalizeChildMemorySummary(input.previous || "");

  if (!summary) {
    const profile = cleanChildMemoryText(input.childProfile, 220);
    if (profile) {
      summary = `${formatMemoryDate(input.now || new Date())} 孩子档案: ${profile}`;
    }
  }

  const queued = enqueueChildMemory({
    userMessage: input.userMessage,
    assistantReply: input.assistantReply,
  }) !== null;

  return { summary, queued };
}
