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

  for (const [name, text] of [
    ["login modal", modalSource],
    ["login page", pageSource],
    ["inline login form", inlineSource],
  ]) {
    assert.match(text, /const \[inviteCode, setInviteCode\] = useState\(""\);/, `${name} should store an invite code`);
    assert.match(text, /placeholder="请输入邀请码"/, `${name} should render an invite code input`);
    assert.match(text, /loginByMobile\(\{ mobile: phone, code: verifyCode, inviteCode/, `${name} should submit the invite code`);
  }
});

test("mobile login forms require invite code before phone fields activate", () => {
  assert.match(
    apiSource,
    /verifyInviteCode: \(inviteCode: string\) =>\s*api\.post<\{ ok: boolean \}>\("\/users\/invite\/verify", \{ inviteCode \}\)/,
    "frontend should call the backend invite verification endpoint before revealing mobile login"
  );

  for (const [name, text] of [
    ["login modal", modalSource],
    ["login page", pageSource],
    ["inline login form", inlineSource],
  ]) {
    assert.match(text, /const \[inviteVerified, setInviteVerified\] = useState\(false\);/, `${name} should track backend-verified invite state`);
    assert.match(text, /const inviteReady = inviteVerified;/, `${name} should derive invite-ready from backend verification`);
    assert.match(text, /const canGetCode = useMemo\(\(\) => inviteReady && PHONE_REGEX\.test\(phone\)/, `${name} should block SMS until invite code is present`);
    assert.match(text, /const code = inviteCode\.trim\(\);[\s\S]*await userApi\.verifyInviteCode\(code\)/, `${name} should verify invite code before showing phone fields`);
    assert.match(text, /setVerifiedInviteCode\(code\);[\s\S]*setInviteCode\(""\);/, `${name} should hide the visible invite code after verification`);
    assert.match(text, /sendMobileCode\(phone, verifiedInviteCode\)/, `${name} should send the verified invite code after hiding the input value`);
    assert.match(text, /loginByMobile\(\{ mobile: phone, code: verifyCode, inviteCode: verifiedInviteCode/, `${name} should submit the verified invite code after hiding the input value`);
    assert.match(text, /setInviteVerified\(false\);[\s\S]*setPhone\(""\);[\s\S]*setVerifyCode\(""\);/, `${name} should reset the mobile flow when invite code changes`);
    assert.match(text, /if \(!inviteReady\) \{\s*setLocalError\("请先校准邀请码"\);[\s\S]*return;\s*\}/, `${name} should guard submit and send-code handlers`);
    assert.match(text, /disabled=\{!inviteCode\.trim\(\) \|\| isVerifyingInvite\}/, `${name} should disable invite verification until a code is entered or while verifying`);
    assert.match(text, /\{inviteReady && \([\s\S]*placeholder="请输入手机号"[\s\S]*placeholder="请输入验证码"[\s\S]*\)\}/, `${name} should only render phone and SMS inputs after invite verification`);
    assert.match(text, /disabled=\{!inviteReady \|\| !canGetCode\}/, `${name} should disable get-code before invite code`);
    assert.match(text, /disabled=\{isLoading \|\| !inviteReady\}/, `${name} should disable submit before invite code`);

    const inviteIndex = text.indexOf("placeholder=\"请输入邀请码\"");
    const phoneIndex = text.indexOf("placeholder=\"请输入手机号\"");
    assert.ok(inviteIndex >= 0 && phoneIndex >= 0 && inviteIndex < phoneIndex, `${name} should render invite code before phone input`);
  }
});
