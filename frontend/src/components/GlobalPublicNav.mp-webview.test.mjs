import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./GlobalPublicNav.tsx", import.meta.url), "utf8");
const globalStyles = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

test("mini program web-view hides the website top nav and bottom tab", () => {
  assert.match(source, /function isMiniProgramWebView\(\)/);
  assert.match(source, /const params=new URLSearchParams\(window\.location\.search\)/);
  assert.match(source, /params\.get\("xf_mp"\)\s*===\s*"1"/);
  assert.match(source, /params\.has\("xf_tab"\)/);
  assert.match(source, /__wxjs_environment/);
  assert.match(source, /wechatEnvironment==="miniprogram"/);
  assert.match(source, /\/miniprogram\/i\.test\(userAgent\)/);
  assert.match(source, /sessionStorage\.setItem\("xf_mp_webview","1"\)/);
  assert.match(source, /document\.documentElement\.classList\.add\("xf-mp-webview"\)/);
  assert.match(source, /const suppressMobileTab=activePlanning\|\|miniProgramWebView/);
  assert.match(source, /compactMobile&&!embeddedLayer&&!headless&&!suppressMobileTab/);
  assert.match(source, /if\(miniProgramWebView&&!headless\) return <style>\{CSS\}<\/style>/);
  assert.match(source, /if\(headless\) return <><style>\{CSS\}<\/style>\{panelOverlay\}<\/>/);
  assert.match(source, /<nav className="fixed top-0 z-50 w-full">/);
  assert.match(source, /\.panel\{[^}]*width:min\(360px,74vw\)/);
  assert.match(source, /@media\(max-width:768px\)[\s\S]*\.panel\{width:min\(360px,88vw\)/);
  assert.match(globalStyles, /html\.xf-mp-webview \.mobile-tab,\s*html\.xf-mp-webview body\.xf-mobile-tab-enabled::after\s*\{[^}]*display: none !important;/);
  assert.match(source, /\{compactMobile&&!suppressMobileTab&&<MobileTab\/>\}/);
});

test("website mobile top actions keep Material Symbols labels outside mini program", () => {
  assert.match(source, /\.mobile-search,\.mobile-toggle\{[^}]*font-family:'Material Symbols Rounded'/);
  assert.match(source, /\.mobile-search,\.mobile-toggle\{[^}]*font-size:26px/);
  assert.match(source, /<button className="mobile-search" onClick=\{\(\)=>setSearchOpen\(v=>!v\)\}>search<\/button>/);
  assert.match(source, /<button className="mobile-toggle" onClick=\{\(\)=>setPanel\("menu"\)\}>menu<\/button>/);
  assert.match(source, /\{compactMobile&&!suppressMobileTab&&<MobileTab\/>\}/);
});
