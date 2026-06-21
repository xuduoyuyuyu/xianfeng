import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const indexSource = readFileSync(resolve(frontendRoot, "index-xiaowanzi.html"), "utf8");
const mainSource = readFileSync(resolve(__dirname, "main.xiaowanzi.tsx"), "utf8");
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
  assert.match(indexSource, /<title>小玩子<\/title>/, "browser title should not inherit the main site brand");
  assert.match(
    indexSource,
    /<link rel="apple-touch-icon" sizes="180x180" href="\/assets\/xiaowanzi-nohat\.png" \/>/,
    "iOS home screen icon should use the Xiaowanzi PNG avatar"
  );
  assert.equal(manifest.name, "小玩子");
  assert.equal(manifest.short_name, "小玩子");
  assert.equal(manifest.description, "小玩子超能模式");
  assert.equal(manifest.icons[0].src, "/assets/xiaowanzi-nohat.png");
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
