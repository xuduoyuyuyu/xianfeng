import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const miniProgramRoot = path.resolve(currentDirectory, "../..");
const { SETTINGS_SECTIONS } = require("../../utils/nativeSettings.js");

function loadFlashPageDefinition() {
  const pagePath = require.resolve("./index.js");
  const originalPage = global.Page;
  let definition;
  delete require.cache[pagePath];
  global.Page = (value) => {
    definition = value;
  };
  try {
    require(pagePath);
  } finally {
    global.Page = originalPage;
  }
  return definition;
}

test("flash test is registered and exposed as a public sidebar item", () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(miniProgramRoot, "app.json"), "utf8"));
  const flashItem = SETTINGS_SECTIONS.flatMap((section) => section.items).find((item) => item.key === "flashTest");

  assert.ok(appConfig.pages.includes("pages/flash-test/index"));
  assert.deepEqual(flashItem, {
    key: "flashTest",
    title: "闪测",
    iconType: "image",
    image: "/assets/menu/flash-test-icon.svg",
    page: "/pages/flash-test/index",
    public: true
  });
  const askItems = SETTINGS_SECTIONS.find((section) => section.key === "ask").items;
  assert.equal(askItems.findIndex((item) => item.key === "flashTest") + 1, askItems.findIndex((item) => item.key === "worthbuy"));
});

test("every shared sidebar leaves public items outside the phone login overlay", () => {
  const sidebarFiles = [
    "pages/programs/index.wxml",
    "pages/reading/index.wxml",
    "pages/materials/index.wxml",
    "pages/topics/index.wxml",
    "pages/search/index.wxml",
    "pages/worthbuy/index.wxml",
    "pages/pro/index.wxml",
    "pages/mine/index.wxml",
    "pages/mama-resource-apply/index.wxml",
    "pages/webview/index.wxml"
  ];

  sidebarFiles.forEach((relativePath) => {
    const source = fs.readFileSync(path.join(miniProgramRoot, relativePath), "utf8");
    assert.match(source, /wx:if="\{\{!isLoggedIn && !item\.public\}\}"/, relativePath);
  });
});

test("flash test uses required sliders and renders 1-to-5 scores on the radar", () => {
  const source = fs.readFileSync(path.join(currentDirectory, "index.js"), "utf8");
  const template = fs.readFileSync(path.join(currentDirectory, "index.wxml"), "utf8");

  assert.match(template, /min="1"/);
  assert.match(template, /max="5"/);
  assert.match(template, /step="1"/);
  assert.match(template, /canvas-id="talentRadar"/);
  assert.match(template, /雷达图按 1–5 分展示八项能力/);
  assert.match(template, /源于沈辛成《超级分数》提出的八项能力/);
  assert.match(template, /看见\{\{mode === 'child' \? selectedChildName : '自己'\}\}的八项能力/);
  assert.match(template, /assets\/wel-avatar\/img-0640\.png/);
  assert.doesNotMatch(template, /assets\/wel-avatar\/no-hat\.png[^\n]*xf-flash-result-icon/);
  assert.match(source, /context\.fillText\(score\.name, point\.x, nameY\)/);
  assert.match(source, /context\.fillText\(`\$\{score\.radarValue\}分`, point\.x, scoreY\)/);
  assert.doesNotMatch(template, /\{\{item\.total\}\}|\{\{item\.radarValue\}\}/);
});

test("flash test slider has a thicker track and dock-like drag feedback", () => {
  const source = fs.readFileSync(path.join(currentDirectory, "index.js"), "utf8");
  const template = fs.readFileSync(path.join(currentDirectory, "index.wxml"), "utf8");
  const styles = fs.readFileSync(path.join(currentDirectory, "index.wxss"), "utf8");

  assert.match(template, /xf-flash-slider-track/);
  assert.match(template, /xf-flash-slider-fill/);
  assert.match(template, /bindchanging="updateAnswer"/);
  assert.match(template, /bindchange="finishAnswer"/);
  assert.match(template, /bindtouchend="confirmSliderPosition"/);
  assert.match(template, /bindtap="selectAnswerValue"/);
  assert.match(template, /block-size="\{\{currentQuestion\.sliding \? 38 : 32\}\}"/);
  assert.match(source, /sliderLabels/);
  assert.match(source, /dockClass/);
  assert.match(source, /finishAnswer\(event\)/);
  assert.match(styles, /\.xf-flash-slider-track\s*\{[^}]*height:\s*12rpx/s);
  assert.match(styles, /\.xf-flash-slider-label\.is-near\s*\{[^}]*scale\(1\.22\)/s);
  assert.match(styles, /\.xf-flash-slider-label\.is-current\s*\{[^}]*scale\(1\.65\)/s);
  assert.match(styles, /\.xf-flash-slider-label\.is-selected\s*\{[^}]*scale\(1\.15\)/s);
});

