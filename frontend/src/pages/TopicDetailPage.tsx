import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import GlobalPublicNav from "../components/GlobalPublicNav";
import type { RootState } from "../store";
import { getTopicUserId } from "../utils/topicUserId";

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

  // 展开讲讲
  const [expanding, setExpanding] = useState(false);
  const [expandedContent, setExpandedContent] = useState<string | null>(null);
  const [expandMsg, setExpandMsg] = useState("");
  const [typewriterText, setTypewriterText] = useState("");
  const typewriterRef = React.useRef<number | null>(null);
  const deepExpandRef = React.useRef<number | null>(null); // 深度展开打字机定时器

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
      const uid = getTopicUserId(currentUser);
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
            selectNode(firstBranch.children[0]);
          }
        }
      }
    } catch (e) {
      console.error("Failed to load topic", e);
    } finally {
      setLoading(false);
    }
  };

  const selectNode = async (node: LeafNode) => {
    // 终止旧的深度展开打字机
    if (deepExpandRef.current !== null) {
      window.clearTimeout(deepExpandRef.current);
      deepExpandRef.current = null;
    }
    setSelectedNode(node);
    setNodeLoading(true);
    setExpandedContent(null);
    setExpandMsg("");
    setExpanding(false);
    setTypewriterText("");
    try {
      const uid = getTopicUserId(currentUser);
      const res = await fetch(`/api/topic-hub/${slug}/nodes/${node.nodeKey}${uid ? `?userId=${uid}` : ""}`);
      const data = await res.json();
      setNodeDetail(data.node || null);
      setQuestions(data.questions || []);
      setSiblings(data.siblings || []);
    } catch (e) {
      console.error("Failed to load node", e);
    } finally {
      setNodeLoading(false);
    }
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
        <GlobalPublicNav showPlanningEntry={true} />
        <div style={{ textAlign: "center", padding: 100, color: "#9CA3AF" }}>加载中…</div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8f6ff" }}>
        <GlobalPublicNav showPlanningEntry={true} />
        <div style={{ textAlign: "center", padding: 100 }}>
          <p style={{ color: "#9CA3AF", marginBottom: 16 }}>话题不存在</p>
          <Link to="/topics" style={{ color: "#7C3AED" }}>
            ← 返回话题广场
          </Link>
        </div>
      </div>
    );
  }

  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;

  return (
    <>
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    <div style={{ minHeight: "100vh", background: "#f8f6ff" }}>
            <GlobalPublicNav showPlanningEntry={true} />

      {/* 顶栏 */}
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "60px 20px 0",
        }}
      >
        <Link
          to="/topics"
          style={{
            color: "#7C3AED",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          ← 返回话题广场
        </Link>
        <div style={{ marginTop: 16, marginBottom: 4 }}>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: "#1E1B4B",
              margin: "8px 0 4px",
            }}
          >
            {topic.title}
          </h1>
          {topic.subtitle && (
            <p style={{ color: "#6B7280", fontSize: 14, margin: 0 }}>
              {topic.subtitle}
              {/* 相关内容：与副标题同行 */}
              {relatedTopics.length > 0 && (
                <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: 16 }}>
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
                </span>
              )}
            </p>
          )}
          {/* 无副标题但有相关内容时，单独显示 */}
          {!topic.subtitle && relatedTopics.length > 0 && (
            <p style={{ color: "#9CA3AF", fontSize: 12, margin: "4px 0 0" }}>
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
          padding: "20px 20px 40px",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: 24,
        }}
      >
        {/* 左侧：知识树 */}
        <div
          style={{
            flex: isMobile ? "none" : "0 0 55%",
            overflowY: "auto",
          }}
        >
          {tree.map((branch) => (
            <div
              key={branch.nodeKey}
              style={{
                background: "#fff",
                borderRadius: 14,
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
                  padding: "16px 20px",
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
                      padding: "14px 20px 14px 48px",
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
          style={{
            flex: 1,
            position: isMobile ? "static" : "sticky",
            top: 20,
            alignSelf: "flex-start",
          }}
        >
          {!selectedNode ? (
            <div
              style={{
                background: "#fff",
                borderRadius: 14,
                padding: 40,
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
                borderRadius: 14,
                padding: 40,
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
                borderRadius: 14,
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
              <div style={{ padding: "20px 24px", maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
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
                <span style={{ fontFamily: "'Material Symbols Rounded'", fontSize: 18 }}>auto_awesome</span>
                {expanding ? "正在深度解析~" : "展开讲讲"}
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
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
};

export default TopicDetailPage;
