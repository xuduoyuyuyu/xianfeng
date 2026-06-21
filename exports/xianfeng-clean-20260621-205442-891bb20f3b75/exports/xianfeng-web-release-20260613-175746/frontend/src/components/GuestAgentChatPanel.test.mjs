import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "GuestAgentChatPanel.tsx"), "utf8");

test("guest agent renders program citations as listening recommendation cards", () => {
  assert.match(
    source,
    /ProgramRecommendationCards/,
    "assistant program recommendations should be rendered as real program cards"
  );
  assert.match(
    source,
    /推荐收听/,
    "recommendation cards should be explicitly labeled for listening"
  );
});

test("guest agent recommendation cards only show the program title", () => {
  const recommendationBlock = source.slice(
    source.indexOf("const ProgramRecommendationCards"),
    source.indexOf("const CitationCard")
  );

  assert.doesNotMatch(
    recommendationBlock,
    /program\.locator/,
    "recommendation cards should not render citation subtitles such as 节目摘要"
  );
});

test("guest agent strips inline reference summaries from assistant answers", () => {
  assert.match(
    source,
    /stripInlineCitationSummary/,
    "assistant answers should be cleaned before markdown rendering"
  );
  assert.match(
    source,
    /参考\(\?:来源\|资料\)/,
    "inline reference summary stripping should cover duplicated reference labels"
  );
});

test("guest agent only shows listening recommendations when prompted by context", () => {
  assert.match(
    source,
    /shouldShowProgramRecommendations/,
    "program recommendation cards should be gated by explicit conversation context"
  );
  assert.doesNotMatch(
    source,
    /<ProgramRecommendationCards citations=\{message\.citations\} \/>/,
    "recommendation cards should not render unconditionally for every cited answer"
  );
});

test("guest agent internal program links preserve Xiaowanzi layer mode", () => {
  assert.match(
    source,
    /withXiaowanziLayerParam/,
    "guest agent panel should preserve xw_layer on internal program links"
  );
  assert.match(
    source,
    /to=\{withXiaowanziLayerParam\(program\.href,\s*isXiaowanziEmbeddedLayer\(\)\)\}/,
    "program recommendation cards should keep the Xiaowanzi back button on the next page"
  );
  assert.match(
    source,
    /to=\{withXiaowanziLayerParam\(href,\s*isXiaowanziEmbeddedLayer\(\)\)\}/,
    "citation cards should keep the Xiaowanzi back button on the next page"
  );
});

test("guest agent panel does not render Pro badges", () => {
  assert.doesNotMatch(
    source,
    /function ProBadge|<ProBadge \/>|>Pro<\/span>/,
    "guest agent panel should not show Pro corner badges or inline Pro labels"
  );
});

test("guest agent mobile composer keeps a compact single-line input height", () => {
  assert.match(
    source,
    /className=\{`h-\[52px\] max-h-\[104px\] min-h-\[52px\][^`]*pt-\[14px\][^`]*leading-\[22px\]/s,
    "mobile guest-agent textarea should start as a compact single-line control"
  );
  assert.match(
    source,
    /className=\{`absolute left-\[6px\] top-1\/2 z-10 flex h-10 w-10/s,
    "voice button should shrink with the compact composer"
  );
  assert.match(
    source,
    /className="absolute right-\[5px\] top-1\/2 flex h-\[42px\] w-\[42px\]/,
    "send button should shrink with the compact composer"
  );
});
