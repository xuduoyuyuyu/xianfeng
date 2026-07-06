import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(__dirname, "BookDetailPage.tsx"), "utf8");
const apiSource = readFileSync(resolve(__dirname, "../services/api.ts"), "utf8");
const coverSource = readFileSync(resolve(__dirname, "../utils/bookCover.ts"), "utf8");

test("public api exposes reading metadata fetcher", () => {
  assert.match(apiSource, /export interface BookMetadataDetail \{/, "api layer should define a book metadata detail type");
  assert.match(apiSource, /sourceTitle\?: string;/, "api layer should expose the resolved source program title");
  assert.match(apiSource, /getBookMetadata: \(id: string\) => api\.get<BookMetadataDetail>\(`\/books\/\$\{id\}\/metadata`\)/, "public api should expose the metadata endpoint");
});

test("book detail page loads base book data and optional metadata", () => {
  assert.match(pageSource, /useLocation/, "detail page should read browser path when rendered by the manual router");
  assert.match(pageSource, /getBookIdFromPath\(location\.pathname\)/, "detail page should recover the book id from /reading/:id paths");
  assert.match(pageSource, /publicApi\.getBook\(id\)/, "detail page should load the base public book record");
  assert.match(pageSource, /publicApi\.getBookMetadata\(id\)/, "detail page should request optional metadata for richer content");
  assert.match(pageSource, /publicApi\.getBooks\(\)/, "detail page should fetch the broader book list for bottom related books");
  assert.match(pageSource, /Promise\.allSettled\(\[/, "detail page should load book, metadata, and related-book candidates together");
  assert.match(pageSource, /if \(metadataResult\.status === "fulfilled"\)/, "detail page should keep rendering when metadata is absent");
  assert.match(pageSource, /unwrapBookResponse\(bookResult\.value\)/, "detail page should normalize wrapped and unwrapped book responses before rendering");
  assert.match(pageSource, /Array\.isArray\(second\)/, "detail page should reject list responses as invalid detail records");
  assert.match(pageSource, /Promise\.allSettled\(ids\.map\(\(relatedId\) => publicApi\.getBookMetadata\(relatedId\)\)\)/, "detail page should fetch metadata for related books through the same detail endpoint");
});

test("book detail page renders metadata-rich fields when available", () => {
  assert.match(coverSource, /if \(value\.includes\("via\.placeholder\.com"\)\) return false;/, "cover helper should ignore placeholder cover urls");
  assert.match(coverSource, /if \(value\.includes\("\/uploads\/images\/"\)\) return false;/, "cover helper should treat legacy uploads covers as unavailable");
  assert.match(coverSource, /export function normalizeBookCoverUrl\(url: unknown\): string \{/, "cover helper should normalize reader thumbnail covers before rendering them large");
  assert.match(coverSource, /cdn\\\.weread\\\.qq\\\.com\|rescdn\\\.qqmail\\\.com\|wfqqreader-\\d\+\\\.image\\\.myqcloud\\\.com/, "cover helper should cover the common WeRead and QQ Reader cover hosts");
  assert.ok(coverSource.includes('return value.replace(/\\/(?:s|m|b)_([^/?#]+)(?=([?#]|$))/i, "/t7_$1");'), "reader small-cover urls should upgrade to the larger t7 variant");
  assert.match(coverSource, /export function getPreferredBookCover\(book: BookCoverSource, metadata: BookMetadataCoverSource\): string \{/, "cover helper should centralize usable-cover selection for detail and related books");
  assert.match(coverSource, /const metadataCover = normalizeBookCoverUrl\(metadata\?\.cover\);[\s\S]*if \(metadataCover\) return metadataCover;/, "detail page should prefer normalized metadata cover when it is usable");
  assert.match(pageSource, /const heroImage = book \? getPreferredBookCover\(book, metadata\) : "";/, "detail page hero should reuse the same usable-cover selection logic");
  assert.match(pageSource, /metadata\?\.description/, "detail page should render the long book introduction");
  assert.match(pageSource, /metadata\?\.rating/, "detail page should render the rating score");
  assert.match(pageSource, /metadata\?\.ratingCount/, "detail page should render the rating count");
  assert.match(pageSource, /metadata\?\.ratingLabel/, "detail page should render the rating label");
  assert.match(pageSource, /function formatMetadataRating\(rating: number \| null \| undefined\): string \{/, "detail page should normalize raw metadata rating values before display");
  assert.match(pageSource, /rating >= 100 \? rating \/ 100 : rating/, "WeRead three-digit raw rating values should display as decimal scores");
  assert.match(pageSource, /const formattedRating = formatMetadataRating\(metadata\?\.rating\);/, "detail page should format metadata rating before composing the summary");
  assert.match(pageSource, /const ratingSummary = \[/, "detail page should normalize rating fields into one display string before rendering");
  assert.match(pageSource, /<span className="text-\[#7C3AED\]">评分<\/span>[\s\S]*<span>\{ratingSummary\}<\/span>/, "hero metadata block should render rating inline after publisher");
  assert.match(pageSource, /ratingSourceLabel \|\| relatedReadingChip\?\.to \? \(\s*<div className="mt-auto flex items-end gap-4 pt-6">[\s\S]*数据来源：\{ratingSourceLabel\}/, "hero metadata block should move the rating source into the shared bottom action row");
  assert.match(pageSource, /function getMetadataSourceLabel\(source: string \| undefined\): string \{/, "detail page should map metadata source codes to readable labels");
  assert.match(pageSource, /normalized === "weread_web" \|\| normalized === "weread"/, "detail page should map weread metadata to a readable source label");
  assert.match(pageSource, /metadata\?\.publisher \|\| book\.publisher/, "detail page should fall back to the base publisher");
  assert.match(pageSource, /<div className="mt-4 space-y-2 text-sm font-semibold text-\[#6b5f95\]">[\s\S]*<span className="text-\[#7C3AED\]">作者<\/span>[\s\S]*<span className="text-\[#7C3AED\]">译者<\/span>[\s\S]*<span className="text-\[#7C3AED\]">出版社<\/span>/, "author, translator, and publisher should render as stacked rows with purple labels");
  assert.match(pageSource, /book\.translator \? \(\s*<div className="flex flex-wrap items-baseline gap-1\.5">[\s\S]*<span className="text-\[#7C3AED\]">译者<\/span>/, "translator should sit in its own purple-labeled row beneath the author");
  assert.doesNotMatch(pageSource, /评分：\{metadata\?\.ratingLabel \|\| metadata\?\.rating\}/, "top summary block should no longer render the rating inline");
  assert.doesNotMatch(pageSource, /<div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-\[#6b5f95\]">[\s\S]*作者：[\s\S]*出版社：/, "author and publisher should no longer share the old inline metadata row");
  assert.match(pageSource, /function buildIntroParagraphs\(intro: string\): string\[]/, "detail page should format long intros into readable paragraphs");
  assert.match(pageSource, /const introParagraphs = buildIntroParagraphs\(intro\);/, "detail page should derive intro paragraphs before rendering");
  assert.match(pageSource, /max-w-4xl/, "detail page should constrain intro text width for long-form reading");
  assert.match(pageSource, /max-w-\[300px\][\s\S]*bg-white p-2[\s\S]*sm:max-w-\[360px\]/, "detail cover should reuse the list-page style container instead of a tighter tinted frame");
  assert.match(pageSource, /className="overflow-hidden rounded-\[1\.15rem\] bg-white">[\s\S]*className="block h-auto w-full object-contain"/, "detail cover should clip the image inside a rounded inner frame like the list page");
  assert.match(pageSource, /introParagraphs\.map\(\(paragraph, index\) => \(/, "detail page should render the intro as multiple paragraphs when possible");
  assert.match(pageSource, /text-\[17px\] leading-\[2\.05\] tracking-\[0\.01em\]/, "intro copy should use a more readable long-form rhythm");
});

test("book detail page uses a path-first reading layout", () => {
  assert.match(pageSource, /useNavigate/, "detail page should use router navigation for contextual back behavior");
  assert.match(pageSource, /import \{ isMiniProgramWebView \} from "\.\.\/utils\/mpAuthBridge";/, "detail page should detect mini program web-view mode");
  assert.match(pageSource, /type BookDetailLocationState = \{[\s\S]*fromReadingDetail\?: string;/, "detail page should type the related-detail return state");
  assert.match(pageSource, /const navigate = useNavigate\(\);/, "detail page should initialize router navigation");
  assert.match(pageSource, /const previousReadingDetailPath = locationState\?\.fromReadingDetail \|\| "";/, "detail page should read the previous detail path from location state");
  assert.match(pageSource, /const shouldReturnToPreviousDetail = previousReadingDetailPath\.startsWith\("\/reading\/"\);/, "detail page should only trust reading detail paths as contextual back targets");
  assert.match(pageSource, /const miniProgramWebView = isMiniProgramWebView\(\);/, "detail page should compute mini-program web-view mode before rendering the web back link");
  assert.match(pageSource, /function handleBackClick\(event: React\.MouseEvent<HTMLAnchorElement>\)/, "detail page should intercept the back link when it came from another detail page");
  assert.match(pageSource, /navigate\(-1\);/, "contextual back should use browser history to restore the previous detail page");
  assert.match(pageSource, /\{!miniProgramWebView \? \(\s*<div className="mb-5">[\s\S]*className="xf-web-detail-back /, "top back link should not render inside mini program web-view");
  assert.match(pageSource, /to=\{backLinkTarget\}/, "top back link should use the computed fallback or previous detail target");
  assert.match(pageSource, /onClick=\{handleBackClick\}/, "top back link should wire contextual back handling");
  assert.match(pageSource, /className="xf-web-detail-back /, "top back link should be hideable inside mini program web-view");
  assert.match(pageSource, /!text-\[#7C3AED\][\s\S]*visited:!text-\[#7C3AED\][\s\S]*hover:!text-\[#6D28D9\]/, "return-to-reading link should keep the same purple treatment as worthbuy detail back links");
  assert.match(pageSource, /← 返回/, "top back link should use the shorter label");
  assert.match(pageSource, /buildSourceLine/, "detail page should derive a short source line from the available source fields");
  assert.match(pageSource, /buildSourceReadingHref/, "detail page should derive a link target for the source booklist card");
  assert.doesNotMatch(pageSource, /适合阶段/, "top block should no longer use the old stage badge copy");
  assert.doesNotMatch(pageSource, /来源节目/, "next-step section should no longer render a source-program card");
  assert.match(pageSource, /BOOK INFO/, "detail page should keep an English capsule label for the book information section");
  assert.match(pageSource, /MORE CONTENT/, "detail page should keep an English capsule label above the next-step cards");
  assert.match(pageSource, /buildNextStepChips/, "detail page should still derive next-step entries from available fields");
});

test("book detail page flattens the source area and removes the reading-path card", () => {
  assert.doesNotMatch(pageSource, /<span>来自<\/span>[\s\S]*<Link to=\{sourceLineHref\}/, "top block should no longer render the source-list link inline");
  assert.match(pageSource, /\$\{guest\}推荐/, "top block should fall back to a short guest recommendation line");
  assert.doesNotMatch(pageSource, /<Link to=\{sourceLineHref\} className="font-semibold !text-\[#7C3AED\] visited:!text-\[#7C3AED\] hover:!text-\[#6D28D9\] hover:underline">/, "top block should no longer use the inline source-list link");
  assert.doesNotMatch(pageSource, /这本书为什么会出现在家长先疯/, "top block should no longer render the source explanation card title");
  assert.doesNotMatch(pageSource, /什么时候打开这本书/, "reading path section should no longer exist as a standalone block");
  assert.doesNotMatch(pageSource, /继续读这本书/, "purple continue-reading CTA should be removed");
});

test("book detail page keeps only compact next-step chips under the hero block", () => {
  assert.match(pageSource, /label: "来源书单"/, "next-step section should restore the related source-booklist card");
  assert.match(pageSource, /text: `《\$\{sourceName\}》`/, "source booklist card should use the linked source list title");
  assert.match(pageSource, /const relatedReadingChip = nextStepChips\.find\(\(chip\) => chip\.label === "延伸阅读"\) \|\| null;/, "related reading should be split out from the heavier top cards");
  assert.match(pageSource, /const topNextStepChips = nextStepChips\.filter\(\(chip\) => chip\.label !== "延伸阅读"\);/, "more-content section should exclude the related reading chip");
  assert.doesNotMatch(pageSource, /回看来源线索/, "next-step section should no longer duplicate the source-list entry");
  assert.match(pageSource, /查看\$\{guest\}/, "next-step chips should reduce the guest entry to a short CTA");
  assert.match(pageSource, /label: "推荐阅读"/, "stage should move into the next-step cards");
  assert.match(pageSource, /text: stageLabel/, "stage card should use the grade text directly");
  assert.ok(
    pageSource.indexOf('label: "推荐人"') < pageSource.indexOf('label: "推荐阅读"'),
    "stage card should render after the recommender card"
  );
  assert.match(pageSource, /继续找同类书/, "related reading should stay as a short CTA");
  assert.match(pageSource, /topNextStepChips\.map\(\(chip\) => \(/, "more-content section should render only the non-related cards");
  assert.doesNotMatch(pageSource, /label: "返回书单"/, "next-step section should no longer duplicate the source-list entry");
  assert.match(pageSource, /grid gap-4 md:grid-cols-3/, "next-step section should lay items out as three cards again");
  assert.match(pageSource, /rounded-\[1\.4rem\] border border-\[#ece5fb\] bg-\[#fcfbff\] p-5/, "next-step entries should use the earlier card styling");
  assert.ok(
    pageSource.indexOf("MORE CONTENT") < pageSource.indexOf('id="book-intro"'),
    "next-step section should move above the intro/info block"
  );
  assert.doesNotMatch(pageSource, /继续往下走/, "next-step section should drop the old eyebrow copy");
  assert.doesNotMatch(pageSource, /把阅读线索接回问题现场/, "next-step section should drop the old large heading");
});

test("book detail page treats placeholder card values as missing", () => {
  assert.match(pageSource, /function formatReadableValue\(value: unknown\): string \{/, "detail page should centralize placeholder normalization");
  assert.match(pageSource, /\["none", "null", "undefined", "n\/a", "na", "-"\]\.includes\(normalized\.toLowerCase\(\)\)/, "detail page should treat NONE-like values as missing");
  assert.match(pageSource, /const sourceName = formatReadableValue\(book\.sourceName\);/, "source booklist cards should use normalized source names");
  assert.match(pageSource, /const guest = formatReadableValue\(book\.recommendedGuest\);/, "guest cards should use normalized recommender values");
  assert.match(pageSource, /const stageLabel = formatReadableValue\(book\.grade\);/, "recommended-reading cards should use normalized grade values");
  assert.doesNotMatch(pageSource, /String\(book\.sourceName \|\| ""\)\.trim\(\)/, "source cards should not treat raw placeholder source values as real content");
  assert.doesNotMatch(pageSource, /String\(book\.recommendedGuest \|\| ""\)\.trim\(\)/, "guest cards should not treat raw placeholder recommender values as real content");
  assert.doesNotMatch(pageSource, /String\(book\.grade \|\| ""\)\.trim\(\)/, "stage cards should not treat raw placeholder grade values as real content");
});

test("book detail page hides unavailable path actions instead of rendering empty placeholders", () => {
  assert.match(pageSource, /const hasRating = Boolean\(ratingSummary\);/, "detail page should compute rating visibility from the normalized rating summary");
  assert.match(pageSource, /const ratingSourceLabel = getMetadataSourceLabel\(metadata\?\.source\);/, "detail page should derive a readable rating-source label from metadata");
  assert.match(pageSource, /const sourceGuestId = getSourceGuestId\(book\.sourceGuestId\)/, "detail page should normalize source guest ids");
  assert.match(pageSource, /const sourceLineHref = sourceName \? buildSourceReadingHref\(book, sourceGuestId\) : "";/, "source booklist cards should reuse the resolved source reading link");
  assert.match(pageSource, /sourceGuestId \? `\/experts\/\$\{sourceGuestId\}` : ""/, "guest cards should only link when a guest id exists");
  assert.match(pageSource, /buildNextStepChips\(\s*book,\s*sourceLineHref,\s*guestCardHref,\s*stageLabel\s*\)/, "next-step chip data should derive from source, guest, and grade context");
  assert.match(pageSource, /const topSourceLine = !sourceName && sourceLine \? sourceLine : "";/, "top meta row should only keep a fallback source line when no source list exists");
  assert.match(pageSource, /topSourceLine \? \(/, "top inline meta row should only render when fallback source data exists");
  assert.match(pageSource, /ratingSourceLabel \|\| relatedReadingChip\?\.to \? \(\s*<div className="mt-auto flex items-end gap-4 pt-6">[\s\S]*className="ml-auto inline-flex items-center gap-2 text-\[13px\] font-semibold !text-\[#7C3AED\] visited:!text-\[#7C3AED\] transition hover:!text-\[#6D28D9\]"[\s\S]*继续找同类书[\s\S]*className="inline-flex h-2\.5 w-2\.5 rounded-full bg-\[#7C3AED\] opacity-80 animate-pulse"/, "related reading should share the hero footer row and stay on the far right with a continuously animated dot");
  assert.match(pageSource, /\{intro \? \(/, "intro section should render only when a real intro exists");
  assert.match(pageSource, /<section id="book-intro">/, "intro section should remain as a standalone block below the hero card");
  assert.doesNotMatch(pageSource, /lg:grid-cols-\[minmax\(0,1fr\)_320px\]/, "intro section should no longer reserve a second column for base info");
  assert.doesNotMatch(pageSource, /<aside className=/, "detail page should no longer render a separate base-info aside card");
  assert.match(pageSource, /\{intro \? \(\s*<section id="book-intro">[\s\S]*<article[\s\S]*BOOK INFO/, "long introduction should only render when a real intro exists");
  assert.match(pageSource, /const relatedBookCandidates = useMemo\(\(\) => \{/, "detail page should derive related-book candidates from the broader books list");
  assert.match(pageSource, /const relatedBooks = useMemo\(\(\) => \{/, "detail page should memoize the bottom related-books shelf");
  assert.match(pageSource, /const coverA = Boolean\(getPreferredBookCover\(a, relatedMetadataByBookId\[a\._id\]\)\);/, "related books should sort using the resolved metadata-first cover availability");
  assert.match(pageSource, /if \(coverA !== coverB\) return coverA \? -1 : 1;/, "related books should prioritize items that have a usable cover");
  assert.match(pageSource, /<h2 className="mt-4 text-2xl font-black tracking-tight text-\[#24163a\]">相关图书<\/h2>/, "detail page should render a dedicated related books section at the bottom");
  assert.match(pageSource, /MORE CONTENT[\s\S]*BOOK INFO[\s\S]*RELATED BOOKS/, "section capsule labels should use consistent English wording");
  assert.match(pageSource, /inline-flex rounded-full border border-\[#cfc2ef\] bg-\[#f3eefc\] px-4 py-1 text-\[11px\] font-black uppercase tracking-\[0\.24em\] text-\[#5b3fa1\]/, "section labels should share the related-books capsule style");
  assert.match(pageSource, /const relatedMetaLine = String\(item\.author \|\| item\.publisher \|\| ""\)\.trim\(\);/, "related book cards should display author first, then publisher");
  assert.match(pageSource, /\{relatedMetaLine \? \(/, "related book card metadata should render only when author or publisher exists");
  assert.doesNotMatch(pageSource, /const pubYear = /, "related book cards should not invent a year from non-book publication fields");
  assert.doesNotMatch(pageSource, /\{pubYear\}/, "related book cards should not display a derived year");
  assert.match(pageSource, /const relatedCover = getPreferredBookCover\(item, relatedMetadataByBookId\[item\._id\]\);/, "related book cards should prefer metadata covers over stale list covers");
  assert.doesNotMatch(pageSource, /aria-label="有内容简介"/, "related book cards should no longer use a corner marker for detail availability");
  assert.match(pageSource, /border border-\[#e5e2ec\] bg-\[#f1eff5\][\s\S]*opacity-80 grayscale-\[0\.18\]/, "non-clickable related book cards should use a grayer inactive treatment");
  assert.doesNotMatch(pageSource, />\s*有简介\s*<\/span>/, "related book intro marker should not use visible text");
  assert.match(pageSource, /item\.hasMetadataDetail \? \(\s*<Link[\s\S]*to=\{`\/reading\/\$\{item\._id\}`\}/, "bottom related books should link only when the related book has detail metadata");
  assert.match(pageSource, /state=\{\{ fromReadingDetail: `\$\{location\.pathname\}\$\{location\.search\}` \}\}/, "related book detail links should preserve the current detail page as their return target");
  assert.doesNotMatch(pageSource, /当前只有基础图书信息，详细介绍仍在补充。/, "missing metadata should not render generated placeholder copy");
  assert.doesNotMatch(pageSource, /mt-6 flex flex-col gap-3 sm:flex-row/, "hero block should no longer render the old return button row");
});

test("book detail page uses native mini program chrome spacing when embedded", () => {
  assert.match(
    pageSource,
    /html\.xf-mp-webview \.book-detail-main \{[\s\S]*padding-top: var\(--xf-mp-nav-height, 88px\) !important;[\s\S]*padding-bottom: 0 !important;/,
    "mini program web-view should use the native topbar height and remove web bottom padding"
  );
  assert.match(
    pageSource,
    /<main className="book-detail-main mx-auto max-w-6xl/,
    "book detail main wrapper should expose the mini-program spacing hook"
  );
});
