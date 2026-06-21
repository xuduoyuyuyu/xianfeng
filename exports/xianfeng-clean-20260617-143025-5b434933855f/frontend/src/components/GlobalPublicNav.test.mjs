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

test("mobile tab bar is mounted outside the fixed top nav so it stays viewport-bottom while scrolling", () => {
  assert.match(
    source,
    /<\/nav>\{compactMobile&&<MobileTab\/>\}\{panelOverlay\}/,
    "mobile bottom tab bar should be a sibling of the top fixed nav, not a nested fixed child"
  );
  assert.doesNotMatch(
    source,
    /\{compactMobile&&<MobileTab\/>\}<\/nav>/,
    "mobile bottom tab bar must not be rendered inside the fixed top nav"
  );
});

test("mobile tab bar has an opaque Safari safe-area backdrop", () => {
  assert.match(
    source,
    /\.mobile-tab\{[^}]*background:#fff[^}]*-webkit-backdrop-filter:none[^}]*backdrop-filter:none/s,
    "mobile bottom tab must not blur translucent scrolling content on iOS Safari"
  );
  assert.match(
    source,
    /body\.xf-mobile-tab-enabled\{--xf-mobile-tab-height:calc\(64px \+ env\(safe-area-inset-bottom\)\);padding-bottom:var\(--xf-mobile-tab-height\)\}/,
    "mobile pages should reserve only the actual tab height including iOS safe area"
  );
  assert.match(
    source,
    /body\.xf-mobile-tab-enabled::after\{[^}]*position:fixed[^}]*bottom:0[^}]*height:var\(--xf-mobile-tab-height\)[^}]*background:#fff[^}]*z-index:7999/s,
    "body should paint an opaque backdrop that matches the mobile tab height"
  );
  assert.doesNotMatch(source, /calc\(96px \+ env\(safe-area-inset-bottom\)\)/, "mobile tab backdrop should not overpaint above the tab bar");
});

test("mobile Xiaowanzi tab avatar uses the existing optimized image asset", () => {
  assert.match(
    source,
    /const DEFAULT_CHILD_AVATAR = "\/assets\/wel-avatar\/optimized\/no-hat\.webp";/,
    "mobile Xiaowanzi avatar should not reference the removed no-hat.png asset"
  );
  assert.match(
    source,
    /aria-label="小玩子，长按打开主页面"><img src=\{DEFAULT_CHILD_AVATAR\}/,
    "bottom Xiaowanzi tab should use the shared fallback avatar constant"
  );
});

test("mobile navigation images are preloaded and decoded before route transitions repaint", () => {
  assert.match(
    source,
    /const PUBLIC_NAV_IMAGE_ASSETS = \["\/assets\/logo\.png", "\/assets\/jiyue-logo\.png", DEFAULT_CHILD_AVATAR\] as const;/,
    "public nav should keep its static chrome images in one preload list"
  );
  assert.match(
    source,
    /function preloadPublicNavImage\(src:string\)[\s\S]*document\.querySelector\(`link\[rel="preload"\]\[as="image"\]\[href="\$\{src\}"\]`\)[\s\S]*link\.rel = "preload";[\s\S]*link\.as = "image";[\s\S]*image\.decoding = "sync";[\s\S]*image\.src = src;[\s\S]*image\.decode\?\.\(\)\.catch/,
    "public nav should add image preload hints and warm the decode cache"
  );
  assert.match(
    source,
    /useEffect\(\(\)=>\{PUBLIC_NAV_IMAGE_ASSETS\.forEach\(preloadPublicNavImage\);if\(user\?\.avatar_image\)preloadPublicNavImage\(user\.avatar_image\)\},\[user\?\.avatar_image\]\);/,
    "nav should warm static assets and the current user avatar on mount"
  );
  assert.match(
    source,
    /<img src="\/assets\/logo\.png" alt="家长先疯" loading="eager" decoding="sync"/,
    "top logo should decode eagerly instead of waiting for route repaint"
  );
  assert.match(
    source,
    /<img className="jiyue-icon" src=\{image\} alt=\{label\} loading="eager" decoding="sync"/,
    "Jiyue image icons should decode eagerly in nav links and menu items"
  );
  assert.match(
    source,
    /aria-label="小玩子，长按打开主页面"><img src=\{DEFAULT_CHILD_AVATAR\} alt="" loading="eager" decoding="sync"/,
    "bottom Xiaowanzi avatar should decode eagerly"
  );
});

