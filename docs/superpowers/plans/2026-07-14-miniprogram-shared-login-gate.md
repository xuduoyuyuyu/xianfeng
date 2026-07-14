# 微信小程序统一未登录登录层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让微信小程序所有受保护页面和动作在无会话或 401 时显示共享全屏手机号登录层，不再把未登录状态作为普通文案错误。

**Architecture:** 新增一个自包含的 `phone-login-gate` 原生组件，组件拥有手机号授权和会话保存，页面只拥有 `loginRequired` 状态与登录成功后的读取型恢复动作。保留 `request.js -> authExpiry` 的 401 广播作为异步过期入口，页面不自动重放领取、提交、支付或保存请求。

**Tech Stack:** 微信小程序原生组件、CommonJS、Node.js built-in test runner

## Global Constraints

- `getPhoneNumber` 必须由用户点击共享组件按钮触发。
- 不新增独立登录路由，不修改 `/api/wechat-mini/login` 协议。
- 只有无 token 和 HTTP 401 触发登录层；Pro、积分、校验、网络和 5xx 不触发。
- 登录成功后只刷新读取状态，不自动重放领取、提交、支付或保存。
- 公开页面保持公开，只有受保护动作触发登录层。
- 保留用户现有未提交小程序改动；实施前逐文件检查重叠，只暂存本计划明确列出的文件。

---

## File Map

- Create: `apps/wechat-miniprogram/components/phone-login-gate/index.js` — 微信手机号授权、登录请求、会话保存和成功事件。
- Create: `apps/wechat-miniprogram/components/phone-login-gate/index.wxml` — 全屏登录按钮和状态文案。
- Create: `apps/wechat-miniprogram/components/phone-login-gate/index.wxss` — 统一登录遮罩样式。
- Create: `apps/wechat-miniprogram/components/phone-login-gate/index.json` — 原生组件声明。
- Create: `apps/wechat-miniprogram/components/phone-login-gate/index.test.mjs` — 组件行为与静态契约。
- Modify: `apps/wechat-miniprogram/pages/welfare/index.{js,wxml,wxss,json}` — 首个完整迁移和截图问题回归。
- Modify: `apps/wechat-miniprogram/pages/xiaowanzi/index.{js,wxml,wxss,json}` — 迁移现有全屏授权层。
- Modify: `apps/wechat-miniprogram/pages/webview/index.{js,wxml,wxss,json}` — 迁移 `login=1` 授权层并重建 Web URL。
- Modify: `apps/wechat-miniprogram/pages/worthbuy/index.{js,wxml,json}` — auth 错误由普通卡片改为全屏登录层。
- Modify: `apps/wechat-miniprogram/pages/pro/index.{js,wxml,json}` — 订阅前登录层与读取型恢复。
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.{js,wxml,json}` — 登录视图改为共享层并刷新任务状态。
- Modify: `apps/wechat-miniprogram/pages/{programs,materials,mine}/index.{js,wxml,json}` — 原生账号入口改用共享层。
- Modify: `apps/wechat-miniprogram/utils/nativeSettings.js` — 账号入口只打开登录层，移除重复登录请求。
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs` — 小玩子、WebView、Pro 和原生设置回归。
- Modify: `apps/wechat-miniprogram/pages/welfare/index.test.mjs` — 福利页登录层与恢复动作。
- Modify: `apps/wechat-miniprogram/pages/worthbuy/index.static.test.mjs` — auth/Pro/积分错误分流。
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs` — 妈妈好赚登录层。

### Task 1: 共享手机号登录组件

**Files:**
- Create: `apps/wechat-miniprogram/components/phone-login-gate/index.js`
- Create: `apps/wechat-miniprogram/components/phone-login-gate/index.wxml`
- Create: `apps/wechat-miniprogram/components/phone-login-gate/index.wxss`
- Create: `apps/wechat-miniprogram/components/phone-login-gate/index.json`
- Test: `apps/wechat-miniprogram/components/phone-login-gate/index.test.mjs`

**Interfaces:**
- Consumes: `request({ method, url, data })`, `setSession(payload)`, `resolveAuthExpired()`, optional `getApp().setLoginSession(payload)`.
- Produces: properties `visible`, `title`, `description`; event `success` with `{ session: payload }`.

- [ ] **Step 1: 写组件失败测试**

测试加载组件定义并断言：无 `phoneCode` 不请求；成功调用 `/api/wechat-mini/login`、保存会话、解决过期事件并触发 `success`；WXML 使用唯一 `getPhoneNumber` 按钮。

```js
test("shared phone login gate saves the session and emits success", async () => {
  const definition = loadComponentDefinition("phone-login-gate");
  const events = [];
  const context = createComponentContext(definition, events);
  global.wx.login = ({ success }) => success({ code: "wx-code" });
  requestStub.resolve({ token: "token-1", user: { _id: "user-1" } });

  definition.methods.loginWithPhone.call(context, { detail: { code: "phone-code" } });
  await flushPromises();

  assert.deepEqual(requestStub.calls[0], {
    method: "POST",
    url: "/api/wechat-mini/login",
    data: { code: "wx-code", phoneCode: "phone-code" }
  });
  assert.equal(sessionStub.saved.token, "token-1");
  assert.deepEqual(events, [{ name: "success", detail: { session: requestStub.value } }]);
});
```

- [ ] **Step 2: 运行组件测试并确认 RED**

Run: `node --test apps/wechat-miniprogram/components/phone-login-gate/index.test.mjs`

Expected: FAIL，因为组件文件不存在。

- [ ] **Step 3: 实现最小组件**

`index.js` 核心实现：

```js
const { request } = require("../../utils/request");
const { setSession } = require("../../utils/session");
const { resolveAuthExpired } = require("../../utils/authExpiry");

