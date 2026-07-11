# 微信小程序虚拟支付全量接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将小程序 Plus、Pro 及重复购买补点全部迁移到 `wx.requestVirtualPayment`，由服务端完成商品定价、签名、通知验签和幂等权益发放，同时保留网页普通微信支付。

**Architecture:** 新增独立的虚拟商品目录和微信虚拟支付协议服务；`PaymentOrder` 继续作为内部账单主记录，通过 `paymentChannel` 区分普通微信和虚拟支付。小程序只接收服务端签好的官方参数，客户端支付成功后轮询本地订单，最终权益以验签后的服务端发货通知为准。

**Tech Stack:** TypeScript、Express 5、Mongoose、Node `crypto`、Node test runner、微信原生小程序 JavaScript、微信小程序虚拟支付 API。

## Global Constraints

- Plus 商品价格保持 `1990` 分，发放 `200` 点；Pro 商品价格保持 `9900` 分，发放 `1200` 点。
- 当前没有独立点数 SKU；会员有效时重复购买 Plus/Pro 继续复用现有补点和延长权益语义。
- 虚拟商品价格、Offer ID、环境和权益全部由服务端决定，客户端不能覆盖。
- 小程序虚拟商品不得回退到 `wx.requestPayment`。
- 网页 Native 扫码支付和未来实体商品支付不得受影响。
- 客户端成功回调不是发货依据；权益只由验签后的通知或可信查单结果触发。
- 正式密钥、Offer ID 和回调配置不得写入仓库。
- 不执行生产配置、部署、小程序上传或真实支付。

---

## File Map

- Create `backend/src/services/virtualPaymentProducts.ts`: Plus/Pro 虚拟商品白名单和内部套餐映射。
- Create `backend/src/services/virtualPaymentProducts.test.ts`: 商品目录、服务端定价和客户端字段拒绝测试。
- Create `backend/src/services/wechatVirtualPayment.ts`: 官方参数构造、签名、通知验签/解析和虚拟支付配置读取。
- Create `backend/src/services/wechatVirtualPayment.test.ts`: 使用官方文档固定示例和本地密码学向量验证协议。
- Modify `backend/src/models/PaymentOrder.ts`: 增加兼容历史记录的支付通道和虚拟商品元数据。
- Modify `backend/src/services/billing.ts`: 创建虚拟订单，并复用幂等会员/点数发放。
- Modify `backend/src/services/billing.test.ts`: 验证虚拟订单定价、重复通知和权益发放。
- Modify `backend/src/routes/billing.ts`: 新增虚拟下单、虚拟通知和虚拟订单查询入口；普通入口保持不变。
- Modify `backend/src/routes/billing.test.ts`: 固定路由面和公开商品响应。
- Modify `apps/wechat-miniprogram/pages/pro/index.js`: 调用虚拟下单接口和 `wx.requestVirtualPayment`。
- Modify `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`: 验证真实页面调用参数、等待通知和禁止普通支付回退。
- Modify `docs/modules/backend-api.md`: 记录虚拟支付和账单边界。
- Modify `docs/modules/platform-release-and-app-shells.md`: 记录小程序支付 API 与后台配置边界。
- Modify `docs/ACTIVE_CONTEXT.md`: 工作流完成时重写当前快照。

---

### Task 1: 固定虚拟商品目录和订单元数据

**Files:**
- Create: `backend/src/services/virtualPaymentProducts.ts`
- Create: `backend/src/services/virtualPaymentProducts.test.ts`
- Modify: `backend/src/models/PaymentOrder.ts`
- Modify: `backend/src/services/billing.ts`
- Modify: `backend/src/services/billing.test.ts`

**Interfaces:**
- Produces: `VirtualProductId = "plus" | "pro"`
- Produces: `getVirtualProduct(productId: unknown): VirtualPaymentProduct | null`
- Produces: `createVirtualPaymentOrder({ userId, productId, quantity }): Promise<PaymentOrder>`
- `PaymentOrder.paymentChannel`: `"alipay" | "wechat_native" | "wechat_jsapi" | "wechat_virtual"`

- [ ] **Step 1: Write failing product-catalog tests**