test("the default slider position can be explicitly selected as score three", () => {
  const definition = loadFlashPageDefinition();
  const createContext = () => ({
    ...definition,
    data: { ...definition.data },
    answers: Array(40).fill(null),
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  });

  const sliderContext = createContext();
  definition.confirmSliderPosition.call(sliderContext);
  assert.equal(sliderContext.answers[0], 3);
  assert.equal(sliderContext.data.currentQuestion.answered, true);
  assert.equal(sliderContext.data.currentQuestion.sliderLabels[2].dockClass, "is-selected");

  const labelContext = createContext();
  definition.selectAnswerValue.call(labelContext, { currentTarget: { dataset: { value: 3 } } });
  assert.equal(labelContext.answers[0], 3);
  assert.equal(labelContext.data.currentQuestion.answered, true);
  assert.equal(labelContext.data.currentQuestion.trackPercent, 50);
});

test("flash test presents one focused question at a time with reference-led navigation", () => {
  const source = fs.readFileSync(path.join(currentDirectory, "index.js"), "utf8");
  const template = fs.readFileSync(path.join(currentDirectory, "index.wxml"), "utf8");
  const styles = fs.readFileSync(path.join(currentDirectory, "index.wxss"), "utf8");

  assert.match(source, /currentQuestionIndex/);
  assert.match(source, /questionNumber/);
  assert.match(source, /previousQuestion\(\)/);
  assert.match(source, /nextQuestion\(\)/);
  assert.match(template, /xf-flash-question-stage/);
  assert.match(template, /scroll-y="\{\{stage !== 'questions' && stage !== 'recognition'\}\}"/);
  assert.match(template, /is-question-mode/);
  assert.match(template, /xf-flash-question-hero/);
  assert.match(template, /测测你的/);
  assert.match(template, /\/assets\/wel-avatar\/no-hat\.png/);
  assert.doesNotMatch(template, /\/assets\/wel-avatar\/wizard\.png/);
  assert.match(template, /\{\{questionNumber\}\} \/ 40/);
  assert.match(template, /\{\{currentQuestion\.text\}\}/);
  assert.match(template, /bindtap="previousQuestion"/);
  assert.match(template, /bindtap="nextQuestion"/);
  assert.doesNotMatch(template, /wx:for="\{\{currentDimension\.questions\}\}"/);
  assert.match(styles, /\.xf-flash-scroll\.is-question-mode\s*\{[^}]*padding:\s*0/s);
  assert.match(styles, /\.xf-flash-question-stage\s*\{[^}]*display:\s*flex[^}]*height:\s*100%[^}]*min-height:\s*0/s);
  assert.match(styles, /\.xf-flash-questions\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*background:\s*#f7f3ff/s);
  assert.match(styles, /\.xf-flash-question-hero\s*\{[^}]*border:\s*2rpx solid rgba\(108, 39, 214, 0\.1\)[^}]*background:\s*#ffffff/s);
  assert.match(styles, /\.xf-flash-question-card\s*\{[^}]*flex:\s*0 0 auto[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s);
  assert.match(styles, /\.xf-flash-scale-caption\s*\{[^}]*margin-top:\s*42rpx/s);
  assert.doesNotMatch(styles, /\.xf-flash-scale-caption\s*\{[^}]*margin-top:\s*auto/s);
  assert.doesNotMatch(styles, /\.xf-flash-question-card\s*\{[^}]*min-height:\s*760rpx/s);
  assert.doesNotMatch(styles, /#fff(?:7aa|bdc|8cf)/i);
});

test("flash test opens as a test catalog before choosing the assessment subject", () => {
  const source = fs.readFileSync(path.join(currentDirectory, "index.js"), "utf8");
  const template = fs.readFileSync(path.join(currentDirectory, "index.wxml"), "utf8");
  const styles = fs.readFileSync(path.join(currentDirectory, "index.wxss"), "utf8");
  const icon = fs.readFileSync(path.join(miniProgramRoot, "assets/flash-test/eight-talents.svg"), "utf8");
  const heroIconPath = path.join(miniProgramRoot, "assets/flash-test/flash-test-hero-icon.png");
  const assessmentIconPath = path.join(miniProgramRoot, "assets/flash-test/assessment-checklist.png");
  const recognitionIconPath = path.join(miniProgramRoot, "assets/flash-test/character-recognition.webp");

  assert.match(source, /stage:\s*"catalog"/);
  assert.match(source, /根据沈辛成《超越分数》整理/);
  assert.match(source, /icon:\s*"\/assets\/flash-test\/assessment-checklist\.png"/);
  assert.match(source, /icon:\s*"\/assets\/flash-test\/character-recognition\.webp"/);
  assert.match(template, /stage === 'catalog'/);
  assert.match(template, /xf-flash-catalog-title">闪测/);
  assert.match(template, /xf-flash-catalog-hero/);
  assert.match(template, /xf-flash-catalog-icon[^>]*src="\/assets\/flash-test\/flash-test-hero-icon\.png"/);
  assert.equal(fs.existsSync(heroIconPath), true);
  assert.equal(fs.existsSync(assessmentIconPath), true);
  assert.equal(fs.existsSync(recognitionIconPath), true);
  assert.doesNotMatch(template, /xf-flash-catalog-mascot/);
  assert.doesNotMatch(styles, /\.xf-flash-catalog-mascot/);
  assert.match(template, /\/assets\/wel-avatar\/no-hat\.png/);
  assert.match(template, /xf-flash-catalog-panel/);
  assert.doesNotMatch(template, /xf-flash-catalog-panel-head/);
  assert.match(template, /xf-flash-test-row-head/);
  assert.match(template, /xf-flash-test-facts/);
  assert.match(template, /八大能力/);
  assert.match(template, /src="\{\{item\.icon\}\}"/);
  assert.doesNotMatch(template, /\{\{item\.source\}\}/);
  assert.match(template, /hover-class="is-pressed"/);
  assert.match(template, /bindtap="openAssessment"/);
  assert.doesNotMatch(template, /stage === 'intro'/);
  assert.doesNotMatch(template, /stage === 'choice'/);
  assert.doesNotMatch(template, /bindtap="startSelectedAssessment"/);
  assert.match(template, /wx:if="\{\{subjectModalOpen\}\}"/);
  assert.match(template, /xf-flash-subject-mask/);
  assert.match(template, /xf-flash-subject-dialog/);
  assert.match(template, /catchtap="closeSubjectModal"/);
  assert.match(template, /这次为谁作答/);
  assert.match(template, /data-mode="self"[^>]*open-type="\{\{isLoggedIn \? '' : 'getPhoneNumber'\}\}"[^>]*bindtap="chooseMode"[^>]*bindgetphonenumber="authorizeAssessment"/);
  assert.match(template, /data-mode="child"[^>]*open-type="\{\{isLoggedIn \? '' : 'getPhoneNumber'\}\}"[^>]*bindtap="chooseMode"[^>]*bindgetphonenumber="authorizeAssessment"/);
  assert.match(template, /xf-flash-result-hero/);
  assert.match(icon, /<polygon/);
  assert.match(icon, /linearGradient/);
  assert.match(styles, /page\s*\{[^}]*background:\s*#f7f3ff/s);
  assert.match(styles, /\.xf-flash-catalog-hero\s*\{[^}]*flex-direction:\s*column[^}]*align-items:\s*center[^}]*justify-content:\s*center/s);
  assert.match(styles, /\.xf-flash-catalog-hero-copy\s*\{[^}]*text-align:\s*center/s);
  assert.match(styles, /\.xf-flash-catalog-panel\s*\{[^}]*padding:\s*26rpx[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.38\)/s);
  assert.match(styles, /\.xf-flash-test-card\s*\{[^}]*border:\s*2rpx solid rgba\(108, 39, 214, 0\.08\)[^}]*border-radius:\s*28rpx[^}]*background:\s*#ffffff/s);
  assert.match(styles, /\.xf-flash-test-icon-shell\s*\{[^}]*width:\s*108rpx[^}]*height:\s*108rpx[^}]*background:\s*#f5f0ff/s);
  assert.match(styles, /\.xf-flash-test-icon\s*\{[^}]*width:\s*104rpx[^}]*height:\s*104rpx[^}]*background:\s*transparent/s);
  assert.match(styles, /\.xf-flash-test-facts\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/s);
  assert.match(styles, /\.xf-flash-test-source\s*\{[^}]*color:\s*#8a8394/s);
  assert.match(styles, /\.xf-flash-test-card \.xf-flash-mode-arrow\s*\{[^}]*background:\s*transparent[^}]*color:\s*#a39cad/s);
  assert.match(template, /xf-flash-catalog[^>]*min-height:\s*calc\(100vh - \{\{chromeHeight\}\}px - 80rpx\)/);
  assert.match(styles, /\.xf-flash-catalog\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
  assert.match(styles, /\.xf-flash-catalog-foot\s*\{[^}]*width:\s*100%[^}]*margin-top:\s*auto[^}]*border:\s*0[^}]*background:\s*transparent[^}]*text-align:\s*center[^}]*box-shadow:\s*none/s);
  assert.match(styles, /\.xf-flash-subject-mask\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*align-items:\s*flex-end/s);
  assert.match(styles, /\.xf-flash-subject-dialog\s*\{[^}]*border:\s*2rpx solid #ebe9ee[^}]*border-radius:\s*32rpx[^}]*background:\s*#ffffff/s);
  assert.match(styles, /\.xf-flash-subject-dialog \.xf-flash-mode-card\s*\{[^}]*border-color:\s*#e8e6eb[^}]*background:\s*#ffffff/s);
  assert.doesNotMatch(template, /xf-flash-mode-card is-primary/);
  assert.doesNotMatch(styles, /\.xf-flash-subject-dialog \.xf-flash-mode-card\.is-primary/);
  assert.match(styles, /\.xf-flash-mode-icon\.is-self,\s*\.xf-flash-mode-icon\.is-child\s*\{[^}]*background:\s*#f1eef6[^}]*color:\s*#6c27d6/s);
  assert.doesNotMatch(styles, /\.xf-flash-intro/);
  assert.doesNotMatch(styles, /\.xf-flash-choice/);
  assert.match(styles, /\.xf-flash-result-hero\s*\{[^}]*background:\s*#ffffff/s);
});

test("flash test shares the catalog or the exact assessment entry without personal state", () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  let shareMenuOptions = null;
  const context = {
    ...definition,
    data: { ...definition.data },
    syncTopbarMetrics() {},
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync() {
        return "";
      },
      showShareMenu(options) {
        shareMenuOptions = options;
      }
    };

    definition.onLoad.call(context, { test: "eight-talents" });
    assert.deepEqual(shareMenuOptions, {
      withShareTicket: true,
      menus: ["shareAppMessage", "shareTimeline"]
    });
    assert.equal(context.data.subjectModalOpen, true);
    assert.equal(context.data.selectedTestTitle, "八大能力");

    assert.deepEqual(definition.onShareAppMessage.call(context), {
      title: "八大能力｜看见更容易被调用的能力组合",
      path: "/pages/flash-test/index?test=eight-talents"
    });
    assert.deepEqual(definition.onShareTimeline.call(context), {
      title: "八大能力｜看见更容易被调用的能力组合",
      query: "test=eight-talents"
    });

    context.data = {
      ...context.data,
      stage: "catalog",
      subjectModalOpen: false,
      selectedTestTitle: "",
      mode: "child",
      selectedChildId: "child-private",
      selectedChildName: "不应分享"
    };
    assert.deepEqual(definition.onShareAppMessage.call(context), {
      title: "闪测｜测一测，更懂自己和孩子",
      path: "/pages/flash-test/index"
    });
  } finally {
    global.wx = originalWx;
  }
});

