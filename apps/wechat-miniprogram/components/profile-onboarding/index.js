const {
  CITIES,
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
    cities: CITIES,
    regions: [],
    stages: STAGES,
    grades: [],
    cityIndex: 0,
    regionIndex: 0,
    stageIndex: 0,
    gradeIndex: 0,
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
      const cityIndex = Math.max(0, CITIES.indexOf(state.city));
      const city = state.city || CITIES[cityIndex] || "";
      const regions = districtsFor(city);
      const regionIndex = Math.max(0, regions.indexOf(state.region));
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
        regions,
        grades,
        cityIndex,
        regionIndex,
        stageIndex,
        gradeIndex,
      });
    },

    noop() {},

    close() {
      dismissProfileOnboardingForSession();
      this.setData({ visible: false, message: "" });
    },

    chooseCity(event) {
      const cityIndex = Number(event.detail.value) || 0;
      const city = CITIES[cityIndex] || "";
      this.setData({ city, cityIndex, region: "", regionIndex: 0, regions: districtsFor(city) });
      if (this.data.stage) {
        const grades = gradesFor(this.data.stage, city);
        this.setData({ grades, gradeName: "", gradeIndex: 0 });
      }
    },

    chooseRegion(event) {
      const regionIndex = Number(event.detail.value) || 0;
      this.setData({ regionIndex, region: this.data.regions[regionIndex] || "" });
    },

    chooseStage(event) {
      const stageIndex = Number(event.detail.value) || 0;
      const stage = STAGES[stageIndex] || "";
      this.setData({ stageIndex, stage, gradeName: "", gradeIndex: 0, grades: gradesFor(stage, this.data.city) });
    },

    chooseGrade(event) {
      const gradeIndex = Number(event.detail.value) || 0;
      this.setData({ gradeIndex, gradeName: this.data.grades[gradeIndex] || "" });
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
