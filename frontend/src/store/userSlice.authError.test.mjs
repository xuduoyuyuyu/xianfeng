import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "userSlice.ts"), "utf8");
const apiSource = readFileSync(resolve(__dirname, "../services/api.ts"), "utf8");
const modalSource = readFileSync(resolve(__dirname, "../components/LoginRequiredModal.tsx"), "utf8");
const pageSource = readFileSync(resolve(__dirname, "../pages/UserLoginPage.tsx"), "utf8");
const inlineSource = readFileSync(resolve(__dirname, "../components/InlineLoginForm.tsx"), "utf8");
const welLoginSource = readFileSync(resolve(__dirname, "../../public/wel/login.html"), "utf8");
const welIndexSource = readFileSync(resolve(__dirname, "../../public/wel/index.html"), "utf8");

test("mobile login preserves backend 400 messages instead of axios status text", () => {
  assert.match(
    source,
    /function getAuthErrorMessage\([^)]*\)[\s\S]*data\?\.error[\s\S]*data\?\.message[\s\S]*error\?\.message/,
    "auth thunk should extract backend error and message fields"
  );
  assert.match(
    source,
    /async \(\{ mobile, code[\s\S]*\}:[\s\S]*\{ rejectWithValue \}[\s\S]*return rejectWithValue\(getAuthErrorMessage\(error, "短信登录失败"\)\);/,
    "mobile auth thunk should reject with the backend error text"
  );
  assert.match(
    source,
    /state\.error = \(action\.payload as string\) \|\| action\.error\.message \|\| "短信登录失败";/,
    "Redux state should keep the backend login error text"
  );

  for (const [name, text] of [
    ["login modal", modalSource],
    ["login page", pageSource],
    ["inline login form", inlineSource],
  ]) {
    assert.match(
      text,
      /typeof registerErr === "string" \? registerErr :/,
      `${name} should display rejectWithValue string errors`
    );
  }
});

test("stored login state survives refresh even when cached user data needs recovery", () => {
  assert.match(
    source,
    /function readStoredUser\(\)[\s\S]*JSON\.parse\(storedUser\)[\s\S]*catch/,
    "refresh hydration should safely parse cached user data instead of throwing or dropping the token"
  );
  assert.match(
    source,
    /const storedUser = readStoredUser\(\);[\s\S]*user: storedToken \? storedUser : null,[\s\S]*token: storedToken,/,
    "initial Redux auth state should keep the stored token while allowing App to recover a missing user profile"
  );
});

test("mobile login submits invite code from every login form", () => {
  assert.match(
    source,
    /async \(\{ mobile, code, inviteCode \}:[\s\S]*userApi\.mobileAuth\(mobile, code, inviteCode\)/,
    "mobile auth thunk should forward inviteCode to the API"
  );
  assert.match(apiSource, /getInviteStatus: \(\) =>\s*api\.get<\{ isActive: boolean \}>\("\/users\/invite\/status"\)/, "public API should expose the current invite gate status");

  for (const [name, text] of [
    ["login modal", modalSource],
    ["login page", pageSource],
    ["inline login form", inlineSource],
  ]) {
    assert.match(text, /const \[inviteCode, setInviteCode\] = useState\(""\);/, `${name} should store an invite code`);
    assert.match(text, /const \[inviteRequired, setInviteRequired\] = useState\(false\);/, `${name} should default to open registration before the status check returns`);
    assert.match(text, /userApi\.getInviteStatus\(\)/, `${name} should read the public invite gate status`);
    assert.match(text, /inviteRequired && \(/, `${name} should render invite code UI only when the gate is active`);
    assert.match(text, /placeholder="请输入邀请码"/, `${name} should keep invite code input available when the gate is active`);
    assert.match(text, /loginByMobile\(\{ mobile: phone, code: verifyCode, inviteCode/, `${name} should submit the invite code`);
  }
});

test("mobile login forms restore invite-ready state from a stored cookie", () => {
  for (const [name, text] of [
    ["login modal", modalSource],
    ["login page", pageSource],
    ["inline login form", inlineSource],
  ]) {
    assert.match(text, /readLoginInviteCookie\(\)/, `${name} should read the stored invite cookie`);
    assert.match(text, /const \[verifiedInviteCode, setVerifiedInviteCode\] = useState\(storedInviteCode\);/, `${name} should boot the verified invite value from cookie`);
    assert.match(text, /const \[inviteVerified, setInviteVerified\] = useState\(!!storedInviteCode\);/, `${name} should boot invite-ready state from cookie`);
    assert.match(text, /const inviteReady = !inviteRequired \|\| inviteVerified;/, `${name} should treat disabled invite gate as ready`);
    assert.match(text, /const activeInviteCode = inviteRequired \? \(verifiedInviteCode \|\| inviteCode\.trim\(\) \|\| undefined\) : undefined;/, `${name} should only send invite code when the gate is active`);
    assert.match(text, /const canGetCode = useMemo\(\(\) => inviteReady && PHONE_REGEX\.test\(phone\)/, `${name} should go straight to SMS flow when invite is disabled or already verified`);
    assert.match(text, /sendMobileCode\(phone, activeInviteCode\)/, `${name} should send the cookie-backed invite code with SMS`);
    assert.match(text, /loginByMobile\(\{ mobile: phone, code: verifyCode, inviteCode: activeInviteCode/, `${name} should send the cookie-backed invite code with login`);
    assert.match(text, /邀请码已校准/, `${name} should keep the lightweight verified state when cookie exists`);
  }
});

test("mobile login forms clear the invite cookie when backend rejects a stale remembered code", () => {
  for (const [name, text] of [
    ["login modal", modalSource],
    ["login page", pageSource],
    ["inline login form", inlineSource],
  ]) {
    assert.match(text, /clearLoginInviteCookie\(\);[\s\S]*setVerifiedInviteCode\(""\);[\s\S]*setInviteVerified\(false\);/, `${name} should clear cookie-backed invite state on invite failures`);
    assert.match(text, /isInviteCodeErrorMessage\(/, `${name} should distinguish invite failures from other login errors`);
  }
});

test("static wel login pages persist and clear the shared invite cookie", () => {
  for (const [name, text] of [
    ["wel login", welLoginSource],
    ["wel index", welIndexSource],
  ]) {
    assert.match(text, /function readLoginInviteCookie\(\)/, `${name} should read the stored invite cookie`);
    assert.match(text, /function writeLoginInviteCookie\(inviteCode\)/, `${name} should persist the invite cookie after verification`);
    assert.match(text, /function clearLoginInviteCookie\(\)/, `${name} should clear stale invite cookies`);
    assert.match(text, /if \(isInviteCodeErrorMessage\(message\)\) \{[\s\S]*clearLoginInviteCookie\(\)/, `${name} should clear stale cookie values on invite failures`);
    assert.match(text, /const inviteCode = .*verifiedInviteCode.*mb-invite.*trim\(\)/, `${name} should prefer the remembered invite code when sending requests`);
  }
});
