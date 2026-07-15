import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
const template = readFileSync(new URL("./index.wxml", import.meta.url), "utf8");
const config = JSON.parse(readFileSync(new URL("./index.json", import.meta.url), "utf8"));

test("legacy settings login reuses the shared wechat profile completion gate", () => {
  assert.match(source, /selectComponent\("#settingsPhoneLoginGate"\)/);
  assert.match(source, /gate\.loginWithPhone\(event\)/);
  assert.match(template, /<phone-login-gate id="settingsPhoneLoginGate"[^>]*bind:success="handleLoginSuccess"/);
  assert.equal(config.usingComponents["phone-login-gate"], "../../../components/phone-login-gate/index");
});
