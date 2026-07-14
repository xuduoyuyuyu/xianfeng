const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { request, buildUrl } = require("../../utils/request");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { ensureBackStackForBackButtonPage, goProgramsHome: navigateProgramsHome, smartBackHome } = require("../../utils/nativePageNav");
const { SETTINGS_SECTIONS, createNativeSettingsMethods } = require("../../utils/nativeSettings");
const { getToken, getUser } = require("../../utils/session");

const CATEGORY_OPTIONS = ["亲子阅读", "学习用品", "母婴", "儿童健康", "家庭消费", "教育规划"];
const CHILD_STAGE_OPTIONS = ["孕产/婴幼儿", "幼儿园", "小学", "初中", "高中", "多孩家庭"];
const CHILD_GENDER_OPTIONS = [
  { value: "男孩", label: "男孩" },
  { value: "女孩", label: "女孩" }
];
const REAL_NAME_VERIFIED_OPTIONS = [
  { value: "yes", label: "已实名" },
  { value: "no", label: "未实名" }
];
const MEDIA_PLATFORM_OPTIONS = [
  { value: "xiaohongshu", label: "小红书" },
  { value: "douyin", label: "抖音" }
];
const LOGO_HEIGHT_RPX = 56;
const MAMA_RESOURCE_APPLY_DRAFT_KEY = "xf_mama_resource_apply_draft_v1";
const MAMA_RESOURCE_SHARE_COVER_IMAGE = "/assets/share/mama-hao-zhuan-cover.png";

const EMPTY_APPLY_DRAFT = {
  displayName: "",
  contactWechat: "",
  contactPhone: "",
  alipayAccount: "",
  alipayVerifiedName: "",
  city: "",
  childStage: "",
  childGender: "",
  xiaohongshuNickname: "",
  xiaohongshuProfileUrl: "",
  originalXiaohongshuProfileUrl: "",
  xiaohongshuScreenshotUrl: "",
  followerCount: "",
  realNameVerified: null,
  accountPositioning: "",
  mediaAccounts: [],
  selectedCategories: [],
  blockedCategories: "",
  consentAccepted: false
};

function buildCategoryOptions(selectedCategories) {
  const selected = Array.isArray(selectedCategories) ? selectedCategories : [];
  return CATEGORY_OPTIONS.map((label) => ({
    label,
    selected: selected.indexOf(label) >= 0
  }));
}

function asText(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function mediaPlatformIndexFor(platform) {
  const value = asText(platform).trim();
  if (!value) return -1;
  const index = MEDIA_PLATFORM_OPTIONS.findIndex((item) => item.value === value);
  return index >= 0 ? index : -1;
}

function mediaPlatformValueFor(platform, fallbackPlatform = "") {
  const platformIndex = mediaPlatformIndexFor(platform);
  if (platformIndex >= 0) return MEDIA_PLATFORM_OPTIONS[platformIndex].value;
  const fallbackIndex = mediaPlatformIndexFor(fallbackPlatform);
  return fallbackIndex >= 0 ? MEDIA_PLATFORM_OPTIONS[fallbackIndex].value : "";
}

function mediaPlatformPickerIndexFor(platform) {
  const index = mediaPlatformIndexFor(platform);
  return index >= 0 ? index : 0;
}

function mediaPlatformLabelFor(platform) {
  const index = mediaPlatformIndexFor(platform);
  return index >= 0 ? MEDIA_PLATFORM_OPTIONS[index].label : "请选择平台";
}

function mediaPlatformLogoFor(platform) {
  const value = mediaPlatformValueFor(platform);
  if (value === "douyin") {
    return { text: "", className: "is-douyin", url: "/assets/platform/douyin-logo.png" };
  }
  if (value === "xiaohongshu") {
    return { text: "", className: "is-xiaohongshu", url: "/assets/platform/xiaohongshu-logo.png" };
  }
  return { text: "+", className: "is-unselected", url: "" };
}

function blankMediaAccount(platform = "") {
  const value = mediaPlatformValueFor(platform);
  const logo = mediaPlatformLogoFor(value);
  return {
    platform: value,
    platformLabel: mediaPlatformLabelFor(value),
    platformIndex: mediaPlatformPickerIndexFor(value),
    platformLogoText: logo.text,
    platformLogoClass: logo.className,
    platformLogoUrl: logo.url,
    nickname: "",
    profileUrl: "",
    screenshotUrl: "",
    followerCount: "",
    realNameVerified: null
  };
}

function normalizeMediaAccount(value, fallbackPlatform = "") {
  const source = value && typeof value === "object" ? value : {};
  const platform = mediaPlatformValueFor(source.platform, fallbackPlatform);
  const logo = mediaPlatformLogoFor(platform);
  return {
    platform,
    platformLabel: mediaPlatformLabelFor(platform),
    platformIndex: mediaPlatformPickerIndexFor(platform),
    platformLogoText: logo.text,
    platformLogoClass: logo.className,
    platformLogoUrl: logo.url,
    nickname: asText(source.nickname).trim(),
    profileUrl: asText(source.profileUrl || source.xiaohongshuProfileUrl).trim(),
    screenshotUrl: asText(source.screenshotUrl || source.xiaohongshuScreenshotUrl).trim(),
    followerCount: asText(source.followerCount).trim(),
    realNameVerified: source.realNameVerified === true ? true : source.realNameVerified === false ? false : null
  };
}

function normalizeExtraMediaAccounts(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeMediaAccount);
}

function buildProfileOverview(formDraft) {
  const draft = normalizeApplyDraft(formDraft);
  const personalItems = [
    draft.displayName || "未填姓名/昵称",
    draft.contactWechat ? `微信 ${draft.contactWechat}` : "",
    draft.contactPhone ? `手机 ${draft.contactPhone}` : "",
    draft.alipayAccount ? `支付宝 ${draft.alipayAccount}` : "",
    draft.alipayVerifiedName ? `验证姓名 ${draft.alipayVerifiedName}` : ""
  ].filter(Boolean);
  const allAccounts = [normalizeMediaAccount({
    platform: "xiaohongshu",
    nickname: draft.xiaohongshuNickname,
    profileUrl: draft.xiaohongshuProfileUrl,
    screenshotUrl: draft.xiaohongshuScreenshotUrl,
    followerCount: draft.followerCount,
    realNameVerified: draft.realNameVerified
  })].concat(draft.mediaAccounts);
  const filledAccounts = allAccounts.filter((account) => account.profileUrl || account.nickname || account.followerCount);
  const selectedCategories = draft.selectedCategories.length ? draft.selectedCategories.join("、") : "未选择可发品类";
  return {
    personalSummary: personalItems.join(" · "),
    mediaSummary: filledAccounts.length ? `${filledAccounts.length} 个媒体账号` : "未添加媒体账号",
    preferenceSummary: `${selectedCategories}${draft.blockedCategories ? ` · 暂不接：${draft.blockedCategories}` : ""}`,
    consentSummary: "资料提交后将用于任务匹配和运营联系",
    accounts: filledAccounts.map((account, index) => ({
      ...account,
      title: account.nickname || `${account.platformLabel || "媒体"}账号 ${index + 1}`,
      summary: account.platform === "xiaohongshu" ? "" : [account.nickname, account.followerCount ? `粉丝 ${account.followerCount}` : "", account.realNameVerified === true ? "已实名" : account.realNameVerified === false ? "未实名" : ""].filter(Boolean).join(" · ") || account.profileUrl || "待补充"
    }))
  };
}

function cloneEmptyApplyDraft() {
  return {
    ...EMPTY_APPLY_DRAFT,
    mediaAccounts: [],
    selectedCategories: []
  };
}

