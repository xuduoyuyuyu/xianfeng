# 小程序嘉宾著作与社交媒体 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在小程序原生嘉宾详情页展示真实嘉宾著作和社交媒体，并提供站内图书详情跳转与复制社交账号能力。

**Architecture:** 公开嘉宾详情接口负责查询并序列化精确作者匹配的公开图书，返回完整 `authoredBooks`。小程序在现有 `normalizeExpertDetail` 中归一化著作和社交数据，WXML 仅在有真实数据时渲染两个独立板块；著作复用现有原生图书详情加载，社交条目只复制链接或账号名称。

**Tech Stack:** Express, Mongoose, TypeScript, WeChat Mini Program JavaScript/WXML/WXSS, Node test runner

## Global Constraints

- 著作只来自公开图书记录与嘉宾姓名的精确作者匹配，不混入公开内容、出版物或外部引用。
- 无真实内容时不渲染空板块，不生成占位数据或虚假封面。
- 网页端现有跳转行为不变；小程序社交媒体不打开第三方网页。
- 小程序社交条目优先复制链接，没有链接时复制账号名称。
- 不新增接口、不迁移数据库、不重构无关嘉宾详情逻辑。

---

### Task 1: 嘉宾详情返回真实著作

**Files:**
- Modify: `backend/src/controllers/guest.ts`
- Modify: `backend/src/controllers/guest.test.ts`

**Interfaces:**
- Consumes: `Book` 模型的 `_id`, `title`, `author`, `publisher`, `publishedDate`, `coverImage`, `status`
- Produces: `loadGuestAuthoredBooks(guestName: string): Promise<GuestAuthoredBook[]>` 和公开嘉宾详情字段 `authoredBooks`

- [ ] **Step 1: 写失败的后端契约测试**

在 `backend/src/controllers/guest.test.ts` 增加源码契约测试，要求查询条件同时包含精确作者名和 `status: "published"`，响应包含完整 `authoredBooks`，且没有 `.slice(...)` 截断：

```ts
test("returns complete published books authored by the exact guest name", () => {
  const source = readFileSync(new URL("./guest.ts", import.meta.url), "utf8");
  assert.match(source, /loadGuestAuthoredBooks\(guestName: string\)/);
  assert.match(source, /Book\.find\(\s*\{ author: guestName, status: "published" \}/);
  assert.match(source, /authoredBooks[,\s]/);
  assert.doesNotMatch(source, /authoredBooks\.slice\(/);
});
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `cd backend && node --test --import tsx src/controllers/guest.test.ts`

Expected: FAIL，提示缺少 `loadGuestAuthoredBooks` 或 `authoredBooks` 响应字段。

- [ ] **Step 3: 实现最小著作查询和序列化**

在 `backend/src/controllers/guest.ts` 增加：

```ts
type GuestAuthoredBook = {
  id: string;
  title: string;
  coverImage: string;
  publishedDate: string;
  publisher: string;
  hasDetail: boolean;
};

export async function loadGuestAuthoredBooks(guestName: string): Promise<GuestAuthoredBook[]> {
  if (!guestName) return [];
  try {
    const rows = await Book.find(
      { author: guestName, status: "published" },
      { title: 1, coverImage: 1, publishedDate: 1, publisher: 1 }
    ).lean();
    return rows
      .map((book: any) => ({
        id: String(book?._id || ""),
        title: asText(book?.title),
        coverImage: fixAvatarUrl(asText(book?.coverImage)),
        publishedDate: asText(book?.publishedDate),
        publisher: asText(book?.publisher),
        hasDetail: Boolean(book?._id),
      }))
      .filter((book) => book.id && book.title)
      .sort((a, b) => b.publishedDate.localeCompare(a.publishedDate));
  } catch (error) {
    console.error("[guest-detail] failed to load authored books", error);
    return [];
  }
}
```

在 `getByIdPublic` 中使用已经读取到的嘉宾姓名：

```ts
const authoredBooks = await loadGuestAuthoredBooks(asText(guest?.name));
res.status(200).json({
  ...serializeGuestListItem(guest, countMap.get(id) || 0),
  relatedPrograms: relatedPrograms.map(serializeProgramCard),
  bookLists,
  authoredBooks,
});
```

- [ ] **Step 4: 运行后端测试并确认 GREEN**

Run: `cd backend && node --test --import tsx src/controllers/guest.test.ts src/utils/bookSourceNames.test.ts`

Expected: PASS，现有嘉宾和书单测试同时通过。

- [ ] **Step 5: 提交后端增量**

```bash
git add backend/src/controllers/guest.ts backend/src/controllers/guest.test.ts
git commit -m "feat: return guest authored books"
```

### Task 2: 小程序归一化与交互行为

**Files:**
- Modify: `apps/wechat-miniprogram/pages/webview/index.js`
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

**Interfaces:**
- Consumes: 嘉宾详情响应的 `authoredBooks` 和 `socialProfiles`
- Produces: `nativeExpert.authoredBooks`, `nativeExpert.socialProfiles`, `openNativeExpertAuthoredBook(event)`, `copyNativeExpertSocial(event)`

- [ ] **Step 1: 写失败的归一化和交互测试**

在测试嘉宾响应中加入：

```js
authoredBooks: [
  { id: "book-1", title: "高手父母", coverImage: "/uploads/books/parent.jpg", publishedDate: "2026", publisher: "浙江出版", hasDetail: true }
],
socialProfiles: [
  { platform: "公众号", label: "老魏咖啡馆", url: "https://example.com/laowei" },
  { platform: "视频号", label: "魏智渊" }
]
```

增加断言：

```js
assert.equal(page.data.nativeExpert.authoredBooks[0].title, "高手父母");
assert.equal(page.data.nativeExpert.socialProfiles.length, 2);
assert.match(source, /openNativeExpertAuthoredBook\(event\)/);
assert.match(source, /copyNativeExpertSocial\(event\)/);
assert.match(source, /wx\.setClipboardData/);
```

- [ ] **Step 2: 运行小程序测试并确认 RED**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: FAIL，提示著作归一化字段或交互方法缺失。

- [ ] **Step 3: 实现著作与社交归一化**

在 `normalizeExpertDetail` 中生成：

```js
const authoredBooks = (Array.isArray(item.authoredBooks) ? item.authoredBooks : [])
  .map((book) => ({
    id: firstText([book && book.id, book && book._id], ""),
    title: firstText([book && book.title], ""),
    coverImage: normalizeBookImage(book && book.coverImage),
    publishedDate: firstText([book && book.publishedDate], ""),
    publisher: firstText([book && book.publisher], ""),
    hasDetail: book && book.hasDetail === true
  }))
  .filter((book) => book.id && book.title);

