import crypto from "crypto";
import mongoose from "mongoose";
import AgentTaskModel, {
  AgentTaskStatus,
  AgentTaskTargetType,
  AgentTaskType,
} from "../models/AgentTask";
import Program from "../models/Program";
import GuestModel from "../models/Guest";
import { syncProgramDictionaryEntries } from "./educationDictionary";

type CreateTaskInput = {
  taskType: AgentTaskType;
  targetType: AgentTaskTargetType;
  targetId: string;
  options?: Record<string, any>;
  createdBy?: string;
  maxRetries?: number;
};

const POLL_MS = 1500;
let pollTimer: NodeJS.Timeout | null = null;
let working = false;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clipText(value: unknown, max = 200): string {
  const text = asText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}...`;
}

function normalizeTerm(value: unknown): string {
  return asText(value).toLowerCase().replace(/\s+/g, "");
}

export function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizePunctuation(text: string): string {
  return text
    .replace(/,/g, "，")
    .replace(/;/g, "；")
    .replace(/:/g, "：")
    .replace(/\?/g, "？")
    .replace(/!/g, "！");
}

export function titleCaseEnglishToken(text: string): string {
  return text.replace(/\b(ai|gpt|llm)\b/gi, (token) => token.toUpperCase());
}

function looksLikeReferenceUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function buildGlossaryDefinition(term: string): string {
  return `${term}：节目中提及的关键概念，建议结合上下文进一步核验并补充权威定义。`;
}

function termSourceUrl(term: string): string {
  return `https://baike.baidu.com/item/${encodeURIComponent(term)}`;
}

function readingSourceUrl(keyword: string): string {
  return `https://www.bing.com/search?q=${encodeURIComponent(keyword)}`;
}

