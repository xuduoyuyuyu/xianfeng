import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "proGate.ts"), "utf8");

test("public AI requests prefer the signed-in user token over stale admin tokens", () => {
  assert.match(source, /const userToken = window\.localStorage\.getItem\("token"\);/, "user token should be read explicitly");
  assert.match(source, /return \(userToken \|\| adminToken \|\| ""\)\.trim\(\);/, "user token should win when both tokens exist");
  assert.match(source, /if \(userToken && userRole !== "admin"\) return false;/, "stale admin tokens should not create admin bypass for normal users");
});