const socialProfiles = normalizeExpertLinks(item.socialProfiles)
  .filter((profile) => profile.title || profile.label || profile.url || profile.source);
```

并将 `authoredBooks`、`socialProfiles`、`hasAuthoredBooks` 和 `hasSocialProfiles` 放入返回对象。

- [ ] **Step 4: 实现著作跳转和社交复制**

在 Page 方法中增加：

```js
openNativeExpertAuthoredBook(event) {
  const id = firstText([event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.id], "");
  const hasDetail = event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.detail === true;
  if (!id || !hasDetail) return;
  this.setData({ nativeBookLoading: true, nativeBookError: "" });
  return this.loadNativeBook(id);
},

copyNativeExpertSocial(event) {
  const dataset = event && event.currentTarget ? event.currentTarget.dataset || {} : {};
  const url = firstText([dataset.url], "");
  const label = firstText([dataset.label], "");
  const value = url || label;
  if (!value) return;
  wx.setClipboardData({
    data: value,
    success() {
      wx.showToast({ title: url ? "链接已复制" : "账号名称已复制", icon: "success" });
    },
    fail() {
      wx.showToast({ title: "复制失败", icon: "none" });
    }
  });
},
```

- [ ] **Step 5: 运行小程序测试并确认 GREEN**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: PASS。

- [ ] **Step 6: 提交行为增量**

```bash
git add apps/wechat-miniprogram/pages/webview/index.js apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "feat: add native guest authored works behavior"
```

### Task 3: 小程序著作与社交媒体界面

**Files:**
- Modify: `apps/wechat-miniprogram/pages/webview/index.wxml`
- Modify: `apps/wechat-miniprogram/pages/webview/index.wxss`
- Modify: `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

**Interfaces:**
- Consumes: Task 2 产出的 `nativeExpert.authoredBooks`、`nativeExpert.socialProfiles` 和两个事件方法
- Produces: 条件渲染的横向著作卡片和社交媒体卡片

- [ ] **Step 1: 写失败的静态界面测试**

增加 WXML/WXSS 契约断言：

