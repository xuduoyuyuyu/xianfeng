import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGuestAgentChunksFromKnowledgeSources,
  buildGuestAgentChunksFromDocs,
  buildGuestAgentFallbackAnswer,
  buildGuestAgentSystemPrompt,
  retrieveGuestAgentChunks,
  retrieveGuestAgentCitations,
} from "./guestAgentService";

describe("guestAgentService", () => {
  it("builds chunks from guest profile and related program content", () => {
    const chunks = buildGuestAgentChunksFromDocs({
      guest: {
        _id: "64f000000000000000000001",
        name: "廖老师",
        title: "家庭教育实践分享者",
        bio: "擅长青春期沟通和家庭关系修复。",
        publications: [{ title: "沟通访谈", url: "https://example.com", summary: "先处理关系，再处理问题。" }],
      },
      programs: [
        {
          _id: "64f000000000000000000002",
          programCode: "ep12",
          title: "青春期亲子沟通",
          summary: { body: "本期讨论青春期沟通与学习动力。" },
          transcript: [{ time: "18:30", speaker: "廖老师", text: "家长要先处理关系，再处理问题。" }],
          contentPack: { quickView: [{ timeRangeLabel: "18:30-20:00", summary: "先稳定关系，再讨论具体行为。" }] },
        },
      ],
    });

    assert.ok(chunks.some((chunk) => chunk.sourceType === "guest_profile" && chunk.text.includes("青春期沟通")));
    assert.ok(chunks.some((chunk) => chunk.sourceType === "program_transcript" && chunk.locator === "18:30"));
    assert.ok(chunks.some((chunk) => chunk.sourceType === "public_material" && chunk.url === "https://example.com"));
  });

  it("builds citation-compatible chunks from admin knowledge sources", () => {
    const chunks = buildGuestAgentChunksFromKnowledgeSources([
      {
        _id: "65f000000000000000000101",
        guestId: "64f000000000000000000001",
        title: "廖老师线下讲座笔记",
        sourceKind: "uploaded_file",
        fileUrl: "/uploads/knowledge/notes.md",
        summary: "讲座强调青春期亲子沟通先稳定关系。",
        rawText: "青春期孩子冲突升级时，家长先停下来命名情绪，再讨论规则。",
        status: "active",
        parseStatus: "ready",
      },
      {
        _id: "65f000000000000000000102",
        guestId: "64f000000000000000000001",
        title: "停用资料",
        rawText: "这段内容不应被检索。",
        status: "archived",
        parseStatus: "ready",
      },
      {
        _id: "65f000000000000000000103",
        guestId: "64f000000000000000000001",
        title: "空资料",
        rawText: "",
        summary: "",
        status: "active",
        parseStatus: "pending",
      },
    ] as any);

    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].sourceType, "public_material");
    assert.equal(chunks[0].sourceId, "65f000000000000000000101");
    assert.equal(chunks[0].sourceTitle, "廖老师线下讲座笔记");
    assert.equal(chunks[0].locator, "后台上传资料");
    assert.equal(chunks[0].url, "/uploads/knowledge/notes.md");
    assert.match(chunks[0].text, /先稳定关系/);
  });

  it("retrieves the most relevant chunks for a question", () => {
    const chunks = buildGuestAgentChunksFromDocs({
      guest: { _id: "64f000000000000000000001", name: "廖老师", title: "嘉宾", bio: "研究家庭沟通。" },
      programs: [
        {
          _id: "64f000000000000000000002",
          programCode: "ep12",
          title: "青春期亲子沟通",
          transcript: [
            { time: "18:30", speaker: "廖老师", text: "青春期孩子沟通时，家长先处理关系，再处理问题。" },
            { time: "24:00", speaker: "主持人", text: "今天还聊到了阅读兴趣。" },
          ],
        },
      ],
    });

    const hits = retrieveGuestAgentChunks(chunks, "青春期孩子不愿沟通怎么办", 2);

    assert.equal(hits[0].sourceType, "program_transcript");
    assert.equal(hits[0].locator, "18:30");
  });

  it("returns a safe fallback when there are no citations", () => {
    const answer = buildGuestAgentFallbackAnswer("廖老师");

    assert.match(answer, /资料库还没有足够信息/);
    assert.match(answer, /廖老师/);
  });

  it("instructs the model not to invent recommended programs", () => {
    const prompt = buildGuestAgentSystemPrompt("廖老师");

    assert.match(prompt, /不能编造不存在的节目/);
    assert.match(prompt, /只允许推荐可用资料中出现的节目/);
  });

  it("keeps citation lists out of the model answer body", () => {
    const prompt = buildGuestAgentSystemPrompt("廖老师");

    assert.match(prompt, /不要在回答正文末尾输出参考来源/);
    assert.doesNotMatch(prompt, /回答末尾用一小段说明可参考的来源编号/);
  });

  it("uses WeKnora retrieval when configured hits are available", async () => {
    const chunks = buildGuestAgentChunksFromDocs({
      guest: { _id: "64f000000000000000000001", name: "廖老师", title: "嘉宾", bio: "研究家庭沟通。" },
      programs: [
        {
          _id: "64f000000000000000000002",
          programCode: "ep12",
          title: "青春期亲子沟通",
          transcript: [{ time: "18:30", speaker: "廖老师", text: "青春期孩子沟通时，家长先处理关系，再处理问题。" }],
        },
      ],
    });

    const result = await retrieveGuestAgentCitations({
      guestId: "64f000000000000000000001",
      question: "青春期怎么沟通",
      chunks,
      limit: 4,
      weknoraSearch: async () => [
        {
          chunkId: "wk-chunk-1",
          sourceType: "program_transcript",
          sourceId: "64f000000000000000000002",
          sourceTitle: "青春期亲子沟通",
          locator: "18:30",
          text: "来自 WeKnora 的命中内容",
          url: "/programs/ep12",
        },
      ],
    });

    assert.equal(result.provider, "weknora");
    assert.equal(result.citations[0].chunkId, "wk-chunk-1");
    assert.equal(result.citations[0].text, "来自 WeKnora 的命中内容");
  });

  it("falls back to local retrieval when WeKnora has no usable hits", async () => {
    const chunks = buildGuestAgentChunksFromDocs({
      guest: { _id: "64f000000000000000000001", name: "廖老师", title: "嘉宾", bio: "研究家庭沟通。" },
      programs: [
        {
          _id: "64f000000000000000000002",
          programCode: "ep12",
          title: "青春期亲子沟通",
          transcript: [{ time: "18:30", speaker: "廖老师", text: "青春期孩子沟通时，家长先处理关系，再处理问题。" }],
        },
      ],
    });

    const result = await retrieveGuestAgentCitations({
      guestId: "64f000000000000000000001",
      question: "青春期孩子不愿沟通怎么办",
      chunks,
      limit: 2,
      weknoraSearch: async () => [],
    });

    assert.equal(result.provider, "local");
    assert.equal(result.syncStatus, "weknora_no_hits");
    assert.equal(result.citations[0].sourceType, "program_transcript");
    assert.equal(result.citations[0].locator, "18:30");
  });
});
