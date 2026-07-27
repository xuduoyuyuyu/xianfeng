# Active Context - Xianfeng

Last rewritten: 2026-07-17

> This file is a SNAPSHOT, not a journal. Rewrite it at every workstream close,
> keep it around 60 lines, and use git history for older context.

## Current Focus

Production program-content recovery is closed for automatic processing. Of 129
visible programs, 125 now have a transcript, a valid content pack, and valid
deep-dive content. Transcript labels are constrained to `主播·阿力`,
`主播·Jessie`, and named `嘉宾·…` roles; recovered samples stayed within the
200-character paragraph cap. Four multi-guest programs remain isolated for
manual speaker attribution because strict validation rejected them without
overwriting existing content: `6982bf7670aae7e967849f92`,
`682321da24f8559346634127`, `6a1bd1847460cabdeb589754`, and
`69d49d37b977fb2c47487017`. Full-transcript mind-map regeneration remains
blocked by tenant policy and must not be routed around.

Program summary rendering now prefers generated summary prose over the raw
episode description and truncates compatibility fallbacks at `本期嘉宾` or the
first timestamp. The live 2025 Shanghai essay episode therefore displays only
its concise thematic summary, without guest, timeline, host, music, or footer
metadata. Commits `7e47238b` and `a7394a2a` are deployed to production.
Native mini-program program details now prepare their audio context as soon as
detail data arrives; early taps show an explicit loading state while external
audio sources buffer, and playback failures remain retryable.

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
and every native sidebar menu item uses the same first-tap phone authorization
before continuing to its original destination. Pro authorization never creates
an order or starts payment automatically. After login, accounts whose station
nickname is still a generated placeholder or whose avatar is missing receive a
native WeChat avatar/nickname completion step before the pending protected
action resumes. The confirmed nickname and uploaded permanent avatar are saved
to the shared user profile; existing custom profiles are not overwritten.

Mama Haozhuan content dispatch now uses existing task claims as its only account
source: task creation, manual selection, and Excel import no longer create
assignments for unclaimed accounts. Operators can fill private links
individually, import an Excel file after preflight, or paste an ordered
task-level link pool. Pooled links bind to claims in order; exhaustion pauses
the task as waiting for content, and replenishment resumes it. Assigned users
copy the selectable link from the mini-program or mobile Web task-management
dialog and open it externally. The mobile Web flow mirrors account-state
routing, assigned/claimable tasks, detail, and proof submission. The admin 3:7
claimant master-detail view includes the bound site user ID, mobile, station
profile fields, platform account fields, operator tags, and an account-level
block that prevents new claims without disrupting existing task completion.
Submitting or updating a Mama Haozhuan profile requires an authenticated site
user; the write binds that user directly and ensures its stable numeric UID
before returning the saved profile. The native Mama Haozhuan page also gates
all profile and task content behind WeChat phone authorization, including
direct entries opened from a shared page.
Assignment responses derive proof-return
state from the completion screenshot and assignment creation time: submitted
screenshots are marked returned, missing screenshots are marked not returned,
and missing screenshots after 24 hours are marked overdue. Admin can filter all
three states from quick choices in the existing user-filter area without
storing a second status field.
Claiming a task only reserves participation. Until operations assigns a
non-empty personal content URL, clients show a waiting-for-review message and
hide proof submission and transfer credentials; the backend also rejects early
proof submissions. Feedback controls appear only after content is assigned.

Admin user management now opens a read-only user-360 detail from each account.
It aggregates the site profile, Xiaowanzi child profiles and child memories,
authenticated page visits already collected by the existing tracker, and Mama
Haozhuan profile/task timestamps into one reverse-chronological timeline. This
uses existing records only and does not add universal click or search tracking.
The full user list also derives filterable tags for Mama Haozhuan participation,
active membership tier, city, region, child stage, and every child grade before
client-side pagination, so combined filters apply to the complete loaded list.
Its keyword search also covers the stable UID plus linked Haozhuan station and
platform nicknames. Haozhuan account cards link directly to the same User 360
detail when the profile has a bound site user.
It exposes the full site user ID used by welfare claims plus the latest linked
Mama Haozhuan profile ID, and operators can page the loaded list at 20, 50, or
100 rows. Admin navigation keeps Haozhuan and Treasure Box under Decisions after
Worth Buy instead of grouping them under Users.

Mini-program Mama Haozhuan form drafts are persisted only for the current
logged-in account and use an account-scoped storage key. Logged-out, logout,
account-deletion, and unauthorized states reset private form and task data; the
legacy unscoped draft cache is discarded because it has no trustworthy owner.

Published learning materials may optionally bind to one active guest. Bound
materials appear on both Web and native mini-program guest detail pages under
“拓展资料”; Web opens the material URL and the mini program copies it.

Welfare campaigns with activation codes cap total stock at the imported-code
count and floor it at the claimed count. The admin UI reports the actual saved
stock whenever the backend adjusts an operator-entered value. Historical rows
with more claims than codes reject updates until operators correct the data.

## Live / Waiting Workstreams

| Workstream | State | Waiting on |
| --- | --- | --- |
| Production program-content recovery | completed | Four isolated multi-guest programs require manual speaker attribution; thematic mind-map regeneration is policy-blocked |
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

- 2026-07-17 - Reject recovery output unless it preserves named host/guest
  attribution and the 200-character paragraph cap; failed strict validation
  does not overwrite prior content. Prefer generated summary prose in program
  detail and never display guest, timestamp, host, music, or footer metadata in
  the summary card.

- 2026-07-16 - Treat a Mama Haozhuan task claim as the sole authority for
  content dispatch. Do not create assignments from task auto-match, admin
  account selection, or content-link import. Resolve site identity by the
  claimant profile phone for admin distinction; keep free-form operator tags
  on the Mama profile and enforce its account-level order block only on new
  claims. Authenticated application and first-claim lookup persist the optional
  user ID on the profile, with normalized phone matching retained for legacy
  records.

- 2026-07-15 - Treat phone authorization and WeChat avatar/nickname completion
  as two consecutive consent steps. Persist the result in the shared user
  profile, update the current mini-program session immediately, and let Mama
  Haozhuan fill only an empty station display name without touching any
  Xiaohongshu or Douyin account nickname.

- 2026-07-15 - Native guest detail shows real authored books returned by the
  guest API's exact published-book author match, without mixing public
  references into the section. Authored works open the native book detail and
  recommended booklists switch to the native Reading tab with the exact source
  filter. Social profiles remain real guest fields and copy their URL or
  account name rather than opening an external page; empty sections are omitted.

- 2026-07-22 - Native program, book, external-library, material, guest, and
  topic detail shares retain their exact detail target and reopen it through
  `pages/webview/index` instead of falling back to the website home. The share
  page remains registered for Xiaowanzi conversation content, scene-based QR
  entry, and compatibility with existing shared links. Sharing from the native
  materials tab while one material's link dialog is open now reopens the same
  materials page with that link dialog restored. The in-app dialog stays
  vertically centered, while its dedicated share image renders the same dialog
  higher inside the WeChat card crop; a plain materials-tab share still opens
  the materials list.

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
  import, plus an ordered task-level link pool with automatic pause on
  exhaustion and resume on replenishment. Expose the URL only to its assigned
  user, and do not send SMS in this version. Derive returned, not-returned, and
  24-hour-overdue proof markers from each assignment's completion screenshot and
  creation time so operators can filter them without a duplicated stored state.
- 2026-07-15 - Scope Mama Haozhuan mini-program drafts to the authenticated
  account. Never restore private form or task data while logged out, and discard
  the legacy unscoped cache instead of guessing its owner.
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
