import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import GlobalPublicNav from "../components/GlobalPublicNav";

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

const TopicDetailPage: React.FC<{ slug: string }> = ({ slug }) => {
  const [topic, setTopic] = useState<TopicInfo | null>(null);
  const [tree, setTree] = useState<BranchNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<LeafNode | null>(null);
  const [nodeDetail, setNodeDetail] = useState<NodeDetail | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [siblings, setSiblings] = useState<SiblingItem[]>([]);
  const [nodeLoading, setNodeLoading] = useState(false);
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(new Set());
  const [questionInput, setQuestionInput] = useState("");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    fetchTopic();
  }, [slug]);

  const fetchTopic = async () => {
    try {
      const res = await fetch(`/api/topic-hub/${slug}`);
      const data = await res.json();
      if (data.topic) {
        setTopic(data.topic);
        setTree(data.tree || []);
      }
    } catch (e) {
      console.error("Failed to load topic", e);
    } finally {
      setLoading(false);
    }
  };

  const selectNode = async (node: LeafNode) => {
    setSelectedNode(node);
    setNodeLoading(true);
    try {
      const res = await fetch(`/api/topic-hub/${slug}/nodes/${node.nodeKey}`);
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
    <div style={{ minHeight: "100vh", background: "#f8f6ff" }}>
            <GlobalPublicNav showPlanningEntry={true} />

      {/* 顶栏 */}
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "30px 20px 0",
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
          <span style={{ fontSize: 40 }}>{topic.coverEmoji}</span>
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
            <p style={{ color: "#6B7280", fontSize: 14, margin: 0 }}>{topic.subtitle}</p>
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
                  background: "#F8F5FF",
                  borderBottom: collapsedBranches.has(branch.nodeKey)
                    ? "none"
                    : "1px solid #EDE9FE",
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
                      borderBottom: "1px solid #EDE9FE",
                      background:
                        selectedNode?.nodeKey === leaf.nodeKey
                          ? "#F3EEFF"
                          : "transparent",
                      borderLeft:
                        selectedNode?.nodeKey === leaf.nodeKey
                          ? "3px solid #7C3AED"
                          : "3px solid transparent",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedNode?.nodeKey !== leaf.nodeKey)
                        e.currentTarget.style.background = "#FAF8FF";
                    }}
                    onMouseLeave={(e) => {
                      if (selectedNode?.nodeKey !== leaf.nodeKey)
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16 }}>📝</span>
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
                  📝 {nodeDetail?.title || selectedNode.title}
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
              <div style={{ padding: "20px 24px" }}>
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

                {/* Markdown 正文 */}
                {nodeDetail?.content && (
                  <div
                    style={{
                      fontSize: 14,
                      color: "#374151",
                      lineHeight: 1.8,
                    }}
                  >
                    {nodeDetail.content.split("\n").map((line, i) => {
                      if (line.startsWith("## ")) {
                        return (
                          <h3
                            key={i}
                            style={{
                              fontSize: 16,
                              fontWeight: 700,
                              color: "#1E1B4B",
                              margin: "16px 0 8px",
                            }}
                          >
                            {line.replace("## ", "")}
                          </h3>
                        );
                      }
                      if (line.startsWith("### ")) {
                        return (
                          <h4
                            key={i}
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: "#374151",
                              margin: "12px 0 6px",
                            }}
                          >
                            {line.replace("### ", "")}
                          </h4>
                        );
                      }
                      if (line.trim() === "") return <br key={i} />;
                      return <p key={i} style={{ margin: "0 0 6px" }}>{line}</p>;
                    })}
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

              {/* 家长提问区 */}
              <div
                style={{
                  borderTop: "1px solid #E5E7EB",
                  padding: "20px 24px",
                }}
              >
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#1E1B4B",
                    margin: "0 0 16px",
                  }}
                >
                  💬 家长们也在问 ({questions.length})
                </p>

                {questions.map((q) => (
                  <div
                    key={q.id}
                    style={{
                      background: "#FAF8FF",
                      borderRadius: 10,
                      padding: 14,
                      marginBottom: 12,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#5B21B6",
                        margin: "0 0 6px",
                      }}
                    >
                      {q.user_name || "匿名家长"}：{q.question}
                    </p>
                    {q.ai_answer && (
                      <div>
                        <p
                          style={{
                            fontSize: 12,
                            color: "#6B7280",
                            lineHeight: 1.6,
                            margin: "0 0 4px",
                          }}
                        >
                          🤖 {q.ai_answer.length > 200
                            ? q.ai_answer.slice(0, 200) + "..."
                            : q.ai_answer}
                        </p>
                        <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                          👍 {q.helpful_count || 0}
                        </span>
                      </div>
                    )}
                  </div>
                ))}

                {/* 提问输入 */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 16,
                  }}
                >
                  <input
                    type="text"
                    value={questionInput}
                    onChange={(e) => setQuestionInput(e.target.value)}
                    placeholder="我也有疑问..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        askQuestion();
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #E5E7EB",
                      fontSize: 13,
                      outline: "none",
                      background: "rgba(255,255,255,0.06)",
                    }}
                  />
                  <button
                    onClick={askQuestion}
                    disabled={asking || !questionInput.trim()}
                    style={{
                      padding: "10px 18px",
                      borderRadius: 10,
                      border: "none",
                      background: asking ? "#C4B5FD" : "#7C3AED",
                      color: "#1E1B4B",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: asking ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {asking ? "思考中…" : "提交"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TopicDetailPage;
