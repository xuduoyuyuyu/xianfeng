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

const BOOK_CACHE_KEY = "xf_native_books_cache";
const BOOK_VIEW_MODE_KEY = "xf_native_books_view_mode";
const BOOK_PAGE_SIZE = 24;
const LOGO_HEIGHT_RPX = 56;
const SEARCH_PANEL_HEIGHT_RPX = 114;
const TOP_CARD_GAP_RPX = 24;
const BOOK_FILTER_TAG_LIMIT = 18;

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

function firstText(values, fallback) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return fallback;
}

function formatDate(value) {
  const source = String(value || "").trim();
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  return `${match[1]}/${Number(match[2])}/${Number(match[3])}`;
}

function pushTag(tags, value) {
  const text = String(value || "").trim();
  if (text && tags.indexOf(text) < 0 && tags.length < 4) tags.push(text);
}

function normalizeBook(book) {
  const item = book || {};
  const id = String(item._id || "").trim();
  const title = firstText([item.title], "未命名书籍");
  const author = firstText([item.author], "作者未标注");
  const recommenderTag = item.recommendedGuest ? `推荐：${String(item.recommendedGuest).trim()}` : "";
  const fieldTags = [];
  pushTag(fieldTags, item.grade);
  pushTag(fieldTags, item.categoryLabel);
  pushTag(fieldTags, item.topic);
  const displayTags = fieldTags.map((tag) => `#${tag}`);
  const gradeTag = normalizeFilterTag(item.grade);
  const topicTags = [item.categoryLabel, item.topic]
    .map(normalizeFilterTag)
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index);

  return {
    id: id || title,
    title,
    author,
    publisher: firstText([item.publisher], ""),
    sourceName: firstText([item.sourceName], ""),
    date: formatDate(item.publishedAt || item.createdAt),
    coverImage: normalizeImage(item.coverImage || item.metadataCover),
    description: firstText([
      item.sourceName ? `来自《${item.sourceName}》的推荐书目` : "",
      item.publisher ? `${author} / ${item.publisher}` : author
    ], "打开详情继续查看推荐信息"),
    detailEnabled: !!item.hasMetadataDetail,
    recommenderTag,
    fieldTags,
    displayTags,
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
    return {
      ...item,
      gradeTag: normalizeFilterTag(item.gradeTag || item.grade || fieldTags.find(isReadingGradeTag) || ""),
      topicTags: normalizeTopicTags(item.topicTags || fieldTags.filter((tag) => !isReadingGradeTag(tag)))
    };
  }
  const tags = Array.isArray(item.tags) ? item.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
  const recommenderTag = tags.find((tag) => tag.indexOf("推荐：") === 0) || "";
  const fieldTags = tags.filter((tag) => tag !== recommenderTag).map((tag) => tag.replace(/^#/, ""));
  const displayTags = fieldTags.map((tag) => `#${tag}`);
  return {
    ...item,
    recommenderTag,
    fieldTags,
    displayTags,
    gradeTag: normalizeFilterTag(item.gradeTag || item.grade || fieldTags.find(isReadingGradeTag) || ""),
    topicTags: normalizeTopicTags(item.topicTags || fieldTags.filter((tag) => !isReadingGradeTag(tag)))
  };
}

function normalizeFilterTag(value) {
  return String(value || "").trim().replace(/^#/, "");
}

function normalizeTopicTags(values) {
  const source = Array.isArray(values) ? values : [values];
  return source
    .map(normalizeFilterTag)
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index);
}

function isReadingGradeTag(value) {
  const text = normalizeFilterTag(value);
  return /^(通用|小学|中学|初中|高中|学前|幼儿园|[一二三四五六七八九十]+年级)$/.test(text);
}

function normalizeFilterTags(values) {
  const source = Array.isArray(values) ? values : [values];
  return source
    .map(normalizeFilterTag)
    .filter(Boolean)
    .filter((tag, index, list) => list.indexOf(tag) === index);
}

function buildFilterLabel(tags) {
  return normalizeFilterTags(tags).join("、");
}

function filterBooksByTags(books, tags) {
  const targets = normalizeFilterTags(tags);
  if (!targets.length) return books;
  return books.filter((book) => {
    const fieldTags = Array.isArray(book.fieldTags) ? book.fieldTags : [];
    return fieldTags.some((item) => targets.indexOf(normalizeFilterTag(item)) >= 0);
  });
}

const READING_GRADE_ORDER = [
  "学前",
  "幼儿园",
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

function compareReadingGrade(a, b) {
  const indexA = READING_GRADE_ORDER.indexOf(a);
  const indexB = READING_GRADE_ORDER.indexOf(b);
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

function buildReadingFilterGroups(books, selectedTags = []) {
  const gradeValues = [];
  const topicValues = [];
  for (const book of Array.isArray(books) ? books : []) {
    pushOptionValue(gradeValues, book && book.gradeTag);
    const topicTags = Array.isArray(book && book.topicTags) ? book.topicTags : [];
    for (const tag of topicTags) pushOptionValue(topicValues, tag);
  }
  gradeValues.sort(compareReadingGrade);
  return [
    { key: "grade", title: "年级", options: toReadingOptions(gradeValues, selectedTags) },
    { key: "topic", title: "主题", options: toReadingOptions(topicValues, selectedTags).slice(0, BOOK_FILTER_TAG_LIMIT) }
  ].filter((group) => group.options.length);
}

function buildReadingFilterTags(books) {
  return buildReadingFilterGroups(books).flatMap((group) => group.options).slice(0, BOOK_FILTER_TAG_LIMIT);
}

function bookDisplayPriority(book, index) {
  const hasCover = !!book.coverImage;
  const hasDetail = !!book.detailEnabled;
  let score = 0;
  if (hasCover && hasDetail) score = 4;
  else if (hasCover) score = 3;
  else if (hasDetail) score = 2;
  else score = 1;
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
    this.syncTopbarMetrics();
    startSearchPromptRotation(this);
    this.syncAccountEntry();
    this.loadCachedBooks();
    this.loadBooks();
  },

  onReady() {
    this.scrollBelowSearchPanel();
  },

  onShow() {
    enableShareMenu();
    setSelectedTab(this, 1);
    this.syncTopbarMetrics();
    this.syncAccountEntry();
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

  switchBookViewMode() {
    const compactMode = !this.data.compactMode;
    this.setData({ compactMode });
    try {
      wx.setStorageSync(BOOK_VIEW_MODE_KEY, compactMode ? "compact" : "feature");
    } catch (_error) {}
  },

  loadCachedBooks() {
    try {
      const cached = wx.getStorageSync(BOOK_CACHE_KEY);
      if (!Array.isArray(cached) || !cached.length) return;
      const allBooks = cached.map(normalizeCachedBook);
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
        loading: false,
        error: books.length || !activeReadingTagLabel ? "" : `没有匹配的 ${activeReadingTagLabel} 书单`,
        hasCache: true
      });
    } catch (_error) {}
  },

  loadBooks(options = {}) {
    const showRefreshing = !!options.showRefreshing;
    const currentData = this.data || {};
    const currentBooks = Array.isArray(currentData.books) ? currentData.books : [];
    this.setData({
      loading: !currentBooks.length,
      refreshing: showRefreshing,
      error: ""
    });

    return request({ url: "/api/books" })
      .then((response) => {
        const allBooks = normalizeBooks(response);
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
          loading: false,
          refreshing: false,
          hasCache: false,
          error: books.length
            ? ""
            : activeReadingTagLabel
              ? `没有匹配的 ${activeReadingTagLabel} 书单`
              : "暂时没有可展示的书单"
        });
        if (allBooks.length) wx.setStorageSync(BOOK_CACHE_KEY, allBooks);
      })
      .catch((error) => {
        const fallbackData = this.data || {};
        const fallbackBooks = Array.isArray(fallbackData.books) ? fallbackData.books : [];
        this.setData({
          loading: false,
          refreshing: false,
          hasCache: false,
          error: fallbackBooks.length ? "" : (error && error.message) || "书单加载失败，请稍后重试"
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
    const source = this.getReadingSource();
    const activeReadingTags = normalizeFilterTags(this.data.activeReadingTags || this.data.activeReadingTag);
    const filteredBooks = filterBooksByTags(source, activeReadingTags);
    const currentCount = Math.max(BOOK_PAGE_SIZE, Number(this.data.visibleBookCount) || this.data.books.length || BOOK_PAGE_SIZE);
    const nextCount = Math.min(filteredBooks.length, currentCount + BOOK_PAGE_SIZE);
    if (nextCount <= currentCount) {
      this.setData({ hasMoreBooks: false });
      return;
    }
    this.setData({
      visibleBookCount: nextCount,
      hasMoreBooks: nextCount < filteredBooks.length,
      books: sliceBooksForDisplay(filteredBooks, nextCount)
    });
  },

  onReachBottom() {
    this.loadMoreBooks();
  },

  openBook(event) {
    const index = Number(event.currentTarget.dataset.index);
    const book = this.data.books[index];
    if (!book) return;
    if (!book.detailEnabled) {
      wx.showToast({ title: "暂无详情", icon: "none" });
      return;
    }
    openWeb(book.path, book.title);
  },

  openFullList() {
    openWeb(WEB_ROUTES.reading, "家长先疯及阅");
  },

  goProgramsHome() {
    navigateProgramsHome();
  },

  openSearch() {
    openNativeSearch();
  },

  ...readingFilterDrawerMethods,

  getReadingSource() {
    return Array.isArray(this.allBooks) && this.allBooks.length
      ? this.allBooks
      : this.data.books;
  },

  openFilterDrawer() {
    const source = this.getReadingSource();
    const draftReadingTags = normalizeFilterTags(this.data.activeReadingTags || this.data.activeReadingTag);
    setSettingsTabbarHidden(this, true);
    readingFilterDrawerMethods.openFilterDrawer.call(this);
    this.setData({
      draftReadingTags,
      isReadingFilterAllSelected: !draftReadingTags.length,
      readingFilterPreviewCount: filterBooksByTags(source, draftReadingTags).length,
      readingFilterGroups: buildReadingFilterGroups(source, draftReadingTags)
    });
  },

  closeFilterDrawer() {
    setSettingsTabbarHidden(this, false);
    readingFilterDrawerMethods.closeFilterDrawer.call(this);
  },

  onDrawerReadingTagTap(event) {
    const tag = String((event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.tag) || "").trim();
    if (!tag) return;
    const source = this.getReadingSource();
    const normalized = normalizeFilterTag(tag);
    const draftReadingTags = normalizeFilterTags(this.data.draftReadingTags);
    const nextTags = draftReadingTags.indexOf(normalized) >= 0
      ? draftReadingTags.filter((item) => item !== normalized)
      : draftReadingTags.concat(normalized);
    this.setData({
      draftReadingTags: nextTags,
      isReadingFilterAllSelected: !nextTags.length,
      readingFilterPreviewCount: filterBooksByTags(source, nextTags).length,
      readingFilterGroups: buildReadingFilterGroups(source, nextTags)
    });
  },

  onReadingTagTap(event) {
    const tag = String(event.currentTarget.dataset.tag || "").trim();
    if (!tag) return;
    this.applyReadingTagFilter(tag);
  },

  applyReadingTagFilter(tag) {
    const normalized = normalizeFilterTag(tag);
    const activeReadingTags = normalizeFilterTags(this.data.activeReadingTags || this.data.activeReadingTag);
    const nextTags = activeReadingTags.indexOf(normalized) >= 0 ? [] : [normalized];
    this.applyReadingTagFilters(nextTags);
  },

  applyReadingTagFilters(tags) {
    const activeReadingTags = normalizeFilterTags(tags);
    const activeReadingTag = activeReadingTags.length ? `#${activeReadingTags[0]}` : "";
    const activeReadingTagLabel = buildFilterLabel(activeReadingTags);
    const source = this.getReadingSource();
    const books = filterBooksByTags(source, activeReadingTags);
    const visibleBooks = sliceBooksForDisplay(books, BOOK_PAGE_SIZE);
    this.setData({
      activeReadingTag,
      activeReadingTags,
      draftReadingTags: activeReadingTags,
      activeReadingTagLabel,
      isReadingFilterAllSelected: !activeReadingTags.length,
      readingFilterPreviewCount: books.length,
      readingFilterGroups: buildReadingFilterGroups(source, activeReadingTags),
      visibleBookCount: BOOK_PAGE_SIZE,
      hasMoreBooks: books.length > BOOK_PAGE_SIZE,
      books: visibleBooks,
      error: books.length || !activeReadingTagLabel ? "" : `没有匹配的 ${activeReadingTagLabel} 书单`
    });
    this.scrollBelowSearchPanel();
  },

  resetReadingFilterDraft() {
    const source = this.getReadingSource();
    this.setData({
      draftReadingTags: [],
      isReadingFilterAllSelected: true,
      readingFilterPreviewCount: source.length,
      readingFilterGroups: buildReadingFilterGroups(source, [])
    });
  },

  applyReadingFilterDraft() {
    this.closeFilterDrawer();
    this.applyReadingTagFilters(this.data.draftReadingTags);
  },

  clearReadingTagFilter() {
    const source = this.getReadingSource();
    setSettingsTabbarHidden(this, false);
    this.setData({
      activeReadingTag: "",
      activeReadingTags: [],
      draftReadingTags: [],
      activeReadingTagLabel: "",
      isReadingFilterAllSelected: true,
      readingFilterPreviewCount: source.length,
      readingFilterGroups: buildReadingFilterGroups(source, []),
      filterDrawerOpen: false,
      visibleBookCount: BOOK_PAGE_SIZE,
      hasMoreBooks: source.length > BOOK_PAGE_SIZE,
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
