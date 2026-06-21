/**
 * MongoDB 数据清洗脚本
 *
 * 用法（在服务器上执行）：
 *   docker exec xianfeng_mongo mongosh xianfeng --file /tmp/clean-dirty-data.js
 *
 * 清洗范围：
 *   1. programs 集合：summary、contentPack、transcript 中的脏数据
 *   2. topics 集合：AI 生成的脏内容
 *   3. guests 集合：脏 title/bio
 *
 * 运行模式：
 *   DRY_RUN=true   → 只统计不修改
 *   FIX=true       → 执行修复
 */

const DRY_RUN = true;  // 改为 false 执行实际修复

// ============================================================
// 脏数据检测函数
// ============================================================

function isLyricText(text) {
  if (!text || typeof text !== "string") return false;
  if (/[♪♫🎵🎶🎼🎤🎧]/u.test(text)) return true;
  if (/作词|作曲|编曲|演唱|歌词|副歌|主歌|前奏|间奏|尾奏/i.test(text) && text.length < 80) return true;
  const lines = text.split(/\n+/).map(l => l.trim().replace(/[，。！？、,.!?\s~～…（）()]/g, "")).filter(Boolean);
  if (lines.length >= 3) {
    const unique = new Set(lines);
    if (unique.size <= Math.max(1, Math.floor(lines.length / 2))) return true;
  }
  return false;
}

function isFillerOnly(text) {
  if (!text || typeof text !== "string") return false;
  const normalized = text.replace(/[，。！？、,.!?\s~～…]/g, "").toLowerCase();
  const fillerSet = new Set([
    "嗯", "嗯嗯", "啊", "啊啊", "哦", "哦哦", "呃", "呃呃",
    "唉", "哎", "诶", "对", "对对", "是", "是的", "好的",
    "好", "行", "可以", "没错", "然后呢", "就是", "那个",
    "这个", "然后", "所以", "那么",
  ]);
  if (fillerSet.has(normalized)) return true;
  if (normalized.length <= 3 && /^([嗯啊哦呃哎诶对是好行可以])+$/u.test(normalized)) return true;
  return false;
}

function isGarbled(text) {
  if (!text || typeof text !== "string") return false;
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g.test(text)) return true;
  if (text.includes("\uFFFD")) return true;
  return false;
}

function isPlaceholder(text) {
  if (!text || typeof text !== "string") return false;
  const placeholders = [
    "AI 摘要暂不可用", "AI 元数据提取服务暂时不可用",
    "AI 解析服务正在恢复", "待解析", "待AI补全",
    "嘉宾信息将在 AI 解析完成后自动填充",
    "完整会议纪要将在后台 AI 服务就绪后自动生成",
    "本期节目 AI 解析暂不可用", "完整 Show Notes 将在服务恢复后生成",
  ];
  return placeholders.some(p => text.includes(p));
}

function isTruncated(text) {
  if (!text || typeof text !== "string") return false;
  return /[，,、和与及和]$/.test(text.trim());
}

function cleanText(text) {
  if (!text || typeof text !== "string") return text;
  let result = text;
  // 音乐符号
  result = result.replace(/[♪♫🎵🎶]/g, "");
  // JSON残留
  result = result.replace(/^```(?:json)?\s*/gm, "").replace(/```\s*$/gm, "");
  // 口头语归一
  result = result.replace(/([嗯啊哦呃哎诶]){2,}/gu, (_, c) => c);
  // 截断修补
  result = result.replace(/[，,、和与及和]$/, "。");
  return result.trim();
}

// ============================================================
// 统计
// ============================================================

const stats = {
  programs_scanned: 0,
  programs_dirty: 0,
  transcript_dirty_lines: 0,
  quickview_dirty: 0,
  minutes_dirty: 0,
  shownotes_dirty: 0,
  summary_dirty: 0,
  topics_scanned: 0,
  topics_dirty: 0,
  guests_scanned: 0,
  guests_dirty: 0,
};

print("\n==========================================");
print("  数据清洗脚本 v1.0");
print("  DRY_RUN =", DRY_RUN);
print("==========================================\n");

// ============================================================
// 1. programs 集合
// ============================================================

print("📋 [1/3] 扫描 programs 集合...\n");

const programs = db.programs.find({});
let programsFixed = 0;

