# 小程序逐字稿教育词典高亮实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在小程序原生节目详情页逐字稿中高亮后台真实教育词典词条，并支持点击查看释义弹窗。

**Architecture:** 在现有 `pages/webview/index.js` 的节目详情归一化阶段，将 `dictionaryEntries` 规范化为可匹配词典，再把逐字稿正文拆成普通文本节点与词条节点。WXML 只渲染这些安全节点；页面级状态保存当前选中词条并控制底部弹窗，不新增接口或持久化行为。

**Tech Stack:** 微信小程序原生 JavaScript、WXML、WXSS、Node.js `node:test` 静态/行为测试。

## Global Constraints

- 仅处理节目详情页逐字稿正文，不处理简介、速览、脉络或其他页面。
- 只使用节目详情接口返回的 `dictionaryEntries`，不生成词条或释义。
- 不改变后台接口和持久化数据结构。
- 正式名称与别名均可匹配，重叠时最长词优先。
- 缺少词条名称或释义的记录不参与高亮。
- 弹窗在当前页展示，点击关闭按钮或遮罩关闭，不跳转、不新增网络请求。

---

## 文件结构

- `apps/wechat-miniprogram/pages/webview/index.js`：规范化词典、拆分逐字稿展示节点、维护弹窗状态和点击处理。
- `apps/wechat-miniprogram/pages/webview/index.wxml`：渲染普通/高亮文本节点及词条释义弹窗。
- `apps/wechat-miniprogram/pages/webview/index.wxss`：高亮词与底部弹窗样式。
- `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`：覆盖匹配规则、数据回退、点击/关闭交互和页面结构。

### Task 1: 词典规范化与逐字稿最长词匹配

**Files:**
- Modify: `apps/wechat-miniprogram/pages/webview/index.js:572-616,754-815`
- Test: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:15215-15230,15661-15670`

**Interfaces:**
- Consumes: `program.dictionaryEntries: Array<{ _id?: string; term?: string; definition?: string; aliases?: string[] }>` 与 `program.transcript`。
- Produces: `normalizeProgramDictionaryEntries(value)` 返回 `{ id, term, definition, aliases, aliasLabel, matchTerms }[]`；`buildTranscriptDictionaryNodes(text, entries)` 返回 `{ type: "text" | "dictionary", text, entryId?, term? }[]`；`nativeProgram.dictionaryEntries` 与每段 `nativeProgram.transcript[].contentNodes`。

- [ ] **Step 1: 添加会失败的行为测试夹具和断言**

在节目详情模拟响应中加入：

```js
dictionaryEntries: [
  {
    _id: "dictionary-international-education",
    term: "国际教育",
    definition: "以国际视野为指导的教育理念和实践。",
    aliases: ["国际化教育", "国际教育", ""]
  },
  {
    _id: "dictionary-education",
    term: "教育",
    definition: "培养人的社会活动。",
    aliases: []
  },
  {
    _id: "dictionary-empty-definition",
    term: "无释义词",
    definition: "",
    aliases: []
  }
],
// 保留现有 10 段逐字稿夹具，只把前两段的 text 改为：
// "国际教育也叫国际化教育，教育需要长期投入。"
// "这段没有词典内容。"
```

加入断言：

```js
assert.deepEqual(
  context.data.nativeProgram.transcript[0].contentNodes.map((node) => [node.type, node.text, node.term || ""]),
  [
    ["dictionary", "国际教育", "国际教育"],
    ["text", "也叫", ""],
    ["dictionary", "国际化教育", "国际教育"],
    ["text", "，", ""],
    ["dictionary", "教育", "教育"],
    ["text", "需要长期投入。", ""]
  ]
);
assert.deepEqual(context.data.nativeProgram.transcript[1].contentNodes, [
  { type: "text", text: "这段没有词典内容。" }
]);
assert.equal(context.data.nativeProgram.dictionaryEntries.length, 2);
```

- [ ] **Step 2: 运行定向测试并确认 RED**

Run:

```bash
node --test --test-name-pattern="native program detail" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: FAIL，提示 `contentNodes` 或 `dictionaryEntries` 不存在，而不是夹具或语法错误。

- [ ] **Step 3: 实现最小词典规范化和匹配逻辑**

在 `normalizeTranscript` 附近加入：

