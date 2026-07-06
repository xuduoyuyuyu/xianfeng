import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, "..");
const appSource = readFileSync(resolve(srcRoot, "App.tsx"), "utf8");
const widgetSource = readFileSync(resolve(srcRoot, "wel/components/XiaowanziWidget.tsx"), "utf8");
const mpBridgeSource = readFileSync(resolve(srcRoot, "utils/mpAuthBridge.ts"), "utf8");

test("Global super-mode entry does not depend on /xiaowanzi app route", () => {
  assert.doesNotMatch(appSource, /path="\/xiaowanzi" element=\{<XiaowanziAppPage \/>\} \//);
  assert.doesNotMatch(appSource, /import XiaowanziAppPage from "\.\/pages\/XiaowanziAppPage"/);
  assert.match(widgetSource, /type XiaowanziWidgetProps = \{\s*standalone\?: boolean;\s*hideLauncher\?: boolean;\s*\}/);
});

test("XiaowanziWidget standalone route opens the legacy super-mode page", () => {
  assert.match(widgetSource, /type XiaowanziWidgetProps = \{\s*standalone\?: boolean;\s*hideLauncher\?: boolean;\s*\}/);
  assert.match(widgetSource, /React\.FC<XiaowanziWidgetProps>/);
  assert.match(widgetSource, /standalone \? true : shouldOpenHomeOnMount/);
  assert.match(widgetSource, /standalone \? true : shouldOpenHomeOnMount/);
  assert.match(widgetSource, /\{!standalone && !hideLauncher \? \(\s*<button\s+id="ai-fab"/);
  assert.match(widgetSource, /\{!standalone \? <div className="xw-home-more-wrap"/);
  assert.match(widgetSource, /<strong>想聊什么，直接问小玩子<\/strong>/);
  assert.doesNotMatch(widgetSource, /xw-home-history-exit/);
  assert.match(widgetSource, /window\.location\.href = "\/experts\?xw_layer=1&xw_return=xiaowanzi"/);
  assert.match(widgetSource, /<iframe title=\{homeBrowseTarget\.label\} src=\{buildHomeBrowseSrc\(homeBrowseTarget\.path\)\}/);
  assert.match(widgetSource, /return `\$\{withoutHash\}\$\{separator\}xw_layer=1\$\{hash\}`/);
  assert.doesNotMatch(widgetSource, /STANDALONE_BROWSE_ENTRIES/);
  assert.doesNotMatch(widgetSource, /xw-app-browse-btn/);
  assert.doesNotMatch(widgetSource, /hideWidget/);
});

test("Xiaowanzi standalone page stays open on desktop widths", () => {
  assert.match(
    widgetSource,
    /if \(standalone\) return;/,
    "standalone Xiaowanzi entry should not run the mobile-only desktop close guard"
  );
  assert.match(
    widgetSource,
    /\}, \[open, homeActive, standalone\]\);/,
    "desktop close guard should react to the standalone prop explicitly"
  );
});

test("Homepage Xiaowanzi entry opens the normal chat panel maximized", () => {
  assert.match(appSource, /<XiaowanziWidget hideLauncher=\{pathname === "\/"\} \/>/, "homepage should mount Xiaowanzi without showing the default launcher");
  assert.match(widgetSource, /mode\?: "chat" \| "home"; maximized\?: boolean/, "open event should support a maximized chat-panel mode");
  assert.match(widgetSource, /setMaximized\(Boolean\(!nextIsHomeMode && customEvent\?\.detail\?\.maximized\)\);/, "maximized should only apply to the normal chat panel");
  assert.match(widgetSource, /setHomeActive\(nextIsHomeMode\);/, "homepage chat-panel open should not force super mode");
  assert.match(widgetSource, /<div className=\{`ai-panel-backdrop\$\{open && maximized \? " show" : ""\}`\}/, "maximized chat panel should keep the blurred backdrop");
  assert.doesNotMatch(widgetSource, /desktopFullscreen|desktopHomeFullscreen|desktop-fullscreen/, "homepage entry should not use the super-mode fullscreen variant");
});

test("Mini program Xiaowanzi tab params open chat or home mode", () => {
  assert.match(widgetSource, /function readMiniProgramXiaowanziEntryMode\(\): "chat" \| "home" \| null/);
  assert.match(widgetSource, /function takeMiniProgramXiaowanziEntryMode\(\): "chat" \| "home" \| null/);
  assert.match(widgetSource, /const MINI_PROGRAM_XIAOWANZI_RESET_QUERY_KEY = "xf_xw_reset";/);
  assert.match(widgetSource, /function shouldResetMiniProgramXiaowanziEntry\(\): boolean/);
  assert.match(
    widgetSource,
    /if \(shouldResetMiniProgramXiaowanziEntry\(\)\) \{\s*clearXiaowanziHomeActive\(\);\s*clearMiniProgramXiaowanziResetParam\(\);\s*return false;\s*\}/,
    "mini program content routes should clear stale Xiaowanzi super-mode state before restore"
  );
  assert.match(widgetSource, /url\.searchParams\.get\("xf_xw"\)/);
  assert.match(widgetSource, /raw === "home" \? "home" : raw === "chat" \? "chat" : null/);
  assert.match(widgetSource, /url\.searchParams\.delete\("xf_xw"\)/);
  assert.match(
    widgetSource,
    /const miniProgramEntryMode = readMiniProgramXiaowanziEntryMode\(\);[\s\S]*if \(miniProgramEntryMode === "chat"\) \{[\s\S]*clearXiaowanziHomeActive\(\);[\s\S]*return false;[\s\S]*\}/,
    "chat entry should suppress persisted super-mode restore before the first render"
  );
  assert.match(widgetSource, /const mode = takeMiniProgramXiaowanziEntryMode\(\);[\s\S]*const action = takeMiniProgramXiaowanziAction\(\);[\s\S]*const nextIsHomeMode = mode !== "chat";[\s\S]*setHomeActive\(nextIsHomeMode\);[\s\S]*setOpen\(true\);/);
});

test("Mini program Xiaowanzi super mode exits through the native shell", () => {
  assert.match(widgetSource, /import \{ forceExitMiniProgramXiaowanzi, isMiniProgramWebView \} from "\.\.\/\.\.\/utils\/mpAuthBridge";/);
  assert.match(
    widgetSource,
    /if \(homeActive && isMiniProgramWebView\(\)\) \{\s*clearXiaowanziHomeActive\(\);\s*void forceExitMiniProgramXiaowanzi\(\);\s*return;\s*\}/,
    "closing home mode in the mini program must force the native shell back to programs"
  );
  assert.match(widgetSource, /className="xw-home-hard-exit"[\s\S]*aria-label="退出小玩子超能模式"[\s\S]*closePanel\(\);/);
  assert.match(mpBridgeSource, /export async function forceExitMiniProgramXiaowanzi\(\)/);
  assert.match(mpBridgeSource, /reLaunch\(\{ url: "\/pages\/programs\/index" \}\);/);
  assert.match(mpBridgeSource, /switchTab\(\{ url: "\/pages\/programs\/index" \}\);/);
});

test("Mini program Xiaowanzi page suppresses web top actions for native shell chrome", () => {
  assert.doesNotMatch(widgetSource, /function hardExitMiniProgramXiaowanzi\(\)/);
  assert.match(widgetSource, /xw-home-hard-exit/);
  assert.match(widgetSource, /const miniProgramHomeChrome = open && homeActive && isMiniProgramWebView\(\);/);
  assert.match(
    widgetSource,
    /<div className="xw-home-top">[\s\S]*className="xw-home-menu"[\s\S]*className="xw-home-brand-button"[\s\S]*className="xw-home-agent-entry"/,
    "browser Xiaowanzi home keeps its internal top navigation"
  );
  assert.match(
    widgetSource,
    /\{!miniProgramHomeChrome \? renderHomeTop\(\) : null\}/,
    "mini program web-view should let native cover-view chrome own the top actions"
  );
  assert.doesNotMatch(
    widgetSource,
    /html\.xf-mp-webview \.xw-home-top\{display:flex!important\}/,
    "mini program web-view must not force-render a duplicate web top row"
  );
  assert.match(
    widgetSource,
    /html\.xf-mp-webview \.xw-home-scroll\{[^}]*padding-top:6px!important/s,
    "mini program web-view should not leave room for a duplicate native capsule-row"
  );
  assert.match(widgetSource, /takeMiniProgramXiaowanziAction/);
  assert.match(widgetSource, /xf_xw_action/);
  assert.match(widgetSource, /openManualNewConversation\(\)/);
  assert.match(widgetSource, /openHomeHistoryMenu\(\)/);
});

test("XiaowanziWidget avoids unsupported React image props in the web-view shell", () => {
  assert.doesNotMatch(widgetSource, /fetchPriority=/);
});
