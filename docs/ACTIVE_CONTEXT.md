# Active Context - Xianfeng

Last rewritten: 2026-07-15

> This file is a SNAPSHOT, not a journal. Rewrite it at every workstream close,
> keep it around 60 lines, and use git history for older context.

## Current Focus

Guest detail pages split legacy semicolon-delimited book source strings into
real list names, remove exact normalized duplicates in first-seen order, and
link each card to that specific list. The public books page applies the same
parser when filtering, so a selected list matches books whose combined source
field contains it. This remains a frontend interpretation of existing data;
production records and backend API contracts are unchanged.

The WeChat mini-program is adding minimal child-profile onboarding. An
incomplete local archive opens a native modal for city, region, stage, and
grade; closing lasts only for the current foreground session. Before login,
saving creates pending personalization context rather than a formal archive.
After phone login the shell reads the account archives first: an exact match
is reused, an empty account gets its first child, and different data requires
an explicit create-or-discard choice without overwriting an existing child.
Each resolved choice refreshes the visible list.
Programs, local Reading, Materials, and Topics use field-aware weights for
region, city, exact and adjacent grade, and stage before pagination.
Structured fields and tags outweigh body text; zero-score content keeps its
business order. Search, detail, and the external book library keep their
existing order.

WeChat mini-program virtual payment is being integrated for Plus and Pro
virtual products. Backend owns virtual product pricing, checkout signatures,
official query reconciliation, and idempotent point/membership delivery.
The native Pro page calls `/api/billing/virtual-orders` with a fresh
`wx.login` code and invokes `wx.requestVirtualPayment`; ordinary web WeChat
Pay remains separate.

Mini-program protected actions use their first tap as the native
`getPhoneNumber` gesture. The shared phone-login component runs headlessly;
public pages remain visible and no page-entry or HTTP 401 path displays an
intermediate login card. Safe initiating actions may resume once after login,
while Pro authorization never creates an order or starts payment automatically.

Mama Haozhuan task assignments now also carry one private posting-content link
per user. Operators can fill links individually or import an Excel file after
preflight; assigned users copy the selectable link from the mini-program or
mobile Web task-management dialog and open it externally. The mobile Web flow
now mirrors account-state routing, assigned/claimable tasks, detail, and proof
submission.

Welfare campaigns with activation codes cap total stock at the imported-code
count and floor it at the claimed count. The admin UI reports the actual saved
stock whenever the backend adjusts an operator-entered value. Historical rows
with more claims than codes reject updates until operators correct the data.

## Live / Waiting Workstreams

| Workstream | State | Waiting on |
| --- | --- | --- |
| Mini-program profile onboarding and list personalization | active | WeChat DevTools/device visual and logged-in sync verification |
| WeChat mini-program virtual payment | active | WeChat后台 product/callback config, public HTTPS sandbox callback/backend, and DevTools/device sandbox validation |
| Mama Haozhuan task dispatch | active | Admin and mini-program runtime review of per-user content links, plus mobile Web authenticated runtime and visual review; SMS intentionally excluded |
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

- 2026-07-15 - Native guest detail shows real authored books returned by the
  guest API's exact published-book author match, without mixing public
  references into the section. Social profiles remain real guest fields and
  copy their URL or account name in the mini program rather than opening an
  external page; empty authored and social sections are omitted.

- 2026-07-15 - Treat semicolon-delimited `sourceName` values as multiple real
  guest booklists. Normalize whitespace and wrapping book-title marks, preserve
  first-seen order, avoid fuzzy merging, and filter `/books` by parsed-list
  membership without rewriting production data. Public guest detail now owns
  the complete normalized list contract; mobile web and native mini-program
  show five entries initially with expand/collapse, while desktop web remains
  fully expanded.

- 2026-07-15 - Collect only city, region, stage, and grade in a native modal.
  Keep anonymous input as pending personalization context; after login read
  remote archives before matching, creating, or discarding it, and never
  overwrite an existing child. Personalize only the four ordinary native lists.
  Rank their real structured fields, tags, titles, and body text with explicit
  weights; keep zero-score content stable and refresh before remote sync ends.

- 2026-07-14 - Keep mini-program public pages visible when logged out and use
  the first protected-action tap as the `getPhoneNumber` gesture. Do not show a
  custom intermediate login card; consume safe pending actions once, and keep
  payment behind its explicit post-login confirmation.
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
