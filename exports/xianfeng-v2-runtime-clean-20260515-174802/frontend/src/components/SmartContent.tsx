import React from "react";

/**
 * SmartContent — 智能结构化文本渲染组件
 *
 * 支持：
 * - Markdown：`#` `##` `###` / `**加粗**` / `1. 有序列表` / `- 无序列表` / `--- 分隔线`
 * - 纯文本智能拆分：
 *   · 「第一/第二/第三」开头（第一是、第一周、第一个、第一种、第一项、第一步、第一阶段…）
 *   · 「第X到Y周/天/月」跨阶段标题
 *   · 连续年龄数据 → bullet 列表
 *   · 100 字以上段落自动按句号分段
 * - 按 `\n\n` 双换行自动分段
 *
 * 用法：<SmartContent text={content} />
 */

// ─── 行内解析：**加粗** ────────────────────────────────────
const parseInline = (text: string): React.ReactNode => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ color: "#1E1B4B", fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

// ─── 工具：按句号长段拆分 ──────────────────────────────────
const LONG_PARA_THRESHOLD = 100;

const splitLongParagraph = (text: string): string[] => {
  if (text.length <= LONG_PARA_THRESHOLD) return [text];
  // 按句号+空格拆分
  const sentences = text.split(/(?<=。)(?=\s*[^。]|$)/);
  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf && (buf + s).length > LONG_PARA_THRESHOLD * 1.5) {
      if (buf.trim()) chunks.push(buf.trim());
      buf = s;
    } else {
      buf += s;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.length <= 1 ? [text] : chunks;
};

// ─── 渲染段落（支持行内加粗 + 自动分段） ───────────────────
const renderParagraph = (text: string, key: string): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  const chunks = splitLongParagraph(text);
  chunks.forEach((chunk, ci) => {
    nodes.push(
      <p key={`${key}-${ci}`} style={{ margin: "0 0 12px", fontSize: 14, color: "#374151", lineHeight: 1.9 }}>
        {parseInline(chunk)}
      </p>
    );
  });
  return nodes;
};

// ─── 智能拆分子卡片 ────────────────────────────────────────
// 匹配模式：
//   第X + 量词/标点 = 第X是/第一/第一周/第一个/第一种/第一项/第一步/第一阶段
//   跨阶段 = 第X到Y周/天/月
//   纯数字 = 1. / 1、/ 1)
//   短标题 = 以中文开头 + ：结尾（不超过20字）→ 视为小标题
// 匹配「第X量词」+ 可选括号内容(第X-Y天) 或 标点结尾
const SUB_CARD_PATTERN =
  /(第[一二三四五六七八九十\d]+(?:到[一二三四五六七八九十\d]+)?(?:周|个(?:误区|原因|方法|步骤|原则)?|种|项|步|阶段|天|月|年|类|层|块|次|条|句|是)(?:\s*[\(（][^)\)）]+[\)）])?[：:、，]?)/gm;

// 冒号短标题：冒号结尾不超过 20 字，排除已被 SUB_CARD 覆盖的
const COLON_TITLE_PATTERN = /(?:^|(?<=[。！？\n]))([^\n]{2,20}：)(?!\s*$)/g;

/**
 * 从文本中提取所有子卡片标题位置
 */
const findSubCardTitles = (text: string): { index: number; end: number; title: string; matchLength: number }[] => {
  const results: { index: number; end: number; title: string; matchLength: number }[] = [];

  // 匹配"第X"模式
  for (const m of text.matchAll(SUB_CARD_PATTERN)) {
    if (m.index === undefined) continue;
    results.push({ index: m.index, end: m.index + m[0].length, title: m[0].replace(/[，,是\s]+$/, ""), matchLength: m[0].length });
  }

  // 匹配冒号短标题（排除已经被"第X"覆盖的）
  for (const m of text.matchAll(COLON_TITLE_PATTERN)) {
    if (m.index === undefined) continue;
    const titleStart = m.index;
    const colonIdx = m[0].indexOf("：");
    const titleEnd = titleStart + colonIdx + 1;
    // 检查是否与已有标题重叠
    const alreadyCovered = results.some(r => titleStart >= r.index && titleStart < r.end);
    if (!alreadyCovered) {
      const titlePart = m[0].slice(0, colonIdx + 1);
      // 只接受以中文或数字开头的标题
      if (/^[\u4e00-\u9fff\d]/.test(titlePart)) {
        // 不以"第"开头但包含冒号 → 标题 = 冒号前内容
        results.push({
          index: titleStart,
          end: titleEnd,
          title: titlePart.replace(/：$/, ""),
          matchLength: colonIdx + 1,
        });
      }
    }
  }

  // 去重+排序
  const seen = new Set<number>();
  return results
    .filter(r => !seen.has(r.index) && seen.add(r.index))
    .sort((a, b) => a.index - b.index);
};

