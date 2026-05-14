#!/usr/bin/env node

/**
 * Transcript Agent v2.0 — 独立播客内容处理脚本
 *
 * 步骤流程（按编号顺序）：
 *   Step 0 — ASR:  下载音频，转写为逐字稿
 *   Step 1 — Guest: 从节目描述中提取嘉宾信息，创建/更新嘉宾并绑定
 *   Step 2 — AI:   summary + proofread + dictionary（原有任务）
 *
 * 用法：
 *   node index.mjs <programId> [options]
 *
 * 示例：
 *   node index.mjs 69fe8262adfdf50f6344ba89 --asr --dry-run
 *   node index.mjs 69fe8262adfdf50f6344ba89 --extract-guests --dry-run
 *   node index.mjs 69fe8262adfdf50f6344ba89 --all --dry-run
 *   node index.mjs 69fe8262adfdf50f6344ba89 --tasks summary --dry-run
 */

import "dotenv/config";
import { readFileSync, createWriteStream, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ═══════════════════════════════════════════════
// 1. CONFIG
// ═══════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) {
    printHelp();
    process.exit(args.includes("--help") ? 0 : 1);
  }

  const programId = args[0];
  const taskArg = args.filter((_, i) => args[i - 1] === "--tasks")[0] || "summary,proofread,dictionary";
  const tasks = taskArg.split(",").map((t) => t.trim()).filter(Boolean);
  const dryRun = args.includes("--dry-run");
  const asr = args.includes("--asr");
  const extractGuests = args.includes("--extract-guests");
  const allMode = args.includes("--all");

  const getArgVal = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
  };

  const apiBase = getArgVal("--api-base") || process.env.XF_API_BASE || "https://xianfeng.xinzhi.info/api";
  const model = getArgVal("--model") || process.env.DEEPSEEK_MODEL_ID || "deepseek-chat";
  const asrScript = getArgVal("--asr-script") || "/Applications/Easyclaw.app/Contents/Resources/cfmind/skills/tts-asr/scripts/asr.py";
  const asrLanguage = getArgVal("--asr-language") || "zh";
  const tempDir = getArgVal("--temp-dir") || join(tmpdir(), "transcript-agent");

  const effectiveAsr = allMode || asr;
  const effectiveExtractGuests = allMode || extractGuests;

  const validTasks = new Set(["summary", "proofread", "dictionary"]);
  for (const t of tasks) {
    if (!validTasks.has(t)) {
      console.error(`❌ 无效任务: "${t}"，可选: summary, proofread, dictionary`);
      process.exit(1);
    }
  }

  return { programId, tasks, dryRun, asr: effectiveAsr, extractGuests: effectiveExtractGuests, allMode, apiBase, model, asrScript, asrLanguage, tempDir };
}

function printHelp() {
  const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));
  console.log(`
Transcript Agent v${pkg.version}

用法: node index.mjs <programId> [options]

选项:
  --asr                  Step 0: 下载音频并转写为逐字稿
  --extract-guests       Step 1: 从描述中提取嘉宾信息并绑定
  --all                  一键完成 Step 0 + Step 1 + Step 2（全部任务）
  --tasks <list>         Step 2 任务列表（逗号分隔）: summary, proofread, dictionary
                         默认: summary,proofread,dictionary
  --dry-run              只读模式：不写回 API
  --api-base <url>       API 地址，默认 $XF_API_BASE
  --model <model>        DeepSeek 模型，默认 deepseek-chat
  --asr-script <path>    ASR 脚本路径
  --asr-language <lang>  ASR 语言，默认 zh
  --temp-dir <path>      临时目录，默认系统 tmp
  --help                 显示此帮助

环境变量:
  DEEPSEEK_API_KEY      DeepSeek API 密钥（必填）
  DEEPSEEK_BASE_URL     DeepSeek API 地址
  DEEPSEEK_MODEL_ID     模型名称
  XF_API_BASE           先锋节目 API 地址
  XF_API_TOKEN          API 认证 Token（写操作必填）

步骤说明:
  Step 0 — ASR:          下载节目音频 → ASR 转写 → 更新节目 transcript
  Step 1 — 嘉宾提取:      AI 提取嘉宾信息 → 创建/查重 → 绑定到节目
  Step 2 — AI 处理:       summary（速览）+ proofread（校对）+ dictionary（词典）

示例:
  node index.mjs 69fe8262adfdf50f6344ba89 --asr --dry-run
  node index.mjs 69fe8262adfdf50f6344ba89 --extract-guests --dry-run
  node index.mjs 69fe8262adfdf50f6344ba89 --all --dry-run
  node index.mjs 69fe8262adfdf50f6344ba89 --all
`);
}

