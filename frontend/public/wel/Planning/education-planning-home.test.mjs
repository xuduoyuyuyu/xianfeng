import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "教育规划首页.html"), "utf8");

test("planning quick basic info controls do not collapse labels on mobile", () => {
  assert.match(source, /<div class="[^"]*\bflex-wrap\b[^"]*\bmd:flex-nowrap\b/, "basic info controls should wrap as whole buttons on mobile instead of squeezing labels");

  for (const id of ["quick-city", "quick-district", "quick-stage", "quick-birthdate", "quick-gender"]) {
    assert.match(source, new RegExp(`id="${id}-btn" class="[^"]*\\bshrink-0\\b[^"]*\\bwhitespace-nowrap\\b`), `${id} button should keep its label on one line`);
    assert.match(source, new RegExp(`id="${id}-label" class="[^"]*\\bwhitespace-nowrap\\b`), `${id} label should not wrap into vertical text`);
  }
});

test("planning quick popover raises the active card above sibling controls", () => {
  assert.match(source, /const ACTIVE_POPOVER_Z_INDEX = '2147483647';/, "active popover wrapper should have a shared top-layer z-index");
  assert.match(source, /wrap\.style\.zIndex = ACTIVE_POPOVER_Z_INDEX;/, "opening a popover should raise its wrapper above sibling controls");
  assert.match(source, /wrap\.style\.zIndex = '';/, "closing a popover should restore the wrapper z-index");
});

test("planning detail page consumes five membership points before showing generated plan", () => {
  const detailSource = readFileSync(resolve(__dirname, "教育规划.html"), "utf8");

  assert.match(detailSource, /async function consumeEducationPlanningPoints\(\)/);
  assert.match(detailSource, /authJsonPost\('\/api\/billing\/consume\/education-planning'/);
  assert.match(detailSource, /await consumeEducationPlanningPoints\(\);[\s\S]*runPlanningSubmitAnimation/);
});