```ts
assert.deepEqual(getVirtualProduct("plus"), {
  productId: "plus",
  plan: "plus",
  name: "Plus",
  amountCents: 1990,
  points: 200,
  maxQuantity: 1,
});
assert.equal(getVirtualProduct("unknown"), null);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd backend && node --test --import tsx src/services/virtualPaymentProducts.test.ts`

Expected: FAIL because `virtualPaymentProducts` does not exist.

- [ ] **Step 3: Implement the minimal immutable catalog**

```ts
export type VirtualProductId = "plus" | "pro";

export type VirtualPaymentProduct = {
  productId: VirtualProductId;
  plan: BillingPlanId;
  name: string;
  amountCents: number;
  points: number;
  maxQuantity: 1;
};

export function getVirtualProduct(value: unknown): VirtualPaymentProduct | null {
  const id = String(value || "").trim() as VirtualProductId;
  return CATALOG[id] || null;
}
```

Build `CATALOG` directly from the existing `BILLING_PLANS` values so prices and awarded points have one owner.

- [ ] **Step 4: Write failing virtual-order tests**

Test that `createVirtualPaymentOrder`:

```ts
const order = await createVirtualPaymentOrder({ userId, productId: "plus", quantity: 1 });
assert.equal(order.amountCents, 1990);
assert.equal(order.plan, "plus");
assert.equal(order.paymentChannel, "wechat_virtual");
assert.equal(order.virtualProductId, "plus");
assert.equal(order.virtualQuantity, 1);
```

Also assert quantity `2`, unknown product IDs, and invalid user IDs are rejected. Do not add an amount parameter to the function.

- [ ] **Step 5: Run the billing test and verify RED**

Run: `cd backend && node --test --import tsx src/services/billing.test.ts`

Expected: FAIL because the model fields and factory do not exist.

- [ ] **Step 6: Add backward-compatible order fields and factory**

Add optional/defaulted schema fields:

```ts
paymentChannel?: "alipay" | "wechat_native" | "wechat_jsapi" | "wechat_virtual";
virtualProductId?: "plus" | "pro" | "";
virtualQuantity?: number;
virtualEnvironment?: 0 | 1 | null;
virtualEventIds?: string[];
```

`createVirtualPaymentOrder` must read amount and plan from `getVirtualProduct`, set provider to `wechat`, channel to `wechat_virtual`, and create a pending order. Do not rewrite historical orders.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run: `cd backend && node --test --import tsx src/services/virtualPaymentProducts.test.ts src/services/billing.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the isolated domain change**

```bash
git add backend/src/services/virtualPaymentProducts.ts backend/src/services/virtualPaymentProducts.test.ts backend/src/models/PaymentOrder.ts backend/src/services/billing.ts backend/src/services/billing.test.ts
git commit -m "feat: add virtual payment product catalog"
```

---

### Task 2: 实现微信虚拟支付签名协议

**Files:**
- Create: `backend/src/services/wechatVirtualPayment.ts`
- Create: `backend/src/services/wechatVirtualPayment.test.ts`

**Interfaces:**
- Consumes: `PaymentOrder`, `getVirtualProduct`
- Produces: `createWechatVirtualCheckout(order, openid): WechatVirtualCheckout`
- Produces: `verifyWechatVirtualNotification(rawBody, headers): VerifiedVirtualNotification`
- Produces: `isWechatVirtualPaymentConfigured(): boolean`

- [ ] **Step 1: Capture the exact official contract before coding**

From the official page linked in the design, record in the test fixture comments the current field list, canonical signing strings, algorithms, header names, event names, success response, environment values and minimum base-library requirement. Copy no secrets and do not use a community implementation as the protocol authority.

If official documentation differs from names in this plan, update the plan and test fixtures first; do not create compatibility guesses.

- [ ] **Step 2: Write failing deterministic signing tests**

Use fixed `openid`, Offer ID, app key/session key fixture, timestamp/nonce and order fields. Assert:

```ts
assert.equal(checkout.mode, "wechat_virtual");
assert.equal(checkout.signData, expectedSignData);
assert.equal(checkout.paySig, expectedPaySig);
assert.equal(checkout.signature, expectedSignature);
assert.equal(JSON.parse(checkout.signData).goodsPrice, 1990);
assert.equal(JSON.parse(checkout.signData).outTradeNo, order.outTradeNo);
```

Expected signatures must be computed independently in the test from the official canonical strings, not by calling the production helper twice.

- [ ] **Step 3: Run and verify RED**

Run: `cd backend && node --test --import tsx src/services/wechatVirtualPayment.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 4: Implement configuration and checkout signing**