function normalizeApplyDraft(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    displayName: asText(source.displayName).trim(),
    contactWechat: asText(source.contactWechat).trim(),
    contactPhone: asText(source.contactPhone).trim(),
    alipayAccount: asText(source.alipayAccount).trim(),
    alipayVerifiedName: asText(source.alipayVerifiedName).trim(),
    city: asText(source.city).trim(),
    childStage: asText(source.childStage).trim(),
    childGender: asText(source.childGender).trim(),
    xiaohongshuNickname: asText(source.xiaohongshuNickname).trim(),
    xiaohongshuProfileUrl: asText(source.xiaohongshuProfileUrl).trim(),
    originalXiaohongshuProfileUrl: asText(source.originalXiaohongshuProfileUrl).trim(),
    xiaohongshuScreenshotUrl: asText(source.xiaohongshuScreenshotUrl).trim(),
    followerCount: asText(source.followerCount).trim(),
    realNameVerified: source.realNameVerified === true ? true : source.realNameVerified === false ? false : null,
    accountPositioning: asText(source.accountPositioning).trim(),
    mediaAccounts: normalizeExtraMediaAccounts(source.mediaAccounts),
    selectedCategories: Array.isArray(source.selectedCategories) ? source.selectedCategories.map(asText).filter(Boolean) : [],
    blockedCategories: asText(source.blockedCategories).trim(),
    consentAccepted: source.consentAccepted === true
  };
}

function loadApplyDraft() {
  try {
    const value = wx.getStorageSync(MAMA_RESOURCE_APPLY_DRAFT_KEY);
    return normalizeApplyDraft(value);
  } catch (_error) {
    return cloneEmptyApplyDraft();
  }
}

function saveApplyDraft(draft) {
  try {
    wx.setStorageSync(MAMA_RESOURCE_APPLY_DRAFT_KEY, normalizeApplyDraft(draft));
  } catch (_error) {}
}

function clearApplyDraft() {
  try {
    wx.removeStorageSync(MAMA_RESOURCE_APPLY_DRAFT_KEY);
  } catch (_error) {}
}

function childStageIndexFor(childStage) {
  return CHILD_STAGE_OPTIONS.indexOf(childStage);
}

function buildApplyDraftState(draftValue) {
  const formDraft = normalizeApplyDraft(draftValue);
  return {
    formDraft,
    selectedCategories: formDraft.selectedCategories,
    categories: buildCategoryOptions(formDraft.selectedCategories),
    childStageIndex: childStageIndexFor(formDraft.childStage),
    childStage: formDraft.childStage,
    childGender: formDraft.childGender,
    xiaohongshuScreenshotUrl: formDraft.xiaohongshuScreenshotUrl,
    realNameVerified: formDraft.realNameVerified,
    mediaAccounts: formDraft.mediaAccounts,
    mediaPlatformOptions: MEDIA_PLATFORM_OPTIONS,
    profileOverview: buildProfileOverview(formDraft)
  };
}

function formatMoneyFromCents(value) {
  const cents = Number(value || 0);
  return cents > 0 ? `¥${(cents / 100).toFixed(2)}` : "待定";
}

function formatCount(value) {
  const count = Number(value || 0);
  return count > 0 ? String(count) : "待补";
}

function formatActivePromotionCount(task) {
  const source = task && typeof task === "object" ? task : {};
  if (source.activePromotionCount !== undefined && source.activePromotionCount !== null) {
    const count = Number(source.activePromotionCount);
    return Number.isFinite(count) && count >= 0 ? String(Math.floor(count)) : "待补";
  }
  return formatCount(source.promotionCount);
}

