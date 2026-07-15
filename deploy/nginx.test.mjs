import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "nginx.conf"), "utf8");

test("public pages allow third-party podcast audio", () => {
  assert.doesNotMatch(
    source,
    /Cross-Origin-Embedder-Policy\s+require-corp/,
    "global COEP require-corp blocks podcast audio CDNs that do not return CORP or CORS headers"
  );
});
