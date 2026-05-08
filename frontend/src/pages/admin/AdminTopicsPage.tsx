import React, { useState } from "react";

interface GenerateResult {
  topic: { id: number; slug: string; title: string };
  nodesInserted: number;
}

const AdminTopicsPage: React.FC = () => {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [coverEmoji, setCoverEmoji] = useState("📚");
  const [tags, setTags] = useState("");
  const [outline, setOutline] = useState("认知篇\n方法篇\n实践篇");
  const [adminKey, setAdminKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!title.trim()) return setError("请输入话题标题");
    if (!adminKey.trim()) return setError("请输入管理密钥");
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/topic-hub/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          subtitle: subtitle.trim(),
          coverEmoji: coverEmoji.trim() || "📚",
          tags: tags.split(/[,，\s]+/).filter(Boolean),
          outline: outline.split("\n").filter(Boolean),
          admin_key: adminKey.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
      } else {
        setError(data.error || "生成失败");
      }
    } catch (e: any) {
      setError(e.message || "网络错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 800 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1E1B4B", margin: "0 0 8px" }}>
        🌳 话题管理
      </h1>
      <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 24px" }}>
        用 AI 自动生成话题知识树。填入话题信息 → AI 生成分支和叶子节点。
      </p>

      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          border: "1px solid #F3F0FF",
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
            话题标题 *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="如：如何用 AI 育儿"
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #E5E7EB",
              fontSize: 14,
              outline: "none",
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
            副标题
          </label>
          <input
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="如：AI时代的家庭教育新思路"
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #E5E7EB",
              fontSize: 14,
              outline: "none",
            }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
              封面 Emoji
            </label>
            <input
              type="text"
              value={coverEmoji}
              onChange={(e) => setCoverEmoji(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #E5E7EB",
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
              标签（逗号分隔）
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="AI, 家庭, 教育"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #E5E7EB",
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
            知识树大纲（每行一个分支）
          </label>
          <textarea
            value={outline}
            onChange={(e) => setOutline(e.target.value)}
            rows={4}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #E5E7EB",
              fontSize: 13,
              outline: "none",
              fontFamily: "monospace",
              resize: "vertical",
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
            管理密钥 *
          </label>
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="输入 wel 后台管理密钥"
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #E5E7EB",
              fontSize: 14,
              outline: "none",
            }}
          />
        </div>

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "#FEF2F2", color: "#DC2626", fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: 10,
            border: "none",
            background: loading ? "#C4B5FD" : "#7C3AED",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "⏳ AI 正在生成知识树..." : "🤖 AI 生成话题"}
        </button>
      </div>

      {result && (
        <div style={{ background: "#F0FDF4", borderRadius: 14, border: "1px solid #D1FAE5", padding: 20 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#166534", margin: "0 0 8px" }}>
            ✅ 话题创建成功！
          </p>
          <p style={{ fontSize: 13, color: "#374151", margin: "0 0 4px" }}>
            标题：{result.topic.title}
          </p>
          <p style={{ fontSize: 13, color: "#374151", margin: "0 0 4px" }}>
            Slug：{result.topic.slug}
          </p>
          <p style={{ fontSize: 13, color: "#374151", margin: 0 }}>
            已插入 {result.nodesInserted} 个知识节点
          </p>
          <a
            href={`/topics/${result.topic.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              marginTop: 12,
              fontSize: 13,
              color: "#7C3AED",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            前台查看 →
          </a>
        </div>
      )}
    </div>
  );
};

export default AdminTopicsPage;