function formatDateText(value) {
  const text = asText(value).trim();
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatRemainingClaimCount(task) {
  const source = task && typeof task === "object" ? task : {};
  if (source.remainingClaimCount === undefined || source.remainingClaimCount === null) return "不限名额";
  const count = Number(source.remainingClaimCount);
  if (!Number.isFinite(count)) return "不限名额";
  return count > 0 ? `剩余${Math.floor(count)}个名额` : "已领完";
}

function taskStatusText(status) {
  if (status === "listed") return "可领取";
  if (status === "submitted") return "待审核";
  if (status === "collected") return "已收录";
  if (status === "rejected") return "已驳回";
  return "进行中";
}

function parseSceneParam(scene, key) {
  const decoded = decodeURIComponent(asText(scene).trim());
  if (!decoded) return "";
  return decoded
    .split("&")
    .map((item) => item.split("="))
    .reduce((result, pair) => {
      const name = asText(pair[0]).trim();
      if (name === key) return asText(pair.slice(1).join("=")).trim();
      return result;
    }, "");
}

function currentMiniProgramEnvVersion() {
  if (typeof wx === "undefined" || typeof wx.getAccountInfoSync !== "function") return "";
  try {
    const info = wx.getAccountInfoSync();
    const envVersion = asText(info && info.miniProgram && info.miniProgram.envVersion).trim();
    return ["develop", "trial", "release"].indexOf(envVersion) >= 0 ? envVersion : "";
  } catch (_error) {
    return "";
  }
}

function mamaTaskShareQrUrl(taskId) {
  const params = [`taskId=${encodeURIComponent(taskId)}`];
  const envVersion = currentMiniProgramEnvVersion();
  if (envVersion && envVersion !== "release") params.push(`envVersion=${encodeURIComponent(envVersion)}`);
  return buildUrl(`/api/wechat-mini/mama-resource-task-qrcode?${params.join("&")}`);
}

function decodeArrayBufferUtf8(value) {
  const bytes = new Uint8Array(value);
  if (typeof TextDecoder !== "undefined") {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch (_error) {}
  }
  try {
    let encoded = "";
    bytes.forEach((byte) => {
      encoded += `%${byte.toString(16).padStart(2, "0")}`;
    });
    return decodeURIComponent(encoded);
  } catch (_error) {
    return String.fromCharCode.apply(null, Array.from(bytes));
  }
}

function arrayBufferJsonMessage(value) {
  if (!value || typeof ArrayBuffer === "undefined" || !(value instanceof ArrayBuffer)) return "";
  try {
    const text = decodeArrayBufferUtf8(value);
    const data = JSON.parse(text);
    return asText(data && (data.error || data.message)).trim();
  } catch (_error) {
    return "";
  }
}

function mamaTaskQrFilePath(taskId) {
  const safeTaskId = asText(taskId).replace(/[^a-zA-Z0-9_-]/g, "");
  const root = typeof wx !== "undefined" && wx.env && wx.env.USER_DATA_PATH ? wx.env.USER_DATA_PATH : "";
  return root && safeTaskId ? `${root}/mama-task-qrcode-${safeTaskId}.png` : "";
}

function resolveCanvasImagePath(src) {
  const source = asText(src).trim();
  if (!source || typeof wx === "undefined" || typeof wx.getImageInfo !== "function") return Promise.resolve("");
  return new Promise((resolve) => {
    wx.getImageInfo({
      src: source,
      success: (res) => resolve(asText(res && res.path).trim()),
      fail: () => resolve("")
    });
  });
}

function normalizeMamaResourceImageUrl(value) {
  const source = asText(value).trim();
  if (!source) return "";
  if (source.startsWith("/uploads/")) return buildUrl(source);
  if (/^http:\/\/xianfeng\.xinzhi\.info\//i.test(source)) return source.replace(/^http:/i, "https:");
  return source;
}

function buildTaskView(task) {
  const source = task && typeof task === "object" ? task : {};
  const trafficFeeCents = Number(source.trafficFeeCents || 0);
  const isClaimable = source.claimable === true || source.status === "listed";
  const contentUrl = asText(source.contentUrl).trim();
  return {
    ...source,
    _id: asText(source._id || source.taskId).trim(),
    taskId: asText(source.taskId || source._id).trim(),
    statusText: taskStatusText(source.status),
    isClaimable,
    unitPriceText: formatMoneyFromCents(source.unitPriceCents),
    trafficFeeText: formatMoneyFromCents(source.trafficFeeCents),
    hasTrafficFee: trafficFeeCents > 0,
    promotionCountText: formatActivePromotionCount(source),
    remainingClaimText: formatRemainingClaimCount(source),
    announcement: asText(source.announcement).trim(),
    proofLink: asText(source.proofLink).trim(),
    proofScreenshotUrl: asText(source.proofScreenshotUrl).trim(),
    transferScreenshotUrl: normalizeMamaResourceImageUrl(source.transferScreenshotUrl),
    transferScreenshotUpdatedAt: source.transferScreenshotUpdatedAt || null,
    contentUrl,
    hasContentUrl: Boolean(contentUrl),
    exampleImageUrls: Array.isArray(source.exampleImageUrls) ? source.exampleImageUrls.map(normalizeMamaResourceImageUrl).filter(Boolean) : []
  };
}

function buildTaskList(tasks) {
  return Array.isArray(tasks) ? tasks.map(buildTaskView) : [];
}

function taskMatchesId(task, taskId) {
  const id = asText(taskId).trim();
  return !!id && (asText(task && task._id).trim() === id || asText(task && task.taskId).trim() === id);
}

function truncatePosterText(value, limit) {
  const text = asText(value).replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}

function canvasPosterTextWidth(ctx, text, fontSize) {
  if (ctx && typeof ctx.measureText === "function") {
    try {
      const result = ctx.measureText(text);
      if (result && Number(result.width) > 0) return Number(result.width);
    } catch (_error) {}
  }
  return asText(text).replace(/[^\x00-\xff]/g, "xx").length * fontSize * 0.5;
}

function fitPosterText(ctx, text, maxWidth, fontSize) {
  const value = asText(text);
  if (canvasPosterTextWidth(ctx, value, fontSize) <= maxWidth) return value;
  const ellipsis = "...";
  let result = value;
  while (result.length > 0 && canvasPosterTextWidth(ctx, `${result}${ellipsis}`, fontSize) > maxWidth) {
    result = result.slice(0, -1);
  }
  return result ? `${result}${ellipsis}` : ellipsis;
}

function drawPosterRoundRect(ctx, x, y, width, height, radius) {
  if (!ctx) return;
  if (typeof ctx.beginPath === "function" && typeof ctx.arcTo === "function") {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    if (typeof ctx.closePath === "function") ctx.closePath();
    if (typeof ctx.fill === "function") ctx.fill();
    return;
  }
  if (typeof ctx.fillRect === "function") ctx.fillRect(x, y, width, height);
}

function buildProfileView(profile) {
  const source = profile && typeof profile === "object" ? profile : {};
  const categories = Array.isArray(source.categories) ? source.categories.map(asText).filter(Boolean) : [];
  const status = asText(source.status).trim();
  const statusTextMap = {
    pending: "资料正在审核",
    approved: "账号已通过",
    needs_info: "需要补充资料",
    rejected: "暂未通过"
  };
  const reviewNote = source.reviewNote && typeof source.reviewNote === "object" ? source.reviewNote : {};
  return {
    ...source,
    status,
    statusText: statusTextMap[status] || "资料正在审核",
    categoriesText: categories.join("、"),
    submittedDateText: formatDateText(source.createdAt),
    reviewedDateText: formatDateText(reviewNote.reviewedAt),
    reviewMessage: asText(reviewNote.note).trim()
  };
}

function buildProfileDraftPatch(profile) {
  const source = profile && typeof profile === "object" ? profile : {};
  const accounts = Array.isArray(source.mediaAccounts) && source.mediaAccounts.length
    ? source.mediaAccounts.map(normalizeMediaAccount)
    : [normalizeMediaAccount(source.socialAccount || {}, "xiaohongshu")];
  const primaryIndex = accounts.findIndex((account) => account.platform === "xiaohongshu");
  const primary = accounts[primaryIndex >= 0 ? primaryIndex : 0] || blankMediaAccount("xiaohongshu");
  const extraAccounts = accounts.filter((_account, index) => index !== (primaryIndex >= 0 ? primaryIndex : 0));
  return {
    displayName: source.displayName || "",
    contactWechat: source.contactWechat || "",
    contactPhone: source.contactPhone || readStoredUserMobile(),
    alipayAccount: source.alipayAccount || "",
    alipayVerifiedName: source.alipayVerifiedName || "",
    city: source.city || "",
    childStage: source.childStage || "",
    childGender: source.childGender || "",
    xiaohongshuNickname: primary.nickname || "",
    xiaohongshuProfileUrl: primary.profileUrl || "",
    originalXiaohongshuProfileUrl: primary.profileUrl || "",
    xiaohongshuScreenshotUrl: primary.screenshotUrl || "",
    followerCount: primary.followerCount ? String(primary.followerCount) : "",
    realNameVerified: primary.realNameVerified === true ? true : primary.realNameVerified === false ? false : null,
    accountPositioning: source.accountPositioning || "",
    mediaAccounts: extraAccounts,
    selectedCategories: Array.isArray(source.categories) ? source.categories : []
  };
}

function buildSubmitMediaAccounts(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const primary = normalizeMediaAccount({
    platform: "xiaohongshu",
    nickname: source.xiaohongshuNickname,
    profileUrl: source.xiaohongshuProfileUrl,
    screenshotUrl: source.xiaohongshuScreenshotUrl,
    followerCount: source.followerCount,
    realNameVerified: source.realNameVerified
  });
  const accounts = [primary].concat(normalizeExtraMediaAccounts(source.mediaAccounts));
  return accounts.filter((account) => account.profileUrl && account.platform).map((account) => ({
    platform: account.platform,
    nickname: account.nickname,
    profileUrl: account.profileUrl,
    screenshotUrl: account.screenshotUrl,
    followerCount: account.followerCount,
    realNameVerified: account.realNameVerified
  }));
}

function readStoredUserMobile() {
  const user = getUser();
  return asText(user && user.mobile).trim();
}

function isUnauthorizedError(error) {
  return Number(error && error.statusCode) === 401;
}

function updatePageApplyDraft(page, patch) {
  const currentData = (page && page.data) || {};
  const formDraft = normalizeApplyDraft({
    ...(currentData.formDraft || {}),
    childStage: currentData.childStage,
    childGender: currentData.childGender,
    xiaohongshuScreenshotUrl: currentData.xiaohongshuScreenshotUrl,
    realNameVerified: currentData.realNameVerified,
    selectedCategories: currentData.selectedCategories,
    ...(patch || {})
  });
  if (page && typeof page.setData === "function") {
    page.setData(buildApplyDraftState(formDraft));
  }
  saveApplyDraft(formDraft);
  return formDraft;
}

Page({
  data: {
    formDraft: cloneEmptyApplyDraft(),
    categories: buildCategoryOptions([]),
    selectedCategories: [],
    mediaAccounts: [],
    mediaPlatformOptions: MEDIA_PLATFORM_OPTIONS,
    profileOverview: buildProfileOverview(cloneEmptyApplyDraft()),
    profileManagerMode: "overview",
    childStages: CHILD_STAGE_OPTIONS,
    childGenderOptions: CHILD_GENDER_OPTIONS,
    realNameVerifiedOptions: REAL_NAME_VERIFIED_OPTIONS,
    settingsSections: SETTINGS_SECTIONS,
    topbarHeight: 88,
    chromeHeight: 88,
    profilePanelTop: 30,
    profileHeaderHeight: 32,
    logoTop: 10,
    logoHeight: 28,
    welfareRight: 101,
    backTop: 8,
    backSize: 32,
    settingsPanelOpen: false,
    settingsPanelView: "menu",
    settingsProfilePanelSupported: true,
    launchedFromSettings: false,
    accountTitle: "登录/注册",
    accountSubtitle: "登录后同步档案和个性化推荐",
    accountPage: "",
    childStageIndex: -1,
    childStage: "",
    childGender: "",
    xiaohongshuScreenshotUrl: "",
    xiaohongshuScreenshotUploading: false,
    mamaResourceView: "apply",
    isLoggedIn: false,
    mamaResourceProfile: null,
    mamaTasks: [],
    mamaTasksLoading: false,
    pendingMamaTaskId: "",
    currentMamaTask: null,
    taskProofLink: "",
    taskProofScreenshotUrl: "",
    taskProofScreenshotUploading: false,
    taskSubmitting: false,
    taskClaiming: false,
    taskAnnouncementOpen: false,
    taskContentLinkOpen: false,
    taskShareImageUrl: "",
    taskSharePreviewOpen: false,
    taskShareGenerating: false,
    taskMessage: "",
    taskMessageType: "",
    realNameVerified: null,
    submitting: false,
    message: "",
    messageType: ""
  },

  onLoad(options = {}) {
    const pendingMamaTaskId = asText(options.taskId || parseSceneParam(options.scene, "m")).trim();
    const launchedFromShare = asText(options.shared) === "1";
    if (!pendingMamaTaskId && !launchedFromShare && ensureBackStackForBackButtonPage(options)) return;
    const storedDraft = loadApplyDraft();
    const userMobile = readStoredUserMobile();
    const formDraft = normalizeApplyDraft({
      ...storedDraft,
      contactPhone: storedDraft.contactPhone || userMobile
    });
    this.setData({
      launchedFromSettings: String(options.from || "") === "settings",
      pendingMamaTaskId,
      ...buildApplyDraftState(formDraft)
    });
    this.syncTopbarMetrics();
    this.syncAccountEntry();
    this.loadMamaTasks();
    enableShareMenu();
  },

  onShow() {
    this.syncTopbarMetrics();
    this.syncAccountEntry();
    if (this.data.mamaResourceView !== "detail") {
      this.loadMamaTasks();
    }
    enableShareMenu();
  },

  syncTopbarMetrics() {
    try {
      const metrics = getNativeTopbarMetrics();
      const topbarHeight = Math.max(72, Math.round(metrics.topbarHeight || 88));
      const windowWidth = Math.max(320, Number(metrics.windowWidth || 375));
      const logoHeight = Math.round((LOGO_HEIGHT_RPX * windowWidth) / 750);
      const capsuleHeight = Math.max(28, Math.round(metrics.capsuleHeight || 32));
      const searchButtonTop = Math.max(8, Math.round(metrics.searchButtonTop || 8));
      const backSize = Math.max(32, Math.round(capsuleHeight));
      const welfareRight = Math.max(72, Math.round(metrics.capsuleRight || 96) + 5);
      this.setData({
        topbarHeight,
        chromeHeight: topbarHeight,
        profilePanelTop: searchButtonTop,
        profileHeaderHeight: capsuleHeight,
        logoHeight,
        logoTop: Math.max(0, Math.round(searchButtonTop + capsuleHeight / 2 - logoHeight / 2)),
        backTop: Math.max(0, Math.round(searchButtonTop + capsuleHeight / 2 - backSize / 2)),
        backSize,
        welfareRight
      });
    } catch (_error) {}
  },

  goProgramsHome() {
    navigateProgramsHome();
  },

  goBack() {
    smartBackHome();
  },

  updateApplyDraft(patch) {
    return updatePageApplyDraft(this, patch);
  },

  onNativeSettingsLoginSuccess(payload) {
    const mobile = asText(payload && payload.user && payload.user.mobile).trim();
    if (mobile && !asText(this.data.formDraft && this.data.formDraft.contactPhone).trim()) {
      updatePageApplyDraft(this, { contactPhone: mobile });
    }
    this.syncAccountEntry();
    this.setData({
      mamaTasksLoading: false,
      currentMamaTask: null,
      taskMessage: "",
      taskMessageType: "",
      message: "",
      messageType: ""
    });
    return this.loadMamaTasks();
  },

  handleLoginSuccess(event) {
    const payload = event && event.detail && event.detail.session;
    const action = this._pendingMamaResourceAction;
    this._pendingMamaResourceAction = "";
    this.setData({ isLoggedIn: true });
    return this.onNativeSettingsLoginSuccess(payload).then(() => {
      if (action === "save") return this.submitProfileDraft({ stayInApply: true });
      if (action === "claim") return this.claimMamaTask();
      if (action === "proof") return this.submitTaskProof();
      return undefined;
    });
  },

  authorizeMamaResourceAction(event) {
    if (getToken()) return;
    this._pendingMamaResourceAction = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.action || "");
    const gate = this.selectComponent("#mamaResourcePhoneLoginGate");
    if (gate && typeof gate.loginWithPhone === "function") gate.loginWithPhone(event);
  },

  handleMamaResourceLoginFailure(event) {
    this._pendingMamaResourceAction = "";
    wx.showToast({ title: String(event && event.detail && event.detail.message || "登录失败，请重试"), icon: "none" });
  },

  loadMamaTasks() {
    if (this.data.mamaTasksLoading) return Promise.resolve();
    if (!getToken()) {
      this.setData({
        mamaResourceView: "apply",
        isLoggedIn: false,
        mamaResourceProfile: null,
        mamaTasks: [],
        currentMamaTask: null,
        mamaTasksLoading: false,
        message: "",
        messageType: ""
      });
      return Promise.resolve();
    }
    if (!this.data.isLoggedIn) this.setData({ isLoggedIn: true });
    this.setData({ mamaTasksLoading: true });
    return request({
      url: "/api/mama-resources/me/tasks",
      method: "GET"
    })
      .then((data) => {
        const assignedTasks = buildTaskList(data && data.tasks);
        const availableTasks = buildTaskList(data && data.availableTasks);
        const tasks = assignedTasks.concat(availableTasks);
        if (data && data.profile) {
          const profile = buildProfileView(data.profile);
          const pendingTaskId = asText(this.data.pendingMamaTaskId).trim();
          const currentId = this.data.currentMamaTask && this.data.currentMamaTask._id;
          const currentMamaTask = pendingTaskId
            ? tasks.find((task) => taskMatchesId(task, pendingTaskId)) || null
            : (currentId ? tasks.find((task) => taskMatchesId(task, currentId)) || this.data.currentMamaTask : null);
          this.setData({
            mamaResourceView: currentMamaTask ? "detail" : "tasks",
            mamaResourceProfile: profile,
            mamaTasks: tasks,
            currentMamaTask,
            pendingMamaTaskId: currentMamaTask ? "" : pendingTaskId,
            taskProofLink: currentMamaTask ? currentMamaTask.proofLink || this.data.taskProofLink : this.data.taskProofLink,
            taskProofScreenshotUrl: currentMamaTask ? currentMamaTask.proofScreenshotUrl || this.data.taskProofScreenshotUrl : this.data.taskProofScreenshotUrl,
            mamaTasksLoading: false,
            message: "",
            messageType: ""
          });
          return;
        }
        this.setData({
          mamaResourceView: "apply",
          mamaResourceProfile: null,
          mamaTasks: [],
          mamaTasksLoading: false
        });
      })
      .catch((error) => {
        if (isUnauthorizedError(error)) {
          this.setData({
            mamaResourceView: "apply",
            isLoggedIn: false,
            mamaResourceProfile: null,
            mamaTasks: [],
            currentMamaTask: null,
            mamaTasksLoading: false,
            message: "",
            messageType: ""
          });
          return;
        }
        this.setData({
          mamaTasksLoading: false,
          message: (error && error.message) || "任务状态加载失败，请稍后重试",
          messageType: "error"
        });
      });
  },

  openMamaTask(event) {
    const profile = this.data.mamaResourceProfile || {};
    if (profile.status !== "approved") {
      this.setData({ mamaResourceView: "apply", currentMamaTask: null, mamaTasks: [] });
      return;
    }
    const taskId = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id || "");
    const task = this.data.mamaTasks.find((item) => taskMatchesId(item, taskId));
    if (!task) return;
    this.setData({
      mamaResourceView: "detail",
      currentMamaTask: task,
      taskProofLink: task.proofLink || "",
      taskProofScreenshotUrl: task.proofScreenshotUrl || "",
      taskMessage: "",
      taskMessageType: ""
    });
  },

  claimMamaTask() {
    if (!getToken()) return;
    const task = this.data.currentMamaTask || {};
    const taskId = asText(task.taskId || task._id).trim();
    if (!taskId || this.data.taskClaiming || !task.isClaimable) return;
    this.setData({ taskClaiming: true, taskMessage: "", taskMessageType: "" });
    request({
      url: `/api/mama-resources/tasks/${taskId}/claims`,
      method: "POST",
      data: {}
    })
      .then((data) => {
        const claimedTask = buildTaskView(data && data.task);
        const nextTasks = this.data.mamaTasks.map((item) => taskMatchesId(item, taskId) ? claimedTask : item);
        if (!nextTasks.some((item) => taskMatchesId(item, taskId))) nextTasks.unshift(claimedTask);
        this.setData({
          mamaTasks: nextTasks,
          currentMamaTask: claimedTask,
          taskClaiming: false,
          taskProofLink: claimedTask.proofLink || "",
          taskProofScreenshotUrl: claimedTask.proofScreenshotUrl || "",
          taskMessage: "领取成功，请按要求完成后提交回填",
          taskMessageType: "success"
        });
      })
      .catch((error) => {
        this.setData({
          taskClaiming: false,
          taskMessage: (error && error.message) || "领取任务失败，请稍后重试",
          taskMessageType: "error"
        });
        this.loadMamaTasks();
      });
  },

  openMamaTaskContent() {
    const contentUrl = asText(this.data.currentMamaTask && this.data.currentMamaTask.contentUrl).trim();
    if (!contentUrl) return;
    this.setData({ taskContentLinkOpen: true });
  },

  closeMamaTaskContent() {
    this.setData({ taskContentLinkOpen: false });
  },

  openMamaTaskSharePoster() {
    const task = this.data.currentMamaTask || {};
    const taskId = asText(task.taskId || task._id).trim();
    if (!taskId || this.data.taskShareGenerating) return;
    const filePath = mamaTaskQrFilePath(taskId);
    if (!filePath || !wx.getFileSystemManager) {
      this.setData({ taskMessage: "当前环境暂不支持生成小程序码", taskMessageType: "error" });
      return;
    }
    const fs = wx.getFileSystemManager();
    if (!fs || typeof fs.writeFile !== "function") {
      this.setData({ taskMessage: "当前环境暂不支持生成小程序码", taskMessageType: "error" });
      return;
    }
    this.setData({ taskShareGenerating: true, taskMessage: "", taskMessageType: "" });
    wx.request({
      url: mamaTaskShareQrUrl(taskId),
      responseType: "arraybuffer",
      success: (res) => {
        if (Number(res && res.statusCode) !== 200 || !res || !res.data) {
          this.setData({
            taskShareGenerating: false,
            taskMessage: arrayBufferJsonMessage(res && res.data) || "小程序码生成失败，请稍后重试",
            taskMessageType: "error"
          });
          return;
        }
        fs.writeFile({
          filePath,
          data: res.data,
          success: () => {
            resolveCanvasImagePath(task.exampleImageUrls && task.exampleImageUrls[0])
              .then((examplePath) => this.drawMamaTaskShareImage(task, filePath, examplePath));
          },
          fail: () => {
            this.setData({ taskShareGenerating: false, taskMessage: "小程序码保存失败，请稍后重试", taskMessageType: "error" });
          }
        });
      },
      fail: () => {
        this.setData({ taskShareGenerating: false, taskMessage: "小程序码生成失败，请稍后重试", taskMessageType: "error" });
      }
    });
  },

  drawMamaTaskShareImage(task, qrPath, examplePath) {
    const canvasId = "mamaTaskShareCanvas";
    const ctx = wx.createCanvasContext(canvasId, this);
    const title = truncatePosterText(task.title || "妈妈好赚任务", 22);
    const category = truncatePosterText(task.category || "小红书任务", 18);
    const announcement = truncatePosterText(task.announcement || "任务包含：发布内容+评论区维护", 30);
    const settlement = truncatePosterText(task.settlementStandard || "按平台要求发布并保留，后台审核通过后进入结算。", 58);
    const requirement = truncatePosterText(task.requirement || "按要求完成发布并提交截图。", 72);
    const unitPrice = task.unitPriceText || formatMoneyFromCents(task.unitPriceCents);
    const traffic = task.hasTrafficFee ? task.trafficFeeText : "-";
    const phase = truncatePosterText(task.phase || "测试期", 8);
    const difficulty = truncatePosterText(task.difficulty || "简单", 8);
    const settlementCycle = truncatePosterText(task.settlementCycle || "T+9", 8);
    const drawText = (text, x, y, fontSize, color, bold) => {
      ctx.setFontSize(fontSize);
      ctx.setFillStyle(color);
      ctx.font = `${bold ? "bold " : ""}${fontSize}px sans-serif`;
      ctx.fillText(text, x, y);
    };
    const drawFittedText = (text, x, y, maxWidth, fontSize, color, bold) => {
      ctx.setFontSize(fontSize);
      ctx.setFillStyle(color);
      ctx.font = `${bold ? "bold " : ""}${fontSize}px sans-serif`;
      ctx.fillText(fitPosterText(ctx, text, maxWidth, fontSize), x, y);
    };
    const drawWrapped = (text, x, y, lineLength, lineHeight, maxLines, fontSize = 24, color = "#667085", bold = false) => {
      const value = asText(text);
      for (let index = 0; index < maxLines; index += 1) {
        const start = index * lineLength;
        if (start >= value.length) break;
        const line = value.slice(start, start + lineLength);
        drawText(line, x, y + index * lineHeight, fontSize, color, bold);
      }
    };
    const drawChip = (text, x, y, width) => {
      ctx.setFillStyle("rgba(255, 255, 255, 0.18)");
      drawPosterRoundRect(ctx, x, y, width, 36, 8);
      drawText(text, x + 14, y + 25, 20, "#ffffff", true);
    };
    ctx.setFillStyle("#f7f0ff");
    ctx.fillRect(0, 0, 750, 1660);
    ctx.setFillStyle("#ffffff");
    drawPosterRoundRect(ctx, 28, 38, 694, 1584, 28);

    const gradient = ctx.createLinearGradient ? ctx.createLinearGradient(28, 38, 722, 230) : null;
    if (gradient && typeof gradient.addColorStop === "function") {
      gradient.addColorStop(0, "#6c27d6");
      gradient.addColorStop(0.58, "#8b3cf6");
      gradient.addColorStop(1, "#ec3d8c");
      ctx.setFillStyle(gradient);
    } else {
      ctx.setFillStyle("#7c2ce6");
    }
    drawPosterRoundRect(ctx, 28, 38, 694, 196, 24);
    drawText("‹", 58, 88, 44, "#ffffff", true);
    ctx.setFillStyle("rgba(255, 255, 255, 0.18)");
    drawPosterRoundRect(ctx, 58, 126, 58, 58, 10);
    drawText("¥", 76, 164, 30, "#ffe68a", true);
    drawText(title, 136, 150, 32, "#ffffff", true);
    drawChip(difficulty, 136, 170, 76);
    drawChip(phase, 224, 170, 88);
    drawChip(category, 324, 170, 154);

    ctx.setFillStyle("#ffffff");
    drawPosterRoundRect(ctx, 48, 206, 654, 64, 12);
    drawText("公告", 72, 248, 21, "#6c27d6", true);
    drawText(announcement, 128, 248, 23, "#151222", true);
    drawText("›", 672, 249, 32, "#98a2b3", true);

    ctx.setFillStyle("#f4f5f7");
    ctx.fillRect(28, 286, 694, 14);
    drawText("项目信息", 56, 344, 28, "#151222", true);
    drawText("项目价格", 56, 400, 26, "#151222", true);
    ctx.setStrokeStyle("#d5dbea");
    ctx.strokeRect(56, 424, 638, 116);
    [286, 430, 560].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, 424);
      ctx.lineTo(x, 540);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(56, 482);
    ctx.lineTo(694, 482);
    ctx.stroke();
    drawText("任务", 146, 462, 22, "#667085", true);
    drawText("价格", 340, 462, 22, "#667085", true);
    drawText("投流费用", 464, 462, 22, "#667085", true);
    drawText("结算周期", 590, 462, 22, "#667085", true);
    drawFittedText(category, 74, 522, 194, 21, "#151222", true);
    drawText(unitPrice, 318, 522, 22, "#151222", true);
    drawText(traffic, 458, 522, 22, "#151222", true);
    drawText(settlementCycle, 596, 522, 22, "#151222", true);

    ctx.setFillStyle("#f4f5f7");
    ctx.fillRect(28, 568, 694, 14);
    drawText("结算标准", 56, 632, 26, "#151222", true);
    drawWrapped(settlement, 56, 674, 25, 32, 3, 23, "#667085", false);

    ctx.setFillStyle("#f4f5f7");
    ctx.fillRect(28, 756, 694, 14);
    drawText("项目要求", 56, 820, 26, "#151222", true);
    drawWrapped(requirement, 56, 862, 23, 32, 3, 24, "#151222", false);
    if (examplePath) {
      try {
        ctx.drawImage(examplePath, 56, 948, 638, 380);
      } catch (_error) {
        ctx.setFillStyle("#f2f4f7");
        drawPosterRoundRect(ctx, 56, 948, 638, 380, 10);
        drawText("任务示例图", 312, 1150, 24, "#98a2b3", true);
      }
    } else {
      ctx.setFillStyle("#f2f4f7");
      drawPosterRoundRect(ctx, 56, 948, 638, 380, 10);
      drawText("任务示例图", 312, 1150, 24, "#98a2b3", true);
    }
    ctx.drawImage(qrPath, 305, 1396, 140, 140);
    if (typeof ctx.setTextAlign === "function") ctx.setTextAlign("center");
    drawText("扫码直达任务，领取后参与", 375, 1572, 24, "#667085", false);
    if (typeof ctx.setTextAlign === "function") ctx.setTextAlign("left");

    ctx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId,
        width: 750,
        height: 1660,
        destWidth: 1500,
        destHeight: 3320,
        success: (res) => {
          this.setData({
            taskShareImageUrl: res.tempFilePath,
            taskSharePreviewOpen: true,
            taskShareGenerating: false
          });
        },
        fail: () => {
          this.setData({ taskShareGenerating: false, taskMessage: "分享图生成失败，请稍后重试", taskMessageType: "error" });
        }
      }, this);
    });
  },

  closeMamaTaskSharePreview() {
    this.setData({ taskSharePreviewOpen: false });
  },

  saveMamaTaskShareImage() {
    const filePath = asText(this.data.taskShareImageUrl).trim();
    if (!filePath || !wx.saveImageToPhotosAlbum) return;
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => {
        if (wx.showToast) wx.showToast({ title: "已保存分享图", icon: "success" });
      },
      fail: () => {
        this.setData({ taskMessage: "保存失败，请开启相册权限后重试", taskMessageType: "error" });
      }
    });
  },

  backToMamaTasks() {
    const profile = this.data.mamaResourceProfile || {};
    this.setData({
      mamaResourceView: profile.status === "approved" ? "tasks" : "apply",
      currentMamaTask: null,
      taskMessage: "",
      taskMessageType: ""
    });
  },

  openTaskAnnouncement() {
    if (!this.data.currentMamaTask || !this.data.currentMamaTask.announcement) return;
    this.setData({ taskAnnouncementOpen: true });
  },

  closeTaskAnnouncement() {
    this.setData({ taskAnnouncementOpen: false });
  },

  previewTaskExampleImage(event) {
    const urls = (this.data.currentMamaTask && this.data.currentMamaTask.exampleImageUrls) || [];
    if (!urls.length || !wx.previewImage) return;
    const index = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index || 0);
    wx.previewImage({
      urls,
      current: urls[index] || urls[0]
    });
  },

  previewTransferScreenshot() {
    const current = asText(this.data.currentMamaTask && this.data.currentMamaTask.transferScreenshotUrl).trim();
    if (!current || !wx.previewImage) return;
    wx.previewImage({ current, urls: [current] });
  },

  showApplyForm() {
    const profile = this.data.mamaResourceProfile || {};
    updatePageApplyDraft(this, buildProfileDraftPatch(profile));
    this.setData({ mamaResourceView: "apply", profileManagerMode: "overview", message: "", messageType: "" });
  },

  openProfileManager() {
    this.showApplyForm();
  },

  openPersonalInfoEditor() {
    this.setData({ profileManagerMode: "personal", message: "", messageType: "" });
  },

  openMediaAccountsManager() {
    this.setData({ profileManagerMode: "media", message: "", messageType: "" });
  },

  openPreferenceEditor() {
    this.setData({ profileManagerMode: "preference", message: "", messageType: "" });
  },

  backToProfileOverview() {
    this.setData({ profileManagerMode: "overview", message: "", messageType: "" });
  },

  saveCurrentProfileSectionAndBack() {
    if (this.data.submitting) return;
    this.submitProfileDraft({ stayInApply: true });
  },

  updateTaskProofLink(event) {
    this.setData({
      taskProofLink: String(event && event.detail ? event.detail.value : "").trim()
    });
  },

  chooseTaskProofScreenshot() {
    if (this.data.taskProofScreenshotUploading) return Promise.resolve();
    const previousScreenshotUrl = String(this.data.taskProofScreenshotUrl || "");
    const chooseMedia = () => new Promise((resolve, reject) => {
      if (wx.chooseMedia) {
        wx.chooseMedia({
          count: 1,
          mediaType: ["image"],
          sourceType: ["album", "camera"],
          success: (res) => {
            const filePath = res && res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath;
            filePath ? resolve(filePath) : reject(new Error("未选择截图"));
          },
          fail: reject
        });
        return;
      }
      wx.chooseImage({
        count: 1,
        sourceType: ["album", "camera"],
        success: (res) => {
          const filePath = res && res.tempFilePaths && res.tempFilePaths[0];
          filePath ? resolve(filePath) : reject(new Error("未选择截图"));
        },
        fail: reject
      });
    });

    this.setData({ taskProofScreenshotUploading: true, taskMessage: "", taskMessageType: "" });
    return chooseMedia()
      .then((filePath) => new Promise((resolve, reject) => {
        wx.uploadFile({
          url: buildUrl("/api/mama-resources/uploads"),
          filePath,
          name: "file",
          formData: { kind: "mama_task_proof" },
          success: (res) => {
            let data = {};
            try {
              data = typeof res.data === "string" ? JSON.parse(res.data || "{}") : (res.data || {});
            } catch (_error) {
              reject(new Error("截图上传失败：服务器返回异常"));
              return;
            }
            if (res.statusCode < 200 || res.statusCode >= 300 || !data.url) {
              reject(new Error(data.message || `截图上传失败（${res.statusCode || "无状态码"}）`));
              return;
            }
            resolve(data.url);
          },
          fail: (error) => {
            reject(new Error((error && error.errMsg) || "截图上传失败，请检查网络后重试"));
          }
        });
      }))
      .then((url) => {
        this.setData({
          taskProofScreenshotUrl: String(url || ""),
          taskProofScreenshotUploading: false,
          taskMessage: "",
          taskMessageType: ""
        });
      })
      .catch((error) => {
        this.setData({
          taskProofScreenshotUploading: false,
          taskProofScreenshotUrl: previousScreenshotUrl,
          taskMessage: previousScreenshotUrl ? "" : ((error && error.message) || "截图上传失败，请稍后重试"),
          taskMessageType: previousScreenshotUrl ? "" : "error"
        });
      });
  },

  submitTaskProof() {
    if (!getToken()) return;
    const taskId = this.data.currentMamaTask && this.data.currentMamaTask._id;
    const proofLink = String(this.data.taskProofLink || "").trim();
    const proofScreenshotUrl = String(this.data.taskProofScreenshotUrl || "").trim();
    if (!taskId || this.data.taskSubmitting) return;
    if (!proofLink || !proofScreenshotUrl) {
      this.setData({ taskMessage: "请先填写完成链接并上传完成截图", taskMessageType: "error" });
      return;
    }
    this.setData({ taskSubmitting: true, taskMessage: "", taskMessageType: "" });
    request({
      url: `/api/mama-resources/me/tasks/${taskId}/submissions`,
      method: "POST",
      data: { proofLink, proofScreenshotUrl }
    })
      .then((data) => {
        const task = buildTaskView(data && data.task);
        this.setData({
          currentMamaTask: task,
          mamaTasks: this.data.mamaTasks.map((item) => item._id === task._id ? task : item),
          taskSubmitting: false,
          taskMessage: "已提交回填，等待运营审核收录",
          taskMessageType: "success"
        });
      })
      .catch((error) => {
        this.setData({
          taskSubmitting: false,
          taskMessage: (error && error.message) || "提交回填失败，请稍后重试",
          taskMessageType: "error"
        });
      });
  },

  updateDraftField(event) {
    const field = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.field || "").trim();
    if (!field) return;
    updatePageApplyDraft(this, {
      [field]: event && event.detail ? event.detail.value : ""
    });
  },

  addMediaAccount() {
    const mediaAccounts = normalizeExtraMediaAccounts(this.data.mediaAccounts).concat(blankMediaAccount());
    updatePageApplyDraft(this, { mediaAccounts });
  },

  savePersonalInfo(event) {
    const values = (event && event.detail && event.detail.value) || {};
    updatePageApplyDraft(this, {
      displayName: String(values.displayName || "").trim(),
      contactPhone: String(values.contactPhone || "").trim(),
      contactWechat: String(values.contactWechat || "").trim(),
      alipayAccount: String(values.alipayAccount || "").trim(),
      alipayVerifiedName: String(values.alipayVerifiedName || "").trim(),
      city: String(values.city || "").trim(),
      childStage: this.data.childStage,
      childGender: this.data.childGender
    });
    this.submitProfileDraft({ stayInApply: true });
  },

  saveMediaAccounts() {
    const draft = this.data.formDraft || {};
    if (!asText(draft.xiaohongshuNickname).trim()) {
      this.setData({ message: "请填写小红书账号昵称", messageType: "error" });
      return;
    }
    const missingNicknameIndex = normalizeExtraMediaAccounts(this.data.mediaAccounts).findIndex((account) => !account.nickname);
    if (missingNicknameIndex >= 0) {
      this.setData({ message: `请填写第${missingNicknameIndex + 2}个账号的账号昵称`, messageType: "error" });
      return;
    }
    this.submitProfileDraft({ stayInApply: true });
  },

  savePreferences(event) {
    const values = (event && event.detail && event.detail.value) || {};
    updatePageApplyDraft(this, {
      accountPositioning: String(values.accountPositioning || "").trim(),
      categories: this.data.selectedCategories,
      selectedCategories: this.data.selectedCategories,
      blockedCategories: String(values.blockedCategories || "").trim(),
      consentAccepted: true
    });
    this.submitProfileDraft({ stayInApply: true });
  },

  updateMediaAccountField(event) {
    const index = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index);
    const field = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.field || "").trim();
    if (!Number.isFinite(index) || index < 0 || !field) return;
    const mediaAccounts = normalizeExtraMediaAccounts(this.data.mediaAccounts);
    const current = mediaAccounts[index] || blankMediaAccount();
    mediaAccounts[index] = normalizeMediaAccount({
      ...current,
      [field]: event && event.detail ? event.detail.value : ""
    });
    updatePageApplyDraft(this, { mediaAccounts });
  },

  selectMediaAccountPlatform(event) {
    const index = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index);
    const platformIndex = Number(event && event.detail && event.detail.value);
    if (!Number.isFinite(index) || index < 0) return;
    const platform = MEDIA_PLATFORM_OPTIONS[Number.isFinite(platformIndex) ? platformIndex : 0]?.value || "xiaohongshu";
    const mediaAccounts = normalizeExtraMediaAccounts(this.data.mediaAccounts);
    const current = mediaAccounts[index] || blankMediaAccount(platform);
    mediaAccounts[index] = normalizeMediaAccount({ ...current, platform });
    updatePageApplyDraft(this, { mediaAccounts });
  },

  removeMediaAccount(event) {
    const index = Number(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.index);
    if (!Number.isFinite(index) || index < 0) return;
    const mediaAccounts = normalizeExtraMediaAccounts(this.data.mediaAccounts).filter((_item, itemIndex) => itemIndex !== index);
    updatePageApplyDraft(this, { mediaAccounts });
  },

  selectChildStage(event) {
    const index = Number(event.detail.value);
    updatePageApplyDraft(this, { childStage: CHILD_STAGE_OPTIONS[index] || "" });
  },

  toggleChildGender(event) {
    const value = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.value || "").trim();
    updatePageApplyDraft(this, { childGender: value === this.data.childGender ? "" : value });
  },

  toggleRealNameVerified(event) {
    const value = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.value || "").trim();
    const nextValue = value === "yes" ? true : value === "no" ? false : null;
    updatePageApplyDraft(this, { realNameVerified: this.data.realNameVerified === nextValue ? null : nextValue });
  },

  toggleConsentAccepted(event) {
    const values = event && event.detail && Array.isArray(event.detail.value) ? event.detail.value : [];
    updatePageApplyDraft(this, { consentAccepted: values.indexOf("1") >= 0 });
  },

  chooseXiaohongshuScreenshot() {
    if (this.data.xiaohongshuScreenshotUploading) return Promise.resolve();
    const previousScreenshotUrl = String(this.data.xiaohongshuScreenshotUrl || "");
    const chooseMedia = () => new Promise((resolve, reject) => {
      if (wx.chooseMedia) {
        wx.chooseMedia({
          count: 1,
          mediaType: ["image"],
          sourceType: ["album", "camera"],
          success: (res) => {
            const filePath = res && res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath;
            filePath ? resolve(filePath) : reject(new Error("未选择截图"));
          },
          fail: reject
        });
        return;
      }
      wx.chooseImage({
        count: 1,
        sourceType: ["album", "camera"],
        success: (res) => {
          const filePath = res && res.tempFilePaths && res.tempFilePaths[0];
          filePath ? resolve(filePath) : reject(new Error("未选择截图"));
        },
        fail: reject
      });
    });

    this.setData({ xiaohongshuScreenshotUploading: true, message: "", messageType: "" });
    return chooseMedia()
      .then((filePath) => new Promise((resolve, reject) => {
        wx.uploadFile({
          url: buildUrl("/api/mama-resources/uploads"),
          filePath,
          name: "file",
          formData: { kind: "xiaohongshu_screenshot" },
          success: (res) => {
            let data = {};
            try {
              data = typeof res.data === "string" ? JSON.parse(res.data || "{}") : (res.data || {});
            } catch (_error) {
              reject(new Error("截图上传失败：服务器返回异常"));
              return;
            }
            if (res.statusCode < 200 || res.statusCode >= 300 || !data.url) {
              reject(new Error(data.message || `截图上传失败（${res.statusCode || "无状态码"}）`));
              return;
            }
            resolve(data.url);
          },
          fail: (error) => {
            reject(new Error((error && error.errMsg) || "截图上传失败，请检查网络后重试"));
          }
        });
      }))
      .then((url) => {
        updatePageApplyDraft(this, { xiaohongshuScreenshotUrl: String(url || "") });
        this.setData({
          xiaohongshuScreenshotUploading: false,
          message: "",
          messageType: ""
        });
      })
      .catch((error) => {
        if (previousScreenshotUrl) {
          this.setData({
            xiaohongshuScreenshotUploading: false,
            xiaohongshuScreenshotUrl: previousScreenshotUrl,
            message: "",
            messageType: ""
          });
          return;
        }
        this.setData({
          xiaohongshuScreenshotUploading: false,
          message: (error && error.message) || "截图上传失败，请稍后重试",
          messageType: "error"
        });
      });
  },

  toggleCategory(event) {
    const category = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.category || "").trim();
    if (!category) return;
    const selectedCategories = this.data.selectedCategories.indexOf(category) >= 0
      ? this.data.selectedCategories.filter((item) => item !== category)
      : this.data.selectedCategories.concat(category);
    updatePageApplyDraft(this, { selectedCategories });
  },

  submit(event) {
    const values = (event && event.detail && event.detail.value) || {};
    const lockedXiaohongshuProfileUrl = asText(this.data.formDraft && this.data.formDraft.originalXiaohongshuProfileUrl).trim();
    const payload = updatePageApplyDraft(this, {
      displayName: String(values.displayName || "").trim(),
      contactPhone: String(values.contactPhone || "").trim(),
      contactWechat: String(values.contactWechat || "").trim(),
      alipayAccount: String(values.alipayAccount || "").trim(),
      alipayVerifiedName: String(values.alipayVerifiedName || "").trim(),
      city: String(values.city || "").trim(),
      childStage: this.data.childStage,
      childGender: this.data.childGender,
      xiaohongshuNickname: String(values.xiaohongshuNickname || "").trim(),
      xiaohongshuProfileUrl: lockedXiaohongshuProfileUrl || String(values.xiaohongshuProfileUrl || "").trim(),
      xiaohongshuScreenshotUrl: this.data.xiaohongshuScreenshotUrl,
      followerCount: String(values.followerCount || "").trim(),
      realNameVerified: this.data.realNameVerified,
      accountPositioning: String(values.accountPositioning || "").trim(),
      mediaAccounts: this.data.mediaAccounts,
      categories: this.data.selectedCategories,
      selectedCategories: this.data.selectedCategories,
      blockedCategories: String(values.blockedCategories || "").trim(),
      consentAccepted: true
    });
    payload.categories = payload.selectedCategories;
    this.submitMamaResourcePayload(payload);
  },

  submitProfileDraft(options = {}) {
    if (!getToken()) return;
    const draft = this.data.formDraft || {};
    const lockedXiaohongshuProfileUrl = asText(draft.originalXiaohongshuProfileUrl).trim();
    const payload = updatePageApplyDraft(this, {
      ...draft,
      xiaohongshuProfileUrl: lockedXiaohongshuProfileUrl || draft.xiaohongshuProfileUrl,
      childStage: this.data.childStage,
      childGender: this.data.childGender,
      xiaohongshuScreenshotUrl: this.data.xiaohongshuScreenshotUrl,
      realNameVerified: this.data.realNameVerified,
      categories: this.data.selectedCategories,
      selectedCategories: this.data.selectedCategories,
      mediaAccounts: this.data.mediaAccounts,
      consentAccepted: true
    });
    payload.categories = payload.selectedCategories;
    return this.submitMamaResourcePayload(payload, options);
  },

  submitMamaResourcePayload(payload, options = {}) {
    const submitPayload = {
      ...payload,
      mediaAccounts: buildSubmitMediaAccounts(payload)
    };

    if (!payload.displayName || !payload.contactWechat || !payload.xiaohongshuProfileUrl) {
      this.setData({ message: "请先填写姓名/昵称、微信号和小红书主页链接", messageType: "error" });
      return;
    }
    if (!payload.alipayAccount) {
      this.setData({ message: "请填写支付宝账号", messageType: "error" });
      return;
    }
    if (!payload.alipayVerifiedName) {
      this.setData({ message: "请填写支付宝验证姓名", messageType: "error" });
      return;
    }
    if (!payload.xiaohongshuNickname) {
      this.setData({ message: "请填写小红书账号昵称", messageType: "error" });
      return;
    }
    const missingNicknameIndex = normalizeExtraMediaAccounts(payload.mediaAccounts).findIndex((account) => !account.nickname);
    if (missingNicknameIndex >= 0) {
      this.setData({ message: `请填写第${missingNicknameIndex + 2}个账号的账号昵称`, messageType: "error" });
      return;
    }
    this.setData({ submitting: true, message: "", messageType: "" });
    return request({
      url: "/api/mama-resources/applications",
      method: "POST",
      data: submitPayload
    })
      .then((data) => {
        const profile = data && data.profile ? data.profile : { ...submitPayload, status: "approved", createdAt: new Date().toISOString() };
        const nextDraft = buildProfileDraftPatch(profile);
        clearApplyDraft();
        if (options.stayInApply) {
          this.setData({
            ...buildApplyDraftState(nextDraft),
            mamaResourceView: "apply",
            profileManagerMode: "overview",
            mamaResourceProfile: buildProfileView(profile),
            submitting: false,
            message: "资料已保存，运营会按备注跟进",
            messageType: "success"
          });
          return;
        }
        this.setData({
          ...buildApplyDraftState(nextDraft),
          mamaResourceView: "tasks",
          profileManagerMode: "overview",
          mamaResourceProfile: buildProfileView(profile),
          submitting: false,
          message: "资料已保存，运营会按备注跟进",
          messageType: "success"
        });
        this.loadMamaTasks();
      })
      .catch((error) => {
        this.setData({
          submitting: false,
          message: (error && error.message) || "提交失败，请稍后重试",
          messageType: "error"
        });
      });
  },

  onShareAppMessage() {
    return createPageShare({
      title: "妈妈好赚",
      path: "/pages/mama-resource-apply/index?shared=1",
      imageUrl: MAMA_RESOURCE_SHARE_COVER_IMAGE
    }).onShareAppMessage();
  },

  onShareTimeline() {
    return createPageShare({
      title: "妈妈好赚",
      path: "/pages/mama-resource-apply/index?shared=1",
      imageUrl: MAMA_RESOURCE_SHARE_COVER_IMAGE
    }).onShareTimeline();
  },

  ...createNativeSettingsMethods()
});
