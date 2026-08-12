const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { smartBackHome } = require("../../utils/nativePageNav");
const { createNativeSettingsMethods, getSettingsPanelHeight } = require("../../utils/nativeSettings");
const { buildProfileState } = require("../../utils/profileState");
const { request } = require("../../utils/request");
const { getToken } = require("../../utils/session");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { ANSWER_LABELS, buildAnalysis, dimensionsForMode, scoreAssessment } = require("../../utils/talentAssessment");
const {
  CHARACTER_RECOGNITION_VERSION,
  CHARACTER_SAMPLE_SIZE,
  buildCharacterRecognitionAnalysis,
  buildCharacterSample,
  estimateCharacterRecognition
} = require("../../utils/characterRecognition");

const DEFAULT_SLIDER_VALUE = 3;
const EIGHT_TALENTS_VERSION = "2026-08-11";
const LAST_CHILD_ID_KEY = "xiaowanzi_last_child_id_v1";
const CATALOG_SHARE_OPTIONS = {
  title: "闪测｜测一测，更懂自己和孩子",
  path: "/pages/flash-test/index"
};
const EIGHT_TALENTS_SHARE_OPTIONS = {
  title: "八大能力｜看见更容易被调用的能力组合",
  path: "/pages/flash-test/index",
  query: { test: "eight-talents" }
};
const CHARACTER_RECOGNITION_SHARE_OPTIONS = {
  title: "识字量｜用 30 个字快速了解孩子的识字范围",
  path: "/pages/flash-test/index",
  query: { test: "character-recognition" }
};
const TESTS = [
  {
    id: "eight-talents",
    badge: "能力画像",
    title: "八大能力",
    subtitle: "从记忆、推演、表达等八个方向，看见更容易被调用的能力组合",
    icon: "/assets/flash-test/assessment-checklist.png",
    source: "根据沈辛成《超越分数》整理",
    meta: "40 题 · 约 8 分钟"
  },
  {
    id: "character-recognition",
    badge: "阅读基础",
    title: "识字量",
    subtitle: "孩子读字、家长判断，用分层样本估算当前识字范围",
    icon: "/assets/flash-test/character-recognition.png",
    source: "30 字探索性抽样 · 不作诊断",
    meta: "30 字 · 约 3 分钟",
    childOnly: true
  }
];

function buildQuestionView(dimensionIndex, answers, mode = "self", slidingIndex = -1) {
  const dimension = dimensionsForMode(mode)[dimensionIndex];
  return {
    code: dimension.code,
    name: dimension.name,
    fullName: dimension.fullName,
    questions: dimension.questions.map((text, questionIndex) => {
      const answerIndex = dimensionIndex * 5 + questionIndex;
      const answer = answers[answerIndex];
      const sliderValue = answer || DEFAULT_SLIDER_VALUE;
      const sliding = questionIndex === slidingIndex;
      return {
        id: `${dimension.code}${questionIndex + 1}`,
        text,
        sliderValue,
        trackPercent: Number.isInteger(answer) ? ((sliderValue - 1) / 4) * 100 : 0,
        sliding,
        sliderLabels: [1, 2, 3, 4, 5].map((value) => {
          const distance = Math.abs(value - sliderValue);
          let dockClass = "";
          if (sliding && distance === 0) dockClass = "is-current";
          else if (sliding && distance === 1) dockClass = "is-near";
          else if (Number.isInteger(answer) && distance === 0) dockClass = "is-selected";
          return { value, dockClass };
        }),
        answered: Number.isInteger(answer),
        answerLabel: Number.isInteger(answer) ? ANSWER_LABELS[answer] : "请滑动选择"
      };
    })
  };
}

