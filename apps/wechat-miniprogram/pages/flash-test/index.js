const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { ensureBackStackForBackButtonPage, smartBackHome } = require("../../utils/nativePageNav");
const { createNativeSettingsMethods, getSettingsPanelHeight } = require("../../utils/nativeSettings");
const { buildProfileState } = require("../../utils/profileState");
const { API_ORIGIN, DEFAULT_WEB_ORIGIN } = require("../../utils/config");
const { request } = require("../../utils/request");
const { getToken } = require("../../utils/session");
const { createPageShare, enableShareMenu } = require("../../utils/share");
const { ANSWER_LABELS, buildAnalysis, dimensionsForMode, scoreAssessment } = require("../../utils/talentAssessment");
const {
  ADVANCED_CHARACTER_BANK,
  CHARACTER_BANK,
  CHARACTER_RECOGNITION_VERSION,
  CHARACTER_SAMPLE_SIZE,
  BASE_CHARACTER_BANK,
  BASE_CHARACTER_RECOGNITION_VERSION,
  BASE_CHARACTER_SAMPLE_SIZE,
  LEGACY_CHARACTER_RECOGNITION_VERSION,
  buildCharacterRecognitionAnalysis,
  buildCharacterPage,
  buildCharacterRecognitionSummary
} = require("../../utils/characterRecognition");
const { getCharacterPinyin } = require("../../utils/characterRecognitionPinyin");
const {
  DEFAULT_ENGLISH_WORD_PACK_ID,
  ENGLISH_PICTURE_NAMING_BANK,
  ENGLISH_PICTURE_NAMING_VERSION,
  ENGLISH_WORD_PACKS,
  buildEnglishPictureNamingSummary,
  getEnglishWordPack
} = require("../../utils/englishPictureNaming");

const DEFAULT_SLIDER_VALUE = 3;
const EIGHT_TALENTS_VERSION = "2026-08-11";
const LAST_CHILD_ID_KEY = "xiaowanzi_last_child_id_v1";
const LAST_ASSESSMENT_MODE_KEY = "xf_flash_test_last_mode_v1";
const RECOGNITION_PROGRESS_KEY_PREFIX = "xf_character_recognition_progress_v2_";
const LEGACY_RECOGNITION_PROGRESS_KEY_PREFIX = "xf_character_recognition_progress_v1_";
const PRONUNCIATION_CACHE_VERSION = "v4";
const ENGLISH_WORD_TOTAL = ENGLISH_WORD_PACKS.reduce((sum, pack) => sum + pack.items.length, 0);
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
  title: "识字量｜找出孩子具体会和不会的字",
  path: "/pages/flash-test/index",
  query: { test: "character-recognition" }
};
const ENGLISH_PICTURE_NAMING_SHARE_OPTIONS = {
  title: "英文单词｜看见单词，读给家长听",
  path: "/pages/flash-test/index",
  query: { test: "english-picture-naming" }
};

