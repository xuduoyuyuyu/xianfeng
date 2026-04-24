import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PodcastDetailFooter, PodcastDetailNav } from "../components/PodcastChrome";
import { CuratedReadingItem, Program, TranscriptSegment, publicApi } from "../services/api";

const COVER_FALLBACK =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuClCE9ekp3PPlQ8bcuZWinqGC_qfQf-TKqkEU8KY505YX7B7t4LSQZSAud82EAcnQ8DU6U5dhENuVIt1u7xMcWmrZYt96CrE3wPdvJEEU8D3QwFomwrExRMSX6sn5vIqZOzxsqYGyiAi4xd4dwF-CkAJ47nVOn-LcN0fX9B-jWTgrnx0RbS53aK04x_ceztbkSlZgTUPwIzjIPJCVkPhCLys2-E8Qn1x4fWfefog2RPPewNrTiiV3AL5R1IUaHBKVtTtXzyAoAD9KpW";
const EXPERT_AVATAR =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBYXSSErHZG11IcSo5OCvCfuNClbWSgoOjLKRr3VExHhqUYe3TZZAIlEd2h04hDeVmQZVZmre1ppd18lTl7J4SkUY-Hfms9BNXnjEHC9huaslhbDjP-J_QsGuVXXHDi6-O8y3NnNjr3Bbm6C11Bae7EjQBmcsJQbpfKySZiB-eylKQXP_ULjKiGt9uZnXyYQHavo7d24ilHYNjhixYb0npTRCWv-EeMoSBmYX__zjzgxt3HaOqbW7BoTToksZ7T4q14vwNxYlTzBy9O";
const FAVORITES_KEY = "favorite-programs";

