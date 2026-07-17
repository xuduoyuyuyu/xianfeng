const { createPageShare, enableShareMenu } = require("../../../utils/share");
const { buildProfileState, CHILD_PROFILES_KEY, WEB_CHILD_PROFILES_KEY, hasDuplicateChildDisplayName, mergeChildProfileRecords, saveChildProfileRecords } = require("../../../utils/profileState");
const { readFontSizeSetting } = require("../../../utils/nativeSettings");
const { ensureBackStackForBackButtonPage } = require("../../../utils/nativePageNav");
const { rememberCurrentExternalPage } = require("../../../utils/xiaowanziReturn");

const LAST_CHILD_ID_KEY = "xiaowanzi_last_child_id_v1";
const CHAT_CONTEXT_KEY = "xiaowanzi_chat_context_v1";
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

function loadChildren() {
  return mergeChildProfileRecords(
    wx.getStorageSync(CHILD_PROFILES_KEY),
    wx.getStorageSync(WEB_CHILD_PROFILES_KEY),
    { avatarFallback: CHILD_AVATAR }
  ).map(normalizeChild);
}

function saveChildren(children) {
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

function buildTabs(children, activeId) {
  return children.map((child) => ({
    id: child.id,
    title: child.displayName || "未命名",
    avatar: child.avatar || CHILD_AVATAR,
    selected: child.id === activeId
  }));
}

function viewModel(children, activeId, draft, message) {
  const parsed = parseGrade(draft.grade);
  const picker = stageGradePicker(parsed.stage, parsed.gradeName, draft.city);
  const gradeOptions = picker.gradeOptions;
  const regionOptions = districtsFor(draft.city);
  const selectedGrade = formatGrade(parsed.stage, parsed.gradeName);
  const stageIndex = STAGES.indexOf(parsed.stage) >= 0 ? STAGES.indexOf(parsed.stage) : 0;
  return {
    ...buildProfileState(),
    ...readFontSizeSetting(),
    title: "档案管理",
    children: buildTabs(children, activeId),
    hasChildren: children.length > 0,
    draft,
    stage: parsed.stage,
    stageIndex,
    gradeName: parsed.gradeName,
    gradeDisplayText: selectedGrade ? `${parsed.stage} · ${parsed.gradeName}` : "请选择年级",
    gradeIndex: picker.gradeIndex,
    gradeOptions,
    gradeSelectOptions: optionList(gradeOptions, parsed.gradeName),
    stageGradeColumns: picker.columns,
    stageGradeValue: picker.value,
    regionOptions,
    relationOptions: optionList(RELATIONS, draft.relation),
    stageOptions: STAGES,
    gradeDropdownOpen: false,
    tagOptions: optionList(TAGS, "").map((item) => ({
      ...item,
      selected: draft.concernTags.includes(item.value)
    })),
    insightGrade: selectedGrade.replace(/^学前/, ""),
    profileStatus: profileComplete({ ...draft, grade: selectedGrade }) ? "可绑定" : "待补全",
    message: message || ""
  };
}

Page({
  data: viewModel([], "", emptyChild(), ""),

  onLoad(options = {}) {
    if (ensureBackStackForBackButtonPage(options)) return;
    enableShareMenu();
    const shouldCreateChild = String(options.action || "") === "add";
    this.loadProfile({ createChild: shouldCreateChild });
    this.skipNextShowLoad = shouldCreateChild;
  },

  onShow() {
    enableShareMenu();
    if (this.skipNextShowLoad) {
      this.skipNextShowLoad = false;
      return;
    }
    this.loadProfile();
  },

  loadProfile(options = {}) {
    const children = loadChildren();
    if (options.createChild) {
      const child = emptyChild();
      this.children = [...children, child];
      this.activeId = child.id;
      this.setData(viewModel(this.children, child.id, child, ""));
      return;
    }
    const lastId = String(wx.getStorageSync(LAST_CHILD_ID_KEY) || "");
    const active = children.find((child) => child.id === lastId) || children[0] || emptyChild();
    const nextChildren = children.length ? children : [active];
    this.children = nextChildren;
    this.activeId = active.id;
    this.setData(viewModel(nextChildren, active.id, { ...active }, ""));
  },

  syncDraft(patch, message) {
    const draft = { ...this.data.draft, ...patch };
    this.setData(viewModel(this.children || [], this.activeId || draft.id, draft, message || ""));
  },

  selectChild(event) {
    const id = String(event.currentTarget.dataset.id || "");
    const next = (this.children || []).find((child) => child.id === id);
    if (!next) return;
    this.activeId = id;
    wx.setStorageSync(LAST_CHILD_ID_KEY, id);
    this.setData(viewModel(this.children, id, { ...next }, ""));
  },

  addChild() {
    const child = emptyChild();
    this.children = [...(this.children || []), child];
    this.activeId = child.id;
    this.setData(viewModel(this.children, child.id, child, ""));
  },

  updateName(event) {
    this.syncDraft({ displayName: event.detail.value });
  },

  updateCity(event) {
    const city = event.detail.value;
    this.syncDraft({ city, region: "" });
  },

  updateRegionInput(event) {
    this.syncDraft({ region: event.detail.value });
  },

  chooseRegion(event) {
    const region = this.data.regionOptions[Number(event.detail.value)] || "";
    this.syncDraft({ region });
  },

  chooseBirthDate(event) {
    this.syncDraft({ birthDate: event.detail.value });
  },

  chooseRelation(event) {
    const relation = String(event.currentTarget.dataset.value || "儿子");
    this.syncDraft({ relation, gender: relation === "女儿" ? "女" : "男" });
  },

  updateStageGradeColumn(event) {
    const column = Number(event && event.detail && event.detail.column);
    const index = Number(event && event.detail && event.detail.value);
    const currentValue = Array.isArray(this.data.stageGradeValue) ? this.data.stageGradeValue : [this.data.stageIndex || 0, this.data.gradeIndex || 0];
    const stageIndex = column === 0 ? Math.max(0, index) : Math.max(0, currentValue[0] || 0);
    const gradeIndex = column === 1 ? Math.max(0, index) : 0;
    const stage = STAGES[stageIndex] || "学前";
    const gradeOptions = gradesFor(stage, this.data.draft && this.data.draft.city);
    this.setData({
      stageGradeColumns: [STAGES, gradeOptions],
      stageGradeValue: [stageIndex, Math.min(gradeIndex, Math.max(0, gradeOptions.length - 1))]
    });
  },

  chooseStageGrade(event) {
    const detailValue = event && event.detail && event.detail.value;
    const value = Array.isArray(detailValue) ? detailValue : (this.data.stageGradeValue || [this.data.stageIndex || 0, this.data.gradeIndex || 0]);
    const stage = STAGES[Math.max(0, Number(value[0]) || 0)] || "学前";
    const gradeOptions = gradesFor(stage, this.data.draft && this.data.draft.city);
    const gradeName = gradeOptions[Math.max(0, Number(value[1]) || 0)] || gradeOptions[0];
    this.syncDraft({ grade: formatGrade(stage, gradeName) });
  },

  chooseStage(event) {
    const datasetValue = event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.value;
    const detailValue = event && event.detail && event.detail.value;
    const stage = String(datasetValue || STAGES[Number(detailValue)] || "学前");
    this.syncDraft({ grade: formatGrade(stage, gradesFor(stage, this.data.draft.city)[0]) });
  },

  toggleGradeOptions() {
    this.setData({
      gradeDropdownOpen: !this.data.gradeDropdownOpen
    });
  },

  chooseGrade(event) {
    const datasetValue = event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.value;
    const detailValue = event && event.detail && event.detail.value;
    const gradeName = String(datasetValue || this.data.gradeOptions[Number(detailValue)] || this.data.gradeName);
    this.syncDraft({ grade: formatGrade(this.data.stage, gradeName) });
  },

  toggleTag(event) {
    const value = String(event.currentTarget.dataset.value || "");
    const tags = this.data.draft.concernTags || [];
    this.syncDraft({
      concernTags: tags.includes(value) ? tags.filter((item) => item !== value) : [...tags, value]
    });
  },

  saveProfile() {
    const selectedGrade = formatGrade(this.data.stage, this.data.gradeName);
    const draft = {
      ...this.data.draft,
      displayName: String(this.data.draft.displayName || "").trim(),
      grade: selectedGrade,
      draft: false
    };
    if (!profileComplete(draft)) {
      this.syncDraft(draft, "请先补全称呼、生日和年级再保存");
      return;
    }
    if (hasDuplicateChildDisplayName(this.children || [], draft)) {
      this.syncDraft(draft, "孩子名字不能重复");
      return;
    }
    const children = (this.children || []).some((child) => child.id === draft.id)
      ? this.children.map((child) => child.id === draft.id ? draft : child)
      : [...(this.children || []), draft];
    this.children = children;
    this.activeId = draft.id;
    saveChildren(children);
    wx.setStorageSync(LAST_CHILD_ID_KEY, draft.id);
    this.setData(viewModel(children, draft.id, draft, "档案已保存"));
  },

  deleteChild() {
    const draft = this.data.draft || {};
    const childId = String(draft.id || this.activeId || "");
    if (!childId) return;
    wx.showModal({
      title: "删除孩子档案",
      content: "删除后不会再用于小玩子的档案建议。",
      confirmText: "删除",
      confirmColor: "#ff4d67",
      success: (result) => {
        if (!result || !result.confirm) return;
        const savedChildren = (this.children || loadChildren()).filter((child) => child.id !== childId);
        const active = savedChildren[0] || emptyChild();
        this.children = savedChildren.length ? savedChildren : [active];
        this.activeId = active.id;
        saveChildren(savedChildren);
        wx.setStorageSync(LAST_CHILD_ID_KEY, savedChildren.length ? active.id : "");
        this.setData(viewModel(this.children, active.id, { ...active }, "孩子档案已删除"));
      }
    });
  },

  openXiaowanzi() {
    const draft = this.data.draft;
    const selectedGrade = formatGrade(this.data.stage, this.data.gradeName);
    rememberCurrentExternalPage();
    wx.setStorageSync(CHAT_CONTEXT_KEY, {
      childId: draft.id,
      childName: draft.displayName || "孩子",
      childGrade: selectedGrade,
      source: "mp-native-profile"
    });
    wx.switchTab({ url: "/pages/xiaowanzi/index" });
  },

  goBack() {
    if (typeof wx.navigateBack === "function") {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.switchTab({ url: "/pages/mine/index" });
  },

  goLogin() {
    if (this.data.isLoggedIn) return;
    wx.showToast({ title: "请返回个人中心授权登录", icon: "none" });
  },

  onShareAppMessage() {
    return createPageShare({
      title: "家长先疯档案",
      path: "/pages/mine/archive/index"
    }).onShareAppMessage();
  },

  onShareTimeline() {
    return createPageShare({
      title: "家长先疯档案",
      path: "/pages/mine/archive/index"
    }).onShareTimeline();
  }
});
