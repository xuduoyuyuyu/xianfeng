import React, { useState } from "react";
import axios from "axios";

const authHeaders = () => {
  const token = localStorage.getItem("admin_token") || localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/* ===== 类型定义 ===== */
interface RatingDimensions {
  cost: number;
  quality: number;
  safety: number;
  experience: number;
  afterSales: number;
}

interface Alternative {
  name: string;
  price: string;
  score: number;
  reason: string;
}

interface WorthBuyResult {
  score: number;
  isIqTax: boolean;
  reason: string;
  pros: string[];
  cons: string[];
  businessModel: string;
  recommendation: string;
  priceRange?: string;
  ratingDimensions?: RatingDimensions;
  suitableFor?: string[];
  notSuitableFor?: string[];
  alternatives?: Alternative[];
  buyAdvice?: string;
}

interface WorthBuyItem {
  _id: string;
  brand: string;
  query: string;
  submittedBy: string;
  status: "draft" | "published" | "hidden";
  result: WorthBuyResult;
  createdAt: string;
  updatedAt: string;
}

/* ===== 空表单默认值 ===== */
const emptyResult: WorthBuyResult = {
  score: 0,
  isIqTax: false,
  reason: "",
  pros: [],
  cons: [],
  businessModel: "",
  recommendation: "",
  priceRange: "",
  ratingDimensions: { cost: 5, quality: 5, safety: 5, experience: 5, afterSales: 5 },
  suitableFor: [],
  notSuitableFor: [],
  alternatives: [],
  buyAdvice: "",
};

const emptyForm: { brand: string; query: string; status: "draft" | "published" | "hidden"; result: WorthBuyResult } = {
  brand: "",
  query: "",
  status: "draft",
  result: { ...emptyResult },
};

/* ===== 通用样式 ===== */
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
const formatDate = (s: string) => {
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

/* ===== 页面组件 ===== */
const AdminWorthBuyPage: React.FC = () => {
  const [items, setItems] = useState<WorthBuyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  // 表单
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  // 编辑 modal
  const [editingItem, setEditingItem] = useState<WorthBuyItem | null>(null);
  const [editForm, setEditForm] = useState({ ...emptyForm });

  // ========== 加载列表 ==========
  const loadItems = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get("/api/admin/worthbuy", { headers: authHeaders() });
      setItems(res.data.items || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { loadItems(); }, []);

  // ========== 新增 & AI 生成 ==========
  const [genBrand, setGenBrand] = useState("");
  const [generating, setGenerating] = useState(false);

  const handleAiGenerate = async () => {
    if (!genBrand.trim()) return;
    setGenerating(true);
    try {
      const res = await axios.post("/api/admin/worthbuy/generate", { brand: genBrand.trim() }, { headers: authHeaders() });
      setToast(`✨ 「${genBrand.trim()}」AI 分析完成！`);
      setGenBrand("");
      loadItems();
    } catch (e: any) {
      if (e.response?.status === 401 || String(e.message || "").includes("not valid JSON")) {
        setToast("登录已过期，请刷新页面重新登录");
      } else {
        const errMsg = e.response?.data?.error || e.message;
        setToast(`❌ ${errMsg}`);
      }
    } finally {
      setGenerating(false);
    }
  };

  // ========== 旧手动新增（保留但移除表单 UI） ==========
  const handleCreate = async () => { /* no-op, replaced by AI generate */ };

  // ========== 编辑品牌 ==========
  const openEdit = (item: WorthBuyItem) => {
    setEditingItem(item);
    setEditForm({
      brand: item.brand,
      query: item.query,
      status: item.status,
      result: {
        ...emptyResult,
        ...item.result,
        ratingDimensions: item.result.ratingDimensions
          ? { ...emptyResult.ratingDimensions!, ...item.result.ratingDimensions }
          : { ...emptyResult.ratingDimensions! },
        suitableFor: item.result.suitableFor || [],
        notSuitableFor: item.result.notSuitableFor || [],
        alternatives: item.result.alternatives || [],
      },
    });
  };

  const closeEdit = () => {
    setEditingItem(null);
    setEditForm({ ...emptyForm });
  };

  const handleUpdate = async () => {
    if (!editingItem || !editForm.brand.trim()) return;
    setSaving(true);
    try {
      const res = await axios.put(`/api/admin/worthbuy/${editingItem._id}`, editForm, { headers: authHeaders() });
      setToast(`✅ 「${editForm.brand}」已更新`);
      closeEdit();
      loadItems();
    } catch (e: any) {
      setToast(`❌ 网络错误: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ========== 状态切换 ==========
  const handleStatusChange = async (item: WorthBuyItem, newStatus: string) => {
    try {
      const res = await axios.patch(`/api/admin/worthbuy/${item._id}/status`, { status: newStatus }, { headers: authHeaders() });
      setToast(`✅ 状态已切换为「${statusLabel(newStatus)}」`);
      loadItems();
    } catch (e: any) {
      setToast(`❌ ${e.message}`);
    }
  };

  // ========== 表单子字段更新 ==========
  const updateFormResult = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, result: { ...prev.result, [field]: value } }));
  };

  const updateFormDim = (field: keyof RatingDimensions, value: number) => {
    setForm((prev) => ({
      ...prev,
      result: { ...prev.result, ratingDimensions: { ...prev.result.ratingDimensions!, [field]: value || 0 } },
    }));
  };

  const updateEditResult = (field: string, value: any) => {
    setEditForm((prev) => ({ ...prev, result: { ...prev.result, [field]: value } }));
  };

  const updateEditDim = (field: keyof RatingDimensions, value: number) => {
    setEditForm((prev) => ({
      ...prev,
      result: { ...prev.result, ratingDimensions: { ...prev.result.ratingDimensions!, [field]: value || 0 } },
    }));
  };

  const tagsFromString = (s: string): string[] =>
    s.split(/,|\n/).map((t) => t.trim()).filter(Boolean);

  // ====== 表单渲染（复用于新增 & 编辑 Modal） ======
  const renderForm = (
    f: typeof emptyForm,
    onBrand: (v: string) => void,
    onQuery: (v: string) => void,
    onStatus: (v: string) => void,
    onResult: (f2: string, v: any) => void,
    onDim: (f2: keyof RatingDimensions, v: number) => void,
  ) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 基础信息 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>品牌名 *</label>
          <input style={inputStyle} value={f.brand} onChange={(e) => onBrand(e.target.value)} placeholder="如 学而思" />
        </div>
        <div>
          <label style={labelStyle}>查询词</label>
          <input style={inputStyle} value={f.query} onChange={(e) => onQuery(e.target.value)} placeholder="用户搜索使用的词" />
        </div>
        <div>
          <label style={labelStyle}>状态</label>
          <select
            style={{ ...inputStyle, cursor: "pointer" }}
            value={f.status}
            onChange={(e) => onStatus(e.target.value)}
          >
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
            <option value="hidden">已隐藏</option>
          </select>
        </div>
      </div>

      {/* 评分 & IQ 税 */}
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, alignItems: "start" }}>
        <div>
          <label style={labelStyle}>综合评分</label>
          <input
            type="number"
            style={inputStyle}
            value={f.result.score}
            min={0}
            max={10}
            step={0.1}
            onChange={(e) => onResult("score", parseFloat(e.target.value) || 0)}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 26 }}>
          <label style={{ fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={f.result.isIqTax}
              onChange={(e) => onResult("isIqTax", e.target.checked)}
            />
            🔔 IQ税
          </label>
          <input
            style={{ flex: 1, ...inputStyle }}
            placeholder="价格区间（选填）"
            value={f.result.priceRange || ""}
            onChange={(e) => onResult("priceRange", e.target.value)}
          />
        </div>
      </div>

      {/* 评分维度 */}
      <div>
        <label style={labelStyle}>📊 评分维度 (1-10)</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {(["cost", "quality", "safety", "experience", "afterSales"] as const).map((dim) => (
            <div key={dim}>
              <span style={{ fontSize: 11, color: "#6B7280", display: "block", marginBottom: 2 }}>
                {dim === "cost" ? "💰 费用" : dim === "quality" ? "⭐ 质量" : dim === "safety" ? "🛡 安全" : dim === "experience" ? "🎯 体验" : "🔧 售后"}
              </span>
              <input
                type="number"
                style={inputStyle}
                min={1}
                max={10}
                value={f.result.ratingDimensions?.[dim] ?? 5}
                onChange={(e) => onDim(dim, parseInt(e.target.value) || 0)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 分析原因 */}
      <div>
        <label style={labelStyle}>分析原因</label>
        <textarea
          style={{ ...inputStyle, height: 60, resize: "vertical" }}
          value={f.result.reason}
          onChange={(e) => onResult("reason", e.target.value)}
          placeholder="简要分析该品牌的优劣..."
        />
      </div>

      {/* 优点 / 缺点 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>✅ 优点（逗号/换行分隔）</label>
          <textarea
            style={{ ...inputStyle, height: 60, resize: "vertical" }}
            value={(f.result.pros || []).join("\n")}
            onChange={(e) => onResult("pros", tagsFromString(e.target.value))}
            placeholder="每行一个优点"
          />
        </div>
        <div>
          <label style={labelStyle}>❌ 缺点（逗号/换行分隔）</label>
          <textarea
            style={{ ...inputStyle, height: 60, resize: "vertical" }}
            value={(f.result.cons || []).join("\n")}
            onChange={(e) => onResult("cons", tagsFromString(e.target.value))}
            placeholder="每行一个缺点"
          />
        </div>
      </div>

      {/* 商业模式 & 购买建议 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>商业模式</label>
          <textarea
            style={{ ...inputStyle, height: 56, resize: "vertical" }}
            value={f.result.businessModel}
            onChange={(e) => onResult("businessModel", e.target.value)}
            placeholder="预付费/年卡/按次..."
          />
        </div>
        <div>
          <label style={labelStyle}>💡 购买建议</label>
          <textarea
            style={{ ...inputStyle, height: 56, resize: "vertical" }}
            value={f.result.buyAdvice || ""}
            onChange={(e) => onResult("buyAdvice", e.target.value)}
            placeholder="什么时候买、怎么买划算..."
          />
        </div>
      </div>

      {/* 推荐理由 */}
      <div>
        <label style={labelStyle}>推荐总结</label>
        <textarea
          style={{ ...inputStyle, height: 60, resize: "vertical" }}
          value={f.result.recommendation}
          onChange={(e) => onResult("recommendation", e.target.value)}
          placeholder="为什么推荐 / 不推荐该品牌..."
        />
      </div>

      {/* 适用 / 不适用人群 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>👥 适用人群（逗号/换行分隔）</label>
          <textarea
            style={{ ...inputStyle, height: 52, resize: "vertical" }}
            value={(f.result.suitableFor || []).join("\n")}
            onChange={(e) => onResult("suitableFor", tagsFromString(e.target.value))}
            placeholder="每行一类人群"
          />
        </div>
        <div>
          <label style={labelStyle}>🚫 不适用人群（逗号/换行分隔）</label>
          <textarea
            style={{ ...inputStyle, height: 52, resize: "vertical" }}
            value={(f.result.notSuitableFor || []).join("\n")}
            onChange={(e) => onResult("notSuitableFor", tagsFromString(e.target.value))}
            placeholder="每行一类人群"
          />
        </div>
      </div>

      {/* 替代品 */}
      <div>
        <label style={labelStyle}>🔁 替代品（JSON 数组格式）</label>
        <textarea
          style={{ ...inputStyle, height: 80, resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
          value={JSON.stringify(f.result.alternatives || [], null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value || "[]");
              onResult("alternatives", parsed);
            } catch { /* ignore parse error while typing */ }
          }}
          placeholder='[{"name":"其他品牌","price":"¥500","score":6,"reason":"性价比"}]'
        />
      </div>
    </div>
  );

  // ====== 渲染 ======
  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1E1B4B", margin: "0 0 4px" }}>
        🏷️ 知物品牌管理
      </h1>
      <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 24px" }}>
        管理「知物」品牌分析数据——新增、编辑、发布与下架。
      </p>

      {/* Toast */}
      {toast && (
        <div
          style={{
            padding: "10px 16px", borderRadius: 10, marginBottom: 16, fontSize: 13,
            background: toast.startsWith("✅") ? "#F0FDF4" : "#FEF2F2",
            color: toast.startsWith("✅") ? "#166534" : "#DC2626",
            border: `1px solid ${toast.startsWith("✅") ? "#D1FAE5" : "#FECACA"}`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}
        >
          <span>{toast}</span>
          <button
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "inherit" }}
            onClick={() => setToast("")}
          >✕</button>
        </div>
      )}

      {/* ===== AI 生成品牌分析入口 ===== */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#4C1D95", whiteSpace: "nowrap" }}>
            ✨ 新增品牌
          </span>
          <input
            style={{ flex: 1, ...inputStyle }}
            placeholder="输入品牌名，AI 自动生成完整分析..."
            value={genBrand}
            onChange={(e) => setGenBrand(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAiGenerate(); }}
          />
          <button
            style={{
              ...btnPrimary,
              opacity: generating || !genBrand.trim() ? 0.5 : 1,
              whiteSpace: "nowrap",
            }}
            disabled={generating || !genBrand.trim()}
            onClick={handleAiGenerate}
          >
            {generating ? "⏳ AI 分析中..." : "🤖 AI 生成"}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "8px 0 0 0" }}>
          输入品牌名后点击 AI 生成，系统会自动分析：评分、优缺点、适用人群、替代品、购买建议等全部字段 ✨
        </p>
      </div>

      {/* ===== 品牌列表 ===== */}
      {loading && (
        <p style={{ textAlign: "center", color: "#9CA3AF", padding: 40 }}>⏳ 加载中...</p>
      )}
      {error && (
        <p style={{ textAlign: "center", color: "#DC2626", padding: 40 }}>加载失败: {error}</p>
      )}
      {!loading && !error && items.length === 0 && (
        <p style={{ textAlign: "center", color: "#9CA3AF", padding: 40 }}>
          暂无品牌数据，点击「展开」新增
        </p>
      )}

      {!loading && !error && items.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {/* 表头 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 100px 120px 150px 180px",
              gap: 12,
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 600,
              color: "#6B7280",
            }}
          >
            <span>品牌名</span>
            <span style={{ textAlign: "center" }}>评分</span>
            <span style={{ textAlign: "center" }}>状态</span>
            <span>提交时间</span>
            <span style={{ textAlign: "right" }}>操作</span>
          </div>

          {items.map((item) => {
            const sc = statusColor(item.status);
            return (
              <div
                key={item._id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 100px 120px 150px 180px",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 16px",
                  background: "#fff",
                  borderRadius: 10,
                  border: "1px solid #F3F0FF",
                }}
              >
                {/* 品牌名 */}
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#1E1B4B" }}>{item.brand}</span>
                  <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 8 }}>{item.query}</span>
                </div>

                {/* 评分 */}
                <span
                  style={{
                    textAlign: "center",
                    fontSize: 15,
                    fontWeight: 700,
                    color: item.result.score >= 7 ? "#059669" : item.result.score >= 5 ? "#D97706" : "#DC2626",
                  }}
                >
                  {item.result.score?.toFixed(1) ?? "-"}
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

                {/* 时间 */}
                <span style={{ fontSize: 12, color: "#6B7280" }}>{formatDate(item.createdAt)}</span>

                {/* 操作按钮 */}
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button
                    style={{
                      padding: "4px 12px", borderRadius: 6, border: "1px solid #DDD6FE",
                      background: "#F8F5FF", color: "#7C3AED", fontSize: 12, cursor: "pointer",
                    }}
                    onClick={() => openEdit(item)}
                  >编辑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== 编辑 Modal ===== */}
      {editingItem && (
        <>
          {/* 遮罩 */}
          <div
            style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(0,0,0,0.35)", zIndex: 999,
            }}
            onClick={closeEdit}
          />
          {/* Modal */}
          <div
            style={{
              position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
              width: 800, maxHeight: "85vh", overflowY: "auto",
              background: "#fff", borderRadius: 16, border: "1px solid #EDE9FE",
              padding: 24, zIndex: 1000,
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1E1B4B", margin: "0 0 16px" }}>
              ✏️ 编辑品牌：{editingItem.brand}
            </h2>

            {renderForm(
              editForm,
              (v) => setEditForm((p) => ({ ...p, brand: v })),
              (v) => setEditForm((p) => ({ ...p, query: v })),
              (v) => setEditForm((p) => ({ ...p, status: v as any })),
              updateEditResult,
              updateEditDim,
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button style={btnGhost} onClick={closeEdit}>取消</button>
              <button
                style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}
                disabled={saving || !editForm.brand.trim()}
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

export default AdminWorthBuyPage;
