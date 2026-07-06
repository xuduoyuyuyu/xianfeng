import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import GlobalPublicNav from "../components/GlobalPublicNav";

import Pagination from "../components/Pagination";
import type { RootState } from "../store";
import { logout } from "../store/userSlice";
import { getTopicUserId } from "../utils/topicUserId";
import { getAdminOrUserToken, hasAdminOrUserSession, isProRequiredPayload, showProUpgradeFromPayload } from "../utils/proGate";
import { useIsMobilePager } from "../hooks/useIsMobilePager";
import { useXiaowanziEmbeddedLayer } from "../utils/xiaowanziLayer";
import { isMiniProgramWebView } from "../utils/mpAuthBridge";
import { extractTopicSubmitError } from "../utils/topicSubmitError";

// ===== 本地暂存话题保护机制 =====
// 解决：创建话题后刷新页面，话题丢失的问题
// 原理：将最近创建的话题 slug 持久化到 localStorage，每次加载列表时自动合并到顶部
const STICKY_TOPICS_KEY = "xianfeng_topic_sticky_slugs";
interface StickyRecord { slug: string; createdAt: number; userId: string }
function getStickySlugs(userId: string): StickyRecord[] {
  try {
    const raw = localStorage.getItem(STICKY_TOPICS_KEY);
    if (!raw) return [];
    const records: StickyRecord[] = JSON.parse(raw);
    const now = Date.now();
    // 24 小时过期，且匹配当前 userId
    return records.filter(r => r.userId === userId && now - r.createdAt < 86400000);
  } catch { return []; }
}
function saveStickySlug(slug: string, userId: string) {
  try {
    const records = getStickySlugs(userId);
    const exists = records.find(r => r.slug === slug);
    if (!exists) {
      records.push({ slug, createdAt: Date.now(), userId });
    }
    localStorage.setItem(STICKY_TOPICS_KEY, JSON.stringify(records));
  } catch {}
}
function removeStickySlug(slug: string, userId: string) {
  try {
    const records = getStickySlugs(userId);
    const filtered = records.filter(r => r.slug !== slug);
    localStorage.setItem(STICKY_TOPICS_KEY, JSON.stringify(filtered));
  } catch {}
}
function cleanupStickyTopics(userId: string) {
  try {
    const records = getStickySlugs(userId);
    localStorage.setItem(STICKY_TOPICS_KEY, JSON.stringify(records));
  } catch {}
}

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
  gradeMatch?: boolean;
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

function mergeBySlug<T extends { slug: string }>(current: T[], next: T[]) {
  const seen = new Set(current.map((item) => item.slug));
  return [...current, ...next.filter((item) => !seen.has(item.slug))];
}

function getTopicRouteId(topic: Pick<TopicItem, "slug" | "_id" | "id">): string {
  return String(topic.slug || topic._id || topic.id || "").trim();
}