function buildDemoPrograms(seedId: string): Program[] {
  const now = new Date().toISOString();
  const primaryId = seedId || "42";
  return [
    {
      _id: primaryId,
      title: "深度倾听：如何与正处于叛逆期的幼儿建立情感锚点",
      description: "探讨如何通过积极的存在将日常互动转化为深层的情感纽带，应对幼儿成长过程中的心理挑战。",
      coverImage: "/assets/podcast-cover-1.svg",
      episodes: [
        {
          title: "EP.01 正向沟通",
          duration: "45 分钟",
          url: "",
        },
      ],
      summary: {
        headline: "感官环境的神经学重塑",
        body: "物理空间对儿童神经发育具有深远影响。通过优化室内光线与色彩，可以显著降低发育期应激反应并提升专注力。",
        highlightLabel: "低摩擦环境",
        highlightText: "减少视觉和听觉干扰的空间，引导进入更稳定的情绪状态，并为未来深度学习奠定基础。",
        tags: ["神经可塑性", "环境心理学"],
      },
      transcript: [
        {
          time: "00:00",
          speaker: "主持人",
          text: "欢迎回到《家长先疯》。今天我们一起讨论家长最关心的成长问题。",
        },
        {
          time: "02:45",
          speaker: "嘉宾",
          text: "从环境与互动节奏入手，往往比单纯纠正行为更有效。",
          featured: true,
        },
        {
          time: "04:12",
          speaker: "主持人",
          text: "把这些观察带回家庭日常，先从低摩擦沟通开始。",
        },
      ],
      guest: {
        name: "节目特邀嘉宾",
        title: "教育与成长观察者",
        bio: "围绕家庭关系、成长节奏与学习环境，提炼节目中的关键视角，帮助家长把内容真正带回到日常生活里。",
        avatar: EXPERT_AVATAR,
      },
      deepDive: {
        sectionTitle: "深度挖掘 Deep Dive",
        curatedReading: [
          {
            title: "《家庭教育中的低摩擦沟通》",
            subtitle: "围绕节目主题延展出的实用阅读线索",
          },
        ],
      },
      status: "published",
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: "demo-related-1",
      title: "IB课程导航：全球化教育背景下家长的选择指南",
      description: "揭秘国际文凭组织(IB)的课程体系，帮助家长做出更清晰的教育选择。",
      coverImage: "/assets/podcast-cover-2.svg",
      episodes: [
        {
          title: "EP.02 课程拆解",
          duration: "38 分钟",
          url: "",
        },
      ],
      status: "published",
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function isMongoId(value: string): boolean {
  return /^[a-f0-9]{24}$/i.test(value);
}

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
      speaker: "主持人",
      text: `欢迎回到《家长先疯》。今天我们围绕「${program.title}」展开，对话从 ${titleLead} 开始，聚焦家长真正关心的成长问题。`,
    },
    {
      time: "02:45",
      speaker: "嘉宾",
      text: description,
      featured: true,
    },
    {
      time: "04:12",
      speaker: "主持人",
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
  const { id = "" } = useParams();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const [programs, setPrograms] = useState<Program[]>([]);
  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [contentViewMode, setContentViewMode] = useState<"quickview" | "transcript">("quickview");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.5);

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

      try {
        const listResponse = await publicApi.getPrograms();
        const list = listResponse.data || [];
        if (!active) return;
        setPrograms(list);

        let target = list.find((item) => item._id === id) || null;
        if (!target && isMongoId(id)) {
          try {
            const detailResponse = await publicApi.getProgram(id);
            target = detailResponse.data;
          } catch (_error) {
            target = null;
          }
        }

        if (!target) {
          target = list[0] || null;
        }

        if (!target) {
          throw new Error("暂时没有可展示的已发布节目");
        }

        if (active) {
          setProgram(target);
        }
      } catch (loadError: any) {
        if (active) {
          const demoPrograms = buildDemoPrograms(id);
          setPrograms(demoPrograms);
          setProgram(demoPrograms[0]);
          setError(null);
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
  }, [id]);

  useEffect(() => {
    if (!program) return;
    const favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]") as string[];
    setIsFavorite(favorites.includes(program._id));
  }, [program]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);

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
    audio.currentTime = 0;
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

  const jumpToContentView = (mode: "quickview" | "transcript") => {
    setContentViewMode(mode);
    const sectionId = mode === "quickview" ? "quickview-section" : "transcript-section";
    jumpToSection(sectionId);
  };

  const progressRatio = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
  const heroImage = program?.coverImage || COVER_FALLBACK;
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

      <PodcastDetailNav />
      <audio ref={audioRef} preload="metadata" />

      <section className="duotone-hero flex w-full items-center pt-16">
        <div className="relative z-10 mx-auto w-full max-w-7xl px-6 text-white">
          <div className="flex flex-col items-center gap-12 md:flex-row">
            <div className="hidden h-64 w-64 flex-shrink-0 overflow-hidden rounded-2xl border-2 border-white/20 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] md:block">
              <img alt="播客封面" className="h-full w-full object-cover" src={heroImage} />
            </div>
            <div className="flex-1">
              <div className="mb-6 flex items-center gap-3">
                <span className="rounded bg-[#5e17eb] px-4 py-1 text-[11px] font-black tracking-[0.2em] text-white">EPISODE {String(programs.findIndex((item) => item._id === program._id) + 1 || 1).padStart(2, "0")}</span>
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
                <span className="material-symbols-outlined text-2xl">auto_awesome</span>
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
                { key: "quickview", label: "速览" },
                { key: "transcript", label: "逐字稿" },
              ].map((item) => {
                const isActive = contentViewMode === item.key;
                return (
                  <button
                    key={item.key}
                    className={`min-w-[96px] rounded-full px-7 py-2.5 text-xl font-medium tracking-normal transition-colors ${
                      isActive ? "bg-[#5e17eb] text-white shadow-[0_10px_24px_rgba(94,23,235,0.22)]" : "text-[#211a18]/70 hover:text-[#5e17eb]"
                    }`}
                    onClick={() => jumpToContentView(item.key as "quickview" | "transcript")}
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

      <main className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-12 px-6 py-16 lg:grid-cols-12">
        <div className="space-y-16 lg:col-span-8">
          <section id="quickview-section" className="rounded-xl border border-gray-100 bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] md:p-12">
            <div className="mb-6 flex items-center gap-3">
              <span className="material-symbols-outlined text-xl text-[#5e17eb]">view_timeline</span>
              <h2 className="text-2xl font-black tracking-tight text-[#211a18]">速览</h2>
            </div>
            {quickView.length > 0 ? (
              <div className="space-y-4">
                {quickView.map((item) => (
                  <div key={`${item.timeRangeLabel}-${item.summary.slice(0, 8)}`} className="py-3">
                    <div className="mb-2 text-xs font-black text-[#5e17eb]">{item.timeRangeLabel || `${item.startTime}-${item.endTime}`}</div>
                    <p className="text-sm leading-relaxed text-[#211a18]/85">{item.summary}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#53433f]">暂无速览内容，解析后将自动生成。</p>
            )}
          </section>

          <section id="shownotes-section" className="rounded-xl border border-gray-100 bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] md:p-12">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-xl text-[#5e17eb]">description</span>
                <h2 className="text-2xl font-black tracking-tight text-[#211a18]">Show Notes</h2>
              </div>
              <button className="rounded-full border border-[#5e17eb]/20 bg-[#5e17eb]/5 px-4 py-2 text-xs font-bold text-[#5e17eb] hover:bg-[#5e17eb]/10" onClick={copyShowNotes}>
                一键复制
              </button>
            </div>
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs leading-relaxed text-[#211a18]">{showNotesText || "暂无 Show Notes 内容。"}</pre>
          </section>

          <section id="transcript-section" className="rounded-xl border border-gray-100 bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] md:p-12">
            <div className="mb-6 flex items-center gap-3">
              <span className="material-symbols-outlined text-xl text-[#5e17eb]">description</span>
              <h2 className="text-2xl font-black tracking-tight text-[#211a18]">逐字稿</h2>
            </div>
            {transcriptSegments.length > 0 ? (
              <div className="space-y-4">
                {transcriptSegments.map((segment) => (
                  <div key={`${segment.time}-${segment.speaker}-${segment.text.slice(0, 8)}`} className="py-3">
                    <div className="mb-2 text-xs font-black text-[#5e17eb]">{segment.time}</div>
                    {segment.speaker ? <p className="mb-1 text-[11px] font-bold text-[#5e17eb]/70">{segment.speaker}</p> : null}
                    <p className={`text-sm leading-relaxed ${segment.featured ? "font-semibold text-[#211a18]" : "text-[#211a18]/85"}`}>{segment.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#53433f]">暂无逐字稿内容，解析后将自动生成。</p>
            )}
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
                      <span className="sidebar-episode-num mb-1.5 block text-xs">EP. {String(index + 1).padStart(2, "0")}</span>
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
              <div className="mt-0.5 flex items-center gap-2">
                <span className="sidebar-episode-num text-[9px]">{currentEpisode?.title ? "EP. 01" : "EP. --"}</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#53433f] opacity-60">{currentEpisode?.title || "暂无音频"}</span>
              </div>
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

      <PodcastDetailFooter />
    </div>
  );
};

export default ProgramDetailPage;
