# Active Context - Xianfeng

Last rewritten: 2026-08-26

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
The same detail page generates a fixed 750 x 1520 share poster with the program
title, concise summary, tags, every guest's avatar and short introduction, and
a direct mini-program code. A single guest is followed immediately by the code;
the generated image excludes page action buttons and keeps symmetric margins.

Guest detail pages split legacy semicolon-delimited book source strings into
real list names, remove exact normalized duplicates in first-seen order, and
link each card to that specific list. The public books page applies the same
parser when filtering, so a selected list matches books whose combined source
field contains it. This remains a frontend interpretation of existing data;
production records and backend API contracts are unchanged.

The WeChat mini-program is adding minimal child-profile onboarding. Public
lists remain visible on first entry; login and child-profile onboarding open
only from an explicit user action. The archive flow collects city, region,
stage, and grade. Before login, saving creates pending personalization context
rather than a formal archive.
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

Native `闪测` keeps its catalog public, but entering the first `八大能力`
question is now a protected action. Self and child modes reuse the shared
phone-login flow, and child mode continues to use the existing remote archive
panel. The catalog and the specific `八大能力` entry both support native
friend and timeline sharing; the specific share restores the identity chooser
without carrying child identity, answers, progress, or result state. After
choosing self mode or a child archive, the client reads that
subject's newest saved result and opens it directly when present; only the
explicit `重新测一次` action starts a fresh questionnaire. After question 40,
the authenticated backend stores the 40 answers and
server-derived eight-dimension result under the current user; child submissions
must reference a child profile owned by that same account. The result page
distinguishes saving, saved, and retryable failure states instead of claiming a
local-only result, and labels all eight radar axes with their server-aligned
integer score on the shared 1-to-5 scale.

The same native catalog now includes a child-only `识字量`. It reuses the
existing child archive, authenticated result storage, latest-result restore,
restart, and privacy-safe share paths. The base bank contains 800 unique
characters, ordered from the 2024–2025 unified Chinese textbook recognition
tables for grade-one upper, grade-one lower, and grade-two upper, then split
into four 200-character display stages. The result page always shows two
independent 800-character group cards. Each card shows that group's latest
recognized count and percentage with a compact action, with the whole
card acting as the entry instead of a dominant action button. Either group can be opened at any time
for the same child without a score threshold or reselecting an archive, and
each group keeps its own progress and saved result. The second group first continues the grade-two lower
recognition table with duplicates removed, then use the 2022 curriculum
standard appendix common-character table to reach 1600 unique characters.
Across the flash-test catalog, authenticated entry defaults to the last-used
test subject: either self or the last-used child. Child-only tools skip the
subject-choice prompt: exactly one usable child enters directly, while zero or
multiple usable children open archive selection. A small,
centered bottom reselect action appears only on the first test screen and the
result screen, keeping manual switching available without interrupting an
assessment in progress.
The English-word entry is one written-word recognition test with five
independent thirty-word packs: animals, food and drinks, home and school, body and
clothing, and transport and nature. Together they include the full 150-word
content baseline. Each pack has its own latest result and restart path. Every
item starts with the word and IPA. The result page exposes all five packs as
independent status cards, matching the two-group literacy result pattern; each
card shows the latest recognized count or a not-yet-tested state and starts a
fresh check for that pack. All 150 words offer a tap-to-photo
representation backed by a locally stored, source-recorded real photograph;
generated and placeholder pictures remain prohibited. A photo is an auxiliary representation, not a second
task: it does not change the item number, answer, history, result type, or
persistence key, and every new item starts on the word view. A parent marks each word as
independently readable or not yet recognized, mirroring the literacy inventory
interaction. The primary next action records the current word as recognized and
advances immediately; `暂不认识` records the exception and also advances,
without an intermediate confirmation state. The mini-program does not request
recording permission, record audio, or invoke ASR for this flow. Results remain
framed as a fixed-bank inventory rather than active vocabulary or pronunciation
scoring. Recognized and not-yet-recognized words are shown in separate tabs
inside a result-page bottom drawer, matching the character-recognition result
pattern. The result page also exposes a design-reference drawer listing the
educational sources, institutions, versions, and their limited use in this tool
without presenting engineering layers, speech vendors, or certification claims.
The 150-word expansion uses assessment version `2026-08-14-prea1-packs-r4`;
earlier 10- and 15-word pack results remain historical and do not satisfy current
30-word pack completion. The 2026-08-15 manual review replaces 29 ambiguous,
multi-subject, text-heavy, or low-quality photos in the versioned asset bank.
The ten body-word images use different real-photo sources; identity-visible
examples prioritize Chinese or East Asian subjects or a clearly Chinese context,
while anatomical close-ups may not reveal identity. New clothing/accessory items
use person-free object photos.
The pronunciation control is playback-only. English words use 150 backend-static,
offline-generated MP3 files from one RP-calibrated British-English voice, with
word-level hashes and six explicit phoneme overrides recorded beside the assets.
The mini program downloads a word's fixed file on first playback, persists it in
the user-data directory, and reuses it across later sessions; tapping a word does
not call online TTS. The same listen control remains available in both the
written-word and real-photo views without changing the current item.
English entry waits at most three seconds for
the latest saved result; a temporary network or server failure starts a new
test with a non-blocking notice instead of leaving the catalog unresponsive.
The enlarged Chinese character card sends the fixed character to the
authenticated backend, which reads one of 1,600 pre-generated MP3 assets instead
of calling online TTS. The mini program reuses an existing file from its local
user-data directory or writes the returned MP3 there on first playback, so later
taps and later sessions play from the device cache without opening the recorder,
ASR, or a TTS request.
Those display stages are not official
age or grade thresholds. The child sees 20 characters per page; tapping one
opens a single-character large view without changing the answer, and the parent
then explicitly marks it recognized or not recognized. The single-character
view also shows the static tone-marked pinyin above the large glyph, matching
the English card's pronunciation-label hierarchy; the 20-character selection
grid remains character-only. Every untouched
character is confirmed as recognized when advancing. The top back action offers
to save and exit, while page hide or unload also preserves the active page.
Progress is saved locally per child and group across 40 pages and is cleared
only after that group's authenticated result save succeeds. The backend accepts
either fixed 800-character group in its fixed order, recomputes the binary
result, and stores every known and unknown character. Legacy fixed
1600-character results remain readable. Current-version history can restore the exact group result; an old
30-character result starts the new checklist instead of being treated as the
same assessment. The result leads with the exact `recognized / 800` checklist
count and opens the complete character lists as two tabs, defaulting to the
not-yet-recognized list before the recognized list; it explicitly
does not extrapolate that count to all Chinese characters or diagnose reading
ability. An eight-item source sheet distinguishes four official design
references from four non-official per-book character-table checking pages and
disclaims official certification or an official fixed 800/1600-character list.

The shared mini-program phone-login profile step only preloads persistent
avatars. Expired WeChat temporary avatar paths are cleared before display, and
save-time file expiry asks the user to choose the avatar again instead of
showing the raw `uploadFile` error.

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
  the materials list. Sharing a material from native search now preserves the
  search keyword and active result tab, then restores that exact material's
  link dialog after the recipient's search results load. Native search material
  shares use the same dedicated 5:4 link-dialog image as the materials page.

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