const TopicHubPage: React.FC = () => {
  // 获取登录用户的孩子年级
  const dispatch = useDispatch();
  const { user: currentUser, token } = useSelector((state: RootState) => state.user);
  const superModePage = useXiaowanziEmbeddedLayer();
  const isMobilePager = useIsMobilePager();
  const miniProgramWebView = isMiniProgramWebView();
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
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const showInitialLoading = loading && (!isMobilePager || currentPage <= 1);

  // ===== 搜索 =====
  const [searchText, setSearchText] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ===== 提交 =====
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ text: string; type: "success" | "error" | "searchResults" | "existingMatch" | "confirmRefine"; slug?: string } | null>(null);
  const [refinedKeyword, setRefinedKeyword] = useState("");
  const [relatedTopics, setRelatedTopics] = useState<TopicItem[]>([]);
  const [validating, setValidating] = useState(false);
  // 获取 userId：优先用登录用户手机号 > _id > 匿名随机 ID
  const getUserId = (): string => getTopicUserId(currentUser);
  const buildTopicDetailPath = (topicOrSlug: TopicItem | string) => {
    const routeId = typeof topicOrSlug === "string" ? topicOrSlug : getTopicRouteId(topicOrSlug);
    const uid = getUserId();
    return `/topics/${encodeURIComponent(routeId)}${uid ? `?userId=${encodeURIComponent(uid)}` : ""}`;
  };
  const authHeaders = () => {
    const authToken = getAdminOrUserToken() || token || "";
    return { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) };
  };
  const handleProRequired = (payload: any) => {
    showProUpgradeFromPayload(payload);
    setValidating(false);
    setSubmitLoading(false);
  };
  const handleAuthExpired = (_payload?: any) => {
    const message = "登录态已过期，请重新登录";
    dispatch(logout());
    setValidating(false);
    setSubmitLoading(false);
    setSubmitMsg({ text: message, type: "error" });
    document.dispatchEvent(new CustomEvent("xf-show-login-modal", {
      detail: {
        title: "登录态已过期",
        description: "请重新登录后继续提交问题。",
      },
    }));
  };

  const [progressPolling, setProgressPolling] = useState<ReturnType<typeof setInterval> | null>(null);

  // 拉取话题列表（支持搜索/分页参数）
  // mergeNewSlugs: 合并时保留这些 slug 的话题在列表头部（即使服务端尚未返回）
  const fetchTopics = useCallback(async (opts?: { search?: string; page?: number; mergeNewSlugs?: string[] }) => {
    try {
      const uid = getUserId();
      const search = opts?.search;
      const pageNum = opts?.page || 1;
      // mergeNewSlugs: 传入的临时保护 + localStorage 持久化保护
      const tempSlugs = opts?.mergeNewSlugs || [];
      const stickyRecords = getStickySlugs(uid);
      const stickySlugs = stickyRecords.map(r => r.slug);
      const mergeSlugs = [...new Set([...tempSlugs, ...stickySlugs])];

      let limit = ITEMS_PER_PAGE;
      if (search) limit = 50;

      let url = `/api/topic-hub?limit=${limit}&userId=${uid}&page=${pageNum}`;
      if (search) url += `&search=${encodeURIComponent(search.trim())}`;
      // 如果有孩子年级信息，传给 API 做适配过滤
      if (userGrade) url += `&grade=${encodeURIComponent(userGrade)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let data = await res.json();
      let rawTopics: TopicItem[] = Array.isArray(data.topics) ? data.topics : [];
      if (uid && rawTopics.length === 0) {
        let fallbackUrl = `/api/topic-hub?limit=${limit}&page=${pageNum}`;
        if (search) fallbackUrl += `&search=${encodeURIComponent(search.trim())}`;
        const fallbackRes = await fetch(fallbackUrl);
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          const fallbackTopics = Array.isArray(fallbackData.topics) ? fallbackData.topics : [];
          if (fallbackTopics.length > 0) {
            data = fallbackData;
            rawTopics = fallbackTopics;
          }
        }
      }
      const cleaned = rawTopics.map((t) => ({
        ...t,
        tags: safeTags(t.tags),
        nodeCount: t.nodeCount ?? 0,
        questionCount: t.questionCount ?? 0,
        viewCount: t.viewCount ?? 0,
        gradeMatch: t.gradeMatch ?? true,
      }));
      // 根据年级匹配度排序：匹配年级的优先，不匹配的排在后面（但仍然展示）
      cleaned.sort((a, b) => {
        if (a.gradeMatch && !b.gradeMatch) return -1;
        if (!a.gradeMatch && b.gradeMatch) return 1;
        return 0; // 同级保持服务端返回顺序
      });
      // 合并本地暂存的新话题（防止竞态覆盖刚创建的卡片）
      setTopics((prev) => {
        const existingSlugs = new Set(cleaned.map((t: TopicItem) => t.slug));
        const stickyTopics = prev.filter((t) => mergeSlugs.includes(t.slug) && !existingSlugs.has(t.slug));
        return isMobilePager && pageNum > 1 ? mergeBySlug(prev, cleaned) : [...stickyTopics, ...cleaned];
      });
      setTotalItems(data.total || cleaned.length);
      setCurrentPage(pageNum);

      // 清理已在服务端列表中确认存在且生成完成的 sticky slug
      const serverSlugs = new Set(cleaned.map(t => t.slug));
      for (const rec of stickyRecords) {
        if (serverSlugs.has(rec.slug)) {
          const serverTopic = cleaned.find(t => t.slug === rec.slug);
          // 当话题生成完成时，移除 sticky 保护
          if (serverTopic?.generatingProgress?.status === "done") {
            removeStickySlug(rec.slug, uid);
          }
        }
      }

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
  }, [currentUser, isMobilePager, userGrade]);

  useEffect(() => {
    // 组件挂载时清理过期的 sticky slugs
    const uid = getUserId();
    cleanupStickyTopics(uid);
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
      setCurrentPage(1);
      setLoading(true);
      fetchTopics({});
      return;
    }

    searchTimer.current = setTimeout(() => {
      setCurrentPage(1);
      setLoading(true);
      fetchTopics({ search: value.trim() });
    }, 300);
  };

  // ===== 提交前：先公开搜索；只有继续提交新内容时才进入 Pro 门禁链路 =====
  const handleSubmit = async (skipSearch = false) => {
    if (!currentUser) {
      document.dispatchEvent(new CustomEvent('xf-show-login-modal', { detail: { title: '登录后提交', description: '登录后即可搜索话题、提交问题，获得AI生成的知识树。' } }));
      return;
    }
    const q = searchText.trim();
    if (!q) return;
    setSubmitMsg(null);
    setRelatedTopics([]);
    return doSearchAndSubmit(q, skipSearch);
  };

  // 确认提炼结果后提交
  const handleConfirmRefine = () => {
    const kw = refinedKeyword.trim();
    if (!kw) return;
    setSubmitMsg(null);
    setRefinedKeyword("");
    doSearchAndSubmit(kw, true, true);
  };

  // 用户修改提炼结果
  const handleEditRefine = () => {
    setSearchText(refinedKeyword);
    setSubmitMsg(null);
    setRefinedKeyword("");
  };

  // 先搜索已有话题，再校验并提交
  const doSearchAndSubmit = async (q: string, skipSearch: boolean, skipRefine = false) => {
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
          setSubmitMsg({ text: `🔍 找到以下相关话题，已为你展示。如果没有你想要的，可以继续提交`, type: "searchResults" });
          return;
        }
      } catch { /* 搜索失败继续创建流程 */ }
    }

    await doSubmit(q, { skipRefine });
  };

  // 最终提交
  const doSubmit = async (q: string, options?: { skipRefine?: boolean }) => {
    let trimmed = q.trim();
    if (!trimmed) return;

    // 1. AI 提炼核心问题，给用户二次确认；这是新内容提交链路，需 Pro
    if (!options?.skipRefine) {
      setValidating(true);
      try {
        const refineRes = await fetch("/api/topic-hub/refine", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ keyword: trimmed }),
        });
        const refineData = await refineRes.json();
        setValidating(false);
        if (!refineRes.ok) {
          if (refineRes.status === 401) {
            handleAuthExpired(refineData);
            return;
          }
          if (refineRes.status === 402 || isProRequiredPayload(refineData)) {
            handleProRequired(refineData);
            return;
          }
          throw new Error(extractTopicSubmitError(refineData, `提交失败 (${refineRes.status})`));
        }
        if (refineData.needConfirm && refineData.refined) {
          setRefinedKeyword(refineData.refined);
          setSubmitMsg({
            text: `💡 AI 提炼出您的核心问题，确认后即可提交`,
            type: "confirmRefine",
          });
          return;
        }
        trimmed = (refineData.refined || trimmed).trim();
      } catch (e: any) {
        setValidating(false);
        setSubmitMsg({ text: extractTopicSubmitError(e, "网络错误"), type: "error" });
        return;
      }
    }

    // 2. AI 校验有效性
    setValidating(true);
    try {
      const vRes = await fetch("/api/topic-hub/validate", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ keyword: trimmed }),
      });
      const vData = await vRes.json();
      setValidating(false);
      if (!vRes.ok) {
        if (vRes.status === 401) {
          handleAuthExpired(vData);
          return;
        }
        if (vRes.status === 402 || isProRequiredPayload(vData)) {
          handleProRequired(vData);
          return;
        }
        throw new Error(extractTopicSubmitError(vData, `校验失败 (${vRes.status})`));
      }

      if (!vData.valid) {
        setSubmitMsg({ text: extractTopicSubmitError(vData, "请输入有效的话题内容"), type: "error" });
        return;
      }
    } catch {
      setValidating(false);
    }

    // 3. 创建话题
    setSubmitLoading(true);
    const uid = getUserId();
    try {
      const res = await fetch("/api/topic-hub/search-generate", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ keyword: trimmed, userId: uid }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          handleAuthExpired(data);
          return;
        }
        if (res.status === 402 || isProRequiredPayload(data)) {
          handleProRequired(data);
          return;
        }
      }
      if (res.ok) {
        const newTopic: TopicItem = {
          ...data.topic,
          tags: safeTags(data.topic.tags),
          nodeCount: data.topic.nodeCount ?? 0,
          questionCount: data.topic.questionCount ?? 0,
          viewCount: data.topic.viewCount ?? 0,
        };
        if (data.source === "existing") {
          setSubmitMsg({ text: `📌 已有相似话题「${data.topic.title}」`, type: "existingMatch", slug: data.topic.slug });
        } else {
          setSubmitMsg({ text: "✨ 话题已创建，AI 正在为你生成知识树…", type: "success" });
        }
        // 无论新建还是已存在，都把话题卡片插入列表头部
        setTopics((prev) => {
          console.log("[TopicHub] 插入话题到列表头部:", newTopic.slug, "当前列表长度:", prev.length);
          return [newTopic, ...prev];
        });
        // 同时更新标签列表（新话题的标签可能不在 allTags 中）
        setAllTags((prev) => {
          const newTags = (newTopic.tags as string[]);
          const merged = new Set(prev);
          newTags.forEach((t) => merged.add(t));
          return ["全部", ...Array.from(merged).filter((t) => t !== "全部")];
        });
        if (data.relatedTopics?.length) {
          setRelatedTopics(data.relatedTopics.map((t: any) => ({ ...t, tags: safeTags(t.tags) })));
        }
        setSearchText("");
        // 保存新创建的 slug 到 localStorage，确保刷新后不会丢失
        const newSlug = newTopic.slug;
        saveStickySlug(newSlug, uid);
        // 立即刷新列表：新话题已通过 setTopics 插入头部，
        // 传入 mergeNewSlugs 确保刚创建的卡片不会被 fetchTopics 竞态覆盖
        setTimeout(() => {
          fetchTopics({ mergeNewSlugs: [newSlug] });
        }, 3000);
        // 新创建的话题始终启动进度轮询
        if (newTopic.slug && data.source !== "existing") {
          pollProgress(newTopic.slug);
        }
      } else {
        setSubmitMsg({ text: extractTopicSubmitError(data, "提交失败"), type: "error" });
      }
    } catch (e: any) {
      setSubmitMsg({ text: extractTopicSubmitError(e, "网络错误"), type: "error" });
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
      const uid = getUserId();
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
    const isLoggedIn = !!currentUser || hasAdminOrUserSession();
    if (!isLoggedIn) {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent("xf-show-login-modal", { detail: { title: "登录后即可查看", description: "登录后可查看完整知识树、深入话题内容，获得个性化学习推荐。" } }));
      return;
    }
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
  const [tagFilterOpen, setTagFilterOpen] = useState(false);
  const [draftTag, setDraftTag] = useState("全部");

  // 小程序默认展示两行常用标签，长尾标签进入筛选面板；普通移动端保留原来的三行折叠。
  const DESKTOP_VISIBLE_TAGS = 48;
  const MOBILE_VISIBLE_TAGS = 18;
  const MINI_PROGRAM_COMMON_TAGS = 6;
  const maxVisibleTags = isMobilePager ? MOBILE_VISIBLE_TAGS : DESKTOP_VISIBLE_TAGS;
  const getMiniProgramVisibleTags = () => {
    const commonTags = allTags.slice(0, MINI_PROGRAM_COMMON_TAGS);
    if (activeTag === "全部" || commonTags.includes(activeTag) || !allTags.includes(activeTag)) {
      return commonTags;
    }
    return ["全部", activeTag, ...allTags.filter((tag) => tag !== "全部" && tag !== activeTag).slice(0, MINI_PROGRAM_COMMON_TAGS - 2)];
  };
  const visibleTags = miniProgramWebView
    ? getMiniProgramVisibleTags()
    : tagExpanded ? allTags : allTags.slice(0, maxVisibleTags);
  const hasMoreTags = miniProgramWebView ? allTags.length > visibleTags.length : allTags.length > maxVisibleTags;

  const ensureTagFilterAccess = () => {
    const isLoggedIn = !!currentUser || hasAdminOrUserSession();
    if (!isLoggedIn) {
      document.dispatchEvent(new CustomEvent("xf-show-login-modal", { detail: { title: "登录后即可查看更多标签", description: "登录后可搜索话题、提交问题，获得AI生成的知识树。" } }));
      return false;
    }
    return true;
  };

  const applyTagFilter = (tag: string) => {
    if (!ensureTagFilterAccess()) return;
    setActiveTag(tag);
    setCurrentPage(1);
    setTagFilterOpen(false);
    if (tag === "全部") {
      fetchTopics({});
    }
  };

  const openTagFilter = () => {
    if (!ensureTagFilterAccess()) return;
    setDraftTag(activeTag);
    setTagFilterOpen(true);
  };

  const getTopicsByTag = (tag: string) =>
    tag === "全部" ? topics : topics.filter((t) => (t.tags as string[]).includes(tag));

  const filteredTopics =
    getTopicsByTag(activeTag);
  const draftFilteredCount = getTopicsByTag(draftTag).length;

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8f6ff" }}>
        <GlobalPublicNav compactMobile showPlanningEntry={true} searchValue={searchText} onSearchChange={handleSearchInput} />
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
      .topic-hub-eyebrow {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 9999px;
        border: 1px solid #cfc2ef;
        background: #f3eefc;
        padding: 4px 16px;
        color: #5b3fa1;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.22em;
        line-height: 1.2;
        white-space: nowrap;
        word-break: keep-all;
      }
      .topics-hero-search {
        border: 1px solid rgba(124, 77, 255, 0.22);
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 4px 14px rgba(124, 77, 255, 0.09);
        transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
      }
      .topics-hero-search:focus-within {
        border-color: rgba(124, 77, 255, 0.46);
        box-shadow: 0 8px 20px rgba(124, 77, 255, 0.16);
        transform: translateY(-1px);
      }
      .topics-hero-control {
        height: 56px;
        min-height: 56px;
        max-height: 56px;
        border-radius: 16px;
      }
      .topic-hub-card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 20px;
      }
      .topic-hub-card {
        min-height: 212px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid #f3f0ff;
        border-radius: 16px;
        background: #fff;
        padding: 20px;
        color: #1e1b4b;
        box-shadow: 0 2px 12px rgba(0,0,0,0.06);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        cursor: pointer;
      }
      .topic-hub-card:not(.is-processing):hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.10);
      }
      .topic-hub-card.is-processing {
        cursor: default;
      }
      .topic-hub-card-title-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
      }
      .topic-hub-card-title {
        flex: 1;
        min-width: 0;
        margin: 0;
        color: #1e1b4b;
        font-size: 18px;
        font-weight: 700;
        line-height: 1.42;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .topic-hub-card-emoji {
        flex: 0 0 auto;
        font-size: 34px;
        line-height: 1;
      }
      .topic-hub-card-subtitle {
        margin: 0 0 8px;
        color: #6b7280;
        font-size: 13px;
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .topic-hub-card-summary {
        margin: 0 0 10px;
        color: #6b7280;
        font-size: 12px;
        line-height: 1.6;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .topic-hub-card-empty-summary {
        color: #adb5bd;
        font-style: italic;
      }
      .topic-hub-card-tags {
        margin-top: auto;
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        overflow: hidden;
      }
      .topic-hub-card-tag {
        border-radius: 10px;
        background: #f3eeff;
        padding: 2px 10px;
        color: #7c3aed;
        font-size: 11px;
        font-weight: 500;
        line-height: 1.5;
      }
      .topic-tag-filter {
        margin-bottom: 28px;
      }
      .topic-tag-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: center;
      }
      .topic-tag-chip,
      .topic-tag-filter-trigger {
        border: none;
        border-radius: 20px;
        padding: 6px 16px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }
      .topic-tag-chip {
        background: #ede9fe;
        color: #5b21b6;
      }
      .topic-tag-chip.is-active {
        background: #7c3aed;
        color: #fff;
      }
      .topic-tag-filter-trigger {
        background: linear-gradient(135deg, #7c3aed, #5b21e8);
        color: #fff;
        font-weight: 700;
      }
      .topic-tag-expand {
        margin-top: 10px;
        text-align: center;
      }
      .topic-tag-expand-button {
        border: none;
        background: none;
        padding: 0;
        color: #7c3aed;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .topic-tag-sheet-backdrop {
        position: fixed;
        inset: 0;
        z-index: 80;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        background: rgba(23, 19, 47, 0.36);
      }
      .topic-tag-sheet {
        width: min(100%, 720px);
        max-height: 78vh;
        overflow: hidden;
        border-radius: 28px 28px 0 0;
        background: #fff;
        box-shadow: 0 -18px 48px rgba(23, 19, 47, 0.2);
        animation: slideUpIn 0.2s ease both;
      }
      .topic-tag-sheet-handle {
        width: 56px;
        height: 8px;
        margin: 14px auto 8px;
        border-radius: 999px;
        background: #ddd3ff;
      }
      .topic-tag-sheet-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
        padding: 4px 28px 18px;
      }
      .topic-tag-sheet-title {
        margin: 0 0 4px;
        color: #1e1b4b;
        font-size: 22px;
        font-weight: 800;
      }
      .topic-tag-sheet-close {
        border: none;
        background: none;
        color: #7c3aed;
        font-size: 26px;
        line-height: 1;
        cursor: pointer;
      }
      .topic-tag-sheet-body {
        max-height: calc(78vh - 188px);
        overflow: auto;
        padding: 0 28px 22px;
      }
      .topic-tag-sheet-label {
        margin: 14px 0 12px;
        color: #6d5aa7;
        font-size: 14px;
        font-weight: 800;
      }
      .topic-tag-sheet-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .topic-tag-sheet-footer {
        display: flex;
        align-items: center;
        gap: 16px;
        border-top: 1px solid #f0ebff;
        padding: 18px 28px calc(18px + env(safe-area-inset-bottom, 0px));
      }
      .topic-tag-reset {
        flex: 0 0 auto;
        border: none;
        background: none;
        color: #7c3aed;
        font-size: 15px;
        font-weight: 800;
        cursor: pointer;
      }
      .topic-tag-apply {
        flex: 1;
        border: none;
        border-radius: 999px;
        background: linear-gradient(135deg, #7c3aed, #5b21e8);
        color: #fff;
        min-height: 52px;
        font-size: 16px;
        font-weight: 900;
        cursor: pointer;
      }
      html.xf-mp-webview .topic-hub-main {
        --xf-mp-outer-gutter: clamp(16px, 4.8vw, 20px);
        --xf-mp-inner-gutter: clamp(8px, 2.4vw, 10px);
        width: calc(100% - var(--xf-mp-outer-gutter)) !important;
        padding-left: var(--xf-mp-inner-gutter) !important;
        padding-right: var(--xf-mp-inner-gutter) !important;
        padding-top: var(--xf-mp-nav-height, 88px) !important;
      }
      html.xf-mp-webview .topic-hub-list {
        --xf-mp-outer-gutter: clamp(16px, 4.8vw, 20px);
        --xf-mp-inner-gutter: clamp(8px, 2.4vw, 10px);
        width: calc(100% - var(--xf-mp-outer-gutter)) !important;
        padding-left: var(--xf-mp-inner-gutter) !important;
        padding-right: var(--xf-mp-inner-gutter) !important;
        padding-bottom: calc(var(--xf-mp-tabbar-height, 64px) + 28px) !important;
      }
      html.xf-mp-webview .topic-hub-eyebrow {
        letter-spacing: 0.18em;
      }
      html.xf-mp-webview .topic-hub-card-grid {
        grid-template-columns: 1fr !important;
        gap: 16px;
      }
      html.xf-mp-webview .topic-hub-card {
        min-height: 214px;
        border-radius: 24px;
        padding: 22px 24px;
        box-shadow: 0 10px 24px rgba(47,35,85,0.08);
      }
      html.xf-mp-webview .topic-hub-card:not(.is-processing):hover {
        transform: none;
        box-shadow: 0 10px 24px rgba(47,35,85,0.08);
      }
      html.xf-mp-webview .topic-hub-card-title {
        font-size: 20px;
        line-height: 1.36;
      }
      html.xf-mp-webview .topic-hub-card-emoji {
        font-size: 32px;
      }
      html.xf-mp-webview .topic-tag-filter {
        margin-bottom: 18px;
      }
      html.xf-mp-webview .topic-tag-row {
        max-height: 84px;
        overflow: hidden;
        align-items: center;
      }
      html.xf-mp-webview .topic-tag-chip,
      html.xf-mp-webview .topic-tag-filter-trigger {
        padding: 8px 14px;
        font-size: 14px;
        font-weight: 800;
      }
    `}</style>
    <div style={{ minHeight: "100vh", background: "#f8f6ff" }}>
      <GlobalPublicNav compactMobile showPlanningEntry={true} searchValue={searchText} onSearchChange={handleSearchInput} />

      {/* ===== Hero 区域 ===== */}
      <main className={`topic-hub-main mx-auto max-w-7xl px-4 pb-2 sm:px-6 lg:px-8 ${superModePage ? "pt-6" : "pt-[76px]"}`}>
        <section
          className="overflow-hidden rounded-[2rem] border border-[#d8d0ef] p-7 shadow-[0_24px_80px_rgba(80,62,125,0.1)] sm:p-9"
          style={{
            background:
              "radial-gradient(circle at 85% 15%, rgba(143,100,255,0.1), transparent 38%), linear-gradient(135deg, #f4f1fd 0%, #faf8ff 48%, #f0ebff 100%)",
          }}
        >
          <div className="max-w-3xl mx-auto text-center">
            <div
              className="topic-hub-eyebrow"
            >ASK & LEARN</div>
            <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-[#2b1a3a] sm:text-5xl">
              请教一下
            </h1>
            <p style={{ color: "#6f62a3", fontSize: 14, margin: "0 0 20px", lineHeight: 1.7 }}>
              教育路上，每个问题都值得被认真回答
            </p>
          </div>

          {/* 输入区 */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <label className="topics-hero-search topics-hero-control inline-flex flex-1 items-center gap-2 border border-[#d8d0ef] bg-white px-4 shadow-sm">
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
              className="topics-hero-control inline-flex items-center justify-center px-6 text-sm font-bold !text-white transition disabled:opacity-50"
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
                    doSubmit(searchText.trim(), { skipRefine: true });
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
                        to={buildTopicDetailPath(submitMsg.slug)}
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
                    to={`/topics/${encodeURIComponent(rt.slug)}`}
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
        <div className="topic-hub-list" style={{ maxWidth: 1280, margin: "0 auto", padding: "0 20px" }}>
        {allTags.length > 1 && (
          <div className="topic-tag-filter">
            <div className="topic-tag-row">
              {visibleTags.map((tag) => {
                return (
                <button
                  key={tag}
                  onClick={() => applyTagFilter(tag)}
                  className={`topic-tag-chip ${activeTag === tag ? "is-active" : ""}`}
                >
                  {tag}
                </button>
                );
              })}
              {miniProgramWebView && hasMoreTags && (
                <button
                  type="button"
                  onClick={openTagFilter}
                  className="topic-tag-filter-trigger"
                >
                  展开全部 ▼
                </button>
              )}
            </div>
            {!miniProgramWebView && hasMoreTags && (
              <div className="topic-tag-expand">
                <button
                  onClick={() => setTagExpanded((prev) => !prev)}
                  className="topic-tag-expand-button"
                >
                  {tagExpanded ? "收起 ▲" : "展开全部 ▼"}
                </button>
              </div>
            )}
          </div>
        )}

        {miniProgramWebView && tagFilterOpen && (
          <div className="topic-tag-sheet-backdrop" onClick={() => setTagFilterOpen(false)}>
            <div className="topic-tag-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="topic-tag-sheet-handle" />
              <div className="topic-tag-sheet-header">
                <div>
                  <h2 className="topic-tag-sheet-title">更多标签</h2>
                </div>
                <button
                  type="button"
                  className="topic-tag-sheet-close"
                  onClick={() => setTagFilterOpen(false)}
                  aria-label="关闭更多标签"
                >
                  ×
                </button>
              </div>
              <div className="topic-tag-sheet-body">
                <div className="topic-tag-sheet-label">话题标签</div>
                <div className="topic-tag-sheet-grid">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setDraftTag(tag)}
                      className={`topic-tag-chip ${draftTag === tag ? "is-active" : ""}`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
              <div className="topic-tag-sheet-footer">
                <button
                  type="button"
                  className="topic-tag-reset"
                  onClick={() => setDraftTag("全部")}
                >
                  重置
                </button>
                <button
                  type="button"
                  className="topic-tag-apply"
                  onClick={() => applyTagFilter(draftTag)}
                >
                  查看 {draftFilteredCount} 个话题
                </button>
              </div>
            </div>
          </div>
        )}

        {showInitialLoading ? (
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
          <div className="topic-hub-card-grid">
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
                  to={buildTopicDetailPath(topic)}
                  style={{ textDecoration: "none" }}
                  onClick={(e) => handleTopicClick(e, topic)}
                >
                <div className={`topic-hub-card ${isProcessing ? "is-processing" : ""}`}>
                  {/* 第一行: 标题 + emoji */}
                  <div className="topic-hub-card-title-row">
                    <h3 className="topic-hub-card-title">
                      {topic.title}
                    </h3>
                    <span className="topic-hub-card-emoji">{topic.coverEmoji || "💡"}</span>
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
                  <p className="topic-hub-card-subtitle">
                    {topic.subtitle}
                  </p>

                  {/* 第三行: shortSummary 概念总结（限制2行，30-50字） */}
                  {topic.shortSummary ? (
                    <p className="topic-hub-card-summary">
                      {topic.shortSummary}
                    </p>
                  ) : (
                    <p className="topic-hub-card-summary topic-hub-card-empty-summary">暂无简介</p>
                  )}

                  {/* 第四行: 标签（最底部） */}
                  {safeTags(topic.tags).length > 0 && !isProcessing && (
                    <div className="topic-hub-card-tags">
                      {safeTags(topic.tags).slice(0, 3).map((tag) => (
                        <span key={tag} className="topic-hub-card-tag">
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
            totalPages={totalPages}
            mobileAutoLoad
            mobileHasMore={currentPage < totalPages}
            mobileLoading={loading && isMobilePager && currentPage > 1}
            onMobileLoadMore={() => {
              setLoading(true);
              fetchTopics({ page: Math.min(totalPages, currentPage + 1) });
            }}
            onPageChange={(page) => {
              setLoading(true);
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
