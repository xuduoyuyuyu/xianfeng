import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  WeknoraClientError,
  ensureGuestKnowledgeBase,
  normalizeWeknoraSearchResults,
  requestWeknora,
  resolveWeknoraConfig,
  searchGlobalKnowledge,
  searchGuestKnowledge,
  signWeknoraCloudHeaders,
  syncGuestKnowledgeDocuments,
} from "./weknoraClient";

function tempStorePath() {
  const dir = mkdtempSync(path.join(tmpdir(), "weknora-client-test-"));
  return {
    path: path.join(dir, "store.json"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe("weknoraClient", () => {
  it("parses global RAG knowledge-base configuration", () => {
    const config = resolveWeknoraConfig({
      WEKNORA_ENABLED: "true",
      WEKNORA_BASE_URL: "https://weknora.example.com/api/v1",
      WEKNORA_APP_ID: "app-test",
      WEKNORA_API_KEY: "sk-test",
      WEKNORA_GLOBAL_KB_IDS: "kb-a, kb-b ,,kb-c",
      WEKNORA_RAG_TOP_K: "6",
      WEKNORA_RAG_TIMEOUT_MS: "1500",
    } as any);

    assert.equal(config.appId, "app-test");
    assert.deepEqual(config.globalKbIds, ["kb-a", "kb-b", "kb-c"]);
    assert.equal(config.ragTopK, 6);
    assert.equal(config.timeoutMs, 1500);
  });

  it("signs WeKnora Cloud requests with the official AppID and body digest algorithm", () => {
    const headers = signWeknoraCloudHeaders({
      appId: "app-test",
      apiKey: "sk-test",
      requestId: "req-1",
      timestamp: "1710000000",
      nonce: "abc1234567890000",
      bodyJson: "{}",
    });

    assert.equal(headers["X-APPID"], "app-test");
    assert.equal(headers["X-API-Key"], "sk-test");
    assert.equal(headers["X-Request-ID"], "req-1");
    assert.equal(headers["X-Timestamp"], "1710000000");
    assert.equal(headers["X-Nonce"], "abc1234567890000");
    assert.equal(headers["X-Signature"], "54b6db57cc427ea56e6c90121e490d95");
  });

  it("searches configured global knowledge bases with signed AppID auth", async () => {
    const calls: Array<{ url: string; init: any }> = [];
    const fetchImpl = async (url: any, init: any = {}) => {
      calls.push({ url: String(url), init });
      return Response.json({
        data: [
          {
            id: "global-chunk-1",
            content: "择校前先明确孩子画像和家庭约束。",
            knowledge_id: "knowledge-global-1",
            knowledge_title: "升学规划方法论",
            knowledge_filename: "planning.md",
            score: 0.88,
          },
        ],
      });
    };

    const hits = await searchGlobalKnowledge(
      { query: "怎么做升学规划", limit: 3 },
      {
        config: {
          enabled: true,
          baseUrl: "http://weknora.local/api/v1",
          appId: "app-test",
          apiKey: "sk-test",
          guestKbPrefix: "xf-guest",
          timeoutMs: 200,
          globalKbIds: ["kb-a", "kb-b"],
          ragTopK: 3,
        },
        fetchImpl,
      }
    );

    assert.equal(calls[0].url, "http://weknora.local/api/v1/knowledge-search");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers["X-API-Key"], "sk-test");
    assert.equal(calls[0].init.headers["X-APPID"], "app-test");
    assert.ok(calls[0].init.headers["X-Request-ID"]);
    assert.ok(calls[0].init.headers["X-Timestamp"]);
    assert.ok(calls[0].init.headers["X-Nonce"]);
    assert.ok(calls[0].init.headers["X-Signature"]);
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      query: "怎么做升学规划",
      knowledge_base_ids: ["kb-a", "kb-b"],
    });
    assert.equal(hits[0].chunkId, "global-chunk-1");
    assert.equal(hits[0].sourceTitle, "升学规划方法论");
    assert.equal(hits[0].text, "择校前先明确孩子画像和家庭约束。");
  });

  it("creates guest knowledge bases with API-key auth", async () => {
    const store = tempStorePath();
    const calls: Array<{ url: string; init: any }> = [];
    const fetchImpl = async (url: any, init: any = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/knowledge-bases")) {
        if (init?.method === "POST") {
          return Response.json({ data: { id: "kb_guest_1" } });
        }
        return Response.json({ data: [] });
      }
      return Response.json({});
    };

    try {
      const result = await ensureGuestKnowledgeBase(
        { guestId: "guest-1", guestName: "廖老师" },
        {
          config: {
            enabled: true,
            baseUrl: "http://weknora.local/api/v1",
            apiKey: "sk-test",
            guestKbPrefix: "xf-guest",
            timeoutMs: 200,
          },
          fetchImpl,
          storePath: store.path,
        }
      );

      assert.equal(result.kbId, "kb_guest_1");
      assert.equal(calls[1].url, "http://weknora.local/api/v1/knowledge-bases");
      assert.equal(calls[1].init.method, "POST");
      assert.equal(calls[1].init.headers["X-API-Key"], "sk-test");
      assert.match(String(calls[1].init.body), /xf-guest-廖老师/);
    } finally {
      store.cleanup();
    }
  });

  it("skips unchanged document uploads and keeps source metadata for search mapping", async () => {
    const store = tempStorePath();
    let manualPostCount = 0;
    const fetchImpl = async (url: any, init: any = {}) => {
      const target = String(url);
      if (target.endsWith("/knowledge-bases")) {
        if (init?.method === "POST") return Response.json({ data: { id: "kb_guest_1" } });
        return Response.json({ data: [] });
      }
      if (target.endsWith("/knowledge-bases/kb_guest_1/knowledge/manual")) {
        manualPostCount += 1;
        return Response.json({ data: { id: "knowledge_1" } });
      }
      if (target.endsWith("/knowledge-search")) {
        return Response.json({
          data: {
            knowledge_references: [
              {
                id: "chunk_1",
                content: "家长要先处理关系，再处理问题。",
                knowledge_id: "knowledge_1",
                knowledge_title: "青春期亲子沟通",
                score: 0.91,
              },
            ],
          },
        });
      }
      return Response.json({});
    };

    const options = {
      config: {
        enabled: true,
        baseUrl: "http://weknora.local/api/v1",
        apiKey: "sk-test",
        guestKbPrefix: "xf-guest",
        timeoutMs: 200,
      },
      fetchImpl,
      storePath: store.path,
    };

    try {
      await syncGuestKnowledgeDocuments(
        {
          guestId: "guest-1",
          guestName: "廖老师",
          documents: [
            {
              sourceKey: "program_transcript:ep12:18:30:0",
              title: "青春期亲子沟通",
              content: "家长要先处理关系，再处理问题。",
              sourceType: "program_transcript",
              sourceId: "ep12",
              locator: "18:30",
              url: "/programs/ep12",
            },
          ],
        },
        options
      );
      await syncGuestKnowledgeDocuments(
        {
          guestId: "guest-1",
          guestName: "廖老师",
          documents: [
            {
              sourceKey: "program_transcript:ep12:18:30:0",
              title: "青春期亲子沟通",
              content: "家长要先处理关系，再处理问题。",
              sourceType: "program_transcript",
              sourceId: "ep12",
              locator: "18:30",
              url: "/programs/ep12",
            },
          ],
        },
        options
      );

      const hits = await searchGuestKnowledge({ guestId: "guest-1", query: "青春期怎么沟通", limit: 3 }, options);

      assert.equal(manualPostCount, 1);
      assert.equal(hits[0].chunkId, "chunk_1");
      assert.equal(hits[0].sourceType, "program_transcript");
      assert.equal(hits[0].sourceTitle, "青春期亲子沟通");
      assert.equal(hits[0].locator, "18:30");
      assert.equal(hits[0].url, "/programs/ep12");
    } finally {
      store.cleanup();
    }
  });

  it("normalizes WeKnora search references from common response envelopes", () => {
    const hits = normalizeWeknoraSearchResults(
      {
        data: {
          knowledge_references: [
            {
              id: "chunk_1",
              content: "命中文本",
              knowledge_id: "knowledge_1",
              knowledge_title: "来源标题",
              score: 1.4,
            },
          ],
        },
      },
      () => ({
        sourceType: "program_summary",
        sourceId: "program-1",
        sourceTitle: "本地标题",
        locator: "节目摘要",
        url: "/programs/ep1",
      })
    );

    assert.deepEqual(hits[0], {
      chunkId: "chunk_1",
      sourceType: "program_summary",
      sourceId: "program-1",
      sourceTitle: "本地标题",
      locator: "节目摘要",
      text: "命中文本",
      url: "/programs/ep1",
      score: 1.4,
    });
  });

  it("turns slow WeKnora calls into typed timeout errors", async () => {
    const fetchImpl = (_url: any, init: any = {}) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });

    await assert.rejects(
      () =>
        requestWeknora("/health", {
          config: {
            enabled: true,
            baseUrl: "http://weknora.local/api/v1",
            apiKey: "sk-test",
            guestKbPrefix: "xf-guest",
            timeoutMs: 5,
          },
          fetchImpl,
        }),
      (error: any) => error instanceof WeknoraClientError && error.code === "WEKNORA_TIMEOUT"
    );
  });
});
