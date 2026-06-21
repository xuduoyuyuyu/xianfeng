import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./mpAuthBridge.ts", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

test("mini program auth bridge stores token only for xf_mp web-view entries", () => {
  assert.match(source, /url\.searchParams\.get\("xf_mp"\) !== "1"/);
  assert.match(source, /url\.searchParams\.get\("xf_token"\)/);
  assert.match(source, /window\.localStorage\.setItem\("token", token\)/);
});

test("mini program auth bridge removes token from the visible URL", () => {
  assert.match(source, /url\.searchParams\.delete\("xf_token"\)/);
  assert.match(source, /window\.history\.replaceState/);
});

test("mini program auth bridge runs before Redux store initializes", () => {
  assert.match(main, /import \{ hydrateMiniProgramAuthFromUrl \} from "\.\/utils\/mpAuthBridge";/);
  assert.match(main, /hydrateMiniProgramAuthFromUrl\(\);[\s\S]*ReactDOM\.createRoot/);
});
