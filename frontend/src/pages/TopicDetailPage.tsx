import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import GlobalPublicNav from "../components/GlobalPublicNav";
import type { RootState } from "../store";
import { getTopicUserId } from "../utils/topicUserId";
import QRCode from "qrcode";


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


/** 加载图片 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
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
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null);

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

  // ── 分享图生成 ──
  const generateShareImage = async () => {
    if (!topic) return;
    setShareModalOpen(true);
    setShareImageUrl(null);

    const shareUrl = `https://xianfeng.xinzhi.info/topics/${encodeURIComponent(topic.slug)}`;

    // ── Canvas 辅助函数 ──
    const roundRect2 = (ctx2: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
      ctx2.beginPath();
      ctx2.moveTo(x + r, y);
      ctx2.lineTo(x + w - r, y);
      ctx2.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx2.lineTo(x + w, y + h - r);
      ctx2.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx2.lineTo(x + r, y + h);
      ctx2.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx2.lineTo(x, y + r);
      ctx2.quadraticCurveTo(x, y, x + r, y);
      ctx2.closePath();
    };

    const wrapText2 = (ctx2: CanvasRenderingContext2D, text: string, maxWidth: number, _fontSize: number): string[] => {
      const lines: string[] = [];
      let currentLine = "";
      for (let i = 0; i < text.length; i++) {
        const testLine = currentLine + text[i];
        const metrics = ctx2.measureText(testLine);
        if (metrics.width > maxWidth && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = text[i];
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines;
    };

    /** 绘制紫色渐变圆形 icon（φ40dp, #773EF1→#5A1FCF 渐变，内含白色 emoji） */
    const drawPurpleCircleIcon = (ctx2: CanvasRenderingContext2D, cx: number, cy: number, r: number, emoji: string) => {
      const cGrad = ctx2.createLinearGradient(cx, cy - r, cx, cy + r);
      cGrad.addColorStop(0, "#773EF1");
      cGrad.addColorStop(1, "#5A1FCF");
      ctx2.fillStyle = cGrad;
      ctx2.beginPath();
      ctx2.arc(cx, cy, r, 0, Math.PI * 2);
      ctx2.fill();
      ctx2.fillStyle = "#FFFFFF";
      ctx2.font = `${Math.round(r * 1.1)}px 'PingFang SC', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;
      ctx2.textAlign = "center";
      ctx2.textBaseline = "middle";
      ctx2.fillText(emoji, cx, cy + 1);
      ctx2.textAlign = "left";
      ctx2.textBaseline = "alphabetic";
    };

    // ── Canvas 参数（750×1125）──
    const W = 750;
    const H = 1125;
    const P = 48;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;

    // ═══════ 0. 背景渐变 #dccdfc → #f8f5fe ═══════
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, "#dccdfc");
    bgGrad.addColorStop(1, "#f8f5fe");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // ═══════ 1. 品牌区域（图形化品牌图案：金色弧形 + 紫色文字）═══════
    const brandX = P + 20; // 68
    const brandY = 35;
    const brandW = 240;
    const brandH = 40;

    // 尝试加载品牌 logo 图片，失败则手绘
    let brandImg: HTMLImageElement | null = null;
    try {
      brandImg = await loadImage("/assets/brand-logo.png");
    } catch { /* ignore */ }

    if (brandImg && brandImg.width > 0 && brandImg.height > 0) {
      const imgAspect = brandImg.width / brandImg.height;
      const boxAspect = brandW / brandH;
      let sw = brandImg.width, sh = brandImg.height, sx = 0, sy = 0;
      if (imgAspect > boxAspect) {
        sw = brandImg.height * boxAspect;
        sx = (brandImg.width - sw) / 2;
      } else {
        sh = brandImg.width / boxAspect;
        sy = (brandImg.height - sh) / 2;
      }
      ctx.drawImage(brandImg, sx, sy, sw, sh, brandX, brandY, brandW, brandH);
    } else {
      // ── 手绘：左侧金色弧形（模拟设计稿金色区域）──
      const arcCx = brandX + 18;
      const arcCy = brandY + brandH / 2 + 2;
      const arcR = 16;
      const arcGrad = ctx.createRadialGradient(arcCx - 3, arcCy - 4, 2, arcCx, arcCy, arcR);
      arcGrad.addColorStop(0, "#fde68a");
      arcGrad.addColorStop(0.3, "#f8c629");
      arcGrad.addColorStop(0.6, "#eca10b");
      arcGrad.addColorStop(1, "#c78708");
      ctx.fillStyle = arcGrad;
      ctx.beginPath();
      ctx.moveTo(arcCx - arcR * 0.4, arcCy - arcR);
      ctx.quadraticCurveTo(arcCx + arcR * 1.3, arcCy - arcR * 0.3, arcCx + arcR * 0.5, arcCy + arcR * 0.8);
      ctx.quadraticCurveTo(arcCx - arcR * 0.1, arcCy + arcR * 0.3, arcCx - arcR * 0.4, arcCy - arcR);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(arcCx, arcCy - 0.2 * arcR, arcR * 0.95, 0.35 * Math.PI, 1.55 * Math.PI);
      ctx.fill();

      // ── 右侧紫色文字 + 装饰点 ──
      const purpleX = brandX + 48;
      const purpleY = brandY + 13;
      const pGrad1 = ctx.createRadialGradient(purpleX + 4, purpleY + 4, 1, purpleX + 4, purpleY + 4, 6);
      pGrad1.addColorStop(0, "#8B5CF6");
      pGrad1.addColorStop(1, "#6D3BEC");
      ctx.fillStyle = pGrad1;
      ctx.beginPath();
      ctx.arc(purpleX + 4, purpleY + 4, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6D3BEC";
      ctx.font = "bold 18px 'PingFang SC', 'Noto Sans SC', sans-serif";
      ctx.fillText("家长先疯 · 先疯智库", purpleX + 16, purpleY + 14);
    }

    // ═══════ 2. 标题区域 ═══════
    let titleY = brandY + brandH + 32; // 品牌底部 + 间距 → 约 107

    // 加载右侧插画
    let illImg: HTMLImageElement | null = null;
    try {
      illImg = await loadImage("/assets/topic-share-illustration.png");
    } catch { /* ignore */ }

    const illW = 185;
    const illX = W - P - illW; // ≈ 517
    const illY = 55;
    const titleMaxW = illX - P - 20; // 标题区域最大宽度（留 20dp 与插画间距）

    // 主标题：#080649, bold 44px, line-height 1.3, 最多2行
    ctx.fillStyle = "#080649";
    ctx.font = "bold 44px 'PingFang SC', 'Noto Sans SC', sans-serif";
    const titleText = topic.title || "";
    const titleLines = wrapText2(ctx, titleText, titleMaxW, 44);
    const displayTitleLines = titleLines.slice(0, 2);
    const titleLineH = Math.round(44 * 1.3); // ≈ 57
    for (let li = 0; li < displayTitleLines.length; li++) {
      ctx.fillText(displayTitleLines[li], P, titleY);
      titleY += titleLineH;
    }

    // 标题下方间距 12dp
    titleY += 12;

    // ═══════ 3. 副标题区域 ═══════
    const subtitleText = topic.subtitle || "";
    let subtitleEndY = titleY;
    if (subtitleText) {
      ctx.fillStyle = "#7C6BAA";
      ctx.font = "16px 'PingFang SC', 'Noto Sans SC', sans-serif";
      const subLines = wrapText2(ctx, subtitleText, titleMaxW, 16);
      const displaySubLines = subLines.slice(0, 2);
      const subLineH = Math.round(16 * 1.5); // 24
      for (let i = 0; i < displaySubLines.length; i++) {
        ctx.fillText(displaySubLines[i], P, subtitleEndY);
        subtitleEndY += subLineH;
      }
    }

    // ═══════ 4. 右侧插画 ═══════
    let illEndY = illY;
    let illActualH = 280; // 默认插画高度
    if (illImg && illImg.width > 0 && illImg.height > 0) {
      // 高度自适应：覆盖标题到标签之间，至少覆盖到副标题底部+24
      const minH = subtitleEndY - illY + 24;
      illActualH = Math.max(280, minH);
      ctx.save();
      roundRect2(ctx, illX, illY, illW, illActualH, 20);
      ctx.clip();
      const imgAspect = illImg.width / illImg.height;
      const boxAspect = illW / illActualH;
      let sw = illImg.width, sh = illImg.height, sx = 0, sy = 0;
      if (imgAspect > boxAspect) {
        sw = illImg.height * boxAspect;
        sx = (illImg.width - sw) / 2;
      } else {
        sh = illImg.width / boxAspect;
        sy = (illImg.height - sh) / 2;
      }
      ctx.drawImage(illImg, sx, sy, sw, sh, illX, illY, illW, illActualH);
      ctx.restore();
      illEndY = illY + illActualH;
    }

    // ═══════ 5. 标签胶囊 ═══════
    // 标签区域从插画底部和副标题底部较大值 + 36dp 开始
    let tagY = Math.max(illEndY, subtitleEndY) + 36;

    const tags = topic.tags || [];
    if (tags.length > 0) {
      let tagX = P;
      ctx.font = "15px 'PingFang SC', 'Noto Sans SC', sans-serif";
      const tagH = 36;
      for (const tag of tags.slice(0, 3)) {
        const tw = ctx.measureText(tag).width + 32; // padding 16*2
        // 换行检查：如果当前行放不下，换行
        if (tagX + tw > W - P && tagX > P) {
          tagX = P;
          tagY += tagH + 12;
        }
        // 浅紫色背景 + 紫色边框
        ctx.fillStyle = "rgba(124,77,255,0.06)";
        roundRect2(ctx, tagX, tagY, tw, tagH, 100);
        ctx.fill();
        ctx.strokeStyle = "rgba(124,77,255,0.20)";
        ctx.lineWidth = 1;
        roundRect2(ctx, tagX, tagY, tw, tagH, 100);
        ctx.stroke();
        // 紫色文字 #7C4DFF
        ctx.fillStyle = "#7C4DFF";
        ctx.fillText(tag, tagX + 16, tagY + tagH / 2 + 5);
        tagX += tw + 12;
      }
      tagY += tagH + 40; // 标签底部 + 到 bullet 的 40dp 间距
    } else {
      tagY += 20;
    }

    // ═══════ 6. 三个卖点 Bullet ═══════
    const bullets = [
      { emoji: "📘", title: "体系化的育儿知识图谱", desc: "从基础到进阶，构建清晰教育认知" },
      { emoji: "💡", title: "节目嘉宾专家的前沿观点", desc: "一线教育工作者的真实经验与思考" },
      { emoji: "👥", title: "多元化的家长互动与社群支持", desc: "同频家长交流心得，不再独自焦虑" },
    ];

    const bulletIconR = 20; // φ40dp → r=20
    const bulletIconCX = P + bulletIconR;
    const bulletTextX = P + 56; // 图标右侧 + 16dp 间距
    const bulletLineStartX = bulletIconCX + bulletIconR + 12;
    let bulletEndY = tagY;

    for (let i = 0; i < bullets.length; i++) {
      const bl = bullets[i];
      const centerY = bulletEndY + bulletIconR; // icon 中心 Y

      // 紫色圆形图标
      drawPurpleCircleIcon(ctx, bulletIconCX, centerY, bulletIconR, bl.emoji);

      // 标题：#0B082B, bold 18px
      ctx.fillStyle = "#0B082B";
      ctx.font = "bold 18px 'PingFang SC', 'Noto Sans SC', sans-serif";
      ctx.fillText(bl.title, bulletTextX, centerY - 8);

      // 描述：#6B6480, 14px
      ctx.fillStyle = "#6B6480";
      ctx.font = "14px 'PingFang SC', 'Noto Sans SC', sans-serif";
      ctx.fillText(bl.desc, bulletTextX, centerY + 14);

      // bullet 之间分隔线
      if (i < bullets.length - 1) {
        const sepY = centerY + bulletIconR + 16;
        ctx.strokeStyle = "rgba(124,77,255,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bulletLineStartX, sepY);
        ctx.lineTo(W - P, sepY);
        ctx.stroke();
      }

      // 更新 bullet 底部 Y
      bulletEndY = centerY + bulletIconR + (i < bullets.length - 1 ? 36 : 0);
    }

    // ═══════ 7. CTA 卡片 ═══════
    const ctaY = bulletEndY + 40;
    const ctaW = W - P * 2;
    const ctaH = 110;

    // 白色背景 + 阴影
    ctx.save();
    ctx.shadowColor = "rgba(124,77,255,0.06)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#FFFFFF";
    roundRect2(ctx, P, ctaY, ctaW, ctaH, 24);
    ctx.fill();
    ctx.restore();

    // 左侧 4dp 紫色渐变装饰条（#7738EE→透明，从上到下）
    const ctaBarX = P + 10;
    const ctaBarW = 4;
    const ctaBarY = ctaY + ctaH * 0.15;
    const ctaBarH = ctaH * 0.7;
    const ctaBarGrad = ctx.createLinearGradient(0, ctaBarY, 0, ctaBarY + ctaBarH);
    ctaBarGrad.addColorStop(0, "#7738EE");
    ctaBarGrad.addColorStop(1, "rgba(119,56,238,0)");
    ctx.fillStyle = ctaBarGrad;
    roundRect2(ctx, ctaBarX, ctaBarY, ctaBarW, ctaBarH, ctaBarW / 2);
    ctx.fill();

    // CTA 左侧文字
    const ctaTextX = P + 28;
    ctx.fillStyle = "#0B082B";
    ctx.font = "bold 22px 'PingFang SC', 'Noto Sans SC', sans-serif";
    ctx.fillText("扫码查看完整知识树", ctaTextX, ctaY + 38);

    ctx.fillStyle = "#6B6480";
    ctx.font = "13px 'PingFang SC', 'Noto Sans SC', sans-serif";
    ctx.fillText("打开家长先疯，开启系统化育儿学习之旅", ctaTextX, ctaY + 64);

    // QR Code：76x76，白色边框 3px，圆角 8
    const qrS = 76;
    const qrPadding = 3;
    const qrBoxS = qrS + qrPadding * 2; // 82
    const qrX = W - P - qrBoxS;
    const qrY = ctaY + (ctaH - qrBoxS) / 2;

    let qrDataUrl = "";
    try {
      qrDataUrl = await QRCode.toDataURL(shareUrl, {
        width: 200, margin: 1,
        color: { dark: "#0B082B", light: "#FFFFFF" },
      });
    } catch { /* ignore */ }

    if (qrDataUrl) {
      const qrImg = await loadImage(qrDataUrl);
      // 白色边框
      ctx.fillStyle = "#FFFFFF";
      roundRect2(ctx, qrX, qrY, qrBoxS, qrBoxS, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(124,77,255,0.10)";
      ctx.lineWidth = 3;
      roundRect2(ctx, qrX, qrY, qrBoxS, qrBoxS, 8);
      ctx.stroke();
      // 绘制二维码（留 3px padding）
      ctx.drawImage(qrImg, qrX + qrPadding, qrY + qrPadding, qrS, qrS);
    }

    // ═══════ 8. 底部 slogan ═══════
    const sloganY = ctaY + ctaH + 28;
    ctx.fillStyle = "#9996AE";
    ctx.font = "12px 'PingFang SC', 'Noto Sans SC', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("家长先疯 · 先疯智库 — 让每个家长都成为教育专家", W / 2, sloganY + 16);
    ctx.textAlign = "left";

    // → Blob
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (blob) {
      setShareImageUrl(URL.createObjectURL(blob));
    }
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
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
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
            <button
              onClick={generateShareImage}
              style={{
                flexShrink: 0,
                padding: "10px 20px",
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
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 20,
              padding: 24,
              maxWidth: 420,
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
              textAlign: "center",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: "#1E1B4B" }}>📤 分享话题</span>
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
            {shareImageUrl ? (
              <>
                <img
                  src={shareImageUrl}
                  alt="分享图"
                  style={{ width: "100%", borderRadius: 12, marginBottom: 16 }}
                />
                <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                  <a
                    href={shareImageUrl}
                    download={`${topic?.title || "话题"}_分享图.png`}
                    style={{
                      padding: "10px 24px",
                      borderRadius: 10,
                      background: "linear-gradient(135deg, #7C4DFF, #A78BFA)",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    💾 保存图片
                  </a>
                  <button
                    onClick={async () => {
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
                      padding: "10px 24px",
                      borderRadius: 10,
                      border: "1px solid #E9E3F8",
                      background: "#fff",
                      color: "#7C4DFF",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
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
