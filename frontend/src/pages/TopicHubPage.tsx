import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import GlobalPublicNav from "../components/GlobalPublicNav";
import Pagination from "../components/Pagination";
import type { RootState } from "../store";
import { getTopicUserId } from "../utils/topicUserId";

interface TopicItem {
  id: number;
  _id?: string;
  slug: string;
  title: string;
  subtitle: string;
  coverEmoji: string;
  shortSummary?: string;
  tags: string[] | string;
  suitableGrades?: string[];
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

const TopicHubPage: React.FC = () => {
  // 获取登录用户的孩子年级
  const currentUser = useSelector((state: RootState) => state.user.user);
  const userGrade = currentUser?.childGrade || currentUser?.grade || "";

  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState("全部");
  const [allTags, setAllTags] = useState<string[]>([]);

  // ===== 分页 =====
  const ITEMS_PER_PAGE = 30;
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // ===== 搜索 =====
  const [searchText, setSearchText] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ===== 提交 =====
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ text: string; type: "success" | "error" | "searchResults" | "existingMatch" | "confirmRefine"; slug?: string } | null>(null);
  const [refinedKeyword, setRefinedKeyword] = useState("");
  const [relatedTopics, setRelatedTopics] = useState<TopicItem[]>([]);
  const [validating, setValidating] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [progressPolling, setProgressPolling] = useState<ReturnType<typeof setInterval> | null>(null);

  // 获取 userId：优先用登录用户手机号 > _id > 匿名随机 ID
  const getUserId = (): string => getTopicUserId(currentUser);

  // userId 跟随登录状态变化
  useEffect(() => {
    setCurrentUserId(getUserId());
  }, [currentUser]);

  // 拉取话题列表（支持搜索/分页参数）
  const fetchTopics = useCallback(async (opts?: { search?: string; page?: number }) => {
    try {
      const uid = currentUserId || getUserId();
      const search = opts?.search;
      const pageNum = opts?.page || 1;

      let limit = ITEMS_PER_PAGE;
      if (search) limit = 50;

      let url = `/api/topic-hub?limit=${limit}&userId=${uid}&page=${pageNum}`;
      if (search) url += `&search=${encodeURIComponent(search.trim())}`;
      // 如果有孩子年级信息，传给 API 做适配过滤
      if (userGrade) url += `&grade=${encodeURIComponent(userGrade)}`;
      const res = await fetch(url);
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
      setTotalItems(data.total || cleaned.length);
      setCurrentPage(pageNum);

      // 仅在无搜索时更新标签
      if (!search) {
        const tagSet = new Set<string>();
        cleaned.forEach((t) => (t.tags as string[]).forEach((tag) => tagSet.add(tag)));
        setAllTags(["全部", ...Array.from(tagSet)]);
      }
    } catch (e: any) {
      console.error("Failed to load topics", e);
      setError(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchTopics({});
  }, [fetchTopics]);

  // ===== 实时搜索：300ms 防抖，直接拉取底部列表 =====
  const handleSearchInput = (value: string) => {
    setSearchText(value);
    setSubmitMsg(null);
    setRelatedTopics([]);
    setActiveTag("全部");

    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (!value.trim()) {
      // 清空搜索时恢复全部
      fetchTopics({});
      return;
    }

    searchTimer.current = setTimeout(() => {
      setLoading(true);
      fetchTopics({ search: value.trim() });
    }, 300);
  };

  // ===== 提交前：AI 提炼 → 二次确认 → 校验 → 创建 =====
  const handleSubmit = async (skipSearch = false) => {
    const q = searchText.trim();
    if (!q) return;
    setSubmitMsg(null);
    setRelatedTopics([]);

    // 0. 先 AI 提炼核心问题，给用户二次确认
    setValidating(true);
    try {
      const refineRes = await fetch("/api/topic-hub/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: q }),
      });
      const refineData = await refineRes.json();
      setValidating(false);

      if (refineData.needConfirm && refineData.refined) {
        setRefinedKeyword(refineData.refined);
        setSubmitMsg({
          text: `💡 AI 提炼出您的核心问题，确认后即可提交`,
          type: "confirmRefine",
        });
        return;
      }
      // needConfirm=false：直接可用
      return doSearchAndSubmit(refineData.refined || q, skipSearch);
    } catch {
      setValidating(false);
      // 提炼失败降级：直接用原文
      return doSearchAndSubmit(q, skipSearch);
    }
  };

  // 确认提炼结果后提交
  const handleConfirmRefine = () => {
    const kw = refinedKeyword.trim();
    if (!kw) return;
    setSubmitMsg(null);
    setRefinedKeyword("");
    doSearchAndSubmit(kw, false);
  };

  // 用户修改提炼结果
  const handleEditRefine = () => {
    setSearchText(refinedKeyword);
    setSubmitMsg(null);
    setRefinedKeyword("");
  };

  // 先搜索已有话题，再校验并提交
  const doSearchAndSubmit = async (q: string, skipSearch: boolean) => {
    setSubmitMsg(null);
    setRelatedTopics([]);

    // 0. 先搜索已有话题
    if (!skipSearch) {
      try {
        const searchRes = await fetch(`/api/topic-hub?search=${encodeURIComponent(q)}&limit=5`);
        const searchData = await searchRes.json();
        const hits = Array.isArray(searchData.topics) ? searchData.topics : [];
        if (hits.length > 0) {
          setActiveTag("全部");
          await fetchTopics({ search: q });
          setSubmitMsg({ text: `🔍 找到 ${hits.length} 个相关话题，已为你展示。如果没有你想要的，可以继续提交`, type: "searchResults" });
          return;
        }
      } catch { /* 搜索失败继续创建流程 */ }
    }

    await doSubmit(q);
  };

  // 最终提交
  const doSubmit = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    // 1. AI 校验有效性
    setValidating(true);
    try {
      const vRes = await fetch("/api/topic-hub/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: trimmed }),
      });
      const vData = await vRes.json();
      setValidating(false);

      if (!vData.valid) {
        setSubmitMsg({ text: vData.reason || "请输入有效的话题内容", type: "error" });
        return;
      }
    } catch {
      setValidating(false);
    }

