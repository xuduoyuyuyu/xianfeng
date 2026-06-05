import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "AdminUsersPage.tsx"), "utf8");
const staticSource = readFileSync(resolve(__dirname, "../../../public/screens/admin-users.html"), "utf8");

test("admin users page surfaces frontend child memories", () => {
  assert.match(source, /childMemories/, "user rows should receive child memories from the backend");
  assert.match(source, /查看记忆/, "admin users page should expose a memory detail action");
  assert.match(source, /whitespace-pre-wrap/, "memory summaries should preserve line breaks for review");
});

test("static admin users screen uses the admin session for role updates", () => {
  assert.match(
    staticSource,
    /localStorage\.getItem\("admin_token"\) \|\| localStorage\.getItem\("token"\)/,
    "static admin users page should prefer admin_token over a stale public user token"
  );
  assert.match(
    staticSource,
    /localStorage\.getItem\("admin_user"\) \|\| localStorage\.getItem\("user"\)/,
    "static admin users page should display the active admin identity"
  );
});

test("react admin users page disables role changes only for the active admin account", () => {
  assert.match(
    source,
    /state\.admin/,
    "React admin users page should read the active admin session, not stale public user session"
  );
  assert.doesNotMatch(
    source,
    /const \{ user \} = useSelector\(\(state: RootState\) => state\.user\)/,
    "React admin users page must not use public user state to decide whether the role selector is disabled"
  );
});
