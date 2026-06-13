import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "podcast-detail.html"), "utf8");

test("podcast detail iframe uses the local optimized fallback guest avatar", () => {
  assert.match(source, /const FALLBACK_AVATAR = "\/assets\/wel-avatar\/optimized\/no-hat\.webp";/, "script fallback avatar should be local");
  assert.match(source, /function resolveGuestAvatar\(url\)/, "template should normalize missing and fallback avatar urls");
  assert.match(source, /function handleGuestAvatarError\(\)/, "broken guest avatar images should recover to the local fallback");
  assert.match(source, /src="\/assets\/wel-avatar\/optimized\/no-hat\.webp"/, "initial img src should not start with a remote fallback");
  assert.doesNotMatch(source, /FALLBACK_AVATAR = "http:\/\/xianfeng\.xinzhi\.info\/uploads\/images\/1779668991727-vzxkyx0x\.png"/, "remote fallback should not be used in the iframe script");
  assert.doesNotMatch(source, /onerror="this\.style\.opacity='0\.3'"/, "image errors should swap to a fallback instead of dimming a broken image");
});

test("podcast detail renders the mind map immediately and fits it in view", () => {
  assert.match(source, /<div id="mindmap-panel">/, "mindmap panel should be visible on first render because mindmap is the default tab");
  assert.doesNotMatch(source, /<div id="mindmap-panel" class="hidden">/, "mindmap panel should not start hidden while its tab is active");
  assert.match(source, /function initMindMapData\(deepDive\)[\s\S]*renderMindMapPanel\(\);/, "loading program data should render the mindmap without waiting for another click");
  assert.match(source, /wrapper\.className = 'markmap'/, "mindmap should keep the original markmap renderer and interaction style");
  assert.match(source, /new markmapApi\.Transformer\(\)/, "mindmap should transform data through markmap-lib");
  assert.match(source, /markmapApi\.Markmap\.create\(svg/, "mindmap should render through markmap-view to preserve zoom and collapse interactions");
  assert.match(source, /function fitMindMapToFinalBounds\(markmap, container, wrapper, svg\)/, "mindmap should fit after the final dynamic height is known");
  assert.match(source, /markmap\.fit\(\);[\s\S]*syncMindMapHeight\(container, wrapper, svg\);[\s\S]*markmap\.fit\(\);/, "mindmap should refit after syncing height so it opens centered and fully visible");
  assert.match(source, /function syncMindMapHeight\(container, wrapper, svg\)/, "mindmap background height should be synced from rendered graph content");
  assert.match(source, /Math\.max\(220,\s*Math\.ceil\(renderedHeight \+ 28\)\)/, "mindmap should keep a compact dynamic height buffer");
  assert.doesNotMatch(source, /min-height:520px;height:min\(74vh,720px\)/, "mindmap background should not keep the old fixed tall viewport height");
  assert.doesNotMatch(source, /nudgeMindMapIntoFirstView/, "mindmap should not be nudged upward on first open");
  assert.doesNotMatch(source, /function renderNativeMindMapPanel\(container, root\)/, "mindmap should not use the temporary static SVG renderer");
  assert.doesNotMatch(source, /contentGroup\.setAttribute\('transform'/, "custom transforms should not override markmap zoom/collapse state");
});

test("podcast detail keeps the bottom scroll rebound from exposing parent gray", () => {
  assert.match(source, /html\s*\{[\s\S]*background-color:\s*#fdfbf9;[\s\S]*overscroll-behavior-y:\s*none;/, "html canvas should match the detail page background during iframe scroll rebound");
  assert.match(source, /body\s*\{[\s\S]*overscroll-behavior-y:\s*none;/, "body should not chain vertical overscroll to the gray parent shell");
});

test("podcast detail hero omits the episode badge so meta fills the row", () => {
  assert.doesNotMatch(source, /id="program-episode-badge"/, "hero should not render the EPISODE badge");
  assert.doesNotMatch(source, /program-episode-badge/, "script should not update a removed episode badge");
  assert.match(source, /id="program-meta" class="[^"]*\bmin-w-0\b[^"]*\btruncate\b/, "duration and publish date should occupy the freed meta slot");
});

test("podcast detail loads related content from the public related endpoint", () => {
  assert.match(source, /fetch\("\/api\/programs\/" \+ encodeURIComponent\(relatedId\) \+ "\/related"\)/, "detail page should request backend related recommendations");
  assert.match(source, /recommendedPrograms/, "detail page should consume the backend related recommendation list");
  assert.match(source, /renderRelated\(program, relatedPrograms\)/, "backend related programs should drive the Related Content panel");
});

test("podcast detail related links navigate the parent shell instead of nesting nav inside the iframe", () => {
  const renderRelatedStart = source.indexOf("function renderRelated");
  const fetchRelatedStart = source.indexOf("async function fetchRelatedPrograms");
  assert.notEqual(renderRelatedStart, -1, "renderRelated should exist");
  assert.notEqual(fetchRelatedStart, -1, "fetchRelatedPrograms should exist after renderRelated");
  const renderRelatedSource = source.slice(renderRelatedStart, fetchRelatedStart);

  assert.match(source, /function navigateProgramDetail\(routeId\)/, "iframe should use one helper for detail navigation");
  assert.match(source, /new URLSearchParams\(window\.location\.search\)\.get\("xw_layer"\) === "1"/, "detail navigation should preserve xw_layer mode");
  assert.match(source, /window\.top\.location\.href = target/, "iframe detail links should navigate the parent shell");
  assert.match(renderRelatedSource, /data-program-route="/, "related links should carry a route id for delegated navigation");
  assert.match(renderRelatedSource, /navigateProgramDetail\(routeId\)/, "related links should delegate to the parent navigation helper");
  assert.doesNotMatch(renderRelatedSource, /href="\/programs\/' \+ routeId/, "related links should not default-navigate inside the iframe");
});

test("podcast detail related content stays compact without summaries", () => {
  const renderRelatedStart = source.indexOf("function renderRelated");
  const fetchRelatedStart = source.indexOf("async function fetchRelatedPrograms");
  assert.notEqual(renderRelatedStart, -1, "renderRelated should exist");
  assert.notEqual(fetchRelatedStart, -1, "fetchRelatedPrograms should exist after renderRelated");
  const renderRelatedSource = source.slice(renderRelatedStart, fetchRelatedStart);

  assert.match(source, /id="related-programs-list" class="space-y-0"/, "related list should remove vertical gaps");
  assert.match(renderRelatedSource, /class="group block cursor-pointer py-3 border-b/, "related item should use compact vertical padding");
  assert.match(renderRelatedSource, /<h4 class="mt-0 text-xs font-bold text-on-surface/, "related title should be the primary visible line");
  assert.match(renderRelatedSource, /formatRelatedGuestMeta\(item\)/, "related item should use guest name and title as optional metadata");
  assert.doesNotMatch(renderRelatedSource, /sidebar-episode-num/, "related item should not render the old episode label");
  assert.doesNotMatch(renderRelatedSource, /EP\./, "related item should not render an EP label");
  assert.doesNotMatch(renderRelatedSource, /const description =/, "related item should not compute a summary or reason line");
  assert.doesNotMatch(renderRelatedSource, /<p class="text-\[11px\]/, "related item should not render long description paragraphs");
});

test("podcast detail related content matches curated reading item font size", () => {
  const renderRelatedStart = source.indexOf("function renderRelated");
  const fetchRelatedStart = source.indexOf("async function fetchRelatedPrograms");
  const renderRelatedSource = source.slice(renderRelatedStart, fetchRelatedStart);

  assert.match(source, /curated-reading-list"[\s\S]*<h4 class="text-xs font-bold text-on-surface/, "curated reading titles should use the baseline item size");
  assert.match(renderRelatedSource, /<h4 class="[^"]*text-xs font-bold text-on-surface/, "related titles should use the same item title size as curated reading");
  assert.doesNotMatch(renderRelatedSource, /<h4 class="text-\[13px\]/, "related titles should not be larger than curated reading titles");
});

test("podcast detail deep dive keeps curated reading and related content adjacent", () => {
  assert.match(source, /<div class="p-8 pb-8">/, "deep dive content should use one padded body instead of splitting curated and related into separate padded blocks");
  assert.match(source, /<div class="mb-5">\s*<p class="text-\[10px\] font-black text-gray-400 uppercase tracking-widest mb-3">推荐阅读 Curated Reading<\/p>/, "curated reading should use compact bottom spacing");
  assert.match(source, /<div class="h-px bg-gray-100 w-full mb-5"><\/div>\s*<div>\s*<p class="text-\[10px\] font-black text-gray-400 uppercase tracking-widest mb-3">相关内容推荐 Related Content<\/p>/, "related content should follow the divider without an extra blank padded band");
  assert.doesNotMatch(source, /<div class="px-8 pb-8">\s*<p class="text-\[10px\] font-black text-gray-400 uppercase tracking-widest mb-4">相关内容推荐 Related Content<\/p>/, "related content should not live in a separate padded block that creates a vertical gap");
});

test("podcast detail related content replaces episode labels with guest metadata", () => {
  const renderRelatedStart = source.indexOf("function renderRelated");
  const fetchRelatedStart = source.indexOf("async function fetchRelatedPrograms");
  const renderRelatedSource = source.slice(renderRelatedStart, fetchRelatedStart);

  assert.match(source, /function formatRelatedGuestMeta\(program\)/, "related metadata should have a guest formatter");
  assert.match(source, /getPrimaryProgramGuest\(program\)/, "related metadata should read the first bound guest");
  assert.match(source, /return parts\.join\(" "\)/, "guest name and title should be joined into one line");
  assert.match(renderRelatedSource, /const guestMeta = formatRelatedGuestMeta\(item\)/, "related rendering should compute guest metadata per item");
  assert.match(renderRelatedSource, /guestMeta \?/, "related metadata should only render when guest data exists");
  assert.doesNotMatch(source, /<span class="sidebar-episode-num[^"]*">EP\.41<\/span>/, "placeholder DOM should not show the old EP label");
  assert.doesNotMatch(renderRelatedSource, /formatRelatedEpisodeCode/, "related rendering should not depend on episode code formatting");
});
