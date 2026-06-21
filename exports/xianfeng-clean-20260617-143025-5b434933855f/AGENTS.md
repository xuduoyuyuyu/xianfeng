# Xianfeng Agent Rules

This repository uses `docs/` as the shared source of truth for agent work.
Read this file before changing code, docs, release scripts, or deployment
configuration.

## Source Of Truth

1. `AGENTS.md` defines repository operating rules.
2. `docs/ACTIVE_CONTEXT.md` is the current project snapshot. It is rewritten,
   not appended, when a workstream closes.
3. `docs/INDEX.md` links decisions, module boundaries, roadmap, and live
   context.
4. `docs/decisions/` stores ADRs for durable architecture or boundary choices.
5. `docs/modules/` stores module ownership and FOR / NOT FOR boundaries.
6. `docs/roadmap/` stores active, deferred, and obsolete work.
7. Release procedure remains in `RELEASE_GUIDE.md` and
   `RELEASE_CLEAN_FLOW.md`.

## Work Modes

### DO

Proceed without asking for approval for reversible work:

- Read files, search, inspect git state, and run local read-only checks.
- Edit local source or docs within the requested scope.
- Add focused tests or documentation required by the task.
- Run local tests, builds, lint, browser checks, and local health checks.

### THINK FIRST

State assumptions and tradeoffs before acting when:

- The request has multiple plausible interpretations.
- The change crosses module boundaries.
- The change affects auth, billing, data persistence, uploads, release scripts,
  payment, AI routing, or production behavior.
- The likely fix conflicts with existing docs or user-visible behavior.

### REQUIRE APPROVAL

Ask first and state intent plus impact before irreversible or external work:

- `git push`, force-push, PR creation, production deployment, or server changes.
- Database migrations against non-local data.
- Deleting branches, release artifacts, uploads, secrets, or user data.
- Sending external messages or changing third-party service configuration.

Boundary cases are treated as REQUIRE APPROVAL.

## Module Boundaries

Use `docs/modules/` for detailed ownership. Initial modules:

- `frontend-web`: React/Vite web experience and static screen previews.
- `backend-api`: Express API, models, services, auth, billing, AI, uploads.
- `platform-release-and-app-shells`: Docker, deploy/release scripts, mobile
  shell, WeChat mini program shell, environment boundaries.

Do not move behavior between modules without updating the matching module doc
or writing an ADR if the boundary changes.

## Capability Vs Component

Describe user-facing intent as a capability and implementation files as
components. Roadmap entries must name both. Example: "Pro entitlement display"
is a capability; `backend/src/services/billing.ts` and
`frontend/src/pages/ProPage.tsx` are components.

## State Vocabulary

ADR statuses use: `proposed`, `accepted`, `superseded`, `deprecated`.

Roadmap statuses use: `proposed`, `active`, `blocked`, `completed`,
`deferred`, `obsolete`.

Do not mix these vocabularies. `accepted` is not a roadmap status; `active` is
not an ADR status.

## Documentation Governance

- `docs/ACTIVE_CONTEXT.md` is a snapshot, not a journal. Rewrite the whole file
  at workstream close and keep it short enough for a new agent to read first.
- Do not create generic `future_plan.md`, `ideas.md`, or TODO dump files.
  Future work belongs in `docs/roadmap/deferred/`.
- Obsolete plans are indexed under `docs/roadmap/obsolete/` rather than deleted
  when their history remains useful.
- When a task changes durable behavior, update the related module doc, roadmap
  item, ADR, or active context in the same workstream.

## Code Traceability

Every non-trivial change should trace to one of:

- A user request in the current thread.
- A roadmap entry in `docs/roadmap/`.
- An ADR or module boundary update.
- A targeted bug reproduction or verification finding.

Avoid unrelated refactors, formatting churn, and opportunistic cleanup.

## Release And Runtime Guardrails

- `backend/uploads/` is runtime data and is intentionally not part of the code
  release. Do not delete or overwrite it during deploys.
- `backend/secrets/`, `.env`, `.env.production`, and `backend/.env` contain
  local or production secrets. Do not commit them or overwrite production copies.
- Follow `RELEASE_GUIDE.md` and `RELEASE_CLEAN_FLOW.md` for deployment.
- `scripts/release/freeze-current.sh` and
  `scripts/release/verify-clean-structure.sh` are release guardrails.
- macOS AppleDouble files (`._*`) are noise and should not be committed.

## Validation Standard

- Backend targeted tests: run from `backend/` with
  `node --test --import tsx <test-file>` when possible.
- Frontend build: run from `frontend/` with `npm run build` for broad UI changes.
- Frontend rendering changes require browser or screenshot verification when a
  local app is available.
- Release changes require the relevant release script or dry-run/config check.
- If verification is not run, say so explicitly in the final report.

## Completion Report

Report:

1. What changed.
2. What verification actually ran.
3. What was not verified.
4. Remaining assumptions or risks.
