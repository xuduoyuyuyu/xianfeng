import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "api.ts"), "utf8");

test("401 auth cleanup is scoped to the token used by the failed request", () => {
  assert.match(source, /xfAuthSource/, "request interceptor should remember whether it used user or admin auth");
  assert.match(source, /authSource === 'admin'[\s\S]*localStorage\.removeItem\('admin_token'\)[\s\S]*localStorage\.removeItem\('admin_user'\)/, "admin-token failures should clear only admin auth keys");
  assert.match(source, /authSource === 'user'[\s\S]*localStorage\.removeItem\('token'\)[\s\S]*localStorage\.removeItem\('user'\)[\s\S]*localStorage\.removeItem\('wel_tok'\)/, "user-token failures should clear only user auth keys");
  assert.doesNotMatch(source, /if \(error\.response\?\.status === 401\) \{[\s\S]{0,120}localStorage\.removeItem\('token'\)[\s\S]{0,260}localStorage\.removeItem\('admin_token'\)/, "401 handler should not indiscriminately clear both login stores");
});

test("mini-program web-view 401 opens native WeChat login instead of the web login modal", () => {
  assert.match(source, /import \{ isMiniProgramWebView, openMiniProgramNativeLogin \} from '\.\.\/utils\/mpAuthBridge';/);
  assert.match(source, /if \(isMiniProgramWebView\(\)\) \{[\s\S]*xfMiniProgramNativeLoginOpened[\s\S]*openMiniProgramNativeLogin\(\)[\s\S]*return Promise\.reject\(error\);[\s\S]*\}/);
  const miniLoginIndex = source.indexOf("openMiniProgramNativeLogin()");
  const modalIndex = source.indexOf("xf-show-login-modal");
  assert.ok(miniLoginIndex > 0 && modalIndex > 0 && miniLoginIndex < modalIndex, "native mini login should run before the web login modal branch");
});
