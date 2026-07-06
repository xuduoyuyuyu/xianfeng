import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./LoginModalProvider.tsx", import.meta.url), "utf8");

test("login modal provider routes mini program login prompts to native authorization", () => {
  assert.match(source, /import \{ isMiniProgramWebView, openMiniProgramNativeLogin \} from "\.\.\/utils\/mpAuthBridge";/);
  assert.match(source, /if \(isMiniProgramWebView\(\)\) \{/);
  assert.match(source, /openMiniProgramNativeLogin\(\)\.then\(\(opened\) => \{/);
  assert.match(source, /if \(!opened\) showLoginModal\(detail\.title, detail\.description\);/);
  assert.match(source, /return;\s*\}\s*showLoginModal\(detail\.title, detail\.description\);/);
});
