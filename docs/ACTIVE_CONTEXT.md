# Active Context - Xianfeng

Last rewritten: 2026-07-14

> This file is a SNAPSHOT, not a journal. Rewrite it at every workstream close,
> keep it around 60 lines, and use git history for older context.

## Current Focus

WeChat mini-program virtual payment is being integrated for Plus and Pro
virtual products. Backend owns virtual product pricing, checkout signatures,
official query reconciliation, and idempotent point/membership delivery.
The native Pro page calls `/api/billing/virtual-orders` with a fresh
`wx.login` code and invokes `wx.requestVirtualPayment`; ordinary web WeChat
Pay remains separate.

Mama Haozhuan task assignments now also carry one private posting-content link
per user. Operators can fill links individually or import an Excel file after
preflight; assigned users copy the selectable link from the mini-program or
mobile Web task-management dialog and open it externally. The mobile Web flow
now mirrors account-state routing, assigned/claimable tasks, detail, and proof
submission.

## Live / Waiting Workstreams

| Workstream | State | Waiting on |
| --- | --- | --- |
| WeChat mini-program virtual payment | active | WeChat后台 product/callback config, public HTTPS sandbox callback/backend, and DevTools/device sandbox validation |
| Mama Haozhuan task dispatch | active | Admin and mini-program runtime review of per-user content links; SMS intentionally excluded |
| Governance bootstrap | active | Review of newly added docs and whether to keep the local `evolab/` clone inside this checkout |
| Xiaowanzi treasure box welfare | active | Rendered public/admin review after the local app is running |
| Existing frontend visual changes | unknown | Owner of pre-existing modifications in `frontend/public/screens/admin.css`, `frontend/public/screens/public.css`, and `frontend/src/pages/LandingPage.tsx` |
| WeKnora global RAG plan | proposed | Confirmation whether the 2026-06-06 plan is still active, deferred, or obsolete |

## Standing Constraints

- `backend/uploads/` is runtime data. Code release does not carry uploaded media.
- `backend/secrets/`, `.env`, `.env.production`, and `backend/.env` are not
  tracked release content and must not be overwritten by deploy syncs.
- WeChat virtual-payment Offer ID, app key, callback URLs, and production
  secrets are local/operations configuration, not repository content.
- Production deploys should follow `RELEASE_GUIDE.md` and
  `RELEASE_CLEAN_FLOW.md`; release scripts are the guardrails.
- AppleDouble files (`._*`) are macOS volume noise and must not be committed.
- `docs/ACTIVE_CONTEXT.md` is rewritten, not appended.

## Recent Decisions

- 2026-07-14 - Store Mama Haozhuan posting content as a private URL on each
  task assignment. Support manual editing and preview-before-commit Excel
  import, expose the URL only to its assigned user, and do not send SMS in this
  version.
- 2026-07-11 - Mini-program virtual products use WeChat Mini Program Virtual
  Payment only. Client success and push notifications are triggers, not
  delivery proof; entitlement is granted only after trusted official query
  validation.
- 2026-07-13 - Local Jiyue books use a live 100-point quality score owned by
  the backend. Public ordering is normal records, then real-cover records with
  no introduction, then fallback-cover records. Scores are derived at request
  time rather than stored, and admin book rows expose deduction details.
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
