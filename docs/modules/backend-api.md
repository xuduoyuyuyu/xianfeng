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
- WeChat mini-program virtual payment is backend-owned for virtual products:
  the API owns the Plus/Pro virtual catalog, amount, point grant, Offer ID
  selection, environment, `wx.requestVirtualPayment` signatures, official order
  query, notification reconciliation, and idempotent entitlement delivery.
  Internal catalog ids remain `plus` and `pro`; the WeChat-published product
  ids sent in `signData.productId` are configured separately with
  `WECHAT_VIRTUAL_PAY_PRODUCT_PLUS` and `WECHAT_VIRTUAL_PAY_PRODUCT_PRO`.
  Mini-program clients submit only `productId`, `quantity: 1`, and the current
  one-time `wx.login` code to `/api/billing/virtual-orders`; the backend
  exchanges that code for the current `session_key`, signs the exact
  `signData`, and never persists, logs, or returns the `session_key`. Client
  success callbacks and message pushes are untrusted triggers: paid state and
  points are granted only after the official virtual-payment query matches the
  local order, amount, environment, transaction id, and signed `biz_meta`
  payload. Production query responses may wrap the signed payload inside
  `biz_meta.attach`, and paid virtual orders may report status `3`; both are
  accepted only when the paid amount matches the local order amount. The client
  may call `/api/billing/virtual-orders/:id/sync` after `wx.requestVirtualPayment`
  succeeds to actively reconcile the order; that active sync confirms delivery
  to WeChat through `/xpay/notify_provide_goods` after local points are granted.
  Normal `xpay_goods_deliver_notify` pushes still confirm delivery by returning
  WeChat's `{ ErrCode: 0, ErrMsg: "success" }` response.
  `/api/billing/me` exposes recent paid/refunded `paymentOrders` with per-order
  refund eligibility so clients request refunds against a specific payment
  record instead of a single latest-order shortcut. For
  `paymentChannel=wechat_virtual`, refund requests call `/xpay/refund_order`
  and store a pending `RefundRecord`; points and order status are changed only
  after `xpay_refund_notify` reports success. User-initiated iOS/OS refunds
  from WeChat or Apple payment records are treated separately: if WeChat sends
  `xpay_refund_notify` without a local developer refund task, or `/xpay/query_order`
  later reports no remaining `left_fee`, the backend creates a user-side
  `RefundRecord`, marks the order refunded, and deducts the matching points.
  Ordinary WeChat Pay V3 Native/JSAPI sync and notify paths explicitly do not
  fulfill or refund `paymentChannel=wechat_virtual` orders.
- Xiaowanzi image recognition uses the authenticated
  `/api/v1/tutorbot/xiaowanzi_debug_bot/attachments/recognize` endpoint before
  the normal chat send. It calls Volcengine Ark with endpoint id
  `ep-m-20260510222218-mv5t9` by default, expects the key in
  `XIAOWANZI_VOLCENGINE_API_KEY` or `ARK_API_KEY`, and consumes the
  `xiaowanzi_file` policy at 1 point per successful image processing request.
  WeChat mini-program native uploads use
  `/api/wechat-mini/xiaowanzi/attachments/recognize` with the same service and
  point policy so they do not depend on tutorbot admin-route fallthrough.
- `WorthBuyAnalysis.status=deleted` is a logical deletion state for admin
  worthbuy records. Admin lists hide deleted records by default and can request
  them explicitly for recovery.
- External `/library` book description translations are persisted by external
  book id after the first user-triggered successful translation. Later requests
  return the saved translation instead of calling the AI provider again. The
  default translation model is DeepSeek Flash via the translation-specific
  `BOOK_TRANSLATION_AI_MODEL` setting.
- Admin book editing can create or update the public detail metadata through
  `PUT /api/admin/books/:id/metadata`. The endpoint upserts by `bookId`, so a
  book without a metadata row becomes editable without creating duplicate
  detail records on later saves. Uploaded covers are mirrored to both the base
  book and metadata form; metadata upsert falls back to the base cover instead
  of replacing it with an empty detail cover. Book detail metadata no longer
  has an operator review queue: collected and manually edited metadata is
  treated as accepted, and public/admin readers do not filter detail records by
  the legacy `status` value.
- Public program details preserve concrete curated-reading titles for static
  display, but only expose a URL when its landing-page title verification
  passes. Generic category placeholders such as `教育相关推荐`, `延伸阅读`, and
  `参考书目` are rejected during payload normalization, public serialization,
  and enrichment reruns.
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
  `/tasks/:taskId` updates an already listed task's project copy, pricing,
  targeting fields, claim limit, and example images without changing assignments.
  `/tasks/:taskId/candidates` filters approved accounts by search/category,
  risk tag, and follower count before `/tasks/:taskId/assignments` assigns
  selected profiles. Public `/api/mama-resources/me/tasks` matches the
  authenticated user to profiles by normalized contact-phone digits and
  prefers an approved profile over newer pending submissions for the same
  mobile, then exposes that user's assignments plus listed tasks that are still
  claimable by the approved profile contact phone. Public
  `/api/mama-resources/tasks/:taskId/claims` creates the assignment for
  first-come claiming and enforces `MamaResourceTask.claimLimit` against
  assigned/submitted/collected assignments; rejected assignments free the slot.
  The same `/me/tasks` endpoint returns pending/needs-info/rejected profile
  status with an empty task list so clients can show a review-status page
  instead of the intake form. Public task submission stores proof link plus
  screenshot URL on the assignment before admin review marks it collected or
  rejected.
- Welfare campaigns are independent from guest listener benefits and Mama
  Haozhuan tasks. `WelfareCampaign` stores the uploaded/configured activity,
  stock, date window, publish state, claim instructions, and optional external
  claim link. Public
  `/api/welfare/campaigns` returns active welfare separately from expired or
  sold-out history. Authenticated public
  `/api/welfare/campaigns/:id/claims` creates one claim per user only while the
  campaign is published, in-window, and in stock. Admin `/api/admin/welfare`
  creates/updates campaigns and `/api/admin/welfare/:id/claims` lists claim
  history with user contact fields plus synced child profile summaries when
  available. When a campaign has imported activation codes, the backend owns
  ordered code assignment, stores the bound code on `WelfareClaim`, and exposes
  CSV claim export for reconciliation.

### Active

- XF-003 - Decide whether the WeKnora global RAG plan is still active and, if
  active, keep backend routing and service changes test-first.
- Xiaowanzi account sync must preserve child-profile deletion tombstones so
  synced child lists do not resurrect removed profiles after merge.

### Deferred / Obsolete

- Document durable API contracts in this module doc as they stabilize.
