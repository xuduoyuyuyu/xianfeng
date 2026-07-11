# 请教一下话题详情原生化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留原生请教列表，把 `/topics/:slug` 详情从 WebView 切换为功能与移动版一致的小程序原生详情。

**Architecture:** 复用 `pages/webview/index` 已存在的 `nativeTopicMode`，通过明确的 `topicSlug` 与 `userId` 参数进入，不加载详情 WebView。扩充当前标准化数据、节点请求和 WXML 状态，使它覆盖移动版 `TopicDetailPage` 的完整知识树、节点正文、展开、提问与下一节点交互。

**Tech Stack:** 微信小程序 JavaScript/WXML/WXSS、现有 `request` 封装、Node.js `node:test` 静态与行为测试、Express topic API。

## Global Constraints

- 移动版 `frontend/src/pages/TopicDetailPage.tsx` 是能力、数据与视觉基准。
- 不修改 `pages/topics/index` 已有列表、筛选、提交和卡片设计。
- 不新建重复详情页；复用 `pages/webview/index` 的 `nativeTopicMode`。
- 相关话题继续进入原生详情；尚未原生化的复杂站内内容允许临时进入 WebView。
- 空字段不显示伪造占位内容，不复制静态示例数据。
- 每项实现先写失败测试，再写最小代码。
- 工作区已有大量用户改动；只暂存本任务明确列出的文件。

---

## File Map

- `apps/wechat-miniprogram/pages/topics/index.js`：列表到原生详情的入口，只改点击路由。
- `apps/wechat-miniprogram/pages/webview/index.js`：话题详情参数、数据标准化、节点状态、请求和交互 owner。
- `apps/wechat-miniprogram/pages/webview/index.wxml`：话题详情原生结构和状态渲染。
- `apps/wechat-miniprogram/pages/webview/index.wxss`：仅话题详情选择器的移动版视觉对齐。
- `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`：入口契约、数据行为和视图绑定回归。
- `docs/superpowers/specs/2026-07-11-topic-detail-native-design.md`：已批准设计，不在实施中扩 scope。

---

### Task 1: 列表切换到原生详情入口

**Files:**
- Modify: `apps/wechat-miniprogram/pages/topics/index.js`
- Test: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

**Interfaces:**
- Consumes: topic `{ slug, id, title, canOpen }` 与 `getCurrentUserId()`。
- Produces: `/pages/webview/index?nativeTopic=1&topicSlug=<slug>&userId=<uid>&title=<title>` 导航契约。

- [ ] **Step 1: 写失败测试，锁定详情不再调用 `openWeb`**

在 topics 静态断言区加入：

```js
assert.match(topics.js, /nativeTopic=1/);
assert.match(topics.js, /topicSlug=\$\{encodeURIComponent\(topicSlug\)\}/);
assert.doesNotMatch(topics.js, /openWeb\(topic\.path, topic\.title/);
```

- [ ] **Step 2: 运行定向测试并确认失败**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs --test-name-pattern="native topic|topics native"`

Expected: FAIL，提示 `nativeTopic=1` 或 `topicSlug` 未匹配。

- [ ] **Step 3: 最小修改 `openTopic`**

保留 `canOpen` 防护，替换详情 WebView 调用：

```js
const topicSlug = String(topic.slug || topic.id || "").trim();
const userId = getCurrentUserId();
const params = [
  "nativeTopic=1",
  `topicSlug=${encodeURIComponent(topicSlug)}`,
  `title=${encodeURIComponent(topic.title || "请教一下")}`
];
if (userId) params.push(`userId=${encodeURIComponent(userId)}`);
wx.navigateTo({ url: `/pages/webview/index?${params.join("&")}` });
```

- [ ] **Step 4: 运行定向测试并确认通过**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs --test-name-pattern="native topic|topics native"`

Expected: PASS。

- [ ] **Step 5: 提交本任务文件**

```bash
git add apps/wechat-miniprogram/pages/topics/index.js apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "feat: open topic details natively"
```

---

