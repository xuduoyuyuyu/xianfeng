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
    assert.match(source, /xiaowanziContext\.promptBlock[\s\S]*rag\.promptBlock/);
  });
});
