const { DEFAULT_WEB_ORIGIN } = require("../../utils/config");
const { request } = require("../../utils/request");
const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { goProgramsHome: navigateProgramsHome, smartBackHome } = require("../../utils/nativePageNav");
const { openWeb } = require("../../utils/webview");
const { SETTINGS_SECTIONS, createNativeSettingsMethods } = require("../../utils/nativeSettings");
const { DEFAULT_SEARCH_PROMPTS, getInitialSearchPrompt, startSearchPromptRotation, stopSearchPromptRotation } = require("../../utils/searchPrompts");

const SEARCH_HISTORY_KEY = "xf_native_search_history";
const READING_PENDING_FILTER_KEY = "xf_reading_pending_filter_v1";
const SEARCH_PAGE_SIZE = 80;
const LOGO_HEIGHT_RPX = 56;
const GUEST_FALLBACK_AVATAR = "/assets/wel-avatar/no-hat.png";
const GUEST_FALLBACK_AVATAR_MARKERS = [
  "/assets/xiaowanzi-nohat.png",
  "/assets/wel-avatar/no-hat.png",
  "/assets/wel-avatar/optimized/no-hat.webp",
  "1779668991727-vzxkyx0x.png",
  "1780579648191-wkisaaid.png"
];

const BASE_TABS = [
  { key: "all", label: "全部" },
  { key: "programs", label: "节目" },
  { key: "topics", label: "请教" },
  { key: "books", label: "及阅" },
  { key: "materials", label: "资料" },
  { key: "experts", label: "智库" }
];

const TYPE_META = {
  programs: { label: "节目", icon: "节" },
  topics: { label: "请教", icon: "🙏🏻" },
  books: { label: "及阅", icon: "书", iconImage: "/assets/menu/jiyue-logo.png" },
  materials: { label: "资料", icon: "资", iconImage: "/assets/tabbar/materials.png" },
  experts: { label: "智库", icon: "人" }
};

function firstText(values, fallback) {
  for (let index = 0; index < values.length; index += 1) {
    const text = String(values[index] || "").trim();
    if (text) return text;
  }
  return fallback;
}

function normalizeImage(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  if (source.indexOf("http://xianfeng.xinzhi.info/") === 0) {
    return `${DEFAULT_WEB_ORIGIN}${source.slice("http://xianfeng.xinzhi.info".length)}`;
  }
  if (/^https?:\/\//.test(source)) return source;
  return `${DEFAULT_WEB_ORIGIN}${source.startsWith("/") ? source : `/${source}`}`;
}

function isGuestFallbackAvatar(value) {
  const source = String(value || "").trim();
  return !source || GUEST_FALLBACK_AVATAR_MARKERS.some((marker) => source.indexOf(marker) >= 0);
}

function formatDate(value) {
  const source = String(value || "").trim();
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  return `${match[1]}/${Number(match[2])}/${Number(match[3])}`;
}

function safeTags(raw, limit) {
  const max = limit || 3;
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || "").trim()).filter(Boolean).slice(0, max);
  }
  const text = String(raw || "").trim();
  if (!text) return [];
  return text.split(/[|｜,，;；\n]+/).map((item) => item.trim()).filter(Boolean).slice(0, max);
}

