const { DEFAULT_WEB_ORIGIN } = require("../../utils/config");
const { request } = require("../../utils/request");
const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { setSelectedTab } = require("../../utils/tabbar");
const { goProgramsHome: navigateProgramsHome, openNativeSearch } = require("../../utils/nativePageNav");
const { openWeb } = require("../../utils/webview");
const { SETTINGS_SECTIONS, applyFontSizeSetting, createNativeSettingsMethods, readFontSizeSetting, setSettingsTabbarHidden } = require("../../utils/nativeSettings");
const { getInitialSearchPrompt, startSearchPromptRotation, stopSearchPromptRotation } = require("../../utils/searchPrompts");
const { createFilterDrawerMethods } = require("../../utils/filterDrawer");

const PROGRAM_CACHE_KEY = "xf_native_programs_cache";
const PROGRAM_VIEW_MODE_KEY = "xf_native_programs_view_mode";
const PROGRAM_PAGE_SIZE = 20;
const PROGRAM_FILTER_PAGE_SIZE = 100;
const LOGO_HEIGHT_RPX = 56;
const SEARCH_PANEL_HEIGHT_RPX = 114;
const TOP_CARD_GAP_RPX = 24;
const PROGRAM_FILTER_TAG_LIMIT = 18;
const PROGRAM_SHOW_OPTIONS = [
  { label: "家长先疯", value: "xianfeng" },
  { label: "中年知己", value: "zhiji" }
];
const PROGRAM_STATUS_OPTIONS = [
  { label: "公开发布", value: "published" },
  { label: "群友特供", value: "group-only" }
];

function normalizeImage(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  if (source.indexOf("http://xianfeng.xinzhi.info/") === 0) {
    return `${DEFAULT_WEB_ORIGIN}${source.slice("http://xianfeng.xinzhi.info".length)}`;
  }
  if (/^https?:\/\//.test(source)) return source;
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
  if (!source) return "未发布";
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "未发布";
  return `${match[1]}/${Number(match[2])}/${Number(match[3])}`;
}

function statusLabel(status) {
  if (status === "group-only") return "群友特供";
  if (status === "published") return "公开发布";
  return "";
}

function findOption(options, value) {
  const target = String(value || "").trim();
  return options.find((item) => item.value === target) || null;
}

function inferProgramShow(program) {
  const item = program || {};
  const summary = item.summary || {};
  const explicit = findOption(PROGRAM_SHOW_OPTIONS, item.programShow);
  if (explicit) return { label: explicit.label, value: explicit.value, tone: explicit.value };
  const textParts = [
    item.showName,
    item.show,
    item.programShow,
    item.channel,
    item.programSeries,
    item.title,
    item.description,
    item.coverImage,
    summary.headline,
    Array.isArray(summary.tags) ? summary.tags.join(" ") : ""
  ];
  const source = textParts.map((value) => String(value || "").toLowerCase()).join(" ");
  const isZhiji = source.indexOf("中年知己") >= 0 || source.indexOf("zhiji") >= 0 || source.indexOf("middle") >= 0;
  return isZhiji
    ? { label: "中年知己", value: "zhiji", tone: "zhiji" }
    : { label: "家长先疯", value: "xianfeng", tone: "xianfeng" };
}

function normalizeProgram(program) {
  const item = program || {};
  const summary = item.summary || {};
  const id = String(item._id || "").trim();
  const code = String(item.programCode || "").trim();
  const title = firstText([item.title], "未命名节目");
  const tags = Array.isArray(summary.tags)
    ? summary.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 3)
    : [];
  const episode = Array.isArray(item.episodes) ? item.episodes[0] : null;
  const publishedAt = firstText([item.publishedAt, item.createdAt], "");
  const status = String(item.status || "").trim();
  const duration = firstText([episode && episode.duration], "");
  const label = statusLabel(status);
  const showMeta = inferProgramShow(item);

  return {
    id: id || code || title,
    title,
    description: firstText([item.description, summary.headline], "打开详情继续了解本期内容"),
    coverImage: normalizeImage(item.coverImage),
    tags,
    displayTags: tags.map((tag) => `#${tag}`),
    duration,
    date: formatDate(publishedAt),
    status,
    statusLabel: label,
    show: showMeta.value,
    showLabel: showMeta.label,
    showTone: showMeta.tone,
    path: `/programs/${encodeURIComponent(code || id)}`
  };
}

