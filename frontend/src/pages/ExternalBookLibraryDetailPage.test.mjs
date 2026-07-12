import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "ExternalBookLibraryDetailPage.tsx"), "utf8");
const apiSource = readFileSync(resolve(__dirname, "../services/api.ts"), "utf8");

test("external library detail page restores a clicked book record by route id", () => {
  assert.match(source, /useParams/, "detail page should read the external id from /library/:externalId");
  assert.match(source, /readExternalBookLibraryRecord\(id\)/, "detail page should restore the clicked list record from session storage");
  assert.match(source, /externalBookFromMiniProgramPayload\(location\.search, id\)/, "mini program webview detail links should pass the clicked record through the URL");
  assert.match(source, /new URLSearchParams\(search\)\.get\("xf_external_book"\)/, "detail page should read the mini program clicked-book payload");
  assert.match(source, /function getExternalBookIdFromSearch\(search: string\): string/, "detail page should recover an explicit mini-program book id query fallback");
  assert.match(source, /getExternalBookIdFromSearch\(location\.search\)/, "detail page should use the short query id when the route id is unavailable");
  assert.match(source, /publicApi\.getExternalBook\(restoreId\)/, "detail page should recover direct mini-program detail entries by route id");
  assert.match(source, /rememberExternalBookLibraryRecord\(miniProgramPayloadBook\)/, "mini program payload records should enter the same detail cache path");
  assert.match(source, /const restoreId = id \|\| miniProgramPayloadBook\?\.id \|\| "";/, "mini program payload should provide a fallback id for recovery");
  assert.match(source, /rememberExternalBookLibraryRecord\(nextBook\)/, "recovered detail records should be cached for related navigation and refreshes");
  assert.match(apiSource, /getExternalBook: \(id: string\) => api\.get<ExternalBookLibraryRecord>\(`\/books\/external\/\$\{encodeURIComponent\(id\)\}`\)/, "public API should expose one external book lookup by id");
  assert.match(source, /decodeURIComponent\(routeId\)/, "detail page should decode the external id from the route");
  assert.match(source, /需要从及阅列表进入/, "direct detail entry without cached data should explain how to recover");
  assert.match(source, /to="\/library"/, "detail page should provide a clear path back to the Jiyue list");
  assert.match(source, /isMiniProgramWebView/, "detail page should detect mini program web-view mode");
  assert.match(source, /\{!miniProgramWebView \? \(\s*<div className="mb-5">[\s\S]*className="xf-web-detail-back /, "top back link should not render inside mini program web-view");
  assert.match(source, /className="xf-web-detail-back /, "detail page back link should be hideable inside mini program web-view");
});

test("external library detail page follows the reading detail information hierarchy", () => {
  assert.match(source, /external-book-detail-page/, "detail page should expose a stable layout hook");
  assert.match(source, /及阅详情/, "detail page should use Jiyue detail copy");
  assert.doesNotMatch(source, /外部书库/, "detail page should not show external-library copy");
  assert.doesNotMatch(source, /外部接口/, "detail page should not explain itself as an external API page");
  assert.match(source, /完整简介/, "detail page should present the full description as the main body content");
  assert.match(source, /图书资料/, "detail page should keep the raw metadata in a later information section");
  assert.match(source, /buildDetailFacts\(book\)/, "detail page should render a structured metadata grid");
});

test("external library detail intro uses the full card width", () => {
  assert.match(source, /className="mt-5 w-full max-w-none space-y-4"/, "intro body should fill the wide detail card");
  assert.doesNotMatch(source, /className="mt-5 max-w-4xl space-y-4"/, "intro body should not leave a large empty right side");
});

test("external library detail page renders related books from the cached list", () => {
  assert.match(source, /readExternalBookLibraryRecords\(\)/, "detail page should read cached list records for related books");
  assert.match(source, /function buildRelatedBooks\(book: ExternalBookLibraryRecord, candidates: ExternalBookLibraryRecord\[]\): ExternalBookLibraryRecord\[]/, "detail page should build related books locally");
  assert.match(source, /const relatedBooks = useMemo\(\(\) => book \? buildRelatedBooks\(book, cachedBooks\) : \[\]/, "detail page should derive related books from the current book");
  assert.match(source, /RELATED BOOKS/, "detail page should mirror the reading detail related-books section");
  assert.match(source, /相关图书/, "detail page should expose a related books section");
  assert.match(source, /同标签或同分类下的其他图书。/, "related books copy should explain the matching rule");
  assert.match(source, /relatedBooks\.map\(\(item\) =>/, "detail page should render related book cards");
  assert.match(source, /to=\{`\/library\/\$\{encodeURIComponent\(item\.id\)\}`\}/, "related book cards should navigate within the library detail route");
  assert.match(source, /rememberExternalBookLibraryRecord\(item\)/, "related book clicks should cache the next detail record");
});

test("external library detail page opens related book navigation at the top", () => {
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\);\s*\}, \[id\]\);/,
    "detail page should reset scroll when navigating between related library books",
  );
});

test("external library detail page treats sparse metadata as a reason to add related books", () => {
  assert.match(source, /const shouldShowRelatedBooks = relatedBooks\.length > 0 && \(facts\.length <= 6 \|\| relatedBooks\.length >= 3\);/, "related books should appear when metadata is sparse");
  assert.match(source, /shouldShowRelatedBooks \? \(/, "related books section should be conditionally rendered");
});

test("external library detail page shows all requested metadata labels", () => {
  for (const label of ["词汇量", "Lexile", "AR", "难度", "是否虚构"]) {
    assert.match(source, new RegExp(label), `detail page should show ${label}`);
  }
  assert.doesNotMatch(source, /\{ label: "标签"/, "detail metadata should not repeat tag/category information");
  assert.match(source, /formatFictionLabel\(book\.fiction\)/, "detail page should normalize fiction metadata");
  assert.match(source, /formatLevelLabel\(book\.levelRange\)/, "detail page should normalize level metadata");
  assert.match(source, /splitValues\(book\.tags \|\| book\.category\)/, "detail page should render tags from tags or category");
});

test("external library detail tags link to tag-filtered library results", () => {
  assert.match(source, /tags\.map\(\(tag\) => \(/, "detail page should render each tag as its own control");
  assert.match(source, /to=\{`\/library\?tag=\$\{encodeURIComponent\(tag\)\}`\}/, "tag chips should navigate to the matching library tag filter");
  assert.doesNotMatch(source, /<span key=\{tag\} className="rounded-full border border-\[#ece5fb\]/, "tag chips should not render as inert spans");
});

test("external library detail metadata links author and publisher to library search", () => {
  assert.match(source, /searchQuery\?: string;/, "detail facts should support optional search links");
  assert.match(source, /\{ label: "作者", value: formatValue\(book\.author\), searchQuery: formatValue\(book\.author\) \}/, "author metadata should link to matching library search");
  assert.match(source, /\{ label: "出版社", value: formatValue\(book\.publisher\), searchQuery: formatValue\(book\.publisher\) \}/, "publisher metadata should link to matching library search");
  assert.match(source, /to=\{`\/library\?q=\$\{encodeURIComponent\(fact\.searchQuery\)\}`\}/, "linked metadata should navigate to the library search results page");
  assert.match(source, /className="mt-1 inline-flex break-words text-sm font-bold leading-6 !text-\[#35264f\] no-underline transition hover:!text-\[#5e17eb\]"/, "linked metadata should keep the same quiet card value style as reading");
  assert.doesNotMatch(source, /underline decoration-\[#c8b8f6\]/, "linked metadata should not use a special purple underline treatment");
});

test("external library detail page hides unmarked metadata fields", () => {
  assert.match(source, /function hasDisplayValue\(value: string \| number \| null \| undefined\): boolean/, "detail page should centralize missing-value checks");
  assert.match(source, /\["none", "null", "undefined", "n\/a", "na", "-"\]\.includes\(normalized\.toLowerCase\(\)\)/, "detail page should treat placeholder values as missing");
  assert.match(source, /\.filter\(\(fact\) => hasDisplayValue\(fact\.value\)\)/, "detail facts should omit missing values");
  assert.match(source, /hasDisplayValue\(book\.author\) \? \(/, "detail hero should hide missing authors");
  assert.match(source, /hasDisplayValue\(book\.publisher\) \? \(/, "detail hero should hide missing publishers");
  assert.match(source, /hasDisplayValue\(book\.isbn\) \? \(/, "detail hero should hide missing ISBN");
  assert.doesNotMatch(source, /未标注/, "detail page should not render missing metadata as 未标注");
});

test("external library detail page renders ISBN and publication date like author rows", () => {
  assert.match(source, /<span className="text-\[#7C3AED\]">ISBN<\/span>/, "ISBN should use the same label style as author");
  assert.match(source, /<span className="text-\[#7C3AED\]">出版时间<\/span>/, "publication date should use the same label style as author");
  assert.match(source, /<span>\{book\.isbn\}<\/span>/, "ISBN value should render separately from its label");
  assert.match(source, /<span>\{book\.pubDate\}<\/span>/, "publication date value should render separately from its label");
  assert.match(
    source,
    /hasDisplayValue\(book\.publisher\)[\s\S]*?hasDisplayValue\(book\.pubDate\)[\s\S]*?hasDisplayValue\(book\.isbn\)/,
    "ISBN should render after publication date in the detail hero",
  );
  assert.doesNotMatch(source, /<span>ISBN：\{book\.isbn\}<\/span>/, "ISBN should not render as inline colon text");
  assert.doesNotMatch(source, /<span>出版时间：\{book\.pubDate\}<\/span>/, "publication date should not render as inline colon text");
});

test("external library detail page normalizes peanut reading levels", () => {
  assert.match(source, /function formatLevelLabel\(value: string\): string/, "detail page should centralize level label formatting");
  assert.match(source, /Level \$\{match\[1\]\}/, "花生N级 should be displayed as Level N");
  assert.match(source, /\{ label: "难度", value: formatLevelLabel\(book\.levelRange\) \}/, "detail facts should use the normalized level label");
  assert.doesNotMatch(source, /难度：\{book\.levelRange \|\| "未标注"\}/, "detail hero should not render raw peanut level labels");
});

test("external library detail page translates intro only for the current view", () => {
  assert.match(apiSource, /translateExternalBookDescription:/, "public API should expose the external-book translation endpoint");
  assert.match(apiSource, /\/books\/external\/\$\{encodeURIComponent\(id\)\}\/description-translation/, "translation endpoint should be keyed by external book id");
  assert.match(source, /publicApi\.translateExternalBookDescription\(book\.id, \{ title: book\.title, description: book\.description \}\)/, "detail page should request translation through the backend cache endpoint");
  assert.match(source, /const \[translatedIntro, setTranslatedIntro\] = useState\(""\);/, "detail page should keep translated text local after the user triggers it");
  assert.match(source, /const \[isIntroTranslated, setIsIntroTranslated\] = useState\(false\);/, "detail page should track whether the translated intro is active");
  assert.match(source, /const displayedIntro = isIntroTranslated && translatedIntro \? translatedIntro : book\?\.description \|\| "";/, "detail page should toggle between original and translated intro");
  assert.match(source, /if \(isIntroTranslated\) \{[\s\S]*?setIsIntroTranslated\(false\);[\s\S]*?return;[\s\S]*?\}/, "clicking the active translation action should return to the original intro");
  assert.match(source, /if \(translatedIntro\) \{[\s\S]*?setIsIntroTranslated\(true\);[\s\S]*?return;[\s\S]*?\}/, "clicking again after a cached translation should not call AI again");
  assert.match(source, /翻译简介/, "detail page should show a user-triggered translation action");
  assert.doesNotMatch(source, /translationCached/, "detail page should not keep a user-visible cached-translation state");
  assert.doesNotMatch(source, /已保存翻译/, "detail page should not show saved-translation copy");
  assert.doesNotMatch(source, /未再次调用 AI/, "detail page should not expose internal AI/cache behavior");
  assert.match(source, /disabled=\{translationLoading \|\| !book\?\.description\}/, "translation action should prevent duplicate clicks while the request is running");
});

test("external library detail translation action is a tiny naked icon button", () => {
  assert.match(source, /className="mt-5 flex justify-end"/, "translation action should sit at the bottom right of the intro card");
  assert.match(source, /aria-label="翻译简介"/, "translation action should expose an accessible label");
  assert.match(source, /const translationButtonClassName = "group inline-flex h-\[22px\] w-\[22px\]/, "translation action should keep a stable 22px click target");
  assert.match(source, /const translationIconClassName = isIntroTranslated[\s\S]*?h-\[20px\] w-\[20px\][\s\S]*?bg-transparent text-\[#6c27d6\][\s\S]*?:[\s\S]*?h-\[20px\] w-\[20px\][\s\S]*?bg-transparent/, "translated and untranslated visible controls should stay the same size without adding an active backplate");
  assert.match(source, /const TRANSLATE_SYMBOL_MASK_URL = "\/assets\/library-translate-symbol-mask\.png";/, "translation action should use the provided 文/A icon mask asset");
  assert.match(source, /WebkitMaskImage: `url\(\$\{TRANSLATE_SYMBOL_MASK_URL\}\)`/, "translation icon should render the provided asset as a currentColor mask");
  assert.doesNotMatch(source, /material-symbols-outlined[\s\S]*?>\s*(g_translate|translate)\s*<\/span>/, "translation action should not use Material Symbols translate glyphs");
  assert.match(source, /@keyframes xf-translate-dot[\s\S]*?translateY\(-4px\) scale\(1\.16\)/, "translation loading dots should use a stronger custom pulse animation");
  assert.match(source, /translationLoading \? \([\s\S]*?inline-flex items-center gap-\[3px\][\s\S]*?external-book-translate-dot[\s\S]*?animationDelay: "-0\.24s"[\s\S]*?animationDelay: "-0\.12s"/, "translation action should animate three staggered loading dots while translating");
  assert.doesNotMatch(source, /more_horiz/, "translation loading state should not use a static more icon");
  assert.match(source, /h-\[22px\] w-\[22px\][\s\S]*?appearance-none[\s\S]*?rounded-full[\s\S]*?border-0[\s\S]*?bg-transparent[\s\S]*?outline-none/, "translation icon button should be a smaller transparent nav-like circular control without default outline");
  assert.match(source, /group-hover:text-\[#6c27d6\]/, "translation icon button should use the public nav purple hover color");
  assert.match(source, /isIntroTranslated\s*\?[\s\S]*?bg-transparent text-\[#6c27d6\][\s\S]*?:[\s\S]*?bg-transparent/, "active translated state should only turn the icon purple without adding a purple backplate");
  assert.doesNotMatch(source, /const translationIconClassName = isIntroTranslated[\s\S]*?\?\s*"[^"]*text-white[^"]*"/, "active translated state should not invert the icon to white");
  assert.match(source, /focus-visible:ring-2 focus-visible:ring-\[#cfc2ef\]/, "translation icon button should use a circular site-colored focus ring instead of a square browser outline");
  assert.match(source, /aria-pressed=\{isIntroTranslated\}/, "translation action should expose active translated state");
  assert.doesNotMatch(source, /h-8 w-8[\s\S]*?bg-\[#f7f3ff\]/, "translation icon button should not keep the previous filled circle background");
  assert.doesNotMatch(source, /h-7 w-7/, "translation icon button should be 20 percent smaller than the previous 28px control");
  assert.doesNotMatch(source, /animate-bounce/, "translation loading state should not use the weaker default bounce animation");
  assert.doesNotMatch(source, /title="翻译"/, "translation action should not show native hover copy");
  assert.doesNotMatch(source, /bottom-full right-0 mb-2/, "translation action should not render a custom hover tooltip");
  assert.match(source, /onClick=\{handleTranslateIntro\}/, "translation action should still translate the intro when clicked");
  assert.doesNotMatch(source, />翻译简介<\/button>/, "translation action should not render visible text inside the button");
});
