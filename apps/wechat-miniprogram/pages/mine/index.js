const { createPageShare, enableShareMenu } = require("../../utils/share");
const { request } = require("../../utils/request");
const { buildProfileState, CHILD_PROFILES_KEY, WEB_CHILD_PROFILES_KEY, maskMobile, mergeChildProfileRecords, parseStoredValue, saveChildProfileRecords } = require("../../utils/profileState");
const { getToken, getUser, clearSession } = require("../../utils/session");
const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { goProgramsHome: navigateProgramsHome } = require("../../utils/nativePageNav");
const { SETTINGS_SECTIONS, applyFontSizeSetting, buildFontOptions, clearAppCache, createNativeSettingsMethods, readFontSizeSetting, setSettingsTabbarHidden, getSettingsPanelHeight, queueNativeSettingsPanel } = require("../../utils/nativeSettings");

const SHARE_OPTIONS = {
  title: "家长先疯",
  path: "/pages/programs/index"
};

const LOGO_HEIGHT_RPX = 56;
const LAST_CHILD_ID_KEY = "xiaowanzi_last_child_id_v1";
const CHAT_CONTEXT_KEY = "xiaowanzi_chat_context_v1";
const MEMORY_ENABLED_KEY = "xf_child_memory_enabled";
const CHILD_AVATAR = "/assets/wel-avatar/no-hat.png";
const RELATIONS = ["儿子", "女儿"];
const TAGS = ["睡眠", "情绪", "专注力", "社交", "学习习惯", "亲子沟通"];
const STAGES = ["孕产", "婴幼儿", "学前", "小学", "初中", "高中"];
const PARSE_STAGES = ["高中", "初中", "小学", "学前", "婴幼儿", "孕产"];
const GRADES_BY_STAGE = {
  "孕产": ["孕产"],
  "婴幼儿": ["婴幼儿"],
  "学前": ["未入园", "托班", "小班", "中班", "大班"],
  "小学": ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"],
  "初中": ["六年级（预初）", "七年级", "八年级", "九年级"],
  "高中": ["高一年级", "高二年级", "高三年级"]
};
const WUSI_CITIES = ["上海", "上海市", "威海", "威海市", "淄博", "淄博市", "莱芜", "莱芜市", "烟台", "烟台市", "哈尔滨", "哈尔滨市", "大庆", "大庆市", "青岛", "青岛市"];
const DISTRICTS_BY_CITY = {
  "上海": ["黄浦区", "徐汇区", "长宁区", "静安区", "普陀区", "虹口区", "杨浦区", "闵行区", "宝山区", "嘉定区", "浦东新区", "金山区", "松江区", "青浦区", "奉贤区", "崇明区"],
  "北京": ["东城区", "西城区", "朝阳区", "丰台区", "石景山区", "海淀区", "顺义区", "通州区", "大兴区", "房山区", "门头沟区", "昌平区", "平谷区", "密云区", "怀柔区", "延庆区"],
  "广州": ["越秀区", "海珠区", "荔湾区", "天河区", "白云区", "黄埔区", "南沙区", "番禺区", "花都区", "增城区", "从化区"],
  "深圳": ["福田区", "罗湖区", "南山区", "盐田区", "宝安区", "龙岗区", "龙华区", "坪山区", "光明区"],
  "杭州": ["上城区", "拱墅区", "西湖区", "滨江区", "余杭区", "萧山区", "临平区", "钱塘区", "富阳区", "临安区"]
};
function newId() {
  return `child-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyChild() {
  return {
    id: newId(),
    relation: "儿子",
    displayName: "",
    gender: "男",
    birthDate: "",
    city: "",
    region: "",
    grade: "",
    concernTags: [],
    avatar: CHILD_AVATAR,
    createdAt: new Date().toISOString(),
    draft: true
  };
}

function normalizeChild(item, index) {
  const relation = item && item.relation === "女儿" ? "女儿" : "儿子";
  return {
    id: String((item && item.id) || `child-${index}`),
    relation,
    displayName: String((item && (item.displayName || item.name)) || "").trim(),
    gender: relation === "女儿" ? "女" : "男",
    birthDate: String((item && item.birthDate) || ""),
    city: String((item && item.city) || ""),
    region: String((item && item.region) || ""),
    grade: String((item && item.grade) || ""),
    concernTags: Array.isArray(item && item.concernTags) ? item.concernTags.map(String).filter(Boolean) : [],
    avatar: String((item && item.avatar) || CHILD_AVATAR),
    createdAt: String((item && item.createdAt) || new Date().toISOString()),
    draft: Boolean(item && item.draft)
  };
}

function loadArchiveChildren() {
  return mergeChildProfileRecords(
    wx.getStorageSync(CHILD_PROFILES_KEY),
    wx.getStorageSync(WEB_CHILD_PROFILES_KEY),
    { avatarFallback: CHILD_AVATAR }
  ).map(normalizeChild);
}

function saveArchiveChildren(children) {
  saveChildProfileRecords(children, { avatarFallback: CHILD_AVATAR });
}

function parseGrade(raw) {
  const text = String(raw || "");
  if (!text) return { stage: "", gradeName: "" };
  for (const stage of PARSE_STAGES) {
    const grade = GRADES_BY_STAGE[stage].find((item) => text.includes(item) || text === item);
    if (grade) return { stage, gradeName: grade };
  }
  if (text.includes("小")) return { stage: "小学", gradeName: "一年级" };
  if (text.includes("初") || text.includes("预初")) return { stage: "初中", gradeName: "六年级（预初）" };
  if (text.includes("高")) return { stage: "高中", gradeName: "高一年级" };
  return { stage: "", gradeName: "" };
}

function gradesFor(stage, city) {
  const fiveFour = WUSI_CITIES.some((item) => String(city || "").includes(item));
  if (stage === "小学" && fiveFour) return ["一年级", "二年级", "三年级", "四年级", "五年级"];
  if (stage === "初中" && fiveFour) return ["六年级（预初）", "七年级", "八年级", "九年级"];
  return GRADES_BY_STAGE[stage] || GRADES_BY_STAGE["学前"];
}

function formatGrade(stage, gradeName) {
  if (!stage || !gradeName) return "";
  if (stage === "孕产" || stage === "婴幼儿") return stage;
  if (stage === "学前") return `学前${gradeName}`;
  if (stage === "小学") return `小学${gradeName}`;
  if (stage === "初中") return `初中${String(gradeName || "").replace("（预初）", "")}`;
  return gradeName || "";
}

function districtsFor(city) {
  const keyword = String(city || "");
  if (!keyword) return [];
  const entry = Object.entries(DISTRICTS_BY_CITY).find(([name]) => keyword.includes(name) || name.includes(keyword));
  return entry ? entry[1] : [];
}

function profileComplete(child) {
  return Boolean(child && child.displayName && child.birthDate && child.grade);
}

function optionList(items, active) {
  return items.map((value) => ({ value, selected: value === active }));
}

function buildArchiveTabs(children, activeId) {
  return children.map((child) => ({
    id: child.id,
    title: child.displayName || "未命名",
    avatar: child.avatar || CHILD_AVATAR,
    selected: child.id === activeId
  }));
}

function buildArchiveView(children, activeId, draft, message) {
  const parsed = parseGrade(draft.grade);
  const gradeOptions = gradesFor(parsed.stage, draft.city);
  const selectedGrade = formatGrade(parsed.stage, parsed.gradeName);
  return {
    archiveChildren: buildArchiveTabs(children, activeId),
    archiveHasChildren: children.length > 0,
    archiveDraft: draft,
    archiveStage: parsed.stage,
    archiveGradeName: parsed.gradeName,
    archiveGradeDisplayText: selectedGrade ? `${parsed.stage} · ${parsed.gradeName}` : "请选择年级",
    archiveGradeOptions: gradeOptions,
    archiveRegionOptions: districtsFor(draft.city),
    archiveRelationOptions: optionList(RELATIONS, draft.relation),
    archiveStageOptions: STAGES,
    archiveStageIndex: STAGES.indexOf(parsed.stage) >= 0 ? STAGES.indexOf(parsed.stage) : 0,
    archiveTagOptions: optionList(TAGS, "").map((item) => ({
      ...item,
      selected: draft.concernTags.includes(item.value)
    })),
    archiveInsightGrade: selectedGrade.replace(/^学前/, ""),
    archiveProfileStatus: profileComplete({ ...draft, grade: selectedGrade }) ? "可绑定" : "待补全",
    profilePanelMessage: message || ""
  };
}

function loadUser() {
  return parseStoredValue(getUser(), {}) || {};
}

Page({
  data: {
    redirectingLegacyMine: true,
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
    isLoggedIn: false,
    hasMobile: false,
    bindingPhone: false,
    user: {},
    displayName: "登录/注册",
    avatarText: "先",
    maskedMobile: "未绑定",
    children: [],
    hasChildren: false,
    stats: [],
    quickActions: [],
    archiveChildren: [],
    archiveHasChildren: false,
    archiveDraft: emptyChild(),
    archiveStage: "",
    archiveGradeName: "",
    archiveGradeDisplayText: "请选择年级",
    archiveGradeOptions: GRADES_BY_STAGE["学前"],
    archiveRegionOptions: [],
    archiveRelationOptions: optionList(RELATIONS, "儿子"),
    archiveStageOptions: STAGES,
    archiveStageIndex: 0,
    archiveTagOptions: optionList(TAGS, ""),
    archiveInsightGrade: "",
    archiveProfileStatus: "待补全",
    profilePanelMessage: "",
    memoryEnabled: true,
    fontSize: "standard",
    fontOptions: buildFontOptions("standard")
  },

  onLoad(options = {}) {
    const requestedPanel = String(options.panel || "").trim();
    if (requestedPanel) queueNativeSettingsPanel(requestedPanel);
    this.redirectLegacyMine();
  },

  redirectLegacyMine() {
    wx.reLaunch({ url: "/pages/programs/index" });
  },

  onShow() {
    if (this.data.redirectingLegacyMine) {
      setTimeout(() => {
        const pages = getCurrentPages();
        if (pages.length && pages[pages.length - 1] === this) this.redirectLegacyMine();
      }, 0);
      return;
    }
    enableShareMenu();
    this.syncTopbarMetrics();
    this.syncAccountEntry();
    this.refresh();
  },

  refresh() {
    this.setData(buildProfileState());
  },

  applyInitialPanel(options = {}) {
    const panel = String(options.panel || "").trim();
    if (panel === "archive" || panel === "memory" || panel === "settings") {
      this.openProfilePanel(panel);
      if (panel === "archive" && String(options.action || "").trim() === "add") {
        this.addArchiveChild();
      }
    }
  },

  openProfilePanel(panel) {
    if (panel !== "archive" && panel !== "memory" && panel !== "settings") return;
    setSettingsTabbarHidden(this, true);
    this.setData({ settingsPanelHeight: getSettingsPanelHeight(), settingsPanelOpen: true, settingsPanelView: panel });
    this.loadProfilePanelView(panel);
  },

  loadProfilePanelView(view) {
    if (view === "archive") {
      this.loadArchivePanel();
      return;
    }
    if (view === "memory") {
      this.loadMemoryPanel();
      return;
    }
    if (view === "settings") {
      this.loadSettingsPanel();
    }
  },

  loadArchivePanel() {
    const children = loadArchiveChildren();
    const savedId = String(wx.getStorageSync(LAST_CHILD_ID_KEY) || "");
    const active = children.find((child) => child.id === savedId) || children[0] || emptyChild();
    this.setData(buildArchiveView(children, active.id, { ...active }, ""));
  },

  loadMemoryPanel() {
    const enabled = wx.getStorageSync(MEMORY_ENABLED_KEY);
    this.setData({ memoryEnabled: enabled === "" ? true : enabled !== "0" && enabled !== false });
  },

  loadSettingsPanel() {
    const fontState = readFontSizeSetting();
    const user = loadUser();
    this.setData({
      hasMobile: Boolean(this.data.isLoggedIn && user.mobile),
      maskedMobile: maskMobile(user.mobile),
      ...fontState
    });
  },

  backSettingsMenu() {
    this.setData({ settingsPanelOpen: true, settingsPanelView: "menu" });
  },

  goLogin() {
    if (this.data.isLoggedIn) return;
    setSettingsTabbarHidden(this, true);
    this.setData({
      settingsPanelHeight: getSettingsPanelHeight(),
      settingsPanelOpen: true,
      settingsPanelView: "menu",
      profilePanelMessage: "请点击登录并授权手机号"
    });
  },

  openArchive() {
    this.openProfilePanel("archive");
  },

  openMemory() {
    if (!this.data.isLoggedIn) {
      this.goLogin();
      return;
    }
    this.openProfilePanel("memory");
  },

  openProfileSettings() {
    this.openProfilePanel("settings");
  },

  toggleMemoryEnabled() {
    const memoryEnabled = !this.data.memoryEnabled;
    wx.setStorageSync(MEMORY_ENABLED_KEY, memoryEnabled ? "1" : "0");
    this.setData({ memoryEnabled });
  },

  chooseFontSize(event) {
    const value = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.value || "standard");
    applyFontSizeSetting(this, value);
    this.setData({ profilePanelMessage: "字体设置已保存" });
  },

  clearCache() {
    clearAppCache();
    this.setData({ profilePanelMessage: "缓存已清理" });
  },

  bindPhone(event) {
    if (!getToken()) {
      this.goLogin();
      return;
    }
    const phoneCode = String(event && event.detail && event.detail.code || "");
    if (!phoneCode) {
      this.setData({ profilePanelMessage: "需要授权手机号后绑定" });
      return;
    }
    this.setData({ bindingPhone: true, profilePanelMessage: "" });
    request({
      method: "POST",
      url: "/api/wechat-mini/bind-phone",
      data: { phoneCode }
    })
      .then((payload) => {
        const app = typeof getApp === "function" ? getApp() : null;
        if (app && typeof app.setLoginSession === "function") app.setLoginSession(payload);
        this.refresh();
        this.loadSettingsPanel();
        this.setData({ profilePanelMessage: "手机号已绑定" });
      })
      .catch((error) => {
        this.setData({ profilePanelMessage: error.message || "绑定手机号失败" });
      })
      .finally(() => {
        this.setData({ bindingPhone: false });
      });
  },

  saveArchivePanel() {
    const draft = this.data.archiveDraft || emptyChild();
    const children = this.data.archiveHasChildren
      ? loadArchiveChildren().map((child) => child.id === draft.id ? { ...draft, draft: false } : child)
      : [{ ...draft, draft: false }];
    saveArchiveChildren(children);
    wx.setStorageSync(LAST_CHILD_ID_KEY, draft.id);
    this.setData(buildArchiveView(children, draft.id, { ...draft, draft: false }, "档案已保存"));
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

  goProgramsHome() {
    navigateProgramsHome();
  },

  ...createNativeSettingsMethods(),

  returnSettingsMenu() {
    this.backSettingsMenu();
  },

  handleQuickAction(event) {
    const key = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.key || "");
    if (key === "memory") {
      this.openMemory();
      return;
    }
    if (key === "settings") {
      this.openProfileSettings();
      return;
    }
    this.openArchive();
  },

  onShareAppMessage() {
    return createPageShare(SHARE_OPTIONS).onShareAppMessage();
  },

  onShareTimeline() {
    return createPageShare(SHARE_OPTIONS).onShareTimeline();
  }
});
