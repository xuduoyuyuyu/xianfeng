import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

test("legacy /programs route redirects to the real program list page", () => {
  assert.match(
    source,
    /if \(normalizedPathname === "\/programs"\) \{\s*return <Navigate to="\/programs\/list" replace \/>;\s*\}/s,
    "desktop program index should resolve to the React program list"
  );
  assert.doesNotMatch(
    source,
    /normalizedPathname === "\/programs"[\s\S]*\/wel\/index\.html\?page=61/,
    "legacy /programs should not render the old embedded screen"
  );
});

test("program detail uses the latest iframe detail page inside Xiaowanzi layer", () => {
  assert.match(source, /const routeParams = new URLSearchParams\(search\);[\s\S]*const xiaowanziLayer = routeParams\.get\("xw_layer"\) === "1";/, "router should detect xw_layer in program detail URLs");
  assert.doesNotMatch(source, /if \(xiaowanziLayer\) return <ProgramDetailPage \/>;/, "program detail in Xiaowanzi layer should not render the old React detail page");
  assert.match(source, /const screenRev = "20260708-podcast-detail-scroll-1";/, "program detail iframe should have a cache-busting revision");
  assert.match(source, /const detailParams = new URLSearchParams\(\{ programId, v: screenRev \}\);/, "program detail should build the iframe URL from explicit query params");
  assert.match(source, /if \(xiaowanziLayer\) detailParams\.set\("xw_layer", "1"\);/, "program detail should preserve xw_layer");
  assert.match(source, /detailParams\.set\("xf_mp", "1"\);[\s\S]*detailParams\.set\("xf_tab", routeParams\.get\("xf_tab"\) \|\| "0"\);/, "mini program detail iframe should receive hidden-tabbar markers");
  assert.match(source, /const src = `\/screens\/podcast-detail\.html\?\$\{detailParams\.toString\(\)\}`;/, "program detail should use the latest versioned iframe source");
  assert.match(source, /aria-label="返回小玩子"/, "Xiaowanzi layer iframe shell should expose a top-left back button");
});

