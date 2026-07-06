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
- Child profile drawer creates local unnamed draft profiles immediately in the
  tabs UI, but only one unnamed draft may exist at a time; Xiaowanzi only
  treats saved non-draft profiles as selectable or syncable.
- Deleting a child profile must persist a local deletion tombstone so browser
  refresh and Xiaowanzi account sync cannot revive removed profiles.
- Admin worthbuy management defaults to non-deleted records and provides an
  explicit deleted-record view for restoring logically deleted submissions.
- The `/library/:externalId` detail page exposes description translation as a
  user-triggered action. It renders the saved translation returned by the
  backend cache endpoint and does not translate automatically on page load.
- `/mama-resources/apply` is the public lightweight supply intake form for
  mothers willing to accept Xiaohongshu posting work. It collects Xiaohongshu
  profile URL, optional profile screenshot upload, follower count, and
  real-name verification status without asking for account credentials.
  `/admin/mama-resources` is the operator review and manual data-completion
  screen. The admin task workflow is task-first: operators list a task, open the
  task workspace, then either directly choose approved accounts or filter them
  by tags/follower count before assigning. Task creation also supports multiple
  example images uploaded through the admin image upload endpoint. Submitted
  proof is reviewed from the task assignment list as collected or rejected; it
  is still not a public marketplace or open claiming flow.
- `/welfare` is the public Xiaowanzi treasure box page (`小玩子百宝箱`). It
  uses the gift icon asset and Xiaowanzi avatar treatment, lists claimable
  welfare separately from expired or sold-out historical welfare, and requires
  the logged-in claim API for actual claiming. `/admin/welfare` is the operator
  screen for uploading/configuring welfare campaigns, stock, date windows,
  publish state, and claim history.

### Deferred / Obsolete

- Move detailed visual tuning workflows into `frontend/docs/` when they become
  durable cross-session procedures.