### Task 2: 完整话题与节点数据模型

**Files:**
- Modify: `apps/wechat-miniprogram/pages/webview/index.js`
- Test: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

**Interfaces:**
- Consumes: options `nativeTopic`, `topicSlug`, `userId`；API `/api/topic-hub/:slug` 和 `/nodes/:nodeKey`。
- Produces: `nativeTopic`, `nativeTopicNodes`, `activeTopicNodeKey`, `activeTopicNode`, `nativeTopicNodeLoading`, `nativeTopicNodeError`, `nativeTopicNodeCache`。

- [ ] **Step 1: 写失败行为测试**

新增 page harness 场景，传入 `nativeTopic=1&topicSlug=topic-1&userId=user-1`，断言：

```js
assert.equal(page.data.nativeTopicMode, true);
assert.equal(page.data.nativeTopic.slug, "topic-1");
assert.equal(page.data.activeTopicNodeKey, "node-1");
assert.equal(requests.some((url) => url.includes("/api/topic-hub/topic-1?userId=user-1")), true);
assert.equal(requests.some((url) => url.includes("/api/topic-hub/topic-1/nodes/node-1?userId=user-1")), true);
```

- [ ] **Step 2: 运行测试并确认节点状态缺失**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs --test-name-pattern="native topic detail loads"`

Expected: FAIL，`activeTopicNodeKey` 或节点请求不存在。

- [ ] **Step 3: 扩充标准化模型**

让每个树节点至少保留以下字段：

```js
{
  id,
  nodeKey,
  title,
  summary,
  content: "",
  expandedContent: "",
  questions: []
}
```

增加扁平化函数：

```js
function flattenTopicNodes(tree) {
  return (Array.isArray(tree) ? tree : []).flatMap((branch) =>
    (Array.isArray(branch.children) ? branch.children : []).map((node) => ({
      ...node,
      branchId: branch.id,
      branchTitle: branch.title
    }))
  );
}
```

- [ ] **Step 4: 实现详情初始化与节点缓存请求**

新增 `loadNativeTopicNode(nodeKey, options = {})`：命中 `nativeTopicNodeCache[nodeKey]` 时直接展示；否则请求：

```js
request({
  url: `/api/topic-hub/${encodeURIComponent(slug)}/nodes/${encodeURIComponent(nodeKey)}${userId ? `?userId=${encodeURIComponent(userId)}` : ""}`
})
```

请求失败只设置 `nativeTopicNodeError`，不得清空 `nativeTopic` 和知识树。

- [ ] **Step 5: 运行行为测试并确认通过**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs --test-name-pattern="native topic detail loads|native topic node cache"`

Expected: PASS，第二次选择同节点不新增请求。

- [ ] **Step 6: 提交本任务文件**

```bash
git add apps/wechat-miniprogram/pages/webview/index.js apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "feat: load native topic knowledge nodes"
```

---

### Task 3: 节点导航、正文和下一知识点

**Files:**
- Modify: `apps/wechat-miniprogram/pages/webview/index.js`
- Modify: `apps/wechat-miniprogram/pages/webview/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/webview/index.wxss`
- Test: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `nativeTopicNodes`、`activeTopicNodeKey`、`loadNativeTopicNode(nodeKey)`。
- Produces: `selectNativeTopicNode(event)`、`retryNativeTopicNode()`、`nextNativeTopicNode`、`enterNextNativeTopicNode()` 与滚动状态。

- [ ] **Step 1: 写失败视图契约测试**

```js
assert.match(webview.wxml, /bindtap="selectNativeTopicNode"/);
assert.match(webview.wxml, /nativeTopicNodeLoading/);
assert.match(webview.wxml, /activeTopicNode\.content/);
assert.match(webview.wxml, /bindtap="enterNextNativeTopicNode"/);
assert.match(webview.wxml, /已完成全部知识点/);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs --test-name-pattern="native topic node view"`

Expected: FAIL，缺少节点选择或下一节点绑定。

- [ ] **Step 3: 将静态知识点列表改为可选择导航**