test("assessment card opens subject choice in a modal without intermediate stages", () => {
  const definition = loadFlashPageDefinition();
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  definition.openAssessment.call(context, { currentTarget: { dataset: { id: "eight-talents" } } });
  assert.equal(context.data.stage, "catalog");
  assert.equal(context.data.selectedTestTitle, "八大能力");
  assert.equal(context.data.subjectModalOpen, true);
  assert.equal(definition.startSelectedAssessment, undefined);

  definition.closeSubjectModal.call(context);
  assert.equal(context.data.subjectModalOpen, false);
  assert.equal(context.data.stage, "catalog");

  context.data = { ...context.data, stage: "questions", dimensionIndex: 0, currentQuestionIndex: 0 };
  definition.previousQuestion.call(context);
  assert.equal(context.data.stage, "catalog");
  assert.equal(context.data.subjectModalOpen, true);

  context.answers = Array(40).fill(4);
  definition.restartAssessment.call(context);
  assert.equal(context.data.stage, "catalog");
  assert.equal(context.data.subjectModalOpen, true);
  assert.equal(context.answers.every((answer) => answer === null), true);
});

test("flash test requires phone login before entering questions and resumes the chosen mode", async () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  let token = "";
  let loginEvent = null;
  const context = {
    ...definition,
    data: { ...definition.data, subjectModalOpen: true },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    selectComponent(id) {
      assert.equal(id, "#flashTestPhoneLoginGate");
      return {
        loginWithPhone(event) {
          loginEvent = event;
        }
      };
    },
    startAssessment(mode) {
      this.startedMode = mode;
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        return key === "xf_token" ? token : "";
      },
      request(options) {
        options.success({ statusCode: 200, data: { results: [] } });
      }
    };
    const event = { currentTarget: { dataset: { mode: "self" } }, detail: { code: "phone-code" } };
    definition.chooseMode.call(context, event);
    assert.equal(context.startedMode, undefined);
    assert.deepEqual(context.pendingAssessmentAction, { type: "start", mode: "self" });

    definition.authorizeAssessment.call(context, event);
    assert.equal(loginEvent, event);
    token = "jwt-token";
    await definition.handleAssessmentLoginSuccess.call(context);
    assert.equal(context.startedMode, "self");
    assert.equal(context.data.subjectModalOpen, false);
    assert.equal(context.data.isLoggedIn, true);
  } finally {
    global.wx = originalWx;
  }
});

