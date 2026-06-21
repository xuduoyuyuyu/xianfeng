/**
 * 文本清洗工具 — 统一处理 AI 生成内容中的脏数据
 *
 * 脏数据类型：
 *   1. 音乐歌词（含 ♪♫🎵 符号 / 重复句式 / 作词作曲标记）
 *   2. 口头语 / 填充词（嗯啊呃那个然后就是…）
 *   3. 乱码 / 残句（非中文英文的怪异字符、截断句子）
 *   4. 语气词堆叠（"对对对"、"好的好的好的"）
 *   5. JSON 残留（AI 输出混入的 JSON 标记 / markdown fence）
 *   6. 空字段 / 兜底占位文本（"待解析"、"AI 解析暂不可用"等）
 *   7. 雷同段落（多段内容几乎一样）
 */

// ============================================================
// 基础工具
// ============================================================

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// ============================================================
// 脏数据检测
// ============================================================

/** 音乐/歌词特征检测 */
export function isLyricText(text: string): boolean {
  const raw = asText(text);
  if (!raw) return true;
  // 音乐符号
  if (/[♪♫🎵🎶🎼🎤🎧]/u.test(raw)) return true;
  // 作词/作曲/演唱/副歌 等标记
  if (/作词|作曲|编曲|演唱|歌词|副歌|主歌|前奏|间奏|尾奏|music|lyrics|chorus/i.test(raw)) return true;
  // 重复句式（歌词特征：多行高度雷同）
  const lines = raw
    .split(/\n+/)
    .map((line) => line.trim().replace(/[，。！？、,.!?\s~～…（）()]/g, ""))
    .filter(Boolean);
  if (lines.length >= 3) {
    const unique = new Set(lines);
    if (unique.size <= Math.max(1, Math.floor(lines.length / 2))) return true;
  }
  // 纯英文大写行（常见歌词格式）
  if (raw.length > 40 && /^[A-Z\s,.!?'"]+$/.test(raw) && raw.split(/\s+/).length > 6) return true;
  return false;
}

/** 填充词/口头语检测 */
const FILLER_ONLY_SET = new Set([
  "嗯", "嗯嗯", "啊", "啊啊", "哦", "哦哦", "呃", "呃呃",
  "唉", "哎", "诶", "对", "对对", "是", "是的", "好的",
  "好", "行", "可以", "没错", "然后呢", "就是", "那个",
  "这个", "然后", "所以", "那么", "是吧", "对吧",
]);

export function isFillerOnly(text: string): boolean {
  const normalized = asText(text)
    .replace(/[，。！？、,.!?\s~～…]/g, "")
    .toLowerCase();
  if (!normalized) return true;
  if (FILLER_ONLY_SET.has(normalized)) return true;
  if (normalized.length <= 3 && /^([嗯啊哦呃哎诶对是好行可以])+$/u.test(normalized)) return true;
  return false;
}

/** 乱码/非正常文本检测 */
export function isGarbledText(text: string): boolean {
  const raw = asText(text);
  if (!raw) return true;
  // 全角乱码、不可打印字符
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g.test(raw)) return true;
  // 私用区大量字符
  const puaCount = (raw.match(/[\uE000-\uF8FF]/g) || []).length;
  if (puaCount > raw.length * 0.3) return true;
  // 纯符号串
  if (/^[\s~～…\-_=+*&^%$#@!()<>\[\]{}|\\/`'"]+$/.test(raw)) return true;
  // Unicode 替换字符
  if (raw.includes("\uFFFD")) return true;
  return false;
}

/** JSON/Markdown 残留检测 */
export function hasJsonArtifact(text: string): boolean {
  const raw = asText(text);
  if (/^```(?:json)?\s*$/m.test(raw)) return true;
  if (/^\{[\s\S]*\}$/.test(raw) && raw.length < 200) return true;
  if (/"\w+":\s*"/.test(raw) && raw.length < 300) return true;
  return false;
}

/** 无效占位文本检测（系统兜底文本、空占位） */
export function isPlaceholderText(text: string): boolean {
  const raw = asText(text);
  if (!raw) return true;
  const placeholders = [
    "AI 摘要暂不可用", "AI 解析暂不可用", "AI 元数据提取服务暂时不可用",
    "AI 解析服务正在恢复", "待解析", "待AI补全", "AI 自动解析节目",
    "AI 自动生成", "火山语音解析节目", "嘉宾信息待 AI 解析补全",
    "本期节目 AI 解析暂不可用", "完整 Show Notes 将在服务恢复后生成",
    "完整会议纪要将在后台 AI 服务就绪后自动生成",
  ];
  return placeholders.some((p) => raw.includes(p));
}

/** 截断句子检测（在句子中间断了） */
export function isTruncatedSentence(text: string): boolean {
  const raw = asText(text);
  if (raw.length < 5) return false;
  const truncationPatterns = [
    /[，,、]$/,           // 逗号结尾
    /[和与及和]$/,       // 连接词结尾
    /[的得地]$/,         // 结构助词结尾
    /[（(][^)）]*$/,     // 未闭合括号
    /["'「『"'][^"'\」』"']*$/, // 未闭合引号
    /还有$/, /包括$/, /比如$/, /例如$/,
    /但是$/, /不过$/, /然而$/,
    /如果$/, /因为$/, /虽然$/,
  ];
  return truncationPatterns.some((p) => p.test(raw));
}

// ============================================================
// 文本清洗
// ============================================================

/** 移除 JSON/Markdown 残留 */
export function stripJsonArtifacts(text: string): string {
  let result = asText(text);
  // 移除 markdown code fences
  result = result.replace(/^```(?:json)?\s*/gm, "").replace(/```\s*$/gm, "");
  // 移除多余的转义引号
  result = result.replace(/\\"/g, '"').replace(/\\n/g, "\n");
  return result.trim();
}

/** 移除音乐歌词特征 */
export function stripLyrics(text: string): string {
  let result = asText(text);
  // 移除音乐符号
  result = result.replace(/[♪♫🎵🎶🎼🎤🎧]/g, "");
  return result.trim();
}

/** 清理口头语堆叠 */
export function normalizeFillers(text: string): string {
  return asText(text)
    .replace(/([嗯啊哦呃哎诶]){2,}/gu, (_, char) => char) // "嗯嗯嗯嗯" → "嗯"
    .replace(/([对是好好行]){2,}/gu, (_, char) => char)    // "对对对" → "对"
    .replace(/[，。！？、]{2,}/g, (match) => match[0]);     // 多个标点 → 一个
}

/** 全角/半角标点统一 */
export function normalizePunctuation(text: string): string {
  return asText(text)
    .replace(/[：:]/g, "：")
    .replace(/[,，]/g, "，")
    .replace(/[。.]/g, "。")
    .replace(/[!！]/g, "！")
    .replace(/[?？]/g, "？")
    .replace(/[;；]/g, "；")
    .replace(/[(（]/g, "（")
    .replace(/[)）]/g, "）")
    .replace(/['']/g, "'")
    .replace(/[""]/g, "\"");
}

/** 清理多余空白 */
export function normalizeWhitespace(text: string): string {
  return asText(text)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^\s+|\s+$/gm, "")
    .trim();
}

// ============================================================
// 综合清洗
// ============================================================

export interface CleanResult {
  text: string;
  wasDirty: boolean;
  reason?: string;
  original: string;
}

/**
 * 综合清洗：检测并清理所有类型的脏数据
 * @returns 清洗后的干净文本，以及是否被标记为脏
 */
export function cleanText(text: string, context?: string): CleanResult {
  const original = asText(text);

  // 空值
  if (!original) {
    return { text: "", wasDirty: false, original: "" };
  }

  // 检查各种脏数据类型
  if (isLyricText(original)) {
    const stripped = stripLyrics(original);
    if (!stripped || stripped.length < 10) {
      return { text: "", wasDirty: true, reason: "music/lyrics", original };
    }
    return { text: stripped, wasDirty: true, reason: "music/lyrics", original };
  }

  if (isFillerOnly(original)) {
    return { text: "", wasDirty: true, reason: "filler_only", original };
  }

  if (isGarbledText(original)) {
    return { text: "", wasDirty: true, reason: "garbled", original };
  }

  if (isPlaceholderText(original)) {
    return { text: "", wasDirty: true, reason: "placeholder", original };
  }

  if (hasJsonArtifact(original)) {
    const cleaned = stripJsonArtifacts(original);
    if (cleaned && cleaned !== original) {
      return { text: cleaned, wasDirty: true, reason: "json_artifact", original };
    }
  }

  // 常规清洗
  let result = original;
  result = stripJsonArtifacts(result);
  result = normalizeFillers(result);
  result = normalizePunctuation(result);
  result = normalizeWhitespace(result);

  const wasDirty = result !== original;

  // 截断句子检测（只标记不删除，因为可能是正常结尾）
  if (isTruncatedSentence(result)) {
    // 尝试去掉尾部不完整的部分
    const fixed = result.replace(/[，,、和与及和]$/, "。");
    if (fixed !== result) {
      return { text: fixed, wasDirty: true, reason: "truncated", original };
    }
  }

  return { text: result, wasDirty, original };
}

/**
 * 清洗对象中的文本字段（深度遍历）
 */
export function cleanObject<T extends Record<string, any>>(
  obj: T,
  textFields?: string[]
): { result: T; dirtied: string[] } {
  const dirtied: string[] = [];
  const targetFields = textFields || [];

  function walk(value: any, path: string): any {
    if (typeof value === "string") {
      const matchField = targetFields.length === 0 ||
        targetFields.some((f) => path.endsWith(f) || path.includes(`.${f}`));
      if (!matchField) return value;

      const clean = cleanText(value, path);
      if (clean.wasDirty) {
        dirtied.push(`${path}: ${clean.reason}`);
      }
      return clean.text;
    }
    if (Array.isArray(value)) {
      return value.map((item, i) => walk(item, `${path}[${i}]`));
    }
    if (value && typeof value === "object") {
      const result: Record<string, any> = {};
      for (const key of Object.keys(value)) {
        result[key] = walk(value[key], path ? `${path}.${key}` : key);
      }
      return result;
    }
    return value;
  }

  return { result: walk(obj, ""), dirtied };
}

/**
 * 清洗 AI 元数据结果（ProgramAiResult）
 * 针对每个字段做专项清洗
 */
export function cleanAiMetadata(raw: any): {
  result: any;
  dirtied: string[];
  emptyFields: string[];
} {
  const dirtied: string[] = [];
  const emptyFields: string[] = [];

  function clean(value: any, path: string): any {
    if (typeof value === "string") {
      const result = cleanText(value, path);
      if (result.wasDirty) dirtied.push(`${path}: ${result.reason}`);
      if (!result.text && value) {
        emptyFields.push(path);
      }
      return result.text;
    }
    if (Array.isArray(value)) {
      const cleaned = value
        .map((item, i) => clean(item, `${path}[${i}]`))
        .filter((item) => {
          if (typeof item === "string") return item.length > 0;
          if (item && typeof item === "object") {
            // 过滤全空对象
            const vals = Object.values(item).filter((v) =>
              typeof v === "string" ? v.length > 0 : v != null
            );
            return vals.length > 0;
          }
          return item != null;
        });
      return cleaned;
    }
    if (value && typeof value === "object") {
      const result: Record<string, any> = {};
      for (const key of Object.keys(value)) {
        result[key] = clean(value[key], path ? `${path}.${key}` : key);
      }
      return result;
    }
    return value;
  }

  const result = clean(raw, "");
  return { result, dirtied, emptyFields };
}
