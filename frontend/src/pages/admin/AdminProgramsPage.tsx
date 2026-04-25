import React, { useEffect, useMemo, useRef, useState } from "react";
import { adminApi, AdminEducationDictionaryEntry, Program } from "../../services/api";

type StatusFilter = "all" | "published" | "draft";
type ParseEditorTab = "quickview" | "transcript";
type FormState = {
  programCode: string;
  title: string;
  description: string;
  coverImage: string;
  episodeTitle: string;
  episodeDuration: string;
  episodeUrl: string;
  summaryHeadline: string;
  summaryBody: string;
  summaryHighlightLabel: string;
  summaryHighlightText: string;
  summaryTags: string;
  transcriptRaw: string;
  quickViewRaw: string;
  minutesText: string;
  showNotesGuide: string;
  showNotesGuestIntro: string;
  showNotesKeyMomentsRaw: string;
  showNotesTemplateOverride: string;
  guestName: string;
  guestTitle: string;
  guestBio: string;
  guestAvatar: string;
  guestProfileUrl: string;
  deepDiveTitle: string;
  curatedReadingRaw: string;
  status: "draft" | "published";
};

type TranscriptEditorRow = {
  id: string;
  time: string;
  speaker: string;
  text: string;
  featured: boolean;
};

type UploadPhase = "idle" | "uploading" | "parsing" | "success" | "failed";

type UploadTask = {
  id: string;
  fileName: string;
  phase: Exclude<UploadPhase, "idle">;
  progress: number;
  programId?: string;
  failureReason?: string;
  parseStage?: string;
};

type TranscriptValidationIssue = {
  type:
    | "missing_time"
    | "invalid_time"
    | "missing_speaker"
    | "missing_text"
    | "time_overlap"
    | "short_text"
    | "long_paragraph"
    | "merge_recommended";
  severity: "warning" | "info";
  message: string;
  rowIndex: number;
};

const EMPTY_FORM: FormState = {
  programCode: "",
  title: "",
  description: "",
  coverImage: "",
  episodeTitle: "",
  episodeDuration: "",
  episodeUrl: "",
  summaryHeadline: "",
  summaryBody: "",
  summaryHighlightLabel: "",
  summaryHighlightText: "",
  summaryTags: "",
  transcriptRaw: "",
  quickViewRaw: "",
  minutesText: "",
  showNotesGuide: "",
  showNotesGuestIntro: "",
  showNotesKeyMomentsRaw: "",
  showNotesTemplateOverride: "",
  guestName: "",
  guestTitle: "",
  guestBio: "",
  guestAvatar: "",
  guestProfileUrl: "",
  deepDiveTitle: "",
  curatedReadingRaw: "",
  status: "draft",
};

const STATUS_LABEL: Record<Program["status"], string> = {
  draft: "草稿箱",
  published: "已发布",
};

const PARSE_STATUS_LABEL: Record<NonNullable<Program["parseStatus"]>, string> = {
  idle: "待解析",
  parsing: "解析中",
  success: "解析完成",
  failed: "解析失败",
};

const UPLOAD_PROGRESS_START = 6;
const UPLOAD_PROGRESS_END = 92;
const PARSING_PROGRESS = 12;
const UPLOAD_TASK_STORAGE_KEY = "admin-program-upload-task";
const SPEAKER_SUGGESTIONS = ["主持人", "嘉宾1", "嘉宾2", "嘉宾"];

function getParseStageLabel(stage = ""): string {
  const stageMap: Record<string, string> = {
    queued: "排队中",
    transcribing: "语音转写中",
    transcribed: "转写完成，整理文本中",
    extracting: "提取结构信息中",
    extracted: "结构提取完成",
    saving: "写入草稿中",
    completed: "解析完成",
    failed: "解析失败",
  };
  return stageMap[stage.trim()] || "解析中";
}

function formatDate(date?: string): string {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("zh-CN");
}

function buildUploadStageHint(phase: UploadPhase, progress: number, stage = ""): string {
  if (phase === "uploading") return `正在上传音频文件（整体 ${progress}%）...`;
  if (phase === "parsing") {
    const stageLabel = getParseStageLabel(stage);
    return `上传完成，${stageLabel}（解析进度 ${progress}%）...`;
  }
  if (phase === "success") return "解析完成，草稿内容已自动生成。";
  if (phase === "failed") return "上传失败，请重新选择文件后重试。";
  return "";
}

function mapUploadTransferProgress(percent: number): number {
  const safePercent = Math.max(0, Math.min(100, percent));
  return Math.round(UPLOAD_PROGRESS_START + ((UPLOAD_PROGRESS_END - UPLOAD_PROGRESS_START) * safePercent) / 100);
}

function buildUploadTaskTitle(phase: Exclude<UploadPhase, "idle">, progress: number): string {
  if (phase === "uploading") return `上传中 ${progress}%`;
  if (phase === "parsing") return `解析中 ${progress}%`;
  if (phase === "success") return "解析完成";
  return "处理失败";
}

function extractRequestErrorMessage(error: any, fallback: string): string {
  const data = error?.response?.data;
  if (typeof data === "string" && data.trim()) return data.trim();
  if (typeof data?.message === "string" && data.message.trim()) return data.message.trim();
  if (typeof data?.error === "string" && data.error.trim()) return data.error.trim();
  if (typeof error?.message === "string" && error.message.trim()) return error.message.trim();
  return fallback;
}

function getUploadTaskTone(phase: Exclude<UploadPhase, "idle">): string {
  if (phase === "success") return "bg-emerald-50 text-emerald-700";
  if (phase === "failed") return "bg-red-50 text-red-600";
  return "bg-amber-50 text-amber-700";
}

function readStoredUploadTask(): UploadTask | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(UPLOAD_TASK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UploadTask>;
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.fileName !== "string" || typeof parsed.phase !== "string") {
      return null;
    }
    const restoredTask: UploadTask = {
      id: parsed.id,
      fileName: parsed.fileName,
      phase: parsed.phase as Exclude<UploadPhase, "idle">,
      progress: typeof parsed.progress === "number" ? parsed.progress : 0,
      programId: typeof parsed.programId === "string" ? parsed.programId : undefined,
      failureReason: typeof parsed.failureReason === "string" ? parsed.failureReason : "",
      parseStage: typeof parsed.parseStage === "string" ? parsed.parseStage : "",
    };
    if (restoredTask.phase === "uploading") {
      return {
        ...restoredTask,
        phase: "failed",
        failureReason: "页面刷新后，上传任务已中断，请重新上传。",
      };
    }
    return restoredTask;
  } catch (_error) {
    return null;
  }
}

