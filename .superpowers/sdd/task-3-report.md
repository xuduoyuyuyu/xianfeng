# Task 3 Report

## Status

Implemented the authenticated virtual checkout route, public virtual product
metadata, official virtual notification route, trusted-query reconciliation,
idempotent fulfillment, retryable entitlement failure handling, and virtual
refund isolation.

## RED evidence

- `cd backend && node --test --import tsx src/routes/billing.test.ts`
  - Failed as expected: `/virtual-orders` and `/wechat/virtual/notify` were absent.
- `cd backend && node --test --import tsx src/services/billing.test.ts src/routes/billing.test.ts`
  - Failed as expected: `processWechatVirtualNotification is not a function`,
    plus the missing route surface.

## GREEN evidence

- `cd backend && node --test --import tsx src/services/virtualPaymentProducts.test.ts src/services/wechatVirtualPayment.test.ts src/services/billing.test.ts src/routes/billing.test.ts src/services/paymentProviders.wechat.test.ts`
  - Passed: 36 tests, 5 suites, 0 failures.

## Files

- `backend/src/routes/billing.ts`
- `backend/src/routes/billing.test.ts`
- `backend/src/services/billing.ts`
- `backend/src/services/billing.test.ts`

## Commit

- `4787074` (`feat: process virtual payment orders`; report hash recorded before final amend)

## Self-review

- Push JSON is parsed only as an untrusted trigger. Every goods-delivery trigger
  queries the official order API before fulfillment, including duplicates.
- Reconciliation checks the trusted order number, paid status, exact order and
  paid amounts, environment, and transaction identity against the immutable
  local order. Product and quantity are checked only against the trigger and
  local order; they are not invented as official query response fields.
- A locally bound mini-program openid must match both checkout exchange and the
  notification query selector. Unbound accounts are allowed by the stated
  required-openid behavior.
- The one-time `loginCode` is exchanged server-side. `session_key` is passed
  directly to signing and is neither persisted nor serialized.
- Virtual refunds return 409 before provider dispatch and never call the
  ordinary `refundWechatOrder` path.
- If entitlement persistence throws after the paid-state save,
  `markOrderPaid` restores the order to pending so reconciliation can retry.

## Concerns / not verified

- No live WeChat virtual payment sandbox callback or checkout was executed.
- The current paid-state idempotency prevents duplicate sequential grants. A
  truly simultaneous duplicate callback can observe the transient paid state
  while the first callback is still persisting entitlement; production-grade
  cross-document atomicity would require a MongoDB transaction/replica set or
  a dedicated fulfillment state machine.
- Git emits warnings for macOS AppleDouble `._pack-*.idx` files in the shared
  object store. They did not prevent focused tests, staging, or committing.
