import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readyScript = fs.readFileSync(new URL("./verify-mini-webview-ready.sh", import.meta.url), "utf8");
const cleanScript = fs.readFileSync(new URL("./verify-clean-structure.sh", import.meta.url), "utf8");
const uploadScriptUrl = new URL("./upload-wechat-miniprogram.sh", import.meta.url);

test("mini release readiness includes share landing and backend qrcode contracts", () => {
  assert.match(readyScript, /find apps\/wechat-miniprogram -name '\._\*' -delete/);
  assert.match(readyScript, /apps\/wechat-miniprogram\/utils\/share\.static\.test\.mjs/);
  assert.match(readyScript, /backend\/src\/routes\/wechatMini\.static\.test\.mjs/);
  assert.match(readyScript, /src\/services\/wechatMiniAuth\.test\.ts/);
});

test("clean release blocks when share and qrcode files are not tracked", () => {
  assert.match(cleanScript, /required_release_paths=\(/);
  assert.match(cleanScript, /scripts\/release\/verify-mini-webview-ready\.sh/);
  assert.match(cleanScript, /scripts\/release\/upload-wechat-miniprogram\.sh/);
  assert.match(cleanScript, /apps\/wechat-miniprogram\/pages\/share\/index\.js/);
  assert.match(cleanScript, /apps\/wechat-miniprogram\/pages\/share\/index\.wxml/);
  assert.match(cleanScript, /apps\/wechat-miniprogram\/pages\/share\/index\.wxss/);
  assert.match(cleanScript, /backend\/src\/models\/XiaowanziShare\.ts/);
  assert.match(cleanScript, /backend\/src\/routes\/wechatMini\.static\.test\.mjs/);
});

test("wechat mini-program upload wrapper runs release checks before external upload", () => {
  const uploadScript = fs.readFileSync(uploadScriptUrl, "utf8");

  assert.match(uploadScript, /verify-mini-webview-ready\.sh/);
  assert.match(uploadScript, /\/Applications\/wechatwebdevtools\.app\/Contents\/MacOS\/cli/);
  assert.match(uploadScript, /upload --project "\$\{PROJECT_DIR\}"/);
});
