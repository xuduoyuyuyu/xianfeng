const { openWeb } = require("./webview");
const { request, buildUrl } = require("./request");
const { getToken, getUser, setSession, clearSession } = require("./session");
const { CHILD_PROFILES_KEY, WEB_CHILD_PROFILES_KEY, hasDuplicateChildDisplayName, maskMobile, mergeChildProfileRecords, parseStoredValue } = require("./profileState");
const { rememberCurrentExternalPage } = require("./xiaowanziReturn");
const { STAGES, GRADES_BY_STAGE, gradesFor, formatGrade, parseGrade, districtsFor } = require("./profileOnboarding");
const {
  isPlaceholderName,
  needsWechatProfileCompletion,
  normalizeWechatProfileUser,
  saveWechatProfile: persistWechatProfile
} = require("./wechatProfile");

const TAB_PAGES = [
  "/pages/programs/index",
  "/pages/reading/index",
  "/pages/xiaowanzi/index",
  "/pages/materials/index",
  "/pages/topics/index"
];

const SETTINGS_SECTIONS = [
  {
    key: "account",
    items: [
      { key: "pro", title: "订阅计划", iconType: "image", image: "/assets/menu/line-workspace_premium.png", page: "/pages/pro/index" },
      { key: "archive", title: "档案管理", iconType: "image", image: "/assets/menu/line-badge.png", page: "/pages/mine/archive/index", panelView: "archive" }
    ]
  },
  {
    key: "content",
    items: [
      { key: "programs", title: "播客节目", iconType: "image", image: "/assets/menu/line-podcasts.png", page: "/pages/programs/index" },
      { key: "experts", title: "先疯智库", iconType: "image", image: "/assets/menu/line-person.png", page: "/pages/experts/index" }
    ]
  },
  {
    key: "library",
    items: [
      { key: "reading", title: "及阅", iconType: "image", image: "/assets/menu/jiyue-logo.png", page: "/pages/reading/index" },
      { key: "materials", title: "学习资料", iconType: "image", image: "/assets/menu/line-inventory_2.png", page: "/pages/materials/index" },
      { key: "planning", title: "教育规划", iconType: "image", image: "/assets/menu/line-route.png", path: "/planning" }
    ]
  },
  {
    key: "ask",
    items: [
      { key: "topics", title: "请教一下", iconType: "emoji", emoji: "🙏🏻", page: "/pages/topics/index" },
      { key: "worthbuy", title: "知物", iconType: "image", image: "/assets/menu/line-verified.png", page: "/pages/worthbuy/index" },
      { key: "welfare", title: "百宝箱", iconType: "image", image: "/assets/menu/welfare-gift-icon.png", page: "/pages/welfare/index" },
      { key: "mamaHaozhuan", title: "妈妈好赚", iconType: "image", image: "/assets/menu/mama-hao-zhuan-icon.png", page: "/pages/mama-resource-apply/index" }
    ]
  },
  {
    key: "memory",
    items: [
      { key: "memory", title: "记忆", iconType: "image", image: "/assets/menu/line-psychology.png", page: "/pages/mine/memory/index", panelView: "memory" }
    ]
  },
  {
    key: "settings",
    items: [
      { key: "settings", title: "设置", iconType: "image", image: "/assets/menu/line-settings.png", path: "/", panel: "settings", panelView: "settings" }
    ]
  }
];

const LAST_CHILD_ID_KEY = "xiaowanzi_last_child_id_v1";
const MEMORY_ENABLED_KEY = "xf_child_memory_enabled";
const FONT_SIZE_KEY = "xf_profile_font_size";
const SETTINGS_MEMBERSHIP_BADGE_KEY = "xf_settings_membership_badge";
const CHAT_CONTEXT_KEY = "xiaowanzi_chat_context_v1";
const CHILD_AVATAR = "/assets/wel-avatar/no-hat.png";
const ACCOUNT_AVATAR = "/assets/tabbar/xiaowanzi.png";
const RELATIONS = ["儿子", "女儿"];
const PROFILE_GENDERS = ["男", "女"];
const TAGS = ["睡眠", "情绪", "专注力", "社交", "学习习惯", "亲子沟通"];
const FONT_OPTIONS = [
  { value: "small", label: "小" },
  { value: "standard", label: "标准" },
  { value: "large", label: "大" }
];
const FONT_SIZE_CLASS_BY_VALUE = {
  small: "xf-font-small",
  standard: "xf-font-standard",
  large: "xf-font-large"
};
const CACHE_STORAGE_KEYS = [
  "xf_native_programs_cache",
  "xf_native_books_cache",
  "xf_native_materials_cache",
  "xf_native_topics_cache",
  "xf_native_search_history",
  "xf_search_recent_keywords",
  "xf_program_search_query",
  "xf_mama_resource_apply_draft_v1"
];
const ACCOUNT_DELETE_CONFIRMATION = "确认注销";

