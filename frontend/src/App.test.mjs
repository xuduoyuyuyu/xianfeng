import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

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