test("completed flash test persists all answers to the current user's result history", async () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  let requestOptions = null;
  const context = {
    ...definition,
    data: { ...definition.data, mode: "child", selectedChildId: "child-1" },
    answers: Array(40).fill(4),
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        return key === "xf_token" ? "jwt-token" : "";
      },
      request(options) {
        requestOptions = options;
        options.success({ statusCode: 201, data: { result: { id: "result-1" } } });
      }
    };
    await definition.persistAssessmentResult.call(context);
    assert.match(requestOptions.url, /\/api\/flash-tests\/results$/);
    assert.equal(requestOptions.method, "POST");
    assert.equal(requestOptions.header.Authorization, "Bearer jwt-token");
    assert.equal(requestOptions.data.assessmentId, "eight-talents");
    assert.equal(requestOptions.data.assessmentVersion, "2026-08-11");
    assert.equal(requestOptions.data.mode, "child");
    assert.equal(requestOptions.data.childId, "child-1");
    assert.equal(requestOptions.data.answers.length, 40);
    assert.equal(context.data.resultSaveState, "saved");
    assert.equal(context.data.savedResultId, "result-1");
  } finally {
    global.wx = originalWx;
  }
});

test("returning users see their latest saved result before a new self assessment", async () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  const scores = ["记忆", "推演", "表达", "感知", "数理", "操作", "狂热", "创造"].map((name, index) => ({
    code: ["M", "Y", "B", "G", "S", "C", "K", "Z"][index],
    name,
    total: 15,
    radarValue: 3,
    level: "优势可发展能力"
  }));
  let requestOptions = null;
  const context = {
    ...definition,
    data: { ...definition.data, subjectModalOpen: true },
    setData(payload, callback) {
      this.data = { ...this.data, ...payload };
      if (callback) callback();
    },
    startAssessment(mode) {
      this.startedMode = mode;
    },
    drawRadar() {
      this.radarDrawn = true;
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        return key === "xf_token" ? "jwt-token" : "";
      },
      request(options) {
        requestOptions = options;
        options.success({
          statusCode: 200,
          data: {
            results: [{
              id: "saved-self-result",
              assessmentId: "eight-talents",
              assessmentVersion: "2026-08-11",
              mode: "self",
              childId: "",
              childName: "",
              scores,
              completedAt: "2026-08-11T08:00:00.000Z"
            }]
          }
        });
      },
      nextTick(callback) {
        callback();
      }
    };

    await definition.chooseMode.call(context, { currentTarget: { dataset: { mode: "self" } } });
    assert.match(requestOptions.url, /\/api\/flash-tests\/results\?assessmentId=eight-talents&mode=self&limit=1$/);
    assert.equal(context.startedMode, undefined);
    assert.equal(context.data.stage, "result");
    assert.equal(context.data.subjectModalOpen, false);
    assert.equal(context.data.resultSaveState, "saved");
    assert.equal(context.data.savedResultId, "saved-self-result");
    assert.equal(context.radarDrawn, true);
  } finally {
    global.wx = originalWx;
  }
});

