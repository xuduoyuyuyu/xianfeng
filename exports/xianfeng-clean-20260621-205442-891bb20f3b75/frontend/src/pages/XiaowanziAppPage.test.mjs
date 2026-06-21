import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, "..");
const appSource = readFileSync(resolve(srcRoot, "App.tsx"), "utf8");
const widgetSource = readFileSync(resolve(srcRoot, "wel/components/XiaowanziWidget.tsx"), "utf8");

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
  assert.match(widgetSource, /className="xw-home-history-exit xw-home-history-exit-dock"/);
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