programs.forEach((p) => {
  stats.programs_scanned++;
  let dirty = false;
  const updates = {};

  // --- transcript ---
  const badTranscript = [];
  if (Array.isArray(p.transcript)) {
    p.transcript.forEach((t, i) => {
      if (isLyricText(t.text)) { badTranscript.push({ idx: i, reason: "lyrics", text: t.text }); dirty = true; }
      else if (isFillerOnly(t.text)) { badTranscript.push({ idx: i, reason: "filler", text: t.text }); dirty = true; }
      else if (isGarbled(t.text)) { badTranscript.push({ idx: i, reason: "garbled", text: t.text }); dirty = true; }
      else if (t.text && t.text.length > 0) {
        const cleaned = cleanText(t.text);
        if (cleaned !== t.text) {
          badTranscript.push({ idx: i, reason: "cleaned", old: t.text, new: cleaned });
          dirty = true;
        }
      }
    });
  }
  if (badTranscript.length > 0) {
    stats.transcript_dirty_lines += badTranscript.length;
    if (!DRY_RUN) {
      const cleanedTranscript = p.transcript.map((t, i) => {
        const match = badTranscript.find(b => b.idx === i);
        if (!match) return t;
        if (match.new) return { ...t, text: match.new };
        return t; // 标记但不删除（手动确认）
      });
      // 只移除明确的脏数据
      const filtered = cleanedTranscript.filter((t, i) => {
        const match = badTranscript.find(b => b.idx === i);
        if (match && ["lyrics", "filler", "garbled"].includes(match.reason)) return false;
        return true;
      });
      updates.transcript = filtered;
    }
  }

  // --- contentPack.quickView ---
  if (Array.isArray(p.contentPack?.quickView)) {
    const dirtyItems = p.contentPack.quickView.filter(q =>
      isLyricText(q.summary) || isFillerOnly(q.summary) || isGarbled(q.summary) || isPlaceholder(q.summary)
    );
    if (dirtyItems.length > 0) {
      stats.quickview_dirty += dirtyItems.length;
      dirty = true;
      if (!DRY_RUN) {
        const cleaned = p.contentPack.quickView
          .filter(q => !isLyricText(q.summary) && !isFillerOnly(q.summary) && !isGarbled(q.summary) && !isPlaceholder(q.summary))
          .map(q => ({ ...q, summary: cleanText(q.summary) }));
        updates["contentPack.quickView"] = cleaned;
      }
    }
  }

  // --- contentPack.minutes.text ---
  if (p.contentPack?.minutes?.text) {
    if (isPlaceholder(p.contentPack.minutes.text) || isGarbled(p.contentPack.minutes.text)) {
      stats.minutes_dirty++;
      dirty = true;
      if (!DRY_RUN) updates["contentPack.minutes.text"] = "";
    }
  }

  // --- contentPack.showNotes ---
  if (p.contentPack?.showNotes) {
    const sn = p.contentPack.showNotes;
    if (isPlaceholder(sn.guide)) { stats.shownotes_dirty++; dirty = true; if (!DRY_RUN) updates["contentPack.showNotes.guide"] = ""; }
    if (isPlaceholder(sn.guestIntro)) { stats.shownotes_dirty++; dirty = true; if (!DRY_RUN) updates["contentPack.showNotes.guestIntro"] = ""; }
  }

  // --- summary ---
  if (p.summary) {
    const s = p.summary;
    if (isPlaceholder(s.headline)) { stats.summary_dirty++; dirty = true; if (!DRY_RUN) updates["summary.headline"] = ""; }
    if (isPlaceholder(s.body)) { stats.summary_dirty++; dirty = true; if (!DRY_RUN) updates["summary.body"] = ""; }
    if (isPlaceholder(s.highlightText)) { stats.summary_dirty++; dirty = true; if (!DRY_RUN) updates["summary.highlightText"] = ""; }
    if (isGarbled(s.body)) { stats.summary_dirty++; dirty = true; if (!DRY_RUN) updates["summary.body"] = cleanText(s.body); }
  }

  if (dirty) {
    stats.programs_dirty++;
    if (!DRY_RUN && Object.keys(updates).length > 0) {
      db.programs.updateOne({ _id: p._id }, { $set: updates });
      programsFixed++;
    }
  }
});

print(`  节目总数:           ${stats.programs_scanned}`);
print(`  有脏数据的节目:     ${stats.programs_dirty}`);
print(`  Transcript脏行数:   ${stats.transcript_dirty_lines}`);
print(`  QuickView脏条数:    ${stats.quickview_dirty}`);
print(`  Minutes脏:          ${stats.minutes_dirty}`);
print(`  ShowNotes脏:        ${stats.shownotes_dirty}`);
print(`  Summary脏:          ${stats.summary_dirty}`);
print(`  已修复:             ${programsFixed}\n`);

