import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pageDir = new URL("./", import.meta.url);
const miniRoot = new URL("../../", import.meta.url);

function readText(path) {
  return fs.readFileSync(new URL(path, pageDir), "utf8");
}

function loadExpertsPageDefinition() {
  const file = require.resolve("./index.js");
  delete require.cache[file];
  let definition = null;
  global.Page = (pageDefinition) => {
    definition = pageDefinition;
  };
  require(file);
  return definition;
}

function createExpertsContext(definition) {
  return {
    ...definition,
    data: { ...definition.data },
    setData(payload, callback) {
      this.data = { ...this.data, ...payload };
      if (typeof callback === "function") callback();
    }
  };
}

test("native experts page is registered and Xiaowanzi opens it directly", () => {
  const appJson = JSON.parse(fs.readFileSync(new URL("app.json", miniRoot), "utf8"));
  assert.ok(appJson.pages.includes("pages/experts/index"));

  const xiaowanziJs = fs.readFileSync(new URL("../xiaowanzi/index.js", pageDir), "utf8");
  assert.match(xiaowanziJs, /openKnowledgeHub\(\) \{[\s\S]*wx\.navigateTo\(\{ url: "\/pages\/experts\/index\?from=xiaowanzi" \}\);[\s\S]*\}/);
  assert.doesNotMatch(xiaowanziJs, /openKnowledgeHub\(\) \{[\s\S]*openWeb\("https:\/\/xianfeng\.xinzhi\.info\/experts\?xw_layer=1&xw_return=xiaowanzi"/);

  const nativeSettingsJs = fs.readFileSync(new URL("../../utils/nativeSettings.js", pageDir), "utf8");
  assert.match(nativeSettingsJs, /title: "先疯智库"[\s\S]*page: "\/pages\/experts\/index"/);
  assert.doesNotMatch(nativeSettingsJs, /title: "先疯智库"[\s\S]*path: "\/experts\?xw_layer=1&xw_return=xiaowanzi"/);

  const webviewJs = fs.readFileSync(new URL("../webview/index.js", pageDir), "utf8");
  assert.match(webviewJs, /goExpertsList\(\) \{[\s\S]*wx\.navigateTo\(\{ url: "\/pages\/experts\/index" \}\);[\s\S]*\}/);
});

test("native experts page mirrors mobile list structure and routes to native detail", async () => {
  const js = readText("index.js");
  const wxml = readText("index.wxml");
  const wxss = readText("index.wxss");
  const json = JSON.parse(readText("index.json"));

  assert.equal(json.navigationStyle, "custom");
  assert.match(js, /const EXPERTS_PAGE_SIZE = 10;/);
  assert.match(js, /let url = `\/api\/guests\?page=\$\{page\}&pageSize=\$\{EXPERTS_PAGE_SIZE\}`/);
  assert.match(js, /request\(\{ url \}\)/);
  assert.match(js, /agentEnabled: item\.agentEnabled === true/);
  assert.match(js, /const firstAgentGuestId = \(source\.find\(\(guest\) => guest\.agentEnabled === true\) \|\| \{\}\)\.id \|\| ""/);
  assert.match(js, /const showQuestionCard = guest\.agentEnabled === true && guest\.id === firstAgentGuestId/);
  assert.match(js, /wx\.navigateTo\(\{[\s\S]*\/pages\/webview\/index\?title=\$\{encodeURIComponent\("智库详情"\)\}&url=\$\{encodeURIComponent\(`\$\{DEFAULT_WEB_ORIGIN\}\/experts\/\$\{encodeURIComponent\(guest\.id\)\}`\)\}/);
  assert.match(wxml, /class="xf-experts-page/);
  assert.match(wxml, /placeholder="搜索嘉宾、主题、关键词"/);
  assert.match(wxml, /wx:for="\{\{filterTags\}\}"/);
  assert.match(wxml, /wx:for="\{\{guests\}\}"[\s\S]*class="xf-experts-card"/);
  assert.match(wxml, /<image[\s\S]*class="xf-experts-avatar \{\{item\.avatarFallback \? 'is-fallback' : ''\}\}"[\s\S]*lazy-load[\s\S]*fade-in="\{\{false\}\}"/);
  assert.match(wxml, /wx:if="\{\{item\.agentEnabled\}\}" class="xf-experts-ai-badge">AI<\/text>/);
  assert.match(wxml, /wx:if="\{\{item\.showQuestionCard && item\.activeQuestion\}\}"[\s\S]*去问问/);
  assert.match(wxss, /\.xf-experts-page \{[\s\S]*background-color: #f7f5ff;/);
  assert.match(wxss, /page \{[\s\S]*width: 100%;[\s\S]*overflow-x: hidden;/);
  assert.match(wxss, /\.xf-experts-page \{[\s\S]*width: 100%;[\s\S]*max-width: 100vw;[\s\S]*overflow-x: hidden;/);
  assert.match(wxss, /\.xf-experts-list \{[\s\S]*width: 100%;[\s\S]*min-width: 0;/);
  assert.match(wxss, /\.xf-experts-card \{[\s\S]*border-radius: 24rpx;/);
  assert.match(wxss, /\.xf-experts-avatar-wrap \{[\s\S]*background: #ffffff;/);
  assert.doesNotMatch(wxss, /\.xf-experts-avatar-wrap \{[\s\S]*background: #95ed20;/);
  assert.match(wxss, /\.xf-experts-chip \{[\s\S]*box-sizing: border-box;[\s\S]*height: 64rpx;[\s\S]*min-width: 148rpx;[\s\S]*padding: 0 50rpx;[\s\S]*font-size: 25rpx;[\s\S]*font-weight: 700;[\s\S]*line-height: 1;[\s\S]*text-align: center;[\s\S]*white-space: nowrap;/);

  const definition = loadExpertsPageDefinition();
  const context = createExpertsContext(definition);
  const requests = [];
  const navigations = [];
  const originalWx = global.wx;
  global.wx = {
    showShareMenu() {},
    getMenuButtonBoundingClientRect() {
      return { top: 52, bottom: 84, height: 32, right: 384, width: 87 };
    },
    getWindowInfo() {
      return { statusBarHeight: 44, windowHeight: 812 };
    },
    getSystemInfoSync() {
      return { statusBarHeight: 44, windowHeight: 812, platform: "devtools" };
    },
    getStorageSync() {
      return "";
    },
    removeStorageSync() {},
    request(options) {
      requests.push(options);
      options.success({
        statusCode: 200,
        data: {
          guests: [
            {
              _id: "guest-ai",
              name: "夏智",
              title: "中考作文问卷负责人",
              bio: "原浦东新区语文教研员，长期研究中考作文。",
              avatar: "/uploads/guests/xiazhi.png",
              programCount: 8,
              referenceCount: 2,
              contentTags: ["家庭教育"],
              agentEnabled: true
            },
            {
              _id: "guest-normal",
              name: "许和鑫",
              title: "教师",
              bio: "剑桥大学数学系毕业。",
              programCount: 1,
              contentTags: ["家长先疯"],
              agentEnabled: false
            }
          ],
          filterTags: ["家庭教育", "家长先疯"],
          total: 2,
          totalPages: 1
        }
      });
    },
    navigateTo(options) {
      navigations.push(options);
    },
    navigateBack() {}
  };

  try {
    await definition.onLoad.call(context, { from: "xiaowanzi" });
    assert.equal(requests[0].url.includes("/api/guests?page=1&pageSize=10"), true);
    assert.equal(context.data.guests.length, 2);
    assert.equal(context.data.guests[0].agentEnabled, true);
    assert.equal(context.data.guests[0].showQuestionCard, true);
    assert.equal(context.data.guests[1].agentEnabled, false);
    assert.equal(context.data.guests[1].showQuestionCard, false);

    definition.openExpert.call(context, { currentTarget: { dataset: { index: 0 } } });
    assert.equal(
      decodeURIComponent(navigations[0].url),
      "/pages/webview/index?title=智库详情&url=https://xianfeng.xinzhi.info/experts/guest-ai"
    );
  } finally {
    if (definition && typeof definition.onUnload === "function") {
      definition.onUnload.call(context);
    }
    global.wx = originalWx;
  }
});
