import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "ProgramDetailPage.tsx"), "utf8");

test("program detail keeps Xiaowanzi layer navigation and back button", () => {
  assert.match(source, /useXiaowanziEmbeddedLayer/, "program detail should detect Xiaowanzi embedded layer");
  assert.match(source, /withXiaowanziLayerParam/, "program detail should preserve xw_layer on internal links");
  assert.match(source, /aria-label="返回小玩子"/, "program detail should show a Xiaowanzi back button in layer mode");
  assert.match(source, /navigate\(-1\)/, "program detail back button should return to the previous page when possible");
  assert.match(source, /navigate\("\/programs\/list\?xw_restore=xiaowanzi"\)/, "program detail back button should fall back to Xiaowanzi home restore");
  assert.match(source, /to=\{withXiaowanziLayerParam\(`\/programs\/\$\{item\._id\}`,\s*superModePage\)\}/, "related program links should preserve xw_layer");
  assert.match(source, /to=\{withXiaowanziLayerParam\("\/programs\/list",\s*superModePage\)\}/, "program library link should preserve xw_layer");
});

test("program audio player reports loading and playback failures", () => {
  assert.match(source, /const \[isAudioLoading, setIsAudioLoading\] = useState\(false\)/, "player should expose loading feedback immediately after a click");
  assert.match(source, /const \[audioError, setAudioError\] = useState<string \| null>\(null\)/, "player should expose media failures instead of swallowing them");
  assert.match(source, /audio\.addEventListener\("waiting", onWaiting\)/, "player should report buffering");
  assert.match(source, /audio\.addEventListener\("playing", onPlaying\)/, "player should clear buffering once playback starts");
  assert.match(source, /audio\.addEventListener\("error", onError\)/, "player should report blocked or invalid audio resources");
  assert.match(source, /\{isAudioLoading \? "音频加载中…" : isPlaying \? "暂停收听" : "立即收听"\}/, "primary play button should show loading state");
  assert.match(source, /\{audioError \? <p[^>]*>\{audioError\}<\/p> : null\}/, "page should render the playback error message");
  assert.doesNotMatch(source, /catch \(_error\) \{\s*window\.open\(currentEpisode\.url/, "playback failures should not silently open the raw third-party media URL");
});

test("program detail uses the shared guest avatar fallback instead of remote fallback images", () => {
  assert.match(source, /resolveGuestAvatar/, "program detail should resolve guest avatars through the shared helper");
  assert.match(source, /GUEST_FALLBACK_AVATAR_DETAIL_IMG_CLASS/, "fallback avatar should use the detail-page object-contain class");
  assert.match(source, /GUEST_FALLBACK_AVATAR_FRAME_CLASS/, "fallback avatar should use the shared fallback frame class");
  assert.match(source, /avatarFallbackActive/, "program detail should track image load failures");
  assert.match(source, /onError=\{\(\) => setAvatarFallbackActive\(true\)\}/, "broken avatar images should switch to the local fallback");
  assert.doesNotMatch(source, /const EXPERT_AVATAR\s*=/, "program detail should not keep a remote expert avatar fallback constant");
  assert.doesNotMatch(source, /1779668991727-vzxkyx0x\.png/, "remote fallback avatar marker should only live in the shared helper");
});

test("program detail deep dive keeps real supplemental content compact", () => {
  assert.match(source, /function getVerifiedCuratedReading\(program: Program \| null\)/, "curated reading should use the verification report");
  assert.match(source, /const curatedReading = getVerifiedCuratedReading\(program\);/, "detail rendering should only receive verified reading items");
  assert.doesNotMatch(source, /const curatedReading = \(program\?\.deepDive\?\.curatedReading \|\| \[\]\)/, "raw curated reading must not render directly");
  assert.match(source, /<div className="p-8 pb-8">/, "deep dive content should use one padded body");
  assert.match(source, /const hasSupplementalContent = curatedReadingUnique\.length > 0 \|\| relatedItems\.length > 0;/, "supplemental card should hide when there are no real items");
  assert.match(source, /\{hasSupplementalContent \? \(/, "supplemental card should not render an empty shell");
  assert.match(source, /\{curatedReadingUnique\.length > 0 \? \(/, "curated reading should be gated by real curated items");
  assert.match(source, /\{relatedItems\.length > 0 \? \(/, "related content should be gated by real related items");
  assert.match(source, /\{curatedReadingUnique\.length > 0 && relatedItems\.length > 0 \? <div className="mb-5 h-px w-full bg-gray-100"><\/div> : null\}/, "divider should only appear between two real sections");
  assert.match(source, /<div className="mb-5">\s*<p className="mb-3 text-\[10px\] font-black uppercase tracking-widest text-gray-400">推荐阅读 Curated Reading<\/p>/, "curated reading should use compact spacing");
  assert.doesNotMatch(source, /<div className="mb-10">\s*<p className="mb-4 text-\[10px\] font-black uppercase tracking-widest text-gray-400">推荐阅读 Curated Reading<\/p>/, "curated reading should not keep the old tall bottom spacing");
  assert.doesNotMatch(source, /《家庭教育中的低摩擦沟通》/, "empty curated reading should not be replaced by a generated fallback item");
});

test("program detail related content uses guest metadata instead of episode labels", () => {
  assert.match(source, /function getPrimaryProgramGuest\(program: Program\)/, "related recommendations should resolve a primary guest");
  assert.match(source, /function formatRelatedGuestMeta\(program: Program\)/, "related recommendations should format guest name and title");
  assert.match(source, /const guestMeta = formatRelatedGuestMeta\(item\)/, "related item rendering should compute guest metadata");
  assert.match(source, /\{guestMeta && \(/, "guest metadata should only render when present");
  assert.doesNotMatch(source, /EP\./, "related recommendations should not render EP labels");
  assert.doesNotMatch(source, /programCode.*index/, "related recommendations should not derive visible labels from program codes");
});

test("program detail gates mindmap quickview and transcript tabs by real data", () => {
  assert.match(source, /function getRealTranscriptSegments\(program: Program \| null\): TranscriptSegment\[\]/, "transcript content should come from real transcript rows only");
  assert.match(source, /function hasRealMindMapData\(program: Program \| null\): boolean/, "mindmap availability should reject empty root placeholders");
  assert.match(source, /useState<"quickview" \| "transcript" \| "mindmap">\("quickview"\)/, "quickview should be the default detail tab");
  assert.match(
    source,
    /const detailContentModes = \[\s*quickView\.length > 0\s*\?\s*\{ key: "quickview", label: "速览"[\s\S]*hasMindMapContent\s*\?\s*\{ key: "mindmap", label: "脉络"[\s\S]*transcriptSegments\.length > 0\s*\?\s*\{ key: "transcript", label: "逐字稿"/,
    "detail tabs should render in quickview, mindmap, transcript order"
  );
  assert.match(source, /hasMindMapContent\s*\?\s*\{ key: "mindmap", label: "脉络"/, "mindmap tab should only render when real mindmap data exists");
  assert.match(source, /quickView\.length > 0\s*\?\s*\{ key: "quickview", label: "速览"/, "quickview tab should only render when real quickview data exists");
  assert.match(source, /transcriptSegments\.length > 0\s*\?\s*\{ key: "transcript", label: "逐字稿"/, "transcript tab should only render when real transcript rows exist");
  assert.match(source, /\{hasDetailContent \? \(/, "the whole detail content block should be hidden when all tabs are empty");
  assert.doesNotMatch(source, /const description = program\.description \|\| "这期节目围绕家庭教育与成长展开讨论。";/, "program descriptions should not seed synthetic transcript rows");
  assert.doesNotMatch(source, /暂无脉络数据/, "empty mindmap data should hide the block instead of rendering a placeholder graph");
});

test("program detail uses native mini program chrome spacing when embedded", () => {
  assert.match(source, /html\.xf-mp-webview \.program-detail-main/);
  assert.match(source, /padding-top: var\(--xf-mp-nav-height, 88px\) !important;/);
  assert.match(source, /padding-bottom: 0 !important;/);
});
