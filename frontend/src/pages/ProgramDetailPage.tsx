import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import GlobalPublicNav from "../components/GlobalPublicNav";
import MindMapView from "../components/MindMapView";
import { CuratedReadingItem, Program, ProgramGuest, TranscriptSegment, publicApi } from "../services/api";

const COVER_FALLBACK =
  "http://xianfeng.xinzhi.info/uploads/images/1779264274027-tcplzfur.png";
const EXPERT_AVATAR =
  "http://xianfeng.xinzhi.info/uploads/images/1779264157086-hgcd24g4.png";
const FAVORITES_KEY = "favorite-programs";



function formatDate(date?: string): string {
  if (!date) return "未发布";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "未发布";
  return parsed.toLocaleDateString("zh-CN");
}

function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "00:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** 统一 speaker 显示名称：主播·阿力 / 主播·Jessie / 嘉宾·XXX */
function speakerDisplay(raw: string): string {
  const s = raw.trim();
  const n = s.toLowerCase();
  if (n === 'ali' || n === '阿力' || n === 'all' || n === '主持' || n === 'host' || n === '主播·阿力') return '主播·阿力';
  if (n === 'jessie' || n === '主播·jessie') return '主播·Jessie';
  if (n === '主持人') return '主播·阿力';
  // 已经带前缀的直接返回
  if (n.startsWith('主播·') || n.startsWith('主持人') || n.startsWith('嘉宾·') || n.startsWith('嘉宾')) return s;
  // 强制 side effect 防止 tree-shake
  if (typeof window !== 'undefined') (window as any).__speakerDisplay = speakerDisplay;
  return '嘉宾·' + s;
}

function inferTranscript(program: Program | null): TranscriptSegment[] {
  if (!program) return [];
  if (program.transcript && program.transcript.length > 0) {
    return program.transcript;
  }
  const description = program.description || "这期节目围绕家庭教育与成长展开讨论。";
  const firstEpisode = program.episodes[0];
  const titleLead = firstEpisode?.title || program.title;
  return [
    {
      time: "00:00",
      speaker: "主播·阿力",
      text: `欢迎回到《家长先疯》。今天我们围绕「${program.title}」展开，对话从 ${titleLead} 开始，聚焦家长真正关心的成长问题。`,
    },
    {
      time: "02:45",
      speaker: "主播·Jessie",
      text: description,
      featured: true,
    },
    {
      time: "04:12",
      speaker: "主播·阿力",
      text: "如果把这些观察带回到家庭环境里，我们最先应该调整的，不只是方法，而是家长与孩子互动时的节奏、情绪和空间感。",
    },
  ];
}

