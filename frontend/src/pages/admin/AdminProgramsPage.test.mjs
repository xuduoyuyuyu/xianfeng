import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "AdminProgramsPage.tsx"), "utf8");

test("admin programs page shows curated reading calibration report from enrichment output", () => {
  assert.match(
    source,
    /agentOutputs\?\.enrichment\?\.readingVerificationReport/,
    "admin programs page should read the enrichment reading verification report"
  );
  assert.match(
    source,
    /推荐阅读校准记录/,
    "admin programs page should label the verification section clearly"
  );
  assert.match(
    source,
    /verificationReport\.items\.map/,
    "admin programs page should render per-reading verification rows"
  );
});
