import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("PlanningPage keeps iframe src stable so browser cache can work", () => {
  const source = readFileSync(path.join(__dirname, "PlanningPage.tsx"), "utf8");

  assert.doesNotMatch(source, /Date\.now\(\)\.toString\(36\)/);
  assert.match(source, /src = "\/wel\/Planning\/教育规划首页\.html"/);
  assert.doesNotMatch(source, /\?v=\$\{CACHE_BUST\}/);
});

test("planning landing page does not depend on Google Fonts at runtime", () => {
  const html = readFileSync(
    path.join(__dirname, "../../public/wel/Planning/教育规划首页.html"),
    "utf8",
  );

  assert.doesNotMatch(html, /family=DM\+Sans/);
  assert.doesNotMatch(html, /family=Noto\+Sans\+SC/);
});
