# Login Invite Cookie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remember a successfully calibrated invite code in a shared browser cookie so later logins can go straight to SMS flow until the backend rejects that remembered code.

**Architecture:** Add one small React-side cookie helper, reintroduce invite-gated UI state initialized from the cookie, and mirror the same cookie behavior in the static wel login pages. Backend contracts stay unchanged; the frontend only clears the cookie and reopens calibration when invite-specific backend errors appear.

**Tech Stack:** React, TypeScript, plain browser cookies, static HTML/JS login pages, Node test runner

---

### Task 1: Lock the cookie behavior with failing tests

**Files:**
- Modify: `frontend/src/store/userSlice.authError.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
test("mobile login forms restore invite-ready state from a stored cookie", () => {
  for (const [name, text] of [
    ["login modal", modalSource],
    ["login page", pageSource],
    ["inline login form", inlineSource],
  ]) {
    assert.match(text, /readLoginInviteCookie\(\)/, `${name} should read the stored invite cookie`);
    assert.match(text, /const \[inviteVerified, setInviteVerified\] = useState\(!!storedInviteCode\);/, `${name} should boot verified state from cookie`);
    assert.match(text, /const canGetCode = useMemo\(\(\) => inviteReady && PHONE_REGEX\.test\(phone\)/, `${name} should reopen direct SMS flow when cookie exists`);
    assert.match(text, /sendMobileCode\(phone, activeInviteCode\)/, `${name} should reuse the remembered invite code for SMS`);
    assert.match(text, /loginByMobile\(\{ mobile: phone, code: verifyCode, inviteCode: activeInviteCode/, `${name} should reuse the remembered invite code for login`);
  }
});

test("mobile login forms clear the invite cookie when backend rejects a stale remembered code", () => {
  for (const [name, text] of [
    ["login modal", modalSource],
    ["login page", pageSource],
    ["inline login form", inlineSource],
  ]) {
    assert.match(text, /clearLoginInviteCookie\(\);[\s\S]*setInviteVerified\(false\);/, `${name} should clear cookie-backed state on invite failure`);
    assert.match(text, /isInviteCodeErrorMessage\(/, `${name} should distinguish invite failures from other auth failures`);
  }
});

test("static wel login pages persist and clear the shared invite cookie", () => {
  for (const [name, text] of [
    ["wel login", welLoginSource],
    ["wel index", welIndexSource],
  ]) {
    assert.match(text, /function readLoginInviteCookie\(\)/, `${name} should read the shared invite cookie`);
    assert.match(text, /function writeLoginInviteCookie\(inviteCode\)/, `${name} should persist the invite cookie`);
    assert.match(text, /function clearLoginInviteCookie\(\)/, `${name} should clear stale invite cookies`);
    assert.match(text, /if \(isInviteCodeErrorMessage\(message\)\) \{[\s\S]*clearLoginInviteCookie\(\)/, `${name} should clear stale cookie values on invite failures`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/store/userSlice.authError.test.mjs`
Expected: FAIL because the cookie helpers/state do not exist yet.

- [ ] **Step 3: Implement minimal test-only updates until the failure is about missing behavior, not broken assertions**

No production code in this step. Only adjust regexes if line formatting differs from the intended implementation shape.

- [ ] **Step 4: Run test again to confirm a clean failing signal**

Run: `node --test frontend/src/store/userSlice.authError.test.mjs`
Expected: FAIL only on the new cookie behavior checks.

### Task 2: Add the shared React cookie helper

**Files:**
- Create: `frontend/src/utils/loginInviteCookie.ts`
- Modify: `frontend/src/store/userSlice.authError.test.mjs`

- [ ] **Step 1: Write the helper implementation**

```ts
const LOGIN_INVITE_COOKIE = "xf_login_invite";
const LOGIN_INVITE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function parseCookieValue(name: string): string {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length) || "";
}

export function readLoginInviteCookie(): string {
  const value = parseCookieValue(LOGIN_INVITE_COOKIE);
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return "";
  }
}

export function writeLoginInviteCookie(inviteCode: string): void {
  const value = encodeURIComponent(inviteCode.trim());
  if (!value || typeof document === "undefined") return;
  document.cookie = `${LOGIN_INVITE_COOKIE}=${value}; Max-Age=${LOGIN_INVITE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
}