test("program detail iframe uses native mini program chrome spacing when embedded", () => {
  assert.match(
    source,
    /html\.xf-mp-webview \.program-detail-frame-shell \{[\s\S]*padding-top: var\(--xf-mp-nav-height, 88px\) !important;/,
    "mini program web-view should push the iframe below the native topbar"
  );
  assert.match(
    source,
    /html\.xf-mp-webview \.program-detail-frame-shell \{[\s\S]*background: #fff !important;/,
    "mini program detail shell should not expose a colored block below the iframe"
  );
  assert.match(
    source,
    /html\.xf-mp-webview\.xf-mp-tabbar-hidden \.program-detail-frame-shell \{[\s\S]*padding-bottom: 0 !important;[\s\S]*min-height: calc\(100vh - var\(--xf-mp-nav-height, 88px\)\) !important;[\s\S]*overflow: hidden !important;/,
    "immersive mini program detail shell should remove the native tabbar color block"
  );
  assert.match(
    source,
    /html\.xf-mp-webview \.program-detail-frame \{[\s\S]*height: calc\(100vh - var\(--xf-mp-nav-height, 88px\)\) !important;[\s\S]*margin-top: 0 !important;[\s\S]*background: #fff !important;/,
    "mini program web-view should let program detail fill the space below the native topbar"
  );
  assert.match(
    source,
    /html\.xf-mp-webview\.xf-mp-tabbar-hidden \.program-detail-frame \{[\s\S]*height: calc\(100vh - var\(--xf-mp-nav-height, 88px\)\) !important;[\s\S]*min-height: calc\(100vh - var\(--xf-mp-nav-height, 88px\)\) !important;/,
    "immersive mini program iframe should fill through the removed bottom menu area"
  );
  assert.match(source, /className="program-detail-frame-shell relative min-h-screen/, "Xiaowanzi iframe shell should expose the mini-program spacing hook");
  assert.match(source, /<div className="program-detail-frame-shell">[\s\S]*<iframe[\s\S]*className="program-detail-frame"/, "normal iframe shell should expose the mini-program spacing hook");
});

test("program detail iframe keeps vertical touch scrolling available on mobile", () => {
  assert.match(source, /overflowY: "auto"/, "program detail iframe should expose its own vertical scroll container");
  assert.match(source, /WebkitOverflowScrolling: "touch"/, "program detail iframe should use iOS momentum scrolling");
  assert.match(source, /touchAction: "pan-y"/, "program detail iframe should keep vertical pan gestures available");
  assert.match(source, /<iframe[^>]+scrolling="yes"[^>]+className="program-detail-frame"/s, "program detail iframes should opt into frame scrolling");
});

test("mobile web program detail opens the static web page directly instead of nesting an iframe", () => {
  assert.match(source, /const shouldUseDirectMobileProgramDetail = \(\) =>/, "program detail route should have a mobile direct-open guard");
  assert.match(source, /window\.matchMedia\("\(max-width: 768px\)"\)\.matches/, "direct detail route should be scoped to mobile web");
  assert.match(source, /!document\.documentElement\.classList\.contains\("xf-mp-webview"\)/, "direct detail route should not override the native mini-program shell");
  assert.match(source, /const MobileProgramDetailRedirect: React\.FC<\{ src: string \}>/, "program detail route should redirect mobile web to the static detail document");
  assert.match(source, /window\.location\.replace\(src\)/, "mobile direct detail should replace the iframe shell history entry");
  assert.match(source, /if \(shouldUseDirectMobileProgramDetail\(\)\) \{\s*return <MobileProgramDetailRedirect src=\{src\} \/>;\s*\}/s, "program detail route should bypass the iframe on mobile web");
});

test("program detail iframe expands to content height on mobile web", () => {
  assert.match(source, /const \[programDetailFrameHeight, setProgramDetailFrameHeight\] = React\.useState<string \| null>\(null\);/, "program detail shell should track iframe content height");
  assert.match(source, /data\.type !== "xianfeng:program-detail-height"/, "program detail shell should consume the detail page height message");
  assert.match(source, /document\.documentElement\.classList\.contains\("xf-mp-webview"\)/, "height expansion should not override the native mini-program frame contract");
  assert.match(source, /window\.matchMedia\("\(max-width: 768px\)"\)\.matches/, "height expansion should be scoped to mobile web");
  assert.match(source, /height: programDetailFrameHeight \|\| "100vh"/, "Xiaowanzi iframe route should use the synced content height when available");
  assert.match(source, /height: programDetailFrameHeight \|\| "calc\(100vh - 64px\)"/, "normal iframe route should use the synced content height when available");
});

test("public content route is available for Xiaowanzi layer return navigation", () => {
  assert.match(source, /import PublicContentPage from "\.\/pages\/PublicContentPage";/, "App should import the public content handoff page");
  assert.match(source, /if \(normalizedPathname === "\/public-content"\) \{\s*return <PublicContentPage \/>;\s*\}/s, "App should route public content links through a page that can render the back button");
});

test("reading detail route is available for book detail pages", () => {
  assert.match(source, /import BookDetailPage from "\.\/pages\/BookDetailPage";/, "App should import the reading detail page");
  assert.match(source, /import ExternalBookLibraryPage from "\.\/pages\/ExternalBookLibraryPage";/, "App should import the standalone external book library page");
  assert.match(source, /import ExternalBookLibraryDetailPage from "\.\/pages\/ExternalBookLibraryDetailPage";/, "App should import the standalone external book library detail page");
  assert.match(
    source,
    /if \(normalizedPathname === "\/reading"\) \{\s*return <BooksPage \/>;\s*\}/s,
    "App should keep the reading index route"
  );
  assert.match(
    source,
    /if \(normalizedPathname === "\/library"\) \{[\s\S]*return <ExternalBookLibraryPage \/>;\s*\}/s,
    "App should route /library without an explicit book id to the standalone external library page"
  );
  assert.match(
    source,
    /if \(normalizedPathname === "\/library"\) \{\s*const externalBookId = new URLSearchParams\(search\)\.get\("xf_external_book_id"\);[\s\S]*if \(externalBookId\) return <ExternalBookLibraryDetailPage \/>;[\s\S]*return <ExternalBookLibraryPage \/>;\s*\}/s,
    "mini-program /library links with an explicit external book id should recover the detail page"
  );
  assert.match(
    source,
    /if \(\/\^\\\/library\\\/\[\^\/\]\+\$\/\.test\(normalizedPathname\)\) \{\s*return <ExternalBookLibraryDetailPage \/>;\s*\}/s,
    "App should route /library/:externalId to the standalone external library detail page"
  );
  assert.match(
    source,
    /if \(normalizedPathname === "\/reading\/library"\) \{\s*return <Navigate to=\{`\/library\$\{search\}`\} replace \/>;\s*\}/s,
    "legacy /reading/library should redirect to /library"
  );
  assert.match(
    source,
    /if \(\/\^\\\/reading\\\/\[\^\/\]\+\$\/\.test\(normalizedPathname\)\) \{\s*return <BookDetailPage \/>;\s*\}/s,
    "App should route /reading/:id to the detail page"
  );
});
