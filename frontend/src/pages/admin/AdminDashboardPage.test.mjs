import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "AdminDashboardPage.tsx"), "utf8");

test("admin dashboard exposes a mama resource pool shortcut", () => {
  assert.match(source, /to="\/admin\/mama-resources"/);
  assert.match(source, /好赚/);
  assert.match(source, /\/assets\/mama-hao-zhuan-icon\.png/);
});
