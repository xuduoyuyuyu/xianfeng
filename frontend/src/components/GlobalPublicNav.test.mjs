import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "GlobalPublicNav.tsx"), "utf8");

test("member center is hidden behind the Pro billing feature flag", () => {
  assert.match(
    source,
    /isProBillingEnabled\(\)\?\s*<MenuItem\s+\{\.\.\.itemProps\}\s+to="\/pro"\s+icon="workspace_premium"\s+label="订阅计划"/,
    "会员中心 must stay hidden unless Pro billing is explicitly enabled"
  );
  assert.doesNotMatch(
    source,
    /<div className="card"><Link className="link" to="\/pro"><span className="material-symbols-outlined ms">workspace_premium<\/span><span>订阅计划<\/span>/,
    "会员中心 cannot be a plain Link inside the super-mode menu"
  );
});

test("mobile hamburger menu stays a right-side partial drawer", () => {
  assert.match(source, /@media\(max-width:768px\)[\s\S]*\.panel\{width:min\(360px,88vw\)/, "mobile drawer should stop before the left edge");
  assert.match(source, /@media\(max-width:768px\)[\s\S]*\.panel\.menu\{width:min\(360px,88vw\)/, "mobile menu panel should remain a partial drawer");
  assert.doesNotMatch(source, /@media\(max-width:768px\)[\s\S]*\.panel\{width:100vw/, "mobile drawer must not become full screen");
});

test("mobile menu cards keep natural height and let the panel scroll", () => {
  assert.match(
    source,
    /\.panel\.menu>\.card,\.panel\.menu>\.account\{flex:0 0 auto\}/,
    "menu cards must not shrink and clip rows inside the mobile drawer"
  );
});

test("right drawer uses shared sidebar entrance timing", () => {
  assert.match(
    source,
    /\.panel\{[^}]*animation:slide \.2s cubic-bezier\(\.2,\.9,\.22,1\)/s,
    "right drawer should use the shared sidebar timing"
  );
  assert.match(source, /@keyframes slide\{from\{transform:translateX\(100%\)\}to\{transform:translateX\(0\)\}\}/, "right drawer should slide from fully off-canvas");
});

test("logged-out mobile menu still shows subscription and archive entries", () => {
  assert.equal([...source.matchAll(/label="订阅计划"/g)].length, 2, "subscription should appear in both logged-in and logged-out menu blocks");
  assert.equal([...source.matchAll(/<span>档案管理<\/span>/g)].length, 3, "archive management should appear in desktop, logged-in mobile, and logged-out mobile menus");
  assert.match(source, /<button className="link" onClick=\{openLogin\}><span className="material-symbols-outlined ms">badge<\/span><span>档案管理<\/span>/, "logged-out archive entry should request login");
});
