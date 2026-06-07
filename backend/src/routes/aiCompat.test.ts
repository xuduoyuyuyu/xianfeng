import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import aiCompatRoutes from "./aiCompat";

describe("ai compatibility routes", () => {
  it("registers chat and product-analysis AI endpoints", () => {
    const routes = ((aiCompatRoutes as any).stack || [])
      .map((layer: any) => ({ path: layer.route?.path, methods: Object.keys(layer.route?.methods || {}) }))
      .filter((route: any) => route.path);

    assert.deepEqual(routes, [
      { path: "/chat", methods: ["post"] },
      { path: "/analyze-product", methods: ["post"] },
    ]);
  });

  it("injects shared RAG context into generic chat prompts", () => {
    const source = readFileSync(resolve(__dirname, "aiCompat.ts"), "utf8");

    assert.match(source, /buildRagContext/);
    assert.match(source, /routeKey:\s*"ai_chat"/);
    assert.match(source, /rag\.promptBlock/);
  });
});