    // 2. 创建话题
    setSubmitLoading(true);
    const uid = currentUserId || getUserId();
    try {
      const res = await fetch("/api/topic-hub/search-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: trimmed, userId: uid }),
      });
      const data = await res.json();
      if (res.ok) {
        const newTopic: TopicItem = {
          ...data.topic,
          tags: safeTags(data.topic.tags),
        };
        if (data.source === "existing") {
          setSubmitMsg({ text: `📌 已有相似话题「${data.topic.title}」`, type: "existingMatch", slug: data.topic.slug });
        } else {
          setSubmitMsg({ text: "✨ 话题已创建，AI 正在为你生成知识树…", type: "success" });
        }
        if (data.relatedTopics?.length) {
          setRelatedTopics(data.relatedTopics.map((t: any) => ({ ...t, tags: safeTags(t.tags) })));
        }
        setSearchText("");
        await fetchTopics({});
        if (newTopic.slug && !newTopic.generatingProgress && (newTopic as any).source !== "existing") {
          pollProgress(newTopic.slug);
        }
      } else {
        setSubmitMsg({ text: data.error || "提交失败", type: "error" });
      }
    } catch (e: any) {
      setSubmitMsg({ text: e.message || "网络错误", type: "error" });
    } finally {
      setSubmitLoading(false);
    }
  };

  // 轮询进度
  const pollProgress = (slug: string) => {
    if (progressPolling) clearInterval(progressPolling);
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/topic-hub/${slug}/progress`);
        const data = await res.json();
        setTopics((prev) =>
          prev.map((t) =>
            t.slug === slug ? { ...t, generatingProgress: data.progress } : t
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

  // ===== 删除话题 =====
  const handleDeleteTopic = async (e: React.MouseEvent, topic: TopicItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`确定删除「${topic.title}」？`)) return;
    try {
      const uid = currentUserId || getUserId();
      const res = await fetch(`/api/topic-hub/${topic.slug}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      });
      if (res.ok) {
        setSubmitMsg({ text: "🗑 已删除", type: "success" });
        fetchTopics({});
      }
    } catch (e: any) {
      setSubmitMsg({ text: e.message, type: "error" });
    }
  };

  // 点击话题卡片
  const handleTopicClick = (e: React.MouseEvent, topic: TopicItem) => {
    const prog = topic.generatingProgress;
    const isProcessing = prog && prog.status !== "done" && prog.status !== "error" && prog.done < prog.total;
    if (isProcessing) {
      e.preventDefault();
      alert("正在解析当前问题，请稍等片刻");
      return;
    }
    if (prog && (prog.status === "done" || (prog.total > 0 && prog.done >= prog.total))) {
      localStorage.setItem(`xianfeng_topic_viewed_${topic.slug}`, "1");
    }
  };

  // 清理
  React.useEffect(() => {
    return () => {
      if (progressPolling) clearInterval(progressPolling);
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [progressPolling]);

  const [tagExpanded, setTagExpanded] = useState(false);

  // 默认展示前4行标签数（约48个），其余折叠
  const MAX_VISIBLE_TAGS = 48;
  const visibleTags = tagExpanded ? allTags : allTags.slice(0, MAX_VISIBLE_TAGS);
  const hasMoreTags = allTags.length > MAX_VISIBLE_TAGS;

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
            onClick={() => { setError(null); setLoading(true); fetchTopics({}); }}
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
      @keyframes slideUpIn {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .topic-card-wrapper:hover .topic-delete-btn {
        opacity: 1 !important;
      }
    `}</style>
    <div style={{ minHeight: "100vh", background: "#f8f6ff" }}>
      <GlobalPublicNav showPlanningEntry={true} />

      {/* ===== Hero 区域 ===== */}
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
                value={searchText}
                onChange={(e) => handleSearchInput(e.target.value)}
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
              onClick={() => handleSubmit()}
              disabled={submitLoading || validating || !searchText.trim()}
              className="inline-flex h-12 items-center justify-center rounded-2xl px-6 text-sm font-bold !text-white transition disabled:opacity-50"
              style={{
                background: submitLoading || validating || !searchText.trim()
                  ? "#D1D5DB"
                  : "linear-gradient(135deg, #7C3AED, #A855F7)",
                border: "none",
                cursor: submitLoading || validating || !searchText.trim() ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {validating ? (
                <>
                  <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-[2px] border-white border-t-transparent" />
                  校验中…
                </>
              ) : submitLoading ? (
                <>
                  <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-[2px] border-white border-t-transparent" />
                  解析中…
                </>
              ) : (
                "🙏 请教一下"
              )}
            </button>
          </div>

          {/* 二次确认：AI 提炼核心问题 */}
          {submitMsg && submitMsg.type === "confirmRefine" && (
            <div
              style={{
                marginTop: 12,
                padding: "14px 16px",
                borderRadius: 12,
                background: "#F3EEFF",
                border: "1px solid #DDD6FE",
              }}
            >
              <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 8px" }}>
                💡 AI 提炼出您的核心问题：
              </p>
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "#fff",
                  border: "1px solid #C4B5FD",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#1E1B4B",
                  marginBottom: 12,
                }}
              >
                {refinedKeyword}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  onClick={handleEditRefine}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 8,
                    border: "1px solid #DDD6FE",
                    background: "#fff",
                    color: "#7C3AED",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ✏️ 修改
                </button>
                <button
                  onClick={handleConfirmRefine}
                  style={{
                    padding: "8px 24px",
                    borderRadius: 8,
                    border: "none",
                    background: "linear-gradient(135deg, #7C3AED, #A855F7)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ✅ 确认提交
                </button>
              </div>
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <button
                  onClick={() => {
                    setSubmitMsg(null);
                    setRefinedKeyword("");
                    doSubmit(searchText.trim());
                  }}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 6,
                    border: "none",
                    background: "transparent",
                    color: "#9CA3AF",
                    fontSize: 12,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  或用原文直接提交
                </button>
              </div>
            </div>
          )}

          {/* 校验/提交消息 */}
          {submitMsg && submitMsg.type !== "confirmRefine" && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                borderRadius: 10,
                fontSize: 13,
                background: submitMsg.type === "success" || submitMsg.type === "existingMatch"
                  ? "#F0FDF4"
                  : submitMsg.type === "error"
                    ? "#FEF2F2"
                    : "#FFF7ED",
                color: submitMsg.type === "success" || submitMsg.type === "existingMatch"
                  ? "#166534"
                  : submitMsg.type === "error"
                    ? "#DC2626"
                    : "#9A3412",
                border: `1px solid ${
                  submitMsg.type === "success" || submitMsg.type === "existingMatch"
                    ? "#D1FAE5"
                    : submitMsg.type === "error"
                      ? "#FECACA"
                      : "#FDEDD3"
                }`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span>{submitMsg.text}</span>
                {submitMsg.type === "searchResults" && (
                  <button
                    onClick={() => {
                      setSubmitMsg(null);
                      doSubmit(searchText.trim());
                    }}
                    disabled={submitLoading || validating}
                    style={{
                      padding: "6px 16px",
                      borderRadius: 8,
                      border: "none",
                      background: "linear-gradient(135deg, #7C3AED, #A855F7)",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: submitLoading || validating ? "not-allowed" : "pointer",
                      opacity: submitLoading || validating ? 0.5 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    不匹配，继续请教 🙏
                  </button>
                )}
                {submitMsg.type === "existingMatch" && submitMsg.slug && (
                  <Link
                    to={`/topics/${submitMsg.slug}`}
                    style={{
                      padding: "6px 16px",
                      borderRadius: 8,
                      background: "linear-gradient(135deg, #7C3AED, #A855F7)",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    👉 查看已有话题
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* 关联话题展示 */}
          {relatedTopics.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 12, color: "#6B7280", fontWeight: 600, marginBottom: 10 }}>
                💡 你可能还想看这些相关话题：
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                {relatedTopics.map((rt) => (
                  <Link
                    key={rt.id || rt._id}
                    to={`/topics/${rt.slug}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "#fff",
                      border: "1px solid #EDE9FE",
                      textDecoration: "none",
                      transition: "box-shadow 0.2s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 12px rgba(124,58,237,0.15)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
                  >
                    <span style={{ fontSize: 20 }}>{rt.coverEmoji || "💡"}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1E1B4B" }}>{rt.title}</div>
                      {rt.subtitle && (
                        <div style={{ fontSize: 11, color: "#9CA3AF" }}>{rt.subtitle}</div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "8px 0 0 0", textAlign: "center" }}>
            提交后即刻上架，AI 将自动为你生成知识树 ✨
          </p>
        </section>
      </main>

      {/* ===== 底部卡片列表（实时筛选 + 标签切换） ===== */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 20px" }}>
        {allTags.length > 1 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {visibleTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    setActiveTag(tag);
                    setCurrentPage(1);
                    // 「全部」重新请求后端（支持分页），其他标签纯前端过滤避免页面跳动
                    if (tag === "全部") {
                      fetchTopics({});
                    }
                  }}
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
            {hasMoreTags && (
              <div style={{ textAlign: "center", marginTop: 10 }}>
                <button
                  onClick={() => setTagExpanded((prev) => !prev)}
                  style={{
                    padding: 0,
                    border: "none",
                    background: "none",
                    color: "#7C3AED",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {tagExpanded ? "收起 ▲" : "展开全部 ▼"}
                </button>
              </div>
            )}
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
            {searchText.trim() ? (
              <>
                <p style={{ marginBottom: 8 }}>未找到相关话题</p>
                <p style={{ fontSize: 13 }}>点击「🙏 请教一下」按钮立即创建 ✨</p>
              </>
            ) : (
              "暂无话题"
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
            {filteredTopics.map((topic) => {
              const prog = topic.generatingProgress;
              const isProcessing = prog && prog.status !== "done" && prog.status !== "error" && prog.done < prog.total;
              const isDone = prog && (prog.status === "done" || (prog.total > 0 && prog.done >= prog.total));
              const progPercent = prog && prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
              const viewedKey = `xianfeng_topic_viewed_${topic.slug}`;
              const hasViewed = !!localStorage.getItem(viewedKey);
              return (
              <div key={topic.id || topic._id} className="topic-card-wrapper" style={{ position: "relative" }}>
                <Link
                  to={`/topics/${topic.slug}`}
                  style={{ textDecoration: "none" }}
                  onClick={(e) => handleTopicClick(e, topic)}
                >
                <div
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    padding: 20,
                    cursor: isProcessing ? "default" : "pointer",
                    border: "1px solid #F3F0FF",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                    transition: "all 0.2s ease",
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
                  {/* 第一行: 标题 + emoji */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1E1B4B", margin: 0, flex: 1, paddingRight: 12 }}>
                      {topic.title}
                    </h3>
                    <span style={{ fontSize: 36, lineHeight: 1, flexShrink: 0 }}>{topic.coverEmoji || "💡"}</span>
                  </div>

                  {/* 进度条 */}
                  {prog && prog.status !== "error" && (
                    <div style={{ marginBottom: 8 }}>
                      {(prog.status === "pending" || prog.status === "generating") && progPercent < 100 && (
                        <div>
                          <div style={{ fontSize: 11, color: "#7C3AED", fontWeight: 600, marginBottom: 6 }}>
                            🧠 AI 解析中
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{
                              flex: 1, height: 9, borderRadius: 5,
                              background: "#EDE9FE", overflow: "hidden",
                            }}>
                              <div style={{
                                height: "100%", width: `${progPercent}%`,
                                borderRadius: 5,
                                background: "#7C3AED",
                                transition: "width 0.8s ease",
                              }} />
                            </div>
                            <span style={{ fontSize: 11, color: "#7C3AED", whiteSpace: "nowrap", fontWeight: 600 }}>
                              {progPercent}%
                            </span>
                          </div>
                        </div>
                      )}
                      {isDone && !hasViewed && (
                        <div style={{ fontSize: 10, color: "#10B981", fontWeight: 600, marginBottom: 4 }}>✅ 已完成</div>
                      )}
                    </div>
                  )}

                  {/* 第二行: subtitle 副标题 */}
                  <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 8px", lineHeight: 1.5 }}>
                    {topic.subtitle}
                  </p>

                  {/* 第三行: shortSummary 概念总结（限制2行，30-50字） */}
                  {topic.shortSummary ? (
                    <p style={{
                      fontSize: 12, color: "#6B7280", margin: "0 0 10px", lineHeight: 1.6,
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}>
                      {topic.shortSummary}
                    </p>
                  ) : (
                    <p style={{ fontSize: 12, color: "#ADB5BD", margin: "0 0 10px", fontStyle: "italic" }}>暂无简介</p>
                  )}

                  {/* 第四行: 标签（最底部） */}
                  {safeTags(topic.tags).length > 0 && !isProcessing && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
                </div>
              </Link>

              {/* 删除按钮 — 用 wrapper hover 控制显示 */}
              <button
                onClick={(e) => handleDeleteTopic(e, topic)}
                title="删除这个话题"
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(239, 68, 68, 0.5)",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0,
                  transition: "opacity 0.2s",
                  zIndex: 10,
                  pointerEvents: "auto",
                }}
                className="topic-delete-btn"
              >
                ×
              </button>
            </div>
            );
            })}
          </div>
        )}

        {/* ===== 分页 ===== */}
        {!loading && !searchText.trim() && activeTag === "全部" && totalItems > ITEMS_PER_PAGE && (
          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(totalItems / ITEMS_PER_PAGE)}
            onPageChange={(page) => {
              fetchTopics({ page });
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}
      </div>
    </div>
    </>
  );
};

export default TopicHubPage;
