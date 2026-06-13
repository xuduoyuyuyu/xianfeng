import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "userSlice.ts"), "utf8");
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
