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
const { ADVANCED_CHARACTER_BANK, BASE_CHARACTER_BANK, CHARACTER_BANK } = require("../../utils/characterRecognitionBank.js");

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

  assert.ok(appConfig.subPackages.some((subPackage) => subPackage.root === "pages/flash-test" && subPackage.pages.includes("index")));
  assert.equal(appConfig.permission?.["scope.record"], undefined);
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
  assert.match(template, /scroll-y="\{\{stage !== 'questions' && stage !== 'recognition' && stage !== 'picture-naming'\}\}"/);
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
  const recognitionIconPath = path.join(miniProgramRoot, "assets/flash-test/character-recognition.png");

  assert.match(source, /stage:\s*"catalog"/);
  assert.match(source, /根据沈辛成《超越分数》整理/);
  assert.match(source, /icon:\s*"\/assets\/flash-test\/assessment-checklist\.png"/);
  assert.match(source, /icon:\s*"\/assets\/flash-test\/character-recognition\.png"/);
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
  assert.match(template, /data-id="\{\{item\.id\}\}"[^>]*open-type="\{\{!isLoggedIn && item\.childOnly \? 'getPhoneNumber' : ''\}\}"[^>]*bindtap="openAssessment"[^>]*bindgetphonenumber="authorizeChildOnlyAssessment"/);
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
  assert.match(template, /wx:if="\{\{questionNumber === 1\}\}"[^>]*class="xf-flash-reselect-subject"[^>]*bindtap="reselectAssessmentSubject"/);
  assert.match(template, /wx:if="\{\{recognitionPageNumber === 1\}\}"[^>]*class="xf-flash-reselect-subject"[^>]*bindtap="reselectAssessmentSubject"[^>]*>重选孩子<\/view>/);
  assert.match(template, /class="xf-flash-reselect-subject"[^>]*bindtap="reselectAssessmentSubject"[^>]*>\{\{mode === 'child' \? '重选孩子' : '重选测试对象'\}\}<\/view>/);
  assert.doesNotMatch(template, /<button[^>]*>重选(?:孩子|测试对象)<\/button>/);
  assert.match(styles, /\.xf-flash-reselect-subject\s*\{[^}]*display:\s*block[^}]*width:\s*fit-content[^}]*margin:\s*10rpx auto 0[^}]*color:\s*#6c27d6[^}]*font-size:\s*18rpx[^}]*text-align:\s*center/s);
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