function downloadTranscript(program: Program, segments: TranscriptSegment[]) {
  const content = [
    `标题：${program.title}`,
    `发布时间：${formatDate(program.publishedAt || program.createdAt)}`,
    "",
    ...segments.map((segment) => `[${segment.time}] ${segment.speaker}\n${segment.text}\n`),
  ].join("\n");

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${program.title}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const ProgramDetailPage: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const [programs, setPrograms] = useState<Program[]>([]);
  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [contentViewMode, setContentViewMode] = useState<"quickview" | "transcript" | "mindmap">("quickview");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.5);
  const [mindMapGenerating, setMindMapGenerating] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const transcriptSegments = inferTranscript(program);
  const currentEpisode = program?.episodes?.[0];
  const relatedPrograms = programs.filter((item) => item._id !== program?._id).slice(0, 4);
  const summary = program?.summary;
  const summaryHeadline = summary?.headline || "感官环境的神经学重塑";
  const summaryBody = summary?.body || program?.description || "本期节目围绕家庭教育与成长展开讨论。";
  const summaryHighlightLabel = summary?.highlightLabel || "低摩擦环境";
  const summaryHighlightText = summary?.highlightText || transcriptSegments[1]?.text || summaryBody;
  const summaryTags = (summary?.tags || []).filter(Boolean).slice(0, 4);
  const guest = program?.guest;
  const guestName = guest?.name || "节目特邀嘉宾";
  const guestTitle = guest?.title || "教育与成长观察者";
  const guestBio =
    guest?.bio || "围绕家庭关系、成长节奏与学习环境，提炼节目中的关键视角，帮助家长把内容真正带回到日常生活里。";
  const guestAvatar = guest?.avatar || EXPERT_AVATAR;
  const deepDiveTitle = program?.deepDive?.sectionTitle || "深度挖掘 Deep Dive";
  const curatedReading: CuratedReadingItem[] =
    program?.deepDive?.curatedReading && program.deepDive.curatedReading.length > 0
      ? program.deepDive.curatedReading
      : [{ title: "《家庭教育中的低摩擦沟通》", subtitle: "围绕节目主题延展出的实用阅读线索" }];
  const quickView = (program?.contentPack?.quickView || []).filter((item) => item?.summary).slice(0, 12);
  const minutesText = program?.contentPack?.minutes?.text || summaryBody;
  const showNotesText = program?.contentPack?.showNotes?.renderedText || [
    "导引",
    program?.contentPack?.showNotes?.guide || summaryBody,
    "",
    "嘉宾介绍",
    program?.contentPack?.showNotes?.guestIntro || `${guestName}，围绕本期主题分享经验与实操建议。`,
    "",
    "重点时间戳",
    ...(program?.contentPack?.showNotes?.keyMoments || []).map((item) => `- ${item.time} ${item.point}`),
    "",
    "本期纪要",
    minutesText,
  ].join("\n");

  useEffect(() => {
    let active = true;

    async function loadProgram() {
      setLoading(true);
      setError(null);

      function getProgramIdFromPath(): string {
        const match = window.location.pathname.match(/programs\/([^/?#]+)/);
        return match ? match[1] : "";
      }

      const id = getProgramIdFromPath();

      try {
        // 直接用 _id 查单个节目，API 返回的就是 program 对象本身
        let res = await fetch(`/api/programs/${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let data = await res.json();
        // API 返回：可能是 {program:...} 包装，也可能是扁平结构（_id 在顶层）
        let target: any = data?.program || data?.data || (data?._id ? data : null);

        if (!target) {
          throw new Error("节目数据加载失败，请刷新页面重试");
        }

        if (active) {
          setProgram(target);
        }
      } catch (loadError: any) {
        if (active) {
          setError(loadError.message || "节目数据加载失败，请刷新页面重试");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProgram();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // 检测是否管理员（有 admin_token）
    const adminToken = localStorage.getItem("admin_token");
    setIsAdmin(!!adminToken);
  }, []);

  useEffect(() => {
    if (!program) return;
    const favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]") as string[];
    setIsFavorite(favorites.includes(program._id));
  }, [program]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      const dur = audio.duration || 0;
      setDuration(dur);
      // 读取上次播放位置，如果没听完就从那里继续
      if (currentEpisode?.url) {
        const saved = localStorage.getItem(`playback_pos_${currentEpisode.url}`);
        if (saved) {
          const pos = parseFloat(saved);
          if (pos > 0 && pos < dur - 5) {
            audio.currentTime = pos;
            setCurrentTime(pos);
          }
        }
      }
    };
    const onTimeUpdate = () => {
      const ct = audio.currentTime || 0;
      setCurrentTime(ct);
      // 每 5 秒保存一次播放位置
      if (currentEpisode?.url && Math.floor(ct) % 5 === 0) {
        localStorage.setItem(`playback_pos_${currentEpisode.url}`, String(ct));
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      // 播放完毕，清除位置记录
      if (currentEpisode?.url) {
        localStorage.removeItem(`playback_pos_${currentEpisode.url}`);
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    // 不强制归零，loadedmetadata 会从 localStorage 恢复上次位置
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    audio.playbackRate = playbackRate;
    audio.src = currentEpisode?.url || "";
    audio.load();
  }, [currentEpisode?.url, playbackRate]);

  const handleFavorite = () => {
    if (!program) return;
    const favorites = new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]") as string[]);
    if (favorites.has(program._id)) {
      favorites.delete(program._id);
      setIsFavorite(false);
    } else {
      favorites.add(program._id);
      setIsFavorite(true);
    }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)));
  };

  const handlePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio || !currentEpisode?.url) return;

    if (audio.paused) {
      try {
        await audio.play();
      } catch (_error) {
        window.open(currentEpisode.url, "_blank", "noopener,noreferrer");
      }
    } else {
      audio.pause();
    }
  };

  const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const progress = progressRef.current;
    if (!audio || !progress || !duration) return;

    const rect = progress.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  };

  const handleSkip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(Math.max(audio.currentTime + seconds, 0), duration || audio.duration || 0);
    setCurrentTime(audio.currentTime);
  };

  const toggleSpeed = () => {
    const next = playbackRate === 1.5 ? 1 : 1.5;
    setPlaybackRate(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  };

  const copyShowNotes = async () => {
    const text = showNotesText.trim();
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  };

  const jumpToSection = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const top = window.scrollY + rect.top - 86;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };

  const jumpToContentView = (mode: "quickview" | "transcript" | "mindmap") => {
    setContentViewMode(mode);
    jumpToSection("content-section");
  };

  /** 脑图点击节点 → 切到逐字稿 + 滚动到对应时间戳 */
  const handleNavigateToTime = (startTime: string) => {
    setContentViewMode("transcript");
    // 等待视图切换 + 渲染完成后滚动到对应时间戳
    setTimeout(() => {
      jumpToSection("content-section");
      // 高亮对应逐字稿段落
      setTimeout(() => {
        const section = document.getElementById("content-section");
        if (!section) return;
        const allTimes = section.querySelectorAll<HTMLElement>('[data-transcript-time]');
        for (const el of allTimes as any as HTMLElement[]) {
          const t = el.getAttribute("data-transcript-time") || "";
          if (t === startTime) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            // 高亮闪烁
            el.style.transition = "background 0.3s";
            el.style.background = "rgba(94,23,235,0.08)";
            setTimeout(() => {
              el.style.background = "";
            }, 2000);
            break;
          }
        }
      }, 150);
    }, 100);
  };

  const handleGenerateMindMap = async () => {
    const adminToken = localStorage.getItem("admin_token");
    if (!adminToken) {
      alert("请先在管理后台登录");
      return;
    }
    if (!program?._id) return;

    setMindMapGenerating(true);
    try {
      const res = await fetch(`/api/admin/programs/${encodeURIComponent(program._id)}/generate-mindmap`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.mindMap) {
        setProgram(prev => prev ? { ...prev, deepDive: { ...(prev.deepDive || {}), mindMap: data.mindMap } } : prev);
      }
    } catch (err: any) {
      alert("生成失败: " + (err.message || "未知错误"));
    } finally {
      setMindMapGenerating(false);
    }
  };

  const progressRatio = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
  const rawHeroImage = program?.coverImage || COVER_FALLBACK;
  const heroImage = rawHeroImage.replace(/\.png$/i, '.webp');
  const episodeDuration = currentEpisode?.duration || "45 分钟";
  const displayDate = formatDate(program?.publishedAt || program?.createdAt);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#fdfbf9] text-sm text-[#53433f]">正在加载节目详情...</div>;
  }

  if (error || !program) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fdfbf9] p-6">
        <div className="rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <p className="mb-4 text-base font-bold text-stone-800">{error || "节目不存在"}</p>
          <Link className="inline-flex rounded-full bg-[#5e17eb] px-6 py-3 text-sm font-bold text-white" to="/programs">
            返回节目列表
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdfbf9] font-['Noto_Sans_SC','Plus_Jakarta_Sans',sans-serif] text-[#211a18] antialiased">
      <style>{`
        .duotone-hero {
          position: relative;
          overflow: hidden;
          height: 500px;
          background-color: #5e17eb;
        }
        .duotone-hero::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image: url("${heroImage}");
          background-size: cover;
          background-position: center 20%;
          filter: grayscale(100%) contrast(120%) brightness(80%);
          mix-blend-mode: multiply;
          opacity: 0.6;
        }
        .duotone-hero::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, transparent 0%, #000000 100%);
          opacity: 0.7;
        }
        .capsule-player {
          background: rgba(255, 255, 255, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.1), inset 0 0 20px rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(64px) saturate(200%);
          -webkit-backdrop-filter: blur(64px) saturate(200%);
        }
        .sidebar-episode-num {
          font-family: "JetBrains Mono", monospace;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #5e17eb;
        }
      `}</style>

      <GlobalPublicNav />
      <audio ref={audioRef} preload="metadata" />

      <section className="duotone-hero flex w-full items-center pt-16">
        <div className="relative z-10 mx-auto w-full max-w-7xl px-6 text-white">
          <div className="flex flex-col items-center gap-12 md:flex-row">
            <div className="hidden h-64 w-64 flex-shrink-0 overflow-hidden rounded-2xl border-2 border-white/20 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] md:block">
              <img alt="播客封面" className="h-full w-full object-cover" src={heroImage} />
            </div>
            <div className="flex-1">
              <div className="mb-6 flex items-center gap-3">
                <span className="text-sm font-medium text-white/70">{episodeDuration} • {displayDate} 发布</span>
              </div>
              <h1 className="mb-6 text-4xl font-black leading-[1.15] tracking-tight md:text-6xl">{program.title}</h1>
              <p className="mb-10 max-w-3xl text-lg leading-relaxed text-white/80">{program.description}</p>
              <div className="flex gap-4">
                <button className="flex items-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-black text-[#5e17eb] shadow-xl transition-transform hover:scale-105" onClick={handlePlayPause}>
                  <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {isPlaying ? "pause" : "play_arrow"}
                  </span>
                  {isPlaying ? "暂停收听" : "立即收听"}
                </button>
                <button className="rounded-full border border-white/20 bg-white/10 px-8 py-4 text-sm font-black text-white backdrop-blur-md transition-all hover:bg-white/20" onClick={handleFavorite}>
                  {isFavorite ? "已收藏节目" : "收藏节目"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-20 mx-auto -mt-16 max-w-7xl px-6">
        <section className="relative overflow-hidden rounded-xl border border-[#5e17eb]/10 bg-white p-12 shadow-2xl md:p-14">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 h-32 w-32 rounded-full bg-[#5e17eb]/5"></div>
          <div className="relative z-10 flex flex-col items-center gap-10 md:flex-row">
            <div className="flex flex-shrink-0 flex-row items-center gap-3 border-b border-gray-100 pb-6 md:flex-col md:border-r md:border-b-0 md:pb-0 md:pr-10">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#5e17eb]/10 text-[#5e17eb]">
                <span className="material-symbols-outlined text-2xl text-[#5e17eb]">auto_awesome</span>
              </div>
              <div className="text-center md:text-left">
                <h2 className="text-xl font-black uppercase leading-none tracking-tight text-[#5e17eb] md:text-[1.44rem]">总结摘要</h2>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">AI Overview</p>
              </div>
            </div>
            <div className="flex-1">
              <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
                <div className="flex flex-col justify-center">
                  <h3 className="mb-3 flex items-center gap-2 text-base font-black text-[#211a18] md:text-[1.32rem]">
                    <span className="h-4 w-1.5 rounded-full bg-[#5e17eb]"></span>
                    {summaryHeadline}
                  </h3>
                  <p className="text-sm leading-relaxed text-[#53433f] md:text-[15px]">{summaryBody}</p>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex-1 rounded-xl border border-[#5e17eb]/10 bg-[#5e17eb]/5 p-5">
                    <p className="text-sm leading-normal text-[#211a18]">
                      <span className="font-black text-[#5e17eb]">{summaryHighlightLabel}：</span>
                      {summaryHighlightText}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(summaryTags.length > 0 ? summaryTags : ["神经可塑性", "环境心理学"]).map((tag) => (
                      <span key={tag} className="whitespace-nowrap rounded-full bg-gray-100 px-3 py-1 text-[10px] font-bold text-gray-500">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="mt-6 bg-transparent">
          <div className="flex flex-col gap-3">
            <div className="inline-flex w-fit items-center overflow-hidden rounded-full border border-stone-200 bg-[#fafafa] p-1 shadow-[inset_0_0_0_1px_rgba(17,10,8,0.03)]">
              {[
                { key: "quickview", label: "速览", icon: "view_timeline" },
                { key: "transcript", label: "逐字稿", icon: "description" },
                { key: "mindmap", label: "脉络图", icon: "account_tree" },
              ].map((item) => {
                const isActive = contentViewMode === item.key;
                return (
                  <button
                    key={item.key}
                    className={`min-w-[96px] rounded-full px-7 py-2.5 text-xl font-medium tracking-normal transition-colors ${
                      isActive ? "bg-[#5e17eb] text-white shadow-[0_10px_24px_rgba(94,23,235,0.22)]" : "text-[#211a18]/70 hover:text-[#5e17eb]"
                    }`}
                    onClick={() => jumpToContentView(item.key as "quickview" | "transcript" | "mindmap")}
                    type="button"
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <main className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-8 px-6 py-16 lg:grid-cols-12">
        <div className="space-y-16 lg:col-span-8">
          <section id="content-section" className="rounded-xl border border-gray-100 bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] md:p-12">
            <div className="mb-6 flex items-center gap-3">
              <span className="material-symbols-outlined text-xl text-[#5e17eb]">
                {contentViewMode === "transcript" ? "description" : contentViewMode === "mindmap" ? "account_tree" : "view_timeline"}
              </span>
              <h2 className="text-2xl font-black tracking-tight text-[#211a18]">
                {contentViewMode === "transcript" ? "逐字稿" : contentViewMode === "mindmap" ? "脉络图" : "速览"}
              </h2>
            </div>

            {contentViewMode === "mindmap" ? (
              <MindMapView
                quickView={quickView}
                title={program.title}
                onNavigateToTime={handleNavigateToTime}
                mode={(program.deepDive?.mindMap && program.deepDive.mindMap.root && (program.deepDive.mindMap.root.title || (program.deepDive.mindMap.root.children && program.deepDive.mindMap.root.children.length > 0))) ? "ai" : (program.contentPack?.quickView && program.contentPack.quickView.length > 0) ? "quickview" : isAdmin ? "ai" : "quickview"}
                mindMapData={program.deepDive?.mindMap}
                generating={mindMapGenerating}
                onGenerate={isAdmin ? handleGenerateMindMap : undefined}
              />
            ) : null}

            {contentViewMode === "quickview" && quickView.length > 0 ? (
              <div className="space-y-4">
                {quickView.map((item) => (
                  <div key={`${item.timeRangeLabel}-${item.summary.slice(0, 8)}`} className="py-3">
                    <div className="mb-2 text-xs font-black text-[#5e17eb]">{item.timeRangeLabel || `${item.startTime}-${item.endTime}`}</div>
                    <p className="text-sm leading-relaxed text-[#211a18]/85">{item.summary}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {contentViewMode === "quickview" && quickView.length === 0 ? (
              <p className="text-sm text-[#53433f]">暂无速览内容，解析后将自动生成。</p>
            ) : null}

            {contentViewMode === "transcript" && transcriptSegments.length > 0 ? (
              <div className="space-y-4">
                {transcriptSegments.map((segment) => (
                  <div key={`${segment.time}-${segment.speaker}-${segment.text.slice(0, 8)}`} className="py-3" data-transcript-time={segment.time}>
                    <div className="mb-2 text-xs font-black text-[#5e17eb]">{segment.time}</div>
                    {segment.speaker ? <p className="mb-1 text-[11px] font-bold text-[#5e17eb]/70">{speakerDisplay(segment.speaker)}</p> : null}
                    <p className={`text-sm leading-relaxed ${segment.featured ? "font-semibold text-[#211a18]" : "text-[#211a18]/85"}`}>{segment.text}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {contentViewMode === "transcript" && transcriptSegments.length === 0 ? (
              <p className="text-sm text-[#53433f]">暂无逐字稿内容，解析后将自动生成。</p>
            ) : null}
          </section>
        </div>

        <aside className="space-y-10 lg:col-span-4">
          <section className="rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm">
            <div className="relative mb-6 inline-block">
              <img alt="专家头像" className="h-32 w-32 rounded-2xl object-cover ring-8 ring-[#5e17eb]/5" src={guestAvatar} />
              <div className="absolute -right-2 -bottom-2 rounded-lg bg-[#5e17eb] p-1.5 text-white shadow-lg">
                <span className="material-symbols-outlined text-sm">verified</span>
              </div>
            </div>
            <h3 className="mb-1 text-2xl font-black text-[#211a18]">{guestName}</h3>
            <p className="mb-6 text-[10px] font-black uppercase tracking-widest text-[#5e17eb]">{guestTitle}</p>
            <p className="mb-8 text-sm leading-relaxed text-[#53433f]/70">{guestBio}</p>
            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5e17eb] py-4 text-xs font-black text-white shadow-lg shadow-[#5e17eb]/20 transition-all hover:opacity-90"
              onClick={() => {
                if (guest?.profileUrl) {
                  window.open(guest.profileUrl, "_blank", "noopener,noreferrer");
                }
              }}
            >
              <span className="material-symbols-outlined text-base">person_search</span>
              查看完整学术档案
            </button>
          </section>

          <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="p-8 pb-4">
              <div className="mb-8 flex items-center gap-3">
                <span className="material-symbols-outlined text-xl text-[#5e17eb]">insights</span>
                <h3 className="text-sm font-black uppercase tracking-tight text-[#211a18]">{deepDiveTitle}</h3>
              </div>
              <div className="mb-10">
                <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-gray-400">推荐阅读 Curated Reading</p>
                <div className="space-y-4">
                  {curatedReading.map((item) => (
                    <div
                      key={`${item.title}-${item.subtitle || ""}`}
                      className={`group ${item.url ? "cursor-pointer" : ""}`}
                      onClick={() => {
                        if (item.url) {
                          window.open(item.url, "_blank", "noopener,noreferrer");
                        }
                      }}
                    >
                      <h4 className="text-xs font-bold leading-snug text-[#211a18] transition-colors group-hover:text-[#5e17eb]">{item.title}</h4>
                      <p className="mt-1 text-[10px] text-gray-400">{item.subtitle || "围绕节目主题延展出的实用阅读线索"}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mb-8 h-px w-full bg-gray-100"></div>
              <div>
                <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-gray-400">相关内容推荐 Related Content</p>
                <div className="space-y-6">
                  {(relatedPrograms.length > 0 ? relatedPrograms : programs.slice(0, 4)).map((item, index) => (
                    <Link key={item._id} className="group block cursor-pointer border-b border-gray-50 pb-6 last:border-0" to={`/programs/${item._id}`}>
                      <h4 className="mb-2 text-[13px] font-bold leading-tight text-[#211a18] transition-colors group-hover:text-[#5e17eb]">{item.title}</h4>
                      <p className="line-clamp-2 text-[11px] leading-relaxed text-[#53433f]/70">{item.description}</p>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 bg-gray-50 p-6">
              <Link className="flex w-full items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#5e17eb] hover:underline" to="/programs">
                查看全部节目库
                <span className="material-symbols-outlined text-xs">arrow_forward</span>
              </Link>
            </div>
          </section>
        </aside>
      </main>

      <div className="fixed bottom-6 left-1/2 z-[100] w-[calc(100%-48px)] max-w-5xl -translate-x-1/2">
        <div className="capsule-player flex items-center justify-between rounded-full px-8 py-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-full border border-white/40 shadow-xl">
              <img alt="Now Playing" className="h-full w-full object-cover" src={heroImage} />
            </div>
            <div className="min-w-0 pr-4">
              <h4 className="truncate text-[13px] font-black leading-tight text-[#211a18]">{program.title}</h4>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-6 px-4">
            <button className="text-[#211a18]/40 transition-colors hover:text-[#5e17eb]" onClick={() => handleSkip(-10)}>
              <span className="material-symbols-outlined text-xl">replay_10</span>
            </button>
            <button className="flex h-12 w-12 items-center justify-center rounded-full bg-[#5e17eb] text-white shadow-lg shadow-[#5e17eb]/30 transition-all hover:scale-105 active:scale-95" onClick={handlePlayPause}>
              <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                {isPlaying ? "pause" : "play_arrow"}
              </span>
            </button>
            <button className="text-[#211a18]/40 transition-colors hover:text-[#5e17eb]" onClick={() => handleSkip(30)}>
              <span className="material-symbols-outlined text-xl">forward_30</span>
            </button>
          </div>
          <div className="flex flex-1 items-center justify-end gap-6">
            <div className="hidden w-44 items-center gap-3 md:flex">
              <span className="font-mono text-[9px] font-bold text-[#211a18]/40">{formatClock(currentTime)}</span>
              <div ref={progressRef} className="relative h-1 flex-1 cursor-pointer overflow-hidden rounded-full bg-black/10" onClick={handleSeek}>
                <div className="absolute h-full w-full bg-[#5e17eb]/20"></div>
                <div className="absolute h-full rounded-full bg-[#5e17eb]" style={{ width: `${progressRatio}%` }}></div>
              </div>
              <span className="font-mono text-[9px] font-bold text-[#211a18]/40">{formatClock(duration)}</span>
            </div>
            <div className="flex items-center gap-3">
              <button className="rounded-full border border-white/20 bg-white/30 px-3 py-1 text-[9px] font-black text-[#211a18] shadow-sm transition-all hover:bg-white/50" onClick={toggleSpeed}>
                {playbackRate.toFixed(1)}x
              </button>
              <button className="text-[#211a18]/60 transition-colors hover:text-[#5e17eb]" onClick={handlePlayPause}>
                <span className="material-symbols-outlined text-xl">volume_up</span>
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default ProgramDetailPage;
