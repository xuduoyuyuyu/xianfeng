# Task 2 Report: 高亮渲染与释义弹窗

## 状态

COMPLETED

## 改动

- 逐字稿正文改为渲染 Task 1 产出的 `contentNodes`，字典节点使用紫色局部高亮并携带 `entryId` 点击事件。
- 新增 `selectedProgramDictionaryEntry` 状态，以及打开、关闭、阻止冒泡三个页面事件。
- 在原生节目详情根节点内新增底部释义层，展示词条、释义和可选别名；支持遮罩和关闭按钮关闭。
- 只修改了 brief 指定的 4 个小程序文件；未修改后台协议、`exports/` 或书籍富化计划文件。

## TDD RED

Command:

```bash
node --test --test-name-pattern="native program detail" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Result: exit 1; 212 tests discovered, 1 matching test failed, 211 skipped. Expected failure was the new WXML assertion at line 15373: the transcript did not contain the `item.contentNodes` dictionary highlight structure.

## TDD GREEN

Command:

```bash
node --test --test-name-pattern="native program detail" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Result: exit 0; 1 matching test passed, 211 skipped.

## 完整验证

```bash
node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Result: exit 0; 212/212 passed. The first run found four AppleDouble metadata files generated beside the edited files; after removing only those four `._*` files, the fresh rerun passed.

```bash
bash scripts/release/verify-mini-webview-ready.sh
```

Result: exit 0; mini-program/web compatibility suite 255/255 passed, WeChat backend helper suite 13/13 passed, TypeScript/Vite frontend build completed. Existing Vite warning: one output chunk exceeds 500 kB.

```bash
git diff --check
```

Result: exit 0; no whitespace errors. Git printed existing `non-monotonic index` warnings for AppleDouble pack index files under `.git/objects/pack`, without changing the exit result.

## 提交

`7da13387` (`feat: show transcript dictionary definitions`)

## 自审

- 词条查找仅从当前 `nativeProgram.dictionaryEntries` 读取，未命中时不改状态。
- 弹层在原生节目详情根节点内，不会出现在书籍、资料、专题、嘉宾或知物详情。
- 弹层内部使用 `catchtap="stopNativeEvent"`，遮罩和关闭按钮使用关闭事件。
- CSS 全部为 `xf-program-dictionary-*` 局部类，未改相邻组件规则。

## 关注点

- 未在微信开发者工具或真机上做视觉/点击验收；自动化覆盖了 WXML/WXSS 结构、打开与关闭状态、完整静态套件和前端构建。
- 仓库 `.git/objects/pack/._*.idx` 存在基线 AppleDouble `non-monotonic index` 告警；本任务未修改 `.git` 对象库。
- 共享工作树中既有未跟踪 `exports/xianfeng-clean-20260713-210912-6d0b67dabbed/` 保持原样。

## Task 2 审查修复

### 修复内容

- 高亮词节点新增 `role="button"` 和包含词条名称的释义 `aria-label`；释义 sheet 新增 `role="dialog"` 和可访问名称。
- 进入节目详情和重新装载节目成功时清空 `selectedProgramDictionaryEntry`，避免旧词条弹层泄漏到新节目。
- 补充未知 `entryId` 不改状态、打开/关闭不发请求不导航、sheet 阻止冒泡不关闭、关闭按钮绑定路径和旧状态清理的回归断言。

### RED

```bash
node --test --test-name-pattern="native program detail" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Result: exit 1; 212 tests discovered, 1 matching test failed, 211 skipped. Expected failure was the new WXML accessibility assertion at line 15373 because the dictionary highlight lacked `role="button"` and its descriptive `aria-label`.

### GREEN

```bash
node --test --test-name-pattern="native program detail" apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
```

Result: exit 0; 1 matching test passed, 211 skipped.

### 修复提交

`d56048ee` (`fix: harden program dictionary interactions`)

### 未验证与关注点

- 未在微信开发者工具或真机上验证读屏语义和触摸交互。
- `git diff --check` 退出 0，但仍输出仓库既有 `.git/objects/pack/._*.idx` 的 `non-monotonic index` 告警。