// ═══════════════════════════════════════════════
// 2. UTILS
// ═══════════════════════════════════════════════

const asText = (v) => (typeof v === "string" ? v.trim() : "");

function log(step, emoji, message, detail = "") {
  const ts = new Date().toISOString().slice(11, 19);
  const stepLabel = step != null ? `[Step ${step}]` : "";
  console.log(`[${ts}]${stepLabel} ${emoji} ${message}${detail ? ` ${detail}` : ""}`);
}

function logError(step, message, error) {
  const ts = new Date().toISOString().slice(11, 19);
  const stepLabel = step != null ? `[Step ${step}]` : "";
  console.error(`[${ts}]${stepLabel} ❌ ${message}`);
  if (error?.message) console.error(`   原因: ${error.message}`);
  if (error?.status) console.error(`   HTTP ${error.status}`);
  if (error?.body) console.error(`   响应: ${JSON.stringify(error.body).slice(0, 300)}`);
}

async function execPython3(scriptPath, args, { timeout = 600 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [scriptPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => { proc.kill(); reject(new Error(`python3 超时 (${timeout}s)`)); }, timeout * 1000);
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(`python3 退出码 ${code}: ${stderr.trim() || stdout.trim().slice(0, 200)}`));
    });
    proc.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

function guessPlatform(url) {
  const m = [
    [/xiaohongshu\.com|xhslink/i, "小红书"],
    [/weixin\.qq\.com|mp\.weixin/i, "微信公众号"],
    [/weibo\.com/i, "微博"],
    [/zhihu\.com/i, "知乎"],
    [/bilibili\.com|b23\.tv/i, "B站"],
    [/douyin\.com/i, "抖音"],
    [/xiaoyuzhoufm\.com/i, "小宇宙"],
    [/ximalaya\.com/i, "喜马拉雅"],
    [/linkedin\.com/i, "LinkedIn"],
    [/twitter\.com|x\.com/i, "Twitter/X"],
    [/youtube\.com|youtu\.be/i, "YouTube"],
    [/douban\.com/i, "豆瓣"],
  ];
  for (const [re, name] of m) if (re.test(url)) return name;
  return "其他";
}

// ═══════════════════════════════════════════════
// 3. API CLIENT
// ═══════════════════════════════════════════════

