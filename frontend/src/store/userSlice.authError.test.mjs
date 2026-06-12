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
    /async \(\{ mobile, code \}:[\s\S]*\{ rejectWithValue \}[\s\S]*return rejectWithValue\(getAuthErrorMessage\(error, "短信登录失败"\)\);/,
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
