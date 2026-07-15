const {
  STAGES,
  applyPendingProfileOnboardingDecision,
  cacheProfileOnboardingChildren,
  dismissProfileOnboardingForSession,
  districtsFor,
  getProfileOnboardingState,
  gradesFor,
  parseGrade,
  readPendingProfileOnboarding,
  reconcilePendingProfileOnboarding,
  saveProfileOnboardingDraft,
  syncProfileOnboardingRemote,
} = require("../../utils/profileOnboarding");
const { mergeChildProfileRecords } = require("../../utils/profileState");
const { request } = require("../../utils/request");
const { getToken } = require("../../utils/session");

const CHILD_AVATAR = "/assets/wel-avatar/no-hat.png";

Component({
  data: {
    visible: false,
    conflictVisible: false,
    reconciling: false,
    saving: false,
    message: "",
    city: "",
    region: "",
    stage: "",
    gradeName: "",
    regionOptions: [],
    educationRange: [STAGES, gradesFor(STAGES[0], "")],
    educationValue: [0, 0],
  },

  pageLifetimes: {
    show() {
      this.refresh();
      void this.reconcileAfterLogin();
    },
  },

  methods: {
    refresh() {
      const state = getProfileOnboardingState();
      const parsed = parseGrade(state.grade);
      const city = state.city || "";
      const regionOptions = districtsFor(city);
      const stageIndex = Math.max(0, STAGES.indexOf(parsed.stage));
      const stage = parsed.stage || STAGES[stageIndex] || "";
      const grades = gradesFor(stage, city);
      const gradeIndex = Math.max(0, grades.indexOf(parsed.gradeName));
      this.setData({
        visible: state.visible,
        message: "",
        city: state.city,
        region: state.region,
        stage: parsed.stage,
        gradeName: parsed.gradeName,
        regionOptions,
        educationRange: [STAGES, grades],
        educationValue: [stageIndex, gradeIndex],
      });
    },

    noop() {},

    close() {
      dismissProfileOnboardingForSession();
      this.setData({ visible: false, message: "" });
    },

    closeConflict() {
      this.setData({ conflictVisible: false, message: "" });
    },

    async persistReconciledProfile(result) {
      if (!result || result.status !== "created") return;
      const child = result.children.find((item) => item.id === result.childId);
      await syncProfileOnboardingRemote(result.children, child);
    },

    async reconcileAfterLogin() {
      if (!getToken() || !readPendingProfileOnboarding() || this.data.reconciling) return null;
      this.setData({ reconciling: true, message: "" });
      try {
        const remote = await request({ url: "/api/users/me/xiaowanzi-sync" });
        const children = mergeChildProfileRecords(remote && remote.childProfiles, [], { avatarFallback: CHILD_AVATAR });
        cacheProfileOnboardingChildren(children);
        const preview = reconcilePendingProfileOnboarding(children);
        if (preview.status === "confirm") {
          this.remoteChildren = children;
          this.setData({ conflictVisible: true, visible: false });
          return preview;
        }
        const result = applyPendingProfileOnboardingDecision("create", children);
        await this.persistReconciledProfile(result);
        this.setData({ conflictVisible: false, visible: false });
        this.triggerEvent("saved", { reason: "reconciled", childId: result.childId });
        return result;
      } catch (_error) {
        this.setData({ message: "登录资料读取失败，稍后将再次确认" });
        return null;
      } finally {
        this.setData({ reconciling: false });
      }
    },

    async createPendingChild() {
      if (this.data.reconciling) return;
      this.setData({ reconciling: true, message: "" });
      try {
        const result = applyPendingProfileOnboardingDecision("create", this.remoteChildren || []);
        await this.persistReconciledProfile(result);
        this.setData({ conflictVisible: false, visible: false });
        this.triggerEvent("saved", { reason: "created", childId: result.childId });
      } finally {
        this.setData({ reconciling: false });
      }
    },

    discardPendingProfile() {
      const result = applyPendingProfileOnboardingDecision("discard", this.remoteChildren || []);
      this.setData({ conflictVisible: false, visible: false, message: "" });
      this.triggerEvent("saved", { reason: "discarded", childId: result.childId });
    },

    updateCity(event) {
      const city = String(event.detail.value || "");
      const regionOptions = districtsFor(city);
      const stageIndex = this.data.educationValue[0] || 0;
      const stage = this.data.stage || STAGES[stageIndex] || STAGES[0] || "";
      const grades = gradesFor(stage, city);
      const gradeIndex = Math.max(0, grades.indexOf(this.data.gradeName));
      this.setData({
        city,
        region: "",
        regionOptions,
        gradeName: grades.includes(this.data.gradeName) ? this.data.gradeName : "",
        educationRange: [STAGES, grades],
        educationValue: [stageIndex, gradeIndex],
      });
    },

    chooseRegion(event) {
      const regionIndex = Number(event.detail.value) || 0;
      this.setData({ region: this.data.regionOptions[regionIndex] || "" });
    },

    updateRegionInput(event) {
      this.setData({ region: String(event.detail.value || "") });
    },

    changeEducationColumn(event) {
      const column = Number(event.detail.column) || 0;
      const value = Number(event.detail.value) || 0;
      const educationValue = this.data.educationValue.slice();
      educationValue[column] = value;
      if (column === 0) {
        const stage = STAGES[value] || STAGES[0] || "";
        const city = this.data.city || "";
        educationValue[1] = 0;
        this.setData({ educationRange: [STAGES, gradesFor(stage, city)], educationValue });
        return;
      }
      this.setData({ educationValue });
    },

    chooseEducation(event) {
      const stageIndex = Number(event.detail.value[0]) || 0;
      const gradeIndex = Number(event.detail.value[1]) || 0;
      const stage = STAGES[stageIndex] || "";
      const city = this.data.city || "";
      const grades = gradesFor(stage, city);
      this.setData({
        stage,
        gradeName: grades[gradeIndex] || "",
        educationRange: [STAGES, grades],
        educationValue: [stageIndex, gradeIndex],
      });
    },

    async save() {
      if (!this.data.city || !this.data.region || !this.data.stage || !this.data.gradeName) {
        this.setData({ message: "请完整选择城市、区域和年级" });
        return;
      }
      if (this.data.saving) return;
      this.setData({ saving: true, message: "" });
      try {
        const result = await saveProfileOnboardingDraft(this.data);
        if (getToken()) {
          this.setData({ saving: false });
          await this.reconcileAfterLogin();
          return;
        }
        this.setData({ saving: false, visible: false });
        this.triggerEvent("saved", result);
      } catch (error) {
        this.setData({ saving: false, message: error && error.message ? error.message : "保存失败，请重试" });
      }
    },
  },
});
