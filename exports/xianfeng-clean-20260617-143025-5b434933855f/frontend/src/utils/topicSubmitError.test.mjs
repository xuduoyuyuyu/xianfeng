import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

async function loadModule() {
  const outdir = mkdtempSync(join(tmpdir(), "xf-topic-error-"));
  const outfile = join(outdir, "topicSubmitError.mjs");
  await build({
    entryPoints: [fileURLToPath(new URL("./topicSubmitError.ts", import.meta.url))],
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
    logLevel: "silent",
  });
  const mod = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  return { mod, cleanup: () => rmSync(outdir, { recursive: true, force: true }) };
}

test("topic submit errors prefer nested messages over object stringification", async () => {
  const { mod, cleanup } = await loadModule();
  try {
    assert.equal(
      mod.extractTopicSubmitError({ error: { message: "校验 Pro 权限失败" } }, "提交失败"),
      "校验 Pro 权限失败"
    );
    assert.notEqual(
      mod.extractTopicSubmitError({ error: { code: "BROKEN" } }, "提交失败"),
      "[object Object]"
    );
  } finally {
    cleanup();
  }
});
