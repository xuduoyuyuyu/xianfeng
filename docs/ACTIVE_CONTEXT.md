# Active Context - Xianfeng

Last rewritten: 2026-07-02

> This file is a SNAPSHOT, not a journal. Rewrite it at every workstream close,
> keep it around 60 lines, and use git history for older context.

## Current Focus

Mama Haozhuan is moving from account-first task assignment to task-first
dispatch. Operators list a task, open that task, then choose approved accounts
directly or filter by tags/follower count before assigning. Mini-program users
only see task assignments tied to the approved profile matching their bound
mobile.

## Live / Waiting Workstreams

| Workstream | State | Waiting on |
| --- | --- | --- |
| Mama Haozhuan task dispatch | active | Admin/product review of task-first assignment UX |
| Governance bootstrap | active | Review of newly added docs and whether to keep the local `evolab/` clone inside this checkout |
| Xiaowanzi treasure box welfare | active | Rendered public/admin review after the local app is running |
| Existing frontend visual changes | unknown | Owner of pre-existing modifications in `frontend/public/screens/admin.css`, `frontend/public/screens/public.css`, and `frontend/src/pages/LandingPage.tsx` |
| WeKnora global RAG plan | proposed | Confirmation whether the 2026-06-06 plan is still active, deferred, or obsolete |

## Standing Constraints

- `backend/uploads/` is runtime data. Code release does not carry uploaded media.
- `backend/secrets/`, `.env`, `.env.production`, and `backend/.env` are not
  tracked release content and must not be overwritten by deploy syncs.
- Production deploys should follow `RELEASE_GUIDE.md` and
  `RELEASE_CLEAN_FLOW.md`; release scripts are the guardrails.
- AppleDouble files (`._*`) are macOS volume noise and must not be committed.
- `docs/ACTIVE_CONTEXT.md` is rewritten, not appended.

## Recent Decisions

- 2026-07-02 - Model Mama Haozhuan listed tasks separately from per-profile
  task assignments. The admin task workspace owns account selection and
  assignment review; account detail modals stay focused on review and manual
  data completion.
- 2026-07-02 - Add Xiaowanzi treasure box welfare as a separate public/admin
  capability rather than reusing guest listener benefits or Mama Haozhuan task
  assignments. Claims require login, stock, and an active date window.
- 2026-06-16 - Add lightweight repo governance instead of redesigning existing
  release docs.
- 2026-06-16 - Keep release documentation as the canonical deployment guide and
  link to it from governance docs.
- 2026-06-16 - Use three initial module docs: frontend web, backend API, and
  platform/release/app shells.
- 2026-06-16 - Keep mobile invite activation quota in backend auth state, not
  frontend display state.
- 2026-06-16 - Manage mobile invite code, activation limit, used count, and
  expiry from the admin system page; env values are fallback defaults only.