function normalizePrograms(response) {
  const data = response || {};
  const rawItems = Array.isArray(data.programs)
    ? data.programs
    : Array.isArray(data.data)
      ? data.data
      : [];
  return rawItems.map(normalizeProgram).filter((item) => item.id);
}

function getProgramTotalPages(response, page, itemCount, pageSize = PROGRAM_PAGE_SIZE) {
  const data = response || {};
  const totalPages = Number(data.totalPages);
  if (Number.isFinite(totalPages) && totalPages > 0) return Math.max(1, Math.floor(totalPages));
  const total = Number(data.total);
  if (Number.isFinite(total) && total > 0) return Math.max(1, Math.ceil(total / pageSize));
  return itemCount < pageSize ? page : page + 1;
}

function mergeProgramsById(previous, next) {
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

function sliceProgramsForDisplay(programs, count) {
  const limit = Math.max(PROGRAM_PAGE_SIZE, Number(count) || PROGRAM_PAGE_SIZE);
  return (Array.isArray(programs) ? programs : []).slice(0, limit);
}

function normalizeFilterTag(value) {
  return String(value || "").trim().replace(/^#/, "");
}

function normalizeFilterTags(values) {
  const source = Array.isArray(values) ? values : [values];
  const seen = new Set();
  const tags = [];
  for (const value of source) {
    const label = normalizeFilterTag(value);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    tags.push(`#${label}`);
  }
  return tags;
}

function buildProgramTagLabel(tags) {
  return normalizeFilterTags(tags).map(normalizeFilterTag).join("、");
}

function buildProgramFilterLabel(show, status, tags) {
  const parts = [];
  const showOption = findOption(PROGRAM_SHOW_OPTIONS, show);
  const statusOption = findOption(PROGRAM_STATUS_OPTIONS, status);
  const tagLabel = buildProgramTagLabel(tags);
  if (showOption) parts.push(showOption.label);
  if (statusOption) parts.push(statusOption.label);
  if (tagLabel) parts.push(tagLabel);
  return parts.join("、");
}

function getSelectedProgramTags(data) {
  const activeTags = data && Array.isArray(data.activeProgramTags) ? data.activeProgramTags : [];
  return activeTags.length ? activeTags : (data && data.activeProgramTag) || [];
}

function filterProgramsByTags(programs, tags) {
  const normalizedTags = normalizeFilterTags(tags);
  if (!normalizedTags.length) return programs;
  const targets = new Set(normalizedTags.map(normalizeFilterTag));
  return programs.filter((program) => {
    const items = Array.isArray(program.tags) ? program.tags : [];
    return items.some((item) => targets.has(normalizeFilterTag(item)));
  });
}

function filterPrograms(programs, filters) {
  const source = Array.isArray(programs) ? programs : [];
  const data = filters || {};
  const show = String(data.show || "").trim();
  const status = String(data.status || "").trim();
  return filterProgramsByTags(source, data.tags).filter((program) => {
    if (show && program.show !== show) return false;
    if (status && program.status !== status) return false;
    return true;
  });
}

function hasActiveProgramFilter(data) {
  const state = data || {};
  return !!(
    String(state.activeProgramShow || "").trim() ||
    String(state.activeProgramStatus || "").trim() ||
    normalizeFilterTags(getSelectedProgramTags(state)).length
  );
}

function buildProgramFilterTags(programs, selectedTags) {
  const seen = new Set();
  const selected = new Set(normalizeFilterTags(selectedTags).map(normalizeFilterTag));
  const tags = [];
  for (const program of Array.isArray(programs) ? programs : []) {
    const items = Array.isArray(program && program.tags) ? program.tags : [];
    for (const item of items) {
      const label = normalizeFilterTag(item);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      tags.push({ label, value: `#${label}`, selected: selected.has(label) });
      if (tags.length >= PROGRAM_FILTER_TAG_LIMIT) return tags;
    }
  }
  return tags;
}

function isLargeFontState(data) {
  const state = data || {};
  return state.fontSize === "large" || String(state.fontSizeClass || "").indexOf("xf-font-large") >= 0;
}

const pageShare = createPageShare({
  title: "家长先疯节目",
  path: "/pages/programs/index"
});

const programFilterDrawerMethods = createFilterDrawerMethods();

Page({
  data: {
    selected: 0,
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
    compactMode: false,
    activeProgramTag: "",
    activeProgramTags: [],
    activeProgramShow: "",
    activeProgramStatus: "",
    activeProgramTagLabel: "",
    draftProgramTags: [],
    draftProgramShow: "",
    draftProgramStatus: "",
    isProgramFilterAllSelected: true,
    isProgramShowAllSelected: true,
    isProgramStatusAllSelected: true,
    programFilterPreviewCount: 0,
    filterDrawerOpen: false,
    filterDrawerHeight: 0,
    filterDrawerMinHeight: 0,
    filterDrawerMaxHeight: 0,
    filterDrawerDragStartY: 0,
    filterDrawerDragStartHeight: 0,
    filterDrawerDragMode: "",
    filterDrawerExpanded: false,
    programFilterTags: [],
    programShowOptions: PROGRAM_SHOW_OPTIONS,
    programStatusOptions: PROGRAM_STATUS_OPTIONS,
    allPrograms: [],
    allFilterPrograms: [],
    filterSourceLoaded: false,
    filterSourceLoading: false,
    programs: [],
    visibleProgramCount: PROGRAM_PAGE_SIZE,
    currentProgramPage: 1,
    totalProgramPages: 1,
    hasMorePrograms: false,
    loadingMorePrograms: false,
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
    this.loadCachedPrograms();
    this.loadPrograms();
  },

  onReady() {
    this.scrollBelowSearchPanel();
  },

  onShow() {
    enableShareMenu();
    setSelectedTab(this, 0);
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
      const fontState = readFontSizeSetting();
      const compactMode = wx.getStorageSync(PROGRAM_VIEW_MODE_KEY) === "compact" && !isLargeFontState(fontState);
      this.setData({ ...fontState, compactMode });
      if (this.isLargeFontMode()) wx.setStorageSync(PROGRAM_VIEW_MODE_KEY, "feature");
    } catch (_error) {}
  },

  isLargeFontMode() {
    return isLargeFontState(this.data);
  },

  switchProgramViewMode() {
    const compactMode = !this.data.compactMode && !this.isLargeFontMode();
    this.setData({ compactMode });
    try {
      wx.setStorageSync(PROGRAM_VIEW_MODE_KEY, compactMode ? "compact" : "feature");
    } catch (_error) {}
  },

  loadCachedPrograms() {
    try {
      const cached = wx.getStorageSync(PROGRAM_CACHE_KEY);
      if (!Array.isArray(cached) || !cached.length) return;
      const activeProgramTags = normalizeFilterTags(getSelectedProgramTags(this.data));
      const activeProgramShow = String(this.data.activeProgramShow || "").trim();
      const activeProgramStatus = String(this.data.activeProgramStatus || "").trim();
      const activeProgramTagLabel = buildProgramFilterLabel(activeProgramShow, activeProgramStatus, activeProgramTags);
      const programs = filterPrograms(cached, {
        show: activeProgramShow,
        status: activeProgramStatus,
        tags: activeProgramTags
      });
      const visiblePrograms = sliceProgramsForDisplay(programs, PROGRAM_PAGE_SIZE);
      this.setData({
        allPrograms: cached,
        programs: visiblePrograms,
        visibleProgramCount: PROGRAM_PAGE_SIZE,
        currentProgramPage: 1,
        totalProgramPages: 1,
        hasMorePrograms: programs.length > PROGRAM_PAGE_SIZE,
        loadingMorePrograms: false,
        programFilterTags: buildProgramFilterTags(cached, activeProgramTags),
        programFilterPreviewCount: programs.length,
        isProgramFilterAllSelected: !activeProgramTags.length,
        isProgramShowAllSelected: !activeProgramShow,
        isProgramStatusAllSelected: !activeProgramStatus,
        loading: false,
        error: visiblePrograms.length || !activeProgramTagLabel ? "" : `没有匹配的 ${activeProgramTagLabel} 节目`,
        hasCache: true
      });
    } catch (_error) {}
  },

  loadPrograms(options = {}) {
    const showRefreshing = !!options.showRefreshing;
    const nextPage = Math.max(1, Number(options.page) || 1);
    const append = !!options.append && nextPage > 1;
    const currentData = this.data || {};
    const currentPrograms = Array.isArray(currentData.programs) ? currentData.programs : [];
    const previousPrograms = append && Array.isArray(currentData.allPrograms) ? currentData.allPrograms : [];
    this.setData({
      loading: !append && !currentPrograms.length,
      loadingMorePrograms: append,
      refreshing: showRefreshing,
      error: ""
    });

    return request({ url: `/api/programs?page=${nextPage}&pageSize=${PROGRAM_PAGE_SIZE}` })
      .then((response) => {
        const pagePrograms = normalizePrograms(response);
        const allPrograms = append ? mergeProgramsById(previousPrograms, pagePrograms) : pagePrograms;
        const totalProgramPages = getProgramTotalPages(response, nextPage, pagePrograms.length);
        const activeProgramTags = normalizeFilterTags(getSelectedProgramTags(this.data));
        const activeProgramShow = String(this.data.activeProgramShow || "").trim();
        const activeProgramStatus = String(this.data.activeProgramStatus || "").trim();
        const activeProgramTagLabel = buildProgramFilterLabel(activeProgramShow, activeProgramStatus, activeProgramTags);
        const activeFilter = !!(activeProgramShow || activeProgramStatus || activeProgramTags.length);
        const programs = filterPrograms(allPrograms, {
          show: activeProgramShow,
          status: activeProgramStatus,
          tags: activeProgramTags
        });
        const visibleProgramCount = activeFilter ? PROGRAM_PAGE_SIZE : (append ? allPrograms.length : PROGRAM_PAGE_SIZE);
        const visiblePrograms = sliceProgramsForDisplay(programs, visibleProgramCount);
        this.setData({
          allPrograms,
          programs: visiblePrograms,
          visibleProgramCount,
          currentProgramPage: nextPage,
          totalProgramPages,
          hasMorePrograms: activeFilter
            ? programs.length > visibleProgramCount
            : nextPage < totalProgramPages,
          loadingMorePrograms: false,
          programFilterTags: buildProgramFilterTags(allPrograms, activeProgramTags),
          programFilterPreviewCount: programs.length,
          isProgramFilterAllSelected: !activeProgramTags.length,
          isProgramShowAllSelected: !activeProgramShow,
          isProgramStatusAllSelected: !activeProgramStatus,
          loading: false,
          refreshing: false,
          hasCache: false,
          error: visiblePrograms.length
            ? ""
            : activeProgramTagLabel
              ? `没有匹配的 ${activeProgramTagLabel} 节目`
              : "暂时没有可展示的节目"
        });
        if (!append && allPrograms.length) wx.setStorageSync(PROGRAM_CACHE_KEY, allPrograms);
      })
      .catch((error) => {
        const fallbackData = this.data || {};
        const fallbackPrograms = Array.isArray(fallbackData.programs) ? fallbackData.programs : [];
        this.setData({
          loading: false,
          loadingMorePrograms: false,
          refreshing: false,
          hasCache: false,
          error: fallbackPrograms.length
            ? ""
            : (error && error.message) || "节目加载失败，请稍后重试"
        });
      });
  },

  loadMorePrograms() {
    if (this.data.filterDrawerOpen) return;
    if (hasActiveProgramFilter(this.data)) {
      const source = this.getProgramFilterSource();
      const activeProgramTags = normalizeFilterTags(getSelectedProgramTags(this.data));
      const filteredPrograms = filterPrograms(source, {
        show: this.data.activeProgramShow,
        status: this.data.activeProgramStatus,
        tags: activeProgramTags
      });
      const currentCount = Math.max(PROGRAM_PAGE_SIZE, Number(this.data.visibleProgramCount) || this.data.programs.length || PROGRAM_PAGE_SIZE);
      const nextCount = Math.min(filteredPrograms.length, currentCount + PROGRAM_PAGE_SIZE);
      if (nextCount <= currentCount) {
        this.setData({ hasMorePrograms: false });
        return;
      }
      this.setData({
        visibleProgramCount: nextCount,
        hasMorePrograms: nextCount < filteredPrograms.length,
        programs: sliceProgramsForDisplay(filteredPrograms, nextCount)
      });
      return;
    }
    if (this.data.loading || this.data.loadingMorePrograms || !this.data.hasMorePrograms) return;
    this.loadPrograms({
      page: (Number(this.data.currentProgramPage) || 1) + 1,
      append: true
    });
  },

  onReachBottom() {
    this.loadMorePrograms();
  },

  onPullDownRefresh() {
    this.loadPrograms({ showRefreshing: true }).then(() => {
      if (typeof wx.stopPullDownRefresh === "function") wx.stopPullDownRefresh();
    }).catch(() => {
      if (typeof wx.stopPullDownRefresh === "function") wx.stopPullDownRefresh();
    });
  },

  openProgram(event) {
    const index = Number(event.currentTarget.dataset.index);
    const program = this.data.programs[index];
    if (!program) return;
    openWeb(program.path, program.title);
  },

  openFullList() {
    openWeb("/programs/list", "家长先疯节目");
  },

  goProgramsHome() {
    navigateProgramsHome();
  },

  openSearch() {
    openNativeSearch();
  },

  ...programFilterDrawerMethods,

  loadProgramFilterSource() {
    if (this.data.filterSourceLoaded && Array.isArray(this.data.allFilterPrograms) && this.data.allFilterPrograms.length) {
      return Promise.resolve(this.data.allFilterPrograms);
    }
    if (this._programFilterSourcePromise) return this._programFilterSourcePromise;

    const fetchPage = (page, collected) => request({ url: `/api/programs?page=${page}&pageSize=${PROGRAM_FILTER_PAGE_SIZE}` })
      .then((response) => {
        const pagePrograms = normalizePrograms(response);
        const merged = mergeProgramsById(collected, pagePrograms);
        const totalPages = getProgramTotalPages(response, page, pagePrograms.length, PROGRAM_FILTER_PAGE_SIZE);
        if (page < totalPages) return fetchPage(page + 1, merged);
        return merged;
      });

    this.setData({ filterSourceLoading: true });
    this._programFilterSourcePromise = fetchPage(1, [])
      .then((allFilterPrograms) => {
        this._programFilterSourcePromise = null;
        this.setData({
          allFilterPrograms,
          filterSourceLoaded: true,
          filterSourceLoading: false
        });
        this.syncProgramFilterDraft({
          show: this.data.draftProgramShow,
          status: this.data.draftProgramStatus,
          tags: this.data.draftProgramTags || []
        });
        return allFilterPrograms;
      })
      .catch(() => {
        this._programFilterSourcePromise = null;
        this.setData({ filterSourceLoading: false });
        throw new Error("节目筛选源加载失败");
      });
    return this._programFilterSourcePromise;
  },

  getProgramFilterSource() {
    if (Array.isArray(this.data.allFilterPrograms) && this.data.allFilterPrograms.length) {
      return this.data.allFilterPrograms;
    }
    return Array.isArray(this.data.allPrograms) && this.data.allPrograms.length
      ? this.data.allPrograms
      : this.data.programs;
  },

  syncProgramFilterDraft(filters = {}) {
    const hasTags = Object.prototype.hasOwnProperty.call(filters, "tags");
    const hasShow = Object.prototype.hasOwnProperty.call(filters, "show");
    const hasStatus = Object.prototype.hasOwnProperty.call(filters, "status");
    const draftProgramTags = normalizeFilterTags(hasTags ? filters.tags : this.data.draftProgramTags);
    const draftProgramShow = String(hasShow ? filters.show : this.data.draftProgramShow || "").trim();
    const draftProgramStatus = String(hasStatus ? filters.status : this.data.draftProgramStatus || "").trim();
    const source = this.getProgramFilterSource();
    const previewPrograms = filterPrograms(source, {
      show: draftProgramShow,
      status: draftProgramStatus,
      tags: draftProgramTags
    });
    this.setData({
      draftProgramTags,
      draftProgramShow,
      draftProgramStatus,
      isProgramFilterAllSelected: !draftProgramTags.length,
      isProgramShowAllSelected: !draftProgramShow,
      isProgramStatusAllSelected: !draftProgramStatus,
      programFilterTags: buildProgramFilterTags(source, draftProgramTags),
      programFilterPreviewCount: previewPrograms.length
    });
  },

  openFilterDrawer() {
    this.syncProgramFilterDraft({
      show: this.data.activeProgramShow,
      status: this.data.activeProgramStatus,
      tags: getSelectedProgramTags(this.data)
    });
    setSettingsTabbarHidden(this, true);
    programFilterDrawerMethods.openFilterDrawer.call(this);
    return this.loadProgramFilterSource().catch(() => {
      wx.showToast({ title: "筛选内容加载失败", icon: "none" });
      return [];
    });
  },

  closeFilterDrawer() {
    setSettingsTabbarHidden(this, false);
    programFilterDrawerMethods.closeFilterDrawer.call(this);
  },

  resetProgramFilterDraft() {
    this.syncProgramFilterDraft({ show: "", status: "", tags: [] });
  },

  resetProgramShowDraft() {
    this.syncProgramFilterDraft({ show: "" });
  },

  resetProgramStatusDraft() {
    this.syncProgramFilterDraft({ status: "" });
  },

  applyProgramFilterDraft() {
    const filters = {
      show: this.data.draftProgramShow,
      status: this.data.draftProgramStatus,
      tags: this.data.draftProgramTags || []
    };
    const apply = () => {
      this.applyProgramFilter(filters);
      this.closeFilterDrawer();
    };
    if (!this.data.filterSourceLoaded) {
      return this.loadProgramFilterSource().then(apply).catch(() => {
        wx.showToast({ title: "筛选内容加载失败", icon: "none" });
        return null;
      });
    }
    apply();
    return Promise.resolve();
  },

  onDrawerProgramShowTap(event) {
    const show = String((event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.show) || "").trim();
    this.syncProgramFilterDraft({ show });
  },

  onDrawerProgramStatusTap(event) {
    const status = String((event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.status) || "").trim();
    this.syncProgramFilterDraft({ status });
  },

  onDrawerProgramTagTap(event) {
    const tag = String((event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.tag) || "").trim();
    if (!tag) return;
    const normalized = normalizeFilterTag(tag);
    const current = normalizeFilterTags(this.data.draftProgramTags);
    const next = current.some((item) => normalizeFilterTag(item) === normalized)
      ? current.filter((item) => normalizeFilterTag(item) !== normalized)
      : current.concat(`#${normalized}`);
    this.syncProgramFilterDraft({ tags: next });
  },

  onProgramTagTap(event) {
    const tag = String(event.currentTarget.dataset.tag || "").trim();
    if (!tag) return;
    return this.applyProgramTagFilter([tag]);
  },

  applyProgramTagFilter(tags) {
    const apply = () => this.applyProgramFilter({
      show: this.data.activeProgramShow,
      status: this.data.activeProgramStatus,
      tags
    });
    if (!this.data.filterSourceLoaded) {
      return this.loadProgramFilterSource().then(apply).catch(() => {
        wx.showToast({ title: "筛选内容加载失败", icon: "none" });
        return null;
      });
    }
    apply();
    return Promise.resolve();
  },

  applyProgramFilter(filters) {
    const activeProgramShow = String(filters && filters.show || "").trim();
    const activeProgramStatus = String(filters && filters.status || "").trim();
    const activeProgramTags = normalizeFilterTags(filters && filters.tags);
    const activeProgramTag = activeProgramTags[0] || "";
    const activeProgramTagLabel = buildProgramFilterLabel(activeProgramShow, activeProgramStatus, activeProgramTags);
    const source = this.getProgramFilterSource();
    const programs = filterPrograms(source, {
      show: activeProgramShow,
      status: activeProgramStatus,
      tags: activeProgramTags
    });
    const visiblePrograms = sliceProgramsForDisplay(programs, PROGRAM_PAGE_SIZE);
    this.setData({
      activeProgramShow,
      activeProgramStatus,
      activeProgramTag,
      activeProgramTags,
      activeProgramTagLabel,
      draftProgramTags: activeProgramTags,
      draftProgramShow: activeProgramShow,
      draftProgramStatus: activeProgramStatus,
      isProgramFilterAllSelected: !activeProgramTags.length,
      isProgramShowAllSelected: !activeProgramShow,
      isProgramStatusAllSelected: !activeProgramStatus,
      programFilterTags: buildProgramFilterTags(source, activeProgramTags),
      programFilterPreviewCount: programs.length,
      visibleProgramCount: PROGRAM_PAGE_SIZE,
      hasMorePrograms: programs.length > PROGRAM_PAGE_SIZE,
      programs: visiblePrograms,
      error: visiblePrograms.length || !activeProgramTagLabel ? "" : `没有匹配的 ${activeProgramTagLabel} 节目`
    });
    this.scrollBelowSearchPanel();
  },

  clearProgramTagFilter() {
    const source = this.getProgramFilterSource();
    this.setData({
      activeProgramTag: "",
      activeProgramTags: [],
      activeProgramShow: "",
      activeProgramStatus: "",
      activeProgramTagLabel: "",
      draftProgramTags: [],
      draftProgramShow: "",
      draftProgramStatus: "",
      isProgramFilterAllSelected: true,
      isProgramShowAllSelected: true,
      isProgramStatusAllSelected: true,
      filterDrawerOpen: false,
      programFilterTags: buildProgramFilterTags(source, []),
      programFilterPreviewCount: source.length,
      visibleProgramCount: PROGRAM_PAGE_SIZE,
      hasMorePrograms: source.length > PROGRAM_PAGE_SIZE,
      programs: sliceProgramsForDisplay(source, PROGRAM_PAGE_SIZE),
      error: ""
    });
    setSettingsTabbarHidden(this, false);
    this.scrollBelowSearchPanel();
  },

  ...createNativeSettingsMethods(),

  chooseFontSize(event) {
    const value = String((event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.value) || "standard");
    const fontState = applyFontSizeSetting(this, value);
    if (fontState.fontSize === "large") {
      this.setData({ compactMode: false });
      try {
        wx.setStorageSync(PROGRAM_VIEW_MODE_KEY, "feature");
      } catch (_error) {}
    }
    this.setData({ profilePanelMessage: "字体设置已保存" });
  },

  retryLoad() {
    this.loadPrograms();
  },

  onShareAppMessage() {
    return pageShare.onShareAppMessage();
  },

  onShareTimeline() {
    return pageShare.onShareTimeline();
  }
});