每个节点按钮携带 `data-node-key`，激活态由 `activeTopicNodeKey === node.nodeKey` 控制。正文区分别渲染 loading、error、content；错误按钮调用 `retryNativeTopicNode`。

- [ ] **Step 4: 实现下一节点计算和切换**

```js
function getNextTopicNode(nodes, activeKey) {
  const index = nodes.findIndex((node) => node.nodeKey === activeKey);
  return index >= 0 && index + 1 < nodes.length ? nodes[index + 1] : null;
}
```

`enterNextNativeTopicNode()` 调用 `loadNativeTopicNode(next.nodeKey, { resetScroll: true })`。到最后节点后显示“已完成全部知识点”。上拉手势沿用移动版阈值语义，只在 scroll-view 到底后进入 ready 状态。

- [ ] **Step 5: 添加局部 WXSS**

只新增或修改 `.xf-topic-detail-*` 选择器，覆盖节点选中态、正文、重试区、上拉提示和完成态；不得修改共享 `.xf-native-*` 卡片规则。

- [ ] **Step 6: 运行测试**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs --test-name-pattern="native topic node view|next native topic node"`

Expected: PASS。

- [ ] **Step 7: 提交本任务文件**

```bash
git add apps/wechat-miniprogram/pages/webview/index.js apps/wechat-miniprogram/pages/webview/index.wxml apps/wechat-miniprogram/pages/webview/index.wxss apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "feat: navigate native topic knowledge detail"
```

---

### Task 4: 展开讲讲、提问与权限错误

**Files:**
- Modify: `apps/wechat-miniprogram/pages/webview/index.js`
- Modify: `apps/wechat-miniprogram/pages/webview/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/webview/index.wxss`
- Test: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

**Interfaces:**
- Consumes: 当前 `nativeTopic.slug`、`activeTopicNode.nodeKey`、用户会话和现有 `request` 错误对象。
- Produces: `expandNativeTopicNode()`、`submitNativeTopicQuestion()`、`nativeTopicExpandLoading`、`nativeTopicQuestionText`、`nativeTopicQuestionLoading`、`nativeTopicActionError`。

- [ ] **Step 1: 写失败行为测试**

断言展开请求、提问请求和错误状态：

```js
assert.equal(requests.some((item) => item.url.endsWith("/api/topic-hub/topic-1/expand") && item.method === "POST"), true);
assert.equal(requests.some((item) => item.url.endsWith("/api/topic-hub/topic-1/ask") && item.method === "POST"), true);
assert.equal(page.data.nativeTopic.slug, "topic-1");
assert.equal(page.data.activeTopicNode.content, "existing content");
```

401 场景断言触发现有登录入口；402 场景断言展示 Pro 升级反馈，且已有正文不被清空。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs --test-name-pattern="native topic expand|native topic ask|native topic auth"`

Expected: FAIL，缺少处理方法或请求。

- [ ] **Step 3: 实现展开操作**

发送当前节点标识：

```js
request({
  url: `/api/topic-hub/${encodeURIComponent(slug)}/expand`,
  method: "POST",
  data: { nodeKey }
})
```

成功后合并 `expandedContent` 到当前节点及缓存；失败只设置 `nativeTopicActionError`。

- [ ] **Step 4: 实现提问操作**

空白输入直接返回。请求体包含当前问题与节点上下文：

```js
request({
  url: `/api/topic-hub/${encodeURIComponent(slug)}/ask`,
  method: "POST",
  data: { question, nodeKey }
})
```

成功后清空输入并追加返回问题/回答；失败保留用户输入以便重试。

- [ ] **Step 5: 复用现有 401/402 处理**

不要新增另一套登录或付费弹窗。401 调用现有会话失效入口；`statusCode === 402` 或 `data.code === "PRO_REQUIRED"` 调用现有 Pro 反馈方法。

- [ ] **Step 6: 添加 WXML 与局部样式**

