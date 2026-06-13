import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

describe("tutorbot RAG wiring", () => {
  it("uses the shared RAG context service for frontend 小玩子 messages", () => {
    const source = readFileSync(resolve(__dirname, "tutorbot.ts"), "utf8");

    assert.match(source, /buildRagContext/);
    assert.match(source, /routeKey:\s*"xiaowanzi"/);
    assert.match(source, /rag\.promptBlock/);
  });

  it("streams auditable context before model deltas for Xiaowanzi", () => {
    const source = readFileSync(resolve(__dirname, "tutorbot.ts"), "utf8");

    assert.match(source, /buildXiaowanziContextPayload/);
    assert.match(source, /writeSse\(res,\s*"context",\s*xiaowanziContext\)/);
    assert.match(source, /localPromptBlock:\s*rag\.promptBlock/);
  });

  it("prevents Xiaowanzi from inventing site programs when no direct site reference is provided", () => {
    const source = readFileSync(resolve(__dirname, "tutorbot.ts"), "utf8");

    assert.match(source, /function buildSiteReferencePolicy\(hasSiteContext: boolean\): string/);
    assert.match(source, /没有提供任何已命中的站内节目、请教一下、资料、书单或嘉宾链接/);
    assert.match(source, /不要说“家长先疯节目里也有聊过/);
    assert.match(source, /不要引导用户去搜索关键词/);
    assert.match(source, /const siteReferencePolicy = isFrontendBot\(botId\) \? buildSiteReferencePolicy\(Boolean\(siteContext\)\) : ""/);
    assert.match(source, /const effectiveContent = \[siteReferencePolicy,\s*xiaowanziContext\.promptBlock,\s*content\]\.filter\(Boolean\)\.join\("\\n\\n"\)/);
  });

  it("requires any Xiaowanzi site recommendation to include direct links from matched records", () => {
    const source = readFileSync(resolve(__dirname, "tutorbot.ts"), "utf8");

    assert.match(source, /function buildProgramHref\(item: any\): string/);
    assert.match(source, /href: buildProgramHref\(item\)/);
    assert.match(source, /href: buildTopicHref\(item\)/);
    assert.match(source, /href: buildMaterialHref\(item\)/);
    assert.match(source, /function buildMaterialHref\(item: any\): string/);
    assert.match(source, /new URLSearchParams\(\{ q: title \}\)/);
    assert.match(source, /推荐时必须列出下方条目的标题和链接/);
    assert.doesNotMatch(source, /说不定能找到对应的节目/);
    assert.doesNotMatch(source, /可以先去搜一下/);
  });
});
