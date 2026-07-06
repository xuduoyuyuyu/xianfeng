import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const verifier = path.join(rootDir, "scripts/release/verify-mini-webview-build.mjs");

function writeCompatibleDist({ withFonts = true, withXiaowanziFontFace = true } = {}) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "xf-mini-webview-"));
  fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
  fs.writeFileSync(
    path.join(dist, "assets/styles.css"),
    [
      "xf_mp xf_tab xf-mp-webview xf_mp_webview xf_mp_tabbar_height --xf-mp-tabbar-height",
      ".mobile-tab{}",
      "body{padding-bottom:var(--xf-mp-tabbar-height,64px)}",
      ".material-symbols-outlined{font-family:\"Material Symbols Outlined\";font-feature-settings:\"liga\" 1}",
      ".material-symbols-rounded{font-family:\"Material Symbols Rounded\";font-feature-settings:\"liga\" 1}",
    ].join("\n"),
  );
  const fontFace = [
    "@font-face{font-family:'Material Symbols Rounded';src:url('/fonts/material-symbols-rounded.woff2') format('woff2')}",
    "@font-face{font-family:'Material Symbols Outlined';src:url('/fonts/material-symbols-outlined.woff2') format('woff2')}",
  ].join("");
  fs.writeFileSync(
    path.join(dist, "index.html"),
    `<html><head><style>${fontFace}</style><link rel="stylesheet" href="/assets/styles.css"></head><body></body></html>`,
  );
  fs.writeFileSync(
    path.join(dist, "index-xiaowanzi.html"),
    `<html><head>${withXiaowanziFontFace ? `<style>${fontFace}</style>` : ""}<link rel="stylesheet" href="/assets/styles.css"></head><body></body></html>`,
  );
  if (withFonts) {
    fs.mkdirSync(path.join(dist, "fonts"), { recursive: true });
    fs.writeFileSync(path.join(dist, "fonts/material-symbols-rounded.woff2"), Buffer.alloc(301_000));
    fs.writeFileSync(path.join(dist, "fonts/material-symbols-outlined.woff2"), Buffer.alloc(301_000));
  }
  return dist;
}

function runVerifier(dist) {
  return execFileSync(process.execPath, [verifier, "--dist", dist], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

test("mini web-view verifier fails when Material Symbols font files are missing from dist", () => {
  const dist = writeCompatibleDist({ withFonts: false });
  assert.throws(
    () => runVerifier(dist),
    /Missing local Material Symbols Rounded font/,
  );
});

test("mini web-view verifier fails when Xiaowanzi shell lacks local Material Symbols font faces", () => {
  const dist = writeCompatibleDist({ withXiaowanziFontFace: false });
  assert.throws(
    () => runVerifier(dist),
    /Missing Xiaowanzi Material Symbols font face/,
  );
});