正文下方依次放置展开按钮、展开内容、提问输入、发送按钮、错误信息和问题列表。按钮 loading 时禁用重复提交。

- [ ] **Step 7: 运行测试并确认通过**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs --test-name-pattern="native topic expand|native topic ask|native topic auth"`

Expected: PASS。

- [ ] **Step 8: 提交本任务文件**

```bash
git add apps/wechat-miniprogram/pages/webview/index.js apps/wechat-miniprogram/pages/webview/index.wxml apps/wechat-miniprogram/pages/webview/index.wxss apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "feat: add native topic expansion and questions"
```

---

### Task 5: 相关话题、返回链路与完整回归

**Files:**
- Modify: `apps/wechat-miniprogram/pages/webview/index.js`
- Modify: `apps/wechat-miniprogram/pages/webview/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/webview/index.wxss`
- Modify: `apps/wechat-miniprogram/README.md`
- Test: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`
- Test: `apps/wechat-miniprogram/utils/webview.static.test.mjs`

**Interfaces:**
- Consumes: Task 1 的原生详情参数与 Task 2 的详情初始化方法。
- Produces: `openNativeRelatedTopic(event)` 和完成后的原生 topics 路由说明。

- [ ] **Step 1: 写失败测试**

```js
assert.match(webview.wxml, /bindtap="openNativeRelatedTopic"/);
assert.match(webview.js, /openNativeRelatedTopic\(event\)/);
assert.doesNotMatch(topics.js, /openWeb\(topic\.path, topic\.title/);
```

行为测试需断言切换相关话题后清空旧节点 loading/error、请求新 slug，并将详情滚动回顶部。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs --test-name-pattern="native related topic|topic detail route"`

Expected: FAIL，相关话题仍不可点击或未原生切换。

- [ ] **Step 3: 实现原生相关话题切换**

`openNativeRelatedTopic(event)` 读取 `data-slug`，调用同一详情初始化方法；重置当前节点、节点缓存、action error 和 scrollTop，但不退出 `nativeTopicMode`。

- [ ] **Step 4: 修正文档**

将 README 中“详情通过 `pages/webview` 打开 `/topics/:slug`”改为：列表和详情均为原生；详情引用的未原生化复杂内容可通过 WebView 打开。

- [ ] **Step 5: 运行完整自动化验证**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: 全部 PASS。

Run: `node --test apps/wechat-miniprogram/utils/webview.static.test.mjs`

Expected: 全部 PASS；非话题 WebView 行为无回归。

- [ ] **Step 6: 运行语法和差异检查**

Run: `node --check apps/wechat-miniprogram/pages/topics/index.js`

Expected: 无输出，退出码 0。

Run: `node --check apps/wechat-miniprogram/pages/webview/index.js`

Expected: 无输出，退出码 0。

Run: `git diff --check -- apps/wechat-miniprogram/pages/topics/index.js apps/wechat-miniprogram/pages/webview/index.js apps/wechat-miniprogram/pages/webview/index.wxml apps/wechat-miniprogram/pages/webview/index.wxss apps/wechat-miniprogram/pages/tab-webview.static.test.mjs apps/wechat-miniprogram/README.md`

Expected: 无输出，退出码 0。

- [ ] **Step 7: 微信开发者工具逐状态验证**

使用与移动版相同用户和同一真实话题，逐项记录：首屏标题、知识树、首节点正文、非首节点、展开讲讲、提问成功、提问失败、下一节点、最后节点、相关话题、返回列表。每项都必须确认数据结果与移动版一致；视觉差异只修改 `.xf-topic-detail-*`。

- [ ] **Step 8: 提交本任务文件**

```bash
git add apps/wechat-miniprogram/pages/webview/index.js apps/wechat-miniprogram/pages/webview/index.wxml apps/wechat-miniprogram/pages/webview/index.wxss apps/wechat-miniprogram/pages/tab-webview.static.test.mjs apps/wechat-miniprogram/utils/webview.static.test.mjs apps/wechat-miniprogram/README.md
git commit -m "feat: complete native topic detail flow"
```

