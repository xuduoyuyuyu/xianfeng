import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const controllerSource = readFileSync(resolve(__dirname, "book.ts"), "utf8");
const metadataServiceSource = readFileSync(resolve(__dirname, "../services/bookMetadataService.ts"), "utf8");
const routeSource = readFileSync(resolve(__dirname, "../routes/adminBook.ts"), "utf8");
const publicRouteSource = readFileSync(resolve(__dirname, "../routes/book.ts"), "utf8");
const modelSource = readFileSync(resolve(__dirname, "../models/Book.ts"), "utf8");

test("public book metadata reads the formal metadata table", () => {
  assert.match(controllerSource, /findApprovedBookMetadataByBookId/, "public metadata endpoint should read approved BookMetadata rows");
  assert.match(controllerSource, /listApprovedBookMetadataByBookIds/, "public book list should derive hasMetadataDetail from approved BookMetadata rows");
  assert.match(controllerSource, /function pickPublicBookCover\(bookCover: unknown, metadataCover: unknown\): string/, "public book list should use one cover picker for base and metadata covers");
  assert.doesNotMatch(controllerSource, /value\.includes\("\/uploads\/images\/"\)/, "admin-uploaded covers should remain visible on the public list");
  assert.match(controllerSource, /value\.includes\("placeholder"\)/, "placeholder covers should not block metadata covers on the public list");
  assert.match(controllerSource, /const metadataByBookId = new Map\(metadataRows\.map/, "public book list should index approved metadata by book id");
  assert.match(controllerSource, /metadataCover = normalizeBookCoverUrl\(metadata\?\.cover\)/, "public book list should expose the normalized metadata cover");
  assert.match(controllerSource, /coverImage: pickPublicBookCover\(plain\?\.coverImage, metadataCover\)/, "public book list should prefer metadata cover before stale base covers");
  assert.match(controllerSource, /description: String\(metadata\?\.description \|\| plain\?\.description \|\| ""\)/, "public book list should expose approved metadata descriptions for native reading cards");
  assert.match(controllerSource, /metadataCover,/, "public book list should return metadataCover for frontend list/detail consistency");
  assert.match(controllerSource, /const paged = Boolean\(req\.query\.current \|\| req\.query\.size\);/, "public book list should support opt-in pagination for mini-program first-page preload");
  assert.match(modelSource, /description: \{ type: String, default: "", trim: true \}/, "base book records should persist imported list descriptions");
  assert.match(metadataServiceSource, /export async function listApprovedBookMetadataBookIds\(\)/, "paged book loading should be able to identify approved metadata descriptions");
  assert.match(metadataServiceSource, /distinct\("bookId", \{ description: \{ \$regex: \/\\S\/ \} \}\)/, "metadata priority ids should include every metadata row with an introduction");
  assert.match(controllerSource, /async function findPagedPublicBooksPrioritizingDescriptions\(current: number, size: number\)/, "paged public books should keep every described book first");
  assert.match(
    controllerSource,
    /const describedBookFilter = \{[\s\S]*_id: \{ \$in: approvedBookIds \}[\s\S]*description: \{ \$regex: \/\\S\/ \}[\s\S]*\};/,
    "paged public books should treat approved metadata or a non-blank base description as described"
  );
  assert.match(controllerSource, /const undescribedBookFilter = \{ \$nor: describedBookFilter\.\$or \};/, "undescribed pagination should invert the shared description predicate");
  assert.match(
    controllerSource,
    /countDocuments\(\{ \.\.\.publishedFilter, \.\.\.describedBookFilter \}\)[\s\S]*Book\.find\(\{ \.\.\.publishedFilter, \.\.\.describedBookFilter \}\)[\s\S]*Book\.find\(\{ \.\.\.publishedFilter, \.\.\.undescribedBookFilter \}\)/,
    "counting and both page segments should use the same global description partition"
  );
  assert.match(controllerSource, /const page = paged \? await findPagedPublicBooksPrioritizingDescriptions\(current, size\) : null;/, "public first-page loading should use description-priority pagination");
  assert.match(controllerSource, /records: enrichedBooks,[\s\S]*total,[\s\S]*current,[\s\S]*pages:/, "paged public book list should return records and totals for native first-page cache");
  assert.match(controllerSource, /res\.status\(200\)\.json\(enrichedBooks\);/, "unpaged public book list should keep the legacy array response for existing clients");
  assert.match(controllerSource, /const metadata = await findApprovedBookMetadataByBookId\(String\(\(book as any\)\._id \|\| ""\)\);|const metadata = await findApprovedBookMetadataByBookId\(String\(plain\?\._id \|\| ""\)\);/, "public book detail should read approved metadata before returning a book");
  assert.match(controllerSource, /hasMetadataDetail: Boolean\(metadata\)/, "public book detail should expose whether approved metadata exists");
  assert.match(controllerSource, /const book = await Book\.findOne\(\{ \.\.\.idQuery\(id\), status: "published" \}\)\.lean\(\);|const book = await Book\.findOne\(\{ _id: id, status: "published" \}\);/, "public book detail should query books through mongoose so ObjectId ids stay readable online");
  assert.match(controllerSource, /const book = await Book\.findOne\(\{ \.\.\.idQuery\(id\), status: "published" \}\)\s*\.select\(\{ _id: 1, title: 1, author: 1, publisher: 1 \}\)\s*\.lean\(\);|const book = await Book\.findOne\(\{ _id: id, status: "published" \}\)\.select\(\{ _id: 1, title: 1, author: 1, publisher: 1 \}\);/, "public metadata endpoint should resolve published books through mongoose before loading metadata");
  assert.doesNotMatch(controllerSource, /collection\.conn\?\.db\?\.collection\?\.\("books"\)|const doc = await col\.findOne\(/, "public reading detail endpoints must not query books by raw string _id from the native collection");
  assert.match(controllerSource, /import Program from "\.\.\/models\/Program";/, "public metadata endpoint should be able to resolve source program titles");
  assert.match(controllerSource, /sourceTitle: "",/, "public metadata response should initialize a sourceTitle field");
  assert.match(controllerSource, /const sourceProgram = metadata\?\.sourceId && mongoose\.Types\.ObjectId\.isValid\(String\(metadata\.sourceId\)\)/, "public metadata endpoint should check whether sourceId points at a local program");
  assert.match(controllerSource, /await Program\.findById\(String\(metadata\.sourceId\), \{ title: 1 \}\)\.lean\(\)/, "public metadata endpoint should load the source program title");
  assert.match(controllerSource, /sourceTitle = String\(\(sourceProgram as any\)\?\.title \|\| ""\);/, "public metadata endpoint should expose the resolved program title");
  assert.doesNotMatch(controllerSource, /findHighConfidenceBookMetadataForBook|loadHighConfidenceBookMetadata/, "public endpoints should not read tmp high confidence files");
});

test("admin book routes expose metadata upsert before dynamic book id routes", () => {
  const metadataIndex = routeSource.indexOf('router.put("/:id/metadata"');
  const idIndex = routeSource.indexOf('router.get("/:id"');
  assert.ok(metadataIndex > -1, "admin metadata upsert route should exist");
  assert.ok(idIndex > -1, "dynamic admin book route should exist");
  assert.ok(metadataIndex < idIndex, "metadata upsert route must be registered before /:id");
  assert.doesNotMatch(routeSource, /router\.get\("\/metadata"/, "admin metadata review route should be removed");
  assert.doesNotMatch(routeSource, /router\.patch\("\/metadata\/:metadataId"/, "admin metadata review action should be removed");
});

test("admin book list exposes editable metadata detail fields", () => {
  assert.match(controllerSource, /function formatAdminBookMetadata\(metadata: any\)/, "admin list should format metadata for edit forms");
  assert.match(controllerSource, /metadataDetail = formatAdminBookMetadata\(metadata\)/, "admin list should attach the formatted metadata detail");
  assert.match(controllerSource, /metadataDetail,/, "admin list response should include metadataDetail");
  assert.match(controllerSource, /description: String\(metadata\?\.description \|\| ""\)/, "metadata detail should include the editable introduction");
  assert.match(controllerSource, /cover: String\(metadata\?\.cover \|\| ""\)/, "metadata detail should include the editable cover url");
  assert.match(controllerSource, /ratingCount: metadata\?\.ratingCount \?\? null/, "metadata detail should include rating count");
});

test("external book library default pages avoid full-cache blocking and only sort the current page", () => {
  assert.match(controllerSource, /function hasRealExternalBookCover\(record: any\): boolean/, "external library should centralize real-cover detection");
  assert.match(controllerSource, /value\.includes\("via\.placeholder\.com"\)/, "external library should treat placeholder URLs as no cover");
  assert.match(controllerSource, /function sortExternalBookLibraryRecordsForDisplay\(records: any\[\]\): any\[\]/, "external library should centralize display sorting");
  assert.match(controllerSource, /if \(hasRealExternalBookCover\(record\)\) score \+= 8;/, "real covers should outrank default logo fallback cards");
  assert.match(controllerSource, /const page = await fetchExternalBookLibraryPage\(current, size\);[\s\S]*records: sortExternalBookLibraryRecordsForDisplay\(page\.records\)/, "unfiltered external library pages should fetch only the requested upstream page before sorting");
  const defaultBranchStart = controllerSource.indexOf("if (!tags.length && !normalizedKeyword)");
  const keywordBranchStart = controllerSource.indexOf("if (!tags.length && normalizedKeyword)");
  assert.ok(defaultBranchStart > -1 && keywordBranchStart > defaultBranchStart, "default external branch should be explicit");
  const defaultBranchSource = controllerSource.slice(defaultBranchStart, keywordBranchStart);
  assert.doesNotMatch(defaultBranchSource, /fetchExternalBookLibraryFilterRecords\(\)/, "default external pages must not wait for the full external cache before first paint");
});

test("admin can manually create metadata for a book without an existing detail row", () => {
  assert.match(metadataServiceSource, /export async function upsertBookMetadataManually\(/, "metadata service should expose a manual upsert path");
  assert.match(metadataServiceSource, /BookMetadataModel\.findOneAndUpdate\([\s\S]*\{ bookId: new mongoose\.Types\.ObjectId\(bookId\) \}[\s\S]*upsert: true/, "manual metadata should upsert by book id");
  assert.match(controllerSource, /async upsertMetadataAdmin\(req: Request, res: Response\): Promise<void>/, "admin controller should expose manual metadata creation");
  assert.match(controllerSource, /const existing = await Book\.findOne\(idQuery\(id\)\)/, "manual metadata creation should reject unknown books");
  assert.match(routeSource, /router\.put\("\/:id\/metadata", bookController\.upsertMetadataAdmin\);/, "admin routes should expose the book metadata upsert endpoint");

  const upsertIndex = routeSource.indexOf('router.put("/:id/metadata"');
  const dynamicBookIndex = routeSource.indexOf('router.get("/:id"');
  assert.ok(upsertIndex > -1 && upsertIndex < dynamicBookIndex, "metadata upsert route should stay before dynamic book routes");
});

test("admin book payload preserves the manual purchase jump link", () => {
  const modelSource = readFileSync(resolve(__dirname, "../models/Book.ts"), "utf8");

  assert.match(modelSource, /wxPurchaseLink\?: string;/, "book documents should expose the purchase jump link");
  assert.match(modelSource, /wxPurchaseLink: \{ type: String, default: "", trim: true \}/, "book schema should persist a trimmed purchase jump link");
  assert.match(controllerSource, /wxPurchaseLink: pick\(raw, \["wxPurchaseLink", "purchaseLink", "wxMiniProgramLink", "miniProgramLink"\]\)/, "admin normalization should accept purchase jump link aliases");
});

test("book cover proxy keeps fetched covers cached for repeated reading visits", () => {
  assert.match(controllerSource, /const BOOK_COVER_PROXY_CACHE_TTL_MS = 1000 \* 60 \* 60 \* 24;/, "cover proxy should keep a one-day in-memory cache");
  assert.match(controllerSource, /const BOOK_COVER_PROXY_CACHE_MAX_BYTES = 80 \* 1024 \* 1024;/, "cover proxy should cap in-memory image cache size");
  assert.match(controllerSource, /const bookCoverProxyCache = new Map<string, BookCoverProxyCacheEntry>\(\);/, "cover proxy should cache entries by normalized image URL");
  assert.match(controllerSource, /const cached = getCachedBookCoverProxyResponse\(url\);/, "cover proxy should check memory cache before fetching upstream");
  assert.match(controllerSource, /setBookCoverProxyCacheHeaders\(res, cached\.contentType, true\);/, "cache hits should be marked in response headers");
  assert.match(controllerSource, /storeBookCoverProxyResponse\(url, contentType, buf\);/, "fresh upstream cover responses should be stored for reuse");
  assert.match(controllerSource, /stale-while-revalidate=86400/, "cover proxy should let browsers reuse recently loaded covers");
  assert.match(controllerSource, /X-Book-Cover-Proxy-Cache/, "cover proxy should expose whether an image came from local memory cache");
});

test("public books expose a read-only external library proxy before dynamic routes", () => {
  assert.match(controllerSource, /const READLY_BOOK_PAGE_URL = "https:\/\/api\.shuyu\.xin\/readly\/api\/ma\/book\/page";/, "controller should keep the upstream readly page URL in one constant");
  assert.match(controllerSource, /type ExternalBookLibraryRecord =/, "controller should define the external book record shape");
  assert.match(controllerSource, /function normalizeExternalBookLibraryRecord\(record: any\): ExternalBookLibraryRecord/, "controller should normalize upstream records before returning them");
  assert.match(controllerSource, /async getExternalLibraryPublic\(req: Request, res: Response\): Promise<void>/, "controller should expose a public external library handler");
  assert.match(controllerSource, /async getExternalBookPublic\(req: Request, res: Response\): Promise<void>/, "controller should expose a public external book detail lookup");
  assert.match(controllerSource, /findExternalBookLibraryRecordById\(externalBookId\)/, "external detail lookup should recover a record by route id");
  assert.match(controllerSource, /current: String\(safeCurrent\)/, "proxy should forward a sanitized current page value");
  assert.match(controllerSource, /size: String\(safeSize\)/, "proxy should forward a sanitized page size value");
  assert.match(controllerSource, /parseExternalBookFilterTags\(req\.query\.tags\)/, "proxy should accept tag filters without requiring the mini program to fetch all records");
  assert.match(controllerSource, /parseExternalBookKeyword\(req\.query\.q \|\| req\.query\.keyword\)/, "proxy should accept keyword searches for the external library");
  assert.match(controllerSource, /String\(req\.query\.includeFilters \|\| ""\) === "1"/, "proxy should compute full filter options only when requested");
  assert.match(controllerSource, /fetchExternalBookLibraryFilteredPage\(Number\(query\.current\), Number\(query\.size\), filterTags, filterTagMode, keyword\)/, "proxy should return a filtered page with the matched total");
  assert.match(controllerSource, /externalBookRecordMatchesKeyword\(record, normalizedKeyword\)/, "external keyword searches should run against the full external snapshot instead of the first page");
  assert.match(controllerSource, /upstreamUrl\.searchParams\.set\("category", query\.category\)/, "proxy should translate category-like filter tags to the upstream category parameter");
  assert.match(controllerSource, /upstreamUrl\.searchParams\.set\("tags", query\.tags\)/, "proxy should translate booklist-like filter tags to the upstream tags parameter");
  assert.match(controllerSource, /upstreamUrl\.searchParams\.set\("title", query\.title\)/, "proxy should use the upstream title search instead of scanning the full external library for plain keywords");
  assert.match(controllerSource, /fetchExternalBookLibraryTagPage\(current, size, tags\[0\]\)/, "single-tag filtering should retry upstream tags when category matching is empty");
  assert.match(controllerSource, /findExternalBookLibraryBestCategory\(tags\)/, "multi-tag filtering should choose the smallest upstream category candidate before local matching");
  assert.match(controllerSource, /fetchExternalBookLibraryCategoryRecords\(bestCategory\.tag\)/, "multi-tag filtering should scan only the chosen category candidate set");
  assert.match(controllerSource, /EXTERNAL_BOOK_LIBRARY_FILTER_CACHE_TTL_MS = 1000 \* 60 \* 60 \* 24/, "filtered counts should reuse a backend cache");
  assert.match(controllerSource, /count: countExternalBookFilterMatches\(records, label\)/, "external filter options should expose matched book counts");
  assert.match(controllerSource, /if \(text === "漫画"\) return "Manga";/, "external filter labels should normalize the Chinese comic label to Manga");
  assert.match(controllerSource, /\.filter\(\(option\) => option\.count > 100\)/, "external filter options should hide labels that match one hundred or fewer books");
  assert.match(controllerSource, /const countDiff = b\.count - a\.count;/, "external filter options should be ordered by useful match volume instead of alphabetically");
  assert.match(controllerSource, /parseExternalBookFilterMatchMode\(req\.query\.tagMode\)/, "external multi-tag filters should accept an explicit merge mode");
  assert.match(controllerSource, /externalBookRecordMatchesTags\(record, tags, mode\)/, "external multi-tag filters should be able to merge results instead of intersecting them");
  assert.match(controllerSource, /\.\.\.splitExternalBookValues\(pick\(record, \["author"\]\)\)/, "external detail author clicks should match the current book in external filters");
  assert.match(controllerSource, /\.\.\.splitExternalBookValues\(pick\(record, \["publisher"\]\)\)/, "external detail publisher clicks should match the current book in external filters");
  assert.match(controllerSource, /\.\.\.splitExternalBookValues\(pick\(record, \["series"\]\)\)/, "external detail series clicks should match the current book in external filters");
  assert.match(controllerSource, /buildExternalBookLibraryFilterGroups\(filterRecords\)/, "proxy should return filter options from the full external API snapshot");
  assert.match(controllerSource, /externalBookRecordMatchesTags\(record, tags, mode\)/, "filtered pages should match normalized external tag values");
  assert.match(controllerSource, /records: records\.map\(normalizeExternalBookLibraryRecord\)/, "proxy should return normalized external records");
  assert.match(controllerSource, /description: pick\(record, \["description", "intro", "summary", "contentIntro", "abstract", "简介", "图书简介", "内容简介"\]\)/, "external records should expose real list descriptions from known upstream field names");

  const externalIndex = publicRouteSource.indexOf('router.get("/external"');
  const externalDetailIndex = publicRouteSource.indexOf('router.get("/external/:id"');
  const idIndex = publicRouteSource.indexOf('router.get("/:id"');
  assert.ok(externalIndex > -1, "public external library route should exist");
  assert.ok(externalDetailIndex > -1, "public external book detail route should exist");
  assert.ok(idIndex > -1, "dynamic public book route should exist");
  assert.ok(externalIndex < idIndex, "external library route must be registered before /:id");
  assert.ok(externalDetailIndex < idIndex, "external detail route must be registered before /:id");
});

test("public external book translation route is cached before dynamic routes", () => {
  assert.match(controllerSource, /getExternalBookDescriptionTranslationPublic/, "controller should expose a public translation handler");
  assert.match(controllerSource, /getOrCreateExternalBookDescriptionTranslation/, "controller should persist and reuse translated descriptions");
  assert.match(publicRouteSource, /router\.post\("\/external\/:id\/description-translation"/, "public books should expose a translation trigger for external book descriptions");

  const translationIndex = publicRouteSource.indexOf('router.post("/external/:id/description-translation"');
  const idIndex = publicRouteSource.indexOf('router.get("/:id"');
  assert.ok(translationIndex > -1, "external translation route should exist");
  assert.ok(idIndex > -1, "dynamic public book route should exist");
  assert.ok(translationIndex < idIndex, "external translation route must be registered before /:id");
});
