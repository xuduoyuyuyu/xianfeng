const { request } = require("../../utils/request");
const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { setSelectedTab } = require("../../utils/tabbar");
const { goProgramsHome: navigateProgramsHome } = require("../../utils/nativePageNav");
const { getUser } = require("../../utils/session");
const { CHILD_PROFILES_KEY, WEB_CHILD_PROFILES_KEY, mergeChildProfileRecords } = require("../../utils/profileState");
const { SETTINGS_SECTIONS, createNativeSettingsMethods, setSettingsTabbarHidden } = require("../../utils/nativeSettings");
const { createFilterDrawerMethods } = require("../../utils/filterDrawer");
const { readNativeTopicDetailCache, saveNativeTopicDetailCache } = require("../../utils/nativeTopicDetailCache");

const TOPIC_CACHE_KEY = "xf_native_topics_cache";
const TOPIC_CACHE_VERSION = 3;
const TOPIC_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const INVALID_TOPIC_CACHE_KEY = "xf_native_topic_invalidated_v1";
const TOPIC_PAGE_SIZE = 10;
const TOPIC_FILTER_PAGE_SIZE = 100;
const TOPIC_DETAIL_PREFETCH_LIMIT = 1;
const TOPIC_DETAIL_PREFETCH_DELAY_MS = 300;
const LOGO_HEIGHT_RPX = 56;
const TOPIC_FILTER_TAG_LIMIT = 24;
const GUIDE_TAG_VISIBLE_LIMIT = 11;
const GUIDE_TAG_FIRST_ROW_COUNT = 5;
const GUIDE_TAG_SECOND_ROW_COUNT = 6;
const GUIDE_TAG_SHORT_LABEL_LENGTH = 2;
const LAST_CHILD_ID_KEY = "xiaowanzi_last_child_id_v1";
const ASK_SUBMIT_PROGRESS_STAGES = {
  search: { label: "检索相似话题", percent: 18, message: "正在检索是否已有相似话题..." },
  refine: { label: "AI 提炼核心问题", percent: 42, message: "正在提炼你的核心问题..." },
  validate: { label: "校验问题有效性", percent: 68, message: "正在校验问题是否适合生成..." },
  create: { label: "创建话题与知识树任务", percent: 88, message: "正在创建话题，准备生成知识树..." },
  complete: { label: "提交完成", percent: 100, message: "" }
};

function firstText(values, fallback) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return fallback;
}

