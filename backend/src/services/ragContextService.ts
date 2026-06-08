import { searchGlobalKnowledge, WeknoraSearchHit } from "./weknoraClient";

export type RagRouteKey = "xiaowanzi" | "ai_chat" | "worthbuy_analysis" | "guest_agent" | string;

export type RagContextResult = {
  provider: "weknora" | "none";
  status: "weknora_hit" | "weknora_no_hits" | "weknora_error" | "empty_query";
  promptBlock: string;
  citations: WeknoraSearchHit[];
};

type BuildRagContextParams = {
  routeKey: RagRouteKey;
  query: string;
  localContext?: string;
  limit?: number;
  search?: (params: { query: string; limit: number; routeKey: RagRouteKey }) => Promise<WeknoraSearchHit[]>;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampText(value: string, max = 520): string {
  const text = asText(value).replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function formatRagPromptBlock(citations: WeknoraSearchHit[]): string {
  const usable = citations.filter((item) => asText(item.text));
  if (!usable.length) return "";
  const lines = [
    "[知识库参考资料]",
    "以下资料来自家长先疯知识库的检索结果（基于语义相似度匹配，非精确命中）。如果资料提到了相关内容，回答时请说明；如果资料没有明确提到用户问题，请直接说明「资料中没有明确提到」，不要编造不存在的节目或内容。",
    ...usable.map((item, index) => {
      const title = asText(item.sourceTitle) || "知识库资料";
      const locator = asText(item.locator);
      const heading = locator ? `[${index + 1}] ${title} / ${locator}` : `[${index + 1}] ${title}`;
      return `${heading}\n${clampText(item.text)}`;
    }),
  ];
  return lines.join("\n");
}

export async function buildRagContext(params: BuildRagContextParams): Promise<RagContextResult> {
  const query = asText(params.query);
  const localContext = asText(params.localContext);
  if (!query) {
    return { provider: "none", status: "empty_query", promptBlock: localContext, citations: [] };
  }

  const limit = Math.max(1, Math.floor(params.limit || 8));
  try {
    const search = params.search || ((input: { query: string; limit: number }) => searchGlobalKnowledge(input));
    const citations = (await search({ query, limit, routeKey: params.routeKey })).slice(0, limit);
    const ragBlock = formatRagPromptBlock(citations);
    const sections = [ragBlock, localContext].filter(Boolean);
    if (ragBlock) {
      return { provider: "weknora", status: "weknora_hit", promptBlock: sections.join("\n\n"), citations };
    }
    return { provider: "none", status: "weknora_no_hits", promptBlock: localContext, citations: [] };
  } catch {
    return { provider: "none", status: "weknora_error", promptBlock: localContext, citations: [] };
  }
}
