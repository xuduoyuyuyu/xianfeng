import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "MindMapView.tsx"), "utf8");

test("mind map panel height follows rendered SVG content instead of a fixed background height", () => {
  assert.match(source, /const \[svgHeight, setSvgHeight\] = useState\(/, "mind map should store a measured SVG height");
  assert.match(source, /function updateSvgHeightFromContent\(/, "mind map should measure rendered content");
  assert.match(source, /useState\(220\)/, "mind map should start from a compact initial panel height");
  assert.match(source, /getBoundingClientRect\(\)/, "mind map should measure actual rendered screen bounds");
  assert.match(source, /querySelector<SVGGElement>\("g\.markmap"\)/, "mind map should measure the visible markmap group");
  assert.match(source, /Math\.max\(180,\s*Math\.ceil\(renderedHeight \+ 20\)\)/, "mind map should keep only a small vertical buffer around the graph");
  assert.match(source, /pendingFitAfterHeightRef/, "mind map should refit after the measured height changes");
  assert.match(source, /mmRef\.current\.fit\(\);[\s\S]*requestAnimationFrame\(updateSvgHeightFromContent\)/, "mind map should center itself again using the final measured height");
  assert.match(source, /new MutationObserver/, "mind map should recalculate height when nodes collapse or expand");
  assert.match(source, /style=\{\{ height: `\$\{svgHeight\}px` \}\}/, "SVG height should come from measured content state");
  assert.doesNotMatch(source, /getBBox\(\)/, "mind map should not use the untransformed SVG bbox as the panel height source");
  assert.doesNotMatch(source, /Math\.max\(320,\s*Math\.ceil\(box\.height \+ 112\)\)/, "mind map should not keep the old large height buffer");
  assert.doesNotMatch(source, /className="h-\[520px\] w-full rounded-2xl"/, "mind map should not keep the fixed 520px panel height");
});