// ─── 子卡片拆分主逻辑 ──────────────────────────────────────
const splitSubCards = (text: string): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  const titles = findSubCardTitles(text);

  if (titles.length === 0) {
    // 无子标题 → 普通段落
    return renderParagraph(text, "plain");
  }

  // 标题前的前导文字
  if (titles[0].index > 0) {
    const preamble = text.slice(0, titles[0].index).trim();
    if (preamble) {
      nodes.push(...renderParagraph(preamble, "preamble"));
    }
  }

  // 逐卡片渲染
  for (let i = 0; i < titles.length; i++) {
    const t = titles[i];
    const bodyStart = t.end;
    const bodyEnd = i + 1 < titles.length ? titles[i + 1].index : text.length;
    let body = text.slice(bodyStart, bodyEnd).trim();

    // 检查 body 内是否有年龄数据列表
    const agePattern = /(\d+岁(?:约|约?[为是]?)\d+[-~至]\d+分钟?)/g;
    const ageMs = [...body.matchAll(agePattern)];

    nodes.push(
      <div key={`card-${i}`} style={{ margin: "12px 0", padding: "10px 14px", background: "#F8F5FF", borderRadius: 8, borderLeft: "3px solid #7C3AED" }}>
        {/* 卡片标题 */}
        <strong style={{ fontSize: 14, color: "#5B21B6", display: "block", marginBottom: body ? 8 : 0 }}>{t.title}</strong>

        {/* 卡片正文 */}
        {body && ageMs.length >= 2 ? (
          <>
            {/* 年龄前导文字 */}
            {(() => {
              const firstIdx = ageMs[0].index!;
              const pre = body.slice(0, firstIdx).trim().replace(/[，,。\s]*$/, "");
              if (pre) return <p key="age-pre" style={{ margin: "0 0 6px", fontSize: 14, color: "#374151", lineHeight: 1.9 }}>{pre}</p>;
              return null;
            })()}
            {/* 年龄列表 */}
            <ul style={{ margin: "0 0 6px", paddingLeft: 20, listStyle: "disc" }}>
              {ageMs.map((m, ai) => (
                <li key={ai} style={{ marginBottom: 3, lineHeight: 1.8, fontSize: 14, color: "#374151" }}>{m[0]}</li>
              ))}
            </ul>
            {/* 年龄后的剩余文字 */}
            {(() => {
              const lastAge = ageMs[ageMs.length - 1];
              const after = body.slice(lastAge.index! + lastAge[0].length).replace(/^[，,。；;\s]+/, "");
              if (after.length > 10) {
                return renderParagraph(after, `card-${i}-after`).map((n, ni) =>
                  React.cloneElement(n as React.ReactElement, { key: `card-${i}-after-${ni}` })
                );
              }
              return null;
            })()}
          </>
        ) : body ? (
          renderParagraph(body, `card-${i}-body`).map((n, ni) =>
            React.cloneElement(n as React.ReactElement, { key: `card-${i}-body-${ni}` })
          )
        ) : null}
      </div>
    );
  }

  return nodes;
};

// ─── 纯文本智能分段入口 ─────────────────────────────────────
const renderPlainText = (section: string): React.ReactNode[] => {
  const elements: React.ReactNode[] = [];
  const blocks = section.split(/\n\n+/);

  blocks.forEach((block, bi) => {
    const trimmed = block.trim();
    if (!trimmed) return;

    // **...** 开头的行 → 强调标题块
    if (trimmed.startsWith("**") && trimmed.includes("**", 2)) {
      const boldEnd = trimmed.indexOf("**", 2);
      const title = trimmed.slice(2, boldEnd);
      const rest = trimmed.slice(boldEnd + 2).trim();
      elements.push(
        <div key={`bt-${bi}`} style={{ margin: "14px 0 8px", padding: "8px 14px", background: "#F8F5FF", borderRadius: 8, borderLeft: "3px solid #7C3AED" }}>
          {rest ? (
            <>
              <strong style={{ fontSize: 15, color: "#5B21B6", display: "block", marginBottom: 6 }}>{title}</strong>
              <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.9 }}>{rest}</p>
            </>
          ) : (
            <strong style={{ fontSize: 15, color: "#5B21B6" }}>{title}</strong>
          )}
        </div>
      );
      return;
    }

    // 数字序号开头的多行 → 有序列表
    const lines = trimmed.split(/\n/);
    if (lines.length >= 2 && lines.every(l => /^[\d]+[\.\、]/.test(l.trimStart()))) {
      elements.push(
        <ol key={`ol-${bi}`} style={{ margin: "8px 0 14px", paddingLeft: 20, listStyle: "decimal" }}>
          {lines.map((l, li) => (
            <li key={li} style={{ marginBottom: 6, lineHeight: 1.8, fontSize: 14, color: "#374151" }}>
              {l.replace(/^[\d]+[\.\、]\s*/, "")}
            </li>
          ))}
        </ol>
      );
      return;
    }

    // 年龄数据（无子标题时单独处理）
    const agePattern = /(\d+岁(?:约|约?[为是]?)\d+[-~至]\d+分钟?)/g;
    const ageMs = [...trimmed.matchAll(agePattern)];
    if (ageMs.length >= 3 && !findSubCardTitles(trimmed).length) {
      const firstIdx = ageMs[0].index!;
      const preamble = trimmed.slice(0, firstIdx).replace(/[，,。\s]*$/, "");
      if (preamble) {
        elements.push(<p key={`age-pre-${bi}`} style={{ margin: "0 0 8px", fontSize: 14, color: "#374151", lineHeight: 1.9 }}>{preamble}</p>);
      }
      elements.push(
        <ul key={`age-${bi}`} style={{ margin: "4px 0 14px", paddingLeft: 20, listStyle: "disc" }}>
          {ageMs.map((m, ai) => (
            <li key={ai} style={{ marginBottom: 4, lineHeight: 1.8, fontSize: 14, color: "#374151" }}>{m[0]}</li>
          ))}
        </ul>
      );
      return;
    }

    // 智能子卡片拆分
    const cardNodes = splitSubCards(trimmed);
    cardNodes.forEach((node, ni) => {
      if (React.isValidElement(node)) {
        elements.push(React.cloneElement(node, { key: `${bi}-${ni}` } as any));
      }
    });
  });

  return elements;
};