class ApiClient {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token || null;
  }
  _headers() {
    const h = { "Content-Type": "application/json" };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return h;
  }
  async _fetch(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const resp = await fetch(url, { ...options, headers: { ...this._headers(), ...(options.headers || {}) } });
    if (!resp.ok) {
      const error = new Error(`API 请求失败: ${resp.status} ${resp.statusText}`);
      error.status = resp.status;
      try { error.body = await resp.json(); } catch { error.body = await resp.text().catch(() => ""); }
      throw error;
    }
    return resp.json();
  }
  async getProgram(id) {
    log(null, "📥", "正在加载节目...", `id=${id}`);
    const p = await this._fetch(`/programs/${id}`);
    const program = Array.isArray(p) ? p[0] : p;
    if (!program?._id) throw new Error(`节目不存在: ${id}`);
    return program;
  }
  async updateProgram(id, payload) {
    log(null, "📤", "正在更新节目...", `id=${id}`);
    return this._fetch(`/admin/programs/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  }
  async createDictionaryEntry(entry) {
    log(null, "📤", "正在创建词典条目...", `term=${entry.term}`);
    return this._fetch("/admin/dictionary", { method: "POST", body: JSON.stringify(entry) });
  }
  async listGuests() {
    log(null, "📥", "正在加载嘉宾列表...");
    return this._fetch("/guests");
  }
  async createGuest(guest) {
    log(null, "📤", "正在创建嘉宾...", `name=${guest.name}`);
    return this._fetch("/admin/guests", { method: "POST", body: JSON.stringify(guest) });
  }
  async updateGuest(id, guest) {
    log(null, "📤", "正在更新嘉宾...", `name=${guest.name}`);
    return this._fetch(`/admin/guests/${id}`, { method: "PUT", body: JSON.stringify(guest) });
  }
}

// ═══════════════════════════════════════════════
// 4. AI CLIENT
// ═══════════════════════════════════════════════

class AiClient {
  constructor(apiKey, baseUrl, model) {
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || "https://api.deepseek.com").replace(/\/+$/, "");
    this.model = model;
  }

  async _chat(messages, { temperature = 0.3, jsonMode = true } = {}) {
    const body = { model: this.model, temperature, messages };
    if (jsonMode) body.response_format = { type: "json_object" };
    const url = `${this.baseUrl}/chat/completions`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      const error = new Error(`DeepSeek API 错误: ${resp.status}`);
      error.body = errText;
      throw error;
    }
    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI 返回空内容");
    if (jsonMode) {
      try { return JSON.parse(content); } catch {
        const match = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
        if (match) return JSON.parse(match[1]);
        throw new Error("AI 返回了非 JSON 格式");
      }
    }
    return content;
  }

  // ── Step 1: 提取嘉宾 ──
  buildGuestExtractionPrompt(program) {
    const title = asText(program.title);
    const description = asText(program.description);
    const showNotesText = asText(program.contentPack?.showNotes?.renderedText);
    const fullText = [title, description, showNotesText].filter(Boolean).join("\n\n");
    const existingNames = (program.guestBindings || []).map((b) => asText(b.guest?.name || b.name || "")).filter(Boolean);

    return {
      system: "你是播客内容分析助手，擅长从节目简介中提取嘉宾信息。请只输出 JSON。",
      user: [
        "请从以下节目描述中提取嘉宾信息。输出 JSON：",
        '{',
        '  "guests": [',
        '    {',
        '      "name": "嘉宾姓名（必填）",',
        '      "title": "头衔/身份",',
        '      "bio": "简介（1-3句话）",',
        '      "profileUrl": "个人主页链接",',
        '      "socialProfiles": [{ "platform": "平台", "url": "链接", "handle": "用户名" }],',
        '      "publications": [{ "title": "书名", "author": "作者", "description": "简介" }],',
        '      "role": "host/co_host/main_guest/guest/contributor"',
        '    }',
        '  ]',
        '}',
        "",
        "提取规则：",
        "1) 从「本期嘉宾」、「嘉宾介绍」等标记处识别嘉宾。",
        "2) 姓名、头衔要准确，基于描述中已有的信息，不要编造。",
        "3) 社交媒体链接从文本 URL 中提取，不要编造链接。",
        "4) 提到书籍名（如《XXX》）提取到 publications。",
        "5) 主播/主持人设为 host/co_host，受邀嘉宾设为 main_guest。",
        `6) 已有嘉宾（跳过）: ${existingNames.length > 0 ? existingNames.join(", ") : "（无）"}`,
        "",
        "节目内容：",
        fullText.slice(0, 6000),
      ].join("\n"),
    };
  }

  async extractGuests(program) {
    log(1, "🤖", "AI 任务: 提取嘉宾信息...");
    const prompt = this.buildGuestExtractionPrompt(program);
    const result = await this._chat([
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ]);
    return (Array.isArray(result.guests) ? result.guests : []).map((g) => ({
      name: asText(g.name),
      title: asText(g.title),
      bio: asText(g.bio),
      profileUrl: asText(g.profileUrl),
      socialProfiles: (Array.isArray(g.socialProfiles) ? g.socialProfiles : []).map((s) => ({
        platform: asText(s.platform), url: asText(s.url), handle: asText(s.handle),
      })).filter((s) => s.platform || s.url),
      publications: (Array.isArray(g.publications) ? g.publications : []).map((p) => ({
        title: asText(p.title), author: asText(p.author), description: asText(p.description),
      })).filter((p) => p.title),
      role: asText(g.role) || "main_guest",
    })).filter((g) => g.name);
  }

  // ── Step 2A: 速览总结 ──
  buildSummaryPrompt(program) {
    const title = asText(program.title) || "未命名节目";
    const description = asText(program.description) || "";
    const transcript = Array.isArray(program.transcript) ? program.transcript : [];
    const transcriptText = transcript.map((seg) => `[${asText(seg.time)}] ${asText(seg.speaker)}: ${asText(seg.text)}`).join("\n");
    return {
      system: "你是教育播客内容运营助手，擅长提炼节目核心要点。请只输出 JSON。",
      user: [
        "请根据以下节目逐字稿，生成速览总结。输出 JSON：",
        '{',
        '  "headline": "一句话概括核心观点（20字内）",',
        '  "body": "速览正文（150-300字），包含：本期讨论了什么问题、关键方法或洞察、可以怎么用"',
        '}',
        "",
        "规则：1) 中文表达，简洁有力。2) headline 抓人。3) body 分 2-3 自然段。4) 避免模板化。",
        `节目标题: ${title}`,
        description ? `节目简介: ${description}` : "",
        "逐字稿：",
        transcriptText.slice(0, 8000) || "（无逐字稿）",
      ].filter(Boolean).join("\n"),
    };
  }

  async generateSummary(program) {
    log(2, "🤖", "AI 任务: 生成速览总结...");
    const prompt = this.buildSummaryPrompt(program);
    const result = await this._chat([
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ]);
    return { headline: asText(result.headline), body: asText(result.body) };
  }

  // ── Step 2B: 校对 ──
  buildProofreadPrompt(program) {
    const transcript = Array.isArray(program.transcript) ? program.transcript : [];
    const transcriptText = transcript.map((seg) => `[${asText(seg.time)}] ${asText(seg.speaker)}: ${asText(seg.text)}`).join("\n");
    return {
      system: "你是专业的播客逐字稿校对助手。请只输出 JSON。",
      user: [
        "请校对以下逐字稿，纠正错别字、语法错误和标点问题。保留说话人、时间戳不变。输出 JSON：",
        '{',
        '  "correctedTranscript": [{ "time": "", "speaker": "", "text": "" }],',
        '  "report": { "typoCount": 0, "punctuationChanges": 0, "terminologyWarnings": 0, "summary": "" }',
        '}',
        "规则：1) 只纠正明显错误。2) 不合并/拆分段落。3) time、speaker 必须与原文一致。",
        "逐字稿：",
        transcriptText.slice(0, 10000) || "（无逐字稿）",
      ].join("\n"),
    };
  }

  async proofreadTranscript(program) {
    log(2, "🤖", "AI 任务: 校对逐字稿...");
    const prompt = this.buildProofreadPrompt(program);
    const result = await this._chat([
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ]);
    return {
      correctedTranscript: Array.isArray(result.correctedTranscript)
        ? result.correctedTranscript.map((seg) => ({
            time: asText(seg.time), speaker: asText(seg.speaker), text: asText(seg.text),
          })).filter((s) => s.time && s.speaker && s.text)
        : [],
      report: {
        typoCount: Number(result.report?.typoCount) || 0,
        punctuationChanges: Number(result.report?.punctuationChanges) || 0,
        terminologyWarnings: Number(result.report?.terminologyWarnings) || 0,
        summary: asText(result.report?.summary) || "校对完成",
      },
    };
  }

  // ── Step 2C: 词典 ──
  buildDictionaryPrompt(program) {
    const title = asText(program.title) || "";
    const transcript = Array.isArray(program.transcript) ? program.transcript : [];
    const transcriptText = transcript.map((seg) => asText(seg.text)).join("\n");
    return {
      system: "你是教育领域术语专家。请只输出 JSON。",
      user: [
        "请从以下节目内容中提取教育相关的专属词语和概念，生成词典条目。输出 JSON：",
        '{',
        '  "entries": [{ "term": "术语", "definition": "通俗易懂的解释（面向家长）", "aliases": ["别名"] }]',
        '}',
        "筛选标准：1) 教育行业专属术语 2) 育儿/升学/成长相关概念 3) 节目中反复出现的关键词",
        "4) definition 用大白话，面向普通家长 5) 不要收录常识性词汇 6) 3-15条，宁缺毋滥",
        `节目标题: ${title}`,
        "逐字稿（前10000字）：",
        transcriptText.slice(0, 10000) || "（无内容）",
      ].join("\n"),
    };
  }

  async extractDictionary(program) {
    log(2, "🤖", "AI 任务: 提取教育词条...");
    const prompt = this.buildDictionaryPrompt(program);
    const result = await this._chat([
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ]);
    return (Array.isArray(result.entries) ? result.entries : [])
      .map((e) => ({ term: asText(e.term), definition: asText(e.definition), aliases: Array.isArray(e.aliases) ? e.aliases.map((a) => asText(a)).filter(Boolean) : [] }))
      .filter((e) => e.term && e.definition);
  }
}

// ═══════════════════════════════════════════════
// 5. STEP 0: ASR
// ═══════════════════════════════════════════════

async function downloadAudio(url, destPath) {
  const dir = destPath.substring(0, destPath.lastIndexOf("/"));
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });

  log(0, "⬇️", "开始下载音频...");
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`下载失败: HTTP ${resp.status}`);
  const total = Number(resp.headers.get("content-length") || 0);
  const totalMB = total ? (total / 1024 / 1024).toFixed(1) : "未知";
  if (total) log(0, "📊", `文件大小: ${totalMB} MB`);

  const fileStream = createWriteStream(destPath);
  const reader = resp.body.getReader();
  let downloaded = 0, lastLog = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value.length;
      fileStream.write(Buffer.from(value));
      const now = Date.now();
      if (now - lastLog > 1000 && total > 0) {
        const pct = ((downloaded / total) * 100).toFixed(1);
        const mb = (downloaded / 1024 / 1024).toFixed(1);
        process.stdout.write(`\r[${new Date().toISOString().slice(11, 19)}][Step 0] ⬇️  ${pct}% (${mb}/${totalMB} MB)`);
        lastLog = now;
      }
    }
  } finally { fileStream.end(); }

  console.log("");
  log(0, "✅", "音频下载完成", `${(downloaded / 1024 / 1024).toFixed(1)} MB`);
  return destPath;
}

async function runASR(audioFilePath, asrScript, asrLanguage) {
  log(0, "🎙️", "开始 ASR 转写...（可能需要几分钟）");
  const result = await execPython3(asrScript, [
    "--audio-file", audioFilePath,
    "--language", asrLanguage,
    "--timeout-seconds", "600",
  ], { timeout: 660 });
  try {
    return JSON.parse(result.stdout);
  } catch {
    const lines = result.stdout.split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try { return JSON.parse(lines[i]); } catch {}
    }
    throw new Error(`ASR 返回无法解析: ${result.stdout.slice(0, 500)}`);
  }
}

function textToTranscriptSegments(text) {
  if (!text) return [];
  const sentences = text.split(/(?<=[。！？；\n])\s*/).map((s) => s.trim()).filter(Boolean);
  const segments = [];
  let seconds = 0;
  const wordsPerSecond = 3; // 中文 ~3字/秒
  for (let i = 0; i < sentences.length; i += 4) {
    const chunk = sentences.slice(i, i + 4).join("");
    if (!chunk.trim()) continue;
    const startMin = Math.floor(seconds / 60);
    const startSec = seconds % 60;
    const chunkDuration = Math.max(10, Math.ceil(chunk.length / wordsPerSecond));
    seconds += chunkDuration;
    const endMin = Math.floor(seconds / 60);
    const endSec = seconds % 60;
    segments.push({
      time: `${String(startMin).padStart(2, "0")}:${String(startSec).padStart(2, "0")}-${String(endMin).padStart(2, "0")}:${String(endSec).padStart(2, "0")}`,
      speaker: "嘉宾",
      text: chunk,
      featured: false,
    });
  }
  return segments;
}

// ═══════════════════════════════════════════════
// 6. STEP 1: GUEST EXTRACTION
// ═══════════════════════════════════════════════

async function processGuests(ai, api, program, dryRun) {
  log(1, "🔍", "开始提取嘉宾信息...");
  const extractedGuests = await ai.extractGuests(program);

  if (extractedGuests.length === 0) {
    log(1, "⚠️", "未从描述中提取到新嘉宾");
    return { extracted: [], created: [], bindings: [] };
  }

  log(1, "📋", `AI 提取到 ${extractedGuests.length} 位嘉宾:`);
  for (const g of extractedGuests) {
    console.log(`   • ${g.name} (${g.title || "未识别头衔"}) [${g.role}]`);
    if (g.bio) console.log(`     bio: ${g.bio.slice(0, 80)}...`);
    if (g.publications?.length) console.log(`     书单: ${g.publications.map((p) => p.title).join(", ")}`);
    if (g.socialProfiles?.length) console.log(`     社交: ${g.socialProfiles.map((s) => `${s.platform}(${s.handle || s.url})`).join(", ")}`);
  }

  if (dryRun) {
    log(1, "🔒", "DRY-RUN: 跳过嘉宾创建和绑定");
    return { extracted: extractedGuests, created: [], bindings: extractedGuests.map((g) => ({ guestName: g.name, role: g.role })) };
  }

  // 获取现有嘉宾列表用于查重
  let existingGuests = [];
  try { existingGuests = await api.listGuests(); } catch (err) {
    logError(1, "获取嘉宾列表失败，将尝试创建所有嘉宾", err);
  }

  const createdGuests = [];
  const newBindings = [];

  for (const extracted of extractedGuests) {
    const existing = existingGuests.find(
      (eg) => asText(eg.name).toLowerCase() === extracted.name.toLowerCase()
    );

    try {
      const guestPayload = {
        name: extracted.name,
        title: extracted.title,
        bio: extracted.bio,
        profileUrl: extracted.profileUrl,
        socialProfiles: extracted.socialProfiles,
        publications: extracted.publications,
      };

      let guestId;
      if (existing) {
        log(1, "🔄", `嘉宾已存在，更新: ${extracted.name}`);
        const updated = await api.updateGuest(existing._id, guestPayload);
        guestId = updated._id || existing._id;
        createdGuests.push({ ...updated, _id: guestId });
      } else {
        log(1, "➕", `创建新嘉宾: ${extracted.name}`);
        const created = await api.createGuest(guestPayload);
        guestId = created._id;
        createdGuests.push(created);
      }

      // 建立绑定
      newBindings.push({
        guestId,
        role: extracted.role,
        guestName: extracted.name,
      });
    } catch (err) {
      logError(1, `嘉宾处理失败: ${extracted.name}`, err);
    }
  }

  return { extracted: extractedGuests, created: createdGuests, bindings: newBindings };
}

// ═══════════════════════════════════════════════
// 7. MAIN
// ═══════════════════════════════════════════════

async function main() {
  const config = parseArgs();

  console.log("═══════════════════════════════════════════");
  log(null, "🚀", "Transcript Agent v2.0 启动");
  console.log(`   节目 ID : ${config.programId}`);
  console.log(`   模式    : ${config.dryRun ? "🔒 DRY-RUN" : "✏️  LIVE"}`);
  console.log(`   API     : ${config.apiBase}`);
  console.log(`   模型    : ${config.model}`);
  const steps = [];
  if (config.asr) steps.push("Step 0: ASR 转写");
  if (config.extractGuests) steps.push("Step 1: 嘉宾提取");
  if (config.tasks.length > 0) steps.push(`Step 2: ${config.tasks.join(", ")}`);
  console.log(`   步骤    : ${steps.length > 0 ? steps.join(" → ") : "（无）"}`);
  console.log("═══════════════════════════════════════════\n");

  // 验证环境
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekKey) { logError(null, "缺少 DEEPSEEK_API_KEY"); process.exit(1); }
  const apiToken = process.env.XF_API_TOKEN || "";
  if (!config.dryRun && !apiToken) {
    log(null, "⚠️", "未设置 XF_API_TOKEN，写操作可能失败（dry-run 模式不需要）");
  }

  const api = new ApiClient(config.apiBase, apiToken);
  const ai = new AiClient(deepseekKey, process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com", config.model);

  // 加载节目
  let program;
  try { program = await api.getProgram(config.programId); } catch (err) {
    logError(null, "加载节目失败", err); process.exit(1);
  }

  const transcriptCount = Array.isArray(program.transcript) ? program.transcript.length : 0;
  log(null, "✅", "节目加载成功", `标题="${asText(program.title)}", transcript=${transcriptCount} 段`);

  if (config.asr && transcriptCount > 0) {
    log(0, "⚠️", "节目已有逐字稿！ASR 将覆盖现有 content。");
    if (!config.dryRun) {
      log(0, "⏳", "继续执行 ASR 覆盖...（5秒后可 Ctrl+C 取消）");
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  // ── Step 0: ASR ──
  let asrResult = null;
  if (config.asr) {
    console.log("");
    try {
      const audioUrl = program.episodes?.[0]?.url;
      if (!audioUrl) {
        log(0, "⚠️", "节目没有音频 URL (episodes[0].url)，跳过 ASR");
      } else {
        log(0, "🔗", `音频 URL: ${audioUrl.slice(0, 100)}...`);
        const ext = audioUrl.match(/\.(m4a|mp3|wav|ogg|aac|flac)/i)?.[1] || "m4a";
        const audioPath = join(config.tempDir, `asr_${config.programId}.${ext}`);
        await downloadAudio(audioUrl, audioPath);
        const asrData = await runASR(audioPath, config.asrScript, config.asrLanguage);
        // 清理临时音频文件
        try { unlinkSync(audioPath); } catch {}
        const text = asText(asrData.text);
        log(0, "📝", `转写文本长度: ${text.length} 字符`);
        const segments = textToTranscriptSegments(text);
        log(0, "📊", `生成 ${segments.length} 个段落`);
        asrResult = { text, segments };

        if (!config.dryRun) {
          log(0, "💾", "正在更新节目 transcript...");
          await api.updateProgram(config.programId, { transcript: segments });
          log(0, "✅", "节目 transcript 更新成功");
        } else {
          log(0, "🔒", "DRY-RUN: 跳过 transcript 更新");
          console.log(`   首段: ${segments[0]?.text?.slice(0, 100)}...`);
        }
      }
    } catch (err) {
      logError(0, "ASR 步骤失败", err);
      log(0, "💡", "提示: ASR 服务目前可能不可用（502/volcengine错误），音频已下载到临时目录");
    }
  }

  // ── Step 1: 嘉宾提取 ──
  let guestResult = null;
  if (config.extractGuests) {
    console.log("");
    try {
      guestResult = await processGuests(ai, api, program, config.dryRun);

      if (guestResult.bindings.length > 0 && !config.dryRun) {
        // 更新节目的 guestBindings
        const existingBindings = Array.isArray(program.guestBindings) ? program.guestBindings : [];
        // 保留已有绑定，追加新的（去重）
        const existingIds = new Set(existingBindings.map((b) => b.guestId).filter(Boolean));
        const newBindings = guestResult.bindings
          .filter((b) => b.guestId && !existingIds.has(b.guestId))
          .map((b) => ({ guestId: b.guestId, order: existingBindings.length + 1, role: b.role }));

        if (newBindings.length > 0) {
          log(1, "💾", `正在绑定 ${newBindings.length} 位嘉宾到节目...`);
          const updatedBindings = [...existingBindings, ...newBindings];
          await api.updateProgram(config.programId, { guestBindings: updatedBindings });
          log(1, "✅", "嘉宾绑定成功");
        } else {
          log(1, "ℹ️", "所有嘉宾已绑定，无需更新");
        }
      } else if (guestResult.bindings.length > 0) {
        log(1, "🔒", "DRY-RUN: 将绑定的嘉宾:");
        for (const b of guestResult.bindings) {
          console.log(`   • ${b.guestName} (${b.role})`);
        }
      }
    } catch (err) {
      logError(1, "嘉宾提取步骤失败", err);
    }
  }

  // ── Step 2: AI 任务 ──
  let step2Results = {};
  if (config.tasks.length > 0) {
    console.log("");
    // 如果 ASR 完成了，用新 transcript
    if (asrResult?.segments) {
      program = { ...program, transcript: asrResult.segments };
    }

    for (const task of config.tasks) {
      console.log("");
      try {
        switch (task) {
          case "summary": {
            const summary = await ai.generateSummary(program);
            step2Results.summary = summary;
            log(2, "✅", "速览总结完成");
            console.log(`   headline: ${summary.headline}`);
            console.log(`   body: ${summary.body.slice(0, 80)}...`);
            break;
          }
          case "proofread": {
            const proofread = await ai.proofreadTranscript(program);
            step2Results.proofread = proofread;
            log(2, "✅", `校对完成: ${proofread.correctedTranscript.length} 段`);
            console.log(`   错别字: ${proofread.report.typoCount}, 标点: ${proofread.report.punctuationChanges}`);
            break;
          }
          case "dictionary": {
            const entries = await ai.extractDictionary(program);
            step2Results.dictionary = entries;
            log(2, "✅", `词典提取完成: ${entries.length} 条`);
            for (const e of entries.slice(0, 5)) {
              console.log(`   • ${e.term}: ${e.definition.slice(0, 50)}...`);
            }
            if (entries.length > 5) console.log(`   ... ${entries.length - 5} 条`);
            break;
          }
        }
      } catch (err) {
        logError(2, `任务 "${task}" 失败`, err);
        step2Results[task] = { error: err.message };
      }
    }

    // 写回 API
    console.log("\n───────────────────────────────────────────");
    if (config.dryRun) {
      log(2, "🔒", "DRY-RUN: 跳过 Step 2 API 写回");
      console.log("\n📋 将写入的 payload:");
      console.log(JSON.stringify(buildUpdateSummary(step2Results), null, 2));
    } else {
      log(2, "✏️", "开始写回 API...");
      await writeStep2Results(api, config.programId, program, step2Results);
    }
  }

  // ── 最终汇总 ──
  console.log("\n═══════════════════════════════════════════");
  log(null, "🎉", "Transcript Agent 执行完毕");

  // 打印汇总
  const summ = [];
  if (asrResult) summ.push(`Step 0: ASR → ${asrResult.segments?.length || 0} 段`);
  if (guestResult) summ.push(`Step 1: ${guestResult.created.length} 位嘉宾`);
  if (step2Results.summary && !step2Results.summary.error) summ.push("Step 2: summary ✓");
  if (step2Results.proofread && !step2Results.proofread.error) summ.push("Step 2: proofread ✓");
  if (step2Results.dictionary && !step2Results.dictionary.error) summ.push(`Step 2: ${step2Results.dictionary.length} 条词典`);
  if (summ.length > 0) {
    console.log("\n📊 执行汇总:");
    summ.forEach((s) => console.log(`   ${s}`));
  }
  console.log("═══════════════════════════════════════════\n");
}

// ═══════════════════════════════════════════════
// 8. STEP 2 WRITE-BACK
// ═══════════════════════════════════════════════

function buildUpdateSummary(results) {
  const summary = {};
  for (const [task, data] of Object.entries(results)) {
    if (data?.error) {
      summary[task] = { error: data.error };
    } else if (task === "summary") {
      summary[task] = { headline: data.headline, body: data.body.slice(0, 100) + "..." };
    } else if (task === "proofread") {
      summary[task] = { segments: data.correctedTranscript?.length || 0, report: data.report };
    } else if (task === "dictionary") {
      summary[task] = { entries: data.length, sample: data.slice(0, 3).map((e) => e.term) };
    }
  }
  return summary;
}

async function writeStep2Results(apiClient, programId, originalProgram, results) {
  const updatePayload = {};

  if (results.summary && !results.summary.error) {
    const origSummary = originalProgram.summary || {};
    updatePayload.summary = {
      headline: asText(results.summary.headline),
      body: asText(results.summary.body),
      highlightLabel: asText(origSummary.highlightLabel),
      highlightText: asText(origSummary.highlightText),
      tags: Array.isArray(origSummary.tags) ? origSummary.tags : [],
    };
  }

  if (results.proofread && !results.proofread.error) {
    updatePayload.agentOutputs = {
      ...(originalProgram.agentOutputs || {}),
      proofread: {
        generatedAt: new Date().toISOString(),
        correctedTranscript: results.proofread.correctedTranscript,
        report: results.proofread.report,
        acceptedAt: null,
        acceptedBy: "",
      },
    };
  }

  if (results.dictionary && !results.dictionary.error) {
    let createdCount = 0;
    for (const entry of results.dictionary) {
      try {
        await apiClient.createDictionaryEntry({
          term: entry.term,
          normalizedTerm: entry.term.toLowerCase(),
          definition: entry.definition,
          aliases: entry.aliases || [],
          programIds: [programId],
        });
        createdCount++;
      } catch (err) {
        logError(null, `词条写入失败: "${entry.term}"`, err);
      }
    }
    log(null, "📊", `词典同步: ${createdCount}/${results.dictionary.length} 条`);
  }

  if (Object.keys(updatePayload).length > 0) {
    try {
      await apiClient.updateProgram(programId, updatePayload);
      log(null, "✅", "节目更新成功");
    } catch (err) {
      logError(null, "节目更新失败", err);
      throw err;
    }
  }
}

// ═══════════════════════════════════════════════
// 9. LAUNCH
// ═══════════════════════════════════════════════

main().catch((err) => {
  console.error("\n❌ 未捕获错误:");
  console.error(err);
  process.exit(1);
});