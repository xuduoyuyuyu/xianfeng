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
import { createInboxMessage } from "./adminInbox";

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

type ArtworkStyle =
  | "cinematic_poster"
  | "editorial_brutalist"
  | "neo_noir"
  | "swiss_grid"
  | "collage_manifesto";

function normalizeArtworkStyle(value: unknown): ArtworkStyle {
  const raw = asText(value).toLowerCase();
  // new design-style presets
  if (raw === "editorial_brutalist") return "editorial_brutalist";
  if (raw === "neo_noir") return "neo_noir";
  if (raw === "swiss_grid") return "swiss_grid";
  if (raw === "collage_manifesto") return "collage_manifesto";
  if (raw === "cinematic_poster") return "cinematic_poster";
  // backward compatibility for old content-style values
  if (raw === "parenting_case") return "collage_manifesto";
  if (raw === "methodology") return "swiss_grid";
  if (raw === "data_shock") return "editorial_brutalist";
  if (raw === "future_school") return "neo_noir";
  return "cinematic_poster";
}

function styleLabel(style: ArtworkStyle): string {
  if (style === "editorial_brutalist") return "Brutalist 编辑风";
  if (style === "neo_noir") return "新黑色霓虹风";
  if (style === "swiss_grid") return "瑞士网格风";
  if (style === "collage_manifesto") return "拼贴宣言风";
  return "电影海报风";
}

function pickArtworkTheme(style: ArtworkStyle) {
  const styleMap: Record<ArtworkStyle, { palette: [string, string, string]; accent: string; textMain: string; textSub: string }> = {
    cinematic_poster: { palette: ["#0B1020", "#1E1B4B", "#312E81"], accent: "#8B5CF6", textMain: "#F8FAFC", textSub: "#C7D2FE" },
    collage_manifesto: { palette: ["#3F0D12", "#6A040F", "#9D0208"], accent: "#FF6B6B", textMain: "#FFF8F1", textSub: "#FFD7BA" },
    swiss_grid: { palette: ["#052E16", "#0F766E", "#115E59"], accent: "#2DD4BF", textMain: "#ECFEFF", textSub: "#99F6E4" },
    editorial_brutalist: { palette: ["#172554", "#1D4ED8", "#1E40AF"], accent: "#F59E0B", textMain: "#EFF6FF", textSub: "#BFDBFE" },
    neo_noir: { palette: ["#111827", "#0F172A", "#1E293B"], accent: "#22D3EE", textMain: "#E0F2FE", textSub: "#A5F3FC" },
  };
  return styleMap[style];
}

function pickSemanticMotif(keywords: string[]) {
  const text = keywords.join(" ");
  if (/(困局|焦虑|压力|内耗|迷茫|冲突)/.test(text)) return "maze";
  if (/(成长|孩子|亲子|家庭|陪伴)/.test(text)) return "orbit";
  if (/(方法|策略|体系|框架|模型|步骤)/.test(text)) return "blueprint";
  if (/(精神|心理|情绪|安全感|自我)/.test(text)) return "pulse";
  return "signal";
}