```js
function normalizeProgramDictionaryEntries(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const term = firstText([item && item.term, item && item.name], "");
      const definition = firstText([item && item.definition, item && item.description], "");
      if (!term || !definition) return null;
      const aliases = Array.isArray(item && item.aliases)
        ? item.aliases.map((alias) => String(alias || "").trim()).filter(Boolean)
        : [];
      const matchTerms = Array.from(new Set([term, ...aliases])).sort((a, b) => b.length - a.length);
      const normalizedAliases = matchTerms.filter((alias) => alias !== term);
      return {
        id: firstText([item && item._id, item && item.id], `dictionary-${index}`),
        term,
        definition,
        aliases: normalizedAliases,
        aliasLabel: normalizedAliases.join("、"),
        matchTerms
      };
    })
    .filter(Boolean);
}

function buildTranscriptDictionaryNodes(value, entries) {
  const text = String(value || "");
  const candidates = (Array.isArray(entries) ? entries : [])
    .flatMap((entry) => entry.matchTerms.map((matchText) => ({ entry, matchText })))
    .sort((left, right) => right.matchText.length - left.matchText.length);
  if (!text || !candidates.length) return text ? [{ type: "text", text }] : [];
  const nodes = [];
  let cursor = 0;
  while (cursor < text.length) {
    const matched = candidates.find((candidate) => text.startsWith(candidate.matchText, cursor));
    if (matched) {
      nodes.push({
        type: "dictionary",
        text: matched.matchText,
        entryId: matched.entry.id,
        term: matched.entry.term
      });
      cursor += matched.matchText.length;
      continue;
    }
    const previous = nodes[nodes.length - 1];
    if (previous && previous.type === "text") previous.text += text[cursor];
    else nodes.push({ type: "text", text: text[cursor] });
    cursor += 1;
  }
  return nodes;
}
```

让 `normalizeTranscript(value, dictionaryEntries)` 为每段生成 `contentNodes`，并在 `normalizeProgramDetail` 中先规范化 `item.dictionaryEntries`，再传给逐字稿归一化，最后把 `dictionaryEntries` 放入 `nativeProgram`。

- [ ] **Step 4: 运行定向测试并确认 GREEN**

Run:

```bash
node --test --test-name-pattern="native program detail" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: PASS；正式名称、别名、最长词优先及无命中回退断言全部通过。

- [ ] **Step 5: 提交数据层改动**

```bash
git add apps/wechat-miniprogram/pages/webview/index.js apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "feat: annotate transcript dictionary terms"
```

### Task 2: 高亮渲染与释义弹窗交互

**Files:**
- Modify: `apps/wechat-miniprogram/pages/webview/index.js:1763-1850,3200-3300`
- Modify: `apps/wechat-miniprogram/pages/webview/index.wxml:156-166` and end of native program detail root
- Modify: `apps/wechat-miniprogram/pages/webview/index.wxss:574-600` and adjacent overlay styles
- Test: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs:15350-15360,15661-15690`

**Interfaces:**
- Consumes: Task 1 生成的 `nativeProgram.transcript[].contentNodes` 与 `nativeProgram.dictionaryEntries`。
- Produces: 页面状态 `selectedProgramDictionaryEntry: null | { id, term, definition, aliases, aliasLabel }`；事件 `openProgramDictionaryEntry(event)`、`closeProgramDictionaryEntry()` 和 `stopNativeEvent()`。

- [ ] **Step 1: 添加会失败的 WXML、WXSS 和交互断言**

加入结构断言：

```js
assert.match(wxml, /wx:for="\{\{item\.contentNodes\}\}"[\s\S]*wx:if="\{\{node\.type === 'dictionary'\}\}"[\s\S]*data-entry-id="\{\{node\.entryId\}\}"[\s\S]*catchtap="openProgramDictionaryEntry"/);
assert.match(wxml, /wx:if="\{\{selectedProgramDictionaryEntry\}\}" class="xf-program-dictionary-overlay" catchtap="closeProgramDictionaryEntry"/);
assert.match(wxml, /class="xf-program-dictionary-sheet" catchtap="stopNativeEvent"/);
assert.match(wxml, /\{\{selectedProgramDictionaryEntry\.term\}\}[\s\S]*\{\{selectedProgramDictionaryEntry\.definition\}\}/);
assert.match(wxss, /\.xf-program-dictionary-term \{[\s\S]*color: #5e17eb;[\s\S]*background:/);
assert.match(wxss, /\.xf-program-dictionary-overlay \{[\s\S]*position: fixed;[\s\S]*z-index:/);
```

加入行为断言：

```js
definition.openProgramDictionaryEntry.call(context, {
  currentTarget: { dataset: { entryId: "dictionary-international-education" } }
});
assert.equal(context.data.selectedProgramDictionaryEntry.term, "国际教育");
assert.equal(context.data.selectedProgramDictionaryEntry.definition, "以国际视野为指导的教育理念和实践。");
assert.deepEqual(context.data.selectedProgramDictionaryEntry.aliases, ["国际化教育"]);
definition.closeProgramDictionaryEntry.call(context);
assert.equal(context.data.selectedProgramDictionaryEntry, null);
```

- [ ] **Step 2: 运行定向测试并确认 RED**

Run:

```bash
node --test --test-name-pattern="native program detail" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: FAIL，提示缺少高亮节点、弹窗结构或事件方法。

- [ ] **Step 3: 实现最小页面状态和事件**

在 `Page.data` 中加入：

```js
selectedProgramDictionaryEntry: null,
```

在 Page 方法中加入：

```js
openProgramDictionaryEntry(event) {
  const entryId = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.entryId || "");
  const entries = this.data.nativeProgram && Array.isArray(this.data.nativeProgram.dictionaryEntries)
    ? this.data.nativeProgram.dictionaryEntries
    : [];
  const entry = entries.find((item) => item.id === entryId);
  if (!entry) return;
  this.setData({ selectedProgramDictionaryEntry: entry });
},