function persistUploadTask(task: UploadTask | null): void {
  if (typeof window === "undefined") return;
  if (!task) {
    window.localStorage.removeItem(UPLOAD_TASK_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(UPLOAD_TASK_STORAGE_KEY, JSON.stringify(task));
}

function normalizeTranscriptValidationText(value: string): string {
  return value.trim().replace(/[，。！？、,.!?\s~～…]/g, "").toLowerCase();
}

function isLikelyFillerText(value: string): boolean {
  const normalized = normalizeTranscriptValidationText(value);
  if (!normalized) return true;
  const fillers = new Set([
    "嗯",
    "嗯嗯",
    "啊",
    "啊啊",
    "哦",
    "呃",
    "对",
    "对对",
    "好的",
    "好",
    "是",
    "是的",
    "然后",
    "然后呢",
    "就是",
  ]);
  if (fillers.has(normalized)) return true;
  return normalized.length <= 3 && /^([嗯啊哦呃对是好行])+$/.test(normalized);
}

function parseClockToSeconds(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.max(0, Number(raw));
  const parts = raw.split(":").map((item) => Number(item));
  if (parts.some((item) => Number.isNaN(item))) return null;
  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
  if (parts.length === 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return null;
}

function parseTranscriptTimeRange(value: string): { start: number | null; end: number | null } {
  const raw = value.trim();
  if (!raw) return { start: null, end: null };
  const [startRaw = "", endRaw = ""] = raw.split("-").map((item) => item.trim());
  return {
    start: parseClockToSeconds(startRaw),
    end: parseClockToSeconds(endRaw),
  };
}

function validateTranscriptRows(rows: TranscriptEditorRow[]): TranscriptValidationIssue[] {
  const issues: TranscriptValidationIssue[] = [];

  rows.forEach((row, index) => {
    const time = row.time.trim();
    const speaker = row.speaker.trim();
    const text = row.text.trim();
    const { start, end } = parseTranscriptTimeRange(time);

    if (!time) {
      issues.push({ type: "missing_time", severity: "warning", message: "缺少时间范围，建议补成 00:00-00:12 这类格式。", rowIndex: index });
    } else if (!Number.isFinite(start) || !Number.isFinite(end) || (end as number) <= (start as number)) {
      issues.push({ type: "invalid_time", severity: "warning", message: "时间范围无法解析，或结束时间早于开始时间。", rowIndex: index });
    }

    if (!speaker) {
      issues.push({ type: "missing_speaker", severity: "warning", message: "缺少发言人，建议明确为主持人 / 嘉宾1 / 嘉宾2。", rowIndex: index });
    }

    if (!text) {
      issues.push({ type: "missing_text", severity: "warning", message: "这一段没有正文内容。", rowIndex: index });
    } else {
      const compactLength = normalizeTranscriptValidationText(text).length;
      if (compactLength > 0 && (compactLength <= 6 || isLikelyFillerText(text))) {
        issues.push({ type: "short_text", severity: "info", message: "内容较短，疑似语气词或碎片句，可考虑并入前后段落。", rowIndex: index });
      }
      const sentenceCount = (text.match(/[。！？!?]/g) || []).length;
      if (compactLength >= 140 || sentenceCount >= 5) {
        issues.push({ type: "long_paragraph", severity: "info", message: "段落偏长，建议检查是否需要拆成两段。", rowIndex: index });
      }
    }
  });

  rows.forEach((row, index) => {
    if (index === 0) return;
    const prev = rows[index - 1];
    const currentRange = parseTranscriptTimeRange(row.time);
    const prevRange = parseTranscriptTimeRange(prev.time);

    if (
      Number.isFinite(prevRange.end) &&
      Number.isFinite(currentRange.start) &&
      (currentRange.start as number) < (prevRange.end as number)
    ) {
      issues.push({ type: "time_overlap", severity: "warning", message: "与上一段时间重叠，建议校正起止时间。", rowIndex: index });
    }

    if (
      prev.speaker.trim() &&
      row.speaker.trim() &&
      prev.speaker.trim() === row.speaker.trim() &&
      Number.isFinite(prevRange.end) &&
      Number.isFinite(currentRange.start) &&
      (currentRange.start as number) - (prevRange.end as number) <= 4 &&
      prev.text.trim() &&
      row.text.trim()
    ) {
      issues.push({ type: "merge_recommended", severity: "info", message: "与上一段发言人相同且时间连续，可考虑合并。", rowIndex: index });
    }
  });

  return issues;
}

function parseTranscript(raw: string): Program["transcript"] {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = lines
    .map((line) => {
      const [time, speaker, text, featured] = line.split("|").map((part) => part.trim());
      if (!time || !speaker || !text) return null;
      return {
        time,
        speaker,
        text,
        featured: featured === "featured" || featured === "1" || featured === "true",
      };
    })
    .filter(Boolean) as NonNullable<Program["transcript"]>;

  return parsed.length > 0 ? parsed : undefined;
}

function formatTranscriptForForm(transcript?: Program["transcript"]): string {
  if (!transcript || transcript.length === 0) return "";
  return transcript
    .map((segment) => [segment.time, segment.speaker, segment.text, segment.featured ? "featured" : ""].filter(Boolean).join("|"))
    .join("\n");
}

function parseCuratedReading(raw: string): NonNullable<NonNullable<Program["deepDive"]>["curatedReading"]> {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => {
      const [title, subtitle, url] = line.split("|").map((part) => part.trim());
      if (!title) return null;
      return { title, subtitle, url };
    })
    .filter(Boolean) as NonNullable<NonNullable<Program["deepDive"]>["curatedReading"]>;
}

function formatCuratedReadingForForm(curatedReading?: NonNullable<Program["deepDive"]>["curatedReading"]): string {
  if (!curatedReading || curatedReading.length === 0) return "";
  return curatedReading.map((item) => `${item.title}|${item.subtitle || ""}|${item.url || ""}`).join("\n");
}

function parseQuickView(raw: string): NonNullable<NonNullable<Program["contentPack"]>["quickView"]> {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => {
      const [timeRange, summary] = line.split("|").map((part) => part.trim());
      if (!timeRange || !summary) return null;
      const [startTime = "", endTime = ""] = timeRange.split("-").map((part) => part.trim());
      return {
        startTime,
        endTime,
        timeRangeLabel: `${startTime}-${endTime}`,
        summary,
      };
    })
    .filter(Boolean) as NonNullable<NonNullable<Program["contentPack"]>["quickView"]>;
}

function formatQuickViewForForm(quickView?: NonNullable<Program["contentPack"]>["quickView"]): string {
  if (!quickView || quickView.length === 0) return "";
  return quickView
    .map((item) => {
      const label = item.timeRangeLabel || `${item.startTime || ""}-${item.endTime || ""}`;
      return `${label}|${item.summary || ""}`;
    })
    .join("\n");
}

function parseShowNotesKeyMoments(raw: string): NonNullable<NonNullable<NonNullable<Program["contentPack"]>["showNotes"]>["keyMoments"]> {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => {
      const [time, point] = line.split("|").map((part) => part.trim());
      if (!time || !point) return null;
      return { time, point };
    })
    .filter(Boolean) as NonNullable<NonNullable<NonNullable<Program["contentPack"]>["showNotes"]>["keyMoments"]>;
}

function formatShowNotesKeyMomentsForForm(
  keyMoments?: NonNullable<NonNullable<Program["contentPack"]>["showNotes"]>["keyMoments"]
): string {
  if (!keyMoments || keyMoments.length === 0) return "";
  return keyMoments.map((item) => `${item.time || ""}|${item.point || ""}`).join("\n");
}

function parseTranscriptRows(raw: string): TranscriptEditorRow[] {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const [time = "", speaker = "", text = "", featured = ""] = line.split("|").map((part) => part.trim());
    return {
      id: `${Date.now()}-${index}`,
      time,
      speaker,
      text,
      featured: featured === "featured" || featured === "1" || featured === "true",
    };
  });
}

function serializeTranscriptRows(rows: TranscriptEditorRow[]): string {
  return rows
    .map((row) => [row.time.trim(), row.speaker.trim(), row.text.trim(), row.featured ? "featured" : ""].filter(Boolean).join("|"))
    .filter(Boolean)
    .join("\n");
}

function replaceSpeakerLabel(raw: string, fromLabels: string[], toLabel: string): string {
  const target = toLabel.trim();
  if (!target) return raw;
  const fromSet = new Set(fromLabels.map((item) => item.trim()).filter(Boolean));
  if (!fromSet.size) return raw;
  return raw
    .split("\n")
    .map((line) => {
      const parts = line.split("|");
      if (parts.length < 3) return line;
      const currentSpeaker = (parts[1] || "").trim();
      if (!fromSet.has(currentSpeaker)) return line;
      parts[1] = target;
      return parts.join("|");
    })
    .join("\n");
}

function buildProgramPayload(form: FormState) {
  return {
    programCode: form.programCode.trim(),
    title: form.title,
    description: form.description,
    coverImage: form.coverImage,
    status: form.status,
    episodes: [
      {
        title: form.episodeTitle,
        duration: form.episodeDuration,
        url: form.episodeUrl,
      },
    ],
    summary: {
      headline: form.summaryHeadline.trim(),
      body: form.summaryBody.trim(),
      highlightLabel: form.summaryHighlightLabel.trim(),
      highlightText: form.summaryHighlightText.trim(),
      tags: form.summaryTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    },
    transcript: parseTranscript(form.transcriptRaw),
    guest: {
      name: form.guestName.trim(),
      title: form.guestTitle.trim(),
      bio: form.guestBio.trim(),
      avatar: form.guestAvatar.trim(),
      profileUrl: form.guestProfileUrl.trim(),
    },
    deepDive: {
      sectionTitle: form.deepDiveTitle.trim(),
      curatedReading: parseCuratedReading(form.curatedReadingRaw),
    },
    contentPack: {
      quickView: parseQuickView(form.quickViewRaw),
      minutes: {
        text: form.minutesText.trim(),
      },
      showNotes: {
        guide: form.showNotesGuide.trim(),
        guestIntro: form.showNotesGuestIntro.trim(),
        keyMoments: parseShowNotesKeyMoments(form.showNotesKeyMomentsRaw),
        templateOverride: form.showNotesTemplateOverride.trim(),
      },
    },
  };
}