function clipByChars(value: string, max = 28): string {
  const text = asText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}...`;
}

function pickInsightLine(summary: string, fallback: string): string {
  const clean = asText(summary).replace(/\s+/g, " ");
  const candidates = clean.split(/[。！？!?；;]/).map((x) => asText(x)).filter(Boolean);
  const first = candidates.find((x) => x.length >= 10) || candidates[0] || fallback;
  return clipByChars(first, 34);
}

function buildMotifSvg(motif: string, accent: string): string {
  if (motif === "maze") {
    return `
  <path d="M690 160 H960 V430 H760 V260 H890 V360 H820 V300 H750 V500 H1000" stroke="${accent}" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
  <circle cx="1000" cy="500" r="10" fill="${accent}"/>`;
  }
  if (motif === "orbit") {
    return `
  <circle cx="855" cy="300" r="110" stroke="${accent}" stroke-width="10" fill="none" opacity="0.9"/>
  <circle cx="855" cy="300" r="70" stroke="${accent}" stroke-width="6" fill="none" opacity="0.65"/>
  <circle cx="930" cy="235" r="14" fill="${accent}"/>
  <circle cx="785" cy="358" r="10" fill="${accent}" opacity="0.8"/>`;
  }
  if (motif === "blueprint") {
    return `
  <rect x="700" y="160" width="300" height="280" rx="28" stroke="${accent}" stroke-width="8" fill="none" opacity="0.9"/>
  <line x1="730" y1="220" x2="970" y2="220" stroke="${accent}" stroke-width="6" opacity="0.8"/>
  <line x1="730" y1="276" x2="930" y2="276" stroke="${accent}" stroke-width="6" opacity="0.65"/>
  <line x1="730" y1="332" x2="890" y2="332" stroke="${accent}" stroke-width="6" opacity="0.5"/>`;
  }
  if (motif === "pulse") {
    return `
  <path d="M690 320 H760 L790 250 L840 400 L880 300 H1010" stroke="${accent}" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
  <circle cx="1010" cy="300" r="10" fill="${accent}"/>`;
  }
  return `
  <path d="M700 410 L800 280 L880 360 L980 220" stroke="${accent}" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
  <circle cx="980" cy="220" r="12" fill="${accent}"/>`;
}

function buildArtworkSourceUrl(input: {
  semanticCore: string[];
  parsedSignals: string[];
  style: ArtworkStyle;
}): string {
  const semanticCore = (Array.isArray(input.semanticCore) ? input.semanticCore : []).filter(Boolean).slice(0, 6);
  const parsedSignals = (Array.isArray(input.parsedSignals) ? input.parsedSignals : []).filter(Boolean).slice(0, 10);
  const keywords = [...semanticCore, ...parsedSignals];
  const theme = pickArtworkTheme(input.style);
  const motif = pickSemanticMotif(keywords);
  const nodeCount = Math.max(4, Math.min(12, semanticCore.length + Math.ceil(parsedSignals.length / 2)));
  const ringCount = Math.max(2, Math.min(5, Math.ceil(parsedSignals.length / 2)));
  const strokeDensity = Math.max(4, Math.min(10, Math.ceil(keywords.length / 2)));
  const motifSvg = buildMotifSvg(motif, theme.accent);
  const networkLines = Array.from({ length: strokeDensity })
    .map((_, i) => {
      const startX = 700 + ((i * 73) % 280);
      const startY = 170 + ((i * 97) % 320);
      const endX = 700 + (((i + 3) * 91) % 280);
      const endY = 170 + (((i + 5) * 67) % 320);
      const opacity = 0.25 + ((i % 4) * 0.12);
      return `<line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="${theme.accent}" stroke-width="3" opacity="${opacity.toFixed(2)}"/>`;
    })
    .join("");
  const semanticNodes = Array.from({ length: nodeCount })
    .map((_, i) => {
      const cx = 720 + ((i * 61) % 250);
      const cy = 190 + ((i * 83) % 280);
      const r = 6 + (i % 4) * 3;
      const opacity = 0.35 + ((i % 5) * 0.1);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${theme.accent}" opacity="${opacity.toFixed(2)}"/>`;
    })
    .join("");
  const parsedRings = Array.from({ length: ringCount })
    .map((_, i) => {
      const cx = 220 + i * 150;
      const cy = 520 - i * 26;
      const r = 68 + i * 18;
      const opacity = 0.08 + i * 0.05;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${theme.textSub}" stroke-width="2" fill="none" opacity="${opacity.toFixed(2)}"/>`;
    })
    .join("");
  const svg = `
<svg width="1072" height="714" viewBox="0 0 1072 714" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.palette[0]}"/>
      <stop offset="55%" stop-color="${theme.palette[1]}"/>
      <stop offset="100%" stop-color="${theme.palette[2]}"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.08"/>
    </linearGradient>
  </defs>
  <rect width="1072" height="714" fill="url(#bg)"/>
  <rect x="36" y="36" width="1000" height="642" rx="42" fill="url(#glass)" stroke="#FFFFFF" stroke-opacity="0.18"/>
  <rect x="70" y="76" width="600" height="562" rx="30" fill="#070C17" fill-opacity="0.30"/>
  <rect x="106" y="116" width="190" height="20" rx="10" fill="${theme.accent}" fill-opacity="0.25"/>
  <rect x="106" y="162" width="420" height="34" rx="17" fill="${theme.textMain}" fill-opacity="0.14"/>
  <rect x="106" y="214" width="360" height="22" rx="11" fill="${theme.textSub}" fill-opacity="0.16"/>
  <rect x="106" y="262" width="280" height="22" rx="11" fill="${theme.textSub}" fill-opacity="0.13"/>
  <rect x="106" y="312" width="510" height="10" rx="5" fill="${theme.accent}" fill-opacity="0.22"/>
  <rect x="106" y="340" width="460" height="10" rx="5" fill="${theme.accent}" fill-opacity="0.17"/>
  <rect x="106" y="368" width="380" height="10" rx="5" fill="${theme.accent}" fill-opacity="0.14"/>
  ${parsedRings}
  ${motifSvg}
  ${networkLines}
  ${semanticNodes}
  <rect x="106" y="560" width="520" height="18" rx="9" fill="${theme.textMain}" fill-opacity="0.08"/>
  <rect x="106" y="590" width="440" height="12" rx="6" fill="${theme.textSub}" fill-opacity="0.1"/>
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function collectParsedSignals(program: any): Promise<string[]> {
  const scoreMap = new Map<string, number>();
  const push = (term: unknown, weight = 1) => {
    const text = asText(term);
    if (!text) return;
    scoreMap.set(text, (scoreMap.get(text) || 0) + weight);
  };

  const tags = Array.isArray(program?.summary?.tags) ? program.summary.tags : [];
  for (const tag of tags) push(tag, 3);

  const glossary = Array.isArray(program?.termGlossary) ? program.termGlossary : [];
  for (const item of glossary) push((item as any)?.term, 4);

  const dictionaryEntries = Array.isArray(program?.dictionaryEntries) ? program.dictionaryEntries : [];
  for (const item of dictionaryEntries) push((item as any)?.term, 3);

  const curatedReading = Array.isArray(program?.deepDive?.curatedReading) ? program.deepDive.curatedReading : [];
  for (const item of curatedReading) {
    push((item as any)?.title, 2);
    push((item as any)?.subtitle, 1);
  }

  const keyMoments = Array.isArray(program?.contentPack?.showNotes?.keyMoments) ? program.contentPack.showNotes.keyMoments : [];
  for (const item of keyMoments) {
    push((item as any)?.title, 2);
    push((item as any)?.detail, 1);
  }

  const quickView = Array.isArray(program?.contentPack?.quickView) ? program.contentPack.quickView : [];
  for (const item of quickView) {
    push((item as any)?.label, 2);
    push((item as any)?.value, 1);
  }

  const parsedText = [
    asText(program?.summary?.body),
    JSON.stringify(program?.deepDive || {}),
    JSON.stringify(program?.contentPack || {}),
    JSON.stringify(program?.termGlossary || []),
  ].join("\n");
  const extracted = extractCandidateTerms(parsedText).slice(0, 12);
  for (const item of extracted) push(item, 1);

  return Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([term]) => term);
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
    "还有",
    "这个时候",
    "这种",
    "那个时候",
    "然后呢",
    "其实",
    "比如说",
    "可以说",
    "来说",
    "的话",
    "以及",
    "这样",
    "那样",
    "就是这样",
    "对吧",
    "对吗",
    "哎呀",
    "哎哟",
    "嗯嗯",
    "呃呃",
    "哈哈",
    "呵呵",
    "对对",
    "对对对",
    "来讲",
    "这一块",
  ]);
  const fillerTokenPattern = /^(?:[啊呀嗯哦呃哎欸诶唉哈喂啦呢嘛吧]+|[对嗯啊哦呃哈]{2,}|[A-Za-z]{1,2})$/;
  const repeatedCharPattern = /^([\u4e00-\u9fa5A-Za-z])\1{1,}$/;
  const englishStopwords = new Set([
    "THE",
    "AND",
    "FOR",
    "WITH",
    "THIS",
    "THAT",
    "FROM",
    "INTO",
    "ABOUT",
    "THERE",
    "THEIR",
    "THEM",
    "THEY",
    "WHAT",
    "WHEN",
    "WHERE",
    "WHICH",
    "WOULD",
    "COULD",
    "SHOULD",
    "HAVE",
    "HAS",
    "HAD",
    "WERE",
    "WAS",
    "YOU",
    "YOUR",
    "OURS",
  ]);
  const knownShortEduTerms = new Set(["双减", "家校", "德育", "智育", "美育", "体育"]);

  function shouldKeepChineseToken(token: string): boolean {
    if (!token) return false;
    if (stopwords.has(token)) return false;
    if (fillerTokenPattern.test(token)) return false;
    if (repeatedCharPattern.test(token)) return false;
    if (token.length <= 2 && !knownShortEduTerms.has(token)) return false;
    return true;
  }

  function cleanChineseToken(token: string): string {
    if (!token) return "";
    const explicitMatch = token.match(
      /(神经可塑性|执行功能|家校协同|学习策略|专注力|双减政策|双减|元认知|成长型思维|项目式学习|差异化教学)/
    );
    if (explicitMatch?.[0]) return explicitMatch[0];

    return token
      .replace(/^(我们|你们|他们|其实|主要|关于|对于|围绕|提到|讨论|聊聊|以及|还有|孩子的|家长的|本期|这一期)+/g, "")
      .replace(/^(和|与|及|并|会|将|把|对|在|从|向|给|还|又|就|来|去|说|讲)+/g, "")
      .replace(/(这个问题|这个话题|这一块|这一点)$/g, "")
      .trim();
  }

  const counts = new Map<string, number>();
  const addCount = (value: string) => {
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  };

  const normalizedChineseText = text.replace(/[，。！？；：“”‘’（）()、]/g, " ");
  const explicitPattern = /(神经可塑性|执行功能|家校协同|学习策略|专注力|双减政策|双减|元认知|成长型思维|项目式学习|差异化教学)/g;
  const suffixPattern =
    /[\u4e00-\u9fa5]{2,12}(?:能力|素养|思维|策略|课程|教育|心理|发展|训练|模型|机制|理论|方法|协同|政策|干预|评估|反馈|动机|认知|记忆|专注力|执行功能|可塑性)/g;

  const explicitMatches = normalizedChineseText.match(explicitPattern) || [];
  for (const token of explicitMatches) {
    const cleanedToken = cleanChineseToken(token);
    if (!shouldKeepChineseToken(cleanedToken)) continue;
    addCount(cleanedToken);
  }

  const suffixMatches = normalizedChineseText.match(suffixPattern) || [];
  for (const token of suffixMatches) {
    const cleanedToken = cleanChineseToken(token);
    if (!shouldKeepChineseToken(cleanedToken)) continue;
    addCount(cleanedToken);
  }

  // Conservative fallback for short Chinese chunks when no better term patterns are found.
  if (counts.size === 0) {
    const chinese = normalizedChineseText.match(/[\u4e00-\u9fa5]{2,8}/g) || [];
    for (const token of chinese) {
      const cleanedToken = cleanChineseToken(token);
      if (!shouldKeepChineseToken(cleanedToken)) continue;
      addCount(cleanedToken);
    }
  }

  const english = text.match(/\b[A-Za-z][A-Za-z0-9\-]{2,20}\b/g) || [];
  for (const token of english) {
    const cleaned = token.toUpperCase();
    if (englishStopwords.has(cleaned)) continue;
    addCount(cleaned);
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

async function runProgramArtworkTask(task: any) {
  const program = await Program.findById(task.targetId);
  if (!program) throw new Error("节目不存在");

  const forceOverwrite = task?.options?.forceOverwrite === true;
  const title = asText((program as any)?.title);
  const tags = Array.isArray((program as any)?.summary?.tags) ? (program as any).summary.tags : [];
  const summaryText = asText((program as any)?.summary?.body);
  const transcriptText = (Array.isArray((program as any)?.transcript) ? (program as any)?.transcript : [])
    .map((x: any) => asText(x?.text))
    .filter(Boolean)
    .join(" ");
  const terms = extractCandidateTerms(`${title} ${summaryText} ${transcriptText}`).slice(0, 8);
  const keyword = asText(tags[0]) || terms[0] || title || "教育";
  const parsedSignals = await collectParsedSignals(program);
  const artworkStyle = normalizeArtworkStyle(task?.options?.artworkStyle);
  const generatedUrl = buildArtworkSourceUrl({
    semanticCore: tags.length ? tags.slice(0, 6) : terms.slice(0, 6),
    parsedSignals,
    style: artworkStyle,
  });
  const currentCover = asText((program as any)?.coverImage);
  const shouldApplyCover = forceOverwrite || !currentCover;

  if (shouldApplyCover) {
    await Program.findByIdAndUpdate(
      task.targetId,
      {
        $set: {
          coverImage: generatedUrl,
        },
      },
      { new: false }
    );
  }

  return {
    outputSummary: shouldApplyCover
      ? `配图 agent 已按「${styleLabel(artworkStyle)}」基于关键词与解析内容抽象生成并应用封面。`
      : `配图 agent 已按「${styleLabel(artworkStyle)}」基于关键词与解析内容抽象生成候选封面（未覆盖现有封面）。`,
    output: {
      forceOverwrite,
      artworkStyle,
      generatedCoverImage: generatedUrl,
      previousCoverImage: currentCover,
      applied: shouldApplyCover,
      keyword,
      semanticCore: tags.length ? tags.slice(0, 6) : terms.slice(0, 6),
      parsedSignals,
    },
  };
}

async function runTaskByType(task: any): Promise<{ outputSummary: string; output: Record<string, any> }> {
  if (task.taskType === "proofread_transcript") return runProofreadTask(task);
  if (task.taskType === "enrich_program_content") return runProgramEnrichmentTask(task);
  if (task.taskType === "enrich_guest_profile") return runGuestProfileTask(task);
  if (task.taskType === "generate_program_artwork") return runProgramArtworkTask(task);
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
      const nextTask = await AgentTaskModel.findByIdAndUpdate(task._id, {
        $set: {
          status: "succeeded",
          progress: 100,
          stage: "completed",
          outputSummary: clipText(result.outputSummary, 300),
          output: result.output,
          finishedAt: new Date(),
          lockToken: "",
        },
      }, { new: true });
      if (nextTask) {
        await createInboxMessage({
          sourceType: "agent_task",
          sourceId: String(nextTask._id),
          taskType: nextTask.taskType as any,
          taskStatus: "succeeded",
          targetType: nextTask.targetType as any,
          targetId: String(nextTask.targetId),
          summary: asText(nextTask.outputSummary),
          payload: {
            taskId: String(nextTask._id),
            taskType: nextTask.taskType,
            targetType: nextTask.targetType,
            targetId: String(nextTask.targetId),
            outputSummary: asText(nextTask.outputSummary),
            output: nextTask.output || {},
            finishedAt: nextTask.finishedAt || null,
          },
        }).catch(() => {});
      }
    } catch (error: any) {
      const message = asText(error?.message) || "任务执行失败";
      const nextTask = await AgentTaskModel.findByIdAndUpdate(task._id, {
        $set: {
          status: "failed",
          progress: 100,
          stage: "failed",
          lastError: message,
          finishedAt: new Date(),
          lockToken: "",
        },
        $inc: { retries: 1 },
      }, { new: true });
      if (nextTask) {
        await createInboxMessage({
          sourceType: "agent_task",
          sourceId: String(nextTask._id),
          taskType: nextTask.taskType as any,
          taskStatus: "failed",
          targetType: nextTask.targetType as any,
          targetId: String(nextTask.targetId),
          summary: asText(nextTask.lastError) || "任务执行失败",
          payload: {
            taskId: String(nextTask._id),
            taskType: nextTask.taskType,
            targetType: nextTask.targetType,
            targetId: String(nextTask.targetId),
            lastError: asText(nextTask.lastError),
            retries: Number(nextTask.retries || 0),
            finishedAt: nextTask.finishedAt || null,
          },
        }).catch(() => {});
      }
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
