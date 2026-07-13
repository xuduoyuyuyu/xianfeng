const { DEFAULT_WEB_ORIGIN, WEB_ROUTES } = require("../../utils/config");
const { request } = require("../../utils/request");
const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { setSelectedTab } = require("../../utils/tabbar");
const { goProgramsHome: navigateProgramsHome, openNativeSearch } = require("../../utils/nativePageNav");
const { openWeb } = require("../../utils/webview");
const { SETTINGS_SECTIONS, createNativeSettingsMethods, setSettingsTabbarHidden } = require("../../utils/nativeSettings");
const { getInitialSearchPrompt, startSearchPromptRotation, stopSearchPromptRotation } = require("../../utils/searchPrompts");
const { createFilterDrawerMethods } = require("../../utils/filterDrawer");
const { preloadNativeReadingBooks, preloadNativeReadingFirstPage, loadNativeReadingPage, preloadExternalReadingLibrary } = require("../../utils/readingPreload");

const BOOK_CACHE_KEY = "xf_native_books_cache_v6";
const NATIVE_BOOKS_FIRST_PAGE_CACHE_KEY = "xf_native_books_first_page_v3";
const BOOK_DETAIL_CACHE_PREFIX = "xf_native_book_detail:";
const EXTERNAL_BOOK_DETAIL_CACHE_PREFIX = "xf_external_book_detail:";
const EXTERNAL_BOOK_LIBRARY_RECORDS_KEY = "xf_external_book_library:records";
const EXTERNAL_BOOK_LIBRARY_FIRST_PAGE_CACHE_KEY = "xf_external_book_library:first_page_v1";
const READING_PENDING_FILTER_KEY = "xf_reading_pending_filter_v1";
const READING_SOURCE_KEY = "xf_native_books_source_v1";
const BOOK_VIEW_MODE_KEY = "xf_native_books_view_mode";
const BOOK_PAGE_SIZE = 24;
const EXTERNAL_LIBRARY_PAGE_SIZE = BOOK_PAGE_SIZE;
const LOGO_HEIGHT_RPX = 56;
const SEARCH_PANEL_HEIGHT_RPX = 114;
const TOP_CARD_GAP_RPX = 24;
const BOOK_FILTER_TAG_LIMIT = 18;
const EXTERNAL_LIBRARY_FILTER_MIN_COUNT = 100;
const DEFAULT_READING_COVER_IMAGE = "/assets/menu/jiyue-logo.png";

function externalBookDetailCacheKey(id) {
  return `${EXTERNAL_BOOK_DETAIL_CACHE_PREFIX}${String(id || "").trim()}`;
}

function bookDetailCacheKey(id) {
  return `${BOOK_DETAIL_CACHE_PREFIX}${String(id || "").trim()}`;
}

function cacheBookDetailPayload(book) {
  try {
    const id = String((book && book.id) || "").trim();
    if (!id || !wx.setStorageSync) return;
    wx.setStorageSync(bookDetailCacheKey(id), {
      _id: id,
      title: firstText([book.title], ""),
      author: firstText([book.author], ""),
      publisher: firstText([book.publisher], ""),
      coverImage: firstText([book.coverImage], ""),
      metadataCover: firstText([book.coverImage], ""),
      description: firstText([book.description], ""),
      sourceName: firstText([book.sourceName], ""),
      recommendedGuest: firstText([book.recommendedGuest, book.recommenderTag], "").replace(/^推荐：/, ""),
      grade: firstText([book.gradeTag, Array.isArray(book.gradeTags) ? book.gradeTags[0] : ""], ""),
      categoryLabel: (Array.isArray(book.sourceTags) ? book.sourceTags[0] : "") || firstText([book.sourceName], ""),
      topic: Array.isArray(book.topicTags) ? book.topicTags.join("、") : "",
      hasMetadataDetail: true
    });
  } catch (_error) {}
}

function cacheExternalBookLibraryRecords(books) {
  try {
    if (!wx.setStorageSync || !Array.isArray(books) || !books.length) return;
    const records = books
      .map((book) => book && book.externalStoredDetail)
      .filter((item) => item && item.id)
      .slice(0, 80);
    if (records.length) wx.setStorageSync(EXTERNAL_BOOK_LIBRARY_RECORDS_KEY, records);
  } catch (_error) {}
}

function cacheExternalLibraryFirstPageResponse(response) {
  try {
    if (!wx.setStorageSync || !response) return;
    wx.setStorageSync(EXTERNAL_BOOK_LIBRARY_FIRST_PAGE_CACHE_KEY, response);
  } catch (_error) {}
}

function cacheNativeBooksFirstPageResponse(books, total) {
  try {
    if (!wx.setStorageSync || !Array.isArray(books) || !books.length) return;
    wx.setStorageSync(NATIVE_BOOKS_FIRST_PAGE_CACHE_KEY, {
      records: books.slice(0, BOOK_PAGE_SIZE),
      total: Math.max(Number(total) || 0, books.length),
      current: 1,
      pages: Math.max(1, Math.ceil(Math.max(Number(total) || 0, books.length) / BOOK_PAGE_SIZE)),
      size: BOOK_PAGE_SIZE
    });
  } catch (_error) {}
}

function buildExternalLibraryApiUrl(current, options = {}) {
  const size = Math.max(1, Number(options.size) || EXTERNAL_LIBRARY_PAGE_SIZE);
  const params = [
    `current=${encodeURIComponent(String(current))}`,
    `size=${encodeURIComponent(String(size))}`
  ];
  const tags = normalizeFilterTags(options.tags);
  for (const tag of tags) params.push(`tags=${encodeURIComponent(tag)}`);
  if (tags.length > 1) params.push("tagMode=any");
  const keyword = String(options.keyword || "").trim();
  if (keyword) params.push(`q=${encodeURIComponent(keyword)}`);
  if (options.includeFilters) params.push("includeFilters=1");
  return `${DEFAULT_WEB_ORIGIN}/api/books/external?${params.join("&")}`;
}

function normalizeImage(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  if (source.indexOf("http://xianfeng.xinzhi.info/") === 0) {
    return `${DEFAULT_WEB_ORIGIN}${source.slice("http://xianfeng.xinzhi.info".length)}`;
  }
  if (source.indexOf(`${DEFAULT_WEB_ORIGIN}/api/books/proxy-image`) === 0) return source;
  if (/^https?:\/\//.test(source)) {
    if (source.indexOf(`${DEFAULT_WEB_ORIGIN}/`) === 0) return source;
    return `${DEFAULT_WEB_ORIGIN}/api/books/proxy-image?url=${encodeURIComponent(source.replace(/^http:\/\//i, "https://"))}`;
  }
  return `${DEFAULT_WEB_ORIGIN}${source.startsWith("/") ? source : `/${source}`}`;
}

function isRealReadingCoverImage(value) {
  const source = String(value || "").trim();
  if (!source) return false;
  if (source.indexOf("via.placeholder.com") >= 0) return false;
  if (/placeholder/i.test(source)) return false;
  if (source.indexOf(DEFAULT_READING_COVER_IMAGE) >= 0) return false;
  return true;
}

function isFallbackReadingCoverImage(value) {
  return !isRealReadingCoverImage(value);
}

function normalizeReadingCoverImage(value) {
  if (isFallbackReadingCoverImage(value)) return "";
  const image = normalizeImage(value);
  return isFallbackReadingCoverImage(image) ? "" : image;
}

function firstText(values, fallback) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return fallback;
}

function isMissingBookText(value) {
  return ["未标注", "作者未标注", "暂无", "未知", "无"].indexOf(String(value || "").trim()) >= 0;
}

function displayText(value) {
  const text = String(value || "").trim();
  return isMissingBookText(text) ? "" : text;
}