test("English flash test keeps one word-reading task and only offers photo view when audited", () => {
  const source = fs.readFileSync(path.join(currentDirectory, "index.js"), "utf8");
  const template = fs.readFileSync(path.join(currentDirectory, "index.wxml"), "utf8");
  const styles = fs.readFileSync(path.join(currentDirectory, "index.wxss"), "utf8");
  const photoDirectory = path.join(miniProgramRoot, "pages/flash-test/assets/english-picture-naming");
  const jpegPhotoNames = ["cat", "dog", "bird", "fish", "duck", "horse", "cow", "sheep", "elephant", "monkey"];
  const webpPhotoNames = [
    "apple", "banana-focus", "orange", "egg", "bread", "cake", "carrot", "tomato", "potato", "rice",
    "book", "pencil", "ruler-focus", "chair", "table-focus", "bed-modern", "door-modern-focus", "window", "clock", "bag",
    "hand", "foot", "eye", "ear", "nose", "mouth", "hair", "hat", "shoe", "shirt",
    "car", "bus", "train", "bike", "boat", "plane", "truck", "sun-sky", "tree", "flower"
  ];

  assert.match(source, /id:\s*"english-picture-naming"/);
  assert.match(source, /icon:\s*"\/assets\/flash-test\/english-picture-naming\.svg"/);
  assert.doesNotMatch(source, /icon:\s*"\/pages\/flash-test\/assets\/english-picture-naming\/cat\.jpg"/);
  assert.match(source, /title:\s*"英文单词"/);
  assert.doesNotMatch(source, /LAST_ENGLISH_PROMPT_MODE_KEY/);
  assert.doesNotMatch(source, /wx\.getRecorderManager/);
  assert.doesNotMatch(source, /\/api\/flash-tests\/english-picture-naming\/recognize/);
  assert.match(template, /stage === 'picture-naming'/);
  assert.match(template, /class="xf-picture-naming-photo"[^>]*mode="aspectFill"/);
  assert.match(template, /同一单词的真实照片 · 不改变本题记录/);
  assert.match(template, /看见单词，读给家长听/);
  assert.match(template, /class="xf-picture-naming-word"/);
  assert.match(template, /catchtap="playEnglishWordPronunciation"/);
  assert.match(template, /assets\/flash-test\/speaker\.svg/);
  assert.match(template, /class="xf-picture-naming-ipa">\{\{pictureNamingItem\.ipa\}\}<\/text>[\s\S]*class="xf-picture-naming-word">\{\{pictureNamingItem\.word\}\}<\/text>/);
  assert.match(template, /wx:if="\{\{englishCardView === 'picture' && pictureNamingItem\.image\}\}" class="xf-picture-naming-photo-shell"[^>]*bindtap="toggleEnglishCardView"/);
  assert.match(template, /class="xf-picture-naming-word-shell \{\{pictureNamingItem\.image \? '' : 'has-no-photo'\}\}"[^>]*bindtap="toggleEnglishCardView"/);
  assert.match(template, /class="xf-english-card-flip-hint"><text>切换看词<\/text>/);
  assert.match(template, /class="xf-english-card-flip-hint"><text>切换看图<\/text>/);
  assert.doesNotMatch(template, /xf-english-result-mode-link|toggleEnglishPromptMode/);
  assert.doesNotMatch(template, /xf-english-prompt-modes|chooseEnglishPromptMode|选择英文测试模式/);
  assert.doesNotMatch(template, /xf-english-mode-switch/);
  assert.match(template, /open-type="\{\{!isLoggedIn && item\.childOnly \? 'getPhoneNumber' : ''\}\}"/);
  assert.match(template, /bindtap="markWordReadingUnknown"[^>]*>暂不认识<\/button>[\s\S]*bindtap="markWordReadingKnown">\{\{pictureNamingNumber === pictureNamingTotal \? '认识，完成' : '下一个'\}\}<\/button>/);
  assert.doesNotMatch(template, /孩子读完后，由家长选择是否认识|修改判断/);
  assert.match(template, /不推算完整英语词汇量/);
  assert.match(template, /bindtap="openPictureNamingWordList"[^>]*>\s*<text>测评结果<\/text>/);
  assert.match(template, /class="xf-picture-naming-interpretation">[\s\S]*怎么理解这次结果？[\s\S]*wx:for="\{\{analysisParagraphs\}\}"/);
  assert.match(template, /wx:if="\{\{resultType !== 'pictureNaming'\}\}" class="xf-flash-analysis-card"/);
  assert.equal(template.match(/怎么理解这次结果？/g)?.length, 1);
  assert.match(styles, /\.xf-picture-naming-interpretation\s*\{[^}]*border-top:\s*2rpx solid #eee8f7[^}]*text-align:\s*left/s);
  assert.match(template, /wx:if="\{\{pictureNamingWordListOpen\}\}" class="xf-flash-character-list-mask"/);
  assert.match(template, /暂不认识的单词（\{\{pictureNamingUnknownWords\.length\}\}）/);
  assert.match(template, /认识的单词（\{\{pictureNamingKnownWords\.length\}\}）/);
  assert.match(template, /bindtap="openEnglishWordPackDrawer"/);
  assert.match(template, /wx:if="\{\{englishWordPackOpen\}\}" class="xf-flash-character-list-mask"/);
  assert.match(template, /50 个已收集词 · 分 5 组完成/);
  assert.match(template, /每个词都可在单词和对应实拍照片之间点击切换/);
  assert.match(source, /selectEnglishWordPack\(event\)/);
  assert.match(source, /englishWordPackId: assessmentId === "english-picture-naming" \? this\.data\.englishWordPackId : undefined/);
  assert.doesNotMatch(template, /togglePictureNamingRecording|skipPictureNamingWord|开始说英文|ASR 识别校准/);
  assert.match(template, /class="xf-picture-naming-card \{\{englishCardView === 'picture' \? 'is-photo-view' : ''\}\}"/);
  assert.match(styles, /\.xf-picture-naming-card\.is-photo-view\s*\{[^}]*padding:\s*0[^}]*overflow:\s*hidden/s);
  assert.match(styles, /\.xf-picture-naming-photo-shell\s*\{[^}]*height:\s*660rpx[^}]*background:\s*#ffffff/s);
  assert.match(styles, /\.xf-picture-naming-card\.is-photo-view \.xf-picture-naming-photo-note\s*\{[^}]*padding:\s*18rpx 24rpx 22rpx[^}]*background:\s*#ffffff/s);
  assert.match(styles, /\.xf-picture-naming-word-shell\s*\{[^}]*height:\s*660rpx[^}]*background:\s*#f3f0f7/s);
  assert.match(styles, /\.xf-picture-naming-word\s*\{[^}]*font-size:\s*132rpx/s);
  assert.match(styles, /\.xf-picture-naming-ipa\s*\{[^}]*font-size:\s*34rpx/s);
  assert.match(styles, /\.xf-flash-pronunciation-button\s*\{[^}]*position:\s*absolute[^}]*border-radius:\s*999rpx/s);
  assert.match(styles, /\.xf-english-card-flip-hint\s*\{[^}]*position:\s*absolute[^}]*border-radius:\s*999rpx/s);
  assert.match(styles, /\.xf-english-pack-item\.is-active\s*\{[^}]*border-color:\s*#8d4cf3/s);
  assert.doesNotMatch(styles, /\.xf-english-result-mode-link|\.xf-picture-naming-record/);
  assert.match(styles, /\.xf-picture-naming-word-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(styles, /\.xf-picture-naming-word-chip\s*\{[^}]*min-height:\s*68rpx/s);
  assert.equal(fs.existsSync(path.join(photoDirectory, "README.md")), true);
  for (const name of jpegPhotoNames) {
    const filePath = path.join(photoDirectory, `${name}.jpg`);
    assert.equal(fs.existsSync(filePath), true, `${name}.jpg should exist`);
    assert.equal(fs.readFileSync(filePath).subarray(0, 2).toString("hex"), "ffd8", `${name}.jpg should be a JPEG`);
  }
  for (const name of webpPhotoNames) {
    const filePath = path.join(photoDirectory, `${name}.webp`);
    const header = fs.readFileSync(filePath).subarray(0, 12);
    assert.equal(fs.existsSync(filePath), true, `${name}.webp should exist`);
    assert.equal(header.subarray(0, 4).toString("ascii"), "RIFF", `${name}.webp should be a WebP`);
    assert.equal(header.subarray(8, 12).toString("ascii"), "WEBP", `${name}.webp should be a WebP`);
  }
});

test("English words and enlarged Chinese characters can play audio without opening a recorder", async () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  const requests = [];
  const playedFiles = [];
  const audio = {
    src: "",
    stop() {},
    play() { playedFiles.push(this.src); },
    onEnded(callback) { this.ended = callback; },
    onError(callback) { this.failed = callback; },
    destroy() {}
  };
  const context = {
    ...definition,
    data: {
      ...definition.data,
      englishPromptMode: "word",
      recognitionFocusCharacter: "字"
    },
    pronunciationAudioPaths: {},
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      env: { USER_DATA_PATH: "/tmp" },
      getStorageSync() { return "jwt-token"; },
      request(options) {
        requests.push(options.data);
        options.success({ statusCode: 200, data: { audioBase64: "bXAz" } });
      },
      getFileSystemManager() {
        return { writeFile(options) { options.success(); } };
      },
      createInnerAudioContext() { return audio; },
      showToast() {}
    };

    await definition.playEnglishWordPronunciation.call(context);
    await definition.playRecognitionCharacterPronunciation.call(context);
    assert.deepEqual(requests, [
      { kind: "english-word", itemId: "animal-cat" },
      { kind: "chinese-character", character: "字" }
    ]);
    assert.deepEqual(playedFiles, [
      "/tmp/xf-pronunciation-english-word-63-61-74.mp3",
      "/tmp/xf-pronunciation-chinese-character-5b57.mp3"
    ]);
  } finally {
    global.wx = originalWx;
  }
});

