import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const controllerSource = readFileSync(resolve(__dirname, "book.ts"), "utf8");
const routeSource = readFileSync(resolve(__dirname, "../routes/adminBook.ts"), "utf8");
const publicRouteSource = readFileSync(resolve(__dirname, "../routes/book.ts"), "utf8");

test("public book metadata reads the formal metadata table", () => {
  assert.match(controllerSource, /findApprovedBookMetadataByBookId/, "public metadata endpoint should read approved BookMetadata rows");
  assert.match(controllerSource, /listApprovedBookMetadataByBookIds/, "public book list should derive hasMetadataDetail from approved BookMetadata rows");
  assert.match(controllerSource, /function pickPublicBookCover\(bookCover: unknown, metadataCover: unknown\): string/, "public book list should use one cover picker for base and metadata covers");
  assert.match(controllerSource, /value\.includes\("\/uploads\/images\/"\)/, "legacy uploaded covers should not block metadata covers on the public list");
  assert.match(controllerSource, /value\.includes\("placeholder"\)/, "placeholder covers should not block metadata covers on the public list");
  assert.match(controllerSource, /const metadataByBookId = new Map\(metadataRows\.map/, "public book list should index approved metadata by book id");
  assert.match(controllerSource, /metadataCover = normalizeBookCoverUrl\(metadata\?\.cover\)/, "public book list should expose the normalized metadata cover");
  assert.match(controllerSource, /coverImage: pickPublicBookCover\(plain\?\.coverImage, metadataCover\)/, "public book list should prefer metadata cover before stale base covers");
  assert.match(controllerSource, /metadataCover,/, "public book list should return metadataCover for frontend list/detail consistency");
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

test("admin book routes expose metadata review before dynamic book id routes", () => {
  const metadataIndex = routeSource.indexOf('router.get("/metadata"');
  const idIndex = routeSource.indexOf('router.get("/:id"');
  assert.ok(metadataIndex > -1, "admin metadata review route should exist");
  assert.ok(idIndex > -1, "dynamic admin book route should exist");
  assert.ok(metadataIndex < idIndex, "metadata review route must be registered before /:id");
});

test("admin book list exposes editable metadata detail fields", () => {
  assert.match(controllerSource, /function formatAdminBookMetadata\(metadata: any\)/, "admin list should format metadata for edit forms");
  assert.match(controllerSource, /metadataDetail = formatAdminBookMetadata\(metadata\)/, "admin list should attach the formatted metadata detail");
  assert.match(controllerSource, /metadataDetail,/, "admin list response should include metadataDetail");
  assert.match(controllerSource, /description: String\(metadata\?\.description \|\| ""\)/, "metadata detail should include the editable introduction");
  assert.match(controllerSource, /cover: String\(metadata\?\.cover \|\| ""\)/, "metadata detail should include the editable cover url");
  assert.match(controllerSource, /ratingCount: metadata\?\.ratingCount \?\? null/, "metadata detail should include rating count");
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
  assert.match(controllerSource, /current: String\(safeCurrent\)/, "proxy should forward a sanitized current page value");
  assert.match(controllerSource, /size: String\(safeSize\)/, "proxy should forward a sanitized page size value");
  assert.match(controllerSource, /records: records\.map\(normalizeExternalBookLibraryRecord\)/, "proxy should return normalized external records");

  const externalIndex = publicRouteSource.indexOf('router.get("/external"');
  const idIndex = publicRouteSource.indexOf('router.get("/:id"');
  assert.ok(externalIndex > -1, "public external library route should exist");
  assert.ok(idIndex > -1, "dynamic public book route should exist");
  assert.ok(externalIndex < idIndex, "external library route must be registered before /:id");
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
