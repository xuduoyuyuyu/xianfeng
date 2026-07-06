import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import GlobalPublicNav from "../components/GlobalPublicNav";
import type { RootState } from "../store";
import { getTopicUserId } from "../utils/topicUserId";
import { toPng } from "html-to-image";
import XianfengSharePoster, {
  getSharePosterHeight,
  SHARE_POSTER_HEIGHT,
  SHARE_POSTER_WIDTH,
  type XianfengSharePosterData,
} from "../components/XianfengSharePoster";


/* ── 光斑装饰 ── */

interface BranchNode {
  id: number;
  nodeKey: string;
  title: string;
  nodeType: "branch";
  sortOrder: number;
  children: LeafNode[];
}

interface LeafNode {
  id: number;
  nodeKey: string;
  title: string;
  nodeType: "leaf";
  summary: string;
  questionCount: number;
  hasQuiz: boolean;
}

interface TopicInfo {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  coverEmoji: string;
  tags: string[];
  summary?: string;
  overview?: string;
  synopsis?: string;
  abstract?: string;
  intro?: string;
  content?: string;
  longSummary?: string;
  long_summary?: string;
}

interface NodeDetail {
  id: number;
  nodeKey: string;
  title: string;
  summary: string;
  content: string;
  keyPoints: string[];
  references: { title: string; url: string }[];
  hasQuiz: boolean;
}

interface QuestionItem {
  id: number;
  user_name: string;
  question: string;
  ai_answer: string;
  helpful_count: number;
}

interface SiblingItem {
  nodeKey: string;
  title: string;
}

interface LayerNode {
  key: string;
  title: string;
  summary: string;
  icon?: string;
}

interface LayersInput {
  [layerName: string]: LayerNode[];
}

const LAYER_NAMES: Record<string, string> = {
  layer1: "认知篇",
  layer2: "诊断篇",
  layer3: "方法篇",
  layer4: "工具篇",
  layer5: "行动篇",
};

const NEXT_NODE_PULL_THRESHOLD = 72;
const NEXT_NODE_PULL_MAX = 104;

/** 把后端 layers（layer1/layer2/...）转成前端 tree 结构 */
function transformLayersToTree(layers: LayersInput): BranchNode[] {
  const branchKeys = Object.keys(layers).sort();
  return branchKeys.map((key, bi) => {
    const nodes = layers[key] as LayerNode[];
    if (!Array.isArray(nodes)) return { id: bi, nodeKey: key, title: key, nodeType: "branch" as const, sortOrder: bi, children: [] };
    const children: LeafNode[] = nodes.map((n, ci) => ({
      id: ci,
      nodeKey: n.key,
      title: n.title,
      nodeType: "leaf",
      summary: n.summary,
      questionCount: 0,
      hasQuiz: false,
    }));
    return {
      id: bi,
      nodeKey: key,
      title: LAYER_NAMES[key] || key,
      nodeType: "branch",
      sortOrder: bi,
      children,
    };
  });
}

function cleanShareSummaryText(input: string): string {
  return String(input || "")
    .replace(/\s+/g, " ")
    .replace(/[•·]\s*/g, "")
    .trim();
}

function pickShareOverview(topic: TopicInfo, tree: BranchNode[]): string {
  const t = topic as unknown as Record<string, unknown>;
  const candidates = [
    t.overview,
    t.synopsis,
    t.abstract,
    t.longSummary,
    t.long_summary,
    t.summary,
    t.intro,
    t.content,
    t.description,
  ]
    .map((v) => (typeof v === "string" ? cleanShareSummaryText(v) : ""))
    .filter(Boolean);

  // 优先选择更像“梗概”的多句文本
  const longCandidate = candidates.find((s) => s.length >= 40) || candidates[0] || "";
  if (longCandidate.length >= 40) return longCandidate;

  // 回退：拼接前几个核心节点摘要，生成结构化梗概
  const nodeSummaries = tree
    .flatMap((b) => b.children)
    .map((n) => cleanShareSummaryText(n.summary))
    .filter(Boolean)
    .slice(0, 4);

  if (nodeSummaries.length > 0) {
    return nodeSummaries.join("；") + "。";
  }

  return longCandidate || "本专题系统讲解关键概念、常见误区、评估方法与实践路径。";
}

function getTopicDetailUserId(currentUser: RootState["user"]["user"] | null): string {
  let urlUserId = "";
  if (typeof window !== "undefined") {
    try {
      const url = new URL(window.location.href);
      urlUserId = (url.searchParams.get("userId") || "").trim();
    } catch {
      urlUserId = "";
    }
  }
  return urlUserId || getTopicUserId(currentUser);
}

function isMiniProgramTopicDetailView() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const wechatEnvironment = String((window as any).__wxjs_environment || "").toLowerCase();
  const userAgent = window.navigator?.userAgent || "";
  return (
    params.get("xf_mp") === "1" ||
    params.has("xf_tab") ||
    window.sessionStorage.getItem("xf_mp_webview") === "1" ||
    wechatEnvironment === "miniprogram" ||
    /miniprogram/i.test(userAgent)
  );
}

function resetTopicDetailScrollTop() {
  if (typeof window === "undefined") return;
  const scrollToTop = () => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const documentElement = window.document?.documentElement;
    const body = window.document?.body;
    if (documentElement && typeof documentElement.scrollTo === "function") {
      documentElement.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
    if (body && typeof body.scrollTo === "function") {
      body.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  };
  scrollToTop();
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(scrollToTop);
  }
  window.setTimeout(scrollToTop, 0);
  window.setTimeout(scrollToTop, 80);
  window.setTimeout(scrollToTop, 180);
}

function getFlatTopicLeafNodes(tree: BranchNode[]): LeafNode[] {
  return tree.flatMap((branch) => branch.children || []);
}

function getNextTopicLeafNode(tree: BranchNode[], currentNodeKey: string): LeafNode | null {
  const nodes = getFlatTopicLeafNodes(tree);
  const index = nodes.findIndex((node) => node.nodeKey === currentNodeKey);
  if (index < 0 || index >= nodes.length - 1) return null;
  return nodes[index + 1];
}