test("word reading records each judgment and resets the next item to its word view", () => {
  const definition = loadFlashPageDefinition();
  const context = {
    ...definition,
    data: {
      ...definition.data,
      englishPromptMode: "word",
      englishCardView: "picture",
      pictureNamingIndex: 0,
      pictureNamingNumber: 1,
      pictureNamingItem: definition.data.pictureNamingItem
    },
    pictureNamingAttempts: [],
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  definition.markWordReadingKnown.call(context);
  assert.deepEqual(context.pictureNamingAttempts[0], {
    itemId: "animal-cat",
    recognizedText: "",
    status: "matched"
  });
  assert.equal(context.data.pictureNamingIndex, 1);
  assert.equal(context.data.englishCardView, "word");

  context.data.englishCardView = "picture";
  definition.markWordReadingUnknown.call(context);
  assert.deepEqual(context.pictureNamingAttempts[1], {
    itemId: "animal-dog",
    recognizedText: "",
    status: "skipped"
  });
  assert.equal(context.data.pictureNamingIndex, 2);
  assert.equal(context.data.englishCardView, "word");
});

test("collected words are exposed as five packs and every card can switch to its photo", () => {
  const definition = loadFlashPageDefinition();
  const template = fs.readFileSync(path.join(currentDirectory, "index.wxml"), "utf8");
  const styles = fs.readFileSync(path.join(currentDirectory, "index.wxss"), "utf8");
  const context = {
    ...definition,
    data: {
      ...definition.data,
      englishWordPackId: "food",
      englishCardView: "picture"
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  assert.equal(context.data.englishWordPacks.length, 5);
  assert.equal(context.data.englishWordPacks.reduce((sum, pack) => sum + pack.itemCount, 0), 50);
  assert.equal(context.data.englishWordPacks.every((pack) => pack.imageCount === 10), true);
  definition.showPictureNamingItem.call(context, 0);
  assert.equal(context.data.pictureNamingItem.word, "apple");
  assert.equal(context.data.pictureNamingItem.image.endsWith("/apple.webp"), true);
  context.data.englishCardView = "word";
  definition.toggleEnglishCardView.call(context);
  assert.equal(context.data.englishCardView, "picture");

  const cardPosition = template.indexOf('class="xf-picture-naming-card"');
  const packTriggerPosition = template.indexOf('class="xf-english-pack-trigger"');
  const actionsPosition = template.indexOf('class="xf-picture-naming-actions"');
  assert.ok(cardPosition < packTriggerPosition && packTriggerPosition < actionsPosition);
  assert.equal(template.match(/class="xf-english-pack-trigger"/g)?.length, 1);
  assert.match(styles, /\.xf-english-pack-trigger\s*\{[^}]*margin:\s*18rpx auto 0/s);

  context.englishWordPackMasteries = {
    animals: { matchedCount: 8, totalCount: 10 },
    food: { matchedCount: 4, totalCount: 10 }
  };
  const packCards = definition.buildEnglishWordPackCards.call(context);
  assert.deepEqual(packCards.map((item) => ({
    id: item.id,
    recognizedDisplay: item.recognizedDisplay,
    masteryLabel: item.masteryLabel,
    actionLabel: item.actionLabel
  })), [
    { id: "animals", recognizedDisplay: "8", masteryLabel: "认识 8 个 · 暂不认识 2 个", actionLabel: "复查" },
    { id: "food", recognizedDisplay: "4", masteryLabel: "认识 4 个 · 暂不认识 6 个", actionLabel: "复查" },
    { id: "home-school", recognizedDisplay: "—", masteryLabel: "待测试", actionLabel: "开始" },
    { id: "body-clothing", recognizedDisplay: "—", masteryLabel: "待测试", actionLabel: "开始" },
    { id: "transport-nature", recognizedDisplay: "—", masteryLabel: "待测试", actionLabel: "开始" }
  ]);
  assert.match(template, /wx:for="\{\{englishWordPackCards\}\}"/);
  assert.match(template, /<button[\s\S]*wx:for="\{\{englishWordPackCards\}\}"[\s\S]*class="xf-flash-recognition-next-group xf-english-word-pack-result-card"/);
  assert.match(template, /catchtap="openEnglishWordPackResult"/);
  assert.match(template, /第 \{\{item\.order\}\} 组 · \{\{item\.title\}\}/);
});

test("English result pack cards start or review the selected pack like recognition groups", () => {
  const definition = loadFlashPageDefinition();
  let restarted = 0;
  const context = {
    ...definition,
    data: {
      ...definition.data,
      resultType: "pictureNaming",
      selectedTestId: "english-picture-naming",
      selectedChildId: "child-1",
      selectedChildName: "小读者",
      englishWordPackId: "animals"
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    restartAssessment() {
      restarted += 1;
      return Promise.resolve(false);
    }
  };

  definition.openEnglishWordPackResult.call(context, { currentTarget: { dataset: { id: "food" } } });
  assert.equal(context.data.englishWordPackId, "food");
  assert.equal(context.data.englishWordPackTitle, "食物与饮品");
  assert.equal(restarted, 1);
});

test("finishing an English word pack updates its result card before remote save completes", () => {
  const definition = loadFlashPageDefinition();
  let saveAttempts = 0;
  const context = {
    ...definition,
    data: {
      ...definition.data,
      selectedTestId: "english-picture-naming",
      englishWordPackId: "animals"
    },
    pictureNamingAttempts: definition.getActiveEnglishWordBank.call({
      ...definition,
      data: { ...definition.data, englishWordPackId: "animals" }
    }).map((item, index) => ({
      itemId: item.id,
      recognizedText: "",
      status: index < 7 ? "matched" : "skipped"
    })),
    englishWordPackMasteries: {
      food: { matchedCount: 4, totalCount: 10 }
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    persistAssessmentResult() {
      saveAttempts += 1;
      return Promise.resolve();
    }
  };

  definition.finishPictureNaming.call(context);

  assert.equal(saveAttempts, 1);
  assert.equal(context.data.stage, "result");
  assert.equal(context.data.englishWordPackCards[0].recognizedDisplay, "7");
  assert.equal(context.data.englishWordPackCards[0].masteryLabel, "认识 7 个 · 暂不认识 3 个");
  assert.equal(context.data.englishWordPackCards[0].actionLabel, "复查");
  assert.equal(context.data.englishWordPackCards[1].recognizedDisplay, "4");
});

test("switching to a word pack without matching history starts that pack instead of showing stale results", async () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  const context = {
    ...definition,
    data: {
      ...definition.data,
      selectedTestId: "english-picture-naming",
      englishWordPackId: "food"
    },
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
        options.success({
          statusCode: 200,
          data: {
            englishWordPackResults: {
              animals: { matchedCount: 7, totalCount: 10 },
              food: null
            },
            results: [{
              assessmentId: "english-picture-naming",
              mode: "child",
              childId: "child-1",
              englishPromptMode: "word",
              englishWordPackId: "animals"
            }]
          }
        });
      }
    };

    const result = await definition.loadLatestResult.call(context, "child", { id: "child-1" });
    assert.equal(result, null);
    assert.equal(context.data.englishWordPackCards[0].masteryLabel, "认识 7 个 · 暂不认识 3 个");
    assert.equal(context.data.englishWordPackCards[1].masteryLabel, "待测试");
  } finally {
    global.wx = originalWx;
  }
});

test("word-reading results restore known and unknown words into a two-tab drawer", () => {
  const definition = loadFlashPageDefinition();
  const words = ["cat", "dog", "bird", "fish", "duck", "horse", "cow", "sheep", "elephant", "monkey"];
  const pictureNamingAnswers = words.map((targetWord, index) => ({
    itemId: `animal-${targetWord}`,
    targetWord,
    recognizedText: "",
    status: index < 4 ? "matched" : "skipped"
  }));
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  definition.showSavedResult.call(context, {
    id: "saved-word-reading-result",
    assessmentId: "english-picture-naming",
    englishPromptMode: "word",
    mode: "child",
    childId: "child-reader",
    childName: "小读者",
    pictureNamingSummary: {
      totalCount: 10,
      matchedCount: 4,
      needsPracticeCount: 0,
      skippedCount: 6
    },
    pictureNamingAnswers
  });

  assert.deepEqual(context.data.pictureNamingKnownWords, []);
  assert.deepEqual(context.data.pictureNamingUnknownWords, []);
  assert.equal(context.data.analysisParagraphs.some((item) => item.includes("cat")), false);
  definition.openPictureNamingWordList.call(context);
  assert.equal(context.data.pictureNamingWordListOpen, true);
  assert.equal(context.data.pictureNamingWordListTab, "unknown");
  assert.deepEqual(context.data.pictureNamingKnownWords, words.slice(0, 4));
  assert.deepEqual(context.data.pictureNamingUnknownWords, words.slice(4));
  definition.switchPictureNamingWordListTab.call(context, { currentTarget: { dataset: { tab: "known" } } });
  assert.equal(context.data.pictureNamingWordListTab, "known");
  definition.closePictureNamingWordList.call(context);
  definition.openPictureNamingWordList.call(context);
  assert.equal(context.data.pictureNamingWordListTab, "unknown");
  definition.closePictureNamingWordList.call(context);
  assert.equal(context.data.pictureNamingWordListOpen, false);
});

test("English results expose education and assessment design references like character recognition", () => {
  const definition = loadFlashPageDefinition();
  const source = fs.readFileSync(path.join(currentDirectory, "index.js"), "utf8");
  const template = fs.readFileSync(path.join(currentDirectory, "index.wxml"), "utf8");
  const styles = fs.readFileSync(path.join(currentDirectory, "index.wxss"), "utf8");
  const copied = [];
  const originalWx = global.wx;
  const context = {
    ...definition,
    data: { ...definition.data, selectedTestId: "english-picture-naming" },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      setClipboardData(options) {
        copied.push(options.data);
      }
    };
    assert.equal(context.data.englishAssessmentReferences.length, 3);
    assert.match(source, /CEFR Companion Volume/);
    assert.match(source, /Pre A1 Starters, Movers and Flyers word list/);
    assert.doesNotMatch(source, /Best Practices for Constructed-Response Scoring|ETS/);
    assert.match(template, /bindtap="openEnglishAssessmentDesign"/);
    assert.match(template, /英文工具设计参考/);
    assert.match(template, /CEFR 活动框架 · Pre A1 词表 · 儿童任务示例/);
    assert.match(template, /英文单词闪测设计参考/);
    assert.match(template, /不代表 Council of Europe 或 Cambridge 对本测试的认证/);
    assert.match(template, /本工具用途：\{\{item\.purpose\}\}/);
    assert.match(template, /catchtap="copyEnglishAssessmentReference"/);
    assert.doesNotMatch(template, /工程化六层/);
    assert.doesNotMatch(template, /火山引擎/);
    assert.doesNotMatch(styles, /xf-english-design-layer/);

    definition.openEnglishAssessmentDesign.call(context);
    assert.equal(context.data.englishAssessmentDesignOpen, true);
    definition.copyEnglishAssessmentReference.call(context, { currentTarget: { dataset: { id: "cefr-2020" } } });
    assert.deepEqual(copied, ["https://www.coe.int/en/web/common-european-framework-reference-languages/cefr-companion-volume-and-its-language-versions"]);
    definition.closeEnglishAssessmentDesign.call(context);
    assert.equal(context.data.englishAssessmentDesignOpen, false);
  } finally {
    global.wx = originalWx;
  }
});

test("English entry uses one word-reading result while card view changes preserve the same item", async () => {
  const definition = loadFlashPageDefinition();
  const source = fs.readFileSync(path.join(currentDirectory, "index.js"), "utf8");
  const originalWx = global.wx;
  const context = {
    ...definition,
    data: {
      ...definition.data,
      selectedTestId: "english-picture-naming",
      selectedTestChildOnly: true,
      englishPromptMode: "word",
      englishCardView: "word",
      stage: "picture-naming",
      pictureNamingIndex: 2,
      mode: "child",
      selectedChildId: "child-reader"
    },
    answers: [],
    pictureNamingAttempts: [
      { itemId: "animal-cat", status: "matched" },
      { itemId: "animal-dog", status: "skipped" }
    ],
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    resolveChildOnlyAssessment() {
      this.childResolutionStarted = true;
      return Promise.resolve(true);
    }
  };
  try {
    global.wx = {
      getStorageSync(key) { return key === "xf_token" ? "jwt-token" : ""; },
      setStorageSync() {}
    };
    await definition.openAssessment.call(context, { currentTarget: { dataset: { id: "english-picture-naming" } } });
    assert.equal(context.data.subjectModalOpen, false);
    assert.equal(context.childResolutionStarted, true);

    definition.toggleEnglishCardView.call(context);
    assert.equal(context.data.englishCardView, "picture");
    assert.equal(context.data.englishPromptMode, "word");
    assert.equal(context.data.pictureNamingIndex, 2);
    assert.deepEqual(context.pictureNamingAttempts, [
      { itemId: "animal-cat", status: "matched" },
      { itemId: "animal-dog", status: "skipped" }
    ]);
    definition.toggleEnglishCardView.call(context);
    assert.equal(context.data.englishCardView, "word");
    assert.equal(context.data.pictureNamingIndex, 2);
    assert.match(source, /\? "&englishPromptMode=word"/);
    assert.match(source, /englishPromptMode:\s*assessmentId === "english-picture-naming" \? "word" : undefined/);
  } finally {
    global.wx = originalWx;
  }
});

test("word reading can complete all ten items when every word is marked unknown", () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  let persisted = false;
  const context = {
    ...definition,
    data: { ...definition.data, selectedTestId: "english-picture-naming" },
    pictureNamingAttempts: [],
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    persistAssessmentResult() {
      persisted = true;
    }
  };
  try {
    global.wx = { setStorageSync() {} };
    definition.startAssessment.call(context, "child", { id: "child-1", name: "小圆子" });
    assert.equal(context.data.stage, "picture-naming");
    for (let index = 0; index < 10; index += 1) {
      definition.markWordReadingUnknown.call(context);
    }
    assert.equal(context.data.stage, "result");
    assert.equal(context.data.resultType, "pictureNaming");
    assert.equal(context.data.pictureNamingSummary.skippedCount, 10);
    assert.equal(context.data.pictureNamingAnswers.length, 10);
    assert.equal(persisted, true);
  } finally {
    global.wx = originalWx;
  }
});