Read explicit virtual-payment variables such as:

```ts
WECHAT_VIRTUAL_PAY_ENABLED
WECHAT_VIRTUAL_PAY_ENV
WECHAT_VIRTUAL_PAY_OFFER_ID
WECHAT_VIRTUAL_PAY_APP_KEY
```

Use the exact official names for payload fields and signature algorithms established in Step 1. Return the original `signData` string used to calculate signatures. Reject missing production configuration; only return mock mode when the existing explicit billing mock flag is enabled in a non-production environment.

- [ ] **Step 5: Write failing notification verification tests**

Cover valid official fixture, modified body, stale timestamp/replay identifier, wrong Offer ID, wrong product, wrong amount and wrong environment. Assert invalid input throws before returning a normalized event.

- [ ] **Step 6: Implement exact notification verification and normalization**

Return a narrow internal type:

```ts
type VerifiedVirtualNotification = {
  eventId: string;
  eventType: "goods_deliver" | "refund" | "complaint";
  outTradeNo: string;
  transactionId: string;
  productId: "plus" | "pro";
  quantity: number;
  amountCents: number;
  environment: 0 | 1;
  raw: Record<string, unknown>;
};
```

Only map event names confirmed by the official contract. Complaint events must normalize for logging but must not imply an order-state transition.

- [ ] **Step 7: Run tests and verify GREEN**

Run: `cd backend && node --test --import tsx src/services/wechatVirtualPayment.test.ts`

Expected: PASS with no network calls.

- [ ] **Step 8: Commit the protocol service**

```bash
git add backend/src/services/wechatVirtualPayment.ts backend/src/services/wechatVirtualPayment.test.ts
git commit -m "feat: add WeChat virtual payment signing"
```

---

### Task 3: 接入虚拟下单、通知和幂等发货

**Files:**
- Modify: `backend/src/routes/billing.ts`
- Modify: `backend/src/routes/billing.test.ts`
- Modify: `backend/src/services/billing.ts`
- Modify: `backend/src/services/billing.test.ts`

**Interfaces:**
- Consumes: `createVirtualPaymentOrder`, `createWechatVirtualCheckout`, `verifyWechatVirtualNotification`, `markOrderPaid`
- Produces: `POST /api/billing/virtual-orders`
- Produces: official notification endpoint confirmed in Task 2
- Produces: `GET /api/billing/orders/:id` with unchanged ownership checks

- [ ] **Step 1: Update the route-surface test first**

Require the route stack to include the virtual order and official notification endpoints while preserving every existing endpoint. Require `/plans` to expose only public virtual product IDs and display data, never Offer ID or keys.

- [ ] **Step 2: Run route test and verify RED**

Run: `cd backend && node --test --import tsx src/routes/billing.test.ts`

Expected: FAIL because the routes are absent.

- [ ] **Step 3: Add authenticated virtual order creation**

The handler accepts only:

```ts
{ productId: "plus" | "pro", quantity: 1 }
```

It loads the authenticated user's mini-program openid, calls the domain factory and signing service, then returns `{ order: serializeOrder(order), checkout }` with HTTP 201. Unknown products return 400; missing external configuration returns a non-secret 503; unexpected failures return 500.

- [ ] **Step 4: Write failing idempotent-delivery tests**

Using memory MongoDB, send a normalized valid goods-delivery event twice. Assert the first call marks the order paid and adds exactly the plan points; the second returns success without adding points or extending expiry again. Assert mismatched amount, product, environment or user/openid never calls `markOrderPaid`.

- [ ] **Step 5: Run billing tests and verify RED**

