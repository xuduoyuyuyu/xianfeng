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
  assert.match(source, /\{coverUrl \? \(/, "book card should still render cover images when they exist");
  assert.match(source, /\) : null\}/, "book card should omit the cover area when the cover is missing");
  assert.doesNotMatch(source, /📖/, "book card should not render an emoji placeholder for missing covers");
  assert.doesNotMatch(source, /aspect-\[3\/4\] bg-stone-100/, "book card should not reserve a fake cover placeholder block");
});

test("books page orders detailed cover books before cover-only and text-only books", () => {
  assert.match(source, /import \{ buildBookCoverImageSrc, getPreferredBookCover \} from "\.\.\/utils\/bookCover";/, "books page should share detail-page cover selection helpers");
  assert.match(source, /function getBookListCover\(item: Pick<Book, "coverImage" \| "metadataCover">\): string/, "books page should resolve base and metadata covers through one helper");
  assert.match(source, /return getPreferredBookCover\(item, \{ cover: item\.metadataCover \}\);/, "books page should use metadataCover when the base cover is missing or unusable");
  assert.match(source, /function hasBookCover\(item: Pick<Book, "coverImage" \| "metadataCover">\): boolean/, "books page should have one cover-presence helper");
  assert.match(source, /function getBookDisplayPriority\(item: EnrichedBook\): number/, "books page should calculate display priority from cover and metadata detail");
  assert.match(source, /if \(hasBookCover\(item\) && item\.hasMetadataDetail\) return 3;/, "books with both cover and detail should have the highest priority");
  assert.match(source, /if \(hasBookCover\(item\)\) return 2;/, "books with only cover should be second");
  assert.match(source, /return 1;/, "text-only books should be last");
  assert.match(source, /const priorityDelta = getBookDisplayPriority\(b\) - getBookDisplayPriority\(a\);/, "filtered books should be sorted by the combined detail and cover priority");
  assert.match(source, /Math\.ceil\(coverFirstFiltered\.length \/ PAGE_SIZE\)/, "pagination should be based on the cover-first list");
  assert.match(source, /const sliced = coverFirstFiltered\.slice\(start, end\);/, "paged groups should slice the cover-first list");
  assert.match(source, /return coverFirstFiltered\.slice\(start, start \+ PAGE_SIZE\);/, "desktop visible books should come from the cover-first list");
  assert.match(source, /const coverUrl = getBookListCover\(item\);/, "book cards should resolve the cover once before rendering");
  assert.match(source, /const PRIORITY_COVER_COUNT = 8;/, "the first visible book covers should be prioritized from top to bottom");
  assert.match(source, /const isPriorityCover = imageIndex < PRIORITY_COVER_COUNT;/, "book cards should derive image priority from their visible order");
  assert.match(source, /const coverLoading = isPriorityCover \? "eager" : "lazy";/, "top covers should load eagerly while lower covers stay lazy");
  assert.match(source, /const coverFetchPriority = isPriorityCover \? "high" : "auto";/, "top covers should get a high browser fetch priority");
  assert.match(source, /loading=\{coverLoading\}/, "book cards should use per-card loading priority");
  assert.match(source, /fetchPriority=\{coverFetchPriority\}/, "book cards should use the browser fetchPriority hint");
  assert.match(source, /min-h-\[180px\][\s\S]*sm:min-h-\[220px\]/, "book cards with known covers should reserve image space while covers are loading");
  assert.match(source, /onLoad=\{\(\) => setCoverLoaded\(true\)\}/, "book cards should reveal cover images once the image finishes loading");
  assert.doesNotMatch(source, /&retry=\$\{coverRetry\}/, "book card retries must not append cache-busting query params to proxied image URLs");
  assert.doesNotMatch(source, /window\.setTimeout\(\(\) => \{[\s\S]*setCoverRetry/, "book cards should not retry slow images by creating new uncached URLs");
  assert.doesNotMatch(source, /style\.display = "none"/, "book cards should not permanently hide covers on the first transient load error");
});

test("book cards only link to reading detail pages when metadata exists", () => {
  assert.match(source, /import \{ Link, useSearchParams \} from "react-router-dom";/, "BooksPage should import Link for detail navigation");
  assert.match(source, /item\.hasMetadataDetail \? \(/, "book card should check whether a real detail page exists");
  assert.match(source, /<Link to=\{`\/reading\/\$\{item\._id\}`\} className="block">/, "books with metadata should navigate to /reading/:id");
  assert.match(source, /查看详情/, "books with metadata should show a visible detail marker");
  assert.match(source, /<div className="block">\s*\{cardContent\}\s*<\/div>/s, "books without metadata should render as non-clickable cards");
});

test("books page supports filtering to one named source list from detail links", () => {
  assert.match(source, /const initialSourceName = normalizeText\(searchParams\.get\("sourceName"\)\);/, "books page should read a sourceName param from detail links");
  assert.match(source, /const \[boundSourceName, setBoundSourceName\] = useState\(initialSourceName\);/, "books page should keep sourceName in page state");
  assert.match(source, /if \(boundSourceName\) next\.set\("sourceName", boundSourceName\);/, "books page should preserve sourceName in the URL");
  assert.match(source, /const bySourceName = !boundSourceName \|\| normalizeText\(item\.sourceName\) === boundSourceName;/, "books page should filter the current guest-bound list down to the exact source name");
  assert.match(source, /return bySourceName && byGrade && byTopic && byKeyword;/, "sourceName filtering should compose with the existing filters");
});
