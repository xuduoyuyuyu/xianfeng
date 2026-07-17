const { getToken, getUser } = require("./session");

const CHILD_PROFILES_KEY = "xf_child_profiles";
const WEB_CHILD_PROFILES_KEY = "xiaowanzi_child_profiles_v1";
const LEGACY_CHILD_AVATAR_PATHS = new Set([
  "/assets/xiaowanzi-nohat.png",
  "/assets/xiaowanzi-topbar.png"
]);

function parseStoredValue(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }
  return value;
}

function maskMobile(value) {
  const text = String(value || "").trim();
  if (text.length < 7) return "未绑定";
  return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

function normalizeTags(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function normalizeChildDisplayName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeChildAvatar(value, fallback) {
  const avatar = String(value || "").trim();
  const fallbackAvatar = String(fallback || "").trim();
  if (!avatar) return fallbackAvatar;
  if (LEGACY_CHILD_AVATAR_PATHS.has(avatar)) return fallbackAvatar;
  return avatar;
}

function normalizeChildRecord(item, index, options = {}) {
  const source = item || {};
  if (source.draft && !options.includeDrafts) return null;
  const relation = source.relation === "女儿" ? "女儿" : String(source.relation || "儿子").trim() || "儿子";
  const displayName = normalizeChildDisplayName(source.displayName || source.name || source.title);
  if (!displayName && !options.includeDrafts) return null;
  const id = String(source.id || (displayName ? `child-${index}` : "")).trim();
  if (!id) return null;
  return {
    id,
    relation,
    displayName,
    gender: source.gender === "男" || relation === "儿子" ? "男" : "女",
    birthDate: String(source.birthDate || "").trim(),
    city: String(source.city || "").trim(),
    region: String(source.region || "").trim(),
    grade: String(source.grade || "").trim(),
    concernTags: normalizeTags(source.concernTags),
    avatar: normalizeChildAvatar(source.avatar, options.avatarFallback),
    createdAt: String(source.createdAt || new Date(0).toISOString()),
    draft: Boolean(source.draft)
  };
}

function mergeChildProfileRecords(nativeValue, webValue, options = {}) {
  const sources = [parseStoredValue(webValue, []), parseStoredValue(nativeValue, [])];
  const merged = new Map();
  const idByName = new Map();
  sources.forEach((source) => {
    if (!Array.isArray(source)) return;
    source.forEach((item, index) => {
      const child = normalizeChildRecord(item, index, options);
      if (!child) return;
      const nameKey = normalizeChildDisplayName(child.displayName);
      const existingId = nameKey ? idByName.get(nameKey) : "";
      if (existingId && existingId !== child.id) merged.delete(existingId);
      merged.set(child.id, child);
      if (nameKey) idByName.set(nameKey, child.id);
    });
  });
  return Array.from(merged.values());
}

function saveChildProfileRecords(children, options = {}) {
  const savedChildren = mergeChildProfileRecords(children, [], options);
  wx.setStorageSync(CHILD_PROFILES_KEY, savedChildren);
  wx.setStorageSync(WEB_CHILD_PROFILES_KEY, JSON.stringify(savedChildren));
  if (getToken()) {
    const { request } = require("./request");
    Promise.resolve(request({
      url: "/api/users/me/xiaowanzi-sync",
      method: "PATCH",
      data: { childProfiles: savedChildren }
    })).catch(() => {});
  }
  return savedChildren;
}

function hasDuplicateChildDisplayName(children, draft) {
  const draftName = normalizeChildDisplayName(draft && (draft.displayName || draft.name || draft.title));
  const draftId = String((draft && draft.id) || "");
  if (!draftName) return false;
  return (Array.isArray(children) ? children : []).some((child) => {
    if (!child) return false;
    const childId = String(child.id || "");
    if (draftId && childId === draftId) return false;
    return normalizeChildDisplayName(child.displayName || child.name || child.title) === draftName;
  });
}

function normalizeChildren(value) {
  const raw = parseStoredValue(value, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      const tags = normalizeTags(item && item.concernTags);
      const city = String((item && item.city) || "").trim();
      const region = String((item && item.region) || "").trim();
      const grade = String((item && item.grade) || "").trim();
      const relation = String((item && item.relation) || "").trim();
      const title = String((item && (item.displayName || item.name)) || "").trim() || `孩子 ${index + 1}`;
      const subtitle = [relation, grade, [city, region].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "待补全档案";
      return {
        id: String((item && item.id) || `child-${index}`),
        title,
        initial: title.slice(0, 1),
        subtitle,
        grade,
        tags,
        tagText: tags.length ? tags.slice(0, 3).join(" / ") : "暂无关注点"
      };
    })
    .filter((item) => item.title);
}

function loadChildren() {
  const nativeValue = wx.getStorageSync(CHILD_PROFILES_KEY);
  const webValue = wx.getStorageSync(WEB_CHILD_PROFILES_KEY);
  return normalizeChildren(mergeChildProfileRecords(nativeValue, webValue));
}

function buildProfileState() {
  const token = getToken();
  const user = parseStoredValue(getUser(), null) || {};
  const children = loadChildren();
  const displayName = String(user.name || user.username || "").trim() || (token ? "家长先疯用户" : "登录/注册");
  const tagCount = children.reduce((sum, item) => sum + item.tags.length, 0);
  return {
    isLoggedIn: Boolean(token),
    hasMobile: Boolean(token && user.mobile),
    user,
    displayName,
    avatarText: String(user.avatar_initial || displayName.slice(0, 1) || "先").slice(0, 1),
    maskedMobile: maskMobile(user.mobile),
    children,
    hasChildren: children.length > 0,
    stats: [
      { label: "孩子档案", value: String(children.length) },
      { label: "关注点", value: String(tagCount) },
      { label: "账户状态", value: token ? "已登录" : "未登录" }
    ],
    quickActions: [
      { key: "archive", title: "档案管理", subtitle: children.length ? "查看孩子档案摘要" : "登录后同步孩子档案", image: "/assets/menu/line-badge.png" },
      { key: "memory", title: "记忆", subtitle: "管理小玩子长期记忆", image: "/assets/menu/line-psychology.png" },
      { key: "settings", title: "设置", subtitle: "账号、字体和缓存", image: "/assets/menu/line-settings.png" }
    ]
  };
}

module.exports = {
  CHILD_PROFILES_KEY,
  WEB_CHILD_PROFILES_KEY,
  buildProfileState,
  hasDuplicateChildDisplayName,
  mergeChildProfileRecords,
  saveChildProfileRecords,
  maskMobile,
  parseStoredValue
};
