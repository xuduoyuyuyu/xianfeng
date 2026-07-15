import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const wechatProfilePath = require.resolve("./wechatProfile.js");
const nativeSettingsSource = fs.readFileSync(new URL("./nativeSettings.js", import.meta.url), "utf8");
const nativeChromeSource = fs.readFileSync(new URL("./nativeChrome.js", import.meta.url), "utf8");
const appWxssSource = fs.readFileSync(new URL("../app.wxss", import.meta.url), "utf8");
const sharedTemplateSource = fs.readFileSync(new URL("../templates/settings-profile-views.wxml", import.meta.url), "utf8");
const mineTemplateSource = fs.readFileSync(new URL("../pages/mine/index.wxml", import.meta.url), "utf8");
const programsTemplateSource = fs.readFileSync(new URL("../pages/programs/index.wxml", import.meta.url), "utf8");
const readingTemplateSource = fs.readFileSync(new URL("../pages/reading/index.wxml", import.meta.url), "utf8");
const materialsTemplateSource = fs.readFileSync(new URL("../pages/materials/index.wxml", import.meta.url), "utf8");
const topicsTemplateSource = fs.readFileSync(new URL("../pages/topics/index.wxml", import.meta.url), "utf8");
const proTemplateSource = fs.readFileSync(new URL("../pages/pro/index.wxml", import.meta.url), "utf8");
const webviewTemplateSource = fs.readFileSync(new URL("../pages/webview/index.wxml", import.meta.url), "utf8");
const nativeListWxssSource = fs.readFileSync(new URL("../styles/native-list.wxss", import.meta.url), "utf8");
const profilePanelWxssSource = fs.readFileSync(new URL("../pages/mine/profile-panel.wxss", import.meta.url), "utf8");