const TopicDetailPage: React.FC<{ slug: string }> = ({ slug }) => {
  const currentUser = useSelector((state: RootState) => state.user.user);
  const [topic, setTopic] = useState<TopicInfo | null>(null);
  const [tree, setTree] = useState<BranchNode[]>([]);
  const [relatedTopics, setRelatedTopics] = useState<{title:string;slug:string;tags:string[]}[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<LeafNode | null>(null);
  const [nodeDetail, setNodeDetail] = useState<NodeDetail | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [siblings, setSiblings] = useState<SiblingItem[]>([]);
  const [nodeLoading, setNodeLoading] = useState(false);
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(new Set());
  const [questionInput, setQuestionInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [mobileView, setMobileView] = useState<"tree" | "detail">("tree");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null);
  const sharePosterRef = useRef<HTMLDivElement | null>(null);
  const detailTopRef = React.useRef<HTMLDivElement | null>(null);
  const detailContentRef = React.useRef<HTMLDivElement | null>(null);
  const nextNodePullStartYRef = React.useRef<number | null>(null);
  const nextNodePullDistanceRef = React.useRef(0);
  const nextNodeSwitchingRef = React.useRef(false);
  const [nextNodePullDistance, setNextNodePullDistance] = useState(0);
  const [nextNodePullState, setNextNodePullState] = useState<"idle" | "pulling" | "ready" | "loading">("idle");
  const miniProgramTopicDetail = isMiniProgramTopicDetailView();

  // 展开讲讲
  const [expanding, setExpanding] = useState(false);
  const [expandedContent, setExpandedContent] = useState<string | null>(null);
  const [expandMsg, setExpandMsg] = useState("");
  const [typewriterText, setTypewriterText] = useState("");
  const typewriterRef = React.useRef<number | null>(null);
  const deepExpandRef = React.useRef<number | null>(null); // 深度展开打字机定时器

  const sharePosterData = useMemo<XianfengSharePosterData | null>(() => {
    if (!topic) return null;
    const nodes = tree.flatMap((b) => b.children).slice(0, 12);
    const fallbackTitles = ["核心概念", "常见误区", "理论框架", "风险信号", "评估工具", "自查清单", "科学方法", "成功案例", "家庭协同", "实践路径", "追踪复盘", "长期机制"];
    const iconSlots: XianfengSharePosterData["items"][number]["icon"][] = ["target", "alert", "box", "shield", "chart", "clipboard", "flask", "trophy", "target", "alert", "box", "shield"];
    const items = Array.from({ length: Math.max(4, nodes.length || 12) }).slice(0, 12).map((_, idx) => ({
      title: nodes[idx]?.title || fallbackTitles[idx],
      desc: nodes[idx]?.summary || "系统化理解并形成可执行方法路径",
      icon: iconSlots[idx] || "target",
    }));
    const overviewText = pickShareOverview(topic, tree);
    return {
      brand: "家长先疯 · 先疯智库",
      title: topic.title || "教育主题分享",
      subtitle: topic.subtitle || topic.description || "打开家长先疯，了解更多教育话题",
      tags: (topic.tags || []).slice(0, 3),
      summaryTitle: "知识总览",
      summary: overviewText,
      sectionTitle: "核心知识点",
      sectionDesc: `完整知识树 · ${items.length}大核心模块`,
      items,
      ctaTitle: "扫码查看完整知识树",
      ctaDesc: "打开家长先疯，了解更多教育话题",
      url: `https://xianfeng.xinzhi.info/topics/${encodeURIComponent(topic.slug)}`,
      footerLeft: "xianfeng.xinzhi.info",
      footerRight: "家长先疯 · 先疯智库出品",
    };
  }, [topic, tree]);
  const nextAutoNode = selectedNode ? getNextTopicLeafNode(tree, selectedNode.nodeKey) : null;

  const captureSharePoster = async () => {
    if (!sharePosterRef.current) return;
    try {
      const dataUrl = await toPng(sharePosterRef.current, {
        cacheBust: true,
        pixelRatio: 2,
      });
      setShareImageUrl(dataUrl);
    } catch {
      setShareImageUrl(null);
    }
  };

  useEffect(() => {
    if (!shareModalOpen || !sharePosterData) return;
    const t = window.setTimeout(() => {
      void captureSharePoster();
    }, 80);
    return () => window.clearTimeout(t);
  }, [shareModalOpen, sharePosterData]);

  // 打字机效果：逐字显示
  const startTypewriter = (text: string, onDone?: () => void) => {
    let idx = 0;
    setTypewriterText("");
    const timer = window.setInterval(() => {
      idx++;
      setTypewriterText(text.slice(0, idx));
      if (idx >= text.length) {
        if (typewriterRef.current) clearInterval(typewriterRef.current);
        onDone?.();
      }
    }, 35);
    typewriterRef.current = timer;
  };

  React.useEffect(() => {
    return () => { if (typewriterRef.current) clearInterval(typewriterRef.current); };
  }, []);

  useEffect(() => {
    if (!isMiniProgramTopicDetailView()) return;
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    resetTopicDetailScrollTop();
    const restoreTimer = window.setTimeout(resetTopicDetailScrollTop, 120);
    return () => window.clearTimeout(restoreTimer);
  }, [slug]);

  // ── 分享图生成 ──
  const generateShareImage = async () => {
    if (!topic) return;
    setShareModalOpen(true);
    setShareImageUrl(null);
  };


  // ── 智能提炼卡片组件 ──
  const SummarizedBlock: React.FC<{ summary: string; detail: string }> = ({ summary, detail }) => {
    return (
      <div style={{ margin: "0 0 16px" }}>
        <span style={{
          display: "inline-block",
          fontSize: 11, fontWeight: 700, color: "#7C3AED",
          background: "#EDE9FE", borderRadius: 6, padding: "2px 8px",
          marginBottom: 6,
        }}>
          要点
        </span>
        <div style={{
          borderRadius: 12,
          border: "1px solid #EDE9FE",
          background: "#FAF8FF",
          overflow: "hidden",
        }}>
          <p style={{ margin: 0, padding: "12px 14px", fontSize: 14, color: "#1E1B4B", lineHeight: 1.6, fontWeight: 600 }}>
            {summary}
          </p>
          <p style={{ margin: 0, padding: "0 14px 14px 14px", fontSize: 13, color: "#6B7280", lineHeight: 1.8 }}>
            {detail}
          </p>
        </div>
      </div>
    );
  };

  // ── 智能正文渲染 ──
  const renderContent = (text: string) => {
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let key = 0;
    let inList = false;
    let listItems: React.ReactNode[] = [];

    const parseBold = (s: string): React.ReactNode[] => {
      const parts = s.split(/(\*\*.*?\*\*)/g);
      return parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} style={{ fontWeight: 700, color: "#1E1B4B" }}>{part.slice(2, -2)}</strong>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      });
    };

    const flushList = () => {
      if (inList && listItems.length > 0) {
        elements.push(
          <ol key={key++} style={{
            margin: "6px 0 12px 0",
            paddingLeft: 24,
            listStyle: "none",
            counterReset: "item",
          }}>
            {listItems.map((item, i) => (
              <li
                key={i}
                style={{
                  counterIncrement: "item",
                  marginBottom: 6,
                  lineHeight: 1.7,
                  position: "relative",
                  paddingLeft: 4,
                }}
              >
                <span style={{
                  display: "inline-block",
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #7C3AED, #6D28D9)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  textAlign: "center",
                  lineHeight: "20px",
                  marginRight: 8,
                  flexShrink: 0,
                }}>
                  {i + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        );
        listItems = [];
        inList = false;
      }
    };

    // 先合并连续空行→跳过
    let prevBlank = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 分隔线
      if (line === "---") {
        flushList();
        elements.push(
          <div key={key++} style={{
            borderTop: "2px dashed #DDD6FE",
            margin: "16px 0",
            textAlign: "center",
          }}>
            <span style={{
              fontSize: 11,
              color: "#9CA3AF",
              background: "#F8F5FF",
              padding: "2px 12px",
              borderRadius: 10,
              position: "relative",
              top: -10,
            }}>
              📖 深度扩展
            </span>
          </div>
        );
        prevBlank = false;
        continue;
      }

      // 二级标题 ##
      if (line.startsWith("## ")) {
        flushList();
        elements.push(
          <h3 key={key++} style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 17,
            fontWeight: 700,
            color: "#1E1B4B",
            margin: "20px 0 10px",
            padding: "8px 14px",
            background: "linear-gradient(90deg, #F3EEFF 0%, #FAF8FF 100%)",
            borderRadius: 10,
            borderLeft: "4px solid #7C3AED",
          }}>
            <span style={{ fontSize: 18 }}>📌</span>
            {parseBold(line.replace("## ", ""))}
          </h3>
        );
        prevBlank = false;
        continue;
      }

      // 三级标题 ###
      if (line.startsWith("### ")) {
        flushList();
        elements.push(
          <h4 key={key++} style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 15,
            fontWeight: 600,
            color: "#374151",
            margin: "14px 0 6px",
            paddingLeft: 6,
            borderLeft: "3px solid #A78BFA",
          }}>
            <span style={{ fontSize: 14 }}>🔹</span>
            {parseBold(line.replace("### ", ""))}
          </h4>
        );
        prevBlank = false;
        continue;
      }

      // 空行
      if (line.trim() === "") {
        flushList();
        if (!prevBlank) {
          elements.push(<div key={key++} style={{ height: 10 }} />);
          prevBlank = true;
        }
        continue;
      }

      // 检测序号列表
      const orderedMatch = line.match(/^(\d+)[\.\、\)]\s*(.+)/);
      if (orderedMatch) {
        if (!inList) { flushList(); inList = true; }
        listItems.push(parseBold(orderedMatch[2]));
        prevBlank = false;
        continue;
      }

      // 普通段落
      flushList();
      // 大段落（>150字且无加粗标记）→ 提炼首句 + 折叠展开
      if (line.length > 150 && !line.includes("**")) {
        const sentences = line.split(/。|；/).filter(s => s.trim());
        if (sentences.length >= 3) {
          const firstSentence = sentences[0].trim() + "。";
          const rest = sentences.slice(1).map(s => s.trim()).join("；") + "。";
          const collapseKey = key++;
          elements.push(
            <SummarizedBlock key={collapseKey} summary={firstSentence} detail={rest} />
          );
        } else {
          elements.push(
            <p key={key++} style={{ margin: "0 0 8px", lineHeight: 1.8, fontSize: 14 }}>
              {parseBold(line)}
            </p>
          );
        }
      } else {
        elements.push(
          <p key={key++} style={{ margin: "0 0 8px", lineHeight: 1.8, fontSize: 14 }}>
            {parseBold(line)}
          </p>
        );
      }
      prevBlank = false;
    }
    flushList();
    return elements;
  };

  useEffect(() => {
    fetchTopic();
  }, [slug]);

  const fetchTopic = async () => {
    try {
      const uid = getTopicDetailUserId(currentUser);
      const res = await fetch(`/api/topic-hub/${slug}${uid ? `?userId=${uid}` : ""}`);
      const data = await res.json();
      if (data.topic) {
        setTopic(data.topic);
        setRelatedTopics(data.relatedTopics || []);
        const treeData = data.topic?.layers || data.tree || [];
        const flatTree = transformLayersToTree(treeData);
        setTree(flatTree);
        // 自动选中第一个 branch 的第一个叶子节点
        if (flatTree.length > 0) {
          const firstBranch = flatTree[0];
          if (firstBranch.children && firstBranch.children.length > 0) {
            selectNode(firstBranch.children[0], { scrollIntoView: false, resetTopAfterLoad: true });
          }
        }
      }
    } catch (e) {
      console.error("Failed to load topic", e);
    } finally {
      setLoading(false);
    }
  };

  const selectNode = async (
    node: LeafNode,
    options: { scrollIntoView?: boolean; resetTopAfterLoad?: boolean; resetDetailScroll?: boolean } = {}
  ) => {
    // 终止旧的深度展开打字机
    if (deepExpandRef.current !== null) {
      window.clearTimeout(deepExpandRef.current);
      deepExpandRef.current = null;
    }
    setSelectedNode(node);
    const shouldScrollIntoView = options.scrollIntoView !== false;
    const isMobileViewport = typeof window !== "undefined" && window.innerWidth < 1024;
    if (isMobileViewport) {
      setMobileView("detail");
      if (shouldScrollIntoView) {
        window.setTimeout(() => {
          detailTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 10);
      }
    }
    setNodeLoading(true);
    setExpandedContent(null);
    setExpandMsg("");
    setExpanding(false);
    setTypewriterText("");
    try {
      const uid = getTopicDetailUserId(currentUser);
      const res = await fetch(`/api/topic-hub/${slug}/nodes/${node.nodeKey}${uid ? `?userId=${uid}` : ""}`);
      const data = await res.json();
      setNodeDetail(data.node || null);
      setQuestions(data.questions || []);
      setSiblings(data.siblings || []);
    } catch (e) {
      console.error("Failed to load node", e);
    } finally {
      setNodeLoading(false);
      nextNodePullStartYRef.current = null;
      nextNodePullDistanceRef.current = 0;
      nextNodeSwitchingRef.current = false;
      setNextNodePullDistance(0);
      setNextNodePullState("idle");
      if (options.resetDetailScroll !== false) {
        detailContentRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
      if (options.resetTopAfterLoad && isMiniProgramTopicDetailView()) resetTopicDetailScrollTop();
    }
  };

  const resetNextNodePull = () => {
    nextNodePullStartYRef.current = null;
    nextNodePullDistanceRef.current = 0;
    setNextNodePullDistance(0);
    setNextNodePullState("idle");
  };

  const enterNextNode = () => {
    if (!miniProgramTopicDetail || !nextAutoNode || nodeLoading || expanding || nextNodePullState === "loading" || nextNodeSwitchingRef.current) return;
    nextNodeSwitchingRef.current = true;
    nextNodePullStartYRef.current = null;
    nextNodePullDistanceRef.current = 0;
    setNextNodePullDistance(NEXT_NODE_PULL_THRESHOLD);
    setNextNodePullState("loading");
    void selectNode(nextAutoNode, { scrollIntoView: true, resetDetailScroll: true, resetTopAfterLoad: true });
  };

  const handleNextNodeClick = () => {
    enterNextNode();
  };

  const handleNextNodePullStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!miniProgramTopicDetail || !nextAutoNode || nodeLoading || expanding || nextNodePullState === "loading") return;
    nextNodePullStartYRef.current = event.touches[0]?.clientY ?? null;
    nextNodePullDistanceRef.current = 0;
    setNextNodePullDistance(0);
    setNextNodePullState("pulling");
  };

  const handleNextNodePullMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!miniProgramTopicDetail || !nextAutoNode || nextNodePullStartYRef.current === null || nextNodePullState === "loading") return;
    const touchY = event.touches[0]?.clientY;
    if (touchY === undefined) return;
    const rawDistance = nextNodePullStartYRef.current - touchY;
    if (rawDistance <= 0) {
      resetNextNodePull();
      return;
    }

    if (rawDistance > 8) event.preventDefault();
    const pullDistance = Math.min(rawDistance, NEXT_NODE_PULL_MAX);
    nextNodePullDistanceRef.current = pullDistance;
    setNextNodePullDistance(pullDistance);
    if (pullDistance >= NEXT_NODE_PULL_THRESHOLD) {
      setNextNodePullState("ready");
    } else {
      setNextNodePullState("pulling");
    }
  };

  const handleNextNodePullEnd = () => {
    if (!miniProgramTopicDetail || !nextAutoNode || nextNodePullStartYRef.current === null || nextNodePullState === "loading") return;
    nextNodePullStartYRef.current = null;
    if (nextNodePullDistanceRef.current >= NEXT_NODE_PULL_THRESHOLD) {
      enterNextNode();
      return;
    }
    resetNextNodePull();
  };

  // 展开讲讲
  const handleExpand = async () => {
    if (!selectedNode || !nodeDetail || !topic) return;
    setExpanding(true);
    setExpandMsg("");
    setTypewriterText("");
    // 重新展开时去掉上次的「以上。」
    const rawContent = (nodeDetail?.content || expandedContent || "").replace(/\n*以上。$/, "");
    const currentContent = rawContent;
    try {
      const res = await fetch(`/api/topic-hub/${topic.slug}/expand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeKey: selectedNode.nodeKey,
          nodeTitle: nodeDetail.title || selectedNode.title,
          topicTitle: topic.title,
          deep: true,
          existingContent: currentContent,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const expanded = data.expanded || "";
        // deep/ai 返回：找增量部分，只对新内容打字机，老内容不动
        const separatorIdx = expanded.indexOf("\n\n---\n\n");
        const prefix = separatorIdx > -1 ? expanded.slice(0, separatorIdx) : "";
        const suffix = separatorIdx > -1 ? expanded.slice(separatorIdx) : expanded;
        if (separatorIdx > -1 && suffix.length > 8) {
          // 老内容瞬间展示，增量逐字打字机（慢速 + 随机停顿 + 自动滚到底）
          setExpandedContent(prefix);
          setNodeDetail((prev) => prev ? { ...prev, content: prefix } : null);
          let idx = 0;
          let framePending = false;
          const scrollToBottom = () => {
            if (framePending) return;
            framePending = true;
            requestAnimationFrame(() => {
              framePending = false;
              const anchor = document.getElementById("topic-expand-anchor");
              if (anchor) anchor.scrollIntoView({ behavior: "instant", block: "center" });
            });
          };
          const typeNext = () => {
            // 每次打 1~2 个字，偶尔停顿模拟思考
            const step = Math.random() < 0.15 ? 0 : (Math.random() < 0.6 ? 1 : 2);
            idx += step;
            if (idx >= suffix.length) {
              const finalContent = prefix + suffix + "\n\n以上。";
              setExpandedContent(finalContent);
              setNodeDetail((prev) => prev ? { ...prev, content: finalContent } : null);
              setExpanding(false);
              return;
            }
            setExpandedContent(prefix + suffix.slice(0, idx));
            setNodeDetail((prev) => prev ? { ...prev, content: prefix + suffix.slice(0, idx) } : null);
            scrollToBottom();
            // 30~80ms 常规间隔，15% 概率停顿 150~400ms
            const delay = step === 0 ? 150 + Math.random() * 250 : 30 + Math.random() * 50;
            deepExpandRef.current = window.setTimeout(typeNext, delay);
          };
          typeNext();
          return;
        }
        // 无分隔线或首次生成：直接展示
        setExpandedContent(expanded);
        setNodeDetail((prev) => prev ? { ...prev, content: expanded } : null);
      } else {
        setExpandMsg(data.error || "展开失败");
      }
    } catch (e: any) {
      setExpandMsg(e.message || "网络错误");
    } finally {
      setExpanding(false);
    }
  };

  const toggleBranch = (nodeKey: string) => {
    setCollapsedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(nodeKey)) next.delete(nodeKey);
      else next.add(nodeKey);
      return next;
    });
  };

  const askQuestion = async () => {
    if (!questionInput.trim() || !selectedNode) return;
    setAsking(true);
    try {
      const res = await fetch(`/api/topic-hub/${slug}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeKey: selectedNode.nodeKey,
          question: questionInput.trim(),
          userName: "家长",
        }),
      });
      const data = await res.json();
      // 把新回答加入到列表
      setQuestions((prev) => [
        {
          id: Date.now(),
          user_name: "家长",
          question: questionInput.trim(),
          ai_answer: data.aiAnswer || "",
          helpful_count: 0,
        },
        ...prev,
      ]);
      setQuestionInput("");
    } catch (e) {
      console.error("Failed to ask question", e);
    } finally {
      setAsking(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8f6ff" }}>
        <style>{`
          html.xf-mp-webview .xf-web-detail-back {
            display: none !important;
          }
          html.xf-mp-webview .topic-detail-frame {
            padding-top: var(--xf-mp-nav-height, 88px) !important;
            padding-bottom: 0 !important;
          }
        `}</style>
        <GlobalPublicNav compactMobile showPlanningEntry={true} />
        <div className="topic-detail-frame" style={{ textAlign: "center", padding: 100, color: "#9CA3AF" }}>加载中…</div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8f6ff" }}>
        <style>{`
          html.xf-mp-webview .xf-web-detail-back {
            display: none !important;
          }
          html.xf-mp-webview .topic-detail-frame {
            padding-top: var(--xf-mp-nav-height, 88px) !important;
            padding-bottom: 0 !important;
          }
        `}</style>
        <GlobalPublicNav compactMobile showPlanningEntry={true} />
        <div className="topic-detail-frame" style={{ textAlign: "center", padding: 100 }}>
          <p style={{ color: "#9CA3AF", marginBottom: 16 }}>话题不存在</p>
          <Link to="/topics" className="xf-web-detail-back" style={{ color: "#7C3AED" }}>
            ← 返回
          </Link>
        </div>
      </div>
    );
  }

  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const isPhone = typeof window !== "undefined" && window.innerWidth < 768;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const shareModalPadding = isPhone ? 12 : 20;
  const sharePreviewWidth = Math.min(
    SHARE_POSTER_WIDTH,
    Math.max(280, viewportWidth - shareModalPadding * 2 - (isPhone ? 44 : 56))
  );
  const sharePosterHeight = sharePosterData ? getSharePosterHeight(sharePosterData) : SHARE_POSTER_HEIGHT;
  const sharePreviewScale = sharePreviewWidth / SHARE_POSTER_WIDTH;
  const sharePreviewHeight = Math.round(sharePosterHeight * sharePreviewScale);
  const nextNodePullProgress = Math.min(1, nextNodePullDistance / NEXT_NODE_PULL_THRESHOLD);
  const nextNodePullTitle =
    nextNodePullState === "loading"
      ? "正在进入下一个知识点"
      : nextNodePullState === "ready"
        ? "松开进入下一个知识点"
        : "上滑进入下一个知识点";
  const nextNodePullMeta =
    nextNodePullState === "ready"
      ? "松手后自动切换"
      : nextNodePullState === "loading"
        ? "正在切换，请稍候"
        : "";

  return (
    <>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes topicPullPulse { 0%,100%{transform:translateY(0);opacity:.62} 50%{transform:translateY(-3px);opacity:1} }
        html.xf-mp-webview .topic-mobile-safe {
          padding-bottom: 0 !important;
        }
        html.xf-mp-webview .topic-detail-frame {
          padding-top: var(--xf-mp-nav-height, 88px) !important;
          padding-bottom: 0 !important;
        }
        html.xf-mp-webview .xf-web-detail-back {
          display: none !important;
        }
        .topic-next-pull-card {
          margin-top: 10px;
          border-radius: 16px;
          border: 1px solid #e9ddff;
          background:
            linear-gradient(135deg, rgba(255,255,255,.95) 0%, rgba(247,242,255,.95) 100%),
            linear-gradient(90deg, rgba(124,58,237,.16) calc(var(--pull-progress, 0) * 100%), transparent 0);
          padding: 12px 14px;
          color: #1e1b4b;
          box-shadow: 0 10px 24px rgba(93, 55, 168, 0.08);
          touch-action: none;
          user-select: none;
          transition: transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease;
        }
        .topic-next-pull-card--pulling {
          transform: translateY(calc(var(--pull-progress, 0) * -8px));
        }
        .topic-next-pull-card--ready {
          border-color: #7c3aed;
          transform: translateY(-10px) scale(1.01);
          box-shadow: 0 16px 32px rgba(124, 58, 237, 0.18);
        }
        .topic-next-pull-card--loading {
          border-color: #7c3aed;
          opacity: .9;
        }
        .topic-next-pull-card--done {
          border-style: dashed;
          background: linear-gradient(135deg, #faf8ff 0%, #ffffff 100%);
          box-shadow: none;
          touch-action: auto;
        }
        .topic-next-pull-card-head {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .topic-next-pull-icon {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #ede9fe;
          color: #7c3aed;
          font-size: 18px;
          font-weight: 900;
          animation: topicPullPulse 1.1s ease-in-out infinite;
          flex: 0 0 auto;
        }
        .topic-next-pull-card--ready .topic-next-pull-icon,
        .topic-next-pull-card--loading .topic-next-pull-icon {
          background: #7c3aed;
          color: #fff;
        }
        .topic-next-pull-title {
          display: block;
          font-size: 15px;
          font-weight: 800;
          line-height: 1.35;
        }
        .topic-next-pull-meta {
          display: block;
          margin-top: 2px;
          color: #7c3aed;
          font-size: 12px;
          font-weight: 700;
        }
        .topic-next-pull-track {
          margin-top: 10px;
          height: 4px;
          border-radius: 999px;
          background: #ede9fe;
          overflow: hidden;
        }
        .topic-next-pull-fill {
          height: 100%;
          width: calc(var(--pull-progress, 0) * 100%);
          border-radius: inherit;
          background: linear-gradient(90deg, #8b5cf6, #6d28d9);
          transition: width .08s linear;
        }
        .topic-expand-button-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          flex: 0 0 18px;
          font-size: 18px;
          line-height: 1;
        }
        @media (max-width: 768px) {
          .topic-mobile-safe { padding-bottom: calc(120px + env(safe-area-inset-bottom)); }
          html.xf-mp-webview .topic-mobile-safe { padding-bottom: 0 !important; }
          html.xf-mp-webview .topic-detail-frame {
            padding-top: var(--xf-mp-nav-height, 88px) !important;
            padding-bottom: 0 !important;
          }
          .topic-mobile-title { font-size: 22px !important; line-height: 1.25 !important; }
          .topic-mobile-card { border-radius: 12px !important; }
          .topic-mobile-pad { padding: 14px !important; }
        }
      `}</style>
    <div className="topic-mobile-safe" style={{ minHeight: "100vh", background: "#f8f6ff" }}>
            <GlobalPublicNav compactMobile showPlanningEntry={true} />

      {/* 顶栏 */}
      <div
        className="topic-detail-frame"
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: isPhone ? "70px 12px 0" : "60px 20px 0",
        }}
      >
        <Link
          to="/topics"
          className="xf-web-detail-back"
          style={{
            color: "#7C3AED",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          ← 返回
        </Link>
        <div style={{ marginTop: 16, marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <h1
              className="topic-mobile-title"
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "#1E1B4B",
                margin: "8px 0 4px",
              }}
            >
              {topic.title}
            </h1>
            <button
              onClick={generateShareImage}
              style={{
                flexShrink: 0,
                padding: isPhone ? "8px 12px" : "10px 20px",
                borderRadius: 10,
                border: "1px solid #E9E3F8",
                background: "#fff",
                color: "#7C4DFF",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              📤 分享
            </button>
          </div>
          {/* 副标题：独占一行 */}
          {topic.subtitle && (
            <p style={{ color: "#6B7280", fontSize: 14, margin: 0 }}>
              {topic.subtitle}
            </p>
          )}
          {/* 相关内容：始终在副标题下一行 */}
          {relatedTopics.length > 0 && (
            <p style={{ color: "#9CA3AF", fontSize: 12, margin: topic.subtitle ? "6px 0 0" : "4px 0 0" }}>
              相关内容：
              {relatedTopics.map((rt, i) => (
                <span key={rt.slug}>
                  <a
                    href={`/topics/${rt.slug}`}
                    style={{ color: "#7C3AED", textDecoration: "none" }}
                    onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                    onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                  >
                    {rt.title}
                  </a>
                  {i < relatedTopics.length - 1 && <span style={{ color: "#D1D5DB" }}> · </span>}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>

      {/* 主体：左右分栏（桌面）/ 上下布局（手机） */}
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: isPhone ? "12px 12px 32px" : "20px 20px 40px",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: 24,
        }}
      >
        {isMobile ? (
          <div
            style={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginBottom: 6,
              position: "sticky",
              top: 62,
              zIndex: 8,
              background: "rgba(248,246,255,.92)",
              backdropFilter: "blur(6px)",
              padding: "4px 2px",
              borderRadius: 12,
            }}
          >
            <button
              type="button"
              onClick={() => setMobileView("tree")}
              style={{
                height: 40,
                borderRadius: 10,
                border: mobileView === "tree" ? "1px solid #7C3AED" : "1px solid #E5E7EB",
                background: mobileView === "tree" ? "#7C3AED" : "#fff",
                color: mobileView === "tree" ? "#fff" : "#4B5563",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              知识目录
            </button>
            <button
              type="button"
              onClick={() => setMobileView("detail")}
              style={{
                height: 40,
                borderRadius: 10,
                border: mobileView === "detail" ? "1px solid #7C3AED" : "1px solid #E5E7EB",
                background: mobileView === "detail" ? "#7C3AED" : "#fff",
                color: mobileView === "detail" ? "#fff" : "#4B5563",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              节点详情
            </button>
          </div>
        ) : null}
        {/* 左侧：知识树 */}
        <div
          style={{
            flex: isMobile ? "none" : "0 0 55%",
            overflowY: "auto",
            display: isMobile && mobileView !== "tree" ? "none" : "block",
          }}
        >
          {tree.map((branch) => (
            <div
              key={branch.nodeKey}
              style={{
                background: "#fff",
                borderRadius: isPhone ? 12 : 14,
                marginBottom: 16,
                border: "1px solid #F3F0FF",
                overflow: "hidden",
              }}
            >
              {/* 分支标题（可折叠） */}
              <div
                onClick={() => toggleBranch(branch.nodeKey)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: isPhone ? "13px 14px" : "16px 20px",
                  cursor: "pointer",
                  background: "#EDE5FF",
                  borderBottom: collapsedBranches.has(branch.nodeKey)
                    ? "none"
                    : "1px solid #D8C8F0",
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    transform: collapsedBranches.has(branch.nodeKey)
                      ? "rotate(-90deg)"
                      : "rotate(0deg)",
                    transition: "transform 0.2s",
                    color: "#7C3AED",
                  }}
                >
                  ▼
                </span>
                <span style={{ fontSize: 17, fontWeight: 600, color: "#5B21B6" }}>
                  🌿 {branch.title}
                </span>
              </div>

              {/* 叶子节点列表 */}
              {!collapsedBranches.has(branch.nodeKey) &&
                branch.children?.map((leaf) => (
                  <div
                    key={leaf.nodeKey}
                    onClick={() => selectNode(leaf)}
                    style={{
                      padding: isPhone ? "12px 12px 12px 32px" : "14px 20px 14px 48px",
                      cursor: "pointer",
                      borderBottom: "1px solid #D8C8F0",
                      background:
                        selectedNode?.nodeKey === leaf.nodeKey
                          ? "#E4D4F8"
                          : "transparent",
                      borderLeft:
                        selectedNode?.nodeKey === leaf.nodeKey
                          ? "3px solid #7C3AED"
                          : "3px solid transparent",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedNode?.nodeKey !== leaf.nodeKey)
                        e.currentTarget.style.background = "#F0E8FC";
                    }}
                    onMouseLeave={(e) => {
                      if (selectedNode?.nodeKey !== leaf.nodeKey)
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: "#1E1B4B",
                          flex: 1,
                        }}
                      >
                        {leaf.title}
                      </span>
                      {leaf.questionCount > 0 && (
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 10,
                            background: "#EDE9FE",
                            color: "#7C3AED",
                            fontWeight: 500,
                          }}
                        >
                          {leaf.questionCount} 💬
                        </span>
                      )}
                    </div>
                    {leaf.summary && (
                      <p
                        style={{
                          fontSize: 12,
                          color: "#9CA3AF",
                          margin: "4px 0 0 24px",
                          lineHeight: 1.5,
                        }}
                      >
                        {leaf.summary}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          ))}
        </div>

        {/* 右侧：节点详情 */}
        <div
          ref={detailTopRef}
          style={{
            flex: 1,
            position: isMobile ? "static" : "sticky",
            top: 20,
            alignSelf: "flex-start",
            display: isMobile && mobileView !== "detail" ? "none" : "block",
          }}
        >
          {!selectedNode ? (
            <div
              style={{
                background: "#fff",
                borderRadius: isPhone ? 12 : 14,
                padding: isPhone ? 20 : 40,
                textAlign: "center",
                border: "1px solid #F3F0FF",
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>👆</div>
              <p style={{ color: "#9CA3AF", fontSize: 14, margin: 0 }}>
                点击左侧知识点查看详细内容
              </p>
            </div>
          ) : nodeLoading ? (
            <div
              style={{
                background: "#fff",
                borderRadius: isPhone ? 12 : 14,
                padding: isPhone ? 20 : 40,
                textAlign: "center",
                border: "1px solid #F3F0FF",
              }}
            >
              <p style={{ color: "#9CA3AF" }}>加载中…</p>
            </div>
          ) : (
            <div
              style={{
                background: "#fff",
                borderRadius: isPhone ? 12 : 14,
                border: "1px solid #F3F0FF",
                overflow: "hidden",
              }}
            >
              {/* 节点头部 */}
              <div style={{ padding: "20px 24px", borderBottom: "1px solid #EDE9FE" }}>
                <h2
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#1E1B4B",
                    margin: "0 0 8px",
                  }}
                >
                  {nodeDetail?.title || selectedNode.title}
                </h2>
                {nodeDetail?.hasQuiz && (
                  <span
                    style={{
                      fontSize: 12,
                      padding: "3px 10px",
                      borderRadius: 10,
                      background: "#FEF3C7",
                      color: "#92400E",
                      fontWeight: 500,
                    }}
                  >
                    📝 可自测
                  </span>
                )}
                {/* 同级节点快捷导航 */}
                {siblings.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                    {siblings.map((sib) => (
                      <button
                        key={sib.nodeKey}
                        onClick={() => {
                          const found = tree
                            .flatMap((b) => b.children || [])
                            .find((l) => l.nodeKey === sib.nodeKey);
                          if (found) selectNode(found);
                        }}
                        style={{
                          fontSize: 11,
                          padding: "4px 10px",
                          borderRadius: 8,
                          border: "1px solid #E5E7EB",
                          background: "#fff",
                          color: "#6B7280",
                          cursor: "pointer",
                        }}
                      >
                        {sib.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 内容区 */}
              <div
                ref={detailContentRef}
                style={{ padding: "20px 24px", maxHeight: isMobile ? "none" : "calc(100vh - 240px)", overflowY: isMobile ? "visible" : "auto" }}
              >
                {/* 核心观点 */}
                {nodeDetail?.keyPoints && nodeDetail.keyPoints.length > 0 && (
                  <div
                    style={{
                      background: "#F0FDF4",
                      borderRadius: 10,
                      padding: 16,
                      marginBottom: 20,
                    }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#166534", margin: "0 0 8px" }}>
                      💡 核心观点
                    </p>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {nodeDetail.keyPoints.map((kp: string, i: number) => (
                        <li
                          key={i}
                          style={{
                            fontSize: 13,
                            color: "#374151",
                            marginBottom: 4,
                            lineHeight: 1.6,
                          }}
                        >
                          {kp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 正文 - 智能排版渲染 */}
                {(nodeDetail?.content || expandedContent) && (
                  <div style={{ color: "#374151" }}>
                    {renderContent(expandedContent || nodeDetail!.content)}
                    {/* 打字机自动滚动锚点 - 放在内容末尾 */}
                    <div id="topic-expand-anchor" style={{ height: 1 }} />
                  </div>
                )}

                {/* 参考来源 */}
                {nodeDetail?.references && nodeDetail.references.length > 0 && (
                  <div
                    style={{
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      paddingTop: 16,
                      marginTop: 20,
                    }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#6B7280", margin: "0 0 8px" }}>
                      📚 参考来源
                    </p>
                    {nodeDetail.references.map((ref, i) => (
                      <a
                        key={i}
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "block",
                          fontSize: 12,
                          color: "#7C3AED",
                          textDecoration: "none",
                          marginBottom: 4,
                        }}
                      >
                        · {ref.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* 展开讲讲 - 卡片外紧贴底部 */}
          {selectedNode && nodeDetail && (
            <div style={{ marginTop: 12 }}>
              <div
                onClick={() => !expanding && handleExpand()}
                style={{
                  width: "100%",
                  padding: "12px 0",
                  borderRadius: 12,
                  border: "none",
                  background: expanding
                    ? "linear-gradient(135deg, #A78BFA, #8B5CF6)"
                    : "linear-gradient(135deg, #7C3AED, #6D28D9)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: expanding ? "wait" : "pointer",
                  textAlign: "center",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {miniProgramTopicDetail ? (
                  <span className="topic-expand-button-icon" aria-hidden="true">✦</span>
                ) : (
                  <span style={{ fontFamily: "'Material Symbols Rounded'", fontSize: 18 }}>auto_awesome</span>
                )}
                <span>{expanding ? "正在深度解析~" : "展开讲讲"}</span>
              </div>
              {expandMsg && (
                <div style={{
                  marginTop: 6,
                  textAlign: "center",
                  fontSize: 12,
                  color: expandMsg.includes("失败") || expandMsg.includes("错误") ? "#DC2626" : "#166534",
                  minHeight: 18,
                }}>
                  {typewriterText || expandMsg}
                  {expanding && <span style={{ animation: "blink 0.8s infinite", marginLeft: 2 }}>▊</span>}
                </div>
              )}
              {miniProgramTopicDetail && nextAutoNode && (
                <div
                  className={`topic-next-pull-card topic-next-pull-card--${nextNodePullState}`}
                  onClick={handleNextNodeClick}
                  onTouchStart={handleNextNodePullStart}
                  onTouchMove={handleNextNodePullMove}
                  onTouchEnd={handleNextNodePullEnd}
                  onTouchCancel={resetNextNodePull}
                  title="点击进入下一个知识点"
                  style={{ "--pull-progress": nextNodePullProgress } as React.CSSProperties}
                >
                  <div className="topic-next-pull-card-head">
                    <span className="topic-next-pull-icon">↑</span>
                    <div style={{ minWidth: 0 }}>
                      <span className="topic-next-pull-title">{nextNodePullTitle}</span>
                      <span className="topic-next-pull-meta">
                        {nextNodePullMeta ? `${nextNodePullMeta} · ` : ""}下一个：{nextAutoNode.title}
                      </span>
                    </div>
                  </div>
                  <div className="topic-next-pull-track">
                    <div className="topic-next-pull-fill" />
                  </div>
                </div>
              )}
              {miniProgramTopicDetail && !nextAutoNode && (
                <div className="topic-next-pull-card topic-next-pull-card--done">
                  <div className="topic-next-pull-card-head">
                    <span className="topic-next-pull-icon">✓</span>
                    <div style={{ minWidth: 0 }}>
                      <span className="topic-next-pull-title">已读完当前话题</span>
                      <span className="topic-next-pull-meta">当前是最后一个知识节点，可以返回知识目录继续浏览</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
      {/* 分享弹窗 */}
      {shareModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShareModalOpen(false);
              setShareImageUrl(null);
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 9999,
            display: "flex",
            alignItems: isPhone ? "flex-start" : "center",
            justifyContent: "center",
            padding: isPhone ? "68px 12px calc(18px + env(safe-area-inset-bottom))" : 20,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: isPhone ? 22 : 24,
              padding: isPhone ? 16 : 28,
              width: isPhone ? "100%" : "fit-content",
              maxWidth: isPhone ? "calc(100vw - 24px)" : "96vw",
              maxHeight: isPhone ? "calc(100vh - 86px - env(safe-area-inset-bottom))" : "90vh",
              overflow: "auto",
              textAlign: "center",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isPhone ? 12 : 16 }}>
              <span style={{ fontSize: isPhone ? 17 : 18, fontWeight: 700, color: "#1E1B4B" }}>📤 分享话题</span>
              <button
                onClick={() => { setShareModalOpen(false); setShareImageUrl(null); }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 24,
                  color: "#9CA3AF",
                  cursor: "pointer",
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
            {sharePosterData ? (
              <>
                <div
                  style={{
                    marginBottom: isPhone ? 14 : 18,
                    width: sharePreviewWidth,
                    height: sharePreviewHeight,
                    maxWidth: "100%",
                    maxHeight: isPhone ? "58vh" : "68vh",
                    overflow: "auto",
                    borderRadius: isPhone ? 14 : 16,
                    border: "1px solid #EBE3FF",
                    background: "#F4EFFF",
                    WebkitOverflowScrolling: "touch",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      width: sharePreviewWidth,
                      height: sharePreviewHeight,
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: SHARE_POSTER_WIDTH,
                        height: sharePosterHeight,
                        textAlign: "left",
                        transformOrigin: "top left",
                        transform: `scale(${sharePreviewScale})`,
                      }}
                    >
                      <div
                        ref={sharePosterRef}
                        style={{
                          width: SHARE_POSTER_WIDTH,
                          height: sharePosterHeight,
                          textAlign: "left",
                        }}
                      >
                        <XianfengSharePoster data={sharePosterData} />
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: isPhone ? 8 : 10, justifyContent: "center", flexWrap: "wrap" }}>
                  <a
                    href={shareImageUrl || undefined}
                    download={`${topic?.title || "话题"}_分享图.png`}
                    style={{
                      flex: isPhone ? "1 1 0" : "0 0 auto",
                      minWidth: isPhone ? 0 : undefined,
                      padding: isPhone ? "10px 12px" : "10px 24px",
                      borderRadius: 14,
                      background: "linear-gradient(135deg, #7C4DFF, #9F7BFF)",
                      color: shareImageUrl ? "#fff" : "rgba(255,255,255,0.7)",
                      fontSize: isPhone ? 15 : 16,
                      fontWeight: 700,
                      textDecoration: "none",
                      pointerEvents: shareImageUrl ? "auto" : "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {shareImageUrl ? "💾 保存图片" : "正在生成…"}
                  </a>
                  <button
                    onClick={async () => {
                      if (!shareImageUrl) return;
                      try {
                        const blob = await fetch(shareImageUrl).then(r => r.blob());
                        await navigator.clipboard.write([
                          new ClipboardItem({ [blob.type]: blob })
                        ]);
                        alert("已复制到剪贴板");
                      } catch {
                        alert("复制失败，请长按图片保存");
                      }
                    }}
                    style={{
                      flex: isPhone ? "1 1 0" : "0 0 auto",
                      minWidth: isPhone ? 0 : undefined,
                      padding: isPhone ? "10px 12px" : "10px 24px",
                      borderRadius: 14,
                      border: "1px solid #E9E3F8",
                      background: "#fff",
                      color: shareImageUrl ? "#7C4DFF" : "#B9A8E8",
                      fontSize: isPhone ? 15 : 16,
                      fontWeight: 700,
                      cursor: shareImageUrl ? "pointer" : "not-allowed",
                      whiteSpace: "nowrap",
                    }}
                    disabled={!shareImageUrl}
                  >
                    📋 复制图片
                  </button>
                </div>
                <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 12 }}>
                  长按图片也可保存到相册
                </p>
              </>
            ) : (
              <div style={{ padding: 40 }}>
                <p style={{ color: "#9CA3AF" }}>正在生成分享图…</p>
              </div>
            )}
          </div>
        </div>
      )}

    </>
  );
};

export default TopicDetailPage;
