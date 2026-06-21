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
  assert.match(source, /const xiaowanziLayer = new URLSearchParams\(search\)\.get\("xw_layer"\) === "1";/, "router should detect xw_layer in program detail URLs");
  assert.doesNotMatch(source, /if \(xiaowanziLayer\) return <ProgramDetailPage \/>;/, "program detail in Xiaowanzi layer should not render the old React detail page");
  assert.match(source, /const src = `\/screens\/podcast-detail\.html\?programId=\$\{encodeURIComponent\(programId\)\}\$\{xiaowanziLayer \? "&xw_layer=1" : ""\}`;/, "program detail should use the latest iframe source and preserve xw_layer");
  assert.match(source, /aria-label="返回小玩子"/, "Xiaowanzi layer iframe shell should expose a top-left back button");
});

test("public content route is available for Xiaowanzi layer return navigation", () => {
  assert.match(source, /import PublicContentPage from "\.\/pages\/PublicContentPage";/, "App should import the public content handoff page");
  assert.match(source, /if \(normalizedPathname === "\/public-content"\) \{\s*return <PublicContentPage \/>;\s*\}/s, "App should route public content links through a page that can render the back button");
});

test("reading detail route is available for book detail pages", () => {
  assert.match(source, /import BookDetailPage from "\.\/pages\/BookDetailPage";/, "App should import the reading detail page");
  assert.match(
    source,
    /if \(normalizedPathname === "\/reading"\) \{\s*return <BooksPage \/>;\s*\}/s,
    "App should keep the reading index route"
  );
  assert.match(
    source,
    /if \(\/\^\\\/reading\\\/\[\^\/\]\+\$\/\.test\(normalizedPathname\)\) \{\s*return <BookDetailPage \/>;\s*\}/s,
    "App should route /reading/:id to the detail page"
  );
});