// ─── Markdown 渲染 ──────────────────────────────────────────
const renderMarkdown = (section: string): React.ReactNode[] => {
  const elements: React.ReactNode[] = [];
  const lines = section.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }

    if (line.startsWith("## ")) {
      elements.push(<h3 key={`md-h2-${i}`} style={{ fontSize: 16, fontWeight: 700, color: "#1E1B4B", margin: "20px 0 10px" }}>{parseInline(line.replace(/^##\s+/, ""))}</h3>);
      i++; continue;
    }
    if (line.startsWith("### ")) {
      elements.push(<h4 key={`md-h3-${i}`} style={{ fontSize: 14, fontWeight: 600, color: "#374151", margin: "14px 0 6px" }}>{parseInline(line.replace(/^###\s+/, ""))}</h4>);
      i++; continue;
    }
    if (line.startsWith("# ")) {
      elements.push(<h3 key={`md-h1-${i}`} style={{ fontSize: 17, fontWeight: 700, color: "#5B21B6", margin: "16px 0 10px", paddingBottom: 6, borderBottom: "1px solid #EDE9FE" }}>{parseInline(line.replace(/^#\s+/, ""))}</h3>);
      i++; continue;
    }

    // 1. 有序列表
    if (line.match(/^[\d]+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[\d]+\.\s/)) { items.push(lines[i].replace(/^[\d]+\.\s*/, "")); i++; }
      elements.push(
        <ol key={`md-ol-${i}`} style={{ margin: "4px 0 14px", paddingLeft: 20, listStyle: "decimal" }}>
          {items.map((it, li) => <li key={li} style={{ marginBottom: 6, lineHeight: 1.8, fontSize: 14 }}>{parseInline(it)}</li>)}
        </ol>
      );
      continue;
    }

    // - 无序列表
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) { items.push(lines[i].replace(/^-\s*/, "")); i++; }
      elements.push(
        <ul key={`md-ul-${i}`} style={{ margin: "4px 0 14px", paddingLeft: 20, listStyle: "disc" }}>
          {items.map((it, li) => <li key={li} style={{ marginBottom: 4, lineHeight: 1.8, fontSize: 14 }}>{parseInline(it)}</li>)}
        </ul>
      );
      continue;
    }

    // 收集连续段落
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("#") && !lines[i].match(/^[\d]+\.\s/) && !lines[i].startsWith("- ")) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      const paraText = paraLines.join(" ");
      // 先尝试子卡片拆分
      const cardNodes = splitSubCards(paraText);
      if (cardNodes.length === 1 && React.isValidElement(cardNodes[0]) && (cardNodes[0].type as string) === "p") {
        // 无子标题 → 普通段落 + inline 加粗
        elements.push(...renderParagraph(paraText, `md-p-${i}`).map((n, ni) =>
          React.cloneElement(n as React.ReactElement, { key: `md-p-${i}-${ni}` })
        ));
      } else {
        cardNodes.forEach((node, ni) => {
          if (React.isValidElement(node)) {
            elements.push(React.cloneElement(node, { key: `md-card-${i}-${ni}` } as any));
          }
        });
      }
      continue;
    }

    i++;
  }

  return elements;
};

// ─── 主渲染入口 ─────────────────────────────────────────────
const renderContent = (text: string): React.ReactNode[] => {
  if (!text) return [];

  const hasMd = /^#{1,3}\s|^\*\*|^[\d]+\.\s|^-\s|\n---\n/m.test(text);
  const sections = text.split(/\n---\n/);

  return sections.map((section, si) => {
    const elements = hasMd ? renderMarkdown(section) : renderPlainText(section);

    // section 间分隔线
    if (si > 0) {
      elements.unshift(<hr key={`hr-${si}`} style={{ border: "none", borderTop: "1px dashed #DDD6FE", margin: "20px 0 16px" }} />);
    }

    return <div key={si}>{elements}</div>;
  });
};

// ─── 组件导出 ───────────────────────────────────────────────
interface SmartContentProps {
  text: string;
}

const SmartContent: React.FC<SmartContentProps> = ({ text }) => {
  return <>{renderContent(text)}</>;
};

export default SmartContent;
