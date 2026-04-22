import React, { useEffect, useMemo, useRef, useState } from "react";
import { adminApi, Program } from "../../services/api";

type StatusFilter = "all" | "published" | "draft";
type FormState = {
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

const EMPTY_FORM: FormState = {
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

function formatDate(date?: string): string {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("zh-CN");
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

const AdminProgramsPage: React.FC = () => {
  const [items, setItems] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [parseHint, setParseHint] = useState<string>("");
  const [parsingProgramId, setParsingProgramId] = useState<string | null>(null);
  const [isTranscriptEditorOpen, setIsTranscriptEditorOpen] = useState(false);
  const [transcriptRows, setTranscriptRows] = useState<TranscriptEditorRow[]>([]);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
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

  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return items;
    return items.filter((item) =>
      `${item.title} ${item.description} ${item.episodes[0]?.title || ""}`.toLowerCase().includes(normalizedKeyword)
    );
  }, [items, keyword]);

  const stats = useMemo(() => {
    const total = items.length;
    const published = items.filter((item) => item.status === "published").length;
    const draft = items.filter((item) => item.status === "draft").length;
    const today = new Date().toDateString();
    const todayCount = items.filter((item) => new Date(item.createdAt).toDateString() === today).length;
    return { total, published, draft, todayCount };
  }, [items]);

  const openCreate = () => {
    setEditingProgram(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (program: Program) => {
    setEditingProgram(program);
    setForm({
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
      guestName: program.guest?.name || "",
      guestTitle: program.guest?.title || "",
      guestBio: program.guest?.bio || "",
      guestAvatar: program.guest?.avatar || "",
      guestProfileUrl: program.guest?.profileUrl || "",
      deepDiveTitle: program.deepDive?.sectionTitle || "",
      curatedReadingRaw: formatCuratedReadingForForm(program.deepDive?.curatedReading),
      status: program.status,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsTranscriptEditorOpen(false);
    setTranscriptRows([]);
    setEditingProgram(null);
    setForm(EMPTY_FORM);
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
    if (!isModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
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
  }, [isModalOpen, isTranscriptEditorOpen]);

  const openTranscriptEditor = () => {
    const rows = parseTranscriptRows(form.transcriptRaw);
    setTranscriptRows(rows.length > 0 ? rows : [{ id: `${Date.now()}-0`, time: "", speaker: "", text: "", featured: false }]);
    setIsTranscriptEditorOpen(true);
  };

  const saveTranscriptEditor = () => {
    setForm((prev) => ({
      ...prev,
      transcriptRaw: serializeTranscriptRows(transcriptRows),
    }));
    setIsTranscriptEditorOpen(false);
  };

  const updateTranscriptRow = (id: string, patch: Partial<TranscriptEditorRow>) => {
    setTranscriptRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
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
    setParsingProgramId(programId);
    parsePollTimerRef.current = window.setInterval(async () => {
      try {
        const response = await adminApi.getProgramParseStatus(programId);
        const status = response.data?.parseStatus;
        if (status === "parsing") {
          setParseHint("AI 正在解析音频，请稍候...");
          return;
        }
        if (parsePollTimerRef.current !== null) {
          window.clearInterval(parsePollTimerRef.current);
          parsePollTimerRef.current = null;
        }
        setParsingProgramId(null);
        if (status === "success") {
          setParseHint("解析完成，草稿内容已自动生成。");
        } else if (status === "failed") {
          setParseHint(`解析失败：${response.data?.parseError || "请稍后重试"}`);
        } else {
          setParseHint("");
        }
        await refreshList();
      } catch (pollError: any) {
        if (parsePollTimerRef.current !== null) {
          window.clearInterval(parsePollTimerRef.current);
          parsePollTimerRef.current = null;
        }
        setParsingProgramId(null);
        setParseHint(pollError?.response?.data?.message || pollError?.message || "轮询解析状态失败");
      }
    }, 3000);
  };

  const handleAudioUpload = async (file: File) => {
    try {
      setError(null);
      setIsUploadingAudio(true);
      setParseHint("正在上传音频...");
      const uploadRes = await adminApi.uploadProgramAudio(file);
      setParseHint("上传成功，正在创建解析草稿...");
      const createRes = await adminApi.createProgramFromAudio(uploadRes.data.url);
      const programId = createRes.data?.programId;
      if (programId) {
        setParseHint("解析任务已启动，正在处理...");
        await refreshList();
        startParsePolling(programId);
      } else {
        setParseHint("任务已提交，请刷新列表查看状态。");
      }
    } catch (uploadError: any) {
      setError(uploadError?.response?.data?.message || uploadError?.message || "上传并解析失败");
      setParseHint("");
    } finally {
      setIsUploadingAudio(false);
    }
  };

  const handleAudioFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await handleAudioUpload(file);
  };

  const handleAudioDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handleAudioUpload(file);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
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
    };

    try {
      if (editingProgram) {
        await adminApi.updateProgram(editingProgram._id, payload);
      } else {
        await adminApi.createProgram(payload);
      }
      await refreshList();
      closeModal();
    } catch (saveError: any) {
      setError(saveError?.response?.data?.message || saveError?.message || "保存失败");
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

  return (
    <div className="space-y-12 font-['Noto_Sans_SC','Plus_Jakarta_Sans',sans-serif] text-[#2D2926]">
      <style>{`
        .pearl-card {
          background: #ffffff;
          border: 1px solid rgba(122, 116, 110, 0.1);
          box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.04);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .pearl-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 40px 80px -20px rgba(99, 14, 212, 0.08);
          border-color: rgba(99, 14, 212, 0.15);
        }
        .editorial-shadow {
          box-shadow: 0 20px 40px -15px rgba(94, 139, 142, 0.15);
        }
        .gradient-violet {
          background: linear-gradient(135deg, #5e17eb 0%, #5e17eb 100%);
        }
      `}</style>
      <main className="space-y-12">
        <header className="flex flex-col items-end justify-between gap-8 md:flex-row">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#5E8B8E]">
              <span className="h-[1px] w-8 bg-[#5E8B8E]"></span>
              管理面板
            </div>
            <h1 className="text-5xl font-black tracking-tight text-stone-900">资源库总览</h1>
            <p className="text-xl font-light text-[#7A746E]">一处上传，多维流转。为中国家长提供有温度的教育内容。</p>
          </div>
          <button className="editorial-shadow gradient-violet flex items-center gap-3 rounded-full px-10 py-5 font-bold text-white transition-all hover:scale-105" onClick={openCreate}>
            <span className="material-symbols-outlined text-2xl">add_circle</span>
            新增教育资源
          </button>
        </header>

        {error ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-600">{error}</div>
        ) : null}

        <section className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="pearl-card flex h-52 flex-col justify-between rounded-2xl p-10">
            <div>
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#FCF9F1]">
                <span className="material-symbols-outlined text-[#5E8B8E]">inventory_2</span>
              </div>
              <h3 className="text-sm font-medium text-[#7A746E]">累计资源总数</h3>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-4xl font-black tracking-tighter">{stats.total}</span>
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-sm font-bold text-emerald-600">+{stats.published}</span>
            </div>
          </div>
          <div className="pearl-card flex h-52 flex-col justify-between rounded-2xl p-10">
            <div>
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#E8F1F2]">
                <span className="material-symbols-outlined text-[#5E8B8E]">hub</span>
              </div>
              <h3 className="text-sm font-medium text-[#7A746E]">多维关联总计</h3>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-4xl font-black tracking-tighter">{stats.total * 4}</span>
              <span className="text-sm font-bold text-emerald-600">+{stats.published * 2}</span>
            </div>
          </div>
          <div className="pearl-card flex h-52 flex-col justify-between rounded-2xl p-10">
            <div>
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-stone-100">
                <span className="material-symbols-outlined text-[#7A746E]">upload_file</span>
              </div>
              <h3 className="text-sm font-medium text-[#7A746E]">今日新增资源</h3>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-4xl font-black tracking-tighter">{stats.todayCount}</span>
              <span className="text-xs font-medium text-stone-400">额度 500</span>
            </div>
          </div>
          <div className="editorial-shadow gradient-violet relative flex h-52 flex-col justify-between overflow-hidden rounded-2xl p-10 text-white">
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl"></div>
            <div>
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
                <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>
                  auto_awesome
                </span>
              </div>
              <h3 className="text-sm font-medium opacity-80">内容存储健康度</h3>
            </div>
            <div className="relative z-10 flex items-baseline justify-between">
              <span className="text-4xl font-black tracking-tighter">99.9%</span>
              <span className="rounded-full bg-white/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest">正常运行</span>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-10 lg:grid-cols-3">
          <div className="pearl-card lg:col-span-2 space-y-10 rounded-[2.5rem] p-12">
            <div className="flex items-end justify-between">
              <div className="space-y-1">
                <h2 className="text-3xl font-black text-stone-900">内容发布中心</h2>
                <p className="text-[#7A746E]">轻松拖拽，将您的教育洞察传递给千家万户</p>
              </div>
              <span className="rounded-full bg-[#E8F1F2] px-4 py-1.5 text-sm font-bold text-[#5E8B8E]">待处理队列: {stats.draft} 份文件</span>
            </div>
            <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioFileSelect} />
            <div
              className="group cursor-pointer rounded-3xl border-2 border-dashed border-stone-200 bg-[#FCF9F1]/30 p-16 text-center transition-all hover:border-[#5e17eb]/30 hover:bg-[#FCF9F1]/50"
              onClick={() => audioInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleAudioDrop}
            >
              <div className="mb-6 inline-flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-sm transition-transform group-hover:scale-110">
                <span className="material-symbols-outlined text-5xl text-[#5e17eb]/40">cloud_upload</span>
              </div>
              <p className="text-xl font-bold text-stone-800">
                拖拽音频到这里，或 <span className="text-[#5e17eb] underline underline-offset-4">点击上传解析</span>
              </p>
              <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-[#7A746E]">
                独立入口：上传后自动创建草稿并触发 AI 解析，解析完成后可直接进入编辑。
              </p>
              <div className="mt-5">
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-[#5e17eb] shadow-sm">
                  <span className={`h-2 w-2 rounded-full ${isUploadingAudio || parsingProgramId ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`}></span>
                  {isUploadingAudio ? "上传中..." : parsingProgramId ? "解析中..." : "等待上传"}
                </span>
              </div>
              {parseHint ? <p className="mx-auto mt-3 max-w-xl text-xs text-stone-500">{parseHint}</p> : null}
            </div>
          </div>

          <div className="pearl-card relative flex flex-col overflow-hidden rounded-[2.5rem] bg-stone-50/50 p-12">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#5E8B8E]/5 blur-3xl"></div>
            <div className="mb-10">
              <h2 className="mb-3 text-2xl font-black">多维属性关联</h2>
              <p className="text-sm leading-relaxed text-[#7A746E]">一处发布，即刻同步至不同的教育路径与家长触点。</p>
            </div>
            <div className="flex-grow space-y-8">
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#5E8B8E]"></span>
                  当前状态分布
                </label>
                <div className="flex flex-wrap gap-2.5">
                  <span className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-stone-700">已发布 {stats.published}</span>
                  <span className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-stone-700">草稿 {stats.draft}</span>
                  <button className="rounded-xl border border-dashed border-[#5e17eb]/30 bg-[#5e17eb]/5 px-4 py-2 text-xs font-bold text-[#5e17eb]" onClick={() => setStatusFilter("draft")}>
                    查看草稿
                  </button>
                </div>
              </div>
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#5E8B8E]"></span>
                  节目搜索
                </label>
                <div className="relative">
                  <input
                    className="w-full rounded-2xl border border-stone-200 bg-white px-5 py-3.5 text-sm transition-all focus:border-[#5e17eb] focus:ring-4 focus:ring-[#5e17eb]/5"
                    placeholder="搜索节目标题或单集标题"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                  />
                  <span className="material-symbols-outlined pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-stone-400">search</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pearl-card overflow-hidden rounded-[2.5rem] border-stone-200/60">
          <div className="flex flex-col items-center justify-between gap-6 border-b border-stone-100 bg-white/50 p-10 md:flex-row">
            <div className="flex items-center gap-5">
              <h2 className="text-2xl font-black text-stone-900">内容资源清单</h2>
              <span className="rounded-full bg-stone-100 px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-[#7A746E]">{filteredItems.length} 项内容</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex rounded-2xl bg-stone-100 p-1.5">
                {(["all", "published", "draft"] as StatusFilter[]).map((filter) => (
                  <button
                    key={filter}
                    className={`rounded-xl px-6 py-2 text-xs font-bold transition-colors ${statusFilter === filter ? "bg-white text-stone-800 shadow-sm" : "text-[#7A746E] hover:text-stone-800"}`}
                    onClick={() => setStatusFilter(filter)}
                  >
                    {filter === "all" ? "全部内容" : filter === "published" ? "已发布" : "草稿箱"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-stone-50/50 text-[10px] font-black uppercase tracking-[0.2em] text-[#7A746E]">
                <tr>
                  <th className="px-10 py-5">资源名称与标识</th>
                  <th className="px-10 py-5">文件类型</th>
                  <th className="px-10 py-5">关联标签</th>
                  <th className="px-10 py-5 text-center">当前状态</th>
                  <th className="px-10 py-5">上传日期</th>
                  <th className="px-10 py-5 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {loading ? (
                  <tr>
                    <td className="px-10 py-10 text-sm text-stone-500" colSpan={6}>
                      正在加载节目数据...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td className="px-10 py-10 text-sm text-stone-500" colSpan={6}>
                      暂无匹配内容
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((row) => (
                    <tr key={row._id} className="transition-colors hover:bg-[#FCF9F1]/40">
                      <td className="px-10 py-7">
                        <div className="flex items-center gap-5">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#5e17eb]/5 text-[#5e17eb] shadow-sm">
                            <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                              mic
                            </span>
                          </div>
                          <div>
                            <div className="mb-0.5 font-bold text-stone-900">{row.title}</div>
                            <div className="text-[10px] font-medium tracking-widest text-[#7A746E]">UUID: {row._id.slice(-8).toUpperCase()}</div>
                            {row.parseStatus && row.parseStatus !== "idle" ? (
                              <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                row.parseStatus === "success"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : row.parseStatus === "failed"
                                  ? "bg-red-50 text-red-600"
                                  : "bg-amber-50 text-amber-700"
                              }`}>
                                {PARSE_STATUS_LABEL[row.parseStatus]}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-7">
                        <span className="text-sm font-medium text-stone-600">音频资源 / MP3</span>
                      </td>
                      <td className="px-10 py-7">
                        <div className="flex -space-x-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-stone-100 text-[9px] font-black text-stone-600">EP</div>
                          <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#E8F1F2] text-[9px] font-black text-[#5E8B8E]">{row.episodes.length || 1}</div>
                          <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#5e17eb]/10 text-[9px] font-black text-[#5e17eb]">{row.status === "published" ? "ON" : "OFF"}</div>
                        </div>
                      </td>
                      <td className="px-10 py-7 text-center">
                        <span className={`rounded-full px-4 py-1.5 text-[11px] font-black ${row.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          {STATUS_LABEL[row.status]}
                        </span>
                      </td>
                      <td className="px-10 py-7 text-sm font-bold text-stone-500">{formatDate(row.publishedAt || row.createdAt)}</td>
                      <td className="px-10 py-7">
                        <div className="flex justify-end gap-2">
                          <button className="rounded-full border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 transition-colors hover:border-[#5e17eb] hover:text-[#5e17eb]" onClick={() => openEdit(row)}>
                            编辑
                          </button>
                          <button className="rounded-full border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 transition-colors hover:border-[#5e17eb] hover:text-[#5e17eb]" onClick={() => handleToggleStatus(row)}>
                            {row.status === "published" ? "下架" : "发布"}
                          </button>
                          <button className="rounded-full border border-red-100 px-4 py-2 text-xs font-bold text-red-500 transition-colors hover:bg-red-50" onClick={() => handleDelete(row)}>
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
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
              <input className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm" placeholder="封面图片 URL" required value={form.coverImage} onChange={(event) => setForm((prev) => ({ ...prev, coverImage: event.target.value }))} />
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

                  <input className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm" placeholder="嘉宾姓名" value={form.guestName} onChange={(event) => setForm((prev) => ({ ...prev, guestName: event.target.value }))} />
                  <input className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm" placeholder="嘉宾头衔" value={form.guestTitle} onChange={(event) => setForm((prev) => ({ ...prev, guestTitle: event.target.value }))} />
                  <input className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm" placeholder="嘉宾头像 URL" value={form.guestAvatar} onChange={(event) => setForm((prev) => ({ ...prev, guestAvatar: event.target.value }))} />
                  <input className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm" placeholder="嘉宾档案链接 URL（可选）" value={form.guestProfileUrl} onChange={(event) => setForm((prev) => ({ ...prev, guestProfileUrl: event.target.value }))} />
                  <textarea className="min-h-[90px] rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm md:col-span-2" placeholder="嘉宾简介" value={form.guestBio} onChange={(event) => setForm((prev) => ({ ...prev, guestBio: event.target.value }))} />

                  <input className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm md:col-span-2" placeholder="深度挖掘模块标题（如：深度挖掘 Deep Dive）" value={form.deepDiveTitle} onChange={(event) => setForm((prev) => ({ ...prev, deepDiveTitle: event.target.value }))} />
                  <textarea
                    className="min-h-[110px] rounded-2xl border border-stone-200 bg-white px-4 py-3 font-mono text-xs md:col-span-2"
                    placeholder={"推荐阅读（每行一条）：标题|副标题|链接URL"}
                    value={form.curatedReadingRaw}
                    onChange={(event) => setForm((prev) => ({ ...prev, curatedReadingRaw: event.target.value }))}
                  />
                  <textarea
                    className="min-h-[140px] rounded-2xl border border-stone-200 bg-white px-4 py-3 font-mono text-xs md:col-span-2"
                    placeholder={"逐字稿（每行一条）：时间|说话人|内容|featured(可选)\n示例：02:45|嘉宾|核心观点...|featured"}
                    value={form.transcriptRaw}
                    onChange={(event) => setForm((prev) => ({ ...prev, transcriptRaw: event.target.value }))}
                  />
                  <div className="md:col-span-2 rounded-2xl border border-[#5e17eb]/20 bg-[#f7f3ff] px-4 py-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <p className="text-xs text-[#5b5491]">
                        逐字稿建议在大视窗中校对。支持分行编辑、实时预览、标记 featured。
                      </p>
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
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 md:px-6">
                  {transcriptRows.map((row, index) => (
                    <div key={row.id} className="rounded-xl border border-stone-200 bg-stone-50/50 p-3">
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
                          placeholder="说话人，如 jessie"
                          value={row.speaker}
                          onChange={(event) => updateTranscriptRow(row.id, { speaker: event.target.value })}
                        />
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
                    </div>
                  ))}
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
              <button className="rounded-full bg-[#5e17eb] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#5112d1]" onClick={saveTranscriptEditor} type="button">
                保存逐字稿修改
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
};

export default AdminProgramsPage;
