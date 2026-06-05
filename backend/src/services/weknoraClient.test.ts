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
  searchGuestKnowledge,
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
