import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

test("a no-profile user who starts claiming completes two-step setup and automatically resumes the claim", async () => {
  const sessionPath = require.resolve("../../utils/session.js");
  const requestPath = require.resolve("../../utils/request.js");
  const pagePath = require.resolve("./index.js");
  const sessionModule = require(sessionPath);
  const requestModule = require(requestPath);
  const originalSession = {
    getToken: sessionModule.getToken,
    getUser: sessionModule.getUser,
    setSession: sessionModule.setSession,
    clearSession: sessionModule.clearSession
  };
  const originalRequest = requestModule.request;
  const originalPage = global.Page;
  const originalWx = global.wx;
  const requests = [];
  const listedTask = {
    _id: "task-1",
    taskId: "task-1",
    title: "测试任务",
    category: "小红书发图+评论",
    status: "listed",
    claimable: true,
    unitPriceCents: 3000,
    trafficFeeCents: 0,
    exampleImageUrls: []
  };
  const approvedProfile = {
    _id: "profile-1",
    status: "approved",
    displayName: "测试妈妈",
    contactWechat: "test_wechat",
    contactPhone: "13800138000",
    alipayAccount: "test@example.com",
    alipayVerifiedName: "测试妈妈",
    mediaAccounts: [],
    categories: []
  };

  try {
    Object.assign(sessionModule, {
      getToken: () => "test-token",
      getUser: () => ({ id: "user-1", mobile: "13800138000", name: "测试妈妈" }),
      setSession() {},
      clearSession() {}
    });
    requestModule.request = (options) => {
      requests.push(`${options.method || "GET"} ${options.url}`);
      if (options.url === "/api/mama-resources/applications") {
        return Promise.resolve({ profile: approvedProfile });
      }
      if (options.url === "/api/mama-resources/me/tasks") {
        return Promise.resolve({ profile: approvedProfile, tasks: [], availableTasks: [listedTask] });
      }
      if (options.url === "/api/mama-resources/tasks/task-1/claims") {
        return Promise.resolve({ task: { ...listedTask, status: "assigned", claimable: false } });
      }
      return Promise.reject(new Error(`Unexpected request: ${options.url}`));
    };
    global.wx = {
      getStorageSync() { return ""; },
      setStorageSync() {},
      removeStorageSync() {},
      showToast() {},
      showShareMenu() {}
    };
    let definition = null;
    global.Page = (value) => { definition = value; };
    delete require.cache[pagePath];
    require(pagePath);
    assert.ok(definition);

    const context = {
      ...definition,
      data: JSON.parse(JSON.stringify(definition.data)),
      setData(patch) { this.data = { ...this.data, ...patch }; }
    };
    const taskView = { ...listedTask, isClaimable: true, hasContentUrl: false };
    context.setData({
      isLoggedIn: true,
      mamaResourceView: "detail",
      mamaResourceProfile: null,
      mamaTasks: [taskView],
      currentMamaTask: taskView,
      taskClaiming: false
    });

    context.claimMamaTask();
    assert.equal(context.data.mamaResourceView, "apply");
    assert.equal(context.data.profileManagerMode, "onboarding");
    assert.equal(context.data.profileOnboardingStep, "personal");
    assert.equal(context.data.pendingProfileAction, "claim");

    context.savePersonalInfo({
      detail: {
        value: {
          displayName: "测试妈妈",
          contactWechat: "test_wechat",
          contactPhone: "13800138000",
          alipayAccount: "test@example.com",
          alipayVerifiedName: "测试妈妈"
        }
      }
    });
    assert.equal(context.data.profileOnboardingStep, "media");

    await context.completeProfileOnboarding();
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(requests, [
      "POST /api/mama-resources/applications",
      "GET /api/mama-resources/me/tasks",
      "POST /api/mama-resources/tasks/task-1/claims"
    ]);
    assert.equal(context.data.mamaResourceProfile.status, "approved");
    assert.equal(context.data.currentMamaTask.status, "assigned");
    assert.equal(context.data.taskMessageType, "success");
    assert.match(context.data.taskMessage, /领取成功/);
  } finally {
    Object.assign(sessionModule, originalSession);
    requestModule.request = originalRequest;
    global.Page = originalPage;
    global.wx = originalWx;
    delete require.cache[pagePath];
  }
});