function safeTags(raw) {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const source = String(raw || "").trim();
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    }
  } catch (_error) {}
  return source
    .split(/[|｜,，;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function clampProgress(value) {
  const number = Math.round(Number(value) || 0);
  if (number < 0) return 0;
  if (number > 100) return 100;
  return number;
}

function normalizeTopicProgress(item) {
  const progress = item && item.generatingProgress ? item.generatingProgress : null;
  if (!progress) {
    return { visible: false, label: "", percent: 0, canOpen: true };
  }

  const status = String(progress.status || "").trim();
  const done = Number(progress.done) || 0;
  const total = Number(progress.total) || 0;
  const percent = total > 0 ? clampProgress((done / total) * 100) : clampProgress(progress.percent || progress.progress);
  const isDone = status === "done" || status === "success" || (total > 0 && done >= total);
  const isError = status === "error" || status === "failed";
  const isProcessing = !isDone && !isError && (status === "pending" || status === "generating" || status === "parsing" || status === "running" || percent > 0);

  if (!isProcessing) {
    return { visible: false, label: "", percent: 0, canOpen: isDone };
  }

  return {
    visible: true,
    label: status === "pending" ? "等待解析" : "AI 解析中",
    percent,
    canOpen: false
  };
}

function getTopicNodeCount(item) {
  if (!item) return null;
  const explicit = Number(item.nodeCount);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  const layers = item.layers || {};
  if (layers && typeof layers === "object") {
    return Object.keys(layers).reduce((sum, key) => {
      const layer = layers[key];
      return sum + (Array.isArray(layer) ? layer.length : 0);
    }, 0);
  }
  return null;
}

function normalizeTopic(topic) {
  const item = topic || {};
  const slug = String(item.slug || "").trim();
  const id = String(item._id || item.id || "").trim();
  const tags = safeTags(item.tags);
  const subtitle = firstText([item.subtitle], "");
  const progress = normalizeTopicProgress(item);
  const status = String(item.status || "").trim();
  const nodeCount = getTopicNodeCount(item);
  const emptyGeneratedTopic = nodeCount === 0 && (status === "pending" || status === "published");
  const summary = firstText([
    item.shortSummary,
    emptyGeneratedTopic ? "话题正在生成知识树，完成后可查看详情" : "打开详情继续查看完整知识树和相关回答"
  ], emptyGeneratedTopic ? "话题正在生成知识树，完成后可查看详情" : "打开详情继续查看完整知识树和相关回答");

  return {
    id: slug || id || String(item.title || "").trim(),
    slug,
    title: firstText([item.title], "未命名话题"),
    emoji: firstText([item.coverEmoji], ""),
    progressVisible: emptyGeneratedTopic || progress.visible,
    progressLabel: emptyGeneratedTopic ? "等待解析" : progress.label,
    progressPercent: progress.percent,
    canOpen: progress.canOpen && !emptyGeneratedTopic,
    generatingProgress: item.generatingProgress || null,
    subtitle,
    summary,
    tags,
    displayTags: tags.slice(0, 3),
    status,
    gradeMatch: item.gradeMatch !== false,
    createdAt: firstText([item.createdAt], ""),
    updatedAt: firstText([item.updatedAt], ""),
    path: `/topics/${encodeURIComponent(slug || id)}`
  };
}

function applyTopicProgress(topic, generatingProgress) {
  const progress = normalizeTopicProgress({ generatingProgress });
  return {
    ...topic,
    generatingProgress: generatingProgress || null,
    progressVisible: progress.visible,
    progressLabel: progress.label,
    progressPercent: progress.percent,
    canOpen: progress.canOpen
  };
}

function normalizeTopics(response) {
  const data = response || {};
  const rawItems = Array.isArray(data.topics)
    ? data.topics
    : Array.isArray(data.data)
      ? data.data
      : [];
  return rawItems.map(normalizeTopic).filter((item) => item.id);
}

function getCurrentUserData() {
  const user = getUser();
  return typeof user === "string"
    ? (() => {
      try {
        return JSON.parse(user);
      } catch (_error) {
        return {};
      }
    })()
    : (user || {});
}

function getCurrentUserId() {
  const data = getCurrentUserData();
  return firstText([data._id, data.id, data.mobile, data.openid], "");
}

function getStoredChildren() {
  return mergeChildProfileRecords(
    wx.getStorageSync(CHILD_PROFILES_KEY),
    wx.getStorageSync(WEB_CHILD_PROFILES_KEY)
  );
}

function getCurrentChildGrade() {
  const user = getCurrentUserData();
  const directGrade = firstText([user.childGrade, user.grade], "");
  if (directGrade) return directGrade;
  const children = getStoredChildren();
  const activeId = firstText([wx.getStorageSync(LAST_CHILD_ID_KEY)], "");
  const activeChild = children.find((child) => String(child && child.id) === activeId) || children[0] || {};
  return firstText([activeChild.grade], "");
}

function getTopicRequestContext() {
  return {
    userId: getCurrentUserId(),
    grade: getCurrentChildGrade()
  };
}

function buildTopicListUrl(page, limit) {
  const context = getTopicRequestContext();
  const params = [
    `page=${encodeURIComponent(String(page))}`,
    `limit=${encodeURIComponent(String(limit))}`
  ];
  if (context.userId) params.push(`userId=${encodeURIComponent(context.userId)}`);
  if (context.grade) params.push(`grade=${encodeURIComponent(context.grade)}`);
  return `/api/topic-hub?${params.join("&")}`;
}

function buildTopicDetailUrl(slug, userId) {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return `/api/topic-hub/${encodeURIComponent(slug)}${query}`;
}

function buildTopicNodeUrl(slug, nodeKey, userId) {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return `/api/topic-hub/${encodeURIComponent(slug)}/nodes/${encodeURIComponent(nodeKey)}${query}`;
}

function getFirstTopicNodeKey(response) {
  const data = response || {};
  const topic = data.topic || data.data || data;
  const tree = Array.isArray(data.tree)
    ? data.tree
    : (Array.isArray(topic && topic.tree) ? topic.tree : []);
  for (const branch of tree) {
    const children = Array.isArray(branch && branch.children) ? branch.children : [];
    for (const node of children) {
      const nodeKey = firstText([node && node.nodeKey, node && node.id, node && node.key], "");
      if (nodeKey) return nodeKey;
    }
  }
  const layers = topic && topic.layers ? topic.layers : {};
  for (const key of Object.keys(layers)) {
    const nodes = Array.isArray(layers[key]) ? layers[key] : [];
    for (const node of nodes) {
      const nodeKey = firstText([node && node.nodeKey, node && node.id, node && node.key], "");
      if (nodeKey) return nodeKey;
    }
  }
  return "";
}

function sortTopicsForGrade(topics) {
  return (Array.isArray(topics) ? topics : []).slice().sort((a, b) => {
    const aTime = Date.parse(a && (a.createdAt || a.updatedAt) || "");
    const bTime = Date.parse(b && (b.createdAt || b.updatedAt) || "");
    const aHasTime = Number.isFinite(aTime);
    const bHasTime = Number.isFinite(bTime);
    if (aHasTime && bHasTime && aTime !== bTime) return bTime - aTime;
    if (aHasTime && !bHasTime) return -1;
    if (!aHasTime && bHasTime) return 1;
    if (a.gradeMatch && !b.gradeMatch) return -1;
    if (!a.gradeMatch && b.gradeMatch) return 1;
    return 0;
  });
}

function getCachedTopicsForCurrentContext(cached) {
  const context = getTopicRequestContext();
  if (!cached || cached.version !== TOPIC_CACHE_VERSION) return [];
  const cachedAt = Number(cached.cachedAt) || 0;
  if (!cachedAt || Date.now() - cachedAt > TOPIC_CACHE_TTL_MS) return [];
  if (String(cached.userId || "") !== context.userId) return [];
  if (String(cached.grade || "") !== context.grade) return [];
  return Array.isArray(cached.topics) ? cached.topics : [];
}

function saveTopicCache(topics) {
  const context = getTopicRequestContext();
  wx.setStorageSync(TOPIC_CACHE_KEY, {
    version: TOPIC_CACHE_VERSION,
    cachedAt: Date.now(),
    userId: context.userId,
    grade: context.grade,
    topics: Array.isArray(topics) ? topics : []
  });
}

function getRequestErrorMessage(error, fallback) {
  const data = error && error.data ? error.data : {};
  return firstText([data.message, data.error, data.reason, error && error.message], fallback);
}

function isProRequiredError(error) {
  const data = error && error.data ? error.data : {};
  return Number(error && error.statusCode) === 402 || data.code === "PRO_REQUIRED";
}

function isAuthExpiredError(error) {
  return Number(error && error.statusCode) === 401;
}

function getTopicTotalPages(response, page, itemCount, pageSize = TOPIC_PAGE_SIZE) {
  const data = response || {};
  const totalPages = Number(data.totalPages);
  if (Number.isFinite(totalPages) && totalPages > 0) return Math.max(1, Math.floor(totalPages));
  const total = Number(data.total);
  if (Number.isFinite(total) && total > 0) return Math.max(1, Math.ceil(total / pageSize));
  return itemCount < pageSize ? page : page + 1;
}

function mergeTopicsById(previous, next) {
  const seen = new Set();
  const merged = [];
  for (const item of (Array.isArray(previous) ? previous : []).concat(Array.isArray(next) ? next : [])) {
    const id = String(item && item.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  return merged;
}

function normalizeFilterTag(value) {
  return String(value || "").trim().replace(/^#/, "");
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

function filterTopicsByTags(topics, tags) {
  const targets = normalizeFilterTags(tags);
  if (!targets.length) return topics;
  return topics.filter((topic) => {
    const tags = Array.isArray(topic.tags) ? topic.tags : [];
    return tags.some((item) => targets.indexOf(normalizeFilterTag(item)) >= 0);
  });
}

function normalizeTopicKeyword(value) {
  return String(value || "").trim().toLowerCase();
}

function topicMatchesKeyword(topic, keyword) {
  const target = normalizeTopicKeyword(keyword);
  if (!target) return true;
  const source = [
    topic && topic.title,
    topic && topic.subtitle,
    topic && topic.summary,
    topic && topic.slug,
    ...(Array.isArray(topic && topic.tags) ? topic.tags : []),
    ...(Array.isArray(topic && topic.displayTags) ? topic.displayTags : [])
  ].map(normalizeTopicKeyword).filter(Boolean).join(" ");
  return source.indexOf(target) >= 0;
}

function filterTopicsForDisplay(topics, tags, keyword) {
  return filterTopicsByTags(Array.isArray(topics) ? topics : [], tags)
    .filter((topic) => topicMatchesKeyword(topic, keyword));
}

function sliceTopicsForDisplay(topics, count) {
  const limit = Math.max(TOPIC_PAGE_SIZE, Number(count) || TOPIC_PAGE_SIZE);
  return (Array.isArray(topics) ? topics : []).slice(0, limit);
}

function hasActiveTopicFilter(data) {
  const state = data || {};
  return !!(
    normalizeFilterTags(state.activeTopicTags || state.activeTopicTag).length ||
    String(state.askInput || "").trim()
  );
}

function buildNoTopicsMessage(tagLabel, keyword) {
  const text = String(keyword || "").trim();
  if (tagLabel && text) return `没有匹配的 ${tagLabel} / “${text}” 话题`;
  if (tagLabel) return `没有匹配的 ${tagLabel} 话题`;
  if (text) return `没有匹配的 “${text}” 话题`;
  return "暂时没有可展示的话题";
}

function buildTopicFilterTags(topics, selectedTags = []) {
  const selected = normalizeFilterTags(selectedTags);
  const seen = new Set();
  const tags = [];
  for (const topic of Array.isArray(topics) ? topics : []) {
    const items = Array.isArray(topic && topic.tags) ? topic.tags : [];
    for (const item of items) {
      const label = normalizeFilterTag(item);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      tags.push({ label, value: label, selected: selected.indexOf(label) >= 0 });
      if (tags.length >= TOPIC_FILTER_TAG_LIMIT) return tags;
    }
  }
  return tags;
}

function buildGuideTags(topics) {
  const seen = new Set();
  const tags = [{ label: "全部", value: "" }];
  for (const topic of Array.isArray(topics) ? topics : []) {
    const items = Array.isArray(topic && topic.tags) ? topic.tags : [];
    for (const item of items) {
      const label = normalizeFilterTag(item);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      tags.push({ label, value: label });
    }
  }
  return tags.length > 1 ? tags : [];
}

function getGuideTagLabelLength(tag) {
  return Array.from(String(tag && tag.label || "")).length;
}

function getVisibleGuideTags(tags, _expanded) {
  const source = Array.isArray(tags) ? tags : [];
  if (source.length <= GUIDE_TAG_VISIBLE_LIMIT) return source;
  const firstRow = source.slice(0, GUIDE_TAG_FIRST_ROW_COUNT);
  const secondRow = source.slice(GUIDE_TAG_FIRST_ROW_COUNT, GUIDE_TAG_VISIBLE_LIMIT);
  const shortReplacement = source
    .slice(GUIDE_TAG_VISIBLE_LIMIT)
    .find((tag) => getGuideTagLabelLength(tag) <= GUIDE_TAG_SHORT_LABEL_LENGTH);
  if (shortReplacement) {
    const replacementLength = getGuideTagLabelLength(shortReplacement);
    let replacementIndex = -1;
    for (let index = 0; index < secondRow.length; index += 1) {
      if (getGuideTagLabelLength(secondRow[index]) <= replacementLength) continue;
      if (replacementIndex < 0 || getGuideTagLabelLength(secondRow[index]) >= getGuideTagLabelLength(secondRow[replacementIndex])) {
        replacementIndex = index;
      }
    }
    if (replacementIndex >= 0) secondRow[replacementIndex] = shortReplacement;
  }
  return firstRow.concat(secondRow.slice(0, GUIDE_TAG_SECOND_ROW_COUNT));
}

function ensureTopicDisplayTags(topic) {
  if (!topic) return topic;
  if (Array.isArray(topic.displayTags)) return topic;
  const tags = Array.isArray(topic.tags) ? topic.tags : safeTags(topic.tags);
  return { ...topic, displayTags: tags.slice(0, 3), tags };
}

function sanitizeTopicPath(path) {
  const source = String(path || "").trim() || "/topics";
  const url = new URL(source.startsWith("http") ? source : `https://xianfeng.xinzhi.info${source.startsWith("/") ? source : `/${source}`}`);
  ["xf_token", "token", "secret", "userId"].forEach((key) => url.searchParams.delete(key));
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash || ""}`;
}

function buildTopicSharePath(topic) {
  const item = topic || {};
  const target = `/pages/webview/index?url=${encodeURIComponent(sanitizeTopicPath(item.path))}&title=${encodeURIComponent(item.title || "请教详情")}&topicId=${encodeURIComponent(item.id || item.slug || "")}`;
  return createPageShare({
    title: item.title || "家长先疯请教",
    path: "/pages/share/index",
    query: {
      target
    }
  });
}

function topicShareTarget(page, event) {
  const dataset = event && event.target && event.target.dataset ? event.target.dataset : {};
  const topicId = String(dataset.topicId || "").trim();
  const source = (page && page.data && Array.isArray(page.data.topics)) ? page.data.topics : [];
  return source.find((item) => item && String(item.id) === topicId) || null;
}

const pageShare = createPageShare({
  title: "家长先疯请教",
  path: "/pages/topics/index"
});
const topicFilterDrawerMethods = createFilterDrawerMethods();

Page({
  data: {
    selected: 4,
    settingsSections: SETTINGS_SECTIONS,
    topbarHeight: 88,
    chromeHeight: 88,
    searchButtonTop: 8,
    profilePanelTop: 30,
    profileHeaderHeight: 32,
    logoTop: 10,
    logoHeight: 28,
    welfareRight: 101,
    eyebrowAmp: "&",
    askInput: "",
    askSubmitting: false,
    askMessage: "",
    askMessageType: "",
    askSubmitProgressLabel: "",
    askSubmitProgressPercent: 0,
    refinedKeyword: "",
    pendingAskText: "",
    deleteTopicId: "",
    allGuideTags: [],
    guideTags: [],
    guideTagsExpanded: false,
    hasMoreGuideTags: false,
    activeTopicTag: "",
    activeTopicTags: [],
    draftTopicTags: [],
    activeTopicTagLabel: "",
    isTopicFilterAllSelected: true,
    topicFilterPreviewCount: 0,
    filterDrawerOpen: false,
    filterDrawerHeight: 0,
    filterDrawerMinHeight: 0,
    filterDrawerMaxHeight: 0,
    filterDrawerDragStartY: 0,
    filterDrawerDragStartHeight: 0,
    filterDrawerDragMode: "",
    filterDrawerExpanded: false,
    topicFilterTags: [],
    allFilterTopics: [],
    filterSourceLoaded: false,
    filterSourceLoading: false,
    allTopics: [],
    topics: [],
    visibleTopicCount: TOPIC_PAGE_SIZE,
    currentTopicPage: 1,
    totalTopicPages: 1,
    hasMoreTopics: false,
    loadingMoreTopics: false,
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
    this.syncTopbarMetrics();
    this.syncAccountEntry();
    this.loadCachedTopics();
    this.loadTopics();
  },

  onShow() {
    enableShareMenu();
    setSelectedTab(this, 4);
    this.syncTopbarMetrics();
    this.syncAccountEntry();
    this.removeInvalidatedTopic();
  },

  removeInvalidatedTopic() {
    const invalidatedId = String(wx.getStorageSync(INVALID_TOPIC_CACHE_KEY) || "").trim();
    if (!invalidatedId) return;
    wx.removeStorageSync(INVALID_TOPIC_CACHE_KEY);
    this.removeTopicFromCurrentLists(invalidatedId);
  },

  removeTopicFromCurrentLists(slugOrId) {
    const invalidatedId = String(slugOrId || "").trim();
    if (!invalidatedId) return;
    const matches = (item) => [item && item.id, item && item.slug]
      .some((value) => String(value || "").trim() === invalidatedId);
    const allTopics = (this.data.allTopics || []).filter((item) => !matches(item));
    const topics = (this.data.topics || []).filter((item) => !matches(item));
    this.setData({ allTopics, topics });
    saveTopicCache(allTopics);
  },

  onUnload() {
    this.clearTopicDetailPrefetchTimer();
    this.stopTopicProgressPolling();
    setSettingsTabbarHidden(this, false);
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
        searchButtonTop,
        profilePanelTop: searchButtonTop,
        profileHeaderHeight: capsuleHeight,
        logoHeight,
        logoTop: Math.max(0, Math.round(searchButtonTop + capsuleHeight / 2 - logoHeight / 2)),
        welfareRight
      });
    } catch (_error) {}
  },

  normalizeTopicForTest(payload) {
    return normalizeTopic(payload);
  },

  loadCachedTopics() {
    try {
      const cached = wx.getStorageSync(TOPIC_CACHE_KEY);
      const cachedTopics = sortTopicsForGrade(
        getCachedTopicsForCurrentContext(cached).map(ensureTopicDisplayTags).filter((item) => item && item.id)
      );
      if (!cachedTopics.length) return;
      const activeTopicTags = normalizeFilterTags(this.data.activeTopicTags || this.data.activeTopicTag);
      const activeTopicTagLabel = buildFilterLabel(activeTopicTags);
      const topics = filterTopicsForDisplay(cachedTopics, activeTopicTags, this.data.askInput);
      const visibleTopics = sliceTopicsForDisplay(topics, TOPIC_PAGE_SIZE);
      const allGuideTags = buildGuideTags(cachedTopics);
      const guideTagsExpanded = this.data.guideTagsExpanded && allGuideTags.length > GUIDE_TAG_VISIBLE_LIMIT;
      this.setData({
        allTopics: cachedTopics,
        topics: visibleTopics,
        visibleTopicCount: TOPIC_PAGE_SIZE,
        allGuideTags,
        guideTags: getVisibleGuideTags(allGuideTags, guideTagsExpanded),
        guideTagsExpanded,
        hasMoreGuideTags: allGuideTags.length > GUIDE_TAG_VISIBLE_LIMIT,
        currentTopicPage: 1,
        totalTopicPages: 1,
        hasMoreTopics: topics.length > TOPIC_PAGE_SIZE,
        loadingMoreTopics: false,
        topicFilterTags: buildTopicFilterTags(cachedTopics, activeTopicTags),
        loading: false,
        error: visibleTopics.length ? "" : buildNoTopicsMessage(activeTopicTagLabel, this.data.askInput),
        hasCache: true
      });
      this.scheduleVisibleTopicDetailPrefetch(visibleTopics);
    } catch (_error) {}
  },

  loadTopics(options = {}) {
    const showRefreshing = !!options.showRefreshing;
    const nextPage = Math.max(1, Number(options.page) || 1);
    const append = !!options.append && nextPage > 1;
    const currentData = this.data || {};
    const currentTopics = Array.isArray(currentData.topics) ? currentData.topics : [];
    const previousTopics = append && Array.isArray(currentData.allTopics) ? currentData.allTopics : [];
    this.setData({
      loading: !append && !currentTopics.length,
      loadingMoreTopics: append,
      refreshing: showRefreshing,
      error: ""
    });

    return request({ url: buildTopicListUrl(nextPage, TOPIC_PAGE_SIZE) })
      .then((response) => {
        const pageTopics = sortTopicsForGrade(normalizeTopics(response));
        const allTopics = append ? mergeTopicsById(previousTopics, pageTopics) : pageTopics;
        const totalTopicPages = getTopicTotalPages(response, nextPage, pageTopics.length);
        const activeTopicTags = normalizeFilterTags(this.data.activeTopicTags || this.data.activeTopicTag);
        const activeTopicTagLabel = buildFilterLabel(activeTopicTags);
        const activeFilter = !!(activeTopicTags.length || String(this.data.askInput || "").trim());
        const topics = filterTopicsForDisplay(allTopics, activeTopicTags, this.data.askInput);
        const visibleTopicCount = activeFilter ? TOPIC_PAGE_SIZE : (append ? allTopics.length : TOPIC_PAGE_SIZE);
        const visibleTopics = sliceTopicsForDisplay(topics, visibleTopicCount);
        const allGuideTags = buildGuideTags(allTopics);
        const guideTagsExpanded = this.data.guideTagsExpanded && allGuideTags.length > GUIDE_TAG_VISIBLE_LIMIT;
        this.setData({
          allTopics,
          topics: visibleTopics,
          visibleTopicCount,
          allGuideTags,
          guideTags: getVisibleGuideTags(allGuideTags, guideTagsExpanded),
          guideTagsExpanded,
          hasMoreGuideTags: allGuideTags.length > GUIDE_TAG_VISIBLE_LIMIT,
          currentTopicPage: nextPage,
          totalTopicPages,
          hasMoreTopics: activeFilter
            ? topics.length > visibleTopicCount
            : nextPage < totalTopicPages,
          loadingMoreTopics: false,
          topicFilterTags: buildTopicFilterTags(allTopics, activeTopicTags),
          loading: false,
          refreshing: false,
          hasCache: false,
          error: visibleTopics.length
            ? ""
            : buildNoTopicsMessage(activeTopicTagLabel, this.data.askInput)
        });
        if (!append && allTopics.length) saveTopicCache(allTopics);
        if (!append && visibleTopics.length) this.scheduleVisibleTopicDetailPrefetch(visibleTopics);
        this.syncTopicProgressPolling(allTopics);
      })
      .catch((error) => {
        const fallbackData = this.data || {};
        const fallbackTopics = Array.isArray(fallbackData.topics) ? fallbackData.topics : [];
        this.setData({
          loading: false,
          loadingMoreTopics: false,
          refreshing: false,
          hasCache: false,
          error: fallbackTopics.length ? "" : (error && error.message) || "话题加载失败，请稍后重试"
        });
      });
  },

  loadMoreTopics() {
    if (hasActiveTopicFilter(this.data)) {
      const source = this.getTopicFilterSource();
      const activeTopicTags = normalizeFilterTags(this.data.activeTopicTags || this.data.activeTopicTag);
      const filteredTopics = filterTopicsForDisplay(source, activeTopicTags, this.data.askInput);
      const currentCount = Math.max(TOPIC_PAGE_SIZE, Number(this.data.visibleTopicCount) || this.data.topics.length || TOPIC_PAGE_SIZE);
      const nextCount = Math.min(filteredTopics.length, currentCount + TOPIC_PAGE_SIZE);
      if (nextCount <= currentCount) {
        this.setData({ hasMoreTopics: false });
        return;
      }
      this.setData({
        visibleTopicCount: nextCount,
        hasMoreTopics: nextCount < filteredTopics.length,
        topics: sliceTopicsForDisplay(filteredTopics, nextCount)
      });
      return;
    }
    if (this.data.loading || this.data.loadingMoreTopics || !this.data.hasMoreTopics) return;
    this.loadTopics({
      page: (Number(this.data.currentTopicPage) || 1) + 1,
      append: true
    });
  },

  onReachBottom() {
    this.loadMoreTopics();
  },

  onPullDownRefresh() {
    this.loadTopics({ showRefreshing: true }).then(() => {
      if (typeof wx.stopPullDownRefresh === "function") wx.stopPullDownRefresh();
    }).catch(() => {
      if (typeof wx.stopPullDownRefresh === "function") wx.stopPullDownRefresh();
    });
  },

  openTopic(event) {
    const index = Number(event.currentTarget.dataset.index);
    const topic = this.data.topics[index];
    if (!topic) return;
    if (this.data.deleteTopicId) {
      this.setData({ deleteTopicId: "" });
      return;
    }
    if (!topic.canOpen) {
      wx.showToast({ title: "话题解析中，完成后可查看详情", icon: "none" });
      return;
    }
    const topicSlug = String(topic.slug || topic.id || "").trim();
    const userId = getCurrentUserId();
    const params = [
      "nativeTopic=1",
      `topicSlug=${encodeURIComponent(topicSlug)}`,
      `title=${encodeURIComponent(topic.title || "请教一下")}`
    ];
    if (userId) params.push(`userId=${encodeURIComponent(userId)}`);
    wx.navigateTo({ url: `/pages/webview/index?${params.join("&")}` });
  },

  clearTopicDetailPrefetchTimer() {
    if (!this._topicDetailPrefetchTimer) return;
    if (typeof clearTimeout === "function") {
      clearTimeout(this._topicDetailPrefetchTimer);
    }
    this._topicDetailPrefetchTimer = null;
  },

  scheduleVisibleTopicDetailPrefetch(topics) {
    if (!Array.isArray(topics) || !topics.length) return;
    this.clearTopicDetailPrefetchTimer();
    this._topicDetailPrefetchTimer = setTimeout(() => {
      this._topicDetailPrefetchTimer = null;
      this.prefetchVisibleTopicDetails(topics);
    }, TOPIC_DETAIL_PREFETCH_DELAY_MS);
  },

  prefetchVisibleTopicDetails(topics) {
    const userId = getCurrentUserId();
    const list = (Array.isArray(topics) ? topics : [])
      .filter((topic) => topic && topic.canOpen !== false)
      .map((topic) => String(topic.slug || topic.id || "").trim())
      .filter(Boolean)
      .slice(0, TOPIC_DETAIL_PREFETCH_LIMIT);
    list.forEach((slug) => {
      if (readNativeTopicDetailCache(slug, userId)) return;
      request({ url: buildTopicDetailUrl(slug, userId) })
        .then((detailResponse) => {
          const firstNodeKey = getFirstTopicNodeKey(detailResponse);
          saveNativeTopicDetailCache(slug, userId, { detailResponse, firstNodeKey });
          if (!firstNodeKey) return null;
          return request({ url: buildTopicNodeUrl(slug, firstNodeKey, userId) })
            .then((firstNodeResponse) => {
              saveNativeTopicDetailCache(slug, userId, {
                detailResponse,
                firstNodeKey,
                firstNodeResponse
              });
              return firstNodeResponse;
            });
        })
        .catch((error) => {
          if (Number(error && error.statusCode) === 404) {
            this.removeTopicFromCurrentLists(slug);
          }
        });
    });
  },

  showTopicDelete(event) {
    const id = String((event.currentTarget.dataset && event.currentTarget.dataset.id) || "").trim();
    if (!id) return;
    this.setData({ deleteTopicId: id });
  },

  async deleteTopic(event) {
    const id = String((event.currentTarget.dataset && event.currentTarget.dataset.id) || this.data.deleteTopicId || "").trim();
    if (!id) return;
    const allTopics = Array.isArray(this.data.allTopics) ? this.data.allTopics : [];
    const visibleTopics = Array.isArray(this.data.topics) ? this.data.topics : [];
    const topic = allTopics.concat(visibleTopics).find((item) => item && item.id === id);
    const slug = String((topic && topic.slug) || "").trim();
    if (!slug) {
      wx.showToast({ title: "暂时无法删除", icon: "none" });
      return;
    }

    try {
      await request({
        url: `/api/topic-hub/${encodeURIComponent(slug)}`,
        method: "DELETE",
        data: { userId: getCurrentUserId() }
      });
      const nextAllTopics = allTopics.filter((item) => item && item.id !== id);
      const nextVisibleSource = allTopics.length
        ? nextAllTopics
        : visibleTopics.filter((item) => item && item.id !== id);
      const activeTopicTags = normalizeFilterTags(this.data.activeTopicTags || this.data.activeTopicTag);
      const activeTopicTagLabel = buildFilterLabel(activeTopicTags);
      const nextTopics = filterTopicsForDisplay(nextVisibleSource, activeTopicTags, this.data.askInput);
      const visibleNextTopics = sliceTopicsForDisplay(nextTopics, TOPIC_PAGE_SIZE);
      const allGuideTags = buildGuideTags(nextVisibleSource);
      const guideTagsExpanded = this.data.guideTagsExpanded && allGuideTags.length > GUIDE_TAG_VISIBLE_LIMIT;
      this.stopTopicProgressPolling(slug);
      this.setData({
        allTopics: nextAllTopics,
        topics: visibleNextTopics,
        visibleTopicCount: TOPIC_PAGE_SIZE,
        hasMoreTopics: nextTopics.length > TOPIC_PAGE_SIZE,
        allGuideTags,
        guideTags: getVisibleGuideTags(allGuideTags, guideTagsExpanded),
        guideTagsExpanded,
        hasMoreGuideTags: allGuideTags.length > GUIDE_TAG_VISIBLE_LIMIT,
        topicFilterTags: buildTopicFilterTags(nextVisibleSource, activeTopicTags),
        topicFilterPreviewCount: nextTopics.length,
        deleteTopicId: "",
        error: visibleNextTopics.length
          ? ""
          : buildNoTopicsMessage(activeTopicTagLabel, this.data.askInput)
      });
      saveTopicCache(nextAllTopics);
      wx.showToast({ title: "已删除", icon: "success" });
    } catch (error) {
      wx.showToast({ title: getRequestErrorMessage(error, "删除失败，请稍后重试"), icon: "none" });
    }
  },

  onAskInput(event) {
    const value = event && event.detail ? event.detail.value : "";
    const askInput = String(value || "");
    const source = this.getTopicFilterSource();
    const activeTopicTags = normalizeFilterTags(this.data.activeTopicTags || this.data.activeTopicTag);
    const activeTopicTagLabel = buildFilterLabel(activeTopicTags);
    const topics = filterTopicsForDisplay(source, activeTopicTags, askInput);
    const visibleTopics = sliceTopicsForDisplay(topics, TOPIC_PAGE_SIZE);
    this.setData({
      askInput,
      topics: visibleTopics,
      visibleTopicCount: TOPIC_PAGE_SIZE,
      hasMoreTopics: topics.length > TOPIC_PAGE_SIZE,
      topicFilterPreviewCount: topics.length,
      error: visibleTopics.length ? "" : buildNoTopicsMessage(activeTopicTagLabel, askInput)
    });
  },

  async submitAsk() {
    const text = String(this.data.askInput || "").trim();
    if (!text || this.data.askSubmitting) return;
    await this.runTopicSubmitFlow(text, { skipSearch: false, skipRefine: false });
  },

  async continueSubmitAsk() {
    const text = String(this.data.pendingAskText || this.data.askInput || "").trim();
    if (!text || this.data.askSubmitting) return;
    await this.runTopicSubmitFlow(text, { skipSearch: true, skipRefine: false });
  },

  editRefinedAsk() {
    this.setData({
      askInput: this.data.refinedKeyword || this.data.pendingAskText || this.data.askInput,
      askMessage: "",
      askMessageType: "",
      askSubmitProgressLabel: "",
      askSubmitProgressPercent: 0,
      refinedKeyword: "",
      pendingAskText: ""
    });
  },

  async confirmRefinedAsk() {
    const text = String(this.data.refinedKeyword || this.data.pendingAskText || this.data.askInput || "").trim();
    if (!text || this.data.askSubmitting) return;
    await this.runTopicSubmitFlow(text, { skipSearch: true, skipRefine: true });
  },

  async submitOriginalAsk() {
    const text = String(this.data.pendingAskText || this.data.askInput || "").trim();
    if (!text || this.data.askSubmitting) return;
    await this.runTopicSubmitFlow(text, { skipSearch: true, skipRefine: true });
  },

  async runTopicSubmitFlow(text, options = {}) {
    const skipSearch = !!options.skipSearch;
    const skipRefine = !!options.skipRefine;
    this.setData({
      askSubmitting: true,
      askMessageType: "loading",
      pendingAskText: text,
      refinedKeyword: ""
    });

    try {
      if (!skipSearch) {
        this.updateAskSubmitProgress("search");
        const userId = getCurrentUserId();
        const searchUrl = `/api/topic-hub?search=${encodeURIComponent(text)}&limit=5${userId ? `&userId=${encodeURIComponent(userId)}` : ""}`;
        const searchResponse = await request({ url: searchUrl });
        const hits = normalizeTopics(searchResponse);
        if (hits.length) {
          this.setData({
            askSubmitting: false,
            askMessage: "找到以下相关话题。如果没有你想要的，可以继续提交新问题。",
            askMessageType: "searchResults",
            askSubmitProgressLabel: "",
            askSubmitProgressPercent: 0,
            topics: hits,
            pendingAskText: text,
            error: ""
          });
          return;
        }
      }

      let keyword = text;
      if (!skipRefine) {
        this.updateAskSubmitProgress("refine");
        const refineResponse = await request({
          url: "/api/topic-hub/refine",
          method: "POST",
          data: { keyword: text }
        });
        const refined = String(refineResponse && refineResponse.refined || "").trim();
        if (refineResponse && refineResponse.needConfirm && refined) {
          this.setData({
            askSubmitting: false,
            askMessage: "AI 提炼出核心问题，确认后即可提交。",
            askMessageType: "confirmRefine",
            askSubmitProgressLabel: "",
            askSubmitProgressPercent: 0,
            refinedKeyword: refined,
            pendingAskText: text
          });
          return;
        }
        keyword = refined || text;
      }

      this.updateAskSubmitProgress("validate");
      const validateResponse = await request({
        url: "/api/topic-hub/validate",
        method: "POST",
        data: { keyword }
      });
      if (validateResponse && validateResponse.valid === false) {
        this.setData({
          askSubmitting: false,
          askMessage: getRequestErrorMessage({ data: validateResponse }, "请输入有效的话题内容"),
          askMessageType: "error",
          askSubmitProgressLabel: "",
          askSubmitProgressPercent: 0
        });
        return;
      }

      this.updateAskSubmitProgress("create");
      const createResponse = await request({
        url: "/api/topic-hub/search-generate",
        method: "POST",
        data: { keyword, userId: getCurrentUserId() }
      });
      const newTopic = normalizeTopic(createResponse && createResponse.topic);
      const previousTopics = Array.isArray(this.data.allTopics) ? this.data.allTopics : [];
      const allTopics = newTopic.id ? mergeTopicsById([newTopic], previousTopics) : previousTopics;
      const visibleTopics = sliceTopicsForDisplay(allTopics, TOPIC_PAGE_SIZE);
      const allGuideTags = buildGuideTags(allTopics);
      const guideTagsExpanded = this.data.guideTagsExpanded && allGuideTags.length > GUIDE_TAG_VISIBLE_LIMIT;
      this.setData({
        askInput: "",
        askSubmitting: false,
        askMessage: createResponse && createResponse.source === "existing"
          ? `已有相似话题「${newTopic.title}」，已放到列表顶部。`
          : "话题已提交，AI 正在为你生成知识树。",
        askMessageType: "success",
        askSubmitProgressLabel: ASK_SUBMIT_PROGRESS_STAGES.complete.label,
        askSubmitProgressPercent: ASK_SUBMIT_PROGRESS_STAGES.complete.percent,
        refinedKeyword: "",
        pendingAskText: "",
        allTopics,
        topics: visibleTopics,
        visibleTopicCount: TOPIC_PAGE_SIZE,
        hasMoreTopics: allTopics.length > TOPIC_PAGE_SIZE,
        allGuideTags,
        guideTags: getVisibleGuideTags(allGuideTags, guideTagsExpanded),
        guideTagsExpanded,
        hasMoreGuideTags: allGuideTags.length > GUIDE_TAG_VISIBLE_LIMIT,
        topicFilterTags: buildTopicFilterTags(allTopics, []),
        error: ""
      });
      try {
        saveTopicCache(allTopics);
        if (wx.showToast) wx.showToast({ title: "已提交", icon: "success" });
      } catch (_error) {}
      if (newTopic.slug && (!createResponse || createResponse.source !== "existing")) {
        this.startTopicProgressPolling(newTopic.slug);
      }
    } catch (error) {
      this.handleTopicSubmitError(error);
    }
  },

  updateAskSubmitProgress(stageKey) {
    const stage = ASK_SUBMIT_PROGRESS_STAGES[stageKey];
    if (!stage) return;
    this.setData({
      askMessage: stage.message,
      askMessageType: "loading",
      askSubmitProgressLabel: stage.label,
      askSubmitProgressPercent: stage.percent
    });
  },

  syncTopicProgressPolling(topics) {
    for (const topic of Array.isArray(topics) ? topics : []) {
      if (topic && topic.slug && topic.progressVisible && !topic.canOpen) {
        this.startTopicProgressPolling(topic.slug);
      }
    }
  },

  startTopicProgressPolling(slug) {
    const topicSlug = String(slug || "").trim();
    if (!topicSlug) return;
    if (!this.topicProgressTimers) this.topicProgressTimers = {};
    if (this.topicProgressTimers[topicSlug]) return;
    const timer = setInterval(() => {
      this.refreshTopicProgress(topicSlug);
    }, 1500);
    if (timer && typeof timer.unref === "function") timer.unref();
    this.topicProgressTimers[topicSlug] = timer;
  },

  stopTopicProgressPolling(slug) {
    const timers = this.topicProgressTimers || {};
    const topicSlug = String(slug || "").trim();
    const keys = topicSlug ? [topicSlug] : Object.keys(timers);
    for (const key of keys) {
      if (!timers[key]) continue;
      clearInterval(timers[key]);
      delete timers[key];
    }
  },

  async refreshTopicProgress(slug) {
    const topicSlug = String(slug || "").trim();
    if (!topicSlug) return;
    try {
      const response = await request({ url: `/api/topic-hub/${encodeURIComponent(topicSlug)}/progress` });
      const progress = response && response.progress ? response.progress : null;
      const updateList = (items) => (Array.isArray(items) ? items : []).map((item) => {
        if (!item || item.slug !== topicSlug) return item;
        return applyTopicProgress(item, progress);
      });
      const allTopics = updateList(this.data.allTopics);
      const topics = updateList(this.data.topics);
      this.setData({ allTopics, topics });
      const status = String(progress && progress.status || "").trim();
      if (status === "done" || status === "success" || status === "error" || status === "failed") {
        this.stopTopicProgressPolling(topicSlug);
        if (allTopics.length) saveTopicCache(allTopics);
      }
    } catch (_error) {}
  },

  handleTopicSubmitError(error) {
    if (isAuthExpiredError(error)) {
      this.setData({
        askSubmitting: false,
        askMessage: "请先登录后继续提交问题。",
        askMessageType: "error",
        askSubmitProgressLabel: "",
        askSubmitProgressPercent: 0,
        profilePanelMessage: "请点击登录并授权手机号"
      });
      if (typeof this.openSettings === "function") {
        this.openSettings();
      }
      return;
    }
    if (isProRequiredError(error)) {
      this.setData({
        askSubmitting: false,
        askMessage: getRequestErrorMessage(error, "该功能需要订阅后使用"),
        askMessageType: "error",
        askSubmitProgressLabel: "",
        askSubmitProgressPercent: 0
      });
      wx.navigateTo({ url: "/pages/pro/index" });
      return;
    }
    this.setData({
      askSubmitting: false,
      askMessage: getRequestErrorMessage(error, "提交失败，请稍后重试"),
      askMessageType: "error",
      askSubmitProgressLabel: "",
      askSubmitProgressPercent: 0
    });
  },

  goProgramsHome() {
    navigateProgramsHome();
  },

  toggleGuideTags() {
    this.setData({ guideTagsExpanded: false });
    return this.openFilterDrawer();
  },

  ...topicFilterDrawerMethods,

  loadTopicFilterSource() {
    if (this.data.filterSourceLoaded && Array.isArray(this.data.allFilterTopics) && this.data.allFilterTopics.length) {
      return Promise.resolve(this.data.allFilterTopics);
    }
    if (this._topicFilterSourcePromise) return this._topicFilterSourcePromise;

    const fetchPage = (page, collected) => request({ url: buildTopicListUrl(page, TOPIC_FILTER_PAGE_SIZE) })
      .then((response) => {
        const pageTopics = sortTopicsForGrade(normalizeTopics(response));
        const merged = mergeTopicsById(collected, pageTopics);
        const totalPages = getTopicTotalPages(response, page, pageTopics.length, TOPIC_FILTER_PAGE_SIZE);
        if (page < totalPages) return fetchPage(page + 1, merged);
        return merged;
      });

    this.setData({ filterSourceLoading: true });
    this._topicFilterSourcePromise = fetchPage(1, [])
      .then((allFilterTopics) => {
        this._topicFilterSourcePromise = null;
        this.setData({
          allFilterTopics,
          filterSourceLoaded: true,
          filterSourceLoading: false
        });
        this.syncTopicFilterDraft(this.data.draftTopicTags || []);
        return allFilterTopics;
      })
      .catch(() => {
        this._topicFilterSourcePromise = null;
        this.setData({ filterSourceLoading: false });
        throw new Error("请教筛选源加载失败");
      });
    return this._topicFilterSourcePromise;
  },

  getTopicFilterSource() {
    if (Array.isArray(this.data.allFilterTopics) && this.data.allFilterTopics.length) {
      return this.data.allFilterTopics;
    }
    return Array.isArray(this.data.allTopics) && this.data.allTopics.length
      ? this.data.allTopics
      : this.data.topics;
  },

  syncTopicFilterDraft(tags) {
    const source = this.getTopicFilterSource();
    const draftTopicTags = normalizeFilterTags(tags);
    this.setData({
      draftTopicTags,
      isTopicFilterAllSelected: !draftTopicTags.length,
      topicFilterPreviewCount: filterTopicsByTags(source, draftTopicTags).length,
      topicFilterTags: buildTopicFilterTags(source, draftTopicTags)
    });
  },

  openFilterDrawer() {
    const draftTopicTags = normalizeFilterTags(this.data.activeTopicTags || this.data.activeTopicTag);
    setSettingsTabbarHidden(this, true);
    topicFilterDrawerMethods.openFilterDrawer.call(this);
    this.syncTopicFilterDraft(draftTopicTags);
    return this.loadTopicFilterSource().catch(() => {
      wx.showToast({ title: "筛选内容加载失败", icon: "none" });
      return [];
    });
  },

  closeFilterDrawer() {
    setSettingsTabbarHidden(this, false);
    topicFilterDrawerMethods.closeFilterDrawer.call(this);
  },

  onDrawerTopicTagTap(event) {
    const tag = String((event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.tag) || "").trim();
    if (!tag) {
      this.resetTopicFilterDraft();
      return;
    }
    const normalized = normalizeFilterTag(tag);
    const draftTopicTags = normalizeFilterTags(this.data.draftTopicTags);
    const nextTags = draftTopicTags.indexOf(normalized) >= 0
      ? draftTopicTags.filter((item) => item !== normalized)
      : draftTopicTags.concat(normalized);
    this.syncTopicFilterDraft(nextTags);
  },

  onTopicTagTap(event) {
    const tag = String(event.currentTarget.dataset.tag || "").trim();
    if (!tag) {
      this.clearTopicTagFilter();
      return;
    }
    return this.applyTopicTagFilter(tag);
  },

  applyTopicTagFilter(tag) {
    const normalized = normalizeFilterTag(tag);
    const activeTopicTags = normalizeFilterTags(this.data.activeTopicTags || this.data.activeTopicTag);
    const nextTags = activeTopicTags.indexOf(normalized) >= 0 ? [] : [normalized];
    const apply = () => this.applyTopicTagFilters(nextTags);
    if (!this.data.filterSourceLoaded) {
      return this.loadTopicFilterSource().then(apply).catch(() => {
        wx.showToast({ title: "筛选内容加载失败", icon: "none" });
        return null;
      });
    }
    apply();
    return Promise.resolve();
  },

  applyTopicTagFilters(tags) {
    const activeTopicTags = normalizeFilterTags(tags);
    const activeTopicTag = activeTopicTags[0] || "";
    const activeTopicTagLabel = buildFilterLabel(activeTopicTags);
    const source = this.getTopicFilterSource();
    const topics = filterTopicsForDisplay(source, activeTopicTags, this.data.askInput);
    const visibleTopics = sliceTopicsForDisplay(topics, TOPIC_PAGE_SIZE);
    this.setData({
      activeTopicTag,
      activeTopicTags,
      draftTopicTags: activeTopicTags,
      activeTopicTagLabel,
      isTopicFilterAllSelected: !activeTopicTags.length,
      topicFilterPreviewCount: topics.length,
      topicFilterTags: buildTopicFilterTags(source, activeTopicTags),
      visibleTopicCount: TOPIC_PAGE_SIZE,
      hasMoreTopics: topics.length > TOPIC_PAGE_SIZE,
      topics: visibleTopics,
      error: visibleTopics.length ? "" : buildNoTopicsMessage(activeTopicTagLabel, this.data.askInput)
    });
  },

  resetTopicFilterDraft() {
    this.syncTopicFilterDraft([]);
  },

  applyTopicFilterDraft() {
    const tags = this.data.draftTopicTags;
    const apply = () => {
      this.closeFilterDrawer();
      this.applyTopicTagFilters(tags);
    };
    if (!this.data.filterSourceLoaded) {
      return this.loadTopicFilterSource().then(apply).catch(() => {
        wx.showToast({ title: "筛选内容加载失败", icon: "none" });
        return null;
      });
    }
    apply();
    return Promise.resolve();
  },

  clearTopicTagFilter() {
    const source = this.getTopicFilterSource();
    const topics = filterTopicsForDisplay(source, [], this.data.askInput);
    const visibleTopics = sliceTopicsForDisplay(topics, TOPIC_PAGE_SIZE);
    setSettingsTabbarHidden(this, false);
    this.setData({
      activeTopicTag: "",
      activeTopicTags: [],
      draftTopicTags: [],
      activeTopicTagLabel: "",
      isTopicFilterAllSelected: true,
      topicFilterPreviewCount: source.length,
      topicFilterTags: buildTopicFilterTags(source, []),
      filterDrawerOpen: false,
      visibleTopicCount: TOPIC_PAGE_SIZE,
      hasMoreTopics: topics.length > TOPIC_PAGE_SIZE,
      topics: visibleTopics,
      error: visibleTopics.length ? "" : buildNoTopicsMessage("", this.data.askInput)
    });
  },

  ...createNativeSettingsMethods(),

  topicShareTarget(event) {
    return topicShareTarget(this, event);
  },

  retryLoad() {
    this.loadTopics();
  },

  onShareAppMessage(event) {
    const topic = topicShareTarget(this, event);
    if (topic) return buildTopicSharePath(topic).onShareAppMessage();
    return pageShare.onShareAppMessage();
  },

  onShareTimeline(event) {
    const topic = topicShareTarget(this, event);
    if (topic) return buildTopicSharePath(topic).onShareTimeline();
    return pageShare.onShareTimeline();
  }
});
