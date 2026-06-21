# WeKnora Global RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route 小玩子, `/api/ai/chat`, 嘉宾 AI 分身, and 知物 product analysis through one WeKnora-backed retrieval context before model calls.

**Architecture:** Extend the existing WeKnora client with global knowledge-base search, then add a small `ragContextService` that formats retrieved citations into a prompt block. Existing route code calls the service before the model request and falls back to local behavior when WeKnora is disabled, unconfigured, or has no hits.

**Tech Stack:** Node test runner, TypeScript, Express, existing OpenAI-compatible model calls, WeKnora `/api/v1/knowledge-search`.

---

### Task 1: WeKnora Global Search

**Files:**
- Modify: `backend/src/services/weknoraClient.ts`
- Modify: `backend/src/services/weknoraClient.test.ts`

- [ ] Add config parsing for `WEKNORA_GLOBAL_KB_IDS`, `WEKNORA_RAG_TOP_K`, and `WEKNORA_RAG_TIMEOUT_MS`.
- [ ] Add `searchGlobalKnowledge({ query, limit })`, using `POST /knowledge-search` with `knowledge_base_ids`.
- [ ] Verify with `node --test --import tsx src/services/weknoraClient.test.ts`.

### Task 2: Shared RAG Context Service

**Files:**
- Create: `backend/src/services/ragContextService.ts`
- Create: `backend/src/services/ragContextService.test.ts`

- [ ] Write tests for prompt block formatting and disabled/no-hit fallback.
- [ ] Implement `buildRagContext({ routeKey, query, localContext })`.
- [ ] Verify with `node --test --import tsx src/services/ragContextService.test.ts`.

### Task 3: AI Entry Wiring

**Files:**
- Modify: `backend/src/routes/tutorbot.ts`
- Modify: `backend/src/routes/aiCompat.ts`
- Modify: `backend/src/routes/worthbuy.ts`

- [ ] Inject `buildRagContext` into 小玩子 messages before model calls.
- [ ] Inject the same service into `/api/ai/chat`.
- [ ] Add `/api/ai/analyze-product` so 知物 has a real model-backed endpoint and RAG context.
- [ ] Verify targeted backend tests and a local HTTP smoke test when credentials are present.

### Task 4: Config Docs

**Files:**
- Modify: `backend/.env.example`
- Modify: `.env.production.example`

- [ ] Add secret-free WeKnora global RAG env keys.
- [ ] Keep API keys out of tracked examples.