function normalizeSearchOption(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  try {
    return decodeURIComponent(source);
  } catch (_error) {
    return source;
  }
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

function normalizeResult(type, item) {
  const meta = TYPE_META[type] || { label: "内容", icon: "搜" };
  const tags = Array.isArray(item.tags) ? item.tags : [];
  return {
    id: `${type}-${item.id || item.title}`,
    type,
    label: meta.label,
    icon: item.icon || meta.icon,
    iconImage: item.iconImage || meta.iconImage || "",
    title: item.title || "未命名内容",
    description: item.description || "打开继续查看详情",
    meta: item.meta || "",
    tags,
    image: item.image || "",
    imageMode: item.imageMode || "aspectFill",
    imageFallback: item.imageFallback === true,
    path: item.path || "",
    page: item.page || "",
    copyUrl: item.copyUrl || "",
    miniProgramShortLink: item.miniProgramShortLink || "",
    searchText: [
      item.title,
      item.description,
      item.meta,
      tags.join(" ")
    ].join(" ").toLowerCase()
  };
}

function normalizePrograms(response) {
  const data = response || {};
  const rawItems = Array.isArray(data.programs)
    ? data.programs
    : Array.isArray(data.data)
      ? data.data
      : [];
  return rawItems.map((program) => {
    const item = program || {};
    const summary = item.summary || {};
    const id = firstText([item.programCode, item._id], "");
    const tags = Array.isArray(summary.tags) ? summary.tags.map((tag) => `#${tag}`).slice(0, 3) : [];
    return normalizeResult("programs", {
      id,
      title: firstText([item.title], "未命名节目"),
      description: firstText([item.description, summary.headline, summary.body], "打开详情继续了解本期内容"),
      meta: formatDate(item.publishedAt || item.createdAt) || "节目",
      tags,
      image: normalizeImage(item.coverImage),
      path: `/programs/${encodeURIComponent(id || item._id || "")}`
    });
  }).filter((item) => item.path);
}

function normalizeBooks(response) {
  const rawItems = Array.isArray(response) ? response : [];
  return rawItems.map((book) => {
    const item = book || {};
    const id = String(item._id || "").trim();
    const author = firstText([item.author], "");
    return normalizeResult("books", {
      id,
      title: firstText([item.title], "未命名书籍"),
      description: firstText([
        item.sourceName ? `来自《${item.sourceName}》的推荐书目` : "",
        item.publisher ? `${author} / ${item.publisher}` : author
      ], "打开详情继续查看推荐信息"),
      meta: item.grade || item.categoryLabel || "及阅",
      tags: [item.recommendedGuest ? `推荐：${item.recommendedGuest}` : "", item.grade, item.categoryLabel, item.topic].filter(Boolean).slice(0, 3),
      image: normalizeImage(item.coverImage || item.metadataCover),
      miniProgramShortLink: firstText([item.wxPurchaseLink], ""),
      path: item.hasMetadataDetail && id ? `/reading/${encodeURIComponent(id)}` : "",
      page: item.hasMetadataDetail ? "" : "/pages/reading/index"
    });
  }).filter((item) => item.id);
}

function normalizeExternalBooks(response) {
  const data = response || {};
  const rawItems = Array.isArray(data.records)
    ? data.records
    : Array.isArray(data.data)
      ? data.data
      : Array.isArray(data)
        ? data
        : [];
  return rawItems.map((book) => {
    const item = book || {};
    const id = String(item.id || item._id || "").trim();
    const author = firstText([item.author], "");
    const publisher = firstText([item.publisher], "");
    return normalizeResult("books", {
      id,
      title: firstText([item.title], "未命名书籍"),
      description: firstText([
        item.description,
        publisher ? `${author} / ${publisher}` : author
      ], "打开详情继续查看书库信息"),
      meta: author || publisher || "及阅书库",
      tags: safeTags(item.tags || item.category, 5),
      image: normalizeImage(item.coverPic || item.coverImage || item.metadataCover),
      path: id ? `/library?xf_external_book_id=${encodeURIComponent(id)}` : ""
    });
  }).filter((item) => item.id);
}

function normalizeMaterials(response) {
  const rawItems = Array.isArray(response) ? response : [];
  return rawItems.map((material) => {
    const item = material || {};
    const id = String(item._id || "").trim();
    const category = firstText([item.category], "资料");
    return normalizeResult("materials", {
      id,
      title: firstText([item.title], "未命名资料"),
      description: firstText([item.description], "点击复制资料链接，在浏览器或网盘 App 中继续打开"),
      meta: category,
      tags: safeTags([category].concat(safeTags(item.description, 2)).join("|"), 3),
      copyUrl: firstText([item.fileUrl, item.url, item.link], "")
    });
  }).filter((item) => item.id);
}

function normalizeTopics(response) {
  const data = response || {};
  const rawItems = Array.isArray(data.topics)
    ? data.topics
    : Array.isArray(data.data)
      ? data.data
      : [];
  return rawItems.map((topic) => {
    const item = topic || {};
    const slug = String(item.slug || item._id || item.id || "").trim();
    return normalizeResult("topics", {
      id: slug,
      title: firstText([item.title], "未命名话题"),
      description: firstText([item.shortSummary, item.subtitle], "打开详情继续查看完整知识树和相关回答"),
      icon: firstText([item.coverEmoji], "🙏🏻"),
      meta: "",
      tags: safeTags(item.tags, 3),
      path: `/topics/${encodeURIComponent(slug)}`
    });
  }).filter((item) => item.path);
}

function normalizeGuests(response) {
  const data = response || {};
  const rawItems = Array.isArray(data.guests)
    ? data.guests
    : Array.isArray(data.data)
      ? data.data
      : [];
  return rawItems.map((guest) => {
    const item = guest || {};
    const id = String(item._id || "").trim();
    const avatar = normalizeImage(item.avatar);
    const imageFallback = isGuestFallbackAvatar(item.avatar);
    return normalizeResult("experts", {
      id,
      title: firstText([item.name], "未命名专家"),
      description: firstText([item.bio, item.title], "先疯智库专家资料"),
      meta: item.title || "智库",
      tags: item.programCount ? [`${item.programCount}期节目`] : [],
      image: imageFallback ? GUEST_FALLBACK_AVATAR : avatar,
      imageMode: imageFallback ? "aspectFit" : "aspectFill",
      imageFallback,
      path: `/experts/${encodeURIComponent(id)}`
    });
  }).filter((item) => item.path);
}

function applyGuestFallbackAvatar(result) {
  if (!result || result.type !== "experts") return result;
  return {
    ...result,
    image: GUEST_FALLBACK_AVATAR,
    imageMode: "aspectFit",
    imageFallback: true
  };
}

function resultMatches(result, keyword) {
  const query = String(keyword || "").trim().toLowerCase();
  if (!query) return false;
  return result.searchText.indexOf(query) >= 0;
}

function buildTabs(results) {
  return BASE_TABS.map((tab) => {
    const count = tab.key === "all"
      ? results.length
      : results.filter((item) => item.type === tab.key).length;
    return {
      key: tab.key,
      label: tab.label,
      count
    };
  });
}

function readHistory() {
  try {
    const value = wx.getStorageSync(SEARCH_HISTORY_KEY);
    return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8) : [];
  } catch (_error) {
    return [];
  }
}

