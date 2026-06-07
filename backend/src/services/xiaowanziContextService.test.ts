import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildXiaowanziContextPayload, formatSiteCardsPromptBlock } from "./xiaowanziContextService";

describe("xiaowanziContextService", () => {
  it("prioritizes site cards before knowledge-base context and keeps Xiaowanzi return URLs", () => {
    const payload = buildXiaowanziContextPayload({
      query: "上海中考择校规划怎么做",
      siteCards: [
        {
          type: "topic",
          typeLabel: "请教一下",
          title: "上海中考规划",
          summary: "围绕目标校、自招和校内成绩做阶段规划。",
          href: "/topics/shanghai-zhongkao",
        },
        {
          type: "program",
          typeLabel: "节目",
          title: "中考择校访谈",
          summary: "嘉宾拆解上海中考路线。",
          href: "/programs/zhongkao-route",
        },
      ],
      rag: { status: "weknora_hit", provider: "weknora", citationCount: 3 },
      localPromptBlock: "[知识库参考资料]\n[1] 学业规划.docx\n上海中考路线规划...",
    });

    assert.equal(payload.trace[0].label, "查找站内结构化内容");
    assert.equal(payload.trace[0].status, "hit");
    assert.equal(payload.trace[1].label, "查询关联知识库");
    assert.equal(payload.trace[1].status, "hit");
    assert.equal(payload.cards[0].typeLabel, "请教一下");
    assert.equal(payload.cards[1].typeLabel, "节目");
    assert.equal(payload.cards[0].href, "/topics/shanghai-zhongkao?xw_layer=1&xw_return=xiaowanzi");
    assert.equal(payload.promptBlock.includes("[站内优先推荐]"), true);
    assert.equal(payload.promptBlock.indexOf("[站内优先推荐]") < payload.promptBlock.indexOf("[知识库参考资料]"), true);
  });

  it("records no-hit trace when site cards and knowledge-base context are absent", () => {
    const payload = buildXiaowanziContextPayload({
      query: "完全没有命中的问题",
      siteCards: [],
      rag: { status: "weknora_no_hits", provider: "none", citationCount: 0 },
      localPromptBlock: "",
    });

    assert.deepEqual(payload.trace.map((item) => item.status), ["miss", "miss", "fallback"]);
    assert.equal(payload.cards.length, 0);
    assert.equal(payload.promptBlock, "");
  });

  it("formats site cards as concise prompt references", () => {
    const block = formatSiteCardsPromptBlock([
      {
        type: "material",
        typeLabel: "学习资料",
        title: "升学规划表",
        summary: "分阶段列出准备事项。",
        href: "/materials/123",
      },
    ]);

    assert.match(block, /\[站内优先推荐\]/);
    assert.match(block, /\[1\] 学习资料: 升学规划表/);
    assert.match(block, /分阶段列出准备事项。/);
  });
});
