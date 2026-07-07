const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { request, buildUrl } = require("../../utils/request");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { ensureBackStackForBackButtonPage, goProgramsHome: navigateProgramsHome, smartBackHome } = require("../../utils/nativePageNav");
const { SETTINGS_SECTIONS, createNativeSettingsMethods } = require("../../utils/nativeSettings");
const { getUser } = require("../../utils/session");

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
const LOGO_HEIGHT_RPX = 56;
const MAMA_RESOURCE_APPLY_DRAFT_KEY = "xf_mama_resource_apply_draft_v1";
const MAMA_RESOURCE_SHARE_COVER_IMAGE = "/assets/share/mama-hao-zhuan-cover.png";

const EMPTY_APPLY_DRAFT = {
  displayName: "",
  contactWechat: "",
  contactPhone: "",
  city: "",
  childStage: "",
  childGender: "",
  xiaohongshuProfileUrl: "",
  xiaohongshuScreenshotUrl: "",
  followerCount: "",
  realNameVerified: null,
  accountPositioning: "",
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

function cloneEmptyApplyDraft() {
  return {
    ...EMPTY_APPLY_DRAFT,
    selectedCategories: []
  };
}

function normalizeApplyDraft(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    displayName: asText(source.displayName).trim(),
    contactWechat: asText(source.contactWechat).trim(),
    contactPhone: asText(source.contactPhone).trim(),
    city: asText(source.city).trim(),
    childStage: asText(source.childStage).trim(),
    childGender: asText(source.childGender).trim(),
    xiaohongshuProfileUrl: asText(source.xiaohongshuProfileUrl).trim(),
    xiaohongshuScreenshotUrl: asText(source.xiaohongshuScreenshotUrl).trim(),
    followerCount: asText(source.followerCount).trim(),
    realNameVerified: source.realNameVerified === true ? true : source.realNameVerified === false ? false : null,
    accountPositioning: asText(source.accountPositioning).trim(),
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
    realNameVerified: formDraft.realNameVerified
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

function formatDateText(value) {
  const text = asText(value).trim();
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function taskStatusText(status) {
  if (status === "submitted") return "待审核";
  if (status === "collected") return "已收录";
  if (status === "rejected") return "已驳回";
  return "进行中";
}

function buildTaskView(task) {
  const source = task && typeof task === "object" ? task : {};
  const trafficFeeCents = Number(source.trafficFeeCents || 0);
  return {
    ...source,
    statusText: taskStatusText(source.status),
    unitPriceText: formatMoneyFromCents(source.unitPriceCents),
    trafficFeeText: formatMoneyFromCents(source.trafficFeeCents),
    hasTrafficFee: trafficFeeCents > 0,
    promotionCountText: formatCount(source.promotionCount),
    latestDataDateText: source.latestDataDate || "待同步",
    announcement: asText(source.announcement).trim(),
    proofLink: asText(source.proofLink).trim(),
    proofScreenshotUrl: asText(source.proofScreenshotUrl).trim(),
    exampleImageUrls: Array.isArray(source.exampleImageUrls) ? source.exampleImageUrls.map(asText).filter(Boolean) : []
  };
}

function buildTaskList(tasks) {
  return Array.isArray(tasks) ? tasks.map(buildTaskView) : [];
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

function readStoredUserMobile() {
  const user = getUser();
  return asText(user && user.mobile).trim();
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
    mamaResourceProfile: null,
    mamaTasks: [],
    mamaTasksLoading: false,
    currentMamaTask: null,
    taskProofLink: "",
    taskProofScreenshotUrl: "",
    taskProofScreenshotUploading: false,
    taskSubmitting: false,
    taskAnnouncementOpen: false,
    taskMessage: "",
    taskMessageType: "",
    realNameVerified: null,
    submitting: false,
    message: "",
    messageType: ""
  },

  onLoad(options = {}) {
    if (ensureBackStackForBackButtonPage(options)) return;
    const storedDraft = loadApplyDraft();
    const userMobile = readStoredUserMobile();
    const formDraft = normalizeApplyDraft({
      ...storedDraft,
      contactPhone: storedDraft.contactPhone || userMobile
    });
    this.setData({
      launchedFromSettings: String(options.from || "") === "settings",
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

  loadMamaTasks() {
    if (this.data.mamaTasksLoading) return Promise.resolve();
    this.setData({ mamaTasksLoading: true });
    return request({
      url: "/api/mama-resources/me/tasks",
      method: "GET"
    })
      .then((data) => {
        const tasks = buildTaskList(data && data.tasks);
        if (data && data.profile) {
          const profile = buildProfileView(data.profile);
          if (profile.status !== "approved") {
            const account = profile.socialAccount || {};
            updatePageApplyDraft(this, {
              displayName: profile.displayName || "",
              contactWechat: profile.contactWechat || "",
              contactPhone: profile.contactPhone || readStoredUserMobile(),
              city: profile.city || "",
              childStage: profile.childStage || "",
              childGender: profile.childGender || "",
              xiaohongshuProfileUrl: account.profileUrl || "",
              xiaohongshuScreenshotUrl: account.screenshotUrl || "",
              followerCount: account.followerCount ? String(account.followerCount) : "",
              realNameVerified: account.realNameVerified === true ? true : account.realNameVerified === false ? false : null,
              accountPositioning: profile.accountPositioning || "",
              selectedCategories: Array.isArray(profile.categories) ? profile.categories : []
            });
            this.setData({
              mamaResourceView: "apply",
              mamaResourceProfile: profile,
              mamaTasks: [],
              currentMamaTask: null,
              taskProofLink: "",
              taskProofScreenshotUrl: "",
              mamaTasksLoading: false,
              message: profile.reviewMessage || "",
              messageType: profile.reviewMessage ? "error" : ""
            });
            return;
          }
          const currentId = this.data.currentMamaTask && this.data.currentMamaTask._id;
          const currentMamaTask = currentId ? tasks.find((task) => task._id === currentId) || this.data.currentMamaTask : null;
          this.setData({
            mamaResourceView: this.data.mamaResourceView === "detail" ? "detail" : "tasks",
            mamaResourceProfile: profile,
            mamaTasks: tasks,
            currentMamaTask,
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
      .catch((_error) => {
        this.setData({
          mamaResourceView: "apply",
          mamaTasksLoading: false
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
    const task = this.data.mamaTasks.find((item) => item._id === taskId);
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

  showApplyForm() {
    const profile = this.data.mamaResourceProfile || {};
    const account = profile.socialAccount || {};
    updatePageApplyDraft(this, {
      displayName: profile.displayName || "",
      contactWechat: profile.contactWechat || "",
      contactPhone: profile.contactPhone || readStoredUserMobile(),
      city: profile.city || "",
      childStage: profile.childStage || "",
      childGender: profile.childGender || "",
      xiaohongshuProfileUrl: account.profileUrl || "",
      xiaohongshuScreenshotUrl: account.screenshotUrl || "",
      followerCount: account.followerCount ? String(account.followerCount) : "",
      realNameVerified: account.realNameVerified === true ? true : account.realNameVerified === false ? false : null,
      accountPositioning: profile.accountPositioning || "",
      selectedCategories: Array.isArray(profile.categories) ? profile.categories : []
    });
    this.setData({ mamaResourceView: "apply", message: "", messageType: "" });
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
    const payload = updatePageApplyDraft(this, {
      displayName: String(values.displayName || "").trim(),
      contactPhone: String(values.contactPhone || "").trim(),
      contactWechat: String(values.contactWechat || "").trim(),
      city: String(values.city || "").trim(),
      childStage: this.data.childStage,
      childGender: this.data.childGender,
      xiaohongshuProfileUrl: String(values.xiaohongshuProfileUrl || "").trim(),
      xiaohongshuScreenshotUrl: this.data.xiaohongshuScreenshotUrl,
      followerCount: String(values.followerCount || "").trim(),
      realNameVerified: this.data.realNameVerified,
      accountPositioning: String(values.accountPositioning || "").trim(),
      categories: this.data.selectedCategories,
      selectedCategories: this.data.selectedCategories,
      blockedCategories: String(values.blockedCategories || "").trim(),
      consentAccepted: Array.isArray(values.consentAccepted) && values.consentAccepted.indexOf("1") >= 0
    });
    payload.categories = payload.selectedCategories;

    if (!payload.displayName || !payload.contactWechat || !payload.xiaohongshuProfileUrl) {
      this.setData({ message: "请先填写姓名/昵称、微信号和小红书主页链接", messageType: "error" });
      return;
    }
    if (!payload.consentAccepted) {
      this.setData({ message: "请先勾选资料使用授权", messageType: "error" });
      return;
    }

    this.setData({ submitting: true, message: "", messageType: "" });
    request({
      url: "/api/mama-resources/applications",
      method: "POST",
      data: payload
    })
      .then((data) => {
        const profile = data && data.profile ? data.profile : { ...payload, status: "pending", createdAt: new Date().toISOString() };
        clearApplyDraft();
        this.setData({
          ...buildApplyDraftState(cloneEmptyApplyDraft()),
          mamaResourceView: "reviewing",
          mamaResourceProfile: buildProfileView(profile),
          mamaTasks: [],
          submitting: false,
          message: "",
          messageType: ""
        });
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
      path: "/pages/mama-resource-apply/index",
      imageUrl: MAMA_RESOURCE_SHARE_COVER_IMAGE
    }).onShareAppMessage();
  },

  onShareTimeline() {
    return createPageShare({
      title: "妈妈好赚",
      path: "/pages/mama-resource-apply/index",
      imageUrl: MAMA_RESOURCE_SHARE_COVER_IMAGE
    }).onShareTimeline();
  },

  ...createNativeSettingsMethods()
});
