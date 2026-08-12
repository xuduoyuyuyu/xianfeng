import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const modulePath = require.resolve("./wechatProfile.js");
const requestPath = require.resolve("./request.js");
const sessionPath = require.resolve("./session.js");

test("wechat profile completion only targets placeholder or incomplete profiles", () => {
  const originalWx = global.wx;
  global.wx = {};
  try {
    delete require.cache[modulePath];
    const { needsWechatProfileCompletion, normalizeWechatProfileUser } = require(modulePath);
    assert.equal(needsWechatProfileCompletion({ name: "微信用户", avatar_image: "" }), true);
    assert.equal(needsWechatProfileCompletion({ name: "u13500003069", avatar_image: "https://cdn.test/avatar.png" }), true);
    assert.equal(needsWechatProfileCompletion({ name: "小雨", avatar_image: "" }), true);
    assert.equal(needsWechatProfileCompletion({ name: "小雨", avatar_image: "https://cdn.test/avatar.png" }), false);
    assert.equal(normalizeWechatProfileUser({ avatar_image: "", avatar: "https://cdn.test/old-avatar.png" }).avatar, "");
  } finally {
    delete require.cache[modulePath];
    global.wx = originalWx;
  }
});

test("saving a wechat profile uploads the chosen avatar and refreshes the shared session", async () => {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const saved = [];
  const calls = [];
  let uploadCount = 0;
  const uploadedPaths = [];
  let appUser = null;
  global.wx = {
    getFileSystemManager() {
      return { access: ({ success }) => success() };
    },
    uploadFile(options) {
      uploadCount += 1;
      uploadedPaths.push(options.filePath);
      assert.equal(options.name, "image");
      assert.equal(options.header.Authorization, "Bearer token-1");
      options.success({ statusCode: 201, data: JSON.stringify({ url: "https://cdn.test/avatar.png" }) });
    }
  };
  global.getApp = () => ({ globalData: {}, setLoginSession(payload) { appUser = payload.user; } });
  require.cache[requestPath] = { exports: {
    buildUrl: (path) => `https://api.test${path}`,
    request: async (options) => {
      calls.push(options);
      return { id: "user-1", name: "小雨", avatar_image: options.data.avatar_image };
    }
  } };
  require.cache[sessionPath] = { exports: {
    getToken: () => "token-1",
    getUser: () => ({ id: "user-1", name: "微信用户", avatar_image: "https://cdn.test/old-avatar.png", avatar: "https://cdn.test/old-avatar.png" }),
    setSession: (payload) => saved.push(payload)
  } };

  try {
    delete require.cache[modulePath];
    const { saveWechatProfile } = require(modulePath);
    const user = await saveWechatProfile({ name: "小雨", avatarPath: "wxfile://chosen-avatar" });
    assert.deepEqual(calls, [{ method: "PATCH", url: "/api/users/me", data: { name: "小雨", avatar_image: "https://cdn.test/avatar.png" } }]);
    assert.equal(user.avatar, "https://cdn.test/avatar.png");
    assert.equal(saved.at(-1).user.avatar_image, "https://cdn.test/avatar.png");
    assert.equal(appUser.name, "小雨");

    await saveWechatProfile({ name: "小雨", avatarPath: "http://tmp/chosen-avatar.jpeg" });
    assert.deepEqual(uploadedPaths, ["wxfile://chosen-avatar", "http://tmp/chosen-avatar.jpeg"]);

    const removedUser = await saveWechatProfile({ name: "小雨", avatarPath: "", allowEmptyAvatar: true });
    assert.equal(uploadCount, 2);
    assert.deepEqual(calls.at(-1), { method: "PATCH", url: "/api/users/me", data: { name: "小雨", avatar_image: "" } });
    assert.equal(removedUser.avatar, "");
    assert.equal(removedUser.avatar_image, "");
    assert.equal(saved.at(-1).user.avatar, "");
    assert.equal(appUser.avatar, "");
  } finally {
    delete require.cache[modulePath];
    delete require.cache[requestPath];
    delete require.cache[sessionPath];
    global.wx = originalWx;
    global.getApp = originalGetApp;
  }
});

test("saving a wechat profile asks for a new avatar when the temporary file expired", async () => {
  const originalWx = global.wx;
  let uploadCount = 0;
  global.wx = {
    getFileSystemManager() {
      return { access: ({ fail }) => fail({ errMsg: "access:fail no such file or directory" }) };
    },
    uploadFile() {
      uploadCount += 1;
    }
  };
  require.cache[requestPath] = { exports: {
    buildUrl: (path) => `https://api.test${path}`,
    request: async () => ({})
  } };
  require.cache[sessionPath] = { exports: {
    getToken: () => "token-1",
    getUser: () => ({ name: "微信用户", avatar_image: "" }),
    setSession() {}
  } };

  try {
    delete require.cache[modulePath];
    const { saveWechatProfile } = require(modulePath);
    await assert.rejects(
      saveWechatProfile({ name: "小雨", avatarPath: "http://tmp/stale-avatar.jpeg" }),
      /头像已失效，请重新选择微信头像/
    );
    assert.equal(uploadCount, 0);
  } finally {
    delete require.cache[modulePath];
    delete require.cache[requestPath];
    delete require.cache[sessionPath];
    global.wx = originalWx;
  }
});

test("saving a wechat profile hides uploadFile errors when the avatar expires during upload", async () => {
  const originalWx = global.wx;
  global.wx = {
    getFileSystemManager() {
      return { access: ({ success }) => success() };
    },
    uploadFile({ fail }) {
      fail({ errMsg: "uploadFile:fail createUploadTask:fail no such file or directory" });
    }
  };
  require.cache[requestPath] = { exports: {
    buildUrl: (path) => `https://api.test${path}`,
    request: async () => ({})
  } };
  require.cache[sessionPath] = { exports: {
    getToken: () => "token-1",
    getUser: () => ({ name: "微信用户", avatar_image: "" }),
    setSession() {}
  } };

  try {
    delete require.cache[modulePath];
    const { saveWechatProfile } = require(modulePath);
    await assert.rejects(
      saveWechatProfile({ name: "小雨", avatarPath: "wxfile://expired-during-upload" }),
      /头像已失效，请重新选择微信头像/
    );
  } finally {
    delete require.cache[modulePath];
    delete require.cache[requestPath];
    delete require.cache[sessionPath];
    global.wx = originalWx;
  }
});
