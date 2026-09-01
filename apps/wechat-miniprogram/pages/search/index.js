const { DEFAULT_WEB_ORIGIN } = require("../../utils/config");
const { request } = require("../../utils/request");
const { copyTextSilently } = require("../../utils/clipboard");
const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { goProgramsHome: navigateProgramsHome, smartBackHome } = require("../../utils/nativePageNav");
const { SETTINGS_SECTIONS, createNativeSettingsMethods } = require("../../utils/nativeSettings");
const { DEFAULT_SEARCH_PROMPTS, getInitialSearchPrompt, startSearchPromptRotation, stopSearchPromptRotation } = require("../../utils/searchPrompts");
const { getSearchAnalyticsSessionId } = require("../../utils/searchAnalyticsIdentity");

const SEARCH_HISTORY_KEY = "xf_native_search_history";
const SEARCH_ANALYTICS_IDLE_MS = 800;
const READING_PENDING_FILTER_KEY = "xf_reading_pending_filter_v1";
const SEARCH_PAGE_SIZE = 80;
const EXTERNAL_SEARCH_PAGE_SIZE = 20;
const SEARCH_INPUT_DEBOUNCE_MS = 450;
const LOGO_HEIGHT_RPX = 56;
const GUEST_FALLBACK_AVATAR = "/assets/wel-avatar/no-hat.png";
const MATERIAL_SHARE_CANVAS_ID = "searchMaterialsShareCanvas";
const MATERIAL_SHARE_CANVAS_WIDTH = 750;
const MATERIAL_SHARE_CANVAS_HEIGHT = 600;
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