function openMiniProgramShortLink(value) {
  const shortLink = String(value || "").trim();
  if (!/^#小程序:\/\//u.test(shortLink) || typeof wx.navigateToMiniProgram !== "function") return false;
  wx.navigateToMiniProgram({
    shortLink,
    fail(error) {
      if (/cancel/i.test(String(error && error.errMsg || ""))) return;
      wx.showToast({ title: "暂时无法打开，请稍后重试", icon: "none" });
    }
  });
  return true;
}

function cleanBookDescription(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  return source
    .replace(/\r\n/g, "\n")
    .replace(/\n*\s*点击链接进入\s*[:：][\s\S]*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isGeneratedBookListDescription(value) {
  const text = cleanBookDescription(value);
  return /^收录于「/.test(text) || /^分类：/.test(text) || /^来自《.+》的推荐书目$/.test(text);
}

function cleanRealBookDescription(value) {
  const text = cleanBookDescription(value);
  return isGeneratedBookListDescription(text) ? "" : text;
}

function extractNativeBookListDescription(payload) {
  const item = payload && (payload.metadata || payload.data || payload);
  return firstText([
    cleanRealBookDescription(item && item.description),
    cleanRealBookDescription(item && item.contentIntro),
    cleanRealBookDescription(item && item.summary),
    cleanRealBookDescription(item && item.intro)
  ], "");
}

function formatDate(value) {
  const source = String(value || "").trim();
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  return `${match[1]}/${Number(match[2])}/${Number(match[3])}`;
}

function pushTag(tags, value, limit = 4) {
  const text = displayText(value);
  if (text && tags.indexOf(text) < 0 && tags.length < limit) tags.push(text);
}

function splitValues(value) {
  return String(value || "")
    .split(/[;；,，、/／]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitSourceValues(value) {
  return String(value || "")
    .split(/[;；,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pushSplitTags(tags, value) {
  for (const item of splitValues(value)) pushTag(tags, item, Number.POSITIVE_INFINITY);
}

function buildBookTagGroups(item) {
  const gradeTags = [];
  const ageTags = [];
  for (const tag of splitValues(item && item.grade)) {
    if (isReadingAgeTag(tag)) pushTag(ageTags, tag, Number.POSITIVE_INFINITY);
    else pushTag(gradeTags, tag, Number.POSITIVE_INFINITY);
  }

  const sourceTags = normalizeSourceTags([item && item.categoryLabel, item && item.sourceName]);
  const rawTopicTags = [];
  pushSplitTags(rawTopicTags, item && item.topic);

  return {
    gradeTags,
    ageTags,
    sourceTags,
    rawTopicTags: normalizeTopicTags(rawTopicTags, { keepBooklistTags: true }),
    topicTags: normalizeTopicTags(rawTopicTags)
  };
}

function buildDisplayTags(sourceTags, gradeTags, ageTags, topicTags) {
  const tags = [];
  const visibleSourceTags = Array.isArray(sourceTags) ? sourceTags.slice(0, 1) : [];
  for (const tag of []
    .concat(visibleSourceTags)
    .concat(Array.isArray(gradeTags) ? gradeTags : [])
    .concat(Array.isArray(ageTags) ? ageTags : [])
    .concat(Array.isArray(topicTags) ? topicTags : [])) {
    pushTag(tags, tag);
  }
  return tags.map((tag) => `#${tag}`);
}

function normalizeBook(book) {
  const item = book || {};
  const id = String(item._id || "").trim();
  const title = firstText([item.title], "未命名书籍");
  const author = displayText(item.author);
  const recommendedGuest = displayText(item.recommendedGuest);
  const recommenderTag = recommendedGuest ? `推荐：${recommendedGuest}` : "";
  const { gradeTags, ageTags, sourceTags, rawTopicTags, topicTags } = buildBookTagGroups(item);
  const fieldTags = normalizeFilterTags([]
    .concat(gradeTags)
    .concat(ageTags)
    .concat(sourceTags)
    .concat(rawTopicTags)
    .concat(topicTags)
    .concat(splitValues(item.author))
    .concat(splitValues(item.publisher))
    .concat(splitValues(recommendedGuest))
  );
  const displayTags = buildDisplayTags(sourceTags, gradeTags, ageTags, topicTags);
  const gradeTag = gradeTags[0] || "";
  const realDescription = firstText([
    cleanRealBookDescription(item.description),
    cleanRealBookDescription(item.contentIntro),
    cleanRealBookDescription(item.summary)
  ], "");
  const coverImage = normalizeReadingCoverImage(item.coverImage || item.metadataCover);

  return {
    id: id || title,
    title,
    author,
    publisher: displayText(item.publisher),
    sourceName: displayText(item.sourceName),
    date: formatDate(item.publishedAt || item.createdAt),
    coverImage,
    hasRealCover: isRealReadingCoverImage(coverImage),
    description: realDescription,
    hasListDescription: !!realDescription,
    descriptionIsFallback: false,
    detailEnabled: !!item.hasMetadataDetail,
    miniProgramShortLink: firstText([item.wxPurchaseLink], ""),
    recommenderTag,
    fieldTags,
    displayTags,
    gradeTags,
    ageTags,
    sourceTags,
    gradeTag,
    topicTags,
    path: `/reading/${encodeURIComponent(id)}`
  };
}

function normalizeCachedBook(book) {
  const item = book || {};
  if (item.recommenderTag || Array.isArray(item.displayTags)) {
    const fieldTags = Array.isArray(item.fieldTags)
      ? item.fieldTags.map((tag) => normalizeFilterTag(tag)).filter(Boolean)
      : Array.isArray(item.displayTags)
        ? item.displayTags.map((tag) => normalizeFilterTag(tag)).filter(Boolean)
        : [];
    const gradeTags = normalizeFilterTags(item.gradeTags || fieldTags.filter(isReadingGradeTag));
    const ageTags = normalizeFilterTags(item.ageTags || fieldTags.filter(isReadingAgeTag));
    const sourceTags = normalizeSourceTags(item.sourceTags || [item.categoryLabel, item.sourceName]);
    const topicTags = normalizeTopicTags(item.topicTags || fieldTags.filter((tag) => !isReadingGradeTag(tag) && !isReadingAgeTag(tag) && sourceTags.indexOf(normalizeFilterTag(tag)) < 0));
    const searchableFieldTags = normalizeFilterTags(fieldTags
      .concat(splitValues(item.author))
      .concat(splitValues(item.publisher))
      .concat(splitValues(item.recommendedGuest))
      .concat(splitValues(String(item.recommenderTag || "").replace(/^推荐：/, "")))
      .concat(normalizeTopicTags(splitValues(item.topic), { keepBooklistTags: true })));
    const realDescription = firstText([
      cleanRealBookDescription(item.description),
      cleanRealBookDescription(item.contentIntro),
      cleanRealBookDescription(item.summary)
    ], "");
    const coverImage = normalizeReadingCoverImage(item.coverImage || item.metadataCover);
    return {
      ...item,
      author: displayText(item.author),
      publisher: displayText(item.publisher),
      sourceName: displayText(item.sourceName),
      coverImage,
      hasRealCover: isRealReadingCoverImage(coverImage),
      description: realDescription,
      hasListDescription: !!realDescription,
      descriptionIsFallback: false,
      fieldTags: searchableFieldTags,
      displayTags: buildDisplayTags(sourceTags, gradeTags, ageTags, topicTags),
      gradeTags,
      ageTags,
      sourceTags,
      gradeTag: normalizeFilterTag(item.gradeTag || item.grade || gradeTags[0] || ""),
      topicTags
    };
  }
  const tags = Array.isArray(item.tags) ? item.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
  const recommenderTag = tags.find((tag) => tag.indexOf("推荐：") === 0) || "";
  const fieldTags = normalizeFilterTags(tags
    .filter((tag) => tag !== recommenderTag)
    .map((tag) => tag.replace(/^#/, ""))
    .concat(splitValues(item.author))
    .concat(splitValues(item.publisher))
    .concat(splitValues(String(item.recommenderTag || "").replace(/^推荐：/, "")))
    .concat(splitValues(item.recommendedGuest)));
  const displayTags = fieldTags.map((tag) => `#${tag}`);
  const topicTags = normalizeTopicTags(item.topicTags || fieldTags.filter((tag) => !isReadingGradeTag(tag) && !isReadingAgeTag(tag)));
  const realDescription = firstText([
    cleanRealBookDescription(item.description),
    cleanRealBookDescription(item.contentIntro),
    cleanRealBookDescription(item.summary)
  ], "");
  const coverImage = normalizeReadingCoverImage(item.coverImage || item.metadataCover);
  return {
    ...item,
    author: displayText(item.author),
    publisher: displayText(item.publisher),
    sourceName: displayText(item.sourceName),
    coverImage,
    hasRealCover: isRealReadingCoverImage(coverImage),
    description: realDescription,
    hasListDescription: !!realDescription,
    descriptionIsFallback: false,
    recommenderTag,
    fieldTags,
    displayTags,
    gradeTag: normalizeFilterTag(item.gradeTag || item.grade || fieldTags.find(isReadingGradeTag) || ""),
    topicTags
  };
}

function normalizeFilterTag(value) {
  const label = String(value || "").trim().replace(/^#/, "");
  return isMissingBookText(label) ? "" : label;
}

function normalizeExternalLibraryTag(value) {
  const label = normalizeFilterTag(value);
  if (label === "漫画") return "Manga";
  return label;
}

function normalizeTopicTag(value) {
  return normalizeFilterTag(value).replace(/\s*[（(]\s*共\s*\d+\s*本\s*[）)]\s*$/, "");
}

function normalizeSourceTags(values) {
  const source = Array.isArray(values) ? values : [values];
  return source
    .flatMap(splitSourceValues)
    .map(normalizeFilterTag)
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index);
}

function isBooklistTopicTag(value) {
  return /^0\s*-\s*6岁1000本(图书|图画书)$/.test(normalizeTopicTag(value));
}

function normalizeTopicTags(values, options = {}) {
  const source = Array.isArray(values) ? values : [values];
  return source
    .map(normalizeTopicTag)
    .filter(Boolean)
    .filter((tag) => options.keepBooklistTags || !isBooklistTopicTag(tag))
    .filter((tag, index, list) => list.indexOf(tag) === index);
}

function isReadingGradeTag(value) {
  const text = normalizeFilterTag(value);
  return /^(小班|中班|大班|通用|小学|小学低段|小学中段|小学高段|中学|初中|高中|[一二三四五六七八九十]+年级)$/.test(text);
}

function isReadingAgeTag(value) {
  const text = normalizeFilterTag(value);
  return /^(\d+\s*-\s*\d+|\d+)\s*岁$/.test(text) || /^(学前|幼儿园)$/.test(text);
}

function normalizeFilterTags(values) {
  const source = Array.isArray(values) ? values : [values];
  return source
    .map(normalizeFilterTag)
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index);
}

function sameFilterTags(left, right) {
  const a = normalizeFilterTags(left);
  const b = normalizeFilterTags(right);
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function buildFilterLabel(tags) {
  return normalizeFilterTags(tags).join("、");
}

function normalizeSearchText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function bookMatchesKeyword(book, keyword) {
  const query = normalizeSearchText(keyword);
  if (!query) return true;
  const haystack = [
    book && book.title,
    book && book.author,
    book && book.publisher,
    book && book.sourceName,
    book && book.description,
    book && book.recommenderTag,
    Array.isArray(book && book.fieldTags) ? book.fieldTags.join(" ") : "",
    Array.isArray(book && book.displayTags) ? book.displayTags.join(" ") : "",
    Array.isArray(book && book.gradeTags) ? book.gradeTags.join(" ") : "",
    Array.isArray(book && book.ageTags) ? book.ageTags.join(" ") : "",
    Array.isArray(book && book.topicTags) ? book.topicTags.join(" ") : ""
  ].join(" ");
  return normalizeSearchText(haystack).indexOf(query) >= 0;
}

function filterBooksByKeyword(books, keyword) {
  const query = normalizeSearchText(keyword);
  if (!query) return Array.isArray(books) ? books : [];
  return (Array.isArray(books) ? books : []).filter((book) => bookMatchesKeyword(book, query));
}

function filterBooksByTags(books, tags) {
  const targets = normalizeFilterTags(tags);
  if (!targets.length) return books;
  return books.filter((book) => {
    const fieldTags = Array.isArray(book.fieldTags) ? book.fieldTags : [];
    return fieldTags.some((item) => targets.indexOf(normalizeFilterTag(item)) >= 0);
  });
}

function getNativeReadingPreviewCount(books, tags, total) {
  const source = Array.isArray(books) ? books : [];
  const targets = normalizeFilterTags(tags);
  if (targets.length) return filterBooksByTags(source, targets).length;
  return Math.max(source.length, Number(total) || 0);
}

const READING_GRADE_ORDER = [
  "小班",
  "中班",
  "大班",
  "一年级",
  "二年级",
  "三年级",
  "四年级",
  "五年级",
  "六年级",
  "七年级",
  "八年级",
  "九年级",
  "小学",
  "初中",
  "中学",
  "高中",
  "通用"
];

const READING_AGE_ORDER = [
  "0-1岁",
  "1-2岁",
  "2-3岁",
  "3-4岁",
  "4-5岁",
  "5-6岁",
  "学前",
  "幼儿园"
];

function compareReadingGrade(a, b) {
  const indexA = READING_GRADE_ORDER.indexOf(a);
  const indexB = READING_GRADE_ORDER.indexOf(b);
  if (indexA >= 0 || indexB >= 0) return (indexA >= 0 ? indexA : 999) - (indexB >= 0 ? indexB : 999);
  return a.localeCompare(b, "zh-Hans-CN");
}

function compareReadingAge(a, b) {
  const indexA = READING_AGE_ORDER.indexOf(a);
  const indexB = READING_AGE_ORDER.indexOf(b);
  if (indexA >= 0 || indexB >= 0) return (indexA >= 0 ? indexA : 999) - (indexB >= 0 ? indexB : 999);
  return a.localeCompare(b, "zh-Hans-CN");
}

function pushOptionValue(values, value) {
  const label = normalizeFilterTag(value);
  if (label && values.indexOf(label) < 0) values.push(label);
}

function toReadingOptions(values, selectedTags) {
  const selected = normalizeFilterTags(selectedTags);
  return values.map((label) => ({ label, value: `#${label}`, selected: selected.indexOf(label) >= 0 }));
}

function getExternalLibraryFilterOptionCount(option) {
  const record = option && typeof option === "object" ? option : {};
  const countKeys = ["count", "total", "bookCount", "recordCount"];
  for (const key of countKeys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const count = Number(record[key]);
      return Number.isFinite(count) ? count : null;
    }
  }
  return null;
}

function hasLocalReadingFilterGroups(groups) {
  return (Array.isArray(groups) ? groups : []).some((group) => {
    const key = String((group && group.key) || "").trim();
    const title = String((group && group.title) || "").trim();
    return key === "grade" || key === "age" || title === "年级" || title === "年龄";
  });
}

function normalizeExternalLibraryFilterGroups(groups, selectedTags = []) {
  if (hasLocalReadingFilterGroups(groups)) return [];
  const selected = normalizeFilterTags(selectedTags).map(normalizeExternalLibraryTag).filter(Boolean);
  return (Array.isArray(groups) ? groups : [])
    .map((group) => {
      const options = (Array.isArray(group && group.options) ? group.options : [])
        .map((option) => {
          const label = normalizeExternalLibraryTag(option && (option.label || option.value));
          if (!label) return null;
          const count = getExternalLibraryFilterOptionCount(option);
          if (count === null || count <= EXTERNAL_LIBRARY_FILTER_MIN_COUNT) return null;
          return {
            label,
            value: `#${label}`,
            selected: selected.indexOf(label) >= 0,
            count
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const countDiff = b.count - a.count;
          return countDiff !== 0 ? countDiff : a.label.localeCompare(b.label, "zh-Hans-CN");
        });
      return {
        key: String((group && group.key) || group.title || "topic"),
        title: String((group && group.title) || "主题"),
        options
      };
    })
    .filter((group) => group.options.length);
}

function hasExternalLibraryFilterGroupOptions(groups) {
  return (Array.isArray(groups) ? groups : []).some((group) => (
    Array.isArray(group && group.options) && group.options.length > 0
  ));
}

function buildExternalLibraryFallbackFilterGroups(books, total, selectedTags = []) {
  const count = Math.max(Number(total) || 0, Array.isArray(books) ? books.length : 0);
  if (count <= EXTERNAL_LIBRARY_FILTER_MIN_COUNT) return [];
  const selected = normalizeFilterTags(selectedTags).map(normalizeExternalLibraryTag).filter(Boolean);
  const labels = [];
  for (const book of Array.isArray(books) ? books : []) {
    const fieldTags = Array.isArray(book && book.fieldTags) ? book.fieldTags : [];
    for (const tag of fieldTags) {
      const label = normalizeExternalLibraryTag(tag);
      if (label && labels.indexOf(label) < 0) labels.push(label);
      if (labels.length >= BOOK_FILTER_TAG_LIMIT) break;
    }
    if (labels.length >= BOOK_FILTER_TAG_LIMIT) break;
  }
  if (!labels.length) return [];
  return [{
    key: "topic",
    title: "主题",
    options: labels.map((label) => ({
      label,
      value: `#${label}`,
      selected: selected.indexOf(label) >= 0,
      count
    }))
  }];
}

function buildReadingFilterGroups(books, selectedTags = []) {
  const gradeValues = [];
  const ageValues = [];
  const topicValues = [];
  for (const book of Array.isArray(books) ? books : []) {
    const gradeTags = Array.isArray(book && book.gradeTags)
      ? book.gradeTags
      : [book && book.gradeTag].filter(Boolean);
    for (const tag of gradeTags) pushOptionValue(gradeValues, tag);
    const ageTags = Array.isArray(book && book.ageTags) ? book.ageTags : [];
    for (const tag of ageTags) pushOptionValue(ageValues, tag);
    const topicTags = Array.isArray(book && book.topicTags) ? book.topicTags : [];
    for (const tag of topicTags) pushOptionValue(topicValues, tag);
  }
  gradeValues.sort(compareReadingGrade);
  ageValues.sort(compareReadingAge);
  return [
    { key: "grade", title: "年级", options: toReadingOptions(gradeValues, selectedTags) },
    { key: "age", title: "年龄", options: toReadingOptions(ageValues, selectedTags) },
    { key: "topic", title: "主题", options: toReadingOptions(topicValues, selectedTags).slice(0, BOOK_FILTER_TAG_LIMIT) }
  ].filter((group) => group.options.length);
}

function buildReadingFilterTags(books) {
  return buildReadingFilterGroups(books).flatMap((group) => group.options).slice(0, BOOK_FILTER_TAG_LIMIT);
}

function bookDisplayPriority(book, index) {
  const hasDetail = !!book.detailEnabled;
  const hasDescription = !!book.hasListDescription;
  let score = 0;
  if (book.hasRealCover) score += 8;
  if (hasDetail && hasDescription) score += 4;
  else if (hasDescription) score += 3;
  else if (hasDetail) score += 2;
  else score += 1;
  return { book, index, score };
}

function normalizeBooks(response) {
  const rawItems = Array.isArray(response) ? response : [];
  return rawItems
    .map(normalizeBook)
    .filter((item) => item.id)
    .map(bookDisplayPriority)
    .sort((a, b) => {
      const priorityDiff = b.score - a.score;
      return priorityDiff !== 0 ? priorityDiff : a.index - b.index;
    })
    .map((item) => item.book);
}

function normalizeExternalLibraryBook(record) {
  const item = record || {};
  const id = String(item.id || "").trim();
  const title = firstText([item.title], "未命名书籍");
  const author = displayText(item.author);
  const categories = splitValues(item.tags || item.category)
    .map(normalizeExternalLibraryTag)
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index);
  const fieldTags = [];
  pushTag(fieldTags, item.levelRange);
  for (const category of categories) pushTag(fieldTags, category);
  const displayTags = fieldTags.map((tag) => `#${tag}`);
  const description = cleanRealBookDescription(item.description);
  const coverImage = normalizeReadingCoverImage(item.coverPic);

  return {
    id: id || title,
    title,
    author,
    publisher: firstText([item.publisher], ""),
    sourceName: "及阅书库",
    date: formatDate(item.pubDate),
    coverImage,
    hasRealCover: isRealReadingCoverImage(coverImage),
    description,
    hasListDescription: !!description,
    detailEnabled: !!id,
    recommenderTag: "",
    fieldTags,
    displayTags,
    gradeTag: normalizeFilterTag(item.levelRange),
    topicTags: normalizeTopicTags(categories),
    externalDetailPayload: normalizeExternalLibraryNavigationPayload(item),
    externalStoredDetail: normalizeExternalLibraryDetailPayload(item),
    path: `/library/${encodeURIComponent(id)}`
  };
}

function normalizeExternalLibraryDetailPayload(record) {
  const item = record || {};
  return {
    id: firstText([item.id], ""),
    title: firstText([item.title], ""),
    coverPic: firstText([item.coverPic], ""),
    author: firstText([item.author], ""),
    publisher: firstText([item.publisher], ""),
    isbn: firstText([item.isbn], ""),
    pubDate: firstText([item.pubDate], ""),
    pages: Number.isFinite(Number(item.pages)) ? Number(item.pages) : null,
    words: firstText([item.words], ""),
    lexile: firstText([item.lexile], ""),
    ar: firstText([item.ar], ""),
    tags: firstText([item.tags], ""),
    category: firstText([item.category], ""),
    series: firstText([item.series], ""),
    fiction: firstText([item.fiction], ""),
    levelRange: firstText([item.levelRange], ""),
    description: firstText([item.description], "")
  };
}

function normalizeExternalLibraryNavigationPayload(record) {
  const detail = normalizeExternalLibraryDetailPayload(record);
  return {
    id: detail.id,
    title: detail.title,
    coverPic: detail.coverPic,
    author: detail.author,
    publisher: detail.publisher,
    tags: detail.tags,
    category: detail.category,
    levelRange: detail.levelRange
  };
}

function normalizeExternalLibraryBooks(response) {
  const records = Array.isArray(response && response.records) ? response.records : [];
  return records
    .map(normalizeExternalLibraryBook)
    .filter((item) => item.id)
    .map(bookDisplayPriority)
    .sort((a, b) => {
      const priorityDiff = b.score - a.score;
      return priorityDiff !== 0 ? priorityDiff : a.index - b.index;
    })
    .map((item) => item.book);
}

function normalizeBookResponse(response, useExternalLibrarySource) {
  return useExternalLibrarySource ? normalizeExternalLibraryBooks(response) : normalizeBooks(response);
}

function normalizeCachedBooksPayload(cached) {
  if (!Array.isArray(cached) || !cached.length) return [];
  const hasNormalizedShape = cached.some((item) => item && (item.id || item.path || Array.isArray(item.displayTags) || item.recommenderTag));
  return hasNormalizedShape ? cached.map(normalizeCachedBook) : normalizeBooks(cached);
}

function mergeCachedNativeBookDescriptions(books) {
  if (!Array.isArray(books) || !books.length) return books;
  try {
    if (!wx.getStorageSync) return books;
    const cachedBooks = normalizeCachedBooksPayload(wx.getStorageSync(BOOK_CACHE_KEY));
    const descriptions = new Map();
    for (const book of cachedBooks) {
      const id = String((book && book.id) || "").trim();
      const description = cleanRealBookDescription(book && book.description);
      if (id && description && !(book && book.descriptionIsFallback)) descriptions.set(id, description);
    }
    if (!descriptions.size) return books;
    return books.map((book) => {
      const id = String((book && book.id) || "").trim();
      if (!id || (book.description && book.hasListDescription && !book.descriptionIsFallback) || !descriptions.has(id)) return book;
      return { ...book, description: descriptions.get(id), hasListDescription: true, descriptionIsFallback: false };
    });
  } catch (_error) {
    return books;
  }
}

function mergeExternalLibraryFilterGroups(responses) {
  const groupMap = new Map();
  for (const response of Array.isArray(responses) ? responses : []) {
    const groups = Array.isArray(response && response.filterGroups) ? response.filterGroups : [];
    for (const group of groups) {
      const key = String((group && group.key) || group.title || "topic");
      const title = String((group && group.title) || "主题");
      if (!groupMap.has(key)) groupMap.set(key, { key, title, options: [] });
      const target = groupMap.get(key);
      const seenOptions = new Set(target.options.map((option) => normalizeFilterTag(option && (option.label || option.value))));
      const options = Array.isArray(group && group.options) ? group.options : [];
      for (const option of options) {
        const label = normalizeFilterTag(option && (option.label || option.value));
        if (!label || seenOptions.has(label)) continue;
        seenOptions.add(label);
        target.options.push(option);
      }
    }
  }
  return Array.from(groupMap.values());
}

function mergeExternalLibraryResponses(responses, current, size) {
  const records = [];
  const seen = new Set();
  let total = 0;
  let pages = 1;
  for (const response of Array.isArray(responses) ? responses : []) {
    const responseRecords = Array.isArray(response && response.records) ? response.records : [];
    total += getExternalLibraryTotal(response, responseRecords.length);
    pages = Math.max(pages, getExternalLibraryPages(response));
    for (const record of responseRecords) {
      const id = String(record && (record.id || record._id || record.title) || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      records.push(record);
    }
  }
  return {
    records,
    total: Math.max(total, records.length),
    current: Math.max(1, Number(current) || 1),
    pages,
    size: Math.max(1, Number(size) || EXTERNAL_LIBRARY_PAGE_SIZE),
    filterGroups: mergeExternalLibraryFilterGroups(responses)
  };
}

function loadExternalLibraryPage(current, tags, size = EXTERNAL_LIBRARY_PAGE_SIZE, options = {}) {
  const normalizedTags = normalizeFilterTags(tags);
  if (normalizedTags.length > 1) {
    return Promise.all(normalizedTags.map((tag) => (
      request({ url: buildExternalLibraryApiUrl(current, { tags: [tag], size, keyword: options.keyword, includeFilters: !!options.includeFilters }) })
    ))).then((responses) => mergeExternalLibraryResponses(responses, current, size));
  }
  return request({ url: buildExternalLibraryApiUrl(current, { tags: normalizedTags, size, keyword: options.keyword, includeFilters: !!options.includeFilters }) });
}

function loadExternalLibraryFirstPage(tags) {
  return loadExternalLibraryPage(1, tags, EXTERNAL_LIBRARY_PAGE_SIZE);
}

function loadExternalLibraryPreview(tags) {
  return loadExternalLibraryPage(1, tags, 1, { includeFilters: true });
}

function getExternalLibraryTotal(response, fallback) {
  const total = Number(response && response.total);
  return Number.isFinite(total) ? total : fallback;
}

function getExternalLibraryPages(response) {
  const pages = Number(response && response.pages);
  return Math.max(1, Number.isFinite(pages) ? pages : 1);
}

function getExternalLibraryCurrent(response, fallback = 1) {
  const current = Number(response && response.current);
  return Math.max(1, Number.isFinite(current) ? current : fallback);
}

function sliceBooksForDisplay(books, count) {
  const limit = Math.max(BOOK_PAGE_SIZE, Number(count) || BOOK_PAGE_SIZE);
  return (Array.isArray(books) ? books : []).slice(0, limit);
}

const pageShare = createPageShare({
  title: "及阅",
  path: "/pages/reading/index"
});
const readingFilterDrawerMethods = createFilterDrawerMethods();

Page({
  data: {
    selected: 1,
    settingsSections: SETTINGS_SECTIONS,
    topbarHeight: 88,
    chromeHeight: 88,
    searchPanelHeight: 57,
    topCardGapHeight: 12,
    searchButtonTop: 8,
    profilePanelTop: 30,
      profileHeaderHeight: 32,
      logoTop: 10,
      logoHeight: 28,
      welfareRight: 101,
    searchPrompt: getInitialSearchPrompt(),
    compactMode: true,
    activeReadingTag: "",
    activeReadingTags: [],
    draftReadingTags: [],
    activeReadingTagLabel: "",
    isReadingFilterAllSelected: true,
    readingFilterPreviewCount: 0,
    filterDrawerOpen: false,
    filterDrawerHeight: 0,
    filterDrawerMinHeight: 0,
    filterDrawerMaxHeight: 0,
    filterDrawerDragStartY: 0,
    filterDrawerDragStartHeight: 0,
    filterDrawerDragMode: "",
    filterDrawerExpanded: false,
    readingFilterTags: [],
    readingFilterGroups: [],
    allBooks: [],
    books: [],
    visibleBookCount: BOOK_PAGE_SIZE,
    hasMoreBooks: false,
    useExternalLibrarySource: false,
    loading: true,
    refreshing: false,
      error: "",
      hasCache: false,
      settingsPanelOpen: false,
      settingsPanelView: "menu",
      settingsProfilePanelSupported: true,
      accountTitle: "登录/注册",
      accountSubtitle: "登录后同步档案和个性化推荐",
      accountPage: ""
  },

  onLoad() {
    enableShareMenu();
    this.loadPreferredViewMode();
    this.loadPreferredReadingSource();
    this.syncTopbarMetrics();
    startSearchPromptRotation(this);
    this.syncAccountEntry();
    if (this.data.useExternalLibrarySource) {
      if (!this.renderExternalLibraryFirstPageFromCache()) this.prefetchExternalLibraryFirstPage();
    }
    this.loadBooks();
    if (!this.data.useExternalLibrarySource) this.prefetchExternalLibraryFirstPage();
  },

  onReady() {
    this.scrollBelowSearchPanel();
  },

  onShow() {
    enableShareMenu();
    setSelectedTab(this, 1);
    this.syncTopbarMetrics();
    this.syncAccountEntry();
    this.consumePendingReadingFilter();
  },

  onUnload() {
    setSettingsTabbarHidden(this, false);
    stopSearchPromptRotation(this);
  },

  syncTopbarMetrics() {
    try {
      const metrics = getNativeTopbarMetrics();
      const topbarHeight = Math.max(72, Math.round(metrics.topbarHeight || 88));
      const windowWidth = Math.max(320, Number(metrics.windowWidth || 375));
      const logoHeight = Math.round((LOGO_HEIGHT_RPX * windowWidth) / 750);
      const searchPanelHeight = Math.round((SEARCH_PANEL_HEIGHT_RPX * windowWidth) / 750);
      const topCardGapHeight = Math.round((TOP_CARD_GAP_RPX * windowWidth) / 750);
      const capsuleHeight = Math.max(28, Math.round(metrics.capsuleHeight || 32));
      const searchButtonTop = Math.max(8, Math.round(metrics.searchButtonTop || 8));
      const welfareRight = Math.max(72, Math.round(metrics.capsuleRight || 96) + 5);
      this.setData({
        topbarHeight,
        chromeHeight: topbarHeight,
        searchPanelHeight,
        topCardGapHeight,
        searchButtonTop,
        profilePanelTop: searchButtonTop,
        profileHeaderHeight: capsuleHeight,
        logoHeight,
        logoTop: Math.max(0, Math.round(searchButtonTop + capsuleHeight / 2 - logoHeight / 2)),
        welfareRight
      });
    } catch (_error) {}
  },

  scrollBelowSearchPanel() {
    try {
      const scrollTop = Math.max(0, (this.data.searchPanelHeight || 0) - (this.data.topCardGapHeight || 0));
      wx.pageScrollTo({ scrollTop, duration: 0 });
    } catch (_error) {}
  },

  loadPreferredViewMode() {
    try {
      this.setData({ compactMode: wx.getStorageSync(BOOK_VIEW_MODE_KEY) !== "feature" });
    } catch (_error) {}
  },

  loadPreferredReadingSource() {
    this.setData({ useExternalLibrarySource: false });
  },

  persistPreferredReadingSource(useExternalLibrarySource) {
    try {
      if (wx.setStorageSync) wx.setStorageSync(READING_SOURCE_KEY, useExternalLibrarySource ? "external" : "native");
    } catch (_error) {}
  },

  switchBookViewMode() {
    const compactMode = !this.data.compactMode;
    this.setData({ compactMode });
    try {
      wx.setStorageSync(BOOK_VIEW_MODE_KEY, compactMode ? "compact" : "feature");
    } catch (_error) {}
  },

  hydrateNativeBookListDescriptions(books) {
    if (this.data.useExternalLibrarySource) return Promise.resolve();
    const source = Array.isArray(books) ? books : this.data.books;
    const fallbackCacheSource = Array.isArray(source) ? source.slice() : [];
    const targets = (Array.isArray(source) ? source : [])
      .filter((book) => book && book.id && (!book.description || book.descriptionIsFallback))
      .slice(0, BOOK_PAGE_SIZE);
    if (!targets.length) return Promise.resolve();
    if (!this._nativeBookDescriptionRequests) this._nativeBookDescriptionRequests = new Set();
    const requests = targets
      .filter((book) => {
        const id = String(book.id || "").trim();
        if (!id || this._nativeBookDescriptionRequests.has(id)) return false;
        this._nativeBookDescriptionRequests.add(id);
        return true;
      })
      .map((book) => {
        const id = String(book.id || "").trim();
        const loadBookDetailDescription = () => request({ url: `/api/books/${encodeURIComponent(id)}` })
          .then((response) => {
            const description = extractNativeBookListDescription(response);
            return description ? { id, description } : null;
          })
          .catch(() => null);
	        return request({ url: `/api/books/${encodeURIComponent(id)}/metadata` })
	          .then((response) => {
	            const description = extractNativeBookListDescription(response);
	            return description ? { id, description } : loadBookDetailDescription();
	          })
	          .catch(loadBookDetailDescription)
	          .then((result) => {
	            this._nativeBookDescriptionRequests.delete(id);
	            return result;
	          });
	      });
    if (!requests.length) return Promise.resolve();
    return Promise.all(requests).then((results) => {
      const descriptions = new Map(results.filter(Boolean).map((item) => [item.id, item.description]));
      if (!descriptions.size) return;
      const patchBook = (book) => {
        const id = String((book && book.id) || "").trim();
        return descriptions.has(id) ? { ...book, description: descriptions.get(id), hasListDescription: true, descriptionIsFallback: false } : book;
      };
      try {
        const cachedBooks = normalizeCachedBooksPayload(wx.getStorageSync(BOOK_CACHE_KEY));
        const cacheSource = cachedBooks.length ? cachedBooks : fallbackCacheSource;
        const cachedWithDescriptions = cacheSource.map(patchBook);
        if (cachedWithDescriptions.length) {
          wx.setStorageSync(BOOK_CACHE_KEY, cachedWithDescriptions);
          cacheNativeBooksFirstPageResponse(cachedWithDescriptions, cachedWithDescriptions.length);
        }
      } catch (_error) {}
      if (this.data.useExternalLibrarySource) return;
      const books = (Array.isArray(this.data.books) ? this.data.books : []).map(patchBook);
      this.allBooks = (Array.isArray(this.allBooks) ? this.allBooks : []).map(patchBook);
      this.setData({ books });
      try {
        if (this.allBooks.length) wx.setStorageSync(BOOK_CACHE_KEY, this.allBooks);
      } catch (_error) {}
    });
  },

  loadCachedBooks() {
    try {
      const cached = wx.getStorageSync(BOOK_CACHE_KEY);
      if (!Array.isArray(cached) || !cached.length) return false;
      const allBooks = normalizeCachedBooksPayload(cached);
      if (!allBooks.length) return false;
      const activeReadingTags = normalizeFilterTags(this.data.activeReadingTags || this.data.activeReadingTag);
      const activeReadingTagLabel = buildFilterLabel(activeReadingTags);
      const filteredBooks = filterBooksByTags(allBooks, activeReadingTags);
      const books = sliceBooksForDisplay(filteredBooks, BOOK_PAGE_SIZE);
      this.allBooks = allBooks;
      this.setData({
        books,
        visibleBookCount: BOOK_PAGE_SIZE,
        hasMoreBooks: filteredBooks.length > BOOK_PAGE_SIZE,
        readingFilterTags: buildReadingFilterTags(allBooks),
        readingFilterGroups: buildReadingFilterGroups(allBooks, activeReadingTags),
        readingFilterPreviewCount: filteredBooks.length,
        loading: false,
        error: books.length || !activeReadingTagLabel ? "" : `没有匹配的 ${activeReadingTagLabel} 图书`,
        hasCache: true
      });
      this.hydrateNativeBookListDescriptions(books);
      return true;
    } catch (_error) {
      return false;
    }
  },

  hasNativeBooksCache() {
    try {
      const firstPageCache = wx.getStorageSync(NATIVE_BOOKS_FIRST_PAGE_CACHE_KEY);
      if (firstPageCache && typeof firstPageCache === "object" && Array.isArray(firstPageCache.records) && firstPageCache.records.length > 0) {
        return true;
      }
      const cached = wx.getStorageSync(BOOK_CACHE_KEY);
      return Array.isArray(cached) && cached.length > 0;
    } catch (_error) {
      return false;
    }
  },

  hydrateNativeBooksFirstPageCacheFromStorage() {
    try {
      if (!wx.getStorageSync) return null;
      const cached = wx.getStorageSync(NATIVE_BOOKS_FIRST_PAGE_CACHE_KEY);
      if (!cached || typeof cached !== "object" || Array.isArray(cached)) return null;
      const records = Array.isArray(cached.records) ? cached.records : [];
      const books = mergeCachedNativeBookDescriptions(normalizeCachedBooksPayload(records));
      if (!books.length) return null;
      const total = Number(cached.total);
      const pages = Number(cached.pages);
      return {
        books,
        total: Math.max(Number.isFinite(total) ? total : books.length, books.length),
        current: Math.max(1, Number(cached.current) || 1),
        pages: Math.max(1, Number.isFinite(pages) ? pages : 1)
      };
    } catch (_error) {
      return null;
    }
  },

  renderNativeBooksFirstPageFromCache() {
    const cache = this.hydrateNativeBooksFirstPageCacheFromStorage();
    if (!cache) return false;
    const activeReadingTags = normalizeFilterTags(this.data.activeReadingTags || this.data.activeReadingTag);
    if (activeReadingTags.length) return false;
    this.allBooks = cache.books;
    this._nativeLibraryCurrentPage = Math.max(1, Number(cache.current) || 1);
    this._nativeLibraryPages = Math.max(1, Number(cache.pages) || Math.ceil(cache.total / BOOK_PAGE_SIZE));
    this._nativeLibraryTotal = cache.total;
    this.setData({
      books: cache.books,
      visibleBookCount: BOOK_PAGE_SIZE,
      hasMoreBooks: cache.books.length < cache.total,
      readingFilterTags: buildReadingFilterTags(cache.books),
      readingFilterGroups: buildReadingFilterGroups(cache.books, activeReadingTags),
      readingFilterPreviewCount: cache.total,
      loading: false,
      refreshing: false,
      hasCache: true,
      error: ""
    });
    this.hydrateNativeBookListDescriptions(cache.books);
    return true;
  },

  prefetchNativeFullLibraryForFilters(requestId = this._readingSourceRequestId) {
    if (this.data.useExternalLibrarySource) return Promise.resolve(null);
    if (this._nativeFullLibraryFilterPromise) return this._nativeFullLibraryFilterPromise;
    this._nativeFullLibraryFilterPromise = preloadNativeReadingBooks()
      .then((response) => {
        if (this.data.useExternalLibrarySource) return null;
        if (requestId && this._readingSourceRequestId !== requestId) return null;
        const allBooks = mergeCachedNativeBookDescriptions(normalizeBooks(response));
        if (!allBooks.length) return null;
        this.allBooks = allBooks;
        const activeReadingTags = normalizeFilterTags(this.data.activeReadingTags || this.data.activeReadingTag);
        const filteredBooks = filterBooksByTags(allBooks, activeReadingTags);
        const previewCount = getNativeReadingPreviewCount(allBooks, activeReadingTags, this._nativeLibraryTotal);
        const patch = {
          readingFilterTags: buildReadingFilterTags(allBooks),
          readingFilterGroups: buildReadingFilterGroups(allBooks, activeReadingTags),
          readingFilterPreviewCount: previewCount
        };
        if (activeReadingTags.length) {
          patch.books = sliceBooksForDisplay(filteredBooks, BOOK_PAGE_SIZE);
          patch.visibleBookCount = BOOK_PAGE_SIZE;
          patch.hasMoreBooks = filteredBooks.length > BOOK_PAGE_SIZE;
          patch.error = filteredBooks.length ? "" : `没有匹配的 ${buildFilterLabel(activeReadingTags)} 图书`;
        } else {
          patch.hasMoreBooks = allBooks.length > BOOK_PAGE_SIZE;
        }
        this.setData(patch);
        return allBooks;
      })
      .catch(() => null)
      .finally(() => {
        this._nativeFullLibraryFilterPromise = null;
      });
    return this._nativeFullLibraryFilterPromise;
  },

  prefetchNativeBooksFirstPage() {
    if (this._nativeBooksFirstPagePreloadPromise) return this._nativeBooksFirstPagePreloadPromise;
    this._nativeBooksFirstPagePreloadPromise = preloadNativeReadingFirstPage()
      .then(() => {
        const currentData = this.data || {};
        const currentBooks = Array.isArray(currentData.books) ? currentData.books : [];
        if (!currentData.useExternalLibrarySource && !currentBooks.length) this.renderNativeBooksFirstPageFromCache();
      })
      .catch(() => null)
      .finally(() => {
        this._nativeBooksFirstPagePreloadPromise = null;
      });
    return this._nativeBooksFirstPagePreloadPromise;
  },

  cacheExternalLibraryFirstPage(response) {
    const books = normalizeExternalLibraryBooks(response);
    this._externalLibraryFirstPageCache = {
      response,
      books,
      total: getExternalLibraryTotal(response, books.length),
      current: getExternalLibraryCurrent(response, 1),
      pages: getExternalLibraryPages(response)
    };
    cacheExternalLibraryFirstPageResponse(response);
    return this._externalLibraryFirstPageCache;
  },

  hydrateExternalLibraryFirstPageCacheFromStorage() {
    if (this._externalLibraryFirstPageCache) return this._externalLibraryFirstPageCache;
    try {
      if (!wx.getStorageSync) return null;
      const cached = wx.getStorageSync(EXTERNAL_BOOK_LIBRARY_FIRST_PAGE_CACHE_KEY);
      if (!cached || typeof cached !== "object" || Array.isArray(cached)) return null;
      const cache = this.cacheExternalLibraryFirstPage(cached);
      return Array.isArray(cache.books) && cache.books.length ? cache : null;
    } catch (_error) {
      return null;
    }
  },

  prefetchExternalLibraryFirstPage() {
    if (this._externalLibraryFirstPageCache) return Promise.resolve(this._externalLibraryFirstPageCache.response);
    if (this._externalLibraryFirstPagePreloadPromise) return this._externalLibraryFirstPagePreloadPromise;
    this._externalLibraryFirstPagePreloadPromise = preloadExternalReadingLibrary()
      .then((response) => {
        this.cacheExternalLibraryFirstPage(response);
        return response;
      })
      .catch(() => null)
      .finally(() => {
        this._externalLibraryFirstPagePreloadPromise = null;
      });
    return this._externalLibraryFirstPagePreloadPromise;
  },

  renderExternalLibraryFirstPageFromCache() {
    const cache = this._externalLibraryFirstPageCache || this.hydrateExternalLibraryFirstPageCacheFromStorage();
    if (!cache || !Array.isArray(cache.books) || !cache.books.length) return false;
    const activeReadingTags = [];
    this.allBooks = cache.books;
    cacheExternalBookLibraryRecords(cache.books);
    this._externalLibraryCurrentPage = cache.current;
    this._externalLibraryPages = cache.pages;
    this._externalLibraryTotal = cache.total;
    this._externalLibraryUnfilteredTotal = cache.total;
    this.setData({
      books: cache.books,
      visibleBookCount: BOOK_PAGE_SIZE,
      hasMoreBooks: cache.books.length < cache.total,
      readingFilterTags: buildReadingFilterTags(cache.books),
      readingFilterGroups: this.getExternalLibraryFilterGroups(activeReadingTags),
      readingFilterPreviewCount: cache.total,
      loading: false,
      refreshing: false,
      hasCache: true,
      error: ""
    });
    this.prefetchExternalLibraryFilters(activeReadingTags);
    return true;
  },

  loadBooks(options = {}) {
    const showRefreshing = !!options.showRefreshing;
    const currentData = this.data || {};
    const currentBooks = Array.isArray(currentData.books) ? currentData.books : [];
    const useExternalLibrarySource = !!currentData.useExternalLibrarySource;
    const requestId = (this._readingSourceRequestId || 0) + 1;
    this._readingSourceRequestId = requestId;
    this._externalLibraryKeyword = "";
    const activeReadingTags = normalizeFilterTags(currentData.activeReadingTags || currentData.activeReadingTag);
    const useNativePagedRequest = !useExternalLibrarySource && !activeReadingTags.length;
    this.setData({
      loading: !currentBooks.length,
      refreshing: showRefreshing,
      error: ""
    });

    const booksRequest = useExternalLibrarySource
      ? activeReadingTags.length
        ? loadExternalLibraryFirstPage(activeReadingTags)
        : preloadExternalReadingLibrary()
      : useNativePagedRequest
        ? loadNativeReadingPage(1)
        : preloadNativeReadingBooks();

    return booksRequest
      .then((response) => {
        if (this._readingSourceRequestId !== requestId) return;
        if (!response) throw { message: "请求失败" };
        const responseRecords = useNativePagedRequest && Array.isArray(response && response.records)
          ? response.records
          : response;
        let allBooks = normalizeBookResponse(responseRecords, useExternalLibrarySource);
        if (!useExternalLibrarySource) allBooks = mergeCachedNativeBookDescriptions(allBooks);
        const activeReadingTagLabel = buildFilterLabel(activeReadingTags);
        const filteredBooks = useExternalLibrarySource ? allBooks : filterBooksByTags(allBooks, activeReadingTags);
        const books = sliceBooksForDisplay(filteredBooks, BOOK_PAGE_SIZE);
        const externalTotal = useExternalLibrarySource ? getExternalLibraryTotal(response, filteredBooks.length) : filteredBooks.length;
        const nativeTotal = useNativePagedRequest ? Math.max(allBooks.length, Number(response && response.total) || allBooks.length) : filteredBooks.length;
        if (useNativePagedRequest) {
          this._nativeLibraryCurrentPage = Math.max(1, Number(response && response.current) || 1);
          this._nativeLibraryPages = Math.max(1, Number(response && response.pages) || Math.ceil(nativeTotal / BOOK_PAGE_SIZE));
          this._nativeLibraryTotal = nativeTotal;
        }
        this.allBooks = allBooks;
        if (useExternalLibrarySource) {
          if (!activeReadingTags.length) this.cacheExternalLibraryFirstPage(response);
          cacheExternalBookLibraryRecords(allBooks);
          this._externalLibraryCurrentPage = getExternalLibraryCurrent(response, 1);
          this._externalLibraryPages = getExternalLibraryPages(response);
          this._externalLibraryTotal = externalTotal;
          if (!activeReadingTags.length) this._externalLibraryUnfilteredTotal = externalTotal;
          if (hasExternalLibraryFilterGroupOptions(response && response.filterGroups)) this._externalLibraryFilterGroups = response.filterGroups;
        }
        this.setData({
          books,
          visibleBookCount: BOOK_PAGE_SIZE,
          hasMoreBooks: useExternalLibrarySource
            ? books.length < externalTotal
            : useNativePagedRequest
              ? this._nativeLibraryCurrentPage < this._nativeLibraryPages && books.length < nativeTotal
              : filteredBooks.length > BOOK_PAGE_SIZE,
          readingFilterTags: buildReadingFilterTags(allBooks),
          readingFilterGroups: useExternalLibrarySource
            ? this.getExternalLibraryFilterGroups(activeReadingTags)
            : buildReadingFilterGroups(allBooks, activeReadingTags),
          readingFilterPreviewCount: useExternalLibrarySource ? externalTotal : useNativePagedRequest ? nativeTotal : filteredBooks.length,
          loading: false,
          refreshing: false,
          hasCache: false,
          error: books.length
            ? ""
            : activeReadingTagLabel
              ? `没有匹配的 ${activeReadingTagLabel} 图书`
              : "暂时没有可展示的图书"
        });
        if (allBooks.length && !useExternalLibrarySource) {
          if (useNativePagedRequest) cacheNativeBooksFirstPageResponse(allBooks, nativeTotal);
          else wx.setStorageSync(BOOK_CACHE_KEY, allBooks);
        }
        if (!useExternalLibrarySource) this.hydrateNativeBookListDescriptions(books);
        if (useNativePagedRequest) return;
        if (useExternalLibrarySource) this.prefetchExternalLibraryFilters(activeReadingTags);
      })
      .catch((error) => {
        if (this._readingSourceRequestId !== requestId) return;
        const fallbackData = this.data || {};
        const fallbackBooks = Array.isArray(fallbackData.books) ? fallbackData.books : [];
        this.setData({
          loading: false,
          refreshing: false,
          hasCache: false,
          error: fallbackBooks.length ? "" : (error && error.message) || "图书加载失败，请稍后重试"
        });
      });
  },

  onPullDownRefresh() {
    this.loadBooks({ showRefreshing: true }).then(() => {
      if (typeof wx.stopPullDownRefresh === "function") wx.stopPullDownRefresh();
    }).catch(() => {
      if (typeof wx.stopPullDownRefresh === "function") wx.stopPullDownRefresh();
    });
  },

  loadMoreBooks() {
    if (this.data.useExternalLibrarySource) {
      return this.loadMoreExternalLibraryBooks();
    }
    const activeReadingTags = normalizeFilterTags(this.data.activeReadingTags || this.data.activeReadingTag);
    const currentPage = Math.max(1, Number(this._nativeLibraryCurrentPage) || 1);
    const totalPages = Math.max(1, Number(this._nativeLibraryPages) || 1);
    if (!activeReadingTags.length && currentPage < totalPages) {
      if (this._nativeLibraryLoadingMore) return this._nativeLibraryLoadingMore;
      const requestId = this._readingSourceRequestId;
      const loadedBooks = Array.isArray(this.allBooks) ? this.allBooks : [];
      this._nativeLibraryLoadingMore = loadNativeReadingPage(currentPage + 1)
        .then((response) => {
          if (this._readingSourceRequestId !== requestId || this.data.useExternalLibrarySource) return;
          const nextBooks = mergeCachedNativeBookDescriptions(normalizeBooks(response && response.records));
          const seen = new Set(loadedBooks.map((book) => book && book.id).filter(Boolean));
          const mergedBooks = loadedBooks.concat(nextBooks.filter((book) => {
            if (!book || !book.id || seen.has(book.id)) return false;
            seen.add(book.id);
            return true;
          }));
          const nextCurrent = Math.max(currentPage + 1, Number(response && response.current) || currentPage + 1);
          const nextPages = Math.max(totalPages, Number(response && response.pages) || totalPages);
          const nextTotal = Math.max(mergedBooks.length, Number(response && response.total) || Number(this._nativeLibraryTotal) || mergedBooks.length);
          this.allBooks = mergedBooks;
          this._nativeLibraryCurrentPage = nextCurrent;
          this._nativeLibraryPages = nextPages;
          this._nativeLibraryTotal = nextTotal;
          this.setData({
            books: mergedBooks,
            visibleBookCount: mergedBooks.length,
            hasMoreBooks: nextCurrent < nextPages && mergedBooks.length < nextTotal,
            readingFilterTags: buildReadingFilterTags(mergedBooks),
            readingFilterGroups: buildReadingFilterGroups(mergedBooks, []),
            readingFilterPreviewCount: nextTotal
          });
          try {
            wx.setStorageSync(BOOK_CACHE_KEY, mergedBooks);
            cacheNativeBooksFirstPageResponse(mergedBooks, nextTotal);
          } catch (_error) {}
          return this.hydrateNativeBookListDescriptions(nextBooks);
        })
        .catch(() => {})
        .finally(() => {
          this._nativeLibraryLoadingMore = null;
        });
      return this._nativeLibraryLoadingMore;
    }
    const source = this.getReadingSource();
    const filteredBooks = filterBooksByTags(source, activeReadingTags);
    const currentCount = Math.max(BOOK_PAGE_SIZE, Number(this.data.visibleBookCount) || this.data.books.length || BOOK_PAGE_SIZE);
    const nextCount = Math.min(filteredBooks.length, currentCount + BOOK_PAGE_SIZE);
    if (nextCount <= currentCount) {
      this.setData({ hasMoreBooks: false });
      return;
    }
    const books = sliceBooksForDisplay(filteredBooks, nextCount);
    this.setData({
      visibleBookCount: nextCount,
      hasMoreBooks: nextCount < filteredBooks.length,
      books
    });
    return this.hydrateNativeBookListDescriptions(books);
  },

  loadMoreExternalLibraryBooks() {
    if (this._externalLibraryLoadingMore) return;
    const currentPage = Math.max(1, Number(this._externalLibraryCurrentPage) || 1);
    const totalPages = Math.max(1, Number(this._externalLibraryPages) || 1);
    const loadedBooks = Array.isArray(this.allBooks) ? this.allBooks : [];
    const total = Math.max(loadedBooks.length, Number(this._externalLibraryTotal) || loadedBooks.length);
    if (currentPage >= totalPages || loadedBooks.length >= total) {
      this.setData({ hasMoreBooks: false });
      return;
    }

    this._externalLibraryLoadingMore = true;
    const requestId = this._readingSourceRequestId;
    const activeReadingTags = normalizeFilterTags(this.data.activeReadingTags || this.data.activeReadingTag);
    const keyword = String(this._externalLibraryKeyword || "").trim();
    return loadExternalLibraryPage(currentPage + 1, activeReadingTags, EXTERNAL_LIBRARY_PAGE_SIZE, { keyword })
      .then((response) => {
        if (this._readingSourceRequestId !== requestId || !this.data.useExternalLibrarySource) return;
        const nextBooks = normalizeExternalLibraryBooks(response);
        const seen = new Set(loadedBooks.map((book) => book && book.id).filter(Boolean));
        const mergedBooks = loadedBooks.concat(nextBooks.filter((book) => {
          if (!book || !book.id || seen.has(book.id)) return false;
          seen.add(book.id);
          return true;
        }));
        cacheExternalBookLibraryRecords(mergedBooks);
        const nextTotal = getExternalLibraryTotal(response, mergedBooks.length);
        const nextCurrent = getExternalLibraryCurrent(response, currentPage + 1);
        const nextPages = getExternalLibraryPages(response);
        this.allBooks = mergedBooks;
        this._externalLibraryCurrentPage = nextCurrent;
        this._externalLibraryPages = nextPages;
        this._externalLibraryTotal = nextTotal;
        this.setData({
          books: mergedBooks,
          visibleBookCount: mergedBooks.length,
          hasMoreBooks: nextCurrent < nextPages && mergedBooks.length < nextTotal,
          readingFilterPreviewCount: nextTotal
        });
      })
      .catch(() => {})
      .finally(() => {
        this._externalLibraryLoadingMore = false;
      });
  },

  onReachBottom() {
    this.loadMoreBooks();
  },

  openBook(event) {
    const index = Number(event.currentTarget.dataset.index);
    const book = this.data.books[index];
    if (!book) return;
    if (openMiniProgramShortLink(book.miniProgramShortLink)) return;
    if (!book.detailEnabled) {
      wx.showToast({ title: "暂无详情", icon: "none" });
      return;
    }
    const externalBookId = book.externalDetailPayload && book.externalDetailPayload.id
      ? String(book.externalDetailPayload.id).trim()
      : "";
    if (externalBookId && book.externalStoredDetail) {
      try {
        wx.setStorageSync(externalBookDetailCacheKey(externalBookId), book.externalStoredDetail);
      } catch (_error) {}
    } else {
      cacheBookDetailPayload(book);
    }
    if (this.data.useExternalLibrarySource) cacheExternalBookLibraryRecords(this.allBooks || this.data.books);
    const params = book.externalDetailPayload
      ? { xf_external_book: JSON.stringify(book.externalDetailPayload), xf_external_book_id: externalBookId }
      : undefined;
    openWeb(book.path, book.title, params);
  },

  openFullList() {
    openWeb(WEB_ROUTES.reading, "家长先疯及阅");
  },

  toggleReadingLibrarySource() {
    const useExternalLibrarySource = !this.data.useExternalLibrarySource;
    this.persistPreferredReadingSource(useExternalLibrarySource);
    this._externalLibraryKeyword = "";
    const hasTargetCache = useExternalLibrarySource
      ? !!(this._externalLibraryFirstPageCache || this.hydrateExternalLibraryFirstPageCacheFromStorage())
      : false;
    this._readingSourceRequestId = (this._readingSourceRequestId || 0) + 1;
    this._externalLibraryCurrentPage = 1;
    this._externalLibraryPages = 1;
    this._externalLibraryTotal = 0;
    this._externalLibraryUnfilteredTotal = 0;
    this._externalLibraryPreviewRequestId = 0;
    this._externalLibraryFilterGroups = [];
    const nextData = {
      useExternalLibrarySource,
      activeReadingTag: "",
      activeReadingTags: [],
      draftReadingTags: [],
      activeReadingTagLabel: "",
      visibleBookCount: BOOK_PAGE_SIZE,
      hasMoreBooks: false,
      hasCache: false
    };
    if (!hasTargetCache) {
      this.allBooks = [];
      Object.assign(nextData, {
        allBooks: [],
        books: [],
        readingFilterTags: [],
        readingFilterGroups: []
      });
    }
    this.setData(nextData);
    if (useExternalLibrarySource) {
      if (this.renderExternalLibraryFirstPageFromCache()) {
        this.loadBooks({ showRefreshing: false });
        return Promise.resolve();
      }
      if (this._externalLibraryFirstPagePreloadPromise) {
        const requestId = this._readingSourceRequestId;
        this._externalLibraryFirstPagePreloadPromise.then(() => {
          if (this._readingSourceRequestId !== requestId || !this.data.useExternalLibrarySource) return;
          if (this.renderExternalLibraryFirstPageFromCache()) this.loadBooks({ showRefreshing: false });
          else this.loadBooks({ showRefreshing: true });
        });
        return Promise.resolve();
      }
    }
    return this.loadBooks({ showRefreshing: true });
  },

  goProgramsHome() {
    navigateProgramsHome();
  },

  openSearch() {
    openNativeSearch("", {
      readingSource: "native"
    });
  },

  ...readingFilterDrawerMethods,

  getReadingSource() {
    return Array.isArray(this.allBooks) && this.allBooks.length
      ? this.allBooks
      : this.data.books;
  },

  getExternalLibraryPreviewCount(tags, fallback) {
    const normalizedTags = normalizeFilterTags(tags);
    const activeTags = normalizeFilterTags(this.data.activeReadingTags || this.data.activeReadingTag);
    if (!normalizedTags.length) {
      return Number(this._externalLibraryUnfilteredTotal || this._externalLibraryTotal || fallback || 0);
    }
    if (sameFilterTags(normalizedTags, activeTags)) {
      return Number(this._externalLibraryTotal || fallback || 0);
    }
    return Number(fallback || 0);
  },

  getExternalLibraryFilterGroups(selectedTags) {
    const groups = normalizeExternalLibraryFilterGroups(this._externalLibraryFilterGroups, selectedTags);
    if (groups.length) return groups;
    return buildExternalLibraryFallbackFilterGroups(this.allBooks || this.data.books, this._externalLibraryTotal || this._externalLibraryUnfilteredTotal, selectedTags);
  },

  updateExternalLibraryPreviewCount(tags) {
    const previewRequestId = (this._externalLibraryPreviewRequestId || 0) + 1;
    this._externalLibraryPreviewRequestId = previewRequestId;
    const normalizedTags = normalizeFilterTags(tags);
    return loadExternalLibraryPreview(normalizedTags)
      .then((response) => {
        if (this._externalLibraryPreviewRequestId !== previewRequestId || !this.data.useExternalLibrarySource) return;
        const total = getExternalLibraryTotal(response, normalizeExternalLibraryBooks(response).length);
        if (!normalizedTags.length) this._externalLibraryUnfilteredTotal = total;
        if (hasExternalLibraryFilterGroupOptions(response && response.filterGroups)) this._externalLibraryFilterGroups = response.filterGroups;
        this.setData({
          readingFilterPreviewCount: total,
          readingFilterGroups: this.getExternalLibraryFilterGroups(normalizedTags)
        });
      })
      .catch(() => {});
  },

  prefetchExternalLibraryFilters(tags) {
    if (!this.data.useExternalLibrarySource) return Promise.resolve();
    return this.updateExternalLibraryPreviewCount(tags);
  },

  openFilterDrawer() {
    const source = this.getReadingSource();
    const draftReadingTags = normalizeFilterTags(this.data.activeReadingTags || this.data.activeReadingTag);
    const useExternalLibrarySource = !!this.data.useExternalLibrarySource;
    if (useExternalLibrarySource) {
      readingFilterDrawerMethods.openFilterDrawer.call(this);
      this.setData({
        draftReadingTags,
        isReadingFilterAllSelected: !draftReadingTags.length,
        readingFilterPreviewCount: this.getExternalLibraryPreviewCount(draftReadingTags, 0),
        readingFilterGroups: this.getExternalLibraryFilterGroups(draftReadingTags)
      });
      return this.updateExternalLibraryPreviewCount(draftReadingTags).then(() => {
        this.setData({
          draftReadingTags,
          isReadingFilterAllSelected: !draftReadingTags.length,
          readingFilterPreviewCount: this.getExternalLibraryPreviewCount(draftReadingTags, 0),
          readingFilterGroups: this.getExternalLibraryFilterGroups(draftReadingTags)
        });
      });
    }
    setSettingsTabbarHidden(this, true);
    readingFilterDrawerMethods.openFilterDrawer.call(this);
    const updateNativeDrawer = () => {
      const nextSource = this.getReadingSource();
      const nativeTotal = Number(this._nativeLibraryTotal || 0);
      const previewCount = getNativeReadingPreviewCount(nextSource, draftReadingTags, nativeTotal);
      this.setData({
        draftReadingTags,
        isReadingFilterAllSelected: !draftReadingTags.length,
        readingFilterPreviewCount: previewCount,
        readingFilterGroups: buildReadingFilterGroups(nextSource, draftReadingTags)
      });
    };
    updateNativeDrawer();
    if (source.length <= BOOK_PAGE_SIZE && Number(this._nativeLibraryTotal || 0) > source.length) {
      return this.prefetchNativeFullLibraryForFilters().then(updateNativeDrawer);
    }
  },

  closeFilterDrawer() {
    setSettingsTabbarHidden(this, false);
    readingFilterDrawerMethods.closeFilterDrawer.call(this);
  },

  onDrawerReadingTagTap(event) {
    const tag = String((event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.tag) || "").trim();
    if (!tag) return;
    const source = this.getReadingSource();
    const useExternalLibrarySource = !!this.data.useExternalLibrarySource;
    const normalized = normalizeFilterTag(tag);
    const draftReadingTags = normalizeFilterTags(this.data.draftReadingTags);
    const nextTags = draftReadingTags.indexOf(normalized) >= 0
      ? draftReadingTags.filter((item) => item !== normalized)
      : draftReadingTags.concat(normalized);
    const currentPreviewCount = Number(this.data.readingFilterPreviewCount || 0);
    this.setData({
      draftReadingTags: nextTags,
      isReadingFilterAllSelected: !nextTags.length,
      readingFilterPreviewCount: useExternalLibrarySource
        ? this.getExternalLibraryPreviewCount(nextTags, currentPreviewCount)
        : getNativeReadingPreviewCount(source, nextTags, this._nativeLibraryTotal),
      readingFilterGroups: useExternalLibrarySource
        ? this.getExternalLibraryFilterGroups(nextTags)
        : buildReadingFilterGroups(source, nextTags)
    });
    if (useExternalLibrarySource) return this.updateExternalLibraryPreviewCount(nextTags);
  },

  onReadingTagTap(event) {
    const tag = String(event.currentTarget.dataset.tag || "").trim();
    if (!tag) return;
    this.applyReadingTagFilter(tag);
  },

  applyReadingTagFilter(tag) {
    const normalized = normalizeFilterTag(tag);
    const activeReadingTags = normalizeFilterTags(this.data.activeReadingTags || this.data.activeReadingTag);
    const nextTags = this.data.useExternalLibrarySource
      ? (activeReadingTags.indexOf(normalized) >= 0
        ? activeReadingTags.filter((item) => item !== normalized)
        : activeReadingTags.concat(normalized))
      : (activeReadingTags.indexOf(normalized) >= 0 ? [] : [normalized]);
    this.applyReadingTagFilters(nextTags);
  },

  applyReadingTagFilters(tags) {
    const activeReadingTags = normalizeFilterTags(tags);
    const activeReadingTag = activeReadingTags.length ? `#${activeReadingTags[0]}` : "";
    const activeReadingTagLabel = buildFilterLabel(activeReadingTags);
    if (this.data.useExternalLibrarySource) {
      this._externalLibraryKeyword = "";
      this.setData({
        activeReadingTag,
        activeReadingTags,
        draftReadingTags: activeReadingTags,
        activeReadingTagLabel,
        isReadingFilterAllSelected: !activeReadingTags.length,
        readingFilterGroups: this.getExternalLibraryFilterGroups(activeReadingTags),
        visibleBookCount: BOOK_PAGE_SIZE,
        refreshing: true,
        error: ""
      });
      return this.loadBooks({ showRefreshing: true }).then(() => {
        this.scrollBelowSearchPanel();
      });
    }
    const source = this.getReadingSource();
    const books = filterBooksByTags(source, activeReadingTags);
    const nativePreviewCount = getNativeReadingPreviewCount(source, activeReadingTags, this._nativeLibraryTotal);
    const visibleBooks = sliceBooksForDisplay(books, BOOK_PAGE_SIZE);
    this.setData({
      activeReadingTag,
      activeReadingTags,
      draftReadingTags: activeReadingTags,
      activeReadingTagLabel,
      isReadingFilterAllSelected: !activeReadingTags.length,
      readingFilterPreviewCount: nativePreviewCount,
      readingFilterGroups: buildReadingFilterGroups(source, activeReadingTags),
      visibleBookCount: BOOK_PAGE_SIZE,
      hasMoreBooks: activeReadingTags.length
        ? books.length > BOOK_PAGE_SIZE
        : nativePreviewCount > BOOK_PAGE_SIZE,
      books: visibleBooks,
      error: books.length || !activeReadingTagLabel ? "" : `没有匹配的 ${activeReadingTagLabel} 图书`
    });
    this.scrollBelowSearchPanel();
  },

  applyReadingKeywordFilter(keyword) {
    const query = String(keyword || "").trim();
    if (!query) return Promise.resolve(false);
    if (this.data.useExternalLibrarySource) {
      const requestId = this._readingSourceRequestId;
      this._externalLibraryKeyword = query;
      this.setData({
        activeReadingTag: "",
        activeReadingTags: [],
        draftReadingTags: [],
        activeReadingTagLabel: query,
        isReadingFilterAllSelected: true,
        visibleBookCount: BOOK_PAGE_SIZE,
        loading: !((this.data.books || []).length),
        refreshing: true,
        error: ""
      });
      return loadExternalLibraryPage(1, [], EXTERNAL_LIBRARY_PAGE_SIZE, { keyword: query })
        .then((response) => {
          if (this._readingSourceRequestId !== requestId || !this.data.useExternalLibrarySource) return false;
          const allBooks = normalizeExternalLibraryBooks(response);
          const books = sliceBooksForDisplay(allBooks, BOOK_PAGE_SIZE);
          const total = getExternalLibraryTotal(response, allBooks.length);
          this.allBooks = allBooks;
          cacheExternalBookLibraryRecords(allBooks);
          this._externalLibraryCurrentPage = getExternalLibraryCurrent(response, 1);
          this._externalLibraryPages = getExternalLibraryPages(response);
          this._externalLibraryTotal = total;
          this.setData({
            books,
            readingFilterPreviewCount: total,
            readingFilterGroups: this.getExternalLibraryFilterGroups([]),
            visibleBookCount: BOOK_PAGE_SIZE,
            hasMoreBooks: books.length < total,
            loading: false,
            refreshing: false,
            error: books.length ? "" : `没有匹配的 ${query} 图书`
          });
          this.scrollBelowSearchPanel();
          return true;
        })
        .catch(() => {
          if (this._readingSourceRequestId !== requestId) return false;
          this.setData({
            loading: false,
            refreshing: false,
            error: `没有匹配的 ${query} 图书`
          });
          return false;
        });
    }
    const runFilter = (sourceBooks) => {
      const source = Array.isArray(sourceBooks) && sourceBooks.length ? sourceBooks : this.getReadingSource();
      const books = filterBooksByKeyword(source, query);
      const visibleBooks = sliceBooksForDisplay(books, BOOK_PAGE_SIZE);
      this.setData({
        activeReadingTag: "",
        activeReadingTags: [],
        draftReadingTags: [],
        activeReadingTagLabel: query,
        isReadingFilterAllSelected: true,
        readingFilterPreviewCount: books.length,
        readingFilterGroups: this.data.useExternalLibrarySource
          ? this.getExternalLibraryFilterGroups([])
          : buildReadingFilterGroups(source, []),
        visibleBookCount: BOOK_PAGE_SIZE,
        hasMoreBooks: books.length > BOOK_PAGE_SIZE,
        books: visibleBooks,
        loading: false,
        refreshing: false,
        error: books.length ? "" : `没有匹配的 ${query} 图书`
      });
      this.hydrateNativeBookListDescriptions(visibleBooks);
      this.scrollBelowSearchPanel();
      return true;
    };

    if (!this.data.useExternalLibrarySource) {
      const source = this.getReadingSource();
      if (source.length <= BOOK_PAGE_SIZE && typeof this.prefetchNativeFullLibraryForFilters === "function") {
        this.setData({ loading: !source.length, refreshing: true, error: "" });
        return this.prefetchNativeFullLibraryForFilters().then((allBooks) => runFilter(allBooks || this.getReadingSource()));
      }
    }
    return Promise.resolve(runFilter(this.getReadingSource()));
  },

  consumePendingReadingFilter() {
    let pending = null;
    try {
      pending = wx.getStorageSync(READING_PENDING_FILTER_KEY);
      wx.setStorageSync(READING_PENDING_FILTER_KEY, "");
    } catch (_error) {
      pending = null;
    }
    const rawTag = typeof pending === "string" ? pending : pending && pending.tag;
    const rawKeyword = pending && pending.keyword;
    const keyword = String(rawKeyword || "").trim();
    const source = pending && pending.source === "external" && !keyword ? "external" : "native";
    if (keyword) {
      const useExternalLibrarySource = source === "external";
      this.persistPreferredReadingSource(useExternalLibrarySource);
      if (this.data.useExternalLibrarySource !== useExternalLibrarySource) {
        this.allBooks = [];
        this.setData({
          useExternalLibrarySource,
          allBooks: [],
          books: [],
          activeReadingTag: "",
          activeReadingTags: [],
          draftReadingTags: [],
          activeReadingTagLabel: keyword,
          readingFilterTags: [],
          readingFilterGroups: [],
          readingFilterPreviewCount: 0,
          visibleBookCount: BOOK_PAGE_SIZE,
          hasMoreBooks: false,
          hasCache: false,
          loading: true,
          refreshing: true,
          error: ""
        });
      }
      return this.applyReadingKeywordFilter(keyword);
    }
    const tag = source === "external"
      ? normalizeExternalLibraryTag(rawTag)
      : normalizeFilterTag(rawTag);
    if (!tag) return Promise.resolve(false);

    const useExternalLibrarySource = source === "external";
    this.persistPreferredReadingSource(useExternalLibrarySource);
    const currentBooks = Array.isArray(this.data.books) ? this.data.books : [];
    const hasLoadedReadingSource = (Array.isArray(this.allBooks) && this.allBooks.length) || currentBooks.length;
    if (this.data.useExternalLibrarySource === useExternalLibrarySource && (useExternalLibrarySource || hasLoadedReadingSource)) {
      return Promise.resolve(this.applyReadingTagFilters([tag]));
    }

    this.allBooks = [];
    this._readingSourceRequestId = (this._readingSourceRequestId || 0) + 1;
    this._externalLibraryCurrentPage = 1;
    this._externalLibraryPages = 1;
    this._externalLibraryTotal = 0;
    this._externalLibraryUnfilteredTotal = 0;
    this._externalLibraryPreviewRequestId = 0;
    this._externalLibraryFilterGroups = [];
    const activeReadingTags = [tag];
    this.setData({
      useExternalLibrarySource,
      allBooks: [],
      books: [],
      activeReadingTag: `#${tag}`,
      activeReadingTags,
      draftReadingTags: activeReadingTags,
      activeReadingTagLabel: buildFilterLabel(activeReadingTags),
      isReadingFilterAllSelected: false,
      readingFilterTags: [],
      readingFilterGroups: useExternalLibrarySource
        ? this.getExternalLibraryFilterGroups(activeReadingTags)
        : [],
      readingFilterPreviewCount: 0,
      visibleBookCount: BOOK_PAGE_SIZE,
      hasMoreBooks: false,
      hasCache: false,
      loading: true,
      refreshing: true,
      error: ""
    });
    return this.loadBooks({ showRefreshing: true }).then(() => {
      this.scrollBelowSearchPanel();
      return true;
    });
  },

  resetReadingFilterDraft() {
    const source = this.getReadingSource();
    const useExternalLibrarySource = !!this.data.useExternalLibrarySource;
    this.setData({
      draftReadingTags: [],
      isReadingFilterAllSelected: true,
      readingFilterPreviewCount: useExternalLibrarySource
        ? this.getExternalLibraryPreviewCount([], 0)
        : getNativeReadingPreviewCount(source, [], this._nativeLibraryTotal),
      readingFilterGroups: useExternalLibrarySource
        ? this.getExternalLibraryFilterGroups([])
        : buildReadingFilterGroups(source, [])
    });
    if (useExternalLibrarySource) this.updateExternalLibraryPreviewCount([]);
  },

  applyReadingFilterDraft() {
    this.closeFilterDrawer();
    return this.applyReadingTagFilters(this.data.draftReadingTags);
  },

  clearReadingTagFilter() {
    const source = this.getReadingSource();
    setSettingsTabbarHidden(this, false);
    if (this.data.useExternalLibrarySource) {
      this._externalLibraryKeyword = "";
      this.setData({
        activeReadingTag: "",
        activeReadingTags: [],
        draftReadingTags: [],
        activeReadingTagLabel: "",
        isReadingFilterAllSelected: true,
        readingFilterPreviewCount: this.getExternalLibraryPreviewCount([], 0),
        readingFilterGroups: this.getExternalLibraryFilterGroups([]),
        filterDrawerOpen: false,
        visibleBookCount: BOOK_PAGE_SIZE,
        refreshing: true,
        error: ""
      });
      return this.loadBooks({ showRefreshing: true }).then(() => {
        this.scrollBelowSearchPanel();
      });
    }
    this.setData({
      activeReadingTag: "",
      activeReadingTags: [],
      draftReadingTags: [],
      activeReadingTagLabel: "",
      isReadingFilterAllSelected: true,
      readingFilterPreviewCount: getNativeReadingPreviewCount(source, [], this._nativeLibraryTotal),
      readingFilterGroups: buildReadingFilterGroups(source, []),
      filterDrawerOpen: false,
      visibleBookCount: BOOK_PAGE_SIZE,
      hasMoreBooks: getNativeReadingPreviewCount(source, [], this._nativeLibraryTotal) > BOOK_PAGE_SIZE,
      books: sliceBooksForDisplay(source, BOOK_PAGE_SIZE),
      error: ""
    });
    this.scrollBelowSearchPanel();
  },

  ...createNativeSettingsMethods(),

  retryLoad() {
    this.loadBooks();
  },

  onShareAppMessage() {
    return pageShare.onShareAppMessage();
  },

  onShareTimeline() {
    return pageShare.onShareTimeline();
  }
});