Component({
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: "登录后继续" },
    description: { type: String, value: "点击授权手机号，登录后继续当前操作。" }
  },
  data: { bindingPhone: false, loginMessage: "" },
  methods: {
    loginWithPhone(event) {
      if (this.data.bindingPhone) return;
      const phoneCode = String(event && event.detail && event.detail.code || "");
      if (!phoneCode) return this.setData({ loginMessage: "需要授权手机号后登录" });
      this.setData({ bindingPhone: true, loginMessage: "" });
      wx.login({
        success: ({ code }) => {
          if (!code) return this.setData({ bindingPhone: false, loginMessage: "微信登录失败，请重试" });
          request({ method: "POST", url: "/api/wechat-mini/login", data: { code, phoneCode } })
            .then((payload) => {
              setSession(payload);
              const app = typeof getApp === "function" ? getApp() : null;
              if (app && typeof app.setLoginSession === "function") app.setLoginSession(payload);
              resolveAuthExpired();
              this.setData({ bindingPhone: false, loginMessage: "" });
              this.triggerEvent("success", { session: payload });
            })
            .catch((error) => this.setData({ bindingPhone: false, loginMessage: String(error && error.message || "登录失败，请重试") }));
        },
        fail: () => this.setData({ bindingPhone: false, loginMessage: "无法调用微信登录" })
      });
    }
  }
});
```

`index.wxml` 使用 `wx:if="{{visible}}"` 的全屏 `<button open-type="getPhoneNumber" bindgetphonenumber="loginWithPhone">`，卡片显示 `title`、`description`、`loginMessage` 和登录中状态。`index.json` 为 `{ "component": true }`。

- [ ] **Step 4: 运行组件测试并确认 GREEN**

Run: `node --test apps/wechat-miniprogram/components/phone-login-gate/index.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交组件**

```bash
git add apps/wechat-miniprogram/components/phone-login-gate
git commit -m "feat(miniprogram): add shared phone login gate"
```

### Task 2: 福利页与统一 401 恢复契约

**Files:**
- Modify: `apps/wechat-miniprogram/pages/welfare/index.js`
- Modify: `apps/wechat-miniprogram/pages/welfare/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/welfare/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/welfare/index.json`
- Test: `apps/wechat-miniprogram/pages/welfare/index.test.mjs`
- Test: `apps/wechat-miniprogram/utils/request.authExpiry.test.mjs`

**Interfaces:**
- Consumes: `<phone-login-gate visible title description bind:success>` and `subscribeAuthExpired`.
- Produces: `showLoginGate()`、`handleLoginSuccess()`；成功后调用 `loadCampaigns()`，不自动调用 `claimCampaign()`。

- [ ] **Step 1: 写福利页失败测试**

新增断言：WXML 使用共享组件；普通页面不再出现 `未登录或登录已过期`；`handleLoginSuccess` 关闭层并只调用 `loadCampaigns`。

