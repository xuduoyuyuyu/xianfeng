# Active Roadmap

## XF-001: Governance Bootstrap

Status: active

Capability: AI-readable repository governance

Components:
- `AGENTS.md`
- `CLAUDE.md`
- `docs/`

ADR: ADR-001

Acceptance Criteria:
- `docs/INDEX.md` links decisions, modules, roadmap, active context, and
  existing operational docs.
- `docs/ACTIVE_CONTEXT.md` gives a current snapshot without becoming a journal.
- `AGENTS.md` defines source-of-truth order, work modes, module boundaries,
  release guardrails, and validation expectations.

## XF-002: Release Guardrail Consolidation

Status: proposed

Capability: Safe deploy and clean release workflow

Components:
- `RELEASE_GUIDE.md`
- `RELEASE_CLEAN_FLOW.md`
- `scripts/release/`
- `scripts/deploy/`
- `.github/workflows/deploy.yml`

ADR: ADR-001

Acceptance Criteria:
- Release docs and scripts agree on required freeze, verification, and deploy
  steps.
- Runtime uploads, secrets, and environment files remain excluded from code
  release and protected from destructive syncs.
- AppleDouble cleanup expectations are documented where release operators look.

## XF-003: WeKnora Global RAG Plan Triage

Status: proposed

Capability: Shared retrieval context before AI model calls

Components:
- `docs/superpowers/plans/2026-06-06-weknora-global-rag.md`
- `backend/src/services/`
- `backend/src/routes/`

ADR: ADR-001

Acceptance Criteria:
- Confirm whether the existing WeKnora plan is active, deferred, completed, or
  obsolete.
- If active, move implementation tracking into this roadmap and keep the plan as
  the detailed execution artifact.
- If obsolete, index it under `docs/roadmap/obsolete/README.md` with a reason.

## XF-004: Mini-program Profile Onboarding And List Personalization

Status: active

Capability: Collect a minimal child profile and prioritize relevant native content

Components:
- `apps/wechat-miniprogram/components/profile-onboarding/`
- `apps/wechat-miniprogram/utils/profileOnboarding.js`
- `backend/src/services/contentPersonalization.ts`
- Public Programs, Books, Learning Materials, and Topic list handlers

Acceptance Criteria:
- Incomplete profiles see the modal again on each later app entry after closing.
- Saving creates or updates the active `孩子` archive with city, region, and grade.
- Phone login retries local-first profile and archive synchronization.
- Only the four ordinary native list requests are personalized before pagination.
- Structured fields, tags, titles, and body text use explicit profile weights.
- Adjacent grades stay inside the selected school stage.
- Zero-score, equal-quality Reading, and no-profile list order remains stable.
- Local save refreshes the visible list without waiting for remote profile sync.

## XF-005: Structured Language Assessment Toolkit

Status: active

Capability: Versioned, source-linked Chinese and English learning inventories

Components:
- `docs/superpowers/specs/2026-08-13-structured-language-assessment-toolkit-design.md`
- `docs/superpowers/specs/2026-08-13-english-picture-naming-pilot-bank.md`
- `docs/superpowers/specs/2026-08-13-english-picture-naming-real-photo-candidate-audit.md`
- `apps/wechat-miniprogram/pages/flash-test/`
- `apps/wechat-miniprogram/utils/characterRecognition.js`
- `backend/src/routes/flashTest.ts`
- Future spoken-response and reference-link components defined by the design

Acceptance Criteria:
- Every assessment states its input, response, measured construct, and mapped
  language activity modes.
- Framework, curriculum, content, measurement, and vendor references are stored
  as typed sources linked to the exact rules they support.
- Results lock their item-bank, task-protocol, scoring-rule, and reference
  versions without rewriting historical snapshots.
- The first new vertical slice, English picture naming, distinguishes independent
  recall, pronunciation review, prompted reading, not-yet-known, and invalid
  recording states.
- Structured evidence, per-child mastery, delayed review, and result-to-practice
  rules follow the six-layer product design without granting AI authority over
  formal scores or mastery state.
- Current login, child archive, progress, history, and privacy-safe sharing paths
  are reused instead of creating a parallel identity or assessment system.