export function clearLoginInviteCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LOGIN_INVITE_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}
```

- [ ] **Step 2: Run frontend auth test to verify it still fails on component usage**

Run: `node --test frontend/src/store/userSlice.authError.test.mjs`
Expected: FAIL because components/static pages still do not use the helper.

### Task 3: Restore cookie-backed invite state in React login flows

**Files:**
- Modify: `frontend/src/components/LoginRequiredModal.tsx`
- Modify: `frontend/src/components/InlineLoginForm.tsx`
- Modify: `frontend/src/pages/UserLoginPage.tsx`
- Modify: `frontend/src/store/userSlice.authError.test.mjs`

- [ ] **Step 1: Reintroduce invite-gated state sourced from the cookie**

```ts
const storedInviteCode = readLoginInviteCookie();
const [verifiedInviteCode, setVerifiedInviteCode] = useState(storedInviteCode);
const [inviteVerified, setInviteVerified] = useState(!!storedInviteCode);
const activeInviteCode = verifiedInviteCode || inviteCode.trim() || undefined;
const inviteReady = inviteVerified;
```

- [ ] **Step 2: Restore manual calibration and cookie persistence**

```ts
const handleVerifyInvite = async () => {
  const code = inviteCode.trim();
  if (!code) {
    setLocalError("请输入邀请码");
    return;
  }
  try {
    setIsVerifyingInvite(true);
    await userApi.verifyInviteCode(code);
    writeLoginInviteCookie(code);
    setVerifiedInviteCode(code);
    setInviteVerified(true);
    setInviteCode("");
    setLocalError("");
  } catch (err: any) {
    clearLoginInviteCookie();
    setVerifiedInviteCode("");
    setInviteVerified(false);
    setLocalError(getInviteErrorMessage(err));
  } finally {
    setIsVerifyingInvite(false);
  }
};
```

- [ ] **Step 3: Reuse cookie-backed code in SMS/login and clear it only for invite failures**

```ts
function isInviteCodeErrorMessage(message: string): boolean {
  return /邀请码|已过期|用完/.test(message);
}

function resetInviteGate(message: string) {
  clearLoginInviteCookie();
  setVerifiedInviteCode("");
  setInviteVerified(false);
  setPhone("");
  setVerifyCode("");
  setCountdown(0);
  setLocalError(message);
}
```

- [ ] **Step 4: Restore the conditional UI**

```tsx
{inviteReady ? (
  <div className="invite-ok">邀请码已校准</div>
) : (
  // invite input + verify button
)}

{inviteReady && (
  // phone + sms fields
)}
```

- [ ] **Step 5: Run frontend auth test to verify it passes**

Run: `node --test frontend/src/store/userSlice.authError.test.mjs`
Expected: PASS

### Task 4: Mirror the cookie behavior in the static wel login pages

**Files:**
- Modify: `frontend/public/wel/login.html`
- Modify: `frontend/public/wel/index.html`
- Modify: `frontend/src/store/userSlice.authError.test.mjs`

- [ ] **Step 1: Add inline cookie helpers and initial state**

```js
const LOGIN_INVITE_COOKIE = 'xf_login_invite';

function readLoginInviteCookie() { /* parse document.cookie */ }
function writeLoginInviteCookie(inviteCode) { /* Max-Age + Path=/ + SameSite=Lax */ }
function clearLoginInviteCookie() { /* Max-Age=0 */ }
function isInviteCodeErrorMessage(message) { return /邀请码|已过期|用完/.test(String(message || '')); }
```

- [ ] **Step 2: Hide or show the invite entry from the stored cookie**

```js
let _verifiedInviteCode = readLoginInviteCookie();

function syncInviteGate() {
  const ready = !!_verifiedInviteCode;
  // toggle invite row visibility
  // toggle phone/code row visibility
}
```

- [ ] **Step 3: Persist on verify success and clear on stale-cookie failure**

```js
async function verifyInviteCode() {
  const code = (document.getElementById('mb-invite').value || '').trim();
  const d = await api('POST', '/api/users/invite/verify', { inviteCode: code });
  writeLoginInviteCookie(code);
  _verifiedInviteCode = code;
  syncInviteGate();
}
```

- [ ] **Step 4: Reuse the remembered code in send/login**

```js
const inviteCode = _verifiedInviteCode || (document.getElementById('mb-invite').value || '').trim();
```

- [ ] **Step 5: Run frontend auth test to verify it passes**

Run: `node --test frontend/src/store/userSlice.authError.test.mjs`
Expected: PASS

### Task 5: Final verification

**Files:**
- Verify only

- [ ] **Step 1: Run targeted backend invite tests**

Run: `backend/node_modules/.bin/tsx --test backend/src/controllers/user.invite.test.ts`
Expected: PASS

- [ ] **Step 2: Run frontend auth regression tests**

Run: `node --test frontend/src/store/userSlice.authError.test.mjs`
Expected: PASS

- [ ] **Step 3: Run frontend production build**

Run: `npm run build`
Working directory: `frontend/`
Expected: successful build output
