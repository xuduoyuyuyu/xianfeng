import React from "react";
import { useNavigate, useParams } from "react-router-dom";

/* ===== 类型 ===== */
interface RatingDimensions {
  cost: number;
  quality: number;
  safety: number;
  experience: number;
  afterSales: number;
}

interface Reference {
  title: string;
  url: string;
  type: 'expert' | 'test' | 'user_review' | 'official';
}

interface Alternative {
  name: string;
  price: string;
  score: number;
  reason: string;
}

interface AnalysisResult {
  url?: string | null;
  brand?: string | null;
  score: number;
  isIqTax: boolean;
  reason: string;
  pros: string[];
  cons: string[];
  businessModel: string;
  commentAnalysis: string;
  recommendation: string;
  analyzedAt?: string;
  priceRange?: string;
  ratingDimensions?: RatingDimensions;
  dataPoints?: string[];
  references?: Reference[];
  suitableFor?: string[];
  notSuitableFor?: string[];
  alternatives?: Alternative[];
  buyAdvice?: string;
}

/* ===== 工具函数 ===== */
function scoreColor(s: number): string {
  if (s >= 85) return "#10B981";
  if (s >= 70) return "#22C55E";
  if (s >= 55) return "#F59E0B";
  if (s >= 40) return "#F97316";
  return "#EF4444";
}

function scoreLabel(s: number): string {
  if (s >= 85) return "强烈推荐 ✨";
  if (s >= 70) return "值得考虑 👍";
  if (s >= 55) return "谨慎购买 🤔";
  if (s >= 40) return "不太推荐 ⚠️";
  return "建议避坑 🚫";
}