test("English word reading has no mini-program recording permission or ASR interaction", () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(miniProgramRoot, "app.json"), "utf8"));
  const source = fs.readFileSync(path.join(currentDirectory, "index.js"), "utf8");
  const template = fs.readFileSync(path.join(currentDirectory, "index.wxml"), "utf8");

  assert.equal(appConfig.permission?.["scope.record"], undefined);
  assert.doesNotMatch(source, /getRecorderManager|wx\.uploadFile|english-picture-naming\/recognize/);
  assert.doesNotMatch(template, /开始说英文|停止录音|识别中|再说一次/);
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
  const originalWx = global.wx;
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  global.wx = { getStorageSync() { return ""; } };
  try {
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
    assert.equal(context.data.stage, "questions");
    assert.equal(context.data.subjectModalOpen, false);

    context.answers = Array(40).fill(4);
    context.data.mode = "";
    return definition.restartAssessment.call(context).then(() => {
      assert.equal(context.data.stage, "catalog");
      assert.equal(context.data.subjectModalOpen, true);
      assert.equal(context.answers.every((answer) => answer === null), true);
    });
  } finally {
    global.wx = originalWx;
  }
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
  let completeRequest = null;
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

    await definition.restartAssessment.call(context);
    assert.equal(context.forceNewAssessment, false);
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

