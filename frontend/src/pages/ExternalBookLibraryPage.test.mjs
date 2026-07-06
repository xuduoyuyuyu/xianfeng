import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "ExternalBookLibraryPage.tsx"), "utf8");
const apiSource = readFileSync(resolve(__dirname, "../services/api.ts"), "utf8");

test("external book library fetches through the public API proxy", () => {
  assert.match(apiSource, /export interface ExternalBookLibraryRecord/, "API types should expose normalized external book records");
  assert.match(apiSource, /export interface ExternalBookLibraryResponse/, "API types should expose the external library page envelope");
  assert.match(apiSource, /getExternalBooks: \(params: \{ current: number; size: number \}\) => api\.get<ExternalBookLibraryResponse>\('\/books\/external', \{ params \}\)/, "public API should request the backend proxy rather than the upstream host directly");
  assert.match(source, /publicApi\.getExternalBooks\(\{ current: page, size: PAGE_SIZE \}\)/, "page should fetch external books with server pagination");
  assert.doesNotMatch(source, /size: 1000|size: 10000|PAGE_SIZE \* pages/, "page should not load extra pages for client-side filtering");
  assert.match(source, /rememberExternalBookLibraryRecords\(nextRecords\)/, "page should cache the current page for related books on detail pages");
  assert.doesNotMatch(source, /api\.shuyu\.xin\/readly/, "frontend page should not call the upstream readly host directly");
});

test("external book library uses the same Jiyue identity as reading", () => {
  assert.match(source, /const PAGE_SIZE = 24;/, "library should use the same card-page density as reading");
  assert.match(source, /xf-books-page/, "library should reuse the reading page visual shell hook");
  assert.match(source, /books-mobile-main/, "library should reuse the reading page main layout hook");
  assert.match(source, /books-mobile-hero/, "library should reuse the reading hero hook");
  assert.match(source, /books-mobile-filter/, "library should reuse reading filter styling hooks");
  assert.match(source, /Reading Shelf/, "hero label should match the reading page");
  assert.match(source, /src="\/assets\/jiyue-hero-logo\.png"/, "hero should use the Jiyue logo");
  assert.match(source, /alt="及阅 · 成长及阅读"/, "hero logo should keep the reading page alt text");
  assert.match(source, /基于节目实践沉淀的书籍清单/, "hero description should match the reading page");
  assert.match(source, /searchPlaceholder="搜索书名、作者、出版社、推荐人"/, "global search placeholder should match reading");
  assert.match(source, /placeholder="搜索书名、作者、出版社、推荐人"/, "hero search placeholder should match reading");
  assert.match(source, /清空筛选/, "hero action should match the reading page filter action");
  assert.doesNotMatch(source, /External Library/, "page should not distinguish itself as an external library");
  assert.doesNotMatch(source, /Library 页面/, "page should not show the old Library explanation");
  assert.doesNotMatch(source, /外部书库/, "page should not show external-library copy");
  assert.doesNotMatch(source, /及阅书库/, "page should use the Jiyue logo instead of the old library title");
  assert.doesNotMatch(source, /回到及阅/, "page should not show a return-to-reading action when it presents as Jiyue");
});

