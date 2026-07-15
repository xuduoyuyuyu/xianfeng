const {
  CHILD_PROFILES_KEY,
  WEB_CHILD_PROFILES_KEY,
  mergeChildProfileRecords,
} = require("./profileState");
const { getToken } = require("./session");

const LAST_CHILD_ID_KEY = "xiaowanzi_last_child_id_v1";
const SYNC_PENDING_KEY = "xf_profile_onboarding_sync_pending_v1";
const CHILD_AVATAR = "/assets/wel-avatar/no-hat.png";
const STAGES = ["学前", "小学", "初中", "高中"];
const GRADES_BY_STAGE = {
  学前: ["未入园", "托班", "小班", "中班", "大班"],
  小学: ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"],
  初中: ["六年级（预初）", "七年级", "八年级", "九年级"],
  高中: ["高一年级", "高二年级", "高三年级"],
};
const WUSI_CITIES = ["上海", "上海市", "威海", "威海市", "淄博", "淄博市", "莱芜", "莱芜市", "烟台", "烟台市", "哈尔滨", "哈尔滨市", "大庆", "大庆市", "青岛", "青岛市"];
const DISTRICTS_BY_CITY = {
  上海: ["黄浦区", "徐汇区", "长宁区", "静安区", "普陀区", "虹口区", "杨浦区", "闵行区", "宝山区", "嘉定区", "浦东新区", "金山区", "松江区", "青浦区", "奉贤区", "崇明区"],
  北京: ["东城区", "西城区", "朝阳区", "丰台区", "石景山区", "海淀区", "顺义区", "通州区", "大兴区", "房山区", "门头沟区", "昌平区", "平谷区", "密云区", "怀柔区", "延庆区"],
  广州: ["越秀区", "海珠区", "荔湾区", "天河区", "白云区", "黄埔区", "南沙区", "番禺区", "花都区", "增城区", "从化区"],
  深圳: ["福田区", "罗湖区", "南山区", "盐田区", "宝安区", "龙岗区", "龙华区", "坪山区", "光明区"],
  杭州: ["上城区", "拱墅区", "西湖区", "滨江区", "余杭区", "萧山区", "临平区", "钱塘区", "富阳区", "临安区"],
};

let dismissedForSession = false;

function trim(value) {
  return String(value || "").trim();
}

