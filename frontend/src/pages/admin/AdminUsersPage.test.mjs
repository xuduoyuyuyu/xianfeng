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

test("admin users page opens an aggregated profile and behavior timeline", () => {
  assert.match(source, /adminApi\.getUserOverview\(row\._id\)/);
  assert.match(source, /查看用户画像与时间线/);
  assert.match(source, /孩子基本情况/);
  assert.match(source, /好赚/);
  assert.match(source, /用户时间线/);
  assert.match(source, /overview\.timeline\.map/);
  assert.match(source, /createPortal\([\s\S]*document\.body/);
});

test("admin users page filters by profile tags", () => {
  assert.match(source, /全部好赚状态/);
  assert.match(source, /全部会员/);
  assert.match(source, /全部城市/);
  assert.match(source, /全部区域/);
  assert.match(source, /全部孩子年龄段/);
  assert.match(source, /全部年级/);
  assert.match(source, /String\(row\.hasMamaResource\) !== mamaFilter/);
  assert.match(source, /row\.membershipTier !== membershipFilter/);
  assert.match(source, /row\.childStages/);
  assert.match(source, /row\.childGrades/);
});

test("admin users page exposes business IDs and adjustable pagination", () => {
  assert.match(source, />用户 ID</);
  assert.match(source, />好赚 ID</);
  assert.match(source, /row\._id/);
  assert.match(source, /row\.mamaResourceId \|\| "-"/);
  assert.match(source, /useState\(PAGE_SIZE\)/);
  assert.match(source, /<option value=\{20\}>每页 20 条<\/option>/);
  assert.match(source, /<option value=\{50\}>每页 50 条<\/option>/);
  assert.match(source, /<option value=\{100\}>每页 100 条<\/option>/);
  assert.match(source, /setPageSize\(Number\(event\.target\.value\)\); setCurrentPage\(1\)/);
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

test("admin users pages let admins edit current point balances", () => {
  assert.match(source, /proPointBalance/, "React admin users page should load and render user point balances");
  assert.match(source, /当前点数/, "React admin users page should label the point balance control");
  assert.match(source, /proPointBalance: Number\(row\.proPointBalance \|\| 0\)/, "React rows should normalize point balances");
  assert.match(
    source,
    /proPointBalance: Number\(row\.proPointBalance \|\| 0\)/,
    "React quick-save payload should send the edited point balance"
  );

  assert.match(staticSource, /field-points/, "static admin users page should expose a point balance input");
  assert.match(staticSource, /proPointBalance/, "static admin users page should submit point balance updates");
  assert.match(staticSource, /当前点数/, "static admin users page should label the point balance column");
});
