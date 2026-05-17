import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import GlobalPublicNav from "../components/GlobalPublicNav";

interface TopicItem {
  id: number;
  _id?: string;
  slug: string;
  title: string;
  subtitle: string;
  coverEmoji: string;
  tags: string[] | string;
  nodeCount: number;
  questionCount: number;
  viewCount: number;
  status?: string;
  createdBy?: string;
  generatingProgress?: { total: number; done: number; status: string };
}

function safeTags(raw: string[] | string | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/* ===== 通用样式 ===== */
const inputStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "2px solid #DDD6FE",
  fontSize: 14,
  outline: "none",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 24px",
  borderRadius: 10,
  border: "none",
  background: "#7C3AED",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const TopicHubPage: React.FC = () => {
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState("全部");
  const [allTags, setAllTags] = useState<string[]>([]);

  // ===== 话题提交 =====
  const [submitSearch, setSubmitSearch] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>(""); // 当前用户标识
  const [topicGenedTokens, setTopicGenedTokens] = useState<Set<string>>(new Set()); // 已确认生成提示
  const [progressPolling, setProgressPolling] = useState<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // 加载已确认生成提示的话题
    try {
      const genedSlugs: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("xianfeng_topic_gen_hint_")) genedSlugs.push(k.slice("xianfeng_topic_gen_hint_".length));
      }
      setTopicGenedTokens(new Set(genedSlugs));
    } catch (_) {}
    fetchTopics();
  }, []);

  const fetchTopics = useCallback(async () => {
    try {
      const res = await fetch("/api/topic-hub");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rawTopics: TopicItem[] = Array.isArray(data.topics) ? data.topics : [];
      const cleaned = rawTopics.map((t) => ({
        ...t,
        tags: safeTags(t.tags),
        nodeCount: t.nodeCount ?? 0,
        questionCount: t.questionCount ?? 0,
        viewCount: t.viewCount ?? 0,
      }));
      setTopics(cleaned);

      const tagSet = new Set<string>();
      cleaned.forEach((t) => (t.tags as string[]).forEach((tag) => tagSet.add(tag)));
      setAllTags(["全部", ...Array.from(tagSet)]);
    } catch (e: any) {
      console.error("Failed to load topics", e);
      setError(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  // 获取或生成 userId
  const getUserId = (): string => {
    const key = "xianfeng_topic_userId";
    let uid = localStorage.getItem(key);
    if (!uid) {
      uid = "user_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(key, uid);
    }
    setCurrentUserId(uid);
    return uid;
  };

  // 轮询进度
  const pollProgress = (slug: string) => {
    if (progressPolling) clearInterval(progressPolling);
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/topic-hub/${slug}/progress`);
        const data = await res.json();
        // 更新列表中对应话题的进度
        setTopics((prev) =>
          prev.map((t) =>
            t.slug === slug
              ? { ...t, generatingProgress: data.progress }
              : t
          )
        );
        if (data.progress?.status === "done" || data.progress?.status === "error") {
          clearInterval(interval);
          setProgressPolling(null);
        }
      } catch (_) {}
    }, 1500);
    setProgressPolling(interval);
  };

  const handleSubmit = async () => {
    const q = submitSearch.trim();
    if (!q) return;
    setSubmitLoading(true);
    setSubmitMsg(null);
    const uid = getUserId();
    try {
      const res = await fetch("/api/topic-hub/search-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: q, userId: uid }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitMsg({ text: "✨ 话题已创建，AI 正在为你生成知识树…", type: "success" });
        setSubmitSearch("");
        // 刷新列表并开始轮询进度
        await fetchTopics();
        if (data.topic?.slug) pollProgress(data.topic.slug);
      } else {
        setSubmitMsg({ text: data.error || "提交失败", type: "error" });
      }
    } catch (e: any) {
      setSubmitMsg({ text: e.message || "网络错误", type: "error" });
    } finally {
      setSubmitLoading(false);
    }
  };

  // 删除自己的话题
  const handleDeleteTopic = async (e: React.MouseEvent, topic: TopicItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`确定删除「${topic.title}」？`)) return;
    try {
      const res = await fetch(`/api/topic-hub/${topic.slug}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId }),
      });
      if (res.ok) {
        setSubmitMsg({ text: "🗑 已删除", type: "success" });
        fetchTopics();
      }
    } catch (e: any) {
      setSubmitMsg({ text: e.message, type: "error" });
    }
  };

  // 点击话题卡片（带进度检查）
  const handleTopicClick = (e: React.MouseEvent, topic: TopicItem) => {
    const prog = topic.generatingProgress;
    if (prog && prog.status !== "done" && prog.status !== "error") {
      e.preventDefault();
      alert("正在解析当前问题，请稍等片刻");
      return;
    }
    // 标记为已查看（进度条消失）
    if (prog && prog.status === "done") {
      const key = `xianfeng_topic_viewed_${topic.slug}`;
      localStorage.setItem(key, "1");
    }
  };

  // 清理轮询
  React.useEffect(() => {
    return () => {
      if (progressPolling) clearInterval(progressPolling);
    };
  }, [progressPolling]);

  const filteredTopics =
    activeTag === "全部"
      ? topics
      : topics.filter((t) => (t.tags as string[]).includes(activeTag));

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8f6ff" }}>
        <GlobalPublicNav showPlanningEntry={true} />
        <div style={{ textAlign: "center", padding: 100 }}>
          <p style={{ color: "#EF4444", marginBottom: 8 }}>加载失败: {error}</p>
          <button
            onClick={() => { setError(null); setLoading(true); fetchTopics(); }}
            style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: "#7C3AED", color: "#fff", cursor: "pointer", fontSize: 14 }}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <style>{`
      @keyframes topicCursorBreathe {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.2; }
      }
    `}</style>
    <div style={{ minHeight: "100vh", background: "#f8f6ff" }}>
      <GlobalPublicNav showPlanningEntry={true} />

      {/* ===== Hero 区域（与知物同款设计） ===== */}
      <main className="mx-auto max-w-7xl px-4 pt-[76px] pb-2 sm:px-6 lg:px-8">
        <section
          className="overflow-hidden rounded-[2rem] border border-[#d8d0ef] p-7 shadow-[0_24px_80px_rgba(80,62,125,0.1)] sm:p-9"
          style={{
            background:
              "radial-gradient(circle at 85% 15%, rgba(143,100,255,0.1), transparent 38%), linear-gradient(135deg, #f4f1fd 0%, #faf8ff 48%, #f0ebff 100%)",
          }}
        >
          <div className="max-w-3xl mx-auto text-center">
            <div
              style={{
                display: "inline-flex",
                borderRadius: 9999,
                border: "1px solid #cfc2ef",
                background: "#f3eefc",
                padding: "4px 16px",
                fontSize: 11,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.26em",
                color: "#5b3fa1",
              }}
            >
              Ask & Learn
            </div>
            <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-[#2b1a3a] sm:text-5xl">
              请教一下
            </h1>
            <p style={{ color: "#6f62a3", fontSize: 14, margin: "0 0 20px", lineHeight: 1.7 }}>
              教育路上，每个问题都值得被认真回答
            </p>
          </div>

          {/* 输入区 */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <label className="flex h-12 flex-1 items-center gap-2 rounded-2xl border border-[#d8d0ef] bg-white px-4 shadow-sm">
              <span className="material-symbols-outlined text-[#8f7bd6]">search</span>
              <input
                type="text"
                value={submitSearch}
                onChange={(e) => setSubmitSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
                placeholder="输入你想了解的教育话题…"
                disabled={submitLoading}
                className="materials-search-input w-full border-0 bg-transparent text-sm outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                style={{ fontSize: 14, color: "#1E1B4B" }}
              />
            </label>
            <button
              onClick={handleSubmit}
              disabled={submitLoading || !submitSearch.trim()}
              className="inline-flex h-12 items-center justify-center rounded-2xl px-6 text-sm font-bold !text-white transition disabled:opacity-50"
              style={{
                background: submitLoading || !submitSearch.trim()
                  ? "#D1D5DB"
                  : "linear-gradient(135deg, #7C3AED, #A855F7)",
                border: "none",
                cursor: submitLoading || !submitSearch.trim() ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {submitLoading ? (
                <>
                  <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-[2px] border-white border-t-transparent" />
                  生成中…
                </>
              ) : (
                "🙏 请教一下"
              )}
            </button>
          </div>
          {submitMsg && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                borderRadius: 10,
                fontSize: 13,
                background: submitMsg.type === "success" ? "#F0FDF4" : "#FEF2F2",
                color: submitMsg.type === "success" ? "#166534" : "#DC2626",
                border: `1px solid ${submitMsg.type === "success" ? "#D1FAE5" : "#FECACA"}`,
              }}
            >
              {submitMsg.text}
            </div>
          )}
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "8px 0 0 0", textAlign: "center" }}>
            提交后即刻上架，AI 将自动为你生成知识树 ✨
          </p>
        </section>
      </main>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 20px" }}>
        {allTags.length > 1 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap", justifyContent: "center" }}>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                style={{
                  padding: "6px 16px",
                  borderRadius: 20,
                  border: "none",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  background: activeTag === tag ? "#7C3AED" : "#EDE9FE",
                  color: activeTag === tag ? "#fff" : "#5B21B6",
                  transition: "all 0.2s",
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 16, padding: 24, height: 190 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: "#E5E7EB" }} />
                <div style={{ height: 20, width: "65%", background: "#E5E7EB", borderRadius: 6, marginTop: 14 }} />
                <div style={{ height: 14, width: "85%", background: "#E5E7EB", borderRadius: 6, marginTop: 8 }} />
              </div>
            ))}
          </div>
        ) : filteredTopics.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#9CA3AF" }}>
            暂无相关话题
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
            {filteredTopics.map((topic) => {
              const prog = topic.generatingProgress;
              const isProcessing = prog && prog.status !== "done" && prog.status !== "error";
              const progPercent = prog && prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
              const isOwn = currentUserId && topic.createdBy === currentUserId;
              const viewedKey = `xianfeng_topic_viewed_${topic.slug}`;
              const hasViewed = !!localStorage.getItem(viewedKey);
              return (
              <div key={topic.id || topic._id} style={{ position: "relative" }}>
                <Link
                  to={`/topics/${topic.slug}`}
                  style={{ textDecoration: "none" }}
                  onClick={(e) => handleTopicClick(e, topic)}
                >
                <div
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    padding: 24,
                    cursor: isProcessing ? "default" : "pointer",
                    border: "1px solid #F3F0FF",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                    transition: "all 0.2s ease",
                    opacity: isProcessing ? 0.7 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isProcessing) {
                      e.currentTarget.style.transform = "translateY(-4px)";
                      e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.10)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isProcessing) {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)";
                    }
                  }}
                >
                  <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 12 }}>
                    {topic.coverEmoji || "📚"}
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1E1B4B", margin: "0 0 6px" }}>
                    {topic.title}
                  </h3>
                  <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 12px", lineHeight: 1.5 }}>
                    {topic.subtitle}
                  </p>

                  {/* 进度条 - 紧凑版 */}
                  {prog && prog.status !== "error" && prog.status !== "done" && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          flex: 1, height: 4, borderRadius: 2,
                          background: "#EDE9FE", overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%", width: `${progPercent}%`,
                            borderRadius: 2,
                            background: "linear-gradient(90deg, #A78BFA, #7C3AED)",
                            transition: "width 0.8s ease",
                          }} />
                        </div>
                        <span style={{ fontSize: 10, color: "#9CA3AF", whiteSpace: "nowrap" }}>
                          {progPercent}%
                        </span>
                      </div>
                    </div>
                  )}
                  {prog && prog.status === "done" && !hasViewed && (
                    <div style={{ fontSize: 10, color: "#10B981", fontWeight: 600, marginBottom: 4 }}>✅ 已完成</div>
                  )}

                  {safeTags(topic.tags).length > 0 && prog?.status !== "pending" && prog?.status !== "generating" && (
                    <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                      {safeTags(topic.tags).slice(0, 3).map((tag) => (
                        <span key={tag} style={{
                          fontSize: 11, padding: "2px 10px", borderRadius: 10,
                          background: "#F3EEFF", color: "#7C3AED", fontWeight: 500,
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{
                    display: "flex", gap: 16, fontSize: 12, color: "#9CA3AF",
                    borderTop: "1px solid #F3F0FF", paddingTop: 12, alignItems: "center",
                  }}>
                    <span>🌿 {topic.nodeCount} 节点</span>
                    <span>💬 {topic.questionCount} 提问</span>
                    <span>👁 {topic.viewCount}</span>
                    <span style={{ flex: 1 }} />
                    {/* 已生成提示 - 点击后消失 */}
                    {topicGenedTokens.has(topic.slug) ? null : (
                      <span
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const key = `xianfeng_topic_gen_hint_${topic.slug}`;
                          localStorage.setItem(key, "1");
                          setTopicGenedTokens(new Set([...topicGenedTokens, topic.slug]));
                        }}
                        title="点击确认已查看"
                        style={{
                          cursor: "pointer",
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#7C3AED",
                          background: "#EDE9FE",
                          borderRadius: 6,
                          padding: "2px 8px",
                        }}
                      >
                        ✨ AI已生成
                      </span>
                    )}
                  </div>
                </div>
              </Link>

              {/* 删除按钮（仅自己提交的话题 hover 显示） */}
              {isOwn && (
                <button
                  onClick={(e) => handleDeleteTopic(e, topic)}
                  title="删除这个话题"
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(239, 68, 68, 0.85)",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: 0,
                    transition: "opacity 0.2s",
                    zIndex: 2,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0"; }}
                  onMouseOver={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseOut={(e) => { e.currentTarget.style.opacity = "0"; }}
                >
                  ×
                </button>
              )}
            </div>
            );
            })}
          </div>
        )}
      </div>
    </div>
    </>
  );
};

export default TopicHubPage;
