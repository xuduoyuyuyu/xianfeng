import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import GlobalPublicNav from "../components/GlobalPublicNav";

interface TopicItem {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  coverEmoji: string;
  tags: string[] | string;
  nodeCount: number;
  questionCount: number;
  viewCount: number;
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

  useEffect(() => {
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

  const handleSubmit = async () => {
    const q = submitSearch.trim();
    if (!q) return;
    setSubmitLoading(true);
    setSubmitMsg(null);
    try {
      const res = await fetch("/api/topic-hub/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search: q }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitMsg({ text: "🙏 已提交，等待审核～感谢你的提问！", type: "success" });
        setSubmitSearch("");
      } else {
        setSubmitMsg({ text: data.error || "提交失败", type: "error" });
      }
    } catch (e: any) {
      setSubmitMsg({ text: e.message || "网络错误", type: "error" });
    } finally {
      setSubmitLoading(false);
    }
  };

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
    <div style={{ minHeight: "100vh", background: "#f8f6ff" }}>
      <GlobalPublicNav showPlanningEntry={true} />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1E1B4B", margin: "0 0 8px" }}>
            📚 话题广场
          </h1>
          <p style={{ color: "#6B7280", fontSize: 15, margin: 0 }}>
            教育路上，每个问题都值得被认真回答
          </p>
        </div>

        {/* ===== 话题提交区 ===== */}
        <div
          style={{
            background: "linear-gradient(135deg, #F8F5FF, #F3EEFF)",
            borderRadius: 16,
            border: "1px solid #EDE9FE",
            padding: 24,
            marginBottom: 32,
            maxWidth: 640,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 600, color: "#4C1D95", margin: "0 0 10px" }}>
            💡 有想知道的教育话题？
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              style={{ flex: 1, ...inputStyle }}
              placeholder="输入你关心的教育问题..."
              value={submitSearch}
              onChange={(e) => setSubmitSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              disabled={submitLoading}
            />
            <button
              style={{
                ...btnPrimary,
                opacity: submitLoading || !submitSearch.trim() ? 0.5 : 1,
              }}
              disabled={submitLoading || !submitSearch.trim()}
              onClick={handleSubmit}
            >
              {submitLoading ? "⏳ 提交中..." : "🙏 请教一下"}
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
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "8px 0 0 0" }}>
            提交后由管理员审核，通过后话题就会出现在话题列表中 ✨
          </p>
        </div>

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
            {filteredTopics.map((topic) => (
              <Link key={topic.id} to={`/topics/${topic.slug}`} style={{ textDecoration: "none" }}>
                <div
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    padding: 24,
                    cursor: "pointer",
                    border: "1px solid #F3F0FF",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-4px)";
                    e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.10)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)";
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

                  {safeTags(topic.tags).length > 0 && (
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
                    borderTop: "1px solid #F3F0FF", paddingTop: 12,
                  }}>
                    <span>🌿 {topic.nodeCount} 节点</span>
                    <span>💬 {topic.questionCount} 提问</span>
                    <span>👁 {topic.viewCount}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TopicHubPage;