/* ===== 页面 ===== */
const WorthBuyDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { query } = useParams<{ query: string }>();

  const state = (window.history.state?.usr || {}) as { result?: AnalysisResult; query?: string };
  const result: AnalysisResult | undefined = state.result;

  if (!result) {
    return (
      <div className="worthbuy-detail-page" style={{ minHeight: "100vh", background: "#f8f6ff" }}>
        
        <div style={{ maxWidth: 720, margin: "80px auto", textAlign: "center", padding: "0 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
          <h2 style={{ color: "#1E1B4B", margin: "0 0 8px" }}>分析结果丢失了</h2>
          <p style={{ color: "#9CA3AF", fontSize: 14, margin: "0 0 20px" }}>
            请回到什么值得买页面重新分析
          </p>
          <button
            onClick={() => navigate("/worthbuy")}
            style={{
              padding: "10px 28px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg, #7C3AED, #A855F7)",
              color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}
          >
            ← 返回什么值得买
          </button>
        </div>
      </div>
    );
  }

  const displayTitle = state.query || decodeURIComponent(query || "分析结果");

  return (
    <div className="worthbuy-detail-page" style={{ minHeight: "100vh", background: "#f8f6ff" }}>
      

      <style>{`
        @media (max-width: 768px) {
          .worthbuy-detail-page [style*="max-width: 800"] { padding-left: 16px !important; padding-right: 16px !important; }
          .worthbuy-detail-page h1 { font-size: 20px !important; }
          .worthbuy-detail-page [style*="gridTemplateColumns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
          .worthbuy-detail-page [style*="minmax(220px"] { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          .worthbuy-detail-page h1 { font-size: 18px !important; }
          .worthbuy-detail-page [style*="padding: 40px 20px"] { padding: 24px 12px !important; }
          .worthbuy-detail-page [style*="padding: 24"] { padding: 16px !important; }
        }
      `}</style>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "60px 20px 0" }}>
        {/* 返回按钮 */}
        <button
          onClick={() => navigate(-1)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 13, color: "#7C3AED", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6, marginBottom: 20,
            padding: 0,
          }}
        >
          ← 返回
        </button>

        {/* 标题 */}
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1E1B4B", margin: "0 0 6px" }}>
          {displayTitle}
        </h1>
        <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 24px" }}>
          深度分析报告
        </p>

        {/* ── 3a. 顶部：商品识别 + 核心判断 ── */}
        <div
          style={{
            background: "#fff", borderRadius: 16, border: "1px solid #F3F0FF",
            padding: 28, marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
            {/* 评分仪表盘 —— 放大 */}
            <div style={{ textAlign: "center", flexShrink: 0, minWidth: 180 }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: "#1E1B4B", letterSpacing: "0.08em", margin: "0 0 12px" }}>可信指数</p>
              <div
                style={{
                  width: 180, height: 180, borderRadius: "50%",
                  background: `conic-gradient(${scoreColor(result.score)} ${result.score * 3.6}deg, #F3F0FF 0deg)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto",
                }}
              >
                <div style={{
                  width: 148, height: 148, borderRadius: "50%", background: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 42, fontWeight: 800, color: scoreColor(result.score) }}>
                    {result.score}
                  </span>
                </div>
              </div>
              <p style={{ fontSize: 18, fontWeight: 700, color: scoreColor(result.score), margin: "12px 0 0" }}>
                {scoreLabel(result.score)}
              </p>
            </div>

            {/* 右侧信息 */}
            <div style={{ flex: 1, minWidth: 280 }}>
              {/* 品牌/链接 */}
              {result.url && (
                <p style={{ fontSize: 13, color: "#7C3AED", fontWeight: 600, margin: "0 0 4px", wordBreak: "break-all" }}>
                  <a href={result.url} target="_blank" rel="noopener noreferrer" style={{ color: "#7C3AED", textDecoration: "underline" }}>
                    {result.url}
                  </a>
                </p>
              )}
              {result.brand && (
                <p style={{ fontSize: 14, fontWeight: 700, color: "#1E1B4B", margin: "0 0 10px" }}>
                  {result.brand}
                </p>
              )}

              {/* 智商税标签 + 价格 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 20,
                  background: result.isIqTax ? "#FFFBEB" : "#ECFDF5",
                  fontSize: 14, fontWeight: 700,
                  color: result.isIqTax ? "#D97706" : "#059669",
                }}>
                  {result.isIqTax ? "🚨 智商税" : "✅ 非智商税"}
                </span>
                {result.priceRange && (
                  <span style={{
                    padding: "6px 14px", borderRadius: 20,
                    background: "#F3EEFF", fontSize: 14, fontWeight: 600, color: "#7C3AED",
                  }}>
                    {result.priceRange}
                  </span>
                )}
              </div>

              <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.8, margin: "0 0 12px" }}>
                {result.reason}
              </p>

              {/* 适合/不适合人群 */}
              {(result.suitableFor?.length || result.notSuitableFor?.length) ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {result.suitableFor?.map((s, i) => (
                    <span key={`sf-${i}`} style={{
                      padding: "4px 10px", borderRadius: 8,
                      background: "#ECFDF5", fontSize: 12, color: "#059669", fontWeight: 500,
                    }}>
                      ✓ {s}
                    </span>
                  ))}
                  {result.notSuitableFor?.map((s, i) => (
                    <span key={`nsf-${i}`} style={{
                      padding: "4px 10px", borderRadius: 8,
                      background: "#FEF2F2", fontSize: 12, color: "#DC2626", fontWeight: 500,
                    }}>
                      ✕ {s}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── 3b. 多维评分 ── */}
        {result.ratingDimensions && (
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #F3F0FF", padding: 24, marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E1B4B", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 6 }}>
              📊 多维评分
            </h3>
            {([
              { key: "cost" as const, label: "性价比", color: "#F59E0B" },
              { key: "quality" as const, label: "质量", color: "#10B981" },
              { key: "safety" as const, label: "安全性", color: "#3B82F6" },
              { key: "experience" as const, label: "使用体验", color: "#8B5CF6" },
              { key: "afterSales" as const, label: "售后", color: "#EC4899" },
            ]).map(({ key, label, color }) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <span style={{ width: 70, fontSize: 13, color: "#6B7280", fontWeight: 500, textAlign: "right", flexShrink: 0 }}>
                  {label}
                </span>
                <div style={{ flex: 1, height: 10, background: "#F3F0FF", borderRadius: 5, overflow: "hidden" }}>
                  <div style={{
                    width: `${result.ratingDimensions![key]}%`,
                    height: "100%",
                    borderRadius: 5,
                    background: `linear-gradient(90deg, ${color}, ${color}88)`,
                    transition: "width 0.8s ease",
                  }} />
                </div>
                <span style={{ width: 32, fontSize: 14, fontWeight: 700, color, textAlign: "left", flexShrink: 0 }}>
                  {result.ratingDimensions![key]}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── 3c. 数据面板 ── */}
        {(result.dataPoints?.length || result.references?.length) ? (
          <div style={{ background: "#FAFAFE", borderRadius: 16, border: "1px solid #EDE9FE", padding: 24, marginBottom: 20 }}>
            {result.dataPoints && result.dataPoints.length > 0 && (
              <div style={{ marginBottom: result.references?.length ? 16 : 0 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E1B4B", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                  📌 关键数据
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {result.dataPoints.map((dp, i) => (
                    <span key={i} style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.6 }}>
                      <span style={{ color: "#7C3AED", fontWeight: 700, marginRight: 8 }}>·</span>
                      {dp}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.references && result.references.length > 0 && (
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E1B4B", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                  🔗 引用来源
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {result.references.map((ref, i) => (
                    <a
                      key={i}
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 14px", borderRadius: 10,
                        background: "#fff", border: "1px solid #E5E7EB",
                        fontSize: 12, color: "#4B5563", textDecoration: "none",
                        fontWeight: 500, transition: "all 0.15s",
                      }}
                    >
                      <span>
                        {ref.type === "official" ? "🏛" : ref.type === "test" ? "🔬" : ref.type === "expert" ? "🎓" : "💬"}
                      </span>
                      {ref.title}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* ── 3d. 优缺点对比 ── */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0,
          background: "#fff", borderRadius: 16, border: "1px solid #F3F0FF",
          overflow: "hidden", marginBottom: 20,
        }}>
          <div style={{ padding: "24px", borderRight: "1px solid #F3F0FF" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#10B981", margin: "0 0 14px", display: "flex", alignItems: "center", gap: 6 }}>
              ✅ 优点
            </h3>
            <ul style={{ margin: 0, padding: "0 0 0 18px" }}>
              {(result.pros || []).map((p, i) => (
                <li key={i} style={{ fontSize: 13, color: "#4B5563", marginBottom: 8, lineHeight: 1.6 }}>{p}</li>
              ))}
            </ul>
          </div>
          <div style={{ padding: "24px" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#EF4444", margin: "0 0 14px", display: "flex", alignItems: "center", gap: 6 }}>
              ⚠️ 缺点
            </h3>
            <ul style={{ margin: 0, padding: "0 0 0 18px" }}>
              {(result.cons || []).map((c, i) => (
                <li key={i} style={{ fontSize: 13, color: "#4B5563", marginBottom: 8, lineHeight: 1.6 }}>{c}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── 3e. 商业模式 + 评论分析 ── */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #F3F0FF", padding: 24, marginBottom: 20 }}>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E1B4B", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
              💰 推荐人动机猜测
            </h3>
            <p style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.8, margin: 0, background: "#F8F6FF", padding: "12px 16px", borderRadius: 10 }}>
              {result.businessModel || "暂无分析"}
            </p>
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E1B4B", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
              📝 评论真实性分析
            </h3>
            <p style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.8, margin: 0, background: "#F8F6FF", padding: "12px 16px", borderRadius: 10 }}>
              {result.commentAnalysis || "暂无分析"}
            </p>
          </div>
        </div>

        {/* ── 3f. 替代品推荐 ── */}
        {result.alternatives && result.alternatives.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #F3F0FF", padding: 24, marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E1B4B", margin: "0 0 14px", display: "flex", alignItems: "center", gap: 6 }}>
              🔄 替代品推荐
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              {result.alternatives.map((alt, i) => (
                <div
                  key={i}
                  style={{
                    background: "#F8F6FF", borderRadius: 12, padding: "16px",
                    border: "1px solid #EDE9FE",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1E1B4B" }}>{alt.name}</span>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: "#fff",
                      background: scoreColor(alt.score), borderRadius: 8,
                      padding: "2px 8px",
                    }}>
                      {alt.score}
                    </span>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: "#7C3AED", fontWeight: 600 }}>{alt.price}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#6B7280", margin: 0, lineHeight: 1.6 }}>{alt.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 3g. 综合推荐 + 购买建议 ── */}
        <div style={{
          background: "linear-gradient(135deg, #F5F0FF, #EDE9FE)",
          borderRadius: 16, padding: 24, marginBottom: 20,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#5B21B6", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
            🎯 综合推荐
          </h3>
          <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.8, margin: 0, fontWeight: 500 }}>
            {result.recommendation || "暂无推荐"}
          </p>
        </div>

        {/* ── 购买建议 ── */}
        {result.buyAdvice && (
          <div style={{
            background: "#FFFBEB", borderRadius: 16, border: "1px solid #FDE68A",
            padding: 24, marginBottom: 20,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#92400E", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
              💡 购买建议
            </h3>
            <p style={{ fontSize: 14, color: "#78350F", lineHeight: 1.8, margin: 0 }}>
              {result.buyAdvice}
            </p>
          </div>
        )}

        {/* 底部时间 */}
        {result.analyzedAt && (
          <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", margin: 0 }}>
            分析时间：{new Date(result.analyzedAt).toLocaleString("zh-CN")}
          </p>
        )}
      </div>

      <div style={{ height: 60 }} />
    </div>
  );
};

export default WorthBuyDetailPage;