test("external book cards show metadata without linking into reading details", () => {
  assert.match(source, /type ExternalBookCardProps =/, "page should keep book-card rendering local");
  assert.match(source, /item\.coverPic \? \(/, "external cards should show covers when present");
  assert.match(source, /item\.author \? <p/, "external cards should hide missing authors");
  assert.match(source, /item\.publisher \? <p/, "external cards should hide missing publishers");
  assert.match(source, /hasDisplayValue\(item\.isbn\) \? \(/, "external cards should hide missing ISBN");
  assert.match(source, /hasDisplayValue\(item\.pubDate\) \? \(/, "external cards should hide missing publication dates");
  assert.match(source, /hasDisplayValue\(item\.words\) \? \(/, "external cards should hide missing word-count metadata");
  assert.match(source, /hasDisplayValue\(item\.lexile\) \? \(/, "external cards should hide missing Lexile metadata");
  assert.match(source, /hasDisplayValue\(item\.ar\) \? \(/, "external cards should hide missing AR metadata");
  assert.match(source, /难度: \{formatLevelLabel\(item\.levelRange\)\}/, "external cards should show normalized level-range metadata");
  assert.match(source, /虚构: \{formatFictionLabel\(item\.fiction\)\}/, "external cards should show fiction metadata");
  assert.doesNotMatch(source, /\|\| "未标注"/, "external cards should not render missing metadata as 未标注");
  assert.match(source, /item\.description/, "external cards should include description summaries");
  assert.match(source, /rememberExternalBookLibraryRecord\(item\)/, "external cards should cache the clicked record for the second-level detail page");
  assert.match(source, /<Link to=\{`\/library\/\$\{encodeURIComponent\(item\.id\)\}`\}/, "external cards should navigate to /library/:externalId");
  assert.match(source, /查看详情/, "external cards should expose a detail affordance for the second-level page");
  assert.doesNotMatch(source, /to=\{`\/reading\/\$\{item\./, "external cards should not pretend they have local reading detail routes");
});

test("external book cards normalize peanut reading levels", () => {
  assert.match(source, /function formatLevelLabel\(value: string\): string/, "page should centralize level label formatting");
  assert.match(source, /Level \$\{match\[1\]\}/, "花生N级 should be displayed as Level N");
  assert.doesNotMatch(source, /难度: \{item\.levelRange \|\| "未标注"\}/, "cards should not render raw peanut level labels");
});

test("external book library adds reading-style filter chips", () => {
  assert.match(source, /const \[selectedCategories, setSelectedCategories\] = useState<string\[]>\(\(\) => queryTag \? \[queryTag\] : \[\]\);/, "page should track category filters");
  assert.match(source, /const \[selectedLevels, setSelectedLevels\] = useState<string\[]>\(\[\]\);/, "page should track level filters");
  assert.match(source, /const \[selectedFictions, setSelectedFictions\] = useState<string\[]>\(\[\]\);/, "page should track fiction filters");
  assert.match(source, /function toggleFilter/, "page should reuse a small chip toggle helper");
  assert.match(source, /books-filter-chip/, "page should render reading-style filter chips");
  assert.match(source, />标签</, "page should expose tag filters");
  assert.match(source, />难度</, "page should expose level filters");
  assert.match(source, />类型</, "page should expose fiction filters");
  assert.doesNotMatch(source, /筛选后 \{visibleBooks\.length\} 本/, "filter summary should not show a misleading global count");
});

test("external book library keeps current-page filtering visually stable", () => {
  assert.match(source, /const hasActiveFilters = normalizedKeyword\.length > 0 \|\| selectedCategories\.length > 0 \|\| selectedLevels\.length > 0 \|\| selectedFictions\.length > 0;/, "page should know when results are only filtered within the current page");
  assert.match(source, /const displayCategoryOptions = useMemo\(\(\) => uniqueValues\(\[\.\.\.selectedCategories, \.\.\.categoryOptions\]\)/, "selected tag URL values should remain visible as filter chips");
  assert.match(source, /levelOptions\.length > 0 \? \(/, "level filters should render only when the current page has real values");
  assert.match(source, /fictionOptions\.length > 0 \? \(/, "fiction filters should render only when the current page has real values");
  assert.match(source, /!hasActiveFilters && pages > 1 \? \(/, "global pagination should be hidden while current-page filters are active");
  assert.match(source, /className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"/, "filtered cards should use a stable grid instead of masonry columns");
  assert.doesNotMatch(source, /columns-1 gap-4 sm:columns-2/, "filtered cards should not use a masonry column layout");
  assert.doesNotMatch(source, /共 \{formatCount\(total\)\} 本 · 第 \{page\}/, "page should not render the removed total/page summary row");
});

test("external book library hides placeholder metadata values", () => {
  assert.match(source, /function hasDisplayValue\(value: string \| number \| null \| undefined\): boolean/, "page should centralize missing-value checks");
  assert.match(source, /\["none", "null", "undefined", "n\/a", "na", "-"\]\.includes\(normalized\.toLowerCase\(\)\)/, "page should treat NONE-like values as missing");
  assert.match(source, /hasDisplayValue\(item\.isbn\) \? \(/, "ISBN chips should use the placeholder-aware visibility check");
  assert.match(source, /hasDisplayValue\(item\.pubDate\) \? \(/, "publication-date chips should use the placeholder-aware visibility check");
});

test("external book library initializes keyword search from the q URL parameter", () => {
  assert.match(source, /useSearchParams/, "library should read search params for linked metadata searches");
  assert.match(source, /const queryKeyword = String\(searchParams\.get\("q"\) \|\| ""\)\.trim\(\);/, "library should read q from the URL");
  assert.match(source, /const \[keyword, setKeyword\] = useState\(\(\) => queryKeyword\);/, "library should initialize the search box from q");
  assert.match(source, /setKeyword\(queryKeyword\);/, "library should react to q changes after navigation");
});

test("external book library initializes tag filters from the tag URL parameter", () => {
  assert.match(source, /const queryTag = String\(searchParams\.get\("tag"\) \|\| ""\)\.trim\(\);/, "library should read tag from the URL");
  assert.match(source, /const \[selectedCategories, setSelectedCategories\] = useState<string\[]>\(\(\) => queryTag \? \[queryTag\] : \[\]\);/, "library should initialize selected tags from tag");
  assert.match(source, /setSelectedCategories\(queryTag \? \[queryTag\] : \[\]\);/, "library should update selected tags when tag changes");
});