test("all flash tests restore the last-used self or child subject", async () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  const storage = new Map([
    ["xf_token", "jwt-token"],
    ["xf_flash_test_last_mode_v1", "self"],
    ["xiaowanzi_last_child_id_v1", "child-2"]
  ]);
  const children = [
    { id: "child-1", name: "小圆子" },
    { id: "child-2", name: "小豆子" }
  ];
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    loadChildChoices() {
      return children;
    },
    openSavedResultOrStart(mode, child) {
      this.openedSubject = { mode, child: child || null };
      return Promise.resolve(true);
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      }
    };
    await definition.openAssessment.call(context, { currentTarget: { dataset: { id: "eight-talents" } } });
    assert.deepEqual(context.openedSubject, { mode: "self", child: null });
    assert.equal(context.data.subjectModalOpen, false);

    storage.set("xf_flash_test_last_mode_v1", "child");
    await definition.openAssessment.call(context, { currentTarget: { dataset: { id: "eight-talents" } } });
    assert.deepEqual(context.openedSubject, { mode: "child", child: children[1] });
    assert.equal(context.data.subjectModalOpen, false);

    context.data = { ...context.data, stage: "questions", selectedTestChildOnly: false };
    definition.reselectAssessmentSubject.call(context);
    assert.equal(context.data.stage, "catalog");
    assert.equal(context.data.subjectModalOpen, true);
  } finally {
    global.wx = originalWx;
  }
});

test("child-only tests start the sole child directly and otherwise open archive selection", async () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  const storage = new Map([["xf_token", "jwt-token"]]);
  let children = [{ id: "child-1", name: "小圆子" }];
  const context = {
    ...definition,
    data: {
      ...definition.data,
      youngChildWarningOpen: true,
      youngChildName: "旧孩子",
      youngChildGrade: "小学一年级"
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    loadChildChoices() {
      return children;
    },
    openSavedResultOrStart(mode, child) {
      this.openedSubject = { mode, child };
      return Promise.resolve(true);
    },
    prepareChildAssessment() {
      this.archiveOpened = true;
    },
    saveActiveRecognitionProgress() {
      this.progressSaved = true;
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      }
    };
    await definition.openAssessment.call(context, { currentTarget: { dataset: { id: "character-recognition" } } });
    assert.equal(context.data.subjectModalOpen, false);
    assert.equal(context.data.youngChildWarningOpen, false);
    assert.deepEqual(context.openedSubject, { mode: "child", child: children[0] });
    assert.equal(context.archiveOpened, undefined);

    context.openedSubject = null;
    children = [
      { id: "child-1", name: "小圆子" },
      { id: "child-2", name: "小豆子" }
    ];
    await definition.openAssessment.call(context, { currentTarget: { dataset: { id: "character-recognition" } } });
    assert.equal(context.openedSubject, null);
    assert.equal(context.archiveOpened, true);

    context.archiveOpened = false;
    children = [];
    await definition.openAssessment.call(context, { currentTarget: { dataset: { id: "character-recognition" } } });
    assert.equal(context.openedSubject, null);
    assert.equal(context.archiveOpened, true);

    context.data.stage = "recognition";
    definition.reselectAssessmentSubject.call(context);
    assert.equal(context.progressSaved, true);
    assert.equal(context.archiveOpened, true);
  } finally {
    global.wx = originalWx;
  }
});

