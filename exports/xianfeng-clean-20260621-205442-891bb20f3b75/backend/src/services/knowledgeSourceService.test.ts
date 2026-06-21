import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildKnowledgeSourcePayload,
  extractKnowledgeFileText,
} from "./knowledgeSourceService";

describe("knowledgeSourceService", () => {
  it("extracts text from supported uploaded knowledge files", () => {
    const text = extractKnowledgeFileText({
      originalname: "lecture-notes.md",
      mimetype: "text/markdown",
      buffer: Buffer.from("# 讲座笔记\n\n先稳定关系，再处理问题。", "utf8"),
    });

    assert.match(text, /先稳定关系/);
  });

  it("builds a ready guest knowledge-source payload when text is available", () => {
    const payload = buildKnowledgeSourcePayload(
      {
        guestId: "64f000000000000000000001",
        title: "廖老师讲座资料",
        summary: "青春期沟通资料摘要",
      },
      {
        originalname: "notes.txt",
        mimetype: "text/plain",
        buffer: Buffer.from("家长先命名情绪，再讨论规则。", "utf8"),
        url: "/uploads/knowledge/notes.txt",
      }
    );

    assert.equal(payload.ownerType, "guest");
    assert.equal(payload.ownerId, "64f000000000000000000001");
    assert.equal(payload.sourceKind, "uploaded_file");
    assert.equal(payload.parseStatus, "ready");
    assert.equal(payload.syncStatus, "pending");
    assert.equal(payload.fileUrl, "/uploads/knowledge/notes.txt");
    assert.match(payload.rawText, /命名情绪/);
  });

  it("keeps binary documents pending unless summary or text is supplied", () => {
    const payload = buildKnowledgeSourcePayload(
      {
        guestId: "64f000000000000000000001",
        title: "PDF 资料",
      },
      {
        originalname: "report.pdf",
        mimetype: "application/pdf",
        buffer: Buffer.from("%PDF-1.4", "utf8"),
        url: "/uploads/knowledge/report.pdf",
      }
    );

    assert.equal(payload.sourceKind, "uploaded_file");
    assert.equal(payload.parseStatus, "pending");
    assert.equal(payload.rawText, "");
  });
});