test("history restoration rejects a result belonging to another assessment subject", async () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  try {
    global.wx = {
      getStorageSync(key) {
        return key === "xf_token" ? "jwt-token" : "";
      },
      request(options) {
        options.success({
          statusCode: 200,
          data: {
            results: [{ assessmentId: "eight-talents", mode: "child", childId: "child-1", scores: [] }]
          }
        });
      }
    };

    await assert.rejects(
      definition.loadLatestResult.call(definition, "self"),
      /历史结果读取异常/
    );
  } finally {
    global.wx = originalWx;
  }
});

test("explicit retest starts a fresh assessment instead of reopening saved history", async () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  let requestCount = 0;
  const context = {
    ...definition,
    data: { ...definition.data, stage: "result", mode: "self" },
    answers: Array(40).fill(4),
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    startAssessment(mode) {
      this.startedMode = mode;
      this.forceNewAssessment = false;
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        return key === "xf_token" ? "jwt-token" : "";
      },
      request() {
        requestCount += 1;
      }
    };

    definition.restartAssessment.call(context);
    assert.equal(context.forceNewAssessment, true);
    await definition.chooseMode.call(context, { currentTarget: { dataset: { mode: "self" } } });
    assert.equal(context.startedMode, "self");
    assert.equal(requestCount, 0);
  } finally {
    global.wx = originalWx;
  }
});