function truncateMaterialShareText(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

function splitMaterialShareText(value, maxLength, maxLines) {
  const text = String(value || "").trim();
  const lines = [];
  for (let index = 0; index < text.length && lines.length < maxLines; index += maxLength) {
    lines.push(text.slice(index, index + maxLength));
  }
  if (text.length > maxLength * maxLines && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, Math.max(1, maxLength - 1))}…`;
  }
  return lines;
}

function drawMaterialShareRoundRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
  ctx.fill();
}

function drawShareText(ctx, text, x, y, fontSize, color, bold = false) {
  ctx.setFillStyle(color);
  ctx.setFontSize(fontSize);
  ctx.font = `${bold ? "bold " : ""}${fontSize}px sans-serif`;
  ctx.fillText(text, x, y);
}

function drawMaterialShareCanvas(ctx, material) {
  const title = truncateMaterialShareText(material && material.title, 26) || "资料";
  const url = String((material && material.fileUrl) || "").trim();
  const domainMatch = url.match(/^https?:\/\/([^/]+)/i);
  const domain = String((domainMatch && domainMatch[1]) || "").toUpperCase();
  const urlLines = splitMaterialShareText(url, 38, 2);

  ctx.setFillStyle("#f8f6fc");
  ctx.fillRect(0, 0, MATERIAL_SHARE_CANVAS_WIDTH, MATERIAL_SHARE_CANVAS_HEIGHT);

  ctx.setFillStyle("#7824ef");
  drawMaterialShareRoundRect(ctx, 42, 34, 52, 52, 26);
  drawShareText(ctx, "疯", 53, 72, 27, "#ffffff", true);
  drawShareText(ctx, "家和万事｜服务家庭 智慧决策", 112, 70, 27, "#6d6878", false);

  ctx.setFillStyle("#ffffff");
  drawMaterialShareRoundRect(ctx, 38, 106, 674, 408, 24);
  drawShareText(ctx, title, 66, 158, 31, "#211631", true);
  ctx.setFillStyle("#f3edff");
  drawMaterialShareRoundRect(ctx, 66, 180, 128, 40, 20);
  drawShareText(ctx, "资料分享", 84, 208, 21, "#6f2be8", true);
  drawShareText(ctx, "点击复制资料链接，在浏览器或网盘 App 中继续打开", 66, 270, 22, "#777184");
  drawShareText(ctx, domain || "资料链接", 66, 318, 22, "#6f2be8", true);

  ctx.setFillStyle("rgba(31, 24, 43, 0.46)");
  ctx.fillRect(0, 0, MATERIAL_SHARE_CANVAS_WIDTH, MATERIAL_SHARE_CANVAS_HEIGHT);

  ctx.setFillStyle("#ffffff");
  drawMaterialShareRoundRect(ctx, 60, 176, 630, 300, 28);
  drawShareText(ctx, "资料链接", 92, 238, 32, "#24163a", true);
  ctx.setFillStyle("#f3edff");
  drawMaterialShareRoundRect(ctx, 618, 198, 48, 48, 24);
  drawShareText(ctx, "×", 632, 234, 32, "#5e17eb", false);
  drawShareText(ctx, title, 92, 294, 26, "#4e3d66", true);
  ctx.setFillStyle("#f7f7fb");
  drawMaterialShareRoundRect(ctx, 88, 326, 574, 104, 18);
  urlLines.forEach((line, index) => {
    drawShareText(ctx, line, 110, 365 + index * 34, 21, "#65718a", true);
  });
  drawShareText(ctx, "点击链接即可复制", 92, 458, 20, "#8c8398", false);
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

function getMaterialResultId(result) {
  if (!result || result.type !== "materials") return "";
  const matched = String(result.path || "").match(/^\/materials\/([^/?#]+)$/);
  return matched ? normalizeSearchOption(matched[1]) : "";
}

function openMiniProgramShortLink(value) {
  const shortLink = String(value || "").trim();
  if (!/^#小程序:\/\//u.test(shortLink)) return false;
  if (typeof wx.navigateToMiniProgram !== "function") {
    copyTextSilently(shortLink);
    return true;
  }
  wx.navigateToMiniProgram({
    shortLink,
    fail(error) {
      if (/cancel/i.test(String(error && error.errMsg || ""))) return;
      copyTextSilently(shortLink);
    }
  });
  return true;
}

function buildNativeResultRoute(result) {
  const item = result || {};
  const path = String(item.path || "").trim();
  const title = String(item.title || "家长先疯").trim() || "家长先疯";
  const topicMatch = item.type === "topics" ? path.match(/^\/topics\/([^/?#]+)$/) : null;
  if (topicMatch) {
    return `/pages/webview/index?nativeTopic=1&topicSlug=${encodeURIComponent(decodeURIComponent(topicMatch[1]))}&title=${encodeURIComponent(title)}`;
  }
  if (["programs", "books", "materials", "experts"].includes(item.type) && path) {
    return `/pages/webview/index?url=${encodeURIComponent(path)}&title=${encodeURIComponent(title)}`;
  }
  return "";
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
      path: id ? `/materials/${encodeURIComponent(id)}` : "",
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

function normalizeSearchResponse(response, bookResults) {
  const data = response || {};
  const books = Array.isArray(bookResults) ? bookResults : normalizeBooks(data.books || []);
  return []
    .concat(normalizePrograms({ programs: data.programs || [] }))
    .concat(books)
    .concat(normalizeMaterials(data.materials || []))
    .concat(normalizeTopics({ topics: data.topics || [] }))
    .concat(normalizeGuests({ guests: data.experts || [] }));
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

function createSearchAnalyticsId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function searchResultCounts(results) {
  const counts = { programs: 0, books: 0, materials: 0, topics: 0, experts: 0 };
  (Array.isArray(results) ? results : []).forEach((item) => {
    if (Object.prototype.hasOwnProperty.call(counts, item && item.type)) {
      counts[item.type] += 1;
    }
  });
  return counts;
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
    searchProgress: 0,
    error: "",
    materialLinkModalOpen: false,
    materialLinkModalId: "",
    materialLinkModalTitle: "",
    materialLinkModalUrl: "",
    materialShareImageUrl: ""
  },

  onLoad(options) {
    enableShareMenu();
    this.syncTopbarMetrics();
    this.syncAccountEntry();
    startSearchPromptRotation(this);
    const query = String(options && options.q ? decodeURIComponent(options.q) : "").trim();
    const requestedTab = normalizeSearchOption(options && options.tab);
    const activeTab = BASE_TABS.some((tab) => tab.key === requestedTab) ? requestedTab : "all";
    this.pendingSharedMaterialId = normalizeSearchOption(options && options.materialId);
    this.resetSearchAnalyticsIntent(query);
    const readingSource = normalizeSearchOption(options && options.readingSource) === "external"
      ? "external"
      : "native";
    this.setData({
      searchInput: query,
      submittedQuery: query,
      recentKeywords: readHistory(),
      searchSource: "",
      activeTab,
      readingSource,
      inputFocus: true
    });
    this.loadData().then(() => {
      if (query) this.applySearch(query);
    });
  },

  onReady() {
    this.setData({ inputFocus: false }, () => {
      this.setData({ inputFocus: true });
    });
  },

  onShow() {
    enableShareMenu();
    this.syncTopbarMetrics();
    this.syncAccountEntry();
  },

  onUnload() {
    clearTimeout(this._searchInputTimer);
    clearTimeout(this._searchAnalyticsTimer);
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
    const query = String(this.data.searchInput || this.data.submittedQuery || "").trim();
    if (!query) {
      this.setData({ loading: false, searchProgress: 0, error: "" });
      return Promise.resolve();
    }
    this.setData({ loading: true, searchProgress: 12, error: "", submittedQuery: query });
    if (this.data.searchSource !== "reading" && this.data.readingSource !== "external") {
      return request({ url: `/api/search?q=${encodeURIComponent(query)}` })
        .then((response) => {
          if (this._searchLoadGeneration !== loadGeneration) return;
          const allResults = normalizeSearchResponse(response);
          this.setData({ allResults, loading: false, searchProgress: 100, error: "" });
          this.applySearch(query);
          this.scheduleSearchAnalytics(query, allResults.filter((item) => resultMatches(item, query)));
        })
        .catch((error) => {
          if (this._searchLoadGeneration !== loadGeneration) return;
          return this.loadLegacySearchData(loadGeneration, query);
        });
    }
    if (this.data.searchSource !== "reading") {
      let summaryResponse = null;
      let externalBooks = [];
      let completedRequests = 0;
      let failedRequests = 0;
      const publishPartialResults = () => {
        if (this._searchLoadGeneration !== loadGeneration) return;
        const allResults = normalizeSearchResponse(summaryResponse, externalBooks);
        this.setData({
          allResults,
          searchProgress: 12 + completedRequests * 38,
          error: ""
        });
        this.applySearch(query);
      };
      const summaryRequest = request({ url: `/api/search?q=${encodeURIComponent(query)}` })
        .then((response) => {
          summaryResponse = response;
          completedRequests += 1;
          publishPartialResults();
          return response;
        })
        .catch(() => {
          failedRequests += 1;
          completedRequests += 1;
          publishPartialResults();
          return null;
        });
      const externalBooksRequest = request({
        url: `/api/books/external?current=1&size=${EXTERNAL_SEARCH_PAGE_SIZE}&q=${encodeURIComponent(query)}`
      }).then(normalizeExternalBooks)
        .then((books) => {
          externalBooks = books;
          completedRequests += 1;
          publishPartialResults();
          return books;
        })
        .catch(() => {
          failedRequests += 1;
          completedRequests += 1;
          publishPartialResults();
          return [];
        });
      return Promise.all([summaryRequest, externalBooksRequest])
        .then(([response, externalBooks]) => {
          if (this._searchLoadGeneration !== loadGeneration) return;
          const allResults = normalizeSearchResponse(response, externalBooks);
          this.setData({
            allResults,
            loading: false,
            searchProgress: 100,
            error: !allResults.length && failedRequests ? "搜索内容加载失败，请稍后重试" : ""
          });
          this.applySearch(query);
          this.scheduleSearchAnalytics(query, allResults.filter((item) => resultMatches(item, query)));
        })
        .catch((error) => {
          if (this._searchLoadGeneration !== loadGeneration) return;
          this.setData({
            loading: false,
            searchProgress: 100,
            error: (error && error.message) || "搜索内容加载失败，请稍后重试"
          });
        });
    }
    if (this.data.searchSource === "reading") {
      const booksRequest = this.data.readingSource === "external"
        ? request({
          url: `/api/books/external?current=1&size=${EXTERNAL_SEARCH_PAGE_SIZE}&q=${encodeURIComponent(query)}`
        }).then(normalizeExternalBooks)
        : request({ url: "/api/books" }).then(normalizeBooks);
      return booksRequest.then((allResults) => {
        if (this._searchLoadGeneration !== loadGeneration) return;
        this.setData({
          allResults,
          loading: false,
          searchProgress: 100,
          error: ""
        });
        if (this.data.submittedQuery) this.applySearch(this.data.submittedQuery);
        this.scheduleSearchAnalytics(query, allResults.filter((item) => resultMatches(item, query)));
      }).catch((error) => {
        if (this._searchLoadGeneration !== loadGeneration) return;
        this.setData({
          loading: false,
          searchProgress: 100,
          error: (error && error.message) || "搜索内容加载失败，请稍后重试"
        });
      });
    }
    return this.loadLegacySearchData(loadGeneration, query);
  },

  loadLegacySearchData(loadGeneration, query) {
    const booksRequest = this.data.readingSource === "external"
      ? request({
        url: `/api/books/external?current=1&size=${EXTERNAL_SEARCH_PAGE_SIZE}&q=${encodeURIComponent(query)}`
      }).then(normalizeExternalBooks).catch(() => [])
      : request({ url: "/api/books" }).then(normalizeBooks).catch(() => []);
    const resultGroups = [[], [], [], [], []];
    let completedGroups = 0;
    const publishGroup = (index, results) => {
      if (this._searchLoadGeneration !== loadGeneration) return results;
      resultGroups[index] = Array.isArray(results) ? results : [];
      completedGroups += 1;
      const allResults = [].concat(resultGroups[0], resultGroups[1], resultGroups[2], resultGroups[3], resultGroups[4]);
      this.setData({ allResults, searchProgress: Math.round((completedGroups / resultGroups.length) * 100), error: "" });
      if (this.data.submittedQuery) this.applySearch(this.data.submittedQuery);
      this.scheduleSearchAnalytics(query, allResults.filter((item) => resultMatches(item, query)));
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
        searchProgress: 100,
        error: allResults.length ? "" : "搜索内容加载失败，请稍后重试"
      });
      if (this.data.submittedQuery) this.applySearch(this.data.submittedQuery);
    }).catch((error) => {
      if (this._searchLoadGeneration !== loadGeneration) return;
      this.setData({
        loading: false,
        searchProgress: 100,
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
    this.openSharedMaterialIfReady(filteredResults);
  },

  resetSearchResults() {
    this.setData({
      submittedQuery: "",
      activeTab: "all",
      filteredResults: [],
      visibleResults: [],
      tabs: buildTabs([])
    });
    this.resetSearchAnalyticsIntent("");
  },

  onSearchInput(event) {
    const value = String(event && event.detail && event.detail.value || "");
    const query = value.trim();
    const previousQuery = String(this.data.searchInput || "").trim();
    if (query !== previousQuery) this.resetSearchAnalyticsIntent(query);
    this.setData({ searchInput: value, activeTab: "all" });
    if (!query) {
      clearTimeout(this._searchInputTimer);
      this.resetSearchResults();
      return;
    }
    this.setData({ submittedQuery: query });
    this.applySearch(query);
    clearTimeout(this._searchInputTimer);
    this._searchInputTimer = setTimeout(() => this.loadData(), SEARCH_INPUT_DEBOUNCE_MS);
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
    this.resetSearchAnalyticsIntent(query);
    const recentKeywords = saveHistory(query);
    this.setData({
      activeTab: "all",
      recentKeywords
    });
    clearTimeout(this._searchInputTimer);
    this.loadData();
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
    this.resetSearchAnalyticsIntent(keyword);
    const recentKeywords = saveHistory(keyword);
    this.setData({
      searchInput: keyword,
      activeTab: "all",
      recentKeywords
    });
    clearTimeout(this._searchInputTimer);
    this.loadData();
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

  resetSearchAnalyticsIntent(query) {
    clearTimeout(this._searchAnalyticsTimer);
    this._searchAnalyticsQuery = String(query || "").trim();
    this._searchAnalyticsClientEventId = this._searchAnalyticsQuery ? createSearchAnalyticsId("search") : "";
    this._searchAnalyticsServerEventId = "";
    this._searchAnalyticsPromise = null;
  },

  scheduleSearchAnalytics(query, results) {
    const normalizedQuery = String(query || "").trim();
    if (!normalizedQuery || !this._searchAnalyticsClientEventId || this._searchAnalyticsQuery !== normalizedQuery) return;
    clearTimeout(this._searchAnalyticsTimer);
    const clientEventId = this._searchAnalyticsClientEventId;
    this._searchAnalyticsTimer = setTimeout(() => {
      const currentQuery = String(this.data.searchInput || this.data.submittedQuery || "").trim();
      if (currentQuery !== normalizedQuery || this._searchAnalyticsClientEventId !== clientEventId) return;
      this.recordSearchAnalytics(normalizedQuery, results);
    }, SEARCH_ANALYTICS_IDLE_MS);
    if (this._searchAnalyticsTimer && typeof this._searchAnalyticsTimer.unref === "function") {
      this._searchAnalyticsTimer.unref();
    }
  },

  recordSearchAnalytics(query, results) {
    const normalizedQuery = String(query || "").trim();
    const clientEventId = this._searchAnalyticsClientEventId;
    if (!normalizedQuery || !clientEventId || this._searchAnalyticsQuery !== normalizedQuery) return Promise.resolve("");
    if (this._searchAnalyticsServerEventId) return Promise.resolve(this._searchAnalyticsServerEventId);
    if (this._searchAnalyticsPromise) return this._searchAnalyticsPromise;
    const sessionId = getSearchAnalyticsSessionId();
    this._searchAnalyticsPromise = request({
      url: "/api/search/events",
      method: "POST",
      data: {
        clientEventId,
        sessionId,
        query: normalizedQuery,
        resultCounts: searchResultCounts(results)
      }
    }).then((response) => {
      const eventId = String(response && response.eventId || "").trim();
      if (this._searchAnalyticsClientEventId === clientEventId) {
        this._searchAnalyticsServerEventId = eventId;
      }
      return eventId;
    }).catch(() => "");
    return this._searchAnalyticsPromise;
  },

  trackSearchResultClick(result) {
    const query = String(this.data.submittedQuery || this.data.searchInput || "").trim();
    if (!query || !result || !result.type || !result.id) return;
    const sessionId = getSearchAnalyticsSessionId();
    this.recordSearchAnalytics(query, this.data.filteredResults).then((eventId) => {
      if (!eventId) return;
      return request({
        url: `/api/search/events/${encodeURIComponent(eventId)}/click`,
        method: "POST",
        data: {
          sessionId,
          resultType: result.type,
          resultId: result.id
        }
      }).catch(() => undefined);
    });
  },

  openResult(event) {
    const index = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index);
    const result = this.data.visibleResults[index];
    if (!result) return;
    this.trackSearchResultClick(result);
    if (openMiniProgramShortLink(result.miniProgramShortLink)) return;
    if (result.page) {
      if (result.type === "books" && result.page === "/pages/reading/index") {
        saveReadingKeyword(this.data.submittedQuery || this.data.searchInput || result.title);
      }
      wx.switchTab({ url: result.page });
      return;
    }
    if (result.type === "materials") {
      if (!result.copyUrl) {
        wx.showToast({ title: "暂无资料链接", icon: "none" });
        return;
      }
      this.setData({
        materialLinkModalOpen: true,
        materialLinkModalId: getMaterialResultId(result),
        materialLinkModalTitle: result.title,
        materialLinkModalUrl: result.copyUrl,
        materialShareImageUrl: ""
      });
      this.prepareMaterialShareImage({
        id: getMaterialResultId(result),
        title: result.title,
        fileUrl: result.copyUrl
      });
      return;
    }
    const nativeRoute = buildNativeResultRoute(result);
    if (nativeRoute) {
      wx.navigateTo({ url: nativeRoute });
      return;
    }
    if (result.copyUrl) {
      copyTextSilently(result.copyUrl);
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
    }
  },

  openSharedMaterialIfReady(results) {
    const materialId = String(this.pendingSharedMaterialId || "").trim();
    if (!materialId) return false;
    const result = (Array.isArray(results) ? results : []).find(
      (item) => getMaterialResultId(item) === materialId
    );
    if (!result || !result.copyUrl) return false;
    this.pendingSharedMaterialId = "";
    this.setData({
      materialLinkModalOpen: true,
      materialLinkModalId: materialId,
      materialLinkModalTitle: result.title,
      materialLinkModalUrl: result.copyUrl,
      materialShareImageUrl: ""
    });
    this.prepareMaterialShareImage({
      id: materialId,
      title: result.title,
      fileUrl: result.copyUrl
    });
    return true;
  },

  prepareMaterialShareImage(material) {
    if (typeof wx.createCanvasContext !== "function" || typeof wx.canvasToTempFilePath !== "function") return;
    const materialId = String((material && material.id) || "").trim();
    const ctx = wx.createCanvasContext(MATERIAL_SHARE_CANVAS_ID, this);
    drawMaterialShareCanvas(ctx, material || {});
    ctx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: MATERIAL_SHARE_CANVAS_ID,
        width: MATERIAL_SHARE_CANVAS_WIDTH,
        height: MATERIAL_SHARE_CANVAS_HEIGHT,
        destWidth: MATERIAL_SHARE_CANVAS_WIDTH * 2,
        destHeight: MATERIAL_SHARE_CANVAS_HEIGHT * 2,
        fileType: "png",
        success: (result) => {
          if (String(this.data.materialLinkModalId || "").trim() !== materialId) return;
          this.setData({ materialShareImageUrl: result.tempFilePath || "" });
        }
      }, this);
    });
  },

  closeMaterialLinkModal() {
    this.setData({
      materialLinkModalOpen: false,
      materialLinkModalId: "",
      materialLinkModalTitle: "",
      materialLinkModalUrl: "",
      materialShareImageUrl: ""
    });
  },

  copyMaterialLink() {
    copyTextSilently(this.data.materialLinkModalUrl);
  },

  noop() {},

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
    const materialId = String(this.data.materialLinkModalId || "").trim();
    if (this.data.materialLinkModalOpen && materialId) {
      return createPageShare({
        title: this.data.materialLinkModalTitle || "资料",
        path: "/pages/search/index",
        query: {
          q: this.data.submittedQuery || this.data.searchInput,
          tab: this.data.activeTab || "all",
          materialId
        },
        imageUrl: this.data.materialShareImageUrl || undefined
      }).onShareAppMessage();
    }
    return pageShare.onShareAppMessage();
  },

  onShareTimeline() {
    const materialId = String(this.data.materialLinkModalId || "").trim();
    if (this.data.materialLinkModalOpen && materialId) {
      return createPageShare({
        title: this.data.materialLinkModalTitle || "资料",
        path: "/pages/search/index",
        query: {
          q: this.data.submittedQuery || this.data.searchInput,
          tab: this.data.activeTab || "all",
          materialId
        },
        imageUrl: this.data.materialShareImageUrl || undefined
      }).onShareTimeline();
    }
    return pageShare.onShareTimeline();
  }
});
