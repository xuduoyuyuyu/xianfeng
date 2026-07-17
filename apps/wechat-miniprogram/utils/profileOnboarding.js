const {
  CHILD_PROFILES_KEY,
  WEB_CHILD_PROFILES_KEY,
  mergeChildProfileRecords,
  saveChildProfileRecords,
} = require("./profileState");
const { getToken } = require("./session");

const LAST_CHILD_ID_KEY = "xiaowanzi_last_child_id_v1";
const SYNC_PENDING_KEY = "xf_profile_onboarding_sync_pending_v1";
const PENDING_PROFILE_KEY = "xf_profile_onboarding_pending_v1";
const CHILD_AVATAR = "/assets/wel-avatar/no-hat.png";
const STAGES = ["孕产", "婴幼儿", "学前", "小学", "初中", "高中"];
const GRADES_BY_STAGE = {
  孕产: ["孕产"],
  婴幼儿: ["婴幼儿"],
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
  if (stage === "孕产" || stage === "婴幼儿") return stage;
  if (stage === "学前") return `学前${gradeName}`;
  if (stage === "小学") return `小学${gradeName}`;
  if (stage === "初中") return `初中${trim(gradeName).replace("（预初）", "")}`;
  return gradeName;
}

function parseGrade(raw) {
  const text = trim(raw);
  if (!text) return { stage: "", gradeName: "" };
  for (const stage of ["高中", "初中", "小学", "学前", "婴幼儿", "孕产"]) {
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

function normalizeBasicProfile(value) {
  return {
    city: trim(value && value.city),
    region: trim(value && value.region),
    grade: trim(value && value.grade),
  };
}

function readPendingProfileOnboarding() {
  const pending = normalizeBasicProfile(wx.getStorageSync(PENDING_PROFILE_KEY));
  return isBasicProfileComplete(pending) ? pending : null;
}

function sameBasicProfile(left, right) {
  const a = normalizeBasicProfile(left);
  const b = normalizeBasicProfile(right);
  return a.city === b.city && a.region === b.region && a.grade === b.grade;
}

function nextDefaultChildName(children) {
  const used = new Set((Array.isArray(children) ? children : []).map((child) => trim(child && child.displayName)));
  if (!used.has("孩子")) return "孩子";
  let index = 2;
  while (used.has(`孩子${index}`)) index += 1;
  return `孩子${index}`;
}

function childFromPending(pending, children) {
  return {
    id: newChildId(),
    relation: "儿子",
    displayName: nextDefaultChildName(children),
    gender: "男",
    birthDate: "",
    ...normalizeBasicProfile(pending),
    concernTags: [],
    avatar: CHILD_AVATAR,
    createdAt: new Date().toISOString(),
    draft: false,
  };
}

function getProfileOnboardingState() {
  const child = activeChild(loadChildren());
  const pending = readPendingProfileOnboarding();
  const source = pending || child;
  return {
    visible: !dismissedForSession && !isBasicProfileComplete(child),
    childId: child ? child.id : "",
    city: trim(source && source.city),
    region: trim(source && source.region),
    grade: trim(source && source.grade),
  };
}

function saveChildren(children) {
  saveChildProfileRecords(children, { avatarFallback: CHILD_AVATAR });
}

function cacheProfileOnboardingChildren(children) {
  const list = Array.isArray(children) ? children : [];
  saveChildren(list);
  const selected = activeChild(list);
  if (selected) wx.setStorageSync(LAST_CHILD_ID_KEY, selected.id);
  return list;
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

  wx.setStorageSync(PENDING_PROFILE_KEY, { city, region, grade });
  dismissedForSession = true;
  return { city, region, grade, childId: "", pending: true };
}

function reconcilePendingProfileOnboarding(children) {
  const list = Array.isArray(children) ? children : [];
  const pending = readPendingProfileOnboarding();
  if (!pending) return { status: "none", children: list, childId: "", pending: null };
  const matched = list.find((child) => sameBasicProfile(child, pending));
  if (matched) return { status: "matched", children: list, childId: matched.id, pending };
  if (list.length) return { status: "confirm", children: list, childId: "", pending };
  const child = childFromPending(pending, list);
  return { status: "created", children: [child], childId: child.id, pending };
}

function applyPendingProfileOnboardingDecision(action, children) {
  const list = Array.isArray(children) ? children : [];
  if (action === "discard") {
    wx.removeStorageSync(PENDING_PROFILE_KEY);
    return { status: "discarded", children: list, childId: activeChild(list)?.id || "", pending: null };
  }
  const result = reconcilePendingProfileOnboarding(list);
  if (result.status === "confirm" && action === "create") {
    const child = childFromPending(result.pending, list);
    result.status = "created";
    result.children = list.concat(child);
    result.childId = child.id;
  }
  if (result.status === "matched" || result.status === "created") {
    saveChildren(result.children);
    wx.setStorageSync(LAST_CHILD_ID_KEY, result.childId);
    wx.removeStorageSync(PENDING_PROFILE_KEY);
  }
  return result;
}

function buildPersonalizationQuery() {
  const child = readPendingProfileOnboarding() || activeChild(loadChildren());
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
  PENDING_PROFILE_KEY,
  STAGES,
  SYNC_PENDING_KEY,
  applyPendingProfileOnboardingDecision,
  buildPersonalizationQuery,
  cacheProfileOnboardingChildren,
  dismissProfileOnboardingForSession,
  districtsFor,
  formatGrade,
  getProfileOnboardingState,
  gradesFor,
  parseGrade,
  readPendingProfileOnboarding,
  reconcilePendingProfileOnboarding,
  resetProfileOnboardingSession,
  saveProfileOnboardingDraft,
  syncProfileOnboardingRemote,
};
