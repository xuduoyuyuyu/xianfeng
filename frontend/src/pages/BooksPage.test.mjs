import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "BooksPage.tsx"), "utf8");

test("book topic filters follow TopicHub collapsed tag rules", () => {
  assert.match(source, /const DESKTOP_VISIBLE_TOPIC_FILTERS = 48;/, "desktop collapsed topic list should match TopicHub's broad tag limit");
  assert.match(source, /const TOPIC_FILTER_COLLAPSED_ROWS = 4;/, "mobile collapsed topic list should be capped by row count");
  assert.match(source, /const MOBILE_VISIBLE_TOPIC_FILTER_FALLBACK = 22;/, "mobile topic list should keep a stable fallback before measurement");
  assert.match(source, /const \[collapsedTopicLimit, setCollapsedTopicLimit\] = useState\(MOBILE_VISIBLE_TOPIC_FILTER_FALLBACK\);/, "topic limit should be recalculated from measured width");
  assert.match(source, /const topicMeasureRef = useRef<HTMLDivElement \| null>\(null\);/, "topic chips should be measured in a hidden same-width row");
  assert.match(source, /rowTops\.length > TOPIC_FILTER_COLLAPSED_ROWS/, "collapsed topic calculation should stop before a fifth row appears");
  assert.match(source, /new ResizeObserver\(calculateCollapsedTopicLimit\)/, "topic limit should update when the container width changes");
  assert.match(source, /data-topic-measure-chip/, "hidden measured chips should use the same labels as visible topic chips");
  assert.match(source, /const maxVisibleTopicFilters = isMobilePager \? collapsedTopicLimit : DESKTOP_VISIBLE_TOPIC_FILTERS;/, "topic limit should switch by measured mobile state");
  assert.match(source, /const visibleTopicOptions = topicExpanded \? topicOptions : topicOptions\.slice\(0, maxVisibleTopicFilters\);/, "collapsed topic chips should render only the visible slice");
  assert.match(source, /visibleTopicOptions\.map\(\(topic\) =>/, "topic filter UI should render the sliced topic list");
  assert.match(source, /\{topicExpanded \? "收起 ▲" : "展开全部 ▼"\}/, "topic filter toggle should use the same copy as TopicHub");
  assert.match(source, /className="mt-2 text-center"/, "topic expand control should sit below the chips like TopicHub");
  assert.match(source, /className="border-0 bg-transparent p-0 text-xs font-semibold text-\[#7C3AED\]"/, "topic expand control should be a small text button, not a capsule chip");
  assert.match(source, /style=\{\{ fontSize: 12 \}\}/, "topic expand control should keep TopicHub's smaller 12px text size on mobile");
  assert.doesNotMatch(source, /className="books-filter-chip[^"]*">\s*\{topicExpanded \? "收起 ▲" : "展开全部 ▼"\}/s, "topic expand control should not use the filter chip capsule styling");
});

test("books without covers render without placeholder artwork", () => {
  assert.match(source, /\{item\.coverImage \? \(/, "book card should still render cover images when they exist");
  assert.match(source, /\) : null\}/, "book card should omit the cover area when the cover is missing");
  assert.doesNotMatch(source, /📖/, "book card should not render an emoji placeholder for missing covers");
  assert.doesNotMatch(source, /aspect-\[3\/4\] bg-stone-100/, "book card should not reserve a fake cover placeholder block");
});

test("books page orders cover images before coverless books", () => {
  assert.match(source, /function hasBookCover\(item: Pick<Book, "coverImage">\): boolean/, "books page should have one cover-presence helper");
  assert.match(source, /const coverFirstFiltered = useMemo\(\(\) => \{[\s\S]*return \[\.\.\.filtered\]\.sort\(\(a, b\) => \{[\s\S]*Number\(hasBookCover\(b\)\) - Number\(hasBookCover\(a\)\)/, "filtered books should be sorted with covered books first");
  assert.match(source, /Math\.ceil\(coverFirstFiltered\.length \/ PAGE_SIZE\)/, "pagination should be based on the cover-first list");
  assert.match(source, /const sliced = coverFirstFiltered\.slice\(start, end\);/, "paged groups should slice the cover-first list");
  assert.match(source, /return coverFirstFiltered\.slice\(start, start \+ PAGE_SIZE\);/, "desktop visible books should come from the cover-first list");
});