test("child assessment opens the shared archive side panel without picker or confirmation pages", () => {
  const source = fs.readFileSync(path.join(currentDirectory, "index.js"), "utf8");
  const template = fs.readFileSync(path.join(currentDirectory, "index.wxml"), "utf8");
  const sharedArchiveTemplate = fs.readFileSync(path.join(miniProgramRoot, "templates/settings-profile-views.wxml"), "utf8");

  assert.match(source, /buildProfileState/);
  assert.match(source, /createNativeSettingsMethods/);
  assert.match(source, /getSettingsPanelHeight/);
  assert.match(source, /wx\.getStorageSync\(LAST_CHILD_ID_KEY\)/);
  assert.match(template, /settings-profile-views\.wxml/);
  assert.match(template, /class="xf-native-settings-mask"/);
  assert.match(template, /is="xfSettingsArchivePanel"/);
  assert.match(template, /archiveSelectionMode: archiveSelectionMode/);
  assert.match(sharedArchiveTemplate, /bindtap="confirmArchiveSelection"/);
  assert.match(template, /wx:if="\{\{youngChildWarningOpen\}\}"/);
  assert.match(template, /这个阶段暂时不建议测试/);
  assert.match(template, /catchtap="continueYoungChildAssessment"/);
  assert.match(template, /仍要继续测试/);
  assert.doesNotMatch(template, /stage === 'child-picker'/);
  assert.doesNotMatch(template, /stage === 'child-confirm'/);
  assert.doesNotMatch(template, /确认代测对象|换一个孩子/);
  assert.doesNotMatch(source, /\/pages\/mine\/archive\/index/);
});

