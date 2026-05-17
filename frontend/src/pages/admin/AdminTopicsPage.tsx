import React, { useState } from "react";

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("token");
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
};

/* ===== 类型定义 ===== */
interface LayerNode {
  key?: string;
  title: string;
  summary: string;
  content: string;
  icon?: string;
}

interface TopicHubItem {
  _id: string;
  id?: number;
  title: string;
  slug: string;
  subtitle?: string;
  coverEmoji?: string;
  tags?: string[];
  searchTerm?: string;
  submittedBy?: string;
  createdBy?: string;
  status: "draft" | "published" | "hidden";
  result?: any;
  nodeCount?: number;
  layers?: {
    layer1?: LayerNode[];
    layer2?: LayerNode[];
    layer3?: LayerNode[];
    layer4?: LayerNode[];
    layer5?: LayerNode[];
  };
  createdAt?: string;
  updatedAt?: string;
}

/* ===== 空表单默认值 ===== */
const emptyForm = {
  title: "",
  slug: "",
  subtitle: "",
  coverEmoji: "📚",
  tags: "" as string,
  status: "draft" as "draft" | "published" | "hidden",
};

// 知识树节点编辑表单
interface LayerEditData {
  [layerKey: string]: { key: string; title: string; summary: string; content: string; icon: string }[];
}

const layerLabels: Record<string, string> = {
  layer1: "🌿 认知篇",
  layer2: "🔍 诊断篇",
  layer3: "🎯 方法篇",
  layer4: "🛠️ 工具篇",
  layer5: "🚀 行动篇",
};

/* ===== 通用样式（同 AdminWorthBuyPage 风格） ===== */
const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #DDD6FE",
  fontSize: 14,
  outline: "none",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#4C1D95",
  marginBottom: 4,
  display: "block",
};

const btnPrimary: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: 8,
  border: "none",
  background: "#7C3AED",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: 8,
  border: "1px solid #DDD6FE",
  background: "#F8F5FF",
  color: "#7C3AED",
  fontSize: 13,
  cursor: "pointer",
};

const sectionStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #F8F5FF, #F3EEFF)",
  borderRadius: 14,
  border: "1px solid #EDE9FE",
  padding: 20,
  marginBottom: 20,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #F3F0FF",
  padding: 14,
  marginBottom: 10,
};