```js
assert.match(json, /"phone-login-gate": "\.\.\/\.\.\/components\/phone-login-gate\/index"/);
assert.match(wxml, /<phone-login-gate[^>]*visible="\{\{loginRequired\}\}"[^>]*bind:success="handleLoginSuccess"/);
assert.doesNotMatch(wxml, /xf-welfare-login-card|未登录或登录已过期/);
assert.match(js, /handleLoginSuccess\(\)[\s\S]*loginRequired: false[\s\S]*this\.loadCampaigns\(\)/);
```

- [ ] **Step 2: 运行福利和 401 测试并确认 RED**

Run: `node --test apps/wechat-miniprogram/pages/welfare/index.test.mjs apps/wechat-miniprogram/utils/request.authExpiry.test.mjs`

Expected: 福利页新断言 FAIL；401 现有测试 PASS。

- [ ] **Step 3: 迁移福利页**

- 在 `index.json` 注册 `phone-login-gate`。
- 用共享组件替换 WXML 末尾的 `xf-welfare-login-gate`。
- 删除页面 `loginWithPhone`、`bindingPhone`、`loginMessage` 和对应专用 WXSS。
- 保留 `showLoginGate()`，新增：

```js
handleLoginSuccess() {
  this.setData({ loginRequired: false, loading: true, message: "" });
  this.loadCampaigns();
}
```

- 在 `loadCampaigns` 和 `claimCampaign` 的 401 分支调用 `showLoginGate()` 并禁止把服务端 401 message 写入 `message`。

- [ ] **Step 4: 运行测试并确认 GREEN**

Run: `node --test apps/wechat-miniprogram/pages/welfare/index.test.mjs apps/wechat-miniprogram/utils/request.authExpiry.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交福利页迁移**

```bash
git add apps/wechat-miniprogram/pages/welfare apps/wechat-miniprogram/utils/request.authExpiry.test.mjs
git commit -m "fix(miniprogram): open login gate for welfare auth"
```

### Task 3: 迁移已有全屏登录表面

**Files:**
- Modify: `apps/wechat-miniprogram/pages/xiaowanzi/index.{js,wxml,wxss,json}`
- Modify: `apps/wechat-miniprogram/pages/webview/index.{js,wxml,wxss,json}`
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

**Interfaces:**
- Xiaowanzi produces `handleXiaowanziLoginSuccess()`，关闭 `xiaowanziLoginRequired` 并刷新登录态/历史读取。
- WebView produces `handleWebviewLoginSuccess()`，关闭 `webviewLoginRequired` 并调用现有 `buildWebUrl` 恢复当前 src。

- [ ] **Step 1: 写迁移失败测试**

断言两页 JSON 注册共享组件，WXML 使用组件且不再含各自 `open-type="getPhoneNumber"` gate，JS 不再定义重复 `loginWithPhone`。

```js
assert.match(xiaowanziWxml, /<phone-login-gate[^>]*visible="\{\{xiaowanziLoginRequired\}\}"/);
assert.doesNotMatch(xiaowanziWxml, /xf-xiaowanzi-login-gate/);
assert.match(webviewWxml, /<phone-login-gate[^>]*visible="\{\{webviewLoginRequired\}\}"/);
assert.doesNotMatch(webviewWxml, /xf-webview-login-gate/);
```

- [ ] **Step 2: 运行目标测试并确认 RED**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: 新共享组件断言 FAIL。

- [ ] **Step 3: 迁移 Xiaowanzi 和 WebView**

每页注册并渲染共享组件；删除重复登录请求与专用 gate 样式。成功处理器只恢复读取状态：

```js
handleXiaowanziLoginSuccess() {
  this.setData({ xiaowanziLoginRequired: false, profilePanelMessage: "" });
  this.initializeXiaowanzi(this._initialOptions || {});
}