export function extractCandidateTerms(rawText: string): string[] {
  const text = normalizeSpaces(rawText);
  if (!text) return [];

  const stopwords = new Set([
    "我们",
    "你们",
    "他们",
    "这个",
    "那个",
    "就是",
    "因为",
    "所以",
    "然后",
    "可以",
    "需要",
    "如果",
    "已经",
    "老师",
    "家长",
    "孩子",
    "节目",
    "今天",
    "本期",
    "问题",
    "方法",
    "内容",
  ]);

  const counts = new Map<string, number>();
  const chinese = text.match(/[\u4e00-\u9fa5]{2,8}/g) || [];
  for (const token of chinese) {
    if (stopwords.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  const english = text.match(/\b[A-Za-z][A-Za-z0-9\-]{2,20}\b/g) || [];
  for (const token of english) {
    const cleaned = token.toUpperCase();
    if (["THE", "AND", "FOR", "WITH", "THIS", "THAT"].includes(cleaned)) continue;
    counts.set(cleaned, (counts.get(cleaned) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .slice(0, 12)
    .map(([term]) => term);
}

async function runProofreadTask(task: any) {
  const program = await Program.findById(task.targetId);
  if (!program) throw new Error("节目不存在");

  const transcript = Array.isArray((program as any).transcript)
    ? ((program as any).transcript as Array<any>)
    : [];
  if (transcript.length === 0) {
    return {
      outputSummary: "节目暂无逐字稿可校对",
      output: { correctedTranscript: [], report: { typoCount: 0, punctuationChanges: 0, terminologyWarnings: 0, summary: "暂无可校对文本" } },
    };
  }

  const typoMap: Array<[RegExp, string]> = [
    [/\bai\b/g, "AI"],
    [/\bgpt\b/g, "GPT"],
    [/  +/g, " "],
  ];
  let typoCount = 0;
  let punctuationChanges = 0;

  const correctedTranscript = transcript.map((segment) => {
    let text = asText(segment?.text);
    const original = text;
    text = normalizeSpaces(text);
    const normalizedPunctuation = normalizePunctuation(text);
    if (normalizedPunctuation !== text) punctuationChanges += 1;
    text = normalizedPunctuation;
    const normalizedCase = titleCaseEnglishToken(text);
    if (normalizedCase !== text) typoCount += 1;
    text = normalizedCase;

    for (const [pattern, replacement] of typoMap) {
      const before = text;
      text = text.replace(pattern, replacement);
      if (before !== text) typoCount += 1;
    }
    if (original === text) {
      return {
        time: asText(segment?.time),
        speaker: asText(segment?.speaker) || "嘉宾",
        text: original,
        featured: !!segment?.featured,
      };
    }
    return {
      time: asText(segment?.time),
      speaker: asText(segment?.speaker) || "嘉宾",
      text,
      featured: !!segment?.featured,
    };
  });

  const report = {
    typoCount,
    punctuationChanges,
    terminologyWarnings: 0,
    summary:
      typoCount + punctuationChanges > 0
        ? `完成逐字稿校对：修正 ${typoCount} 处词形/术语，规范 ${punctuationChanges} 处标点。`
        : "未检测到明显可自动修正问题。",
  };

  await Program.findByIdAndUpdate(
    task.targetId,
    {
      $set: {
        "agentOutputs.proofread.taskId": task._id,
        "agentOutputs.proofread.generatedAt": new Date(),
        "agentOutputs.proofread.correctedTranscript": correctedTranscript,
        "agentOutputs.proofread.report": report,
      },
    },
    { new: false }
  );

  return {
    outputSummary: report.summary,
    output: {
      correctedTranscript,
      report,
    },
  };
}

async function runProgramEnrichmentTask(task: any) {
  const program = await Program.findById(task.targetId);
  if (!program) throw new Error("节目不存在");

  const forceOverwrite = task?.options?.forceOverwrite === true;
  const transcriptText = (Array.isArray((program as any).transcript) ? (program as any).transcript : [])
    .map((segment: any) => asText(segment?.text))
    .filter(Boolean)
    .join("\n");
  const summaryText = asText((program as any)?.summary?.body);
  const sourceText = [summaryText, transcriptText].filter(Boolean).join("\n");

  const extracted = extractCandidateTerms(sourceText);
  const existingGlossary = Array.isArray((program as any).termGlossary)
    ? (program as any).termGlossary
    : [];
  const existingTermSet = new Set(existingGlossary.map((item: any) => normalizeTerm(item?.term)));

  const suggestedGlossary = extracted.slice(0, 8).map((term) => ({
    term,
    definition: buildGlossaryDefinition(term),
    sourceUrl: termSourceUrl(term),
    aliases: [],
  }));

  const suggestedReadings = extracted.slice(0, 6).map((term, idx) => ({
    title: `延伸阅读：${term}`,
    subtitle: idx % 2 === 0 ? "概念入门与背景梳理" : "案例与应用实践",
    url: readingSourceUrl(term),
  }));

  let nextGlossary = existingGlossary;
  if (forceOverwrite) {
    nextGlossary = suggestedGlossary;
  } else {
    const appended = suggestedGlossary.filter((item) => !existingTermSet.has(normalizeTerm(item.term)));
    nextGlossary = [...existingGlossary, ...appended];
  }

  const currentDeepDive = (program as any).deepDive || {};
  const existingReadings = Array.isArray(currentDeepDive?.curatedReading)
    ? currentDeepDive.curatedReading
    : [];
  const readingKeys = new Set(existingReadings.map((item: any) => asText(item?.title).toLowerCase()));
  const mergedReadings = forceOverwrite
    ? suggestedReadings
    : [
        ...existingReadings,
        ...suggestedReadings.filter((item) => !readingKeys.has(asText(item.title).toLowerCase())),
      ];

  await Program.findByIdAndUpdate(
    task.targetId,
    {
      $set: {
        termGlossary: nextGlossary,
        deepDive: {
          sectionTitle: asText(currentDeepDive?.sectionTitle) || "延伸阅读",
          curatedReading: mergedReadings,
        },
        "agentOutputs.enrichment.taskId": task._id,
        "agentOutputs.enrichment.generatedAt": new Date(),
        "agentOutputs.enrichment.forceOverwrite": forceOverwrite,
        "agentOutputs.enrichment.suggestedGlossary": suggestedGlossary,
        "agentOutputs.enrichment.suggestedReadings": suggestedReadings,
      },
    },
    { new: false }
  );

  await syncProgramDictionaryEntries(String(task.targetId), nextGlossary, "ai_program");

  return {
    outputSummary: `完成资料收集：建议术语 ${suggestedGlossary.length} 项，延伸阅读 ${suggestedReadings.length} 项。`,
    output: {
      forceOverwrite,
      suggestedGlossary,
      suggestedReadings,
      mergedGlossaryCount: nextGlossary.length,
    },
  };
}

async function runGuestProfileTask(task: any) {
  const guest = await GuestModel.findById(task.targetId);
  if (!guest) throw new Error("嘉宾不存在");

  const guestName = asText((guest as any).name) || "嘉宾";
  const guestTitle = asText((guest as any).title) || "特邀嘉宾";
  const guestBio = asText((guest as any).bio);
  const profileUrl = asText((guest as any).profileUrl);

  const references = [
    profileUrl && looksLikeReferenceUrl(profileUrl)
      ? { title: `${guestName} 官方档案`, url: profileUrl, note: "手工维护来源" }
      : null,
    {
      title: `${guestName} 百科`,
      url: `https://baike.baidu.com/item/${encodeURIComponent(guestName)}`,
      note: "公开参考链接",
    },
    {
      title: `${guestName} 维基`,
      url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(guestName)}`,
      note: "公开参考链接",
    },
  ].filter(Boolean) as Array<{ title: string; url: string; note: string }>;

  const avatarCandidates = [
    asText((guest as any).avatar)
      ? { url: asText((guest as any).avatar), label: "当前头像", sourceUrl: asText((guest as any).avatar) }
      : null,
    {
      url: `https://ui-avatars.com/api/?name=${encodeURIComponent(guestName)}&size=512&background=5E17EB&color=ffffff`,
      label: "文字头像备选",
      sourceUrl: "https://ui-avatars.com/",
    },
    {
      url: `https://source.unsplash.com/featured/600x600/?portrait,${encodeURIComponent(guestName)}`,
      label: "公开图像检索候选",
      sourceUrl: "https://unsplash.com/",
    },
  ].filter(Boolean) as Array<{ url: string; label: string; sourceUrl: string }>;

  const markdown = [
    `# ${guestName}`,
    "",
    `> ${guestTitle}`,
    "",
    "## 简介",
    guestBio || "暂无完整简介，建议结合公开访谈、出版物和机构介绍补全。",
    "",
    "## 关键词",
    `- ${guestTitle}`,
    "- 教育实践",
    "- 节目嘉宾",
    "",
    "## 资料索引",
    ...references.map((item) => `- [${item.title}](${item.url})${item.note ? ` - ${item.note}` : ""}`),
    "",
    "## 节目相关备注",
    "- 建议在节目详情中同步维护嘉宾核心观点与代表案例。",
  ].join("\n");

  await GuestModel.findByIdAndUpdate(
    task.targetId,
    {
      $set: {
        profileMarkdown: markdown,
        profileReferences: references,
        profileAvatarCandidates: avatarCandidates,
        profileGeneratedAt: new Date(),
      },
    },
    { new: false }
  );

  return {
    outputSummary: "已生成嘉宾资料草稿、外链索引与头像候选。",
    output: {
      profileMarkdown: markdown,
      profileReferences: references,
      avatarCandidates,
    },
  };
}

async function runTaskByType(task: any): Promise<{ outputSummary: string; output: Record<string, any> }> {
  if (task.taskType === "proofread_transcript") return runProofreadTask(task);
  if (task.taskType === "enrich_program_content") return runProgramEnrichmentTask(task);
  if (task.taskType === "enrich_guest_profile") return runGuestProfileTask(task);
  throw new Error(`未知任务类型: ${task.taskType}`);
}

async function processOneTask(): Promise<void> {
  if (working) return;
  working = true;
  try {
    const lockToken = crypto.randomUUID();
    const task = await AgentTaskModel.findOneAndUpdate(
      { status: "queued" },
      {
        $set: {
          status: "running",
          progress: 5,
          stage: "running",
          startedAt: new Date(),
          finishedAt: null,
          lastError: "",
          lockToken,
        },
      },
      {
        new: true,
        sort: { createdAt: 1 },
      }
    );
    if (!task) return;

    try {
      const result = await runTaskByType(task);
      await AgentTaskModel.findByIdAndUpdate(task._id, {
        $set: {
          status: "succeeded",
          progress: 100,
          stage: "completed",
          outputSummary: clipText(result.outputSummary, 300),
          output: result.output,
          finishedAt: new Date(),
          lockToken: "",
        },
      });
    } catch (error: any) {
      const message = asText(error?.message) || "任务执行失败";
      await AgentTaskModel.findByIdAndUpdate(task._id, {
        $set: {
          status: "failed",
          progress: 100,
          stage: "failed",
          lastError: message,
          finishedAt: new Date(),
          lockToken: "",
        },
        $inc: { retries: 1 },
      });
    }
  } finally {
    working = false;
  }
}

export async function recoverRunningAgentTasks() {
  await AgentTaskModel.updateMany(
    { status: "running" },
    {
      $set: {
        status: "queued",
        stage: "recovered",
        progress: 0,
        lockToken: "",
      },
    }
  );
}

export async function startAgentTaskDispatcher() {
  await recoverRunningAgentTasks();
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    processOneTask().catch(() => {});
  }, POLL_MS);
}

export function stopAgentTaskDispatcher() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

export async function validateTaskTarget(targetType: AgentTaskTargetType, targetId: string) {
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    throw new Error("targetId 非法");
  }
  if (targetType === "program") {
    const exists = await Program.exists({ _id: new mongoose.Types.ObjectId(targetId) });
    if (!exists) throw new Error("目标节目不存在");
    return;
  }
  if (targetType === "guest") {
    const exists = await GuestModel.exists({ _id: new mongoose.Types.ObjectId(targetId) });
    if (!exists) throw new Error("目标嘉宾不存在");
    return;
  }
  throw new Error("未知目标类型");
}

export async function createAgentTask(input: CreateTaskInput) {
  await validateTaskTarget(input.targetType, input.targetId);
  const created = await AgentTaskModel.create({
    taskType: input.taskType,
    targetType: input.targetType,
    targetId: new mongoose.Types.ObjectId(input.targetId),
    options: input.options || {},
    createdBy: asText(input.createdBy),
    maxRetries: Number.isFinite(Number(input.maxRetries)) ? Number(input.maxRetries) : 2,
    status: "queued",
    progress: 0,
    stage: "queued",
  });
  return created;
}

export async function retryAgentTask(taskId: string) {
  if (!mongoose.Types.ObjectId.isValid(taskId)) throw new Error("任务 ID 非法");
  const task = await AgentTaskModel.findById(taskId);
  if (!task) throw new Error("任务不存在");
  if (task.status !== "failed" && task.status !== "canceled") {
    throw new Error("仅失败或已取消任务可重试");
  }
  await AgentTaskModel.findByIdAndUpdate(taskId, {
    $set: {
      status: "queued",
      stage: "queued",
      progress: 0,
      startedAt: null,
      finishedAt: null,
      lastError: "",
      lockToken: "",
    },
  });
  return AgentTaskModel.findById(taskId);
}

export function normalizeTaskResponse(task: any) {
  if (!task) return null;
  return {
    _id: String(task._id),
    taskType: task.taskType as AgentTaskType,
    targetType: task.targetType as AgentTaskTargetType,
    targetId: String(task.targetId),
    status: task.status as AgentTaskStatus,
    options: task.options || {},
    retries: Number(task.retries) || 0,
    maxRetries: Number(task.maxRetries) || 0,
    progress: Number(task.progress) || 0,
    stage: asText(task.stage),
    createdBy: asText(task.createdBy),
    startedAt: task.startedAt || null,
    finishedAt: task.finishedAt || null,
    lastError: asText(task.lastError),
    outputSummary: asText(task.outputSummary),
    output: task.output || {},
    createdAt: task.createdAt || null,
    updatedAt: task.updatedAt || null,
  };
}