test("child assessment requires explicit continuation below third grade", async () => {
  const definition = loadFlashPageDefinition();
  const child = { id: "child-a", name: "小圆子", initial: "圆", subtitle: "女儿 · 学前小班", grade: "学前小班" };
  const storage = new Map();
  const context = {
    ...definition,
    data: { ...definition.data, subjectModalOpen: true },
    answers: Array(40).fill(null),
    archiveActiveId: child.id,
    loadChildChoices() {
      return [child];
    },
    loadArchivePanel() {
      this.archivePanelLoaded = true;
    },
    closeSettings() {
      this.data.settingsPanelOpen = false;
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  const originalWx = global.wx;
  let requestOptions = null;

  try {
    global.wx = {
      getWindowInfo() {
        return { screenHeight: 844 };
      },
      getStorageSync(key) {
        return key === "xf_token" ? "jwt-token" : "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      request(options) {
        requestOptions = options;
        options.success({ statusCode: 200, data: { results: [] } });
      }
    };

    definition.prepareChildAssessment.call(context);
    assert.equal(context.data.stage, "catalog");
    assert.equal(context.data.subjectModalOpen, false);
    assert.equal(context.data.settingsPanelOpen, true);
    assert.equal(context.data.settingsPanelView, "archive");
    assert.equal(context.archivePanelLoaded, true);

    await definition.confirmArchiveSelection.call(context);
    assert.match(requestOptions.url, /mode=child&childId=child-a&limit=1$/);
    assert.equal(context.data.stage, "catalog");
    assert.equal(context.data.youngChildWarningOpen, true);
    assert.equal(context.data.youngChildName, "小圆子");
    assert.equal(context.data.youngChildGrade, "学前小班");
    assert.equal(storage.has("xiaowanzi_last_child_id_v1"), false);

    definition.continueYoungChildAssessment.call(context);
    assert.equal(context.data.stage, "questions");
    assert.equal(context.data.settingsPanelOpen, false);
    assert.equal(context.data.youngChildWarningOpen, false);
    assert.equal(context.data.selectedChildName, "小圆子");
    assert.equal(storage.get("xiaowanzi_last_child_id_v1"), child.id);
  } finally {
    global.wx = originalWx;
  }
});

test("young child warning applies only below primary grade three", () => {
  const definition = loadFlashPageDefinition();

  assert.equal(definition.shouldWarnForYoungChild({ grade: "学前小班" }), true);
  assert.equal(definition.shouldWarnForYoungChild({ grade: "小学一年级" }), true);
  assert.equal(definition.shouldWarnForYoungChild({ grade: "小学二年级" }), true);
  assert.equal(definition.shouldWarnForYoungChild({ grade: "小学三年级" }), false);
  assert.equal(definition.shouldWarnForYoungChild({ grade: "小学四年级" }), false);
});

test("character recognition uses the existing child archive and a 30-character binary flow", async () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    prepareChildAssessment() {
      this.archiveOpened = true;
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        return key === "xf_token" ? "jwt-token" : "";
      },
      setStorageSync() {}
    };
    definition.openAssessment.call(context, { currentTarget: { dataset: { id: "character-recognition" } } });
    assert.equal(context.data.selectedTestTitle, "识字量");
    assert.equal(context.data.selectedTestChildOnly, true);
    await definition.chooseMode.call(context, { currentTarget: { dataset: { mode: "self" } } });
    assert.equal(context.archiveOpened, true);

    definition.startAssessment.call(context, "child", { id: "child-1", name: "小读者" });
    assert.equal(context.data.stage, "recognition");
    assert.equal(context.recognitionSample.length, 30);
    assert.equal(new Set(context.recognitionSample).size, 30);
    assert.equal(context.data.recognitionCharacter, context.recognitionSample[0]);
    assert.equal(context.answers.length, 30);
    assert.equal(context.data.mode, "child");

    const firstSample = context.recognitionSample.slice();
    context.recognitionTestedCharacters = firstSample.slice();
    context.data = {
      ...context.data,
      stage: "result",
      resultType: "recognition",
      resultSaveState: "saved",
      selectedChildId: "child-1",
      selectedChildName: "小读者",
      subjectModalOpen: false
    };
    definition.continueRecognitionAssessment.call(context);
    assert.equal(context.data.selectedChildId, "child-1");
    assert.equal(context.data.selectedChildName, "小读者");
    assert.equal(context.data.subjectModalOpen, false);
    assert.equal(context.data.stage, "recognition");
    assert.notDeepEqual(context.recognitionSample, firstSample);
    assert.ok(context.recognitionSample.every((character) => !firstSample.includes(character)));
    assert.equal(context.data.recognitionCharacter, context.recognitionSample[0]);
  } finally {
    global.wx = originalWx;
  }
});

