# User Geo Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backfill backend user `city` and `region` during registration/login using public IP first and mobile attribution as a non-blocking fallback.

**Architecture:** Extend `backend/src/controllers/user.ts` with a mobile-attribution resolver and a merged geo resolver that prefers IP results, only fills empty fields, and never overwrites manually edited values. Keep admin UI unchanged because it already reads `city` and `region` directly from user rows.

**Tech Stack:** Node.js, TypeScript, Express, Mongoose, Node test runner with `tsx`

---

### Task 1: Add failing tests for geo fallback behavior

**Files:**
- Modify: `backend/src/controllers/user.location.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("falls back to mobile attribution when IP geo is empty", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("ip-api.com")) {
      return { ok: true, json: async () => ({ city: "", regionName: "" }) } as any;
    }
    if (url.includes("phonearea")) {
      return { ok: true, json: async () => ({ code: 0, data: { province: "浙江", city: "杭州" } }) } as any;
    }
    throw new Error(`unexpected url: ${url}`);
  }) as typeof globalThis.fetch;

  const result = await resolveGeoWithFallback(
    { headers: { "x-forwarded-for": "8.8.8.8" }, ip: "127.0.0.1", socket: { remoteAddress: "::1" } } as any,
    "13800138000"
  );

  assert.deepEqual(result, { city: "杭州", region: "浙江" });
  assert.equal(calls.length, 2);
});

it("keeps IP geo when IP already returns complete fields", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("ip-api.com")) {
      return { ok: true, json: async () => ({ city: "上海", regionName: "上海市" }) } as any;
    }
    throw new Error(`unexpected url: ${url}`);
  }) as typeof globalThis.fetch;

  const result = await resolveGeoWithFallback(
    { headers: { "x-forwarded-for": "8.8.8.8" }, ip: "127.0.0.1", socket: { remoteAddress: "::1" } } as any,
    "13800138000"
  );

  assert.deepEqual(result, { city: "上海", region: "上海市" });
  assert.equal(calls.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/node_modules/.bin/tsx --test backend/src/controllers/user.location.test.ts`
Expected: FAIL because `resolveGeoWithFallback` is not exported yet

- [ ] **Step 3: Commit**

```bash
git add backend/src/controllers/user.location.test.ts
git commit -m "test: cover user geo fallback behavior"
```

### Task 2: Implement mobile attribution fallback

**Files:**
- Modify: `backend/src/controllers/user.ts`
- Test: `backend/src/controllers/user.location.test.ts`

- [ ] **Step 1: Write minimal implementation**

```ts
export async function resolveGeoFromMobile(mobile: string): Promise<{ city: string; region: string }> {
  if (!/^1\d{10}$/.test(mobile)) return { city: "", region: "" };
  try {
    const res = await fetch(`https://cx.shouji.360.cn/phonearea.php?number=${mobile}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { city: "", region: "" };
    const data = await res.json();
    return {
      city: String(data?.data?.city || "").trim(),
      region: String(data?.data?.province || "").trim(),
    };
  } catch {
    return { city: "", region: "" };
  }
}

export async function resolveGeoWithFallback(req: Request, mobile = ""): Promise<{ city: string; region: string }> {
  const geo = await resolveGeoFromIP(req);
  if (geo.city && geo.region) return geo;
  const mobileGeo = await resolveGeoFromMobile(mobile);
  return {
    city: geo.city || mobileGeo.city,
    region: geo.region || mobileGeo.region,
  };
}
```

- [ ] **Step 2: Wire fallback into auth flows**

```ts
async function backfillUserGeoIfNeeded(user: any, req: Request): Promise<void> {
  if (user?.city && user?.region) return;
  const geo = await resolveGeoWithFallback(req, String(user?.mobile || ""));
  // keep existing only-fill-empty behavior
}

const geo = await resolveGeoWithFallback(req, mobile);
```

- [ ] **Step 3: Run test to verify it passes**

Run: `backend/node_modules/.bin/tsx --test backend/src/controllers/user.location.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/user.ts backend/src/controllers/user.location.test.ts
git commit -m "feat: backfill user geo from mobile fallback"
```

### Task 3: Regression-check auth behavior

**Files:**
- Test: `backend/src/controllers/user.location.test.ts`

- [ ] **Step 1: Keep login regression coverage green**

Run: `backend/node_modules/.bin/tsx --test backend/src/controllers/user.location.test.ts`
Expected: PASS for login backfill and no-overwrite scenarios

- [ ] **Step 2: Smoke-check billing-adjacent auth test**

Run: `backend/node_modules/.bin/tsx --test backend/src/controllers/user.billing.test.ts`
Expected: PASS