test("character recognition reuses the child archive and resumes a 40-page exact checklist", async () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  const storage = new Map([["xf_token", "jwt-token"]]);
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
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      removeStorageSync(key) {
        storage.delete(key);
      }
    };
    definition.openAssessment.call(context, { currentTarget: { dataset: { id: "character-recognition" } } });
    assert.equal(context.data.selectedTestTitle, "识字量");
    assert.equal(context.data.selectedTestChildOnly, true);
    await definition.chooseMode.call(context, { currentTarget: { dataset: { mode: "self" } } });
    assert.equal(context.archiveOpened, true);

    definition.startAssessment.call(context, "child", { id: "child-1", name: "小读者" });
    assert.equal(context.data.stage, "recognition");
    assert.deepEqual(context.recognitionSample, BASE_CHARACTER_BANK);
    assert.equal(context.data.recognitionPageCharacters.length, 20);
    assert.equal(context.data.recognitionPageCount, 40);
    assert.equal(context.answers.length, 800);
    assert.equal(context.data.mode, "child");

    definition.openRecognitionCharacterFocus.call(context, { currentTarget: { dataset: { index: 0 } } });
    assert.equal(context.data.recognitionFocusOpen, true);
    assert.equal(context.data.recognitionFocusCharacter, CHARACTER_BANK[0]);
    assert.equal(context.answers[0], null);
    definition.markFocusedRecognitionCharacter.call(context, { currentTarget: { dataset: { answer: 0 } } });
    assert.equal(context.data.recognitionFocusOpen, false);
    assert.equal(context.answers[0], 0);
    assert.equal(storage.get("xf_character_recognition_progress_v2_child-1_1").answers[0], 0);
    definition.confirmRecognitionPage.call(context);
    assert.equal(context.answers[0], 0);
    assert.ok(context.answers.slice(1, 20).every((answer) => answer === 1));
    assert.equal(context.data.recognitionPageNumber, 2);
    assert.equal(storage.get("xf_character_recognition_progress_v2_child-1_1").pageIndex, 1);
    definition.goBack.call(context);
    assert.equal(context.data.recognitionExitOpen, true);
    assert.equal(context.data.recognitionPageNumber, 2);
    definition.continueRecognitionAssessmentFromExit.call(context);
    assert.equal(context.data.recognitionExitOpen, false);
    definition.goBack.call(context);
    definition.saveRecognitionAndExit.call(context);
    assert.equal(context.data.stage, "catalog");
    assert.equal(context.data.recognitionExitOpen, false);
    assert.equal(storage.get("xf_character_recognition_progress_v2_child-1_1").pageIndex, 1);
    definition.startAssessment.call(context, "child", { id: "child-1", name: "小读者" });
    assert.equal(context.data.recognitionPageNumber, 2);
    definition.previousRecognitionPage.call(context);
    assert.equal(context.data.recognitionPageNumber, 1);

    assert.equal(storage.has("xf_character_recognition_progress_v2_child-1_1"), true);
  } finally {
    global.wx = originalWx;
  }
});

test("character recognition presents large multi-character selection and an exact 800-character result", () => {
  const source = fs.readFileSync(path.join(currentDirectory, "index.js"), "utf8");
  const template = fs.readFileSync(path.join(currentDirectory, "index.wxml"), "utf8");
  const styles = fs.readFileSync(path.join(currentDirectory, "index.wxss"), "utf8");

  assert.match(template, /点字放大后判断/);
  assert.match(template, /wx:for="\{\{recognitionPageCharacters\}\}"/);
  assert.match(template, /bindtap="openRecognitionCharacterFocus"/);
  assert.match(template, /这个字认识吗？/);
  assert.match(template, /catchtap="playRecognitionCharacterPronunciation"/);
  assert.match(template, /点大字听读音/);
  assert.match(template, /标记为不认识/);
  assert.match(template, /bindtap="markFocusedRecognitionCharacter"/);
  assert.match(template, /第 \{\{recognitionGroupNumber\}\} 组/);
  assert.match(template, /本组第 \{\{recognitionGroupPageNumber\}\} \/ \{\{recognitionGroupPageCount\}\} 页/);
  assert.match(template, /点字不会直接改变结果/);
  assert.match(template, /要先保存，下次继续吗？/);
  assert.match(template, /保存进度并退出/);
  assert.match(template, /catchtap="saveRecognitionAndExit"/);
  assert.match(styles, /\.xf-flash-recognition-exit-mask\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0/s);
  assert.match(template, /recognitionIsLegacyCumulative \? '旧版累计 1600 字已逐字筛选完成'/);
  assert.match(template, /第 ' \+ recognitionGroupNumber \+ ' 组 800 字已逐字筛选完成/);
  assert.match(template, /\{\{selectedChildName\}\}认识的字/);
  assert.doesNotMatch(template, /\{\{selectedChildName\}\}会和不会的字/);
  assert.match(template, /这是旧版累计 1600 字的逐字筛选结果/);
  assert.match(template, /这是第 ' \+ recognitionGroupNumber \+ ' 组 800 字的逐字筛选结果/);
  assert.match(template, /bindtap="openRecognitionGroup"/);
  assert.match(template, /wx:for="\{\{recognitionGroupCards\}\}"/);
  assert.match(template, /\{\{item\.recognizedDisplay\}\}/);
  assert.match(template, /\{\{item\.masteryLabel\}\}/);
  assert.match(template, /width: \{\{item\.masteryPercent\}\}%/);
  assert.match(template, /\{\{item\.actionLabel\}\} ›/);
  assert.match(template, /class="xf-flash-recognition-next-group/);
  assert.match(template, /wx:if="\{\{resultType === 'recognition'\}\}" class="xf-flash-recognition-group-cards/);
  assert.match(source, /title: recognitionGroup === 2 \? "进阶 800 字" : "基础 800 字"/);
  assert.match(source, /masteryLabel: completed \? `掌握 \$\{masteryPercent\}%`/);
  assert.match(source, /actionLabel: completed \? "复查" : inProgress \? "继续" : "开始"/);
  assert.doesNotMatch(template, /进入第 1 组|进入第 2 组|第 2 组 · 后 800 字|xf-flash-recognition-next-button/);
  assert.doesNotMatch(template, /720|重新检查第 1 组|暂未开放|开放第 2 组/);
  assert.ok(
    template.indexOf("xf-flash-recognition-next-group") > template.indexOf("xf-flash-save-status"),
    "second-group entry should be placed in the bottom action area"
  );
  assert.ok(template.indexOf("xf-flash-recognition-next-group") < template.indexOf("xf-flash-result-note"));
  assert.match(styles, /\.xf-flash-recognition-next-group\s*\{[^}]*background:\s*#ffffff[^}]*box-shadow:/s);
  assert.match(styles, /\.xf-flash-recognition-mastery-track\s*\{/);
  assert.match(styles, /\.xf-flash-recognition-next-group-action\s*\{/);
  assert.doesNotMatch(template, /xf-flash-recognition-next-group-index|xf-flash-recognition-next-group-status|xf-flash-recognition-next-group-note/);
  assert.doesNotMatch(styles, /xf-flash-recognition-next-group::before|xf-flash-recognition-next-group-status|xf-flash-recognition-next-group-foot/);
  assert.match(template, /两组各 800 字，都可以随时进入/);
  assert.doesNotMatch(template, /分成 40 组/);
  assert.match(template, />上一页<\/button>/);
  assert.match(template, /确认本页，下一页/);
  assert.match(template, />测评结果<\/text>/);
  assert.match(styles, /\.xf-flash-recognition-list-entry\s*\{[^}]*justify-content:\s*center[^}]*width:\s*fit-content[^}]*margin:\s*20rpx auto 0[^}]*background:\s*transparent/s);
  assert.match(styles, /\.xf-flash-recognition-list-entry text \+ text\s*\{[^}]*margin-left:\s*6rpx/s);
  assert.match(template, /还不认识的字（\{\{recognitionUnknownCharacters\.length\}\}）/);
  assert.match(template, /认识的字（\{\{recognitionKnownCharacters\.length\}\}）/);
  assert.match(template, /recognitionCharacterListTab === 'unknown'/);
  assert.match(template, /data-tab="unknown"[\s\S]*data-tab="known"/);
  assert.match(template, /catchtap="switchRecognitionCharacterListTab"/);
  assert.match(template, /bindtap="openRecognitionCharacterList"/);
  assert.match(template, /catchtap="closeRecognitionCharacterList"/);
  assert.match(source, /buildRecognitionCharacterGroups/);
  assert.match(styles, /\.xf-flash-recognition-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, 1fr\)/s);
  assert.match(styles, /\.xf-flash-recognition-tile\s*\{[^}]*height:\s*118rpx[^}]*font-size:\s*62rpx/s);
  assert.match(styles, /\.xf-flash-recognition-tile\.is-unknown\s*\{/);
  assert.match(styles, /\.xf-flash-recognition-focus-character\s*\{[^}]*font-size:\s*320rpx/s);
  assert.doesNotMatch(template, /辅助参考区间|估算约/);
});

test("character recognition allows either group regardless of the first-group result", () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  const storage = new Map();
  const context = {
    ...definition,
    data: {
      ...definition.data,
      stage: "result",
      resultType: "recognition",
      resultSaveState: "saved",
      selectedChildId: "child-locked",
      selectedChildName: "小读者",
      recognitionGroupNumber: 1
    },
    answers: [...Array(719).fill(1), ...Array(81).fill(0)],
    recognitionSample: BASE_CHARACTER_BANK.slice(),
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    showRecognitionPage(index) {
      this.shownPage = index;
    }
  };
  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      }
    };
    definition.openRecognitionGroup.call(context, { currentTarget: { dataset: { group: 2 } } });
    assert.equal(context.data.stage, "recognition");
    assert.equal(context.data.recognitionGroupNumber, 2);
    assert.equal(context.data.recognitionIsAdvanced, true);
    assert.equal(context.answers.length, 800);
    assert.deepEqual(context.recognitionSample, ADVANCED_CHARACTER_BANK);
    assert.equal(context.shownPage, 0);
  } finally {
    global.wx = originalWx;
  }
});

