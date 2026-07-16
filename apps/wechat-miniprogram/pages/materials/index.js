const { WEB_ROUTES } = require("../../utils/config");
const { request } = require("../../utils/request");
const { copyTextSilently } = require("../../utils/clipboard");
const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { setSelectedTab } = require("../../utils/tabbar");
const { goProgramsHome: navigateProgramsHome, openNativeSearch } = require("../../utils/nativePageNav");
const { openWeb } = require("../../utils/webview");
const { SETTINGS_SECTIONS, createNativeSettingsMethods, setSettingsTabbarHidden } = require("../../utils/nativeSettings");
const { getInitialSearchPrompt, startSearchPromptRotation, stopSearchPromptRotation } = require("../../utils/searchPrompts");
const { createFilterDrawerMethods } = require("../../utils/filterDrawer");
const { buildPersonalizationQuery } = require("../../utils/profileOnboarding");

const MATERIAL_CACHE_KEY = "xf_native_materials_cache_v2";
const MATERIAL_CACHE_PROFILE_KEY = `${MATERIAL_CACHE_KEY}:profile`;
const MATERIAL_PAGE_SIZE = 24;
const LOGO_HEIGHT_RPX = 56;
const SEARCH_PANEL_HEIGHT_RPX = 114;
const TOP_CARD_GAP_RPX = 24;
const MATERIAL_FILTER_TAG_LIMIT = 24;
const MATERIAL_STAGE_ORDER = ["通用", "学前", "小学", "初中", "高中"];
const MATERIAL_GRADE_ORDER = [
  "通用",
  "一年级",
  "二年级",
  "三年级",
  "四年级",
  "五年级",
  "六年级",
  "七年级",
  "八年级",
  "九年级",
  "十年级",
  "十一年级",
  "十二年级"
];
const MATERIAL_SUBJECT_ORDER = ["语文", "数学", "英语", "书法", "地理", "家庭教育", "综合", "科学", "百科", "历史"];
const MATERIAL_META_LABEL_RE = /^(阶段|年级|学科|关键分类|分类|类别|标签)\s*[:：]/;
const MATERIAL_GRADE_LABELS = ["", "一年级", "二年级", "三年级", "四年级", "五年级", "六年级", "七年级", "八年级", "九年级", "十年级", "十一年级", "十二年级"];
const MATERIAL_CHINESE_GRADE_NUMBERS = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  十一: 11,
  十二: 12
};

function appendProfileQuery(url) {
  const profileQuery = buildPersonalizationQuery();
  return profileQuery ? `${url}${url.includes("?") ? "&" : "?"}${profileQuery}` : url;
}

function firstText(values, fallback) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return fallback;
}