test("adding a child profile immediately creates a local unnamed draft tab", () => {
  assert.match(
    source,
    /const add=\(\)=>\{const existingDraft=items\.find\(x=>x\.draft\);if\(existingDraft\)\{const pg=parseGrade\(existingDraft\.grade\);localStorage\.setItem\(LAST_CHILD_ID_KEY,existingDraft\.id\);setActiveId\(existingDraft\.id\);setDraft\(existingDraft\);setStage\(pg\.stage\);setGradeName\(pg\.gradeName\);setMsg\("请先完善当前未命名档案"\);return\}const n=\{\.\.\.emptyChild\(\),draft:true\};const next=\[\.\.\.items,n\];const pg=parseGrade\(n\.grade\);setItems\(next\);saveChildren\(next\);notifyChildrenUpdated\(\);localStorage\.setItem\(LAST_CHILD_ID_KEY,n\.id\);setActiveId\(n\.id\);setDraft\(n\);setStage\(pg\.stage\);setGradeName\(pg\.gradeName\);setMsg\(""\)\}/,
    "add should persist an unnamed draft profile immediately instead of waiting for save"
  );
});

test("child profile drawer blocks creating a second unnamed draft", () => {
  assert.match(
    source,
    /const hasDraftProfile=items\.some\(x=>x\.draft\);/,
    "drawer should derive whether an unfinished draft already exists"
  );
  assert.match(
    source,
    /<button className="add" type="button" aria-label="添加孩子档案" onClick=\{add\} disabled=\{hasDraftProfile\}><span aria-hidden="true"\/><\/button>/,
    "add button should stay closed while an unnamed draft still needs to be completed"
  );
});

test("deleting a child profile persists a tombstone so refresh cannot resurrect it", () => {
  assert.match(
    source,
    /const CHILD_PROFILE_DELETIONS_KEY = "xiaowanzi_child_profile_deletions_v1";/,
    "child profile drawer should keep a dedicated deletion ledger"
  );
  assert.match(
    source,
    /function loadChildren\(\): ChildProfileLite\[\][\s\S]*const deletedIds=new Set\(loadChildProfileDeletions\(\)\.map\(item=>item\.id\)\);[\s\S]*filter\(item=>!deletedIds\.has\(item\.id\)\)/,
    "loading child profiles should hide any ids that were already deleted locally or from sync"
  );
  assert.match(
    source,
    /const remove=\(\)=>\{const next=items\.filter\(x=>x\.id!==draft\.id\);const deletions=mergeChildProfileDeletions\(loadChildProfileDeletions\(\),\[\{id:draft\.id,removedAt:new Date\(\)\.toISOString\(\)\}\]\);saveChildProfileDeletions\(deletions\);saveChildren\(next\);notifyChildrenUpdated\(\);setItems\(next\);/,
    "removing a child should persist a deletion tombstone before the next refresh"
  );
});

test("child profile tabs keep each child separate and truncate long names", () => {
  assert.match(
    source,
    /\.tabs\{[^}]*overflow-x:auto[^}]*scrollbar-width:none/s,
    "children tabs should scroll horizontally instead of squeezing together"
  );
  assert.match(
    source,
    /\.tab\{[^}]*flex:0 0 auto[^}]*max-width:132px[^}]*min-width:0/s,
    "each child tab should keep its own pill width"
  );
  assert.match(
    source,
    /\.tab span\{[^}]*overflow:hidden[^}]*text-overflow:ellipsis/s,
    "long child names should truncate inside the tab"
  );
  assert.match(
    source,
    /<span>\{x\.displayName\|\|"未命名"\}<\/span>/,
    "child tab labels should have a dedicated text box for truncation"
  );
});

test("add child button centers the plus inside a stable icon box", () => {
  assert.match(
    source,
    /\.add\{[^}]*position:relative[^}]*width:32px[^}]*height:32px[^}]*display:flex[^}]*align-items:center[^}]*justify-content:center[^}]*flex:0 0 32px/s,
    "add button should center its visual glyph independently from text baseline"
  );
  assert.match(
    source,
    /\.add span\{[^}]*position:relative[^}]*display:block[^}]*width:13px[^}]*height:13px[^}]*flex:0 0 13px/s,
    "add button glyph should reserve a fixed square for the drawn plus"
  );
  assert.match(
    source,
    /\.add span::before,\.add span::after\{[^}]*content:""[^}]*position:absolute[^}]*left:50%[^}]*top:50%/s,
    "add button glyph should be redrawn from centered bars instead of relying on font baselines"
  );
  assert.match(
    source,
    /\.add span::before\{width:13px;height:2px\}/,
    "add button horizontal stroke should use the thinner 13px glyph size"
  );
  assert.match(
    source,
    /\.add span::after\{width:2px;height:13px\}/,
    "add button vertical stroke should use the thinner 13px glyph size"
  );
});
