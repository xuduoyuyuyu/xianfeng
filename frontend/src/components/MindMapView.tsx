import React, { useEffect, useRef, useState } from "react";
import { Markmap } from "markmap-view";
import { Transformer } from "markmap-lib";
import { Toolbar } from "markmap-toolbar";
import "markmap-toolbar/dist/style.css";
import { ProgramQuickViewItem, MindMapData, MindMapNode } from "../services/api";

const transformer = new Transformer();

/**
 * AI 模式：从 MindMapNode 树递归生成 Markdown
 */
function buildAiMarkdown(node: MindMapNode, level: number = 1): string {
  const lines: string[] = [];
  const prefix = "#".repeat(Math.min(level, 6));
  const emoji = node.emoji ? `${node.emoji} ` : "";
  lines.push(`${prefix} ${emoji}${node.title}`);

  if (node.summary && level <= 3) {
    lines.push(`> ${node.summary}`);
  }

  if (node.children && node.children.length > 0) {
    lines.push("");
    for (const child of node.children) {
      const childMarkdown = buildAiMarkdown(child, level + 1);
      lines.push(childMarkdown);
    }
  }

  return lines.join("\n");
}

/**
 * QuickView 模式：生成脑图 Markdown
 *
 * 结构映射：
 *   # 节目标题
 *   ## timeRangeLabel（一级节点：时间段）
 *   - summary（该段摘要）
 *     - parent.summary（父观点 → 三级节点）
 *       - summary（子观点）
 */
function buildMarkdown(quickView: ProgramQuickViewItem[], title: string): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);

  if (!quickView || quickView.length === 0) {
    lines.push("");
    lines.push("暂无脉络数据");
    return lines.join("\n");
  }

  // 按 parent 关系组织：有 parent 的挂在父节点下，没有的按时间段分组
  const standalone: ProgramQuickViewItem[] = [];
  const parentMap = new Map<number, ProgramQuickViewItem[]>();

  for (let i = 0; i < quickView.length; i++) {
    const item = quickView[i];
    if (item.parent?.summary) {
      // 找到 parent 在 quickView 中的索引
      const parentIdx = quickView.findIndex(
        (q) =>
          q.startTime === item.parent!.startTime &&
          q.endTime === item.parent!.endTime &&
          q.summary === item.parent!.summary
      );
      if (parentIdx >= 0) {
        if (!parentMap.has(parentIdx)) parentMap.set(parentIdx, []);
        parentMap.get(parentIdx)!.push(item);
        continue;
      }
    }
    standalone.push(item);
  }

  // 渲染独立条目 + 嵌套条目
  for (const item of standalone) {
    const idx = quickView.indexOf(item);
    const children = parentMap.get(idx) || [];
    const timeLabel = item.timeRangeLabel || `${item.startTime}-${item.endTime}`;
    const summary = item.summary?.trim();

    if (!summary && children.length === 0) continue;

    lines.push("");
    const safeLabel = timeLabel
      .replace(/\n/g, " ")
      .replace(/[\[\]]/g, " ")
      .slice(0, 60);
    lines.push(`## ${safeLabel}`);

    if (summary) {
      const shortSummary = summary.replace(/\n/g, " ").slice(0, 140);
      if (children.length > 0) {
        // 有子节点：父观点作为二级标题
        lines.push(`- **${shortSummary}**`);
        for (const child of children) {
          const childSummary = child.summary?.trim();
          if (childSummary) {
            lines.push(`  - ${childSummary.replace(/\n/g, " ").slice(0, 120)}`);
          }
        }
      } else {
        lines.push(`- ${shortSummary}`);
      }
    } else {
      // 只有子节点没有摘要的情况
      for (const child of children) {
        const childSummary = child.summary?.trim();
        if (childSummary) {
          lines.push(`- ${childSummary.replace(/\n/g, " ").slice(0, 120)}`);
        }
      }
    }
  }

  return lines.join("\n");
}

/** 收集 AI 模式中所有带 time 的节点 */
function collectAiTimeNodes(node: MindMapNode): Map<string, string> {
  const map = new Map<string, string>();
  if (node.source?.type === "transcript" && node.source?.time) {
    map.set(node.title, node.source.time);
  }
  if (node.children) {
    for (const child of node.children) {
      const childMap = collectAiTimeNodes(child);
      childMap.forEach((time, title) => map.set(title, time));
    }
  }
  return map;
}

interface MindMapViewProps {
  quickView: ProgramQuickViewItem[];
  title: string;
  mindMapData?: MindMapData | null;
  mode?: "quickview" | "ai";
  onReady?: () => void;
  /** 点击节点时回传 startTime，用于切换到逐字稿并滚动到对应时间 */
  onNavigateToTime?: (startTime: string) => void;
  /** AI 模式下触发生成 */
  onGenerate?: () => void;
  /** AI 模式下是否正在生成 */
  generating?: boolean;
}