const AdminProgramsPage: React.FC = () => {
  const [items, setItems] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadFailureReason, setUploadFailureReason] = useState<string>("");
  const [parseHint, setParseHint] = useState<string>("");
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [pendingAudioFile, setPendingAudioFile] = useState<File | null>(null);
  const [currentUploadTask, setCurrentUploadTask] = useState<UploadTask | null>(() => readStoredUploadTask());
  const [isTranscriptEditorOpen, setIsTranscriptEditorOpen] = useState(false);
  const [transcriptRows, setTranscriptRows] = useState<TranscriptEditorRow[]>([]);
  const [isDictionaryDialogOpen, setIsDictionaryDialogOpen] = useState(false);
  const [dictionaryLoading, setDictionaryLoading] = useState(false);
  const [dictionarySaving, setDictionarySaving] = useState(false);
  const [dictionaryCreating, setDictionaryCreating] = useState(false);
  const [dictionarySearch, setDictionarySearch] = useState("");
  const [newDictionaryTerm, setNewDictionaryTerm] = useState("");
  const [newDictionaryDefinition, setNewDictionaryDefinition] = useState("");
  const [dictionaryCandidates, setDictionaryCandidates] = useState<AdminEducationDictionaryEntry[]>([]);
  const [selectedDictionaryEntryIds, setSelectedDictionaryEntryIds] = useState<string[]>([]);
  const [parseEditorTab, setParseEditorTab] = useState<ParseEditorTab>("quickview");
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const coverImageInputRef = useRef<HTMLInputElement | null>(null);
  const guestAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const parsePollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    async function loadPrograms() {
      setLoading(true);
      setError(null);
      try {
        const response = await adminApi.getPrograms(statusFilter === "all" ? undefined : statusFilter);
        if (active) {
          setItems(response.data || []);
        }
      } catch (loadError: any) {
        if (active) {
          setError(loadError?.response?.data?.message || loadError?.message || "获取节目列表失败");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadPrograms();
    return () => {
      active = false;
    };
  }, [statusFilter]);

  useEffect(() => {
    persistUploadTask(currentUploadTask);
  }, [currentUploadTask]);

  useEffect(() => {
    if (!currentUploadTask?.programId) return;
    const row = items.find((item) => item._id === currentUploadTask.programId);
    if (!row?.parseStatus) return;
    if (row.parseStatus === "success") {
      setCurrentUploadTask((prev) =>
        prev?.programId === row._id ? { ...prev, phase: "success", progress: 100, failureReason: "", parseStage: "completed" } : prev
      );
      return;
    }
    if (row.parseStatus === "failed") {
      setCurrentUploadTask((prev) =>
        prev?.programId === row._id
          ? {
              ...prev,
              phase: "failed",
              progress: Number(row.parseProgress) || PARSING_PROGRESS,
              failureReason: row.parseError || "解析失败，请检查配置后重试。",
              parseStage: row.parseStage || "failed",
            }
          : prev
      );
      return;
    }
    if (row.parseStatus === "parsing") {
      const rawProgress = Number(row.parseProgress);
      setCurrentUploadTask((prev) =>
        prev?.programId === row._id
          ? {
              ...prev,
              phase: "parsing",
              progress: Number.isFinite(rawProgress) ? Math.max(0, Math.min(99, Math.floor(rawProgress))) : prev.progress,
              failureReason: "",
              parseStage: row.parseStage || prev.parseStage,
            }
          : prev
      );
    }
  }, [items, currentUploadTask?.programId]);

  const filteredItems = useMemo(() => items, [items]);
  const transcriptEditorIssues = useMemo(() => validateTranscriptRows(transcriptRows), [transcriptRows]);
  const transcriptEditorIssuesByRow = useMemo(() => {
    const grouped = new Map<number, TranscriptValidationIssue[]>();
    transcriptEditorIssues.forEach((issue) => {
      grouped.set(issue.rowIndex, [...(grouped.get(issue.rowIndex) || []), issue]);
    });
    return grouped;
  }, [transcriptEditorIssues]);

  const loadProgramIntoForm = (program: Program) => {
    setEditingProgram(program);
    setForm({
      programCode: program.programCode || "",
      title: program.title,
      description: program.description,
      coverImage: program.coverImage,
      episodeTitle: program.episodes[0]?.title || "",
      episodeDuration: program.episodes[0]?.duration || "",
      episodeUrl: program.episodes[0]?.url || "",
      summaryHeadline: program.summary?.headline || "",
      summaryBody: program.summary?.body || "",
      summaryHighlightLabel: program.summary?.highlightLabel || "",
      summaryHighlightText: program.summary?.highlightText || "",
      summaryTags: (program.summary?.tags || []).join(", "),
      transcriptRaw: formatTranscriptForForm(program.transcript),
      quickViewRaw: formatQuickViewForForm(program.contentPack?.quickView),
      minutesText: program.contentPack?.minutes?.text || "",
      showNotesGuide: program.contentPack?.showNotes?.guide || "",
      showNotesGuestIntro: program.contentPack?.showNotes?.guestIntro || "",
      showNotesKeyMomentsRaw: formatShowNotesKeyMomentsForForm(program.contentPack?.showNotes?.keyMoments),
      showNotesTemplateOverride: program.contentPack?.showNotes?.templateOverride || "",
      guestName: program.guest?.name || "",
      guestTitle: program.guest?.title || "",
      guestBio: program.guest?.bio || "",
      guestAvatar: program.guest?.avatar || "",
      guestProfileUrl: program.guest?.profileUrl || "",
      deepDiveTitle: program.deepDive?.sectionTitle || "",
      curatedReadingRaw: formatCuratedReadingForForm(program.deepDive?.curatedReading),
      status: program.status,
    });
  };

  const openEdit = (program: Program) => {
    loadProgramIntoForm(program);
    setIsModalOpen(true);
    setParseEditorTab("quickview");
  };

  const openContentEnhancement = (program: Program) => {
    loadProgramIntoForm(program);
    setParseEditorTab("quickview");
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsTranscriptEditorOpen(false);
    setIsDictionaryDialogOpen(false);
    setDictionaryCandidates([]);
    setDictionarySearch("");
    setNewDictionaryTerm("");
    setNewDictionaryDefinition("");
    setSelectedDictionaryEntryIds([]);
    setDictionarySaving(false);
    setDictionaryCreating(false);
    setDictionaryLoading(false);
    setTranscriptRows([]);
    setEditingProgram(null);
    setForm(EMPTY_FORM);
    setParseEditorTab("quickview");
  };

  const openUploadDialog = () => {
    setIsUploadDialogOpen(true);
  };

  const closeUploadDialog = () => {
    setIsUploadDialogOpen(false);
  };

  useEffect(() => {
    return () => {
      if (parsePollTimerRef.current !== null) {
        window.clearInterval(parsePollTimerRef.current);
        parsePollTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!currentUploadTask || isUploadingAudio) return;
    if (currentUploadTask.phase === "failed" && currentUploadTask.failureReason) {
      setUploadFailureReason(currentUploadTask.failureReason);
      setParseHint(currentUploadTask.failureReason);
      return;
    }
    if (currentUploadTask.phase === "parsing" && currentUploadTask.programId) {
      setParseHint("已恢复后台解析任务，正在同步最新状态...");
      startParsePolling(currentUploadTask.programId);
    }
  }, [currentUploadTask, isUploadingAudio]);

  useEffect(() => {
    if (!isModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isDictionaryDialogOpen) {
          setIsDictionaryDialogOpen(false);
          return;
        }
        if (isTranscriptEditorOpen) {
          setIsTranscriptEditorOpen(false);
          return;
        }
        closeModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isModalOpen, isTranscriptEditorOpen, isDictionaryDialogOpen]);

  const openTranscriptEditor = () => {
    const rows = parseTranscriptRows(form.transcriptRaw);
    setTranscriptRows(rows.length > 0 ? rows : [{ id: `${Date.now()}-0`, time: "", speaker: "", text: "", featured: false }]);
    setIsTranscriptEditorOpen(true);
  };

  const saveTranscriptEditor = async () => {
    const nextTranscriptRaw = serializeTranscriptRows(transcriptRows);
    const nextIssues = validateTranscriptRows(transcriptRows);

    if (!editingProgram) {
      setForm((prev) => ({
        ...prev,
        transcriptRaw: nextTranscriptRaw,
      }));
      setIsTranscriptEditorOpen(false);
      setParseHint(nextIssues.length > 0 ? `逐字稿已回写到表单，当前有 ${nextIssues.length} 条校验提示可继续优化。` : "");
      return;
    }

    const nextForm: FormState = {
      ...form,
      transcriptRaw: nextTranscriptRaw,
    };

    setSaving(true);
    setError(null);
    try {
      await adminApi.updateProgram(editingProgram._id, buildProgramPayload(nextForm));
      setForm(nextForm);
      await refreshList();
      if (isModalOpen) {
        closeModal();
      } else {
        setIsTranscriptEditorOpen(false);
      }
      setParseHint(nextIssues.length > 0 ? `逐字稿已保存，并保留 ${nextIssues.length} 条校验提示供继续优化。` : "逐字稿已保存并同步到节目内容。");
    } catch (saveError: any) {
      setError(saveError?.response?.data?.message || saveError?.message || "保存逐字稿失败");
    } finally {
      setSaving(false);
    }
  };

  const updateTranscriptRow = (id: string, patch: Partial<TranscriptEditorRow>) => {
    setTranscriptRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const renameSpeakerFromRow = (id: string, nextSpeakerRaw: string) => {
    setTranscriptRows((prev) => {
      const targetIndex = prev.findIndex((row) => row.id === id);
      if (targetIndex < 0) return prev;

      const oldSpeaker = prev[targetIndex].speaker.trim();
      const nextSpeaker = nextSpeakerRaw.trim();
      const shouldPropagate = oldSpeaker.length > 0 && nextSpeaker.length > 0 && oldSpeaker !== nextSpeaker;

      return prev.map((row) => {
        if (row.id === id) {
          return {
            ...row,
            speaker: nextSpeakerRaw,
          };
        }
        if (shouldPropagate && row.speaker.trim() === oldSpeaker) {
          return {
            ...row,
            speaker: nextSpeaker,
          };
        }
        return row;
      });
    });
  };

  const addTranscriptRow = () => {
    setTranscriptRows((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, time: "", speaker: "", text: "", featured: false }]);
  };

  const removeTranscriptRow = (id: string) => {
    setTranscriptRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((row) => row.id !== id);
    });
  };

  const refreshList = async () => {
    try {
      const response = await adminApi.getPrograms(statusFilter === "all" ? undefined : statusFilter);
      setItems(response.data || []);
    } catch (loadError: any) {
      setError(loadError?.response?.data?.message || loadError?.message || "刷新列表失败");
    }
  };

  const startParsePolling = (programId: string) => {
    if (parsePollTimerRef.current !== null) {
      window.clearInterval(parsePollTimerRef.current);
      parsePollTimerRef.current = null;
    }
    parsePollTimerRef.current = window.setInterval(async () => {
      try {
        const response = await adminApi.getProgramParseStatus(programId);
        const status = response.data?.parseStatus;
        const stage = (response.data?.parseStage || "").trim();
        const rawProgress = Number(response.data?.parseProgress);
        const backendProgress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, Math.floor(rawProgress))) : PARSING_PROGRESS;
        if (status === "parsing") {
          setUploadPhase("parsing");
          setUploadProgress(backendProgress);
          setParseHint(buildUploadStageHint("parsing", backendProgress, stage));
          setCurrentUploadTask((prev) =>
            prev?.programId === programId
              ? {
                  ...prev,
                  phase: "parsing",
                  progress: backendProgress,
                  parseStage: stage,
                  failureReason: "",
                }
              : prev
          );
          return;
        }
        if (parsePollTimerRef.current !== null) {
          window.clearInterval(parsePollTimerRef.current);
          parsePollTimerRef.current = null;
        }
        if (status === "success") {
          setParseHint("解析完成，草稿内容已自动生成。");
          setCurrentUploadTask((prev) =>
            prev?.programId === programId ? { ...prev, phase: "success", progress: 100, failureReason: "" } : prev
          );
        } else if (status === "failed") {
          setParseHint(`解析失败：${response.data?.parseError || "请稍后重试"}`);
          setCurrentUploadTask((prev) =>
            prev?.programId === programId
              ? {
                  ...prev,
                  phase: "failed",
                  progress: PARSING_PROGRESS,
                  failureReason: response.data?.parseError || "请稍后重试",
                }
              : prev
          );
        } else {
          setParseHint("");
        }
        await refreshList();
      } catch (pollError: any) {
        if (parsePollTimerRef.current !== null) {
          window.clearInterval(parsePollTimerRef.current);
          parsePollTimerRef.current = null;
        }
        setParseHint(pollError?.response?.data?.message || pollError?.message || "轮询解析状态失败");
      }
    }, 3000);
  };

  const handleAudioUpload = async (file: File): Promise<boolean> => {
    const taskId = `${Date.now()}`;
    try {
      setError(null);
      setIsUploadingAudio(true);
      setUploadProgress(0);
      setUploadFailureReason("");
      setCurrentUploadTask({
        id: taskId,
        fileName: file.name,
        phase: "uploading",
        progress: UPLOAD_PROGRESS_START,
        failureReason: "",
      });

      setUploadPhase("uploading");
      setUploadProgress(UPLOAD_PROGRESS_START);
      setParseHint(buildUploadStageHint("uploading", UPLOAD_PROGRESS_START));
      const uploadRes = await adminApi.uploadProgramAudio(file, {
        sourceFileName: file.name,
        uploadSource: "passthrough",
        onProgress: (percent) => {
          const nextProgress = mapUploadTransferProgress(percent);
          setUploadProgress(nextProgress);
          setParseHint(buildUploadStageHint("uploading", nextProgress));
          setCurrentUploadTask((prev) =>
            prev?.id === taskId
              ? {
                  ...prev,
                  phase: "uploading",
                  progress: nextProgress,
                }
              : prev
          );
        },
      });
      setUploadPhase("parsing");
      setUploadProgress(PARSING_PROGRESS);
      setParseHint(buildUploadStageHint("parsing", PARSING_PROGRESS));
      const createRes = await adminApi.createProgramFromAudio(uploadRes.data.url, file.name);
      const programId = createRes.data?.programId;
      setCurrentUploadTask((prev) =>
        prev?.id === taskId
          ? {
              ...prev,
              phase: "parsing",
              progress: PARSING_PROGRESS,
              programId,
              parseStage: createRes.data?.parseStage || "queued",
            }
          : prev
      );
      if (programId) {
        setParseHint("解析任务已启动，正在处理...");
        await refreshList();
        startParsePolling(programId);
        setIsUploadDialogOpen(false);
      } else {
        setParseHint("任务已提交，请刷新列表查看状态。");
      }
      return true;
    } catch (uploadError: any) {
      const message = extractRequestErrorMessage(uploadError, "上传并解析失败");
      setUploadPhase("failed");
      setUploadFailureReason(message);
      setError(message);
      setParseHint(message);
      setCurrentUploadTask((prev) =>
        prev?.id === taskId
          ? {
              ...prev,
              phase: "failed",
              failureReason: message,
            }
          : prev
      );
      return false;
    } finally {
      setIsUploadingAudio(false);
    }
  };

  const handleAudioFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPendingAudioFile(file);
    setUploadFailureReason("");
    setUploadPhase("idle");
    setUploadProgress(0);
    await handleAudioUpload(file);
  };

  const handleStartParseFromDialog = async () => {
    if (isUploadingAudio) return;
    audioInputRef.current?.click();
  };

  const handleRetryUpload = async () => {
    if (!pendingAudioFile || isUploadingAudio) return;
    await handleAudioUpload(pendingAudioFile);
  };

  const handleReupload = () => {
    if (isUploadingAudio) return;
    setIsUploadDialogOpen(true);
    audioInputRef.current?.click();
  };

  const handleReparse = async (program: Program) => {
    if (program.parseStatus === "parsing") return;
    try {
      setError(null);
      const response = await adminApi.triggerProgramParse(program._id);
      const progress = Number(response.data?.parseProgress);
      setCurrentUploadTask({
        id: `${Date.now()}`,
        fileName: program.episodes?.[0]?.title || program.title,
        phase: "parsing",
        progress: Number.isFinite(progress) ? progress : PARSING_PROGRESS,
        programId: program._id,
        parseStage: response.data?.parseStage || "queued",
      });
      setParseHint("已触发重新解析，正在处理...");
      await refreshList();
      startParsePolling(program._id);
    } catch (parseError: any) {
      setError(parseError?.response?.data?.message || parseError?.message || "触发重新解析失败");
    }
  };

  const handleImageUpload = async (file: File, target: "coverImage" | "guestAvatar") => {
    if (!file) return;
    try {
      const response = await adminApi.uploadProgramImage(file);
      const imageUrl = response.data?.url;
      if (!imageUrl) return;
      setForm((prev) => ({ ...prev, [target]: imageUrl }));
    } catch (uploadError: any) {
      setError(uploadError?.response?.data?.message || uploadError?.message || "图片上传失败");
    }
  };

  const shouldShowStandaloneUploadTask = useMemo(() => {
    if (!currentUploadTask) return false;
    if (currentUploadTask.phase === "success") return false;
    if (!currentUploadTask.programId) return true;
    return !filteredItems.some((item) => item._id === currentUploadTask.programId);
  }, [currentUploadTask, filteredItems]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const payload = buildProgramPayload(form);
    const nextIssues = validateTranscriptRows(parseTranscriptRows(form.transcriptRaw));

    try {
      if (editingProgram) {
        await adminApi.updateProgram(editingProgram._id, payload);
      } else {
        await adminApi.createProgram(payload);
      }
      await refreshList();
      closeModal();
      setParseHint(nextIssues.length > 0 ? `节目已保存，逐字稿还有 ${nextIssues.length} 条校验提示。` : "");
    } catch (saveError: any) {
      setError(saveError?.response?.data?.message || saveError?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveContentEnhancement = async () => {
    if (!editingProgram) {
      setError("请先从节目清单中选择一个节目编辑文稿");
      return;
    }

    setSaving(true);
    setError(null);
    const nextIssues = validateTranscriptRows(parseTranscriptRows(form.transcriptRaw));

    try {
      await adminApi.updateProgram(editingProgram._id, buildProgramPayload(form));
      await refreshList();
      setParseHint(nextIssues.length > 0 ? `文稿已保存，逐字稿还有 ${nextIssues.length} 条校验提示。` : "文稿已保存。");
    } catch (saveError: any) {
      setError(saveError?.response?.data?.message || saveError?.message || "保存文稿失败");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (program: Program) => {
    const nextStatus = program.status === "published" ? "draft" : "published";
    try {
      await adminApi.updateProgramStatus(program._id, nextStatus);
      await refreshList();
    } catch (statusError: any) {
      setError(statusError?.response?.data?.message || statusError?.message || "更新状态失败");
    }
  };

  const handleDelete = async (program: Program) => {
    if (!window.confirm(`确认删除《${program.title}》吗？`)) return;
    try {
      await adminApi.deleteProgram(program._id);
      await refreshList();
    } catch (deleteError: any) {
      setError(deleteError?.response?.data?.message || deleteError?.message || "删除失败");
    }
  };

  const loadDictionaryCandidates = async (searchValue = "") => {
    setDictionaryLoading(true);
    try {
      const response = await adminApi.getDictionaryEntries({
        search: searchValue.trim() || undefined,
        status: "active",
      });
      setDictionaryCandidates(response.data || []);
    } catch (loadError: any) {
      setError(loadError?.response?.data?.message || loadError?.message || "加载词典失败");
    } finally {
      setDictionaryLoading(false);
    }
  };

  const openDictionaryDialog = async () => {
    if (!editingProgram) return;
    const initialIds = Array.from(
      new Set([...(editingProgram.dictionaryEntryIds || []), ...(editingProgram.dictionaryEntries || []).map((entry) => entry._id)])
    );
    setSelectedDictionaryEntryIds(initialIds);
    setDictionarySearch("");
    setNewDictionaryTerm("");
    setNewDictionaryDefinition("");
    setIsDictionaryDialogOpen(true);
    await loadDictionaryCandidates("");
  };

  const toggleDictionarySelection = (entryId: string) => {
    setSelectedDictionaryEntryIds((prev) => (prev.includes(entryId) ? prev.filter((id) => id !== entryId) : [...prev, entryId]));
  };

  const handleSaveDictionaryBinding = async () => {
    if (!editingProgram || dictionarySaving) return;
    setDictionarySaving(true);
    setError(null);
    try {
      await adminApi.updateProgram(editingProgram._id, { dictionaryEntryIds: selectedDictionaryEntryIds });
      const latest = await adminApi.getProgram(editingProgram._id);
      setEditingProgram(latest.data);
      await refreshList();
      setParseHint(`词典已手动绑定 ${selectedDictionaryEntryIds.length} 个词条。`);
      setIsDictionaryDialogOpen(false);
    } catch (saveError: any) {
      setError(saveError?.response?.data?.message || saveError?.message || "词典绑定保存失败");
    } finally {
      setDictionarySaving(false);
    }
  };

  const handleCreateDictionaryEntry = async () => {
    if (!editingProgram || dictionaryCreating) return;
    const term = newDictionaryTerm.trim();
    const definition = newDictionaryDefinition.trim();
    if (!term || !definition) {
      setError("请填写词条名称和释义后再创建");
      return;
    }
    setDictionaryCreating(true);
    setError(null);
    try {
      const createRes = await adminApi.createDictionaryEntry({
        term,
        definition,
        status: "active",
        programIds: [editingProgram._id],
      });
      const createdEntry = createRes.data;
      setNewDictionaryTerm("");
      setNewDictionaryDefinition("");
      setSelectedDictionaryEntryIds((prev) =>
        prev.includes(createdEntry._id) ? prev : [...prev, createdEntry._id]
      );
      setDictionaryCandidates((prev) => {
        const exists = prev.some((entry) => entry._id === createdEntry._id);
        if (exists) return prev;
        return [createdEntry as AdminEducationDictionaryEntry, ...prev];
      });
      const latest = await adminApi.getProgram(editingProgram._id);
      setEditingProgram(latest.data);
      await refreshList();
      setParseHint(`新词条《${createdEntry.term}》已创建并自动绑定到当前内容。`);
    } catch (createError: any) {
      setError(createError?.response?.data?.message || createError?.message || "新建词条失败");
    } finally {
      setDictionaryCreating(false);
    }
  };

  const renderContentEnhancementFields = () => (
    <div className="grid grid-cols-1 gap-5">
      <section className="rounded-[2rem] border border-stone-200 bg-white p-6">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm font-black text-[#7A746E]">内容解析编辑</p>
          <div className="inline-flex w-fit rounded-full border border-stone-200 bg-[#fafafa] p-1 shadow-[inset_0_0_0_1px_rgba(17,10,8,0.03)]">
            {([
              { key: "quickview", label: "速览" },
              { key: "transcript", label: "逐字稿" },
            ] as Array<{ key: ParseEditorTab; label: string }>).map((tab) => (
              <button
                key={tab.key}
                className={`min-w-[84px] rounded-full px-5 py-2 text-base font-medium transition-colors ${
                  parseEditorTab === tab.key ? "bg-[#5e17eb] text-white shadow-[0_10px_24px_rgba(94,23,235,0.18)]" : "text-stone-600 hover:text-[#5e17eb]"
                }`}
                onClick={() => setParseEditorTab(tab.key)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {parseEditorTab === "quickview" ? (
          <textarea
            className="min-h-[220px] w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 font-mono text-sm"
            placeholder={"速览（每行一条）：开始-结束|摘要\n示例：01:23-03:40|讨论家庭规则建立的底层逻辑。"}
            value={form.quickViewRaw}
            onChange={(event) => setForm((prev) => ({ ...prev, quickViewRaw: event.target.value }))}
          />
        ) : null}

        {parseEditorTab === "transcript" ? (
          <div className="space-y-4">
            <textarea
              className="min-h-[220px] w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 font-mono text-sm"
              placeholder={"逐字稿（每行一条）：时间|说话人|内容|featured(可选)\n示例：02:45|嘉宾|核心观点...|featured"}
              value={form.transcriptRaw}
              onChange={(event) => setForm((prev) => ({ ...prev, transcriptRaw: event.target.value }))}
            />
            <div className="rounded-2xl border border-[#5e17eb]/20 bg-[#f7f3ff] px-4 py-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-xs text-[#5b5491]">逐字稿建议在大视窗中校对。支持分行编辑、实时预览、标记 featured。</p>
                <button
                  className="inline-flex items-center gap-2 rounded-full bg-[#5e17eb] px-4 py-2 text-xs font-bold text-white hover:bg-[#5112d1]"
                  onClick={openTranscriptEditor}
                  type="button"
                >
                  <span className="material-symbols-outlined text-sm">splitscreen_right</span>
                  打开逐字稿校对视窗
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

    </div>
  );

  return (
    <div className="space-y-12 font-['Noto_Sans_SC','Plus_Jakarta_Sans',sans-serif] text-[#2D2926]">
      <style>{`
        .pearl-card {
          background: #ffffff;
          border: 1px solid rgba(122, 116, 110, 0.1);
        }
        .gradient-violet {
          background: linear-gradient(135deg, #5e17eb 0%, #5e17eb 100%);
        }
      `}</style>
      <main className="space-y-8">
        <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioFileSelect} />

        {error ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-600">{error}</div>
        ) : null}

        <section className="pearl-card overflow-hidden rounded-[2.5rem] border-stone-200/60">
          <div className="flex flex-col items-center justify-between gap-5 border-b border-stone-100 bg-white/50 p-8 md:flex-row">
            <div className="flex items-center gap-5">
              <h2 className="text-[26px] font-black tracking-tight text-stone-900">内容资源清单</h2>
              <span className="rounded-full bg-stone-100 px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-[#7A746E]">{filteredItems.length} 项内容</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex rounded-2xl bg-stone-100 p-1">
                {(["all", "published", "draft"] as StatusFilter[]).map((filter) => (
                  <button
                    key={filter}
                    className={`rounded-xl px-5 py-1.5 text-[11px] font-semibold whitespace-nowrap ${statusFilter === filter ? "bg-white text-stone-800 shadow-[0_1px_2px_rgba(0,0,0,0.04)]" : "text-[#7A746E]"}`}
                    onClick={() => setStatusFilter(filter)}
                  >
                    {filter === "all" ? "全部内容" : filter === "published" ? "已发布" : "草稿箱"}
                  </button>
                ))}
              </div>
              <div className="mx-1 h-8 w-px bg-stone-200" />
              <button
                aria-label="上传并解析"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#5e17eb] bg-[#5e17eb] text-white shadow-[0_10px_24px_rgba(94,23,235,0.18)] transition-all hover:bg-[#5112d1] hover:border-[#5112d1] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isUploadingAudio}
                onClick={openUploadDialog}
                title="上传并解析"
                type="button"
              >
                <span className="material-symbols-outlined text-xl">{isUploadingAudio ? "hourglass_top" : "upload_file"}</span>
              </button>
            </div>
          </div>

          {editingProgram && !isModalOpen ? (
            <div className="border-b border-stone-100 bg-stone-50/40 p-8">
              <div className="space-y-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#5e17eb]">Manuscript</p>
                    <h3 className="mt-2 text-xl font-black text-stone-900">{editingProgram.title}</h3>
                    <p className="mt-1 text-xs font-bold text-stone-500">编号：{(editingProgram.programCode || editingProgram._id.slice(-8)).toUpperCase()}</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-full border border-stone-200 bg-white px-5 py-2.5 text-sm font-bold text-stone-700 hover:border-[#5e17eb] hover:text-[#5e17eb]"
                      onClick={() => {
                        setEditingProgram(null);
                        setForm(EMPTY_FORM);
                        setParseEditorTab("quickview");
                      }}
                      type="button"
                    >
                      收起文稿
                    </button>
                    <button
                      className="rounded-full bg-[#5e17eb] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#5112d1] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={saving}
                      onClick={handleSaveContentEnhancement}
                      type="button"
                    >
                      {saving ? "保存中..." : "保存文稿"}
                    </button>
                  </div>
                </div>
                {renderContentEnhancementFields()}
              </div>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-stone-50/50 text-[10px] font-bold tracking-[0.08em] text-[#8A847E]">
                <tr>
                  <th className="min-w-[420px] px-10 py-5">资源名称与标识</th>
                  <th className="px-10 py-5 text-center">关联标签</th>
                  <th className="px-10 py-5 text-center">当前状态</th>
                  <th className="px-10 py-5 text-center">上传日期</th>
                  <th className="min-w-[180px] px-10 py-5 text-center">解析</th>
                  <th className="min-w-[460px] px-10 py-5 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {loading ? (
                  <tr>
                    <td className="px-10 py-10 text-sm text-stone-500" colSpan={6}>
                      正在加载节目数据...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 && !shouldShowStandaloneUploadTask ? (
                  <tr>
                    <td className="px-10 py-10 text-sm text-stone-500" colSpan={6}>
                      暂无匹配内容
                    </td>
                  </tr>
                ) : (
                  <>
                    {shouldShowStandaloneUploadTask && currentUploadTask ? (
                      <tr className="bg-[#faf7ff]" key={`upload-task-${currentUploadTask.id}`}>
                        <td className="px-10 py-6" colSpan={6}>
                          <div className="rounded-[1.75rem] border border-[#5e17eb]/15 bg-white px-6 py-5">
                            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                              <div className="min-w-0">
                                <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap pb-1">
                                  <span className="shrink-0 whitespace-nowrap rounded-full bg-[#5e17eb]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#5e17eb]">上传任务</span>
                                  <span className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold ${getUploadTaskTone(currentUploadTask.phase)}`}>
                                    {buildUploadTaskTitle(currentUploadTask.phase, currentUploadTask.progress)}
                                  </span>
                                  {currentUploadTask.phase === "failed" ? (
                                    <button
                                      className="shrink-0 whitespace-nowrap rounded-full border border-[#5e17eb]/20 px-3 py-1 text-[11px] font-bold text-[#5e17eb]"
                                      onClick={handleReupload}
                                      type="button"
                                    >
                                      重新上传
                                    </button>
                                  ) : null}
                                </div>
                                <div className="mt-2 truncate text-sm font-bold text-stone-900">{currentUploadTask.fileName}</div>
                                <div className="mt-1 text-xs text-stone-500">
                                  {currentUploadTask.failureReason || buildUploadStageHint(currentUploadTask.phase, currentUploadTask.progress, currentUploadTask.parseStage)}
                                </div>
                              </div>
                              <div className="w-full max-w-[320px]">
                                <div className="h-2.5 overflow-hidden rounded-full bg-stone-200">
                                  <div className={`h-full rounded-full transition-all ${currentUploadTask.phase === "failed" ? "bg-red-400" : currentUploadTask.phase === "success" ? "bg-emerald-500" : "bg-[#5e17eb]"}`} style={{ width: `${currentUploadTask.progress}%` }} />
                                </div>
                                <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-stone-500">
                                  <span>{currentUploadTask.programId ? "草稿已创建" : "草稿待创建"}</span>
                                  <span>{currentUploadTask.progress}%</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    {filteredItems.map((row) => {
                      const rowUploadTask = currentUploadTask?.programId === row._id ? currentUploadTask : null;
                      return (
                    <tr key={row._id}>
                      <td className="px-10 py-6">
                        <div className="flex items-center gap-5">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#5e17eb]/5 text-[#5e17eb]">
                            <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                              mic
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="mb-1 flex items-center gap-2">
                              <div className="text-[11px] font-medium tracking-[0.08em] text-[#7A746E] whitespace-nowrap">
                                编号: {(row.programCode || row._id.slice(-8)).toUpperCase()}
                              </div>
                            </div>
                            <div className="text-[15px] font-bold leading-[1.25] text-stone-900">{row.title}</div>
                            {rowUploadTask && rowUploadTask.phase !== "success" ? (
                              <div className="mt-2 max-w-[300px]">
                                <div className="flex items-center gap-2">
                                  <div className={`text-[11px] font-bold ${rowUploadTask.phase === "failed" ? "text-red-500" : "text-[#5e17eb]"}`}>
                                    {rowUploadTask.phase === "parsing" ? getParseStageLabel(rowUploadTask.parseStage) : buildUploadTaskTitle(rowUploadTask.phase, rowUploadTask.progress)}
                                  </div>
                                </div>
                                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100">
                                  <div
                                    className={`h-full rounded-full transition-all ${rowUploadTask.phase === "failed" ? "bg-red-400" : "bg-[#5e17eb]"}`}
                                    style={{ width: `${rowUploadTask.progress}%` }}
                                  />
                                </div>
                                <div className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-stone-500">
                                  {rowUploadTask.failureReason || buildUploadStageHint(rowUploadTask.phase, rowUploadTask.progress, rowUploadTask.parseStage)}
                                </div>
                                {rowUploadTask.phase === "failed" ? (
                                  <div className="mt-2">
                                    <button
                                      className="inline-flex items-center rounded-full bg-[#f7f3ff] px-2.5 py-0.5 !text-[10px] !font-bold leading-none whitespace-nowrap text-[#5e17eb] transition-colors hover:bg-[#efe5ff]"
                                      onClick={() => handleReparse(row)}
                                      type="button"
                                    >
                                      重新解析
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-6 text-center">
                        <div className="flex items-center justify-center gap-0">
                          <span
                            className={`inline-flex h-7 min-w-9 items-center justify-center rounded-full px-2 text-[10px] font-bold ${
                              row.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                            }`}
                          >
                            {row.status === "published" ? "ON" : "OFF"}
                          </span>
                          <div className="-ml-px text-xs text-stone-500 whitespace-nowrap">
                            {(row.dictionaryEntries || []).length > 0 ? (
                              <span className="inline-flex items-center rounded-full bg-[#f7f3ff] px-3 py-1 text-[11px] font-semibold text-[#5e17eb]">
                                {(row.dictionaryEntries || []).length} 个词条
                              </span>
                            ) : (
                              <span className="text-[11px] text-stone-400">待导入词条</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-6 text-center">
                        <span className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold ${row.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          {STATUS_LABEL[row.status]}
                        </span>
                      </td>
                      <td className="px-10 py-6 text-center text-[14px] font-semibold text-stone-500">{formatDate(row.publishedAt || row.createdAt)}</td>
                      <td className="px-10 py-6 text-center">
                        {row.parseStatus && row.parseStatus !== "idle" ? (
                          <button
                            className="inline-flex items-center rounded-full bg-[#f7f3ff] px-2.5 py-0.5 !text-[10px] !font-bold leading-none whitespace-nowrap text-[#5e17eb] transition-colors hover:bg-[#efe5ff] disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => handleReparse(row)}
                            disabled={row.parseStatus === "parsing"}
                            type="button"
                          >
                            {row.parseStatus === "parsing" ? "解析中" : "重新解析"}
                          </button>
                        ) : (
                          <span className="text-[11px] font-semibold text-stone-300">-</span>
                        )}
                      </td>
                      <td className="min-w-[460px] px-10 py-6 text-center">
                        <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              className="shrink-0 whitespace-nowrap rounded-full border border-stone-200 px-3 py-0.5 font-semibold text-stone-700 transition-colors hover:bg-stone-50"
                              style={{ fontSize: "12px" }}
                              onClick={() => openEdit(row)}
                            >
                              编辑
                            </button>
                            <button
                              className="shrink-0 whitespace-nowrap rounded-full border border-[#5e17eb]/20 bg-[#f7f3ff] px-3 py-0.5 font-semibold text-[#5e17eb] transition-colors hover:bg-[#efe5ff]"
                              style={{ fontSize: "12px" }}
                              onClick={() => openContentEnhancement(row)}
                            >
                              文稿
                            </button>
                            <button
                              className="shrink-0 whitespace-nowrap rounded-full border border-stone-200 px-3 py-0.5 font-semibold text-stone-700 transition-colors hover:bg-stone-50"
                              style={{ fontSize: "12px" }}
                              onClick={() => handleToggleStatus(row)}
                            >
                              {row.status === "published" ? "下架" : "发布"}
                            </button>
                            <button
                              className="shrink-0 whitespace-nowrap rounded-full border border-red-100 px-3 py-0.5 font-semibold text-red-500 transition-colors hover:bg-red-50"
                              style={{ fontSize: "12px" }}
                              onClick={() => handleDelete(row)}
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                      );
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {isModalOpen ? (
        <div
          className="fixed inset-0 z-[60] overflow-y-auto bg-black/30 p-4 backdrop-blur-sm md:p-6"
          onClick={closeModal}
        >
          <div
            className="mx-auto my-6 w-full max-w-3xl rounded-[2rem] bg-white p-6 shadow-2xl md:my-10 md:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black text-stone-900">{editingProgram ? "编辑节目" : "新增节目"}</h3>
                <p className="mt-1 text-sm text-[#7A746E]">保存后即可在后台继续发布，下架后前台详情页会自动同步。</p>
              </div>
              <button
                aria-label="关闭弹窗"
                className="material-symbols-outlined text-stone-400 transition-colors hover:text-stone-700"
                onClick={closeModal}
                type="button"
              >
                close
              </button>
            </div>

            <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleSave}>
              <input className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm" placeholder="节目标题" required value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
              <input className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm" placeholder="节目编号（如 ep1）" required value={form.programCode} onChange={(event) => setForm((prev) => ({ ...prev, programCode: event.target.value.toLowerCase().replace(/\s+/g, "") }))} />
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm md:col-span-2">
                <input className="w-full bg-transparent text-sm outline-none" placeholder="封面图片 URL" required value={form.coverImage} onChange={(event) => setForm((prev) => ({ ...prev, coverImage: event.target.value }))} />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-stone-500">前台链接将使用：{`/programs/${form.programCode || "ep1"}`}</span>
                  <button className="rounded-full border border-[#5e17eb]/20 px-3 py-1 text-[11px] font-bold text-[#5e17eb]" type="button" onClick={() => coverImageInputRef.current?.click()}>
                    上传封面
                  </button>
                </div>
                <input
                  ref={coverImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    handleImageUpload(file, "coverImage");
                  }}
                />
              </div>
              <input className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm" placeholder="单集标题" required value={form.episodeTitle} onChange={(event) => setForm((prev) => ({ ...prev, episodeTitle: event.target.value }))} />
              <input className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm" placeholder="时长（如 45分钟）" required value={form.episodeDuration} onChange={(event) => setForm((prev) => ({ ...prev, episodeDuration: event.target.value }))} />
              <input className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm md:col-span-2" placeholder="音频 URL" required value={form.episodeUrl} onChange={(event) => setForm((prev) => ({ ...prev, episodeUrl: event.target.value }))} />
              <textarea className="min-h-[140px] rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm md:col-span-2" placeholder="节目简介" required value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />

              <div className="mt-2 rounded-2xl border border-stone-100 bg-stone-50/50 p-4 md:col-span-2">
                <p className="mb-3 text-xs font-black uppercase tracking-widest text-[#7A746E]">详情页功能配置</p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <input className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm" placeholder="摘要标题（如：感官环境的神经学重塑）" value={form.summaryHeadline} onChange={(event) => setForm((prev) => ({ ...prev, summaryHeadline: event.target.value }))} />
                  <input className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm" placeholder="摘要亮点标签（如：低摩擦环境）" value={form.summaryHighlightLabel} onChange={(event) => setForm((prev) => ({ ...prev, summaryHighlightLabel: event.target.value }))} />
                  <textarea className="min-h-[90px] rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm md:col-span-2" placeholder="摘要正文" value={form.summaryBody} onChange={(event) => setForm((prev) => ({ ...prev, summaryBody: event.target.value }))} />
                  <textarea className="min-h-[90px] rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm md:col-span-2" placeholder="摘要亮点说明" value={form.summaryHighlightText} onChange={(event) => setForm((prev) => ({ ...prev, summaryHighlightText: event.target.value }))} />
                  <input className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm md:col-span-2" placeholder="摘要标签（逗号分隔，如：神经可塑性, 环境心理学）" value={form.summaryTags} onChange={(event) => setForm((prev) => ({ ...prev, summaryTags: event.target.value }))} />

                  <input
                    className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
                    placeholder="嘉宾姓名"
                    value={form.guestName}
                    onChange={(event) =>
                      setForm((prev) => {
                        const nextName = event.target.value.trim();
                        const oldName = prev.guestName.trim();
                        const fromLabels = [oldName, "嘉宾", "嘉宾1", "guest", "guest1"].filter(Boolean);
                        return {
                          ...prev,
                          guestName: event.target.value,
                          transcriptRaw: nextName ? replaceSpeakerLabel(prev.transcriptRaw, fromLabels, nextName) : prev.transcriptRaw,
                        };
                      })
                    }
                  />
                  <input className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm" placeholder="嘉宾头衔" value={form.guestTitle} onChange={(event) => setForm((prev) => ({ ...prev, guestTitle: event.target.value }))} />
                  <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm">
                    <input className="w-full bg-transparent text-sm outline-none" placeholder="嘉宾头像 URL" value={form.guestAvatar} onChange={(event) => setForm((prev) => ({ ...prev, guestAvatar: event.target.value }))} />
                    <div className="mt-2 flex justify-end">
                      <button className="rounded-full border border-[#5e17eb]/20 px-3 py-1 text-[11px] font-bold text-[#5e17eb]" type="button" onClick={() => guestAvatarInputRef.current?.click()}>
                        上传头像
                      </button>
                    </div>
                    <input
                      ref={guestAvatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        handleImageUpload(file, "guestAvatar");
                      }}
                    />
                  </div>
                  <input className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm" placeholder="嘉宾档案链接 URL（可选）" value={form.guestProfileUrl} onChange={(event) => setForm((prev) => ({ ...prev, guestProfileUrl: event.target.value }))} />
                  <textarea className="min-h-[90px] rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm md:col-span-2" placeholder="嘉宾简介" value={form.guestBio} onChange={(event) => setForm((prev) => ({ ...prev, guestBio: event.target.value }))} />

                  <input className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm md:col-span-2" placeholder="深度挖掘模块标题（如：深度挖掘 Deep Dive）" value={form.deepDiveTitle} onChange={(event) => setForm((prev) => ({ ...prev, deepDiveTitle: event.target.value }))} />
                  <textarea
                    className="min-h-[110px] rounded-2xl border border-stone-200 bg-white px-4 py-3 font-mono text-xs md:col-span-2"
                    placeholder={"推荐阅读（每行一条）：标题|副标题|链接URL"}
                    value={form.curatedReadingRaw}
                    onChange={(event) => setForm((prev) => ({ ...prev, curatedReadingRaw: event.target.value }))}
                  />
                  <div className="md:col-span-2 rounded-2xl border border-stone-200 bg-white px-4 py-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-[#7A746E]">教育词典关联</p>
                        <p className="mt-2 text-sm text-stone-600">
                          当前已关联 {(editingProgram?.dictionaryEntries || []).length} 个词条。
                          {(editingProgram?.dictionaryEntries || []).length > 0
                            ? ` ${editingProgram?.dictionaryEntries?.slice(0, 6).map((entry) => entry.term).join("、")}`
                            : " 保存节目后可从 AI 术语结果自动入库。"}
                        </p>
                      </div>
                      {editingProgram ? (
                        <button
                          className="inline-flex items-center gap-2 rounded-full border border-[#5e17eb]/20 bg-white px-4 py-2 text-xs font-bold text-[#5e17eb] hover:border-[#5e17eb] hover:bg-[#f7f3ff]"
                          onClick={openDictionaryDialog}
                          type="button"
                        >
                          <span className="material-symbols-outlined text-sm">menu_book</span>
                          关联词典
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <select className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm md:col-span-2" value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as "draft" | "published" }))}>
                <option value="draft">保存为草稿</option>
                <option value="published">直接发布</option>
              </select>

              <div className="mt-2 flex justify-end gap-3 md:col-span-2">
                <button className="rounded-full border border-stone-200 px-6 py-3 text-sm font-bold text-stone-700" type="button" onClick={closeModal}>
                  取消
                </button>
                <button className="gradient-violet rounded-full px-8 py-3 text-sm font-bold text-white" disabled={saving} type="submit">
                  {saving ? "保存中..." : editingProgram ? "保存修改" : "创建节目"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isDictionaryDialogOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={() => setIsDictionaryDialogOpen(false)}>
          <div className="w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl md:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-black text-stone-900">词典手动绑定</h3>
                <p className="mt-1 text-xs text-stone-500">搜索并勾选词条，保存后即绑定到当前节目。</p>
              </div>
              <button className="material-symbols-outlined text-stone-400 hover:text-stone-700" onClick={() => setIsDictionaryDialogOpen(false)} type="button">
                close
              </button>
            </div>

            <div className="mb-3 flex gap-2">
              <input
                className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm"
                placeholder="搜索词条（支持关键词）"
                value={dictionarySearch}
                onChange={(event) => setDictionarySearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    loadDictionaryCandidates(dictionarySearch);
                  }
                }}
              />
              <button
                className="rounded-xl border border-[#5e17eb]/25 bg-[#f7f3ff] px-4 py-2 text-sm font-bold text-[#5e17eb] hover:bg-[#f1eaff]"
                onClick={() => loadDictionaryCandidates(dictionarySearch)}
                type="button"
              >
                搜索
              </button>
            </div>

            <div className="mb-3 rounded-2xl border border-[#5e17eb]/15 bg-[#faf7ff] p-3">
              <div className="text-xs font-bold text-[#5e17eb]">新建词条（自动绑定当前内容）</div>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[200px_1fr_auto]">
                <input
                  className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                  placeholder="词条名称"
                  value={newDictionaryTerm}
                  onChange={(event) => setNewDictionaryTerm(event.target.value)}
                />
                <input
                  className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                  placeholder="词条释义"
                  value={newDictionaryDefinition}
                  onChange={(event) => setNewDictionaryDefinition(event.target.value)}
                />
                <button
                  className="rounded-xl bg-[#5e17eb] px-4 py-2 text-sm font-bold text-white hover:bg-[#5112d1] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleCreateDictionaryEntry}
                  disabled={dictionaryCreating}
                  type="button"
                >
                  {dictionaryCreating ? "创建中..." : "新建并绑定"}
                </button>
              </div>
            </div>

            <div className="max-h-[360px] space-y-2 overflow-y-auto rounded-2xl border border-stone-200 bg-stone-50/70 p-3">
              {dictionaryLoading ? (
                <div className="rounded-xl bg-white px-3 py-3 text-sm text-stone-500">正在加载词典词条...</div>
              ) : dictionaryCandidates.length === 0 ? (
                <div className="rounded-xl bg-white px-3 py-3 text-sm text-stone-500">暂无匹配词条</div>
              ) : (
                dictionaryCandidates.map((entry) => {
                  const checked = selectedDictionaryEntryIds.includes(entry._id);
                  return (
                    <label
                      key={entry._id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${
                        checked ? "border-[#5e17eb]/40 bg-[#f7f3ff]" : "border-stone-200 bg-white hover:border-[#5e17eb]/20"
                      }`}
                    >
                      <input
                        className="mt-0.5"
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDictionarySelection(entry._id)}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-stone-900">{entry.term}</div>
                        <div className="mt-1 text-xs leading-5 text-stone-600">{entry.definition}</div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-xs text-stone-500">已选择 {selectedDictionaryEntryIds.length} 个词条</span>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-full border border-stone-200 px-4 py-2 text-sm font-bold text-stone-700"
                  onClick={() => setIsDictionaryDialogOpen(false)}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="rounded-full bg-[#5e17eb] px-5 py-2 text-sm font-bold text-white hover:bg-[#5112d1] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleSaveDictionaryBinding}
                  disabled={dictionarySaving}
                  type="button"
                >
                  {dictionarySaving ? "保存中..." : "保存绑定"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isTranscriptEditorOpen ? (
        <div className="fixed inset-0 z-[70] bg-black/40 p-3 backdrop-blur-sm md:p-6" onClick={() => setIsTranscriptEditorOpen(false)}>
          <div
            className="mx-auto flex h-full w-full max-w-[1600px] flex-col rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4 md:px-8">
              <div>
                <h3 className="text-lg font-black text-stone-900">逐字稿校对视窗</h3>
                <p className="text-xs text-stone-500">左侧逐条编辑，右侧实时预览，保存后回写到表单。</p>
              </div>
              <button
                className="material-symbols-outlined text-stone-500 hover:text-stone-800"
                onClick={() => setIsTranscriptEditorOpen(false)}
                type="button"
              >
                close
              </button>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-2">
              <div className="flex min-h-0 flex-col border-r border-stone-100">
                <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3 md:px-6">
                  <div className="text-xs font-bold text-stone-500">逐条编辑（{transcriptRows.length} 条）</div>
                  <button className="rounded-full border border-stone-200 px-3 py-1.5 text-xs font-bold text-stone-700 hover:border-[#5e17eb] hover:text-[#5e17eb]" onClick={addTranscriptRow} type="button">
                    + 新增一条
                  </button>
                </div>
                <div className="border-b border-stone-100 bg-stone-50/70 px-5 py-3 md:px-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-bold text-stone-600">
                      {transcriptEditorIssues.length > 0 ? `检测到 ${transcriptEditorIssues.length} 条软校验提示` : "当前未发现明显问题"}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-stone-500">
                      警告 {transcriptEditorIssues.filter((issue) => issue.severity === "warning").length} / 建议 {transcriptEditorIssues.filter((issue) => issue.severity === "info").length}
                    </span>
                  </div>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 md:px-6">
                  {transcriptRows.map((row, index) => {
                    const rowIssues = transcriptEditorIssuesByRow.get(index) || [];
                    return (
                    <div
                      key={row.id}
                      className={`rounded-xl border p-3 ${
                        rowIssues.some((issue) => issue.severity === "warning")
                          ? "border-amber-300 bg-amber-50/60"
                          : rowIssues.length > 0
                          ? "border-stone-300 bg-stone-50"
                          : "border-stone-200 bg-stone-50/50"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-xs font-bold text-stone-500">#{index + 1}</div>
                        <button className="text-xs font-bold text-red-500 hover:text-red-600 disabled:opacity-40" disabled={transcriptRows.length <= 1} onClick={() => removeTranscriptRow(row.id)} type="button">
                          删除
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <input
                          className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                          placeholder="时间，如 03:48-04:07"
                          value={row.time}
                          onChange={(event) => updateTranscriptRow(row.id, { time: event.target.value })}
                        />
                        <input
                          className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                          placeholder="说话人，如 主持人 / 嘉宾1"
                          value={row.speaker}
                          onChange={(event) => renameSpeakerFromRow(row.id, event.target.value)}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {SPEAKER_SUGGESTIONS.map((label) => (
                          <button
                            key={`${row.id}-${label}`}
                            className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
                              row.speaker.trim() === label
                                ? "border-[#5e17eb] bg-[#f7f3ff] text-[#5e17eb]"
                                : "border-stone-200 bg-white text-stone-500 hover:border-[#5e17eb]/30 hover:text-[#5e17eb]"
                            }`}
                            onClick={() => renameSpeakerFromRow(row.id, label)}
                            type="button"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        className="mt-2 min-h-[90px] w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
                        placeholder="发言内容"
                        value={row.text}
                        onChange={(event) => updateTranscriptRow(row.id, { text: event.target.value })}
                      />
                      <label className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-stone-600">
                        <input type="checkbox" checked={row.featured} onChange={(event) => updateTranscriptRow(row.id, { featured: event.target.checked })} />
                        标记为 featured
                      </label>
                      {rowIssues.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {rowIssues.map((issue, issueIndex) => (
                            <div
                              key={`${row.id}-${issue.type}-${issueIndex}`}
                              className={`rounded-lg px-3 py-2 text-[11px] ${
                                issue.severity === "warning" ? "bg-amber-100 text-amber-800" : "bg-white text-stone-600"
                              }`}
                            >
                              {issue.message}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )})}
                </div>
              </div>

              <div className="flex min-h-0 flex-col">
                <div className="border-b border-stone-100 px-5 py-3 text-xs font-bold text-stone-500 md:px-6">实时预览</div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 md:px-6">
                  {transcriptRows.filter((row) => row.time || row.speaker || row.text).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-6 text-sm text-stone-400">暂无内容，请在左侧输入逐字稿。</div>
                  ) : (
                    transcriptRows
                      .filter((row) => row.time || row.speaker || row.text)
                      .map((row) => (
                        <article key={row.id} className="rounded-xl border border-stone-200 bg-white p-4">
                          <div className="mb-2 flex items-center gap-2 text-xs">
                            <span className="rounded bg-stone-100 px-2 py-0.5 font-bold text-stone-600">{row.time || "--:--"}</span>
                            <span className="font-semibold text-stone-700">{row.speaker || "未命名说话人"}</span>
                            {row.featured ? <span className="rounded bg-[#5e17eb]/10 px-2 py-0.5 font-bold text-[#5e17eb]">featured</span> : null}
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-6 text-stone-700">{row.text || "（暂无内容）"}</p>
                        </article>
                      ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-stone-100 px-5 py-4 md:px-8">
              <button className="rounded-full border border-stone-200 px-5 py-2.5 text-sm font-bold text-stone-700" onClick={() => setIsTranscriptEditorOpen(false)} type="button">
                取消
              </button>
              <button className="rounded-full bg-[#5e17eb] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#5112d1] disabled:cursor-not-allowed disabled:opacity-60" onClick={saveTranscriptEditor} disabled={saving} type="button">
                {saving ? "保存中..." : "保存逐字稿并返回列表"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isUploadDialogOpen ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-[#0b1020]/55 p-4 backdrop-blur-md" onClick={closeUploadDialog}>
          <div className="w-full max-w-[760px] rounded-3xl bg-white p-6 shadow-2xl md:p-8" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 className="text-2xl font-black text-stone-900">上传并解析</h3>
                <p className="mt-1 text-sm text-stone-500">选中文件后立即开始上传，关闭弹窗后也会继续在后台执行，并在列表里展示进度。</p>
              </div>
              <button className="material-symbols-outlined text-stone-400 hover:text-stone-700" onClick={closeUploadDialog} type="button">
                close
              </button>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="rounded-full bg-[#5e17eb] px-4 py-2 text-xs font-bold text-white hover:bg-[#5112d1] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isUploadingAudio}
                  onClick={() => audioInputRef.current?.click()}
                  type="button"
                >
                  {pendingAudioFile ? "重新选择" : "选择文件"}
                </button>
                <span className="text-xs text-stone-500">{pendingAudioFile ? pendingAudioFile.name : "未选择任何文件"}</span>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-stone-200">
                <div className="h-full rounded-full bg-[#5e17eb] transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
              <div className="mt-2 text-xs text-stone-500">
                {parseHint || (isUploadingAudio ? buildUploadStageHint(uploadPhase, uploadProgress) || `${uploadProgress}%` : "请选择音频文件后自动开始上传")}
              </div>
            </div>

            {uploadFailureReason ? <p className="mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">失败原因：{uploadFailureReason}</p> : null}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button className="rounded-full border border-stone-200 px-5 py-2.5 text-sm font-bold text-stone-700 hover:bg-stone-50" onClick={closeUploadDialog} type="button">
                {isUploadingAudio ? "后台继续" : "关闭"}
              </button>
              <button
                className="rounded-full border border-[#5e17eb]/30 px-5 py-2.5 text-sm font-bold text-[#5e17eb] hover:bg-[#f4efff] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!pendingAudioFile || isUploadingAudio}
                onClick={handleRetryUpload}
                type="button"
              >
                失败重试
              </button>
              <button
                className="rounded-full bg-[#c7bbff] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#5e17eb] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isUploadingAudio}
                onClick={handleStartParseFromDialog}
                type="button"
              >
                {isUploadingAudio
                  ? uploadPhase === "uploading"
                    ? "上传中..."
                    : "处理中..."
                  : "开始上传"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
};

export default AdminProgramsPage;
