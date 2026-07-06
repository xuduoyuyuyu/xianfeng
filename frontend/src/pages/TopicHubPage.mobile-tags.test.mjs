import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "TopicHubPage.tsx"), "utf8");

test("topic hub keeps normal mobile tags in the original collapsed rows", () => {
  assert.match(source, /const DESKTOP_VISIBLE_TAGS = 48;/, "desktop should keep the existing broad collapsed tag list");
  assert.match(source, /const MOBILE_VISIBLE_TAGS = 18;/, "normal mobile should keep the previous three-row tag list");
  assert.match(
    source,
    /const maxVisibleTags = isMobilePager \? MOBILE_VISIBLE_TAGS : DESKTOP_VISIBLE_TAGS;/,
    "normal mobile should still use the responsive collapsed tag count"
  );
  assert.match(
    source,
    /const visibleTags = miniProgramWebView\s*\?\s*getMiniProgramVisibleTags\(\)\s*:\s*tagExpanded \? allTags : allTags\.slice\(0, maxVisibleTags\);/,
    "only mini-program webview should use the compact common-tag builder"
  );
  assert.match(
    source,
    /\{!miniProgramWebView && hasMoreTags && \(/,
    "normal mobile should keep the expand-all control"
  );
});

test("topic hub sends mini program long-tail tags to a filter sheet", () => {
  assert.match(source, /const MINI_PROGRAM_COMMON_TAGS = 6;/, "mini program should keep common tags compact enough for two rows plus the filter entry");
  assert.match(
    source,
    /const \[tagFilterOpen, setTagFilterOpen\] = useState\(false\);/,
    "mobile long-tail tags should open in a filter sheet"
  );
  assert.match(
    source,
    /const \[draftTag, setDraftTag\] = useState\("全部"\);/,
    "filter sheet should use a draft tag before applying"
  );
  assert.match(source, /import \{ isMiniProgramWebView \} from "\.\.\/utils\/mpAuthBridge";/);
  assert.match(source, /const miniProgramWebView = isMiniProgramWebView\(\);/);
  assert.doesNotMatch(source, /const compactTagFilter = isMobilePager \|\| miniProgramWebView;/, "normal mobile must not inherit mini-program tag behavior");
  assert.match(
    source,
    /const hasMoreTags = miniProgramWebView \? allTags\.length > visibleTags\.length : allTags\.length > maxVisibleTags;/,
    "mini-program should decide whether to show the filter sheet from compact visible tags"
  );
  assert.match(
    source,
    /return \["全部", activeTag, \.\.\.allTags\.filter/,
    "a selected long-tail tag should remain visible in the compact common rows"
  );
  assert.match(
    source,
    /\{miniProgramWebView && hasMoreTags && \([\s\S]*className="topic-tag-filter-trigger"[\s\S]*>\s*展开全部 ▼\s*<\/button>/,
    "only mini-program should expose the expand-all entry for the remaining tags"
  );
  assert.match(source, />更多标签<\/h2>/, "mini-program bottom sheet should avoid the filter wording");
  assert.doesNotMatch(source, />筛选<\/button>/, "mini-program entry should not use the filter wording");
  assert.match(
    source,
    /查看 \{draftFilteredCount\} 个话题/,
    "filter sheet should apply the draft tag with a topic count"
  );
});

test("topic hub reserves native mini program chrome space when embedded", () => {
  assert.match(source, /html\.xf-mp-webview \.topic-hub-main/);
  assert.match(source, /html\.xf-mp-webview \.topic-hub-list/);
  assert.match(source, /padding-top: var\(--xf-mp-nav-height, 88px\) !important;/);
  assert.match(source, /padding-bottom: calc\(var\(--xf-mp-tabbar-height, 64px\) \+ 28px\) !important;/);
  assert.match(source, /html\.xf-mp-webview \.topic-tag-row \{[\s\S]*max-height: 84px;/);
  assert.match(source, /html\.xf-mp-webview \.topic-tag-row \{[\s\S]*overflow: hidden;/);
  assert.doesNotMatch(source, /@media \(max-width: 767px\) \{[\s\S]*\.topic-tag-row \{[\s\S]*max-height: 84px;/);
});

test("topic hub mobile cards keep stable text and spacing in webview", () => {
  assert.match(source, /\.topic-hub-eyebrow \{[\s\S]*white-space: nowrap;/);
  assert.match(source, /className="topic-hub-eyebrow"/);
  assert.match(source, />ASK & LEARN</);
  assert.doesNotMatch(source, />Ask & Learn</);
  assert.match(source, /\.topic-hub-card-grid \{[\s\S]*grid-template-columns: repeat\(auto-fill, minmax\(320px, 1fr\)\);/);
  assert.match(source, /className="topic-hub-card-grid"/);
  assert.match(source, /\.topic-hub-card \{[\s\S]*display: flex;[\s\S]*flex-direction: column;[\s\S]*overflow: hidden;/);
  assert.match(source, /className=\{`topic-hub-card \$\{isProcessing \? "is-processing" : ""\}`\}/);
  assert.match(source, /\.topic-hub-card-title \{[\s\S]*-webkit-line-clamp: 2;/);
  assert.match(source, /\.topic-hub-card-tags \{[\s\S]*margin-top: auto;/);
  assert.match(source, /html\.xf-mp-webview \.topic-hub-card-grid \{[\s\S]*grid-template-columns: 1fr !important;/);
});