function newChildId() {
  return `child-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyChild() {
  return {
    id: newChildId(),
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
  const savedChildren = mergeChildProfileRecords(children, [], { avatarFallback: CHILD_AVATAR });
  wx.setStorageSync(CHILD_PROFILES_KEY, savedChildren);
  wx.setStorageSync(WEB_CHILD_PROFILES_KEY, JSON.stringify(savedChildren));
}

function profileComplete(child) {
  return Boolean(child && child.displayName && child.birthDate && child.grade);
}

function optionList(items, active) {
  return items.map((value) => ({ value, selected: value === active }));
}

function stageGradePicker(stage, gradeName, city) {
  const stageIndex = STAGES.indexOf(stage) >= 0 ? STAGES.indexOf(stage) : 0;
  const selectedStage = STAGES[stageIndex] || "学前";
  const gradeOptions = gradesFor(selectedStage, city);
  const gradeIndex = gradeName && gradeOptions.indexOf(gradeName) >= 0 ? gradeOptions.indexOf(gradeName) : 0;
  return {
    gradeOptions,
    gradeIndex,
    value: [stageIndex, gradeIndex],
    columns: [STAGES, gradeOptions]
  };
}

function normalizeProfileUser(value) {
  const user = normalizeWechatProfileUser(parseStoredValue(value, {}) || {});
  const gender = PROFILE_GENDERS.indexOf(user.gender) >= 0 ? user.gender : "男";
  return {
    ...user,
    gender,
    avatar: user.avatar
  };
}

function buildProfileView(draft, message) {
  const profileDraft = {
    name: String((draft && draft.name) || "").trim(),
    gender: PROFILE_GENDERS.indexOf(draft && draft.gender) >= 0 ? draft.gender : "男",
    avatar: String((draft && draft.avatar) || "").trim()
  };
  return {
    profileDraft,
    profileAvatar: resolveAccountAvatar(profileDraft.avatar),
    profileGenderOptions: optionList(PROFILE_GENDERS, profileDraft.gender),
    profilePanelMessage: message || ""
  };
}

function resolveAccountAvatar(value) {
  const source = String(value || "").trim();
  if (!source) return ACCOUNT_AVATAR;
  if (source.startsWith("/uploads/")) return buildUrl(source);
  if (/^http:\/\/xianfeng\.xinzhi\.info(?=\/|$)/i.test(source)) return source.replace(/^http:/i, "https:");
  return source;
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
  const picker = stageGradePicker(parsed.stage, parsed.gradeName, draft.city);
  const gradeOptions = picker.gradeOptions;
  const regionOptions = districtsFor(draft.city);
  const regionText = String(draft.region || "");
  const regionIndex = Math.max(0, regionOptions.findIndex((item) => item === regionText || item.replace(/区$/, "") === regionText || regionText.replace(/区$/, "") === item.replace(/区$/, "")));
  const selectedGrade = formatGrade(parsed.stage, parsed.gradeName);
  const stageIndex = STAGES.indexOf(parsed.stage) >= 0 ? STAGES.indexOf(parsed.stage) : 0;
  return {
    archiveChildren: buildArchiveTabs(children, activeId),
    archiveHasChildren: children.length > 0,
    archiveDraft: draft,
    archiveStage: parsed.stage,
    archiveGradeName: parsed.gradeName,
    archiveGradeDisplayText: selectedGrade ? `${parsed.stage} · ${parsed.gradeName}` : "请选择年级",
    archiveGradeOptions: gradeOptions,
    archiveGradeSelectOptions: optionList(gradeOptions, parsed.gradeName),
    archiveGradeIndex: picker.gradeIndex,
    archiveStageGradeColumns: picker.columns,
    archiveStageGradeValue: picker.value,
    archiveRegionOptions: regionOptions,
    archiveRegionIndex: regionIndex,
    archiveRelationOptions: optionList(RELATIONS, draft.relation),
    archiveStageOptions: STAGES,
    archiveStageIndex: stageIndex,
    archiveGradeDropdownOpen: false,
    archiveTagOptions: optionList(TAGS, "").map((item) => ({
      ...item,
      selected: draft.concernTags.includes(item.value)
    })),
    archiveInsightGrade: selectedGrade.replace(/^学前/, ""),
    archiveProfileStatus: profileComplete({ ...draft, grade: selectedGrade }) ? "可绑定" : "待补全",
    profilePanelMessage: message || ""
  };
}

function buildFontOptions(active) {
  const fontSize = normalizeFontSize(active);
  return FONT_OPTIONS.map((item) => ({ ...item, selected: item.value === fontSize }));
}

function normalizeFontSize(value) {
  const fontSize = String(value || "standard");
  return FONT_SIZE_CLASS_BY_VALUE[fontSize] ? fontSize : "standard";
}

function fontSizeClassFor(value) {
  return FONT_SIZE_CLASS_BY_VALUE[normalizeFontSize(value)];
}

function readFontSizeSetting() {
  const fontSize = normalizeFontSize(wx.getStorageSync(FONT_SIZE_KEY) || "standard");
  return {
    fontSize,
    fontSizeClass: fontSizeClassFor(fontSize),
    fontOptions: buildFontOptions(fontSize)
  };
}

function readWebviewFontSizeParam() {
  return normalizeFontSize(wx.getStorageSync(FONT_SIZE_KEY) || "standard");
}

function applyFontSizeSetting(page, value) {
  const fontSize = normalizeFontSize(value);
  wx.setStorageSync(FONT_SIZE_KEY, fontSize);
  const state = readFontSizeSetting();
  if (page && typeof page.setData === "function") page.setData(state);
  return state;
}

function clearAppCache() {
  CACHE_STORAGE_KEYS.forEach((key) => {
    try {
      wx.removeStorageSync(key);
    } catch (_error) {}
  });
  return CACHE_STORAGE_KEYS.length;
}

function setPageMessage(page, key, message) {
  if (!page || typeof page.setData !== "function") return;
  page.setData({ [key]: message });
}

function openLoginEntry(page) {
  if (!page || typeof page.setData !== "function") return;
  page.setData({
    settingsPanelOpen: true,
    settingsPanelView: "menu",
    profilePanelMessage: "",
    memoryPanelMessage: ""
  });
}

function clearLoginState(page, messageKey, message) {
  if (page && typeof page.onNativeSettingsLogout === "function") {
    page.onNativeSettingsLogout();
  }
  clearSession();
  const app = typeof getApp === "function" ? getApp() : null;
  if (app && typeof app.clearLoginSession === "function") {
    app.clearLoginSession();
  }
  if (page && typeof page.setData === "function") {
    page.setData({
      isLoggedIn: false,
      hasMobile: false,
      maskedMobile: "未绑定",
      deletingAccount: false,
      [messageKey]: message
    });
  }
  if (page && typeof page.syncAccountEntry === "function") {
    page.syncAccountEntry();
  }
}

function deleteAccountFromSettings(page, options = {}) {
  const messageKey = options.messageKey || "profilePanelMessage";
  if (!getToken()) {
    openLoginEntry(page);
    return;
  }
  if (page && page.data && page.data.deletingAccount) return;
  wx.showModal({
    title: "确认注销账户",
    content: "注销后账号会进入 3 天恢复期，期间重新登录可恢复。继续请完整输入“确认注销”。",
    editable: true,
    placeholderText: ACCOUNT_DELETE_CONFIRMATION,
    confirmText: "确认注销",
    confirmColor: "#e64b5f",
    success: (result) => {
      if (!result || !result.confirm) return;
      const confirmation = String(result.content || "").trim();
      if (confirmation !== ACCOUNT_DELETE_CONFIRMATION) {
        setPageMessage(page, messageKey, "请完整输入：确认注销");
        return;
      }
      if (page && typeof page.setData === "function") {
        page.setData({ deletingAccount: true, [messageKey]: "注销中..." });
      }
      request({
        method: "DELETE",
        url: "/api/users/me",
        data: { confirmation }
      })
        .then((payload) => {
          clearLoginState(page, messageKey, (payload && payload.message) || "账号已申请注销，3天内重新登录可恢复");
        })
        .catch((error) => {
          if (page && typeof page.setData === "function") {
            page.setData({
              deletingAccount: false,
              [messageKey]: error.message || "注销账号失败"
            });
          }
        });
    },
    fail: () => {
      setPageMessage(page, messageKey, "无法打开注销确认");
    }
  });
}

function currentChild(children, activeId) {
  const list = Array.isArray(children) ? children : [];
  return list.find((child) => child.id === activeId) || list[0] || emptyChild();
}

function memoryChildId() {
  const children = loadArchiveChildren();
  const savedId = String(wx.getStorageSync(LAST_CHILD_ID_KEY) || "");
  return currentChild(children, savedId).id;
}

function normalizeMemoryItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      id: String((item && item.id) || index),
      text: String((item && (item.text || item.content || item.summary)) || item || "").trim()
    }))
    .filter((item) => item.text);
}

function filterMemoryItems(items, query) {
  const keyword = String(query || "").trim();
  const source = normalizeMemoryItems(items);
  if (!keyword) return source;
  return source.filter((item) => item.text.indexOf(keyword) >= 0);
}

function setSettingsTabbarHidden(page, hidden) {
  if (!page || typeof page.getTabBar !== "function") return;
  const tabBar = page.getTabBar();
  if (tabBar && typeof tabBar.setData === "function") {
    tabBar.setData({ hidden });
  }
}

function getSettingsPanelHeight() {
  try {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : (wx.getSystemInfoSync ? wx.getSystemInfoSync() : {});
    return Math.max(0, Math.round(Number(info.screenHeight || info.windowHeight || 0)));
  } catch (_error) {
    return 0;
  }
}

function appendPageQuery(page, params) {
  const query = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
    .join("&");
  if (!query) return page;
  return `${page}${page.indexOf("?") >= 0 ? "&" : "?"}${query}`;
}

function openSettingsProfileView(page, view) {
  page.setData({ settingsPanelHeight: getSettingsPanelHeight(), settingsPanelOpen: true, settingsPanelView: view });
  if (typeof page.loadProfilePanelView === "function") {
    page.loadProfilePanelView(view);
  }
}

function openWechatProfileCompletion(page, user) {
  if (!needsWechatProfileCompletion(user)) return false;
  const profile = normalizeProfileUser(user);
  page._profileCompletionRequired = true;
  openSettingsProfileView(page, "profile");
  page.setData(buildProfileView({ ...profile, name: isPlaceholderName(profile.name) ? "" : profile.name }, "请选择微信头像并确认昵称"));
  return true;
}

function normalizeMembershipBadgeLabel(membership) {
  if (!membership || !membership.isProActive) return "";
  const tier = String(membership.membershipTier || membership.proPlan || "").toLowerCase();
  if (tier === "plus" || tier === "monthly") return "Plus";
  if (tier === "pro" || tier === "yearly") return "Pro";
  return "";
}

function readCachedMembershipBadgeLabel() {
  try {
    const value = wx.getStorageSync(SETTINGS_MEMBERSHIP_BADGE_KEY);
    return value === "Plus" || value === "Pro" ? value : "";
  } catch (_error) {
    return "";
  }
}

function writeCachedMembershipBadgeLabel(label) {
  try {
    if (label) wx.setStorageSync(SETTINGS_MEMBERSHIP_BADGE_KEY, label);
    else wx.removeStorageSync(SETTINGS_MEMBERSHIP_BADGE_KEY);
  } catch (_error) {}
}

function accountSubtitleFor(token, badgeLabel) {
  if (!token) return "登录后同步档案和个性化推荐";
  return "查看和管理个人资料";
}

function refreshSettingsMembershipBadge(page, token) {
  if (!token) {
    writeCachedMembershipBadgeLabel("");
    return;
  }
  request({ url: "/api/billing/me" })
    .then((response) => {
      const label = normalizeMembershipBadgeLabel(response && response.membership);
      writeCachedMembershipBadgeLabel(label);
      if (getToken() === token && typeof page.setData === "function") {
        page.setData({
          accountSubtitle: accountSubtitleFor(token, label),
          settingsMemberBadgeLabel: label
        });
      }
    })
    .catch(() => {});
}

function createNativeSettingsMethods() {
  return {
    openSettings() {
      this.syncAccountEntry();
      setSettingsTabbarHidden(this, true);
      this.setData({ settingsPanelHeight: getSettingsPanelHeight(), settingsPanelOpen: true, settingsPanelView: "menu" });
    },

    openWelfare() {
      wx.navigateTo({ url: "/pages/welfare/index" });
    },

    noop() {},

    closeSettings() {
      setSettingsTabbarHidden(this, false);
      this.setData({ settingsPanelOpen: false, settingsPanelView: "menu" });
    },

    backSettingsMenu() {
      this.setData({ settingsPanelOpen: true, settingsPanelView: "menu" });
    },

    returnSettingsMenu() {
      if (this._profileCompletionRequired) {
        this._profileCompletionRequired = false;
        this.pendingSettingsLoginDataset = null;
      }
      this.backSettingsMenu();
    },

    loadProfilePanelView(view) {
      if (view === "profile") {
        this.loadProfilePanel();
        return;
      }
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

    loadProfilePanel() {
      const draft = normalizeProfileUser(getUser());
      this.setData(buildProfileView(draft, ""));
    },

    updateProfileName(event) {
      const value = String((event && event.detail && event.detail.value) || "");
      this.setData(buildProfileView({ ...(this.data.profileDraft || {}), name: value }, ""));
    },

    chooseProfileGender(event) {
      const value = String((event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.value) || "");
      const view = buildProfileView({ ...(this.data.profileDraft || {}), gender: value }, "");
      this.setData(view);
      this.saveProfileDraft(view.profileDraft);
    },

    chooseProfileAvatar(event) {
      const path = String(event && event.detail && event.detail.avatarUrl || "").trim();
      if (!path) return;
      const view = buildProfileView({ ...(this.data.profileDraft || {}), avatar: path }, "");
      this.setData(view);
      this.saveProfileDraft(view.profileDraft);
    },

    removeProfileAvatar() {
      const view = buildProfileView({ ...(this.data.profileDraft || {}), avatar: "" }, "");
      this.setData(view);
      this.saveProfileDraft(view.profileDraft);
    },

    handleProfileAvatarError() {
      this.setData({ profileAvatar: ACCOUNT_AVATAR });
    },

    autoSaveProfileName() {
      this.saveProfileDraft(this.data.profileDraft || {});
    },

    saveProfilePanel() {
      this.saveProfileDraft(this.data.profileDraft || {});
    },

    saveProfileDraft(draft) {
      if (this._savingProfile) {
        this._pendingProfileDraft = draft;
        return;
      }
      const name = String(draft.name || "").trim();
      if (!name) {
        this.setData(buildProfileView(draft, "请先填写昵称"));
        return;
      }
      this._savingProfile = true;
      this.setData(buildProfileView(draft, "保存中..."));
      persistWechatProfile({
        name,
        avatarPath: String(draft.avatar || "").trim(),
        allowEmptyAvatar: !this._profileCompletionRequired,
        gender: PROFILE_GENDERS.indexOf(draft.gender) >= 0 ? draft.gender : "男"
      })
        .then((user) => {
          this._savingProfile = false;
          this._profileCompletionRequired = false;
          this.setData({
            ...buildProfileView(user, "资料已保存"),
            accountTitle: user.name || "微信用户",
            accountSubtitle: "查看和管理个人资料",
            accountAvatar: resolveAccountAvatar(user.avatar),
            accountPage: "/pages/mine/index",
            accountPanelView: "profile"
          });
          this.syncAccountEntry();
          if (typeof this.onNativeSettingsProfileSaved === "function") {
            this.onNativeSettingsProfileSaved(user);
          }
          const pendingSettingsLoginDataset = this.pendingSettingsLoginDataset;
          this.pendingSettingsLoginDataset = null;
          if (pendingSettingsLoginDataset && typeof this.openSettingsItem === "function") {
            this.openSettingsItem({ currentTarget: { dataset: pendingSettingsLoginDataset } });
          }
          this.flushPendingProfileDraft();
        })
        .catch((error) => {
          this._savingProfile = false;
          this.setData(buildProfileView(draft, String(error && error.message || "资料保存失败")));
          this.flushPendingProfileDraft();
        });
    },

    flushPendingProfileDraft() {
      const draft = this._pendingProfileDraft;
      this._pendingProfileDraft = null;
      if (draft) this.saveProfileDraft(draft);
    },

    loadArchivePanel() {
      const children = loadArchiveChildren();
      const savedId = String(wx.getStorageSync(LAST_CHILD_ID_KEY) || "");
      const active = children.find((child) => child.id === savedId) || children[0] || emptyChild();
      const nextChildren = children.length ? children : [active];
      this.archiveChildren = nextChildren;
      this.archiveActiveId = active.id;
      this.setData(buildArchiveView(nextChildren, active.id, { ...active }, ""));
    },

    selectArchiveChild(event) {
      const id = String((event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id) || "");
      const children = this.archiveChildren || loadArchiveChildren();
      const active = children.find((child) => child.id === id);
      if (!active) return;
      this.archiveChildren = children;
      this.archiveActiveId = active.id;
      this.setData(buildArchiveView(children, active.id, { ...active }, ""));
    },

    addArchiveChild() {
      const children = (this.archiveChildren || loadArchiveChildren()).slice();
      const currentDraft = this.data.archiveDraft || {};
      if (!String(currentDraft.displayName || "").trim()) {
        const activeId = currentDraft.id || this.archiveActiveId;
        this.archiveActiveId = activeId;
        this.setData(buildArchiveView(children.length ? children : [{ ...emptyChild(), ...currentDraft }], activeId, { ...currentDraft }, "请先完善当前未命名档案"));
        return;
      }
      const existingDraft = children.find((item) => item && item.draft);
      if (existingDraft) {
        const active = existingDraft.id === currentDraft.id ? { ...existingDraft, ...currentDraft } : existingDraft;
        this.archiveActiveId = active.id;
        this.setData(buildArchiveView(children, active.id, { ...active }, "请先完善当前未命名档案"));
        return;
      }
      const child = emptyChild();
      const nextChildren = children.concat(child);
      this.archiveChildren = nextChildren;
      this.archiveActiveId = child.id;
      this.setData(buildArchiveView(nextChildren, child.id, { ...child }, ""));
    },

    deleteArchiveChild() {
      const draft = this.data.archiveDraft || {};
      const childId = String(draft.id || this.archiveActiveId || "");
      if (!childId) return;
      wx.showModal({
        title: "删除孩子档案",
        content: "删除后不会再用于小玩子的档案建议。",
        confirmText: "删除",
        confirmColor: "#ff4d67",
        success: (result) => {
          if (!result || !result.confirm) return;
          const savedChildren = (this.archiveChildren || loadArchiveChildren()).filter((child) => child.id !== childId);
          const active = savedChildren[0] || emptyChild();
          this.archiveChildren = savedChildren.length ? savedChildren : [active];
          this.archiveActiveId = active.id;
          saveArchiveChildren(savedChildren);
          wx.setStorageSync(LAST_CHILD_ID_KEY, savedChildren.length ? active.id : "");
          this.setData(buildArchiveView(this.archiveChildren, active.id, { ...active }, "孩子档案已删除"));
        }
      });
    },

    loadMemoryPanel() {
      const enabled = wx.getStorageSync(MEMORY_ENABLED_KEY);
      this.setData({ memoryEnabled: enabled === "" ? true : enabled !== "0" && enabled !== false });
      if (!getToken()) return;
      const childId = memoryChildId();
      request({ url: `/api/users/me/child-memories/${encodeURIComponent(childId)}` })
        .then((data) => {
          this.setData({ memoryEnabled: data && data.enabled !== false });
        })
        .catch(() => {});
    },

    loadSettingsPanel() {
      const fontState = readFontSizeSetting();
      const token = getToken();
      const user = parseStoredValue(getUser(), {}) || {};
      this.setData({
        isLoggedIn: Boolean(token),
        hasMobile: Boolean(token && user.mobile),
        maskedMobile: maskMobile(user.mobile),
        ...fontState
      });
    },

    loginWithPhone(event) {
      if (this.data && this.data.bindingPhone) return;
      const loginDataset = (event && event.currentTarget && event.currentTarget.dataset) || {};
      const hasPendingSettingsItem = loginDataset.sectionIndex !== undefined && loginDataset.itemIndex !== undefined;
      this.pendingSettingsLoginDataset = hasPendingSettingsItem ? { ...loginDataset } : null;
      const phoneCode = String(event && event.detail && event.detail.code || "");
      if (!phoneCode) {
        this.pendingSettingsLoginDataset = null;
        this.setData({ profilePanelMessage: "需要授权手机号后登录" });
        return;
      }
      this.setData({ bindingPhone: true, profilePanelMessage: "" });
      wx.login({
        success: ({ code }) => {
          if (!code) {
            this.pendingSettingsLoginDataset = null;
            this.setData({ bindingPhone: false, profilePanelMessage: "微信登录失败，请重试" });
            return;
          }
          request({
            method: "POST",
            url: "/api/wechat-mini/login",
            data: { code, phoneCode }
          })
            .then((payload) => {
              setSession(payload);
              const app = typeof getApp === "function" ? getApp() : null;
              if (app) {
                app.globalData = app.globalData || {};
                app.globalData.token = getToken();
                app.globalData.user = getUser();
              }
              this.loadSettingsPanel();
              this.syncAccountEntry();
              if (typeof this.onNativeSettingsLoginSuccess === "function") {
                this.onNativeSettingsLoginSuccess(payload);
              }
              const onboarding = typeof this.selectComponent === "function"
                ? this.selectComponent("#profileOnboarding")
                : null;
              if (onboarding && typeof onboarding.reconcileAfterLogin === "function") {
                void onboarding.reconcileAfterLogin();
              }
              this.setData({ profilePanelMessage: "登录成功" });
              if (openWechatProfileCompletion(this, payload && payload.user)) return;
              const pendingSettingsLoginDataset = this.pendingSettingsLoginDataset;
              this.pendingSettingsLoginDataset = null;
              if (pendingSettingsLoginDataset && typeof this.openSettingsItem === "function") {
                this.openSettingsItem({ currentTarget: { dataset: pendingSettingsLoginDataset } });
              }
            })
            .catch((error) => {
              this.pendingSettingsLoginDataset = null;
              this.setData({ profilePanelMessage: error.message || "登录失败" });
            })
            .finally(() => {
              this.setData({ bindingPhone: false });
            });
        },
        fail: () => {
          this.pendingSettingsLoginDataset = null;
          this.setData({ bindingPhone: false, profilePanelMessage: "无法调用微信登录" });
        }
      });
    },

    goLogin() {
      this.setData({ profilePanelMessage: "请点击登录并授权手机号" });
    },

    toggleMemoryEnabled() {
      const memoryEnabled = !this.data.memoryEnabled;
      wx.setStorageSync(MEMORY_ENABLED_KEY, memoryEnabled ? "1" : "0");
      this.setData({ memoryEnabled });
    },

    chooseFontSize(event) {
      const value = String((event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.value) || "standard");
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
          setSession(payload);
          const app = typeof getApp === "function" ? getApp() : null;
          if (app) {
            app.globalData = app.globalData || {};
            app.globalData.token = getToken();
            app.globalData.user = getUser();
          }
          this.loadSettingsPanel();
          if (typeof this.onNativeSettingsLoginSuccess === "function") {
            this.onNativeSettingsLoginSuccess(payload);
          }
          if (!openWechatProfileCompletion(this, payload && payload.user)) {
            this.setData({ profilePanelMessage: "手机号已绑定" });
          }
        })
        .catch((error) => {
          this.setData({ profilePanelMessage: error.message || "绑定手机号失败" });
        })
        .finally(() => {
          this.setData({ bindingPhone: false });
        });
    },

    logout() {
      if (typeof this.onNativeSettingsLogout === "function") {
        this.onNativeSettingsLogout();
      }
      clearSession();
      const app = typeof getApp === "function" ? getApp() : null;
      if (app && typeof app.clearLoginSession === "function") {
        app.clearLoginSession();
      }
      this.setData({
        isLoggedIn: false,
        hasMobile: false,
        maskedMobile: "未绑定",
        profilePanelMessage: "已退出登录"
      });
      this.syncAccountEntry();
    },

    deleteAccount() {
      deleteAccountFromSettings(this);
    },

    syncArchiveDraft(patch, message) {
      const draft = { ...(this.data.archiveDraft || emptyChild()), ...patch };
      const children = this.archiveChildren || loadArchiveChildren();
      const activeId = this.archiveActiveId || draft.id;
      this.setData(buildArchiveView(children.length ? children : [draft], activeId, draft, message || ""));
    },

    updateArchiveName(event) {
      this.syncArchiveDraft({ displayName: event.detail.value });
    },

    updateArchiveCity(event) {
      const city = event.detail.value;
      this.syncArchiveDraft({ city, region: "" });
    },

    updateArchiveRegionInput(event) {
      this.syncArchiveDraft({ region: event.detail.value });
    },

    chooseArchiveRegion(event) {
      const region = (this.data.archiveRegionOptions || [])[Number(event.detail.value)] || "";
      this.syncArchiveDraft({ region });
    },

    chooseArchiveBirthDate(event) {
      this.syncArchiveDraft({ birthDate: event.detail.value });
    },

    chooseArchiveRelation(event) {
      const relation = String(event.currentTarget.dataset.value || "儿子");
      this.syncArchiveDraft({ relation, gender: relation === "女儿" ? "女" : "男" });
    },

    updateArchiveStageGradeColumn(event) {
      const column = Number(event && event.detail && event.detail.column);
      const index = Number(event && event.detail && event.detail.value);
      const currentValue = Array.isArray(this.data.archiveStageGradeValue) ? this.data.archiveStageGradeValue : [this.data.archiveStageIndex || 0, this.data.archiveGradeIndex || 0];
      const stageIndex = column === 0 ? Math.max(0, index) : Math.max(0, currentValue[0] || 0);
      const gradeIndex = column === 1 ? Math.max(0, index) : 0;
      const stage = STAGES[stageIndex] || "学前";
      const gradeOptions = gradesFor(stage, this.data.archiveDraft && this.data.archiveDraft.city);
      this.setData({
        archiveStageGradeColumns: [STAGES, gradeOptions],
        archiveStageGradeValue: [stageIndex, Math.min(gradeIndex, Math.max(0, gradeOptions.length - 1))]
      });
    },

    chooseArchiveStageGrade(event) {
      const detailValue = event && event.detail && event.detail.value;
      const value = Array.isArray(detailValue) ? detailValue : (this.data.archiveStageGradeValue || [this.data.archiveStageIndex || 0, this.data.archiveGradeIndex || 0]);
      const stage = STAGES[Math.max(0, Number(value[0]) || 0)] || "学前";
      const gradeOptions = gradesFor(stage, this.data.archiveDraft && this.data.archiveDraft.city);
      const gradeName = gradeOptions[Math.max(0, Number(value[1]) || 0)] || gradeOptions[0];
      this.syncArchiveDraft({ grade: formatGrade(stage, gradeName) });
    },

    chooseArchiveStage(event) {
      const datasetValue = event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.value;
      const detailValue = event && event.detail && event.detail.value;
      const stage = String(datasetValue || STAGES[Number(detailValue)] || "学前");
      this.syncArchiveDraft({ grade: formatGrade(stage, gradesFor(stage, this.data.archiveDraft && this.data.archiveDraft.city)[0]) });
    },

    toggleArchiveGradeOptions() {
      this.setData({
        archiveGradeDropdownOpen: !this.data.archiveGradeDropdownOpen
      });
    },

    chooseArchiveGrade(event) {
      const datasetValue = event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.value;
      const detailValue = event && event.detail && event.detail.value;
      const gradeName = String(datasetValue || (this.data.archiveGradeOptions || [])[Number(detailValue)] || this.data.archiveGradeName);
      this.syncArchiveDraft({ grade: formatGrade(this.data.archiveStage, gradeName) });
    },

    toggleArchiveTag(event) {
      const value = String(event.currentTarget.dataset.value || "");
      const draft = this.data.archiveDraft || emptyChild();
      const tags = Array.isArray(draft.concernTags) ? draft.concernTags : [];
      this.syncArchiveDraft({
        concernTags: tags.indexOf(value) >= 0 ? tags.filter((item) => item !== value) : tags.concat(value)
      });
    },

    saveArchivePanel() {
      const selectedGrade = formatGrade(this.data.archiveStage, this.data.archiveGradeName);
      const draft = {
        ...(this.data.archiveDraft || emptyChild()),
        displayName: String((this.data.archiveDraft && this.data.archiveDraft.displayName) || "").trim(),
        grade: selectedGrade,
        draft: false
      };
      if (!profileComplete(draft)) {
        this.syncArchiveDraft(draft, "请先补全称呼、生日和年级再保存");
        return;
      }
      const currentChildren = this.archiveChildren || loadArchiveChildren();
      if (hasDuplicateChildDisplayName(currentChildren, draft)) {
        this.syncArchiveDraft(draft, "孩子名字不能重复");
        return;
      }
      const children = currentChildren.some((child) => child.id === draft.id)
        ? currentChildren.map((child) => child.id === draft.id ? draft : child)
        : currentChildren.concat(draft);
      this.archiveChildren = children;
      this.archiveActiveId = draft.id;
      saveArchiveChildren(children);
      wx.setStorageSync(LAST_CHILD_ID_KEY, draft.id);
      this.setData(buildArchiveView(children, draft.id, { ...draft, draft: false }, "档案已保存"));
    },

    findXiaowanzi() {
      const draft = this.data.archiveDraft || emptyChild();
      const selectedGrade = formatGrade(this.data.archiveStage, this.data.archiveGradeName);
      rememberCurrentExternalPage();
      wx.setStorageSync(CHAT_CONTEXT_KEY, {
        childId: draft.id,
        childName: draft.displayName || "孩子",
        childGrade: selectedGrade,
        source: "mp-native-profile"
      });
      this.closeSettings();
      wx.switchTab({ url: "/pages/xiaowanzi/index" });
    },

    openMemoryManager() {
      if (!getToken()) {
        openLoginEntry(this);
        return;
      }
      this.setData({
        settingsPanelOpen: true,
        settingsPanelView: "memoryManager",
        memorySearchQuery: "",
        memoryItems: [],
        filteredMemoryItems: [],
        memoryPanelMessage: "正在读取记忆..."
      });
      this.loadMemoryItems();
    },

    loadMemoryItems() {
      if (!getToken()) return;
      const childId = memoryChildId();
      request({ url: `/api/users/me/child-memories/${encodeURIComponent(childId)}` })
        .then((data) => {
          const items = normalizeMemoryItems(data && data.items);
          this.setData({
            memoryItems: items,
            filteredMemoryItems: filterMemoryItems(items, this.data.memorySearchQuery),
            memoryPanelMessage: ""
          });
        })
        .catch((error) => {
          this.setData({ memoryPanelMessage: (error && error.message) || "读取记忆失败" });
        });
    },

    updateMemorySearch(event) {
      const memorySearchQuery = event.detail.value;
      this.setData({
        memorySearchQuery,
        filteredMemoryItems: filterMemoryItems(this.data.memoryItems, memorySearchQuery)
      });
    },

    deleteMemoryItem(event) {
      if (!getToken()) {
        openLoginEntry(this);
        return;
      }
      const id = String(event.currentTarget.dataset.id || "");
      if (!id) return;
      const childId = memoryChildId();
      request({
        url: `/api/users/me/child-memories/${encodeURIComponent(childId)}/items/${encodeURIComponent(id)}`,
        method: "DELETE"
      })
        .then((data) => {
          const items = normalizeMemoryItems(data && data.items);
          this.setData({
            memoryItems: items,
            filteredMemoryItems: filterMemoryItems(items, this.data.memorySearchQuery),
            memoryPanelMessage: "记忆已删除"
          });
        })
        .catch((error) => {
          this.setData({ memoryPanelMessage: (error && error.message) || "删除失败" });
        });
    },

    resolveSettingsItem(sectionIndex, itemIndex) {
      const section = SETTINGS_SECTIONS[Number(sectionIndex)];
      if (!section || !Array.isArray(section.items)) return null;
      return section.items[Number(itemIndex)] || null;
    },

    openSettingsItem(event) {
      const dataset = (event && event.currentTarget && event.currentTarget.dataset) || {};
      const hasMenuIndex = dataset.sectionIndex !== undefined && dataset.itemIndex !== undefined;
      const item = hasMenuIndex
        ? this.resolveSettingsItem(dataset.sectionIndex, dataset.itemIndex)
        : null;
      const page = String((item && item.page) || dataset.page || "").trim();
      const path = String((item && item.path) || "").trim();
      const panel = String((item && item.panel) || "").trim();
      const panelView = String((item && item.panelView) || dataset.panelView || "").trim();
      const preserveXiaowanziLayer = !!(item && item.preserveXiaowanziLayer);
      const title = String((item && item.title) || dataset.title || "家长先疯").trim();
      if ((panelView === "profile" || panelView === "archive" || panelView === "memory" || panelView === "settings") && this.data && this.data.settingsProfilePanelSupported === true) {
        openSettingsProfileView(this, panelView);
        return;
      }
      if (!page && !path) return;
      this.closeSettings();
      if (page) {
        const stack = getCurrentPages();
        const current = stack.length ? `/${stack[stack.length - 1].route}` : "";
        if (current === page) return;
        if (TAB_PAGES.indexOf(page) >= 0) {
          wx.switchTab({ url: page });
          return;
        }
        wx.navigateTo({
          url: appendPageQuery(page, {
            panel,
            from: hasMenuIndex ? "settings" : ""
          })
        });
        return;
      }
      const webParams = {};
      if (panel) webParams.xf_panel = panel;
      if (preserveXiaowanziLayer) webParams.preserveXiaowanziLayer = "1";
      openWeb(path, title, Object.keys(webParams).length ? webParams : undefined);
    },

    syncNativeFontSizeSetting() {
      this.setData(readFontSizeSetting());
    },

    syncAccountEntry() {
      const token = getToken();
      const user = normalizeProfileUser(getUser());
      const name = user && (user.name || user.username || user.mobile);
      const fontState = readFontSizeSetting();
      const settingsMemberBadgeLabel = token ? readCachedMembershipBadgeLabel() : "";
      this.setData({
        ...fontState,
        isLoggedIn: Boolean(token),
        hasMobile: Boolean(token && user && user.mobile),
        maskedMobile: maskMobile(user && user.mobile),
        accountTitle: token && name ? String(name) : "登录/注册",
        accountSubtitle: accountSubtitleFor(token, settingsMemberBadgeLabel),
        accountAvatar: token ? resolveAccountAvatar(user.avatar) : ACCOUNT_AVATAR,
        accountPage: token ? "/pages/mine/index" : "",
        accountPanelView: token ? "profile" : "",
        settingsMemberBadgeLabel
      });
      refreshSettingsMembershipBadge(this, token);
    }
  };
}

module.exports = {
  SETTINGS_SECTIONS,
  applyFontSizeSetting,
  buildFontOptions,
  clearAppCache,
  createNativeSettingsMethods,
  deleteAccountFromSettings,
  readFontSizeSetting,
  readWebviewFontSizeParam,
  getSettingsPanelHeight,
  setSettingsTabbarHidden
};
