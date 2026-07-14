const {
  STAGES,
  dismissProfileOnboardingForSession,
  districtsFor,
  getProfileOnboardingState,
  gradesFor,
  parseGrade,
  saveProfileOnboardingDraft,
} = require("../../utils/profileOnboarding");

Component({
  data: {
    visible: false,
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
        this.setData({ saving: false, visible: false });
        this.triggerEvent("saved", result);
      } catch (error) {
        this.setData({ saving: false, message: error && error.message ? error.message : "保存失败，请重试" });
      }
    },
  },
});
