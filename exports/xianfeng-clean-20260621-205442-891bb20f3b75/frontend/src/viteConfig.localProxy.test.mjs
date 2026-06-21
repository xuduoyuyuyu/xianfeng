import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "../vite.config.ts"), "utf8");

test("local Vite proxies app APIs to the active source backend", () => {
  assert.match(
    source,
    /"\/api":\s*\{[\s\S]*target:\s*"http:\/\/127\.0\.0\.1:3001"/,
    "default /api proxy should hit the active local backend, not the Docker gateway"
  );
  assert.match(
    source,
    /"\/uploads":\s*\{[\s\S]*target:\s*"http:\/\/127\.0\.0\.1:3001"/,
    "/uploads should be served by the same active local backend"
  );
  assert.doesNotMatch(source, /target:\s*"http:\/\/127\.0\.0\.1:80"/, "local Vite should not proxy app requests to stale port 80");
});