Run: `cd backend && node --test --import tsx src/services/billing.test.ts src/routes/billing.test.ts`

Expected: FAIL on the missing virtual notification handler.

- [ ] **Step 6: Implement atomic event deduplication and delivery**

Add one billing service operation that validates the verified notification against the stored order and atomically claims `eventId` before calling the existing idempotent `markOrderPaid`. If entitlement persistence fails, the event must remain retryable; use a transaction when the current test/database configuration supports it, otherwise store an explicit delivery state that can safely resume.

Return the exact official success/failure body established in Task 2. Do not route virtual notifications through `handleWechatNotify`.

- [ ] **Step 7: Keep refund behavior channel-aware**

Add a failing test showing `POST /refunds` never calls `refundWechatOrder` for `paymentChannel === "wechat_virtual"`. Implement dispatch to a virtual-refund function only if the exact official refund API is available and configured; otherwise return a clear 409/503 state without mutating the order or user. Never pretend a refund succeeded.

- [ ] **Step 8: Run focused backend tests and verify GREEN**

Run: `cd backend && node --test --import tsx src/services/virtualPaymentProducts.test.ts src/services/wechatVirtualPayment.test.ts src/services/billing.test.ts src/routes/billing.test.ts src/services/paymentProviders.wechat.test.ts`

Expected: PASS; ordinary WeChat provider tests remain green.

- [ ] **Step 9: Commit the HTTP and delivery slice**

```bash
git add backend/src/routes/billing.ts backend/src/routes/billing.test.ts backend/src/services/billing.ts backend/src/services/billing.test.ts
git commit -m "feat: process virtual payment orders"
```

---

### Task 4: 将 Pro 页面切换到 `wx.requestVirtualPayment`

**Files:**
- Modify: `apps/wechat-miniprogram/pages/pro/index.js`
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

**Interfaces:**
- Consumes: `POST /api/billing/virtual-orders`
- Consumes: checkout parameter object produced in Task 2
- Preserves: existing `/api/billing/me` polling and membership rendering

- [ ] **Step 1: Change the static/runtime test first**

Replace expected request body with:

```js
{ productId: "plus", quantity: 1 }
```

Require the page source to contain `wx.requestVirtualPayment` and `/api/billing/virtual-orders`, and to contain no `wx.requestPayment` call. Stub `requestVirtualPayment(options)` and assert all official checkout fields returned by the server are passed through unchanged.

- [ ] **Step 2: Run the focused mini-program test and verify RED**