closeProgramDictionaryEntry() {
  this.setData({ selectedProgramDictionaryEntry: null });
},

stopNativeEvent() {
  return false;
},
```

使用 `stopNativeEvent()` 阻止点击卡片本身触发遮罩关闭。

- [ ] **Step 4: 实现 WXML 高亮节点和弹窗**

将逐字稿正文替换为节点循环：

```xml
<text class="xf-program-detail-content-text">
  <block wx:for="{{item.contentNodes}}" wx:for-item="node" wx:key="index">
    <text
      wx:if="{{node.type === 'dictionary'}}"
      class="xf-program-dictionary-term"
      data-entry-id="{{node.entryId}}"
      catchtap="openProgramDictionaryEntry"
    >{{node.text}}</text>
    <text wx:else>{{node.text}}</text>
  </block>
</text>
```

在原生节目详情根节点内加入：

```xml
<view wx:if="{{selectedProgramDictionaryEntry}}" class="xf-program-dictionary-overlay" catchtap="closeProgramDictionaryEntry">
  <view class="xf-program-dictionary-sheet" catchtap="stopNativeEvent">
    <view class="xf-program-dictionary-head">
      <text class="xf-program-dictionary-title">{{selectedProgramDictionaryEntry.term}}</text>
      <button class="xf-program-dictionary-close" catchtap="closeProgramDictionaryEntry" aria-label="关闭">×</button>
    </view>
    <text class="xf-program-dictionary-definition">{{selectedProgramDictionaryEntry.definition}}</text>
    <view wx:if="{{selectedProgramDictionaryEntry.aliasLabel}}" class="xf-program-dictionary-aliases">
      <text class="xf-program-dictionary-alias-label">别名</text>
      <text>{{selectedProgramDictionaryEntry.aliasLabel}}</text>
    </view>
  </view>
</view>
```

- [ ] **Step 5: 实现局部 WXSS 样式**

新增局部类，保持既有紫色体系：

```css
.xf-program-dictionary-term {
  margin: 0 2rpx;
  padding: 1rpx 6rpx;
  border-radius: 8rpx;
  background: rgba(94, 23, 235, 0.1);
  color: #5e17eb;
  font-weight: 800;
}

.xf-program-dictionary-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: flex-end;
  background: rgba(20, 16, 28, 0.42);
}

.xf-program-dictionary-sheet {
  box-sizing: border-box;
  width: 100%;
  padding: 34rpx 34rpx calc(34rpx + env(safe-area-inset-bottom));
  border-radius: 32rpx 32rpx 0 0;
  background: #ffffff;
}
```

补充 `head/title/close/definition/aliases` 的字号、间距和颜色，仅服务该弹窗，不改相邻组件。

- [ ] **Step 6: 运行定向测试并确认 GREEN**

Run:

```bash
node --test --test-name-pattern="native program detail" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Expected: PASS；高亮渲染、弹窗内容、打开与两种关闭路径断言均通过。

- [ ] **Step 7: 运行完整小程序验证**

Run:

```bash
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
bash scripts/release/verify-mini-webview-ready.sh
git diff --check
```

Expected: 所有测试通过；前端构建成功；无 whitespace error。允许既有 Vite 大 chunk 警告，不允许测试失败或编译错误。

- [ ] **Step 8: 提交 UI 与交互改动**

```bash
git add apps/wechat-miniprogram/pages/webview/index.js apps/wechat-miniprogram/pages/webview/index.wxml apps/wechat-miniprogram/pages/webview/index.wxss apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "feat: show transcript dictionary definitions"
```

### Task 3: 微信开发者工具运行态验收

**Files:**
- Verify only; no source changes expected.

**Interfaces:**
- Consumes: Task 2 完成的小程序包和一个生产详情接口含 `dictionaryEntries` 的节目。
- Produces: 真实开发者工具运行态证据；不产生新功能接口。

- [ ] **Step 1: 打开真实节目详情路由**

使用微信开发者工具加载含教育词典词条的原生节目详情，进入“逐字稿”标签。优先使用生产详情接口已确认含 `dictionaryEntries` 的节目，不使用纯静态截图作为验收依据。

- [ ] **Step 2: 核对运行态成功标准**

确认：

1. 命中词条呈紫色高亮，未命中文本保持原样。
2. 点击正式名称和别名都打开同一词条释义。
3. 弹窗展示真实名称、释义和存在时的别名。
4. 点击关闭按钮和遮罩均关闭弹窗。
5. 逐字稿滚动、播放悬浮按钮及其他详情标签不受影响。

- [ ] **Step 3: 记录未验证边界**

若开发者工具无法访问生产接口或微信登录态失效，明确报告运行态未验证，不以静态测试替代真实路由结论。
