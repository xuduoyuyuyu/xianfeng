import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRagContext, formatRagPromptBlock } from "./ragContextService";

describe("ragContextService", () => {
  it("formats WeKnora hits into a guarded prompt block", () => {
    const block = formatRagPromptBlock([
      {
        chunkId: "chunk-1",
        sourceType: "public_material",
        sourceId: "knowledge-1",
        sourceTitle: "升学规划方法论",
        locator: "WeKnora 检索",
        text: "择校前先明确孩子画像和家庭约束。",
        score: 0.88,
      },
    ]);

    assert.match(block, /知识库参考资料/);
    assert.match(block, /资料没有明确提到/);
    assert.match(block, /\[1\] 升学规划方法论 \/ WeKnora 检索/);
    assert.match(block, /择校前先明确孩子画像和家庭约束/);
  });

  it("builds context from WeKnora and appends local context", async () => {
    const result = await buildRagContext({
      routeKey: "xiaowanzi",
      query: "怎么判断孩子适合什么学校",
      localContext: "[站内相关内容]\n节目1: 升学规划",
      search: async () => [
        {
          chunkId: "chunk-1",
          sourceType: "public_material",
          sourceId: "knowledge-1",
          sourceTitle: "升学规划方法论",
          locator: "WeKnora 检索",
          text: "先看孩子画像，再看学校供给。",
        },
      ],
    });

    assert.equal(result.provider, "weknora");
    assert.equal(result.status, "weknora_hit");
    assert.equal(result.citations.length, 1);
    assert.match(result.promptBlock, /先看孩子画像/);
    assert.match(result.promptBlock, /站内相关内容/);
  });

  it("falls back to local context when WeKnora returns no hits", async () => {
    const result = await buildRagContext({
      routeKey: "ai_chat",
      query: "亲子沟通",
      localContext: "[站内相关内容]\n嘉宾1: 廖老师",
      search: async () => [],
    });

    assert.equal(result.provider, "none");
    assert.equal(result.status, "weknora_no_hits");
    assert.equal(result.promptBlock, "[站内相关内容]\n嘉宾1: 廖老师");
  });

  it("does not block AI calls when WeKnora search fails", async () => {
    const result = await buildRagContext({
      routeKey: "ai_chat",
      query: "亲子沟通",
      localContext: "local only",
      search: async () => {
        throw new Error("network down");
      },
    });

    assert.equal(result.provider, "none");
    assert.equal(result.status, "weknora_error");
    assert.equal(result.promptBlock, "local only");
  });
});
