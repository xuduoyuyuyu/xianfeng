#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const checks = [
  ["xf_mp marker", /xf_mp/],
  ["xf_tab native tabbar height param", /xf_tab/],
  ["mini web-view html class", /xf-mp-webview/],
  ["stored mini web-view session marker", /xf_mp_webview/],
  ["stored native tabbar height", /xf_mp_tabbar_height/],
  ["native tabbar CSS variable", /--xf-mp-tabbar-height/],
  ["website mobile tab hide rule", /\.mobile-tab/],
  ["mini web-view body bottom reserve", /padding-bottom:\s*var\(--xf-mp-tabbar-height,\s*64px\)/],
  ["Material Symbols Rounded font face", /font-family:\s*['"]Material Symbols Rounded['"][\s\S]*material-symbols-rounded\.woff2/],
  ["Material Symbols Outlined font face", /font-family:\s*['"]Material Symbols Outlined['"][\s\S]*material-symbols-outlined\.woff2/],
  ["outlined Material Symbols class font", /\.material-symbols-outlined\{[^}]*font-family:\s*["']?Material Symbols Outlined/],
  ["rounded Material Symbols class font", /\.material-symbols-rounded\{[^}]*font-family:\s*["']?Material Symbols Rounded/]
];

const fontChecks = [
  ["Material Symbols Rounded", "fonts/material-symbols-rounded.woff2"],
  ["Material Symbols Outlined", "fonts/material-symbols-outlined.woff2"]
];

function parseArgs(argv) {
  const args = { dist: path.join(rootDir, "frontend/dist"), stdin: false, url: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dist") {
      args.dist = path.resolve(argv[index + 1] || "");
      index += 1;
    } else if (arg === "--stdin") {
      args.stdin = true;
    } else if (arg === "--url") {
      args.url = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  node scripts/release/verify-mini-webview-build.mjs
  node scripts/release/verify-mini-webview-build.mjs --dist frontend/dist
  node scripts/release/verify-mini-webview-build.mjs --url https://xianfeng.xinzhi.info/
  curl -fsSL https://xianfeng.xinzhi.info/ | node scripts/release/verify-mini-webview-build.mjs --stdin`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let source = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      source += chunk;
    });
    process.stdin.on("end", () => {
      if (!source.trim()) {
        reject(new Error("stdin check failed: empty input"));
        return;
      }
      resolve(source);
    });
    process.stdin.on("error", reject);
  });
}

function assertContains(label, source, pattern) {
  if (!pattern.test(source)) {
    throw new Error(`Missing ${label}`);
  }
}

function readLocalBundle(distDir) {
  const indexPath = path.join(distDir, "index.html");
  const xiaowanziIndexPath = path.join(distDir, "index-xiaowanzi.html");
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Missing built frontend index: ${indexPath}`);
  }
  if (!fs.existsSync(xiaowanziIndexPath)) {
    throw new Error(`Missing built Xiaowanzi index: ${xiaowanziIndexPath}`);
  }

  for (const [label, relativePath] of fontChecks) {
    const fontPath = path.join(distDir, relativePath);
    if (!fs.existsSync(fontPath) || fs.statSync(fontPath).size < 300_000) {
      throw new Error(`Missing local ${label} font: ${fontPath}`);
    }
  }

  const indexHtml = fs.readFileSync(indexPath, "utf8");
  const xiaowanziIndexHtml = fs.readFileSync(xiaowanziIndexPath, "utf8");
  if (!/font-family:\s*['"]Material Symbols Rounded['"][\s\S]*material-symbols-rounded\.woff2/.test(xiaowanziIndexHtml)) {
    throw new Error("Missing Xiaowanzi Material Symbols font face: rounded");
  }
  if (!/font-family:\s*['"]Material Symbols Outlined['"][\s\S]*material-symbols-outlined\.woff2/.test(xiaowanziIndexHtml)) {
    throw new Error("Missing Xiaowanzi Material Symbols font face: outlined");
  }
  const assetMatches = [...indexHtml.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+\.(?:js|css))"/g)];
  const assetText = assetMatches
    .map((match) => match[1].replace(/^\//, ""))
    .map((assetPath) => {
      const fullPath = path.join(distDir, assetPath);
      return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
    })
    .join("\n");

  return `${indexHtml}\n${xiaowanziIndexHtml}\n${assetText}`;
}

async function readRemoteBundle(url) {
  const baseUrl = new URL(url);
  const response = await fetch(baseUrl, {
    headers: {
      "accept": "text/html,application/xhtml+xml"
    }
  });
  if (!response.ok) {
    const permissionHint = response.status === 403
      ? " (nginx returned 403 before the app loaded; check static file or mounted directory permissions)"
      : "";
    throw new Error(`Remote check failed: HTTP ${response.status} ${response.statusText}${permissionHint}`);
  }
  const html = await response.text();
  if (!html.trim()) {
    throw new Error("Remote check failed: empty response body");
  }
  const assetMatches = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+\.(?:js|css))"/g)];
  const assetText = (
    await Promise.all(assetMatches.map(async (match) => {
      const assetUrl = new URL(match[1], baseUrl);
      if (assetUrl.origin !== baseUrl.origin) return "";
      const assetResponse = await fetch(assetUrl);
      return assetResponse.ok ? assetResponse.text() : "";
    }))
  ).join("\n");

  const xiaowanziUrl = new URL("/index-xiaowanzi.html", baseUrl);
  const xiaowanziResponse = await fetch(xiaowanziUrl, {
    headers: {
      "accept": "text/html,application/xhtml+xml"
    }
  });
  const xiaowanziHtml = xiaowanziResponse.ok ? await xiaowanziResponse.text() : "";

  for (const [label, relativePath] of fontChecks) {
    const fontUrl = new URL(`/${relativePath}`, baseUrl);
    const fontResponse = await fetch(fontUrl);
    const contentType = fontResponse.headers.get("content-type") || "";
    const bytes = fontResponse.ok ? new Uint8Array(await fontResponse.arrayBuffer()) : new Uint8Array();
    const isWoff2 = bytes.length >= 300_000 && bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32;
    if (!fontResponse.ok || !/font|woff2|octet-stream/i.test(contentType) || !isWoff2) {
      throw new Error(`Remote ${label} font is not a valid woff2: ${fontUrl.href}`);
    }
  }

  return `${html}\n${xiaowanziHtml}\n${assetText}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = args.stdin
    ? await readStdin()
    : args.url
      ? await readRemoteBundle(args.url)
      : readLocalBundle(args.dist);
  const failures = [];

  for (const [label, pattern] of checks) {
    try {
      assertContains(label, source, pattern);
    } catch (error) {
      failures.push(error.message);
    }
  }

  if (failures.length) {
    console.error("Mini-program web-view compatibility check failed:");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  if (args.stdin) {
    console.log("Mini-program web-view compatibility is present in stdin HTML");
  } else {
    console.log(args.url
      ? `Mini-program web-view compatibility is present on ${args.url}`
      : `Mini-program web-view compatibility is present in ${path.relative(rootDir, args.dist)}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  if (process.argv.includes("--url")) {
    console.error("If Node cannot fetch this URL in the current environment, retry with:");
    console.error("  curl -fsSL https://xianfeng.xinzhi.info/ | node scripts/release/verify-mini-webview-build.mjs --stdin");
  }
  process.exit(1);
});