Run: `node --test --test-name-pattern='pro page' apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: FAIL because the page still calls `/api/billing/orders` and `wx.requestPayment`.

- [ ] **Step 3: Implement the minimal client switch**

Replace `requestWechatPayment` with a virtual-payment wrapper that:

```js
function requestWechatVirtualPayment(paymentParams) {
  if (typeof wx.requestVirtualPayment !== "function") {
    return Promise.reject(new Error("当前微信版本不支持小程序虚拟支付，请升级微信后重试"));
  }
  return new Promise((resolve, reject) => {
    wx.requestVirtualPayment({ ...paymentParams, success: resolve, fail: reject });
  });
}
```

Use the exact official parameter set from Task 2 instead of forwarding arbitrary response keys. Change order creation to `/api/billing/virtual-orders`; remove `provider` and `channel` from the request. Preserve mock support only for explicit local mock responses.

- [ ] **Step 4: Preserve server-confirmed completion behavior**

After client success, call the existing membership polling. Do not set an active membership from the client response. Cancellation keeps the order pending and displays “已取消微信支付”; delayed notification displays “支付已完成，正在等待微信确认订阅权益”。

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test --test-name-pattern='pro page' apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: PASS and payment request captures show `requestVirtualPayment` only.

- [ ] **Step 6: Commit the client migration**

```bash
git add apps/wechat-miniprogram/pages/pro/index.js apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "feat: use WeChat virtual payment in mini program"
```

---

### Task 5: 文档、构建与本地回归验证

**Files:**
- Modify: `docs/modules/backend-api.md`
- Modify: `docs/modules/platform-release-and-app-shells.md`
- Modify: `docs/ACTIVE_CONTEXT.md`

**Interfaces:**
- Documents: environment variables and operational boundary from Tasks 1–4
- Does not include: real Offer ID, app key, production callback URL or deployment commands

- [ ] **Step 1: Document the durable module boundary**

In `backend-api.md`, state that backend owns the virtual product catalog, price, signatures, notification verification and entitlement delivery. In `platform-release-and-app-shells.md`, state that the mini-program owns only product selection, official API invocation and status display; WeChat后台配置 and production secrets remain release operations.

- [ ] **Step 2: Rewrite the active context snapshot**

Add the virtual-payment workstream state and external prerequisites while preserving unrelated active workstreams. Keep it a snapshot rather than appending a journal entry.

- [ ] **Step 3: Run complete relevant backend verification**

Run: `cd backend && node --test --import tsx src/services/virtualPaymentProducts.test.ts src/services/wechatVirtualPayment.test.ts src/services/billing.test.ts src/routes/billing.test.ts src/services/paymentProviders.wechat.test.ts`

Expected: PASS.

- [ ] **Step 4: Run TypeScript build**

Run: `cd backend && npm run build`

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 5: Run the complete mini-program static suite**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: PASS. If unrelated pre-existing tests fail, record exact failures and prove the focused Pro tests pass.

- [ ] **Step 6: Verify ordinary payment remains intact**

Run: `rg -n "requestPayment|requestVirtualPayment|virtual-orders|wechat_jsapi" apps/wechat-miniprogram/pages/pro/index.js backend/src/services/paymentProviders.ts backend/src/routes/billing.ts`

Expected: Pro page contains only virtual-payment invocation; `paymentProviders.ts` retains ordinary Native/JSAPI support for non-virtual legacy/web use; billing routes have separate notification endpoints.

- [ ] **Step 7: Run repository hygiene checks**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `find apps/wechat-miniprogram backend/src -name '._*' -print`

Expected: no new AppleDouble files created by this work.

- [ ] **Step 8: Commit documentation**

```bash
git add docs/modules/backend-api.md docs/modules/platform-release-and-app-shells.md docs/ACTIVE_CONTEXT.md
git commit -m "docs: document virtual payment boundaries"
```

---

### Task 6: 微信开发者工具与官方沙箱验收

**Files:**
- No repository changes unless a verified integration defect requires a new RED/GREEN cycle.

**Prerequisites:**
- User supplies or installs sandbox Offer ID/app key through local secret configuration.
- WeChat后台 has Plus and Pro products mapped to the exact `productId` values.
- Sandbox delivery notification is configured to the reachable test backend.

- [ ] **Step 1: Verify the real Pro route in WeChat DevTools**

Open `pages/pro/index`, confirm Plus and Pro render current prices, and initiate a sandbox order. Confirm DevTools shows `wx.requestVirtualPayment`, not `wx.requestPayment`.

- [ ] **Step 2: Complete a sandbox Plus payment**

Verify local pending order → official payment → signed delivery notification → paid order → exactly 200 added points and Plus expiry extension.

- [ ] **Step 3: Replay the delivery notification**

Replay the same official sandbox event or use the supported resend mechanism. Verify HTTP success and no second point grant or expiry extension.

- [ ] **Step 4: Complete a sandbox Pro payment on the other supported terminal class**

Verify exactly 1200 added points and Pro expiry behavior. Record whether iOS and Android were both exercised; do not claim all-terminal validation if one terminal was unavailable.

- [ ] **Step 5: Exercise cancel and delayed-notification paths**

Cancel once and confirm no entitlement. Then delay/disable notification once and confirm the UI remains in waiting state until server reconciliation succeeds.

- [ ] **Step 6: Exercise sandbox refund if the account exposes it**

Verify the virtual refund API and refund notification, remaining-point calculation, order state and entitlement recovery. If the sandbox/account does not expose refund, mark it unverified rather than using ordinary WeChat refund.

- [ ] **Step 7: Produce the completion report**

Report exactly: changed files, commands run, sandbox devices/routes exercised, external configuration still required, and anything not verified. Production setup, deploy, upload, review and publication remain separate approval gates.