/* ===== 帮助函数 ===== */
const formatDate = (s: string | undefined) => {
  if (!s) return "-";
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const statusColor = (s: string) => {
  if (s === "published") return { bg: "#F0FDF4", text: "#166534", border: "#D1FAE5" };
  if (s === "hidden") return { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" };
  return { bg: "#FFFBEB", text: "#92400E", border: "#FDE68A" };
};

const statusLabel = (s: string) => {
  if (s === "published") return "已发布";
  if (s === "hidden") return "已隐藏";
  return "草稿";
};

const tagsFromString = (s: string): string[] =>
  s.split(/,|\n/).map((t) => t.trim()).filter(Boolean);

/* ===== 页面组件 ===== */
const AdminTopicsPage: React.FC = () => {
  const [items, setItems] = useState<TopicHubItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  // AI 生成
  const [genSearch, setGenSearch] = useState("");
  const [generating, setGenerating] = useState(false);

  // 编辑 modal
  const [editingItem, setEditingItem] = useState<TopicHubItem | null>(null);
  const [editForm, setEditForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  // 知识树编辑
  const [layerEdit, setLayerEdit] = useState<LayerEditData>({});
  const [activeLayerTab, setActiveLayerTab] = useState("layer1");
  const [activeNodeIdx, setActiveNodeIdx] = useState(0);

  // ========== 加载列表 ==========
  const loadItems = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/topic-hub", { headers: authHeaders() });
      const data = await res.json();
      const rawItems = Array.isArray(data.topics) ? data.topics : Array.isArray(data) ? data : [];
      setItems(rawItems);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadItems();
  }, []);

  // ========== AI 搜索生成话题 ==========
  const handleAiGenerate = async () => {
    if (!genSearch.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/topic-hub/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ search: genSearch.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setToast(`✨ 「${genSearch.trim()}」话题生成完成！`);
        setGenSearch("");
        loadItems();
      } else {
        setToast(`❌ ${data.error || "生成失败"}`);
      }
    } catch (e: any) {
      setToast(`❌ 网络错误: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  // ========== 编辑时加载 layers 到 layerEdit ==========
  const initLayerEdit = (item: TopicHubItem) => {
    const data: LayerEditData = {};
    const layers = item.layers || {};
    for (const key of ["layer1", "layer2", "layer3", "layer4", "layer5"]) {
      data[key] = ((layers as any)[key] || []).map((n: any) => ({
        key: n.key || "",
        title: n.title || "",
        summary: n.summary || "",
        content: n.content || "",
        icon: n.icon || "",
      }));
    }
    setLayerEdit(data);
    setActiveLayerTab("layer1");
    setActiveNodeIdx(0);
  };

  // ========== 编辑话题 ==========
  const openEdit = (item: TopicHubItem) => {
    setEditingItem(item);
    setEditForm({
      title: item.title || "",
      slug: item.slug || "",
      subtitle: item.subtitle || "",
      coverEmoji: item.coverEmoji || "📚",
      tags: Array.isArray(item.tags) ? item.tags.join(", ") : "",
      status: item.status || "draft",
    });
    initLayerEdit(item);
  };

  const closeEdit = () => {
    setEditingItem(null);
    setEditForm({ ...emptyForm });
  };

  const handleUpdate = async () => {
    if (!editingItem || !editForm.title.trim()) return;
    setSaving(true);
    try {
      // 清理 layerEdit 空节点
      const cleanLayers: Record<string, LayerNode[]> = {};
      for (const key of ["layer1", "layer2", "layer3", "layer4", "layer5"]) {
        cleanLayers[key] = (layerEdit[key] || []).filter((n) => n.title.trim());
      }
      const payload = {
        ...editForm,
        tags: tagsFromString(editForm.tags),
        layers: cleanLayers,
      };
      const res = await fetch(`/api/admin/topic-hub/${editingItem._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setToast(`✅ 「${editForm.title}」已更新`);
        closeEdit();
        loadItems();
      } else {
        const data = await res.json();
        setToast(`❌ ${data.error || "更新失败"}`);
      }
    } catch (e: any) {
      setToast(`❌ 网络错误: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ========== 状态切换 ==========
  const handleStatusChange = async (item: TopicHubItem, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/topic-hub/${item._id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setToast(`✅ 状态已切换为「${statusLabel(newStatus)}」`);
        loadItems();
      } else {
        const data = await res.json();
        setToast(`❌ ${data.error || "切换失败"}`);
      }
    } catch (e: any) {
      setToast(`❌ ${e.message}`);
    }
  };

  // ========== 删除话题 ==========
  const handleDelete = async (item: TopicHubItem) => {
    if (!window.confirm(`确定删除「${item.title}」？此操作不可恢复。`)) return;
    try {
      const res = await fetch(`/api/admin/topic-hub/${item._id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.ok) {
        setToast(`🗑 「${item.title}」已删除`);
        loadItems();
      } else {
        const data = await res.json();
        setToast(`❌ ${data.error || "删除失败"}`);
      }
    } catch (e: any) {
      setToast(`❌ ${e.message}`);
    }
  };

  // ========== 渲染 ==========
  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1E1B4B", margin: "0 0 4px" }}>
        🌳 话题管理
      </h1>
      <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 24px" }}>
        管理话题数据 —— AI 搜索生成、审核发布、展开知识树。
      </p>

      {/* Toast */}
      {toast && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 13,
            background: toast.startsWith("✅") || toast.startsWith("✨") || toast.startsWith("🌿")
              ? "#F0FDF4"
              : toast.startsWith("🗑")
              ? "#FFF7ED"
              : "#FEF2F2",
            color: toast.startsWith("✅") || toast.startsWith("✨") || toast.startsWith("🌿")
              ? "#166534"
              : toast.startsWith("🗑")
              ? "#9A3412"
              : "#DC2626",
            border: `1px solid ${
              toast.startsWith("✅") || toast.startsWith("✨") || toast.startsWith("🌿")
                ? "#D1FAE5"
                : toast.startsWith("🗑")
                ? "#FED7AA"
                : "#FECACA"
            }`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{toast}</span>
          <button
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "inherit" }}
            onClick={() => setToast("")}
          >
            ✕
          </button>
        </div>
      )}

      {/* ===== AI 搜索生成话题入口 ===== */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#4C1D95", whiteSpace: "nowrap" }}>
            ✨ AI 搜索生成
          </span>
          <input
            style={{ flex: 1, ...inputStyle }}
            placeholder="输入搜索词，AI 自动生成话题及知识树..."
            value={genSearch}
            onChange={(e) => setGenSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAiGenerate();
            }}
          />
          <button
            style={{
              ...btnPrimary,
              opacity: generating || !genSearch.trim() ? 0.5 : 1,
              whiteSpace: "nowrap",
            }}
            disabled={generating || !genSearch.trim()}
            onClick={handleAiGenerate}
          >
            {generating ? "⏳ AI 生成中..." : "🤖 AI 生成"}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "8px 0 0 0" }}>
          输入搜索词后点击 AI 生成，系统会自动创建话题并展开知识树节点 ✨
        </p>
      </div>

      {/* ===== 话题列表 ===== */}
      {loading && <p style={{ textAlign: "center", color: "#9CA3AF", padding: 40 }}>⏳ 加载中...</p>}
      {error && <p style={{ textAlign: "center", color: "#DC2626", padding: 40 }}>加载失败: {error}</p>}
      {!loading && !error && items.length === 0 && (
        <p style={{ textAlign: "center", color: "#9CA3AF", padding: 40 }}>
          暂无话题数据，用上方搜索框创建第一个
        </p>
      )}

      {!loading && !error && items.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {/* 表头 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 100px 100px 110px 140px 170px",
              gap: 12,
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 600,
              color: "#6B7280",
            }}
          >
            <span>标题</span>
            <span style={{ textAlign: "center" }}>Slug</span>
            <span style={{ textAlign: "center" }}>状态</span>
            <span style={{ textAlign: "center" }}>提交者</span>
            <span>时间</span>
            <span style={{ textAlign: "right" }}>操作</span>
          </div>

          {items.map((item) => {
            const sc = statusColor(item.status);
            return (
              <div
                key={item._id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 100px 100px 110px 140px 170px",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 16px",
                  background: "#fff",
                  borderRadius: 10,
                  border: "1px solid #F3F0FF",
                }}
              >
                {/* 标题 */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 18 }}>{item.coverEmoji || "📚"}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#1E1B4B" }}>{item.title}</span>
                  </div>
                  {item.subtitle && (
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2, marginLeft: 28 }}>
                      {item.subtitle}
                    </div>
                  )}
                </div>

                {/* Slug */}
                <span style={{ textAlign: "center", fontSize: 12, color: "#6B7280", fontFamily: "monospace" }}>
                  {item.slug}
                </span>

                {/* 状态切换 */}
                <div style={{ textAlign: "center" }}>
                  <select
                    value={item.status}
                    onChange={(e) => handleStatusChange(item, e.target.value)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: `1px solid ${sc.border}`,
                      background: sc.bg,
                      color: sc.text,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      outline: "none",
                    }}
                  >
                    <option value="draft">草稿</option>
                    <option value="published">已发布</option>
                    <option value="hidden">已隐藏</option>
                  </select>
                </div>

                {/* 提交者 */}
                <span style={{ textAlign: "center", fontSize: 12, color: "#6B7280" }}>
                  {item.createdBy || item.submittedBy || "-"}
                </span>

                {/* 时间 */}
                <span style={{ fontSize: 12, color: "#6B7280" }}>
                  {formatDate(item.createdAt)}
                </span>

                {/* 操作按钮 */}
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: "1px solid #DDD6FE",
                      background: "#F8F5FF",
                      color: "#7C3AED",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                    onClick={() => openEdit(item)}
                  >
                    编辑
                  </button>
                  <button
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: "1px solid #FECACA",
                      background: "#FEF2F2",
                      color: "#DC2626",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                    onClick={() => handleDelete(item)}
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== 编辑 Modal（含知识树编辑） ===== */}
      {editingItem && (
        <>
          {/* 遮罩 */}
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.35)",
              zIndex: 999,
            }}
            onClick={closeEdit}
          />
          {/* Modal 内容 */}
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              width: 900,
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #EDE9FE",
              padding: 24,
              zIndex: 1000,
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1E1B4B", margin: "0 0 16px" }}>
              ✏️ 编辑话题：{editingItem.title}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* 标题 & Slug */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>标题 *</label>
                  <input
                    style={inputStyle}
                    value={editForm.title}
                    onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="话题标题"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Slug</label>
                  <input
                    style={inputStyle}
                    value={editForm.slug}
                    onChange={(e) => setEditForm((p) => ({ ...p, slug: e.target.value }))}
                    placeholder="url 友好标识"
                  />
                </div>
              </div>

              {/* 副标题 & 封面 Emoji */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
                <div>
                  <label style={labelStyle}>副标题</label>
                  <input
                    style={inputStyle}
                    value={editForm.subtitle}
                    onChange={(e) => setEditForm((p) => ({ ...p, subtitle: e.target.value }))}
                    placeholder="简短描述"
                  />
                </div>
                <div>
                  <label style={labelStyle}>封面 Emoji</label>
                  <input
                    style={inputStyle}
                    value={editForm.coverEmoji}
                    onChange={(e) => setEditForm((p) => ({ ...p, coverEmoji: e.target.value }))}
                    placeholder="📚"
                  />
                </div>
              </div>

              {/* 标签 & 状态 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12 }}>
                <div>
                  <label style={labelStyle}>标签（逗号分隔）</label>
                  <input
                    style={inputStyle}
                    value={editForm.tags}
                    onChange={(e) => setEditForm((p) => ({ ...p, tags: e.target.value }))}
                    placeholder="如: 国际学校, 择校, K12"
                  />
                </div>
                <div>
                  <label style={labelStyle}>状态</label>
                  <select
                    style={{ ...inputStyle, cursor: "pointer" }}
                    value={editForm.status}
                    onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value as any }))}
                  >
                    <option value="draft">草稿</option>
                    <option value="published">已发布</option>
                    <option value="hidden">已隐藏</option>
                  </select>
                </div>
              </div>

              {/* ===== 知识树编辑区 ===== */}
              <div style={{
                border: "1px solid #EDE9FE",
                borderRadius: 12,
                overflow: "hidden",
              }}>
                <div style={{
                  background: "#F8F5FF",
                  padding: "10px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#5B21B6",
                  borderBottom: "1px solid #EDE9FE",
                }}>
                  🌿 知识树（在编辑中管理）
                </div>

                {/* Layer tabs */}
                <div style={{ display: "flex", borderBottom: "1px solid #EDE9FE", overflow: "auto" }}>
                  {["layer1", "layer2", "layer3", "layer4", "layer5"].map((key) => (
                    <button
                      key={key}
                      onClick={() => { setActiveLayerTab(key); setActiveNodeIdx(0); }}
                      style={{
                        padding: "8px 14px",
                        fontSize: 12,
                        fontWeight: activeLayerTab === key ? 600 : 400,
                        border: "none",
                        borderBottom: activeLayerTab === key ? "2px solid #7C3AED" : "2px solid transparent",
                        background: activeLayerTab === key ? "#fff" : "#FAF8FF",
                        color: activeLayerTab === key ? "#7C3AED" : "#6B7280",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {layerLabels[key]}
                    </button>
                  ))}
                </div>

                {/* Node tabs */}
                {layerEdit[activeLayerTab] && layerEdit[activeLayerTab].length > 0 && (
                  <div style={{ display: "flex", borderBottom: "1px solid #EDE9FE", overflow: "auto", padding: "6px 8px", gap: 4 }}>
                    {layerEdit[activeLayerTab].map((node, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveNodeIdx(idx)}
                        style={{
                          padding: "4px 12px",
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: activeNodeIdx === idx ? 600 : 400,
                          border: `1px solid ${activeNodeIdx === idx ? "#C4B5FD" : "#E5E7EB"}`,
                          background: activeNodeIdx === idx ? "#F3EEFF" : "#fff",
                          color: activeNodeIdx === idx ? "#7C3AED" : "#6B7280",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {node.title || `节点${idx + 1}`}
                      </button>
                    ))}
                    {/* 添加节点 */}
                    <button
                      onClick={() => {
                        const updated = { ...layerEdit };
                        updated[activeLayerTab] = [
                          ...(updated[activeLayerTab] || []),
                          { key: `${activeLayerTab}-${Date.now()}`, title: "", summary: "", content: "", icon: "📝" },
                        ];
                        setLayerEdit(updated);
                        setActiveNodeIdx(updated[activeLayerTab].length - 1);
                      }}
                      style={{
                        padding: "4px 12px",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        border: "1px dashed #DDD6FE",
                        background: "#fff",
                        color: "#7C3AED",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      + 添加
                    </button>
                  </div>
                )}

                {/* Node edit fields */}
                {layerEdit[activeLayerTab] && layerEdit[activeLayerTab][activeNodeIdx] ? (
                  <div style={{ padding: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 60px", gap: 8, marginBottom: 10 }}>
                      <div>
                        <label style={{ ...labelStyle, fontSize: 11 }}>标题</label>
                        <input
                          style={{ ...inputStyle, fontSize: 12 }}
                          value={layerEdit[activeLayerTab][activeNodeIdx].title}
                          onChange={(e) => {
                            const updated = { ...layerEdit };
                            updated[activeLayerTab][activeNodeIdx].title = e.target.value;
                            setLayerEdit(updated);
                          }}
                          placeholder="节点标题"
                        />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: 11 }}>摘要</label>
                        <input
                          style={{ ...inputStyle, fontSize: 12 }}
                          value={layerEdit[activeLayerTab][activeNodeIdx].summary}
                          onChange={(e) => {
                            const updated = { ...layerEdit };
                            updated[activeLayerTab][activeNodeIdx].summary = e.target.value;
                            setLayerEdit(updated);
                          }}
                          placeholder="一句话概述"
                        />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: 11 }}>Icon</label>
                        <input
                          style={{ ...inputStyle, fontSize: 12, textAlign: "center" }}
                          value={layerEdit[activeLayerTab][activeNodeIdx].icon}
                          onChange={(e) => {
                            const updated = { ...layerEdit };
                            updated[activeLayerTab][activeNodeIdx].icon = e.target.value;
                            setLayerEdit(updated);
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: 11 }}>
                        内容（Markdown，含展开讲讲追加的内容）
                      </label>
                      <textarea
                        style={{
                          ...inputStyle,
                          fontSize: 12,
                          fontFamily: "monospace",
                          minHeight: 180,
                          resize: "vertical",
                          lineHeight: 1.6,
                        }}
                        value={layerEdit[activeLayerTab][activeNodeIdx].content}
                        onChange={(e) => {
                          const updated = { ...layerEdit };
                          updated[activeLayerTab][activeNodeIdx].content = e.target.value;
                          setLayerEdit(updated);
                        }}
                        placeholder="节点正文（支持 Markdown）..."
                      />
                    </div>
                    {/* 删除节点 */}
                    <button
                      onClick={() => {
                        const updated = { ...layerEdit };
                        updated[activeLayerTab] = updated[activeLayerTab].filter((_, i) => i !== activeNodeIdx);
                        setLayerEdit(updated);
                        setActiveNodeIdx(0);
                      }}
                      style={{
                        marginTop: 8,
                        padding: "4px 12px",
                        borderRadius: 6,
                        border: "1px solid #FECACA",
                        background: "#FEF2F2",
                        color: "#DC2626",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      🗑 删除此节点
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: 24, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                    暂无节点，点击「+ 添加」创建知识树节点
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button style={btnGhost} onClick={closeEdit}>
                取消
              </button>
              <button
                style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}
                disabled={saving || !editForm.title.trim()}
                onClick={handleUpdate}
              >
                {saving ? "保存中..." : "💾 保存修改"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminTopicsPage;