function buildQuestionState(dimensionIndex, questionIndex, answers, mode = "self", slidingIndex = -1) {
  const currentDimension = buildQuestionView(dimensionIndex, answers, mode, slidingIndex);
  const currentQuestionIndex = Math.max(0, Math.min(4, questionIndex));
  const questionNumber = dimensionIndex * 5 + currentQuestionIndex + 1;
  return {
    currentDimension,
    currentQuestionIndex,
    currentQuestion: currentDimension.questions[currentQuestionIndex],
    questionNumber,
    questionProgressPercent: Math.round((questionNumber / 40) * 100)
  };
}

const INITIAL_QUESTION_STATE = buildQuestionState(0, 0, Array(40).fill(null));

Page({
  data: {
    topbarHeight: 88,
    chromeHeight: 88,
    backTop: 8,
    backSize: 32,
    logoTop: 10,
    logoHeight: 28,
    stage: "catalog",
    tests: TESTS,
    selectedTestId: "",
    selectedTestTitle: "",
    selectedTestChildOnly: false,
    subjectModalOpen: false,
    youngChildWarningOpen: false,
    youngChildName: "",
    youngChildGrade: "",
    isLoggedIn: false,
    mode: "",
    modeLabel: "",
    selectedChildId: "",
    selectedChildName: "",
    settingsPanelOpen: false,
    settingsPanelView: "archive",
    settingsPanelHeight: 0,
    settingsProfilePanelSupported: true,
    profileHeaderHeight: 32,
    archiveSelectionMode: true,
    archiveSelectionActionLabel: "开始测试",
    dimensionIndex: 0,
    dimensionNumber: 1,
    currentQuestionIndex: 0,
    questionNumber: 1,
    questionProgressPercent: 3,
    progressPercent: 0,
    answeredCount: 0,
    currentDimension: INITIAL_QUESTION_STATE.currentDimension,
    currentQuestion: INITIAL_QUESTION_STATE.currentQuestion,
    recognitionIndex: 0,
    recognitionNumber: 1,
    recognitionCharacter: "",
    recognitionProgressPercent: 3,
    recognitionSummary: null,
    resultType: "talents",
    message: "",
    radarSize: 320,
    analysisTitle: "",
    analysisParagraphs: [],
    resultSaveState: "idle",
    resultSaveMessage: "",
    savedResultId: ""
  },

  onLoad(options = {}) {
    this.answers = Array(40).fill(null);
    this.recognitionSample = [];
    this.recognitionTestedCharacters = [];
    enableShareMenu();
    this.syncTopbarMetrics();
    this.setData({ isLoggedIn: Boolean(getToken()) });
    const sharedTestId = String(options.test || "");
    if (sharedTestId) {
      this.openAssessment({ currentTarget: { dataset: { id: sharedTestId } } });
    }
  },

  onShow() {
    enableShareMenu();
    this.setData({ isLoggedIn: Boolean(getToken()) });
  },

  getShareOptions() {
    if (this.data.stage === "catalog" && !this.data.subjectModalOpen) return CATALOG_SHARE_OPTIONS;
    if (this.data.selectedTestId === "character-recognition") return CHARACTER_RECOGNITION_SHARE_OPTIONS;
    if (this.data.selectedTestId === "eight-talents" || this.data.stage !== "catalog") return EIGHT_TALENTS_SHARE_OPTIONS;
    return CATALOG_SHARE_OPTIONS;
  },

  onShareAppMessage() {
    return createPageShare(this.getShareOptions()).onShareAppMessage();
  },

  onShareTimeline() {
    return createPageShare(this.getShareOptions()).onShareTimeline();
  },

  syncTopbarMetrics() {
    const metrics = getNativeTopbarMetrics();
    const logoHeight = 28;
    const logoTop = Math.round(metrics.statusBarHeight + Math.max(0, metrics.contentHeight - logoHeight) / 2);
    const backSize = Math.max(32, metrics.capsuleHeight || 32);
    const radarSize = Math.max(280, Math.min(340, (metrics.windowWidth || 375) - 40));
    this.setData({
      topbarHeight: metrics.topbarHeight,
      chromeHeight: metrics.topbarHeight,
      backTop: metrics.searchButtonTop,
      backSize,
      logoTop,
      logoHeight,
      radarSize
    });
  },

  goBack() {
    if (this.data.youngChildWarningOpen) {
      this.cancelYoungChildAssessment();
      return;
    }
    if (this.data.subjectModalOpen) {
      this.closeSubjectModal();
      return;
    }
    if (this.data.stage === "questions") {
      this.previousQuestion();
      return;
    }
    if (this.data.stage === "recognition") {
      this.previousRecognitionCharacter();
      return;
    }
    if (this.data.stage === "result") {
      this.setData({ stage: "catalog", selectedTestId: "", selectedTestTitle: "", message: "" });
      return;
    }
    smartBackHome();
  },

  openAssessment(event) {
    const testId = String(event.currentTarget.dataset.id || "");
    const test = TESTS.find((item) => item.id === testId);
    if (!test) return;
    this.forceNewAssessment = false;
    this.setData({
      selectedTestId: test.id,
      selectedTestTitle: test.title,
      selectedTestChildOnly: Boolean(test.childOnly),
      subjectModalOpen: true,
      message: ""
    });
  },

  closeSubjectModal() {
    this.forceNewAssessment = false;
    this.setData({
      subjectModalOpen: false,
      selectedTestId: "",
      selectedTestTitle: "",
      selectedTestChildOnly: false
    });
  },

  chooseMode(event) {
    const mode = this.data.selectedTestChildOnly ? "child" : String(event.currentTarget.dataset.mode || "self");
    this.pendingAssessmentAction = { type: "start", mode };
    if (!getToken()) return;
    this.pendingAssessmentAction = null;
    this.setData({ subjectModalOpen: false });
    if (mode === "child") {
      this.prepareChildAssessment();
      return Promise.resolve();
    }
    return this.openSavedResultOrStart("self");
  },

  authorizeAssessment(event) {
    const mode = this.data.selectedTestChildOnly ? "child" : String(event.currentTarget.dataset.mode || "self");
    this.pendingAssessmentAction = { type: "start", mode };
    const gate = this.selectComponent("#flashTestPhoneLoginGate");
    if (gate && typeof gate.loginWithPhone === "function") gate.loginWithPhone(event);
  },

  authorizeResultSave(event) {
    this.pendingAssessmentAction = { type: "save" };
    const gate = this.selectComponent("#flashTestPhoneLoginGate");
    if (gate && typeof gate.loginWithPhone === "function") gate.loginWithPhone(event);
  },

  handleAssessmentLoginSuccess() {
    const action = this.pendingAssessmentAction;
    this.pendingAssessmentAction = null;
    this.setData({ isLoggedIn: true });
    if (!action) return;
    if (action.type === "save") {
      this.persistAssessmentResult();
      return;
    }
    return this.chooseMode({ currentTarget: { dataset: { mode: action.mode } } });
  },

  handleAssessmentLoginFailure(event) {
    this.pendingAssessmentAction = null;
    wx.showToast({
      title: String(event && event.detail && event.detail.message || "登录失败，请重试"),
      icon: "none"
    });
  },

  loadChildChoices() {
    return buildProfileState().children.map((child) => ({
      id: child.id,
      name: child.title,
      initial: child.initial,
      subtitle: child.subtitle,
      grade: child.grade
    }));
  },

  ...createNativeSettingsMethods(),

  prepareChildAssessment() {
    this.setData({
      subjectModalOpen: false,
      settingsPanelHeight: getSettingsPanelHeight(),
      settingsPanelOpen: true,
      settingsPanelView: "archive",
      profilePanelMessage: ""
    });
    this.loadArchivePanel();
  },

  confirmArchiveSelection() {
    const children = this.loadChildChoices();
    const activeId = String(this.archiveActiveId || wx.getStorageSync(LAST_CHILD_ID_KEY) || "");
    const child = children.find((item) => item.id === activeId) || children[0];
    if (!child) {
      this.setData({ profilePanelMessage: "请先保存一个完整的孩子档案" });
      return;
    }
    this.closeSettings();
    return this.openSavedResultOrStart("child", child);
  },

  beginNewAssessment(mode, child = null) {
    this.setData({ subjectModalOpen: false });
    if (this.shouldWarnForYoungChild(child)) {
      this.pendingChildAssessment = child;
      this.setData({
        youngChildWarningOpen: true,
        youngChildName: child.name,
        youngChildGrade: child.grade
      });
      return;
    }
    this.startAssessment(mode, child);
  },

  loadLatestResult(mode, child = null) {
    const assessmentId = this.data.selectedTestId || "eight-talents";
    const childId = mode === "child" && child ? String(child.id || "") : "";
    const childQuery = childId ? `&childId=${encodeURIComponent(childId)}` : "";
    const limit = assessmentId === "character-recognition" ? 50 : 1;
    return request({
      url: `/api/flash-tests/results?assessmentId=${assessmentId}&mode=${mode}${childQuery}&limit=${limit}`
    }).then((payload) => {
      const results = payload && Array.isArray(payload.results) ? payload.results : [];
      if (assessmentId === "character-recognition") {
        this.recognitionTestedCharacters = [...new Set(results.flatMap((item) => (
          Array.isArray(item.sampleCharacters) ? item.sampleCharacters : []
        )))];
      }
      const result = results[0] || null;
      if (!result) return null;
      const matchesSubject = result.assessmentId === assessmentId
        && result.mode === mode
        && (mode !== "child" || String(result.childId || "") === childId);
      if (!matchesSubject) throw new Error("历史结果读取异常，请稍后重试");
      return result;
    });
  },

  showSavedResult(result, child = null) {
    const mode = result && result.mode === "child" ? "child" : "self";
    const assessmentId = String(result && result.assessmentId || "");
    const selectedChildId = mode === "child" ? String(result.childId || (child && child.id) || "") : "";
    const selectedChildName = mode === "child" ? String(result.childName || (child && child.name) || "") : "";
    if (assessmentId === "character-recognition") {
      const savedSummary = result && result.recognitionSummary;
      const summary = savedSummary && {
        ...savedSummary,
        cumulativeRecognizedCount: Number(savedSummary.cumulativeRecognizedCount ?? savedSummary.recognizedCount),
        cumulativeSampledCount: Number(savedSummary.cumulativeSampledCount ?? savedSummary.sampledCount),
        completedRounds: Number(savedSummary.completedRounds || 1)
      };
      if (!summary || Number(summary.sampledCount) !== CHARACTER_SAMPLE_SIZE || !String(summary.estimateLabel || "")) {
        throw new Error("历史结果数据异常，请稍后重试");
      }
      const analysis = buildCharacterRecognitionAnalysis(summary, selectedChildName || "孩子");
      this.answers = Array(CHARACTER_SAMPLE_SIZE).fill(null);
      this.scores = null;
      this.forceNewAssessment = false;
      this.setData({
        stage: "result",
        resultType: "recognition",
        selectedTestId: assessmentId,
        selectedTestTitle: "识字量",
        selectedTestChildOnly: true,
        subjectModalOpen: false,
        settingsPanelOpen: false,
        mode,
        modeLabel: `为${selectedChildName}测`,
        selectedChildId,
        selectedChildName,
        recognitionSummary: summary,
        analysisTitle: analysis.title,
        analysisParagraphs: analysis.paragraphs,
        resultSaveState: "saved",
        resultSaveMessage: "已保存到我的数据",
        savedResultId: String(result.id || ""),
        message: ""
      });
      return;
    }
    const scores = result && Array.isArray(result.scores) ? result.scores : [];
    if (scores.length !== 8 || scores.some((score) => !Number.isInteger(Number(score.radarValue)))) {
      throw new Error("历史结果数据异常，请稍后重试");
    }
    const analysis = buildAnalysis(scores, mode);
    this.answers = Array(40).fill(null);
    this.scores = scores;
    this.forceNewAssessment = false;
    this.setData({
      stage: "result",
      resultType: "talents",
      selectedTestId: "eight-talents",
      selectedTestTitle: "八大能力",
      subjectModalOpen: false,
      settingsPanelOpen: false,
      mode,
      modeLabel: mode === "child" ? `为${selectedChildName}测` : "测自己",
      selectedChildId,
      selectedChildName,
      analysisTitle: analysis.title,
      analysisParagraphs: analysis.paragraphs,
      resultSaveState: "saved",
      resultSaveMessage: "已保存到我的数据",
      savedResultId: String(result.id || ""),
      message: ""
    }, () => {
      const draw = () => this.drawRadar();
      if (typeof wx.nextTick === "function") wx.nextTick(draw);
      else setTimeout(draw, 0);
    });
  },

  openSavedResultOrStart(mode, child = null) {
    if (this.forceNewAssessment) {
      this.beginNewAssessment(mode, child);
      return Promise.resolve(false);
    }
    this.setData({ message: "" });
    return this.loadLatestResult(mode, child)
      .then((result) => {
        if (result) {
          this.showSavedResult(result, child);
          return true;
        }
        this.beginNewAssessment(mode, child);
        return false;
      })
      .catch((error) => {
        const unsupportedRecognitionHistory = this.data.selectedTestId === "character-recognition"
          && Number(error && error.statusCode) === 400
          && String(error && error.message || "") === "暂不支持该测试";
        if (unsupportedRecognitionHistory) {
          this.beginNewAssessment(mode, child);
          return false;
        }
        this.setData({
          isLoggedIn: Boolean(getToken())
        });
        if (mode === "child") this.prepareChildAssessment();
        else this.setData({ subjectModalOpen: true });
        wx.showToast({
          title: String(error && error.message || "读取上次结果失败，请重试"),
          icon: "none"
        });
        return false;
      });
  },

  shouldWarnForYoungChild(child) {
    if (this.data.selectedTestId === "character-recognition") return false;
    const grade = String((child && child.grade) || "").trim();
    return /^(孕产|婴幼儿|学前)/.test(grade) || /^(小学)?(?:一年级|二年级)$/.test(grade);
  },

  cancelYoungChildAssessment() {
    this.pendingChildAssessment = null;
    this.setData({
      youngChildWarningOpen: false,
      youngChildName: "",
      youngChildGrade: ""
    });
    this.prepareChildAssessment();
  },

  continueYoungChildAssessment() {
    const child = this.pendingChildAssessment;
    if (!child) return;
    this.pendingChildAssessment = null;
    this.setData({
      youngChildWarningOpen: false,
      youngChildName: "",
      youngChildGrade: ""
    });
    this.startAssessment("child", child);
  },

  returnSettingsMenu() {
    this.closeSettings();
  },

  startAssessment(mode, child = null) {
    this.forceNewAssessment = false;
    this.scores = null;
    const selectedChildId = mode === "child" && child ? child.id : "";
    const selectedChildName = mode === "child" && child ? child.name : "";
    if (selectedChildId) wx.setStorageSync(LAST_CHILD_ID_KEY, selectedChildId);
    if (this.data.selectedTestId === "character-recognition") {
      this.recognitionSample = buildCharacterSample(
        Math.random,
        this.recognitionSample,
        this.recognitionTestedCharacters
      );
      this.answers = Array(CHARACTER_SAMPLE_SIZE).fill(null);
      this.setData({
        stage: "recognition",
        resultType: "recognition",
        mode: "child",
        modeLabel: `为${selectedChildName}测`,
        selectedChildId,
        selectedChildName,
        recognitionSummary: null,
        message: ""
      });
      this.showRecognitionCharacter(0);
      return;
    }
    this.answers = Array(40).fill(null);
    this.setData({
      stage: "questions",
      resultType: "talents",
      mode,
      modeLabel: mode === "child" ? `为${selectedChildName}测` : "测自己",
      selectedChildId,
      selectedChildName,
      answeredCount: 0,
      progressPercent: 0,
      message: ""
    });
    this.showQuestion(0, 0);
  },

  showRecognitionCharacter(index) {
    const boundedIndex = Math.max(0, Math.min(CHARACTER_SAMPLE_SIZE - 1, index));
    this.setData({
      stage: "recognition",
      recognitionIndex: boundedIndex,
      recognitionNumber: boundedIndex + 1,
      recognitionCharacter: this.recognitionSample[boundedIndex],
      recognitionProgressPercent: Math.round(((boundedIndex + 1) / CHARACTER_SAMPLE_SIZE) * 100),
      message: ""
    });
  },

  answerRecognitionCharacter(event) {
    const value = Number(event.currentTarget.dataset.value);
    if (value !== 0 && value !== 1) return;
    this.answers[this.data.recognitionIndex] = value;
    if (this.data.recognitionIndex < CHARACTER_SAMPLE_SIZE - 1) {
      this.showRecognitionCharacter(this.data.recognitionIndex + 1);
      return;
    }
    this.finishCharacterRecognition();
  },

  previousRecognitionCharacter() {
    if (this.data.recognitionIndex === 0) {
      this.setData({ stage: "catalog", subjectModalOpen: true, message: "" });
      return;
    }
    this.showRecognitionCharacter(this.data.recognitionIndex - 1);
  },

  finishCharacterRecognition() {
    try {
      const summary = estimateCharacterRecognition(this.answers);
      const analysis = buildCharacterRecognitionAnalysis(summary, this.data.selectedChildName || "孩子");
      this.setData({
        stage: "result",
        resultType: "recognition",
        recognitionSummary: summary,
        analysisTitle: analysis.title,
        analysisParagraphs: analysis.paragraphs,
        resultSaveState: "saving",
        resultSaveMessage: "正在保存到我的数据…",
        savedResultId: "",
        message: ""
      });
      this.persistAssessmentResult();
    } catch (error) {
      this.setData({ message: error.message || "请先完成全部汉字" });
    }
  },

  showQuestion(dimensionIndex, questionIndex) {
    const answeredCount = this.answers.filter(Number.isInteger).length;
    const questionState = buildQuestionState(dimensionIndex, questionIndex, this.answers, this.data.mode);
    this.setData({
      stage: "questions",
      dimensionIndex,
      dimensionNumber: dimensionIndex + 1,
      ...questionState,
      answeredCount,
      progressPercent: Math.round((answeredCount / 40) * 100),
      message: ""
    });
  },

  updateAnswer(event) {
    this.applyAnswer(event, true);
  },

  finishAnswer(event) {
    this.applyAnswer(event, false);
  },

  confirmSliderPosition() {
    this.applyAnswer({ detail: { value: this.data.currentQuestion.sliderValue } }, false);
  },

  selectAnswerValue(event) {
    this.applyAnswer({ detail: { value: event.currentTarget.dataset.value } }, false);
  },

  applyAnswer(event, sliding) {
    const questionIndex = this.data.currentQuestionIndex;
    const value = Math.max(1, Math.min(5, Math.round(Number(event.detail.value) || DEFAULT_SLIDER_VALUE)));
    const answerIndex = this.data.dimensionIndex * 5 + questionIndex;
    this.answers[answerIndex] = value;
    const questionState = buildQuestionState(
      this.data.dimensionIndex,
      questionIndex,
      this.answers,
      this.data.mode,
      sliding ? questionIndex : -1
    );
    const answeredCount = this.answers.filter(Number.isInteger).length;
    this.setData({
      ...questionState,
      answeredCount,
      progressPercent: Math.round((answeredCount / 40) * 100),
      message: ""
    });
  },

  previousQuestion() {
    if (this.data.dimensionIndex === 0 && this.data.currentQuestionIndex === 0) {
      this.setData({ stage: "catalog", subjectModalOpen: true, message: "" });
      return;
    }
    if (this.data.currentQuestionIndex > 0) {
      this.showQuestion(this.data.dimensionIndex, this.data.currentQuestionIndex - 1);
      return;
    }
    this.showQuestion(this.data.dimensionIndex - 1, 4);
  },

  nextQuestion() {
    const answerIndex = this.data.dimensionIndex * 5 + this.data.currentQuestionIndex;
    if (!Number.isInteger(this.answers[answerIndex])) {
      this.setData({ message: "请先滑动选择，再进入下一题" });
      return;
    }
    if (this.data.currentQuestionIndex < 4) {
      this.showQuestion(this.data.dimensionIndex, this.data.currentQuestionIndex + 1);
      return;
    }
    if (this.data.dimensionIndex < dimensionsForMode(this.data.mode).length - 1) {
      this.showQuestion(this.data.dimensionIndex + 1, 0);
      return;
    }
    this.finishAssessment();
  },

  finishAssessment() {
    try {
      const scores = scoreAssessment(this.answers);
      const analysis = buildAnalysis(scores, this.data.mode);
      this.scores = scores;
      this.setData({
        stage: "result",
        resultType: "talents",
        analysisTitle: analysis.title,
        analysisParagraphs: analysis.paragraphs,
        resultSaveState: "saving",
        resultSaveMessage: "正在保存到我的数据…",
        savedResultId: "",
        message: ""
      }, () => {
        const draw = () => this.drawRadar();
        if (typeof wx.nextTick === "function") wx.nextTick(draw);
        else setTimeout(draw, 0);
      });
      this.persistAssessmentResult();
    } catch (error) {
      this.setData({ message: error.message || "请先完成全部题目" });
    }
  },

  persistAssessmentResult() {
    if (this._resultSavePromise) return this._resultSavePromise;
    if (!getToken()) {
      this.setData({
        isLoggedIn: false,
        resultSaveState: "error",
        resultSaveMessage: "登录已过期，请重新授权后保存"
      });
      return Promise.resolve();
    }
    this.setData({ resultSaveState: "saving", resultSaveMessage: "正在保存到我的数据…" });
    const assessmentId = this.data.selectedTestId || "eight-talents";
    this._resultSavePromise = request({
      method: "POST",
      url: "/api/flash-tests/results",
      data: {
        assessmentId,
        assessmentVersion: assessmentId === "character-recognition"
          ? CHARACTER_RECOGNITION_VERSION
          : EIGHT_TALENTS_VERSION,
        mode: this.data.mode,
        childId: this.data.mode === "child" ? this.data.selectedChildId : "",
        answers: this.answers.slice(),
        sampleCharacters: assessmentId === "character-recognition" ? this.recognitionSample.slice() : undefined
      }
    })
      .then((payload) => {
        const result = payload && payload.result || {};
        const resultData = {
          resultSaveState: "saved",
          resultSaveMessage: "已保存到我的数据",
          savedResultId: String(result.id || "")
        };
        if (assessmentId === "character-recognition" && result.recognitionSummary) {
          this.recognitionTestedCharacters = [...new Set([
            ...(this.recognitionTestedCharacters || []),
            ...this.recognitionSample
          ])];
          resultData.recognitionSummary = result.recognitionSummary;
          const analysis = buildCharacterRecognitionAnalysis(
            result.recognitionSummary,
            this.data.selectedChildName || "孩子"
          );
          resultData.analysisTitle = analysis.title;
          resultData.analysisParagraphs = analysis.paragraphs;
        }
        this.setData(resultData);
      })
      .catch((error) => {
        this.setData({
          isLoggedIn: Boolean(getToken()),
          resultSaveState: "error",
          resultSaveMessage: String(error && error.message || "保存失败，请重试")
        });
      })
      .finally(() => {
        this._resultSavePromise = null;
      });
    return this._resultSavePromise;
  },

  retryResultSave() {
    if (!getToken()) return;
    this.persistAssessmentResult();
  },

  drawRadar() {
    if (!Array.isArray(this.scores) || this.scores.length !== 8) return;
    const size = this.data.radarSize;
    const center = size / 2;
    const radius = size * 0.32;
    const labelRadius = radius + 27;
    const context = wx.createCanvasContext("talentRadar", this);
    const pointAt = (scale, index, baseRadius = radius) => {
      const angle = -Math.PI / 2 + index * Math.PI / 4;
      return {
        x: center + Math.cos(angle) * baseRadius * scale,
        y: center + Math.sin(angle) * baseRadius * scale
      };
    };

    context.clearRect(0, 0, size, size);
    for (let ring = 1; ring <= 5; ring += 1) {
      context.beginPath();
      for (let index = 0; index < 8; index += 1) {
        const point = pointAt(ring / 5, index);
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.closePath();
      context.setStrokeStyle(ring === 5 ? "rgba(108, 39, 214, 0.3)" : "rgba(108, 39, 214, 0.12)");
      context.setLineWidth(ring === 5 ? 1.2 : 0.8);
      context.stroke();
    }

    for (let index = 0; index < 8; index += 1) {
      const point = pointAt(1, index);
      context.beginPath();
      context.moveTo(center, center);
      context.lineTo(point.x, point.y);
      context.setStrokeStyle("rgba(108, 39, 214, 0.13)");
      context.setLineWidth(0.8);
      context.stroke();
    }

    context.beginPath();
    this.scores.forEach((score, index) => {
      const point = pointAt(score.radarValue / 5, index);
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
    context.setFillStyle("rgba(108, 39, 214, 0.2)");
    context.setStrokeStyle("#6c27d6");
    context.setLineWidth(2.2);
    context.fill();
    context.stroke();

    this.scores.forEach((score, index) => {
      const point = pointAt(1, index, labelRadius);
      context.setTextAlign(Math.abs(point.x - center) < 8 ? "center" : point.x < center ? "right" : "left");
      const nameY = index === 4 ? point.y - 13 : point.y - 5;
      const scoreY = index === 4 ? point.y + 4 : point.y + 12;
      context.setFillStyle("#101335");
      context.setFontSize(13);
      context.fillText(score.name, point.x, nameY);
      context.setFillStyle("#6c27d6");
      context.setFontSize(12);
      context.fillText(`${score.radarValue}分`, point.x, scoreY);
    });
    context.draw(false);
  },

  continueRecognitionAssessment() {
    if (this.data.resultType !== "recognition" || this.data.resultSaveState !== "saved") return;
    const childId = String(this.data.selectedChildId || "");
    const childName = String(this.data.selectedChildName || "");
    if (!childId) {
      this.setData({ message: "孩子档案信息缺失，请重新选择" });
      return;
    }
    this.startAssessment("child", { id: childId, name: childName });
  },

  restartAssessment() {
    this.forceNewAssessment = true;
    this.answers = Array(this.data.selectedTestId === "character-recognition" ? CHARACTER_SAMPLE_SIZE : 40).fill(null);
    this.scores = null;
    const questionState = buildQuestionState(0, 0, this.answers);
    this.setData({
      stage: "catalog",
      subjectModalOpen: true,
      mode: "",
      modeLabel: "",
      selectedChildId: "",
      selectedChildName: "",
      dimensionIndex: 0,
      dimensionNumber: 1,
      currentQuestionIndex: 0,
      questionNumber: 1,
      questionProgressPercent: 3,
      answeredCount: 0,
      progressPercent: 0,
      currentDimension: questionState.currentDimension,
      currentQuestion: questionState.currentQuestion,
      recognitionIndex: 0,
      recognitionNumber: 1,
      recognitionCharacter: "",
      recognitionProgressPercent: 3,
      recognitionSummary: null,
      analysisTitle: "",
      analysisParagraphs: [],
      resultSaveState: "idle",
      resultSaveMessage: "",
      savedResultId: "",
      message: ""
    });
  }
});
