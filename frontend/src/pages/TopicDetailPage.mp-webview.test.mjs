import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "TopicDetailPage.tsx"), "utf8");

test("topic detail page uses native mini program chrome spacing when embedded", () => {
  assert.match(
    source,
    /html\.xf-mp-webview \.topic-mobile-safe \{[\s\S]*padding-bottom: 0 !important;/,
    "mini program web-view should remove topic detail's mobile web tab bottom padding"
  );
  assert.match(
    source,
    /html\.xf-mp-webview \.topic-detail-frame \{[\s\S]*padding-top: var\(--xf-mp-nav-height, 88px\) !important;[\s\S]*padding-bottom: 0 !important;/,
    "mini program web-view should use the native topbar height for topic detail content"
  );
  assert.match(
    source,
    /className="topic-detail-frame"/,
    "topic detail content wrapper should expose the mini-program spacing hook"
  );
  assert.match(
    source,
    /className="xf-web-detail-back"/,
    "topic detail web back links should be hideable inside mini program web-view"
  );
  assert.match(
    source,
    /html\.xf-mp-webview \.xf-web-detail-back \{[\s\S]*display: none !important;/,
    "mini program web-view should hide the web back link and rely on native chrome"
  );
});

test("topic detail page opens each topic at the top", () => {
  assert.match(
    source,
    /function resetTopicDetailScrollTop\(\)/,
    "topic detail should centralize top reset so it can be reused after async node loading"
  );
  assert.match(
    source,
    /window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/,
    "topic detail should reset scroll when opening a topic route"
  );
  assert.match(
    source,
    /if \(!isMiniProgramTopicDetailView\(\)\) return;[\s\S]*resetTopicDetailScrollTop\(\);[\s\S]*window\.setTimeout\(resetTopicDetailScrollTop, 120\)/,
    "mini program topic detail should repeat the top reset after browser and webview restoration"
  );
  assert.match(
    source,
    /window\.setTimeout\(scrollToTop, 180\)/,
    "topic detail should also reset after async content layout settles in web-view"
  );
});

test("topic detail initial node selection does not scroll away from the page top", () => {
  assert.match(
    source,
    /selectNode\(firstBranch\.children\[0\], \{ scrollIntoView: false, resetTopAfterLoad: true \}\)/,
    "auto-selecting the first node should keep the topic title and tabs visible"
  );
  assert.match(
    source,
    /options: \{ scrollIntoView\?: boolean; resetTopAfterLoad\?: boolean; resetDetailScroll\?: boolean \} = \{\}/,
    "manual node taps should keep using the scroll behavior through selectNode options"
  );
  assert.match(
    source,
    /const shouldScrollIntoView = options\.scrollIntoView !== false;/,
    "selectNode should only suppress scrolling for the initial auto-selection"
  );
  assert.match(
    source,
    /if \(isMobileViewport\) \{[\s\S]*setMobileView\("detail"\);[\s\S]*if \(shouldScrollIntoView\) \{/,
    "initial auto-selection should still open the node detail tab without scrolling to it"
  );
  assert.match(
    source,
    /if \(options\.resetTopAfterLoad && isMiniProgramTopicDetailView\(\)\) resetTopicDetailScrollTop\(\);/,
    "initial node content load should reset back to the page top after async rendering in mini program web-view"
  );
});

test("topic detail page disables browser scroll restoration", () => {
  assert.match(
    source,
    /window\.history\.scrollRestoration = "manual"/,
    "browser history restoration should not override the topic detail top reset"
  );
  assert.match(
    source,
    /window\.setTimeout\(scrollToTop, 0\)/,
    "topic detail should repeat the top reset after the browser restore pass"
  );
});

test("topic detail page uses mini program URL userId for pending topics", () => {
  assert.match(
    source,
    /function getTopicDetailUserId\(currentUser: RootState\["user"\]\["user"\] \| null\): string/,
    "topic detail should centralize the user id used for pending topic access"
  );
  assert.match(
    source,
    /url\.searchParams\.get\("userId"\)/,
    "topic detail should read the mini program userId from the web-view URL"
  );
  assert.match(
    source,
    /return urlUserId \|\| getTopicUserId\(currentUser\);/,
    "URL userId should take precedence over a browser-local fallback id"
  );
  assert.match(
    source,
    /const uid = getTopicDetailUserId\(currentUser\);[\s\S]*fetch\(`\/api\/topic-hub\/\$\{slug\}\$\{uid \? `\?userId=\$\{uid\}` : ""\}`\)/,
    "topic detail request should use the mini program userId"
  );
  assert.match(
    source,
    /const uid = getTopicDetailUserId\(currentUser\);[\s\S]*fetch\(`\/api\/topic-hub\/\$\{slug\}\/nodes\/\$\{node\.nodeKey\}\$\{uid \? `\?userId=\$\{uid\}` : ""\}`\)/,
    "node detail request should use the same mini program userId"
  );
});

test("topic detail enters the next knowledge node after a pull-up release", () => {
  assert.match(
    source,
    /const NEXT_NODE_PULL_THRESHOLD = 72;/,
    "pull-up release should use a deliberate threshold instead of accidental bottom scrolling"
  );
  assert.match(
    source,
    /const NEXT_NODE_PULL_MAX = 104;/,
    "the pull-up progress should be capped for a controlled transition animation"
  );
  assert.match(
    source,
    /function getFlatTopicLeafNodes\(tree: BranchNode\[\]\): LeafNode\[\]/,
    "topic detail should flatten branch children before resolving the next leaf"
  );
  assert.match(
    source,
    /function getNextTopicLeafNode\(tree: BranchNode\[\], currentNodeKey: string\): LeafNode \| null/,
    "topic detail should resolve the next knowledge node from the full tree"
  );
  assert.doesNotMatch(
    source,
    /isTopicDetailAtBottom/,
    "pull-up should not depend on an exact bottom-distance calculation in mobile safe areas"
  );
  assert.doesNotMatch(
    source,
    /const handleNextNodePullStart = \(event: React\.TouchEvent<HTMLDivElement>\) => \{[\s\S]*isTopicDetailAtBottom/,
    "the visible pull-up card itself should arm the gesture without an extra exact-bottom gate"
  );
  assert.doesNotMatch(
    source,
    /const handleNextNodePullMove = \(event: React\.TouchEvent<HTMLDivElement>\) => \{[\s\S]*isTopicDetailAtBottom/,
    "the pull-up gesture should not be cancelled by mobile safe-area or tabbar bottom distance"
  );
  assert.match(
    source,
    /const detailContentRef = React\.useRef<HTMLDivElement \| null>\(null\);/,
    "desktop detail panel should expose its own scroll container"
  );
  assert.match(
    source,
    /const nextNodePullStartYRef = React\.useRef<number \| null>\(null\);/,
    "the pull gesture should store its starting touch point"
  );
  assert.match(
    source,
    /const nextNodePullDistanceRef = React\.useRef\(0\);/,
    "the release handler should use the latest pull distance without waiting for React state"
  );
  assert.match(
    source,
    /const \[nextNodePullState, setNextNodePullState\] = useState<"idle" \| "pulling" \| "ready" \| "loading">\("idle"\);/,
    "the bottom handoff should expose pulling, ready, and loading states"
  );
  assert.match(
    source,
    /detailContentRef\.current\?\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\);/,
    "loading a new node should reset the scrollable detail panel to the top"
  );
  assert.match(
    source,
    /const nextAutoNode = selectedNode \? getNextTopicLeafNode\(tree, selectedNode\.nodeKey\) : null;/,
    "render and behavior should share the same next-node calculation"
  );
  assert.match(
    source,
    /const handleNextNodePullMove = \(event: React\.TouchEvent<HTMLDivElement>\) =>/,
    "touch move should drive the pull-up transition instead of scroll-only auto navigation"
  );
  assert.match(
    source,
    /if \(pullDistance >= NEXT_NODE_PULL_THRESHOLD\) \{[\s\S]*setNextNodePullState\("ready"\);/,
    "the handoff should show a release-ready state after enough pull distance"
  );
  assert.match(
    source,
    /const enterNextNode = \(\) => \{[\s\S]*if \(!miniProgramTopicDetail \|\| !nextAutoNode[\s\S]*void selectNode\(nextAutoNode, \{ scrollIntoView: true, resetDetailScroll: true, resetTopAfterLoad: true \}\);[\s\S]*\};/,
    "manual click and pull release should share the existing selectNode flow and return to the page top"
  );
  assert.match(
    source,
    /if \(nextNodePullDistanceRef\.current >= NEXT_NODE_PULL_THRESHOLD\) \{[\s\S]*enterNextNode\(\);/,
    "release after the threshold should enter the next node through the shared helper"
  );
  assert.match(
    source,
    /const handleNextNodeClick = \(\) => \{[\s\S]*enterNextNode\(\);[\s\S]*\};/,
    "the next-node card should also support manual click entry"
  );
  assert.match(
    source,
    /\{miniProgramTopicDetail && nextAutoNode && \([\s\S]*className=\{`topic-next-pull-card topic-next-pull-card--\$\{nextNodePullState\}`\}/,
    "mini program users should see an animated pull-up handoff card under the expand button"
  );
  assert.match(
    source,
    /onClick=\{handleNextNodeClick\}/,
    "clicking the visible next-node card should enter the next node"
  );
  assert.match(
    source,
    /title="点击进入下一个知识点"/,
    "the clickable next-node card should expose a clear browser title"
  );
  assert.match(
    source,
    /松开进入下一个知识点/,
    "the ready state should clearly explain the release action"
  );
  assert.match(
    source,
    /\{miniProgramTopicDetail && !nextAutoNode && \([\s\S]*className="topic-next-pull-card topic-next-pull-card--done"/,
    "the last node should still render a visible finished state in mini program instead of looking broken"
  );
  assert.match(
    source,
    /已读完当前话题/,
    "the last-node state should explain why no next node appears"
  );
});

test("topic detail expand button stays centered before icon fonts load", () => {
  assert.match(
    source,
    /miniProgramTopicDetail \? \([\s\S]*className="topic-expand-button-icon"[\s\S]*\) : \([\s\S]*auto_awesome/,
    "mini program should use a fixed-width fallback icon while the normal web detail keeps its existing Material Symbols icon"
  );
  assert.match(
    source,
    /className="topic-expand-button-icon"/,
    "mini program expand button should use a fixed-width icon slot so the label remains centered immediately"
  );
});