```js
assert.match(wxml, /wx:if="\{\{nativeExpert\.authoredBooks\.length\}\}"/);
assert.match(wxml, />嘉宾著作</);
assert.match(wxml, /scroll-x="true"/);
assert.match(wxml, /catchtap="openNativeExpertAuthoredBook"/);
assert.match(wxml, /wx:if="\{\{nativeExpert\.socialProfiles\.length\}\}"/);
assert.match(wxml, />社交媒体</);
assert.match(wxml, /catchtap="copyNativeExpertSocial"/);
assert.match(wxss, /\.xf-expert-detail-authored-scroll/);
assert.match(wxss, /\.xf-expert-detail-social-item/);
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: FAIL，提示著作或社交板块标记缺失。

- [ ] **Step 3: 添加著作 WXML**

在推荐书单之前加入：

```xml
<view wx:if="{{nativeExpert.authoredBooks.length}}" class="xf-expert-detail-card is-authored-books">
  <text class="xf-expert-detail-eyebrow">AUTHORED WORKS</text>
  <text class="xf-expert-detail-section-title">嘉宾著作</text>
  <text class="xf-expert-detail-section-copy">这位嘉宾自己的著作作品。</text>
  <scroll-view class="xf-expert-detail-authored-scroll" scroll-x="true" enhanced show-scrollbar="false">
    <view class="xf-expert-detail-authored-row">
      <view wx:for="{{nativeExpert.authoredBooks}}" wx:key="id" class="xf-expert-detail-authored-card" data-id="{{item.id}}" data-detail="{{item.hasDetail}}" catchtap="openNativeExpertAuthoredBook">
        <image wx:if="{{item.coverImage}}" class="xf-expert-detail-authored-cover" src="{{item.coverImage}}" mode="aspectFill" />
        <view wx:else class="xf-expert-detail-authored-cover is-empty"></view>
        <text class="xf-expert-detail-authored-title">{{item.title}}</text>
        <text wx:if="{{item.publishedDate || item.publisher}}" class="xf-expert-detail-authored-meta">{{item.publishedDate}}{{item.publishedDate && item.publisher ? " · " : ""}}{{item.publisher}}</text>
        <text wx:if="{{item.hasDetail}}" class="xf-expert-detail-authored-action">查看详情</text>
      </view>
    </view>
  </scroll-view>
</view>
```

- [ ] **Step 4: 添加社交媒体 WXML**

在著作之后加入：

```xml
<view wx:if="{{nativeExpert.socialProfiles.length}}" class="xf-expert-detail-card is-social-media">
  <text class="xf-expert-detail-section-title">社交媒体</text>
  <text class="xf-expert-detail-section-copy">用于快速进入嘉宾的公开账号、栏目或持续输出阵地。</text>
  <view class="xf-expert-detail-social-list">
    <view wx:for="{{nativeExpert.socialProfiles}}" wx:key="title" class="xf-expert-detail-social-item" data-url="{{item.url}}" data-label="{{item.title || item.label}}" catchtap="copyNativeExpertSocial">
      <text class="xf-expert-detail-social-platform">{{item.source || item.platform || "社交媒体"}}</text>
      <text class="xf-expert-detail-social-label">{{item.title || item.label || item.url}}</text>
      <text class="xf-expert-detail-social-copy">复制</text>
    </view>
  </view>
</view>
```

- [ ] **Step 5: 添加局部 WXSS**

复用现有卡片颜色和圆角，只新增著作横向列表、固定卡宽、封面比例、社交条目边框与复制提示样式；所有选择器以 `.xf-expert-detail-` 开头，避免影响其他原生详情模式。

- [ ] **Step 6: 运行整包测试并确认 GREEN**

Run: `find apps/wechat-miniprogram -name '._*' -delete && node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: 216 条及新增测试全部 PASS，AppleDouble 检查通过。

- [ ] **Step 7: 提交界面增量**

```bash
git add apps/wechat-miniprogram/pages/webview/index.wxml apps/wechat-miniprogram/pages/webview/index.wxss apps/wechat-miniprogram/pages/tab-webview.static.test.mjs
git commit -m "feat: render native guest authored works and social"
```

### Task 4: 文档与最终验证

**Files:**
- Modify: `docs/modules/backend-api.md`
- Modify: `docs/modules/platform-release-and-app-shells.md`
- Modify: `docs/ACTIVE_CONTEXT.md`

**Interfaces:**
- Consumes: Tasks 1-3 的最终行为
- Produces: 可追踪的持久契约与最终验证记录

- [ ] **Step 1: 更新持久行为文档**

记录公开嘉宾详情负责返回精确作者匹配的完整 `authoredBooks`；记录小程序原生嘉宾详情只在有真实数据时显示著作和社交板块，著作进入站内详情，社交只复制不打开第三方网页。

- [ ] **Step 2: 运行最终后端测试**

Run: `cd backend && node --test --import tsx src/controllers/guest.test.ts src/utils/bookSourceNames.test.ts`

Expected: PASS。

- [ ] **Step 3: 运行小程序整包测试**

Run: `find apps/wechat-miniprogram -name '._*' -delete && node --test apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`

Expected: 全部 PASS。

- [ ] **Step 4: 运行差异检查**

Run: `git diff --check`

Expected: 无输出，退出码 0；`git status --short` 仅包含本任务文件和用户原有未提交文件。

- [ ] **Step 5: 微信开发者工具验证**

打开一个同时具有真实著作和社交账号的嘉宾详情，确认：著作横向滚动、真实封面和元数据可见；可用著作进入原生图书详情；社交条目分别复制链接与纯账号名称；空数据嘉宾不显示两个板块。

- [ ] **Step 6: 提交文档**

```bash
git add docs/modules/backend-api.md docs/modules/platform-release-and-app-shells.md docs/ACTIVE_CONTEXT.md
git commit -m "docs: record native guest authored works"
```
