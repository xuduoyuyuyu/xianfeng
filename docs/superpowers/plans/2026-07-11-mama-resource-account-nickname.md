# 妈妈好赚账号昵称 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每个妈妈好赚媒体账号必填昵称，并在总览和编辑卡片中只以昵称作为标题。

**Architecture:** 复用现有申请草稿和 `mediaAccounts[].nickname` 数据结构，为主小红书账号增加 `xiaohongshuNickname` 草稿字段，提交时映射到主账号 `nickname`。标题展示统一采用昵称，历史空昵称只读时回退到原平台序号。

**Tech Stack:** 微信小程序 JavaScript/WXML、Node.js `node:test` 静态回归测试。

## Global Constraints

- 账号昵称必填。
- 标题只显示账号昵称，不拼平台名或账号序号。
- 平台仍由 Logo 和平台字段表达。
- 历史空昵称只读时保留平台序号回退，再次保存时必须补填。
- 不修改后台编辑、审核或任务流程。

---

### Task 1: 主账号昵称数据流、必填校验和标题

**Files:**
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.js`
- Modify: `apps/wechat-miniprogram/pages/mama-resource-apply/index.wxml`

**Interfaces:**
- Consumes: 现有 `normalizeApplyDraft`、`buildProfileOverview`、`buildSubmitMediaAccounts`、`submitMamaResourcePayload` 和 `updateDraftField`。
- Produces: 草稿字段 `xiaohongshuNickname: string`，提交账号字段 `nickname: string`，昵称优先标题和提交前空昵称拦截。

- [ ] **Step 1: 写失败测试**

在静态测试中断言：主账号昵称输入绑定 `formDraft.xiaohongshuNickname`；主账号构造包含 `nickname: draft.xiaohongshuNickname`；账号标题使用 `account.nickname ||` 回退；新增账号卡标题使用 `item.nickname ||` 回退；额外账号昵称不再标记“可选”；提交前同时校验主账号和额外账号昵称。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`

Expected: FAIL，缺少 `xiaohongshuNickname` 绑定或昵称标题/校验断言。

- [ ] **Step 3: 写最小实现**

在 `EMPTY_APPLY_DRAFT` 和 `normalizeApplyDraft` 增加 `xiaohongshuNickname`；主账号归一化和提交映射传入该昵称；WXML 在主账号链接前增加必填昵称输入；标题表达式优先昵称并保留历史回退；提交前分别拦截主账号和每个额外账号的空昵称。

- [ ] **Step 4: 运行定向验证**

Run: `node --test apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`

Expected: PASS，全部测试失败数为 0。

Run: `node --check apps/wechat-miniprogram/pages/mama-resource-apply/index.js`

Expected: exit 0，无语法错误。

Run: `git diff --check -- apps/wechat-miniprogram/pages/mama-resource-apply/index.js apps/wechat-miniprogram/pages/mama-resource-apply/index.wxml apps/wechat-miniprogram/pages/mama-resource-apply/index.static.test.mjs`

Expected: exit 0，无空白错误；仓库已有 `.git/objects/pack/._*` 噪声若再次干扰需单独如实记录。

- [ ] **Step 5: 微信开发者工具验证**

打开 `pages/mama-resource-apply/index` 的资料管理页，确认主账号昵称可录入、空昵称被拦截、新增账号标题只显示昵称、保存后的总览标题只显示昵称；真机手机号授权故障不属于本任务完成条件。
