const MEMORY_SUMMARY_LIMIT = 800;
const MEMORY_ITEM_SEPARATOR = "\n";

export function cleanChildMemoryText(value: unknown, limit = 240): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, limit);
}

export function splitChildMemoryItems(summary: string) {
  return String(summary || "")
    .split(/\n+|；+/)
    .map((item) => cleanChildMemoryText(item, 260))
    .filter(Boolean)
    .map((text, index) => ({ id: String(index), text }));
}

export function buildChildMemorySummary(input: {
  previous: string;
  childProfile?: string;
  userMessage?: string;
  assistantReply?: string;
  now?: Date;
}): string {
  const previousItems = splitChildMemoryItems(input.previous).map((item) => item.text);
  const recordTime = formatMemoryTime(input.now || new Date());
  const pieces = [
    ...previousItems,
    ...buildLongTermChildMemoryItems({
      childProfile: input.childProfile,
      userMessage: input.userMessage,
      recordTime,
    }),
  ].filter(Boolean);
  const seen = new Set<string>();
  const unique = pieces.filter((piece) => {
    const key = piece.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const kept: string[] = [];
  let total = 0;
  for (const piece of unique.reverse()) {
    const nextTotal = total + piece.length + MEMORY_ITEM_SEPARATOR.length;
    if (nextTotal > MEMORY_SUMMARY_LIMIT && kept.length) break;
    kept.unshift(piece);
    total = nextTotal;
  }
  return kept.join(MEMORY_ITEM_SEPARATOR).slice(-MEMORY_SUMMARY_LIMIT);
}

export function joinChildMemoryItems(items: Array<{ text: string }>): string {
  return items.map((item) => item.text).join(MEMORY_ITEM_SEPARATOR);
}

function formatMemoryTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

function buildLongTermChildMemoryItems(input: {
  childProfile?: string;
  userMessage?: string;
  recordTime: string;
}): string[] {
  const items: string[] = [];
  const profile = cleanChildMemoryText(input.childProfile, 220);
  if (profile) {
    items.push(`${input.recordTime} 孩子档案: ${profile}`);
  }

  const userFact = cleanChildMemoryText(input.userMessage, 220);
  if (isLongTermChildFact(userFact)) {
    items.push(`${input.recordTime} 孩子情况: ${userFact}`);
  }
  return items;
}

function isLongTermChildFact(text: string): boolean {
  if (!text) return false;
  if (isBrowsingOrPageNoise(text)) return false;
  const hasChildSubject = /孩子|小朋友|娃|儿子|女儿|宝贝|学生|咨询人/.test(text);
  const hasDurableSignal =
    /性格|特征|特点|偏好|喜欢|不喜欢|擅长|薄弱|能力|习惯|状态|问题|困难|遇到|最近|长期|总是|经常|容易|怕|抗拒|焦虑|敏感|内向|外向|胆小|哭|拖拉|专注|阅读|写作|作文|数学|睡眠|情绪|社交|沟通|压力/.test(text);
  return hasChildSubject && hasDurableSignal;
}

function isBrowsingOrPageNoise(text: string): boolean {
  return /浏览了页面|当前浏览上下文|当前页面|页面摘要|路径:|\/programs|\/reading|\/worthbuy|\/topics|已读取|超能模式内浏览|你可以继续问我|你可以直接点下方/.test(text);
}
