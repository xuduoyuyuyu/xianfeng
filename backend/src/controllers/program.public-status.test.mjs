import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "program.ts"), "utf8");
const modelSource = readFileSync(resolve(__dirname, "../models/Program.ts"), "utf8");

test("public program reads treat group-only as a public tag", () => {
  assert.match(
    source,
    /const PUBLIC_PROGRAM_STATUSES = \["published", "group-only"\] as const;/,
    "public program controllers should share the same public status set"
  );
  assert.match(
    source,
    /status:\s*\{\s*\$in:\s*PUBLIC_PROGRAM_STATUSES\s*\}/,
    "public list and detail filters should include group-only programs"
  );
  assert.doesNotMatch(
    source,
    /program\.status !== "published"/,
    "public detail should not reject group-only as if it were unpublished"
  );
});

test("program show classification is stored and returned with program lists", () => {
  assert.match(
    modelSource,
    /programShow:\s*\{\s*type:\s*String,\s*enum:\s*\["xianfeng", "zhiji"\]/,
    "Program model should store the show classification"
  );
  assert.match(
    source,
    /cleaned\.programShow = normalizeProgramShow\(cleaned\.programShow\)/,
    "admin create and update payloads should normalize the show classification"
  );
  assert.match(
    source,
    /programCode: 1, title: 1, description: 1, coverImage: 1,[\s\S]*programShow: 1,[\s\S]*summary: 1, episodes: 1, status: 1/,
    "public program list should return programShow for mini-program filtering"
  );
  assert.match(
    source,
    /"summary\.tags": 1, status: 1,[\s\S]*programShow: 1,[\s\S]*parseStatus: 1/,
    "admin program list should return programShow for the backend list"
  );
});

test("public program list derives content flags from lightweight projected fields", () => {
  assert.match(
    source,
    /transcript: \{ \$slice: 1 \},[\s\S]*"deepDive\.curatedReading": \{ \$slice: 1 \}/,
    "public program list should project one transcript and deep-dive item before deriving flags"
  );
});