test("second recognition group resumes its own saved page for the same child", () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  const advancedAnswers = [...Array(100).fill(1), ...Array(700).fill(null)];
  const storage = new Map([[
    "xf_character_recognition_progress_v2_child-advanced_2",
    { version: "2026-08-13-r3", recognitionGroup: 2, pageIndex: 5, answers: advancedAnswers }
  ]]);
  const context = {
    ...definition,
    data: {
      ...definition.data,
      stage: "result",
      resultType: "recognition",
      resultSaveState: "saved",
      selectedChildId: "child-advanced",
      selectedChildName: "小读者",
      recognitionIsAdvanced: false
    },
    answers: Array(800).fill(1),
    recognitionSample: BASE_CHARACTER_BANK.slice(),
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      }
    };
    definition.openRecognitionGroup.call(context, { currentTarget: { dataset: { group: 2 } } });
    assert.equal(context.data.stage, "recognition");
    assert.equal(context.data.recognitionPageNumber, 6);
    assert.equal(context.data.recognitionIsAdvanced, true);
    assert.deepEqual(context.answers, advancedAnswers);
    assert.deepEqual(context.recognitionSample, ADVANCED_CHARACTER_BANK);
  } finally {
    global.wx = originalWx;
  }
});

test("recognition group cards show independent local progress before completion", () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  const storage = new Map([[
    "xf_character_recognition_progress_v2_child-progress_2",
    {
      version: "2026-08-13-r3",
      recognitionGroup: 2,
      pageIndex: 2,
      answers: [...Array(45).fill(1), ...Array(15).fill(0), ...Array(740).fill(null)]
    }
  ]]);
  const context = {
    ...definition,
    data: { ...definition.data, selectedChildId: "child-progress" },
    recognitionGroupMasteries: {
      1: { recognitionGroup: 1, recognizedCount: 700, sampledCount: 800 }
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      }
    };
    const cards = definition.buildRecognitionGroupCards.call(context, "child-progress");
    assert.deepEqual(cards.map((item) => ({
      title: item.title,
      recognizedDisplay: item.recognizedDisplay,
      masteryLabel: item.masteryLabel,
      actionLabel: item.actionLabel
    })), [
      {
        title: "基础 800 字",
        recognizedDisplay: "700",
        masteryLabel: "掌握 88%",
        actionLabel: "复查"
      },
      {
        title: "进阶 800 字",
        recognizedDisplay: "45",
        masteryLabel: "当前 6%",
        actionLabel: "继续"
      }
    ]);
  } finally {
    global.wx = originalWx;
  }
});