// ============================================================
// 2. topics 集合
// ============================================================

print("📋 [2/3] 扫描 topics 集合...\n");

const topics = db.topics.find({});
let topicsFixed = 0;

topics.forEach((t) => {
  stats.topics_scanned++;
  let dirty = false;
  const updates = {};

  // title
  if (isGarbled(t.title) || isTruncated(t.title)) {
    dirty = true;
    if (!DRY_RUN) updates.title = cleanText(t.title);
  }
  // subtitle
  if (isGarbled(t.subtitle)) {
    dirty = true;
    if (!DRY_RUN) updates.subtitle = cleanText(t.subtitle);
  }
  // shortSummary
  if (isGarbled(t.shortSummary) || isPlaceholder(t.shortSummary)) {
    dirty = true;
    if (!DRY_RUN) updates.shortSummary = cleanText(t.shortSummary);
  }
  // layers (递归检查知识树节点)
  function checkLayer(layer) {
    if (!layer || !Array.isArray(layer.nodes)) return;
    layer.nodes.forEach(n => {
      if (isGarbled(n.title) || isFillerOnly(n.title)) dirty = true;
      if (isGarbled(n.content) || isPlaceholder(n.content)) dirty = true;
      if (n.children) n.children.forEach(checkLayer);
    });
  }
  if (t.layers) {
    for (const key of Object.keys(t.layers)) {
      checkLayer(t.layers[key]);
    }
  }

  if (dirty) {
    stats.topics_dirty++;
    if (!DRY_RUN && Object.keys(updates).length > 0) {
      db.topics.updateOne({ _id: t._id }, { $set: updates });
      topicsFixed++;
    }
  }
});

print(`  话题总数:           ${stats.topics_scanned}`);
print(`  有脏数据的话题:     ${stats.topics_dirty}`);
print(`  已修复:             ${topicsFixed}\n`);

// ============================================================
// 3. guests 集合
// ============================================================

print("📋 [3/3] 扫描 guests 集合...\n");

const guests = db.guests.find({});
let guestsFixed = 0;

guests.forEach((g) => {
  stats.guests_scanned++;
  let dirty = false;
  const updates = {};

  if (isGarbled(g.title)) { dirty = true; if (!DRY_RUN) updates.title = cleanText(g.title); }
  if (isGarbled(g.bio)) { dirty = true; if (!DRY_RUN) updates.bio = cleanText(g.bio); }
  if (isPlaceholder(g.bio)) { dirty = true; if (!DRY_RUN) updates.bio = ""; }
  // title 超过 20 字标记
  if (g.title && g.title.length > 20) {
    stats.guests_dirty++;
    dirty = true;
    // 不自动截断，只标记
  }

  if (dirty && Object.keys(updates).length > 0) {
    stats.guests_dirty++;
    if (!DRY_RUN) {
      db.guests.updateOne({ _id: g._id }, { $set: updates });
      guestsFixed++;
    }
  }
});

print(`  嘉宾总数:           ${stats.guests_scanned}`);
print(`  有脏数据的嘉宾:     ${stats.guests_dirty}`);
print(`  已修复:             ${guestsFixed}\n`);

// ============================================================
// 汇总
// ============================================================

print("==========================================");
print("  扫描汇总");
print("==========================================");
print(`  Programs:  ${stats.programs_dirty}/${stats.programs_scanned} 有脏数据`);
print(`  Topics:    ${stats.topics_dirty}/${stats.topics_scanned} 有脏数据`);
print(`  Guests:    ${stats.guests_dirty}/${stats.guests_scanned} 有脏数据`);
print(`  Transcript 脏行:     ${stats.transcript_dirty_lines}`);
print(`  QuickView 脏条:      ${stats.quickview_dirty}`);
print(`  Minutes 脏:          ${stats.minutes_dirty}`);
print(`  ShowNotes 脏:        ${stats.shownotes_dirty}`);
print(`  Summary 脏:          ${stats.summary_dirty}`);
print(`  总计修复:            ${programsFixed + topicsFixed + guestsFixed}`);
print("==========================================\n");

if (DRY_RUN) {
  print("⚠️  当前为 DRY_RUN 模式，未实际修改数据。");
  print("  将脚本中 DRY_RUN 改为 false 后重新执行以应用修复。\n");
} else {
  print("✅ 数据清洗完成！\n");
}
