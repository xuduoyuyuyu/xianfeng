# Module: Backend API

## FOR

- Express API routes, controllers, middleware, models, and services.
- Authentication, user state, billing/Pro points, AI routing, guest/program
  data, uploads endpoints, and integrations.
- Backend tests using Node's test runner with `tsx`.

## NOT FOR

- Frontend presentation decisions.
- Production secrets or `.env` values.
- Runtime uploaded media lifecycle beyond API paths and storage contracts.
- Deployment orchestration outside backend readiness requirements.

## Components

- `backend/src/routes/`
- `backend/src/controllers/`
- `backend/src/services/`
- `backend/src/models/`
- `backend/src/middlewares/`
- `backend/src/utils/`
- `backend/package.json`

## Evolution

### Durable Contracts

- Mobile invite gating is enforced in the backend before new-user creation.
  Admin `SystemSetting` config now controls the active code, activation limit,
  used count, and expiry time. `LOGIN_INVITE_CODE` and
  `LOGIN_INVITE_ACTIVATION_LIMIT` are fallback defaults when no admin config
  has been saved.
- Mini-program login requires a WeChat phone-number authorization code.
  `/api/wechat-mini/login` exchanges `wx.login` code for openid and
  `getPhoneNumber` code for mobile, then creates or updates the local user.
  `/api/wechat-mini/bind-phone` lets an authenticated mini-program user bind a
  mobile later from native settings. If the authorized mobile already belongs
  to an existing account, that mobile account wins: the mini-program openid is
  moved to that account and the response returns that account's JWT.
- Billing exposes `free`, `plus`, and `pro` catalog plans. Free login grants
  are 10 points per day with a hard monthly free-account cap of 30 points,
  including legacy free balances above the cap. `plus` costs ¥19.9 for 200
  points, `pro` costs ¥99 for 1200 points, and purchases add package points to
  the current balance. Legacy stored plan ids `monthly` and `yearly` are read
  as Plus and Pro membership tiers. The education-planning generation flow
  consumes the `education_planning` point policy at 5 points per generated plan.
- `WorthBuyAnalysis.status=deleted` is a logical deletion state for admin
  worthbuy records. Admin lists hide deleted records by default and can request
  them explicitly for recovery.
- External `/library` book description translations are persisted by external
  book id after the first user-triggered successful translation. Later requests
  return the saved translation instead of calling the AI provider again. The
  default translation model is DeepSeek Flash via the translation-specific
  `BOOK_TRANSLATION_AI_MODEL` setting.
- Mama resource pool submissions are supply-side only. Public
  `/api/mama-resources/applications` accepts lightweight Xiaohongshu account
  intake without account credentials, including profile screenshot URL, follower
  count, and real-name verification status. Public
  `/api/mama-resources/uploads` accepts image-only Xiaohongshu profile
  screenshots; admin `/api/admin/mama-resources` handles review state,
  filtering, manual metrics, screenshots, and operator notes.
- Mama Haozhuan tasks are listed independently from accounts.
  `MamaResourceTask` stores the listed project/campaign, while
  `MamaResourceTaskAssignment` stores which approved profile was selected for
  that task plus proof/review status. Admin
  `/api/admin/mama-resources/tasks` creates and lists tasks, including optional
  multiple example image URLs for task illustration, then
  `/tasks/:taskId/candidates` filters approved accounts by search/category,
  risk tag, and follower count before `/tasks/:taskId/assignments` assigns
  selected profiles. Public `/api/mama-resources/me/tasks` exposes only the
  assignments for the authenticated user whose mobile matches the approved
  profile contact phone. The same endpoint returns pending/needs-info/rejected
  profile status with an empty task list so clients can show a review-status
  page instead of the intake form. Public task submission stores proof link
  plus screenshot URL on the assignment before admin review marks it collected
  or rejected.
- Welfare campaigns are independent from guest listener benefits and Mama
  Haozhuan tasks. `WelfareCampaign` stores the uploaded/configured activity,
  stock, date window, publish state, and claim instructions. Public
  `/api/welfare/campaigns` returns active welfare separately from expired or
  sold-out history. Authenticated public
  `/api/welfare/campaigns/:id/claims` creates one claim per user only while the
  campaign is published, in-window, and in stock. Admin `/api/admin/welfare`
  creates/updates campaigns and `/api/admin/welfare/:id/claims` lists claim
  history.

### Active

- XF-003 - Decide whether the WeKnora global RAG plan is still active and, if
  active, keep backend routing and service changes test-first.
- Xiaowanzi account sync must preserve child-profile deletion tombstones so
  synced child lists do not resurrect removed profiles after merge.

### Deferred / Obsolete

- Document durable API contracts in this module doc as they stabilize.