function newChildId() {
  return `child-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function gradesFor(stage, city) {
  const fiveFour = WUSI_CITIES.some((item) => trim(city).includes(item));
  if (stage === "小学" && fiveFour) return ["一年级", "二年级", "三年级", "四年级", "五年级"];
  if (stage === "初中" && fiveFour) return ["六年级（预初）", "七年级", "八年级", "九年级"];
  return GRADES_BY_STAGE[stage] || GRADES_BY_STAGE.学前;
}

function formatGrade(stage, gradeName) {
  if (!stage || !gradeName) return "";
  if (stage === "学前") return `学前${gradeName}`;
  if (stage === "小学") return `小学${gradeName}`;
  if (stage === "初中") return `初中${trim(gradeName).replace("（预初）", "")}`;
  return gradeName;
}

function parseGrade(raw) {
  const text = trim(raw);
  if (!text) return { stage: "", gradeName: "" };
  for (const stage of ["高中", "初中", "小学", "学前"]) {
    const gradeName = GRADES_BY_STAGE[stage].find((item) => text.includes(item) || text === item);
    if (gradeName) return { stage, gradeName };
  }
  return { stage: "", gradeName: "" };
}

function districtsFor(city) {
  const keyword = trim(city);
  if (!keyword) return [];
  const entry = Object.entries(DISTRICTS_BY_CITY).find(([name]) => keyword.includes(name) || name.includes(keyword));
  return entry ? entry[1] : [];
}

function loadChildren() {
  return mergeChildProfileRecords(
    wx.getStorageSync(CHILD_PROFILES_KEY),
    wx.getStorageSync(WEB_CHILD_PROFILES_KEY),
    { avatarFallback: CHILD_AVATAR }
  );
}

function activeChild(children) {
  const lastId = trim(wx.getStorageSync(LAST_CHILD_ID_KEY));
  return children.find((child) => child.id === lastId) || children[0] || null;
}

function isBasicProfileComplete(child) {
  return Boolean(child && trim(child.city) && trim(child.region) && trim(child.grade));
}

function getProfileOnboardingState() {
  const child = activeChild(loadChildren());
  return {
    visible: !dismissedForSession && !isBasicProfileComplete(child),
    childId: child ? child.id : "",
    city: trim(child && child.city),
    region: trim(child && child.region),
    grade: trim(child && child.grade),
  };
}

function saveChildren(children) {
  wx.setStorageSync(CHILD_PROFILES_KEY, children);
  wx.setStorageSync(WEB_CHILD_PROFILES_KEY, JSON.stringify(children));
}

async function syncProfileOnboardingRemote(children, child) {
  if (!getToken()) return false;
  const resolvedChildren = Array.isArray(children) ? children : loadChildren();
  const resolvedChild = child || activeChild(resolvedChildren);
  if (!isBasicProfileComplete(resolvedChild)) return false;
  const { request } = require("./request");
  try {
    await Promise.all([
      request({ url: "/api/users/me", method: "PATCH", data: { city: resolvedChild.city, region: resolvedChild.region, childGrade: resolvedChild.grade } }),
      request({ url: "/api/users/me/xiaowanzi-sync", method: "PATCH", data: { childProfiles: resolvedChildren } }),
    ]);
    wx.removeStorageSync(SYNC_PENDING_KEY);
    return true;
  } catch (_error) {
    wx.setStorageSync(SYNC_PENDING_KEY, true);
    return false;
  }
}

async function saveProfileOnboardingDraft(draft) {
  const city = trim(draft && draft.city);
  const region = trim(draft && draft.region);
  const grade = formatGrade(trim(draft && draft.stage), trim(draft && draft.gradeName));
  if (!city || !region || !grade) throw new Error("请完整选择城市、区域和年级");

  const current = loadChildren();
  const selected = activeChild(current);
  const child = {
    ...(selected || {}),
    id: selected ? selected.id : newChildId(),
    relation: selected ? selected.relation : "儿子",
    displayName: trim(selected && selected.displayName) || "孩子",
    gender: selected ? selected.gender : "男",
    birthDate: trim(selected && selected.birthDate),
    city,
    region,
    grade,
    concernTags: Array.isArray(selected && selected.concernTags) ? selected.concernTags : [],
    avatar: trim(selected && selected.avatar) || CHILD_AVATAR,
    createdAt: trim(selected && selected.createdAt) || new Date().toISOString(),
    draft: false,
  };
  const children = selected
    ? current.map((item) => item.id === selected.id ? child : item)
    : [child];
  saveChildren(children);
  wx.setStorageSync(LAST_CHILD_ID_KEY, child.id);
  dismissedForSession = true;
  wx.setStorageSync(SYNC_PENDING_KEY, true);
  void syncProfileOnboardingRemote(children, child);
  return { city, region, grade, childId: child.id };
}

function buildPersonalizationQuery() {
  const child = activeChild(loadChildren());
  if (!isBasicProfileComplete(child)) return "";
  return [
    ["profileCity", child.city],
    ["profileRegion", child.region],
    ["profileGrade", child.grade],
  ].map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
}

function dismissProfileOnboardingForSession() {
  dismissedForSession = true;
}

function resetProfileOnboardingSession() {
  dismissedForSession = false;
}

module.exports = {
  CITIES: Object.keys(DISTRICTS_BY_CITY),
  DISTRICTS_BY_CITY,
  GRADES_BY_STAGE,
  STAGES,
  SYNC_PENDING_KEY,
  buildPersonalizationQuery,
  dismissProfileOnboardingForSession,
  districtsFor,
  formatGrade,
  getProfileOnboardingState,
  gradesFor,
  parseGrade,
  resetProfileOnboardingSession,
  saveProfileOnboardingDraft,
  syncProfileOnboardingRemote,
};