const MindMapView: React.FC<MindMapViewProps> = ({
  quickView,
  title,
  mindMapData,
  mode = "quickview",
  onReady,
  onNavigateToTime,
  onGenerate,
  generating = false,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const mmRef = useRef<Markmap | null>(null);
  const [loading, setLoading] = useState(true);

  // 决定使用哪个数据源构建 Markdown
  const isAiMode = mode === "ai" && mindMapData?.root;

  useEffect(() => {
    if (mmRef.current) {
      mmRef.current.destroy();
      mmRef.current = null;
    }

    const svg = svgRef.current;
    if (!svg) return;

    // 只有有数据时才渲染
    const hasData =
      isAiMode ? true : quickView && quickView.length > 0;
    if (!hasData) {
      setLoading(false);
      return;
    }

    setLoading(true);

    requestAnimationFrame(() => {
      let markdown: string;
      if (isAiMode && mindMapData?.root) {
        markdown = buildAiMarkdown(mindMapData.root);
      } else {
        markdown = buildMarkdown(quickView, title);
      }

      const { root } = transformer.transform(markdown);

      const mm = Markmap.create(svg, {
        autoFit: true,
        duration: 400,
        maxWidth: 260,
        initialExpandLevel: 2,
      } as any);

      mm.setData(root);
      mm.fit();

      // 点击节点 → 跳转逐字稿对应时间戳
      if (onNavigateToTime) {
        setTimeout(() => {
          const svgEl = svgRef.current;
          if (!svgEl) return;
          const gEls = svgEl.querySelectorAll("g.markmap-node");

          // AI 模式下预先收集所有带 time 的节点映射
          const aiTimeNodeMap = isAiMode && mindMapData?.root
            ? collectAiTimeNodes(mindMapData.root)
            : null;

          gEls.forEach((gEl) => {
            const cloned = gEl.cloneNode(true) as HTMLElement;
            gEl.parentNode?.replaceChild(cloned, gEl);
            cloned.addEventListener("click", (e) => {
              const text =
                (cloned.querySelector("text")?.textContent || "").trim();
              if (!text) return;

              // AI 模式：通过节点文本匹配 time
              if (aiTimeNodeMap) {
                for (const [titleKey, time] of aiTimeNodeMap.entries()) {
                  if (text.includes(titleKey)) {
                    e.stopPropagation();
                    onNavigateToTime(time);
                    return;
                  }
                }
              }

              // QuickView 模式：查找匹配的时间段
              for (const item of quickView) {
                const label = item.timeRangeLabel || `${item.startTime}-${item.endTime}`;
                if (text.includes(label.replace(/[\n\[\]]/g, " ").slice(0, 30))) {
                  e.stopPropagation();
                  onNavigateToTime(item.startTime);
                  return;
                }
              }

              // 也尝试匹配 summary
              for (const item of quickView) {
                const s = item.summary?.trim().slice(0, 30);
                if (s && text.includes(s)) {
                  e.stopPropagation();
                  onNavigateToTime(item.startTime);
                  return;
                }
              }
            });
          });
        }, 200);
      }

      mmRef.current = mm;

      // 渲染 toolbar
      const toolbarWrap = toolbarRef.current;
      if (toolbarWrap) {
        while (toolbarWrap.firstChild) toolbarWrap.firstChild.remove();
        const toolbar = new Toolbar();
        toolbar.attach(mm);
        toolbarWrap.append(toolbar.render());
      }

      setLoading(false);
      onReady?.();
    });

    return () => {
      if (mmRef.current) {
        mmRef.current.destroy();
        mmRef.current = null;
      }
    };
  }, [quickView, title, mindMapData, isAiMode]);

  // 响应容器尺寸变化
  useEffect(() => {
    const handleResize = () => {
      if (mmRef.current) {
        mmRef.current.fit();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // AI 模式且无数据
  if (mode === "ai" && !mindMapData?.root) {
    if (generating) {
      return (
        <div className="relative w-full rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 rounded-2xl">
            <div className="flex items-center gap-2 text-violet-600">
              <svg
                className="h-5 w-5 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-sm font-medium">🧠 正在生成知识树...</span>
            </div>
          </div>
        </div>
      );
    }

    // 有 onGenerate 回调 → 管理员，显示生成按钮
    if (onGenerate) {
      return (
        <div className="flex min-h-[400px] items-center justify-center rounded-xl border border-dashed border-stone-200 bg-white p-8">
          <button
            onClick={onGenerate}
            className="flex items-center gap-2 rounded-xl bg-violet-50 px-6 py-3 text-sm font-medium text-violet-600 transition-colors hover:bg-violet-100 active:bg-violet-200"
          >
            <span className="text-lg">🧠</span>
            生成知识树
          </button>
        </div>
      );
    }

    // 无 onGenerate 回调 → 普通用户，显示提示
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-xl border border-dashed border-stone-200 bg-white p-8">
        <div className="text-center">
          <span className="text-3xl">🧠</span>
          <p className="mt-3 text-sm text-stone-400">AI 知识树尚未生成</p>
          <p className="mt-1 text-xs text-stone-300">管理员可在后台生成</p>
        </div>
      </div>
    );
  }

  // QuickView 模式且无数据
  if (mode === "quickview" && (!quickView || quickView.length === 0)) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-xl border border-dashed border-stone-200 bg-white p-8 text-sm text-stone-400">
        该节目暂无脉络数据，可先查看速览或逐字稿
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-2xl border border-stone-200 bg-white shadow-sm">
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/80">
          <span className="text-sm text-stone-400">🧠 正在生成脉络图...</span>
        </div>
      )}
      <div ref={toolbarRef} className="absolute right-4 top-4 z-10 rounded-lg bg-white/90 p-1 shadow-sm backdrop-blur" />
      <svg ref={svgRef} className="h-[520px] w-full rounded-2xl" />
    </div>
  );
};

export default MindMapView;