function normalizePronunciationAudioData(response) {
  const data = response && response.data;
  if (!data || !data.byteLength) return null;
  const bytes = new Uint8Array(data);
  const firstContentByte = bytes.find((byte) => byte !== 0x20 && byte !== 0x0a && byte !== 0x0d && byte !== 0x09);
  const headers = response.header || {};
  const contentTypeKey = Object.keys(headers).find((key) => key.toLowerCase() === "content-type");
  const contentType = String(contentTypeKey ? headers[contentTypeKey] : "").toLowerCase();
  if (!contentType.includes("application/json") && firstContentByte !== 0x7b) return data;

  let jsonText = "";
  for (let index = 0; index < bytes.length; index += 1) {
    jsonText += String.fromCharCode(bytes[index]);
  }
  const audioBase64 = jsonText.match(/"audioBase64"\s*:\s*"([^"]+)"/)?.[1] || "";
  if (!audioBase64 || typeof wx.base64ToArrayBuffer !== "function") return null;
  return wx.base64ToArrayBuffer(audioBase64);
}
const RECOGNITION_SOURCES = [
  {
    id: "pep-textbook",
    title: "统编小学语文教材识字写字内容的修订思路",
    institution: "人民教育出版社",
    version: "2024 年第 10 期",
    purpose: "参考小学低年级字量、字种、字序，以及贴近日常生活的识字情境。",
    url: "https://www.pep.com.cn/bks/xxyw/jzjd/202505/t20250525_2000348.shtml"
  },
  {
    id: "curriculum-standard",
    title: "义务教育语文课程标准（2022年版）",
    institution: "中华人民共和国教育部",
    version: "2022 年",
    purpose: "参考小学阶段识字写字目标与课程常用字范围背景。",
    url: "https://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html"
  },
  {
    id: "preschool-guide",
    title: "3—6岁儿童学习与发展指南",
    institution: "中华人民共和国教育部",
    version: "2012 年",
    purpose: "约束幼儿测试方式：重兴趣和生活情境，不设置识字量达标线。",
    url: "https://www.moe.gov.cn/jyb_xwfb/s271/201210/t20121015_143257.html"
  },
  {
    id: "standard-characters",
    title: "通用规范汉字表",
    institution: "国务院公布，教育部等十二部门贯彻实施",
    version: "2013 年",
    purpose: "统一简化字字形与规范用字，不用于定义儿童识字量等级。",
    url: "https://www.moe.gov.cn/srcsite/A19/s229/201310/t20131015_159487.html"
  },
  {
    id: "grade-one-upper-table",
    title: "2024 统编语文一年级上册识字表",
    institution: "教材信息校对页（非官方发布页）",
    version: "2024 年 8 月第 1 版",
    purpose: "逐字校对首批字库中的一年级上册识字表。",
    url: "https://www.ciyu6.com/yinianji-1"
  },
  {
    id: "grade-one-lower-table",
    title: "2024 统编语文一年级下册识字表",
    institution: "教材信息校对页（非官方发布页）",
    version: "2024 年 10 月第 1 版",
    purpose: "逐字校对首批字库中的一年级下册识字表。",
    url: "https://www.ciyu6.com/yinianji-2"
  },
  {
    id: "grade-two-upper-table",
    title: "2025 统编语文二年级上册识字表",
    institution: "教材信息校对页（非官方发布页）",
    version: "2025 年 5 月第 1 版",
    purpose: "逐字校对首批字库中的二年级上册识字表，按出现顺序去重后取满 800 字。",
    url: "https://www.ciyu6.com/ernianji-1"
  },
  {
    id: "grade-two-lower-table",
    title: "2024 统编语文二年级下册识字表",
    institution: "教材信息校对页（非官方发布页）",
    version: "2024 年 8 月第 1 版",
    purpose: "进阶字库优先接续二年级下册识字表，重复字不再次测试。",
    url: "https://www.ciyu6.com/ernianji-2"
  }
];
const ENGLISH_ASSESSMENT_REFERENCES = [
  {
    id: "cefr-2020",
    title: "CEFR Companion Volume",
    institution: "Council of Europe",
    version: "2020",
    purpose: "参考书面词汇识别与朗读活动的表述边界；本工具不据此评定 CEFR 等级。",
    url: "https://www.coe.int/en/web/common-european-framework-reference-languages/cefr-companion-volume-and-its-language-versions"
  },
  {
    id: "cambridge-word-list-2025",
    title: "Pre A1 Starters, Movers and Flyers word list",
    institution: "Cambridge English",
    version: "2025",
    purpose: `核对各词包属于儿童英语入门阶段常见词汇；${ENGLISH_WORD_TOTAL} 个词不代表完整词汇量。`,
    url: "https://www.cambridgeenglish.org/images/506166-starters-movers-flyers-word-list-2025.pdf"
  },
  {
    id: "cambridge-prea1",
    title: "Pre A1 Starters preparation",
    institution: "Cambridge English",
    version: "当前公开版",
    purpose: "参考面向儿童的简短指令、单项作答和图片辅助方式；本工具不是 Cambridge 模拟题。",
    url: "https://www.cambridgeenglish.org/exams-and-tests/qualifications/young-learners/paper/starters/preparation/"
  }
];
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
    subtitle: "每屏选出不认识的字，逐字形成会和不会的清单",
    icon: "/assets/flash-test/character-recognition.png",
    source: "统编教材常用字参考 · 不作诊断",
    meta: "两组各 800 字 · 可独立检查",
    childOnly: true
  },
  {
    id: "english-picture-naming",
    badge: "英文词汇",
    title: "英文单词",
    subtitle: "看见英文单词直接朗读，家长记录认识和暂不认识",
    icon: "/assets/flash-test/english-picture-naming.svg",
    source: "见词识读 · 真实照片辅助",
    meta: `${ENGLISH_WORD_PACKS.length} 个词包 · 共 ${ENGLISH_WORD_TOTAL} 题`,
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

function buildRecognitionCharacterGroups(sampleCharacters, answers) {
  const characters = Array.isArray(sampleCharacters) ? sampleCharacters : [];
  const values = Array.isArray(answers) ? answers : [];
  if (![BASE_CHARACTER_SAMPLE_SIZE, CHARACTER_SAMPLE_SIZE].includes(characters.length)
    || values.length !== characters.length) {
    return { recognitionKnownCharacters: [], recognitionUnknownCharacters: [] };
  }
  return characters.reduce((groups, character, index) => {
    if (values[index] === 1) groups.recognitionKnownCharacters.push(character);
    else if (values[index] === 0) groups.recognitionUnknownCharacters.push(character);
    return groups;
  }, { recognitionKnownCharacters: [], recognitionUnknownCharacters: [] });
}

function buildRecognitionMasteryFromResult(result, recognitionGroup) {
  if (!result) return null;
  const answers = Array.isArray(result.answers) ? result.answers.map(Number) : [];
  const groupAnswers = answers.length === CHARACTER_SAMPLE_SIZE
    ? answers.slice((recognitionGroup - 1) * BASE_CHARACTER_SAMPLE_SIZE, recognitionGroup * BASE_CHARACTER_SAMPLE_SIZE)
    : answers;
  const matchesGroup = answers.length === CHARACTER_SAMPLE_SIZE
    || Number(result.recognitionGroup) === recognitionGroup;
  if (!matchesGroup || groupAnswers.length !== BASE_CHARACTER_SAMPLE_SIZE) return null;
  return {
    recognizedCount: groupAnswers.reduce((sum, answer) => sum + answer, 0),
    sampledCount: BASE_CHARACTER_SAMPLE_SIZE,
    completedAt: result.completedAt || ""
  };
}

function buildRecognitionGroupCard(recognitionGroup, mastery = null, progress = null) {
  const answers = progress && Array.isArray(progress.answers) ? progress.answers : [];
  const checkedCount = answers.filter((answer) => answer === 0 || answer === 1).length;
  const progressRecognizedCount = answers.filter((answer) => answer === 1).length;
  const recognizedCount = mastery ? Number(mastery.recognizedCount) : progressRecognizedCount;
  const masteryPercent = Math.round((recognizedCount / BASE_CHARACTER_SAMPLE_SIZE) * 100);
  const completed = Boolean(mastery);
  const inProgress = !completed && checkedCount > 0;
  return {
    group: recognitionGroup,
    title: recognitionGroup === 2 ? "进阶 800 字" : "基础 800 字",
    recognizedDisplay: completed || inProgress ? String(recognizedCount) : "—",
    masteryPercent,
    masteryLabel: completed ? `掌握 ${masteryPercent}%` : inProgress ? `当前 ${masteryPercent}%` : "待检查",
    actionLabel: completed ? "复查" : inProgress ? "继续" : "开始"
  };
}

const EMPTY_RECOGNITION_GROUP_CARDS = [
  buildRecognitionGroupCard(1),
  buildRecognitionGroupCard(2)
];

function buildEnglishWordPackCards(masteries = {}) {
  return ENGLISH_WORD_PACKS.map((pack, index) => {
    const mastery = masteries && masteries[pack.id];
    const matchedCount = mastery ? Number(mastery.matchedCount) || 0 : 0;
    const totalCount = pack.items.length;
    return {
      id: pack.id,
      order: index + 1,
      title: pack.title,
      subtitle: pack.subtitle,
      recognizedDisplay: mastery ? String(matchedCount) : "—",
      totalCount,
      masteryPercent: mastery ? Math.round((matchedCount / totalCount) * 100) : 0,
      masteryLabel: mastery ? `认识 ${matchedCount} 个 · 暂不认识 ${totalCount - matchedCount} 个` : "待测试",
      actionLabel: mastery ? "复查" : "开始"
    };
  });
}

const EMPTY_ENGLISH_WORD_PACK_CARDS = buildEnglishWordPackCards();

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
    recognitionPage: null,
    recognitionPageCharacters: [],
    recognitionPageNumber: 1,
    recognitionPageCount: BASE_CHARACTER_SAMPLE_SIZE / 20,
    recognitionGroupNumber: 1,
    recognitionGroupPageNumber: 1,
    recognitionGroupPageCount: BASE_CHARACTER_SAMPLE_SIZE / 20,
    recognitionSampleSize: BASE_CHARACTER_SAMPLE_SIZE,
    recognitionIsAdvanced: false,
    recognitionIsLegacyCumulative: false,
    recognitionCompletedCount: 0,
    recognitionUnknownCount: 0,
    recognitionStageLabel: "第 1 阶",
    recognitionStageAudience: "幼儿园小班参考",
    recognitionSummary: null,
    recognitionGroupCards: EMPTY_RECOGNITION_GROUP_CARDS,
    recognitionKnownCharacters: [],
    recognitionUnknownCharacters: [],
    recognitionFocusOpen: false,
    recognitionFocusIndex: -1,
    recognitionFocusCharacter: "",
    recognitionFocusPinyin: "",
    recognitionFocusAnswer: null,
    recognitionFocusFromResult: false,
    recognitionExitOpen: false,
    recognitionCharacterListOpen: false,
    recognitionCharacterListTab: "unknown",
    recognitionSources: RECOGNITION_SOURCES,
    recognitionSourcesOpen: false,
    pictureNamingIndex: 0,
    pictureNamingNumber: 1,
    pictureNamingTotal: ENGLISH_PICTURE_NAMING_BANK.length,
    pictureNamingProgressPercent: 10,
    pictureNamingItem: ENGLISH_PICTURE_NAMING_BANK[0],
    pictureNamingSummary: null,
    pictureNamingAnswers: [],
    pictureNamingWordListOpen: false,
    pictureNamingWordListTab: "unknown",
    pictureNamingKnownWords: [],
    pictureNamingUnknownWords: [],
    pictureNamingFocusOpen: false,
    pictureNamingFocusItem: null,
    pictureNamingFocusAnswer: null,
    pictureNamingFocusView: "word",
    englishWordTotal: ENGLISH_WORD_TOTAL,
    englishWordPacks: ENGLISH_WORD_PACKS.map((pack, index) => ({
      id: pack.id,
      title: pack.title,
      subtitle: pack.subtitle,
      order: index + 1,
      itemCount: pack.items.length,
      imageCount: pack.items.filter((item) => item.image).length
    })),
    englishWordPackCards: EMPTY_ENGLISH_WORD_PACK_CARDS,
    englishWordPackId: DEFAULT_ENGLISH_WORD_PACK_ID,
    englishWordPackTitle: getEnglishWordPack(DEFAULT_ENGLISH_WORD_PACK_ID).title,
    englishWordPackSubtitle: getEnglishWordPack(DEFAULT_ENGLISH_WORD_PACK_ID).subtitle,
    englishWordPackNumber: 1,
    englishWordPackOpen: false,
    englishAssessmentReferences: ENGLISH_ASSESSMENT_REFERENCES,
    englishAssessmentDesignOpen: false,
    englishPromptMode: "word",
    englishCardView: "word",
    pronunciationLoadingKey: "",
    pronunciationPlayingKey: "",
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
    if (ensureBackStackForBackButtonPage(options)) return;
    this.answers = Array(40).fill(null);
    this.recognitionSample = [];
    this.pictureNamingAttempts = [];
    this.englishWordPackMasteries = {};
    this.englishWordPackMasteryChildId = "";
    this.pronunciationAudioPaths = {};
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

  onHide() {
    this.saveActiveRecognitionProgress();
  },

  onUnload() {
    this.saveActiveRecognitionProgress();
    if (this.pronunciationAudioContext) this.pronunciationAudioContext.destroy();
  },

  getShareOptions() {
    if (this.data.stage === "catalog" && !this.data.subjectModalOpen) return CATALOG_SHARE_OPTIONS;
    if (this.data.selectedTestId === "character-recognition") return CHARACTER_RECOGNITION_SHARE_OPTIONS;
    if (this.data.selectedTestId === "english-picture-naming") return ENGLISH_PICTURE_NAMING_SHARE_OPTIONS;
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

  playEnglishWordPronunciation() {
    const item = this.data.pictureNamingItem;
    if (!item || typeof wx === "undefined" || typeof wx.createInnerAudioContext !== "function") return;
    return this.playFlashTestPronunciation({
      kind: "english-word",
      itemId: item.id,
      text: item.word
    });
  },

  playPictureNamingFocusPronunciation() {
    const item = this.data.pictureNamingFocusItem;
    if (!item || typeof wx === "undefined" || typeof wx.createInnerAudioContext !== "function") return;
    return this.playFlashTestPronunciation({
      kind: "english-word",
      itemId: item.id,
      text: item.word
    });
  },

  getActiveEnglishWordPack() {
    return getEnglishWordPack(this.data.englishWordPackId);
  },

  getActiveEnglishWordBank() {
    return this.getActiveEnglishWordPack().items;
  },

  playRecognitionCharacterPronunciation() {
    const character = String(this.data.recognitionFocusCharacter || "");
    if (!character) return;
    return this.playFlashTestPronunciation({
      kind: "chinese-character",
      character,
      text: character
    });
  },

  playFlashTestPronunciation(payload) {
    if (typeof wx === "undefined" || typeof wx.createInnerAudioContext !== "function") return;
    const text = String(payload.text || "");
    const key = `${payload.kind}:${text}`;
    const cachedPath = this.pronunciationAudioPaths && this.pronunciationAudioPaths[key];
    if (cachedPath) {
      this.playPronunciationFile(cachedPath, key);
      return;
    }
    if (this.data.pronunciationLoadingKey === key) return;
    this.setData({ pronunciationLoadingKey: key });
    const suffix = Array.from(text).map((character) => character.codePointAt(0).toString(16)).join("-");
    const filePath = wx.env && wx.env.USER_DATA_PATH
      ? `${wx.env.USER_DATA_PATH}/xf-pronunciation-${PRONUNCIATION_CACHE_VERSION}-${payload.kind}-${suffix}.mp3`
      : "";
    const fileSystem = filePath && typeof wx.getFileSystemManager === "function"
      ? wx.getFileSystemManager()
      : null;
    const existingFile = fileSystem && typeof fileSystem.access === "function"
      ? new Promise((resolve) => {
          fileSystem.access({
            path: filePath,
            success: () => resolve(filePath),
            fail: () => resolve("")
          });
        })
      : Promise.resolve("");
    return existingFile.then((cachedFilePath) => {
      if (cachedFilePath) return cachedFilePath;
      const pronunciationPath = "/api/flash-tests/pronunciation";
      const data = payload.kind === "english-word"
        ? { kind: payload.kind, itemId: payload.itemId }
        : { kind: payload.kind, character: payload.character };
      const loadPronunciation = (url) => new Promise((resolve, reject) => {
        wx.request({
          url,
          method: "POST",
          data,
          header: {
            "content-type": "application/json",
            accept: "audio/mpeg"
          },
          responseType: "arraybuffer",
          success(response) {
            const audioData = normalizePronunciationAudioData(response);
            if (response.statusCode >= 200 && response.statusCode < 300 && audioData && audioData.byteLength > 0) {
              resolve(audioData);
              return;
            }
            reject({
              statusCode: response.statusCode,
              message: "读音音频无效",
              url
            });
          },
          fail(error) {
            reject({ statusCode: 0, message: error.errMsg || "网络连接失败", url, error });
          }
        });
      });
      return loadPronunciation(`${DEFAULT_WEB_ORIGIN}${pronunciationPath}`).catch((error) => {
        const statusCode = Number(error && error.statusCode);
        const canUseLocalFallback = API_ORIGIN !== DEFAULT_WEB_ORIGIN
          && [0, 401, 502, 503].includes(statusCode);
        if (!canUseLocalFallback) throw error;
        return loadPronunciation(`${API_ORIGIN}${pronunciationPath}`);
      }).then((audioData) => {
        if (!audioData || !fileSystem || !filePath) {
          throw new Error("读音音频无效");
        }
        return new Promise((resolve, reject) => {
          fileSystem.writeFile({
            filePath,
            data: audioData,
            success: () => resolve(filePath),
            fail: reject
          });
        });
      });
    }).then((filePath) => {
      this.pronunciationAudioPaths = this.pronunciationAudioPaths || {};
      this.pronunciationAudioPaths[key] = filePath;
      this.setData({ pronunciationLoadingKey: "" });
      this.playPronunciationFile(filePath, key);
    }).catch((error) => {
      this.setData({ pronunciationLoadingKey: "", pronunciationPlayingKey: "" });
      const message = String(error && (error.message || error.data && error.data.message) || "");
      console.warn("[flash-test] pronunciation load failed", {
        statusCode: Number(error && error.statusCode) || 0,
        message,
        url: String(error && error.url || "")
      });
      if (typeof wx.showToast === "function") {
        wx.showToast({
          title: /尚未开通|未配置|resource not granted/i.test(message)
            ? "读音服务尚未开通"
            : "暂时无法读音，请重试",
          icon: "none"
        });
      }
    });
  },

  showPronunciationTroubleshooting() {
    if (typeof wx === "undefined" || typeof wx.showModal !== "function") return;
    wx.showModal({
      title: "没听到读音？",
      content: "如果页面显示“正在播放”但没有声音：\n1. 调高手机媒体音量\n2. 关闭静音和勿扰模式\n3. 检查声音是否连到蓝牙耳机\n4. 确认网络正常后再点一次听读音",
      showCancel: false,
      confirmText: "知道了",
      confirmColor: "#6c27d6"
    });
  },

  playPronunciationFile(filePath, key) {
    const previousAudio = this.pronunciationAudioContext;
    this.pronunciationAudioContext = null;
    if (previousAudio) previousAudio.destroy();
    const audio = wx.createInnerAudioContext();
    let playbackStarted = false;
    const beginPlayback = () => {
      if (playbackStarted || this.pronunciationAudioContext !== audio) return;
      playbackStarted = true;
      audio.play();
    };
    audio.obeyMuteSwitch = false;
    if (typeof audio.onCanplay === "function") audio.onCanplay(beginPlayback);
    const markPlaybackStarted = () => {
      if (this.pronunciationAudioContext !== audio) return;
      this.setData({ pronunciationPlayingKey: key });
    };
    if (typeof audio.onPlay === "function") audio.onPlay(markPlaybackStarted);
    audio.onEnded(() => {
      if (this.pronunciationAudioContext !== audio) return;
      this.activePronunciationKey = "";
      this.setData({ pronunciationPlayingKey: "" });
    });
    audio.onError((error) => {
      if (this.pronunciationAudioContext !== audio) return;
      console.warn("[flash-test] pronunciation playback failed", error);
      this.activePronunciationKey = "";
      if (this.pronunciationAudioPaths && this.pronunciationAudioPaths[key] === filePath) {
        delete this.pronunciationAudioPaths[key];
      }
      if (typeof wx.getFileSystemManager === "function") {
        const fileSystem = wx.getFileSystemManager();
        if (fileSystem && typeof fileSystem.unlink === "function") {
          fileSystem.unlink({ filePath, fail() {} });
        }
      }
      this.setData({ pronunciationPlayingKey: "" });
      if (typeof wx.showToast === "function") wx.showToast({ title: "播放失败，请检查静音和音量", icon: "none" });
    });
    this.pronunciationAudioContext = audio;
    this.activePronunciationKey = key;
    audio.src = filePath;
    beginPlayback();
    if (typeof audio.onPlay !== "function") markPlaybackStarted();
  },

  toggleEnglishCardView() {
    if (!this.data.pictureNamingItem || !this.data.pictureNamingItem.image) return;
    this.setData({
      englishCardView: this.data.englishCardView === "picture" ? "word" : "picture",
      message: ""
    });
  },

  handleEnglishPictureError(event) {
    const target = String(event.currentTarget.dataset.target || "card");
    const dataKey = target === "focus" ? "pictureNamingFocusItem" : "pictureNamingItem";
    const item = this.data[dataKey];
    const fallbackImage = String(item && item.fallbackImage || "");
    if (fallbackImage && item.image !== fallbackImage) {
      this.setData({ [`${dataKey}.image`]: fallbackImage });
      return;
    }
    if (typeof wx !== "undefined" && typeof wx.showToast === "function") {
      wx.showToast({ title: "图片加载失败，请检查网络", icon: "none" });
    }
  },

  markWordReadingKnown() {
    const item = this.data.pictureNamingItem;
    if (!item) return;
    this.recordPictureNamingAttempt({
      itemId: item.id,
      recognizedText: "",
      status: "matched"
    });
  },

  markWordReadingUnknown() {
    const item = this.data.pictureNamingItem;
    if (!item) return;
    this.recordPictureNamingAttempt({
      itemId: item.id,
      recognizedText: "",
      status: "skipped"
    });
  },

  recordPictureNamingAttempt(attempt) {
    const bank = this.getActiveEnglishWordBank();
    this.pictureNamingAttempts[this.data.pictureNamingIndex] = {
      itemId: attempt.itemId,
      recognizedText: attempt.recognizedText,
      status: attempt.status
    };
    const nextIndex = this.data.pictureNamingIndex + 1;
    if (nextIndex >= bank.length) {
      this.finishPictureNaming();
      return;
    }
    this.showPictureNamingItem(nextIndex);
  },

  showPictureNamingItem(index) {
    const bank = this.getActiveEnglishWordBank();
    const safeIndex = Math.max(0, Math.min(bank.length - 1, Number(index) || 0));
    this.setData({
      stage: "picture-naming",
      pictureNamingIndex: safeIndex,
      pictureNamingNumber: safeIndex + 1,
      pictureNamingTotal: bank.length,
      pictureNamingProgressPercent: Math.round(((safeIndex + 1) / bank.length) * 100),
      pictureNamingItem: bank[safeIndex],
      message: ""
    });
  },

  finishPictureNaming() {
    const pack = this.getActiveEnglishWordPack();
    const bank = pack.items;
    const summary = buildEnglishPictureNamingSummary(this.pictureNamingAttempts, bank.length);
    this.englishWordPackMasteries = {
      ...(this.englishWordPackMasteries || {}),
      [pack.id]: {
        englishWordPackId: pack.id,
        matchedCount: Number(summary.matchedCount) || 0,
        totalCount: Number(summary.totalCount) || bank.length
      }
    };
    this.answers = [];
    this.setData({
      stage: "result",
      resultType: "pictureNaming",
      pictureNamingSummary: summary,
      pictureNamingAnswers: this.pictureNamingAttempts.map((answer) => {
        const bankItem = bank.find((item) => item.id === answer.itemId);
        return { ...answer, targetWord: bankItem ? bankItem.word : "" };
      }),
      pictureNamingWordListOpen: false,
      pictureNamingWordListTab: "unknown",
      pictureNamingKnownWords: [],
      pictureNamingUnknownWords: [],
      pictureNamingFocusOpen: false,
      pictureNamingFocusItem: null,
      pictureNamingFocusAnswer: null,
      pictureNamingFocusView: "word",
      englishWordPackCards: this.buildEnglishWordPackCards(),
      englishAssessmentDesignOpen: false,
      analysisTitle: `认识 ${summary.matchedCount} 个，暂不认识 ${summary.totalCount - summary.matchedCount} 个`,
      analysisParagraphs: [
        `这反映孩子对${pack.title}词包 ${bank.length} 个书面单词的见词朗读情况。`,
        "可从暂不认识的单词开始复习，之后重新测试。"
      ],
      resultSaveState: "saving",
      resultSaveMessage: "正在保存到我的数据…",
      savedResultId: "",
      message: ""
    });
    this.persistAssessmentResult();
  },

  exitPictureNaming() {
    if (typeof wx === "undefined" || typeof wx.showModal !== "function") {
      this.setData({ stage: "catalog", message: "" });
      return;
    }
    wx.showModal({
      title: "退出本次测试？",
      content: "本轮尚未完成，退出后需要重新开始。",
      confirmText: "退出",
      cancelText: "继续测试",
      success: (result) => {
        if (result.confirm) this.setData({ stage: "catalog", message: "" });
      }
    });
  },

  goBack() {
    if (this.data.pictureNamingFocusOpen) {
      this.closePictureNamingResultWord();
      return;
    }
    if (this.data.recognitionFocusOpen) {
      this.closeRecognitionCharacterFocus();
      return;
    }
    if (this.data.recognitionExitOpen) {
      this.continueRecognitionAssessmentFromExit();
      return;
    }
    if (this.data.recognitionSourcesOpen) {
      this.closeRecognitionSources();
      return;
    }
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
      this.openRecognitionExit();
      return;
    }
    if (this.data.stage === "picture-naming") {
      this.exitPictureNaming();
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
    const lastMode = String(typeof wx !== "undefined" && typeof wx.getStorageSync === "function"
      ? wx.getStorageSync(LAST_ASSESSMENT_MODE_KEY) || ""
      : "");
    const defaultMode = test.childOnly ? "child" : (["self", "child"].includes(lastMode) ? lastMode : "");
    const isLoggedIn = Boolean(getToken());
    const shouldOpenDefaultSubject = isLoggedIn && Boolean(defaultMode) && !test.childOnly;
    this.forceNewAssessment = false;
    this.forceSubjectReselect = false;
    this.pendingChildAssessment = null;
    this.setData({
      selectedTestId: test.id,
      selectedTestTitle: test.title,
      selectedTestChildOnly: Boolean(test.childOnly),
      englishPromptMode: "word",
      englishCardView: "word",
      subjectModalOpen: !test.childOnly && !shouldOpenDefaultSubject,
      youngChildWarningOpen: false,
      youngChildName: "",
      youngChildGrade: "",
      message: ""
    });
    if (test.childOnly) {
      if (!isLoggedIn) return;
      return this.resolveChildOnlyAssessment();
    }
    if (!shouldOpenDefaultSubject) return;
    if (defaultMode === "child") return this.openDefaultChildAssessment();
    return this.openSavedResultOrStart("self");
  },

  closeSubjectModal() {
    this.forceNewAssessment = false;
    this.forceSubjectReselect = false;
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
      if (this.forceSubjectReselect) {
        this.forceSubjectReselect = false;
        this.prepareChildAssessment();
        return Promise.resolve();
      }
      if (this.data.selectedTestChildOnly) return this.resolveChildOnlyAssessment();
      return this.openDefaultChildAssessment();
    }
    this.forceSubjectReselect = false;
    return this.openSavedResultOrStart("self");
  },

  authorizeChildOnlyAssessment(event) {
    const testId = String(event.currentTarget.dataset.id || "");
    if (this.data.selectedTestId !== testId) this.openAssessment(event);
    return this.authorizeAssessment(event);
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

  openDefaultChildAssessment() {
    const children = this.loadChildChoices();
    const lastChildId = String(wx.getStorageSync(LAST_CHILD_ID_KEY) || "");
    const child = children.find((item) => item.id === lastChildId) || children[0];
    if (!child) {
      this.prepareChildAssessment();
      return Promise.resolve(false);
    }
    return this.openSavedResultOrStart("child", child);
  },

  resolveChildOnlyAssessment() {
    const children = this.loadChildChoices();
    if (children.length !== 1) {
      this.prepareChildAssessment();
      return Promise.resolve(false);
    }
    return this.openSavedResultOrStart("child", children[0]);
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
    this.forceSubjectReselect = false;
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
    const englishPromptQuery = assessmentId === "english-picture-naming"
      ? "&englishPromptMode=word"
      : "";
    const englishWordPackQuery = assessmentId === "english-picture-naming"
      ? `&englishWordPackId=${encodeURIComponent(this.data.englishWordPackId || DEFAULT_ENGLISH_WORD_PACK_ID)}`
      : "";
    return request({
      url: `/api/flash-tests/results?assessmentId=${assessmentId}&mode=${mode}${childQuery}${englishPromptQuery}${englishWordPackQuery}&limit=1`,
      timeout: assessmentId === "english-picture-naming" ? 3000 : undefined
    }).then((payload) => {
      const results = payload && Array.isArray(payload.results) ? payload.results : [];
      if (assessmentId === "english-picture-naming") {
        if (this.englishWordPackMasteryChildId !== childId) this.englishWordPackMasteries = {};
        this.englishWordPackMasteryChildId = childId;
        this.englishWordPackMasteries = payload && payload.englishWordPackResults || {};
        this.setData({ englishWordPackCards: this.buildEnglishWordPackCards() });
      }
      const result = results[0] || null;
      if (!result) return null;
      const matchesSubject = result.assessmentId === assessmentId
        && result.mode === mode
        && (mode !== "child" || String(result.childId || "") === childId);
      if (!matchesSubject) throw new Error("历史结果读取异常，请稍后重试");
      if (assessmentId === "english-picture-naming" && (
        result.englishPromptMode !== "word"
        || String(result.englishWordPackId || DEFAULT_ENGLISH_WORD_PACK_ID) !== this.data.englishWordPackId
      )) {
        return null;
      }
      if (assessmentId === "character-recognition"
        && ![
          BASE_CHARACTER_RECOGNITION_VERSION,
          LEGACY_CHARACTER_RECOGNITION_VERSION,
          CHARACTER_RECOGNITION_VERSION
        ].includes(result.assessmentVersion)) {
        return null;
      }
      if (assessmentId === "character-recognition") {
        result.recognitionGroups = payload && payload.recognitionGroups || {};
      }
      return result;
    });
  },

  buildRecognitionGroupCards(childId = this.data.selectedChildId) {
    return [1, 2].map((recognitionGroup) => buildRecognitionGroupCard(
      recognitionGroup,
      this.recognitionGroupMasteries && this.recognitionGroupMasteries[recognitionGroup],
      this.loadRecognitionProgress(childId, recognitionGroup)
    ));
  },

  buildEnglishWordPackCards() {
    return buildEnglishWordPackCards(this.englishWordPackMasteries || {});
  },

  showSavedResult(result, child = null) {
    const mode = result && result.mode === "child" ? "child" : "self";
    const assessmentId = String(result && result.assessmentId || "");
    const selectedChildId = mode === "child" ? String(result.childId || (child && child.id) || "") : "";
    const selectedChildName = mode === "child" ? String(result.childName || (child && child.name) || "") : "";
    if (assessmentId === "english-picture-naming") {
      const pack = getEnglishWordPack(result.englishWordPackId || DEFAULT_ENGLISH_WORD_PACK_ID);
      const packNumber = ENGLISH_WORD_PACKS.findIndex((item) => item.id === pack.id) + 1;
      const pictureNamingAnswers = Array.isArray(result.pictureNamingAnswers) ? result.pictureNamingAnswers : [];
      const pictureNamingSummary = result.pictureNamingSummary;
      if (!pictureNamingSummary || pictureNamingAnswers.length !== pack.items.length) {
        throw new Error("历史结果数据异常，请稍后重试");
      }
      this.pictureNamingAttempts = pictureNamingAnswers.map((item) => ({
        itemId: item.itemId,
        recognizedText: item.recognizedText,
        status: item.status
      }));
      this.answers = [];
      this.scores = null;
      this.forceNewAssessment = false;
      this.setData({
        stage: "result",
        resultType: "pictureNaming",
        selectedTestId: assessmentId,
        selectedTestTitle: "英文单词",
        selectedTestChildOnly: true,
        subjectModalOpen: false,
        settingsPanelOpen: false,
        mode: "child",
        modeLabel: `为${selectedChildName}测`,
        selectedChildId,
        selectedChildName,
        englishPromptMode: "word",
        englishCardView: "word",
        englishWordPackId: pack.id,
        englishWordPackTitle: pack.title,
        englishWordPackSubtitle: pack.subtitle,
        englishWordPackNumber: packNumber,
        englishWordPackOpen: false,
        englishWordPackCards: this.buildEnglishWordPackCards(),
        pictureNamingTotal: pack.items.length,
        pictureNamingItem: pack.items[0],
        pictureNamingSummary,
        pictureNamingAnswers,
        pictureNamingWordListOpen: false,
        pictureNamingWordListTab: "unknown",
        pictureNamingKnownWords: [],
        pictureNamingUnknownWords: [],
        pictureNamingFocusOpen: false,
        pictureNamingFocusItem: null,
        pictureNamingFocusAnswer: null,
        pictureNamingFocusView: "word",
        englishAssessmentDesignOpen: false,
        analysisTitle: `认识 ${pictureNamingSummary.matchedCount} 个，暂不认识 ${pictureNamingSummary.totalCount - pictureNamingSummary.matchedCount} 个`,
        analysisParagraphs: [
          `这反映孩子对${pack.title}词包 ${pack.items.length} 个书面单词的见词朗读情况。`,
          "可从暂不认识的单词开始复习，之后重新测试。"
        ],
        resultSaveState: "saved",
        resultSaveMessage: "已保存到我的数据",
        savedResultId: String(result.id || ""),
        message: ""
      });
      return;
    }
    if (assessmentId === "character-recognition") {
      const savedSummary = result && result.recognitionSummary;
      const savedAnswers = result && Array.isArray(result.answers) ? result.answers.map(Number) : [];
      const savedSample = result && Array.isArray(result.sampleCharacters) ? result.sampleCharacters.map(String) : [];
      const summary = savedSummary && {
        ...savedSummary,
        cumulativeRecognizedCount: Number(savedSummary.cumulativeRecognizedCount ?? savedSummary.recognizedCount),
        cumulativeSampledCount: Number(savedSummary.cumulativeSampledCount ?? savedSummary.sampledCount),
        completedRounds: Number(savedSummary.completedRounds || 1)
      };
      const characterGroups = buildRecognitionCharacterGroups(savedSample, savedAnswers);
      if (!summary
        || ![BASE_CHARACTER_SAMPLE_SIZE, CHARACTER_SAMPLE_SIZE].includes(Number(summary.sampledCount))
        || savedSample.length !== Number(summary.sampledCount)
        || characterGroups.recognitionKnownCharacters.length + characterGroups.recognitionUnknownCharacters.length !== savedSample.length) {
        throw new Error("历史结果数据异常，请稍后重试");
      }
      const analysis = buildCharacterRecognitionAnalysis(summary, selectedChildName || "孩子");
      const recognitionGroupNumber = savedSample.length === CHARACTER_SAMPLE_SIZE
        ? 2
        : Number(result.recognitionGroup) === 2 ? 2 : 1;
      const recognitionIsLegacyCumulative = savedSample.length === CHARACTER_SAMPLE_SIZE;
      const serverMasteries = result && result.recognitionGroups || {};
      this.recognitionMasteryChildId = selectedChildId;
      this.recognitionGroupMasteries = {
        1: serverMasteries[1] || serverMasteries["1"] || buildRecognitionMasteryFromResult(result, 1),
        2: serverMasteries[2] || serverMasteries["2"] || buildRecognitionMasteryFromResult(result, 2)
      };
      this.answers = savedAnswers;
      this.recognitionSample = savedSample;
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
        recognitionSampleSize: savedSample.length,
        recognitionPageCount: savedSample.length / 20,
        recognitionIsAdvanced: recognitionGroupNumber === 2,
        recognitionIsLegacyCumulative,
        recognitionGroupNumber,
        recognitionGroupCards: this.buildRecognitionGroupCards(selectedChildId),
        ...characterGroups,
        recognitionCharacterListOpen: false,
        recognitionCharacterListTab: "unknown",
        recognitionFocusOpen: false,
        recognitionFocusFromResult: false,
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
    if (typeof wx !== "undefined" && typeof wx.setStorageSync === "function") {
      wx.setStorageSync(LAST_ASSESSMENT_MODE_KEY, mode);
    }
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
        const historyStatusCode = Number(error && error.statusCode) || 0;
        const unsupportedRecognitionHistory = this.data.selectedTestId === "character-recognition"
          && historyStatusCode === 400
          && String(error && error.message || "") === "暂不支持该测试";
        const unavailableEnglishHistory = this.data.selectedTestId === "english-picture-naming"
          && (historyStatusCode === 0 || historyStatusCode >= 500);
        if (unsupportedRecognitionHistory || unavailableEnglishHistory) {
          this.beginNewAssessment(mode, child);
          if (unavailableEnglishHistory) {
            wx.showToast({
              title: "上次结果暂时无法读取，已开始新测试",
              icon: "none"
            });
          }
          return false;
        }
        this.setData({
          isLoggedIn: Boolean(getToken())
        });
        if (mode !== "child") {
          this.setData({ subjectModalOpen: true });
        }
        wx.showToast({
          title: String(error && error.message || "读取上次结果失败，请重试"),
          icon: "none"
        });
        return false;
      });
  },

  shouldWarnForYoungChild(child) {
    if (["character-recognition", "english-picture-naming"].includes(this.data.selectedTestId)) return false;
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
    if (this.data.selectedTestId === "english-picture-naming") {
      const pack = this.getActiveEnglishWordPack();
      this.answers = [];
      this.pictureNamingAttempts = [];
      this.setData({
        resultType: "pictureNaming",
        mode: "child",
        modeLabel: `为${selectedChildName}测`,
        selectedChildId,
        selectedChildName,
        englishPromptMode: "word",
        englishCardView: "word",
        englishWordPackTitle: pack.title,
        englishWordPackSubtitle: pack.subtitle,
        englishWordPackNumber: ENGLISH_WORD_PACKS.findIndex((item) => item.id === pack.id) + 1,
        englishWordPackOpen: false,
        pictureNamingTotal: pack.items.length,
        pictureNamingItem: pack.items[0],
        pictureNamingSummary: null,
        pictureNamingAnswers: [],
        pictureNamingWordListOpen: false,
        pictureNamingWordListTab: "unknown",
        pictureNamingKnownWords: [],
        pictureNamingUnknownWords: [],
        pictureNamingFocusOpen: false,
        pictureNamingFocusItem: null,
        pictureNamingFocusAnswer: null,
        pictureNamingFocusView: "word",
        englishAssessmentDesignOpen: false,
        resultSaveState: "idle",
        resultSaveMessage: "",
        message: ""
      });
      this.showPictureNamingItem(0);
      return;
    }
    if (this.data.selectedTestId === "character-recognition") {
      if (this.recognitionMasteryChildId !== selectedChildId) this.recognitionGroupMasteries = {};
      this.recognitionMasteryChildId = selectedChildId;
      const progress = this.loadRecognitionProgress(selectedChildId, 1);
      this.recognitionSample = BASE_CHARACTER_BANK.slice();
      this.answers = progress ? progress.answers : Array(BASE_CHARACTER_SAMPLE_SIZE).fill(null);
      this.setData({
        stage: "recognition",
        resultType: "recognition",
        mode: "child",
        modeLabel: `为${selectedChildName}测`,
        selectedChildId,
        selectedChildName,
        recognitionSummary: null,
        recognitionGroupNumber: 1,
        recognitionSampleSize: this.answers.length,
        recognitionPageCount: this.answers.length / 20,
        recognitionIsAdvanced: false,
        recognitionIsLegacyCumulative: false,
        recognitionKnownCharacters: [],
        recognitionUnknownCharacters: [],
        recognitionFocusOpen: false,
        recognitionFocusIndex: -1,
        recognitionFocusCharacter: "",
        recognitionFocusPinyin: "",
        recognitionFocusAnswer: null,
        recognitionFocusFromResult: false,
        recognitionExitOpen: false,
        recognitionCharacterListOpen: false,
        recognitionCharacterListTab: "unknown",
        resultSaveState: "idle",
        resultSaveMessage: "",
        message: ""
      });
      this.showRecognitionPage(progress ? progress.pageIndex : 0);
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

  getRecognitionProgressKey(childId = this.data.selectedChildId, recognitionGroup = this.data.recognitionGroupNumber || 1) {
    return `${RECOGNITION_PROGRESS_KEY_PREFIX}${String(childId || "")}_${Number(recognitionGroup) === 2 ? 2 : 1}`;
  },

  loadRecognitionProgress(childId, recognitionGroup = 1) {
    if (typeof wx === "undefined" || typeof wx.getStorageSync !== "function") return null;
    const group = Number(recognitionGroup) === 2 ? 2 : 1;
    let saved = wx.getStorageSync(this.getRecognitionProgressKey(childId, group));
    if (!saved && group === 1) {
      saved = wx.getStorageSync(`${LEGACY_RECOGNITION_PROGRESS_KEY_PREFIX}${String(childId || "")}`);
      if (saved && Array.isArray(saved.answers) && saved.answers.length === CHARACTER_SAMPLE_SIZE) saved = null;
    }
    if (!saved || ![
      BASE_CHARACTER_RECOGNITION_VERSION,
      LEGACY_CHARACTER_RECOGNITION_VERSION,
      CHARACTER_RECOGNITION_VERSION
    ].includes(saved.version)) return null;
    if (!Array.isArray(saved.answers) || saved.answers.length !== BASE_CHARACTER_SAMPLE_SIZE) return null;
    if (saved.answers.some((answer) => answer !== null && answer !== 0 && answer !== 1)) return null;
    return {
      answers: saved.answers.slice(),
      pageIndex: Math.max(0, Math.min((saved.answers.length / 20) - 1, Number(saved.pageIndex) || 0))
    };
  },

  saveRecognitionProgress(pageIndex) {
    wx.setStorageSync(this.getRecognitionProgressKey(), {
      version: CHARACTER_RECOGNITION_VERSION,
      recognitionGroup: this.data.recognitionGroupNumber,
      pageIndex,
      answers: this.answers.slice()
    });
  },

  clearRecognitionProgress(recognitionGroup = this.data.recognitionGroupNumber || 1) {
    if (typeof wx.removeStorageSync === "function") {
      wx.removeStorageSync(this.getRecognitionProgressKey(this.data.selectedChildId, recognitionGroup));
    }
  },

  saveActiveRecognitionProgress() {
    if (this.data.stage !== "recognition" || !this.data.selectedChildId || !this.data.recognitionPage) return;
    this.saveRecognitionProgress(this.data.recognitionPage.pageIndex);
  },

  showRecognitionPage(index) {
    const recognitionGroupNumber = Number(this.data.recognitionGroupNumber) === 2 ? 2 : 1;
    const page = buildCharacterPage(index, this.answers, recognitionGroupNumber);
    const completedCount = this.answers.filter((answer) => answer === 0 || answer === 1).length;
    const unknownCount = this.answers.filter((answer) => answer === 0).length;
    this.setData({
      stage: "recognition",
      recognitionIndex: page.pageIndex,
      recognitionPage: page,
      recognitionPageCharacters: page.characters,
      recognitionPageNumber: page.pageNumber,
      recognitionPageCount: page.pageCount,
      recognitionGroupNumber,
      recognitionGroupPageNumber: page.pageNumber,
      recognitionGroupPageCount: page.pageCount,
      recognitionSampleSize: this.answers.length,
      recognitionIsAdvanced: recognitionGroupNumber === 2,
      recognitionCompletedCount: completedCount,
      recognitionUnknownCount: unknownCount,
      recognitionStageLabel: page.stage.label,
      recognitionStageAudience: page.stage.audience,
      recognitionProgressPercent: Math.round((completedCount / this.answers.length) * 100),
      message: ""
    });
  },

  openRecognitionCharacterFocus(event) {
    const answerIndex = Number(event.currentTarget.dataset.index);
    const page = this.data.recognitionPage;
    if (!page || !Number.isInteger(answerIndex) || answerIndex < page.start || answerIndex >= page.end) return;
    const character = this.recognitionSample[answerIndex] || "";
    this.setData({
      recognitionFocusOpen: true,
      recognitionFocusIndex: answerIndex,
      recognitionFocusCharacter: character,
      recognitionFocusPinyin: getCharacterPinyin(character),
      recognitionFocusAnswer: this.answers[answerIndex],
      recognitionFocusFromResult: false
    });
  },

  openResultRecognitionCharacter(event) {
    if (this.data.resultType !== "recognition") return;
    const character = String(event.currentTarget.dataset.character || "");
    const answerIndex = this.recognitionSample.indexOf(character);
    if (!character || answerIndex < 0 || ![0, 1].includes(this.answers[answerIndex])) return;
    this.setData({
      recognitionFocusOpen: true,
      recognitionFocusIndex: answerIndex,
      recognitionFocusCharacter: character,
      recognitionFocusPinyin: getCharacterPinyin(character),
      recognitionFocusAnswer: this.answers[answerIndex],
      recognitionFocusFromResult: true
    });
  },

  closeRecognitionCharacterFocus() {
    this.setData({
      recognitionFocusOpen: false,
      recognitionFocusIndex: -1,
      recognitionFocusCharacter: "",
      recognitionFocusPinyin: "",
      recognitionFocusAnswer: null,
      recognitionFocusFromResult: false
    });
  },

  openRecognitionExit() {
    this.saveActiveRecognitionProgress();
    this.setData({ recognitionExitOpen: true });
  },

  continueRecognitionAssessmentFromExit() {
    this.setData({ recognitionExitOpen: false });
  },

  saveRecognitionAndExit() {
    this.saveActiveRecognitionProgress();
    this.setData({
      stage: "catalog",
      recognitionExitOpen: false,
      subjectModalOpen: false,
      message: ""
    });
  },

  markFocusedRecognitionCharacter(event) {
    const answerIndex = Number(this.data.recognitionFocusIndex);
    const answer = Number(event.currentTarget.dataset.answer);
    const page = this.data.recognitionPage;
    if (answer !== 0 && answer !== 1) return;
    if (this.data.recognitionFocusFromResult) {
      if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= this.answers.length) return;
      this.answers[answerIndex] = answer;
      const summary = buildCharacterRecognitionSummary(this.answers, this.data.recognitionGroupNumber);
      const analysis = buildCharacterRecognitionAnalysis(summary, this.data.selectedChildName || "孩子");
      this.setData({
        recognitionSummary: summary,
        ...buildRecognitionCharacterGroups(this.recognitionSample, this.answers),
        analysisTitle: analysis.title,
        analysisParagraphs: analysis.paragraphs,
        resultSaveState: "saving",
        resultSaveMessage: "正在保存校准结果…"
      });
      this.closeRecognitionCharacterFocus();
      this.persistAssessmentResult();
      return;
    }
    if (!page || !Number.isInteger(answerIndex) || answerIndex < page.start || answerIndex >= page.end) return;
    this.answers[answerIndex] = answer;
    this.saveRecognitionProgress(page.pageIndex);
    this.closeRecognitionCharacterFocus();
    this.showRecognitionPage(page.pageIndex);
  },

  confirmRecognitionPage() {
    const page = this.data.recognitionPage;
    if (!page) return;
    for (let index = page.start; index < page.end; index += 1) {
      if (this.answers[index] === null) this.answers[index] = 1;
    }
    const nextPageIndex = page.pageIndex + 1;
    if (nextPageIndex < page.pageCount) {
      this.saveRecognitionProgress(nextPageIndex);
      this.showRecognitionPage(nextPageIndex);
      return;
    }
    this.saveRecognitionProgress(page.pageIndex);
    this.finishCharacterRecognition();
  },

  previousRecognitionPage() {
    if (this.data.recognitionGroupPageNumber === 1) return;
    const previousPageIndex = this.data.recognitionIndex - 1;
    this.saveRecognitionProgress(previousPageIndex);
    this.showRecognitionPage(previousPageIndex);
  },

  reselectAssessmentSubject() {
    if (this.data.stage === "recognition") this.saveActiveRecognitionProgress();
    this.setData({
      recognitionFocusOpen: false,
      recognitionFocusFromResult: false,
      recognitionExitOpen: false,
      recognitionCharacterListOpen: false,
      pictureNamingWordListOpen: false,
      pictureNamingFocusOpen: false,
      englishAssessmentDesignOpen: false,
      recognitionSourcesOpen: false,
      message: ""
    });
    this.forceSubjectReselect = true;
    if (this.data.selectedTestChildOnly) {
      this.prepareChildAssessment();
      return;
    }
    this.setData({ stage: "catalog", subjectModalOpen: true });
  },

  finishCharacterRecognition() {
    try {
      const summary = buildCharacterRecognitionSummary(this.answers, this.data.recognitionGroupNumber);
      const analysis = buildCharacterRecognitionAnalysis(summary, this.data.selectedChildName || "孩子");
      const characterGroups = buildRecognitionCharacterGroups(this.recognitionSample, this.answers);
      this.setData({
        stage: "result",
        resultType: "recognition",
        recognitionSummary: summary,
        recognitionIsLegacyCumulative: this.answers.length === CHARACTER_SAMPLE_SIZE,
        ...characterGroups,
        recognitionCharacterListOpen: false,
        recognitionCharacterListTab: "unknown",
        analysisTitle: analysis.title,
        analysisParagraphs: analysis.paragraphs,
        resultSaveState: "saving",
        resultSaveMessage: "正在保存到我的数据…",
        savedResultId: "",
        message: ""
      });
      this.persistAssessmentResult();
    } catch (error) {
      this.setData({ message: error.message || `请先完成全部 ${this.answers.length} 个字` });
    }
  },

  openRecognitionCharacterList() {
    if (this.data.resultType !== "recognition") return;
    const total = this.data.recognitionKnownCharacters.length + this.data.recognitionUnknownCharacters.length;
    if (total <= 0) return;
    this.setData({
      recognitionCharacterListOpen: true,
      recognitionCharacterListTab: "unknown"
    });
  },

  closeRecognitionCharacterList() {
    this.setData({ recognitionCharacterListOpen: false });
  },

  switchRecognitionCharacterListTab(event) {
    const tab = String(event.currentTarget.dataset.tab || "");
    if (tab !== "unknown" && tab !== "known") return;
    this.setData({ recognitionCharacterListTab: tab });
  },

  openPictureNamingWordList() {
    if (this.data.resultType !== "pictureNaming") return;
    const answers = Array.isArray(this.data.pictureNamingAnswers) ? this.data.pictureNamingAnswers : [];
    const bank = this.getActiveEnglishWordBank();
    const wordsForStatus = (isKnown) => answers
      .filter((item) => (item.status === "matched") === isKnown)
      .map((item) => {
        const targetWord = String(item.targetWord || "").trim();
        if (targetWord) return targetWord;
        return bank.find((bankItem) => bankItem.id === item.itemId)?.word || "";
      })
      .filter(Boolean);
    const pictureNamingKnownWords = wordsForStatus(true);
    const pictureNamingUnknownWords = wordsForStatus(false);
    if (pictureNamingKnownWords.length + pictureNamingUnknownWords.length <= 0) return;
    this.setData({
      pictureNamingWordListOpen: true,
      pictureNamingWordListTab: "unknown",
      pictureNamingKnownWords,
      pictureNamingUnknownWords
    });
  },

  closePictureNamingWordList() {
    this.setData({ pictureNamingWordListOpen: false });
  },

  switchPictureNamingWordListTab(event) {
    const tab = String(event.currentTarget.dataset.tab || "");
    if (tab !== "unknown" && tab !== "known") return;
    this.setData({ pictureNamingWordListTab: tab });
  },

  openPictureNamingResultWord(event) {
    if (this.data.resultType !== "pictureNaming") return;
    const word = String(event.currentTarget.dataset.word || "");
    const item = this.getActiveEnglishWordBank().find((bankItem) => bankItem.word === word);
    const attempt = item && this.pictureNamingAttempts.find((answer) => answer.itemId === item.id);
    if (!item || !attempt) return;
    this.setData({
      pictureNamingFocusOpen: true,
      pictureNamingFocusItem: item,
      pictureNamingFocusAnswer: attempt.status === "matched" ? 1 : 0,
      pictureNamingFocusView: "word"
    });
  },

  closePictureNamingResultWord() {
    this.setData({
      pictureNamingFocusOpen: false,
      pictureNamingFocusItem: null,
      pictureNamingFocusAnswer: null,
      pictureNamingFocusView: "word"
    });
  },

  togglePictureNamingFocusView() {
    const item = this.data.pictureNamingFocusItem;
    if (!item || !item.image) return;
    this.setData({
      pictureNamingFocusView: this.data.pictureNamingFocusView === "picture" ? "word" : "picture"
    });
  },

  markFocusedPictureNamingWord(event) {
    const item = this.data.pictureNamingFocusItem;
    const answer = Number(event.currentTarget.dataset.answer);
    const bank = this.getActiveEnglishWordBank();
    const attemptIndex = item && this.pictureNamingAttempts.findIndex((attempt) => attempt.itemId === item.id);
    if (!item || attemptIndex < 0 || (answer !== 0 && answer !== 1)) return;
    this.pictureNamingAttempts[attemptIndex] = {
      ...this.pictureNamingAttempts[attemptIndex],
      status: answer === 1 ? "matched" : "skipped"
    };
    const summary = buildEnglishPictureNamingSummary(this.pictureNamingAttempts, bank.length);
    const pictureNamingAnswers = this.pictureNamingAttempts.map((attempt) => ({
      ...attempt,
      targetWord: bank.find((bankItem) => bankItem.id === attempt.itemId)?.word || ""
    }));
    const pictureNamingKnownWords = pictureNamingAnswers
      .filter((attempt) => attempt.status === "matched")
      .map((attempt) => attempt.targetWord);
    const pictureNamingUnknownWords = pictureNamingAnswers
      .filter((attempt) => attempt.status !== "matched")
      .map((attempt) => attempt.targetWord);
    this.englishWordPackMasteries = {
      ...(this.englishWordPackMasteries || {}),
      [this.data.englishWordPackId]: {
        englishWordPackId: this.data.englishWordPackId,
        matchedCount: Number(summary.matchedCount) || 0,
        totalCount: Number(summary.totalCount) || bank.length
      }
    };
    this.setData({
      pictureNamingSummary: summary,
      pictureNamingAnswers,
      pictureNamingKnownWords,
      pictureNamingUnknownWords,
      englishWordPackCards: this.buildEnglishWordPackCards(),
      analysisTitle: `认识 ${summary.matchedCount} 个，暂不认识 ${summary.totalCount - summary.matchedCount} 个`,
      analysisParagraphs: [
        `这反映孩子对${this.data.englishWordPackTitle}词包 ${bank.length} 个书面单词的见词朗读情况。`,
        "可从暂不认识的单词开始复习，之后重新测试。"
      ],
      resultSaveState: "saving",
      resultSaveMessage: "正在保存校准结果…"
    });
    this.closePictureNamingResultWord();
    this.persistAssessmentResult();
  },

  openEnglishWordPackDrawer() {
    if (this.data.selectedTestId !== "english-picture-naming" && this.data.resultType !== "pictureNaming") return;
    this.setData({ englishWordPackOpen: true });
  },

  closeEnglishWordPackDrawer() {
    this.setData({ englishWordPackOpen: false });
  },

  selectEnglishWordPack(event) {
    const packId = String(event.currentTarget.dataset.id || "");
    const pack = ENGLISH_WORD_PACKS.find((item) => item.id === packId);
    if (!pack) return;
    if (pack.id === this.data.englishWordPackId) {
      this.closeEnglishWordPackDrawer();
      return;
    }
    const activatePack = () => {
      this.pictureNamingAttempts = [];
      this.forceNewAssessment = false;
      this.setData({
        englishWordPackId: pack.id,
        englishWordPackTitle: pack.title,
        englishWordPackSubtitle: pack.subtitle,
        englishWordPackNumber: ENGLISH_WORD_PACKS.findIndex((item) => item.id === pack.id) + 1,
        englishWordPackOpen: false,
        englishCardView: "word",
        pictureNamingIndex: 0,
        pictureNamingNumber: 1,
        pictureNamingTotal: pack.items.length,
        pictureNamingProgressPercent: Math.round(100 / pack.items.length),
        pictureNamingItem: pack.items[0],
        pictureNamingSummary: null,
        pictureNamingAnswers: [],
        pictureNamingWordListOpen: false,
        message: ""
      });
      const child = this.data.selectedChildId
        ? { id: this.data.selectedChildId, name: this.data.selectedChildName }
        : null;
      if (child) return this.openSavedResultOrStart("child", child);
      return this.resolveChildOnlyAssessment();
    };
    const hasUnfinishedAnswers = this.data.stage === "picture-naming"
      && this.pictureNamingAttempts.some(Boolean);
    if (!hasUnfinishedAnswers || typeof wx === "undefined" || typeof wx.showModal !== "function") {
      return activatePack();
    }
    wx.showModal({
      title: `切换到${pack.title}词包？`,
      content: "当前未完成的判断不会保存。",
      confirmText: "切换",
      cancelText: "继续测试",
      success: (result) => {
        if (result.confirm) activatePack();
      }
    });
  },

  openEnglishWordPackResult(event) {
    if (this.data.resultType !== "pictureNaming") return;
    const packId = String(event && event.currentTarget && event.currentTarget.dataset.id || "");
    const pack = ENGLISH_WORD_PACKS.find((item) => item.id === packId);
    if (!pack) return;
    if (!this.data.selectedChildId) {
      this.setData({ message: "孩子档案信息缺失，请重新选择" });
      return;
    }
    this.setData({
      englishWordPackId: pack.id,
      englishWordPackTitle: pack.title,
      englishWordPackSubtitle: pack.subtitle,
      englishWordPackNumber: ENGLISH_WORD_PACKS.findIndex((item) => item.id === pack.id) + 1,
      englishWordPackOpen: false
    });
    return this.restartAssessment();
  },

  openEnglishAssessmentDesign() {
    if (this.data.selectedTestId !== "english-picture-naming" && this.data.resultType !== "pictureNaming") return;
    this.setData({ englishAssessmentDesignOpen: true });
  },

  closeEnglishAssessmentDesign() {
    this.setData({ englishAssessmentDesignOpen: false });
  },

  copyEnglishAssessmentReference(event) {
    const referenceId = String(event.currentTarget.dataset.id || "");
    const reference = ENGLISH_ASSESSMENT_REFERENCES.find((item) => item.id === referenceId);
    if (!reference || typeof wx === "undefined" || typeof wx.setClipboardData !== "function") return;
    wx.setClipboardData({ data: reference.url });
  },

  openRecognitionSources() {
    if (this.data.selectedTestId !== "character-recognition" && this.data.resultType !== "recognition") return;
    this.setData({ recognitionSourcesOpen: true });
  },

  closeRecognitionSources() {
    this.setData({ recognitionSourcesOpen: false });
  },

  copyRecognitionSource(event) {
    const sourceId = String(event.currentTarget.dataset.id || "");
    const source = RECOGNITION_SOURCES.find((item) => item.id === sourceId);
    if (!source || typeof wx === "undefined" || typeof wx.setClipboardData !== "function") return;
    wx.setClipboardData({ data: source.url });
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
    if (this.data.dimensionIndex === 0 && this.data.currentQuestionIndex === 0) return;
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
    if (this._resultSavePromise) {
      this._resultSaveQueued = true;
      return this._resultSavePromise;
    }
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
          ? (this.answers.length === CHARACTER_SAMPLE_SIZE
            ? LEGACY_CHARACTER_RECOGNITION_VERSION
            : CHARACTER_RECOGNITION_VERSION)
          : assessmentId === "english-picture-naming"
            ? ENGLISH_PICTURE_NAMING_VERSION
          : EIGHT_TALENTS_VERSION,
        mode: this.data.mode,
        childId: this.data.mode === "child" ? this.data.selectedChildId : "",
        englishPromptMode: assessmentId === "english-picture-naming" ? "word" : undefined,
        englishWordPackId: assessmentId === "english-picture-naming" ? this.data.englishWordPackId : undefined,
        recognitionGroup: assessmentId === "character-recognition" ? this.data.recognitionGroupNumber : undefined,
        answers: this.answers.slice(),
        sampleCharacters: assessmentId === "character-recognition" ? this.recognitionSample.slice() : undefined,
        pictureNamingAnswers: assessmentId === "english-picture-naming" ? this.pictureNamingAttempts.slice() : undefined
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
          this.clearRecognitionProgress();
          this.recognitionGroupMasteries = {
            ...(this.recognitionGroupMasteries || {}),
            [this.data.recognitionGroupNumber]: buildRecognitionMasteryFromResult(result, this.data.recognitionGroupNumber)
          };
          resultData.recognitionSummary = result.recognitionSummary;
          resultData.recognitionGroupCards = this.buildRecognitionGroupCards(this.data.selectedChildId);
          Object.assign(resultData, buildRecognitionCharacterGroups(
            Array.isArray(result.sampleCharacters) ? result.sampleCharacters : this.recognitionSample,
            Array.isArray(result.answers) ? result.answers : this.answers
          ));
          const analysis = buildCharacterRecognitionAnalysis(
            result.recognitionSummary,
            this.data.selectedChildName || "孩子"
          );
          resultData.analysisTitle = analysis.title;
          resultData.analysisParagraphs = analysis.paragraphs;
        }
        if (assessmentId === "english-picture-naming" && result.pictureNamingSummary) {
          this.englishWordPackMasteries = {
            ...(this.englishWordPackMasteries || {}),
            [this.data.englishWordPackId]: {
              resultId: String(result.id || ""),
              englishWordPackId: this.data.englishWordPackId,
              matchedCount: Number(result.pictureNamingSummary.matchedCount) || 0,
              totalCount: Number(result.pictureNamingSummary.totalCount) || this.getActiveEnglishWordBank().length,
              completedAt: result.completedAt || ""
            }
          };
          resultData.pictureNamingSummary = result.pictureNamingSummary;
          resultData.englishWordPackCards = this.buildEnglishWordPackCards();
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
        if (this._resultSaveQueued) {
          this._resultSaveQueued = false;
          this.persistAssessmentResult();
        }
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

  openRecognitionGroup(event) {
    if (this.data.resultType !== "recognition") return;
    const childId = String(this.data.selectedChildId || "");
    const childName = String(this.data.selectedChildName || "");
    const recognitionGroupNumber = Number(event && event.currentTarget && event.currentTarget.dataset.group) === 2 ? 2 : 1;
    if (!childId) {
      this.setData({ message: "孩子档案信息缺失，请重新选择" });
      return;
    }
    const progress = this.loadRecognitionProgress(childId, recognitionGroupNumber);
    this.recognitionSample = recognitionGroupNumber === 2
      ? ADVANCED_CHARACTER_BANK.slice()
      : BASE_CHARACTER_BANK.slice();
    this.answers = progress ? progress.answers : Array(BASE_CHARACTER_SAMPLE_SIZE).fill(null);
    this.setData({
      stage: "recognition",
      mode: "child",
      modeLabel: `为${childName}测`,
      selectedChildId: childId,
      selectedChildName: childName,
      recognitionSummary: null,
      recognitionGroupNumber,
      recognitionSampleSize: BASE_CHARACTER_SAMPLE_SIZE,
      recognitionPageCount: BASE_CHARACTER_SAMPLE_SIZE / 20,
      recognitionIsAdvanced: recognitionGroupNumber === 2,
      recognitionIsLegacyCumulative: false,
      recognitionKnownCharacters: [],
      recognitionUnknownCharacters: [],
      recognitionCharacterListOpen: false,
      recognitionFocusOpen: false,
      resultSaveState: "idle",
      resultSaveMessage: "",
      message: ""
    });
    this.showRecognitionPage(progress ? progress.pageIndex : 0);
  },

  restartAssessment() {
    const previousMode = this.data.mode;
    const previousChild = previousMode === "child" && this.data.selectedChildId
      ? { id: this.data.selectedChildId, name: this.data.selectedChildName }
      : null;
    this.forceNewAssessment = true;
    this.answers = this.data.selectedTestId === "english-picture-naming"
      ? []
      : Array(this.data.selectedTestId === "character-recognition" ? BASE_CHARACTER_SAMPLE_SIZE : 40).fill(null);
    if (this.data.selectedTestId === "english-picture-naming") this.pictureNamingAttempts = [];
    if (this.data.selectedTestId === "character-recognition") this.clearRecognitionProgress();
    this.scores = null;
    const questionState = buildQuestionState(0, 0, this.answers);
    const englishWordBank = this.getActiveEnglishWordBank();
    this.setData({
      stage: "catalog",
      subjectModalOpen: false,
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
      recognitionPage: null,
      recognitionPageCharacters: [],
      recognitionPageNumber: 1,
      recognitionCompletedCount: 0,
      recognitionUnknownCount: 0,
      recognitionSummary: null,
      recognitionIsLegacyCumulative: false,
      recognitionKnownCharacters: [],
      recognitionUnknownCharacters: [],
      recognitionFocusOpen: false,
      recognitionFocusIndex: -1,
      recognitionFocusCharacter: "",
      recognitionFocusPinyin: "",
      recognitionFocusAnswer: null,
      recognitionFocusFromResult: false,
      recognitionExitOpen: false,
      recognitionCharacterListOpen: false,
      recognitionCharacterListTab: "unknown",
      recognitionSourcesOpen: false,
      pictureNamingIndex: 0,
      pictureNamingNumber: 1,
      pictureNamingProgressPercent: 10,
      pictureNamingTotal: englishWordBank.length,
      pictureNamingItem: englishWordBank[0],
      pictureNamingSummary: null,
      pictureNamingAnswers: [],
      pictureNamingWordListOpen: false,
      pictureNamingWordListTab: "unknown",
      pictureNamingKnownWords: [],
      pictureNamingUnknownWords: [],
      pictureNamingFocusOpen: false,
      pictureNamingFocusItem: null,
      pictureNamingFocusAnswer: null,
      pictureNamingFocusView: "word",
      englishAssessmentDesignOpen: false,
      englishPromptMode: "word",
      englishCardView: "word",
      englishWordPackOpen: false,
      analysisTitle: "",
      analysisParagraphs: [],
      resultSaveState: "idle",
      resultSaveMessage: "",
      savedResultId: "",
      message: ""
    });
    if (previousMode === "self") return this.openSavedResultOrStart("self");
    if (previousMode === "child" && previousChild) return this.openSavedResultOrStart("child", previousChild);
    this.setData({ subjectModalOpen: true });
    return Promise.resolve(false);
  }
});
