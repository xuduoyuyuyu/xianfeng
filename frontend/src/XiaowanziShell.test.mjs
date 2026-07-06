import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const indexSource = readFileSync(resolve(frontendRoot, "index-xiaowanzi.html"), "utf8");
const mainSource = readFileSync(resolve(__dirname, "main.xiaowanzi.tsx"), "utf8");
const widgetSource = readFileSync(resolve(__dirname, "wel/components/XiaowanziWidget.tsx"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(frontendRoot, "public/manifest-xiaowanzi.json"), "utf8"));
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");

test("Xiaowanzi standalone shell blends browser chrome with the page background", () => {
  assert.match(
    indexSource,
    /<meta name="theme-color" content="#f2f1ff" \/>/,
    "theme-color should match the standalone Xiaowanzi page background"
  );
  assert.match(
    indexSource,
    /<div id="root" class="xw-standalone-root"><\/div>/,
    "standalone root should expose a Xiaowanzi-specific class for safe-area background overrides"
  );
  assert.match(
    stylesSource,
    /html:has\(body\.xw-standalone-shell\),\s*body\.xw-standalone-shell,\s*body\.xw-standalone-shell #root,\s*body\.xw-standalone-shell \.xw-standalone-root\s*\{[^}]*background:\s*#f2f1ff;/s,
    "standalone shell background must override the shared #root gray background"
  );
});

test("Xiaowanzi standalone shell uses its own install name and PNG avatar icon", () => {
  assert.match(indexSource, /<title><\/title>/, "initial title should stay empty so the mini program web-view does not flash a native title");
  assert.match(mainSource, /document\.title = isMiniProgramWebView \? "" : "小玩子"/, "browser title should be restored outside the mini program web-view");
  assert.match(
    indexSource,
    /<link rel="apple-touch-icon" sizes="180x180" href="\/assets\/wel-avatar\/no-hat\.png" \/>/,
    "iOS home screen icon should use the Xiaowanzi PNG avatar"
  );
  assert.equal(manifest.name, "小玩子");
  assert.equal(manifest.short_name, "小玩子");
  assert.equal(manifest.description, "小玩子超能模式");
  assert.equal(manifest.icons[0].src, "/assets/wel-avatar/no-hat.png");
  assert.equal(manifest.icons[0].type, "image/png");
});

test("Xiaowanzi standalone shell wraps login modals with the Redux provider", () => {
  assert.match(mainSource, /import \{ Provider \} from "react-redux";/, "standalone shell should import the Redux Provider");
  assert.match(mainSource, /import \{ store \} from "\.\/store";/, "standalone shell should use the shared store");
  assert.match(
    mainSource,
    /<Provider store=\{store\}>[\s\S]*<LoginModalProvider>[\s\S]*<XiaowanziWidget standalone \/>[\s\S]*<\/LoginModalProvider>[\s\S]*<\/Provider>/,
    "LoginModalProvider depends on Redux context in the standalone Xiaowanzi shell"
  );
});

test("Xiaowanzi standalone shell loads the shared app stylesheet for routed pages", () => {
  assert.match(
    mainSource,
    /import "\.\/styles\.css";/,
    "standalone Xiaowanzi routes such as the experts page need Tailwind and shared app styles"
  );
});

test("Xiaowanzi standalone shell self-hosts Material Symbols icons", () => {
  assert.match(indexSource, /font-family:\s*'Material Symbols Rounded'/);
  assert.match(indexSource, /font-family:\s*'Material Symbols Outlined'/);
  assert.match(indexSource, /<link rel="preload" href="\/fonts\/material-symbols-rounded\.woff2" as="font" type="font\/woff2" crossorigin \/>/);
  assert.match(indexSource, /<link rel="preload" href="\/fonts\/material-symbols-outlined\.woff2" as="font" type="font\/woff2" crossorigin \/>/);
  assert.match(indexSource, /src:\s*url\('\/fonts\/material-symbols-rounded\.woff2'\)\s*format\('woff2'\)/);
  assert.match(indexSource, /src:\s*url\('\/fonts\/material-symbols-outlined\.woff2'\)\s*format\('woff2'\)/);
});

test("Xiaowanzi super mode starts at the top of the native shell", () => {
  assert.doesNotMatch(
    indexSource,
    /sessionStorage\.getItem\('xf_mp_nav_height'\)/,
    "super mode should not reuse cached native top nav height"
  );
  assert.doesNotMatch(
    indexSource,
    /sessionStorage\.getItem\('xf_mp_tabbar_height'\)/,
    "super mode should not reuse cached native tabbar height"
  );
  assert.match(indexSource, /setProperty\('--xf-mp-nav-height', '0px'\)/);
  assert.match(indexSource, /setProperty\('--xf-mp-tabbar-height', '0px'\)/);
  assert.match(indexSource, /\['xf_native_capsule_top', '--xf-native-capsule-top'\]/);
  assert.match(indexSource, /\['xf_native_capsule_height', '--xf-native-capsule-height'\]/);
  assert.match(indexSource, /\['xf_native_capsule_right', '--xf-native-capsule-right'\]/);
});

test("Xiaowanzi mini program shell covers bottom navigation chrome", () => {
  assert.match(
    indexSource,
    /document\.documentElement\.classList\.add\('xf-mp-webview', 'xf-xiaowanzi-super-webview'\)/,
    "mini program standalone shell should expose a dedicated super-mode class"
  );
  assert.match(
    indexSource,
    /html\.xf-xiaowanzi-super-webview body,\s*html\.xf-xiaowanzi-super-webview #root\s*\{[^}]*overflow: hidden !important;/s,
    "standalone shell should lock the body/root so Xiaowanzi owns the viewport"
  );
  assert.match(
    indexSource,
    /html\.xf-xiaowanzi-super-webview \.mobile-tab,\s*html\.xf-xiaowanzi-super-webview body\.xf-mobile-tab-enabled::after,/,
    "standalone shell should hide the website mobile bottom navigation"
  );
  assert.match(
    indexSource,
    /html\.xf-mp-webview \.mobile-tab,\s*html\.xf-mp-webview body\.xf-mobile-tab-enabled::after\s*\{[^}]*display: none !important;/s,
    "standalone shell should also inline-hide the website mobile bottom navigation before the shared stylesheet loads"
  );
});

test("Xiaowanzi mini program shell hides web top chrome without reserving native page nav space", () => {
  assert.match(
    widgetSource,
    /html\.xf-mp-webview \.xw-home-top\{display:none!important\}/,
    "web-view topbar should be hidden in the mini-program shell"
  );
  assert.doesNotMatch(
    widgetSource,
    /html\.xf-mp-webview \.xw-home-scroll\{padding-top:calc\(var\(--xf-native-topbar-height,88px\) \+ 16px\)!important\}/,
    "web content should not reserve a separate native page-nav row"
  );
});

test("Xiaowanzi mini program shell recognizes native tabbar marker URLs", () => {
  assert.match(
    indexSource,
    /params\.has\('xf_tab'\)/,
    "real-device Xiaowanzi entries can arrive with only the native tabbar marker and still need the web bottom menu hidden"
  );
});
