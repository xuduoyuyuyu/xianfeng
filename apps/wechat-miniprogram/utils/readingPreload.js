const { DEFAULT_WEB_ORIGIN } = require("./config");
const { request } = require("./request");
const { buildPersonalizationQuery } = require("./profileOnboarding");

const BOOK_CACHE_KEY = "xf_native_books_cache_v6";
const NATIVE_BOOKS_FIRST_PAGE_CACHE_KEY = "xf_native_books_first_page_v3";
const EXTERNAL_BOOK_LIBRARY_FIRST_PAGE_CACHE_KEY = "xf_external_book_library:first_page_v1";
const READING_PAGE_SIZE = 24;

let nativeBooksPreloadPromise = null;
let nativeBooksFirstPagePreloadPromise = null;
let externalLibraryPreloadPromise = null;

function appendProfileQuery(url) {
  const profileQuery = buildPersonalizationQuery();
  return profileQuery ? `${url}${url.includes("?") ? "&" : "?"}${profileQuery}` : url;
}

function cacheValue(key, value) {
  try {
    if (wx.setStorageSync && value) wx.setStorageSync(key, value);
  } catch (_error) {}
}

function firstText(values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function cleanDescription(value) {
  return String(value || "")
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\n*\s*点击链接进入\s*[:：][\s\S]*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isGeneratedBookListDescription(value) {
  const text = cleanDescription(value);
  return /^收录于「/.test(text) || /^分类：/.test(text) || /^来自《.+》的推荐书目$/.test(text);
}

function firstRealDescription(book) {
  const description = firstText([book && book.description, book && book.contentIntro, book && book.summary]);
  return isGeneratedBookListDescription(description) ? "" : description;
}

function getBookId(book) {
  return String((book && (book.id || book._id)) || "").trim();
}

function mergeCachedNativeDescriptions(records) {
  if (!Array.isArray(records) || !records.length) return records;
  try {
    if (!wx.getStorageSync) return records;
    const cached = wx.getStorageSync(BOOK_CACHE_KEY);
    if (!Array.isArray(cached) || !cached.length) return records;
    const descriptions = new Map();
    for (const book of cached) {
      const id = getBookId(book);
      const description = firstRealDescription(book);
      if (id && description && !(book && book.descriptionIsFallback)) descriptions.set(id, description);
    }
    if (!descriptions.size) return records;
    return records.map((book) => {
      const id = getBookId(book);
      if (!id || (firstRealDescription(book) && book && book.hasListDescription && !book.descriptionIsFallback) || !descriptions.has(id)) return book;
      return { ...book, description: descriptions.get(id), hasListDescription: true, descriptionIsFallback: false };
    });
  } catch (_error) {
    return records;
  }
}

function preloadNativeReadingBooks() {
  if (nativeBooksPreloadPromise) return nativeBooksPreloadPromise;
  nativeBooksPreloadPromise = request({ url: appendProfileQuery("/api/books") })
    .then((response) => {
      const mergedResponse = mergeCachedNativeDescriptions(response);
      if (Array.isArray(mergedResponse) && mergedResponse.length) cacheValue(BOOK_CACHE_KEY, mergedResponse);
      return mergedResponse;
    })
    .catch(() => null)
    .finally(() => {
      nativeBooksPreloadPromise = null;
    });
  return nativeBooksPreloadPromise;
}

function normalizeNativePageResponse(response, current = 1) {
  const safeCurrent = Math.max(1, Number(current) || 1);
  const offset = (safeCurrent - 1) * READING_PAGE_SIZE;
  const records = Array.isArray(response && response.records)
    ? response.records
    : Array.isArray(response && response.data)
      ? response.data
      : Array.isArray(response)
        ? response.slice(offset, offset + READING_PAGE_SIZE)
        : [];
  const mergedRecords = mergeCachedNativeDescriptions(records);
  const total = Number(response && response.total) || (Array.isArray(response) ? response.length : 0);
  const pages = Number(response && response.pages);
  return {
    records: mergedRecords,
    total: Number.isFinite(total) ? total : mergedRecords.length,
    current: safeCurrent,
    pages: Number.isFinite(pages) ? Math.max(1, pages) : Math.max(1, Math.ceil(Math.max(total, mergedRecords.length) / READING_PAGE_SIZE)),
    size: READING_PAGE_SIZE
  };
}

function preloadNativeReadingFirstPage() {
  if (nativeBooksFirstPagePreloadPromise) return nativeBooksFirstPagePreloadPromise;
  nativeBooksFirstPagePreloadPromise = request({ url: appendProfileQuery(`/api/books?current=1&size=${READING_PAGE_SIZE}`) })
    .then((response) => {
      const cache = normalizeNativePageResponse(response, 1);
      cache.profile = buildPersonalizationQuery();
      if (cache.records.length) cacheValue(NATIVE_BOOKS_FIRST_PAGE_CACHE_KEY, cache);
      return cache;
    })
    .catch(() => null)
    .finally(() => {
      nativeBooksFirstPagePreloadPromise = null;
    });
  return nativeBooksFirstPagePreloadPromise;
}

function loadNativeReadingPage(current) {
  const safeCurrent = Math.max(1, Number(current) || 1);
  if (safeCurrent === 1) return preloadNativeReadingFirstPage();
  return request({ url: appendProfileQuery(`/api/books?current=${safeCurrent}&size=${READING_PAGE_SIZE}`) })
    .then((response) => normalizeNativePageResponse(response, safeCurrent));
}

function preloadExternalReadingLibrary() {
  if (externalLibraryPreloadPromise) return externalLibraryPreloadPromise;
  externalLibraryPreloadPromise = request({
    url: `${DEFAULT_WEB_ORIGIN}/api/books/external?current=1&size=${READING_PAGE_SIZE}`
  })
    .then((response) => {
      const records = Array.isArray(response && response.records) ? response.records : [];
      if (records.length) cacheValue(EXTERNAL_BOOK_LIBRARY_FIRST_PAGE_CACHE_KEY, response);
      return response;
    })
    .catch(() => null)
    .finally(() => {
      externalLibraryPreloadPromise = null;
    });
  return externalLibraryPreloadPromise;
}

function preloadReadingLandingData() {
  return Promise.allSettled([
    preloadNativeReadingFirstPage(),
    preloadExternalReadingLibrary()
  ]);
}

function clearReadingProfileCaches() {
  nativeBooksPreloadPromise = null;
  nativeBooksFirstPagePreloadPromise = null;
  wx.removeStorageSync(BOOK_CACHE_KEY);
  wx.removeStorageSync(NATIVE_BOOKS_FIRST_PAGE_CACHE_KEY);
}

module.exports = {
  preloadNativeReadingBooks,
  preloadNativeReadingFirstPage,
  loadNativeReadingPage,
  preloadExternalReadingLibrary,
  preloadReadingLandingData,
  clearReadingProfileCaches
};
