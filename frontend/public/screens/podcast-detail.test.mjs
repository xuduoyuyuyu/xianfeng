import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "podcast-detail.html"), "utf8");

test("podcast detail prefers generated summary prose over timeline-heavy episode descriptions", () => {
  assert.match(source, /summary\.body \|\| summary\.description \|\| program\.description/);
});

test("podcast detail iframe uses the local optimized fallback guest avatar", () => {
  assert.match(source, /const FALLBACK_AVATAR = "\/assets\/wel-avatar\/optimized\/no-hat\.webp";/, "script fallback avatar should be local");
  assert.match(source, /function resolveGuestAvatar\(url\)/, "template should normalize missing and fallback avatar urls");
  assert.match(source, /function handleGuestAvatarError\(\)/, "broken guest avatar images should recover to the local fallback");
  assert.match(source, /src="\/assets\/wel-avatar\/optimized\/no-hat\.webp"/, "initial img src should not start with a remote fallback");
  assert.doesNotMatch(source, /FALLBACK_AVATAR = "http:\/\/xianfeng\.xinzhi\.info\/uploads\/images\/1779668991727-vzxkyx0x\.png"/, "remote fallback should not be used in the iframe script");
  assert.doesNotMatch(source, /onerror="this\.style\.opacity='0\.3'"/, "image errors should swap to a fallback instead of dimming a broken image");
});

test("podcast detail keeps remote guest upload avatars before trying local uploads", () => {
  const normalizeStart = source.indexOf("function normalizeGuestAvatar(url)");
  const localRetryStart = source.indexOf("function getLocalUploadAvatarUrl(url)");
  assert.notEqual(normalizeStart, -1, "normalizeGuestAvatar should exist");
  assert.notEqual(localRetryStart, -1, "local upload retry helper should exist after normalizeGuestAvatar");
  const normalizeSource = source.slice(normalizeStart, localRetryStart);

  assert.match(source, /function getLocalUploadAvatarUrl\(url\)/, "remote upload avatars should have an optional local retry URL");
  assert.match(source, /avatarEl\.dataset\.localUploadSrc = localUploadSrc;/, "guest avatar should remember the local upload retry URL");
  assert.match(source, /if \(localUploadSrc && avatarEl\.getAttribute\("src"\) !== localUploadSrc\)/, "broken remote upload avatars should retry the local upload before the generic fallback");
  assert.doesNotMatch(normalizeSource, /return "\/uploads\/images\/"/, "remote upload avatars should not be rewritten to local paths before the image request runs");
});