handleWebviewLoginSuccess() {
  const currentSrc = String(this.data.src || "").trim();
  const nextSrc = currentSrc
    ? buildWebUrl(currentSrc, { preserveXiaowanziLayer: isXiaowanziLayerWebview(currentSrc) ? "1" : "" })
    : "";
  this.setData({
    src: nextSrc || currentSrc,
    webviewLoginRequired: false,
    profilePanelMessage: "",
    nativeExpertAuthed: true
  });
  const expert = this.data.nativeExpert || {};
  if (this.data.nativeExpertMode && expert.id) this.loadNativeExpertAgentSession(expert);
}
```

- [ ] **Step 4: 运行目标测试并确认 GREEN**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交已有登录层迁移**

```bash
git add apps/wechat-miniprogram/pages/xiaowanzi apps/wechat-miniprogram/pages/webview apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "refactor(miniprogram): share native login gates"
```

### Task 4: Pro、知物与妈妈好赚错误分流

**Files:**
- Modify: `apps/wechat-miniprogram/pages/pro/index.{js,wxml,json}`
- Modify: `apps/wechat-miniprogram/pages/worthbuy/index.{js,wxml,json}`
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.{js,wxml,json}`
- Test: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
- Test: `apps/wechat-miniprogram/pages/worthbuy/index.static.test.mjs`
- Test: `apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`

**Interfaces:**
- Pro、Worthbuy 和 Mama Resource 统一新增 `loginRequired` 布尔值控制组件。
- Pro 登录成功刷新产品和用户状态，不创建订单。
- Worthbuy 登录成功刷新 `isLoggedIn` 和个人历史，不重新提交分析。
- Mama Resource 登录成功加载资料与任务，不重新提交证明或链接。

- [ ] **Step 1: 写三页失败测试**

每页断言共享组件存在；401/auth 打开组件；Pro/points/network 状态不打开组件；成功处理器不包含创建订单、submit 或 save 调用。

```js
assert.match(worthbuyWxml, /<phone-login-gate[^>]*visible="\{\{loginRequired\}\}"/);
assert.doesNotMatch(worthbuyWxml, /actionErrorType === 'auth'/);
assert.match(worthbuyJs, /statusCode === 401[\s\S]*loginRequired: true/);
assert.match(worthbuyJs, /actionErrorType: "pro"|actionErrorType: "points"/);
```

- [ ] **Step 2: 运行目标测试并确认 RED**

Run:

```bash
node --test apps/wechat-miniprogram/pages/worthbuy/index.static.test.mjs apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: 共享组件断言 FAIL。

- [ ] **Step 3: 迁移三页**

注册共享组件；把原 auth 文案/按钮分支改成 `loginRequired: true`；删除重复 `loginWithPhone`；分别绑定读取型恢复函数。明确保持：

```js
handleLoginSuccess() {
  this.setData({ loginRequired: false, isLoggedIn: true, actionError: "", actionErrorType: "" });
  this.loadMyHistory();
}
```

Pro 的 handler 调用 `loadBilling()`；Mama Resource 的 handler 调用 `loadMamaTasks()` 并保留已有 `onNativeSettingsLoginSuccess(payload)` 作为资料读取恢复入口。三个 handler 都不得调用 `createOrder`、`submit`、`claim`、`save` 或 `review`。

- [ ] **Step 4: 运行目标测试并确认 GREEN**

运行 Step 2 同一命令。Expected: PASS。

- [ ] **Step 5: 提交业务页迁移**

```bash
git add apps/wechat-miniprogram/pages/pro apps/wechat-miniprogram/pages/worthbuy apps/wechat-miniprogram/pages/mama-resource-apply apps/wechat-miniprogram/pages/tab-webview.static.test.mjs apps/wechat-miniprogram/pages/worthbuy/index.static.test.mjs apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs
git commit -m "fix(miniprogram): route protected actions to login gate"
```

### Task 5: 原生账号入口统一与全量审计

**Files:**
- Modify: `apps/wechat-miniprogram/pages/programs/index.{js,wxml,json}`
- Modify: `apps/wechat-miniprogram/pages/materials/index.{js,wxml,json}`
- Modify: `apps/wechat-miniprogram/pages/mine/index.{js,wxml,json}`
- Modify: `apps/wechat-miniprogram/utils/nativeSettings.js`
- Modify: `apps/wechat-miniprogram/utils/nativeSettings.static.test.mjs`
- Modify: 仅限 Step 1 审计确认为“受保护动作把鉴权失败渲染为普通错误”的页面；如有新文件，先把精确路径补入本计划 File Map 再修改。

**Interfaces:**
- `nativeSettings` exposes an action that sets page `loginRequired: true` instead of performing its own login request.
- Each page binds `handleLoginSuccess` to refresh its existing profile/login state.

- [ ] **Step 1: 运行未登录文案审计并保存基线**

Run:

```bash
rg -n "未登录或登录已过期|请先登录|登录已过期|actionErrorType === 'auth'|open-type=\"getPhoneNumber\"" apps/wechat-miniprogram/pages apps/wechat-miniprogram/utils --glob '*.js' --glob '*.wxml'
```

将结果分类为：正常设置状态标签、受保护动作错误、已有登录按钮。只迁移后两类；不删除设置页中纯状态展示“未登录”。

- [ ] **Step 2: 写原生入口失败测试**

断言 programs/materials/mine 注册并渲染共享组件；账号按钮使用 `bindtap="showLoginGate"`，不再直接维护 `getPhoneNumber` 请求；`nativeSettings.js` 不再包含第二份 `/api/wechat-mini/login`。

```js
assert.doesNotMatch(nativeSettingsSource, /url: "\/api\/wechat-mini\/login"/);
assert.match(programsWxml, /bindtap="showLoginGate"/);
assert.match(materialsWxml, /bindtap="showLoginGate"/);
assert.match(mineWxml, /bindtap="showLoginGate"/);
```

- [ ] **Step 3: 运行测试并确认 RED**

Run: `node --test apps/wechat-miniprogram/utils/nativeSettings.static.test.mjs`

Expected: FAIL。

- [ ] **Step 4: 迁移原生入口并复跑审计**

三页加入 `loginRequired`、共享组件和登录成功刷新；账号按钮改为普通 `bindtap`。复跑 Step 1，确认剩余 `getPhoneNumber` 仅存在共享组件和“已登录但未绑定手机号”的绑定手机流程；剩余未登录文案仅为纯状态标签或登录层内部反馈。

- [ ] **Step 5: 运行测试并确认 GREEN**

Run: `node --test apps/wechat-miniprogram/utils/nativeSettings.static.test.mjs`

Expected: PASS。

- [ ] **Step 6: 提交原生入口迁移**

```bash
git add apps/wechat-miniprogram/pages/programs apps/wechat-miniprogram/pages/materials apps/wechat-miniprogram/pages/mine apps/wechat-miniprogram/utils/nativeSettings.js apps/wechat-miniprogram/utils/nativeSettings.static.test.mjs
git commit -m "refactor(miniprogram): unify account login entry"
```

### Task 6: 全量验证与真实运行时检查

**Files:**
- Modify only files required by failures directly caused by Tasks 1-5.

- [ ] **Step 1: 运行鉴权核心测试**

```bash
node --test apps/wechat-miniprogram/components/phone-login-gate/index.test.mjs apps/wechat-miniprogram/utils/request.authExpiry.test.mjs apps/wechat-miniprogram/pages/welfare/index.test.mjs apps/wechat-miniprogram/pages/worthbuy/index.static.test.mjs apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs apps/wechat-miniprogram/utils/nativeSettings.static.test.mjs
```

Expected: 全部 PASS。

- [ ] **Step 2: 运行小程序广泛静态测试**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: 全部 PASS；不得通过删除 Pro、积分、支付或业务校验断言来修复测试。

- [ ] **Step 3: 检查差异和 AppleDouble 噪声**

```bash
git diff --check
git status --short
```

Expected: 无 `._*` 文件进入改动；只包含规格列出的组件、页面和测试。

- [ ] **Step 4: 微信开发者工具验证**

在清空本地会话的预览包依次验证：

1. 福利页加载返回 401 时直接显示共享登录层，不显示截图中的普通提示卡。
2. Xiaowanzi 受保护动作显示同一登录层。
3. Pro 未登录时显示登录层；Pro 权限不足仍显示 Pro 状态，不循环登录。
4. Worthbuy 未登录提交显示登录层；登录成功后不自动重新提交。
5. 原生设置账号入口显示同一登录层。
6. 拒绝手机号授权后停留登录层并可重试。

- [ ] **Step 5: 真机验证边界**

真机验证一次授权成功和一次拒绝。若模拟器在返回 `detail.code` 前失败，记录为微信授权层未验证，不改后端登录协议。

- [ ] **Step 6: 更新活动上下文并提交**

重写 `docs/ACTIVE_CONTEXT.md` 的当前登录行为：统一原页面共享登录层、401 触发、读取型恢复、写操作不自动重放。

```bash
git add docs/ACTIVE_CONTEXT.md
git commit -m "docs: record shared mini-program login gate"
```