function saveHistory(keyword) {
  const text = String(keyword || "").trim();
  if (!text) return [];
  const next = [text].concat(readHistory().filter((item) => item !== text)).slice(0, 8);
  try {
    wx.setStorageSync(SEARCH_HISTORY_KEY, next);
  } catch (_error) {}
  return next;
}

function clearHistory() {
  try {
    if (typeof wx.removeStorageSync === "function") {
      wx.removeStorageSync(SEARCH_HISTORY_KEY);
    } else {
      wx.setStorageSync(SEARCH_HISTORY_KEY, []);
    }
  } catch (_error) {}
  return [];
}

function saveReadingKeyword(keyword) {
  const query = String(keyword || "").trim();
  if (!query) return;
  try {
    wx.setStorageSync(READING_PENDING_FILTER_KEY, {
      source: "native",
      keyword: query
    });
  } catch (_error) {}
}

const pageShare = createPageShare({
  title: "家长先疯搜索",
  path: "/pages/search/index"
});

Page({
  data: {
    settingsSections: SETTINGS_SECTIONS,
    topbarHeight: 88,
    chromeHeight: 88,
    profilePanelTop: 30,
    profileHeaderHeight: 32,
    logoTop: 10,
    logoHeight: 28,
    welfareRight: 101,
    settingsPanelOpen: false,
    settingsPanelView: "menu",
    settingsProfilePanelSupported: true,
    accountTitle: "登录/注册",
    accountSubtitle: "登录后同步档案和个性化推荐",
    accountPage: "",
    searchInput: "",
    searchPrompt: getInitialSearchPrompt(),
    submittedQuery: "",
    inputFocus: false,
    suggestions: DEFAULT_SEARCH_PROMPTS,
    recentKeywords: [],
    searchSource: "",
    readingSource: "native",
    activeTab: "all",
    tabs: buildTabs([]),
    allResults: [],
    filteredResults: [],
    visibleResults: [],
    loading: false,
    error: ""
  },

  onLoad(options) {
    enableShareMenu();
    this.syncTopbarMetrics();
    this.syncAccountEntry();
    startSearchPromptRotation(this);
    const query = String(options && options.q ? decodeURIComponent(options.q) : "").trim();
    const readingSource = normalizeSearchOption(options && options.readingSource) === "external"
      ? "external"
      : "native";
    this.setData({
      searchInput: query,
      submittedQuery: query,
      recentKeywords: readHistory(),
      searchSource: "",
      readingSource
    });
    this.loadData().then(() => {
      if (query) this.applySearch(query);
    });
  },

  onShow() {
    enableShareMenu();
    this.syncTopbarMetrics();
    this.syncAccountEntry();
  },

  onUnload() {
    stopSearchPromptRotation(this);
  },

  syncTopbarMetrics() {
    try {
      const metrics = getNativeTopbarMetrics();
      const topbarHeight = Math.max(72, Math.round(metrics.topbarHeight || 88));
      const windowWidth = Math.max(320, Number(metrics.windowWidth || 375));
      const logoHeight = Math.round((LOGO_HEIGHT_RPX * windowWidth) / 750);
      const capsuleHeight = Math.max(28, Math.round(metrics.capsuleHeight || 32));
      const searchButtonTop = Math.max(8, Math.round(metrics.searchButtonTop || 8));
      const welfareRight = Math.max(72, Math.round(metrics.capsuleRight || 96) + 5);
      this.setData({
        topbarHeight,
        chromeHeight: topbarHeight,
        profilePanelTop: searchButtonTop,
        profileHeaderHeight: capsuleHeight,
        logoHeight,
        logoTop: Math.max(0, Math.round(searchButtonTop + capsuleHeight / 2 - logoHeight / 2)),
        welfareRight
      });
    } catch (_error) {}
  },

  loadData() {
    const loadGeneration = Number(this._searchLoadGeneration || 0) + 1;
    this._searchLoadGeneration = loadGeneration;
    this.setData({ loading: true, error: "" });
    if (this.data.searchSource === "reading") {
      const booksRequest = this.data.readingSource === "external"
        ? request({ url: `/api/books/external?current=1&size=${SEARCH_PAGE_SIZE}` }).then(normalizeExternalBooks)
        : request({ url: "/api/books" }).then(normalizeBooks);
      return booksRequest.then((allResults) => {
        if (this._searchLoadGeneration !== loadGeneration) return;
        this.setData({
          allResults,
          loading: false,
          error: allResults.length ? "" : "搜索内容加载失败，请稍后重试"
        });
        if (this.data.submittedQuery) this.applySearch(this.data.submittedQuery);
      }).catch((error) => {
        if (this._searchLoadGeneration !== loadGeneration) return;
        this.setData({
          loading: false,
          error: (error && error.message) || "搜索内容加载失败，请稍后重试"
        });
      });
    }
    const booksRequest = this.data.readingSource === "external"
      ? request({ url: `/api/books/external?current=1&size=${SEARCH_PAGE_SIZE}` }).then(normalizeExternalBooks).catch(() => [])
      : request({ url: "/api/books" }).then(normalizeBooks).catch(() => []);
    const resultGroups = [[], [], [], [], []];
    const publishGroup = (index, results) => {
      if (this._searchLoadGeneration !== loadGeneration) return results;
      resultGroups[index] = Array.isArray(results) ? results : [];
      const allResults = [].concat(resultGroups[0], resultGroups[1], resultGroups[2], resultGroups[3], resultGroups[4]);
      this.setData({ allResults, error: "" });
      if (this.data.submittedQuery) this.applySearch(this.data.submittedQuery);
      return results;
    };
    const requests = [
      request({ url: `/api/programs?page=1&pageSize=${SEARCH_PAGE_SIZE}` }).then(normalizePrograms).catch(() => []),
      booksRequest,
      request({ url: "/api/learning-materials" }).then(normalizeMaterials).catch(() => []),
      request({ url: `/api/topic-hub?page=1&limit=${SEARCH_PAGE_SIZE}` }).then(normalizeTopics).catch(() => []),
      request({ url: `/api/guests?page=1&pageSize=${SEARCH_PAGE_SIZE}` }).then(normalizeGuests).catch(() => [])
    ].map((promise, index) => promise.then((results) => publishGroup(index, results)));
    return Promise.all(requests).then((groups) => {
      if (this._searchLoadGeneration !== loadGeneration) return;
      const allResults = [].concat(groups[0], groups[1], groups[2], groups[3], groups[4]);
      this.setData({
        allResults,
        loading: false,
        error: allResults.length ? "" : "搜索内容加载失败，请稍后重试"
      });
      if (this.data.submittedQuery) this.applySearch(this.data.submittedQuery);
    }).catch((error) => {
      if (this._searchLoadGeneration !== loadGeneration) return;
      this.setData({
        loading: false,
        error: (error && error.message) || "搜索内容加载失败，请稍后重试"
      });
    });
  },

  applySearch(keyword) {
    const query = String(keyword || "").trim();
    const filteredResults = this.data.allResults.filter((item) => resultMatches(item, query));
    const activeTab = BASE_TABS.some((tab) => tab.key === this.data.activeTab) ? this.data.activeTab : "all";
    const visibleResults = activeTab === "all"
      ? filteredResults
      : filteredResults.filter((item) => item.type === activeTab);
    this.setData({
      submittedQuery: query,
      filteredResults,
      visibleResults,
      tabs: buildTabs(filteredResults)
    });
  },

  resetSearchResults() {
    this.setData({
      submittedQuery: "",
      activeTab: "all",
      filteredResults: [],
      visibleResults: [],
      tabs: buildTabs([])
    });
  },

  onSearchInput(event) {
    const value = String(event && event.detail && event.detail.value || "");
    const query = value.trim();
    this.setData({ searchInput: value, activeTab: "all" });
    if (!query) {
      this.resetSearchResults();
      return;
    }
    this.applySearch(query);
  },

  focusSearchInput() {
    if (this.data.inputFocus) return;
    this.setData({ inputFocus: true });
  },

  onSearchBlur() {
    this.setData({ inputFocus: false });
  },

  submitSearch() {
    const query = String(this.data.searchInput || "").trim();
    if (!query) {
      this.resetSearchResults();
      return;
    }
    const recentKeywords = saveHistory(query);
    this.setData({
      activeTab: "all",
      recentKeywords
    });
    this.applySearch(query);
  },

  closeSearchInput() {
    this.setData({
      searchInput: "",
      inputFocus: false
    });
    this.resetSearchResults();
  },

  pickKeyword(event) {
    const keyword = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.keyword || "").trim();
    if (!keyword) return;
    const recentKeywords = saveHistory(keyword);
    this.setData({
      searchInput: keyword,
      activeTab: "all",
      recentKeywords
    });
    this.applySearch(keyword);
  },

  clearSearchHistory() {
    if (!this.data.recentKeywords.length) return;
    wx.showModal({
      title: "删除搜索记录",
      content: "确认删除全部最近搜索记录？",
      cancelText: "取消",
      confirmText: "删除",
      confirmColor: "#dc2626",
      success: (res) => {
        if (!res || !res.confirm) return;
        this.setData({
          recentKeywords: clearHistory()
        });
      }
    });
  },

  switchTab(event) {
    const tab = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.tab || "all");
    const activeTab = BASE_TABS.some((item) => item.key === tab) ? tab : "all";
    const visibleResults = activeTab === "all"
      ? this.data.filteredResults
      : this.data.filteredResults.filter((item) => item.type === activeTab);
    this.setData({
      activeTab,
      visibleResults
    });
  },

  openResult(event) {
    const index = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index);
    const result = this.data.visibleResults[index];
    if (!result) return;
    if (openMiniProgramShortLink(result.miniProgramShortLink)) return;
    if (result.page) {
      if (result.type === "books" && result.page === "/pages/reading/index") {
        saveReadingKeyword(this.data.submittedQuery || this.data.searchInput || result.title);
      }
      wx.switchTab({ url: result.page });
      return;
    }
    if (result.copyUrl) {
      wx.setClipboardData({
        data: result.copyUrl,
        success() {
          wx.showToast({ title: "链接已复制", icon: "success" });
        },
        fail() {
          wx.showToast({ title: "复制失败", icon: "none" });
        }
      });
      return;
    }
    if (result.path) {
      if (result.path === "/worthbuy") {
        wx.navigateTo({ url: "/pages/worthbuy/index" });
        return;
      }
      const worthBuyMatch = String(result.path).match(/^\/worthbuy\/(.+)$/);
      if (worthBuyMatch) {
        wx.navigateTo({ url: `/pages/worthbuy-detail/index?query=${encodeURIComponent(decodeURIComponent(worthBuyMatch[1]))}` });
        return;
      }
      openWeb(result.path, result.title);
    }
  },

  onResultImageError(event) {
    const id = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id || "");
    if (!id) return;
    const updateItem = (item) => (item && item.id === id ? applyGuestFallbackAvatar(item) : item);
    this.setData({
      allResults: this.data.allResults.map(updateItem),
      filteredResults: this.data.filteredResults.map(updateItem),
      visibleResults: this.data.visibleResults.map(updateItem)
    });
  },

  reloadData() {
    this.loadData();
  },

  goBack() {
    smartBackHome();
  },

  goProgramsHome() {
    navigateProgramsHome();
  },

  ...createNativeSettingsMethods(),

  onShareAppMessage() {
    return pageShare.onShareAppMessage();
  },

  onShareTimeline() {
    return pageShare.onShareTimeline();
  }
});
