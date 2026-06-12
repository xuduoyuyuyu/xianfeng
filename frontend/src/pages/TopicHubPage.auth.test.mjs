import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "TopicHubPage.tsx"), "utf8");

test("topic submission clears stale login state when auth middleware returns 401", () => {
  assert.match(source, /import \{ useDispatch, useSelector \} from "react-redux";/, "topic page should be able to update Redux auth state");
  assert.match(source, /import \{ logout \} from "\.\.\/store\/userSlice";/, "topic page should reuse the shared logout cleanup");
  assert.match(source, /const dispatch = useDispatch\(\);/, "topic page should create a dispatch for stale-session cleanup");
  assert.match(
    source,
    /const handleAuthExpired = \([^)]*\) => \{[\s\S]*dispatch\(logout\(\)\);[\s\S]*xf-show-login-modal[\s\S]*登录态已过期/,
    "401 responses should clear stored auth and show the login-expired modal"
  );

  const calls = source.match(/handleAuthExpired\([^)]*\);/g) || [];
  assert.ok(calls.length >= 3, "refine, validate, and search-generate should all handle 401 auth expiry");
});
