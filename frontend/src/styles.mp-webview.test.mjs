import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const styles = fs.readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("main stylesheet does not block mini program web-view on Google Fonts imports", () => {
  assert.doesNotMatch(styles, /@import\s+url\("https:\/\/fonts\.googleapis\.com/);
  assert.match(styles, /@import "tailwindcss";/);
});

test("main stylesheet force-hides website mobile tab in mini program web-view", () => {
  assert.match(styles, /html\.xf-mp-webview \.mobile-tab/);
  assert.match(styles, /html\.xf-mp-webview body\.xf-mobile-tab-enabled::after/);
  assert.match(styles, /display: none !important/);
});

test("main stylesheet hides website detail back controls in mini program web-view", () => {
  assert.match(styles, /html\.xf-mp-webview \.xf-web-detail-back,\s*html\.xf-mp-webview \.xf-web-detail-back \*\s*\{\s*display: none !important;\s*\}/);
});

test("index skips external Google font loading inside mini program web-view", () => {
  assert.match(indexHtml, /xf_mp/);
  assert.match(indexHtml, /xf_mp_webview/);
  assert.match(indexHtml, /__wxjs_environment/);
  assert.match(indexHtml, /wechatEnvironment === 'miniprogram'/);
  assert.match(indexHtml, /\/miniprogram\/i\.test\(userAgent\)/);
  assert.match(indexHtml, /sessionStorage\.setItem\('xf_mp_webview', '1'\)/);
  assert.match(indexHtml, /document\.documentElement\.classList\.add\('xf-mp-webview'\)/);
  assert.doesNotMatch(indexHtml, /params\.get\('xf_nav'\)/);
  assert.match(indexHtml, /params\.has\('xf_tab'\)/);
  assert.match(indexHtml, /params\.get\('xf_tab'\)/);
  assert.match(indexHtml, /xf_mp_nav_height/);
  assert.match(indexHtml, /xf_mp_tabbar_height/);
  assert.match(indexHtml, /--xf-mp-nav-height/);
  assert.match(indexHtml, /setProperty\('--xf-mp-nav-height', '0px'\)/);
  assert.match(indexHtml, /--xf-mp-tabbar-height/);
  assert.match(indexHtml, /if \(params\.has\('xf_tab'\) && nativeTabbarHeight === 0\) \{[\s\S]*setItem\('xf_mp_tabbar_height', '0'\)[\s\S]*setProperty\('--xf-mp-tabbar-height', '0px'\)/);
  assert.match(indexHtml, /document\.documentElement\.classList\.add\('xf-mp-tabbar-hidden'\)/);
  assert.doesNotMatch(indexHtml, /html\.xf-mp-webview nav/);
  assert.match(indexHtml, /html\.xf-mp-webview \.mobile-tab/);
  assert.match(indexHtml, /html\.xf-mp-webview body\.xf-mobile-tab-enabled::after/);
  assert.match(indexHtml, /html\.xf-mp-webview \.xf-web-detail-back/);
  assert.match(indexHtml, /html\.xf-mp-webview \.xf-web-detail-back \*/);
  assert.match(indexHtml, /content: none !important/);
  assert.match(indexHtml, /height: 0 !important/);
  assert.match(indexHtml, /html\.xf-mp-webview body\.xf-mobile-tab-enabled \{\s*padding-bottom: var\(--xf-mp-tabbar-height, 64px\) !important;/);
  assert.match(indexHtml, /html\.xf-mp-webview body \{\s*padding-top: var\(--xf-mp-nav-height, 0px\) !important;\s*padding-bottom: var\(--xf-mp-tabbar-height, 64px\) !important;/);
  assert.match(indexHtml, /html\.xf-mp-webview\.xf-mp-tabbar-hidden body \{\s*padding-bottom: 0 !important;\s*\}/);
  assert.match(indexHtml, /return;/);
});

test("index self-hosts Material Symbols for mini program web-view icons", () => {
  const roundedFont = new URL("../public/fonts/material-symbols-rounded.woff2", import.meta.url);
  const outlinedFont = new URL("../public/fonts/material-symbols-outlined.woff2", import.meta.url);
  assert.match(indexHtml, /font-family:\s*'Material Symbols Rounded'/);
  assert.match(indexHtml, /font-family:\s*'Material Symbols Outlined'/);
  assert.match(indexHtml, /src:\s*url\('\/fonts\/material-symbols-rounded\.woff2'\)\s*format\('woff2'\)/);
  assert.match(indexHtml, /src:\s*url\('\/fonts\/material-symbols-outlined\.woff2'\)\s*format\('woff2'\)/);
  assert.match(indexHtml, /font-display:\s*block/);
  assert.match(indexHtml, /font-feature-settings:\s*'liga'/);
  assert.ok(fs.statSync(roundedFont).size > 300_000);
  assert.ok(fs.statSync(outlinedFont).size > 300_000);
});

test("outlined Material Symbols use the self-hosted icon font without the ms helper", () => {
  assert.match(
    styles,
    /\.material-symbols-outlined\s*\{[^}]*font-family:\s*"Material Symbols Outlined"/s,
    "standalone outlined icons should not render as plain ligature text in mini program web-view"
  );
  assert.match(styles, /\.material-symbols-outlined\s*\{[^}]*font-feature-settings:\s*"liga" 1/s);
  assert.match(styles, /\.material-symbols-outlined\s*\{[^}]*text-transform:\s*none/s);
  assert.match(styles, /\.material-symbols-outlined\s*\{[^}]*-webkit-font-smoothing:\s*antialiased/s);
});

test("rounded Material Symbols use the self-hosted icon font without the ms helper", () => {
  assert.match(
    styles,
    /\.material-symbols-rounded\s*\{[^}]*font-family:\s*"Material Symbols Rounded"/s,
    "standalone rounded icons should not render as plain ligature text in mini program web-view"
  );
  assert.match(styles, /\.material-symbols-rounded\s*\{[^}]*font-feature-settings:\s*"liga" 1/s);
  assert.match(styles, /\.material-symbols-rounded\s*\{[^}]*text-transform:\s*none/s);
  assert.match(styles, /\.material-symbols-rounded\s*\{[^}]*-webkit-font-smoothing:\s*antialiased/s);
});

test("mini program web-view reserves bottom space for the native tab bar only", () => {
  assert.match(styles, /html\.xf-mp-webview body\.xf-mobile-tab-enabled\s*\{\s*padding-bottom: var\(--xf-mp-tabbar-height, 64px\) !important;/);
  assert.match(styles, /html\.xf-mp-webview body\s*\{\s*padding-top: var\(--xf-mp-nav-height, 0px\) !important;\s*padding-bottom: var\(--xf-mp-tabbar-height, 64px\) !important;/);
  assert.match(styles, /html\.xf-mp-webview\.xf-mp-tabbar-hidden body\s*\{\s*padding-bottom: 0 !important;\s*\}/);
  assert.match(styles, /html\.xf-mp-webview\.xf-mp-tabbar-hidden,\s*html\.xf-mp-webview\.xf-mp-tabbar-hidden body,\s*html\.xf-mp-webview\.xf-mp-tabbar-hidden #root\s*\{\s*background: #ffffff !important;\s*\}/);
  const plainBodyRule = styles.match(/\nbody\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(plainBodyRule, /--xf-mp-tabbar-height/);
  assert.doesNotMatch(plainBodyRule, /padding-bottom:\s*var\(--xf-mp-tabbar-height/);
});
