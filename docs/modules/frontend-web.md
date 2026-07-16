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
  credentials.
  `/admin/mama-resources` is the operator account-data screen. Its account list
  defaults to all profiles and filters by child stage, child gender, linked-user
  gender, and submitted media platform; verified real-name status is shown as a
  green badge. The admin task workflow is task-first: operators list a task, open the
  task workspace, then filter only the accounts that already claimed that task.
  Claimant rows expose the matched site user ID, mobile, station profile,
  platform account, and claim time so operators can distinguish similar users.
  The selected claimant detail supports free-form operator tags and an
  account-level block/resume control for future claims. Task creation also supports a
  claim-limit field for the mini-program first-come task flow and multiple
  example images uploaded through the admin image upload endpoint. Submitted
  proof is reviewed from the task assignment list as collected or rejected.
  The same assignment list shows private-content configuration progress and
  supports direct link editing plus Excel template download, preflight review,
  and explicit import confirmation. Operators may also paste a task-level link
  pool, see imported/assigned/remaining counts, and see “等待内容分配” when the
  pool is exhausted. Claimant cards and details mark “已返图”, “未返图”,
  or “24小时未返图”; the existing user-filter section exposes those states as
  quick choices instead of adding a separate filter panel. This workflow does
  not send SMS.
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