test("podcast detail renders the mind map immediately and fits it in view", () => {
  assert.match(source, /<div id="mindmap-panel">/, "mindmap panel should be visible on first render because mindmap is the default tab");
  assert.doesNotMatch(source, /<div id="mindmap-panel" class="hidden">/, "mindmap panel should not start hidden while its tab is active");
  assert.match(source, /function initMindMapData\(deepDive\)[\s\S]*renderMindMapPanel\(\);/, "loading program data should render the mindmap without waiting for another click");
  assert.match(source, /var mindMapRenderSeq = 0;/, "async first-render attempts should be tracked so stale render failures cannot replace the current mindmap");
  assert.match(source, /function renderInteractiveMarkMap\(container, markdown, renderSeq\)/, "mindmap rendering should receive the current render batch");
  assert.match(source, /if \(renderSeq !== mindMapRenderSeq\) return null;\s*container\.innerHTML = '';/, "stale async render batches should not clear the current mindmap container");
  assert.match(source, /renderInteractiveMarkMap\(container, markdown, renderSeq\)/, "panel rendering should pass the current batch to the async renderer");
  assert.match(source, /function waitForMindMapContainerReady\(container\)/, "mindmap should wait for a measurable iframe container before first rendering");
  assert.match(source, /container\.innerHTML = getMindMapLoadingHtml\(\);/, "mindmap should keep a loading state while waiting for markmap and layout readiness");
  assert.match(source, /function scheduleMindMapRefit\(markmap, container, wrapper, svg\)/, "mindmap should refit after late first-paint layout changes");
  assert.match(source, /new ResizeObserver\(refit\)/, "mindmap should refit when the iframe container size changes");
  assert.match(source, /document\.fonts\.ready\.then\(refit\)/, "mindmap should refit after web fonts settle");
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

test("podcast detail proxies touch and wheel scrolling when embedded in an iframe", () => {
  assert.match(source, /function installEmbeddedFrameScrollBridge\(\)/, "detail page should install an embedded-frame scroll bridge");
  assert.match(source, /window\.self !== window\.top/, "scroll bridge should only run when the detail page is embedded");
  assert.match(source, /window\.scrollBy\(\{ top: deltaY, left: 0, behavior: "auto" \}\)/, "scroll bridge should move the iframe document directly");
  assert.match(source, /window\.addEventListener\("wheel"[\s\S]*\{ passive: false \}/, "wheel gestures should be captured in embedded mode");
  assert.match(source, /window\.addEventListener\("touchmove"[\s\S]*\{ passive: false \}/, "touchmove gestures should be captured in embedded mode");
  assert.match(source, /installEmbeddedFrameScrollBridge\(\);/, "scroll bridge should be installed during script initialization");
});

test("podcast detail reports embedded content height to the parent route", () => {
  assert.match(source, /function postEmbeddedFrameHeight\(\)/, "detail page should expose an embedded height reporter");
  assert.match(source, /window\.parent\.postMessage\(\{ type: "xianfeng:program-detail-height", height: height \}, window\.location\.origin\)/, "detail page should post content height to its same-origin parent");
  assert.match(source, /function installEmbeddedFrameHeightSync\(\)/, "detail page should install height syncing in embedded mode");
  assert.match(source, /new ResizeObserver\(scheduleEmbeddedFrameHeightPost\)/, "height sync should react to async content and layout changes");
  assert.match(source, /installEmbeddedFrameHeightSync\(\);/, "height sync should be installed during script initialization");
});

test("podcast detail resets and targets its own scroll position", () => {
  assert.match(source, /function resetProgramDetailScrollTop\(\)/, "program detail should centralize opening-position reset");
  assert.match(source, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/, "program detail should reset the iframe document scroll");
  assert.match(source, /document\.documentElement\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/, "program detail should also reset documentElement scroll state");
  assert.match(source, /document\.body\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/, "program detail should also reset body scroll state");
  assert.match(source, /function getDetailContentScrollOffset\(\)[\s\S]*document\.documentElement\.classList\.contains\("xf-mp-webview"\)[\s\S]*return 16;/, "mini program detail should not use the desktop nav offset when positioning content");
  assert.match(source, /function scrollToDetailContent\(behavior\)[\s\S]*getDetailContentScrollOffset\(\)[\s\S]*window\.scrollTo\(\{ top: Math\.max\(0, top\), left: 0, behavior: behavior \|\| "smooth" \}\);/, "tab navigation should scroll to the detail content with the shared offset");
  assert.match(source, /resetProgramDetailScrollTop\(\);\s*const id = getIdFromPath\(\);/, "loading a program should start from the top before async content paints");
  assert.match(source, /requestAnimationFrame\(resetProgramDetailScrollTop\);\s*setTimeout\(resetProgramDetailScrollTop, 120\);/, "program detail should repeat the reset after layout and web-view restoration");
});

test("podcast detail mode tabs scroll back to the content section after the user has moved", () => {
  assert.match(source, /function setDetailViewMode\(mode, options\)/, "detail mode setter should accept explicit scroll behavior");
  assert.match(source, /options = options \|\| \{\};/, "detail mode scroll should be opt-in");
  assert.match(source, /if \(options\.scrollIntoView\) scrollToDetailContent\("smooth"\);/, "explicit tab changes should reposition the visible content section");
  assert.match(source, /setDetailViewMode\(nextMode, \{ scrollIntoView: false \}\);/, "initial availability sync should not pull the page away from the hero");
  assert.match(source, /setDetailViewMode\("quickview", \{ scrollIntoView: true \}\);/, "quickview tab should reposition the viewport");
  assert.match(source, /setDetailViewMode\("transcript", \{ scrollIntoView: true \}\);/, "transcript tab should reposition the viewport");
  assert.match(source, /setDetailViewMode\("mindmap", \{ scrollIntoView: true \}\);/, "mindmap tab should reposition the viewport");
  assert.match(source, /setDetailViewMode\(detailViewState\.mode, \{ scrollIntoView: false \}\);/, "initial mode sync should not scroll");
  assert.match(source, /backToTopBtn[\s\S]*scrollToDetailContent\("smooth"\);/, "floating back button should use the same positioning helper");
  assert.doesNotMatch(source, /window\.scrollY \+ rect\.top - 86/, "content positioning should not keep the hard-coded desktop offset");
});

test("podcast detail mobile floating player clears the public bottom tab bar", () => {
  assert.match(source, /#mobile-player-dock\s*\{[\s\S]*right:\s*20px;[\s\S]*bottom:\s*calc\(30px \+ env\(safe-area-inset-bottom\)\);/, "mobile player FAB should sit 30px above the native bottom menu");
  assert.match(source, /html\.xf-mp-webview\.xf-mp-tabbar-hidden #mobile-player-dock\s*\{[\s\S]*bottom:\s*calc\(20px \+ env\(safe-area-inset-bottom\)\);/, "immersive mini program player should not reserve space for a hidden bottom menu");
  assert.match(source, /#floating-back-to-top-btn\s*\{[\s\S]*right:\s*20px;[\s\S]*bottom:\s*calc\(96px \+ env\(safe-area-inset-bottom\)\);/, "back-to-top button should move down with the mobile player while staying stacked above it");
  assert.match(source, /html\.xf-mp-webview\.xf-mp-tabbar-hidden #floating-back-to-top-btn\s*\{[\s\S]*bottom:\s*calc\(86px \+ env\(safe-area-inset-bottom\)\);/, "immersive mini program back-to-top button should follow the lowered player");
  assert.doesNotMatch(source, /#mobile-player-dock\s*\{[\s\S]*bottom:\s*calc\(128px \+ env\(safe-area-inset-bottom\)\);/, "mobile player should not keep the old high offset");
  assert.doesNotMatch(source, /#floating-back-to-top-btn\s*\{[\s\S]*bottom:\s*calc\(194px \+ env\(safe-area-inset-bottom\)\);/, "back-to-top button should not keep the old high offset");
});

test("podcast detail mobile bottom area stays white instead of exposing a colored block", () => {
  assert.match(source, /params\.get\("xf_mp"\) === "1" \|\| params\.has\("xf_tab"\)/, "detail iframe should detect mini program markers from its own URL");
  assert.match(source, /document\.documentElement\.classList\.add\("xf-mp-webview"\)/, "detail iframe should expose a mini-program CSS hook");
  assert.match(source, /document\.documentElement\.classList\.add\("xf-mp-tabbar-hidden"\)/, "detail iframe should expose a hidden-tabbar CSS hook");
  assert.match(source, /@media \(max-width: 768px\)[\s\S]*html,\s*body\s*\{[\s\S]*background-color:\s*#ffffff;/, "mobile detail html and body should use a white bottom canvas");
  assert.match(source, /@media \(max-width: 768px\)[\s\S]*body::before,\s*body::after\s*\{[\s\S]*display:\s*none;/, "mobile detail page should hide decorative fixed backgrounds near the native tab bar");
});

test("podcast detail hero omits the episode badge so meta fills the row", () => {
  assert.doesNotMatch(source, /id="program-episode-badge"/, "hero should not render the EPISODE badge");
  assert.doesNotMatch(source, /program-episode-badge/, "script should not update a removed episode badge");
  assert.match(source, /id="program-meta" class="[^"]*\bmin-w-0\b[^"]*\btruncate\b/, "duration and publish date should occupy the freed meta slot");
});

test("podcast detail does not flash fake cover or summary placeholders before data loads", () => {
  assert.doesNotMatch(source, /lh3\.googleusercontent\.com\/aida-public/, "initial cover image should not request a placeholder artwork");
  assert.doesNotMatch(source, /感官环境的神经学重塑/, "initial summary headline should not contain fake content");
  assert.doesNotMatch(source, /物理空间对儿童神经发育具有深远影响/, "initial summary body should not contain fake content");
  assert.doesNotMatch(source, /启蒙早教：如何为孩子营造宁静的学习环境/, "initial player title should not contain a fake episode title");
  assert.doesNotMatch(source, />EP\. 42</, "initial player episode label should not contain a fake episode number");
  assert.match(source, /<section id="summary-overview-card" class="[^"]*\bhidden\b/, "summary card should stay hidden until program data is applied");
  assert.match(source, /summaryOverviewCard\.classList\.remove\("hidden"\)/, "applying real program data should reveal the summary card");
  assert.match(source, /<img id="program-cover-image"[^>]*data-src-pending="1"/, "cover image should start without a network src");
  assert.match(source, /programCoverImage\.removeAttribute\("data-src-pending"\)/, "applying real program data should mark the cover as resolved");
});

test("podcast detail loads related content from the public related endpoint", () => {
  assert.match(source, /fetch\("\/api\/programs\/" \+ encodeURIComponent\(relatedId\) \+ "\/related"\)/, "detail page should request backend related recommendations");
  assert.match(source, /recommendedPrograms/, "detail page should consume the backend related recommendation list");
  assert.match(source, /renderRelated\(program, relatedPrograms\)/, "backend related programs should drive the Related Content panel");
  assert.match(source, /applyProgram\(program, lookupPrograms\);[\s\S]*const relatedPrograms = await fetchRelatedPrograms\(program\);\s*renderRelated\(program, relatedPrograms\);/, "detail page should always repaint related content from backend results, including empty results");
  assert.doesNotMatch(source, /if \(relatedPrograms\.length\) renderRelated\(program, relatedPrograms\);/, "detail page should not keep stale fallback related items when backend returns no associations");
});

test("podcast detail curated reading renders as plain text without outbound links", () => {
  const curatedRenderStart = source.indexOf('document.getElementById("curated-reading-list").innerHTML = reading.map');
  const relatedRenderCall = source.indexOf("renderRelated(program, []);");
  assert.notEqual(curatedRenderStart, -1, "curated reading renderer should exist");
  assert.notEqual(relatedRenderCall, -1, "curated reading renderer should be located before related content rendering");
  const curatedRenderSource = source.slice(curatedRenderStart, relatedRenderCall);

  assert.match(curatedRenderSource, /return '<div class="block">/, "curated reading items should render as plain text blocks");
  assert.match(curatedRenderSource, /<h4 class="text-xs font-bold text-on-surface/, "curated reading should keep the content title as the primary line");
  assert.match(curatedRenderSource, /item\.subtitle \? '<p class="text-\[10px\] text-gray-400 mt-1 break-all">'/, "curated reading should keep the author or translator line when provided");
  assert.doesNotMatch(curatedRenderSource, /<a/, "curated reading items should not render anchors");
  assert.doesNotMatch(curatedRenderSource, /href=/, "curated reading items should not include outbound URLs");
  assert.doesNotMatch(curatedRenderSource, /target="_blank"/, "curated reading items should not open new tabs");
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

test("podcast detail related cards stay concise without summaries", () => {
  const renderRelatedStart = source.indexOf("function renderRelated");
  const fetchRelatedStart = source.indexOf("async function fetchRelatedPrograms");
  assert.notEqual(renderRelatedStart, -1, "renderRelated should exist");
  assert.notEqual(fetchRelatedStart, -1, "fetchRelatedPrograms should exist after renderRelated");
  const renderRelatedSource = source.slice(renderRelatedStart, fetchRelatedStart);

  assert.match(source, /id="related-programs-list" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"/, "related list should use a responsive card grid");
  assert.match(renderRelatedSource, /rounded-3xl border border-gray-200 bg-white/, "related item should render as a distinct card");
  assert.match(renderRelatedSource, /<h3 class="line-clamp-2 text-sm font-black text-on-surface/, "related title should be the primary visible line");
  assert.match(renderRelatedSource, /formatRelatedGuestMeta\(item\)/, "related item should use guest name and title as optional metadata");
  assert.doesNotMatch(renderRelatedSource, /sidebar-episode-num/, "related item should not render the old episode label");
  assert.doesNotMatch(renderRelatedSource, /EP\./, "related item should not render an EP label");
  assert.doesNotMatch(renderRelatedSource, /const description =/, "related item should not compute a summary or reason line");
  assert.doesNotMatch(renderRelatedSource, /<p class="text-\[11px\]/, "related item should not render long description paragraphs");
});

test("podcast detail renders related programs as bottom cards", () => {
  const renderRelatedStart = source.indexOf("function renderRelated");
  const fetchRelatedStart = source.indexOf("async function fetchRelatedPrograms");
  const renderRelatedSource = source.slice(renderRelatedStart, fetchRelatedStart);

  assert.match(source, /<section id="related-programs-wrap" class="hidden px-6 pb-44 max-w-7xl mx-auto">/, "related programs should live in a dedicated section after the main detail content");
  assert.match(source, /<h2 class="mt-2 text-2xl font-black tracking-tight text-on-surface">相关节目<\/h2>/, "bottom section should use the requested related-program heading");
  assert.match(renderRelatedSource, /aspect-video/, "related cards should include program covers");
  assert.match(renderRelatedSource, /line-clamp-2 text-sm font-black/, "related cards should keep titles compact");
});

test("podcast detail keeps curated reading in the sidebar without related programs", () => {
  assert.match(source, /<div class="p-8 pb-8">/, "deep dive content should use one padded body instead of splitting curated and related into separate padded blocks");
  assert.match(source, /<div id="curated-reading-wrap" class="mb-5">\s*<p class="text-\[10px\] font-black text-gray-400 uppercase tracking-widest mb-3">推荐阅读<\/p>/, "curated reading should use compact bottom spacing");
  assert.doesNotMatch(source, /id="deep-dive-divider"/, "sidebar should not keep a divider for the moved related section");
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

test("podcast detail hides empty detail content tabs and section", () => {
  assert.match(source, /function getRealTranscriptRows\(program\)/, "transcript availability should be based on real transcript rows");
  assert.match(source, /function getRealQuickViewItems\(program\)/, "quick view availability should be based on real quick view items");
  assert.match(source, /function configureDetailContentTabs\(availability\)/, "detail content tabs should have one availability gate");
  assert.match(source, /if \(!modes\.length\) \{\s*if \(section\) section\.classList\.add\("hidden"\);\s*return;\s*\}/, "the whole detail content section should hide when every tab is empty");
  assert.match(source, /quickBtn\.classList\.toggle\("hidden", modes\.indexOf\("quickview"\) === -1\)/, "quick view tab should hide when empty");
  assert.match(source, /transcriptBtn\.classList\.toggle\("hidden", modes\.indexOf\("transcript"\) === -1\)/, "transcript tab should hide when empty");
  assert.match(source, /mindmapBtn\.classList\.toggle\("hidden", modes\.indexOf\("mindmap"\) === -1\)/, "mindmap tab should hide when empty");
  assert.match(source, /const transcriptRaw = getRealTranscriptRows\(program\);/, "applyProgram should not seed transcript from fallback content");
  assert.match(source, /const quickView = getRealQuickViewItems\(program\);/, "content pack rendering should not create quick view from transcript");
  assert.match(source, /configureDetailContentTabs\(\{\s*mindmap: hasMindMapTab,\s*quickview: Array\.isArray\(quickViewItems\) && quickViewItems\.length > 0,\s*transcript: Array\.isArray\(transcriptState\.source\) && transcriptState\.source\.length > 0,/m, "tab availability should be computed from the rendered content sources");
  assert.doesNotMatch(source, /function transcriptFallback\(/, "empty transcript data should not be replaced by generated fallback rows");
  assert.doesNotMatch(source, /Array\.isArray\(transcript\) \? transcript\.slice\(0, 10\)/, "quick view should not fall back to transcript excerpts");
  assert.doesNotMatch(source, /transcriptState\.source = transcript\.length \? transcript : transcriptFallback\(program\)/, "transcript state should not fall back to synthetic rows");
});

test("podcast detail reflows desktop layout when all detail content is empty", () => {
  assert.match(source, /<main id="program-detail-main"/, "main area should be addressable for compact empty-content spacing");
  assert.match(source, /id="program-detail-main-grid"/, "main desktop grid should be addressable for empty-content layout");
  assert.match(source, /id="detail-content-column"/, "detail content column should be independently hideable");
  assert.match(source, /function syncDeepDiveExtrasLayout\(\)/, "empty-content layout should use one helper for the right-side deep dive card state");
  assert.match(source, /const hasDeepDiveExtras = hasRealCuratedReading\(playerState\.currentProgram && playerState\.currentProgram\.deepDive\);/, "right-side deep dive state should depend only on curated reading after related programs move to the bottom");
  assert.match(source, /main\.classList\.toggle\("detail-content-empty-main", !modes\.length\)/, "empty detail content should also compact the main page spacing");
  assert.match(source, /grid\.classList\.toggle\("detail-content-empty-layout", !modes\.length\)/, "empty detail content should switch the whole desktop grid layout");
  assert.match(source, /syncDeepDiveExtrasLayout\(\)/, "tab configuration should sync the real deep dive state");
  assert.match(source, /contentColumn\.classList\.toggle\("hidden", !modes\.length\)/, "empty detail content should remove the left column from layout flow");
  assert.match(source, /\.detail-content-empty-main\s*\{[\s\S]*padding-top:\s*2rem !important;[\s\S]*\}/, "empty detail content should reduce the large desktop blank band before the aside");
  assert.match(source, /\.detail-content-empty-layout\s*#deep-dive-aside\s*\{[\s\S]*grid-column: 1 \/ -1(?: !important)?;/, "aside should span the available grid when detail content is absent");
  assert.match(source, /\.detail-content-empty-layout\s*>\s*#deep-dive-aside\s*\{[\s\S]*max-width:\s*960px;/, "aside should become a wider centered content block instead of staying as a narrow sidebar");
  assert.match(source, /\.detail-content-empty-layout\s+#deep-dive-aside\s*>\s*\.space-y-10\s*\{[\s\S]*display:\s*grid;/, "empty detail layout should recompose sidebar cards instead of stacking a narrow rail");
  assert.match(source, /\.deep-dive-empty-layout\s+#deep-dive-sticky-wrap\s*\{[\s\S]*display:\s*none !important;/, "the deep dive card should disappear when it has no real data");
});

test("podcast detail does not render synthetic summary or deep dive placeholders for empty parsed content", () => {
  assert.match(source, /function hasRealCuratedReading\(deepDive\)/, "curated reading availability should be based on real data");
  assert.match(source, /const relatedItems = Array\.isArray\(programs\)[\s\S]*programs\.filter/, "related availability should be based on returned program records");
  assert.match(source, /const summaryHeadline = summary\.headline \|\| program\.title \|\| "本期节目";/, "empty summary headline should fall back to a real title rather than a dash");
  assert.match(source, /const hasHighlight = hasText\(summary\.highlightLabel\) \|\| hasText\(summary\.highlightText\);/, "summary highlight should be gated by real highlight text");
  assert.match(source, /summaryHighlightCard\.classList\.toggle\("hidden", !hasHighlight\)/, "empty summary highlight cards should be hidden");
  assert.match(source, /const reading = hasRealCuratedReading\(deepDive\) \? deepDive\.curatedReading : \[\];/, "curated readings should not use synthetic defaults");
  assert.match(source, /curatedWrap\.classList\.toggle\("hidden", !reading\.length\)/, "empty curated reading section should be hidden");
  assert.match(source, /if \(relatedWrap\) relatedWrap\.classList\.add\("hidden"\);/, "empty related section should be hidden");
  assert.doesNotMatch(source, /深度挖掘 Deep Dive/, "empty deep dive headings should not fall back to mixed-language placeholder text");
  assert.doesNotMatch(source, /《家庭教育中的低摩擦沟通》/, "empty programs should not show fake curated reading content");
});

test("empty detail content layout overrides the generic desktop column spans", () => {
  const emptyAsideRule = source.indexOf(".detail-content-empty-layout #deep-dive-aside");
  const genericAsideRule = source.indexOf("main > div.grid > aside");
  assert.notEqual(emptyAsideRule, -1, "empty aside override should exist");
  assert.notEqual(genericAsideRule, -1, "generic aside grid rule should exist");
  assert.ok(
    emptyAsideRule > genericAsideRule,
    "empty aside override should be declared after the generic aside span so it wins in the cascade"
  );
  assert.match(
    source,
    /\.detail-content-empty-layout\s+#deep-dive-aside\s*\{[\s\S]*grid-column:\s*1 \/ -1 !important;/,
    "empty aside grid span should not be overridden by generic lg:col-span rules"
  );
});

test("hidden detail tabs stay hidden even when tab button styles set display", () => {
  assert.match(
    source,
    /\.detail-view-switch\s+\.transcript-tool-btn\.hidden\s*\{[\s\S]*display:\s*none !important;/,
    "unavailable detail tabs should not be brought back by inline-flex tab styles"
  );
});