test("native settings implements font size and cache clearing actions", () => {
  assert.match(nativeSettingsSource, /CACHE_STORAGE_KEYS/);
  assert.match(nativeSettingsSource, /xf_native_programs_cache/);
  assert.match(nativeSettingsSource, /xf_native_books_cache/);
  assert.match(nativeSettingsSource, /xf_native_materials_cache/);
  assert.match(nativeSettingsSource, /xf_native_topics_cache/);
  assert.match(nativeSettingsSource, /xf_native_search_history/);
  assert.match(nativeSettingsSource, /xf_mama_resource_apply_draft_v1/);
  assert.match(nativeSettingsSource, /function clearAppCache\(\)/);
  assert.match(nativeSettingsSource, /removeStorageSync\(key\)/);
  assert.match(nativeSettingsSource, /function fontSizeClassFor\(/);
  assert.match(nativeSettingsSource, /fontSizeClass/);
  assert.match(nativeSettingsSource, /chooseFontSize\(event\)[\s\S]*applyFontSizeSetting\(this, value\)/);
  assert.match(nativeSettingsSource, /clearCache\(\)[\s\S]*clearAppCache\(\)/);

  assert.match(sharedTemplateSource, /xfSettingsAppPanel[\s\S]*class="xf-settings-profile-view xf-settings-panel \{\{fontSizeClass\}\}"/);
  assert.match(sharedTemplateSource, /bindtap="clearCache"/);
  assert.match(sharedTemplateSource, /class="xf-setting-row xf-setting-button" bindtap="clearCache"><text>应用管理<\/text><text class="xf-setting-value">清理缓存 ›<\/text><\/button>/);
  assert.match(mineTemplateSource, /settingsPanelView === 'settings'[\s\S]*class="xf-mine-panel-view xf-settings-panel \{\{fontSizeClass\}\}"/);
  assert.match(mineTemplateSource, /bindtap="clearCache"/);
  assert.match(mineTemplateSource, /class="xf-setting-row xf-setting-button" bindtap="clearCache"><text>应用管理<\/text><text class="xf-setting-value">清理缓存 ›<\/text><\/button>/);
});

test("native settings wires account deletion to the shared settings action", () => {
  assert.match(nativeSettingsSource, /function deleteAccountFromSettings\(page, options = \{\}\)/);
  assert.match(nativeSettingsSource, /url: "\/api\/users\/me"/);
  assert.match(nativeSettingsSource, /method: "DELETE"/);
  assert.match(nativeSettingsSource, /data: \{ confirmation \}/);
  assert.match(nativeSettingsSource, /deleteAccount\(\) \{[\s\S]*deleteAccountFromSettings\(this\);[\s\S]*\}/);
  assert.match(sharedTemplateSource, /class="xf-profile-danger xf-settings-danger" bindtap="deleteAccount">注销账户<\/button>/);
  assert.match(mineTemplateSource, /class="xf-profile-danger xf-settings-danger" bindtap="deleteAccount">注销账户<\/button>/);
});

test("native settings logs in logged-out users with the current phone authorization sheet", () => {
  assert.match(nativeSettingsSource, /loginWithPhone\(event\)/);
  assert.match(nativeSettingsSource, /wx\.login\(/);
  assert.match(nativeSettingsSource, /\/api\/wechat-mini\/login/);
  assert.match(nativeSettingsSource, /setSession\(payload\)/);
  assert.match(nativeSettingsSource, /syncAccountEntry\(\)/);
  assert.match(nativeSettingsSource, /typeof this\.onNativeSettingsLoginSuccess === "function"/);
  assert.match(nativeSettingsSource, /this\.onNativeSettingsLoginSuccess\(payload\)/);
  assert.match(nativeSettingsSource, /selectComponent\("#profileOnboarding"\)/);
  assert.match(nativeSettingsSource, /onboarding\.reconcileAfterLogin\(\)/);
  assert.match(nativeSettingsSource, /SETTINGS_MEMBERSHIP_BADGE_KEY/);
  assert.match(nativeSettingsSource, /request\(\{ url: "\/api\/billing\/me" \}\)/);
  assert.match(nativeSettingsSource, /accountSubtitleFor\(token, settingsMemberBadgeLabel\)/);
  assert.match(sharedTemplateSource, /<button wx:else class="xf-profile-secondary xf-settings-login" open-type="getPhoneNumber" bindgetphonenumber="loginWithPhone">登录<\/button>/);
  assert.match(mineTemplateSource, /<button wx:else class="xf-profile-secondary xf-settings-login" open-type="getPhoneNumber" bindgetphonenumber="loginWithPhone">登录<\/button>/);
});

test("native settings completes wechat nickname and avatar before continuing an incomplete login", () => {
  assert.match(nativeSettingsSource, /needsWechatProfileCompletion/);
  assert.match(nativeSettingsSource, /saveWechatProfile: persistWechatProfile/);
  assert.match(nativeSettingsSource, /persistWechatProfile\(\{[\s\S]*name,[\s\S]*avatarPath/);
  assert.match(nativeSettingsSource, /typeof this\.onNativeSettingsProfileSaved === "function"/);
  assert.match(sharedTemplateSource, /open-type="chooseAvatar" bindchooseavatar="chooseProfileAvatar"/);
  assert.match(sharedTemplateSource, /type="nickname"/);
  assert.match(sharedTemplateSource, /wx:if="\{\{profileDraft\.avatar\}\}" class="xf-account-avatar-image"/);
  assert.match(sharedTemplateSource, /wx:else class="xf-account-avatar-empty">未设置<\/view>/);
  assert.match(sharedTemplateSource, /wx:if="\{\{profileDraft\.avatar\}\}" bindtap="removeProfileAvatar">移除头像<\/button>/);
});

test("native settings continues to the tapped menu item after phone login", async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const storage = new Map();
  let openedDataset = null;
  global.wx = {
    getStorageSync(key) {
      return storage.has(key) ? storage.get(key) : "";
    },
    setStorageSync(key, value) {
      storage.set(key, value);
    },
    removeStorageSync(key) {
      storage.delete(key);
    },
    login({ success }) {
      success({ code: "wx-login-code" });
    },
    request(options) {
      if (options.url.includes("/api/wechat-mini/login")) {
        options.success({ statusCode: 200, data: { token: "token-1", user: { name: "阿力", mobile: "13500003069", avatar_image: "https://cdn.test/avatar.png" } } });
        return;
      }
      options.success({ statusCode: 200, data: { membership: {} } });
    }
  };
  global.getApp = () => ({ globalData: {} });

  const nativeSettingsFile = require.resolve("./nativeSettings.js");
  delete require.cache[nativeSettingsFile];
  const { createNativeSettingsMethods } = require(nativeSettingsFile);
  const methods = createNativeSettingsMethods();
  const context = {
    data: { bindingPhone: false },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    loadSettingsPanel: methods.loadSettingsPanel,
    syncAccountEntry: methods.syncAccountEntry,
    openSettingsItem(event) {
      openedDataset = event.currentTarget.dataset;
    },
    selectComponent() {
      return null;
    }
  };

  try {
    methods.loginWithPhone.call(context, {
      detail: { code: "phone-code" },
      currentTarget: { dataset: { sectionIndex: 2, itemIndex: 1 } }
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(storage.get("xf_token"), "token-1");
    assert.deepEqual(openedDataset, { sectionIndex: 2, itemIndex: 1 });
    assert.equal(context.pendingSettingsLoginDataset, null);
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
  }
});

test("native settings pauses a tapped destination while the login profile is incomplete", async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const storage = new Map();
  let openedDataset = null;
  global.wx = {
    getStorageSync(key) { return storage.has(key) ? storage.get(key) : ""; },
    setStorageSync(key, value) { storage.set(key, value); },
    removeStorageSync(key) { storage.delete(key); },
    login({ success }) { success({ code: "wx-login-code" }); },
    request(options) {
      if (options.url.includes("/api/wechat-mini/login")) {
        options.success({ statusCode: 200, data: { token: "token-1", user: { name: "微信用户", mobile: "13500003069", avatar_image: "" } } });
        return;
      }
      options.success({ statusCode: 200, data: { membership: {} } });
    }
  };
  global.getApp = () => ({ globalData: {} });
  require.cache[wechatProfilePath] = { exports: {
    isPlaceholderName: (name) => name === "微信用户",
    needsWechatProfileCompletion: () => true,
    normalizeWechatProfileUser: (user) => ({ ...user, avatar: user.avatar_image || "" }),
    saveWechatProfile: async () => ({})
  } };

  const nativeSettingsFile = require.resolve("./nativeSettings.js");
  delete require.cache[nativeSettingsFile];
  const { createNativeSettingsMethods } = require(nativeSettingsFile);
  const methods = createNativeSettingsMethods();
  const context = {
    data: { bindingPhone: false },
    setData(payload) { this.data = { ...this.data, ...payload }; },
    loadSettingsPanel: methods.loadSettingsPanel,
    syncAccountEntry: methods.syncAccountEntry,
    loadProfilePanel: methods.loadProfilePanel,
    loadProfilePanelView: methods.loadProfilePanelView,
    openSettingsItem(event) { openedDataset = event.currentTarget.dataset; },
    selectComponent() { return null; }
  };

  try {
    methods.loginWithPhone.call(context, {
      detail: { code: "phone-code" },
      currentTarget: { dataset: { sectionIndex: 3, itemIndex: 3 } }
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(context.data.settingsPanelOpen, true);
    assert.equal(context.data.settingsPanelView, "profile");
    assert.equal(context.data.profileDraft.name, "");
    assert.equal(openedDataset, null);
    assert.deepEqual(context.pendingSettingsLoginDataset, { sectionIndex: 3, itemIndex: 3 });
  } finally {
    delete require.cache[nativeSettingsFile];
    delete require.cache[wechatProfilePath];
    global.wx = originalWx;
    global.getApp = originalGetApp;
  }
});

test("native settings logout clears the account entry shown in the open drawer", () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const storage = new Map([
    ["xf_token", "token-1"],
    ["xf_user", { name: "阿力", mobile: "13500003069", avatar: "/avatar.png" }]
  ]);
  let clearCalled = false;
  let logoutHookCalled = false;
  global.wx = {
    getStorageSync(key) {
      return storage.has(key) ? storage.get(key) : "";
    },
    setStorageSync(key, value) {
      storage.set(key, value);
    },
    removeStorageSync(key) {
      storage.delete(key);
    }
  };
  global.getApp = () => ({
    clearLoginSession() {
      clearCalled = true;
      storage.delete("xf_token");
      storage.delete("xf_user");
    }
  });

  const nativeSettingsFile = require.resolve("./nativeSettings.js");
  delete require.cache[nativeSettingsFile];
  const { createNativeSettingsMethods } = require(nativeSettingsFile);
  const methods = createNativeSettingsMethods();
  const context = {
    data: {
      isLoggedIn: true,
      hasMobile: true,
      maskedMobile: "135****3069",
      accountTitle: "阿力",
      accountSubtitle: "查看和管理个人资料",
      accountAvatar: "/avatar.png",
      accountPage: "/pages/mine/index",
      accountPanelView: "profile"
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    onNativeSettingsLogout() {
      logoutHookCalled = true;
      assert.equal(storage.has("xf_token"), true);
    },
    syncAccountEntry: methods.syncAccountEntry
  };

  try {
    methods.logout.call(context);

    assert.equal(logoutHookCalled, true);
    assert.equal(clearCalled, true);
    assert.equal(storage.has("xf_token"), false);
    assert.equal(storage.has("xf_user"), false);
    assert.equal(context.data.isLoggedIn, false);
    assert.equal(context.data.hasMobile, false);
    assert.equal(context.data.maskedMobile, "未绑定");
    assert.equal(context.data.profilePanelMessage, "已退出登录");
    assert.equal(context.data.accountTitle, "登录/注册");
    assert.equal(context.data.accountSubtitle, "登录后同步档案和个性化推荐");
    assert.equal(context.data.accountAvatar, "/assets/tabbar/xiaowanzi.png");
    assert.equal(context.data.accountPage, "");
    assert.equal(context.data.accountPanelView, "");
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
  }
});

test("native settings delete account matches the mobile confirmation flow", async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const storage = new Map([
    ["xf_token", "token-1"],
    ["xf_user", { name: "阿力", mobile: "13500003069", avatar: "/avatar.png" }]
  ]);
  let modalOptions = null;
  let requestOptions = null;
  let clearCalled = false;
  global.wx = {
    getStorageSync(key) {
      return storage.has(key) ? storage.get(key) : "";
    },
    setStorageSync(key, value) {
      storage.set(key, value);
    },
    removeStorageSync(key) {
      storage.delete(key);
    },
    showModal(options) {
      modalOptions = options;
      options.success({ confirm: true, content: "确认注销" });
    },
    request(options) {
      requestOptions = options;
      options.success({
        statusCode: 200,
        data: { message: "账号已申请注销，3天内重新登录可恢复" }
      });
    }
  };
  global.getApp = () => ({
    clearLoginSession() {
      clearCalled = true;
      storage.delete("xf_token");
      storage.delete("xf_user");
    }
  });

  const nativeSettingsFile = require.resolve("./nativeSettings.js");
  delete require.cache[nativeSettingsFile];
  const { createNativeSettingsMethods } = require(nativeSettingsFile);
  const methods = createNativeSettingsMethods();
  const context = {
    data: {
      isLoggedIn: true,
      hasMobile: true,
      maskedMobile: "135****3069",
      accountTitle: "阿力",
      accountSubtitle: "查看和管理个人资料",
      accountAvatar: "/avatar.png",
      accountPage: "/pages/mine/index",
      accountPanelView: "profile"
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    syncAccountEntry: methods.syncAccountEntry
  };

  try {
    methods.deleteAccount.call(context);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(modalOptions.title, "确认注销账户");
    assert.equal(modalOptions.editable, true);
    assert.equal(modalOptions.placeholderText, "确认注销");
    assert.match(requestOptions.url, /\/api\/users\/me$/);
    assert.equal(requestOptions.method, "DELETE");
    assert.deepEqual(requestOptions.data, { confirmation: "确认注销" });
    assert.equal(clearCalled, true);
    assert.equal(storage.has("xf_token"), false);
    assert.equal(storage.has("xf_user"), false);
    assert.equal(context.data.isLoggedIn, false);
    assert.equal(context.data.hasMobile, false);
    assert.equal(context.data.maskedMobile, "未绑定");
    assert.equal(context.data.profilePanelMessage, "账号已申请注销，3天内重新登录可恢复");
    assert.equal(context.data.accountTitle, "登录/注册");
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
  }
});

test("native settings account entry distinguishes Plus and Pro membership badges", async () => {
  const originalWx = global.wx;
  let membershipTier = "plus";
  const storage = new Map([
    ["xf_token", "token-1"],
    ["xf_user", { name: "阿力", mobile: "13500003069", avatar: "/avatar.png" }]
  ]);
  global.wx = {
    getStorageSync(key) {
      return storage.has(key) ? storage.get(key) : "";
    },
    setStorageSync(key, value) {
      storage.set(key, value);
    },
    removeStorageSync(key) {
      storage.delete(key);
    },
    request(options) {
      assert.match(options.url, /\/api\/billing\/me$/);
      options.success({
        statusCode: 200,
        data: {
          membership: {
            isProActive: true,
            membershipTier,
            membershipLabel: membershipTier === "pro" ? "Pro" : "Plus",
            proPlan: membershipTier
          }
        }
      });
    }
  };

  const nativeSettingsFile = require.resolve("./nativeSettings.js");
  delete require.cache[nativeSettingsFile];
  const { createNativeSettingsMethods } = require(nativeSettingsFile);
  const methods = createNativeSettingsMethods();
  const context = {
    data: {},
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    methods.syncAccountEntry.call(context);
    assert.equal(context.data.isLoggedIn, true);
    assert.equal(context.data.hasMobile, true);
    assert.equal(context.data.maskedMobile, "135****3069");
    assert.equal(context.data.accountSubtitle, "查看和管理个人资料");
    assert.equal(context.data.settingsMemberBadgeLabel, "");

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(context.data.accountSubtitle, "查看和管理个人资料");
    assert.equal(context.data.settingsMemberBadgeLabel, "Plus");
    assert.equal(storage.get("xf_settings_membership_badge"), "Plus");

    membershipTier = "pro";
    methods.syncAccountEntry.call(context);
    assert.equal(context.data.isLoggedIn, true);
    assert.equal(context.data.hasMobile, true);
    assert.equal(context.data.maskedMobile, "135****3069");
    assert.equal(context.data.accountSubtitle, "查看和管理个人资料");
    assert.equal(context.data.settingsMemberBadgeLabel, "Plus");

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(context.data.accountSubtitle, "查看和管理个人资料");
    assert.equal(context.data.settingsMemberBadgeLabel, "Pro");
    assert.equal(storage.get("xf_settings_membership_badge"), "Pro");
  } finally {
    global.wx = originalWx;
  }
});

test("native menu login account entry authorizes phone without opening the login page", () => {
  assert.match(programsTemplateSource, /<button wx:if="\{\{!isLoggedIn\}\}" class="xf-program-settings-account" open-type="getPhoneNumber" bindgetphonenumber="loginWithPhone">/);
  assert.match(programsTemplateSource, /<view wx:else class="xf-program-settings-account" catchtap="openSettingsItem" data-page="\{\{accountPage\}\}"/);
  assert.match(programsTemplateSource, /class="xf-program-settings-avatar-wrap"[\s\S]*<image class="xf-program-settings-avatar" src="\{\{accountAvatar\}\}" mode="aspectFill" \/>[\s\S]*class="xf-program-settings-title-row"[\s\S]*class="xf-program-settings-title">\{\{accountTitle\}\}[\s\S]*class="xf-program-settings-subtitle-row"[\s\S]*class="xf-program-settings-subtitle">\{\{accountSubtitle\}\}/);
  assert.match(programsTemplateSource, /class="xf-program-settings-label">\{\{item\.title\}\}<\/text>\s*<text wx:if="\{\{item\.key === 'pro' && settingsMemberBadgeLabel\}\}" class="xf-program-settings-member-badge">\{\{settingsMemberBadgeLabel\}\}<\/text>\s*<text class="xf-program-settings-chevron">›<\/text>/);
  assert.match(mineTemplateSource, /class="xf-mine-login" open-type="getPhoneNumber" bindgetphonenumber="loginWithPhone"/);
  assert.doesNotMatch(programsTemplateSource, /<view class="xf-program-settings-account" catchtap="openSettingsItem" data-page="\{\{accountPage\}\}" data-title="\{\{accountTitle\}\}" data-panel-view="\{\{accountPanelView\}\}">/);
});

test("native font size setting is included in every web-view URL", () => {
  assert.match(nativeSettingsSource, /function readWebviewFontSizeParam\(\)/);
  assert.match(nativeSettingsSource, /module\.exports = \{[\s\S]*readWebviewFontSizeParam/);
  assert.match(nativeChromeSource, /readWebviewFontSizeParam/);
  assert.match(nativeChromeSource, /xf_font: readWebviewFontSizeParam\(\)/);
});

test("native font size setting applies to native page roots", () => {
  assert.match(nativeSettingsSource, /syncNativeFontSizeSetting\(\)[\s\S]*readFontSizeSetting\(\)/);
  assert.match(nativeSettingsSource, /syncAccountEntry\(\)[\s\S]*const fontState = readFontSizeSetting\(\)/);
  assert.match(nativeSettingsSource, /syncAccountEntry\(\)[\s\S]*\.\.\.fontState/);
  assert.match(programsTemplateSource, /class="xf-program-page \{\{fontSizeClass\}\}/);
  assert.match(readingTemplateSource, /class="xf-native-page xf-reading-page \{\{fontSizeClass\}\}/);
  assert.match(materialsTemplateSource, /class="xf-native-page xf-materials-page \{\{fontSizeClass\}\}/);
  assert.match(topicsTemplateSource, /class="xf-native-page xf-topics-page \{\{fontSizeClass\}\}/);
  assert.match(proTemplateSource, /class="xf-pro-page \{\{fontSizeClass\}\}/);
  assert.match(webviewTemplateSource, /class="xf-program-detail-page \{\{fontSizeClass\}\}/);
  assert.match(webviewTemplateSource, /class="xf-book-detail-page \{\{fontSizeClass\}\}/);
  assert.doesNotMatch(appWxssSource, /\.xf-font-small\s+(?:text|button|input|textarea)/);
  assert.doesNotMatch(appWxssSource, /\.xf-font-large\s+(?:text|button|input|textarea)/);
  assert.doesNotMatch(appWxssSource, /font-size:\s*0\.95em\s*!important/);
  assert.doesNotMatch(appWxssSource, /font-size:\s*1\.1em\s*!important/);
  for (const source of [nativeListWxssSource, profilePanelWxssSource]) {
    assert.match(source, /\.xf-setting-row text,[\s\S]*\.xf-setting-row button \{[\s\S]*font-size: inherit;/);
    assert.match(source, /\.xf-font-standard \.xf-setting-row text,[\s\S]*\.xf-font-standard \.xf-setting-row button,[\s\S]*\.xf-font-standard \.xf-setting-value,[\s\S]*\.xf-font-standard \.xf-setting-segment button \{[\s\S]*font-size: 25rpx;/);
    assert.match(source, /\.xf-font-small \.xf-setting-row text,[\s\S]*\.xf-font-small \.xf-setting-row button,[\s\S]*\.xf-font-small \.xf-setting-value,[\s\S]*\.xf-font-small \.xf-setting-segment button \{[\s\S]*font-size: 22rpx;/);
    assert.match(source, /\.xf-font-large \.xf-setting-row text,[\s\S]*\.xf-font-large \.xf-setting-row button,[\s\S]*\.xf-font-large \.xf-setting-value,[\s\S]*\.xf-font-large \.xf-setting-segment button \{[\s\S]*font-size: 29rpx;/);
  }
});