test("character recognition explains the limits of its 30-character sample", () => {
  const template = fs.readFileSync(path.join(currentDirectory, "index.wxml"), "utf8");
  const styles = fs.readFileSync(path.join(currentDirectory, "index.wxss"), "utf8");

  assert.match(template, /30 字分层样本表现/);
  assert.match(template, /xf-flash-recognition-summary-meta">辅助参考区间/);
  assert.match(template, /xf-flash-recognition-summary-estimate-value">约 \{\{recognitionSummary\.estimateLabel\}\} 个/);
  assert.match(template, /cumulativeRecognizedCount >= 5/);
  assert.match(template, /样本不足，暂不估算识字数量/);
  assert.match(template, /覆盖 \{\{recognitionSummary\.cumulativeSampledCount\}\} 个不同样本字/);
  assert.match(template, /不同样本越多，估算通常越稳定/);
  assert.match(template, /不是实际测得的识字总量/);
  assert.match(template, /为什么多测几次会更稳定？/);
  assert.match(template, /继续测试，让估算更稳定/);
  assert.match(template, /bindtap="continueRecognitionAssessment"/);
  assert.match(template, /disabled="\{\{resultSaveState !== 'saved'\}\}"/);
  assert.match(template, /再次测试会优先出现未测过的字/);
  assert.match(styles, /\.xf-flash-recognition-character\s*\{[^}]*font-size:\s*520rpx;/s);
  assert.match(styles, /\.xf-flash-recognition-summary-meta\s*\{[^}]*font-size:\s*19rpx;[^}]*font-weight:\s*600;/s);
  assert.match(styles, /\.xf-flash-recognition-summary-estimate-value\s*\{[^}]*color:\s*#6c27d6;[^}]*font-size:\s*32rpx;[^}]*font-weight:\s*900;/s);
  assert.match(styles, /\.xf-flash-recognition-summary-caveat\s*\{[^}]*font-size:\s*17rpx;[^}]*font-weight:\s*600;/s);
  assert.doesNotMatch(template, /本次估算约 \{\{recognitionSummary\.estimateLabel\}\} 个常用汉字/);
});

test("character recognition can start before its history endpoint is released", async () => {
  const definition = loadFlashPageDefinition();
  const child = { id: "child-1", name: "小读者" };
  const context = {
    ...definition,
    data: { ...definition.data, selectedTestId: "character-recognition" },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    loadLatestResult() {
      return Promise.reject({ statusCode: 400, message: "暂不支持该测试" });
    },
    beginNewAssessment(mode, selectedChild) {
      this.started = { mode, child: selectedChild };
    }
  };

  const restored = await definition.openSavedResultOrStart.call(context, "child", child);

  assert.equal(restored, false);
  assert.deepEqual(context.started, { mode: "child", child });
});

test("character recognition advances, supports back, and submits server-scored answers", async () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  let requestOptions = null;
  const context = {
    ...definition,
    data: {
      ...definition.data,
      selectedTestId: "character-recognition",
      selectedTestTitle: "识字量",
      selectedTestChildOnly: true,
      mode: "child",
      selectedChildId: "child-1",
      selectedChildName: "小读者",
      recognitionIndex: 0
    },
    answers: Array(30).fill(null),
    recognitionSample: [
      "日", "月", "山", "水", "人",
      "找", "跟", "秋", "纸", "奶",
      "洁", "期", "窗", "短", "乘",
      "鼓", "健", "越", "整", "熟",
      "慕", "谨", "繁", "览", "颠",
      "簇", "瞥", "蕴", "辙", "瀑"
    ],
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        return key === "xf_token" ? "jwt-token" : "";
      },
      request(options) {
        requestOptions = options;
        options.success({
          statusCode: 201,
          data: {
            result: {
              id: "recognition-1",
              recognitionSummary: {
                recognizedCount: 15,
                sampledCount: 30,
                estimatedMin: 1000,
                estimatedMax: 2000,
                estimateLabel: "1000–2000",
                reference: "正在接近第一学段常用字目标"
              }
            }
          }
        });
      }
    };

    definition.answerRecognitionCharacter.call(context, { currentTarget: { dataset: { value: 1 } } });
    assert.equal(context.answers[0], 1);
    assert.equal(context.data.recognitionIndex, 1);
    assert.equal(context.data.recognitionCharacter, "月");
    definition.previousRecognitionCharacter.call(context);
    assert.equal(context.data.recognitionIndex, 0);
    assert.equal(context.data.recognitionCharacter, "日");

    context.answers = [...Array(15).fill(1), ...Array(15).fill(0)];
    await definition.finishCharacterRecognition.call(context);
    await context._resultSavePromise;
    assert.equal(requestOptions.data.assessmentId, "character-recognition");
    assert.equal(requestOptions.data.assessmentVersion, "2026-08-12-r4");
    assert.equal(requestOptions.data.mode, "child");
    assert.equal(requestOptions.data.answers.length, 30);
    assert.deepEqual(requestOptions.data.sampleCharacters, context.recognitionSample);
    assert.equal(context.data.resultType, "recognition");
    assert.equal(context.data.resultSaveState, "saved");
  } finally {
    global.wx = originalWx;
  }
});
