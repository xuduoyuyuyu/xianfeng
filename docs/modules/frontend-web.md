# Module: Frontend Web

## FOR

- Public web pages and admin screens served from `frontend/`.
- React application routes, state, API clients, and user-facing UI behavior.
- Static screen previews and generated screen CSS under `frontend/public/screens`.
- Browser verification for visual, interaction, and routing changes.

## NOT FOR

- Backend API contracts beyond client usage.
- Production deployment orchestration.
- Runtime uploads storage.
- Native mobile or WeChat platform capabilities except web-view compatibility.

## Components

- `frontend/src/`
- `frontend/public/screens/`
- `frontend/scripts/`
- `frontend/package.json`
- `frontend/docs/`

## Evolution

### Active

- XF-001 - Keep public/admin web behavior stable while governance is introduced.
- Guest detail booklists parse legacy semicolon-delimited `sourceName` values
  into exact normalized names. Cards are deduplicated in first-seen order and
  `/books` filters by membership in the parsed source list rather than by whole
  legacy-string equality. The guest detail API is the list source: mobile guest
  pages show five entries initially with local expand/collapse, while desktop
  pages keep the complete list visible.
- Public program detail pages render same-guest related programs as a card grid
  at the bottom of the page and hide the section when the API returns no match.
- Child profile drawer creates local unnamed draft profiles immediately in the
  tabs UI, but only one unnamed draft may exist at a time; Xiaowanzi only
  treats saved non-draft profiles as selectable or syncable.
- Deleting a child profile must persist a local deletion tombstone so browser
  refresh and Xiaowanzi account sync cannot revive removed profiles.
- Xiaowanzi image attachments are recognized before chat submission. The
  widget calls the dedicated attachment endpoint, injects the returned
  `[图片识别结果]` block into the prompt, emits a `xiaowanzi_file` balance
  refresh event, and stops the chat send if image recognition fails.
- Admin worthbuy management defaults to non-deleted records and provides an
  explicit deleted-record view for restoring logically deleted submissions.
- Admin `/admin/search-analytics` is the operator search-demand surface under
  the User navigation group. Its default `搜索流水` view lists every formal
  mini-program search, including one-off terms, time, identified account or
  anonymous installation alias, result count, and first click. `趋势总览`
  provides 7/30/90-day word cloud, daily trend, popular/rising/no-result terms,
  click-through, identity rate, and result-type distribution. `用户行为` joins
  current whitelisted account and child-profile fields to factual behavior
  indicators and a complete per-user query timeline. The UI states that search
  is anonymous by default, account linkage requires explicit mini-program
  consent and is revocable, and raw events retain for 180 days. Historical
  Nginx estimates are not mixed into these views.
- The `/library/:externalId` detail page exposes description translation as a
  user-triggered action. It renders the saved translation returned by the
  backend cache endpoint and does not translate automatically on page load.
- `/mama-resources/apply` is the public lightweight supply intake form for
  mothers willing to accept social-media posting work. It renders an inline
  mobile login first when the visitor is not signed in, then uses a
  mini-program-aligned `资料管理` flow with separate personal profile,
  social-media account, and task-preference sections. It collects Xiaohongshu
  and optional extra account profile data, optional profile screenshot upload,
  follower count, and real-name verification status without asking for account
  credentials. Child stage and gender are read from the shared child-profile
  archive and can only be changed through `档案管理`; archive saves notify
  the account-sync owner so every Web child-creation entry converges on the
  same server-side child profile list.
  `/admin/mama-resources` is the operator account-data screen. Its account list
  defaults to all profiles and filters by child stage, child gender, linked-user
  gender, and submitted media platform; verified real-name status is shown as a
  green badge. The profile detail exposes every submitted media homepage as an
  editable direct URL; the existing `保存资料` action persists URL, nickname,
  follower count, payout details, and review state together. The admin task workflow is task-first: operators list a task, open the
  task workspace, then filter only the accounts that already claimed that task.
  Claimant rows expose the matched site user ID, mobile, station profile,
  platform account, and claim time so operators can distinguish similar users.
  The selected claimant detail supports free-form operator tags and an
  account-level block/resume control for future claims. Task creation also supports a
  claim-limit field for the mini-program first-come task flow and multiple
  example images uploaded through the admin image upload endpoint. Submitted
  proof is reviewed from the task assignment list as collected or rejected.
  Submitted completion links are shown as copy-only text so untrusted or
  incomplete link values cannot be interpreted as routes inside the admin SPA;
  completion screenshots remain directly previewable.
  The same assignment list shows private-content configuration progress and
  supports direct link editing plus Excel template download, preflight review,
  and explicit import confirmation. Operators may also paste a task-level link
  pool, see imported/assigned/remaining counts, and see “等待内容分配” when the
  pool is exhausted. Claimant cards and details mark “已返图”, “未返图”,
  or “24小时未返图”; the existing user-filter section exposes those states as
  quick choices instead of adding a separate filter panel. This workflow does
  not send SMS.
- `/admin/users` keeps inline account operations but makes each user openable
  as a read-only 360-degree profile. The detail modal groups station identity,
  child basics, Haozhuan (`好赚`) participation, and the backend-aggregated event
  timeline, including registration, profile changes, recorded page visits,
  child-memory updates, and task lifecycle events.
  Its keyword search covers UID, site nickname, and linked Haozhuan nicknames.
  The list can also filter registration time by an inclusive local-date range;
  this remains a client-side filter over the already loaded admin user list.
  Bound profiles on `/admin/mama-resources/review` link to `/admin/users` and
  automatically open that existing User 360 detail.
- The Haozhuan personal profile exposes `能拍`, `能剪`, and `能写` as optional
  multi-select capabilities. The admin account list exposes the same values in
  a multi-select popover and sends them to the backend as an all-selected match.
- `/welfare` is the public Xiaowanzi treasure box page (`小玩子百宝箱`). It
  uses the gift icon asset and Xiaowanzi avatar treatment, lists claimable
  welfare separately from expired or sold-out historical welfare, and shows
  claim instructions plus an optional copied external link after claiming.
  `/admin/welfare` is the operator screen for configuring welfare campaigns,
  emoji or uploaded covers, stock, date windows, publish state, and enriched
  claim history.
### Deferred / Obsolete

- Move detailed visual tuning workflows into `frontend/docs/` when they become
  durable cross-session procedures.