function splitTokens(value) {
  return String(value || "")
    .split(/[|｜,，;；、/／\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractLabelValue(input, label) {
  const pattern = new RegExp(`${label}\\s*[:：]\\s*([^|｜;；\\n]+)`, "i");
  const matched = String(input || "").match(pattern);
  return matched ? matched[1].trim() : "";
}

function normalizeStage(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text === "小学" || text === "初中" || text === "高中" || text === "通用") return text;
  if (/(幼儿|学前)/.test(text)) return "学前";
  return "";
}

function parseGradeNumber(value) {
  const text = String(value || "").trim();
  if (/^\d+$/.test(text)) return Number(text);
  return MATERIAL_CHINESE_GRADE_NUMBERS[text] || 0;
}

function gradeLabelFromNumber(value) {
  const number = Number(value);
  return number >= 1 && number < MATERIAL_GRADE_LABELS.length ? MATERIAL_GRADE_LABELS[number] : "";
}

function normalizeGradeValues(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  if (text === "通用") return [text];
  const classMatch = text.match(/(小班|中班|大班)/);
  if (classMatch) return [classMatch[1]];
  if (/低年级/.test(text)) return ["低年级"];

  const rangeMatch = text.match(/(\d+|一|二|三|四|五|六|七|八|九|十|十一|十二)\s*[-－—~～至到]\s*(\d+|一|二|三|四|五|六|七|八|九|十|十一|十二)\s*年级/);
  if (rangeMatch) {
    const start = parseGradeNumber(rangeMatch[1]);
    const end = parseGradeNumber(rangeMatch[2]);
    if (start > 0 && end >= start && end <= 12) {
      return MATERIAL_GRADE_LABELS.slice(start, end + 1);
    }
  }

  const juniorMatch = text.match(/初\s*([一二三1-3])\s*(?:年级)?/);
  if (juniorMatch) return [gradeLabelFromNumber(parseGradeNumber(juniorMatch[1]) + 6)].filter(Boolean);
  const seniorMatch = text.match(/高\s*([一二三1-3])\s*(?:年级)?/);
  if (seniorMatch) return [gradeLabelFromNumber(parseGradeNumber(seniorMatch[1]) + 9)].filter(Boolean);

  const gradeMatch = text.match(/(十[一二]|[一二三四五六七八九十]|\d{1,2})\s*年级/);
  if (gradeMatch) return [gradeLabelFromNumber(parseGradeNumber(gradeMatch[1]))].filter(Boolean);
  return [];
}

function normalizeGrade(value) {
  return normalizeGradeValues(value)[0] || "";
}

function normalizeSubject(value) {
  const text = String(value || "").trim();
  if (!text || text === "期刊杂志") return "";
  if (/^语文/.test(text)) return "语文";
  if (text === "数学/逻辑") return "数学";
  return text;
}

function normalizeFieldValues(value, normalizer) {
  return splitTokens(value)
    .flatMap((token) => normalizer(token))
    .filter(Boolean);
}

function parseMeta(description) {
  const raw = String(description || "").trim();
  const stage = normalizeFieldValues(extractLabelValue(raw, "阶段"), normalizeStage);
  const grade = normalizeFieldValues(extractLabelValue(raw, "年级"), normalizeGrade);
  const subject = normalizeFieldValues(extractLabelValue(raw, "学科"), normalizeSubject);
  if (stage.length || grade.length || subject.length) return { stage, grade, subject };

  const tokens = splitTokens(raw);
  const guessedStage = tokens.map(normalizeStage).filter(Boolean).slice(0, 1);
  const guessedGrade = tokens.filter((token) => /年级|小班|中班|大班|低年级|初\s*[一二三1-3]|高\s*[一二三1-3]/.test(token)).flatMap(normalizeGradeValues).filter(Boolean).slice(0, 1);
  const guessedSubject = tokens.filter((token) => /(语文|数学|英语|物理|化学|生物|历史|地理|政治|综合|科学)/.test(token)).map(normalizeSubject).filter(Boolean).slice(0, 1);
  return { stage: guessedStage, grade: guessedGrade, subject: guessedSubject };
}

function formatDate(value) {
  const source = String(value || "").trim();
  const match = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  return `${match[1]}/${Number(match[2])}/${Number(match[3])}`;
}

function hostLabel(url) {
  try {
    const host = String(url || "").match(/^https?:\/\/([^/]+)/i);
    return host && host[1] ? host[1].replace(/^www\./, "") : "";
  } catch (_error) {
    return "";
  }
}

function pushFieldTag(tags, tone, value) {
  const text = String(value || "").trim();
  if (text && tags.every((tag) => tag.text !== text)) tags.push({ tone, text });
}

function pushFieldTags(tags, tone, value, normalizer) {
  const values = Array.isArray(value) ? value : normalizeFieldValues(value, normalizer || ((item) => item));
  values.forEach((item) => pushFieldTag(tags, tone, item));
}

function pushCategoryTags(tags, value) {
  for (const token of splitTokens(value)) {
    const stage = normalizeStage(token);
    if (stage) {
      pushFieldTag(tags, "stage", stage);
      continue;
    }
    const gradeValues = /年级|小班|中班|大班|低年级|初\s*[一二三1-3]|高\s*[一二三1-3]/.test(token) ? normalizeGradeValues(token) : [];
    if (gradeValues.length) {
      gradeValues.forEach((grade) => pushFieldTag(tags, "grade", grade));
      continue;
    }
    const subject = MATERIAL_SUBJECT_ORDER.indexOf(normalizeSubject(token)) >= 0 ? normalizeSubject(token) : "";
    if (subject) {
      pushFieldTag(tags, "subject", subject);
      continue;
    }
    pushFieldTag(tags, "category", token.replace(MATERIAL_META_LABEL_RE, "").trim());
  }
}

function stripMetaFields(value) {
  return String(value || "").replace(/(阶段|年级|学科|关键分类|分类|类别|标签)\s*[:：]\s*[^|｜;；\n]+/g, "");
}

function normalizeDescription(value) {
  const raw = String(value || "").trim();
  if (!raw) return "点击复制资料链接，在浏览器或网盘 App 中继续打开";
  const parts = splitTokens(stripMetaFields(raw)).filter((item) => !MATERIAL_META_LABEL_RE.test(item));
  return parts.length ? parts.join("，") : "点击复制资料链接，在浏览器或网盘 App 中继续打开";
}

function normalizeMaterial(material) {
  const item = material || {};
  const id = String(item._id || "").trim();
  const meta = parseMeta(item.description);
  const fieldTags = [];
  const fileUrl = firstText([item.fileUrl, item.url, item.link], "");
  const sourceHost = hostLabel(fileUrl);
  const category = firstText([item.category], "学习资料");
  const keywordCategory = firstText([
    extractLabelValue(item.description, "关键分类"),
    extractLabelValue(item.description, "分类"),
    extractLabelValue(item.description, "类别"),
    extractLabelValue(item.description, "标签")
  ], "");
  pushFieldTags(fieldTags, "stage", meta.stage, normalizeStage);
  pushFieldTags(fieldTags, "grade", meta.grade, normalizeGrade);
  pushFieldTags(fieldTags, "subject", meta.subject, normalizeSubject);
  pushCategoryTags(fieldTags, category);
  pushCategoryTags(fieldTags, keywordCategory);

  return {
    id: id || String(item.title || "").trim(),
    title: firstText([item.title], "未命名资料"),
    date: formatDate(item.publishedAt || item.createdAt),
    category,
    description: normalizeDescription(item.description),
    fieldTags,
    fileUrl,
    sourceHost
  };
}

function normalizeMaterials(response) {
  const rawItems = Array.isArray(response) ? response : [];
  return rawItems.map(normalizeMaterial).filter((item) => item.id);
}

function sliceMaterialsForDisplay(materials, count) {
  const limit = Math.max(MATERIAL_PAGE_SIZE, Number(count) || MATERIAL_PAGE_SIZE);
  return (Array.isArray(materials) ? materials : []).slice(0, limit);
}

function normalizeCachedMaterial(material) {
  const item = material || {};
  return Array.isArray(item.fieldTags) ? item : normalizeMaterial(item);
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

function filterMaterialsByTags(materials, tags) {
  const targets = normalizeFilterTags(tags);
  if (!targets.length) return materials;
  return materials.filter((material) => {
    const fieldTags = Array.isArray(material.fieldTags) ? material.fieldTags : [];
    return fieldTags.some((item) => targets.indexOf(normalizeFilterTag(item && item.text)) >= 0);
  });
}

function buildMaterialFilterTags(materials) {
  return buildMaterialFilterGroups(materials).flatMap((group) => group.options).slice(0, MATERIAL_FILTER_TAG_LIMIT);
}

const MATERIAL_GROUP_DEFINITIONS = [
  { key: "stage", title: "阶段" },
  { key: "grade", title: "年级" },
  { key: "subject", title: "科目" }
];

function compareByOrder(order, a, b) {
  const indexA = order.indexOf(a);
  const indexB = order.indexOf(b);
  if (indexA >= 0 || indexB >= 0) return (indexA >= 0 ? indexA : 999) - (indexB >= 0 ? indexB : 999);
  return a.localeCompare(b, "zh-Hans-CN");
}

function sortMaterialValues(key, values) {
  const list = values.slice();
  if (key === "stage") return list.sort((a, b) => compareByOrder(MATERIAL_STAGE_ORDER, a, b));
  if (key === "grade") return list.sort((a, b) => compareByOrder(MATERIAL_GRADE_ORDER, a, b));
  if (key === "subject") return list.sort((a, b) => compareByOrder(MATERIAL_SUBJECT_ORDER, a, b));
  return list.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

function buildMaterialFilterGroups(materials, selectedTags = []) {
  const selected = normalizeFilterTags(selectedTags);
  const grouped = {
    stage: [],
    grade: [],
    subject: []
  };
  for (const material of Array.isArray(materials) ? materials : []) {
    const items = Array.isArray(material && material.fieldTags) ? material.fieldTags : [];
    for (const item of items) {
      const label = normalizeFilterTag(item && item.text);
      const key = String((item && item.tone) || "").trim();
      if (!label || !grouped[key] || grouped[key].indexOf(label) >= 0) continue;
      grouped[key].push(label);
    }
  }
  return MATERIAL_GROUP_DEFINITIONS
    .map((group) => ({
      ...group,
      options: sortMaterialValues(group.key, grouped[group.key]).map((label) => ({
        label,
        value: label,
        selected: selected.indexOf(label) >= 0
      }))
    }))
    .filter((group) => group.options.length);
}

const pageShare = createPageShare({
  title: "资料",
  path: "/pages/materials/index"
});
const materialFilterDrawerMethods = createFilterDrawerMethods();

Page({
  data: {
    selected: 3,
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
    activeMaterialTag: "",
    activeMaterialTags: [],
    draftMaterialTags: [],
    activeMaterialTagLabel: "",
    isMaterialFilterAllSelected: true,
    materialFilterPreviewCount: 0,
    filterDrawerOpen: false,
    filterDrawerHeight: 0,
    filterDrawerMinHeight: 0,
    filterDrawerMaxHeight: 0,
    filterDrawerDragStartY: 0,
    filterDrawerDragStartHeight: 0,
    filterDrawerDragMode: "",
    filterDrawerExpanded: false,
    materialFilterTags: [],
    materialFilterGroups: [],
    allMaterials: [],
    materials: [],
    visibleMaterialCount: MATERIAL_PAGE_SIZE,
    hasMoreMaterials: false,
    loading: true,
    refreshing: false,
    error: "",
    hasCache: false,
    materialLinkModalOpen: false,
    materialLinkModalTitle: "",
    materialLinkModalUrl: "",
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
    startSearchPromptRotation(this);
    this.syncAccountEntry();
    this.loadCachedMaterials();
    this.loadMaterials();
  },

  onReady() {
    this.scrollBelowSearchPanel();
  },

  onShow() {
    enableShareMenu();
    setSelectedTab(this, 3);
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

  loadCachedMaterials() {
    try {
      const cached = wx.getStorageSync(MATERIAL_CACHE_KEY);
      if (String(wx.getStorageSync(MATERIAL_CACHE_PROFILE_KEY) || "") !== buildPersonalizationQuery()) return;
      if (!Array.isArray(cached) || !cached.length) return;
      const allMaterials = cached.map(normalizeCachedMaterial).filter((item) => item.id);
      const activeMaterialTags = normalizeFilterTags(this.data.activeMaterialTags || this.data.activeMaterialTag);
      const activeMaterialTagLabel = buildFilterLabel(activeMaterialTags);
      const filteredMaterials = filterMaterialsByTags(allMaterials, activeMaterialTags);
      const materials = sliceMaterialsForDisplay(filteredMaterials, MATERIAL_PAGE_SIZE);
      this.allMaterials = allMaterials;
      this.setData({
        materials,
        visibleMaterialCount: MATERIAL_PAGE_SIZE,
        hasMoreMaterials: filteredMaterials.length > MATERIAL_PAGE_SIZE,
        materialFilterTags: buildMaterialFilterTags(allMaterials),
        materialFilterGroups: buildMaterialFilterGroups(allMaterials, activeMaterialTags),
        loading: false,
        error: materials.length || !activeMaterialTagLabel ? "" : `没有匹配的 ${activeMaterialTagLabel} 资料`,
        hasCache: true
      });
    } catch (_error) {}
  },

  loadMaterials(options = {}) {
    const showRefreshing = !!options.showRefreshing;
    const currentData = this.data || {};
    const currentMaterials = Array.isArray(currentData.materials) ? currentData.materials : [];
    this.setData({
      loading: !currentMaterials.length,
      refreshing: showRefreshing,
      error: ""
    });

    return request({ url: appendProfileQuery("/api/learning-materials") })
      .then((response) => {
        const allMaterials = normalizeMaterials(response);
        const activeMaterialTags = normalizeFilterTags(this.data.activeMaterialTags || this.data.activeMaterialTag);
        const activeMaterialTagLabel = buildFilterLabel(activeMaterialTags);
        const filteredMaterials = filterMaterialsByTags(allMaterials, activeMaterialTags);
        const materials = sliceMaterialsForDisplay(filteredMaterials, MATERIAL_PAGE_SIZE);
        this.allMaterials = allMaterials;
        this.setData({
          materials,
          visibleMaterialCount: MATERIAL_PAGE_SIZE,
          hasMoreMaterials: filteredMaterials.length > MATERIAL_PAGE_SIZE,
          materialFilterTags: buildMaterialFilterTags(allMaterials),
          materialFilterGroups: buildMaterialFilterGroups(allMaterials, activeMaterialTags),
          loading: false,
          refreshing: false,
          hasCache: false,
          error: materials.length
            ? ""
            : activeMaterialTagLabel
              ? `没有匹配的 ${activeMaterialTagLabel} 资料`
              : "暂时没有可展示的资料"
        });
        if (allMaterials.length) {
          wx.setStorageSync(MATERIAL_CACHE_KEY, allMaterials);
          wx.setStorageSync(MATERIAL_CACHE_PROFILE_KEY, buildPersonalizationQuery());
        }
      })
      .catch((error) => {
        const fallbackData = this.data || {};
        const fallbackMaterials = Array.isArray(fallbackData.materials) ? fallbackData.materials : [];
        this.setData({
          loading: false,
          refreshing: false,
          hasCache: false,
          error: fallbackMaterials.length ? "" : (error && error.message) || "资料加载失败，请稍后重试"
        });
      });
  },

  onPullDownRefresh() {
    this.loadMaterials({ showRefreshing: true }).then(() => {
      if (typeof wx.stopPullDownRefresh === "function") wx.stopPullDownRefresh();
    }).catch(() => {
      if (typeof wx.stopPullDownRefresh === "function") wx.stopPullDownRefresh();
    });
  },

  loadMoreMaterials() {
    const source = this.getMaterialSource();
    const activeMaterialTags = normalizeFilterTags(this.data.activeMaterialTags || this.data.activeMaterialTag);
    const filteredMaterials = filterMaterialsByTags(source, activeMaterialTags);
    const currentCount = Math.max(MATERIAL_PAGE_SIZE, Number(this.data.visibleMaterialCount) || this.data.materials.length || MATERIAL_PAGE_SIZE);
    const nextCount = Math.min(filteredMaterials.length, currentCount + MATERIAL_PAGE_SIZE);
    if (nextCount <= currentCount) {
      this.setData({ hasMoreMaterials: false });
      return;
    }
    this.setData({
      visibleMaterialCount: nextCount,
      hasMoreMaterials: nextCount < filteredMaterials.length,
      materials: sliceMaterialsForDisplay(filteredMaterials, nextCount)
    });
  },

  onReachBottom() {
    this.loadMoreMaterials();
  },

  copyMaterialLink(event) {
    const index = Number(event.currentTarget.dataset.index);
    const material = this.data.materials[index] || {};
    const url = String(event.currentTarget.dataset.url || material.fileUrl || "").trim();
    if (!url) {
      wx.showToast({ title: "暂无资料链接", icon: "none" });
      return;
    }
    this.setData({
      materialLinkModalOpen: true,
      materialLinkModalTitle: String(material.title || "").trim(),
      materialLinkModalUrl: url
    });
  },

  closeMaterialLinkModal() {
    this.setData({
      materialLinkModalOpen: false,
      materialLinkModalTitle: "",
      materialLinkModalUrl: ""
    });
  },

  copyMaterialModalLink() {
    copyTextSilently(this.data.materialLinkModalUrl);
  },

  openFullList() {
    openWeb(WEB_ROUTES.materials, "家长先疯资料");
  },

  goProgramsHome() {
    navigateProgramsHome();
  },

  openSearch() {
    openNativeSearch();
  },

  ...materialFilterDrawerMethods,

  getMaterialSource() {
    return Array.isArray(this.allMaterials) && this.allMaterials.length
      ? this.allMaterials
      : this.data.materials;
  },

  openFilterDrawer() {
    const source = this.getMaterialSource();
    const draftMaterialTags = normalizeFilterTags(this.data.activeMaterialTags || this.data.activeMaterialTag);
    setSettingsTabbarHidden(this, true);
    materialFilterDrawerMethods.openFilterDrawer.call(this);
    this.setData({
      draftMaterialTags,
      isMaterialFilterAllSelected: !draftMaterialTags.length,
      materialFilterPreviewCount: filterMaterialsByTags(source, draftMaterialTags).length,
      materialFilterGroups: buildMaterialFilterGroups(source, draftMaterialTags)
    });
  },

  closeFilterDrawer() {
    setSettingsTabbarHidden(this, false);
    materialFilterDrawerMethods.closeFilterDrawer.call(this);
  },

  onDrawerMaterialTagTap(event) {
    const tag = String((event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.tag) || "").trim();
    if (!tag) return;
    const source = this.getMaterialSource();
    const normalized = normalizeFilterTag(tag);
    const draftMaterialTags = normalizeFilterTags(this.data.draftMaterialTags);
    const nextTags = draftMaterialTags.indexOf(normalized) >= 0
      ? draftMaterialTags.filter((item) => item !== normalized)
      : draftMaterialTags.concat(normalized);
    this.setData({
      draftMaterialTags: nextTags,
      isMaterialFilterAllSelected: !nextTags.length,
      materialFilterPreviewCount: filterMaterialsByTags(source, nextTags).length,
      materialFilterGroups: buildMaterialFilterGroups(source, nextTags)
    });
  },

  applyMaterialTagFilter(tag) {
    const normalized = normalizeFilterTag(tag);
    const activeMaterialTags = normalizeFilterTags(this.data.activeMaterialTags || this.data.activeMaterialTag);
    const nextTags = activeMaterialTags.indexOf(normalized) >= 0 ? [] : [normalized];
    this.applyMaterialTagFilters(nextTags);
  },

  applyMaterialTagFilters(tags) {
    const activeMaterialTags = normalizeFilterTags(tags);
    const activeMaterialTag = activeMaterialTags[0] || "";
    const activeMaterialTagLabel = buildFilterLabel(activeMaterialTags);
    const source = this.getMaterialSource();
    const materials = filterMaterialsByTags(source, activeMaterialTags);
    const visibleMaterials = sliceMaterialsForDisplay(materials, MATERIAL_PAGE_SIZE);
    this.setData({
      activeMaterialTag,
      activeMaterialTags,
      draftMaterialTags: activeMaterialTags,
      activeMaterialTagLabel,
      isMaterialFilterAllSelected: !activeMaterialTags.length,
      materialFilterPreviewCount: materials.length,
      materialFilterGroups: buildMaterialFilterGroups(source, activeMaterialTags),
      visibleMaterialCount: MATERIAL_PAGE_SIZE,
      hasMoreMaterials: materials.length > MATERIAL_PAGE_SIZE,
      materials: visibleMaterials,
      error: materials.length || !activeMaterialTagLabel ? "" : `没有匹配的 ${activeMaterialTagLabel} 资料`
    });
    this.scrollBelowSearchPanel();
  },

  resetMaterialFilterDraft() {
    const source = this.getMaterialSource();
    this.setData({
      draftMaterialTags: [],
      isMaterialFilterAllSelected: true,
      materialFilterPreviewCount: source.length,
      materialFilterGroups: buildMaterialFilterGroups(source, [])
    });
  },

  applyMaterialFilterDraft() {
    this.closeFilterDrawer();
    this.applyMaterialTagFilters(this.data.draftMaterialTags);
  },

  clearMaterialTagFilter() {
    const source = this.getMaterialSource();
    setSettingsTabbarHidden(this, false);
    this.setData({
      activeMaterialTag: "",
      activeMaterialTags: [],
      draftMaterialTags: [],
      activeMaterialTagLabel: "",
      isMaterialFilterAllSelected: true,
      materialFilterPreviewCount: source.length,
      materialFilterGroups: buildMaterialFilterGroups(source, []),
      filterDrawerOpen: false,
      visibleMaterialCount: MATERIAL_PAGE_SIZE,
      hasMoreMaterials: source.length > MATERIAL_PAGE_SIZE,
      materials: sliceMaterialsForDisplay(source, MATERIAL_PAGE_SIZE),
      error: ""
    });
    this.scrollBelowSearchPanel();
  },

  ...createNativeSettingsMethods(),

  retryLoad() {
    this.loadMaterials();
  },

  onProfileOnboardingSaved() {
    wx.removeStorageSync(MATERIAL_CACHE_KEY);
    wx.removeStorageSync(MATERIAL_CACHE_PROFILE_KEY);
    return this.loadMaterials({ showRefreshing: true });
  },

  onShareAppMessage() {
    return pageShare.onShareAppMessage();
  },

  onShareTimeline() {
    return pageShare.onShareTimeline();
  }
});