test("character recognition presents verifiable design sources without implying official certification", () => {
  const definition = loadFlashPageDefinition();
  const source = fs.readFileSync(path.join(currentDirectory, "index.js"), "utf8");
  const template = fs.readFileSync(path.join(currentDirectory, "index.wxml"), "utf8");
  const styles = fs.readFileSync(path.join(currentDirectory, "index.wxss"), "utf8");
  const copied = [];
  const originalWx = global.wx;
  const context = {
    ...definition,
    data: { ...definition.data, selectedTestId: "character-recognition" },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      setClipboardData(options) {
        copied.push(options.data);
      }
    };
    assert.equal(context.data.recognitionSources.length, 8);
    assert.match(source, /统编小学语文教材识字写字内容的修订思路/);
    assert.match(source, /义务教育语文课程标准（2022年版）/);
    assert.match(source, /3—6岁儿童学习与发展指南/);
    assert.match(source, /通用规范汉字表/);
    assert.match(source, /2024 统编语文一年级上册识字表/);
    assert.match(source, /2024 统编语文一年级下册识字表/);
    assert.match(source, /2025 统编语文二年级上册识字表/);
    assert.match(source, /2024 统编语文二年级下册识字表/);
    assert.match(template, /设计依据与可核对来源/);
    assert.match(template, /识字工具设计参考/);
    assert.match(template, /不代表官方对本测试的认证/);
    assert.match(template, /不代表本工具的 800 或 1600 个具体字是官方统一字表/);
    assert.match(template, /非官方校对页/);
    assert.match(template, /catchtap="copyRecognitionSource"/);
    assert.match(styles, /\.xf-flash-source-summary\s*\{/);
    assert.match(styles, /\.xf-flash-source-disclaimer\s*\{/);
    assert.match(styles, /\.xf-flash-source-dialog\s*\{[^}]*display:\s*flex[^}]*height:\s*84vh[^}]*overflow:\s*hidden/s);
    assert.match(template, /class="xf-flash-character-list-dialog xf-flash-source-dialog xf-english-source-dialog"/);
    assert.match(styles, /\.xf-english-source-dialog\s*\{[^}]*height:\s*68vh[^}]*max-height:\s*68vh/s);
    assert.match(styles, /\.xf-flash-source-scroll\s*\{[^}]*flex:\s*1 1 auto[^}]*min-height:\s*0[^}]*height:\s*0[^}]*max-height:\s*none/s);

    definition.openRecognitionSources.call(context);
    assert.equal(context.data.recognitionSourcesOpen, true);
    definition.copyRecognitionSource.call(context, { currentTarget: { dataset: { id: "curriculum-standard" } } });
    assert.deepEqual(copied, ["https://www.moe.gov.cn/srcsite/A26/s8001/202204/t20220420_619921.html"]);
    definition.closeRecognitionSources.call(context);
    assert.equal(context.data.recognitionSourcesOpen, false);
  } finally {
    global.wx = originalWx;
  }
});

test("character recognition restores and opens all known and unknown characters", () => {
  const definition = loadFlashPageDefinition();
  const sampleCharacters = BASE_CHARACTER_BANK.slice();
  const answers = [...Array(512).fill(1), ...Array(288).fill(0)];
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  definition.showSavedResult.call(context, {
    id: "recognition-saved",
    assessmentId: "character-recognition",
    mode: "child",
    childId: "child-1",
    childName: "小读者",
    answers,
    sampleCharacters,
    recognitionGroups: {
      1: { recognitionGroup: 1, recognizedCount: 512, sampledCount: 800 },
      2: { recognitionGroup: 2, recognizedCount: 600, sampledCount: 800 }
    },
    recognitionSummary: {
      recognizedCount: 512,
      sampledCount: 800,
      cumulativeRecognizedCount: 512,
      cumulativeSampledCount: 800,
      completedRounds: 1,
      estimatedMin: 512,
      estimatedMax: 512,
      estimateLabel: "512",
      reference: "首批 800 字逐字筛选结果"
    }
  });

  assert.deepEqual(context.data.recognitionKnownCharacters, sampleCharacters.slice(0, 512));
  assert.deepEqual(context.data.recognitionUnknownCharacters, sampleCharacters.slice(512));
  assert.deepEqual(context.data.recognitionGroupCards.map((item) => ({
    title: item.title,
    recognizedDisplay: item.recognizedDisplay,
    masteryPercent: item.masteryPercent,
    actionLabel: item.actionLabel
  })), [
    { title: "基础 800 字", recognizedDisplay: "512", masteryPercent: 64, actionLabel: "复查" },
    { title: "进阶 800 字", recognizedDisplay: "600", masteryPercent: 75, actionLabel: "复查" }
  ]);
  definition.openRecognitionCharacterList.call(context);
  assert.equal(context.data.recognitionCharacterListOpen, true);
  assert.equal(context.data.recognitionCharacterListTab, "unknown");
  definition.switchRecognitionCharacterListTab.call(context, { currentTarget: { dataset: { tab: "known" } } });
  assert.equal(context.data.recognitionCharacterListTab, "known");
  definition.closeRecognitionCharacterList.call(context);
  definition.openRecognitionCharacterList.call(context);
  assert.equal(context.data.recognitionCharacterListTab, "unknown");
  definition.closeRecognitionCharacterList.call(context);
  assert.equal(context.data.recognitionCharacterListOpen, false);
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

test("character recognition submits the exact bank and clears progress only after saving", async () => {
  const definition = loadFlashPageDefinition();
  const originalWx = global.wx;
  let requestOptions = null;
  let completeRequest = null;
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
      recognitionGroupNumber: 1,
      recognitionIndex: 39
    },
    answers: [...Array(515).fill(1), ...Array(285).fill(0)],
    recognitionSample: BASE_CHARACTER_BANK.slice(),
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    let progressCleared = false;
    global.wx = {
      getStorageSync(key) {
        return key === "xf_token" ? "jwt-token" : "";
      },
      removeStorageSync() {
        progressCleared = true;
      },
      request(options) {
        requestOptions = options;
        completeRequest = () => options.success({
          statusCode: 201,
          data: {
            result: {
              id: "recognition-1",
              assessmentVersion: "2026-08-13-r3",
              recognitionGroup: 1,
              answers: context.answers,
              sampleCharacters: context.recognitionSample,
              recognitionSummary: {
                recognizedCount: 515,
                sampledCount: 800,
                cumulativeRecognizedCount: 515,
                cumulativeSampledCount: 800,
                completedRounds: 1,
                estimatedMin: 515,
                estimatedMax: 515,
                estimateLabel: "515",
                reference: "第 1 组 800 字逐字筛选结果"
              }
            }
          }
        });
      }
    };

    definition.finishCharacterRecognition.call(context);
    assert.equal(progressCleared, false);
    completeRequest();
    await context._resultSavePromise;
    assert.equal(requestOptions.data.assessmentId, "character-recognition");
    assert.equal(requestOptions.data.assessmentVersion, "2026-08-13-r3");
    assert.equal(requestOptions.data.recognitionGroup, 1);
    assert.equal(requestOptions.data.mode, "child");
    assert.equal(requestOptions.data.answers.length, 800);
    assert.deepEqual(requestOptions.data.sampleCharacters, context.recognitionSample);
    assert.equal(context.data.resultType, "recognition");
    assert.equal(context.data.resultSaveState, "saved");
    assert.equal(progressCleared, true);
    assert.deepEqual(context.data.recognitionKnownCharacters, context.recognitionSample.slice(0, 515));
    assert.deepEqual(context.data.recognitionUnknownCharacters, context.recognitionSample.slice(515));
  } finally {
    global.wx = originalWx;
  }
});
