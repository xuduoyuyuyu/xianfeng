import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);
const MINI_PROGRAM_ROOT = new URL("../", import.meta.url);

global.wx = {
  getStorageSync() {
    return "";
  },
  setStorageSync() {
    return undefined;
  }
};

function readPage(name) {
  const dir = new URL(`./${name}/`, import.meta.url);
  const jsonUrl = new URL("index.json", dir);
  return {
    js: fs.readFileSync(new URL("index.js", dir), "utf8"),
    json: fs.existsSync(jsonUrl) ? JSON.parse(fs.readFileSync(jsonUrl, "utf8")) : {},
    wxml: fs.readFileSync(new URL("index.wxml", dir), "utf8"),
    wxss: fs.readFileSync(new URL("index.wxss", dir), "utf8")
  };
}

function readNativeSettings() {
  return fs.readFileSync(new URL("../utils/nativeSettings.js", import.meta.url), "utf8");
}

function assertWelfareTopbarButton(wxml, buttonClass, iconClass) {
  assert.match(wxml, new RegExp(`class="${buttonClass}" style="top: \\{\\{logoTop\\}\\}px; right: \\{\\{welfareRight\\}\\}px; height: \\{\\{logoHeight\\}\\}px;" catchtap="openWelfare" aria-label="百宝箱"[\\s\\S]*class="${iconClass}" src="\\/assets\\/menu\\/welfare-gift-icon\\.png"`));
}

function assertAssetUnder(path, maxBytes) {
  const assetUrl = new URL(path, import.meta.url);
  assert.equal(fs.existsSync(assetUrl), true);
  assert.ok(fs.statSync(assetUrl).size < maxBytes, `${path} should stay under ${maxBytes} bytes`);
}

function assertPngSize(path, width, height) {
  const assetUrl = new URL(path, import.meta.url);
  assert.equal(fs.existsSync(assetUrl), true);
  const buffer = fs.readFileSync(assetUrl);
  assert.equal(buffer.toString("ascii", 12, 16), "IHDR");
  assert.equal(buffer.readUInt32BE(16), width, `${path} width`);
  assert.equal(buffer.readUInt32BE(20), height, `${path} height`);
}

function readPngRgba(path) {
  const buffer = fs.readFileSync(new URL(path, import.meta.url));
  assert.equal(buffer.toString("ascii", 12, 16), "IHDR");
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  assert.equal(bitDepth, 8, `${path} should use 8-bit PNG channels`);
  assert.equal(colorType, 6, `${path} should be RGBA PNG`);

  const idatChunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === "IDAT") idatChunks.push(buffer.subarray(dataStart, dataStart + length));
    offset = dataStart + length + 4;
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const data = Buffer.alloc(width * height * bytesPerPixel);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset + x];
      const left = x >= bytesPerPixel ? data[y * stride + x - bytesPerPixel] : 0;
      const up = y > 0 ? data[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? data[(y - 1) * stride + x - bytesPerPixel] : 0;
      let value = raw;
      if (filter === 1) value = raw + left;
      if (filter === 2) value = raw + up;
      if (filter === 3) value = raw + Math.floor((left + up) / 2);
      if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
      }
      data[y * stride + x] = value & 255;
    }
    inputOffset += stride;
  }
  return { width, height, data };
}

function assertPngPixelNotWhite(path, x, y) {
  const png = readPngRgba(path);
  const offset = (png.width * y + x) << 2;
  const r = png.data[offset];
  const g = png.data[offset + 1];
  const b = png.data[offset + 2];
  assert.ok(!(r > 248 && g > 248 && b > 248), `${path} pixel ${x},${y} should not be white`);
}

function assertPngPixelWhite(path, x, y) {
  const png = readPngRgba(path);
  const offset = (png.width * y + x) << 2;
  const r = png.data[offset];
  const g = png.data[offset + 1];
  const b = png.data[offset + 2];
  const a = png.data[offset + 3];
  assert.deepEqual([r, g, b, a], [255, 255, 255, 255], `${path} pixel ${x},${y} should be pure white`);
}

function assertPngAlphaBounds(path, threshold, expected) {
  const png = readPngRgba(path);
  const xs = [];
  const ys = [];
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (png.width * y + x) << 2;
      if (png.data[offset + 3] >= threshold) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  assert.ok(xs.length > 0, `${path} should contain visible pixels`);
  assert.deepEqual({
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  }, expected, `${path} visible alpha bounds`);
}

function assertSameTextFile(actualPath, expectedPath) {
  const actual = fs.readFileSync(new URL(actualPath, import.meta.url), "utf8").trim();
  const expected = fs.readFileSync(new URL(expectedPath, import.meta.url), "utf8").trim();
  assert.equal(actual, expected);
}

function decodeWebviewNavigation(navigation) {
  const url = String((navigation && navigation.url) || "");
  const matched = url.match(/[?&]url=([^&]+)/);
  assert.ok(matched, `expected webview navigation url, got ${url}`);
  return new URL(decodeURIComponent(matched[1]));
}

function loadPageDefinition(name) {
  const file = require.resolve(`./${name}/index.js`);
  delete require.cache[file];
  let definition = null;
  global.Page = (pageDefinition) => {
    definition = pageDefinition;
  };
  require(file);
  return definition;
}

function loadComponentDefinition(path) {
  const file = require.resolve(path);
  delete require.cache[file];
  let definition = null;
  global.Component = (componentDefinition) => {
    definition = componentDefinition;
  };
  require(file);
  return definition;
}

function loadAppDefinition() {
  const file = require.resolve("../app.js");
  delete require.cache[file];
  let definition = null;
  global.App = (appDefinition) => {
    definition = appDefinition;
  };
  require(file);
  return definition;
}

function walkFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) return walkFiles(child);
    return [child.pathname];
  });
}

test("mini program package does not include AppleDouble resource fork files", () => {
  const root = MINI_PROGRAM_ROOT;
  const appleDoubleFiles = walkFiles(root).filter((pathname) => pathname.split("/").pop().startsWith("._"));
  const projectConfig = JSON.parse(
    fs.readFileSync(new URL("../project.config.json", import.meta.url), "utf8")
  );
  const ignoredPatterns = projectConfig.packOptions && Array.isArray(projectConfig.packOptions.ignore)
    ? projectConfig.packOptions.ignore
    : [];

  assert.equal(ignoredPatterns.some((item) => item.type === "prefix" && item.value === "._"), true);
  for (const value of [
    ".DS_Store",
    "README.md",
    ".gitignore",
    "project.private.config.json",
    "project.miniapp.json",
    "utils/config.local.js",
    "utils/config.local.example.js"
  ]) {
    assert.equal(
      ignoredPatterns.some((item) => item.type === "file" && item.value === value),
      true,
      `${value} should be excluded from the preview package`
    );
  }
  assert.deepEqual(appleDoubleFiles, []);
});

test("mini program launches into the programs tab with custom native tab bar", () => {
  const appJson = JSON.parse(
    fs.readFileSync(new URL("../app.json", import.meta.url), "utf8")
  );

  assert.equal(appJson.pages[0], "pages/programs/index");
  assert.equal(appJson.tabBar.custom, true);
  assert.equal(appJson.tabBar.borderStyle, "white");
  assert.deepEqual(appJson.tabBar.list.map((item) => [item.pagePath, item.text]), [
    ["pages/programs/index", "节目"],
    ["pages/reading/index", "及阅"],
    ["pages/xiaowanzi/index", ""],
    ["pages/materials/index", "资料"],
    ["pages/topics/index", "请教"]
  ]);
  for (const item of appJson.tabBar.list) {
    assert.equal(fs.existsSync(new URL(`../${item.iconPath}`, import.meta.url)), true);
    assert.equal(fs.existsSync(new URL(`../${item.selectedIconPath}`, import.meta.url)), true);
  }
});

test("native Pro page lists payments without refund actions", () => {
  const { js, wxml } = readPage("pro");

  assert.doesNotMatch(js, /requestRefund/);
  assert.doesNotMatch(js, /\/api\/billing\/refunds/);
  assert.doesNotMatch(wxml, /申请退款/);
  assert.match(wxml, /付款记录/);
  assert.match(js, /虚拟支付不支持退款/);
  assert.match(wxml, /小程序虚拟支付订单不支持退款/);
});

test("custom tab bar matches the website mobile tab sizing and opens Xiaowanzi super mode directly", () => {
  const js = fs.readFileSync(new URL("../custom-tab-bar/index.js", import.meta.url), "utf8");
  const wxml = fs.readFileSync(new URL("../custom-tab-bar/index.wxml", import.meta.url), "utf8");
  const wxss = fs.readFileSync(new URL("../custom-tab-bar/index.wxss", import.meta.url), "utf8");

  assert.match(wxml, /^<view wx:if="\{\{!hidden\}\}" class="xf-custom-tabbar-wrap" style="height: \{\{totalHeight\}\}px;">/);
  assert.equal(wxml.includes("<cover-view"), false);
  assert.equal(wxml.includes("<cover-image"), false);
  assert.match(wxml, /<button[\s\S]*class="xf-custom-tabbar__item \{\{selected === index && index !== 2 \? 'is-selected' : ''\}\} \{\{index === 2 \? 'is-xiaowanzi' : ''\}\}"[\s\S]*aria-label="\{\{item\.text \|\| '小玩子'\}\}"/);
  assert.match(wxml, /catchtap="switchTab"/);
  assert.match(wxml, /class="xf-custom-tabbar__xiaowanzi-core" data-index="\{\{index\}\}" catchtap="switchTab"/);
  assert.match(wxml, /class="xf-custom-tabbar__icon is-xiaowanzi-icon"[\s\S]*data-index="\{\{index\}\}" catchtap="switchTab"/);
  assert.doesNotMatch(wxml, /bindlongpress/);
  assert.match(wxml, /style="height: \{\{totalHeight\}\}px;"/);
  assert.match(wxml, /style="height: \{\{safeBottom\}\}px;"/);
  assert.match(wxml, /wx:if="\{\{index === 2\}\}" class="xf-custom-tabbar__xiaowanzi-core"/);
  assert.match(wxml, /class="xf-custom-tabbar__orb"/);
  assert.doesNotMatch(wxml, /is-xiaowanzi-text/);
  assert.match(wxml, /class="xf-custom-tabbar__normal-core" data-index="\{\{index\}\}" catchtap="switchTab"/);
  assert.match(wxml, /selected === index && index !== 2 \? 'is-selected' : ''/);
  assert.match(wxml, /src="\{\{selected === index \? item\.selectedIconPath : item\.iconPath\}\}"/);
  assert.match(wxml, /style="color: \{\{selected === index \? selectedColor : color\}\}"/);
  assert.match(js, /properties:\s*\{[\s\S]*selected:[\s\S]*type:\s*Number[\s\S]*hidden:[\s\S]*type:\s*Boolean/);
  assert.match(js, /getNativeTabbarMetrics/);
  assert.match(js, /NATIVE_TABBAR_HEIGHT/);
  assert.match(fs.readFileSync(new URL("../utils/nativeChrome.js", import.meta.url), "utf8"), /const NATIVE_TABBAR_HEIGHT = 56;/);
  assert.match(js, /safeBottom: metrics\.safeBottom/);
  assert.match(js, /totalHeight: metrics\.totalHeight/);
  assert.match(js, /openXiaowanziSuper\(\)/);
  assert.doesNotMatch(js, /handleLongPress/);
  assert.match(js, /hidden:\s*\{\s*type:\s*Boolean,\s*value:\s*false/);
  assert.match(js, /const dataset = \(event && event\.currentTarget && event\.currentTarget\.dataset\)[\s\S]*\|\| \(event && event\.target && event\.target\.dataset\)/);
  assert.match(js, /wx\.setStorageSync\(XIAOWANZI_ENTRY_MODE_KEY, "home"\)/);
  assert.match(js, /rememberXiaowanziReturnPage\(currentItem\.pagePath\)/);
  assert.match(js, /wx\.switchTab\(\{[\s\S]*url: "\/pages\/xiaowanzi\/index",[\s\S]*success: \(\) => \{[\s\S]*this\.setData\(\{ hidden: true \}\);[\s\S]*fail: \(\) => \{[\s\S]*this\.setData\(\{ hidden: false \}\);/);
  assert.match(js, /pagePath: "\/pages\/xiaowanzi\/index"[\s\S]*text: ""/);
  assert.doesNotMatch(js, /openWeb\(WEB_ROUTES\.xiaowanzi/);
  assert.doesNotMatch(js, /getXiaowanziChatRoute/);
  assert.doesNotMatch(js, /xf_xw: "chat"/);
  assert.match(wxml, /wx:if="\{\{!hidden\}\}"/);
  assert.match(wxss, /\.xf-custom-tabbar \{[\s\S]*height: 56px;/);
  assert.match(wxss, /\.xf-custom-tabbar__item \{[\s\S]*top: 2px;[\s\S]*height: 46px;/);
  assert.match(wxss, /\.xf-custom-tabbar__item \{[\s\S]*border: 0;[\s\S]*background: transparent;[\s\S]*line-height: 1;/);
  assert.match(wxss, /\.xf-custom-tabbar__item::after \{[\s\S]*border: 0;/);
  assert.doesNotMatch(wxss, /\.xf-custom-tabbar__item\.is-selected\s*\{[\s\S]*background:/);
  assert.match(wxss, /\.xf-custom-tabbar__item\.is-xiaowanzi\.is-pressed \{[\s\S]*opacity: 1;/);
  assert.match(wxss, /\.xf-custom-tabbar__item\.is-xiaowanzi \{[\s\S]*top: 2px;[\s\S]*height: 46px;[\s\S]*overflow: visible;/);
  assert.match(wxss, /\.xf-custom-tabbar__normal-core,[\s\S]*\.xf-custom-tabbar__xiaowanzi-core \{[\s\S]*justify-content: flex-start;[\s\S]*padding-top: 4px;/);
  assert.match(wxss, /\.xf-custom-tabbar__xiaowanzi-core \{[\s\S]*transform: translateY\(-5px\);/);
  assert.match(wxss, /\.xf-custom-tabbar__item\.is-xiaowanzi\.is-pressed \.xf-custom-tabbar__orb \{[\s\S]*transform: scale\(1\.16\);/);
  assert.match(wxss, /\.xf-custom-tabbar__icon \{[\s\S]*width: 22px;[\s\S]*height: 22px;/);
  assert.match(wxss, /\.xf-custom-tabbar__icon\.is-reading-source-switching \{[\s\S]*animation: xf-reading-source-bounce 520ms cubic-bezier\(0\.2, 0\.9, 0\.22, 1\);[\s\S]*transform-origin: 50% 50%;/);
  assert.match(wxss, /\.xf-custom-tabbar__icon\.is-xiaowanzi-icon \{[\s\S]*width: 48px;[\s\S]*height: 48px;/);
  assert.match(wxss, /\.xf-custom-tabbar__orb \{[\s\S]*width: 48px;[\s\S]*height: 48px;[\s\S]*background: transparent;[\s\S]*box-shadow: none;/);
  assert.match(wxss, /@keyframes xf-reading-source-bounce/);
  assert.doesNotMatch(wxss, /xf-reading-source-aura|xf-reading-source-morph|rotateY|radial-gradient/);
  assert.match(wxss, /translateY\(-5px\) scale\(1\.14\)/);
  assert.equal(wxss.includes("border-top"), false);
  assert.equal(wxss.includes("env(safe-area-inset-bottom)"), false);
  assert.equal(wxss.includes("constant(safe-area-inset-bottom)"), false);
});

test("custom tab bar taps Xiaowanzi directly into super mode", () => {
  const definition = loadComponentDefinition("../custom-tab-bar/index.js");
  const originalNavigateTo = global.wx.navigateTo;
  const originalSwitchTab = global.wx.switchTab;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map();
  const navigations = [];
  const switchCalls = [];
  const context = {
    ...definition.methods,
    data: { ...definition.data, selected: 4, hidden: false },
    setData(payload, callback) {
      this.data = { ...this.data, ...payload };
      if (typeof callback === "function") callback();
    }
  };

  try {
    global.wx.navigateTo = (options) => {
      navigations.push(options);
    };
    global.wx.switchTab = (options) => {
      switchCalls.push(options);
    };
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };

    definition.methods.switchTab.call(context, { currentTarget: { dataset: { index: 2 } } });
    assert.equal(storage.get("xf_xiaowanzi_entry_mode"), "home");
    assert.deepEqual(storage.get("xf_xiaowanzi_return_target_v1"), { type: "tab", url: "/pages/topics/index" });
    assert.equal(storage.get("xf_xiaowanzi_return_page"), "/pages/topics/index");
    assert.equal(context.data.hidden, false);
    assert.equal(switchCalls.length, 1);
    assert.equal(switchCalls[0].url, "/pages/xiaowanzi/index");
    assert.equal(navigations.length, 0);
    switchCalls[0].success();
    assert.equal(context.data.hidden, true);
  } finally {
    global.wx.navigateTo = originalNavigateTo;
    global.wx.switchTab = originalSwitchTab;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("custom tab bar double taps the active reading tab to toggle the reading source", () => {
  const definition = loadComponentDefinition("../custom-tab-bar/index.js");
  const originalNow = Date.now;
  const originalGetCurrentPages = global.getCurrentPages;
  const originalSwitchTab = global.wx.switchTab;
  let now = 1000;
  let toggleCount = 0;
  const switchCalls = [];
  const context = {
    ...definition.methods,
    data: { ...definition.data, selected: 1, hidden: false },
    setData(payload, callback) {
      this.data = { ...this.data, ...payload };
      if (typeof callback === "function") callback();
    }
  };

  try {
    Date.now = () => now;
    global.getCurrentPages = () => [{ toggleReadingLibrarySource: () => { toggleCount += 1; } }];
    global.wx.switchTab = (options) => {
      switchCalls.push(options);
    };

    definition.methods.switchTab.call(context, { currentTarget: { dataset: { index: 1 } } });
    now += 180;
    definition.methods.switchTab.call(context, { currentTarget: { dataset: { index: 1 } } });

    assert.equal(toggleCount, 1);
    assert.equal(context.data.readingLogoBouncing, true);
    assert.equal(switchCalls.length, 0);
  } finally {
    Date.now = originalNow;
    global.getCurrentPages = originalGetCurrentPages;
    global.wx.switchTab = originalSwitchTab;
  }
});

test("app launch preloads reading tab local and external first pages for instant entry", async () => {
  const definition = loadAppDefinition();
  const originalRequest = global.wx.request;
  const originalSetStorageSync = global.wx.setStorageSync;
  const requests = [];
  const storage = new Map([
    ["xf_token", "token-1"],
    ["xf_user", { _id: "user-1", mobile: "13500003069" }]
  ]);

  try {
    global.wx.request = (options) => {
      requests.push(options.url);
      if (String(options.url).includes("/api/books?") && String(options.url).includes("current=1") && String(options.url).includes("size=24")) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              {
                _id: "local-preloaded",
                title: "预热本地书",
                author: "作者",
                hasMetadataDetail: true
              }
            ],
            total: 2777,
            pages: 116,
            current: 1
          }
        });
        return;
      }
	      if (String(options.url).includes("/api/books/external")) {
	        options.success({
          statusCode: 200,
          data: {
            records: [
              { id: "external-preloaded", title: "预热外部书", author: "作者", tags: "Thriller" }
            ],
            total: 187104,
            pages: 7796
          }
        });
      }
    };
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };

    definition.onLaunch();
    await Promise.resolve();
    await Promise.resolve();

    assert.ok(requests.some((url) => String(url).includes("/api/books?") && String(url).includes("current=1") && String(url).includes("size=24")));
    assert.ok(requests.some((url) => String(url).includes("/api/books/external") && String(url).includes("current=1") && String(url).includes("size=24")));
    assert.equal(storage.get("xf_native_books_first_page_v3").records[0]._id, "local-preloaded");
    assert.equal(storage.has("xf_native_books_cache_v6"), false);
    assert.equal(storage.get("xf_external_book_library:first_page_v1").records[0].id, "external-preloaded");
  } finally {
    global.wx.request = originalRequest;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("reading tab reuses the launch first-page preload before refreshing the full local filter source", async () => {
  const appDefinition = loadAppDefinition();
  const readingDefinition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const originalSetStorageSync = global.wx.setStorageSync;
  const requests = [];
  const context = {
    ...readingDefinition,
    allBooks: [],
    data: {
      ...readingDefinition.data,
      books: [],
      useExternalLibrarySource: false,
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.request = (options) => {
      requests.push(options.url);
      if (String(options.url).includes("/api/books?")) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              {
                _id: "first-page-preload-book",
                title: "首屏预加载书",
                author: "作者",
                description: "首屏接口直接返回已审核的图书简介。",
                categoryLabel: "阅读指南",
                hasMetadataDetail: true
              }
            ],
            total: 2777,
            pages: 116,
            current: 1
          }
        });
        return;
      }
      if (String(options.url).endsWith("/api/books")) {
        options.success({
          statusCode: 200,
          data: [
            {
              _id: "first-page-preload-book",
              title: "首屏预加载书",
              author: "作者",
              description: "首屏接口直接返回已审核的图书简介。",
              categoryLabel: "阅读指南",
              hasMetadataDetail: true
            },
            {
              _id: "full-filter-book",
              title: "全量筛选书",
              author: "作者",
              topic: "亲子关系",
              hasMetadataDetail: true
            }
          ]
        });
        return;
      }
      if (String(options.url).includes("/api/books/external")) {
        options.success({ statusCode: 200, data: { records: [], total: 0, pages: 1 } });
      }
    };
    global.wx.setStorageSync = () => undefined;

    appDefinition.onLaunch();
    const loadPromise = readingDefinition.loadBooks.call(context);

    assert.equal(requests.filter((url) => String(url).includes("/api/books?")).length, 1);
    assert.equal(requests.filter((url) => String(url).endsWith("/api/books")).length, 0);
    await loadPromise;

    assert.equal(context.data.books[0].id, "first-page-preload-book");
    assert.equal(context.data.books[0].description, "首屏接口直接返回已审核的图书简介。");
    assert.equal(context.data.loading, false);

    await readingDefinition.openFilterDrawer.call(context);

    assert.equal(requests.filter((url) => String(url).endsWith("/api/books")).length, 1);
    assert.equal(context.data.readingFilterPreviewCount, 2777);
    assert.equal(context.data.readingFilterGroups.some((group) => (
      group.options.some((option) => option.label === "亲子关系")
    )), true);
    assert.equal(context.data.hasMoreBooks, false);
  } finally {
    global.wx.request = originalRequest;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("legacy home page entry redirects to the programs tab", () => {
  const js = fs.readFileSync(new URL("./home/index.js", import.meta.url), "utf8");

  assert.match(js, /wx\.switchTab\(\{ url: "\/pages\/programs\/index" \}\)/);
  assert.equal(js.includes("WEB_ROUTES.home"), false);
});

test("native topbars expose a direct Baibaoxiang welfare shortcut", () => {
  const programWxss = readPage("programs").wxss;
  const nativeListWxss = fs.readFileSync(new URL("../styles/native-list.wxss", import.meta.url), "utf8");
  const pages = [
    ["programs", "xf-program-welfare-button", "xf-program-welfare-icon"],
    ["reading", "xf-native-welfare-button", "xf-native-welfare-icon"],
    ["materials", "xf-native-welfare-button", "xf-native-welfare-icon"],
    ["topics", "xf-native-welfare-button", "xf-native-welfare-icon"],
    ["search", "xf-native-welfare-button", "xf-native-welfare-icon"],
    ["mine", "xf-native-welfare-button", "xf-native-welfare-icon"],
    ["pro", "xf-native-welfare-button", "xf-native-welfare-icon"],
    ["mama-resource-apply", "xf-native-welfare-button", "xf-native-welfare-icon"]
  ];

  for (const [name, buttonClass, iconClass] of pages) {
    const page = readPage(name);
    assertWelfareTopbarButton(page.wxml, buttonClass, iconClass);
    assert.match(page.js, /welfareRight: 101/);
    assert.match(page.js, /const welfareRight = Math\.max\(72, Math\.round\(metrics\.capsuleRight \|\| 96\) \+ 5\)/);
    assert.match(page.js, /welfareRight/);
  }

  const nativeSettings = require("../utils/nativeSettings.js");
  const methods = nativeSettings.createNativeSettingsMethods();
  const originalWx = global.wx;
  const navigations = [];

  try {
    global.wx = {
      getStorageSync(key) {
        if (key === "xf_token") return "token-1";
        return "";
      },
      removeStorageSync() {},
      navigateTo(options) {
        navigations.push(options);
      }
    };

    methods.openWelfare.call({});

    const navigation = navigations.at(-1);
    assert.ok(navigation);
    assert.equal(navigation.url, "/pages/welfare/index");
  } finally {
    global.wx = originalWx;
  }

  assert.match(programWxss, /\.xf-program-welfare-icon \{[\s\S]*transform-origin: 50% 50%;[\s\S]*animation: xfProgramWelfareEntryShake 0\.72s 0\.24s cubic-bezier\(0\.2, 0\.9, 0\.22, 1\) both;/);
  assert.match(programWxss, /@keyframes xfProgramWelfareEntryShake \{[\s\S]*0%,[\s\S]*100% \{[\s\S]*scale\(1\);[\s\S]*rotate\(-10deg\)[\s\S]*rotate\(9deg\)[\s\S]*rotate\(-6deg\)/);
  assert.doesNotMatch(programWxss, /xfProgramWelfareEntryShake[^\n;]*infinite/);
  assert.match(nativeListWxss, /\.xf-native-welfare-icon \{[\s\S]*transform-origin: 50% 50%;[\s\S]*animation: xfNativeWelfareEntryShake 0\.72s 0\.24s cubic-bezier\(0\.2, 0\.9, 0\.22, 1\) both;/);
  assert.match(nativeListWxss, /@keyframes xfNativeWelfareEntryShake \{[\s\S]*0%,[\s\S]*100% \{[\s\S]*scale\(1\);[\s\S]*rotate\(-10deg\)[\s\S]*rotate\(9deg\)[\s\S]*rotate\(-6deg\)/);
  assert.doesNotMatch(nativeListWxss, /xfNativeWelfareEntryShake[^\n;]*infinite/);
});

test("narrow native topbars hide the welfare shortcut before it can overlap the centered logo", () => {
  const nativeList = fs.readFileSync(new URL("../styles/native-list.wxss", import.meta.url), "utf8");
  const programs = readPage("programs").wxss;
  assert.match(nativeList, /@media \(max-width: 380px\) \{[\s\S]*\.xf-native-welfare-button \{[\s\S]*display: none;/);
  assert.match(programs, /@media \(max-width: 380px\) \{[\s\S]*\.xf-program-welfare-button \{[\s\S]*display: none;/);
  assert.match(readNativeSettings(), /title: "百宝箱"[\s\S]*page: "\/pages\/welfare\/index"/);
});

test("welfare opens as a native mini program page and hides backend 404 noise", async () => {
  const appJson = JSON.parse(fs.readFileSync(new URL("../app.json", import.meta.url), "utf8"));
  const page = readPage("welfare");

  assert.ok(appJson.pages.includes("pages/welfare/index"));
  assert.equal(page.json.navigationStyle, "custom");
  assert.equal(page.wxml.includes("<web-view"), false);
  assert.match(page.wxml, /class="xf-welfare-page \{\{fontSizeClass\}\}" style="padding-top: \{\{chromeHeight\}\}px;"/);
  assert.match(page.wxml, /class="xf-native-topbar" style="height: \{\{topbarHeight\}\}px;"/);
  assert.match(page.wxml, /class="xf-native-menu-button xf-native-back-button"/);
  assert.match(page.wxml, /class="xf-welfare-scroll" style="height: calc\(100vh - \{\{chromeHeight\}\}px\);"/);
  assert.match(page.wxml, /小玩子百宝箱/);
  assert.doesNotMatch(page.wxml, /我的福利|xf-welfare-pill/);
  assert.match(page.wxml, /class="xf-welfare-mascot" src="\/assets\/wel-avatar\/wizard\.png"/);
  assert.match(page.wxml, /今天没有新的福利，过几天再来看看。/);
  assert.match(page.wxml, /claimDialogVisible/);
  assert.match(page.wxml, /claimDialogActivationCode/);
  assert.match(page.wxml, /copyActivationCode/);
  assert.match(page.wxml, /class="xf-welfare-dialog-link"[\s\S]*<text user-select="true" catchtap="copyClaimLink"/);
  assert.match(page.wxml, /<button wx:if="\{\{claimDialogIsMiniProgramLink\}\}" catchtap="openClaimLink">点击获取<\/button>/);
  assert.doesNotMatch(page.wxml, />复制链接<\/button>/);
  assert.doesNotMatch(page.wxml, /xf-welfare-item-status/);
  assert.doesNotMatch(page.wxml, /Request failed with status code 404/);
  assert.match(page.js, /request\(\{ url: "\/api\/welfare\/campaigns" \}\)/);
  assert.doesNotMatch(page.js, /ensureBackStackForBackButtonPage/);
  assert.match(page.js, /claimDialogInstructions/);
  assert.match(page.js, /claimDialogIsMiniProgramLink:\s*[^,]*\.includes\("小程序"\)/);
  assert.match(page.js, /closeClaimDialog\(\)[\s\S]*claimDialogIsMiniProgramLink:\s*false/);
  assert.match(page.js, /copyActivationCode\(\)/);
  assert.match(page.js, /copyClaimLink\(\)/);
  assert.match(page.js, /wx\.navigateToMiniProgram\(\{[\s\S]*shortLink: link/);
  assert.match(page.js, /smartBackHome/);
  assert.match(page.js, /goBack\(\)\s*\{[\s\S]*smartBackHome\(\);[\s\S]*\}/);
  assert.match(page.js, /\^request\\\.fail\$/);
  assert.match(page.js, /isNotFoundError\(error\)[\s\S]*activeCampaigns: \[\][\s\S]*historyCampaigns: \[\][\s\S]*message: ""/);
  assert.match(page.wxss, /\.xf-welfare-page \{[\s\S]*background: #f0edff;/);
  assert.match(page.wxss, /\.xf-welfare-page \{[\s\S]*font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;/);
  assert.match(page.wxss, /\.xf-welfare-hero \{[\s\S]*padding: 72rpx 0 34rpx;/);
  assert.match(page.wxss, /\.xf-welfare-title \{[\s\S]*font-size: 72rpx;/);
  assert.match(page.wxss, /\.xf-welfare-title \{[\s\S]*font-weight: 500;/);
  assert.match(page.wxss, /\.xf-welfare-subtitle \{[\s\S]*font-size: 30rpx;[\s\S]*font-weight: 700;[\s\S]*line-height: 1\.7;/);
  assert.doesNotMatch(page.wxss, /\.xf-welfare-pill/);
  const welfareHeroRowStyle = page.wxss.match(/\.xf-welfare-hero-row \{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(welfareHeroRowStyle, /margin-top:/);
  assert.match(page.wxss, /\.xf-welfare-mascot \{[\s\S]*width: 184rpx;[\s\S]*height: 184rpx;[\s\S]*margin-top: -48rpx;/);
  assert.match(page.wxss, /\.xf-welfare-state \{[\s\S]*font-size: 28rpx;[\s\S]*font-weight: 700;/);
  assert.match(page.wxss, /\.xf-welfare-dialog-mask/);

  const definition = loadPageDefinition("welfare");
  const originalWx = global.wx;
  const state = { ...definition.data };

  try {
    global.wx = {
      showShareMenu() {},
      getStorageSync(key) {
        if (key === "xf_token") return "token-1";
        return "";
      },
      getWindowInfo() {
        return { statusBarHeight: 20, windowWidth: 375 };
      },
      getMenuButtonBoundingClientRect() {
        return { top: 28, height: 32, left: 280 };
      },
      request(options) {
        options.success({ statusCode: 404, data: { message: "not found" } });
      }
    };

    definition.onLoad.call({
      ...definition,
      data: state,
      setData(patch) {
        Object.assign(state, patch);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(state.loading, false);
    assert.deepEqual(state.activeCampaigns, []);
    assert.deepEqual(state.historyCampaigns, []);
    assert.equal(state.message, "");
  } finally {
    global.wx = originalWx;
  }
});

test("welfare exposes phone authorization on the claim button and reloads after login", async () => {
  const page = readPage("welfare");
  assert.match(page.wxml, /open-type="\{\{hasSession \? '' : 'getPhoneNumber'\}\}"[\s\S]*bindgetphonenumber="loginAndClaimWelfare"/);
  assert.match(page.wxml, /<phone-login-gate[^>]*id="welfarePhoneLoginGate"[^>]*visible="\{\{false\}\}"[^>]*bind:success="handleLoginSuccess"/);
  assert.match(page.js, /subscribeAuthExpired/);
  assert.match(page.js, /onUnload\(\)[\s\S]*_unsubscribeAuthExpired/);
  assert.match(page.js, /handleLoginSuccess\(\)[\s\S]*hasSession: true[\s\S]*claimWelfare/);

  const definition = loadPageDefinition("welfare");
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const state = { ...definition.data };
  const stored = {};
  let campaignRequests = 0;
  let appSession = null;

  const context = {
    ...definition,
    data: state,
    setData(patch) {
      Object.assign(state, patch);
    }
  };

  try {
    global.getApp = () => ({
      setLoginSession(payload) {
        appSession = payload;
      }
    });
    global.wx = {
      showShareMenu() {},
      getStorageSync(key) {
        return stored[key] || (key === "xf_token" ? "expired-token" : "");
      },
      setStorageSync(key, value) {
        stored[key] = value;
      },
      removeStorageSync(key) {
        delete stored[key];
      },
      getWindowInfo() {
        return { statusBarHeight: 20, windowWidth: 375 };
      },
      getMenuButtonBoundingClientRect() {
        return { top: 28, height: 32, left: 280 };
      },
      login(options) {
        options.success({ code: "wx-login-code" });
      },
      request(options) {
        if (options.url.endsWith("/api/wechat-mini/login")) {
          options.success({ statusCode: 200, data: { token: "fresh-token", user: { id: "user-1" } } });
          return;
        }
        campaignRequests += 1;
        if (campaignRequests === 1) {
          options.success({ statusCode: 401, data: { message: "未登录或登录已过期" } });
          return;
        }
        options.success({ statusCode: 200, data: { active: [], history: [] } });
      }
    };

    definition.onLoad.call(context, {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(state.hasSession, false);
    assert.equal(state.message, "");

    definition.handleLoginSuccess.call(context);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(stored.xf_token, undefined);
    assert.equal(appSession, null);
    assert.equal(state.hasSession, true);
    assert.equal(state.message, "");
    assert.equal(campaignRequests, 2);

    definition.onUnload.call(context);
  } finally {
    const { resolveAuthExpired } = require("../utils/authExpiry.js");
    resolveAuthExpired();
    global.wx = originalWx;
    global.getApp = originalGetApp;
  }
});

test("welfare claim short links open the target mini program", () => {
  const definition = loadPageDefinition("welfare");
  const originalWx = global.wx;
  const navigations = [];
  const state = {
    ...definition.data,
    claimDialogExternalUrl: "#小程序://上哪学/商品详情/tl3ArExample"
  };

  try {
    global.wx = {
      navigateToMiniProgram(options) {
        navigations.push(options);
      },
      showToast() {}
    };
    const page = {
      ...definition,
      data: state,
      setData(patch) {
        Object.assign(state, patch);
      }
    };

    definition.openClaimLink.call(page);

    assert.equal(navigations.length, 1);
    assert.equal(navigations[0].shortLink, "#小程序://上哪学/商品详情/tl3ArExample");
  } finally {
    global.wx = originalWx;
  }
});

test("welfare normalizes uploaded campaign covers for native image loading", async () => {
  const definition = loadPageDefinition("welfare");
  const originalWx = global.wx;
  const state = { ...definition.data };
  const { API_ORIGIN } = require("../utils/config");

  try {
    global.wx = {
      showShareMenu() {},
      getStorageSync() {
        return "";
      },
      getWindowInfo() {
        return { statusBarHeight: 20, windowWidth: 375 };
      },
      getMenuButtonBoundingClientRect() {
        return { top: 28, height: 32, left: 280 };
      },
      request(options) {
        options.success({
          statusCode: 200,
          data: {
            active: [
              {
                _id: "campaign-upload",
                title: "上传封面福利",
                coverImageUrl: "/uploads/images/welfare-cover.png",
                totalStock: 10,
                remainingStock: 7
              },
              {
                _id: "campaign-local",
                title: "本地封面福利",
                coverImageUrl: "/assets/menu/welfare-gift-icon.png",
                totalStock: 1,
                remainingStock: 1
              },
              {
                _id: "campaign-web-default",
                title: "网页默认封面福利",
                coverImageUrl: "/assets/welfare-gift-icon.png",
                totalStock: 1,
                remainingStock: 1
              },
              {
                _id: "campaign-http",
                title: "历史 HTTP 封面福利",
                coverImageUrl: "http://xianfeng.xinzhi.info/uploads/images/legacy-cover.png",
                totalStock: 1,
                remainingStock: 1
              }
            ],
            history: []
          }
        });
      }
    };

    definition.onLoad.call({
      ...definition,
      data: state,
      setData(patch) {
        Object.assign(state, patch);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(state.activeCampaigns[0].coverImageUrl, `${API_ORIGIN}/uploads/images/welfare-cover.png`);
    assert.equal(state.activeCampaigns[1].coverImageUrl, "/assets/menu/welfare-gift-icon.png");
    assert.equal(state.activeCampaigns[2].coverImageUrl, "/assets/menu/welfare-gift-icon.png");
    assert.equal(state.activeCampaigns[3].coverImageUrl, "https://xianfeng.xinzhi.info/uploads/images/legacy-cover.png");
  } finally {
    global.wx = originalWx;
  }
});

test("welfare pushes claimed campaigns below unclaimed campaigns", async () => {
  const definition = loadPageDefinition("welfare");
  const originalWx = global.wx;
  const state = { ...definition.data };

  try {
    global.wx = {
      showShareMenu() {},
      getStorageSync() {
        return "";
      },
      getWindowInfo() {
        return { statusBarHeight: 20, windowWidth: 375 };
      },
      getMenuButtonBoundingClientRect() {
        return { top: 28, height: 32, left: 280 };
      },
      request(options) {
        options.success({
          statusCode: 200,
          data: {
            active: [
              {
                _id: "campaign-claimed",
                title: "已领福利",
                claimedByMe: true,
                totalStock: 10,
                remainingStock: 7,
                activationCode: "CLAIMED-CODE"
              },
              {
                _id: "campaign-open",
                title: "未领福利",
                claimedByMe: false,
                totalStock: 10,
                remainingStock: 7
              }
            ],
            history: []
          }
        });
      }
    };

    definition.onLoad.call({
      ...definition,
      data: state,
      setData(patch) {
        Object.assign(state, patch);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(state.activeCampaigns.map((item) => item.title), ["未领福利", "已领福利"]);
    assert.equal(state.activeCampaigns[0].actionText, "立即领取");
    assert.equal(state.activeCampaigns[0].unavailable, false);
    assert.equal(state.activeCampaigns[1].actionText, "已领取");
    assert.equal(state.activeCampaigns[1].activationCode, "CLAIMED-CODE");
    assert.equal(state.activeCampaigns[1].unavailable, true);
    assert.equal(state.activeCampaigns[1].stockText, "剩余 7 / 10 份");
  } finally {
    global.wx = originalWx;
  }
});

test("welfare marks a successfully claimed campaign immediately", async () => {
  const definition = loadPageDefinition("welfare");
  const originalWx = global.wx;
  const state = { ...definition.data };
  const requests = [];

  try {
    global.wx = {
      showShareMenu() {},
      getStorageSync() {
        return "";
      },
      getWindowInfo() {
        return { statusBarHeight: 20, windowWidth: 375 };
      },
      getMenuButtonBoundingClientRect() {
        return { top: 28, height: 32, left: 280 };
      },
      request(options) {
        requests.push(options);
        if (options.method === "POST") {
          options.success({
            statusCode: 201,
            data: {
              campaign: {
                _id: "campaign-open",
                title: "刚领福利",
                totalStock: 10,
                remainingStock: 6,
                claimInstructions: "按说明领取"
              },
              claim: {
                activationCode: "CODE-001"
              }
            }
          });
          return;
        }
        options.success({
          statusCode: 200,
          data: {
            active: [
              {
                _id: "campaign-open",
                title: "刚领福利",
                totalStock: 10,
                remainingStock: 7,
                claimedByMe: false
              },
              {
                _id: "campaign-other",
                title: "未领福利",
                totalStock: 10,
                remainingStock: 5,
                claimedByMe: false
              }
            ],
            history: []
          }
        });
      }
    };

    const page = {
      ...definition,
      data: state,
      setData(patch) {
        Object.assign(state, patch);
      }
    };
    definition.onLoad.call(page);
    await new Promise((resolve) => setTimeout(resolve, 0));

    definition.claimWelfare.call(page, { currentTarget: { dataset: { id: "campaign-open" } } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(state.claimDialogVisible, true);
    assert.deepEqual(state.activeCampaigns.map((item) => item.title), ["未领福利", "刚领福利"]);
    assert.equal(state.activeCampaigns[1].claimedByMe, true);
    assert.equal(state.activeCampaigns[1].actionText, "已领取");
    assert.equal(state.activeCampaigns[1].activationCode, "CODE-001");
    assert.equal(state.activeCampaigns[1].unavailable, true);
    assert.equal(state.activeCampaigns[1].stockText, "剩余 6 / 10 份");
    assert.equal(state.claimDialogActivationCode, "CODE-001");
  } finally {
    global.wx = originalWx;
  }
});

test("welfare lets claimed campaigns reopen claim instructions without another claim", async () => {
  const definition = loadPageDefinition("welfare");
  const pageSource = readPage("welfare");
  const originalWx = global.wx;
  const state = {
    ...definition.data,
    activeCampaigns: [
      {
        _id: "campaign-claimed",
        title: "已领福利",
        claimInstructions: "这里是领取说明",
        externalUrl: "https://example.com/claim",
        activationCode: "CLAIMED-CODE",
        claimedByMe: true,
        unavailable: true,
        claimDisabled: false,
        actionText: "已领取"
      }
    ]
  };
  let postCount = 0;

  assert.match(pageSource.wxml, /disabled="\{\{item\.claimDisabled \|\| claimingId === item\._id\}\}"/);
  assert.doesNotMatch(pageSource.wxml, /disabled="\{\{item\.unavailable \|\| claimingId === item\._id\}\}"/);
  assert.match(pageSource.wxml, /wx:for="\{\{activeCampaigns\}\}" wx:key="_id" class="xf-welfare-item" data-id="\{\{item\._id\}\}" bindtap="claimWelfare"/);
  assert.doesNotMatch(pageSource.wxml, /class="xf-welfare-claim[^"]*"[^>]*data-id="\{\{item\._id\}\}"[^>]*bindtap="claimWelfare"/);

  try {
    global.wx = {
      request(options) {
        if (options.method === "POST") postCount += 1;
        options.fail({ errMsg: "unexpected post" });
      }
    };

    const page = {
      ...definition,
      data: state,
      setData(patch) {
        Object.assign(state, patch);
      }
    };

    definition.claimWelfare.call(page, { currentTarget: { dataset: { id: "campaign-claimed" } } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(postCount, 0);
    assert.equal(state.claimDialogVisible, true);
    assert.equal(state.claimDialogTitle, "已领福利");
    assert.equal(state.claimDialogInstructions, "这里是领取说明");
    assert.equal(state.claimDialogExternalUrl, "https://example.com/claim");
    assert.equal(state.claimDialogActivationCode, "CLAIMED-CODE");
    assert.equal(state.claimingId, "");
  } finally {
    global.wx = originalWx;
  }
});

test("welfare lets claimed history reopen instructions without allowing a historical claim", async () => {
  const definition = loadPageDefinition("welfare");
  const pageSource = readPage("welfare");
  const originalWx = global.wx;
  const state = {
    ...definition.data,
    historyCampaigns: [
      {
        _id: "history-claimed",
        title: "历史已领福利",
        claimInstructions: "历史领取说明",
        activationCode: "HISTORY-CODE",
        claimedByMe: true
      },
      {
        _id: "history-unclaimed",
        title: "历史未领福利",
        claimedByMe: false
      }
    ]
  };
  let postCount = 0;

  assert.match(pageSource.wxml, /wx:for="\{\{historyCampaigns\}\}" wx:key="_id" class="xf-welfare-item is-history" data-id="\{\{item\._id\}\}" bindtap="claimWelfare"/);

  try {
    global.wx = {
      request(options) {
        if (options.method === "POST") postCount += 1;
        options.fail({ errMsg: "unexpected post" });
      }
    };
    const page = {
      ...definition,
      data: state,
      setData(patch) {
        Object.assign(state, patch);
      }
    };

    definition.claimWelfare.call(page, { currentTarget: { dataset: { id: "history-claimed" } } });
    assert.equal(state.claimDialogVisible, true);
    assert.equal(state.claimDialogTitle, "历史已领福利");
    assert.equal(state.claimDialogInstructions, "历史领取说明");
    assert.equal(state.claimDialogActivationCode, "HISTORY-CODE");

    definition.closeClaimDialog.call(page);
    definition.claimWelfare.call(page, { currentTarget: { dataset: { id: "history-unclaimed" } } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(postCount, 0);
    assert.equal(state.claimDialogVisible, false);
  } finally {
    global.wx = originalWx;
  }
});

test("native search page replaces the webview global search entry", () => {
  const appJson = JSON.parse(
    fs.readFileSync(new URL("../app.json", import.meta.url), "utf8")
  );
  const nativePageNav = fs.readFileSync(new URL("../utils/nativePageNav.js", import.meta.url), "utf8");
  const searchPromptsUrl = new URL("../utils/searchPrompts.js", import.meta.url);
  const searchPrompts = fs.existsSync(searchPromptsUrl) ? fs.readFileSync(searchPromptsUrl, "utf8") : "";
  const { js, json, wxml, wxss } = readPage("search");

  assert.equal(appJson.pages.includes("pages/search/index"), true);
  assert.equal(json.navigationStyle, "custom");
  assert.equal(wxml.includes("<web-view"), false);
  assert.match(wxml, /class="xf-native-search-field \{\{searchInput \? 'has-query' : 'is-empty'\}\}" bindtap="focusSearchInput"/);
  assert.match(wxml, /class="xf-native-topbar" style="height: \{\{topbarHeight\}\}px;"/);
  assert.match(wxml, /class="xf-native-menu-button xf-native-back-button" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;" catchtap="goBack" role="button" aria-label="返回"/);
  assert.match(wxml, /class="xf-native-back-icon" aria-hidden="true"/);
  assert.match(wxml, /class="xf-native-logo" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;" src="\/assets\/nav\/logo\.png" mode="aspectFit" bindtap="goProgramsHome" aria-label="回到顶部"/);
  assert.doesNotMatch(wxml, /xf-native-search-topbar|xf-native-search-logo/);
  assert.match(wxml, /placeholder="\{\{searchPrompt\}\}"/);
  assert.match(wxml, /bindblur="onSearchBlur"/);
  assert.match(wxml, /wx:if="\{\{searchInput\}\}" class="xf-native-search-close" catchtap="closeSearchInput" aria-label="退出搜索框"/);
  assert.doesNotMatch(wxml, /class="xf-native-search-submit"/);
  assert.match(wxml, /wx:if="\{\{!submittedQuery\}\}"/);
  assert.match(wxml, /wx:for="\{\{suggestions\}\}"/);
  assert.match(wxml, /wx:for="\{\{recentKeywords\}\}"/);
  assert.match(wxml, /wx:if="\{\{settingsPanelOpen\}\}" class="xf-native-settings-mask" style="height: \{\{settingsPanelHeight\}\}px;" catchtap="closeSettings"/);
  assert.match(wxml, /wx:for="\{\{suggestions\}\}" wx:key="\*this" class="xf-native-search-chip"/);
  assert.match(wxml, /class="xf-native-search-section-head"/);
  assert.match(wxml, /class="xf-native-search-clear-history"/);
  assert.match(wxml, /aria-label="清空最近搜索"/);
  assert.match(wxml, />×<\/button>/);
  assert.doesNotMatch(wxml, /确认删除搜索记录/);
  assert.doesNotMatch(wxml, /clearHistoryConfirming/);
  assert.doesNotMatch(wxml, /xf-native-search-trash/);
  assert.match(wxml, /class="xf-native-search-recent-list"/);
  assert.match(wxml, /wx:for="\{\{recentKeywords\}\}" wx:key="\*this" class="xf-native-search-recent-keyword"/);
  assert.match(wxml, /class="xf-native-search-clock"/);
  assert.match(wxml, /wx:for="\{\{tabs\}\}"/);
  assert.match(wxml, /wx:for="\{\{visibleResults\}\}"/);
  assert.match(wxml, /class="xf-native-search-tabs \{\{loading \? 'is-loading' : ''\}\}"[\s\S]*wx:if="\{\{loading\}\}" class="xf-native-search-progress"/);
  assert.match(wxml, /style="width: \{\{searchProgress\}\}%;"/);
  assert.match(wxml, /class="xf-native-search-progress-percent">\{\{searchProgress\}\}%<\/text>/);
  assert.doesNotMatch(wxml, /正在加载更多结果/);
  assert.match(wxss, /\.xf-native-search-progress-track \{[\s\S]*height: 4rpx;[\s\S]*background: rgba\(94, 23, 235, 0\.1\);/);
  assert.match(wxss, /\.xf-native-search-progress \{[\s\S]*position: absolute;[\s\S]*bottom: 0;/);
  assert.match(wxml, /wx:if="\{\{loading && !visibleResults\.length\}\}" class="xf-native-search-state"/);
  assert.match(wxml, /wx:if="\{\{!error && visibleResults\.length\}\}" class="xf-native-search-list"/);
  assert.match(wxml, /item\.iconImage \? 'has-icon-image' : ''/);
  assert.match(wxml, /item\.type === 'topics' \? 'has-topic-emoji' : ''/);
  assert.match(wxml, /item\.imageFallback \? 'has-fallback-avatar' : ''/);
  assert.match(wxml, /<image wx:if="\{\{item\.image\}\}" src="\{\{item\.image\}\}" mode="\{\{item\.imageMode\}\}" data-id="\{\{item\.id\}\}" binderror="onResultImageError" \/>/);
  assert.match(wxml, /<image wx:elif="\{\{item\.iconImage\}\}" src="\{\{item\.iconImage\}\}" mode="aspectFit" \/>/);
  assert.match(js, /const SEARCH_HISTORY_KEY = "xf_native_search_history"/);
  assert.match(js, /const GUEST_FALLBACK_AVATAR = "\/assets\/wel-avatar\/no-hat\.png"/);
  assert.match(js, /const GUEST_FALLBACK_AVATAR_MARKERS = \[/);
  assert.match(js, /DEFAULT_SEARCH_PROMPTS/);
  assert.match(js, /searchPrompt: getInitialSearchPrompt\(\)/);
  assert.match(js, /inputFocus: false/);
  assert.match(js, /readingSource,\s*inputFocus: true/);
  assert.match(js, /onReady\(\) \{[\s\S]*this\.setData\(\{ inputFocus: false \}, \(\) => \{[\s\S]*this\.setData\(\{ inputFocus: true \}\);/);
  assert.match(js, /request\(\{ url: `\/api\/search\?q=\$\{encodeURIComponent\(query\)\}` \}\)/);
  assert.match(js, /this\._searchInputTimer = setTimeout\(\(\) => this\.loadData\(\), 220\)/);
  assert.doesNotMatch(js, /clearHistoryConfirming/);
  assert.match(js, /startSearchPromptRotation\(this\)/);
  assert.match(js, /stopSearchPromptRotation\(this\)/);
  assert.match(js, /const BASE_TABS = \[/);
  assert.match(js, /topics: \{ label: "请教", icon: "🙏🏻" \}/);
  assert.match(js, /books: \{ label: "及阅", icon: "书", iconImage: "\/assets\/menu\/jiyue-logo\.png" \}/);
  assert.match(js, /materials: \{ label: "资料", icon: "资", iconImage: "\/assets\/tabbar\/materials\.png" \}/);
  assert.match(js, /icon: item\.icon \|\| meta\.icon/);
  assert.match(js, /iconImage: item\.iconImage \|\| meta\.iconImage \|\| ""/);
  assert.match(js, /icon: firstText\(\[item\.coverEmoji\], "🙏🏻"\)/);
  assert.match(js, /icon: firstText\(\[item\.coverEmoji\], "🙏🏻"\),\s*meta: "",/);
  assert.match(js, /function isGuestFallbackAvatar\(value\)/);
  assert.match(js, /const avatar = normalizeImage\(item\.avatar\)/);
  assert.match(js, /const imageFallback = isGuestFallbackAvatar\(item\.avatar\)/);
  assert.match(js, /image: imageFallback \? GUEST_FALLBACK_AVATAR : avatar/);
  assert.match(js, /imageMode: imageFallback \? "aspectFit" : "aspectFill"/);
  assert.match(js, /function applyGuestFallbackAvatar\(result\)/);
  assert.match(js, /onResultImageError\(event\)/);
  assert.match(js, /visibleResults: this\.data\.visibleResults\.map\(updateItem\)/);
  assert.match(js, /programs[\s\S]*topics[\s\S]*books[\s\S]*materials[\s\S]*experts/);
  assert.match(js, /request\(\{ url: `\/api\/programs\?page=1&pageSize=\$\{SEARCH_PAGE_SIZE\}` \}\)/);
  assert.match(js, /request\(\{ url: "\/api\/books" \}\)/);
  assert.match(js, /request\(\{ url: "\/api\/learning-materials" \}\)/);
  assert.match(js, /path: id \? `\/materials\/\$\{encodeURIComponent\(id\)\}` : ""/);
  assert.match(js, /request\(\{ url: `\/api\/topic-hub\?page=1&limit=\$\{SEARCH_PAGE_SIZE\}` \}\)/);
  assert.match(js, /request\(\{ url: `\/api\/guests\?page=1&pageSize=\$\{SEARCH_PAGE_SIZE\}` \}\)/);
  assert.match(js, /function resultMatches\(result, keyword\)/);
  assert.match(js, /saveHistory\(query\)/);
  assert.match(js, /focusSearchInput\(\)/);
  assert.match(js, /onSearchInput\(event\)\s*\{[\s\S]*this\.applySearch\(query\);[\s\S]*\}/);
  assert.match(js, /closeSearchInput\(\)\s*\{[\s\S]*searchInput: "",[\s\S]*inputFocus: false[\s\S]*this\.resetSearchResults\(\);[\s\S]*\}/);
  assert.match(js, /resetSearchResults\(\)/);
  assert.match(js, /smartBackHome/);
  assert.match(js, /goBack\(\)\s*\{[\s\S]*smartBackHome\(\);[\s\S]*\}/);
  assert.match(js, /goProgramsHome: navigateProgramsHome/);
  assert.match(js, /goProgramsHome\(\)\s*\{[\s\S]*navigateProgramsHome\(\);[\s\S]*\}/);
  assert.match(js, /onSearchBlur\(\)/);
  assert.match(js, /function clearHistory\(\)/);
  assert.match(js, /wx\.removeStorageSync\(SEARCH_HISTORY_KEY\)/);
  assert.match(js, /clearSearchHistory\(\)/);
  assert.match(js, /wx\.showModal\(\{/);
  assert.match(js, /title: "删除搜索记录"/);
  assert.match(js, /confirmText: "删除"/);
  assert.match(js, /if \(!res \|\| !res\.confirm\) return;/);
  assert.match(js, /recentKeywords: clearHistory\(\)/);
  assert.match(js, /const nativeRoute = buildNativeResultRoute\(result\)/);
  assert.match(js, /wx\.navigateTo\(\{ url: nativeRoute \}\)/);
  assert.match(js, /copyTextSilently/);
  assert.match(wxml, /class="xf-materials-link-url"[^>]*catchtap="copyMaterialLink"/);
  assert.doesNotMatch(wxml, /长按可复制/);
  assert.match(wxss, /\.xf-native-search-field \{[\s\S]*height: 70rpx;[\s\S]*border: 2rpx solid #d8d0ef;[\s\S]*border-radius: 999rpx;/);
  assert.match(wxss, /\.xf-native-search-panel \{[\s\S]*width: 100%;[\s\S]*margin: 0;[\s\S]*padding: 18rpx 0 24rpx;/);
  assert.match(wxss, /\.xf-native-search-circle \{[\s\S]*border: 3rpx solid #4b5563;/);
  assert.match(wxss, /\.xf-native-search-line \{[\s\S]*height: 3rpx;/);
  assert.match(wxss, /\.xf-native-search-main \{[\s\S]*justify-content: flex-start;/);
  assert.doesNotMatch(wxss, /\.xf-native-search-field\.is-empty \.xf-native-search-main \{[\s\S]*justify-content: center;/);
  assert.match(wxss, /\.xf-native-search-field\.is-empty \.xf-native-search-input \{[\s\S]*flex: 0 1 220rpx;[\s\S]*width: 220rpx;/);
  assert.doesNotMatch(wxss, /\.xf-native-search-field\.is-empty \.xf-native-search-input \{[\s\S]*text-align: center;/);
  assert.match(wxss, /\.xf-native-search-close \{[\s\S]*width: 44rpx;[\s\S]*height: 44rpx;[\s\S]*border-radius: 999rpx;[\s\S]*background: #f3edff;[\s\S]*color: #5e17eb;[\s\S]*font-size: 30rpx;[\s\S]*font-weight: 400;[\s\S]*line-height: 1;/);
  assert.doesNotMatch(wxss, /\.xf-native-search-submit/);
  assert.match(wxss, /\.xf-native-search-card \{[\s\S]*border: 0;[\s\S]*border-radius: 0;[\s\S]*background: transparent;/);
  assert.match(wxss, /\.xf-native-search-chip \{[\s\S]*font-size: 24rpx;[\s\S]*font-weight: 400;/);
  assert.match(wxss, /\.xf-native-search-section-head \{[\s\S]*justify-content: space-between;/);
  assert.match(wxss, /\.xf-native-search-clear-history \{[\s\S]*align-items: center;[\s\S]*justify-content: center;[\s\S]*width: 44rpx;[\s\S]*height: 44rpx;[\s\S]*border-radius: 999rpx;[\s\S]*background: #f3edff;[\s\S]*color: #5e17eb;[\s\S]*font-size: 30rpx;[\s\S]*line-height: 1;/);
  assert.doesNotMatch(wxss, /\.xf-native-search-clear-history\.is-confirming/);
  assert.doesNotMatch(wxss, /xf-native-search-trash/);
  assert.match(wxss, /\.xf-native-search-recent-list \{[\s\S]*display: grid;[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);[\s\S]*column-gap: 34rpx;[\s\S]*row-gap: 18rpx;/);
  assert.match(wxss, /\.xf-native-search-recent-keyword \{[\s\S]*justify-content: flex-start;[\s\S]*gap: 12rpx;[\s\S]*border: 0;[\s\S]*border-radius: 0;[\s\S]*background: transparent;[\s\S]*color: #8b8792;[\s\S]*font-weight: 500;[\s\S]*text-align: left;/);
  assert.match(wxss, /\.xf-native-search-clock \{[\s\S]*border: 3rpx solid #a7a4ad;[\s\S]*border-radius: 50%;/);
  assert.match(wxss, /\.xf-native-search-result \{[\s\S]*border: 1rpx solid #e1daf0;[\s\S]*border-radius: 24rpx;/);
  assert.match(wxss, /\.xf-native-search-result \{[\s\S]*box-sizing: border-box;[\s\S]*width: 100%;[\s\S]*max-width: 100%;[\s\S]*overflow: hidden;/);
  assert.match(wxss, /\.xf-native-search-body \{[\s\S]*flex: 1 1 0;[\s\S]*width: 0;[\s\S]*min-width: 0;[\s\S]*overflow: hidden;/);
  assert.match(wxss, /\.xf-native-search-tag \{[\s\S]*max-width: 100%;[\s\S]*overflow: hidden;[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/);
  assert.match(wxss, /\.xf-native-search-thumb\.has-icon-image \{[\s\S]*background: transparent;/);
  assert.match(wxss, /\.xf-native-search-thumb\.has-fallback-avatar \{[\s\S]*background: #ffffff;/);
  assert.match(wxss, /\.xf-native-search-thumb\.has-fallback-avatar image \{[\s\S]*width: 86%;[\s\S]*height: 86%;/);
  assert.match(wxss, /\.xf-native-search-thumb\.has-topic-emoji \{[\s\S]*background: transparent;[\s\S]*font-size: 58rpx;/);
  assert.match(nativePageNav, /wx\.navigateTo\(\{[\s\S]*\/pages\/search\/index/);
  assert.match(nativePageNav, /function scrollPageToTop\(\)\s*\{[\s\S]*wx\.pageScrollTo\(\{ scrollTop: 0, duration: 250 \}\);[\s\S]*\}/);
  assert.match(nativePageNav, /function goProgramsHome\(\)\s*\{[\s\S]*scrollPageToTop\(\);[\s\S]*\}/);
  assert.match(nativePageNav, /const BACK_STACK_HOME_PAGE = "\/pages\/programs\/index";/);
  assert.match(nativePageNav, /function switchProgramsHome\(\)\s*\{[\s\S]*wx\.switchTab\(\{ url: BACK_STACK_HOME_PAGE \}\);[\s\S]*\}/);
  assert.match(nativePageNav, /function smartBackHome\(\)\s*\{[\s\S]*getCurrentPages[\s\S]*wx\.navigateBack\(\{ delta: 1 \}\);[\s\S]*switchProgramsHome\(\);[\s\S]*\}/);
  assert.match(nativePageNav, /if \(detail\.page === "\/pages\/programs\/index"\) \{[\s\S]*switchProgramsHome\(\);[\s\S]*return;[\s\S]*\}/);
  assert.match(nativePageNav, /smartBackHome,/);
  assert.equal(nativePageNav.includes("WEB_ROUTES.search"), false);
  assert.equal(fs.existsSync(searchPromptsUrl), true);
  assert.match(searchPrompts, /const DEFAULT_SEARCH_PROMPTS = \[/);
  assert.match(searchPrompts, /"中考作文"/);
  assert.match(searchPrompts, /"亲子关系"/);
  assert.match(searchPrompts, /function startSearchPromptRotation\(page\)/);
});

test("smartBackHome returns to the previous page or home after share launch", () => {
  const file = require.resolve("../utils/nativePageNav.js");
  delete require.cache[file];
  const originalGetCurrentPages = global.getCurrentPages;
  const originalNavigateBack = global.wx.navigateBack;
  const originalSwitchTab = global.wx.switchTab;
  const backCalls = [];
  const switchCalls = [];

  try {
    global.wx.navigateBack = (options) => backCalls.push(options);
    global.wx.switchTab = (options) => switchCalls.push(options);
    const { smartBackHome } = require("../utils/nativePageNav.js");

    global.getCurrentPages = () => [{ route: "pages/programs/index" }, { route: "pages/mama-resource-apply/index" }];
    smartBackHome();
    assert.deepEqual(backCalls, [{ delta: 1 }]);
    assert.deepEqual(switchCalls, []);

    backCalls.length = 0;
    global.getCurrentPages = () => [{ route: "pages/mama-resource-apply/index" }];
    smartBackHome();
    assert.deepEqual(backCalls, []);
    assert.deepEqual(switchCalls, [{ url: "/pages/programs/index" }]);
  } finally {
    global.getCurrentPages = originalGetCurrentPages;
    global.wx.navigateBack = originalNavigateBack;
    global.wx.switchTab = originalSwitchTab;
  }
});

test("back-button pages normalize a root launch into a swipe-back page stack", () => {
  const file = require.resolve("../utils/nativePageNav.js");
  delete require.cache[file];
  const originalGetCurrentPages = global.getCurrentPages;
  const originalSwitchTab = global.wx.switchTab;
  const originalNavigateTo = global.wx.navigateTo;
  const switchCalls = [];
  const navigateCalls = [];

  try {
    global.wx.switchTab = (options) => {
      switchCalls.push(options);
      if (typeof options.success === "function") options.success();
    };
    global.wx.navigateTo = (options) => navigateCalls.push(options);
    const { ensureBackStackForBackButtonPage } = require("../utils/nativePageNav.js");

    global.getCurrentPages = () => [{ route: "pages/pro/index", options: { from: "settings" } }];
    assert.equal(ensureBackStackForBackButtonPage({ plan: "plus" }), true);
    assert.equal(switchCalls[0].url, "/pages/programs/index");
    assert.deepEqual(navigateCalls, [{ url: "/pages/pro/index?from=settings&plan=plus&xf_back_stack=1" }]);

    switchCalls.length = 0;
    navigateCalls.length = 0;
    global.getCurrentPages = () => [
      { route: "pages/programs/index" },
      { route: "pages/pro/index", options: { from: "settings" } }
    ];
    assert.equal(ensureBackStackForBackButtonPage({ plan: "plus" }), false);
    assert.deepEqual(switchCalls, []);
    assert.deepEqual(navigateCalls, []);

    global.getCurrentPages = () => [{ route: "pages/pro/index", options: { xf_back_stack: "1" } }];
    assert.equal(ensureBackStackForBackButtonPage({ plan: "plus" }), false);

    for (const name of ["pro", "mine/archive", "mine/memory", "mine/settings"]) {
      const page = readPage(name);
      assert.match(page.js, /ensureBackStackForBackButtonPage/);
      assert.match(page.js, /if \(ensureBackStackForBackButtonPage\(options\)\) return;/);
    }
    assert.doesNotMatch(readPage("welfare").js, /ensureBackStackForBackButtonPage/);
    const mamaPage = readPage("mama-resource-apply");
    assert.doesNotMatch(mamaPage.js, /ensureBackStackForBackButtonPage/);
    assert.match(mamaPage.js, /const pendingMamaTaskId = asText\(options\.taskId \|\| parseSceneParam\(options\.scene, "m"\)\)\.trim\(\)/);
    assert.match(mamaPage.js, /goBack\(\)\s*\{[\s\S]*wx\.navigateBack\(\{ delta: 1 \}\)[\s\S]*wx\.exitMiniProgram\(\)[\s\S]*\}/);
  } finally {
    global.getCurrentPages = originalGetCurrentPages;
    global.wx.switchTab = originalSwitchTab;
    global.wx.navigateTo = originalNavigateTo;
  }
});

test("openNativeSearch passes the keyword into the native search page", () => {
  const file = require.resolve("../utils/nativePageNav.js");
  delete require.cache[file];
  const originalNavigateTo = global.wx.navigateTo;
  const navigateCalls = [];

  try {
    global.wx.navigateTo = (options) => navigateCalls.push(options);
    const { openNativeSearch } = require("../utils/nativePageNav.js");
    openNativeSearch("作文");
    openNativeSearch("");
    openNativeSearch("Magic", { source: "reading", readingSource: "external" });

    assert.deepEqual(navigateCalls[0], { url: "/pages/search/index?q=%E4%BD%9C%E6%96%87" });
    assert.deepEqual(navigateCalls[1], { url: "/pages/search/index" });
    assert.deepEqual(navigateCalls[2], { url: "/pages/search/index?q=Magic&source=reading&readingSource=external" });
  } finally {
    global.wx.navigateTo = originalNavigateTo;
  }
});

test("native search page filters while typing and clears from the close button", () => {
  const definition = loadPageDefinition("search");
  const context = {
    ...definition,
    data: {
      ...definition.data,
      activeTab: "all",
      allResults: [
        {
          id: "program-1",
          type: "programs",
          title: "动画启蒙",
          searchText: "动画启蒙 儿童动画"
        },
        {
          id: "program-2",
          type: "programs",
          title: "动画化表达",
          searchText: "动画化表达 叙事"
        },
        {
          id: "book-1",
          type: "books",
          title: "阅读指南",
          searchText: "阅读 指南"
        }
      ]
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  definition.onSearchInput.call(context, { detail: { value: "动" } });
  assert.equal(context.data.submittedQuery, "动");
  assert.deepEqual(context.data.visibleResults.map((item) => item.title), ["动画启蒙", "动画化表达"]);
  assert.equal(context.data.tabs.find((item) => item.key === "programs").count, 2);

  definition.onSearchInput.call(context, { detail: { value: "动画化" } });
  assert.equal(context.data.submittedQuery, "动画化");
  assert.deepEqual(context.data.visibleResults.map((item) => item.title), ["动画化表达"]);

  definition.closeSearchInput.call(context);
  assert.equal(context.data.searchInput, "");
  assert.equal(context.data.inputFocus, false);
  assert.equal(context.data.submittedQuery, "");
  assert.deepEqual(context.data.visibleResults, []);
  assert.deepEqual(context.data.filteredResults, []);
});

test("native search stores reading keyword before opening fallback reading list", () => {
  const definition = loadPageDefinition("search");
  const originalSwitchTab = global.wx.switchTab;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map();
  const switchCalls = [];
  const context = {
    ...definition,
    data: {
      ...definition.data,
      submittedQuery: "中考作文",
      readingSource: "native",
      visibleResults: [
        {
          id: "books-writing-1",
          type: "books",
          title: "中考作文训练",
          page: "/pages/reading/index"
        }
      ]
    }
  };

  try {
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.wx.switchTab = (options) => switchCalls.push(options);

    definition.openResult.call(context, { currentTarget: { dataset: { index: 0 } } });

    assert.deepEqual(storage.get("xf_reading_pending_filter_v1"), {
      source: "native",
      keyword: "中考作文"
    });
    assert.deepEqual(switchCalls, [{ url: "/pages/reading/index" }]);

    context.data.readingSource = "external";
    definition.openResult.call(context, { currentTarget: { dataset: { index: 0 } } });
    assert.deepEqual(storage.get("xf_reading_pending_filter_v1"), {
      source: "native",
      keyword: "中考作文"
    });
  } finally {
    global.wx.switchTab = originalSwitchTab;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("native search opens material links in a modal and other site results in native detail routes", () => {
  const definition = loadPageDefinition("search");
  const originalNavigateTo = global.wx.navigateTo;
  const originalSetClipboardData = global.wx.setClipboardData;
  const navigations = [];
  const copied = [];
  const context = {
    ...definition,
    data: {
      ...definition.data,
      visibleResults: [
        {
          id: "materials-material-pinyin",
          type: "materials",
          title: "拼音资料",
          path: "/materials/material-pinyin",
          copyUrl: "https://example.com/pinyin.pdf"
        },
        {
          id: "topics-pinyin-start",
          type: "topics",
          title: "拼音启蒙",
          path: "/topics/pinyin-start"
        }
      ]
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.navigateTo = (options) => navigations.push(options);
    global.wx.setClipboardData = (options) => copied.push(options.data);

    definition.openResult.call(context, { currentTarget: { dataset: { index: 0 } } });
    assert.equal(context.data.materialLinkModalOpen, true);
    assert.equal(context.data.materialLinkModalTitle, "拼音资料");
    assert.equal(context.data.materialLinkModalUrl, "https://example.com/pinyin.pdf");
    assert.deepEqual(navigations, []);
    definition.copyMaterialLink.call(context);
    assert.deepEqual(copied, ["https://example.com/pinyin.pdf"]);

    definition.openResult.call(context, { currentTarget: { dataset: { index: 1 } } });
    assert.deepEqual(navigations[0], {
      url: "/pages/webview/index?nativeTopic=1&topicSlug=pinyin-start&title=%E6%8B%BC%E9%9F%B3%E5%90%AF%E8%92%99"
    });
  } finally {
    global.wx.navigateTo = originalNavigateTo;
    global.wx.setClipboardData = originalSetClipboardData;
  }
});

test("native search page keeps all-site results while following the current reading library source", async () => {
  const definition = loadPageDefinition("search");
  const originalRequest = global.wx.request;
  const requests = [];
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.request = (options) => {
      requests.push(options.url);
      if (String(options.url).includes("/api/programs")) {
        options.success({
          statusCode: 200,
          data: {
            data: [
              {
                _id: "program-1",
                title: "Magic workshop",
                category: "活动",
                detail: "program detail"
              }
            ]
          }
        });
        return;
      }
      if (String(options.url).includes("/api/books/external")) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              {
                id: "external-magic-1",
                title: "Mirrorscape",
                author: "Mike Wilks",
                publisher: "EgmontUSA",
                tags: "Fantasy,Young Adult,Fiction,Magic,Adventure",
                category: "Fantasy",
                coverPic: "https://example.com/mirror.jpg"
              }
            ],
            total: 1
          }
        });
        return;
      }
      options.success({ statusCode: 200, data: [] });
    };

    await definition.onLoad.call(context, {
      q: encodeURIComponent("Magic"),
      source: "reading",
      readingSource: "external"
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(context.data.searchSource, "");
    assert.equal(context.data.readingSource, "external");
    assert.equal(requests.some((url) => String(url).includes("/api/books/external")), true);
    assert.equal(requests.some((url) => String(url).endsWith("/api/books")), false);
    assert.deepEqual(context.data.visibleResults.map((item) => item.title), ["Magic workshop", "Mirrorscape"]);
    assert.equal(context.data.visibleResults[1].path, "/library?xf_external_book_id=external-magic-1");
    assert.equal(context.data.tabs.find((item) => item.key === "books").count, 1);
    assert.equal(context.data.tabs.find((item) => item.key === "programs").count, 1);
    assert.equal(context.data.tabs.find((item) => item.key === "all").count, 2);
  } finally {
    global.wx.request = originalRequest;
  }
});

test("native search requests matched summaries instead of downloading every content list", async () => {
  const definition = loadPageDefinition("search");
  const originalRequest = global.wx.request;
  const requests = [];
  const context = {
    ...definition,
    data: { ...definition.data, searchInput: "Magic", submittedQuery: "Magic" },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.request = (options) => {
      requests.push(options.url);
      options.success({
        statusCode: 200,
        data: {
          programs: [{ _id: "program-fast", title: "Magic workshop" }],
          books: [],
          materials: [],
          topics: [],
          experts: []
        }
      });
    };

    await definition.loadData.call(context);

    assert.deepEqual(requests, ["https://xianfeng.xinzhi.info/api/search?q=Magic"]);
    assert.deepEqual(context.data.visibleResults.map((item) => item.title), ["Magic workshop"]);
    assert.equal(context.data.loading, false);
    assert.equal(context.data.searchProgress, 100);
  } finally {
    global.wx.request = originalRequest;
  }
});

test("native search falls back to existing content endpoints when the summary endpoint is unavailable", async () => {
  const definition = loadPageDefinition("search");
  const originalRequest = global.wx.request;
  const requests = [];
  const context = {
    ...definition,
    data: { ...definition.data, searchInput: "Magic", submittedQuery: "Magic" },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.request = (options) => {
      requests.push(options.url);
      if (String(options.url).includes("/api/search?")) {
        options.success({ statusCode: 404, data: { message: "Not Found" } });
        return;
      }
      if (String(options.url).includes("/api/programs?")) {
        options.success({ statusCode: 200, data: { programs: [{ _id: "program-fallback", title: "Magic workshop" }] } });
        return;
      }
      options.success({ statusCode: 200, data: [] });
    };

    await definition.loadData.call(context);

    assert.equal(requests.some((url) => String(url).includes("/api/search?")), true);
    assert.equal(requests.some((url) => String(url).includes("/api/programs?")), true);
    assert.equal(requests.some((url) => String(url).endsWith("/api/books")), true);
    assert.equal(requests.some((url) => String(url).endsWith("/api/learning-materials")), true);
    assert.equal(requests.some((url) => String(url).includes("/api/topic-hub?")), true);
    assert.equal(requests.some((url) => String(url).includes("/api/guests?")), true);
    assert.deepEqual(context.data.visibleResults.map((item) => item.title), ["Magic workshop"]);
    assert.equal(context.data.loading, false);
    assert.equal(context.data.error, "");
  } finally {
    global.wx.request = originalRequest;
  }
});

test("native search opens a book purchase short link and keeps its uploaded cover", async () => {
  const definition = loadPageDefinition("search");
  const originalRequest = global.wx.request;
  const originalNavigateToMiniProgram = global.wx.navigateToMiniProgram;
  const navigations = [];
  const context = {
    ...definition,
    data: {
      ...definition.data,
      searchSource: "reading",
      readingSource: "native",
      submittedQuery: "百花"
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.request = (options) => {
      options.success({
        statusCode: 200,
        data: [
          {
            _id: "book-baihua",
            title: "百花思维训练",
            coverImage: "http://xianfeng.xinzhi.info/uploads/images/baihua.jpg",
            wxPurchaseLink: "#小程序://快团团/点击查看/O4W6Aau9gEsXclv",
            hasMetadataDetail: false
          }
        ]
      });
    };
    global.wx.navigateToMiniProgram = (options) => {
      navigations.push(options);
    };

    await definition.loadData.call(context);

    assert.equal(context.data.visibleResults.length, 1);
    assert.equal(context.data.visibleResults[0].image, "https://xianfeng.xinzhi.info/uploads/images/baihua.jpg");
    assert.equal(context.data.visibleResults[0].miniProgramShortLink, "#小程序://快团团/点击查看/O4W6Aau9gEsXclv");

    definition.openResult.call(context, { currentTarget: { dataset: { index: 0 } } });

    assert.equal(navigations.length, 1);
    assert.equal(navigations[0].shortLink, "#小程序://快团团/点击查看/O4W6Aau9gEsXclv");
  } finally {
    global.wx.request = originalRequest;
    global.wx.navigateToMiniProgram = originalNavigateToMiniProgram;
  }
});

test("native search page clears recent search history", () => {
  const definition = loadPageDefinition("search");
  const removedKeys = [];
  const originalRemoveStorageSync = global.wx.removeStorageSync;
  const originalShowModal = global.wx.showModal;
  const modalCalls = [];
  try {
    global.wx.removeStorageSync = (key) => {
      removedKeys.push(key);
    };
    global.wx.showModal = (options) => {
      modalCalls.push(options);
      options.success({ confirm: false });
    };
    const context = {
      data: {
        recentKeywords: ["亲子关系", "中考作文"]
      },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };

    definition.clearSearchHistory.call(context);
    assert.equal(modalCalls.length, 1);
    assert.equal(modalCalls[0].title, "删除搜索记录");
    assert.equal(modalCalls[0].confirmText, "删除");
    assert.deepEqual(removedKeys, []);
    assert.deepEqual(context.data.recentKeywords, ["亲子关系", "中考作文"]);

    global.wx.showModal = (options) => {
      modalCalls.push(options);
      options.success({ confirm: true });
    };
    definition.clearSearchHistory.call(context);
    assert.deepEqual(removedKeys, ["xf_native_search_history"]);
    assert.deepEqual(context.data.recentKeywords, []);
  } finally {
    global.wx.removeStorageSync = originalRemoveStorageSync;
    global.wx.showModal = originalShowModal;
  }
});

test("mini program native navigation bar keeps the website white top nav color", () => {
  const appJson = JSON.parse(
    fs.readFileSync(new URL("../app.json", import.meta.url), "utf8")
  );

  assert.equal(Object.hasOwn(appJson.window, "navigationBarTitleText"), false);
  assert.equal(appJson.window.navigationBarBackgroundColor, "#ffffff");
  assert.equal(appJson.window.navigationBarTextStyle, "black");
  assert.equal(appJson.window.navigationStyle, "custom");
  assert.equal(appJson.window.backgroundColor, "#ffffff");
});

test("Xiaowanzi user question bubbles do not render bottom highlight lines", () => {
  const { wxss } = readPage("xiaowanzi");
  const homePreviewBlock = wxss.match(/^\.xf-xiaowanzi-home-user-preview text \{[^}]*\}/m)?.[0] || "";
  const userBubbleBlock = wxss.match(/^\.xf-xiaowanzi-user-bubble \{[^}]*\}/m)?.[0] || "";

  assert.notEqual(homePreviewBlock, "");
  assert.notEqual(userBubbleBlock, "");
  assert.match(homePreviewBlock, /background: linear-gradient\(108deg, #5368ff 0%, #6847ff 56%, #601bec 100%\);/);
  assert.match(userBubbleBlock, /background: linear-gradient\(108deg, #5368ff 0%, #6847ff 56%, #601bec 100%\);/);
  assert.doesNotMatch(homePreviewBlock, /linear-gradient\(90deg|text-decoration|background-size|background-position/);
  assert.doesNotMatch(userBubbleBlock, /linear-gradient\(90deg|text-decoration|background-size|background-position/);
});

test("Xiaowanzi tab page renders the native chat core with child context and memory contracts", () => {
  const { js, json, wxml, wxss } = readPage("xiaowanzi");
  const appJson = JSON.parse(
    fs.readFileSync(new URL("../app.json", import.meta.url), "utf8")
  );
  const definition = loadPageDefinition("xiaowanzi");
  const originalNavigateTo = global.wx.navigateTo;
  const originalSwitchTab = global.wx.switchTab;
  const originalGetWindowInfo = global.wx.getWindowInfo;
  const originalGetMenuButtonBoundingClientRect = global.wx.getMenuButtonBoundingClientRect;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map([
    ["xf_token", "token-1"],
    ["xf_child_profiles", [
      { id: "child-1", displayName: "小圆子", relation: "女儿", birthDate: "2022-01-02", grade: "小班", city: "上海", region: "静安区", avatar: "/tmp/avatar.png" }
    ]],
    ["xiaowanzi_last_child_id_v1", "child-1"]
  ]);
  const navigations = [];
  const switchCalls = [];
  const tabBarData = {};
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    getTabBar() {
      return {
        setData(payload) {
          Object.assign(tabBarData, payload);
        }
      };
    }
  };

  try {
    global.wx.navigateTo = (options) => {
      navigations.push(options);
    };
    global.wx.switchTab = (options) => {
      switchCalls.push(options);
    };
    global.wx.getWindowInfo = () => ({ windowWidth: 430, statusBarHeight: 47 });
    global.wx.getMenuButtonBoundingClientRect = () => ({ top: 59, left: 314, height: 32 });
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };

    assert.equal(json.navigationStyle, "custom");
    assert.equal(json.navigationBarBackgroundColor, "#f2f1ff");
    assert.equal(json.backgroundColor, "#f2f1ff");
    assert.equal(json.backgroundTextStyle, "dark");
    assert.deepEqual(json.usingComponents || {}, { "phone-login-gate": "../../components/phone-login-gate/index" });
    assert.equal(wxml.includes("<web-view"), false);
    assert.match(wxml, /class="xf-xiaowanzi-chat-list \{\{homeMode \? 'is-home' : 'is-chat'\}\} \{\{attachmentMenuOpen \? 'has-attachment-menu' : ''\}\} \{\{shareSelectionMode \? 'has-share-selection' : ''\}\}"[\s\S]*scroll-y="\{\{true\}\}"[\s\S]*enhanced="\{\{true\}\}"[\s\S]*show-scrollbar="\{\{false\}\}"[\s\S]*bindscroll="handleKnowledgePillScroll"/);
    assert.match(wxml, /scroll-into-view="\{\{scrollIntoView\}\}"/);
    assert.match(wxml, /wx:if="\{\{homeMode\}}" class="xf-xiaowanzi-home"/);
    assert.match(wxml, /class="xf-xiaowanzi-hero-bot" src="\/assets\/wel-avatar\/no-hat\.png"/);
    assert.match(wxml, /class="xf-xiaowanzi-hello"[\s\S]*哈喽/);
    assert.match(wxml, /class="xf-xiaowanzi-spark"><\/text>/);
    assert.doesNotMatch(wxml, /✦/);
    assert.match(wxml, /class="xf-xiaowanzi-hero-title" aria-label="想聊什么，直接问小玩子"[\s\S]*class="xf-xiaowanzi-hero-title-line"[\s\S]*style="animation-delay: 0\.86s;">想<\/text>[\s\S]*style="animation-delay: 1\.16s;">接<\/text>[\s\S]*class="xf-xiaowanzi-hero-title-line"[\s\S]*style="animation-delay: 1\.21s;">问<\/text>[\s\S]*style="animation-delay: 1\.36s;">子<\/text>/);
    assert.doesNotMatch(wxml, /<text>想聊什么，直接问小玩子<\/text>/);
    assert.match(wxml, /id="xiaowanziPromptPanel" class="xf-xiaowanzi-prompt-panel"/);
    assert.match(wxml, /class="xf-xiaowanzi-prompt-heading"[\s\S]*可以这样问/);
    assert.match(wxml, /class="xf-xiaowanzi-prompt-card \{\{item\.compact \? 'is-compact' : ''\}\}"[\s\S]*wx:for="\{\{quickPrompts\}\}"[\s\S]*wx:key="prompt"[\s\S]*data-value="\{\{item\.prompt\}\}"[\s\S]*catchtap="useQuickPrompt"/);
    assert.match(js, /useQuickPrompt\(event\) \{[\s\S]*const prompt = value\.trim\(\);[\s\S]*this\.setData\(\{[\s\S]*inputValue: "",[\s\S]*inputReady: true,[\s\S]*selectedHomePrompt: prompt,[\s\S]*\}, \(\) => \{[\s\S]*this\.handleSend\(\);[\s\S]*\}\);[\s\S]*\}/);
    assert.match(wxml, /class="xf-xiaowanzi-prompt-mark"><\/text>/);
    assert.match(wxml, /class="xf-xiaowanzi-prompt-text">\{\{item\.label\}\}/);
    assert.match(wxml, /class="xf-xiaowanzi-prompt-arrow"><\/text>/);
    assert.doesNotMatch(wxml, /<text class="xf-xiaowanzi-prompt-mark">#/);
    assert.doesNotMatch(wxml, /<text class="xf-xiaowanzi-prompt-arrow">→/);
    assert.match(wxml, /wx:if="\{\{selectedHomePrompt\}\}" class="xf-xiaowanzi-home-user-preview is-selected"[\s\S]*\{\{selectedHomePrompt\}\}/);
    assert.match(wxml, /wx:elif="\{\{homePromptPreview\}\}" class="xf-xiaowanzi-home-user-preview is-reference"[\s\S]*\{\{homePromptPreview\}\}/);
    assert.match(wxml, /wx:if="\{\{homeConversationMessages\.length\}\}" class="xf-xiaowanzi-home-thread"/);
    assert.match(wxml, /wx:for="\{\{homeConversationMessages\}\}"[\s\S]*class="xf-xiaowanzi-home-assistant-wrap \{\{item\.pending \? 'is-thinking' : ''\}\}"/);
    assert.match(wxml, /wx:if="\{\{item\.pending\}\}" class="xf-xiaowanzi-home-thinking"[\s\S]*小玩子思考中/);
    assert.match(wxml, /class="xf-xiaowanzi-thinking-dot is-strong"/);
    assert.match(wxml, /wx:else class="xf-xiaowanzi-home-assistant-card"/);
    assert.match(wxml, /wx:for="\{\{item\.contentParts\}\}" wx:for-item="part"[\s\S]*class="xf-xiaowanzi-message-link"[\s\S]*data-url="\{\{part\.url\}\}"[\s\S]*catchtap="openMessageLink"[\s\S]*class="xf-xiaowanzi-message-link-body"[\s\S]*class="xf-xiaowanzi-message-link-text">\{\{part\.text\}\}[\s\S]*class="xf-xiaowanzi-message-link-arrow">↗/);
    assert.doesNotMatch(wxml, /xf-xiaowanzi-message-link-index|#\{\{partIndex \+ 1\}\}/);
    assert.match(wxml, /data-id="\{\{item\.id\}\}" data-role="\{\{item\.role\}\}" catchtap="handleMessageTap"/);
    assert.match(wxml, /wx:if="\{\{!shareSelectionMode && !sending && item\.shareable\}\}" class="xf-xiaowanzi-card-share is-home \{\{shareRevealMessageId === item\.id \? 'is-visible' : ''\}\}" hover-class="is-pressed"[\s\S]*catchtap="openShareSelectionFromMessage"/);
    assert.doesNotMatch(wxml, /xf-xiaowanzi-featured-prompt|featuredPrompt/);
    assert.match(wxml, /<block wx:else>/);
    assert.match(wxml, /wx:for="\{\{messages\}\}"/);
    assert.doesNotMatch(wxml, /class="xf-xiaowanzi-status"/);
    assert.doesNotMatch(wxml, /class="xf-xiaowanzi-error"/);
    assert.match(wxml, /wx:if="\{\{errorText \|\| actionLabel\}\}" class="xf-xiaowanzi-inline-status"/);
    assert.match(wxml, /\{\{errorText \|\| statusText\}\}/);
    assert.match(wxml, /class="xf-xiaowanzi-inline-action"[\s\S]*catchtap="handleActionTap"/);
    assert.match(wxml, /class="xf-xiaowanzi-chat-list \{\{homeMode \? 'is-home' : 'is-chat'\}\} \{\{attachmentMenuOpen \? 'has-attachment-menu' : ''\}\} \{\{shareSelectionMode \? 'has-share-selection' : ''\}\}"/);
    assert.match(wxml, /class="xf-xiaowanzi-composer \{\{attachmentMenuOpen \? 'is-attach-open' : ''\}\}"/);
    assert.match(wxml, /wx:if="\{\{pendingAttachments\.length\}\}" class="xf-xiaowanzi-attachment-strip"/);
    assert.match(wxml, /wx:for="\{\{pendingAttachments\}\}" wx:key="path" wx:for-item="attachment"/);
    assert.match(wxml, /class="xf-xiaowanzi-attachment-image" src="\{\{attachment\.path\}\}" mode="aspectFill"/);
    assert.match(wxml, /<scroll-view wx:if="\{\{item\.attachments && item\.attachments\.length\}\}" class="xf-xiaowanzi-message-attachments" scroll-x="\{\{true\}\}" enhanced="\{\{true\}\}" show-scrollbar="\{\{false\}\}">/);
    assert.match(wxml, /class="xf-xiaowanzi-message-attachment-row"/);
    assert.match(wxml, /wx:for="\{\{item\.attachments\}\}" wx:for-item="attachment" wx:key="key"/);
    assert.match(wxml, /class="xf-xiaowanzi-message-image" src="\{\{attachment\.path\}\}" mode="aspectFill"/);
    assert.match(wxml, /class="xf-xiaowanzi-attachment-remove" data-index="\{\{index\}\}" catchtap="removePendingAttachment" aria-label="移除附件"/);
    assert.doesNotMatch(wxml, /xf-xiaowanzi-attachment-add|aria-label="继续上传"/);
    assert.match(wxml, /class="xf-xiaowanzi-input-shell[\s\S]*\{\{pendingAttachments\.length \? 'has-attachment-input' : ''\}\}/);
    assert.match(wxml, /placeholder="\{\{pendingAttachments\.length \? '帮我解读下图片内容' : '对话内容已开启隐私保护'\}\}"/);
    assert.doesNotMatch(wxml, /xf-xiaowanzi-bottom-dock/);
    assert.match(wxml, /bindinput="updateInput"/);
    assert.match(wxml, /catchtap="handleSend"/);
    assert.match(wxml, /class="xf-xiaowanzi-native-shell"/);
    assert.match(wxml, /<phone-login-gate[^>]*visible="\{\{false\}\}"[^>]*bind:success="handleXiaowanziLoginSuccess"/);
    assert.match(wxml, /class="xf-xiaowanzi-send[^>]*open-type="\{\{isLoggedIn \? '' : 'getPhoneNumber'\}\}"[^>]*bindgetphonenumber="authorizeXiaowanziSend"/);
    assert.doesNotMatch(wxml, /xf-xiaowanzi-login-panel|进入家长先疯|使用微信身份创建或恢复家长先疯账号/);
    assert.doesNotMatch(js, /\/pages\/login\/index/);
    assert.equal(appJson.pages.includes("pages/login/index"), false);
    assert.equal(appJson.plugins && appJson.plugins.WechatSI, undefined);
    assert.equal(fs.existsSync(new URL("./login/index.wxml", import.meta.url)), false);
    const wxssWithoutRequestedHistoryBold = wxss
      .replace(/\.xf-xiaowanzi-history-new \{[\s\S]*?\n\}/, "")
      .replace(/\.xf-xiaowanzi-history-title \{[\s\S]*?\n\}/, "");
    assert.doesNotMatch(wxssWithoutRequestedHistoryBold, /font-weight:\s*(?:[6-9]\d{2}|1000|bold)\b/);
    assert.match(wxss, /\.xf-xiaowanzi-page,[\s\S]*\.xf-xiaowanzi-page textarea \{[\s\S]*font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;[\s\S]*font-weight: 500;/);
    assert.match(wxss, /\.xf-xiaowanzi-page \{[\s\S]*background:[\s\S]*radial-gradient\(circle at 74% 2%, rgba\(255, 228, 236, 0\.9\) 0, rgba\(255, 228, 236, 0\) 34%\),[\s\S]*radial-gradient\(circle at 16% 10%, rgba\(211, 218, 255, 0\.92\) 0, rgba\(211, 218, 255, 0\) 40%\),[\s\S]*linear-gradient\(180deg, #f2f1ff 0%, #e9edff 100%\);/);
    assert.match(wxml, /<view class="xf-xiaowanzi-topbar" style="height: \{\{topbarHeight\}\}px;">/);
    assert.doesNotMatch(wxml, /xf-xiaowanzi-return-entry|xf-xiaowanzi-return-mark|aria-label="返回上一页"/);
    assert.match(wxml, /class="xf-xiaowanzi-menu-entry"[\s\S]*catchtap="openHistoryDrawer"[\s\S]*aria-label="历史会话"/);
    assert.match(wxml, /class="xf-xiaowanzi-menu-mark" src="\/assets\/xiaowanzi-icons\/menu-dark\.png" mode="aspectFit"/);
    assert.match(wxml, /class="xf-xiaowanzi-top-bot"[\s\S]*top: \{\{shellAvatarTop\}\}px; height: \{\{shellAvatarHeight\}\}px;[\s\S]*src="\{\{topbarAvatarSrc\}\}"[\s\S]*catchtap="startNewConversation"[\s\S]*aria-label="新话题"/);
    assertPngSize("../assets/xiaowanzi-icons/menu-dark.png", 126, 84);
    assertPngSize("../assets/xiaowanzi-icons/voice-dark.png", 154, 130);
    assertPngSize("../assets/xiaowanzi-icons/voice-white.png", 154, 130);
    assertPngSize("../assets/xiaowanzi-icons/wave-white.png", 132, 146);
    assertPngSize("../assets/xiaowanzi-icons/send-white.png", 117, 100);
    assertPngSize("../assets/xiaowanzi-icons/stop-white.png", 66, 66);
    assertPngSize("../assets/xiaowanzi-icons/add-dark.png", 116, 116);
    assertPngSize("../assets/xiaowanzi-icons/close-purple.png", 108, 108);
    assertPngSize("../assets/xiaowanzi-icons/camera-dark.png", 160, 144);
    assertPngSize("../assets/xiaowanzi-icons/image-dark.png", 144, 144);
    assertPngSize("../assets/xiaowanzi-icons/upload-file-dark.png", 128, 160);
    assertAssetUnder("../assets/fonts/material-symbols-rounded.woff2", 512 * 1024);
    assert.match(wxss, /@font-face \{[\s\S]*font-family: "Material Symbols Rounded";[\s\S]*src: url\("\/assets\/fonts\/material-symbols-rounded\.woff2"\) format\("woff2"\);/);
    assertPngSize("../assets/xiaowanzi-icons/share-purple.png", 164, 164);
    assertPngSize("../assets/share/xiaowanzi-nohat-cover.png", 500, 400);
    assertPngPixelWhite("../assets/share/xiaowanzi-nohat-cover.png", 20, 20);
    assertPngPixelWhite("../assets/share/xiaowanzi-nohat-cover.png", 100, 100);
    assertPngPixelWhite("../assets/share/xiaowanzi-nohat-cover.png", 400, 100);
    assertPngPixelWhite("../assets/share/xiaowanzi-nohat-cover.png", 250, 330);
    assertPngPixelNotWhite("../assets/share/xiaowanzi-nohat-cover.png", 250, 120);
    assertSameTextFile("../assets/xiaowanzi-icons/share-wechat-friend.svg", "../../../frontend/public/assets/xiaowanzi-icons/share-wechat-friend.svg");
    assertSameTextFile("../assets/xiaowanzi-icons/share-image-card.svg", "../../../frontend/public/assets/xiaowanzi-icons/share-image-card.svg");
    assertSameTextFile("../assets/xiaowanzi-icons/share-copy-content.svg", "../../../frontend/public/assets/xiaowanzi-icons/share-copy-content.svg");
    assertAssetUnder("../assets/wel-avatar/no-hat.png", 200 * 1024);
    assertAssetUnder("../assets/wel-avatar/img-0640.png", 200 * 1024);
    assertAssetUnder("../assets/wel-avatar/wizard.png", 200 * 1024);
    assertAssetUnder("../assets/wel-avatar/avatar-1.png", 200 * 1024);
    assertAssetUnder("../assets/wel-avatar/avatar-2.png", 200 * 1024);
    assert.match(wxml, /class="xf-xiaowanzi-knowledge-pill \{\{knowledgePillCollapsed \? 'is-collapsed' : ''\}\}"[\s\S]*top: \{\{shellKnowledgeTop\}\}px; right: \{\{shellKnowledgeRight\}\}px; width: \{\{knowledgePillCollapsed \? shellKnowledgeHeight : shellKnowledgeWidth\}\}px; height: \{\{shellKnowledgeHeight\}\}px;[\s\S]*catchtap="openKnowledgeHub"/);
    assert.match(wxml, /class="xf-xiaowanzi-knowledge-logo"[^>]*src="\/assets\/xiaowanzi-icons\/knowledge-round-logo\.png"/);
    assert.match(wxml, /class="xf-xiaowanzi-knowledge-title" src="\/assets\/xiaowanzi-icons\/knowledge-title\.png" mode="aspectFit"/);
    assert.match(wxss, /\.xf-xiaowanzi-menu-entry \{[\s\S]*left: 24rpx;[\s\S]*width: 76rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-top-bot \{[\s\S]*left: 104rpx;[\s\S]*width: 39\.6px;[\s\S]*transform: translate\(-8rpx, -4rpx\);/);
    assert.match(wxss, /\.xf-xiaowanzi-knowledge-pill \{[\s\S]*gap: 3\.5px;[\s\S]*width: 86px;[\s\S]*padding: 0 5px 0 1\.5px;[\s\S]*font-size: 12\.6px;[\s\S]*transition: width 180ms ease, padding 180ms ease, background 180ms ease;/);
    assert.match(wxss, /\.xf-xiaowanzi-knowledge-title \{[\s\S]*width: 43\.2px;[\s\S]*height: 13\.7px;[\s\S]*opacity: 1;/);
    assert.match(wxss, /\.xf-xiaowanzi-knowledge-pill\.is-collapsed \{[\s\S]*width: 34px;[\s\S]*padding: 0;[\s\S]*gap: 0;[\s\S]*aspect-ratio: 1 \/ 1;/);
    assert.match(wxss, /\.xf-xiaowanzi-knowledge-pill\.is-collapsed \.xf-xiaowanzi-knowledge-title \{[\s\S]*width: 0;[\s\S]*opacity: 0;/);
    assertPngSize("../assets/xiaowanzi-icons/knowledge-title.png", 192, 60);
    assert.match(js, /const KNOWLEDGE_PILL_COLLAPSE_SCROLL_TOP = 24;/);
    assert.match(js, /const knowledgeWidth = 86;/);
    assert.match(js, /shellKnowledgeWidth: knowledgeWidth/);
    assert.match(js, /shellKnowledgeRight: Math\.max\(8, Math\.round\(Number\(metrics\.capsuleRight \|\| 96\) \+ 2\)\)/);
    assert.match(js, /sharePreviewTop: Math\.max\(topbarHeight \+ 12, shellControlTop \+ avatarHeight \+ sharePreviewChromeOffset, shellControlTop \+ capsuleHeight \+ 16\)/);
    assert.match(wxss, /\.xf-xiaowanzi-knowledge-logo \{[\s\S]*width: 27\.9px;[\s\S]*height: 27\.9px;[\s\S]*transform: none;/);
    assert.match(wxss, /\.xf-xiaowanzi-knowledge-pill\.is-collapsed \.xf-xiaowanzi-knowledge-logo \{[\s\S]*transform: translateX\(0\);/);
    assertPngSize("../assets/xiaowanzi-icons/knowledge-round-logo.png", 256, 256);
    assertAssetUnder("../assets/menu/mama-hao-zhuan-icon.png", 90 * 1024);
    assertAssetUnder("../assets/menu/welfare-gift-icon.png", 90 * 1024);
    assertAssetUnder("../assets/xiaowanzi-icons/knowledge-round-logo.png", 60 * 1024);
    assertPngSize("../assets/xiaowanzi-icons/share-logo.png", 560, 180);
    assertAssetUnder("../assets/xiaowanzi-icons/share-logo.png", 120 * 1024);
    assert.equal(fs.existsSync(new URL("../assets/xiaowanzi-share-logo.png", import.meta.url)), false);
    assert.doesNotMatch(wxml, /xf-xiaowanzi-top-more|openTopbarMore|shellMoreRight/);
    assert.doesNotMatch(wxml, /class="xf-xiaowanzi-top-more-mark"><\/text>/);
    assert.doesNotMatch(wxml, /☰/);
    assert.match(wxml, /class="xf-xiaowanzi-user-bubble"/);
    assert.match(wxml, /class="xf-xiaowanzi-assistant-panel \{\{item\.pending \? 'is-thinking' : ''\}\}"/);
    assert.match(wxml, /class="xf-xiaowanzi-assistant-panel \{\{item\.pending \? 'is-thinking' : ''\}\}"[\s\S]*wx:if="\{\{item\.pending\}\}" class="xf-xiaowanzi-home-thinking"[\s\S]*小玩子思考中[\s\S]*wx:else class="xf-xiaowanzi-assistant-card"/);
    assert.match(wxml, /class="xf-xiaowanzi-assistant-card"/);
    assert.match(wxml, /wx:if="\{\{!shareSelectionMode && !sending && item\.shareable\}\}" class="xf-xiaowanzi-card-share is-home/);
    assert.match(wxml, /wx:if="\{\{!shareSelectionMode && !sending && item\.shareable\}\}" class="xf-xiaowanzi-card-share \{\{shareRevealMessageId === item\.id \? 'is-visible' : ''\}\}"/);
    assert.match(js, /function buildMessageContentParts\(content\)/);
    assert.match(js, /const SHARE_REVEAL_HIDE_DELAY_MS = 5000;/);
    assert.match(js, /function isShareableAssistantMessageValue\(role, content, pending, error\)/);
    assert.match(js, /shareable: isShareableAssistantMessageValue\(role, content, item && item\.pending, item && item\.error\)/);
    assert.match(js, /contentParts: buildMessageContentParts\(content\)/);
    assert.match(js, /openMessageLink\(event\) \{[\s\S]*copyTextSilently\(url\);[\s\S]*\}/);
    assert.match(wxss, /\.xf-xiaowanzi-message-link \{[\s\S]*display: flex;[\s\S]*align-items: center;[\s\S]*width: 100%;[\s\S]*margin: 2rpx 0 8rpx;[\s\S]*padding: 20rpx 22rpx;[\s\S]*border: 1rpx solid rgba\(115, 83, 224, 0\.24\);[\s\S]*border-radius: 30rpx;[\s\S]*background: linear-gradient\(135deg, rgba\(126, 95, 255, 0\.14\) 0%, rgba\(217, 196, 255, 0\.22\) 100%\);/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-message-link \{[\s\S]*margin: 8rpx 0 10rpx;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-message-link-index/);
    assert.match(wxss, /\.xf-xiaowanzi-message-link-body \{[\s\S]*flex: 1 1 auto;[\s\S]*min-width: 0;/);
    assert.match(wxss, /\.xf-xiaowanzi-message-link-arrow \{[\s\S]*margin-left: 18rpx;[\s\S]*color: #6a42e8;/);
    assert.match(wxml, /id="xiaowanziChildHint" class="xf-xiaowanzi-child-hint"[\s\S]*\{\{childHintText\}\}/);
    assert.match(wxml, /class="xf-xiaowanzi-child-link"[\s\S]*\{\{childActionLabel\}\}/);
    assert.match(wxml, /class="xf-xiaowanzi-child-link"[\s\S]*catchtap="openNativeChildPicker"/);
    assert.doesNotMatch(wxml, /xf-xiaowanzi-child-add-card|添加孩子档案/);
    assert.match(wxml, /<\/view>\s*<view id="xiaowanziChildHint" class="xf-xiaowanzi-child-hint">[\s\S]*\{\{childHintText\}\}[\s\S]*catchtap="openNativeChildPicker"[\s\S]*<\/view>\s*<\/view>\s*<block wx:else>/);
    {
      const promptPanelStart = wxml.indexOf('id="xiaowanziPromptPanel" class="xf-xiaowanzi-prompt-panel"');
      const homeChildHintStart = wxml.indexOf('id="xiaowanziChildHint"', promptPanelStart);
      const homeChildHintViewStart = wxml.lastIndexOf("<view", homeChildHintStart);
      assert.ok(promptPanelStart >= 0);
      assert.ok(homeChildHintStart > promptPanelStart);
      assert.ok(homeChildHintViewStart > promptPanelStart);
      assert.match(wxml.slice(promptPanelStart, homeChildHintViewStart), /<\/view>\s*$/);
    }
    assert.match(wxml, /<block wx:else>[\s\S]*wx:for="\{\{messages\}\}"[\s\S]*<\/view>\s*<view id="xiaowanziChildHint" class="xf-xiaowanzi-child-hint">[\s\S]*\{\{childHintText\}\}[\s\S]*catchtap="openNativeChildPicker"[\s\S]*<\/view>\s*<\/block>/);
    assert.doesNotMatch(wxml, /class="xf-xiaowanzi-composer[\s\S]*?<view class="xf-xiaowanzi-child-hint"/);
    assert.match(wxss, /\.xf-xiaowanzi-input-row \{[\s\S]*transform: translateY\(-25px\);/);
    assert.match(wxml, /class="xf-xiaowanzi-input-shell \{\{inputReady \? 'can-send' : ''\}\} \{\{inputValue \? 'has-typed-input' : ''\}\} \{\{pendingAttachments\.length \? 'has-attachment-input' : ''\}\} \{\{inputFocused \? 'is-input-focused' : ''\}\} \{\{!inputValue && !inputFocused \? 'is-placeholder' : ''\}\} \{\{sendPressing \? 'send-pressing' : ''\}\} \{\{sending \? 'is-sending' : ''\}\}"/);
    assert.match(wxml, /class="xf-xiaowanzi-voice" hover-class="is-pressed" catchtap="toggleVoiceInput" aria-label="语音输入"/);
    assert.doesNotMatch(wxml, /bindtouchstart="startVoicePress"|bindtouchend="endVoicePress"/);
    assert.match(wxml, /class="xf-xiaowanzi-voice-icon" src="\/assets\/xiaowanzi-icons\/voice-dark\.png" mode="aspectFit"/);
    assert.doesNotMatch(wxml, /class="xf-xiaowanzi-voice-person"|class="xf-xiaowanzi-voice-wave/);
    assert.match(wxml, /placeholder="\{\{pendingAttachments\.length \? '帮我解读下图片内容' : '对话内容已开启隐私保护'\}\}"[\s\S]*bindfocus="handleInputFocus"[\s\S]*bindblur="handleInputBlur"/);
    assert.match(wxml, /class="xf-xiaowanzi-send \{\{sending \? 'is-stop' : 'is-send'\}\} \{\{sendPressing \? 'is-pressing' : ''\}\}"[^>]*hover-class="is-pressed"[^>]*disabled="\{\{!sending && !inputReady\}\}"[^>]*bindtouchstart="startSendPress"[^>]*catchtap="handleSend"/);
    assert.match(wxml, /class="xf-xiaowanzi-send-mark" src="\{\{sending \? '\/assets\/xiaowanzi-icons\/stop-white\.png' : '\/assets\/xiaowanzi-icons\/send-white\.png'\}\}" mode="aspectFit"/);
    assert.match(wxml, /class="xf-xiaowanzi-plus \{\{attachmentMenuOpen \? 'is-open' : ''\}\}"[\s\S]*catchtap="toggleAttachmentMenu"[\s\S]*aria-label="\{\{attachmentMenuOpen \? '收起更多' : '更多'\}\}"/);
    assert.match(wxml, /class="xf-xiaowanzi-plus-mark" src="\{\{attachmentMenuOpen \? '\/assets\/xiaowanzi-icons\/close-purple\.png' : '\/assets\/xiaowanzi-icons\/add-dark\.png'\}\}" mode="aspectFit"/);
    assert.doesNotMatch(wxml, /\{\{attachmentMenuOpen \? '×' : '\+'\}\}/);
    assert.match(wxml, /class="xf-xiaowanzi-attach-menu"/);
    assert.match(wxml, /data-type="camera"[\s\S]*拍照/);
    assert.match(wxml, /data-type="image"[\s\S]*上传图片/);
    assert.match(wxml, /data-type="file"[\s\S]*上传文件/);
    assert.match(wxml, /catchtap="openNativeChildPicker"/);
    assert.doesNotMatch(wxml, /xf-xiaowanzi-share-entry|xf-xiaowanzi-logo/);
    assert.match(wxml, /wx:if="\{\{!shareSelectionMode && !sending && item\.shareable\}\}" class="xf-xiaowanzi-card-share \{\{shareRevealMessageId === item\.id \? 'is-visible' : ''\}\}" hover-class="is-pressed"[\s\S]*data-id="\{\{item\.id\}\}"[\s\S]*catchtap="openShareSelectionFromMessage"/);
    assert.match(wxml, /class="xf-xiaowanzi-share-icon" src="\/assets\/xiaowanzi-icons\/share-purple\.png" mode="aspectFit"/);
    assert.doesNotMatch(wxml, /xf-xiaowanzi-share-glyph|xf-xiaowanzi-share-dot|⌯|>share<\/text>|\uE80D/);
    assert.match(wxml, /class="xf-xiaowanzi-share-check \{\{selectedMessageMap\[item\.id\] \? 'is-checked' : ''\}\}"/);
    assert.match(wxml, /aria-label="\{\{selectedMessageMap\[item\.id\] \? '取消选择对话' : '选择对话'\}\}"/);
    assert.match(wxml, /class="xf-xiaowanzi-share-check-mark"/);
    assert.doesNotMatch(wxml, /✓/);
    assert.match(wxml, /class="xf-xiaowanzi-share-select-backdrop"[\s\S]*catchtap="exitShareSelection"/);
    assert.match(wxml, /class="xf-xiaowanzi-history-mask"[\s\S]*catchtap="closeHistoryDrawer"/);
    assert.match(wxml, /class="xf-xiaowanzi-history-drawer" style="padding-top: calc\(\{\{topbarHeight\}\}px \+ 40rpx\);"/);
    assert.match(wxml, /class="xf-xiaowanzi-history-new"[\s\S]*catchtap="startNewConversation"[\s\S]*class="xf-xiaowanzi-history-new-mark"[\s\S]*新对话/);
    assert.doesNotMatch(wxml, /<text>＋<\/text>/);
    assert.match(wxml, /class="xf-xiaowanzi-history-title"[\s\S]*历史会话/);
    assert.match(wxml, /class="xf-xiaowanzi-history-list" scroll-y enhanced enable-flex show-scrollbar="false"/);
    assert.match(wxml, /<view wx:for="\{\{historyCards\}\}" wx:key="id" class="xf-xiaowanzi-history-card \{\{historyDeleteCardId === item\.id \? 'is-delete-visible' : ''\}\}" data-id="\{\{item\.id\}\}" catchtap="openHistoryCard" catchlongpress="showHistoryDeleteButton">/);
    assert.doesNotMatch(wxml, /<button wx:for="\{\{historyCards\}}"[\s\S]*class="xf-xiaowanzi-history-card"/);
    assert.match(wxml, /class="xf-xiaowanzi-history-card-title">\{\{item\.title\}\}<\/text>/);
    assert.match(wxml, /class="xf-xiaowanzi-history-card-time">\{\{item\.sub\}\}<\/text>/);
    assert.match(wxml, /wx:if="\{\{item\.childTag\}\}" class="xf-xiaowanzi-history-card-child">\{\{item\.childTag\}\}<\/text>/);
    assert.match(wxml, /wx:if="\{\{historyDeleteCardId === item\.id\}\}" class="xf-xiaowanzi-history-delete" data-id="\{\{item\.id\}\}" catchtap="deleteHistoryCard" aria-label="删除历史会话">×<\/button>/);
    assert.match(wxml, /wx:else class="xf-xiaowanzi-history-empty"[\s\S]*class="xf-xiaowanzi-history-empty-title"[\s\S]*暂无历史会话[\s\S]*class="xf-xiaowanzi-history-empty-sub"[\s\S]*提问后会自动保存在这里/);
    assert.match(wxml, /class="xf-xiaowanzi-history-exit"[\s\S]*catchtap="returnToExternalPage"[\s\S]*aria-label="退出小玩子"[\s\S]*class="xf-xiaowanzi-history-exit-mark" src="\/assets\/xiaowanzi-icons\/logout-white\.png" mode="aspectFit"/);
    assert.doesNotMatch(wxml, /class="xf-xiaowanzi-history-exit-mark[^"]*material-symbols-rounded|>\{\{historyExitIcon\}\}<\/text>|>logout<\/text>|&#xe9ba;/);
    assert.doesNotMatch(js, /MATERIAL_SYMBOL_LOGOUT|historyExitIcon/);
    assert.match(js, /historyDeleteCardId: ""/);
    assert.match(js, /showHistoryDeleteButton\(event\)/);
    assert.match(js, /deleteHistoryCard\(event\)/);
    assert.match(js, /removeNativeSession\(card\.sessionId\)/);
    assert.match(js, /removeCachedHistory\(activeChild && activeChild\.id\)/);
    assert.doesNotMatch(wxml, /↪/);
    assert.match(wxml, /class="xf-xiaowanzi-share-select-panel"/);
    assert.match(wxml, /class="xf-xiaowanzi-share-select-head"[\s\S]*选择对话[\s\S]*取消/);
    assert.match(wxml, /将\{\{shareRoundCount\}\}轮对话分享至/);
    assert.match(wxml, /class="xf-xiaowanzi-share-select-channels"[\s\S]*class="xf-xiaowanzi-share-channel-row"/);
    assert.match(wxml, /class="xf-xiaowanzi-share-channel" hover-class="is-pressed" open-type="share" disabled="\{\{!selectedMessageIds\.length \|\| selectedSharePreparing \|\| !selectedConversationShareId\}\}"[\s\S]*class="xf-xiaowanzi-share-channel-icon is-wechat"[\s\S]*src="\/assets\/xiaowanzi-icons\/share-wechat-friend\.svg"[\s\S]*\{\{selectedSharePreparing \? '准备中' : '微信好友'\}\}/);
    assert.match(wxml, /wx:if="\{\{selectedShareError\}\}" class="xf-xiaowanzi-share-error"/);
    assert.match(wxml, /hover-class="is-pressed" catchtap="generateShareImage" disabled="\{\{!selectedMessageIds\.length \|\| shareImageGenerating\}\}"[\s\S]*class="xf-xiaowanzi-share-channel-icon is-image"[\s\S]*src="\/assets\/xiaowanzi-icons\/share-image-card\.svg"[\s\S]*\{\{shareImageGenerating \? '生成中' : '生成图片'\}\}/);
    assert.match(wxml, /catchtap="copySelectedMessages"[\s\S]*class="xf-xiaowanzi-share-channel-icon is-copy"[\s\S]*src="\/assets\/xiaowanzi-icons\/share-copy-content\.svg"[\s\S]*复制内容/);
    assert.doesNotMatch(wxml, /forum|add_photo_alternate|content_copy/);
    assert.match(wxml, /class="xf-xiaowanzi-share-privacy"[\s\S]*⚙️ 分享内容已开启隐私保护/);
    assert.doesNotMatch(wxml, /xf-xiaowanzi-share-privacy-icon/);
    assert.match(wxml, /wx:if="\{\{shareImagePreviewOpen\}\}" class="xf-xiaowanzi-share-preview-mask" catchtap="closeShareImagePreview"/);
    assert.match(wxml, /wx:if="\{\{shareImagePreviewOpen\}\}" class="xf-xiaowanzi-share-preview-panel" style="top: \{\{sharePreviewTop\}\}px;"/);
    assert.match(wxml, /class="xf-xiaowanzi-share-preview-title"[\s\S]*分享卡片预览/);
    assert.match(wxml, /class="xf-xiaowanzi-share-preview-scroll" scroll-y enhanced enable-flex/);
    assert.match(wxml, /class="xf-xiaowanzi-share-preview-image" src="\{\{shareImagePath\}\}" mode="widthFix"/);
    assert.match(wxml, /class="xf-xiaowanzi-share-preview-guide"[\s\S]*长按预览图片，或点击下方按钮保存/);
    assert.match(wxml, /class="xf-xiaowanzi-share-preview-save"[\s\S]*catchtap="saveGeneratedShareImage"[\s\S]*下载图片/);
    assert.match(wxml, /<canvas wx:if="\{\{shareCanvasMounted\}\}" canvas-id="xiaowanziShareCanvas" class="xf-xiaowanzi-share-canvas" width="750" height="\{\{shareCanvasHeight\}\}" style="width: 750px; height: \{\{shareCanvasHeight\}\}px;"><\/canvas>/);
    assert.match(wxml, /class="xf-xiaowanzi-child-picker-sheet"[\s\S]*选择咨询人[\s\S]*catchtap="openChildCreateFromPicker"[\s\S]*新增孩子/);
    assert.match(wxml, /wx:if="\{\{settingsPanelOpen\}\}" class="xf-xiaowanzi-archive-scrim"/);
    assert.match(wxml, /wx:if="\{\{settingsPanelOpen\}\}" class="xf-xiaowanzi-archive-panel"/);
    assert.doesNotMatch(wxml, /xf-xiaowanzi-welfare-entry|xf-xiaowanzi-welfare-icon/);
    assert.doesNotMatch(wxml, /catchtap="openNativeSharePanel"/);
    assert.doesNotMatch(wxml, /xf-xiaowanzi-share-panel|xf-xiaowanzi-share-scrim/);
    assert.match(wxml, /class="xf-xiaowanzi-child-boundary"/);
    assert.equal(wxml.includes("<native-page-nav"), false);
    assert.match(wxml, /<import src="..\/..\/templates\/settings-profile-views\.wxml" \/>/);
    assert.match(wxml, /class="xf-xiaowanzi-archive-scrim"/);
    assert.match(wxml, /class="xf-xiaowanzi-archive-panel"/);
    assert.match(wxml, /is="xfSettingsArchivePanel"/);
    assert.match(wxml, /open-type="share"/);
    assert.equal(wxml.includes("xf-xiaowanzi-bridge"), false);
    assert.match(wxss, /radial-gradient\(circle at 74% 2%, rgba\(255, 228, 236, 0\.9\) 0, rgba\(255, 228, 236, 0\) 34%\)/);
    assert.doesNotMatch(wxss, /xf-xiaowanzi-return-entry|xf-xiaowanzi-return-mark/);
    assert.match(wxss, /\.xf-xiaowanzi-menu-entry \{[\s\S]*left: 24rpx;[\s\S]*display: flex;[\s\S]*justify-content: center;[\s\S]*width: 76rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-menu-mark \{[\s\S]*width: 32rpx;[\s\S]*height: 32rpx;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-menu-mark::before|\.xf-xiaowanzi-menu-mark::after/);
    assert.match(wxss, /\.xf-xiaowanzi-top-bot \{[\s\S]*left: 104rpx;[\s\S]*width: 39\.6px;[\s\S]*transform: translate\(-8rpx, -4rpx\);[\s\S]*pointer-events: auto;/);
    assert.match(wxss, /\.xf-xiaowanzi-knowledge-pill \{[\s\S]*gap: 3\.5px;[\s\S]*width: 86px;[\s\S]*padding: 0 5px 0 1\.5px;/);
    assert.match(wxss, /\.xf-xiaowanzi-knowledge-pill \{[\s\S]*border: 1px solid rgba\(124, 77, 255, 0\.22\);[\s\S]*background: rgba\(91, 72, 255, 0\.06\);[\s\S]*box-shadow: none;/);
    assert.match(wxss, /\.xf-xiaowanzi-knowledge-logo \{[\s\S]*filter: drop-shadow/);
    assert.doesNotMatch(wxml, /open-type="getPhoneNumber"/);
    assert.doesNotMatch(wxss, /xf-xiaowanzi-login-panel|xf-xiaowanzi-login-button/);
    assert.doesNotMatch(wxss, /xf-xiaowanzi-top-more/);
    assert.match(wxss, /\.xf-xiaowanzi-chat-list \{[\s\S]*bottom: 84px;[\s\S]*padding: 0 28rpx 12px;[\s\S]*background: transparent;/);
    assert.match(wxss, /\.xf-xiaowanzi-chat-list\.is-home \{/);
    assert.match(wxss, /\.xf-xiaowanzi-chat-list\.is-home \{[\s\S]*bottom: 84px;[\s\S]*padding: 0 28rpx 12px;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-chat-list(?:\.is-home)? \{[^}]*padding: 0 28rpx calc\(104px \+ env\(safe-area-inset-bottom\)\);/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-chat-list(?:\.is-home)? \{[^}]*(?:bottom|padding):[^;}]*env\(safe-area-inset-bottom\)/);
    assert.match(wxss, /\.xf-xiaowanzi-chat-list\.has-attachment-menu \{[\s\S]*bottom: calc\(170px \+ env\(safe-area-inset-bottom\)\);/);
    assert.match(wxss, /\.xf-xiaowanzi-chat-list\.has-share-selection \{[\s\S]*z-index: 85;/);
    assert.match(wxss, /\.xf-xiaowanzi-share-select-backdrop \{[\s\S]*z-index: 80;/);
    assert.match(wxss, /\.xf-xiaowanzi-share-select-panel \{[\s\S]*z-index: 95;/);
    assert.match(wxss, /\.xf-xiaowanzi-home \{[\s\S]*padding: calc\(44rpx \+ 5px\) 0 40rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-chat-list\.has-attachment-menu \.xf-xiaowanzi-home \{[\s\S]*padding-top: 60rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-chat-list\.has-attachment-menu \.xf-xiaowanzi-hero \{[\s\S]*min-height: 132px;[\s\S]*padding-bottom: 12rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-hero \{[\s\S]*min-height: 132px;[\s\S]*padding: 0 8px 8rpx 4px;/);
    assert.match(wxss, /\.xf-xiaowanzi-hero-bot \{[\s\S]*width: 132px;[\s\S]*height: 132px;[\s\S]*margin-right: 20px;/);
    assert.match(wxss, /\.xf-xiaowanzi-hello-row \{[\s\S]*gap: 8px;[\s\S]*margin-bottom: 8px;/);
    assert.match(wxss, /\.xf-xiaowanzi-hello \{[\s\S]*font-size: 24px;[\s\S]*animation: xfXiaowanziHomeHelloIn 0\.38s 0\.58s cubic-bezier\(0\.2, 0\.9, 0\.22, 1\) both;/);
    assert.match(wxss, /\.xf-xiaowanzi-spark \{[\s\S]*position: relative;[\s\S]*width: 28px;[\s\S]*height: 28px;[\s\S]*xfXiaowanziHomeSparkPop 0\.48s 0\.74s cubic-bezier\(0\.18, 0\.92, 0\.2, 1\) both,[\s\S]*xfXiaowanziHomeSparkBreathe 1\.8s 1\.35s ease-in-out infinite;/);
    assert.match(wxss, /\.xf-xiaowanzi-spark::before,[\s\S]*\.xf-xiaowanzi-spark::after \{[\s\S]*background: currentColor;[\s\S]*rotate\(45deg\);/);
    assert.match(wxss, /\.xf-xiaowanzi-spark::after \{[\s\S]*rotate\(-45deg\);/);
    assert.match(wxss, /\.xf-xiaowanzi-hello \{[\s\S]*font-size: 24px;[\s\S]*font-weight: 500;[\s\S]*animation: xfXiaowanziHomeHelloIn 0\.38s 0\.58s cubic-bezier\(0\.2, 0\.9, 0\.22, 1\) both;/);
    assert.match(wxss, /\.xf-xiaowanzi-hero-title \{[\s\S]*flex-direction: column;[\s\S]*font-size: 27px;[\s\S]*font-weight: 500;/);
    assert.match(wxss, /\.xf-xiaowanzi-hero-title-line \{[\s\S]*display: flex;[\s\S]*flex-wrap: nowrap;[\s\S]*min-height: 1\.22em;[\s\S]*white-space: nowrap;/);
    assert.match(wxss, /\.xf-xiaowanzi-hero-title-char \{[\s\S]*display: inline-block;[\s\S]*flex: 0 0 auto;[\s\S]*opacity: 0;[\s\S]*animation: xfXiaowanziHomeTitleCharIn 0\.34s cubic-bezier\(0\.2, 0\.9, 0\.22, 1\) both;/);
    assert.match(wxss, /@keyframes xfXiaowanziHomeTitleCharIn \{[\s\S]*opacity: 0;[\s\S]*translateY\(8px\);[\s\S]*opacity: 1;[\s\S]*transform: none;/);
    assert.doesNotMatch(wxss, /xfXiaowanziHomeTitleReveal|clip-path: inset\(0 100% 0 0\)/);
    assert.match(wxss, /@keyframes xfXiaowanziHomeSparkBreathe \{[\s\S]*transform: scale\(1\);[\s\S]*transform: scale\(1\.08\);/);
    assert.match(wxss, /\.xf-xiaowanzi-prompt-panel \{[\s\S]*margin: 0 0 18px;[\s\S]*padding: 11px 10px;[\s\S]*border-radius: 30px;/);
    assert.match(wxss, /\.xf-xiaowanzi-prompt-heading \{[\s\S]*gap: 10px;[\s\S]*margin-bottom: 16px;[\s\S]*font-size: 21px;[\s\S]*font-weight: 500;/);
    assert.match(wxss, /\.xf-xiaowanzi-prompt-bar \{[\s\S]*width: 7px;[\s\S]*height: 28px;/);
    assert.match(wxss, /\.xf-xiaowanzi-prompt-card \{[\s\S]*gap: 12px;[\s\S]*min-height: 68px;[\s\S]*margin: 0 0 14px;[\s\S]*padding: 0 15px;[\s\S]*border-radius: 22px;[\s\S]*background: rgba\(255, 255, 255, 0\.94\);/);
    assert.match(wxss, /\.xf-xiaowanzi-prompt-mark \{[\s\S]*display: flex;[\s\S]*width: 38px;[\s\S]*height: 38px;[\s\S]*font-size: 24px;[\s\S]*font-weight: 500;[\s\S]*line-height: 1;/);
    assert.match(wxss, /\.xf-xiaowanzi-prompt-mark::before \{[\s\S]*content: "#";[\s\S]*transform: translateY\(-1px\);/);
    assert.match(wxss, /\.xf-xiaowanzi-prompt-mark::after \{[\s\S]*content: "";[\s\S]*display: none;/);
    assert.match(wxss, /\.xf-xiaowanzi-prompt-text \{[\s\S]*font-size: 16px;[\s\S]*font-weight: 500;[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/);
    assert.match(wxss, /\.xf-xiaowanzi-prompt-card\.is-compact \.xf-xiaowanzi-prompt-text \{[\s\S]*font-size: 16px;/);
    assert.match(wxss, /\.xf-xiaowanzi-prompt-arrow \{[\s\S]*width: 26px;[\s\S]*height: 48px;[\s\S]*color: #b5b9ca;/);
    assert.match(wxss, /\.xf-xiaowanzi-prompt-arrow::before \{[\s\S]*background: currentColor;/);
    assert.match(wxss, /\.xf-xiaowanzi-prompt-arrow::after \{[\s\S]*width: 12px;[\s\S]*height: 12px;[\s\S]*border-top: 2px solid currentColor;[\s\S]*border-right: 2px solid currentColor;[\s\S]*transform: rotate\(45deg\);/);
    assert.match(wxss, /\.xf-xiaowanzi-home-user-preview \{[\s\S]*justify-content: flex-end;/);
    assert.match(wxss, /\.xf-xiaowanzi-prompt-card \+ \.xf-xiaowanzi-home-user-preview \{[\s\S]*margin-top: 42rpx;/);
    const homePreviewTextStyle = wxss.match(/\.xf-xiaowanzi-home-user-preview text \{[\s\S]*?\n\}/)?.[0] || "";
    assert.notEqual(homePreviewTextStyle, "");
    assert.doesNotMatch(homePreviewTextStyle, /min-width:\s*404rpx;|min-width:/);
    assert.match(homePreviewTextStyle, /max-width: 600rpx;[\s\S]*padding: 28rpx 42rpx 30rpx;[\s\S]*border-radius: 34rpx 8rpx 34rpx 34rpx;[\s\S]*background: linear-gradient\(108deg, #5368ff 0%, #6847ff 56%, #601bec 100%\);[\s\S]*font-size: 30rpx;[\s\S]*font-weight: 500;[\s\S]*line-height: 1\.42;[\s\S]*text-align: left;[\s\S]*box-shadow: 0 18rpx 42rpx rgba\(96, 27, 236, 0\.22\);/);
    assert.match(wxss, /\.xf-xiaowanzi-home-thread \{[\s\S]*gap: 24rpx;[\s\S]*margin-top: 24rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-prompt-card \+ \.xf-xiaowanzi-home-thread \{[\s\S]*margin-top: 42rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-home-assistant-wrap\.is-thinking \{[\s\S]*padding-bottom: 0;/);
    assert.match(wxss, /\.xf-xiaowanzi-home-thinking \{[\s\S]*display: inline-flex;[\s\S]*min-width: 226rpx;[\s\S]*min-height: 86rpx;[\s\S]*padding: 28rpx 32rpx;[\s\S]*border: 2rpx solid rgba\(122, 103, 238, 0\.1\);[\s\S]*border-radius: 40rpx;[\s\S]*background: rgba\(255, 255, 255, 0\.9\);[\s\S]*color: #a78bfa;[\s\S]*box-shadow: 0 16rpx 36rpx rgba\(72, 75, 132, 0\.06\);/);
    assert.match(wxss, /\.xf-xiaowanzi-thinking-dot \{[\s\S]*width: 16rpx;[\s\S]*height: 16rpx;[\s\S]*background: currentColor;[\s\S]*animation: xfXiaowanziThinkingDot 1\.4s ease-in-out infinite;/);
    assert.match(wxss, /\.xf-xiaowanzi-thinking-dot:nth-child\(2\) \{[\s\S]*animation-delay: 0\.2s;/);
    assert.match(wxss, /\.xf-xiaowanzi-thinking-dot\.is-strong \{[\s\S]*animation-delay: 0\.4s;/);
    assert.match(wxss, /\.xf-xiaowanzi-thinking-label \{[\s\S]*margin-left: 12rpx;[\s\S]*animation: xfXiaowanziThinkingLabel 2s ease-in-out infinite;/);
    assert.match(wxss, /@keyframes xfXiaowanziThinkingDot \{[\s\S]*opacity: 0\.34;[\s\S]*transform: scale\(0\.72\);[\s\S]*opacity: 1;[\s\S]*transform: scale\(1\);/);
    assert.match(wxss, /@keyframes xfXiaowanziThinkingLabel \{[\s\S]*opacity: 0\.72;[\s\S]*opacity: 1;/);
    assert.match(wxss, /\.xf-xiaowanzi-home-assistant-card \{[\s\S]*border: 1rpx solid rgba\(122, 103, 238, 0\.1\);[\s\S]*background: rgba\(255, 255, 255, 0\.92\);[\s\S]*font-weight: 500;[\s\S]*line-height: 1\.82;[\s\S]*box-shadow:[\s\S]*0 10rpx 24rpx rgba\(72, 75, 132, 0\.06\),[\s\S]*inset 0 1rpx 0 rgba\(255, 255, 255, 0\.92\);/);
    assert.doesNotMatch(wxss, /xf-xiaowanzi-featured-prompt/);
    assert.doesNotMatch(wxss, /xf-xiaowanzi-welfare-entry|xf-xiaowanzi-share-entry|xf-xiaowanzi-logo/);
    assert.match(wxss, /\.xf-xiaowanzi-user-bubble \{[\s\S]*border-radius: 34rpx 8rpx 34rpx 34rpx;[\s\S]*background: linear-gradient\(108deg, #5368ff 0%, #6847ff 56%, #601bec 100%\);[\s\S]*font-weight: 500;[\s\S]*box-shadow: 0 14rpx 32rpx rgba\(96, 27, 236, 0\.2\);/);
    assert.match(wxss, /\.xf-xiaowanzi-message-attachments \{[\s\S]*display: block;[\s\S]*max-width: 386rpx;[\s\S]*white-space: nowrap;/);
    assert.match(wxss, /\.xf-xiaowanzi-message-attachment-row \{[\s\S]*display: inline-flex;[\s\S]*gap: 12rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-message-image \{[\s\S]*flex: 0 0 auto;[\s\S]*width: 72px;[\s\S]*height: 72px;[\s\S]*border-radius: 22rpx;/);
    const homeUserBubbleStyle = wxss.match(/\.xf-xiaowanzi-home-message \.xf-xiaowanzi-user-bubble \{[\s\S]*?\n\}/)?.[0] || "";
    assert.notEqual(homeUserBubbleStyle, "");
    assert.doesNotMatch(homeUserBubbleStyle, /min-width:\s*404rpx;|min-width:/);
    assert.match(homeUserBubbleStyle, /max-width: 600rpx;[\s\S]*padding: 28rpx 42rpx 30rpx;[\s\S]*font-size: 30rpx;[\s\S]*font-weight: 500;[\s\S]*line-height: 1\.42;[\s\S]*text-align: left;[\s\S]*box-shadow: 0 18rpx 42rpx rgba\(96, 27, 236, 0\.22\);/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-(?:home-user-preview text|user-bubble) \{[\s\S]*linear-gradient\(90deg, rgba\(255, 255, 255, 0\.22\)/);
    assert.match(wxss, /\.xf-xiaowanzi-home-assistant-wrap \{[\s\S]*flex: 1 1 auto;[\s\S]*min-width: 0;[\s\S]*padding-bottom: 0;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-home-assistant-wrap \{[\s\S]*margin-right: 96rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-assistant-panel \{[\s\S]*flex: 1 1 auto;[\s\S]*min-width: 0;[\s\S]*padding: 0;[\s\S]*border: 0;[\s\S]*background: transparent;[\s\S]*box-shadow: none;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-assistant-panel \{[\s\S]*margin-right: 96rpx;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-assistant-panel \{[\s\S]*linear-gradient\(180deg, rgba\(255, 255, 255, 0\.62\)/);
    assert.match(wxss, /\.xf-xiaowanzi-assistant-card \{[\s\S]*border: 1rpx solid rgba\(122, 103, 238, 0\.1\);[\s\S]*background: rgba\(255, 255, 255, 0\.92\);[\s\S]*color: #11143b;[\s\S]*font-weight: 500;[\s\S]*box-shadow:[\s\S]*0 10rpx 24rpx rgba\(72, 75, 132, 0\.06\),[\s\S]*inset 0 1rpx 0 rgba\(255, 255, 255, 0\.92\);/);
    assert.match(wxss, /\.xf-xiaowanzi-card-share \{[\s\S]*position: static;[\s\S]*align-self: flex-start;[\s\S]*width: 64rpx;[\s\S]*height: 64rpx;[\s\S]*margin: 4rpx 0 0;[\s\S]*background: #f3f0ff;[\s\S]*color: #7c34e8;[\s\S]*opacity: 0;[\s\S]*pointer-events: none;[\s\S]*transform: scale\(0\.88\);/);
    assert.match(wxss, /\.xf-xiaowanzi-card-share\.is-visible,[\s\S]*\.xf-xiaowanzi-card-share\.is-pressed \{[\s\S]*opacity: 1;[\s\S]*pointer-events: auto;[\s\S]*transform: scale\(1\);/);
    assert.match(wxss, /\.xf-xiaowanzi-card-share\.is-pressed \{[\s\S]*background: #7c34e8;[\s\S]*color: #ffffff;[\s\S]*transform: scale\(0\.96\);/);
    assert.match(wxss, /\.xf-xiaowanzi-share-icon \{[\s\S]*width: 32rpx;[\s\S]*height: 32rpx;/);
    assert.doesNotMatch(wxss, /xf-xiaowanzi-share-glyph|xf-xiaowanzi-share-dot/);
    assert.match(wxss, /\.xf-xiaowanzi-share-check-mark \{[\s\S]*border-left: 4rpx solid currentColor;[\s\S]*transform: translateY\(-2rpx\) rotate\(-45deg\);/);
    assert.match(wxss, /\.xf-xiaowanzi-inline-status \{[\s\S]*margin: 0 auto 34px;[\s\S]*background: rgba\(255, 255, 255, 0\.56\);/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-inline-status \{[\s\S]*margin: 0 auto 10rpx;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-error \{/);
    assert.match(wxss, /\.xf-xiaowanzi-child-hint \{[\s\S]*position: static;[\s\S]*justify-content: center;[\s\S]*gap: 8px;[\s\S]*width: 100%;[\s\S]*margin: 0 0 18px;[\s\S]*padding: 0 2px;[\s\S]*color: #7d86a5;[\s\S]*font-size: 13px;[\s\S]*font-weight: 400;/);
    assert.match(wxss, /\.xf-xiaowanzi-child-hint-line \{[\s\S]*display: flex;[\s\S]*justify-content: center;/);
    assert.match(wxss, /\.xf-xiaowanzi-child-link \{[\s\S]*min-height: 32px;[\s\S]*padding: 0 2px;[\s\S]*color: #5c47ff;[\s\S]*font-size: 13px;[\s\S]*font-weight: 400;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-child-add-card \{/);
    assert.match(wxss, /\.xf-xiaowanzi-child-picker-sheet \{[\s\S]*bottom: 0;[\s\S]*background: #fbf9ff;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-child-hint \{[^}]*position:\s*(fixed|sticky|absolute)/);
    const composerBlock = wxss.match(/\.xf-xiaowanzi-composer \{[^}]*\}/)?.[0] || "";
    assert.match(wxml, /<view class="xf-xiaowanzi-composer \{\{attachmentMenuOpen \? 'is-attach-open' : ''\}\}">/);
    assert.doesNotMatch(wxml, /xf-xiaowanzi-composer-feather/);
    assert.match(wxss, /\.xf-xiaowanzi-composer \{[\s\S]*z-index: 31;[\s\S]*padding: 0 30px 0;[\s\S]*background: transparent;[\s\S]*isolation: isolate;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-composer-feather|top: -48px|rgba\(238, 241, 255, 0\.36\)/);
    assert.doesNotMatch(wxss, /rgba\(232, 236, 255, 0\.82\)/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-composer::before|top: -142px/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-composer \{[^}]*env\(safe-area-inset-bottom\)/);
    assert.equal((composerBlock.match(/background:/g) || []).length, 1);
    assert.match(composerBlock, /background: transparent;/);
    assert.doesNotMatch(wxss, /xf-xiaowanzi-bottom-dock/);
    assert.match(wxss, /\.xf-xiaowanzi-composer\.is-attach-open \{[\s\S]*padding-bottom: calc\(112px \+ env\(safe-area-inset-bottom\)\);/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-bottom-dock\.menu-open/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-composer(?:::after|\.is-attach-open::before|\.is-attach-open::after)/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-composer\.is-attach-open \.xf-xiaowanzi-child-hint/);
    assert.match(wxss, /\.xf-xiaowanzi-chat-list\.has-attachment-menu \.xf-xiaowanzi-home-user-preview \{[\s\S]*display: none;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-chat-list\.has-attachment-menu \.xf-xiaowanzi-child-hint \{[\s\S]*display: none;/);
    assert.match(wxss, /\.xf-xiaowanzi-chat-list\.has-attachment-menu \.xf-xiaowanzi-prompt-panel \{[\s\S]*margin-bottom: 72rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-input-row \{[\s\S]*position: relative;[\s\S]*z-index: 2;/);
    assert.match(wxss, /\.xf-xiaowanzi-input-row \{[\s\S]*gap: 10px;[\s\S]*transform: translateY\(-25px\);/);
    assert.match(wxss, /\.xf-xiaowanzi-input-shell \{[\s\S]*height: 58px;[\s\S]*padding: 0 6px 0 7px;[\s\S]*border-radius: 999rpx;[\s\S]*background: rgba\(255, 255, 255, 0\.96\);[\s\S]*box-shadow:[\s\S]*0 10px 26px rgba\(70, 73, 132, 0\.12\),[\s\S]*0 18px 38px rgba\(122, 144, 255, 0\.08\),[\s\S]*inset 0 1px 0 rgba\(255, 255, 255, 0\.9\);/);
    assert.match(wxss, /\.xf-xiaowanzi-input-shell\.voice-active \{[\s\S]*transform: scale\(1\.012\);/);
    assert.match(wxss, /\.xf-xiaowanzi-input-shell\.has-typed-input \{[\s\S]*box-shadow:[\s\S]*0 12px 29px rgba\(70, 73, 132, 0\.16\),[\s\S]*0 24px 48px rgba\(91, 72, 255, 0\.1\),[\s\S]*inset 0 1px 0 rgba\(255, 255, 255, 0\.92\);/);
    assert.match(wxss, /\.xf-xiaowanzi-input-shell\.is-placeholder \.xf-xiaowanzi-input \{[\s\S]*font-size: 13px;/);
    assert.match(wxss, /\.xf-xiaowanzi-input-shell\.send-pressing \{[\s\S]*transform: scale\(0\.992\);/);
    assert.match(wxss, /\.xf-xiaowanzi-voice \{[\s\S]*width: 44px;[\s\S]*height: 44px;[\s\S]*margin-right: 4px;/);
    assert.match(wxss, /\.xf-xiaowanzi-voice\.is-listening \{[\s\S]*background: linear-gradient\(135deg, #5b48ff 0%, #7a45f4 100%\);[\s\S]*animation: xfXiaowanziVoicePulse 0\.8s ease-in-out infinite;/);
    assert.doesNotMatch(wxss, /src: url\("data:font\/woff2;base64,|\.xf-xiaowanzi-ms/);
    assert.match(wxss, /\.xf-xiaowanzi-voice-icon \{[\s\S]*width: 25px;[\s\S]*height: 25px;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-voice-person|\.xf-xiaowanzi-voice-wave/);
    assert.match(wxss, /\.xf-xiaowanzi-input \{[\s\S]*height: 58px;[\s\S]*font-size: 15px;[\s\S]*line-height: 58px;[\s\S]*text-align: center;/);
    assert.match(wxss, /\.xf-xiaowanzi-input-shell\.has-typed-input \.xf-xiaowanzi-input,[\s\S]*\.xf-xiaowanzi-input-shell\.is-input-focused \.xf-xiaowanzi-input \{[\s\S]*text-align: left;/);
    assert.match(wxss, /\.xf-xiaowanzi-input-placeholder \{[\s\S]*font-size: 13px;[\s\S]*font-weight: 400;/);
    assert.match(wxss, /\.xf-xiaowanzi-send \{[\s\S]*width: 46px;[\s\S]*height: 46px;[\s\S]*background: linear-gradient\(135deg, #bca6fb 0%, #aa92f5 100%\);/);
    assert.match(wxss, /\.xf-xiaowanzi-input-shell\.has-typed-input \.xf-xiaowanzi-send,[\s\S]*\.xf-xiaowanzi-send\.is-stop \{[\s\S]*background: linear-gradient\(135deg, #5b48ff 0%, #7a45f4 100%\);/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-input-shell\.can-send \.xf-xiaowanzi-send[\s\S]*background: linear-gradient\(135deg, #5b48ff/);
    assert.match(wxss, /\.xf-xiaowanzi-send\.is-pressed,[\s\S]*\.xf-xiaowanzi-send\.is-pressing \{[\s\S]*transform: scale\(0\.94\);/);
    assert.match(wxss, /\.xf-xiaowanzi-send\[disabled\] \{[\s\S]*opacity: 1;/);
    assert.match(wxss, /\.xf-xiaowanzi-send-mark \{[\s\S]*width: 22px;[\s\S]*height: 22px;/);
    assert.match(wxss, /\.xf-xiaowanzi-send\.is-stop \.xf-xiaowanzi-send-mark \{[\s\S]*width: 18px;[\s\S]*height: 18px;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-send\.is-send \.xf-xiaowanzi-send-mark::before|\.xf-xiaowanzi-send\.is-send \.xf-xiaowanzi-send-mark::after/);
    const stopSendMarkRule = wxss.match(/\.xf-xiaowanzi-send\.is-stop \.xf-xiaowanzi-send-mark \{[^}]*\}/)?.[0] || "";
    assert.doesNotMatch(stopSendMarkRule, /background: currentColor;/);
    assert.match(wxss, /\.xf-xiaowanzi-plus \{[\s\S]*width: 52px;[\s\S]*height: 52px;[\s\S]*border-radius: 50%;/);
    assert.match(wxss, /\.xf-xiaowanzi-plus\.is-open \{[\s\S]*color: #5b48ff;/);
    assert.match(wxss, /\.xf-xiaowanzi-plus-mark \{[\s\S]*width: 17\.6px;[\s\S]*height: 17\.6px;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-plus-mark::before|\.xf-xiaowanzi-plus-mark::after|\.xf-xiaowanzi-plus\.is-open \.xf-xiaowanzi-plus-mark \{[\s\S]*rotate/);
    assert.match(wxss, /\.xf-xiaowanzi-composer\.is-attach-open \{[\s\S]*z-index: 33;[\s\S]*padding-bottom: calc\(112px \+ env\(safe-area-inset-bottom\)\);/);
    assert.match(wxss, /\.xf-xiaowanzi-attach-menu \{[\s\S]*position: fixed;[\s\S]*left: 30px;[\s\S]*right: 30px;[\s\S]*bottom: calc\(24px \+ env\(safe-area-inset-bottom\)\);[\s\S]*z-index: 34;[\s\S]*grid-template-columns: repeat\(3, 1fr\);[\s\S]*gap: 18px;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-attach-menu \{[\s\S]*bottom: calc\(118px \+ env\(safe-area-inset-bottom\)\);/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-attach-menu::before|\.xf-xiaowanzi-attach-menu::after/);
    assert.match(wxss, /\.xf-xiaowanzi-attach-action \{[\s\S]*gap: 8px;[\s\S]*font-size: 13px;/);
    assert.match(wxml, /data-type="camera"[\s\S]*class="xf-xiaowanzi-attach-icon" src="\/assets\/xiaowanzi-icons\/camera-dark\.png" mode="aspectFit"[\s\S]*拍照/);
    assert.match(wxml, /data-type="image"[\s\S]*class="xf-xiaowanzi-attach-icon" src="\/assets\/xiaowanzi-icons\/image-dark\.png" mode="aspectFit"[\s\S]*上传图片/);
    assert.match(wxml, /data-type="file"[\s\S]*class="xf-xiaowanzi-attach-icon" src="\/assets\/xiaowanzi-icons\/upload-file-dark\.png" mode="aspectFit"[\s\S]*上传文件/);
    assert.doesNotMatch(wxml, /xf-xiaowanzi-attach-icon is-(camera|image|file)/);
    assert.match(wxss, /\.xf-xiaowanzi-attach-icon \{[\s\S]*box-sizing: border-box;[\s\S]*width: 62px;[\s\S]*height: 62px;[\s\S]*padding: 15px;[\s\S]*border-radius: 22px;[\s\S]*background: rgba\(255, 255, 255, 0\.92\);[\s\S]*box-shadow: 0 10px 24px rgba\(70, 73, 132, 0\.1\);/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-attach-icon::before|\.xf-xiaowanzi-attach-icon::after|\.xf-xiaowanzi-attach-icon\.is-(camera|image|file)/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-attach-menu \{[^}]*position: relative;/);
    assert.match(wxss, /\.xf-xiaowanzi-history-mask \{[\s\S]*top: 0;[\s\S]*left: 0;[\s\S]*right: 0;[\s\S]*bottom: 0;[\s\S]*background: rgba\(15, 23, 42, 0\.46\);[\s\S]*backdrop-filter: blur\(6rpx\);[\s\S]*animation: xfXiaowanziHistoryMaskIn 0\.2s/);
    assert.match(wxss, /\.xf-xiaowanzi-history-drawer \{[\s\S]*width: 84vw;[\s\S]*max-width: 720rpx;[\s\S]*height: 100%;[\s\S]*padding: 40rpx 36rpx 0;[\s\S]*background: #f7f7fb;[\s\S]*overflow: hidden;[\s\S]*animation: xfXiaowanziHistoryDrawerIn 0\.2s/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-history-drawer \{[\s\S]*max\(48rpx, calc\(36rpx \+ env\(safe-area-inset-bottom\)\)\)/);
    assert.match(wxss, /\.xf-xiaowanzi-history-head \{[\s\S]*height: 92rpx;[\s\S]*margin-bottom: 36rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-history-new \{[\s\S]*max-width: 560rpx;[\s\S]*height: 84rpx;[\s\S]*background: #ededf0;[\s\S]*font-size: 30rpx;[\s\S]*font-weight: 700;/);
    assert.match(wxss, /\.xf-xiaowanzi-history-new-mark \{[\s\S]*width: 44rpx;[\s\S]*height: 44rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-history-new-mark::before,[\s\S]*\.xf-xiaowanzi-history-new-mark::after \{[\s\S]*width: 28rpx;[\s\S]*height: 3rpx;[\s\S]*background: currentColor;/);
    assert.match(wxss, /\.xf-xiaowanzi-history-title \{[\s\S]*font-size: 44rpx;[\s\S]*font-weight: 700;/);
    assert.match(wxss, /\.xf-xiaowanzi-history-list \{[\s\S]*display: flex;[\s\S]*flex-direction: column;[\s\S]*gap: 0;[\s\S]*padding-bottom: 0;/);
    assert.doesNotMatch(wxss.match(/\.xf-xiaowanzi-history-list \{[^}]*\}/)?.[0] || "", /calc\(126rpx \+ env\(safe-area-inset-bottom\)\)|env\(safe-area-inset-bottom\)/);
    assert.match(wxss, /\.xf-xiaowanzi-history-card \{[\s\S]*position: relative;[\s\S]*flex-direction: column;[\s\S]*flex-shrink: 0;[\s\S]*align-items: flex-start;[\s\S]*height: 80px;[\s\S]*margin-bottom: 10px;[\s\S]*padding: 10px 14px;[\s\S]*border-radius: 16px;[\s\S]*overflow: hidden;/);
    assert.match(wxss, /\.xf-xiaowanzi-history-delete \{[\s\S]*width: 44rpx;[\s\S]*height: 44rpx;[\s\S]*border-radius: 999rpx;[\s\S]*background: #f3edff;[\s\S]*color: #5e17eb;[\s\S]*font-size: 30rpx;[\s\S]*font-weight: 400;[\s\S]*line-height: 1;/);
    assert.match(wxss, /\.xf-xiaowanzi-history-delete::after \{[\s\S]*border: 0;/);
    assert.match(wxss, /\.xf-xiaowanzi-history-card:last-child \{[\s\S]*margin-bottom: 0;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-history-card \{[^}]*margin-bottom: 20rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-history-card-title \{[\s\S]*display: block;[\s\S]*width: 100%;[\s\S]*font-size: 14px;[\s\S]*line-height: 20px;[\s\S]*overflow: hidden;[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;[\s\S]*word-break: normal;/);
    assert.match(wxss, /\.xf-xiaowanzi-history-card-time \{[\s\S]*margin-top: 3px;[\s\S]*color: #9eb0cf;[\s\S]*font-size: 12px;[\s\S]*line-height: 14px;/);
    assert.match(wxss, /\.xf-xiaowanzi-history-card-child \{[\s\S]*margin-top: 4px;[\s\S]*color: #5c47ff;[\s\S]*font-size: 13px;[\s\S]*line-height: 16px;/);
    assert.match(wxml, /<view wx:for="\{\{historyCards\}\}"[\s\S]*class="xf-xiaowanzi-history-card[\s\S]*class="xf-xiaowanzi-history-card-title">\{\{item\.title\}\}<\/text>[\s\S]*class="xf-xiaowanzi-history-card-time">\{\{item\.sub\}\}<\/text>[\s\S]*wx:if="\{\{item\.childTag\}\}" class="xf-xiaowanzi-history-card-child">\{\{item\.childTag\}\}<\/text>[\s\S]*class="xf-xiaowanzi-history-delete"[\s\S]*<\/view>/);
    assert.match(wxss, /\.xf-xiaowanzi-history-empty \{[\s\S]*align-items: center;[\s\S]*min-height: 0;[\s\S]*padding: 48rpx 16rpx;[\s\S]*border-radius: 32rpx;[\s\S]*background: #ffffff;[\s\S]*text-align: center;/);
    assert.match(wxss, /\.xf-xiaowanzi-history-empty-title \{[\s\S]*font-size: 28rpx;[\s\S]*font-weight: 400;/);
    assert.match(wxss, /\.xf-xiaowanzi-history-empty-sub \{[\s\S]*color: #94a3b8;[\s\S]*font-size: 24rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-history-exit \{[\s\S]*right: 36rpx;[\s\S]*bottom: calc\(44rpx \+ env\(safe-area-inset-bottom\)\);[\s\S]*width: 88rpx;[\s\S]*height: 88rpx;[\s\S]*background: #601bec;[\s\S]*box-shadow: 0 28rpx 60rpx rgba\(96, 27, 236, 0\.28\);/);
    assert.match(wxss, /\.xf-xiaowanzi-history-exit-mark \{[\s\S]*display: block;[\s\S]*width: 24px;[\s\S]*height: 24px;/);
    const historyExitMarkBlock = wxss.match(/\.xf-xiaowanzi-history-exit-mark \{[^}]*\}/)?.[0] || "";
    assert.doesNotMatch(historyExitMarkBlock, /font-family: "Material Symbols Rounded"/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-history-exit-mark::before|\.xf-xiaowanzi-history-exit-mark::after/);
    assert.match(wxss, /\.xf-xiaowanzi-share-select-backdrop \{[\s\S]*background: transparent;[\s\S]*pointer-events: auto;/);
    assert.match(wxss, /\.xf-xiaowanzi-share-select-panel \{[\s\S]*max-height: 55vh;[\s\S]*padding: 32rpx 40rpx calc\(32rpx \+ env\(safe-area-inset-bottom\)\);[\s\S]*border-radius: 48rpx 48rpx 0 0;[\s\S]*animation: xfXiaowanziShareSlideUp 0\.25s ease both;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-share-select-panel \{[\s\S]*min-height: calc\(734rpx/);
    assert.match(wxss, /\.xf-xiaowanzi-share-select-head \{[\s\S]*margin-bottom: 28rpx;[\s\S]*font-size: 34rpx;[\s\S]*font-weight: 400;/);
    assert.match(wxss, /\.xf-xiaowanzi-share-count \{[\s\S]*color: #6b7280;[\s\S]*font-size: 26rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-share-select-channels \{[\s\S]*flex-direction: column;[\s\S]*gap: 24rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-share-channel-row \{[\s\S]*display: flex;[\s\S]*gap: 12px;[\s\S]*overflow-x: auto;[\s\S]*padding-bottom: 4px;/);
    assert.match(wxss, /\.xf-xiaowanzi-share-channel \{[\s\S]*min-width: 90px;[\s\S]*gap: 10px;[\s\S]*padding: 16px 12px;[\s\S]*border-radius: 16px;[\s\S]*background: transparent;[\s\S]*font-size: 12px;/);
    assert.match(wxss, /\.xf-xiaowanzi-share-channel\.is-pressed \{[\s\S]*background: #f5f3ff;[\s\S]*transform: translateY\(-2px\);/);
    assert.match(wxss, /\.xf-xiaowanzi-share-privacy \{[\s\S]*display: block;[\s\S]*margin-top: 16rpx;[\s\S]*font-size: 22rpx;/);
    assert.doesNotMatch(wxss, /xf-xiaowanzi-share-privacy-icon/);
    assert.match(wxss, /\.xf-xiaowanzi-share-channel-icon \{[\s\S]*width: 64px;[\s\S]*height: 64px;[\s\S]*background: linear-gradient\(180deg, #fbf9ff 0%, #f0eaff 100%\);[\s\S]*box-shadow: 0 3px 8px rgba\(124, 52, 232, 0\.08\);/);
    assert.match(wxss, /\.xf-xiaowanzi-share-channel-icon-img \{[\s\S]*width: 30px;[\s\S]*height: 30px;/);
    assert.match(wxss, /\.xf-xiaowanzi-share-channel\.is-pressed \.xf-xiaowanzi-share-channel-icon \{[\s\S]*box-shadow: 0 5px 12px rgba\(124, 52, 232, 0\.12\);[\s\S]*transform: scale\(0\.98\);/);
    assert.doesNotMatch(wxss.match(/\.xf-xiaowanzi-share-channel-icon \{[^}]*\}/)?.[0] || "", /font-family|font-variation-settings/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-share-channel-icon\.is-(?:wechat|image|copy)::(?:before|after)/);
    assert.match(wxss, /@keyframes xfXiaowanziShareSlideUp \{[\s\S]*transform: translateY\(100%\);[\s\S]*transform: translateY\(0\);/);
    assert.match(wxss, /\.xf-xiaowanzi-share-canvas \{[\s\S]*left: -9999px;[\s\S]*opacity: 0;[\s\S]*pointer-events: none;/);
    assert.doesNotMatch(wxss, /\.xf-xiaowanzi-share-canvas \{[\s\S]*height: 1200px;/);
    assert.match(wxss, /\.xf-xiaowanzi-share-check \{[\s\S]*width: 44rpx;[\s\S]*height: 44rpx;[\s\S]*border: 4rpx solid #d1d5db;/);
    assert.match(wxss, /\.xf-xiaowanzi-message\.is-user \.xf-xiaowanzi-share-check,[\s\S]*\.xf-xiaowanzi-home-message\.is-user \.xf-xiaowanzi-share-check \{[\s\S]*top: 16rpx;[\s\S]*right: 16rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-message\.is-assistant \.xf-xiaowanzi-share-check,[\s\S]*\.xf-xiaowanzi-home-message\.is-assistant \.xf-xiaowanzi-share-check \{[\s\S]*top: 16rpx;[\s\S]*right: 16rpx;/);
    assert.match(wxss, /\.xf-xiaowanzi-home-message\.is-selecting\.is-selected \.xf-xiaowanzi-home-assistant-card \{[\s\S]*border-color: #7c34e8;[\s\S]*box-shadow:[\s\S]*0 0 0 4rpx rgba\(124, 52, 232, 0\.08\),[\s\S]*0 14rpx 30rpx rgba\(72, 75, 132, 0\.08\);/);
    assert.match(wxss, /\.xf-xiaowanzi-message\.is-selecting\.is-selected \.xf-xiaowanzi-assistant-card \{[\s\S]*border-color: #7c34e8;[\s\S]*box-shadow:[\s\S]*0 0 0 4rpx rgba\(124, 52, 232, 0\.08\),[\s\S]*0 14rpx 30rpx rgba\(72, 75, 132, 0\.08\);/);
    assert.match(js, /setSelectedTab\(this, 2, \{ hidden: true \}\)/);
    assert.match(js, /getNativeTopbarMetrics/);
    assert.match(js, /const \{ copyTextSilently \} = require\("\.\.\/\.\.\/utils\/clipboard"\)/);
    assert.match(js, /function buildNativeShellData\(\)/);
    assert.match(js, /const knowledgeHeight = 34;/);
    assert.match(js, /const knowledgeWidth = 86;/);
    assert.match(js, /const statusBarHeight = Math\.max\(0, Math\.round\(Number\(metrics\.statusBarHeight \|\| 0\)\)\);/);
    assert.match(js, /const shellSafeTop = statusBarHeight > 0 \? statusBarHeight \+ 8 : 0;/);
    assert.match(js, /const shellControlTop = Math\.max\(0, searchButtonTop, shellSafeTop\);/);
    assert.match(js, /const shellKnowledgeTop = Math\.max\(shellSafeTop, Math\.round\(shellControlTop \+ \(capsuleHeight - knowledgeHeight\) \/ 2\)\);/);
    assert.match(js, /shellKnowledgeHeight: knowledgeHeight/);
    assert.match(js, /shellKnowledgeWidth: knowledgeWidth/);
    assert.match(js, /shellKnowledgeRight: Math\.max\(8, Math\.round\(Number\(metrics\.capsuleRight \|\| 96\) \+ 2\)\)/);
    assert.match(js, /sharePreviewTop: Math\.max\(topbarHeight \+ 12, shellControlTop \+ avatarHeight \+ sharePreviewChromeOffset, shellControlTop \+ capsuleHeight \+ 16\)/);
    assert.doesNotMatch(js, /shellKnowledgeLeft/);
    assert.match(js, /const searchButtonTop = Math\.round\(Number\(metrics\.searchButtonTop \|\| 0\)\);/);
    assert.match(js, /const avatarHeight = 40;/);
    assert.match(js, /const avatarVisualBottomOffset = 3;/);
    assert.match(js, /const shellChromeBottomPadding = 2;/);
    assert.match(js, /const sharePreviewChromeOffset = 20;/);
    assert.match(js, /const shellAvatarTop = Math\.max\(0, shellKnowledgeTop \+ knowledgeHeight - avatarHeight \+ avatarVisualBottomOffset\);/);
    assert.match(js, /shellAvatarTop \+ avatarHeight \+ shellChromeBottomPadding/);
    assert.doesNotMatch(js.match(/const topbarHeight = Math\.max\([\s\S]*?\n  \);/)?.[0] || "", /metrics\.topbarHeight/);
    assert.match(js, /shellAvatarHeight: avatarHeight/);
    assert.doesNotMatch(js, /shellMoreRight/);
    assert.match(js, /const LEGACY_AVATAR_INDEX_KEY = "wel_avatar_index"/);
    assert.match(js, /const LEGACY_AVATAR_CLICK_COUNT_KEY = "wel_avatar_click_count"/);
    assert.match(js, /const XIAOWANZI_AVATAR_IMAGE = "\/assets\/wel-avatar\/no-hat\.png"/);
    assert.match(js, /const XIAOWANZI_TOPBAR_AVATARS = \[[\s\S]*XIAOWANZI_AVATAR_IMAGE[\s\S]*"\/assets\/wel-avatar\/img-0640\.png"[\s\S]*"\/assets\/wel-avatar\/wizard\.png"[\s\S]*"\/assets\/wel-avatar\/avatar-1\.png"[\s\S]*"\/assets\/wel-avatar\/avatar-2\.png"[\s\S]*\]/);
    assert.doesNotMatch(js, /"\/assets\/xiaowanzi-topbar\.png"/);
    assert.match(js, /function advanceTopbarAvatarState\(state\)/);
    assert.match(js, /openKnowledgeHub\(\) \{[\s\S]*wx\.navigateTo\(\{ url: "\/pages\/experts\/index\?from=xiaowanzi" \}\);[\s\S]*\}/);
    assert.doesNotMatch(js, /openTopbarMore\(\)/);
    assert.match(js, /function buildActiveChildSummary\(\)/);
    assert.match(js, /homeMode: true/);
    assert.match(js, /childHintText: `已关联 \$\{activeChild\.displayName\} 档案，可获得更贴合的建议`/);
    assert.match(js, /const HOME_PROMPT_CACHE_KEY = "xiaowanzi_topic_prompt_cache_v2"/);
    assert.match(js, /const HOME_PROMPT_COMPACT_LENGTH = 14/);
    assert.match(js, /"孩子玩电脑游戏的引导与游戏选择？"/);
    assert.match(js, /"窝沟封闭黄金年龄？"/);
    assert.match(js, /"双语民办幼儿园回家还要加餐么？"/);
    assert.match(js, /const HOME_PROMPT_PREVIEW = ""/);
    assert.doesNotMatch(js, /FEATURED_PROMPT|featuredPrompt/);
    assert.match(js, /function normalizeHomePromptItem\(rawPrompt\)/);
    assert.match(js, /function topicPromptFromItem\(item\)/);
    assert.match(js, /function buildHomePromptState\(items\)/);
    assert.match(js, /request\(\{ url: getHomeTopicRequestUrl\(\) \}\)/);
    assert.match(js, /return `\/api\/topic-hub\?\$\{params\.join\("&"\)\}`/);
    assert.match(js, /inputReady: false/);
    assert.match(js, /inputFocused: false/);
    assert.match(js, /selectedHomePrompt: ""/);
    assert.match(js, /homePromptPreview: HOME_PROMPT_PREVIEW/);
    assert.match(js, /homeConversationMessages: \[\]/);
    assert.match(js, /sendPressing: false/);
    assert.match(js, /historyDrawerOpen: false/);
    assert.match(js, /attachmentMenuOpen: false/);
    assert.match(js, /shareSelectionMode: false/);
    assert.match(js, /voiceListening: false/);
    assert.match(js, /function hasComposerContent\(data\)/);
    assert.match(js, /function buildComposerContent\(text, attachmentContextText\)/);
    assert.match(js, /function getRequestMessage\(error, fallback\) \{[\s\S]*\^request:fail[\s\S]*return fallback \|\| "网络连接失败，请稍后重试。";/);
    assert.match(js, /function buildAttachmentState\(type, file, recognition\)/);
    assert.match(js, /function normalizeSpeechText\(result\)/);
    assert.match(js, /function mergeSpeechInput\(currentValue, recognizedText\)/);
    assert.match(js, /toggleVoiceInput\(\) \{[\s\S]*this\.showToast\("语音输入正在开发中"\);[\s\S]*\}/);
    assert.match(js, /startVoicePress\(\) \{[\s\S]*this\.toggleVoiceInput\(\);[\s\S]*\}/);
    assert.match(js, /endVoicePress\(\) \{[\s\S]*this\.setData\(\{ voiceListening: false, voiceHolding: false \}\);[\s\S]*\}/);
    assert.doesNotMatch(js, /requirePlugin\("WechatSI"\)|getRecordRecognitionManager|语音转文字插件未启用/);
    assert.match(js, /applyVoiceRecognizedText\(result, finalResult\) \{[\s\S]*inputValue = mergeSpeechInput\(baseInput, recognizedText\);[\s\S]*inputReady: hasComposerContent/);
    assert.match(js, /updateInput\(event\) \{[\s\S]*const selectedHomePrompt = this\.data\.selectedHomePrompt \? inputValue\.trim\(\) : "";[\s\S]*selectedHomePrompt,[\s\S]*sendPressing: false,[\s\S]*voiceListening: false,[\s\S]*voiceHolding: false[\s\S]*\}/);
    assert.match(js, /handleInputFocus\(\) \{[\s\S]*this\.setData\(\{ inputFocused: true \}\);[\s\S]*\}/);
    assert.match(js, /handleInputBlur\(\) \{[\s\S]*this\.setData\(\{ inputFocused: false \}\);[\s\S]*\}/);
    assert.match(js, /useQuickPrompt\(event\) \{[\s\S]*const prompt = value\.trim\(\);[\s\S]*if \(!prompt \|\| this\.data\.sending\) return;[\s\S]*this\.setData\(\{ inputValue: "", inputReady: true, selectedHomePrompt: prompt, sendPressing: false, attachmentMenuOpen: false, voiceListening: false, voiceHolding: false, errorText: "", actionLabel: "", actionType: "", scrollIntoView: "xiaowanziChildHint" \}, \(\) => \{[\s\S]*this\.handleSend\(\);[\s\S]*\}\);[\s\S]*\}/);
    assert.match(js, /const visibleContent = String\(this\.data\.inputValue \|\| this\.data\.selectedHomePrompt \|\| ""\)\.trim\(\);/);
    assert.match(js, /const pendingAttachments = normalizePendingAttachments\(this\.data\.pendingAttachments\);/);
    assert.match(js, /const hasPendingAttachments = pendingAttachments\.length > 0;/);
    assert.match(js, /const visibleMessageContent = visibleContent \|\| \(hasPendingAttachments \? "帮我解读下图片内容" : attachmentPreviewText \|\| "已添加附件"\);/);
    assert.match(js, /const attachmentContextPromise = hasPendingAttachments[\s\S]*recognizePendingAttachments\(pendingAttachments\)[\s\S]*: Promise\.resolve\(attachmentContextText\);/);
    assert.match(js, /const content = buildComposerContent\(visibleContent \|\| \(hasPendingAttachments \? "帮我解读下图片内容" : ""\), resolvedAttachmentContextText\);/);
    assert.match(js, /const keepHomeConversation = Boolean\(this\.data\.homeMode\);/);
    assert.match(js, /homeConversationMessages: keepHomeConversation \? buildHomeConversationMessages\(nextMessages\) : \[\]/);
    assert.match(js, /homeMode: keepHomeConversation/);
    assert.match(js, /startSendPress\(\) \{[\s\S]*if \(!this\.data\.sending && !this\.data\.inputReady\) return;[\s\S]*sendPressing: true/);
    assert.match(js, /endSendPress\(\) \{[\s\S]*sendPressing: false/);
    assert.match(js, /if \(this\.data\.sending\) \{[\s\S]*this\.stopNativeResponse\(\);[\s\S]*return;/);
    assert.match(js, /pendingMessageId: pendingMessage\.id/);
    assert.match(js, /if \(this\.data\.pendingMessageId !== pendingMessage\.id\) return;/);
    assert.match(js, /stopNativeResponse\(\)/);
    assert.match(js, /function buildHistoryCards\(messages, childName\)/);
    assert.match(js, /openHistoryDrawer\(\)/);
    assert.match(js, /startNewConversation\(\)/);
    assert.match(js, /toggleAttachmentMenu\(\) \{[\s\S]*const attachmentMenuOpen = !this\.data\.attachmentMenuOpen;[\s\S]*this\.attachmentMenuOpenedAt = attachmentMenuOpen \? Date\.now\(\) : 0;[\s\S]*voiceListening: false,[\s\S]*voiceHolding: false,[\s\S]*scrollIntoView: this\.data\.scrollIntoView/);
    assert.match(js, /function buildPendingAttachment\(type, file, dataUrl\)/);
    assert.match(js, /pendingAttachments: \[\]/);
    assert.match(js, /chooseAttachment\(event\)[\s\S]*chooseNativeAttachment\(type\)[\s\S]*readAttachmentDataUrl\(file, type\)[\s\S]*buildPendingAttachment\(type, file, dataUrl\)[\s\S]*pendingAttachments: nextPendingAttachments/);
    assert.doesNotMatch(js, /this\.showToast\("图片已上传，发送后解析"\)/);
    assert.match(js, /removePendingAttachment\(event\) \{[\s\S]*const index = Number\(event[\s\S]*pendingAttachments: nextPendingAttachments,[\s\S]*attachmentPreviewText: buildPendingAttachmentPreviewText\(nextPendingAttachments\)/);
    assert.match(js, /const SHARE_REVEAL_HIDE_DELAY_MS = 5000/);
    assert.match(js, /shareRevealMessageId: ""/);
    assert.match(js, /handleMessageTap\(event\) \{[\s\S]*if \(!this\.data\.shareSelectionMode\) \{[\s\S]*dataset\.role === "assistant"[\s\S]*this\.revealShareButton\(String\(dataset\.id \|\| ""\)\);[\s\S]*return;[\s\S]*\}[\s\S]*this\.toggleShareMessage\(event\);/);
    assert.match(js, /function currentShareMessages\(data\) \{[\s\S]*data\.homeMode[\s\S]*data\.homeConversationMessages[\s\S]*return data\.homeConversationMessages;[\s\S]*return data && Array\.isArray\(data\.messages\) \? data\.messages : \[\];[\s\S]*\}/);
    assert.match(js, /revealShareButton\(id\) \{[\s\S]*if \(this\.data\.sending\) return;[\s\S]*const shareable = message && message\.shareable !== undefined[\s\S]*if \(!message \|\| !shareable\) return;[\s\S]*this\.setData\(\{ shareRevealMessageId: id \}\);[\s\S]*setTimeout\(\(\) => \{[\s\S]*shareRevealMessageId: ""/);
    assert.match(js, /openShareSelectionFromMessage\(event\)/);
    assert.match(js, /copySelectedMessages\(\)/);
    assert.match(js, /const SHARE_CARD_LOGO_IMAGE = "\/assets\/xiaowanzi-icons\/share-logo\.png"/);
    assert.match(js, /const SHARE_CARD_QR_FILE_PREFIX = "xiaowanzi-conversation-qrcode-transparent-v2"/);
    assert.match(js, /const SHARE_CARD_QR_CACHE_VERSION = "transparent-v2"/);
    assert.doesNotMatch(js, /SHARE_CARD_QR_IMAGE/);
    assert.match(js, /function drawShareCanvasPageBackground\(ctx, canvasHeight\)/);
    assert.match(js, /function drawShareCanvasTopbar\(ctx\)/);
    assert.match(js, /ctx\.drawImage\(SHARE_CARD_LOGO_IMAGE, topbar\.logoX, topbar\.logoY, topbar\.logoWidth, topbar\.logoHeight\)/);
    assert.doesNotMatch(js, /ctx\.fillText\("09:26"/);
    assert.doesNotMatch(js, /topbar\.capsuleX/);
    assert.doesNotMatch(js, /rgba\(255, 228, 236, 0\.5\)|rgba\(211, 218, 255, 0\.5\)/);
    assert.doesNotMatch(js, /ctx\.fillText\("先疯智库"/);
    assert.doesNotMatch(js, /ctx\.drawImage\(XIAOWANZI_AVATAR_IMAGE, topbar\.avatarX/);
    assert.match(js, /const shareCanvasHeight = measureShareImageCanvasHeight\(ctx, messages\);/);
    assert.match(js, /createShareCanvasLinearGradient\(ctx, 0, 0, 0, canvasHeight/);
    assert.match(js, /const SHARE_CANVAS_CONTENT_LEFT = 28;/);
    assert.match(js, /const contentLeft = SHARE_CANVAS_CHAT_STYLE\.contentLeft;/);
    assert.match(js, /const userMaxWidth = style\.user\.maxWidth;/);
    assert.match(js, /const assistantMaxWidth = contentWidth;/);
    assert.match(js, /\? Math\.max\(120, Math\.min\(Math\.max\(measuredWidth, measuredReferenceWidth\) \+ bubblePadX \* 2, maxBubbleWidth\)\)[\s\S]*: maxBubbleWidth;/);
    assert.match(js, /contentLeft \+ contentWidth - message\.bubbleWidth/);
    assert.match(js, /style\.user\.gradientStart/);
    assert.match(js, /: style\.assistant\.background\);/);
    assert.match(js, /function getCenteredUserBubbleTextOffset\(message\)/);
    assert.match(js, /const textY = y \+ getCenteredUserBubbleTextOffset\(message\) \+ message\.fontSize;/);
    assert.doesNotMatch(js, /messages\.slice\(0, 4\)/);
    assert.doesNotMatch(js, /drawRoundRect\(ctx, qrPanelX, qrPanelY, qrPanelWidth, qrPanelHeight, 34\);/);
    assert.match(js, /ctx\.drawImage\(qrImagePath, SHARE_CANVAS_WIDTH \/ 2 - 70, qrY, 140, 140\);/);
    assert.match(js, /ctx\.fillText\("扫描二维码，和小玩子继续聊", SHARE_CANVAS_WIDTH \/ 2, qrPanelY \+ 196\);/);
    assert.doesNotMatch(js, /ctx\.fillText\("长按图片保存到相册"/);
    assert.doesNotMatch(js, /fillText\("小", 120, 146\)/);
    assert.match(js, /generateShareImage\(\)/);
    assert.match(js, /wx\.createCanvasContext\(SHARE_CANVAS_ID, this\)/);
    assert.match(js, /wx\.canvasToTempFilePath\(\{/);
    assert.match(js, /shareImagePreviewOpen: true/);
    assert.match(js, /shareImagePath: path/);
    assert.match(js, /saveGeneratedShareImage\(\)/);
    assert.match(js, /wx\.saveImageToPhotosAlbum\(\{[\s\S]*filePath: this\.data\.shareImagePath/);
    assert.match(js, /function buildChildPickerCards\(activeId\)/);
    assert.match(js, /chooseChildFromPicker\(event\)/);
    assert.match(js, /openChildCreateFromPicker\(\)/);
    assert.match(js, /closeChildPicker\(\)/);
    assert.match(js, /当前为通用咨询模式/);
    assert.match(js, /用户未选择孩子档案/);
    assert.doesNotMatch(js, /请先关联孩子档案/);
    assert.doesNotMatch(js, /需要孩子档案/);
    assert.match(js, /syncNativeShellState\(\)/);
    assert.match(js, /openNativeChildPicker\(\) \{[\s\S]*childPickerOpen: true,[\s\S]*childPickerCards: buildChildPickerCards\(this\.data\.activeChildId\),[\s\S]*settingsPanelOpen: false[\s\S]*\}/);
    assert.match(js, /chooseChildFromPicker\(event\) \{[\s\S]*this\.syncSelectedChildToXiaowanzi\(child\);[\s\S]*this\.markChildContextPending\(child\);[\s\S]*childPickerOpen: false[\s\S]*\}/);
    assert.match(js, /openChildCreateFromPicker\(\) \{[\s\S]*childPickerOpen: false[\s\S]*this\.openNativeChildCreate\(\);[\s\S]*\}/);
    assert.match(js, /openNativeChildCreate\(\) \{[\s\S]*const hasSavedChildren = loadChildProfilesForNativeChat\(\)\.length > 0;[\s\S]*this\.openArchivePanel\(\);[\s\S]*if \(hasSavedChildren\) this\.addArchiveChild\(\);[\s\S]*\}/);
    assert.match(js, /markChildContextPending\(child\)/);
    assert.match(js, /const BOT_ID = "xiaowanzi_debug_bot"/);
    assert.match(js, /url: "\/api\/v1\/tutorbot"/);
    assert.match(js, /const url = buildUrl\(`\/api\/v1\/tutorbot\/\$\{BOT_ID\}\/messages`\)/);
    assert.match(js, /requestXiaowanziStream\(\{/);
    assert.match(js, /data: \{ content, stream: true \}/);
    assert.match(js, /enableChunked: true/);
    assert.match(js, /\.onChunkReceived\(/);
    assert.match(js, /appendNativeAssistantDelta\(/);
    assert.match(js, /statusCode === 401/);
    assert.match(js, /clearSession\(\)/);
    assert.match(js, /PRO_REQUIRED/);
    assert.match(js, /\/pages\/pro\/index/);
    assert.match(js, /statusCode === 403/);
    assert.match(js, /function buildChildProfileSummary\(profile, parentRole, parentName\)/);
    assert.match(js, /function buildXiaowanziPromptPayload\(input\)/);
    assert.match(js, /\[孩子档案\]/);
    assert.match(js, /\[孩子记忆\]/);
    assert.match(js, /\/api\/users\/me\/child-memories\/\$\{encodeURIComponent\(childId\)\}/);
    assert.match(js, /\/api\/users\/me\/child-memories\/\$\{encodeURIComponent\(childId\)\}\/merge/);
    assert.doesNotMatch(js, /openNativeSharePanel\(\)/);
    assert.doesNotMatch(js, /closeNativeSharePanel\(\)/);
    assert.doesNotMatch(js, /webUrl\(WEB_ROUTES\.xiaowanzi, \{/);
    assert.doesNotMatch(js, /openNativeRoute\(this, event\.detail\)/);
    assert.doesNotMatch(js, /handleNativeRoute/);
    assert.doesNotMatch(js, /openWeb\(WEB_ROUTES\.xiaowanzi/);
    assert.doesNotMatch(js, /xf_xw: "chat"/);

    definition.onLoad.call(context);
    assert.equal(tabBarData.selected, 2);
    assert.equal(tabBarData.hidden, true);
    assert.equal(navigations.length, 0);
    assert.equal("shellActionRight" in context.data, false);
    assert.equal("shellWelfareRight" in context.data, false);
    assert.equal(context.data.activeChildName, "小圆子");
    assert.equal(context.data.activeChildMeta, "女儿 · 小班");
    assert.equal(context.data.activeChildId, "child-1");
    assert.equal(context.data.childHintText, "已关联 小圆子 档案，可获得更贴合的建议");
    assert.equal(context.data.childActionLabel, "切换");
    assert.equal(context.data.shellLogoTop, 59);
    assert.equal(context.data.shellLogoHeight, 32);
    assert.equal(context.data.shellAvatarTop, 55);
    assert.equal(context.data.shellAvatarHeight, 40);
    assert.equal(context.data.shellKnowledgeTop, 58);
    assert.equal(context.data.shellKnowledgeHeight, 34);
    assert.equal(
      context.data.shellAvatarTop + context.data.shellAvatarHeight - 3,
      context.data.shellKnowledgeTop + context.data.shellKnowledgeHeight
    );
    assert.equal(context.data.shellKnowledgeWidth, 86);
    assert.equal(context.data.shellKnowledgeRight, 126);
    assert.equal(context.data.topbarHeight, 97);
    assert.equal(context.data.sharePreviewTop, 119);
    assert.equal(context.data.knowledgePillCollapsed, false);
    assert.equal(context.data.homeMode, true);
    assert.equal(context.data.homePromptGrade, "小班");
    assert.deepEqual(context.data.quickPrompts.map((item) => item.label), [
      "孩子玩电脑游戏的引导与游戏选择？",
      "窝沟封闭黄金年龄？",
      "双语民办幼儿园回家还要加餐么？"
    ]);
    assert.equal(context.data.childContextStatus, "");
    definition.openHistoryDrawer.call(context);
    assert.equal(context.data.historyDrawerOpen, true);
    assert.equal(context.data.settingsPanelOpen, false);
    definition.closeHistoryDrawer.call(context);
    assert.equal(context.data.historyDrawerOpen, false);
    storage.set("xf_xiaowanzi_return_target_v1", { type: "tab", url: "/pages/topics/index" });
    context.data.historyDrawerOpen = true;
    context.data.attachmentMenuOpen = true;
    context.data.shareSelectionMode = true;
    context.data.settingsPanelOpen = true;
    definition.returnToExternalPage.call(context);
    assert.equal(context.data.historyDrawerOpen, false);
    assert.equal(context.data.attachmentMenuOpen, false);
    assert.equal(context.data.shareSelectionMode, false);
    assert.equal(context.data.settingsPanelOpen, false);
    assert.deepEqual(switchCalls.at(-1), { url: "/pages/topics/index", fail: switchCalls.at(-1).fail });
    storage.set("xf_child_profiles", [{ id: "draft-1", displayName: "", relation: "儿子", draft: true }]);
    storage.set("xiaowanzi_child_profiles_v1", JSON.stringify([
      { id: "child-web", displayName: "吃啥", relation: "儿子", birthDate: "2020-01-02", grade: "学前小班", city: "上海", region: "静安区" }
    ]));
    storage.set("xiaowanzi_last_child_id_v1", "child-web");
    definition.syncNativeShellState.call(context);
    assert.equal(context.data.activeChildId, "child-web");
    assert.equal(context.data.activeChildName, "吃啥");
    storage.set("xf_child_profiles", []);
    storage.set("xiaowanzi_child_profiles_v1", JSON.stringify([]));
    storage.set("xiaowanzi_last_child_id_v1", "child-web");
    definition.syncNativeShellState.call(context);
    assert.equal(context.data.activeChildReady, false);
    assert.equal(context.data.childHintText, "可选：关联孩子档案后，回答会更个性化");
    assert.equal(context.data.childActionLabel, "关联");
    storage.set("xf_child_profiles", [
      { id: "child-1", displayName: "小圆子", relation: "女儿", birthDate: "2022-01-02", grade: "小班", city: "上海", region: "静安区", avatar: "/tmp/avatar.png" }
    ]);
    storage.delete("xiaowanzi_child_profiles_v1");
    storage.set("xiaowanzi_last_child_id_v1", "child-1");
    storage.set("xiaowanzi_native_history_v1:child-1", [
      { id: "cached-user", role: "user", content: "这是旧历史，不应该覆盖当前对话", ts: "2026-06-26T08:32:00.000Z" },
      { id: "cached-assistant", role: "assistant", content: "旧历史回答", ts: "2026-06-26T08:33:00.000Z" }
    ]);
    context.data.messages = [
      { id: "current-user", role: "user", content: "当前正在问的问题" },
      { id: "current-assistant", role: "assistant", content: "当前对话的回答" }
    ];
    const currentConversation = context.data.messages.map((message) => message.content);
    assert.equal(context.data.nativeCapsuleRight, undefined);
    assert.equal(context.data.nativeAgentTop, undefined);

    definition.openNativeChildPicker.call(context);
    assert.equal(context.data.childPickerOpen, true);
    assert.equal(context.data.settingsPanelOpen, false);
    assert.deepEqual(context.data.childPickerCards.map((child) => [child.id, child.selected]), [["child-1", true]]);
    definition.chooseChildFromPicker.call(context, { currentTarget: { dataset: { id: "child-1" } } });
    assert.equal(storage.get("xiaowanzi_last_child_id_v1"), "child-1");
    assert.equal(context.data.activeChildId, "child-1");
    assert.equal(context.data.childPickerOpen, false);
    assert.equal(context.data.childContextStatus, "已切换为小圆子，下一次提问立即生效");
    assert.deepEqual(context.data.messages.map((message) => message.content), currentConversation);

    definition.openArchivePanel.call(context);
    definition.saveArchivePanel.call(context);
    assert.equal(storage.get("xiaowanzi_last_child_id_v1"), "child-1");
    assert.equal(context.data.settingsPanelOpen, false);
    assert.equal(context.data.childContextStatus, "已切换为小圆子，下一次提问立即生效");
    assert.deepEqual(context.data.messages.map((message) => message.content), currentConversation);

    definition.closeSettings.call(context);
    assert.equal(context.data.settingsPanelOpen, false);
    assert.equal(context.data.settingsPanelView, "archive");
    assert.equal(tabBarData.hidden, true);

    definition.onLoad.call(context, { panel: "archive", action: "add" });
    assert.equal(context.data.settingsPanelOpen, true);
    assert.equal(context.data.settingsPanelView, "archive");
    assert.equal(context.data.archiveDraft.displayName, "");
    assert.equal(context.data.profilePanelMessage, "");

    definition.closeSettings.call(context);
    assert.equal(context.data.settingsPanelOpen, false);

  } finally {
    global.wx.navigateTo = originalNavigateTo;
    global.wx.switchTab = originalSwitchTab;
    global.wx.getWindowInfo = originalGetWindowInfo;
    global.wx.getMenuButtonBoundingClientRect = originalGetMenuButtonBoundingClientRect;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("Xiaowanzi page keeps public content visible until a protected action", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalGetWindowInfo = global.wx.getWindowInfo;
  const originalGetMenuButtonBoundingClientRect = global.wx.getMenuButtonBoundingClientRect;
  const context = {
    ...definition,
    data: {
      ...definition.data,
      statusText: "准备就绪",
      errorText: "",
      actionLabel: "",
      actionType: ""
    },
    setData(payload, callback) {
      this.data = { ...this.data, ...payload };
      if (typeof callback === "function") callback();
    },
    getTabBar() {
      return { setData() {} };
    }
  };

  try {
    global.wx.getStorageSync = () => "";
    global.wx.getWindowInfo = () => ({ windowWidth: 430, statusBarHeight: 0, safeArea: { top: 59 } });
    global.wx.getMenuButtonBoundingClientRect = () => ({ top: 8, left: 314, height: 32 });

    definition.onLoad.call(context);

    assert.equal(context.data.xiaowanziLoginRequired, false);
    assert.equal(context.data.isLoggedIn, false);
    assert.equal(context.data.shellLogoTop, 67);
    assert.equal(context.data.shellAvatarTop, 64);
    assert.equal(context.data.shellKnowledgeTop, 67);
    assert.equal(
      context.data.shellAvatarTop + context.data.shellAvatarHeight - 3,
      context.data.shellKnowledgeTop + context.data.shellKnowledgeHeight
    );
    assert.equal(context.data.topbarHeight, 106);
    assert.equal(context.data.statusText, "准备就绪");
    assert.equal(context.data.errorText, "");
    assert.equal(context.data.actionLabel, "");
    assert.equal(context.data.actionType, "");
  } finally {
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.getWindowInfo = originalGetWindowInfo;
    global.wx.getMenuButtonBoundingClientRect = originalGetMenuButtonBoundingClientRect;
  }
});

test("Xiaowanzi in-page phone authorization resumes the native chat after login", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalLogin = global.wx.login;
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const originalGetApp = global.getApp;
  const storage = new Map();
  const requestCalls = [];
  let appSession = null;
  const context = {
    ...definition,
    _initialOptions: { panel: "archive" },
    initializedWith: null,
    data: {
      ...definition.data,
      xiaowanziLoginRequired: true,
      bindingPhone: false,
      profilePanelMessage: ""
    },
    setData(payload, callback) {
      this.data = { ...this.data, ...payload };
      if (typeof callback === "function") callback();
    },
    initializeXiaowanzi(options) {
      this.initializedWith = options;
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.wx.login = (options) => {
      options.success({ code: "wx-code-1" });
    };
    global.wx.request = (options) => {
      requestCalls.push(options);
      assert.match(String(options.url || ""), /\/api\/wechat-mini\/login/);
      options.success({ statusCode: 200, data: { token: "token-1", user: { mobile: "13500003069" } } });
    };
    global.getApp = () => ({
      setLoginSession(payload) {
        appSession = payload;
      }
    });

    definition.handleXiaowanziLoginSuccess.call(context);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(requestCalls.length, 0);
    assert.equal(storage.get("xf_token"), undefined);
    assert.equal(storage.get("xf_user"), undefined);
    assert.equal(appSession, null);
    assert.equal(context.data.xiaowanziLoginRequired, false);
    assert.equal(context.data.bindingPhone, false);
    assert.equal(context.data.profilePanelMessage, "");
    assert.deepEqual(context.initializedWith, { panel: "archive" });
  } finally {
    global.wx.login = originalLogin;
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
    global.getApp = originalGetApp;
  }
});

test("Xiaowanzi super-mode design doc maps mobile assets to native mini-program slots", () => {
  const designDoc = fs.readFileSync(new URL("../../../docs/modules/xiaowanzi-super-mode-design.md", import.meta.url), "utf8");

  assert.match(designDoc, /## Design Asset Map/);
  assert.match(designDoc, /apps\/wechat-miniprogram\/assets\/wel-avatar\/no-hat\.png/);
  assert.doesNotMatch(designDoc, /apps\/wechat-miniprogram\/assets\/xiaowanzi-nohat\.png/);
  assert.doesNotMatch(designDoc, /apps\/wechat-miniprogram\/assets\/xiaowanzi-topbar\.png/);
  assert.doesNotMatch(designDoc, /compact pirate-hat decorated avatar/);
  assert.match(designDoc, /native shell does not introduce generated avatar variants/);
  assert.match(designDoc, /wel_avatar_index/);
  assert.match(designDoc, /wel_avatar_click_count/);
  assert.match(designDoc, /explicit Xiaowanzi entry marker/);
  assert.match(designDoc, /topbar avatar itself is tapped/);
  assert.match(designDoc, /only after 5 triggers/);
  assert.match(designDoc, /apps\/wechat-miniprogram\/assets\/xiaowanzi-icons\/knowledge-round-logo\.png/);
  assert.match(designDoc, /apps\/wechat-miniprogram\/assets\/xiaowanzi-icons\/knowledge-title\.png/);
  assert.match(designDoc, /https:\/\/xianfeng\.xinzhi\.info\/experts\?xw_layer=1&xw_return=xiaowanzi/);
  assert.match(designDoc, /apps\/wechat-miniprogram\/assets\/xiaowanzi-icons\/share-logo\.png/);
  assert.match(designDoc, /generated canvas/);
  assert.match(designDoc, /provided transparent Xiaowanzi wordmark/);
  assert.match(designDoc, /Hamburger, voice, send, plus\/close, attachment, assistant-card share, and history-exit icons use packaged mini-program image assets exported from the same mobile icon source/);
  assert.doesNotMatch(designDoc, /history-exit icon directly uses the mobile Material Symbols Rounded `logout` glyph codepoint `E9BA`|supplied through page data as `\\uE9BA`/);
  assert.match(designDoc, /History drawer geometry:[\s\S]*covers the native Xiaowanzi top shell[\s\S]*about 72% of viewport width/);
  assert.doesNotMatch(designDoc, /about 84% of viewport width/);
  assert.match(designDoc, /mobile vertical-more control is not shown/);
  assert.match(designDoc, /Child profile: remains a secondary context action in the home content flow below the prompt or answer card/);
  assert.match(designDoc, /scrolls with the last card instead of staying fixed in the composer/);
  assert.match(designDoc, /The hamburger slot is reserved for history; the detached plus slot is reserved for attachments/);
});

test("Xiaowanzi history cards reveal and delete local sessions", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalWx = global.wx;
  const storage = new Map();
  const removedKeys = [];
  const sessionMessages = [
    { id: "history-user", role: "user", content: "帮我解读下图片内容", ts: "2026-07-08T06:31:00.000Z" },
    { id: "history-assistant", role: "assistant", content: "图片里有一段对话", ts: "2026-07-08T06:32:00.000Z" }
  ];
  storage.set("xiaowanzi_native_session_index_v1", [{
    id: "session-history",
    title: "帮我解读下图片内容",
    sub: "7/8 06:31",
    childTag: "",
    childId: "",
    targetId: "history-user",
    updatedAt: "2026-07-08T06:32:00.000Z"
  }]);
  storage.set("xiaowanzi_native_session_messages_v1:session-history", sessionMessages);
  storage.set("xiaowanzi_native_active_session_id_v1", "session-history");

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      removeStorageSync(key) {
        removedKeys.push(key);
        storage.delete(key);
      }
    };

    const context = {
      data: {
        ...definition.data,
        homeMode: false,
        messages: sessionMessages,
        historyDrawerOpen: true
      },
      clearShareRevealTimer() {},
      refreshHistoryCards: definition.refreshHistoryCards,
      setData(patch) {
        this.data = { ...this.data, ...patch };
      }
    };

    definition.refreshHistoryCards.call(context);
    assert.equal(context.data.historyCards.length, 1);
    assert.equal(context.data.historyCards[0].id, "session-history");

    definition.showHistoryDeleteButton.call(context, { currentTarget: { dataset: { id: "session-history" } } });
    assert.equal(context.data.historyDeleteCardId, "session-history");

    definition.openHistoryCard.call(context, { currentTarget: { dataset: { id: "session-history" } } });
    assert.equal(context.data.historyDeleteCardId, "");
    assert.equal(context.data.historyDrawerOpen, true, "tap should only close the revealed delete affordance");

    definition.showHistoryDeleteButton.call(context, { currentTarget: { dataset: { id: "session-history" } } });
    definition.deleteHistoryCard.call(context, { currentTarget: { dataset: { id: "session-history" } } });

    assert.deepEqual(storage.get("xiaowanzi_native_session_index_v1"), []);
    assert.equal(storage.has("xiaowanzi_native_session_messages_v1:session-history"), false);
    assert.equal(storage.has("xiaowanzi_native_active_session_id_v1"), false);
    assert.deepEqual(removedKeys, ["xiaowanzi_native_session_messages_v1:session-history", "xiaowanzi_native_active_session_id_v1"]);
    assert.equal(context.data.historyDeleteCardId, "");
    assert.deepEqual(context.data.historyCards, []);
    assert.equal(context.data.homeMode, true);
    assert.equal(context.data.messages.length, 1);
    assert.equal(context.data.messages[0].role, "assistant");
  } finally {
    global.wx = originalWx;
  }
});

test("Xiaowanzi shell controls stay below the phone safe area when capsule metrics are unreliable", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalWx = global.wx;
  const storage = new Map();
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    getTabBar() {
      return { setData() {} };
    }
  };

  try {
    global.wx = {
      showShareMenu() {},
      getWindowInfo() {
        return { windowWidth: 430, statusBarHeight: 0, safeArea: { top: 59 } };
      },
      getMenuButtonBoundingClientRect() {
        return { top: 8, left: 314, height: 32 };
      },
      getStorageSync(key) {
        if (key === "xf_token") return "token-1";
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      }
    };

    definition.onLoad.call(context);

    assert.equal(context.data.shellLogoTop, 67);
    assert.equal(context.data.shellAvatarTop, 64);
    assert.equal(context.data.shellKnowledgeTop, 67);
    assert.equal(
      context.data.shellAvatarTop + context.data.shellAvatarHeight - 3,
      context.data.shellKnowledgeTop + context.data.shellKnowledgeHeight
    );
    assert.equal(context.data.topbarHeight, 106);
    assert.equal(context.data.childBoundaryTop, context.data.topbarHeight + 12);
  } finally {
    global.wx = originalWx;
  }
});

test("Xiaowanzi topbar avatar follows the mobile five-open rotation rule", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map([
    ["wel_avatar_index", 1],
    ["wel_avatar_click_count", 4]
  ]);
  const context = {
    ...definition,
    data: {
      ...definition.data,
      topbarAvatarIndex: 0,
      topbarAvatarClickCount: 0,
      topbarAvatarSrc: "/assets/wel-avatar/no-hat.png"
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };

    definition.restoreTopbarAvatar.call(context);

    assert.equal(context.data.topbarAvatarIndex, 1);
    assert.equal(context.data.topbarAvatarClickCount, 4);
    assert.equal(context.data.topbarAvatarSrc, "/assets/wel-avatar/img-0640.png");
    assert.equal(storage.get("wel_avatar_index"), 1);
    assert.equal(storage.get("wel_avatar_click_count"), 4);

    definition.restoreTopbarAvatar.call(context, { advance: true });

    assert.equal(context.data.topbarAvatarIndex, 2);
    assert.equal(context.data.topbarAvatarClickCount, 0);
    assert.equal(context.data.topbarAvatarSrc, "/assets/wel-avatar/wizard.png");
    assert.equal(storage.get("wel_avatar_index"), 2);
    assert.equal(storage.get("wel_avatar_click_count"), 0);
  } finally {
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("Xiaowanzi authenticated page show clears explicit entry mode and advances the topbar avatar", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  let shellSynced = 0;
  let promptsLoaded = 0;
  const storage = new Map([
    ["xf_xiaowanzi_entry_mode", "home"],
    ["wel_avatar_index", 0],
    ["wel_avatar_click_count", 0]
  ]);
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    requireXiaowanziLogin() {
      return true;
    },
    syncNativeShellState() {
      shellSynced += 1;
    },
    loadHomeTopicPrompts() {
      promptsLoaded += 1;
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };

    definition.onShow.call(context);

    assert.equal(storage.get("xf_xiaowanzi_entry_mode"), "");
    assert.equal(context.data.topbarAvatarIndex, 0);
    assert.equal(context.data.topbarAvatarClickCount, 1);
    assert.equal(shellSynced, 1);
    assert.equal(promptsLoaded, 1);

    definition.onShow.call(context);

    assert.equal(context.data.topbarAvatarClickCount, 1);
    assert.equal(shellSynced, 2);
    assert.equal(promptsLoaded, 2);
  } finally {
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("Xiaowanzi unauthenticated entry stays on the current public page", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalNavigateTo = global.wx.navigateTo;
  const navigations = [];
  let initialized = 0;
  const tabBarData = {};
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    getTabBar() {
      return {
        setData(payload) {
          Object.assign(tabBarData, payload);
        }
      };
    },
    initializeXiaowanzi() {
      initialized += 1;
    }
  };

  try {
    global.wx.getStorageSync = () => "";
    global.wx.navigateTo = (options) => {
      navigations.push(options);
    };

    definition.onLoad.call(context, { from: "tab" });

    assert.equal(context.data.xiaowanziLoginRequired, false);
    assert.equal(context.data.canUseBot, false);
    assert.equal(context.data.sending, false);
    assert.equal(context.data.pendingMessageId, "");
    assert.equal(context.data.errorText, "");
    assert.equal(context.data.actionLabel, "");
    assert.equal(initialized, 1);
    assert.equal(navigations.length, 0);
    assert.notEqual(tabBarData.hidden, false);
  } finally {
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.navigateTo = originalNavigateTo;
  }
});

test("Xiaowanzi knowledge pill opens the experts layer with Xiaowanzi return params", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalNavigateTo = global.wx.navigateTo;
  const originalRemoveStorageSync = global.wx.removeStorageSync;
  const navigations = [];

  try {
    global.wx.navigateTo = (options) => {
      navigations.push(options);
    };
    global.wx.removeStorageSync = () => undefined;

    definition.openKnowledgeHub.call({});

    assert.equal(navigations.length, 1);
    assert.equal(navigations[0].url, "/pages/experts/index?from=xiaowanzi");
  } finally {
    global.wx.navigateTo = originalNavigateTo;
    global.wx.removeStorageSync = originalRemoveStorageSync;
  }
});

test("Xiaowanzi knowledge pill collapses to logo-only after content scroll", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const context = {
    data: { ...definition.data, knowledgePillCollapsed: false },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  definition.handleKnowledgePillScroll.call(context, { detail: { scrollTop: 12 } });
  assert.equal(context.data.knowledgePillCollapsed, false);

  definition.handleKnowledgePillScroll.call(context, { detail: { scrollTop: 25 } });
  assert.equal(context.data.knowledgePillCollapsed, true);

  definition.handleKnowledgePillScroll.call(context, { detail: { scrollTop: 0 } });
  assert.equal(context.data.knowledgePillCollapsed, false);

  context.lastChatScrollTop = 0;
  context.data.attachmentMenuOpen = true;
  definition.handleKnowledgePillScroll.call(context, { detail: { scrollTop: 10 } });
  assert.equal(context.data.attachmentMenuOpen, false);
});

test("Xiaowanzi streaming chunks repair latin1-decoded UTF-8 text before rendering", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map([
    ["xf_token", "token-1"],
    ["xf_user", { _id: "user-1", mobile: "13500003069" }]
  ]);
  const context = {
    ...definition,
    data: {
      ...definition.data,
      homeMode: false,
      inputValue: "孩子不想写作业怎么办",
      inputReady: true,
      sending: false,
      pendingAttachments: [],
      attachmentPreviewText: "",
      attachmentContextText: "",
      messages: []
    },
    setData(payload, callback) {
      this.data = { ...this.data, ...payload };
      if (typeof callback === "function") callback();
    },
    refreshHistoryCards() {}
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.wx.request = (options) => {
      let onChunkReceived = null;
      setTimeout(() => {
        const chunkText = [
          'event: delta',
          'data: {"content":"你好"}',
          '',
          'event: done',
          'data: {"content":"你好"}',
          '',
          ''
        ].join("\n");
        const latin1Chunk = Buffer.from(chunkText, "utf8").toString("latin1");
        if (onChunkReceived) onChunkReceived({ data: latin1Chunk });
        options.success({ statusCode: 200, data: new ArrayBuffer(0) });
      }, 0);
      return {
        onChunkReceived(callback) {
          onChunkReceived = callback;
        }
      };
    };

    definition.handleSend.call(context);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const assistant = context.data.messages.find((item) => item.role === "assistant");
    assert.equal(assistant && assistant.content, "你好");
    assert.doesNotMatch(assistant && assistant.content || "", /Ã|Â|è|é|ç|å|ä/);
  } finally {
    definition.clearNativeThinkingStepTimer.call(context);
    definition.clearNativeReplyRevealTimer.call(context);
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("Xiaowanzi startup probe stays visually quiet while send failure keeps retry action", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map([
    ["xf_token", "token-1"],
    ["xf_child_profiles", [
      { id: "child-1", displayName: "小圆子", relation: "女儿", birthDate: "2022-01-02", grade: "小班", city: "上海", region: "静安区" }
    ]],
    ["xiaowanzi_last_child_id_v1", "child-1"]
  ]);
  const requestCalls = [];
  const context = {
    ...definition,
    data: { ...definition.data, inputValue: "今天作业又吵起来了" },
    setData(payload, callback) {
      this.data = { ...this.data, ...payload };
      if (typeof callback === "function") callback();
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.wx.request = (options) => {
      requestCalls.push(options);
      const url = String(options.url || "");
      if (url.includes("/api/v1/tutorbot/xiaowanzi_debug_bot/messages")) {
        options.success({ statusCode: 500, data: { message: "发送失败，请稍后重试。" } });
        return;
      }
      if (url.includes("/api/users/me/child-memories/child-1")) {
        options.success({ statusCode: 200, data: { enabled: false, summary: "" } });
        return;
      }
      if (url.includes("/api/v1/tutorbot")) {
        options.success({ statusCode: 500, data: { message: "启动失败" } });
        return;
      }
      options.success({ statusCode: 200, data: {} });
    };

    const probeReady = await definition.ensureBotReady.call(context, { quiet: true });
    assert.equal(probeReady, false);
    assert.equal(context.data.homeMode, true);
    assert.equal(context.data.errorText, "");
    assert.equal(context.data.actionLabel, "");
    assert.equal(context.data.actionType, "");
    assert.equal(context.data.statusText, "准备就绪");

    definition.handleSend.call(context);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(context.data.sending, false);
    assert.equal(context.data.pendingMessageId, "");
    assert.equal(context.data.homeMode, true);
    assert.deepEqual(context.data.homeConversationMessages.map((message) => message.role), ["user", "assistant"]);
    assert.equal(context.data.errorText, "发送失败，请稍后重试。");
    assert.equal(context.data.actionLabel, "重试");
    assert.equal(context.data.actionType, "retry");
    assert.ok(context.data.messages.some((message) => message.error && message.content === "发送失败，请稍后重试。"));
    assert.deepEqual(storage.get("xiaowanzi_native_history_v1:child-1:token-1"), []);
    assert.ok(requestCalls.some((call) => String(call.url).includes("/api/v1/tutorbot/xiaowanzi_debug_bot/messages")));
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("Xiaowanzi quick prompt submits the reference question immediately", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map([
    ["xf_token", "token-1"],
    ["xf_user", { _id: "user-1", mobile: "13500003069" }],
    ["xiaowanzi_native_session_index_v1", [
      { id: "session-other", title: "你是谁", sub: "7/8 11:57", targetId: "user-other", updatedAt: "2026-07-08T03:57:00.000Z" }
    ]],
    ["xiaowanzi_native_session_messages_v1:session-other", [
      { id: "user-other", role: "user", content: "你是谁", ts: "2026-07-08T03:57:00.000Z" },
      { id: "assistant-other", role: "assistant", content: "我是小玩子。", ts: "2026-07-08T03:58:00.000Z" }
    ]]
  ]);
  const messageCalls = [];
  let finishMessageRequest = null;

  assert.equal(definition.data.homePromptPreview, "");
  assert.equal(definition.data.inputReady, false);
  assert.equal(definition.data.selectedHomePrompt, "");

  const context = {
    ...definition,
    data: {
      ...definition.data,
      homeMode: true,
      errorText: "旧提示",
      actionLabel: "旧动作",
      actionType: "archive"
    },
    setData(payload, callback) {
      this.data = { ...this.data, ...payload };
      if (typeof callback === "function") callback();
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.wx.request = (options) => {
      const url = String(options.url || "");
      if (url.includes("/api/v1/tutorbot/xiaowanzi_debug_bot/messages")) {
        messageCalls.push(options);
        finishMessageRequest = () => options.success({ statusCode: 200, data: { content: "直接给你建议。" } });
        return;
      }
      options.success({ statusCode: 200, data: {} });
    };

    definition.useQuickPrompt.call(context, {
      currentTarget: {
        dataset: {
          value: "孩子写作业拖延怎么办？"
        }
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(messageCalls.length, 1);
    assert.match(messageCalls[0].data.content, /孩子写作业拖延怎么办？/);
    assert.equal(context.data.sending, true);
    assert.equal(context.data.homeMode, true);
    assert.equal(context.data.inputValue, "");
    assert.equal(context.data.inputReady, false);
    assert.equal(context.data.selectedHomePrompt, "");
    assert.deepEqual(context.data.homeConversationMessages.map((message) => message.role), ["user", "assistant"]);
    assert.equal(context.data.homeConversationMessages[0].content, "孩子写作业拖延怎么办？");
    assert.equal(context.data.homeConversationMessages[1].pending, true);
    assert.equal(context.data.homeConversationMessages[1].content, "小玩子正在思考中...");
    assert.equal(context.data.scrollIntoView, context.data.homeConversationMessages[1].id);
    assert.equal(context.data.knowledgePillCollapsed, true);

    assert.equal(typeof finishMessageRequest, "function");
    finishMessageRequest();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(messageCalls.length, 1);
    assert.match(messageCalls[0].data.content, /孩子写作业拖延怎么办？/);
    assert.equal(context.data.inputValue, "");
    assert.equal(context.data.inputReady, false);
    assert.equal(context.data.selectedHomePrompt, "");
    assert.equal(context.data.homeMode, true);
    assert.equal(context.data.voiceListening, false);
    assert.equal(context.data.voiceHolding, false);
    assert.equal(context.data.errorText, "");
    assert.equal(context.data.actionLabel, "");
    assert.equal(context.data.actionType, "");
    assert.equal(context.data.sending, false);
    assert.deepEqual(context.data.homeConversationMessages.map((message) => message.role), ["user", "assistant"]);
    assert.ok(context.data.messages.some((message) => message.role === "user" && message.content === "孩子写作业拖延怎么办？"));
    assert.ok(context.data.messages.some((message) => message.role === "assistant" && message.content === "直接给你建议。"));
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("Xiaowanzi native send reveals streamed chunks progressively before the final response", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const storage = new Map([
    ["xf_token", "token-1"],
    ["xf_user", { _id: "user-1", mobile: "13500003069" }]
  ]);
  let chunkHandler = null;
  let finishMessageRequest = null;
  const scheduledTimers = [];
  const encoder = new TextEncoder();
  const encodeChunk = (text) => encoder.encode(text).buffer;
  const context = {
    ...definition,
    data: {
      ...definition.data,
      inputValue: "孩子不愿意阅读怎么办？",
      inputReady: true,
      homeMode: true
    },
    setData(payload, callback) {
      this.data = { ...this.data, ...payload };
      if (typeof callback === "function") callback();
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.wx.request = (options) => {
      const url = String(options.url || "");
      if (url.includes("/api/v1/tutorbot/xiaowanzi_debug_bot/messages")) {
        finishMessageRequest = () => options.success({ statusCode: 200, data: encodeChunk("") });
        return {
          onChunkReceived(handler) {
            chunkHandler = handler;
          }
        };
      }
      options.success({ statusCode: 200, data: {} });
    };
    definition.handleSend.call(context);
    await new Promise((resolve) => originalSetTimeout(resolve, 0));

    assert.equal(typeof chunkHandler, "function");
    assert.equal(context.data.homeConversationMessages[1].pending, true);
    assert.deepEqual(context.data.homeConversationMessages[1].thinkingSteps.map((item) => item.text), [
      "正在理解问题",
      "准备查找站内内容和知识库"
    ]);
    global.setTimeout = (callback, delay) => {
      scheduledTimers.push({ callback, delay });
      return scheduledTimers.length;
    };
    global.clearTimeout = () => undefined;
    assert.equal(context.data.homeConversationMessages[1].pending, true);
    chunkHandler({ data: encodeChunk('event: delta\ndata: {"content":"先看到内容随后加载"}\n\n') });
    assert.equal(context.data.homeConversationMessages[1].content, "先看到内容");
    assert.notEqual(context.data.homeConversationMessages[1].content, "先看到内容随后加载");
    assert.equal(context.data.homeConversationMessages[1].pending, false);
    assert.equal(context.data.statusText, "正在回复");
    assert.equal(scheduledTimers.length, 1);
    assert.equal(scheduledTimers[0].delay, 45);

    scheduledTimers.shift().callback();
    assert.equal(context.data.homeConversationMessages[1].content, "先看到内容随");
    chunkHandler({ data: encodeChunk('event: delta\ndata: {"content":"，再给具体建议。"}\n\n') });
    while (scheduledTimers.length) {
      scheduledTimers.shift().callback();
    }
    assert.equal(context.data.homeConversationMessages[1].content, "先看到内容随后加载，再给具体建议。");

    assert.equal(typeof finishMessageRequest, "function");
    finishMessageRequest();
    await new Promise((resolve) => originalSetTimeout(resolve, 0));

    assert.equal(context.data.sending, false);
    assert.equal(context.data.homeConversationMessages[1].content, "先看到内容随后加载，再给具体建议。");
    assert.equal(context.data.homeConversationMessages[1].shareable, true);
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test("Xiaowanzi native send shows auditable context trace only while thinking", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const storage = new Map([
    ["xf_token", "token-1"],
    ["xf_user", { _id: "user-1", mobile: "13500003069" }]
  ]);
  let chunkHandler = null;
  const scheduledTimers = [];
  const scheduledIntervals = [];
  const clearedIntervals = [];
  const encoder = new TextEncoder();
  const encodeChunk = (text) => encoder.encode(text).buffer;
  const context = {
    ...definition,
    data: {
      ...definition.data,
      inputValue: "夏老师教育观点怎么理解？",
      inputReady: true,
      homeMode: true
    },
    setData(payload, callback) {
      this.data = { ...this.data, ...payload };
      if (typeof callback === "function") callback();
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.setInterval = (callback, delay) => {
      scheduledIntervals.push({ callback, delay });
      return scheduledIntervals.length;
    };
    global.clearInterval = (id) => {
      clearedIntervals.push(id);
    };
    global.wx.request = (options) => {
      const url = String(options.url || "");
      if (url.includes("/api/v1/tutorbot/xiaowanzi_debug_bot/messages")) {
        return {
          onChunkReceived(handler) {
            chunkHandler = handler;
          }
        };
      }
      options.success({ statusCode: 200, data: {} });
    };
    definition.handleSend.call(context);
    await new Promise((resolve) => originalSetTimeout(resolve, 0));

    assert.equal(typeof chunkHandler, "function");
    assert.equal(context.data.homeConversationMessages[1].pending, true);
    assert.deepEqual(context.data.homeConversationMessages[1].thinkingSteps.map((item) => item.text), [
      "正在理解问题",
      "准备查找站内内容和知识库"
    ]);
    assert.equal(context.data.homeConversationMessages[1].thinkingActiveStepText, "正在理解问题");
    assert.equal(scheduledIntervals.length, 1);
    assert.equal(scheduledIntervals[0].delay, 1500);
    scheduledIntervals[0].callback();
    assert.equal(context.data.homeConversationMessages[1].thinkingActiveStepText, "准备查找站内内容和知识库");
    scheduledIntervals[0].callback();
    assert.equal(context.data.homeConversationMessages[1].thinkingActiveStepText, "准备查找站内内容和知识库");
    global.setTimeout = (callback, delay) => {
      scheduledTimers.push({ callback, delay });
      return scheduledTimers.length;
    };
    global.clearTimeout = () => undefined;

    chunkHandler({ data: encodeChunk('event: context\ndata: {"trace":[{"label":"查找站内结构化内容","status":"hit","detail":"命中 2 条站内内容"},{"label":"查询关联知识库","status":"miss","detail":"知识库没有可用命中或当前未启用"}]}\n\n') });
    assert.equal(context.data.homeConversationMessages[1].pending, true);
    assert.deepEqual(context.data.homeConversationMessages[1].thinkingSteps.map((item) => item.text), [
      "查找站内结构化内容：命中 2 条站内内容",
      "查询关联知识库：知识库没有可用命中或当前未启用"
    ]);
    assert.equal(context.data.homeConversationMessages[1].thinkingActiveStepText, "查找站内结构化内容：命中 2 条站内内容");
    scheduledIntervals[0].callback();
    assert.equal(context.data.homeConversationMessages[1].thinkingActiveStepText, "查询关联知识库：知识库没有可用命中或当前未启用");
    scheduledIntervals[0].callback();
    assert.equal(context.data.homeConversationMessages[1].thinkingActiveStepText, "查询关联知识库：知识库没有可用命中或当前未启用");

    chunkHandler({ data: encodeChunk('event: delta\ndata: {"content":"先看夏老师观点"}\n\n') });
    assert.equal(context.data.homeConversationMessages[1].pending, false);
    assert.equal(context.data.homeConversationMessages[1].content, "先看夏老师");
    assert.equal(context.data.homeConversationMessages[1].thinkingSteps, undefined);
    assert.deepEqual(clearedIntervals, [1]);
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});

test("Xiaowanzi native send keeps a typing cadence when streamed text is backlogged", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const storage = new Map([
    ["xf_token", "token-1"],
    ["xf_user", { _id: "user-1", mobile: "13500003069" }]
  ]);
  let chunkHandler = null;
  const scheduledTimers = [];
  const encoder = new TextEncoder();
  const encodeChunk = (text) => encoder.encode(text).buffer;
  const context = {
    ...definition,
    data: {
      ...definition.data,
      inputValue: "先给我方向",
      inputReady: true,
      homeMode: true
    },
    setData(payload, callback) {
      this.data = { ...this.data, ...payload };
      if (typeof callback === "function") callback();
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.wx.request = (options) => {
      const url = String(options.url || "");
      if (url.includes("/api/v1/tutorbot/xiaowanzi_debug_bot/messages")) {
        return {
          onChunkReceived(handler) {
            chunkHandler = handler;
          }
        };
      }
      options.success({ statusCode: 200, data: {} });
    };
    definition.handleSend.call(context);
    await new Promise((resolve) => originalSetTimeout(resolve, 0));

    global.setTimeout = (callback, delay) => {
      scheduledTimers.push({ callback, delay });
      return scheduledTimers.length;
    };
    global.clearTimeout = () => undefined;
    chunkHandler({ data: encodeChunk('event: delta\ndata: {"content":"先看到内容随后加载这里先给你一个确定方向，后面再展开具体建议。"}\n\n') });

    assert.equal(context.data.homeConversationMessages[1].content, "先看到内容");
    scheduledTimers.shift().callback();
    assert.equal(context.data.homeConversationMessages[1].content, "先看到内容随");
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test("Xiaowanzi native send keeps revealing after the stream finishes immediately", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const storage = new Map([
    ["xf_token", "token-1"],
    ["xf_user", { _id: "user-1", mobile: "13500003069" }]
  ]);
  let chunkHandler = null;
  let finishMessageRequest = null;
  const scheduledTimers = [];
  const encoder = new TextEncoder();
  const encodeChunk = (text) => encoder.encode(text).buffer;
  const reply = "先看到内容随后加载这里先给你一个确定方向，后面再展开具体建议。";
  const context = {
    ...definition,
    data: {
      ...definition.data,
      inputValue: "别一次展示",
      inputReady: true,
      homeMode: true
    },
    setData(payload, callback) {
      this.data = { ...this.data, ...payload };
      if (typeof callback === "function") callback();
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.wx.request = (options) => {
      const url = String(options.url || "");
      if (url.includes("/api/v1/tutorbot/xiaowanzi_debug_bot/messages")) {
        finishMessageRequest = () => options.success({ statusCode: 200, data: encodeChunk("") });
        return {
          onChunkReceived(handler) {
            chunkHandler = handler;
          }
        };
      }
      options.success({ statusCode: 200, data: {} });
    };
    definition.handleSend.call(context);
    await new Promise((resolve) => originalSetTimeout(resolve, 0));

    global.setTimeout = (callback, delay) => {
      scheduledTimers.push({ callback, delay });
      return scheduledTimers.length;
    };
    global.clearTimeout = () => undefined;
    chunkHandler({ data: encodeChunk(`event: delta\ndata: {"content":"${reply}"}\n\n`) });
    assert.equal(context.data.homeConversationMessages[1].content, "先看到内容");

    finishMessageRequest();
    await new Promise((resolve) => originalSetTimeout(resolve, 0));
    assert.equal(context.data.sending, false);
    assert.equal(context.data.homeConversationMessages[1].content, "先看到内容");
    assert.equal(context.data.homeConversationMessages[1].shareable, false);

    while (scheduledTimers.length) {
      scheduledTimers.shift().callback();
    }
    assert.equal(context.data.homeConversationMessages[1].content, reply);
    assert.equal(context.data.homeConversationMessages[1].shareable, true);
    assert.equal(context.data.statusText, "随时可用");
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test("Xiaowanzi child switch notice clears when the next question is submitted", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map([
    ["xf_token", "token-1"],
    ["xf_child_profiles", [
      { id: "child-1", displayName: "权意", relation: "女儿", birthDate: "2022-01-02", grade: "小班", city: "上海", region: "静安区" }
    ]],
    ["xiaowanzi_last_child_id_v1", "child-1"]
  ]);
  const context = {
    ...definition,
    data: {
      ...definition.data,
      inputValue: "好啊",
      inputReady: true,
      homeMode: true,
      childContextStatus: "已切换为权意，下一次提问立即生效"
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.wx.request = (options) => {
      const url = String(options.url || "");
      if (url.includes("/child-memories/") && (options.method || "GET") === "GET") {
        options.success({ statusCode: 200, data: { enabled: false, summary: "" } });
        return;
      }
      options.success({ statusCode: 200, data: { content: "小玩子回复" } });
    };

    definition.handleSend.call(context);

    assert.equal(context.data.childContextStatus, "");
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("Xiaowanzi hamburger history migrates cached history into restorable native cards", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const longHistoryQuestion = "围绕「练字体态不佳如何纠正」，给我一个适合家长马上执行的建议";
  const storage = new Map([
    ["xf_child_profiles", [
      { id: "child-1", displayName: "小圆子", relation: "女儿", birthDate: "2022-01-02", grade: "小班" }
    ]],
    ["xiaowanzi_last_child_id_v1", "child-1"],
    ["xiaowanzi_native_history_v1:child-1", [
      { id: "user-old", role: "user", content: longHistoryQuestion, ts: "2026-06-26T08:32:00.000Z" },
      { id: "assistant-old", role: "assistant", content: "可以从人物故事和时间线绘本开始。", ts: "2026-06-26T08:33:00.000Z" }
    ]]
  ]);
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };

    await definition.loadNativeHistory.call(context);

    assert.equal(context.data.homeMode, false);
    assert.equal(context.data.knowledgePillCollapsed, true);
    assert.equal(context.data.historyCards.length, 1);
    assert.equal(context.data.historyCards[0].title, longHistoryQuestion);
    assert.doesNotMatch(context.data.historyCards[0].title, /\.\.\.$/);
    assert.equal(context.data.historyCards[0].childTag, "小圆子");
    assert.match(context.data.historyCards[0].sessionId, /^session-/);

    const sessionId = context.data.historyCards[0].sessionId;
    assert.equal(storage.get("xiaowanzi_native_active_session_id_v1"), sessionId);
    assert.equal(storage.get("xiaowanzi_native_session_index_v1")[0].id, sessionId);
    storage.set("xiaowanzi_native_session_index_v1", storage.get("xiaowanzi_native_session_index_v1").map((item) => ({
      ...item,
      childTag: "旧名字"
    })));
    storage.set("xf_child_profiles", [
      { id: "child-1", displayName: "权力", relation: "女儿", birthDate: "2022-01-02", grade: "小班" }
    ]);
    definition.openHistoryDrawer.call(context);
    assert.equal(context.data.historyCards[0].childTag, "权力");
    assert.equal(storage.get("xiaowanzi_native_session_index_v1")[0].childTag, "权力");
    assert.deepEqual(storage.get(`xiaowanzi_native_session_messages_v1:${sessionId}`).map((message) => message.content), [
      longHistoryQuestion,
      "可以从人物故事和时间线绘本开始。"
    ]);

    definition.startNewConversation.call(context);
    assert.equal(context.data.homeMode, true);
    assert.equal(context.data.knowledgePillCollapsed, false);
    definition.openHistoryDrawer.call(context);
    assert.equal(context.data.historyDrawerOpen, true);
    definition.openHistoryCard.call(context, { currentTarget: { dataset: { id: sessionId } } });
    assert.equal(context.data.historyDrawerOpen, false);
    assert.equal(context.data.homeMode, false);
    assert.equal(context.data.knowledgePillCollapsed, true);
    assert.deepEqual(context.data.messages.map((message) => message.content), [
      longHistoryQuestion,
      "可以从人物故事和时间线绘本开始。"
    ]);
  } finally {
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("Xiaowanzi child picker links selection and shared archive creation", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalGetStorageSync = global.wx.getStorageSync;
  const storage = new Map([
    ["xf_child_profiles", [
      { id: "child-1", displayName: "小圆子", relation: "女儿", birthDate: "2022-01-02", grade: "学前小班", city: "上海", region: "静安区" }
    ]],
    ["xiaowanzi_last_child_id_v1", "child-1"]
  ]);
  const tabBarData = {};
  const context = {
    ...definition,
    data: {
      ...definition.data,
      attachmentMenuOpen: true,
      historyDrawerOpen: true,
      shareSelectionMode: true,
      shareRevealMessageId: "assistant-1"
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    getTabBar() {
      return {
        setData(payload) {
          Object.assign(tabBarData, payload);
        }
      };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";

    definition.openNativeChildPicker.call(context);

    assert.equal(context.data.childPickerOpen, true);
    assert.equal(context.data.settingsPanelOpen, false);
    assert.equal(context.data.attachmentMenuOpen, false);
    assert.equal(context.data.historyDrawerOpen, false);
    assert.equal(context.data.shareSelectionMode, false);
    assert.equal(context.data.shareRevealMessageId, "");
    assert.deepEqual(context.data.childPickerCards.map((child) => [child.id, child.displayName, child.tag, child.selected]), [["child-1", "小圆子", "女儿 · 学前小班", true]]);
    definition.closeChildPicker.call(context);
    assert.equal(context.data.childPickerOpen, false);

    const createContext = {
      ...definition,
      data: { ...definition.data, childPickerOpen: true },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      },
      getTabBar() {
        return {
          setData(payload) {
            Object.assign(tabBarData, payload);
          }
        };
      }
    };

    definition.openChildCreateFromPicker.call(createContext);

    assert.equal(createContext.data.childPickerOpen, false);
    assert.equal(createContext.data.settingsPanelOpen, true);
    assert.equal(createContext.data.settingsPanelView, "archive");
    assert.equal(createContext.data.archiveChildren.length, 2);
    assert.equal(createContext.data.archiveChildren[0].id, "child-1");
    assert.equal(createContext.data.archiveChildren[0].selected, false);
    assert.equal(createContext.data.archiveChildren[1].selected, true);
    assert.equal(createContext.data.archiveDraft.displayName, "");
    assert.equal(createContext.data.profilePanelMessage, "");

    const emptyContext = {
      ...definition,
      data: { ...definition.data, childPickerOpen: true },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      },
      getTabBar() {
        return {
          setData(payload) {
            Object.assign(tabBarData, payload);
          }
        };
      }
    };
    storage.set("xf_child_profiles", []);
    storage.delete("xiaowanzi_last_child_id_v1");

    definition.openNativeChildPicker.call(emptyContext);
    assert.equal(emptyContext.data.childPickerOpen, true);
    assert.deepEqual(emptyContext.data.childPickerCards, []);

    definition.openChildCreateFromPicker.call(emptyContext);

    assert.equal(emptyContext.data.childPickerOpen, false);
    assert.equal(emptyContext.data.settingsPanelOpen, true);
    assert.equal(emptyContext.data.settingsPanelView, "archive");
    assert.equal(emptyContext.data.archiveChildren.length, 1);
    assert.equal(emptyContext.data.archiveChildren[0].selected, true);
    assert.equal(emptyContext.data.archiveDraft.displayName, "");
    assert.equal(emptyContext.data.profilePanelMessage, "");
  } finally {
    global.wx.getStorageSync = originalGetStorageSync;
  }
});

test("Xiaowanzi child picker hides grade when child archive has no grade", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalGetStorageSync = global.wx.getStorageSync;
  const storage = new Map([
    ["xf_child_profiles", [
      { id: "child-1", displayName: "测试", relation: "儿子", birthDate: "2026-07-06", grade: "", city: "上海", region: "" }
    ]],
    ["xiaowanzi_last_child_id_v1", "child-1"]
  ]);
  const context = {
    ...definition,
    data: {
      ...definition.data
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    getTabBar() {
      return { setData() {} };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";

    definition.openNativeChildPicker.call(context);

    assert.deepEqual(context.data.childPickerCards.map((child) => [child.id, child.displayName, child.tag, child.grade]), [["child-1", "测试", "儿子", ""]]);
  } finally {
    global.wx.getStorageSync = originalGetStorageSync;
  }
});

test("Xiaowanzi legacy contextual user payload stays hidden in chat and history UI", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const contextualUserPayload = [
    "[回答规则]",
    "内部规则不应展示给用户。",
    "",
    "[孩子档案]",
    "当前为通用咨询模式。",
    "",
    "[用户问题]",
    "孩子偏科/讨厌某一科怎么办？"
  ].join("\n");
  const sessionId = "session-contextual";
  const storage = new Map([
    ["xiaowanzi_native_active_session_id_v1", sessionId],
    ["xiaowanzi_native_session_index_v1", [
      { id: sessionId, title: contextualUserPayload, sub: "7/5 09:07", childTag: "", targetId: "user-contextual", updatedAt: "2026-07-05T01:07:00.000Z" }
    ]],
    [`xiaowanzi_native_session_messages_v1:${sessionId}`, [
      { id: "user-contextual", role: "user", content: contextualUserPayload, ts: "2026-07-05T01:06:00.000Z" },
      { id: "assistant-contextual", role: "assistant", content: "可以先从具体科目和挫败点拆开看。", ts: "2026-07-05T01:07:00.000Z" }
    ]]
  ]);
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };

    await definition.loadNativeHistory.call(context);

    assert.equal(context.data.homeMode, false);
    assert.deepEqual(context.data.messages.map((message) => message.content), [
      "孩子偏科/讨厌某一科怎么办？",
      "可以先从具体科目和挫败点拆开看。"
    ]);
    assert.equal(context.data.historyCards[0].title, "孩子偏科/讨厌某一科怎么办？");
    assert.doesNotMatch(JSON.stringify(context.data.messages), /\[回答规则\]|\[孩子档案\]/);
    assert.doesNotMatch(JSON.stringify(context.data.historyCards), /\[回答规则\]|\[孩子档案\]/);
    assert.deepEqual(storage.get(`xiaowanzi_native_session_messages_v1:${sessionId}`).map((message) => message.content), [
      "孩子偏科/讨厌某一科怎么办？",
      "可以先从具体科目和挫败点拆开看。"
    ]);
  } finally {
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("Xiaowanzi send button press state follows tap and stop interactions", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const context = {
    ...definition,
    data: {
      ...definition.data,
      inputReady: true,
      inputValue: "",
      sendPressing: false,
      sending: false,
      messages: [
        { id: "user-1", role: "user", content: "先问一句" },
        { id: "assistant-pending", role: "assistant", content: "小玩子正在思考中...", pending: true }
      ],
      pendingMessageId: "assistant-pending"
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  definition.startSendPress.call(context);
  assert.equal(context.data.sendPressing, true);

  definition.endSendPress.call(context);
  assert.equal(context.data.sendPressing, false);

  context.data.sendPressing = true;
  definition.handleSend.call(context);
  assert.equal(context.data.sendPressing, false);
  assert.equal(context.data.sending, false);

  context.data.sending = true;
  context.data.sendPressing = true;
  definition.handleSend.call(context);
  assert.equal(context.data.sending, false);
  assert.equal(context.data.pendingMessageId, "");
  assert.equal(context.data.sendPressing, false);
  assert.equal(context.data.messages.length, 1);
  assert.equal(context.data.statusText, "已停止");
});

test("Xiaowanzi home prompts reuse topic hub items with fallback parity", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map([
    ["xf_child_profiles", [
      { id: "child-1", displayName: "小圆子", relation: "女儿", birthDate: "2022-01-02", grade: "小班", city: "上海", region: "静安区" }
    ]],
    ["xiaowanzi_last_child_id_v1", "child-1"]
  ]);
  const requestUrls = [];
  const context = {
    ...definition,
    data: { ...definition.data, homePromptGrade: "__initial__" },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.wx.request = (options) => {
      requestUrls.push(String(options.url || ""));
      options.success({
        statusCode: 200,
        data: {
          topics: [
            { title: "这期节目哪一段适合先听？" },
            { title: "小班孩子每天都不想去幼儿园" },
            { title: "孩子写字总是坐不住" },
            { title: "幼小衔接阅读怎么安排" },
            { title: "五升六语文冲刺：阅读写作双提升" }
          ]
        }
      });
    };

    await definition.loadHomeTopicPrompts.call(context);

    assert.ok(requestUrls.some((url) => url.includes("/api/topic-hub?page=1&limit=24&grade=%E5%B0%8F%E7%8F%AD")));
    assert.deepEqual(context.data.quickPrompts.map((item) => item.label), [
      "小班孩子每天都不想去幼儿园？",
      "孩子写字总是坐不住？",
      "幼小衔接阅读怎么安排？"
    ]);
    assert.equal(storage.get("xiaowanzi_topic_prompt_cache_v2").length, 4);
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("Xiaowanzi home send allows generic questions before child binding", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map([
    ["xf_token", "token-1"],
    ["xf_user", { _id: "user-1", mobile: "13500003069" }],
    ["xiaowanzi_native_session_index_v1", [
      { id: "session-other", title: "你是谁", sub: "7/8 11:57", targetId: "user-other", updatedAt: "2026-07-08T03:57:00.000Z" }
    ]],
    ["xiaowanzi_native_session_messages_v1:session-other", [
      { id: "user-other", role: "user", content: "你是谁", ts: "2026-07-08T03:57:00.000Z" },
      { id: "assistant-other", role: "assistant", content: "我是小玩子。", ts: "2026-07-08T03:58:00.000Z" }
    ]]
  ]);
  const messageCalls = [];
  const context = {
    ...definition,
    data: {
      ...definition.data,
      homeMode: true,
      inputValue: "",
      inputReady: true,
      selectedHomePrompt: "没有关联孩子也想先问一下"
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    openArchivePanel() {
      this.archiveOpened = true;
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.wx.request = (options) => {
      const url = String(options.url || "");
      if (url.includes("/api/v1/tutorbot/xiaowanzi_debug_bot/messages")) {
        messageCalls.push(options);
        options.success({ statusCode: 200, data: { content: "可以先给你通用建议。" } });
        return;
      }
      options.success({ statusCode: 200, data: {} });
    };

    definition.openHistoryDrawer.call(context);
    assert.equal(context.data.historyCards.some((item) => item.title === "你是谁"), false);

    definition.handleSend.call(context);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(context.archiveOpened, undefined);
    assert.equal(messageCalls.length, 1);
    assert.match(messageCalls[0].data.content, /当前为通用咨询模式/);
    assert.match(messageCalls[0].data.content, /用户未选择孩子档案/);
    assert.equal(context.data.sending, false);
    assert.equal(context.data.homeMode, true);
    assert.equal(context.data.inputValue, "");
    assert.equal(context.data.inputReady, false);
    assert.equal(context.data.selectedHomePrompt, "");
    assert.ok(context.data.messages.some((message) => message.content === "可以先给你通用建议。"));
    assert.deepEqual(context.data.homeConversationMessages.map((message) => message.role), ["user", "assistant"]);
    assert.ok(context.data.homeConversationMessages.some((message) => message.content === "可以先给你通用建议。"));
    assert.equal(storage.has("xiaowanzi_native_history_v1:global"), false);
    assert.equal(storage.has("xiaowanzi_native_history_v1:global:user-1"), true);
    const sessionIndex = storage.get("xiaowanzi_native_session_index_v1:user-1");
    assert.equal(sessionIndex.length, 1);
    assert.equal(sessionIndex[0].title, "没有关联孩子也想先问一下");
    assert.equal(sessionIndex[0].childTag, "");
    assert.equal(storage.get("xiaowanzi_native_session_index_v1")[0].title, "你是谁");
    const sessionId = storage.get("xiaowanzi_native_active_session_id_v1:user-1");
    assert.ok(sessionId);
    assert.deepEqual(storage.get(`xiaowanzi_native_session_messages_v1:${sessionId}:user-1`).map((message) => message.role), ["user", "assistant"]);

    definition.startNewConversation.call(context);
    assert.equal(context.data.homeMode, true);
    assert.equal(context.data.selectedHomePrompt, "");
    assert.deepEqual(context.data.homeConversationMessages, []);
    assert.notEqual(storage.get("xiaowanzi_native_active_session_id_v1:user-1"), sessionId);

    definition.openHistoryDrawer.call(context);
    assert.equal(context.data.historyCards[0].sessionId, sessionId);
    assert.equal(context.data.historyCards[0].title, "没有关联孩子也想先问一下");
    definition.openHistoryCard.call(context, { currentTarget: { dataset: { id: sessionId } } });
    assert.equal(context.data.homeMode, false);
    assert.deepEqual(context.data.homeConversationMessages, []);
    assert.equal(storage.get("xiaowanzi_native_active_session_id_v1:user-1"), sessionId);
    assert.ok(context.data.messages.some((message) => message.content === "可以先给你通用建议。"));
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("Xiaowanzi contextual payload separates parent name from child name", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalGetStorageSync = global.wx.getStorageSync;
  const storage = new Map([
    ["xf_user", { profile: { displayName: "阿力" } }]
  ]);
  const context = {
    ...definition,
    loadChildMemory() {
      return Promise.resolve({ enabled: false, summary: "" });
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    const result = await definition.buildContextualContent.call(context, {
      id: "child-1",
      displayName: "小于阿尼",
      relation: "儿子",
      birthDate: "2024-03-01",
      grade: "托班"
    }, "2岁语言启蒙怎么做？");

    assert.match(result.contextualContent, /家长姓名:阿力/);
    assert.match(result.contextualContent, /孩子姓名:小于阿尼/);
    assert.match(result.contextualContent, /称呼用户:阿力/);
    assert.match(result.contextualContent, /不要把孩子姓名小于阿尼当作用户称呼/);
    assert.match(result.contextualContent, /禁止称呼用户为小于阿尼家长/);
    assert.match(result.contextualContent, /孩子关系:儿子/);
    assert.doesNotMatch(result.contextualContent, /咨询人:小于阿尼/);
    assert.doesNotMatch(result.contextualContent, /提问者身份:儿子/);
  } finally {
    global.wx.getStorageSync = originalGetStorageSync;
  }
});

test("Xiaowanzi assistant cards render topic Markdown as native tappable links", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const originalNavigateTo = global.wx.navigateTo;
  const originalGetWindowInfo = global.wx.getWindowInfo;
  const originalGetMenuButtonBoundingClientRect = global.wx.getMenuButtonBoundingClientRect;
  const storage = new Map([["xf_token", "token-1"]]);
  const navigations = [];
  const topicPath = "/topics/si-bian-ke-cheng-bao-ban-bi-yao-xing-fen-xi?xw_layer=1&xw_return=xiaowanzi";
  const context = {
    ...definition,
    data: {
      ...definition.data,
      homeMode: true,
      inputValue: "思辨课程报班必要性分析？",
      inputReady: true,
      selectedHomePrompt: ""
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.wx.getWindowInfo = () => ({ windowWidth: 430, screenHeight: 932, safeArea: { bottom: 898 } });
    global.wx.getMenuButtonBoundingClientRect = () => ({ top: 59, left: 314, height: 32 });
    global.wx.request = (options) => {
      const url = String(options.url || "");
      if (url.includes("/api/v1/tutorbot/xiaowanzi_debug_bot/messages")) {
        options.success({
          statusCode: 200,
          data: { content: `站内刚好有超详细的解答，直接甩给你～\n\n[思辨课程报班必要性分析](${topicPath})\n\n这期内容可以先听听里面的观点。` }
        });
        return;
      }
      options.success({ statusCode: 200, data: {} });
    };
    global.wx.navigateTo = (options) => {
      navigations.push(options);
    };

    definition.handleSend.call(context);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const assistant = context.data.messages.find((message) => message.role === "assistant" && message.content.includes("思辨课程报班必要性分析"));
    assert.ok(assistant);
    assert.deepEqual(assistant.contentParts.map((part) => part.type), ["text", "link", "text"]);
    assert.equal(assistant.contentParts[0].text, "站内刚好有超详细的解答，直接甩给你～");
    assert.equal(assistant.contentParts[1].text, "思辨课程报班必要性分析");
    assert.equal(assistant.contentParts[1].url, topicPath);
    assert.equal(assistant.contentParts[2].text, "这期内容可以先听听里面的观点。");
    assert.equal(/\n\s*$/.test(assistant.contentParts[0].text), false);
    assert.equal(/^\s*\n/.test(assistant.contentParts[2].text), false);
    assert.equal(context.data.homeConversationMessages.at(-1).contentParts[1].url, topicPath);

    definition.openMessageLink.call(context, {
      currentTarget: {
        dataset: {
          url: assistant.contentParts[1].url,
          title: assistant.contentParts[1].text
        }
      }
    });

    const wrapperUrl = new URL(navigations[0].url, "https://mini.local");
    assert.equal(wrapperUrl.pathname, "/pages/webview/index");
    assert.equal(wrapperUrl.searchParams.get("nativeTopic"), "1");
    assert.equal(wrapperUrl.searchParams.get("topicSlug"), "si-bian-ke-cheng-bao-ban-bi-yao-xing-fen-xi");
    assert.equal(wrapperUrl.searchParams.get("title"), "思辨课程报班必要性分析");
    assert.equal(wrapperUrl.searchParams.has("url"), false);
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
    global.wx.navigateTo = originalNavigateTo;
    global.wx.getWindowInfo = originalGetWindowInfo;
    global.wx.getMenuButtonBoundingClientRect = originalGetMenuButtonBoundingClientRect;
  }
});

test("Xiaowanzi assistant content links route reading lists to the native reading tab", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalNavigateTo = global.wx.navigateTo;
  const originalSwitchTab = global.wx.switchTab;
  const navigations = [];
  const switches = [];
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.navigateTo = (options) => {
      navigations.push(options);
    };
    global.wx.switchTab = (options) => {
      switches.push(options);
    };

    definition.openMessageLink.call(context, {
      currentTarget: {
        dataset: {
          url: "/reading?xw_layer=1&xw_return=xiaowanzi",
          title: "及阅图书"
        }
      }
    });

    assert.deepEqual(switches, [{ url: "/pages/reading/index" }]);
    assert.equal(navigations.length, 0);
  } finally {
    global.wx.navigateTo = originalNavigateTo;
    global.wx.switchTab = originalSwitchTab;
  }
});

test("Xiaowanzi assistant book links open details or native search results by link precision", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalNavigateTo = global.wx.navigateTo;
  const originalSwitchTab = global.wx.switchTab;
  const navigations = [];
  const switches = [];
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.navigateTo = (options) => {
      navigations.push(options);
    };
    global.wx.switchTab = (options) => {
      switches.push(options);
    };

    definition.openMessageLink.call(context, {
      currentTarget: {
        dataset: {
          url: "/reading/book-detail-1?xw_layer=1&xw_return=xiaowanzi",
          title: "有详情的书"
        }
      }
    });
    definition.openMessageLink.call(context, {
      currentTarget: {
        dataset: {
          url: "/reading?q=%E7%AC%AC%E4%B8%80%E6%AC%A1%E4%B8%8A%E8%A1%97&xw_layer=1&xw_return=xiaowanzi",
          title: "第一次上街"
        }
      }
    });
    definition.openMessageLink.call(context, {
      currentTarget: {
        dataset: {
          url: "/reading?xw_layer=1&xw_return=xiaowanzi",
          title: "第一次上街买东西"
        }
      }
    });

    assert.equal(switches.length, 0);
    assert.equal(navigations.length, 3);
    assert.match(navigations[0].url, /pages\/webview\/index\?url=/);
    assert.equal(new URL(navigations[0].url, "https://mini.local").searchParams.get("url"), "/reading/book-detail-1");
    assert.equal(navigations[1].url, "/pages/search/index?q=%E7%AC%AC%E4%B8%80%E6%AC%A1%E4%B8%8A%E8%A1%97&source=reading&readingSource=native");
    assert.equal(navigations[2].url, "/pages/search/index?q=%E7%AC%AC%E4%B8%80%E6%AC%A1%E4%B8%8A%E8%A1%97%E4%B9%B0%E4%B8%9C%E8%A5%BF&source=reading&readingSource=native");
  } finally {
    global.wx.navigateTo = originalNavigateTo;
    global.wx.switchTab = originalSwitchTab;
  }
});

test("Xiaowanzi assistant site index links route to native mini program detail surfaces", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalNavigateTo = global.wx.navigateTo;
  const originalSwitchTab = global.wx.switchTab;
  const navigations = [];
  const switches = [];
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.navigateTo = (options) => {
      navigations.push(options);
    };
    global.wx.switchTab = (options) => {
      switches.push(options);
    };

    [
      { url: "/programs/006-yuwen-xuexi?xw_layer=1&xw_return=xiaowanzi", title: "语文学习节目" },
      { url: "https://xianfeng.xinzhi.info/materials/reading-test?xw_layer=1&xw_return=xiaowanzi", title: "阅读测试资料" },
      { url: "/experts/teacher-xia?xw_layer=1&xw_return=xiaowanzi", title: "夏老师" },
      { url: "/worthbuy/game-guide?xw_layer=1&xw_return=xiaowanzi", title: "游戏选择" }
    ].forEach((item) => {
      definition.openMessageLink.call(context, {
        currentTarget: { dataset: item }
      });
    });

    assert.deepEqual(switches, []);
    assert.equal(navigations.length, 4);
    const programUrl = new URL(navigations[0].url, "https://mini.local");
    assert.equal(programUrl.pathname, "/pages/webview/index");
    assert.equal(programUrl.searchParams.get("url"), "/programs/006-yuwen-xuexi");
    assert.equal(programUrl.searchParams.get("title"), "语文学习节目");
    const materialUrl = new URL(navigations[1].url, "https://mini.local");
    assert.equal(materialUrl.pathname, "/pages/webview/index");
    assert.equal(materialUrl.searchParams.get("url"), "/materials/reading-test");
    const expertUrl = new URL(navigations[2].url, "https://mini.local");
    assert.equal(expertUrl.pathname, "/pages/webview/index");
    assert.equal(expertUrl.searchParams.get("url"), "/experts/teacher-xia");
    assert.equal(navigations[3].url, "/pages/worthbuy-detail/index?query=game-guide");
    assert.equal(navigations.some((item) => String(item.url || "").includes("xianfeng.xinzhi.info")), false);
  } finally {
    global.wx.navigateTo = originalNavigateTo;
    global.wx.switchTab = originalSwitchTab;
  }
});

test("Xiaowanzi assistant cards format Markdown-like document replies", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const originalNavigateTo = global.wx.navigateTo;
  const originalGetWindowInfo = global.wx.getWindowInfo;
  const originalGetMenuButtonBoundingClientRect = global.wx.getMenuButtonBoundingClientRect;
  const storage = new Map([["xf_token", "token-1"]]);
  const referencePath = "/topics/you-er-bao-hu-yan-jing?xw_layer=1&xw_return=xiaowanzi";
  const markdownReply = [
    "哎呀，这句话有点小模糊哦～我来猜猜看～",
    "",
    "**如果是问“什么时候让宝宝做某件事”，比如开始某种训练或培养习惯：**",
    "",
    "下圆子现在才刚满2天大，这个阶段核心就是“按需回应”。",
    "",
    "**如果是问“什么时候该让宝宝自己做决定”：**",
    "",
    "对于新生儿来说，**现在就是让宝宝“做主”的时候** 😂！比如：",
    "- 宝宝张嘴找乳头/奶嘴时→让喂奶",
    "- 宝宝揉眼睛打哈欠时→让睡觉",
    "",
    `[046.对话从业20年儿科主任：孩子明明很健康，为什么还要定期做儿保？](${referencePath})`,
    "",
    "慢慢来，育儿路上小玩子随时陪你～"
  ].join("\n");
  const navigations = [];
  const context = {
    ...definition,
    data: {
      ...definition.data,
      homeMode: true,
      inputValue: "让我的时候",
      inputReady: true,
      selectedHomePrompt: ""
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.wx.getWindowInfo = () => ({ windowWidth: 430, screenHeight: 932, safeArea: { bottom: 898 } });
    global.wx.getMenuButtonBoundingClientRect = () => ({ top: 59, left: 314, height: 32 });
    global.wx.request = (options) => {
      const url = String(options.url || "");
      if (url.includes("/api/v1/tutorbot/xiaowanzi_debug_bot/messages")) {
        options.success({
          statusCode: 200,
          data: { content: markdownReply }
        });
        return;
      }
      options.success({ statusCode: 200, data: {} });
    };
    global.wx.navigateTo = (options) => {
      navigations.push(options);
    };

    definition.handleSend.call(context);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const assistant = context.data.messages.find((message) => message.role === "assistant" && message.content === markdownReply);
    assert.ok(assistant);
    assert.deepEqual(assistant.contentParts.map((part) => part.type), [
      "md_paragraph",
      "md_heading",
      "md_paragraph",
      "md_heading",
      "md_paragraph",
      "md_list_item",
      "md_list_item",
      "link",
      "md_paragraph"
    ]);
    assert.equal(assistant.contentParts[1].text, "如果是问“什么时候让宝宝做某件事”，比如开始某种训练或培养习惯：");
    assert.doesNotMatch(assistant.contentParts[1].text, /\*\*/);
    assert.equal(assistant.contentParts[4].text, "对于新生儿来说，现在就是让宝宝“做主”的时候 😂！比如：");
    assert.equal(assistant.contentParts[5].text, "宝宝张嘴找乳头/奶嘴时→让喂奶");
    assert.equal(assistant.contentParts[7].text, "046.对话从业20年儿科主任：孩子明明很健康，为什么还要定期做儿保？");
    assert.equal(assistant.contentParts[7].url, referencePath);
    assert.equal(assistant.contentParts[8].text, "慢慢来，育儿路上小玩子随时陪你～");
    assert.equal(context.data.homeConversationMessages.at(-1).contentParts[1].type, "md_heading");
    assert.equal(context.data.homeConversationMessages.at(-1).contentParts[7].type, "link");

    definition.openMessageLink.call(context, {
      currentTarget: {
        dataset: {
          url: assistant.contentParts[7].url,
          title: assistant.contentParts[7].text
        }
      }
    });
    assert.equal(navigations.length, 1);
    const topicNavigation = new URL(navigations[0].url, "https://mini.local");
    assert.equal(topicNavigation.pathname, "/pages/webview/index");
    assert.equal(topicNavigation.searchParams.get("nativeTopic"), "1");
    assert.equal(topicNavigation.searchParams.get("topicSlug"), "you-er-bao-hu-yan-jing");
    assert.equal(topicNavigation.searchParams.has("url"), false);

    const { wxml, wxss } = readPage("xiaowanzi");
    assert.match(wxml, /part\.type === 'md_heading'/);
    assert.match(wxml, /part\.type === 'md_list_item'/);
    assert.match(wxss, /\.xf-xiaowanzi-md-heading \{/);
    assert.match(wxss, /\.xf-xiaowanzi-md-list-item \{/);
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
    global.wx.navigateTo = originalNavigateTo;
    global.wx.getWindowInfo = originalGetWindowInfo;
    global.wx.getMenuButtonBoundingClientRect = originalGetMenuButtonBoundingClientRect;
  }
});

test("Xiaowanzi assistant cards keep program links inside Markdown list replies", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map([["xf_token", "token-1"]]);
  const programPath = "/programs/006-yuwen-xuexi?xw_layer=1&xw_return=xiaowanzi";
  const markdownReply = [
    "推荐你收听这几期节目：",
    "",
    `- **[006.中考命题人视角下的语文学习，作文写不好不是孩子的问题](${programPath})**`,
    "- 先从阅读兴趣开始，不急着刷题"
  ].join("\n");
  const context = {
    ...definition,
    data: {
      ...definition.data,
      homeMode: true,
      inputValue: "语文启蒙节目推荐",
      inputReady: true,
      selectedHomePrompt: ""
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.wx.request = (options) => {
      const url = String(options.url || "");
      if (url.includes("/api/v1/tutorbot/xiaowanzi_debug_bot/messages")) {
        options.success({
          statusCode: 200,
          data: { content: markdownReply }
        });
        return;
      }
      options.success({ statusCode: 200, data: {} });
    };

    definition.handleSend.call(context);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const assistant = context.data.messages.find((message) => message.role === "assistant" && message.content === markdownReply);
    assert.ok(assistant);
    assert.deepEqual(assistant.contentParts.map((part) => part.type), [
      "md_paragraph",
      "link",
      "md_list_item"
    ]);
    assert.equal(assistant.contentParts[1].text, "006.中考命题人视角下的语文学习，作文写不好不是孩子的问题");
    assert.equal(assistant.contentParts[1].url, programPath);
    assert.equal(assistant.contentParts.some((part) => part.text === "**"), false);
    assert.equal(context.data.homeConversationMessages.at(-1).contentParts[1].type, "link");
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("Xiaowanzi assistant cards format emoji bold Markdown headings", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map([["xf_token", "token-1"]]);
  const markdownReply = [
    "然后通用建议来啦（如果和你的情况不完全一样，可以灵活调整喔）：",
    "",
    "🌈**给每个孩子一段“专属时光”**",
    "每天抽10分钟只陪一个娃，聊聊天、读绘本或者玩个小游戏。",
    "",
    "🌈**不比较，只夸具体行为**",
    "比如今天主动帮弟弟拿水，好有责任感。",
    "",
    "🌈**建立“我们是队友”的小仪式**",
    "比如一起给小宝过生日时，让大宝协助吹蜡烛。"
  ].join("\n");
  const context = {
    ...definition,
    data: {
      ...definition.data,
      homeMode: true,
      inputValue: "二胎家庭怎么平衡？",
      inputReady: true,
      selectedHomePrompt: ""
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.wx.request = (options) => {
      const url = String(options.url || "");
      if (url.includes("/api/v1/tutorbot/xiaowanzi_debug_bot/messages")) {
        options.success({
          statusCode: 200,
          data: { content: markdownReply }
        });
        return;
      }
      options.success({ statusCode: 200, data: {} });
    };

    definition.handleSend.call(context);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const assistant = context.data.messages.find((message) => message.role === "assistant" && message.content === markdownReply);
    assert.ok(assistant);
    assert.deepEqual(assistant.contentParts.map((part) => part.type), [
      "md_paragraph",
      "md_heading",
      "md_paragraph",
      "md_heading",
      "md_paragraph",
      "md_heading",
      "md_paragraph"
    ]);
    assert.equal(assistant.contentParts[1].text, "🌈给每个孩子一段“专属时光”");
    assert.equal(assistant.contentParts[3].text, "🌈不比较，只夸具体行为");
    assert.doesNotMatch(assistant.contentParts.map((part) => part.text).join("\n"), /\*\*/);
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("Xiaowanzi history follow-up pending reuses the animated thinking pill", () => {
  const { wxml } = readPage("xiaowanzi");
  assert.match(wxml, /class="xf-xiaowanzi-assistant-panel \{\{item\.pending \? 'is-thinking' : ''\}\}"/);
  assert.match(wxml, /class="xf-xiaowanzi-assistant-panel \{\{item\.pending \? 'is-thinking' : ''\}\}"[\s\S]*wx:if="\{\{item\.pending\}\}" class="xf-xiaowanzi-home-thinking"[\s\S]*class="xf-xiaowanzi-thinking-dot is-strong"[\s\S]*小玩子思考中[\s\S]*wx:else class="xf-xiaowanzi-assistant-card"/);
});

test("Xiaowanzi share image uses native canvas preview instead of placeholder toast", async () => {
  const { js, wxml, wxss } = readPage("xiaowanzi");
  assert.match(wxml, /wx:if="\{\{shareImagePreviewOpen\}\}" class="xf-xiaowanzi-share-preview-mask" catchtap="closeShareImagePreview"/);
  assert.match(wxml, /wx:if="\{\{shareImagePreviewOpen\}\}" class="xf-xiaowanzi-share-preview-panel" style="top: \{\{sharePreviewTop\}\}px;">/);
  assert.match(wxml, /class="xf-xiaowanzi-share-preview-title"[\s\S]*分享卡片预览/);
  assert.match(wxml, /class="xf-xiaowanzi-share-preview-scroll" scroll-y enhanced enable-flex/);
  assert.match(wxml, /class="xf-xiaowanzi-share-preview-image" src="\{\{shareImagePath\}\}" mode="widthFix"/);
  assert.match(wxml, /class="xf-xiaowanzi-share-preview-guide"[\s\S]*长按预览图片，或点击下方按钮保存/);
  assert.match(wxml, /class="xf-xiaowanzi-share-preview-save"[\s\S]*catchtap="saveGeneratedShareImage"[\s\S]*下载图片/);
  assert.match(wxml, /<canvas wx:if="\{\{shareCanvasMounted\}\}" canvas-id="xiaowanziShareCanvas" class="xf-xiaowanzi-share-canvas" width="750" height="\{\{shareCanvasHeight\}\}" style="width: 750px; height: \{\{shareCanvasHeight\}\}px;"><\/canvas>/);
  assert.match(wxss, /\.xf-xiaowanzi-share-preview-panel \{[\s\S]*display: flex;[\s\S]*flex-direction: column;[\s\S]*overflow: hidden;/);
  assert.match(wxss, /\.xf-xiaowanzi-share-preview-panel \{[\s\S]*left: 10rpx;[\s\S]*right: 10rpx;/);
  assert.doesNotMatch(wxss, /\.xf-xiaowanzi-share-preview-panel \{[\s\S]*top: 7vh;/);
  assert.match(wxss, /\.xf-xiaowanzi-share-preview-scroll \{[\s\S]*flex: 1 1 auto;[\s\S]*min-height: 0;[\s\S]*padding: 18rpx 16rpx 22rpx;/);
  assert.match(wxss, /\.xf-xiaowanzi-share-preview-actions \{[\s\S]*flex: 0 0 auto;/);
  assert.doesNotMatch(wxss, /\.xf-xiaowanzi-share-canvas \{[\s\S]*height: 1200px;/);
  assert.doesNotMatch(js, /drawRoundRect\(ctx, qrPanelX, qrPanelY, qrPanelWidth, qrPanelHeight, 34\);/);
  assert.match(js, /function buildShareMarkdownDocumentContentParts\(content\)/);
  assert.match(js, /function shareCanvasLineTopGap\(lines, index\)/);
  assert.match(js, /function shareCanvasSiteCardBottomGap\(lines, index\)/);
  assert.match(js, /function shareCanvasLinkMetrics\(ctx, text, fontSize, maxWidth\)/);
  assert.match(js, /function drawShareCanvasSiteCard\(ctx, line, x, y, width, fontSize\)/);
  assert.match(js, /function drawShareCanvasSiteCardArrow\(ctx, x, y, size\)/);
  assert.match(js, /ctx\.fillText\("↗"/);
  assert.match(js, /buildShareCanvasContentParts\(message\.content, message\.contentParts\)/);
  assert.match(js, /const \{ request, buildUrl \} = require\("\.\.\/\.\.\/utils\/request"\)/);
  assert.match(js, /function loadShareQrImagePath\(messages\)/);
  assert.match(js, /const cacheKey = `\$\{shareId\}:\$\{SHARE_CARD_QR_CACHE_VERSION\}`/);
  assert.match(js, /shareQrImageCache\[cacheKey\]/);
  assert.match(js, /function createXiaowanziConversationShare\(messages\)/);
  assert.match(js, /function currentMiniProgramEnvVersion\(\)/);
  assert.match(js, /function xiaowanziShareQrUrl\(shareId\)/);
  assert.match(js, /envVersion && envVersion !== "release"/);
  assert.match(js, /envVersion=\$\{encodeURIComponent\(envVersion\)\}/);
  assert.match(js, /function arrayBufferJsonMessage\(value\)/);
  assert.match(js, /\/api\/wechat-mini\/xiaowanzi-shares/);
  assert.match(js, /const params = \[`shareId=\$\{encodeURIComponent\(shareId\)\}`, "transparent=1", "v=2"\]/);
  assert.match(js, /\/api\/wechat-mini\/xiaowanzi-share-qrcode\?\$\{params\.join\("&"\)\}/);
  assert.match(js, /responseType: "arraybuffer"/);
  assert.match(js, /fs\.writeFile\(\{/);
  assert.doesNotMatch(js, /wx\.downloadFile/);
  assert.doesNotMatch(js, /resolve\(SHARE_CARD_QR_IMAGE\)/);
  assert.match(js, /siteCard: \{[\s\S]*borderColor: "rgba\(126, 95, 255, 0\.22\)"[\s\S]*backgroundStart: "rgba\(255, 255, 255, 0\.82\)"[\s\S]*textColor: "#2a2350"[\s\S]*marginY: 3/);
  assert.match(js, /drawShareImageCanvas\(drawCtx, messages, shareCanvasHeight, qrImagePath\)/);

  const definition = loadPageDefinition("xiaowanzi");
  const originalCreateCanvasContext = global.wx.createCanvasContext;
  const originalCanvasToTempFilePath = global.wx.canvasToTempFilePath;
  const originalRequest = global.wx.request;
  const originalGetFileSystemManager = global.wx.getFileSystemManager;
  const originalGetAccountInfoSync = global.wx.getAccountInfoSync;
  const originalEnv = global.wx.env;
  const originalPreviewImage = global.wx.previewImage;
  const originalSaveImageToPhotosAlbum = global.wx.saveImageToPhotosAlbum;
  const drawnTexts = [];
  const drawnTextRuns = [];
  const drawnImages = [];
  const drawnRects = [];
  const drawnPaths = [];
  const measuredFontSizes = [];
  const previews = [];
  const savedFiles = [];
  const qrRequests = [];
  const writtenFiles = [];
  let currentFontSize = 10;
  let currentFillStyle = "#000000";
  let currentStrokeStyle = "#000000";
  let currentLineWidth = 1;
  let currentTextAlign = "center";
  let currentPath = [];
  const context = {
    ...definition,
    data: {
      ...definition.data,
      messages: [
        { id: "user-1", role: "user", content: "窝沟封闭黄金年龄？" },
        { id: "assistant-1", role: "assistant", content: "乳磨牙3-4岁，[窝沟封闭黄金年龄](/topics/wo-gou-feng-bi?xw_layer=1&xw_return=xiaowanzi)，第一恒磨牙6-7岁，第二恒磨牙12-13岁。也可以参考[22 如何利用阅读测试.m4a](/materials/reading-test?xw_layer=1&xw_return=xiaowanzi)、[儿童牙齿护理清单](/topics/tooth-care?xw_layer=1&xw_return=xiaowanzi)、[低龄阅读启蒙](/topics/early-reading?xw_layer=1&xw_return=xiaowanzi)、[亲子沟通复盘](/topics/parent-chat?xw_layer=1&xw_return=xiaowanzi)。" },
        { id: "user-2", role: "user", content: "低年级历史启蒙书单？" },
        {
          id: "assistant-2",
          role: "assistant",
          content: [
            "**关于历史启蒙：**",
            "",
            "[低年级历史启蒙书单](/topics/history-books?xw_layer=1&xw_return=xiaowanzi)",
            "可以先从人物故事、朝代脉络、地图材料三条线一起进入，保留兴趣比刷题更重要。",
            "",
            "- 先用故事线建立兴趣"
          ].join("\n")
        },
        { id: "user-3", role: "user", content: "孩子做题拖拉怎么办？" },
        { id: "assistant-3", role: "assistant", content: "先拆小任务，再给可见反馈，最后复盘阻塞点。第六条回答也必须进入分享图片，不可以被固定高度截掉。" }
      ],
      selectedMessageIds: ["assistant-1", "assistant-2", "assistant-3"],
      selectedMessageMap: { "assistant-1": true, "assistant-2": true, "assistant-3": true },
      shareRoundCount: 3,
      shareImageGenerating: false,
      shareCanvasMounted: false,
      shareCanvasHeight: 1200,
      shareImagePreviewOpen: false,
      shareImagePath: ""
    },
    setData(payload, callback) {
      this.data = { ...this.data, ...payload };
      if (typeof callback === "function") callback();
    }
  };
  const canvasContext = new Proxy({
    draw(_reserve, callback) {
      callback();
    },
    setFontSize(size) {
      currentFontSize = Number(size) || currentFontSize;
    },
    setFillStyle(style) {
      currentFillStyle = String(style || "");
    },
    setStrokeStyle(style) {
      currentStrokeStyle = String(style || "");
    },
    setLineWidth(width) {
      currentLineWidth = Number(width) || 1;
    },
    setLineCap() {},
    setLineJoin() {},
    setTextAlign(align) {
      currentTextAlign = String(align || "");
    },
    fillText(text, x, y) {
      const value = String(text);
      drawnTexts.push(value);
      drawnTextRuns.push({ text: value, x: Number(x) || 0, y: Number(y) || 0, fontSize: currentFontSize, fillStyle: currentFillStyle, textAlign: currentTextAlign });
    },
    drawImage(image, x, y, width, height) {
      drawnImages.push([image, x, y, width, height]);
    },
    fillRect(x, y, width, height) {
      drawnRects.push({ x, y, width, height, fillStyle: currentFillStyle });
    },
    beginPath() {
      currentPath = [];
    },
    moveTo(x, y) {
      currentPath.push({ op: "moveTo", x, y });
    },
    lineTo(x, y) {
      currentPath.push({ op: "lineTo", x, y });
    },
    stroke() {
      drawnPaths.push({ path: currentPath, strokeStyle: currentStrokeStyle, lineWidth: currentLineWidth });
    },
    arcTo: undefined,
    measureText(text) {
      measuredFontSizes.push(currentFontSize);
      return { width: String(text || "").replace(/[^\x00-\xff]/g, "xx").length * currentFontSize * 0.5 };
    }
  }, {
    get(target, property) {
      if (property in target) return target[property];
      return () => undefined;
    }
  });

  try {
    global.wx.env = { USER_DATA_PATH: "/tmp" };
    global.wx.getAccountInfoSync = () => ({ miniProgram: { envVersion: "develop" } });
    global.wx.createCanvasContext = (canvasId, page) => {
      assert.equal(canvasId, "xiaowanziShareCanvas");
      assert.equal(page, context);
      return canvasContext;
    };
    global.wx.canvasToTempFilePath = (options, page) => {
      assert.equal(options.canvasId, "xiaowanziShareCanvas");
      assert.equal(options.width, 750);
      assert.equal(options.height, context.data.shareCanvasHeight);
      assert.ok(options.height > 1200);
      assert.equal(options.destHeight, options.height);
      assert.equal(page, context);
      options.success({ tempFilePath: "/tmp/xiaowanzi-share.png" });
    };
    global.wx.request = (options) => {
      if (String(options.url).includes("/api/wechat-mini/xiaowanzi-shares") && options.method === "POST") {
        qrRequests.push(options);
        options.success({ statusCode: 200, data: { id: "share-abc123" } });
        return;
      }
      qrRequests.push(options);
      options.success({ statusCode: 200, data: new ArrayBuffer(8) });
    };
    global.wx.getFileSystemManager = () => ({
      writeFile(options) {
        writtenFiles.push(options);
        options.success();
      }
    });
    global.wx.previewImage = (options) => {
      previews.push(options);
    };
    global.wx.saveImageToPhotosAlbum = (options) => {
      savedFiles.push(options.filePath);
      options.success();
    };

    definition.generateShareImage.call(context);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(context.data.shareImageGenerating, false);
    assert.equal(context.data.shareCanvasMounted, false);
    assert.equal(context.data.shareImagePreviewOpen, true);
    assert.equal(context.data.shareImagePath, "/tmp/xiaowanzi-share.png");
    assert.equal(context.data.shareSelectionMode, false);
    assert.deepEqual(previews, []);
    assert.equal(qrRequests.length, 2);
    assert.match(qrRequests[0].url, /\/api\/wechat-mini\/xiaowanzi-shares$/);
    assert.equal(qrRequests[0].data.messages[1].content.includes("[窝沟封闭黄金年龄](/topics/wo-gou-feng-bi?xw_layer=1&xw_return=xiaowanzi)"), true);
    assert.equal(qrRequests[0].method, "POST");
    assert.equal(qrRequests[0].data.messages[0].role, "user");
    assert.equal(qrRequests[0].data.messages[1].role, "assistant");
    assert.match(qrRequests[1].url, /\/api\/wechat-mini\/xiaowanzi-share-qrcode\?shareId=share-abc123&transparent=1&v=2&envVersion=develop/);
    assert.equal(qrRequests[1].responseType, "arraybuffer");
    assert.equal(writtenFiles.length, 1);
    assert.equal(writtenFiles[0].filePath, "/tmp/xiaowanzi-conversation-qrcode-transparent-v2-share-abc123.png");
    assert.ok(drawnImages.some((image) => image[0] === "/assets/xiaowanzi-icons/share-logo.png" && image[1] === 265 && image[2] === 138));
    assert.equal(drawnTexts.includes("先疯智库"), false);
    assert.ok(drawnImages.some((image) => image[0] === "/tmp/xiaowanzi-conversation-qrcode-transparent-v2-share-abc123.png" && image[1] === 305 && image[2] === context.data.shareCanvasHeight - 364));
    assert.ok(drawnTexts.some((text) => text.includes("窝沟封闭黄金年龄？")));
    assert.ok(drawnTexts.some((text) => text.includes("乳磨牙3-4岁")));
    assert.ok(drawnTexts.includes("↗"));
    assert.ok(drawnTextRuns.some((run) => run.text === "↗" && run.fontSize === 34 && run.fillStyle === "#6a42e8"));
    assert.ok(drawnTextRuns.some((run) => run.text === "窝沟封闭黄金年龄" && run.fillStyle === "#2a2350"));
    assert.ok(drawnRects.some((rect) => rect.fillStyle === "rgba(126, 95, 255, 0.22)" && rect.x === 58 && rect.width === 634));
    assert.ok(drawnRects.some((rect) => rect.fillStyle === "rgba(247, 243, 255, 0.98)" && rect.x === 59 && rect.width === 632));
    const firstSiteCardRect = drawnRects.find((rect) => rect.fillStyle === "rgba(126, 95, 255, 0.22)" && rect.x === 58 && rect.width === 634);
    const firstPostSiteCardRun = drawnTextRuns.find((run) => run.text.includes("，第一恒磨牙") && run.x === 58 && run.fontSize === 28);
    assert.ok(firstSiteCardRect);
    assert.ok(firstPostSiteCardRun);
    assert.ok(firstPostSiteCardRun.y - firstPostSiteCardRun.fontSize - (firstSiteCardRect.y + firstSiteCardRect.height) >= 8);
    assert.ok(drawnTexts.join("\n").includes("站内引用：搜索以下标题"));
    assert.ok(drawnTexts.join("\n").includes("1. 「窝沟封闭黄金年龄」"));
    assert.ok(drawnTexts.join("\n").includes("2. 「22 如何利用阅读测试.m4a」"));
    assert.ok(drawnTexts.join("\n").includes("3. 「儿童牙齿护理清单」"));
    assert.ok(drawnTexts.join("\n").includes("4. 「低龄阅读启蒙」"));
    assert.ok(drawnTexts.join("\n").includes("5. 「亲子沟通复盘」"));
    assert.equal(drawnTexts.join("\n").includes("」或「"), false);
    assert.equal(drawnTexts.join("\n").includes("查看"), false);
    assert.ok(drawnTextRuns.some((run) => run.text.includes("窝沟封闭黄金年龄") && run.fontSize === 28 && run.fillStyle === "#2a2350"));
    assert.ok(drawnTexts.some((text) => text.includes("低年级历史启蒙书单")));
    assert.ok(drawnTextRuns.some((run) => run.text.includes("低年级历史启蒙书单") && run.fontSize === 28 && run.fillStyle === "#2a2350"));
    assert.ok(drawnTextRuns.some((run) => run.text.includes("• ") && run.fontSize === 28 && run.fillStyle === "#6d28f2"));
    const markdownHeadingRun = drawnTextRuns.find((run) => run.text.includes("关于历史启蒙") && run.fontSize === 28);
    const markdownLinkRun = drawnTextRuns.find((run) => run.text.includes("低年级历史启蒙书单") && run.fontSize === 28 && run.fillStyle === "#2a2350");
    assert.ok(markdownHeadingRun);
    assert.ok(markdownLinkRun);
    assert.ok(markdownLinkRun.y >= markdownHeadingRun.y + 58);
    assert.ok(drawnTexts.join("").includes("第六条回答也必须进入分享图片"));
    assert.ok(drawnTexts.some((text) => text.includes("扫描二维码，和小玩子继续聊")));
    assert.equal(drawnTexts.some((text) => text.includes("长按图片保存到相册")), false);
    assert.ok(drawnTexts.join("\n").includes("窝沟封闭黄金年龄"));
    assert.equal(drawnTexts.join("\n").includes("家长："), false);
    assert.equal(drawnTexts.join("\n").includes("小玩子："), false);
    assert.equal(drawnTexts.join("\n").includes("/topics/"), false);
    assert.equal(drawnTexts.join("\n").includes("]("), false);
    assert.ok(measuredFontSizes.length > 0);
    assert.deepEqual([...new Set(measuredFontSizes)].sort((a, b) => a - b), [24, 28]);
    assert.ok(drawnTextRuns.some((run) => run.text.includes("乳磨牙3-4岁") && run.x === 58 && run.fontSize === 28));
    const firstUserQuestionRun = drawnTextRuns.find((run) => run.text.includes("窝沟封闭黄金年龄？") && run.x >= 380 && run.fontSize === 28);
    assert.ok(firstUserQuestionRun);
    assert.equal(firstUserQuestionRun.textAlign, "left");
    assert.ok(firstUserQuestionRun.y > 350 && firstUserQuestionRun.y < 360);
    assert.ok(drawnTextRuns.some((run) => run.text.includes("扫描二维码，和小玩子继续聊") && run.textAlign === "center"));
    assert.ok(drawnTextRuns.some((run) => run.text.includes("站内引用：搜索以下标题") && run.fontSize === 24 && run.fillStyle === "#6d28f2"));
    assert.ok(drawnTextRuns.some((run) => run.text.includes("1. 「窝沟封闭黄金年龄」") && run.fontSize === 24 && run.fillStyle === "#6d28f2"));
    assert.ok(drawnTextRuns.some((run) => run.text.includes("2. 「22 如何利用阅读测试.m4a」") && run.fontSize === 24 && run.fillStyle === "#6d28f2"));
    assert.ok(drawnTextRuns.some((run) => run.text.includes("5. 「亲子沟通复盘」") && run.fontSize === 24 && run.fillStyle === "#6d28f2"));
    const firstAssistantRect = drawnRects.find((rect) => rect.fillStyle === "#ffffff" && rect.x === 28);
    const secondReferenceRun = drawnTextRuns.find((run) => run.text.includes("2. 「22 如何利用阅读测试.m4a」"));
    assert.ok(firstAssistantRect);
    assert.ok(secondReferenceRun);
    assert.ok(firstAssistantRect.y + firstAssistantRect.height - secondReferenceRun.y >= 38);
    for (const run of drawnTextRuns) {
      const width = run.text.replace(/[^\x00-\xff]/g, "xx").length * run.fontSize * 0.5;
      assert.ok(run.x + width <= 750, `${run.text} should stay inside the share image`);
    }

    definition.saveGeneratedShareImage.call(context);
    assert.deepEqual(savedFiles, ["/tmp/xiaowanzi-share.png"]);
    assert.equal(context.data.toastText, "已保存到相册");
  } finally {
    if (context.toastTimer) clearTimeout(context.toastTimer);
    global.wx.createCanvasContext = originalCreateCanvasContext;
    global.wx.canvasToTempFilePath = originalCanvasToTempFilePath;
    global.wx.request = originalRequest;
    global.wx.getFileSystemManager = originalGetFileSystemManager;
    global.wx.getAccountInfoSync = originalGetAccountInfoSync;
    global.wx.env = originalEnv;
    global.wx.previewImage = originalPreviewImage;
    global.wx.saveImageToPhotosAlbum = originalSaveImageToPhotosAlbum;
  }
});

test("Xiaowanzi share QR lets backend choose qrcode env for release clients", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalCreateCanvasContext = global.wx.createCanvasContext;
  const originalCanvasToTempFilePath = global.wx.canvasToTempFilePath;
  const originalRequest = global.wx.request;
  const originalGetFileSystemManager = global.wx.getFileSystemManager;
  const originalGetAccountInfoSync = global.wx.getAccountInfoSync;
  const originalEnv = global.wx.env;
  const qrRequests = [];
  const context = {
    ...definition,
    data: {
      ...definition.data,
      messages: [
        { id: "user-1", role: "user", content: "夏老师教育观点解析" },
        { id: "assistant-1", role: "assistant", content: "尊重与引导并行。" }
      ],
      selectedMessageIds: ["user-1", "assistant-1"],
      shareImageGenerating: false,
      shareCanvasMounted: false
    },
    setData(payload, callback) {
      this.data = { ...this.data, ...payload };
      if (typeof callback === "function") callback();
    }
  };

  try {
    global.wx.env = { USER_DATA_PATH: "/tmp" };
    global.wx.getAccountInfoSync = () => ({ miniProgram: { envVersion: "release" } });
    global.wx.createCanvasContext = () => ({
      draw(_reserve, callback) {
        if (typeof callback === "function") callback();
      },
      drawImage() {},
      setFillStyle() {},
      fillRect() {},
      setTextAlign() {},
      setFontSize() {},
      measureText(text) {
        return { width: String(text || "").length * 10 };
      }
    });
    global.wx.canvasToTempFilePath = (options) => options.success({ tempFilePath: "/tmp/share-release.png" });
    global.wx.request = (options) => {
      if (String(options.url).includes("/api/wechat-mini/xiaowanzi-shares") && options.method === "POST") {
        options.success({ statusCode: 200, data: { id: "share-release123" } });
        return;
      }
      qrRequests.push(options);
      options.success({ statusCode: 200, data: new ArrayBuffer(8) });
    };
    global.wx.getFileSystemManager = () => ({
      writeFile(options) {
        options.success();
      }
    });

    definition.generateShareImage.call(context);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(qrRequests.length, 1);
    assert.match(qrRequests[0].url, /\/api\/wechat-mini\/xiaowanzi-share-qrcode\?shareId=share-release123&transparent=1&v=2$/);
    assert.doesNotMatch(qrRequests[0].url, /envVersion=release/);
  } finally {
    global.wx.createCanvasContext = originalCreateCanvasContext;
    global.wx.canvasToTempFilePath = originalCanvasToTempFilePath;
    global.wx.request = originalRequest;
    global.wx.getFileSystemManager = originalGetFileSystemManager;
    global.wx.getAccountInfoSync = originalGetAccountInfoSync;
    global.wx.env = originalEnv;
  }
});

test("Xiaowanzi share image does not fall back to the website QR when mini-program code generation fails", async () => {
  const { js } = readPage("xiaowanzi");
  assert.doesNotMatch(js, /SHARE_CARD_QR_IMAGE/);
  assert.doesNotMatch(js, /\/assets\/xiaowanzi-share-qr\.png/);

  const definition = loadPageDefinition("xiaowanzi");
  const originalCreateCanvasContext = global.wx.createCanvasContext;
  const originalCanvasToTempFilePath = global.wx.canvasToTempFilePath;
  const originalRequest = global.wx.request;
  const originalGetFileSystemManager = global.wx.getFileSystemManager;
  const originalGetAccountInfoSync = global.wx.getAccountInfoSync;
  const originalEnv = global.wx.env;
  const toasts = [];
  const drawnImages = [];
  const context = {
    ...definition,
    data: {
      ...definition.data,
      messages: [
        { id: "assistant-1", role: "assistant", content: "参考[窝沟封闭黄金年龄](/topics/wo-gou-feng-bi)" }
      ],
      selectedMessageIds: ["assistant-1"],
      selectedMessageMap: { "assistant-1": true },
      shareImageGenerating: false,
      shareCanvasMounted: false,
      shareImagePreviewOpen: false,
      shareImagePath: ""
    },
    setData(payload, callback) {
      this.data = { ...this.data, ...payload };
      if (typeof callback === "function") callback();
    },
    showToast(text) {
      toasts.push(text);
    }
  };

  try {
    global.wx.env = { USER_DATA_PATH: "/tmp" };
    global.wx.getAccountInfoSync = () => ({ miniProgram: { envVersion: "develop" } });
    global.wx.createCanvasContext = () => ({
      drawImage(image) {
        drawnImages.push(image);
      },
      draw(_reserve, callback) {
        if (typeof callback === "function") callback();
      },
      setFillStyle() {},
      fillRect() {},
      setTextAlign() {},
      setFontSize() {},
      measureText(text) {
        return { width: String(text || "").length * 10 };
      }
    });
    global.wx.canvasToTempFilePath = (options) => options.success({ tempFilePath: "/tmp/share.png" });
    global.wx.request = (options) => {
      if (String(options.url).includes("/api/wechat-mini/xiaowanzi-shares") && options.method === "POST") {
        options.success({ statusCode: 200, data: { id: "share-fail123" } });
        return;
      }
      const encoded = new TextEncoder().encode(JSON.stringify({ error: "invalid page hint" }));
      options.success({ statusCode: 500, data: encoded.buffer });
    };
    global.wx.getFileSystemManager = () => ({
      writeFile(options) {
        options.success();
      }
    });

    definition.generateShareImage.call(context);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(context.data.shareImageGenerating, false);
    assert.equal(context.data.shareCanvasMounted, false);
    assert.equal(context.data.shareImagePreviewOpen, false);
    assert.deepEqual(drawnImages, []);
    assert.deepEqual(toasts, ["invalid page hint"]);
  } finally {
    global.wx.createCanvasContext = originalCreateCanvasContext;
    global.wx.canvasToTempFilePath = originalCanvasToTempFilePath;
    global.wx.request = originalRequest;
    global.wx.getFileSystemManager = originalGetFileSystemManager;
    global.wx.getAccountInfoSync = originalGetAccountInfoSync;
    global.wx.env = originalEnv;
  }
});

test("Xiaowanzi copied share content keeps display text and strips routed Markdown links", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalSetClipboardData = global.wx.setClipboardData;
  let clipboardText = "";
  const context = {
    ...definition,
    data: {
      ...definition.data,
      messages: [
        { id: "user-1", role: "user", content: "思辨课程报班必要性分析？" },
        { id: "assistant-1", role: "assistant", content: "站内刚好有超详细的解答：[思辨课程报班必要性分析](/topics/si-bian-ke-cheng-bao-ban-bi-yao-xing-fen-xi?xw_layer=1&xw_return=xiaowanzi)" }
      ],
      selectedMessageIds: ["user-1", "assistant-1"]
    },
    showToast(text) {
      this.data.toastText = text;
    }
  };

  try {
    global.wx.setClipboardData = (options) => {
      clipboardText = String(options.data || "");
      options.success();
    };

    definition.copySelectedMessages.call(context);

    assert.ok(clipboardText.includes("家长：思辨课程报班必要性分析？"));
    assert.ok(clipboardText.includes("小玩子：站内刚好有超详细的解答：思辨课程报班必要性分析"));
    assert.equal(clipboardText.includes("/topics/"), false);
    assert.equal(clipboardText.includes("]("), false);
    assert.equal(context.data.toastText, "已复制内容");
  } finally {
    global.wx.setClipboardData = originalSetClipboardData;
  }
});

test("Xiaowanzi share selection opens from a message, pairs the current round, and prepares a read-only share", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalRequest = global.wx.request;
  const shareRequests = [];
  const context = {
    ...definition,
    data: {
      ...definition.data,
      messages: [
        { id: "user-1", role: "user", content: "窝沟封闭黄金年龄？" },
        { id: "assistant-1", role: "assistant", content: "乳磨牙3-4岁，第一恒磨牙6-7岁。" },
        { id: "user-2", role: "user", content: "牛津树几岁开始？" },
        { id: "assistant-2", role: "assistant", content: "2-3岁可以先通过儿歌和绘本打基础。" }
      ],
      attachmentMenuOpen: true,
      historyDrawerOpen: true,
      shareSelectionMode: false,
      shareRevealMessageId: "",
      selectedMessageIds: [],
      selectedMessageMap: {},
      shareRoundCount: 0,
      selectedConversationShareId: "",
      selectedSharePreparing: false,
      selectedShareError: ""
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.request = (options) => {
      shareRequests.push(options);
      options.success({ statusCode: 200, data: { id: "share-abc123" } });
    };

    definition.handleMessageTap.call(context, {
      currentTarget: { dataset: { id: "assistant-2", role: "assistant" } }
    });
    assert.equal(context.data.shareRevealMessageId, "assistant-2");

    definition.openShareSelectionFromMessage.call(context, {
      currentTarget: { dataset: { id: "assistant-2" } }
    });

    assert.equal(context.data.shareSelectionMode, true);
    assert.equal(context.data.attachmentMenuOpen, false);
    assert.equal(context.data.historyDrawerOpen, false);
    assert.equal(context.data.shareRevealMessageId, "");
    assert.deepEqual(context.data.selectedMessageIds, ["assistant-2", "user-2"]);
    assert.deepEqual(context.data.selectedMessageMap, { "assistant-2": true, "user-2": true });
    assert.equal(context.data.shareRoundCount, 1);
    assert.equal(context.data.selectedSharePreparing, true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(context.data.selectedSharePreparing, false);
    assert.equal(context.data.selectedConversationShareId, "share-abc123");
    assert.equal(shareRequests.length, 1);
    assert.match(shareRequests[0].url, /\/api\/wechat-mini\/xiaowanzi-shares$/);
    assert.equal(shareRequests[0].method, "POST");
    assert.deepEqual(shareRequests[0].data.messages.map((message) => message.role), ["user", "assistant"]);

    definition.toggleShareMessage.call(context, {
      currentTarget: { dataset: { id: "user-2" } }
    });

    assert.deepEqual(context.data.selectedMessageIds, []);
    assert.deepEqual(context.data.selectedMessageMap, {});
    assert.equal(context.data.shareRoundCount, 0);
    assert.equal(context.data.selectedConversationShareId, "");
  } finally {
    global.wx.request = originalRequest;
  }
});

test("Xiaowanzi share selection uses the visible home conversation messages", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const context = {
    ...definition,
    data: {
      ...definition.data,
      homeMode: true,
      messages: [
        { id: "old-user", role: "user", content: "旧问题" },
        { id: "old-assistant", role: "assistant", content: "旧回答" }
      ],
      homeConversationMessages: [
        { id: "home-user", role: "user", content: "低龄幼儿阅读兴趣引导？" },
        { id: "home-assistant", role: "assistant", content: "先从亲子共读和短故事开始。" }
      ],
      shareSelectionMode: false,
      selectedMessageIds: [],
      selectedMessageMap: {},
      shareRoundCount: 0
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  definition.openShareSelectionFromMessage.call(context, {
    currentTarget: { dataset: { id: "home-assistant" } }
  });

  assert.equal(context.data.shareSelectionMode, true);
  assert.deepEqual(context.data.selectedMessageIds, ["home-assistant", "home-user"]);
  assert.deepEqual(context.data.selectedMessageMap, { "home-assistant": true, "home-user": true });
  assert.equal(context.data.shareRoundCount, 1);
});

test("Xiaowanzi attachment menu stays open during the layout scroll caused by opening it", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const context = {
    ...definition,
    data: {
      ...definition.data,
      homeMode: true,
      sending: false,
      attachmentMenuOpen: false,
      scrollIntoView: "old-anchor",
      knowledgePillCollapsed: false
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  definition.toggleAttachmentMenu.call(context);
  assert.equal(context.data.attachmentMenuOpen, true);
  assert.equal(context.data.scrollIntoView, "old-anchor");

  context.lastChatScrollTop = 0;
  definition.handleKnowledgePillScroll.call(context, { detail: { scrollTop: 40 } });
  assert.equal(context.data.attachmentMenuOpen, true);

  context.attachmentMenuOpenedAt = Date.now() - 1000;
  context.lastChatScrollTop = 0;
  definition.handleKnowledgePillScroll.call(context, { detail: { scrollTop: 40 } });
  assert.equal(context.data.attachmentMenuOpen, false);
});

test("Xiaowanzi WeChat share uses the selected conversation round when sharing from the sheet", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const defaultShare = definition.onShareAppMessage();
  const context = {
    ...definition,
    data: {
      ...definition.data,
      shareSelectionMode: true,
      selectedMessageIds: ["user-1", "assistant-1"],
      selectedConversationShareId: "share-abc123",
      messages: [
        { id: "user-1", role: "user", content: "窝沟封闭黄金年龄？" },
        { id: "assistant-1", role: "assistant", content: "乳磨牙3-4岁，第一恒磨牙6-7岁。" }
      ]
    }
  };

  const selectedShare = definition.onShareAppMessage.call(context);
  const shareUrl = new URL(selectedShare.path, "https://mini.local");

  assert.equal(defaultShare.title, "小玩子");
  assert.equal(defaultShare.path, "/pages/xiaowanzi/index");
  assert.equal(selectedShare.title, "小玩子：窝沟封闭黄金年龄？");
  assert.equal(shareUrl.pathname, "/pages/share/index");
  assert.equal(shareUrl.searchParams.get("sid"), "share-abc123");
  assert.equal(selectedShare.imageUrl, "/assets/share/xiaowanzi-nohat-cover.png");
});

test("Xiaowanzi WeChat share uses visible home conversation text in home mode", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const context = {
    ...definition,
    data: {
      ...definition.data,
      homeMode: true,
      shareSelectionMode: true,
      selectedMessageIds: ["home-user", "home-assistant"],
      selectedConversationShareId: "share-home123",
      messages: [
        { id: "old-user", role: "user", content: "旧问题不要分享" },
        { id: "old-assistant", role: "assistant", content: "旧回答不要分享" }
      ],
      homeConversationMessages: [
        { id: "home-user", role: "user", content: "低龄幼儿阅读兴趣引导？" },
        { id: "home-assistant", role: "assistant", content: "先从亲子共读和短故事开始。" }
      ]
    }
  };

  const selectedShare = definition.onShareAppMessage.call(context);

  assert.equal(selectedShare.title, "小玩子：低龄幼儿阅读兴趣引导？");
  assert.equal(selectedShare.imageUrl, "/assets/share/xiaowanzi-nohat-cover.png");
  assert.equal(selectedShare.path.includes("旧问题不要分享"), false);
  assert.match(selectedShare.path, /\/pages\/share\/index\?sid=share-home123/);
});

test("Xiaowanzi attachment actions stage native files and recognize on send", async () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalChooseMedia = global.wx.chooseMedia;
  const originalChooseImage = global.wx.chooseImage;
  const originalChooseMessageFile = global.wx.chooseMessageFile;
  const originalGetFileSystemManager = global.wx.getFileSystemManager;
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const mediaCalls = [];
  const imageCalls = [];
  const fileCalls = [];
  const requests = [];
  const toastMessages = [];
  const storage = new Map([["xf_token", "token-1"]]);
  const context = {
    ...definition,
    data: { ...definition.data, attachmentMenuOpen: true, homeMode: true },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    showToast(text) {
      toastMessages.push(text);
      this.data.toastText = text;
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.wx.getFileSystemManager = () => ({
      readFile(options) {
        options.success({ data: "aW1hZ2UtYnl0ZXM=" });
      }
    });
    global.wx.request = (options) => {
      requests.push(options);
      const url = String(options.url || "");
      if (url.includes("/api/v1/tutorbot/xiaowanzi_debug_bot/messages")) {
        options.success({
          statusCode: 200,
          data: {
            content: "这张图里是一张课程表，可以继续问我怎么安排。"
          }
        });
        return;
      }
      options.success({
        statusCode: 200,
        data: {
          content: "图片里有一张课程表。",
          featureKey: "xiaowanzi_file"
        }
      });
    };
    global.wx.chooseMedia = (options) => {
      mediaCalls.push(options);
      const fromCamera = Array.isArray(options.sourceType) && options.sourceType.includes("camera");
      options.success({ tempFiles: [fromCamera ? { tempFilePath: "/tmp/camera.jpg", size: 2048 } : { tempFilePath: "/tmp/picture.png", size: 1024 }] });
    };
    global.wx.chooseImage = (options) => {
      imageCalls.push(options);
      options.success({ tempFilePaths: ["/tmp/picture.png"], tempFiles: [{ path: "/tmp/picture.png", size: 1024 }] });
    };
    global.wx.chooseMessageFile = (options) => {
      fileCalls.push(options);
      options.success({ tempFiles: [{ path: "/tmp/report.jpg", name: "report.jpg", size: 4096, type: "image" }] });
    };

    await definition.chooseAttachment.call(context, { currentTarget: { dataset: { type: "camera" } } });
    assert.equal(context.data.attachmentMenuOpen, true);
    assert.equal(context.data.attachmentPreviewText, "已上传照片：camera.jpg · 2KB");
    assert.equal(context.data.attachmentContextText, "");
    assert.deepEqual(context.data.pendingAttachments.map((item) => item.name), ["camera.jpg"]);
    assert.equal(context.data.pendingAttachments[0].path, "/tmp/camera.jpg");
    assert.equal(context.data.pendingAttachments[0].dataUrl, "data:image/jpeg;base64,aW1hZ2UtYnl0ZXM=");
    assert.equal(context.data.inputReady, true);
    assert.equal(requests.length, 0);
    assert.deepEqual(toastMessages, []);

    context.data.attachmentMenuOpen = true;
    await definition.chooseAttachment.call(context, { currentTarget: { dataset: { type: "image" } } });
    assert.equal(context.data.attachmentMenuOpen, true);
    assert.equal(context.data.attachmentPreviewText, "已上传 2 个附件");
    assert.deepEqual(context.data.pendingAttachments.map((item) => item.name), ["camera.jpg", "picture.png"]);
    assert.equal(requests.length, 0);
    assert.deepEqual(toastMessages, []);

    context.data.attachmentMenuOpen = true;
    await definition.chooseAttachment.call(context, { currentTarget: { dataset: { type: "file" } } });
    assert.equal(context.data.attachmentMenuOpen, true);
    assert.equal(context.data.attachmentPreviewText, "已上传 3 个附件");
    assert.deepEqual(context.data.pendingAttachments.map((item) => item.name), ["camera.jpg", "picture.png", "report.jpg"]);
    assert.equal(mediaCalls.length, 2);
    assert.equal(imageCalls.length, 0);
    assert.equal(fileCalls.length, 1);
    assert.equal(requests.length, 0);
    assert.deepEqual(toastMessages, []);

    definition.removePendingAttachment.call(context, { currentTarget: { dataset: { index: 1 } } });
    assert.equal(context.data.attachmentPreviewText, "已上传 2 个附件");
    assert.deepEqual(context.data.pendingAttachments.map((item) => item.name), ["camera.jpg", "report.jpg"]);

    definition.handleSend.call(context);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(context.data.pendingAttachments, []);
    assert.equal(context.data.attachmentPreviewText, "");
    assert.equal(context.data.attachmentContextText, "");
    assert.equal(context.data.sending, false);
    assert.equal(requests.length, 3);
    assert.equal(requests[0].method, "POST");
    assert.match(requests[0].url, /\/api\/wechat-mini\/xiaowanzi\/attachments\/recognize$/);
    assert.equal(requests[0].header.Authorization, "Bearer token-1");
    assert.equal(requests[0].data.dataUrl, "data:image/jpeg;base64,aW1hZ2UtYnl0ZXM=");
    assert.match(requests[1].url, /\/api\/wechat-mini\/xiaowanzi\/attachments\/recognize$/);
    assert.equal(requests[1].data.fileName, "report.jpg");
    assert.match(requests[2].url, /\/api\/v1\/tutorbot\/xiaowanzi_debug_bot\/messages$/);
    assert.match(requests[2].data.content, /帮我解读下图片内容/);
    assert.match(requests[2].data.content, /附件名称：camera\.jpg。/);
    assert.match(requests[2].data.content, /附件名称：report\.jpg。/);
    assert.match(requests[2].data.content, /图片识别结果：图片里有一张课程表。/);
    assert.deepEqual(context.data.messages.slice(-2).map((message) => message.content), [
      "帮我解读下图片内容",
      "这张图里是一张课程表，可以继续问我怎么安排。"
    ]);
    assert.deepEqual(context.data.messages.at(-2).attachments.map((item) => ({
      type: item.type,
      name: item.name,
      path: item.path,
      mediaType: item.mediaType
    })), [
      { type: "camera", name: "camera.jpg", path: "/tmp/camera.jpg", mediaType: "image/jpeg" },
      { type: "file", name: "report.jpg", path: "/tmp/report.jpg", mediaType: "image/jpeg" }
    ]);
    assert.equal(Object.hasOwn(context.data.messages.at(-2).attachments[0], "dataUrl"), false);
  } finally {
    global.wx.chooseMedia = originalChooseMedia;
    global.wx.chooseImage = originalChooseImage;
    global.wx.chooseMessageFile = originalChooseMessageFile;
    global.wx.getFileSystemManager = originalGetFileSystemManager;
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("Xiaowanzi voice input entry stays visible and reports availability without using WechatSI", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const originalRequirePlugin = global.requirePlugin;
  const toastMessages = [];
  const context = {
    ...definition,
    data: { ...definition.data, sending: false, voiceListening: true, voiceHolding: true, attachmentMenuOpen: true },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    showToast(text) {
      toastMessages.push(text);
    }
  };

  try {
    global.requirePlugin = (name) => {
      throw new Error(`WechatSI should not be requested: ${name}`);
    };

    definition.toggleVoiceInput.call(context);
    assert.equal(context.data.voiceListening, false);
    assert.equal(context.data.voiceHolding, false);
    assert.equal(context.data.attachmentMenuOpen, true);
    assert.deepEqual(toastMessages, ["语音输入正在开发中"]);

    definition.startVoicePress.call(context);
    assert.deepEqual(toastMessages, ["语音输入正在开发中", "语音输入正在开发中"]);

    context.data.voiceListening = true;
    context.data.voiceHolding = true;
    definition.endVoicePress.call(context);
    assert.equal(context.data.voiceListening, false);
    assert.equal(context.data.voiceHolding, false);
  } finally {
    global.requirePlugin = originalRequirePlugin;
  }
});

test("Xiaowanzi composer left-aligns text while the input is focused", () => {
  const definition = loadPageDefinition("xiaowanzi");
  const context = {
    ...definition,
    data: { ...definition.data, inputFocused: false, inputValue: "" },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  definition.handleInputFocus.call(context);
  assert.equal(context.data.inputFocused, true);

  definition.handleInputBlur.call(context);
  assert.equal(context.data.inputFocused, false);
});

test("openWeb routes Xiaowanzi super mode to the native tab instead of the generic webview shell", () => {
  const originalSwitchTab = global.wx.switchTab;
  const originalNavigateTo = global.wx.navigateTo;
  const originalSetStorageSync = global.wx.setStorageSync;
  const originalGetCurrentPages = global.getCurrentPages;
  const storage = new Map();
  const switchCalls = [];
  const navigations = [];
  const webviewUtilsPath = require.resolve("../utils/webview.js");
  delete require.cache[webviewUtilsPath];
  const { openWeb } = require("../utils/webview.js");

  try {
    global.wx.switchTab = (options) => {
      switchCalls.push(options);
    };
    global.wx.navigateTo = (options) => {
      navigations.push(options);
    };
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };
    global.getCurrentPages = () => [
      {
        route: "pages/webview/index",
        data: {
          src: "https://xianfeng.xinzhi.info/topics/demo?xf_mp=1",
          title: "话题详情"
        }
      }
    ];

    openWeb("/index-xiaowanzi.html", "小玩子");
    assert.deepEqual(switchCalls, [{ url: "/pages/xiaowanzi/index" }]);
    assert.equal(navigations.length, 0);
    assert.equal(storage.get("xf_xiaowanzi_entry_mode"), "home");
    assert.deepEqual(storage.get("xf_xiaowanzi_return_target_v1"), {
      type: "navigateTo",
      url: "/pages/webview/index?url=https%3A%2F%2Fxianfeng.xinzhi.info%2Ftopics%2Fdemo%3Fxf_mp%3D1&title=%E8%AF%9D%E9%A2%98%E8%AF%A6%E6%83%85"
    });
  } finally {
    global.wx.switchTab = originalSwitchTab;
    global.wx.navigateTo = originalNavigateTo;
    global.wx.setStorageSync = originalSetStorageSync;
    global.getCurrentPages = originalGetCurrentPages;
  }
});

test("all mini program pages opt out of the default WeChat title bar", () => {
  const appJson = JSON.parse(
    fs.readFileSync(new URL("../app.json", import.meta.url), "utf8")
  );
  const webview = fs.readFileSync(new URL("./webview/index.js", import.meta.url), "utf8");

  for (const pagePath of appJson.pages) {
    const jsonUrl = new URL(`../${pagePath}.json`, import.meta.url);
    const json = fs.existsSync(jsonUrl) ? JSON.parse(fs.readFileSync(jsonUrl, "utf8")) : {};
    assert.equal(json.navigationStyle, "custom", `${pagePath} should use custom navigation`);
  }
  assert.match(webview, /const displayTitle = showXiaowanziClose \? "" : title/);
  assert.match(webview, /wx\.setNavigationBarTitle\(\{ title: displayTitle \}\)/);
  assert.match(webview, /function resolveWebviewTitle\(src, rawTitle\)/);
  assert.match(webview, /if \(getUrlPathname\(src\) === "\/welfare"\) return inferredTitle/);
});

test("native first-level content tabs fetch API data and open detail wrapper routes", () => {
  const pages = [
    ["reading", 1, "/api/books", "books", "/reading/"],
    ["topics", 4, "/api/topic-hub", "topics", "/topics/"]
  ];

  for (const [name, selected, apiPath, dataKey, detailPath] of pages) {
    const { js, json, wxml, wxss } = readPage(name);
    assert.equal(json.navigationStyle, "custom");
    assert.deepEqual(json.usingComponents || {}, {});
    assert.equal(wxml.includes("<native-page-nav"), false);
    assert.equal(wxml.includes("<web-view"), false);
    assert.match(wxml, /class="xf-native-page/);
    assert.match(wxml, /wx:for="\{\{(?:books|materials|topics)\}\}"/);
    assert.match(js, new RegExp(`selected:\\s*${selected}`));
    assert.match(js, apiPath === "/api/books"
      ? /preloadNativeReadingBooks\(\)/
      : apiPath === "/api/topic-hub"
      ? /request\(\{ url: buildTopicListUrl\(nextPage, TOPIC_PAGE_SIZE\) \}\)/
      : apiPath === "/api/learning-materials"
      ? /request\(\{ url: appendProfileQuery\("\/api\/learning-materials"\) \}\)/
      : new RegExp(`request\\(\\{ url: "${apiPath.replace(/\//g, "\\/")}" \\}\\)`));
    if (name !== "topics") {
      assert.match(js, /openWeb\(/);
      assert.match(js, new RegExp(`path: \`${detailPath.replace(/\//g, "\\/")}`));
    }
    assert.match(js, new RegExp(`${dataKey}: \\[\\]`));
    assert.match(js, /getNativeTopbarMetrics/);
    assert.match(js, /setSelectedTab\(this,/);
    if (name === "topics") {
      assert.doesNotMatch(js, /openNativeSearch/);
      assert.doesNotMatch(js, /openSearch\(\)/);
      assert.doesNotMatch(js, /startSearchPromptRotation\(this\)/);
      assert.doesNotMatch(js, /stopSearchPromptRotation\(this\)/);
      assert.doesNotMatch(js, /searchPrompt: getInitialSearchPrompt\(\)/);
    } else {
      assert.match(js, /openNativeSearch/);
      assert.match(js, /openSearch\(\)/);
      assert.match(js, /startSearchPromptRotation\(this\)/);
      assert.match(js, /stopSearchPromptRotation\(this\)/);
      assert.match(js, /searchPrompt: getInitialSearchPrompt\(\)/);
      assert.match(js, /openNativeSearch\("", \{/);
    }
    assert.doesNotMatch(js, /onPageScroll\(event\)/);
    assert.doesNotMatch(js, /showGuideCard/);
    assert.doesNotMatch(wxml, /xf-native-hero/);
    assert.doesNotMatch(wxml, /is-guide-hidden/);
    assert.match(js, /chromeHeight/);
    if (name === "topics") {
      assert.doesNotMatch(js, /searchPanelHeight/);
      assert.doesNotMatch(js, /topCardGapHeight/);
      assert.doesNotMatch(js, /scrollBelowSearchPanel\(\)/);
    } else {
      assert.match(js, /searchPanelHeight/);
      assert.match(js, /topCardGapHeight/);
      assert.match(js, /scrollBelowSearchPanel\(\)/);
      assert.match(js, /const scrollTop = Math\.max\(0, \(this\.data\.searchPanelHeight \|\| 0\) - \(this\.data\.topCardGapHeight \|\| 0\)\)/);
      assert.match(js, /wx\.pageScrollTo\(\{ scrollTop, duration: 0 \}\)/);
    }
    assert.match(js, /logoTop/);
    assert.match(js, /logoHeight/);
    assert.doesNotMatch(js, /searchButtonRight/);
    assert.match(wxml, /class="xf-native-page[\s\S]*style="padding-top: \{\{chromeHeight\}\}px;"/);
    assert.match(wxml, /class="xf-native-topbar" style="height: \{\{topbarHeight\}\}px;"/);
    assert.match(wxml, /class="xf-native-menu-button" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;" catchtap="openSettings"/);
    assert.match(wxml, /class="xf-native-logo" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;" src="\/assets\/nav\/logo\.png" mode="aspectFit" bindtap="goProgramsHome" aria-label="回到顶部"/);
    assert.match(js, /goProgramsHome: navigateProgramsHome/);
    assert.match(js, /goProgramsHome\(\)\s*\{[\s\S]*navigateProgramsHome\(\);[\s\S]*\}/);
    if (name === "topics") {
      assert.doesNotMatch(wxml, /class="xf-native-search-panel/);
      assert.doesNotMatch(wxml, /bindtap="openSearch"/);
      assert.match(wxml, /class="xf-topics-guide"/);
      assert.match(wxml, /class="xf-topics-eyebrow" aria-label="ASK AND LEARN"/);
      assert.match(wxml, /<text class="xf-topics-eyebrow-word">ASK<\/text>\s*<text class="xf-topics-eyebrow-amp">\{\{eyebrowAmp\}\}<\/text>\s*<text class="xf-topics-eyebrow-word">LEARN<\/text>/);
      assert.doesNotMatch(wxml, /\{\{guideEyebrow\}\}|ASK &amp;amp;|<text class="xf-topics-eyebrow-amp">&amp;<\/text>|ASK &amp;<\/text>\s*<text class="xf-topics-eyebrow-word">LEARN/);
      assert.match(wxml, />请教一下</);
    } else {
      assert.match(wxml, /class="xf-native-search-panel/);
      assert.doesNotMatch(wxml, /class="xf-native-search-panel[^"]*" style="top: \{\{topbarHeight\}\}px;"/);
      assert.match(wxml, /class="xf-native-search-field has-filter"/);
      assert.match(wxml, /bindtap="openSearch"/);
      assert.match(wxml, /class="xf-native-search-text">\{\{searchPrompt\}\}<\/text>/);
      assert.match(wxml, /class="xf-native-search-circle"/);
      assert.match(wxml, /class="xf-native-search-line"/);
    }
    assert.match(wxml, /wx:if="\{\{settingsPanelOpen\}\}" class="xf-native-settings-mask" style="height: \{\{settingsPanelHeight\}\}px;" catchtap="closeSettings"/);
    assert.match(js, /settingsSections: SETTINGS_SECTIONS/);
    assert.match(js, /\.\.\.createNativeSettingsMethods\(\)/);
    assert.match(fs.readFileSync(new URL("../utils/nativeSettings.js", import.meta.url), "utf8"), /info\.screenHeight \|\| info\.windowHeight/);
    assert.match(wxss, /@import "\.\.\/\.\.\/styles\/native-list\.wxss";/);
    const nativeTopbarStyle = fs.readFileSync(new URL("../styles/native-list.wxss", import.meta.url), "utf8").match(/\.xf-native-topbar \{[\s\S]*?\n\}/)?.[0] || "";
    assert.match(nativeTopbarStyle, /background: #ffffff;/);
    assert.doesNotMatch(nativeTopbarStyle, /background: rgba\(255, 255, 255,/);
    const nativeSearchPanelStyle = fs.readFileSync(new URL("../styles/native-list.wxss", import.meta.url), "utf8").match(/\.xf-native-search-panel \{[\s\S]*?\n\}/)?.[0] || "";
    assert.match(nativeSearchPanelStyle, /margin: 0 -26rpx;/);
    assert.doesNotMatch(nativeSearchPanelStyle, /width: 100%;/);
    const nativeSettingsMaskStyle = fs.readFileSync(new URL("../styles/native-list.wxss", import.meta.url), "utf8").match(/\.xf-native-settings-mask \{[\s\S]*?\n\}/)?.[0] || "";
    assert.match(nativeSettingsMaskStyle, /bottom: 0;/);
    assert.match(nativeSettingsMaskStyle, /z-index: 2147483647;/);
    assert.doesNotMatch(nativeSettingsMaskStyle, /padding-bottom: 96rpx;/);
    const nativeListWxss = fs.readFileSync(new URL("../styles/native-list.wxss", import.meta.url), "utf8");
    assert.match(nativeListWxss, /\.xf-native-settings-panel \{[\s\S]*width: 84vw;[\s\S]*max-width: 640rpx;[\s\S]*height: 100%;[\s\S]*padding: 52rpx 34rpx 0;[\s\S]*background: #f7f7f8;[\s\S]*box-shadow: -36rpx 0 90rpx rgba\(15, 23, 42, 0\.2\);/);
    assert.doesNotMatch(nativeListWxss.match(/\.xf-native-settings-panel \{[\s\S]*?\n\}/)?.[0] || "", /transparent calc\(100% - 192rpx\)/);
    assert.match(nativeListWxss, /\.xf-native-settings-panel-inner \{[\s\S]*display: flex;[\s\S]*flex-direction: column;[\s\S]*gap: 26rpx;[\s\S]*min-height: 0;/);
    assert.match(nativeListWxss, /\.xf-native-settings-account,[\s\S]*\.xf-native-settings-card \{[\s\S]*margin-bottom: 0;[\s\S]*background: #ffffff;/);
    assert.match(nativeListWxss, /\.xf-native-settings-account \{[\s\S]*justify-content: center;[\s\S]*gap: 15rpx;[\s\S]*margin: 0;[\s\S]*min-height: 152rpx;[\s\S]*padding: 32rpx 30rpx;[\s\S]*border: 0;[\s\S]*border-radius: 32rpx;/);
    assert.match(nativeListWxss, /\.xf-native-settings-account::after \{[\s\S]*border: 0;/);
    assert.match(nativeListWxss, /\.xf-native-settings-avatar \{[\s\S]*width: 104rpx;[\s\S]*height: 104rpx;/);
    assert.match(nativeListWxss, /\.xf-native-settings-avatar-wrap \{[\s\S]*position: relative;[\s\S]*width: 104rpx;[\s\S]*height: 104rpx;/);
    assert.match(nativeListWxss, /\.xf-native-settings-title-row \{[\s\S]*display: flex;[\s\S]*align-items: center;[\s\S]*gap: 10rpx;/);
    assert.match(nativeListWxss, /\.xf-native-settings-subtitle-row \{[\s\S]*display: flex;[\s\S]*align-items: center;[\s\S]*gap: 10rpx;/);
    assert.match(nativeListWxss, /\.xf-native-settings-member-badge \{[\s\S]*display: inline-flex;[\s\S]*background: #0b0f19;[\s\S]*color: #f8d375;/);
    assert.doesNotMatch(nativeListWxss, /\.xf-native-settings-member-badge \{[^}]*position: absolute;/);
    assert.match(nativeListWxss, /\.xf-native-settings-label \{[\s\S]*display: flex;[\s\S]*align-items: center;[\s\S]*height: 34rpx;[\s\S]*line-height: 34rpx;/);
    assert.match(nativeListWxss, /\.xf-native-settings-row \.xf-native-settings-member-badge \{[\s\S]*align-self: center;[\s\S]*\}/);
    assert.doesNotMatch(nativeListWxss, /\.xf-native-settings-row \.xf-native-settings-member-badge \{[\s\S]*transform:/);
    assert.match(nativeListWxss, /\.xf-native-settings-row \.xf-native-settings-chevron \{[\s\S]*display: flex;[\s\S]*align-items: center;[\s\S]*height: 34rpx;[\s\S]*line-height: 34rpx;/);
    assert.match(nativeListWxss, /\.xf-native-settings-copy \{[\s\S]*flex: 0 1 auto;[\s\S]*align-items: flex-start;[\s\S]*text-align: left;/);
    assert.match(nativeListWxss, /\.xf-native-settings-title,[\s\S]*\.xf-native-settings-subtitle \{[\s\S]*display: block;[\s\S]*text-align: left;/);
    assert.match(nativeListWxss, /\.xf-native-settings-title,[\s\S]*\.xf-native-settings-label \{[\s\S]*font-size: 27rpx;[\s\S]*font-weight: 850;[\s\S]*line-height: 1;/);
    assert.match(nativeListWxss, /\.xf-native-settings-row \{[\s\S]*gap: 15rpx;[\s\S]*min-height: 98rpx;[\s\S]*padding: 0 30rpx;/);
    assert.match(nativeListWxss, /\.xf-setting-row text,[\s\S]*\.xf-setting-row button \{[\s\S]*font-size: inherit;/);
    assert.match(nativeListWxss, /\.xf-font-standard \.xf-setting-row text,[\s\S]*\.xf-font-standard \.xf-setting-row button,[\s\S]*\.xf-font-standard \.xf-setting-value,[\s\S]*\.xf-font-standard \.xf-setting-segment button \{[\s\S]*font-size: 25rpx;/);
    assert.match(nativeListWxss, /\.xf-font-small \.xf-setting-row \{[\s\S]*font-size: 24rpx;/);
    assert.match(nativeListWxss, /\.xf-font-small \.xf-setting-row text,[\s\S]*\.xf-font-small \.xf-setting-row button,[\s\S]*\.xf-font-small \.xf-setting-value,[\s\S]*\.xf-font-small \.xf-setting-segment button \{[\s\S]*font-size: 22rpx;/);
    assert.match(nativeListWxss, /\.xf-font-large \.xf-setting-row \{[\s\S]*font-size: 31rpx;/);
    assert.match(nativeListWxss, /\.xf-font-large \.xf-setting-row text,[\s\S]*\.xf-font-large \.xf-setting-row button,[\s\S]*\.xf-font-large \.xf-setting-value,[\s\S]*\.xf-font-large \.xf-setting-segment button \{[\s\S]*font-size: 29rpx;/);
    assert.match(nativeListWxss, /\.xf-native-settings-symbol,[\s\S]*\.xf-native-settings-logo-icon,[\s\S]*\.xf-native-settings-emoji-icon \{[\s\S]*width: 34rpx;[\s\S]*height: 34rpx;[\s\S]*line-height: 34rpx;/);
    assert.match(nativeListWxss, /\.xf-native-settings-symbol \{[\s\S]*font-size: 30rpx;/);
    assert.match(nativeListWxss, /\.xf-native-settings-emoji-icon \{[\s\S]*font-size: 28rpx;/);
    assert.equal(wxss.includes("env(safe-area-inset-bottom)"), false);
    assert.equal(wxml.includes("xf-tabbar-backdrop"), false);
    assert.equal(wxss.includes("xf-tabbar-backdrop"), false);
  }
  const topics = readPage("topics");
  const reading = readPage("reading");
  assert.match(reading.wxml, /<view class="xf-native-page xf-reading-page \{\{fontSizeClass\}\} \{\{compactMode \? 'is-compact' : 'is-feature'\}\} \{\{useExternalLibrarySource \? 'is-external-library' : 'is-native-library'\}\}" style="padding-top: \{\{chromeHeight\}\}px;">/);
  assert.doesNotMatch(reading.wxml, /READING|从节目实践沉淀的书单里/);
  assert.match(reading.wxml, /bindtap="switchBookViewMode"/);
  assert.match(reading.wxml, /aria-label="切换及阅展示样式"/);
  assert.match(reading.wxml, /class="xf-native-search-panel has-view-toggle"/);
  assert.match(reading.wxml, /class="xf-native-search-panel has-view-toggle"[\s\S]*class="xf-reading-view-toggle"/);
  assert.match(reading.wxml, /<image wx:if="\{\{compactMode\}\}" class="xf-reading-view-icon" src="\/assets\/nav\/view-grid\.png" mode="aspectFit" aria-hidden="true" \/>/);
  assert.match(reading.wxml, /<image wx:else class="xf-reading-view-icon" src="\/assets\/nav\/view-list\.png" mode="aspectFit" aria-hidden="true" \/>/);
  assert.equal(reading.wxml.includes("xf-reading-view-dot"), false);
  assert.equal(reading.wxml.includes("xf-reading-view-card"), false);
  assert.equal(reading.wxml.includes("xf-reading-view-card-thumb"), false);
  assert.equal(reading.wxml.includes("switchReadingViewMode"), false);
  assert.match(reading.wxml, /class="xf-native-book-cover-wrap"/);
  assert.match(reading.wxml, /class="xf-native-book-cover" src="\{\{item\.coverImage\}\}" mode="aspectFit"/);
  assert.match(reading.wxml, /<image wx:else class="xf-native-book-cover-logo" src="\/assets\/menu\/jiyue-logo\.png" mode="aspectFit" \/>/);
  assert.equal(reading.wxml.includes("xf-native-book-cover-empty"), false);
  assert.doesNotMatch(reading.wxml, /wx:if="\{\{item\.date\}\}"/);
  assert.doesNotMatch(reading.wxml, /class="xf-native-meta"[\s\S]*item\.date/);
  assert.equal(reading.wxml.includes("xf-native-book-cover-fill"), false);
  assert.equal(reading.js.includes("coverBackground"), false);
  assert.match(reading.js, /const BOOK_VIEW_MODE_KEY = "xf_native_books_view_mode"/);
  assert.match(reading.js, /loadPreferredViewMode\(\)/);
  assert.match(reading.js, /switchBookViewMode\(\)/);
  assert.match(reading.js, /const compactMode = !this\.data\.compactMode/);
  assert.match(reading.js, /function bookDisplayPriority\(book, index\)/);
  assert.match(reading.js, /if \(hasDetail && hasDescription\) score \+= 4/);
  assert.match(reading.js, /else if \(hasDescription\) score \+= 3/);
  assert.match(reading.js, /const recommendedGuest = displayText\(item\.recommendedGuest\)/);
  assert.match(reading.js, /const recommenderTag = recommendedGuest \? `推荐：\$\{recommendedGuest\}` : ""/);
  assert.match(reading.js, /recommenderTag,\n\s+fieldTags,\n\s+displayTags,/);
  assert.match(reading.js, /const displayTags = buildDisplayTags\(sourceTags, gradeTags, ageTags, topicTags\)/);
  assert.match(reading.js, /function normalizeCachedBook\(book\)/);
  assert.match(reading.js, /const allBooks = normalizeCachedBooksPayload\(cached\)/);
  assert.match(reading.wxml, /wx:if="\{\{item\.recommenderTag \|\| item\.displayTags\.length\}\}" class="xf-reading-tags"/);
  assert.match(reading.wxml, /wx:if="\{\{item\.recommenderTag\}\}" class="xf-reading-recommender-tag"/);
  assert.match(reading.wxml, /wx:for="\{\{item\.displayTags\}\}"[\s\S]*class="xf-reading-topic-tag \{\{activeReadingTag === tag \? 'is-active' : ''\}\}"[\s\S]*data-tag="\{\{tag\}\}"[\s\S]*catchtap="onReadingTagTap"/);
  assert.match(reading.js, /activeReadingTag: ""/);
  assert.match(reading.js, /activeReadingTags: \[\]/);
  assert.match(reading.js, /draftReadingTags: \[\]/);
  assert.match(reading.js, /activeReadingTagLabel: ""/);
  assert.match(reading.js, /readingFilterPreviewCount: 0/);
  assert.match(reading.js, /readingFilterGroups: \[\]/);
  assert.match(reading.js, /allBooks: \[\]/);
  assert.match(reading.js, /function filterBooksByTags\(books, tags\)/);
  assert.match(reading.js, /function buildReadingFilterGroups\(books, selectedTags = \[\]\)/);
  assert.match(reading.js, /title: "年级"/);
  assert.match(reading.js, /title: "年龄"/);
  assert.match(reading.js, /title: "主题"/);
  assert.match(reading.js, /onReadingTagTap\(event\)/);
  assert.match(reading.js, /clearReadingTagFilter\(\)/);
  assert.match(reading.wxml, /wx:if="\{\{activeReadingTagLabel\}\}" class="xf-native-filter-bar"/);
  assert.match(reading.wxml, /catchtap="clearReadingTagFilter"/);
  assert.match(reading.wxml, /wx:for="\{\{readingFilterGroups\}\}"[\s\S]*wx:for-item="group"[\s\S]*class="xf-native-filter-section"/);
  assert.match(reading.wxml, /<text class="xf-native-filter-section-title">\{\{group\.title\}\}<\/text>/);
  assert.match(reading.wxml, /wx:for="\{\{group\.options\}\}"[\s\S]*wx:for-item="option"[\s\S]*class="xf-native-filter-chip \{\{option\.selected \? 'is-active' : ''\}\}"[\s\S]*data-tag="\{\{option\.value\}\}"[\s\S]*catchtap="onDrawerReadingTagTap"/);
  assert.match(reading.wxml, /catchtap="resetReadingFilterDraft"/);
  assert.match(reading.wxml, /catchtap="applyReadingFilterDraft"[\s\S]*查看 \{\{readingFilterPreviewCount\}\} 本图书/);
  assert.doesNotMatch(reading.wxml, />书单标签<\/text>/);
  assert.equal(reading.wxml.includes("可看详情"), false);
  assert.equal(reading.wxml.includes("书单条目"), false);
  assert.match(reading.wxss, /\.xf-reading-view-toggle \{[\s\S]*width: 54rpx;[\s\S]*height: 54rpx;[\s\S]*border: 0;[\s\S]*border-radius: 999rpx;[\s\S]*background: #f3edff;/);
  assert.match(reading.wxss, /\.xf-reading-view-icon \{[\s\S]*display: block;[\s\S]*width: 40rpx;[\s\S]*height: 40rpx;/);
  assert.equal(reading.wxss.includes(".xf-reading-view-dot"), false);
  assert.equal(reading.wxss.includes(".xf-reading-view-card"), false);
  assert.match(reading.wxss, /\.xf-reading-page\.is-feature \.xf-reading-card \{[\s\S]*display: block;/);
  assert.match(reading.wxss, /\.xf-reading-page\.is-feature \.xf-native-book-cover-wrap \{[\s\S]*width: 100%;[\s\S]*height: 378rpx;[\s\S]*background: #ffffff;/);
  assert.match(reading.wxss, /\.xf-reading-page \.xf-native-card-title \{[\s\S]*margin-top: 0;/);
  assert.match(reading.wxss, /\.xf-reading-page \.xf-native-card-title \{[\s\S]*font-size: 31rpx;/);
  assert.match(reading.wxss, /\.xf-reading-page \.xf-native-card-title \{[\s\S]*font-weight: 500;/);
  assert.match(reading.wxss, /\.xf-reading-page \.xf-native-meta-text \{[\s\S]*font-size: 24rpx;[\s\S]*font-weight: 400;/);
  assert.match(reading.wxss, /\.xf-reading-page \.xf-native-description \{[\s\S]*font-weight: 400;/);
  assert.equal(reading.wxss.includes("xf-native-view"), false);
  assert.match(reading.wxss, /\.xf-reading-page \.xf-native-book-cover-wrap \{[\s\S]*background: #ffffff;/);
  assert.match(reading.wxss, /\.xf-reading-page \.xf-native-book-cover \{[\s\S]*background: transparent;/);
  assert.match(reading.wxss, /\.xf-reading-page \.xf-native-book-cover-logo \{[\s\S]*display: block;[\s\S]*width: 108rpx;[\s\S]*height: 108rpx;/);
  assert.match(reading.wxss, /\.xf-reading-tags \{[\s\S]*align-items: center;[\s\S]*flex-wrap: wrap;[\s\S]*min-height: 32rpx;[\s\S]*overflow: visible;[\s\S]*white-space: normal;/);
  assert.match(reading.wxss, /\.xf-reading-recommender-tag \{[\s\S]*min-height: 32rpx;[\s\S]*border: 2rpx solid #d9c8ff;[\s\S]*background: #f6f0ff;[\s\S]*font-size: 18rpx;[\s\S]*font-weight: 400;[\s\S]*overflow-wrap: anywhere;[\s\S]*word-break: break-all;[\s\S]*word-wrap: break-word;[\s\S]*white-space: normal;/);
  const readingTopicTagStyle = reading.wxss.match(/\.xf-reading-topic-tag \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(readingTopicTagStyle, /display: flex;/);
  assert.match(readingTopicTagStyle, /align-items: center;/);
  assert.match(readingTopicTagStyle, /flex: 0 1 auto;/);
  assert.match(readingTopicTagStyle, /max-width: 100%;/);
  assert.match(readingTopicTagStyle, /min-height: 32rpx;/);
  assert.match(readingTopicTagStyle, /overflow: visible;/);
  assert.match(readingTopicTagStyle, /color: #5e17eb;/);
  assert.match(readingTopicTagStyle, /font-size: 20rpx;/);
  assert.match(readingTopicTagStyle, /font-weight: 400;/);
  assert.match(readingTopicTagStyle, /overflow-wrap: anywhere;/);
  assert.match(readingTopicTagStyle, /word-break: break-all;/);
  assert.match(readingTopicTagStyle, /word-wrap: break-word;/);
  assert.match(readingTopicTagStyle, /white-space: normal;/);
  assert.doesNotMatch(readingTopicTagStyle, /text-overflow: ellipsis;/);
  assert.doesNotMatch(readingTopicTagStyle, /border:/);
  assert.doesNotMatch(readingTopicTagStyle, /background:/);
  const materials = readPage("materials");
  assert.match(materials.wxml, /class="xf-native-search-panel" aria-label="搜索"/);
  assert.doesNotMatch(materials.wxml, /class="xf-native-search-panel" style="top: \{\{topbarHeight\}\}px;"/);
  assert.doesNotMatch(materials.wxml, /xf-reading-view-toggle|xf-program-view-toggle|has-view-toggle/);
  assert.equal(materials.wxml.includes("xf-native-material-mark"), false);
  assert.match(materials.wxss, /\.xf-materials-page \.xf-native-card \{[\s\S]*display: block;/);
  assert.match(materials.wxss, /\.xf-materials-page \.xf-native-card \{[\s\S]*padding: 22rpx;/);
  assert.match(materials.js, /selected:\s*3/);
  assert.match(materials.js, /request\(\{ url: appendProfileQuery\("\/api\/learning-materials"\) \}\)/);
  assert.match(materials.js, /const fileUrl = firstText\(\[item\.fileUrl/);
  assert.match(materials.js, /function pushFieldTag\(tags, tone, value\)/);
  assert.match(materials.js, /function pushFieldTags\(tags, tone, value, normalizer\)/);
  assert.match(materials.js, /function pushCategoryTags\(tags, value\)/);
  assert.match(materials.js, /pushFieldTags\(fieldTags, "stage", meta\.stage, normalizeStage\)/);
  assert.match(materials.js, /pushFieldTags\(fieldTags, "grade", meta\.grade, normalizeGrade\)/);
  assert.match(materials.js, /pushFieldTags\(fieldTags, "subject", meta\.subject, normalizeSubject\)/);
  assert.match(materials.js, /pushCategoryTags\(fieldTags, category\)/);
  assert.match(materials.js, /materialFilterGroups: \[\]/);
  assert.match(materials.js, /activeMaterialTags: \[\]/);
  assert.match(materials.js, /draftMaterialTags: \[\]/);
  assert.match(materials.js, /materialFilterPreviewCount: 0/);
  assert.match(materials.js, /function buildMaterialFilterGroups\(materials, selectedTags = \[\]\)/);
  assert.match(materials.js, /title: "阶段"/);
  assert.match(materials.js, /title: "年级"/);
  assert.match(materials.js, /title: "科目"/);
  assert.match(materials.js, /copyMaterialLink\(event\)/);
  assert.match(materials.js, /materialLinkModalOpen: false/);
  assert.match(materials.js, /closeMaterialLinkModal\(\)/);
  assert.doesNotMatch(materials.js, /wx\.setClipboardData\(/);
  assert.doesNotMatch(materials.js, /openWeb\(material\.path,\s*material\.title\)/);
  assert.doesNotMatch(materials.js, /path: `\/materials\//);
  assert.equal(materials.wxml.includes("xf-native-pill"), false);
  assert.match(materials.wxml, /wx:if="\{\{item\.fieldTags\.length\}\}" class="xf-materials-field-tags"/);
  assert.match(materials.wxml, /class="xf-materials-field-tag \{\{item\.tone\}\}"/);
  assert.match(materials.wxml, /data-url="\{\{item\.fileUrl\}\}"/);
  assert.match(materials.wxml, /bindtap="copyMaterialLink"/);
  assert.match(materials.wxml, /class="xf-materials-copy-button"[\s\S]*aria-label="复制链接"/);
  assert.match(materials.wxml, /class="xf-materials-copy-icon" src="\/assets\/icons\/unlink\.svg"/);
  assert.doesNotMatch(materials.wxml, />复制链接<\/button>/);
  assert.match(materials.wxml, /wx:if="\{\{materialLinkModalOpen\}\}" class="xf-materials-link-mask"/);
  assert.match(materials.wxml, /资料链接[\s\S]*user-select="true"[^>]*catchtap="copyMaterialModalLink"[\s\S]*\{\{materialLinkModalUrl\}\}/);
  assert.doesNotMatch(materials.wxml, /长按可复制/);
  assert.match(materials.wxml, /wx:for="\{\{materialFilterGroups\}\}"[\s\S]*wx:for-item="group"[\s\S]*class="xf-native-filter-section"/);
  assert.match(materials.wxml, /<text class="xf-native-filter-section-title">\{\{group\.title\}\}<\/text>/);
  assert.match(materials.wxml, /wx:for="\{\{group\.options\}\}"[\s\S]*wx:for-item="option"[\s\S]*class="xf-native-filter-chip \{\{option\.selected \? 'is-active' : ''\}\}"[\s\S]*data-tag="\{\{option\.value\}\}"[\s\S]*catchtap="onDrawerMaterialTagTap"/);
  assert.match(materials.wxml, /catchtap="resetMaterialFilterDraft"/);
  assert.match(materials.wxml, /catchtap="applyMaterialFilterDraft"[\s\S]*查看 \{\{materialFilterPreviewCount\}\} 个资料/);
  assert.doesNotMatch(materials.wxml, />资料标签<\/text>/);
  assert.match(materials.wxss, /\.xf-materials-field-tag\.stage \{[\s\S]*background: #f6f0ff;[\s\S]*color: #5e17eb;/);
  assert.match(materials.wxss, /\.xf-materials-field-tag\.grade \{[\s\S]*background: #f7f7ff;[\s\S]*color: #4e4c87;/);
  assert.match(materials.wxss, /\.xf-materials-field-tag\.subject \{[\s\S]*background: #f2fbfe;[\s\S]*color: #25678a;/);
  assert.match(materials.wxss, /\.xf-materials-field-tag\.category \{[\s\S]*background: #fff5ff;[\s\S]*color: #8a3daa;/);
  assert.match(materials.wxss, /\.xf-materials-copy-button/);
  assert.match(materials.wxss, /\.xf-materials-page \.xf-native-card-title \{[\s\S]*font-weight: 500;/);
  assert.match(materials.wxss, /\.xf-materials-page \.xf-native-card-title \{[\s\S]*font-size: 32rpx;/);
  assert.match(materials.wxss, /\.xf-materials-page \.xf-native-description \{[\s\S]*font-weight: 400;/);
  assert.match(materials.wxss, /\.xf-materials-page \.xf-native-description \{[\s\S]*font-size: 24rpx;[\s\S]*line-height: 1\.5;/);
  assert.match(materials.wxss, /\.xf-materials-copy-button \{[\s\S]*width: 48rpx;[\s\S]*height: 48rpx;[\s\S]*background: #f3edff;/);
  assert.match(materials.wxss, /\.xf-materials-copy-icon \{[\s\S]*width: 34rpx;[\s\S]*height: 34rpx;/);
  assert.match(materials.wxss, /\.xf-materials-link-modal \{[\s\S]*background: #ffffff;/);
  assert.match(materials.wxss, /\.xf-materials-link-url \{[\s\S]*word-break: break-all;/);
  assert.doesNotMatch(topics.wxml, /class="xf-native-search-panel" aria-label="搜索"/);
  assert.doesNotMatch(topics.wxml, /bindtap="openSearch"/);
  assert.match(topics.wxml, /class="xf-topics-guide"/);
  assert.match(topics.wxml, /class="xf-topics-eyebrow" aria-label="ASK AND LEARN"/);
  assert.match(topics.wxml, /<text class="xf-topics-eyebrow-word">ASK<\/text>\s*<text class="xf-topics-eyebrow-amp">\{\{eyebrowAmp\}\}<\/text>\s*<text class="xf-topics-eyebrow-word">LEARN<\/text>/);
  assert.doesNotMatch(topics.wxml, /\{\{guideEyebrow\}\}|ASK &amp;amp;|<text class="xf-topics-eyebrow-amp">&amp;<\/text>|ASK &amp;<\/text>\s*<text class="xf-topics-eyebrow-word">LEARN/);
  assert.match(topics.js, /eyebrowAmp: "&"/);
  assert.match(topics.wxml, />请教一下</);
  assert.match(topics.wxml, /教育路上，每个问题都值得被认真回答/);
  assert.match(topics.wxml, /placeholder="输入你想了解的教育话题…"/);
  assert.match(topics.wxml, /bindinput="onAskInput"/);
  assert.match(topics.wxml, /bindtap="submitAsk"/);
  assert.match(topics.wxml, /class="xf-topics-ask-helper">提交后即刻上架，AI 将自动为你生成知识树 ✨<\/text>/);
  assert.match(topics.wxml, /wx:for="\{\{guideTags\}\}"/);
  assert.match(topics.wxml, /wx:if="\{\{index === 4\}\}" class="xf-topics-guide-row-break"/);
  assert.match(topics.wxml, /wx:if="\{\{activeTopicTagLabel\}\}" class="xf-native-filter-bar"/);
  assert.match(topics.wxml, /catchtap="clearTopicTagFilter"/);
  assert.doesNotMatch(topics.wxml, /xf-reading-view-toggle|xf-program-view-toggle|has-view-toggle/);
  assert.doesNotMatch(topics.wxml, /class="xf-topics-filter-chip/);
  assert.doesNotMatch(topics.wxml, /bindtap="openFullList"/);
  assert.doesNotMatch(topics.js, /openSearch\(\)/);
  assert.doesNotMatch(topics.js, /openNativeSearch\(this\.data\.searchPrompt\)/);
  assert.doesNotMatch(topics.js, /const GUIDE_TAGS = \[/);
  assert.match(topics.js, /const GUIDE_TAG_VISIBLE_LIMIT = 11;/);
  assert.match(topics.js, /const GUIDE_TAG_FIRST_ROW_COUNT = 5;/);
  assert.match(topics.js, /const GUIDE_TAG_SECOND_ROW_COUNT = 6;/);
  assert.match(topics.js, /const GUIDE_TAG_SHORT_LABEL_LENGTH = 2;/);
  assert.match(topics.js, /function buildGuideTags\(topics\)/);
  assert.match(topics.js, /function getVisibleGuideTags\(tags, _expanded\)/);
  assert.match(topics.js, /const firstRow = source\.slice\(0, GUIDE_TAG_FIRST_ROW_COUNT\);/);
  assert.match(topics.js, /const secondRow = source\.slice\(GUIDE_TAG_FIRST_ROW_COUNT, GUIDE_TAG_VISIBLE_LIMIT\);/);
  assert.match(topics.js, /getGuideTagLabelLength\(tag\) <= GUIDE_TAG_SHORT_LABEL_LENGTH/);
  assert.doesNotMatch(topics.js, /guideEyebrow/);
  assert.match(topics.js, /allGuideTags: \[\]/);
  assert.match(topics.js, /guideTags: \[\]/);
  assert.match(topics.js, /toggleGuideTags\(\)/);
  assert.match(topics.js, /toggleGuideTags\(\) \{[\s\S]*this\.setData\(\{ guideTagsExpanded: false \}\);[\s\S]*this\.openFilterDrawer\(\);[\s\S]*\}/);
  assert.match(topics.wxml, /wx:if="\{\{hasMoreGuideTags\}\}" class="xf-topics-guide-tag-toggle"/);
  assert.match(topics.wxml, /class="xf-topics-guide-tag-toggle" catchtap="toggleGuideTags">\s*展开全部 ▼\s*<\/button>/);
  assert.doesNotMatch(topics.wxml, /guideTagsExpanded \? "收起 ▲" : "展开全部 ▼"/);
  assert.match(topics.js, /askInput: ""/);
  assert.match(topics.js, /onAskInput\(event\)/);
  assert.match(topics.js, /submitAsk\(\)/);
  assert.doesNotMatch(topics.js, /openWeb\("\/topics"/);
  assert.match(topics.js, /submitAsk\(\)[\s\S]*runTopicSubmitFlow\(text, \{ skipSearch: false, skipRefine: false \}\)/);
  assert.match(topics.wxml, /bindlongpress="showTopicDelete"/);
  assert.match(topics.wxml, /wx:if="\{\{deleteTopicId === item\.id\}\}"[\s\S]*class="xf-topics-delete-button"/);
  assert.match(topics.wxml, /catchtap="deleteTopic"/);
  assert.match(topics.js, /deleteTopicId: ""/);
  assert.match(topics.js, /showTopicDelete\(event\)/);
  assert.match(topics.js, /deleteTopic\(event\)/);
  assert.match(topics.js, /method: "DELETE"/);
  assert.match(topics.js, /正在检索是否已有相似话题/);
  assert.match(topics.js, /const userId = getCurrentUserId\(\);[\s\S]*const searchUrl = `\/api\/topic-hub\?search=\$\{encodeURIComponent\(text\)\}&limit=5\$\{userId \? `&userId=\$\{encodeURIComponent\(userId\)\}` : ""\}`;[\s\S]*request\(\{ url: searchUrl \}\)/);
  assert.match(topics.js, /request\(\{[\s\S]*url: "\/api\/topic-hub\/refine"[\s\S]*method: "POST"[\s\S]*data: \{ keyword: text \}/);
  assert.match(topics.js, /request\(\{[\s\S]*url: "\/api\/topic-hub\/validate"[\s\S]*method: "POST"/);
  assert.match(topics.js, /request\(\{[\s\S]*url: "\/api\/topic-hub\/search-generate"[\s\S]*method: "POST"/);
  assert.doesNotMatch(topics.js, /scrollBelowSearchPanel\(\)/);
  assert.match(topics.js, /activeTopicTag: ""/);
  assert.match(topics.js, /activeTopicTags: \[\]/);
  assert.match(topics.js, /draftTopicTags: \[\]/);
  assert.match(topics.js, /activeTopicTagLabel: ""/);
  assert.match(topics.js, /topicFilterPreviewCount: 0/);
  assert.match(topics.js, /allTopics: \[\]/);
  assert.match(topics.js, /function filterTopicsByTags\(topics, tags\)/);
  assert.match(topics.js, /onTopicTagTap\(event\)/);
  assert.match(topics.js, /clearTopicTagFilter\(\)/);
  assert.match(topics.wxml, /bindtap="openTopic"/);
  assert.match(topics.wxml, /class="xf-topics-card-head"/);
  assert.match(topics.wxml, /<text wx:if="\{\{item\.emoji\}\}" class="xf-native-topic-mark is-emoji">\{\{item\.emoji\}\}<\/text>/);
  assert.match(topics.wxml, /<image wx:else class="xf-native-topic-mark is-fallback-icon" src="\/assets\/tabbar\/topics-active\.png" mode="aspectFit" \/>/);
  assert.doesNotMatch(topics.wxml, /xf-topic-status/);
  assert.match(topics.wxml, /wx:if="\{\{item\.progressVisible\}\}"/);
  assert.match(topics.wxml, /class="xf-topic-progress"/);
  assert.match(topics.wxml, /class="xf-topic-progress-fill" style="width: \{\{item\.progressPercent\}\}%"/);
  assert.match(topics.wxml, /class="xf-topic-subtitle"\>\{\{item\.subtitle\}\}/);
  assert.match(topics.js, /function normalizeTopicProgress\(item\)/);
  assert.match(topics.js, /progressVisible: progress\.visible/);
  assert.doesNotMatch(topics.js, /✅ 已完成/);
  assert.match(topics.wxss, /\.xf-topic-progress/);
  assert.doesNotMatch(topics.wxml, /\#\{\{item\}\}/);
  assert.match(topics.js, /const TOPIC_CACHE_KEY = "xf_native_topics_cache"/);
  assert.match(topics.js, /const TOPIC_CACHE_VERSION = 3;/);
  assert.match(topics.js, /const TOPIC_CACHE_TTL_MS = 6 \* 60 \* 60 \* 1000;/);
  assert.match(topics.js, /const INVALID_TOPIC_CACHE_KEY = "xf_native_topic_invalidated_v1";/);
  assert.match(topics.js, /function buildTopicListUrl\(page, limit, includeProfile = true\)/);
  assert.match(topics.js, /if \(context\.grade\) params\.push\(`grade=\$\{encodeURIComponent\(context\.grade\)\}`\);/);
  assert.match(topics.js, /function sortTopicsForGrade\(topics\)/);
  assert.match(topics.js, /function getCachedTopicsForCurrentContext\(cached\)/);
  assert.match(topics.js, /safeTags\(item\.tags\)/);
  assert.match(topics.js, /emoji: firstText\(\[item\.coverEmoji\], ""\)/);
  assert.doesNotMatch(topics.js, /emoji: firstText\(\[item\.coverEmoji\], "问"\)/);
  assert.match(topics.js, /progressPercent: progress\.percent/);
  assert.match(topics.js, /subtitle,/);
  assert.doesNotMatch(topics.js, /nodeCount,/);
  assert.match(topics.js, /canOpen: /);
  assert.match(topics.js, /nativeTopic=1/);
  assert.match(topics.js, /topicSlug=\$\{encodeURIComponent\(topicSlug\)\}/);
  assert.doesNotMatch(topics.js, /openWeb\(topic\.path, topic\.title/);
  assert.doesNotMatch(topics.wxml, /xf-topics-share-button|aria-label="分享话题"/);
  assert.match(topics.js, /function buildTopicSharePath\(topic\)/);
  assert.match(topics.js, /nativeTopic=1&topicSlug=\$\{encodeURIComponent\(topicSlug\)\}/);
  assert.match(topics.js, /topicShareTarget\(event\)/);
  assert.match(topics.js, /onShareAppMessage\(event\)/);
  assert.match(topics.wxml, /class="xf-native-card xf-topics-card \{\{item\.canOpen \? '' : 'is-disabled'\}\} \{\{deleteTopicId === item\.id \? 'is-delete-ready' : ''\}\}"/);
  assert.match(topics.wxss, /\.xf-topics-guide \{/);
  assert.match(topics.wxss, /\.xf-topics-guide-tags \{[\s\S]*width: calc\(100% \+ 72rpx\);[\s\S]*margin-left: -36rpx;/);
  assert.match(topics.wxss, /\.xf-topics-eyebrow \{[\s\S]*width: auto;[\s\S]*white-space: nowrap;/);
  assert.match(topics.wxss, /\.xf-topics-eyebrow-word,[\s\S]*\.xf-topics-eyebrow-amp \{[\s\S]*letter-spacing: 0\.18em;[\s\S]*white-space: nowrap;[\s\S]*word-break: keep-all;/);
  assert.match(topics.wxss, /\.xf-topics-eyebrow-amp \{[\s\S]*margin: 0 10rpx;/);
  assert.match(topics.wxss, /\.xf-topics-ask-button/);
  assert.match(topics.wxss, /\.xf-topics-guide-input/);
  assert.doesNotMatch(topics.wxss, /\.xf-topics-filter-chip/);
  assert.match(topics.wxss, /\.xf-topics-guide-title \{[\s\S]*font-size: 60rpx;[\s\S]*font-weight: 900;/);
  assert.match(topics.wxss, /\.xf-topics-guide-subtitle \{[\s\S]*color: #6f62a3;[\s\S]*font-size: 28rpx;[\s\S]*font-weight: 400;/);
  assert.match(topics.wxss, /\.xf-topics-ask-button \{[\s\S]*min-height: 112rpx;[\s\S]*border-radius: 32rpx;[\s\S]*font-size: 28rpx;[\s\S]*font-weight: 700;/);
  assert.match(topics.wxss, /\.xf-topics-ask-helper \{[\s\S]*color: #9ca3af;[\s\S]*font-size: 24rpx;[\s\S]*font-weight: 400;/);
  assert.match(topics.wxml, /wx:if="\{\{askMessageType === 'loading'\}\}" class="xf-topics-submit-progress"/);
  assert.match(topics.wxml, /class="xf-topics-submit-progress-fill" style="width: \{\{askSubmitProgressPercent\}\}%"/);
  assert.match(topics.js, /askSubmitProgressLabel: ""/);
  assert.match(topics.js, /askSubmitProgressPercent: 0/);
  assert.match(topics.js, /updateAskSubmitProgress\("search"\)/);
  assert.match(topics.js, /updateAskSubmitProgress\("refine"\)/);
  assert.match(topics.js, /updateAskSubmitProgress\("validate"\)/);
  assert.match(topics.js, /updateAskSubmitProgress\("create"\)/);
  assert.match(topics.wxss, /\.xf-topics-submit-progress-track \{[\s\S]*background: #e9d5ff;/);
  assert.match(topics.wxss, /\.xf-topics-guide-tag \{[\s\S]*background: #ede9fe;[\s\S]*color: #5b21b6;[\s\S]*font-size: 22rpx;[\s\S]*font-weight: 500;/);
  const topicsCardStyle = topics.wxss.match(/\.xf-topics-page \.xf-topics-card \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(topicsCardStyle, /display: block;/);
  assert.doesNotMatch(topicsCardStyle, /min-height: 428rpx;/, "topics cards should not keep the old fixed blank-space height");
  assert.match(topicsCardStyle, /min-height: 0;/, "topics cards should override the shared native-card minimum height and shrink to content");
  assert.match(topicsCardStyle, /padding: 40rpx 48rpx 42rpx;/);
  assert.match(topicsCardStyle, /border: 2rpx solid #f3f0ff;/);
  assert.match(topicsCardStyle, /border-radius: 48rpx;/);
  assert.doesNotMatch(topics.wxss, /\.xf-topics-share-button/);
  assert.match(topics.wxss, /\.xf-topics-page \.xf-native-topic-mark \{[\s\S]*width: 76rpx;[\s\S]*height: 76rpx;/);
  assert.match(topics.wxss, /\.xf-topics-page \.xf-native-topic-mark\.is-emoji \{[\s\S]*font-size: 64rpx;[\s\S]*line-height: 76rpx;/);
  const nativeListWxss = fs.readFileSync(new URL("../styles/native-list.wxss", import.meta.url), "utf8");
  assert.match(nativeListWxss, /\.xf-native-filter-bar \{[\s\S]*border: 2rpx solid #e2d7ff;/);
  assert.match(nativeListWxss, /\.xf-native-filter-clear,[\s\S]*\.xf-native-filter-close \{[\s\S]*align-items: center;[\s\S]*justify-content: center;[\s\S]*width: 44rpx;[\s\S]*height: 44rpx;[\s\S]*border-radius: 999rpx;[\s\S]*background: #f3edff;[\s\S]*color: #5e17eb;[\s\S]*font-size: 30rpx;[\s\S]*line-height: 1;/);
  assert.match(topics.wxss, /\.xf-topic-progress-track \{[\s\S]*background: #e9d5ff;/);
  assert.match(topics.wxss, /\.xf-topics-page \.xf-native-tag \{[\s\S]*background: #f3eeff;[\s\S]*color: #7c3aed;[\s\S]*font-size: 22rpx;[\s\S]*font-weight: 500;/);
  assert.match(topics.wxss, /\.xf-topics-page \.xf-native-card-title \{[\s\S]*font-size: 40rpx;[\s\S]*font-weight: 700;/);
  assert.match(topics.wxss, /\.xf-topic-subtitle \{[\s\S]*color: #6b7280;[\s\S]*font-size: 26rpx;/);
  assert.match(topics.wxss, /\.xf-topics-page \.xf-native-description \{[\s\S]*color: #6b7280;[\s\S]*font-size: 24rpx;[\s\S]*font-weight: 400;/);

  const xiaowanzi = readPage("xiaowanzi");
  assert.deepEqual(xiaowanzi.json.usingComponents || {}, { "phone-login-gate": "../../components/phone-login-gate/index" });
  assert.equal(xiaowanzi.wxml.includes("<native-page-nav"), false);
  assert.equal(xiaowanzi.wxml.includes('variant="xiaowanzi"'), false);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-native-shell"/);
  assert.doesNotMatch(xiaowanzi.wxml, /xf-xiaowanzi-welfare-entry|xf-xiaowanzi-logo/);
  assert.doesNotMatch(xiaowanzi.wxml, /xf-xiaowanzi-return-entry|xf-xiaowanzi-return-mark|aria-label="返回上一页"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-menu-entry"[\s\S]*catchtap="openHistoryDrawer"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-menu-mark" src="\/assets\/xiaowanzi-icons\/menu-dark\.png" mode="aspectFit"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-user-bubble"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-assistant-panel \{\{item\.pending \? 'is-thinking' : ''\}\}"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-assistant-card"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-ai-disclaimer"[\s\S]*本服务为AI生成内容，结果仅供参考[\s\S]*class="xf-xiaowanzi-child-hint"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-child-hint"[\s\S]*\{\{childHintText\}\}/);
  assert.doesNotMatch(xiaowanzi.wxml, /class="xf-xiaowanzi-child-add-card"|添加孩子档案/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-input-shell /);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-plus \{\{attachmentMenuOpen \? 'is-open' : ''\}\}"[\s\S]*catchtap="toggleAttachmentMenu"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-voice-icon" src="\/assets\/xiaowanzi-icons\/voice-dark\.png" mode="aspectFit"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-send-mark" src="\{\{sending \? '\/assets\/xiaowanzi-icons\/stop-white\.png' : '\/assets\/xiaowanzi-icons\/send-white\.png'\}\}" mode="aspectFit"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-plus-mark" src="\{\{attachmentMenuOpen \? '\/assets\/xiaowanzi-icons\/close-purple\.png' : '\/assets\/xiaowanzi-icons\/add-dark\.png'\}\}" mode="aspectFit"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-share-icon" src="\/assets\/xiaowanzi-icons\/share-purple\.png" mode="aspectFit"/);
  assert.doesNotMatch(xiaowanzi.wxml, /xf-xiaowanzi-ms|xf-xiaowanzi-share-glyph|xf-xiaowanzi-share-dot|>share<\/text>|\uE80D|>menu<|>send<|>add<|>close<|record_voice_over|graphic_eq|photo_camera|upload_file/);
  assert.doesNotMatch(xiaowanzi.wxml, /xf-xiaowanzi-voice-person|xf-xiaowanzi-voice-wave/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-attach-menu"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-history-mask"[\s\S]*class="xf-xiaowanzi-history-drawer" style="padding-top: calc\(\{\{topbarHeight\}\}px \+ 40rpx\);"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-history-new-mark"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-history-title"[\s\S]*历史会话/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-history-exit"[\s\S]*catchtap="returnToExternalPage"[\s\S]*class="xf-xiaowanzi-history-exit-mark" src="\/assets\/xiaowanzi-icons\/logout-white\.png" mode="aspectFit"/);
  assert.doesNotMatch(xiaowanzi.wxml, /class="xf-xiaowanzi-history-exit-mark[^"]*material-symbols-rounded|>\{\{historyExitIcon\}\}<\/text>|>logout<\/text>|&#xe9ba;/);
  assert.doesNotMatch(xiaowanzi.js, /MATERIAL_SYMBOL_LOGOUT|historyExitIcon/);
  assert.match(xiaowanzi.wxml, /catchtap="openNativeChildPicker"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-child-picker-sheet"[\s\S]*选择咨询人[\s\S]*catchtap="openChildCreateFromPicker"[\s\S]*新增孩子/);
  assert.doesNotMatch(xiaowanzi.wxml, /xf-xiaowanzi-share-entry/);
  assert.match(xiaowanzi.wxml, /wx:if="\{\{!shareSelectionMode && !sending && item\.shareable\}\}" class="xf-xiaowanzi-card-share \{\{shareRevealMessageId === item\.id \? 'is-visible' : ''\}\}"[\s\S]*catchtap="openShareSelectionFromMessage"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-share-select-panel"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-knowledge-pill \{\{knowledgePillCollapsed \? 'is-collapsed' : ''\}\}"[\s\S]*top: \{\{shellKnowledgeTop\}\}px; right: \{\{shellKnowledgeRight\}\}px; width: \{\{knowledgePillCollapsed \? shellKnowledgeHeight : shellKnowledgeWidth\}\}px; height: \{\{shellKnowledgeHeight\}\}px;[\s\S]*catchtap="openKnowledgeHub"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-knowledge-logo"[^>]*src="\/assets\/xiaowanzi-icons\/knowledge-round-logo\.png"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-knowledge-title" src="\/assets\/xiaowanzi-icons\/knowledge-title\.png" mode="aspectFit"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-top-bot"[\s\S]*top: \{\{shellAvatarTop\}\}px; height: \{\{shellAvatarHeight\}\}px;[\s\S]*src="\{\{topbarAvatarSrc\}\}"[\s\S]*catchtap="startNewConversation"[\s\S]*aria-label="新话题"/);
  assert.doesNotMatch(xiaowanzi.wxml, /xf-xiaowanzi-top-more|openTopbarMore|shellMoreRight/);
  assert.doesNotMatch(xiaowanzi.wxml, /xf-xiaowanzi-welfare-entry|xf-xiaowanzi-welfare-icon/);
  assert.doesNotMatch(xiaowanzi.wxml, /catchtap="openNativeSharePanel"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-child-boundary"/);
  assert.equal(xiaowanzi.wxml.includes("<web-view"), false);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-chat-list \{\{homeMode \? 'is-home' : 'is-chat'\}\} \{\{attachmentMenuOpen \? 'has-attachment-menu' : ''\}\} \{\{shareSelectionMode \? 'has-share-selection' : ''\}\}"/);
  assert.doesNotMatch(xiaowanzi.wxml, /class="xf-xiaowanzi-status"/);
  assert.doesNotMatch(xiaowanzi.wxml, /class="xf-xiaowanzi-error"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-inline-status"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-inline-action"[\s\S]*catchtap="handleActionTap"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-composer \{\{attachmentMenuOpen \? 'is-attach-open' : ''\}\}"/);
  assert.doesNotMatch(xiaowanzi.wxml, /xf-xiaowanzi-composer-feather/);
  assert.doesNotMatch(xiaowanzi.wxml, /xf-xiaowanzi-bottom-dock/);
  assert.match(xiaowanzi.wxml, /bindinput="updateInput"/);
  assert.match(xiaowanzi.wxml, /catchtap="handleSend"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-archive-scrim"/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-native-shell \{/);
  assert.doesNotMatch(xiaowanzi.wxss, /xf-xiaowanzi-welfare-entry|xf-xiaowanzi-welfare-icon|xf-xiaowanzi-share-entry|xf-xiaowanzi-logo|xf-xiaowanzi-return-entry|xf-xiaowanzi-return-mark/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-menu-mark \{[\s\S]*width: 32rpx;[\s\S]*height: 32rpx;/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-user-bubble \{/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-assistant-panel \{/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-assistant-card \{/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-inline-status \{/);
  assert.doesNotMatch(xiaowanzi.wxss, /\.xf-xiaowanzi-error \{/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-ai-disclaimer \{[\s\S]*color: #a2aac0;[\s\S]*font-size: 12px;[\s\S]*text-align: center;/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-child-hint \{/);
  assert.doesNotMatch(xiaowanzi.wxss, /\.xf-xiaowanzi-child-add-card \{/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-input-shell \{/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-share-icon \{[\s\S]*width: 32rpx;[\s\S]*height: 32rpx;/);
  assert.doesNotMatch(xiaowanzi.wxss, /src: url\("data:font\/woff2;base64,|\.xf-xiaowanzi-ms|xf-xiaowanzi-share-glyph|xf-xiaowanzi-share-dot/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-plus \{/);
  assert.doesNotMatch(xiaowanzi.wxss, /\.xf-xiaowanzi-plus-mark::before|\.xf-xiaowanzi-send\.is-send \.xf-xiaowanzi-send-mark::before|\.xf-xiaowanzi-voice-person/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-history-mask \{[\s\S]*top: 0;[\s\S]*bottom: 0;[\s\S]*background: rgba\(15, 23, 42, 0\.46\);/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-history-new-mark::before,/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-history-new-mark \{[\s\S]*width: 44rpx;[\s\S]*height: 44rpx;/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-history-drawer \{[\s\S]*width: 84vw;[\s\S]*max-width: 720rpx;[\s\S]*height: 100%;/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-history-drawer \{[\s\S]*padding: 40rpx 36rpx 0;/);
  assert.doesNotMatch(xiaowanzi.wxss, /\.xf-xiaowanzi-history-drawer \{[\s\S]*max\(48rpx, calc\(36rpx \+ env\(safe-area-inset-bottom\)\)\)/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-history-list \{[\s\S]*gap: 0;[\s\S]*padding-bottom: 0;/);
  assert.doesNotMatch(xiaowanzi.wxss.match(/\.xf-xiaowanzi-history-list \{[^}]*\}/)?.[0] || "", /calc\(126rpx \+ env\(safe-area-inset-bottom\)\)|env\(safe-area-inset-bottom\)/);
  assert.match(xiaowanzi.wxml, /<view wx:for="\{\{historyCards\}\}" wx:key="id" class="xf-xiaowanzi-history-card \{\{historyDeleteCardId === item\.id \? 'is-delete-visible' : ''\}\}" data-id="\{\{item\.id\}\}" catchtap="openHistoryCard" catchlongpress="showHistoryDeleteButton">/);
  assert.doesNotMatch(xiaowanzi.wxml, /<button wx:for="\{\{historyCards\}}"[\s\S]*class="xf-xiaowanzi-history-card"/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-history-card \{[\s\S]*flex-shrink: 0;[\s\S]*height: 80px;[\s\S]*margin-bottom: 10px;[\s\S]*padding: 10px 14px;[\s\S]*overflow: hidden;/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-history-card-title \{[\s\S]*font-size: 14px;[\s\S]*line-height: 20px;[\s\S]*overflow: hidden;[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;[\s\S]*word-break: normal;/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-history-card:last-child \{[\s\S]*margin-bottom: 0;/);
  assert.match(xiaowanzi.wxml, /xf-xiaowanzi-history-card-time[\s\S]*\{\{item\.sub\}\}/);
  assert.match(xiaowanzi.wxml, /xf-xiaowanzi-history-card-child[\s\S]*\{\{item\.childTag\}\}/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-share-select-panel \{[\s\S]*max-height: 55vh;[\s\S]*padding: 32rpx 40rpx calc\(32rpx \+ env\(safe-area-inset-bottom\)\);/);
  assert.doesNotMatch(xiaowanzi.wxss, /\.xf-xiaowanzi-share-select-panel \{[\s\S]*min-height: calc\(734rpx/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-child-picker-sheet \{[\s\S]*bottom: 0;[\s\S]*background: #fbf9ff;/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-child-picker-primary \{[\s\S]*background: linear-gradient\(135deg, #7c34e8 0%, #7f37ea 100%\);/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-chat-list \{/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-composer \{/);
  assert.doesNotMatch(xiaowanzi.wxss, /\.xf-xiaowanzi-composer-feather|top: -48px|rgba\(238, 241, 255, 0\.36\)/);
  assert.doesNotMatch(xiaowanzi.wxss, /xf-xiaowanzi-bottom-dock/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-history-exit-mark \{[\s\S]*display: block;[\s\S]*width: 24px;[\s\S]*height: 24px;/);
  assert.doesNotMatch(xiaowanzi.wxss.match(/\.xf-xiaowanzi-history-exit-mark \{[^}]*\}/)?.[0] || "", /font-family: "Material Symbols Rounded"/);
  assert.doesNotMatch(xiaowanzi.wxss, /\.xf-xiaowanzi-history-exit-mark::before|\.xf-xiaowanzi-history-exit-mark::after/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-archive-scrim \{[^}]*width: 16vw;[^}]*background: rgba\(15, 12, 35, 0\.42\);[^}]*\}/);
  assert.match(xiaowanzi.wxss, /\.xf-xiaowanzi-archive-panel \{[^}]*right: 0;[^}]*width: 84vw;[^}]*padding: 86rpx 28rpx 56rpx;[^}]*background: #f6f7fb;[^}]*overflow-y: auto;[^}]*\}/);
  assert.doesNotMatch(xiaowanzi.wxss.match(/\.xf-xiaowanzi-archive-panel \{[^}]*\}/)?.[0] || "", /transparent calc\(100% - 96rpx\)/);
  assert.match(xiaowanzi.wxml, /is="xfSettingsArchivePanel"/);
  assert.match(xiaowanzi.wxml, /archiveGradeDisplayText: archiveGradeDisplayText/);
  assert.doesNotMatch(xiaowanzi.wxml, /☰|↪/);
  assert.doesNotMatch(xiaowanzi.wxml, /class="xf-xiaowanzi-share-panel"|class="xf-xiaowanzi-share-scrim"/);
  assert.match(xiaowanzi.wxml, /open-type="share"/);
  assert.equal(xiaowanzi.wxml.includes("xf-xiaowanzi-bridge"), false);
  assert.match(xiaowanzi.js, /const BOT_ID = "xiaowanzi_debug_bot"/);
  assert.match(xiaowanzi.js, /const url = buildUrl\(`\/api\/v1\/tutorbot\/\$\{BOT_ID\}\/messages`\)/);
  assert.match(xiaowanzi.js, /requestXiaowanziStream\(\{/);
  assert.match(xiaowanzi.js, /data: \{ content, stream: true \}/);
  assert.match(xiaowanzi.js, /enableChunked: true/);
  assert.match(xiaowanzi.js, /\.onChunkReceived\(/);
  assert.match(xiaowanzi.js, /appendNativeAssistantDelta\(/);
  assert.match(xiaowanzi.js, /PRO_REQUIRED/);
  assert.match(xiaowanzi.js, /statusCode === 401/);
  assert.match(xiaowanzi.js, /\/api\/users\/me\/child-memories\/\$\{encodeURIComponent\(childId\)\}/);
  assert.match(xiaowanzi.js, /\/api\/users\/me\/child-memories\/\$\{encodeURIComponent\(childId\)\}\/merge/);
  assert.match(xiaowanzi.js, /getNativeTopbarMetrics/);
  assert.match(xiaowanzi.js, /function buildNativeShellData\(\)/);
  assert.match(xiaowanzi.js, /shellAvatarHeight: avatarHeight/);
  assert.match(xiaowanzi.js, /const LEGACY_AVATAR_INDEX_KEY = "wel_avatar_index"/);
  assert.match(xiaowanzi.js, /const LEGACY_AVATAR_CLICK_COUNT_KEY = "wel_avatar_click_count"/);
  assert.match(xiaowanzi.js, /function advanceTopbarAvatarState\(state\)/);
  assert.match(xiaowanzi.js, /returnFromXiaowanzi/);
  assert.match(xiaowanzi.js, /returnToExternalPage\(\) \{[\s\S]*historyDrawerOpen: false,[\s\S]*settingsPanelOpen: false[\s\S]*returnFromXiaowanzi\(\);[\s\S]*\}/);
  assert.match(xiaowanzi.js, /openKnowledgeHub\(\) \{[\s\S]*wx\.navigateTo\(\{ url: "\/pages\/experts\/index\?from=xiaowanzi" \}\);[\s\S]*\}/);
  assert.doesNotMatch(xiaowanzi.js, /openTopbarMore\(\)|shellMoreRight|shellWelfareRight|shellActionRight/);
  assert.match(xiaowanzi.js, /function buildActiveChildSummary\(\)/);
  assert.match(xiaowanzi.js, /syncNativeShellState\(\)/);
  assert.match(xiaowanzi.js, /openNativeChildPicker\(\) \{[\s\S]*childPickerOpen: true,[\s\S]*childPickerCards: buildChildPickerCards\(this\.data\.activeChildId\),[\s\S]*settingsPanelOpen: false[\s\S]*\}/);
  assert.match(xiaowanzi.js, /openNativeChildCreate\(\) \{[\s\S]*this\.openArchivePanel\(\);[\s\S]*\}/);
  assert.match(xiaowanzi.js, /function buildChildPickerCards\(activeId\)/);
  assert.match(xiaowanzi.js, /chooseChildFromPicker\(event\)/);
  assert.match(xiaowanzi.js, /openChildCreateFromPicker\(\)/);
  assert.match(xiaowanzi.js, /closeChildPicker\(\)/);
  assert.match(xiaowanzi.js, /markChildContextPending\(child\)/);
  assert.doesNotMatch(xiaowanzi.js, /openNativeSharePanel\(\)/);
  assert.doesNotMatch(xiaowanzi.js, /closeNativeSharePanel\(\)/);
  assert.doesNotMatch(xiaowanzi.js, /buildNativeTopbarData/);
  assert.doesNotMatch(xiaowanzi.js, /applyNativeTopbarMetrics/);
  assert.doesNotMatch(xiaowanzi.js, /xf_xw_nav_offset/);
  assert.doesNotMatch(xiaowanzi.js, /xf_xw_nav_top/);
  assert.doesNotMatch(xiaowanzi.js, /xf_xw_nav_height/);
  assert.doesNotMatch(xiaowanzi.js, /xf_xw_nav_right/);
  assert.doesNotMatch(xiaowanzi.js, /openHistory\(\)/);
  assert.match(xiaowanzi.js, /startNewConversation\(\)/);
  assert.match(xiaowanzi.js, /openHistoryCard\(event\)/);
  assert.doesNotMatch(xiaowanzi.js, /openKnowledge\(\)/);
  assert.doesNotMatch(xiaowanzi.js, /handleNativeKnowledge/);
  assert.doesNotMatch(xiaowanzi.js, /openWeb\(WEB_ROUTES\.xiaowanzi/);
  assert.doesNotMatch(xiaowanzi.js, /xf_xw: "chat"/);
  assert.equal(xiaowanzi.js.includes("getNativeWebviewParams"), false);
  assert.doesNotMatch(xiaowanzi.js, /handleNativeRoute/);
  assert.doesNotMatch(xiaowanzi.js, /openNativeRoute\(this, event\.detail\)/);
  assert.equal(xiaowanzi.js.includes("handleNativeSearch"), false);
  assert.match(xiaowanzi.js, /applyInitialPanel\(options\)/);
  assert.match(xiaowanzi.js, /openArchiveCreatePanel\(\)/);
  assert.match(xiaowanzi.js, /selectArchiveChild\(event\)/);
  assert.match(xiaowanzi.js, /saveArchivePanel\(\)/);
  assert.doesNotMatch(xiaowanzi.js, /refreshXiaowanziBridge\(\)/);
  assert.match(xiaowanzi.js, /settingsPanelView: "archive"/);
  assert.doesNotMatch(xiaowanzi.js, /\/pages\/mine\/index\?panel=archive/);
});

test("native first-level pages keep filter drawers page-local inside the search field", () => {
  const nativeListWxss = fs.readFileSync(new URL("../styles/native-list.wxss", import.meta.url), "utf8");
  const filterSliderAsset = new URL("../assets/nav/filter-sliders.png", import.meta.url);
  const viewGridAsset = new URL("../assets/nav/view-grid.png", import.meta.url);
  const viewListAsset = new URL("../assets/nav/view-list.png", import.meta.url);
  assert.equal(fs.existsSync(filterSliderAsset), true);
  assert.equal(fs.existsSync(viewGridAsset), true);
  assert.equal(fs.existsSync(viewListAsset), true);
  assert.match(nativeListWxss, /\.xf-native-search-field \{[\s\S]*border: 2rpx solid #d8d0ef;/);
  assert.match(nativeListWxss, /\.xf-native-search-circle \{[\s\S]*border: 3rpx solid #4b5563;/);
  assert.match(nativeListWxss, /\.xf-native-search-line \{[\s\S]*height: 3rpx;/);
  assert.match(nativeListWxss, /\.xf-native-search-field\.has-filter \{/);
  assert.match(nativeListWxss, /\.xf-native-search-filter \{[\s\S]*position: absolute;[\s\S]*right: 8rpx;[\s\S]*background: transparent;/);
  assert.match(nativeListWxss, /\.xf-native-search-filter-icon \{[\s\S]*display: block;[\s\S]*width: 40rpx;[\s\S]*height: 40rpx;/);
  assert.doesNotMatch(nativeListWxss, /xf-native-search-filter-line|xf-native-search-filter-dot|xf-native-search-filter-spark|xf-native-search-filter-funnel|xf-native-search-filter-stem/);
  assert.match(nativeListWxss, /\.xf-native-filter-mask \{[\s\S]*position: fixed;[\s\S]*align-items: flex-end;/);
  assert.match(nativeListWxss, /\.xf-native-filter-drawer \{[\s\S]*display: flex;[\s\S]*flex-direction: column;[\s\S]*max-height: 82vh;[\s\S]*min-height: 38vh;[\s\S]*overflow: hidden;/);
  assert.match(nativeListWxss, /\.xf-native-filter-scroll \{[\s\S]*flex: 1 1 auto;[\s\S]*min-height: 0;[\s\S]*height: 0;[\s\S]*padding-bottom: 32rpx;/);
  assert.match(nativeListWxss, /\.xf-native-filter-chip\.is-active/);
  assert.match(nativeListWxss, /\.xf-native-filter-actions \{[\s\S]*display: flex;[\s\S]*gap: 32rpx;/);
  assert.match(nativeListWxss, /\.xf-native-filter-submit \{[\s\S]*background: #5e17eb;/);
  const filterDrawer = fs.readFileSync(new URL("../utils/filterDrawer.js", import.meta.url), "utf8");
  assert.match(filterDrawer, /DEFAULT_RATIO = 0\.48/);
  assert.match(filterDrawer, /MAX_RATIO = 0\.82/);
  assert.match(filterDrawer, /createFilterDrawerMethods/);
  assert.match(filterDrawer, /createFilterDrawerMethods\(options = \{\}\)/);
  assert.match(filterDrawer, /getFilterDrawerMetrics\(options = \{\}\)/);
  assert.match(filterDrawer, /filterDrawerExpanded: defaultHeight >= maxHeight - 2/);
  assert.match(filterDrawer, /onFilterDrawerTouchStart\(event\)/);
  assert.match(filterDrawer, /onFilterDrawerTouchMove\(event\)/);
  assert.match(filterDrawer, /filterDrawerDragMode/);
  assert.match(filterDrawer, /nextHeight >= maxHeight - 2/);

  const pages = [
    ["programs", "节目", "programFilterTags", "onDrawerProgramTagTap", "item.selected", "clearProgramTagFilter", ""],
    ["reading", "及阅", "readingFilterGroups", "onDrawerReadingTagTap", "option.selected", "clearReadingTagFilter", "reading"],
    ["materials", "资料", "materialFilterGroups", "onDrawerMaterialTagTap", "option.selected", "clearMaterialTagFilter", "materials"]
  ];

  for (const [name, label, tagList, drawerHandler, activeKey, clearHandler, groupedMode] of pages) {
    const { js, wxml, wxss } = readPage(name);
    assert.match(wxml, /class="xf-native-search-field has-filter" bindtap="openSearch" role="button"/);
    assert.match(wxml, new RegExp(`class="xf-native-search-filter" catchtap="openFilterDrawer" aria-label="打开${label}筛选"`));
    assert.match(wxml, /<image class="xf-native-search-filter-icon" src="\/assets\/nav\/filter-sliders\.png" mode="aspectFit" aria-hidden="true" \/>/);
    assert.doesNotMatch(wxml, /xf-native-search-filter-line|xf-native-search-filter-dot|xf-native-search-filter-spark|xf-native-search-filter-funnel|xf-native-search-filter-stem/);
    assert.doesNotMatch(wxml, /material-symbols-rounded">tune|>tune<\/text>/);
    if (name === "programs") {
      assert.match(wxml, /<text class="xf-native-filter-title">节目筛选<\/text>/);
      assert.match(wxml, /<text class="xf-native-filter-subtitle">筛选全部节目内容<\/text>/);
      assert.match(wxml, /<text class="xf-native-filter-section-title">节目标签<\/text>/);
      assert.match(wxml, /catchtap="resetProgramFilterDraft"/);
      assert.match(wxml, /catchtap="applyProgramFilterDraft"[\s\S]*查看 \{\{programFilterPreviewCount\}\} 个节目/);
      assert.match(js, /createFilterDrawerMethods\(\)/);
      assert.doesNotMatch(wxml, /xf-program-filter-/);
      assert.doesNotMatch(wxss, /xf-program-filter-/);
    }
    assert.match(wxml, /wx:if="\{\{filterDrawerOpen\}\}" class="xf-native-filter-mask" catchtap="closeFilterDrawer" catchtouchmove="noop"/);
    assert.match(wxml, /class="xf-native-filter-drawer"[\s\S]*style="height: \{\{filterDrawerHeight\}\}px;"[\s\S]*data-drag-mode="drawer"[\s\S]*catchtap="noop"/);
    assert.match(wxml, /bindtouchstart="onFilterDrawerTouchStart"/);
    assert.match(wxml, /bindtouchmove="onFilterDrawerTouchMove"/);
    assert.match(wxml, /bindtouchend="onFilterDrawerTouchEnd"/);
    assert.match(wxml, /data-drag-mode="handle"[\s\S]*catchtouchstart="onFilterDrawerTouchStart"[\s\S]*catchtouchmove="onFilterDrawerTouchMove"[\s\S]*catchtouchend="onFilterDrawerTouchEnd"/);
    assert.match(wxml, /<scroll-view class="xf-native-filter-scroll" scroll-y="\{\{filterDrawerExpanded\}\}" enhanced show-scrollbar="false">/);
    if (groupedMode) {
      assert.match(wxml, new RegExp(`wx:for="\\{\\{${tagList}\\}\\}"[\\s\\S]*wx:for-item="group"`));
      assert.match(wxml, /wx:for="\{\{group\.options\}\}"[\s\S]*wx:for-item="option"/);
      assert.match(wxml, new RegExp(`catchtap="${drawerHandler}"`));
      assert.match(wxml, new RegExp(`\\{\\{${activeKey} \\? 'is-active' : ''\\}\\}`));
      assert.doesNotMatch(wxml, />书单标签<\/text>|>资料标签<\/text>/);
      if (groupedMode === "reading") {
        assert.match(js, /buildReadingFilterGroups\(allBooks, activeReadingTags\)/);
        assert.match(wxml, /<text class="xf-native-filter-subtitle">筛选全部及阅图书<\/text>/);
        assert.match(wxml, /catchtap="resetReadingFilterDraft"/);
        assert.match(wxml, /catchtap="applyReadingFilterDraft"[\s\S]*查看 \{\{readingFilterPreviewCount\}\} 本图书/);
      } else {
        assert.match(js, /buildMaterialFilterGroups\(allMaterials, activeMaterialTags\)/);
        assert.match(wxml, /catchtap="resetMaterialFilterDraft"/);
        assert.match(wxml, /catchtap="applyMaterialFilterDraft"[\s\S]*查看 \{\{materialFilterPreviewCount\}\} 个资料/);
      }
    } else {
      assert.match(wxml, new RegExp(`wx:for="\\{\\{${tagList}\\}\\}"`));
      assert.match(wxml, new RegExp(`catchtap="${drawerHandler}"`));
      assert.match(wxml, new RegExp(`\\{\\{${activeKey} \\? 'is-active' : ''\\}\\}`));
    }
    assert.match(wxml, new RegExp(`catchtap="${clearHandler}"`));
    assert.doesNotMatch(wxml, /contentFilterOptions|内容类型|data-page="\{\{item\.page\}\}"/);

    assert.match(js, /filterDrawerOpen: false/);
    assert.match(js, /filterDrawerHeight: 0/);
    assert.match(js, /filterDrawerExpanded: false/);
    assert.match(js, new RegExp(`${tagList}: \\[\\]`));
    assert.match(js, /setSettingsTabbarHidden/);
    if (name === "reading") {
      assert.match(js, /openSearch\(\)\s*\{[\s\S]*openNativeSearch\("", \{[\s\S]*readingSource:/);
    } else {
      assert.match(js, /openSearch\(\)\s*\{[\s\S]*openNativeSearch\(\);[\s\S]*\}/);
    }
    assert.doesNotMatch(js, /openNativeSearch\(this\.data\.searchPrompt\)/);
    assert.match(js, /const \{ createFilterDrawerMethods \} = require\("\.\.\/\.\.\/utils\/filterDrawer"\)/);
    assert.match(js, /openFilterDrawer\(\)|createFilterDrawerMethods\(/);
    assert.match(js, /closeFilterDrawer\(\)|createFilterDrawerMethods\(/);
    assert.match(js, new RegExp(`${drawerHandler}\\(event\\)`));
    assert.doesNotMatch(js, /contentFilterOptions|CONTENT_FILTER_OPTIONS|onContentFilterTap|wx\.switchTab\(\{ url: page \}\)/);
  }

  const topics = readPage("topics");
  assert.doesNotMatch(topics.wxml, /class="xf-native-search-field has-filter" bindtap="openSearch" role="button"/);
  assert.doesNotMatch(topics.wxml, /class="xf-native-search-filter" catchtap="openFilterDrawer"/);
  assert.match(topics.wxml, /class="xf-topics-guide"/);
  assert.match(topics.wxml, /wx:for="\{\{guideTags\}\}"/);
  assert.match(topics.wxml, /catchtap="onDrawerTopicTagTap"/);
  assert.match(topics.wxml, /wx:if="\{\{activeTopicTagLabel\}\}" class="xf-native-filter-bar"/);
  assert.match(topics.wxml, /wx:if="\{\{filterDrawerOpen\}\}" class="xf-native-filter-mask" catchtap="closeFilterDrawer" catchtouchmove="noop"/);
  assert.match(topics.wxml, /class="xf-native-filter-drawer"[\s\S]*style="height: \{\{filterDrawerHeight\}\}px;"[\s\S]*data-drag-mode="drawer"[\s\S]*catchtap="noop"/);
  assert.match(topics.wxml, /bindtouchmove="onFilterDrawerTouchMove"/);
  assert.match(topics.wxml, /data-drag-mode="handle"[\s\S]*catchtouchmove="onFilterDrawerTouchMove"/);
  assert.match(topics.wxml, /<scroll-view class="xf-native-filter-scroll" scroll-y="\{\{filterDrawerExpanded\}\}" enhanced show-scrollbar="false">/);
  assert.doesNotMatch(topics.js, /guideTags: GUIDE_TAGS/);
  assert.match(topics.js, /allGuideTags: \[\]/);
  assert.match(topics.js, /guideTags: \[\]/);
  assert.match(topics.js, /buildGuideTags\(allTopics\)/);
  assert.match(topics.js, /topicFilterTags: \[\]/);
  assert.match(topics.js, /activeTopicTags: \[\]/);
  assert.match(topics.js, /draftTopicTags: \[\]/);
  assert.match(topics.js, /topicFilterPreviewCount: 0/);
  assert.match(topics.js, /const \{ createFilterDrawerMethods \} = require\("\.\.\/\.\.\/utils\/filterDrawer"\)/);
  assert.match(topics.js, /filterDrawerHeight: 0/);
  assert.match(topics.js, /filterDrawerExpanded: false/);
  assert.match(topics.js, /onDrawerTopicTagTap\(event\)/);
  assert.match(topics.js, /setSettingsTabbarHidden/);
  assert.match(topics.js, /clearTopicTagFilter\(\)/);
  assert.match(topics.wxml, /class="xf-native-filter-chip \{\{isTopicFilterAllSelected \? 'is-active' : ''\}\}" catchtap="resetTopicFilterDraft"/);
  assert.match(topics.wxml, /class="xf-native-filter-chip \{\{item\.selected \? 'is-active' : ''\}\}"[\s\S]*data-tag="\{\{item\.value\}\}"[\s\S]*catchtap="onDrawerTopicTagTap"/);
  assert.match(topics.wxml, /catchtap="applyTopicFilterDraft"[\s\S]*查看 \{\{topicFilterPreviewCount\}\} 个话题/);
});

test("materials tab opens its link modal and copies the displayed link silently on tap", () => {
  const definition = loadPageDefinition("materials");
  const originalSetClipboardData = global.wx.setClipboardData;
  const originalShowToast = global.wx.showToast;
  const copied = [];
  const toasts = [];

  global.wx.setClipboardData = (options) => {
    copied.push(options.data);
    if (typeof options.success === "function") options.success();
  };
  global.wx.showToast = (options) => {
    toasts.push(options);
  };

  try {
    const context = {
      data: {
        materials: [
          {
            fileUrl: "https://pan.quark.cn/s/demo",
            title: "练笔9五年级"
          }
        ]
      },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };

    definition.copyMaterialLink.call(
      context,
      {
        currentTarget: {
          dataset: {
            index: 0,
            url: "https://pan.quark.cn/s/demo"
          }
        }
      }
    );

    assert.deepEqual(copied, []);
    assert.deepEqual(toasts, []);
    assert.equal(context.data.materialLinkModalOpen, true);
    assert.equal(context.data.materialLinkModalTitle, "练笔9五年级");
    assert.equal(context.data.materialLinkModalUrl, "https://pan.quark.cn/s/demo");

    definition.copyMaterialModalLink.call(context);
    assert.deepEqual(copied, ["https://pan.quark.cn/s/demo"]);
    assert.deepEqual(toasts, []);

    definition.closeMaterialLinkModal.call(context);
    assert.equal(context.data.materialLinkModalOpen, false);
    assert.equal(context.data.materialLinkModalUrl, "");
  } finally {
    global.wx.setClipboardData = originalSetClipboardData;
    global.wx.showToast = originalShowToast;
  }
});

test("materials tab splits composite field tags and removes metadata-only descriptions", async () => {
  const definition = loadPageDefinition("materials");
  const originalRequest = global.wx.request;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map();
  const context = {
    ...definition,
    allMaterials: [],
    data: {
      ...definition.data,
      materials: [],
      activeMaterialTag: "",
      activeMaterialTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.request = (options) => {
      options.success({
        statusCode: 200,
        data: [
          {
            _id: "material-1",
            title: "练第9一年级",
            category: "小学 / 语文 / 一年级 / 练第9",
            description: "关键分类：练第9；阶段：小学；年级：一年级；学科：语文",
            fileUrl: "https://pan.quark.cn/s/one"
          },
          {
            _id: "material-2",
            title: "2026年高考资料",
            category: "升学规划、高考、高考志愿、志愿填报",
            description: "关键分类：升学规划、高考、高考志愿、志愿填报；包含最新专业、填报流程、各省市志愿样表",
            fileUrl: "https://pan.quark.cn/s/two"
          },
          {
            _id: "material-3",
            title: "数字年级资料",
            category: "小学 / 3年级 / 1-2年级 / 初1年级 / 高1年级 / 二年级（下册） / 数学",
            description: "阶段：小学；年级：3年级、1-2年级、初1年级、高1年级、二年级（下册）；学科：数学",
            fileUrl: "https://pan.quark.cn/s/three"
          }
        ]
      });
    };
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };

    await definition.loadMaterials.call(context);

    const firstTags = context.data.materials[0].fieldTags.map((tag) => [tag.tone, tag.text]);
    assert.deepEqual(firstTags, [
      ["stage", "小学"],
      ["grade", "一年级"],
      ["subject", "语文"],
      ["category", "练第9"]
    ]);
    assert.equal(context.data.materials[0].description.includes("关键分类"), false);
    assert.equal(context.data.materials[0].description.includes("阶段"), false);

    const secondTags = context.data.materials[1].fieldTags.map((tag) => tag.text);
    assert.deepEqual(secondTags, ["升学规划", "高考", "高考志愿", "志愿填报"]);
    assert.equal(secondTags.some((tag) => tag.includes("，") || tag.includes("/")), false);
    assert.equal(context.data.materials[1].description.includes("关键分类"), false);
    assert.equal(context.data.materials[1].description.includes("高考志愿"), false);
    assert.match(context.data.materials[1].description, /包含最新专业/);

    const thirdGradeTags = context.data.materials[2].fieldTags
      .filter((tag) => tag.tone === "grade")
      .map((tag) => tag.text);
    assert.deepEqual(thirdGradeTags, ["三年级", "一年级", "七年级", "十年级", "二年级"]);
    assert.equal(thirdGradeTags.includes("3年级"), false);
    assert.equal(thirdGradeTags.includes("1-2年级"), false);
    assert.equal(thirdGradeTags.includes("初1年级"), false);
    assert.equal(thirdGradeTags.includes("高1年级"), false);
    assert.equal(thirdGradeTags.includes("二年级（下册）"), false);

    const groupsByTitle = new Map(context.data.materialFilterGroups.map((group) => [group.title, group.options.map((option) => option.label)]));
    assert.deepEqual(groupsByTitle.get("阶段"), ["小学"]);
    assert.deepEqual(groupsByTitle.get("年级"), ["一年级", "二年级", "三年级", "七年级", "十年级"]);
    assert.deepEqual(groupsByTitle.get("科目"), ["语文", "数学"]);
    assert.equal(storage.has("xf_native_materials_cache_v2"), true);
  } finally {
    global.wx.request = originalRequest;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("reading tab switches between feature and compact book layouts", async () => {
  const definition = loadPageDefinition("reading");
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map();
  const pageScrolls = [];
  const context = {
    allBooks: [
      { id: "b1", title: "一年级阅读", fieldTags: ["一年级", "阅读"], displayTags: ["#一年级", "#阅读"] },
      { id: "b2", title: "通用教育", fieldTags: ["通用", "教育"], displayTags: ["#通用", "#教育"] }
    ],
    data: {
      compactMode: false,
      activeReadingTag: "",
      allBooks: [],
      books: [
        { id: "b1", title: "一年级阅读", fieldTags: ["一年级", "阅读"], displayTags: ["#一年级", "#阅读"] },
        { id: "b2", title: "通用教育", fieldTags: ["通用", "教育"], displayTags: ["#通用", "#教育"] }
      ]
    },
    getReadingSource: definition.getReadingSource,
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    applyReadingTagFilter: definition.applyReadingTagFilter,
    applyReadingTagFilters: definition.applyReadingTagFilters,
    scrollBelowSearchPanel() {
      pageScrolls.push(true);
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };

    definition.loadPreferredViewMode.call(context);
    assert.equal(context.data.compactMode, true);

    storage.set("xf_native_books_view_mode", "compact");
    definition.loadPreferredViewMode.call(context);
    assert.equal(context.data.compactMode, true);

    definition.switchBookViewMode.call(context);
    assert.equal(context.data.compactMode, false);
    assert.equal(storage.get("xf_native_books_view_mode"), "feature");

    definition.switchBookViewMode.call(context);
    assert.equal(context.data.compactMode, true);
    assert.equal(storage.get("xf_native_books_view_mode"), "compact");

    definition.onReadingTagTap.call(context, { currentTarget: { dataset: { tag: "#一年级" } } });
    assert.equal(context.data.activeReadingTag, "#一年级");
    assert.deepEqual(context.data.activeReadingTags, ["一年级"]);
    assert.equal(context.data.activeReadingTagLabel, "一年级");
    assert.equal(context.data.books.length, 1);
    assert.equal(context.data.books[0].id, "b1");
    assert.equal(pageScrolls.length, 1);

    definition.clearReadingTagFilter.call(context);
    assert.equal(context.data.activeReadingTag, "");
    assert.deepEqual(context.data.activeReadingTags, []);
    assert.equal(context.data.activeReadingTagLabel, "");
    assert.equal(context.data.books.length, 2);

    const pendingLoadCalls = [];
    const pendingContext = {
      ...definition,
      allBooks: [],
      data: {
        ...definition.data,
        useExternalLibrarySource: false,
        books: []
      },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      },
      loadBooks(options) {
        pendingLoadCalls.push(options);
        return Promise.resolve();
      },
      scrollBelowSearchPanel() {
        pageScrolls.push(true);
      }
    };
    storage.set("xf_reading_pending_filter_v1", { source: "external", tag: "Thriller" });
    await definition.consumePendingReadingFilter.call(pendingContext);
    assert.equal(storage.get("xf_reading_pending_filter_v1"), "");
    assert.equal(pendingContext.data.useExternalLibrarySource, true);
    assert.deepEqual(pendingContext.data.activeReadingTags, ["Thriller"]);
    assert.equal(pendingContext.data.activeReadingTagLabel, "Thriller");
    assert.deepEqual(pendingLoadCalls, [{ showRefreshing: true }]);

    const keywordHydrationCalls = [];
    const pendingKeywordContext = {
      ...definition,
      allBooks: [],
      data: {
        ...definition.data,
        useExternalLibrarySource: false,
        books: []
      },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      },
      scrollBelowSearchPanel() {
        pageScrolls.push(true);
      },
      hydrateNativeBookListDescriptions(books) {
        keywordHydrationCalls.push(books.map((book) => book.title));
        return Promise.resolve();
      },
      prefetchNativeFullLibraryForFilters() {
        const allBooks = [
          {
            id: "thinking-1",
            title: "百花思维训练",
            author: "百花学习塾",
            description: "",
            hasListDescription: false,
            fieldTags: ["思维训练", "幼小衔接"],
            displayTags: ["#思维训练", "#幼小衔接"]
          },
          {
            id: "writing-1",
            title: "中考作文素材与表达",
            author: "夏老师",
            description: "围绕中考作文审题、立意和素材积累，帮助孩子形成可迁移的表达方法。",
            hasListDescription: true,
            fieldTags: ["中考作文", "初中", "写作"],
            displayTags: ["#中考作文", "#初中", "#写作"]
          }
        ];
        this.allBooks = allBooks;
        return Promise.resolve(allBooks);
      }
    };
    storage.set("xf_reading_pending_filter_v1", { source: "external", keyword: "中考作文" });
    await definition.consumePendingReadingFilter.call(pendingKeywordContext);
    assert.equal(storage.get("xf_reading_pending_filter_v1"), "");
    assert.equal(pendingKeywordContext.data.useExternalLibrarySource, false);
    assert.equal(pendingKeywordContext.data.activeReadingTagLabel, "中考作文");
    assert.deepEqual(pendingKeywordContext.data.books.map((book) => book.title), ["中考作文素材与表达"]);
    assert.equal(pendingKeywordContext.data.books[0].hasListDescription, true);
    assert.equal(pendingKeywordContext.data.books[0].description, "围绕中考作文审题、立意和素材积累，帮助孩子形成可迁移的表达方法。");
    assert.deepEqual(keywordHydrationCalls, [["中考作文素材与表达"]]);
  } finally {
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("reading external library cards use tighter tag spacing", () => {
  const reading = readPage("reading");

  assert.match(reading.wxml, /<view class="xf-native-page xf-reading-page \{\{fontSizeClass\}\} \{\{compactMode \? 'is-compact' : 'is-feature'\}\} \{\{useExternalLibrarySource \? 'is-external-library' : 'is-native-library'\}\}" style="padding-top: \{\{chromeHeight\}\}px;">/);
  assert.match(reading.wxss, /\.xf-reading-tags \{[\s\S]*gap: 14rpx;/);
  assert.match(reading.wxss, /\.xf-reading-page\.is-external-library \.xf-reading-tags \{[\s\S]*gap: 6rpx 10rpx;[\s\S]*margin-top: 8rpx;[\s\S]*min-height: 32rpx;/);
});

test("reading external library does not show a manual cache sync tip", () => {
  const reading = readPage("reading");

  assert.doesNotMatch(reading.wxml, /已先显示上次缓存，正在同步最新内容/);
  assert.doesNotMatch(reading.wxml, /xf-native-cache-tip/);
});

test("reading external library treats the Jiyue default logo as a non-cover for ordering", () => {
  const reading = readPage("reading");

  assert.match(reading.js, /function isRealReadingCoverImage\(value\)/);
  assert.match(reading.js, /source\.indexOf\(DEFAULT_READING_COVER_IMAGE\) >= 0/);
  assert.match(reading.js, /hasRealCover: isRealReadingCoverImage\(coverImage\)/);
  assert.match(reading.js, /if \(book\.hasRealCover\) score \+= 8;/);
});

test("reading external keyword search queries the live library instead of filtering the loaded page", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const requests = [];
  const context = {
    ...definition,
    allBooks: [
      { id: "loaded-first-page", title: "首屏无关图书", author: "作者", fieldTags: [], displayTags: [] }
    ],
    data: {
      ...definition.data,
      useExternalLibrarySource: true,
      books: [
        { id: "loaded-first-page", title: "首屏无关图书", author: "作者", fieldTags: [], displayTags: [] }
      ],
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    scrollBelowSearchPanel() {}
  };

  try {
    global.wx.request = (options) => {
      requests.push(options.url);
      if (String(options.url).includes("/api/books/external") && String(options.url).includes("q=")) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              {
                id: "gaokao-1",
                title: "高考志愿填报指南",
                author: "志愿专家",
                description: "围绕院校选择、专业匹配和志愿梯度给家长做系统说明。",
                category: "高考志愿;升学规划",
                levelRange: "高中"
              }
            ],
            total: 1,
            current: 1,
            pages: 1
          }
        });
      }
    };

    await definition.applyReadingKeywordFilter.call(context, "高考志愿");

    assert.equal(requests.some((url) => String(url).includes("/api/books/external") && String(url).includes("q=%E9%AB%98%E8%80%83%E5%BF%97%E6%84%BF")), true);
    assert.deepEqual(context.data.books.map((book) => book.title), ["高考志愿填报指南"]);
    assert.equal(context.data.books[0].description, "围绕院校选择、专业匹配和志愿梯度给家长做系统说明。");
    assert.equal(context.data.books[0].hasListDescription, true);
    assert.equal(context.data.readingFilterPreviewCount, 1);
    assert.equal(context.data.hasMoreBooks, false);
  } finally {
    global.wx.request = originalRequest;
  }
});

test("reading search opens with the current reading library source", () => {
  const definition = loadPageDefinition("reading");
  const originalNavigateTo = global.wx.navigateTo;
  const navigateCalls = [];
  const context = {
    ...definition,
    data: { ...definition.data, useExternalLibrarySource: false }
  };

  try {
    global.wx.navigateTo = (options) => navigateCalls.push(options);

    definition.openSearch.call(context);
    context.data.useExternalLibrarySource = true;
    definition.openSearch.call(context);

    assert.deepEqual(navigateCalls[0], {
      url: "/pages/search/index?readingSource=native"
    });
    assert.deepEqual(navigateCalls[1], {
      url: "/pages/search/index?readingSource=native"
    });
  } finally {
    global.wx.navigateTo = originalNavigateTo;
  }
});

test("reading tab renders app-preloaded native first-page cache before full refresh", async () => {
  const definition = loadPageDefinition("reading");
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalRequest = global.wx.request;
  const requests = [];
  const storage = new Map([
    [
      "xf_native_books_first_page_v3",
      {
        records: [
          {
            _id: "raw-preloaded",
            title: "预热原始书",
            author: "作者",
            grade: "一年级",
            categoryLabel: "阅读指南",
            hasMetadataDetail: true
          }
        ],
        total: 2777,
        current: 1,
        pages: 116,
        size: 24
      }
    ]
  ]);
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      loading: true,
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.request = (options) => {
      requests.push(options.url);
      if (String(options.url).endsWith("/api/books/raw-preloaded/metadata")) {
        options.success({
          statusCode: 200,
          data: {
            description: "这本书讲一棵大树上的字母如何学会组合成词语和句子，适合一年级孩子理解文字的力量。"
          }
        });
      }
    };

    definition.renderNativeBooksFirstPageFromCache.call(context);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(context.data.loading, false);
    assert.equal(context.data.books[0].id, "raw-preloaded");
    assert.equal(context.data.books[0].description, "这本书讲一棵大树上的字母如何学会组合成词语和句子，适合一年级孩子理解文字的力量。");
    assert.equal(requests.some((url) => String(url).endsWith("/api/books/raw-preloaded/metadata")), true);
    assert.equal(context.data.books[0].coverImage, "");
    assert.equal(context.data.books[0].path, "/reading/raw-preloaded");
    assert.equal(context.data.books[0].displayTags.includes("#阅读指南"), true);
    assert.equal(context.data.readingFilterPreviewCount, 2777);
    assert.equal(context.data.hasMoreBooks, true);
  } finally {
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.request = originalRequest;
  }
});

test("reading tab skips native first-page cache on local startup", async () => {
  const definition = loadPageDefinition("reading");
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const originalRequest = global.wx.request;
  const originalShowShareMenu = global.wx.showShareMenu;
  const requests = [];
  const storage = new Map([
    ["xf_native_books_source_v1", "native"],
    [
      "xf_native_books_first_page_v3",
      {
        records: [
          {
            _id: "raw-preloaded",
            title: "不该先显示的旧首屏书",
            author: "作者",
            grade: "一年级",
            categoryLabel: "阅读指南",
            hasMetadataDetail: true
          }
        ],
        total: 2777,
        current: 1,
        pages: 116,
        size: 24
      }
    ]
  ]);
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      loading: true,
      useExternalLibrarySource: false,
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    syncTopbarMetrics() {},
    scrollBelowSearchPanel() {}
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => storage.set(key, value);
    global.wx.showShareMenu = () => {};
    global.wx.request = (options) => {
      requests.push(options.url);
      if (String(options.url).includes("/api/books?") && String(options.url).includes("current=1")) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              {
                _id: "target-local",
                title: "龙王家的大喜事",
                author: "符文征",
                description: "分页接口返回的目标首屏。",
                coverImage: "https://example.com/target.jpg",
                hasMetadataDetail: true
              }
            ],
            total: 1,
            current: 1,
            pages: 1,
            size: 24
          }
        });
        return;
      }
      if (String(options.url).includes("/api/books/external")) {
        options.success({ statusCode: 200, data: { records: [], total: 0, pages: 1 } });
        return;
      }
      options.success({ statusCode: 200, data: {} });
    };

    definition.onLoad.call(context);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(context.data.useExternalLibrarySource, false);
    assert.equal(context.data.books[0].id, "target-local");
    assert.equal(context.data.books.some((book) => book.id === "raw-preloaded"), false);
    assert.equal(requests.some((url) => String(url).endsWith("/api/books/raw-preloaded/metadata")), false);
  } finally {
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
    global.wx.request = originalRequest;
    global.wx.showShareMenu = originalShowShareMenu;
  }
});

test("reading tab hydrates missing local list descriptions from metadata", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const requests = [];
  const storage = new Map();
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      loading: true,
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => storage.set(key, value);
    global.wx.request = (options) => {
      requests.push(options.url);
      if (String(options.url).includes("/api/books?") && String(options.url).includes("current=1")) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              {
                _id: "live-no-description",
                title: "列表缺简介",
                author: "作者",
                categoryLabel: "阅读指南"
              }
            ],
            total: 1,
            current: 1,
            pages: 1,
            size: 24
          }
        });
        return;
      }
      if (String(options.url).endsWith("/api/books/live-no-description/metadata")) {
        options.success({
          statusCode: 200,
          data: {
            description: "详情元数据里的简介应该补回列表卡片，并保持两行省略的展示方式。"
          }
        });
      }
    };

    await definition.loadBooks.call(context);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(context.data.books[0].description, "详情元数据里的简介应该补回列表卡片，并保持两行省略的展示方式。");
    assert.equal(requests.some((url) => String(url).endsWith("/api/books/live-no-description/metadata")), true);
    assert.equal(storage.get("xf_native_books_cache_v6")[0].description, "详情元数据里的简介应该补回列表卡片，并保持两行省略的展示方式。");
  } finally {
    global.wx.request = originalRequest;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("reading tab replaces cached fallback list summaries with metadata introductions", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const requests = [];
  const storage = new Map([
    [
      "xf_native_books_cache_v6",
      [
        {
          id: "cached-fallback-description",
          title: "旧缓存书",
          author: "未标注",
          description: "收录于「给0-6岁儿童推荐的1000本图画书」，主题：童话故事",
          displayTags: ["#未标注", "#童话故事"],
          fieldTags: ["未标注", "童话故事"],
          hasMetadataDetail: true
        }
      ]
    ]
  ]);
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      loading: true,
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => storage.set(key, value);
    global.wx.request = (options) => {
      requests.push(options.url);
      if (String(options.url).includes("/api/books?") && String(options.url).includes("current=1")) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              {
                _id: "cached-fallback-description",
                title: "旧缓存书",
                author: "未标注",
                categoryLabel: "未标注",
                topic: "童话故事",
                hasMetadataDetail: true
              }
            ],
            total: 1,
            current: 1,
            pages: 1,
            size: 24
          }
        });
        return;
      }
      if (String(options.url).endsWith("/api/books/cached-fallback-description/metadata")) {
        options.success({
          statusCode: 200,
          data: {
            description: "这才是图书详情内容简介里的真实介绍。"
          }
        });
      }
    };

    await definition.loadBooks.call(context);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(context.data.books[0].author, "");
    assert.equal(context.data.books[0].description, "这才是图书详情内容简介里的真实介绍。");
    assert.equal(context.data.books[0].displayTags.includes("#未标注"), false);
    assert.equal(context.data.books[0].fieldTags.includes("未标注"), false);
    assert.equal(requests.some((url) => String(url).endsWith("/api/books/cached-fallback-description/metadata")), true);
    assert.equal(storage.get("xf_native_books_cache_v6")[0].description, "这才是图书详情内容简介里的真实介绍。");
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("reading tab falls back to local detail when metadata has no list description", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const originalSetStorageSync = global.wx.setStorageSync;
  const requests = [];
  const storage = new Map();
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      loading: true,
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.setStorageSync = (key, value) => storage.set(key, value);
    global.wx.request = (options) => {
      requests.push(options.url);
      if (String(options.url).includes("/api/books?") && String(options.url).includes("current=1")) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              {
                _id: "detail-description-only",
                title: "详情才有简介",
                author: "作者",
                categoryLabel: "阅读指南"
              }
            ],
            total: 1,
            current: 1,
            pages: 1,
            size: 24
          }
        });
        return;
      }
      if (String(options.url).endsWith("/api/books/detail-description-only/metadata")) {
        options.success({ statusCode: 200, data: { description: "" } });
        return;
      }
      if (String(options.url).endsWith("/api/books/detail-description-only")) {
        options.success({
          statusCode: 200,
          data: {
            summary: "本地图书详情接口里的简介也应该补回及阅列表。"
          }
        });
      }
    };

    await definition.loadBooks.call(context);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(context.data.books[0].description, "本地图书详情接口里的简介也应该补回及阅列表。");
    assert.equal(requests.some((url) => String(url).endsWith("/api/books/detail-description-only/metadata")), true);
    assert.equal(requests.some((url) => String(url).endsWith("/api/books/detail-description-only")), true);
    assert.equal(storage.get("xf_native_books_cache_v6")[0].description, "本地图书详情接口里的简介也应该补回及阅列表。");
  } finally {
    global.wx.request = originalRequest;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("reading tab prioritizes local books that have both detail and list descriptions", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      loading: true,
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.request = (options) => {
      if (String(options.url).includes("/api/books?") && String(options.url).includes("current=1")) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              {
                _id: "detail-without-description",
                title: "有详情但无简介",
                author: "作者",
                coverImage: "/uploads/cover-a.jpg",
                hasMetadataDetail: true
              },
              {
                _id: "detail-with-description",
                title: "有详情且有简介",
                author: "作者",
                coverImage: "/uploads/cover-b.jpg",
                hasMetadataDetail: true,
                description: "这本书有真实简介，应该在及阅列表靠前展示。"
              },
              {
                _id: "description-without-detail",
                title: "有简介但无详情",
                author: "作者",
                coverImage: "/uploads/cover-c.jpg",
                description: "只有简介，没有详情。"
              }
            ],
            total: 3,
            current: 1,
            pages: 1,
            size: 24
          }
        });
        return;
      }
      options.success({ statusCode: 200, data: [] });
    };

    await definition.loadBooks.call(context);

    assert.deepEqual(context.data.books.map((book) => book.title), [
      "有详情且有简介",
      "有简介但无详情",
      "有详情但无简介"
    ]);
    assert.equal(context.data.books[0].hasListDescription, true);
    assert.equal(context.data.books[0].description, "这本书有真实简介，应该在及阅列表靠前展示。");
  } finally {
    global.wx.request = originalRequest;
  }
});

test("reading tab treats fallback book covers as missing covers", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      loading: true,
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.request = (options) => {
      if (String(options.url).includes("/api/books?") && String(options.url).includes("current=1")) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              {
                _id: "placeholder-cover",
                title: "兜底封面图书",
                author: "作者",
                coverImage: "https://via.placeholder.com/240x320/630ed4/ffffff?text=Book",
                hasMetadataDetail: true,
                description: "这本书有真实简介，但封面是兜底图。"
              },
              {
                _id: "real-cover",
                title: "真实封面图书",
                author: "作者",
                coverImage: "/uploads/books/real-cover.jpg",
                hasMetadataDetail: true,
                description: "这本书有真实简介，也有真实封面。"
              }
            ],
            total: 2,
            current: 1,
            pages: 1,
            size: 24
          }
        });
        return;
      }
      options.success({ statusCode: 200, data: [] });
    };

    await definition.loadBooks.call(context);

    const placeholderBook = context.data.books.find((book) => book.title === "兜底封面图书");
    const realCoverBook = context.data.books.find((book) => book.title === "真实封面图书");
    assert.equal(placeholderBook.coverImage, "");
    assert.equal(realCoverBook.coverImage, "https://xianfeng.xinzhi.info/uploads/books/real-cover.jpg");
  } finally {
    global.wx.request = originalRequest;
  }
});

test("reading tab loads the next local server page with descriptions", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const originalSetStorageSync = global.wx.setStorageSync;
  const requests = [];
  const storage = new Map();
  const firstPageRecords = Array.from({ length: 24 }, (_, index) => ({
    _id: `local-page-book-${index + 1}`,
    title: `第 ${index + 1} 本书`,
    author: "作者",
    categoryLabel: "阅读指南",
    description: `local-page-book-${index + 1} 的列表简介`
  }));
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      loading: true,
      activeReadingTag: "",
      activeReadingTags: [],
      visibleBookCount: 24
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.setStorageSync = (key, value) => storage.set(key, value);
    global.wx.request = (options) => {
      requests.push(options.url);
      if (String(options.url).includes("/api/books?") && String(options.url).includes("current=1")) {
        options.success({
          statusCode: 200,
          data: { records: firstPageRecords, total: 25, current: 1, pages: 2, size: 24 }
        });
        return;
      }
      if (String(options.url).includes("/api/books?") && String(options.url).includes("current=2")) {
        options.success({
          statusCode: 200,
          data: {
            records: [{
              _id: "local-page-book-25",
              title: "第 25 本书",
              author: "作者",
              categoryLabel: "阅读指南",
              description: "local-page-book-25 的列表简介"
            }],
            total: 25,
            current: 2,
            pages: 2,
            size: 24
          }
        });
        return;
      }
      if (String(options.url).endsWith("/api/books")) {
        options.success({ statusCode: 200, data: [] });
      }
    };

    await definition.loadBooks.call(context);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(context.data.books.length, 24);
    assert.equal(context.data.books[23].description, "local-page-book-24 的列表简介");
    assert.equal(context.data.hasMoreBooks, true);

    await definition.loadMoreBooks.call(context);

    assert.equal(context.data.books.length, 25);
    assert.equal(context.data.books[24].description, "local-page-book-25 的列表简介");
    assert.equal(requests.some((url) => String(url).includes("/api/books?") && String(url).includes("current=2")), true);
    assert.equal(requests.some((url) => String(url).endsWith("/api/books")), false);
    assert.equal(requests.some((url) => String(url).includes("/metadata")), false);
    assert.equal(storage.get("xf_native_books_cache_v6")[24].description, "local-page-book-25 的列表简介");
  } finally {
    global.wx.request = originalRequest;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("reading tab splits grade age and topic filters into separate groups", async () => {
  const reading = readPage("reading");
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.request = (options) => {
      options.success({
        statusCode: 200,
        data: [
          {
            _id: "book-1",
            title: "拆分测试书",
            author: "作者",
            publisher: "测试出版社",
            description: "这本书用一个具体故事讲清楚孩子如何把阅读经验转成表达素材，适合家庭共读后做两步写作练习。",
            recommendedGuest: "魏智渊",
            grade: "3-4岁；4-5岁/中班；一年级",
            categoryLabel: "0-6岁1000本图书",
            sourceName: "给0-6岁儿童推荐的1000本图画书；5-6岁：大班特别推荐100本图画书；3-6岁：小/中/大班各100本特别推荐图画书",
            topic: "童话故事；儿童童谣；文化习俗；品格教养；0-6岁1000本图书；共读绘本（共56本）；自读绘本（共177本）；想象创意",
            hasMetadataDetail: true
          },
          {
            _id: "book-2",
            title: "另一本书",
            author: "作者",
            grade: "二年级",
            categoryLabel: "其他书单",
            topic: "阅读",
            hasMetadataDetail: true
          }
        ]
      });
    };

    await definition.loadBooks.call(context);
    const groupsByTitle = new Map(context.data.readingFilterGroups.map((group) => [group.title, group.options.map((option) => option.label)]));
    assert.deepEqual(groupsByTitle.get("年级"), ["中班", "一年级", "二年级"]);
    assert.deepEqual(groupsByTitle.get("年龄"), ["3-4岁", "4-5岁"]);
    assert.ok(groupsByTitle.get("主题").includes("童话故事"));
    assert.ok(groupsByTitle.get("主题").includes("儿童童谣"));
    assert.ok(groupsByTitle.get("主题").includes("文化习俗"));
    assert.ok(groupsByTitle.get("主题").includes("品格教养"));
    assert.ok(groupsByTitle.get("主题").includes("想象创意"));
    assert.ok(groupsByTitle.get("主题").includes("共读绘本"));
    assert.ok(groupsByTitle.get("主题").includes("自读绘本"));
    assert.equal(groupsByTitle.has("书单"), false);
    assert.equal(groupsByTitle.get("主题").includes("0-6岁1000本图书"), false);
    assert.equal(groupsByTitle.get("主题").includes("共读绘本（共56本）"), false);
    assert.equal(groupsByTitle.get("主题").includes("自读绘本（共177本）"), false);
    assert.equal(context.data.books[0].displayTags.includes("#0-6岁1000本图书"), true);
    assert.equal(context.data.books[0].displayTags.includes("#给0-6岁儿童推荐的1000本图画书"), false);
    assert.equal(context.data.books[0].displayTags.includes("#5-6岁：大班特别推荐100本图画书"), false);
    assert.equal(context.data.books[0].sourceTags.includes("给0-6岁儿童推荐的1000本图画书"), true);
    assert.equal(context.data.books[0].fieldTags.includes("魏智渊"), true);
    assert.equal(context.data.books[0].fieldTags.includes("测试出版社"), true);
    assert.equal(context.data.books[0].fieldTags.includes("文化习俗"), true);
    assert.equal(context.data.books[0].description, "这本书用一个具体故事讲清楚孩子如何把阅读经验转成表达素材，适合家庭共读后做两步写作练习。");
    assert.equal(context.data.books[0].hasListDescription, true);
    assert.equal(context.data.books[1].description.includes("来自《"), false);
    assert.equal(context.data.books[1].description, "");
    assert.equal(context.data.books[1].hasListDescription, false);
    assert.doesNotMatch(reading.js, /没有匹配的 \$\{activeReadingTagLabel\} 书单/);
    assert.match(reading.js, /没有匹配的 \$\{activeReadingTagLabel\} 图书/);
    assert.match(reading.wxml, /<text wx:if="\{\{item\.hasListDescription\}\}" class="xf-native-description">\{\{item\.description\}\}<\/text>/);
    assert.doesNotMatch(reading.wxml, /wx:if="\{\{item\.description\}\}"/);
    const nativeListWxss = fs.readFileSync(new URL("../styles/native-list.wxss", import.meta.url), "utf8");
    assert.match(nativeListWxss, /\.xf-native-description \{[\s\S]*display: -webkit-box;[\s\S]*-webkit-line-clamp: 2;/);
    assert.equal(context.data.books[0].displayTags.includes("#共读绘本（共56本）"), false);
    assert.equal(context.data.books[0].displayTags.includes("#自读绘本（共177本）"), false);
    assert.equal(groupsByTitle.get("年级").includes("3-4岁"), false);
    definition.onReadingTagTap.call(context, { currentTarget: { dataset: { tag: "#0-6岁1000本图书" } } });
    assert.equal(context.data.activeReadingTagLabel, "0-6岁1000本图书");
    assert.deepEqual(context.data.books.map((book) => book.id), ["book-1"]);
    definition.onReadingTagTap.call(context, { currentTarget: { dataset: { tag: "#魏智渊" } } });
    assert.equal(context.data.activeReadingTagLabel, "魏智渊");
    assert.deepEqual(context.data.books.map((book) => book.id), ["book-1"]);
  } finally {
    global.wx.request = originalRequest;
  }
});

test("reading tab toggles between local books and live library books", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const requests = [];
  const storage = new Map();
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => storage.set(key, value);
    global.wx.request = (options) => {
      requests.push(options.url);
      if (String(options.url).includes("/api/books/external")) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              {
                id: "external-1",
                title: "外部书库",
                author: "外部作者",
                publisher: "外部出版社",
                coverPic: "https://example.com/external.jpg",
                tags: "桥梁书,阅读",
                levelRange: "花生 5 级",
                description: "外部书库简介"
              }
            ],
            total: 2777,
            pages: 2
          }
        });
        return;
      }
      if (String(options.url).endsWith("/api/books/local-1/metadata")) {
        options.success({
          statusCode: 200,
          data: {
            description: "切回本地后仍应保留的简介"
          }
        });
        return;
      }
      options.success({
        statusCode: 200,
        data: [
          {
            _id: "local-1",
            title: "本地书单",
            author: "本地作者",
            hasMetadataDetail: true
          }
        ]
      });
    };

    await definition.loadBooks.call(context);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requests.some((url) => String(url).includes("/api/books?") && String(url).includes("current=1")), true);
    assert.equal(requests.some((url) => String(url).match(/\/api\/books$/)), false);
    assert.equal(context.data.books[0].id, "local-1");
    assert.equal(context.data.books[0].description, "切回本地后仍应保留的简介");
    assert.equal(storage.get("xf_native_books_cache_v6")[0].description, "切回本地后仍应保留的简介");

    await definition.toggleReadingLibrarySource.call(context);
    assert.equal(context.data.useExternalLibrarySource, true);
    assert.equal(storage.get("xf_native_books_source_v1"), "external");
    assert.equal(context.allBooks.length, 1);
    assert.equal(context.data.books[0].id, "external-1");
    assert.equal(context.data.books[0].path, "/library/external-1");
    assert.equal(context.data.books[0].detailEnabled, true);
    assert.equal(context.data.readingFilterPreviewCount, 2777);

    const externalRequests = requests.filter((url) => String(url).includes("/api/books/external"));
    assert.deepEqual(
      externalRequests.map((url) => String(url).match(/[?&]current=(\d+)/)?.[1]),
      ["1", "1"]
    );
    assert.deepEqual(
      externalRequests.map((url) => String(url).match(/[?&]size=(\d+)/)?.[1]),
      ["24", "1"]
    );
    assert.deepEqual(
      externalRequests.map((url) => String(url).includes("includeFilters=1")),
      [false, true]
    );
    assert.equal(context.allBooks.length, 1);
    assert.equal(context.data.readingFilterGroups.some((group) => group.options.some((option) => option.label === "科普")), false);

    const requestCountBeforeNativeToggle = requests.length;
    await definition.toggleReadingLibrarySource.call(context);
    assert.equal(requests.slice(requestCountBeforeNativeToggle).some((url) => String(url).includes("/api/books?") && String(url).includes("current=1")), true);
    assert.equal(requests.slice(requestCountBeforeNativeToggle).some((url) => String(url).match(/\/api\/books$/)), false);
    assert.equal(context.data.useExternalLibrarySource, false);
    assert.equal(storage.get("xf_native_books_source_v1"), "native");
    assert.equal(context.data.books[0].id, "local-1");
    assert.equal(context.data.books[0].description, "切回本地后仍应保留的简介");
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("reading tab preserves delayed local descriptions while switching libraries repeatedly", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const requests = [];
  const storage = new Map();
  let pendingMetadataRequest = null;
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => storage.set(key, value);
    global.wx.request = (options) => {
      requests.push(options.url);
      const url = String(options.url);
      if (url.includes("/api/books/external")) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              {
                id: "external-repeat",
                title: "外部切换书",
                author: "外部作者",
                tags: "阅读",
                description: "外部简介"
              }
            ],
            total: 1,
            pages: 1
          }
        });
        return;
      }
      if (url.endsWith("/api/books/local-repeat/metadata")) {
        pendingMetadataRequest = options;
        return;
      }
      options.success({
        statusCode: 200,
        data: [
          {
            _id: "local-repeat",
            title: "反复切换本地图书",
            author: "本地作者",
            hasMetadataDetail: true
          }
        ]
      });
    };

    await definition.loadBooks.call(context);
    assert.equal(context.data.books[0].id, "local-repeat");
    assert.equal(context.data.books[0].description, "");
    assert.ok(pendingMetadataRequest, "metadata request should still be in flight before switching away");

    await definition.toggleReadingLibrarySource.call(context);
    assert.equal(context.data.useExternalLibrarySource, true);
    assert.equal(context.data.books[0].id, "external-repeat");

    pendingMetadataRequest.success({
      statusCode: 200,
      data: {
        description: "延迟返回的本地简介也要写入本地缓存，不能因为当前在外部书库就丢掉。"
      }
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      storage.get("xf_native_books_cache_v6")[0].description,
      "延迟返回的本地简介也要写入本地缓存，不能因为当前在外部书库就丢掉。"
    );
    assert.equal(context.data.books[0].id, "external-repeat");

    await definition.toggleReadingLibrarySource.call(context);
    assert.equal(context.data.useExternalLibrarySource, false);
    assert.equal(context.data.books[0].id, "local-repeat");
    assert.equal(
      context.data.books[0].description,
      "延迟返回的本地简介也要写入本地缓存，不能因为当前在外部书库就丢掉。"
    );
    assert.equal(
      storage.get("xf_native_books_first_page_v3").records[0].description,
      "延迟返回的本地简介也要写入本地缓存，不能因为当前在外部书库就丢掉。"
    );
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("reading tab preloads the live library first page and switches from cache immediately", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const requests = [];
  const storage = new Map();
  let pendingExternalSuccess;
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [{ id: "local-visible", title: "本地首屏" }],
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    scrollBelowSearchPanel() {}
  };

  try {
    global.wx.request = (options) => {
      requests.push(options.url);
      if (String(options.url).includes("/api/books/external")) {
        pendingExternalSuccess = options.success;
      }
    };
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };

    const preloadPromise = definition.prefetchExternalLibraryFirstPage.call(context);
    assert.match(requests.at(-1), /\/api\/books\/external/);
    pendingExternalSuccess({
      statusCode: 200,
      data: {
        records: [
          { id: "external-preloaded", title: "预加载书", author: "作者", tags: "预加载", levelRange: "花生 2 级" }
        ],
        total: 2777,
        pages: 2
      }
    });
    await preloadPromise;
    assert.equal(storage.get("xf_external_book_library:first_page_v1").records[0].id, "external-preloaded");

    global.wx.request = (options) => {
      requests.push(options.url);
      if (String(options.url).includes("/api/books/external") && String(options.url).match(/[?&]size=24/)) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              { id: "external-preloaded", title: "预加载书", author: "作者", tags: "预加载", levelRange: "花生 2 级" }
            ],
            total: 2777,
            pages: 2
          }
        });
        return;
      }
      if (String(options.url).includes("/api/books/external") && String(options.url).includes("includeFilters=1")) {
        options.success({ statusCode: 200, data: { records: [], total: 2777, pages: 2, filterGroups: [] } });
      }
    };

    const result = await Promise.race([
      definition.toggleReadingLibrarySource.call(context).then(() => "resolved"),
      new Promise((resolve) => setTimeout(() => resolve("pending"), 10))
    ]);

    assert.equal(result, "resolved");
    assert.equal(context.data.useExternalLibrarySource, true);
    assert.equal(context.data.loading, false);
    assert.equal(context.data.books[0].id, "external-preloaded");
    assert.equal(context.data.readingFilterPreviewCount, 2777);

    const externalRequests = requests.filter((url) => String(url).includes("/api/books/external"));
    assert.equal(externalRequests.filter((url) => String(url).match(/[?&]size=24/)).length, 2);
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("reading tab ignores stale preferred live library source before rendering first-screen cache", () => {
  const definition = loadPageDefinition("reading");
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map([
    ["xf_native_books_source_v1", "external"],
    [
      "xf_native_books_first_page_v3",
      {
        records: [
          { _id: "cached-local-1", title: "本地缓存书", author: "作者", hasMetadataDetail: true }
        ],
        total: 1,
        pages: 1
      }
    ],
    [
      "xf_external_book_library:first_page_v1",
      {
        records: [
          { id: "cached-external-1", title: "外部缓存书", author: "作者", tags: "Thriller" }
        ],
        total: 187104,
        pages: 7796
      }
    ]
  ]);
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      useExternalLibrarySource: false,
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => storage.set(key, value);

    definition.loadPreferredReadingSource.call(context);
    if (context.data.useExternalLibrarySource) definition.renderExternalLibraryFirstPageFromCache.call(context);
    else definition.renderNativeBooksFirstPageFromCache.call(context);

    assert.equal(context.data.useExternalLibrarySource, false);
    assert.equal(context.data.books[0].id, "cached-local-1");
    assert.equal(context.data.books.some((book) => book.id === "cached-external-1"), false);
    assert.equal(context.data.readingFilterPreviewCount, 1);
  } finally {
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("reading tab keeps native filter counts backed by the full local library after first-page render", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map();
  const requests = [];
  const firstPageRecords = Array.from({ length: 24 }, (_, index) => ({
    _id: `first-page-${index + 1}`,
    title: `首屏书 ${index + 1}`,
    author: "作者",
    grade: index % 2 === 0 ? "小班" : "中班",
    topic: "生活故事",
    hasMetadataDetail: true
  }));
  const fullRecords = Array.from({ length: 60 }, (_, index) => ({
    _id: `full-book-${index + 1}`,
    title: `全量书 ${index + 1}`,
    author: "作者",
    grade: index < 30 ? "小班" : "中班",
    topic: index < 24 ? "生活故事" : "亲子关系",
    hasMetadataDetail: true
  }));
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      useExternalLibrarySource: false,
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => storage.set(key, value);
    global.wx.request = (options) => {
      requests.push(options.url);
      if (String(options.url).includes("/api/books?")) {
        options.success({
          statusCode: 200,
          data: {
            records: firstPageRecords,
            total: fullRecords.length,
            current: 1,
            pages: 3,
            size: 24
          }
        });
        return;
      }
      if (String(options.url).endsWith("/api/books")) {
        options.success({ statusCode: 200, data: fullRecords });
      }
    };

    await definition.loadBooks.call(context);

    assert.equal(context.data.books.length, 24);
    assert.equal(context.data.readingFilterPreviewCount, fullRecords.length);
    await definition.openFilterDrawer.call(context);
    assert.equal(requests.some((url) => String(url).endsWith("/api/books")), true);
    assert.equal(context.data.readingFilterPreviewCount, fullRecords.length);
    assert.equal(context.data.readingFilterGroups.some((group) => (
      group.options.some((option) => option.label === "亲子关系")
    )), true);
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("reading tab keeps the native server total visible while the full filter source is loading", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map();
  let resolveFullLibrary = null;
  const firstPageRecords = Array.from({ length: 24 }, (_, index) => ({
    _id: `first-page-${index + 1}`,
    title: `首屏书 ${index + 1}`,
    author: "作者",
    grade: "小班",
    topic: "生活故事",
    hasMetadataDetail: true
  }));
  const fullRecords = firstPageRecords.concat(Array.from({ length: 36 }, (_, index) => ({
    _id: `full-book-${index + 1}`,
    title: `全量书 ${index + 1}`,
    author: "作者",
    grade: "中班",
    topic: "亲子关系",
    hasMetadataDetail: true
  })));
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      useExternalLibrarySource: false,
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => storage.set(key, value);
    global.wx.request = (options) => {
      if (String(options.url).includes("/api/books?")) {
        options.success({
          statusCode: 200,
          data: {
            records: firstPageRecords,
            total: fullRecords.length,
            current: 1,
            pages: 3,
            size: 24
          }
        });
        return;
      }
      if (String(options.url).endsWith("/api/books")) {
        resolveFullLibrary = () => options.success({ statusCode: 200, data: fullRecords });
      }
    };

    await definition.loadBooks.call(context);
    assert.equal(context.data.readingFilterPreviewCount, fullRecords.length);

    const openPromise = definition.openFilterDrawer.call(context);
    assert.equal(context.data.readingFilterPreviewCount, fullRecords.length);

    context.setData({ draftReadingTags: ["小班"], readingFilterPreviewCount: firstPageRecords.length });
    definition.onDrawerReadingTagTap.call(context, { currentTarget: { dataset: { tag: "小班" } } });
    assert.equal(context.data.readingFilterPreviewCount, fullRecords.length);

    context.setData({ draftReadingTags: ["小班"], readingFilterPreviewCount: firstPageRecords.length });
    definition.resetReadingFilterDraft.call(context);
    assert.equal(context.data.readingFilterPreviewCount, fullRecords.length);

    context.setData({
      activeReadingTag: "#小班",
      activeReadingTags: ["小班"],
      readingFilterPreviewCount: firstPageRecords.length
    });
    definition.clearReadingTagFilter.call(context);
    assert.equal(context.data.readingFilterPreviewCount, fullRecords.length);
    assert.equal(context.data.hasMoreBooks, true);

    resolveFullLibrary();
    await openPromise;
    assert.equal(context.data.readingFilterPreviewCount, fullRecords.length);
    assert.equal(context.data.readingFilterGroups.some((group) => (
      group.options.some((option) => option.label === "亲子关系")
    )), true);
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("reading tab keeps the native first-page cache total visible when opening filters", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const originalSetStorageSync = global.wx.setStorageSync;
  const storage = new Map();
  let resolveFullLibrary = null;
  const firstPageRecords = Array.from({ length: 24 }, (_, index) => ({
    _id: `cached-page-${index + 1}`,
    title: `缓存书 ${index + 1}`,
    author: "作者",
    grade: "小班",
    topic: "生活故事",
    hasMetadataDetail: true
  }));
  const fullRecords = firstPageRecords.concat(Array.from({ length: 36 }, (_, index) => ({
    _id: `cached-full-${index + 1}`,
    title: `缓存全量书 ${index + 1}`,
    author: "作者",
    grade: "中班",
    topic: "亲子关系",
    hasMetadataDetail: true
  })));
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      useExternalLibrarySource: false,
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    storage.set("xf_native_books_first_page_v3", {
      records: firstPageRecords,
      total: fullRecords.length,
      current: 1,
      pages: 3,
      size: 24
    });
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.setStorageSync = (key, value) => storage.set(key, value);
    global.wx.request = (options) => {
      if (String(options.url).endsWith("/api/books")) {
        resolveFullLibrary = () => options.success({ statusCode: 200, data: fullRecords });
      }
    };

    assert.equal(definition.renderNativeBooksFirstPageFromCache.call(context), true);
    assert.equal(context.data.readingFilterPreviewCount, fullRecords.length);

    const openPromise = definition.openFilterDrawer.call(context);
    assert.equal(context.data.readingFilterPreviewCount, fullRecords.length);

    resolveFullLibrary();
    await openPromise;
    assert.equal(context.data.readingFilterPreviewCount, fullRecords.length);
    assert.equal(context.data.readingFilterGroups.some((group) => (
      group.options.some((option) => option.label === "亲子关系")
    )), true);
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("reading tab keeps visible books while switching to cached live library results", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const originalGetStorageSync = global.wx.getStorageSync;
  const updates = [];
  const storage = new Map([
    [
      "xf_external_book_library:first_page_v1",
      {
        records: [
          { id: "cached-external-1", title: "缓存外部书", author: "作者", tags: "Thriller" }
        ],
        total: 187104,
        pages: 7796
      }
    ]
  ]);
  const context = {
    ...definition,
    allBooks: [{ id: "local-visible", title: "本地首屏" }],
    data: {
      ...definition.data,
      books: [{ id: "local-visible", title: "本地首屏" }],
      useExternalLibrarySource: false,
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      updates.push(payload);
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.getStorageSync = (key) => storage.get(key) || "";
    global.wx.request = (options) => {
      if (String(options.url).includes("includeFilters=1")) {
        options.success({ statusCode: 200, data: { records: [], total: 187104, pages: 7796, filterGroups: [] } });
        return;
      }
      if (String(options.url).includes("/api/books/external")) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              { id: "cached-external-1", title: "缓存外部书", author: "作者", tags: "Thriller" }
            ],
            total: 187104,
            pages: 7796
          }
        });
      }
    };

    await definition.toggleReadingLibrarySource.call(context);

    assert.equal(updates.some((payload) => Array.isArray(payload.books) && payload.books.length === 0), false);
    assert.equal(context.data.useExternalLibrarySource, true);
    assert.equal(context.data.books[0].id, "cached-external-1");
    assert.equal(context.data.loading, false);
    assert.equal(context.data.readingFilterGroups.some((group) => group.options.some((option) => option.label === "Thriller")), true);
    await definition.openFilterDrawer.call(context);
    assert.equal(context.data.readingFilterGroups.some((group) => group.options.some((option) => option.label === "Thriller")), true);
  } finally {
    global.wx.request = originalRequest;
    global.wx.getStorageSync = originalGetStorageSync;
  }
});

test("reading tab stores local book detail payload before opening native detail", () => {
  const definition = loadPageDefinition("reading");
  const originalNavigateTo = global.wx.navigateTo;
  const originalSetStorageSync = global.wx.setStorageSync;
  const navigateCalls = [];
  const storage = new Map();
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [
        {
          id: "local-detail-1",
          title: "本地详情书",
          author: "本地作者",
          publisher: "本地出版社",
          coverImage: "https://example.com/local.jpg",
          description: "本地卡片先展示的简介",
          sourceName: "及阅书单",
          recommenderTag: "推荐：老师",
          gradeTag: "小学",
          sourceTags: ["及阅书单"],
          topicTags: ["写作"],
          detailEnabled: true,
          path: "/reading/local-detail-1"
        }
      ],
      useExternalLibrarySource: false
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.navigateTo = (options) => {
      navigateCalls.push(options);
    };
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };

    definition.openBook.call(context, { currentTarget: { dataset: { index: 0 } } });

    assert.equal(navigateCalls.length, 1);
    const webviewUrl = decodeWebviewNavigation(navigateCalls[0]);
    assert.equal(webviewUrl.pathname, "/reading/local-detail-1");
    const storedDetail = storage.get("xf_native_book_detail:local-detail-1");
    assert.equal(storedDetail.title, "本地详情书");
    assert.equal(storedDetail.description, "本地卡片先展示的简介");
    assert.equal(storedDetail.hasMetadataDetail, true);
  } finally {
    global.wx.navigateTo = originalNavigateTo;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("reading tab opens purchase-linked books from the entire card", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const originalNavigateToMiniProgram = global.wx.navigateToMiniProgram;
  const originalShowToast = global.wx.showToast;
  const navigations = [];
  const toasts = [];
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      activeReadingTag: "",
      activeReadingTags: [],
      useExternalLibrarySource: false
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.request = (options) => {
      options.success({
        statusCode: 200,
        data: {
          records: [
            {
              _id: "book-baihua",
              title: "百花思维训练",
              coverImage: "http://xianfeng.xinzhi.info/uploads/images/baihua.jpg",
              wxPurchaseLink: "#小程序://快团团/点击查看/O4W6Aau9gEsXclv",
              hasMetadataDetail: false
            }
          ],
          current: 1,
          pages: 1,
          total: 1
        }
      });
    };
    global.wx.navigateToMiniProgram = (options) => {
      navigations.push(options);
    };
    global.wx.showToast = (options) => {
      toasts.push(options);
    };

    await definition.loadBooks.call(context);

    assert.equal(context.data.books[0].coverImage, "https://xianfeng.xinzhi.info/uploads/images/baihua.jpg");
    assert.equal(context.data.books[0].miniProgramShortLink, "#小程序://快团团/点击查看/O4W6Aau9gEsXclv");
    definition.openBook.call(context, { currentTarget: { dataset: { index: 0 } } });

    assert.equal(navigations.length, 1);
    assert.equal(navigations[0].shortLink, "#小程序://快团团/点击查看/O4W6Aau9gEsXclv");
    assert.equal(toasts.length, 0);
  } finally {
    global.wx.request = originalRequest;
    global.wx.navigateToMiniProgram = originalNavigateToMiniProgram;
    global.wx.showToast = originalShowToast;
  }
});

test("reading purchase cards keep card navigation while topic tags filter in place", () => {
  const reading = readPage("reading");
  const purchaseIconSvg = fs.readFileSync(new URL("../assets/icons/shopping-cart-share.svg", import.meta.url), "utf8");

  assert.match(reading.js, /openBook\(event\) \{[\s\S]*if \(openMiniProgramShortLink\(book\.miniProgramShortLink\)\) return;[\s\S]*if \(!book\.detailEnabled\)/);
  assert.match(reading.wxml, /<view wx:if="\{\{item\.miniProgramShortLink\}\}" class="xf-reading-purchase-button" aria-label="购买">\s*<image class="xf-reading-purchase-icon" src="\/assets\/icons\/shopping-cart-share\.svg" mode="aspectFit" \/>/);
  assert.doesNotMatch(reading.wxml, /class="xf-reading-purchase-icon">🛒/);
  assert.doesNotMatch(reading.wxml, /xf-reading-purchase-badge">去购买<\/text>/);
  assert.doesNotMatch(reading.wxml, /catchtap="buyBook"/);
  assert.match(reading.wxml, /wx:for="\{\{item\.displayTags\}\}"[\s\S]*class="xf-reading-topic-tag \{\{activeReadingTag === tag \? 'is-active' : ''\}\}"[\s\S]*data-tag="\{\{tag\}\}"[\s\S]*catchtap="onReadingTagTap"/);
  assert.doesNotMatch(reading.wxml, /wx:if="\{\{item\.miniProgramShortLink\}\}" class="xf-reading-topic-tag"/);
  assert.match(reading.wxss, /\.xf-reading-purchase-button \{[\s\S]*width: 48rpx;[\s\S]*height: 48rpx;[\s\S]*background: #f3edff;/);
  assert.match(reading.wxss, /\.xf-reading-purchase-icon \{[\s\S]*width: 34rpx;[\s\S]*height: 34rpx;/);
  assert.doesNotMatch(reading.wxml, /xf-reading-cart-plus|xf-reading-cart-share-line/);
  assert.match(purchaseIconSvg, /stroke="#6c27d6"/);
  assert.match(purchaseIconSvg, /stroke-width="1"/);
  assert.match(purchaseIconSvg, /<path d="M16 22l5 -5"\/>/);
  assert.match(purchaseIconSvg, /<path d="M21 21\.5v-4\.5h-4\.5"\/>/);
});

test("reading tab passes clicked live library book data into the detail webview", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const originalNavigateTo = global.wx.navigateTo;
  const originalSetStorageSync = global.wx.setStorageSync;
  const navigateCalls = [];
  const storage = new Map();
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.request = (options) => {
      options.success({
        statusCode: 200,
        data: {
          records: [
            {
              id: "external-detail-1",
              title: "外部详情书",
              author: "外部作者",
              publisher: "外部出版社",
              coverPic: "https://example.com/detail.jpg",
              tags: "Children,Fiction",
              levelRange: "花生 5 级",
              description: "外部详情简介"
            }
          ],
          pages: 1
        }
      });
    };
    global.wx.navigateTo = (options) => {
      navigateCalls.push(options);
    };
    global.wx.setStorageSync = (key, value) => {
      storage.set(key, value);
    };

    await definition.toggleReadingLibrarySource.call(context);
    definition.openBook.call(context, { currentTarget: { dataset: { index: 0 } } });

    assert.equal(navigateCalls.length, 1);
    const webviewUrl = decodeWebviewNavigation(navigateCalls[0]);
    assert.equal(webviewUrl.pathname, "/library/external-detail-1");
    assert.equal(webviewUrl.searchParams.get("xf_external_book_id"), "external-detail-1");
    const payload = JSON.parse(webviewUrl.searchParams.get("xf_external_book"));
    assert.equal(payload.id, "external-detail-1");
    assert.equal(payload.title, "外部详情书");
    assert.equal(payload.coverPic, "https://example.com/detail.jpg");
    assert.equal(payload.description, undefined);
    assert.equal(payload.publisher, "外部出版社");
    assert.equal(payload.levelRange, "花生 5 级");
    const storedDetail = storage.get("xf_external_book_detail:external-detail-1");
    assert.equal(storedDetail.id, "external-detail-1");
    assert.equal(storedDetail.description, "外部详情简介");
    assert.equal(storedDetail.publisher, "外部出版社");
    assert.match(readPage("reading").js, /function normalizeExternalLibraryNavigationPayload\(record\)/);
  } finally {
    global.wx.request = originalRequest;
    global.wx.navigateTo = originalNavigateTo;
    global.wx.setStorageSync = originalSetStorageSync;
  }
});

test("reading tab shows the live library first page without loading remaining pages", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const requests = [];
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx.request = (options) => {
      requests.push(options.url);
      const current = Number(String(options.url).match(/[?&]current=(\d+)/)?.[1] || 1);
      const includeFilters = String(options.url).includes("includeFilters=1");
      if (String(options.url).includes("/api/books/external") && current === 1 && includeFilters) {
        return;
      }
      if (String(options.url).includes("/api/books/external") && current === 1) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              {
                id: "external-first",
                title: "首屏外部书库",
                author: "外部作者",
                tags: "首屏",
                levelRange: "花生 3 级"
              }
            ],
            total: 2777,
            pages: 2
          }
        });
      }
    };

    const result = await Promise.race([
      definition.toggleReadingLibrarySource.call(context).then(() => "resolved"),
      new Promise((resolve) => setTimeout(() => resolve("pending"), 10))
    ]);

    assert.equal(result, "resolved");
    const externalRequests = requests.filter((url) => String(url).includes("/api/books/external"));
    assert.deepEqual(
      externalRequests.map((url) => String(url).match(/[?&]current=(\d+)/)?.[1]),
      ["1", "1"]
    );
    assert.deepEqual(
      externalRequests.map((url) => String(url).match(/[?&]size=(\d+)/)?.[1]),
      ["24", "1"]
    );
    assert.deepEqual(
      externalRequests.map((url) => String(url).includes("includeFilters=1")),
      [false, true]
    );
    assert.equal(context.data.useExternalLibrarySource, true);
    assert.equal(context.data.books[0].id, "external-first");
    assert.equal(context.data.readingFilterGroups.some((group) => group.options.some((option) => option.label === "首屏")), true);
    assert.equal(context.data.loading, false);
  } finally {
    global.wx.request = originalRequest;
  }
});

test("reading tab opens live library filters without loading remaining pages", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const requests = [];
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    scrollBelowSearchPanel() {}
  };

  try {
    global.wx.request = (options) => {
      requests.push(options.url);
      const current = Number(String(options.url).match(/[?&]current=(\d+)/)?.[1] || 1);
      const includeFilters = String(options.url).includes("includeFilters=1");
      if (String(options.url).includes("/api/books/external") && current === 1) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              { id: "external-1", title: "第一页书", author: "作者", tags: "第一页", levelRange: "花生 1 级" }
            ],
            total: current === 1 && String(options.url).includes("tags=") ? 42 : 2777,
            pages: 2,
            filterGroups: includeFilters
              ? [
                  {
                    key: "topic",
                    title: "主题",
                    options: [
                      { label: "第一页", value: "#第一页", count: 120 },
                      { label: "低频主题", value: "#低频主题", count: 100 },
                      { label: "第二页全局主题", value: "#第二页全局主题", count: 240 }
                    ]
                  }
                ]
              : undefined
          }
        });
        return;
      }
      if (String(options.url).includes("/api/books/external") && current === 2) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              { id: "external-2", title: "第二页命中书", author: "作者", tags: "第一页", levelRange: "花生 2 级" }
            ],
            total: 42,
            pages: 2
          }
        });
      }
    };

    await definition.toggleReadingLibrarySource.call(context);
    await definition.openFilterDrawer.call(context);
    assert.equal(context.data.filterDrawerOpen, true);
    assert.equal(context.data.readingFilterPreviewCount, 2777);
    assert.equal(context.data.readingFilterGroups.some((group) => group.options.some((option) => option.label === "第一页")), true);
    assert.equal(context.data.readingFilterGroups.some((group) => group.options.some((option) => option.label === "低频主题")), false);
    assert.equal(context.data.readingFilterGroups.some((group) => group.options.some((option) => option.label === "第二页全局主题")), true);

    await definition.onDrawerReadingTagTap.call(context, { currentTarget: { dataset: { tag: "第一页" } } });
    assert.equal(context.data.readingFilterPreviewCount, 42);
    await definition.onDrawerReadingTagTap.call(context, { currentTarget: { dataset: { tag: "第二页全局主题" } } });
    assert.deepEqual(context.data.draftReadingTags, ["第一页", "第二页全局主题"]);
    assert.equal(context.data.readingFilterPreviewCount, 84);

    await definition.applyReadingFilterDraft.call(context);
    assert.equal(context.data.books[0].id, "external-1");
    await definition.loadMoreBooks.call(context);
    assert.deepEqual(context.data.books.map((book) => book.id), ["external-1", "external-2"]);

    const externalRequests = requests.filter((url) => String(url).includes("/api/books/external"));
    assert.equal(externalRequests.some((url) => String(url).includes("tags=%E7%AC%AC%E4%B8%80%E9%A1%B5")), true);
    assert.equal(externalRequests.some((url) => String(url).includes("tags=%E7%AC%AC%E4%BA%8C%E9%A1%B5%E5%85%A8%E5%B1%80%E4%B8%BB%E9%A2%98")), true);
    assert.equal(externalRequests.some((url) => String(url).includes("tagMode=any")), false);
    assert.equal(
      externalRequests.filter((url) => String(url).match(/[?&]current=2(?:&|$)/)).length,
      2
    );
    assert.equal(context.data.filterDrawerOpen, false);
    assert.equal(context.data.readingFilterPreviewCount, 84);
    assert.equal(context.data.readingFilterGroups.some((group) => group.options.some((option) => option.label === "第二页全局主题")), true);
  } finally {
    global.wx.request = originalRequest;
  }
});

test("reading tab merges live library tag selections instead of intersecting them", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const requests = [];
  const filterGroups = [
    {
      key: "topic",
      title: "主题",
      options: [
        { label: "Abuse", value: "#Abuse", count: 572 },
        { label: "Aapi", value: "#Aapi", count: 240 }
      ]
    }
  ];
  const context = {
    ...definition,
    _externalLibraryFilterGroups: filterGroups,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      useExternalLibrarySource: true,
      activeReadingTag: "",
      activeReadingTags: [],
      draftReadingTags: [],
      readingFilterGroups: filterGroups,
      readingFilterPreviewCount: 0
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    scrollBelowSearchPanel() {}
  };

  try {
    global.wx.request = (options) => {
      requests.push(options.url);
      const url = new URL(options.url);
      const tags = url.searchParams.getAll("tags");
      const current = Number(url.searchParams.get("current") || 1);
      const includeFilters = url.searchParams.get("includeFilters") === "1";
      const records = tags.includes("Abuse")
        ? [{ id: `abuse-${current}`, title: "Abuse book", author: "作者", tags: "Abuse" }]
        : tags.includes("Aapi")
          ? [{ id: `aapi-${current}`, title: "Aapi book", author: "作者", tags: "Aapi" }]
          : [];
      const total = tags.includes("Abuse")
        ? 572
        : tags.includes("Aapi")
          ? 240
          : tags.length > 1
            ? 0
            : 187104;
      options.success({
        statusCode: 200,
        data: {
          records,
          total,
          current,
          pages: 2,
          filterGroups: includeFilters ? filterGroups : undefined
        }
      });
    };

    await definition.onDrawerReadingTagTap.call(context, { currentTarget: { dataset: { tag: "Abuse" } } });
    assert.equal(context.data.readingFilterPreviewCount, 572);

    await definition.onDrawerReadingTagTap.call(context, { currentTarget: { dataset: { tag: "Aapi" } } });
    assert.deepEqual(context.data.draftReadingTags, ["Abuse", "Aapi"]);
    assert.equal(context.data.readingFilterPreviewCount, 812);

    await definition.applyReadingFilterDraft.call(context);
    assert.deepEqual(context.data.activeReadingTags, ["Abuse", "Aapi"]);
    assert.deepEqual(context.data.books.map((book) => book.id), ["abuse-1", "aapi-1"]);
    assert.equal(context.data.readingFilterPreviewCount, 812);
    assert.equal(requests.some((url) => String(url).includes("tagMode=any")), false);
  } finally {
    global.wx.request = originalRequest;
  }
});

test("reading tab keeps the live library preview count while tag preview refreshes", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const pendingRequests = [];
  const filterGroups = [
    {
      key: "topic",
      title: "主题",
      options: [
        { label: "Abuse", value: "#Abuse", count: 572 },
        { label: "Aapi", value: "#Aapi", count: 240 }
      ]
    }
  ];
  const context = {
    ...definition,
    _externalLibraryFilterGroups: filterGroups,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      useExternalLibrarySource: true,
      activeReadingTag: "",
      activeReadingTags: [],
      draftReadingTags: ["Abuse"],
      readingFilterGroups: filterGroups,
      readingFilterPreviewCount: 572
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    scrollBelowSearchPanel() {}
  };

  try {
    global.wx.request = (options) => {
      pendingRequests.push(options);
    };

    const previewPromise = definition.onDrawerReadingTagTap.call(context, { currentTarget: { dataset: { tag: "Aapi" } } });
    assert.deepEqual(context.data.draftReadingTags, ["Abuse", "Aapi"]);
    assert.equal(context.data.readingFilterPreviewCount, 572);

    for (const options of pendingRequests) {
      const url = new URL(options.url);
      const tags = url.searchParams.getAll("tags");
      options.success({
        statusCode: 200,
        data: {
          records: [],
          total: tags.includes("Abuse") ? 572 : 240,
          current: 1,
          pages: 1,
          filterGroups
        }
      });
    }
    await previewPromise;
    assert.equal(context.data.readingFilterPreviewCount, 812);
  } finally {
    global.wx.request = originalRequest;
  }
});

test("reading tab only shows counted live library filter options over one hundred books", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    scrollBelowSearchPanel() {}
  };

  try {
    global.wx.request = (options) => {
      if (String(options.url).includes("/api/books/external")) {
        options.success({
          statusCode: 200,
          data: {
            records: [
              { id: "external-legacy", title: "旧接口书", author: "作者", tags: "漫画,Thriller", levelRange: "Middle Grade" }
            ],
            total: 187104,
            pages: 2,
            filterGroups: String(options.url).includes("includeFilters=1")
              ? [
                  {
                    key: "topic",
                    title: "主题",
                    options: [
                      { label: "漫画", value: "#漫画", count: 180 },
                      { label: "Thriller", value: "#Thriller", count: 320 },
                      { label: "Mystery", value: "#Mystery", count: 100 },
                      { label: "Aapi", value: "#Aapi" }
                    ]
                  }
                ]
              : undefined
          }
        });
      }
    };

    await definition.toggleReadingLibrarySource.call(context);
    await definition.openFilterDrawer.call(context);

    assert.deepEqual(context.data.books[0].displayTags.slice(1), ["#Manga", "#Thriller"]);
    const groupsByTitle = new Map(context.data.readingFilterGroups.map((group) => [group.title, group.options.map((option) => option.label)]));
    assert.deepEqual(groupsByTitle.get("主题"), ["Thriller", "Manga"]);
    assert.equal(context.data.readingFilterPreviewCount, 187104);
  } finally {
    global.wx.request = originalRequest;
  }
});

test("reading tab opens live library drawer immediately while filter groups refresh", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const requests = [];
  let resolveFilters;
  const filterPromise = new Promise((resolve) => {
    resolveFilters = resolve;
  });
  const context = {
    ...definition,
    allBooks: [],
    data: {
      ...definition.data,
      books: [],
      useExternalLibrarySource: true,
      readingFilterGroups: [
        {
          title: "年级",
          options: [{ label: "一年级", value: "#一年级", selected: false }]
        },
        {
          title: "年龄",
          options: [{ label: "5-6岁", value: "#5-6岁", selected: false }]
        }
      ],
      activeReadingTag: "",
      activeReadingTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    scrollBelowSearchPanel() {}
  };

  try {
    global.wx.request = (options) => {
      requests.push(options.url);
      if (String(options.url).includes("/api/books/external")) {
        filterPromise.then(() => {
          options.success({
            statusCode: 200,
            data: {
              records: [
                { id: "external-filter-1", title: "外部筛选书", author: "作者", tags: "Thriller", levelRange: "Middle Grade" }
              ],
              total: 2777,
              pages: 2,
              filterGroups: [
                {
                  key: "topic",
                  title: "主题",
                  options: [
                    { label: "Thriller", value: "#Thriller", count: 180 },
                    { label: "Mystery", value: "#Mystery", count: 100 }
                  ]
                },
                {
                  key: "level",
                  title: "难度",
                  options: [{ label: "Middle Grade", value: "#Middle Grade", count: 240 }]
                }
              ]
            }
          });
        });
      }
    };

    const openPromise = definition.openFilterDrawer.call(context);

    assert.equal(context.data.filterDrawerOpen, true);
    assert.deepEqual(context.data.readingFilterGroups, []);

    resolveFilters();
    await openPromise;

    assert.equal(context.data.filterDrawerOpen, true);
    const groupsByTitle = new Map(context.data.readingFilterGroups.map((group) => [group.title, group.options.map((option) => option.label)]));
    assert.equal(groupsByTitle.has("年级"), false);
    assert.equal(groupsByTitle.has("年龄"), false);
    assert.deepEqual(groupsByTitle.get("主题"), ["Thriller"]);
    assert.deepEqual(groupsByTitle.get("难度"), ["Middle Grade"]);
    assert.equal(context.data.readingFilterPreviewCount, 2777);
    assert.equal(requests.filter((url) => String(url).includes("includeFilters=1")).length, 1);
  } finally {
    global.wx.request = originalRequest;
  }
});

test("reading tab keeps local filter groups out of the live library drawer", async () => {
  const definition = loadPageDefinition("reading");
  const originalRequest = global.wx.request;
  const localFilterGroups = [
    {
      key: "grade",
      title: "年级",
      options: [{ label: "小班", value: "#小班", selected: false, count: 420 }]
    },
    {
      key: "age",
      title: "年龄",
      options: [{ label: "0-1岁", value: "#0-1岁", selected: false, count: 300 }]
    },
    {
      key: "topic",
      title: "主题",
      options: [{ label: "小学写作", value: "#小学写作", selected: false, count: 240 }]
    }
  ];
  const context = {
    ...definition,
    _externalLibraryFilterGroups: localFilterGroups,
    allBooks: [],
    data: {
      ...definition.data,
      books: [{ id: "external-visible", title: "Phantom Limb" }],
      useExternalLibrarySource: true,
      readingFilterGroups: localFilterGroups,
      activeReadingTag: "",
      activeReadingTags: [],
      readingFilterPreviewCount: 2777
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    scrollBelowSearchPanel() {}
  };

  try {
    global.wx.request = (options) => {
      if (String(options.url).includes("/api/books/external")) {
        options.success({
          statusCode: 200,
          data: {
            records: [],
            total: 2777,
            pages: 2,
            filterGroups: [
              {
                key: "topic",
                title: "主题",
                options: [{ label: "Thriller", value: "#Thriller", count: 180 }]
              },
              {
                key: "level",
                title: "难度",
                options: [{ label: "Middle Grade", value: "#Middle Grade", count: 240 }]
              }
            ]
          }
        });
      }
    };

    const openPromise = definition.openFilterDrawer.call(context);
    assert.equal(context.data.filterDrawerOpen, true);
    assert.deepEqual(context.data.readingFilterGroups, []);

    await openPromise;
    const groupsByTitle = new Map(context.data.readingFilterGroups.map((group) => [group.title, group.options.map((option) => option.label)]));
    assert.equal(groupsByTitle.has("年级"), false);
    assert.equal(groupsByTitle.has("年龄"), false);
    assert.deepEqual(groupsByTitle.get("主题"), ["Thriller"]);
    assert.deepEqual(groupsByTitle.get("难度"), ["Middle Grade"]);
  } finally {
    global.wx.request = originalRequest;
  }
});

test("topics tab shows native parsing progress and hides completed progress", async () => {
  const definition = loadPageDefinition("topics");
  const originalWx = global.wx;
  const storage = new Map();
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      request(options) {
        options.success({
          statusCode: 200,
          data: {
            topics: [
              {
                slug: "writing-posture",
                title: "练字体态不佳如何纠正",
                coverEmoji: "✍️",
                tags: ["阅读", "写作"],
                generatingProgress: { status: "generating", done: 3, total: 5 },
                shortSummary: "正在生成知识树"
              },
              {
                slug: "raz-quiz",
                title: "RAZ Quiz怎么算过?",
                tags: ["阅读"],
                generatingProgress: { status: "done", done: 5, total: 5 },
                shortSummary: "已完成的话题"
              }
            ]
          }
        });
      }
    };

    await definition.loadTopics.call(context);

    assert.equal(context.data.topics[0].progressVisible, true);
    assert.equal(context.data.topics[0].canOpen, false);
    assert.equal(context.data.topics[0].emoji, "✍️");
    assert.equal(context.data.topics[0].progressPercent, 60);
    assert.equal(context.data.topics[0].progressLabel, "AI 解析中");
    assert.equal(context.data.topics[1].progressVisible, false);
    assert.equal(context.data.topics[1].canOpen, true);
    assert.equal(context.data.topics[1].emoji, "");
    assert.equal(context.data.topics[1].progressLabel, "");

    await definition.onTopicTagTap.call(context, { currentTarget: { dataset: { tag: "写作" } } });
    assert.equal(context.data.activeTopicTag, "写作");
    assert.deepEqual(context.data.activeTopicTags, ["写作"]);
    assert.equal(context.data.activeTopicTagLabel, "写作");
    assert.equal(context.data.topics.length, 1);
    assert.equal(context.data.topics[0].slug, "writing-posture");

    definition.clearTopicTagFilter.call(context);
    assert.equal(context.data.activeTopicTag, "");
    assert.deepEqual(context.data.activeTopicTags, []);
    assert.equal(context.data.activeTopicTagLabel, "");
    assert.equal(context.data.topics.length, 2);
  } finally {
    global.wx = originalWx;
  }
});

test("topics tab keeps the newest submitted topic first after refresh", async () => {
  const definition = loadPageDefinition("topics");
  const originalWx = global.wx;
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync() {
        return "";
      },
      setStorageSync() {},
      request(options) {
        options.success({
          statusCode: 200,
          data: {
            topics: [
              {
                slug: "new-pending-topic",
                title: "刚提交的解析话题",
                createdAt: "2026-07-02T23:10:00.000Z",
                gradeMatch: false,
                generatingProgress: { status: "pending", done: 0, total: 15 },
                shortSummary: "正在生成知识树"
              },
              {
                slug: "older-grade-match-topic",
                title: "旧的年级匹配话题",
                createdAt: "2026-07-01T10:00:00.000Z",
                gradeMatch: true,
                generatingProgress: { status: "done", done: 15, total: 15 },
                shortSummary: "已完成的话题"
              }
            ]
          }
        });
      }
    };

    await definition.loadTopics.call(context);

    assert.equal(context.data.topics[0].slug, "new-pending-topic");
    assert.equal(context.data.topics[0].createdAt, "2026-07-02T23:10:00.000Z");
    assert.equal(context.data.topics[0].progressVisible, true);
    assert.equal(context.data.topics[1].slug, "older-grade-match-topic");
  } finally {
    global.wx = originalWx;
  }
});

test("topics tab filters visible topics as the ask input changes", () => {
  const definition = loadPageDefinition("topics");
  const requests = [];
  const allTopics = [
    {
      id: "hydro-topic",
      slug: "hydro-topic",
      title: "水电站参观怎么做项目学习",
      subtitle: "能源工程启蒙",
      summary: "围绕水电站理解发电、河流和工程协作",
      tags: ["科学启蒙"],
      displayTags: ["科学启蒙"]
    },
    {
      id: "reading-topic",
      slug: "reading-topic",
      title: "早期阅读怎么坚持",
      subtitle: "亲子阅读",
      summary: "围绕绘本和阅读节奏建立习惯",
      tags: ["早期阅读"],
      displayTags: ["早期阅读"]
    },
    {
      id: "game-topic",
      slug: "game-topic",
      title: "孩子玩游戏怎么约定规则",
      subtitle: "游戏引导",
      summary: "围绕游戏时间和亲子沟通建立边界",
      tags: ["游戏引导"],
      displayTags: ["游戏引导"]
    }
  ];
  const context = {
    ...definition,
    data: {
      ...definition.data,
      allTopics,
      topics: allTopics,
      activeTopicTags: [],
      activeTopicTag: ""
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  const originalWx = global.wx;

  try {
    global.wx = {
      ...originalWx,
      request(options) {
        requests.push(options);
      }
    };

    definition.onAskInput.call(context, { detail: { value: "水电站" } });

    assert.equal(context.data.askInput, "水电站");
    assert.deepEqual(context.data.topics.map((topic) => topic.slug), ["hydro-topic"]);
    assert.equal(context.data.error, "");
    assert.equal(requests.length, 0, "typing in the ask input should filter locally without submitting");

    definition.onAskInput.call(context, { detail: { value: "" } });

    assert.deepEqual(context.data.topics.map((topic) => topic.slug), ["hydro-topic", "reading-topic", "game-topic"]);
  } finally {
    global.wx = originalWx;
  }
});

test("topics tab blocks unfinished topics from opening a generated detail page", () => {
  const definition = loadPageDefinition("topics");
  const originalWx = global.wx;
  const navigations = [];
  const toasts = [];
  const context = {
    data: {
      topics: [
        { slug: "pending-topic", title: "正在解析的话题", path: "/topics/pending-topic", canOpen: false },
        { slug: "done-topic", title: "已完成的话题", path: "/topics/done-topic", canOpen: true }
      ]
    }
  };

	try {
	  global.wx = {
	    getStorageSync(key) {
	      if (key === "xf_user") return JSON.stringify({ _id: "user-1" });
	      return "";
	    },
      navigateTo(options) {
        navigations.push(options);
      },
      showToast(options) {
        toasts.push(options);
      }
    };

    definition.openTopic.call(context, { currentTarget: { dataset: { index: 0 } } });
    assert.deepEqual(navigations, []);
    assert.equal(toasts.at(-1).title, "话题解析中，完成后可查看详情");

    definition.openTopic.call(context, { currentTarget: { dataset: { index: 1 } } });
    assert.equal(navigations.length, 1);
    const topicUrl = new URL(navigations[0].url, "https://mini.invalid");
    assert.equal(topicUrl.pathname, "/pages/webview/index");
    assert.equal(topicUrl.searchParams.get("nativeTopic"), "1");
    assert.equal(topicUrl.searchParams.get("topicSlug"), "done-topic");
    assert.equal(topicUrl.searchParams.get("userId"), "user-1");
  } finally {
    global.wx = originalWx;
  }
});

test("topics tab shares the native topic route used by direct navigation", () => {
  const definition = loadPageDefinition("topics");
  const context = {
    ...definition,
    data: {
      ...definition.data,
      topics: [{ id: "topic-record-id", slug: "grade-one-math", title: "一年级数学学习方法选择" }]
    }
  };

  const share = definition.onShareAppMessage.call(context, {
    target: { dataset: { topicId: "topic-record-id" } }
  });
  const target = new URL(share.path, "https://mini.local");

  assert.equal(target.pathname, "/pages/webview/index");
  assert.equal(target.searchParams.get("nativeTopic"), "1");
  assert.equal(target.searchParams.get("topicSlug"), "grade-one-math");
  assert.equal(target.searchParams.get("title"), "一年级数学学习方法选择");
  assert.equal(target.searchParams.has("url"), false);
  assert.equal(target.searchParams.has("topicId"), false);
});

test("topics tab disables zero-node topics before they can open an empty detail", () => {
  const definition = loadPageDefinition("topics");
  const normalizedPending = definition.normalizeTopicForTest({
    slug: "pending-empty",
    title: "还没生成的话题",
    status: "pending",
    nodeCount: 0
  });
  const normalizedPublished = definition.normalizeTopicForTest({
    slug: "published-empty",
    title: "空发布话题",
    status: "published",
    nodeCount: 0
  });

  assert.equal(normalizedPending.canOpen, false);
  assert.equal(normalizedPending.progressVisible, true);
  assert.equal(normalizedPending.progressLabel, "等待解析");
  assert.equal(normalizedPublished.canOpen, false);
});

test("topics tab prefetches visible topic details and first nodes for instant native open", async () => {
  const definition = loadPageDefinition("topics");
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;
  const storage = new Map([
    ["xf_user", { _id: "user-1" }]
  ]);
  const requestUrls = [];
  const timers = [];
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      request(options) {
        requestUrls.push(options.url);
        if (options.url.includes("/api/topic-hub?")) {
          options.success({
            statusCode: 200,
            data: {
              topics: [
                { slug: "topic-1", title: "阅读积累", generatingProgress: { status: "done", done: 1, total: 1 } },
                { slug: "pending-topic", title: "解析中", generatingProgress: { status: "pending", done: 0, total: 2 } }
              ]
            }
          });
          return;
        }
        if (options.url.includes("/api/topic-hub/topic-1/nodes/node-1?userId=user-1")) {
          options.success({
            statusCode: 200,
            data: { node: { nodeKey: "node-1", title: "断层本质", content: "预热的节点正文" } }
          });
          return;
        }
        if (options.url.includes("/api/topic-hub/topic-1?userId=user-1")) {
          options.success({
            statusCode: 200,
            data: {
              topic: { slug: "topic-1", title: "阅读积累" },
              tree: [{ title: "认知篇", children: [{ nodeKey: "node-1", title: "断层本质" }] }]
            }
          });
          return;
        }
        options.fail({ errMsg: `unexpected request: ${options.url}` });
      }
    };
    global.setTimeout = (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    };

    await definition.loadTopics.call(context);
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(requestUrls.some((url) => url.includes("/api/topic-hub/topic-1?userId=user-1")), false);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delay, 300);
    timers[0].callback();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(requestUrls.some((url) => url.includes("/api/topic-hub/topic-1?userId=user-1")), true);
    assert.equal(requestUrls.some((url) => url.includes("/api/topic-hub/topic-1/nodes/node-1?userId=user-1")), true);
    assert.equal(requestUrls.some((url) => url.includes("/api/topic-hub/pending-topic")), false);
    const detailCache = storage.get("xf_native_topic_detail_cache:topic-1:user-1");
    assert.equal(detailCache.detailResponse.topic.title, "阅读积累");
    assert.equal(detailCache.firstNodeResponse.node.content, "预热的节点正文");
  } finally {
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
  }
});

test("topics tab derives guide tags and opens the full tag drawer from expand all", async () => {
  const definition = loadPageDefinition("topics");
  const originalWx = global.wx;
  const tags = [
    "儿童心理",
    "教育理念",
    "游戏引导",
    "游戏选择",
    "幼儿园选择",
    "幼小衔接",
    "早期阅读",
    "亲子互动",
    "兴趣引导",
    "隔代教育",
    "情绪管理",
    "家庭矛盾",
    "鸡娃",
    "早期启蒙",
    "历史启蒙",
    "古文铺垫",
    "书籍推荐",
    "分离焦虑",
    "入园适应",
    "托班",
    "生长发育",
    "阅读",
    "写作",
    "表达能力"
  ];
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  const requestUrls = [];
  const storage = new Map();

  try {
    global.wx = {
      getStorageSync(key) {
        if (storage.has(key)) return storage.get(key);
        if (key === "xf_user") return { _id: "user-1", childGrade: "小学一年级" };
        return "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      request(options) {
        requestUrls.push(options.url);
        options.success({
          statusCode: 200,
          data: {
            topics: tags.map((tag, index) => ({
              slug: `topic-${index}`,
              title: `${tag}话题`,
              tags: [tag],
              generatingProgress: { status: "done", done: 1, total: 1 }
            }))
          }
        });
      }
    };

    await definition.loadTopics.call(context);

    const topicListUrl = new URL(requestUrls[0], "https://xianfeng.xinzhi.info");
    assert.equal(topicListUrl.pathname, "/api/topic-hub");
    assert.equal(topicListUrl.searchParams.get("page"), "1");
    assert.equal(topicListUrl.searchParams.get("limit"), "10");
    assert.equal(topicListUrl.searchParams.get("userId"), "user-1");
    assert.equal(topicListUrl.searchParams.get("grade"), "小学一年级");
    assert.equal(storage.get("xf_native_topics_cache").version, 3);
    assert.equal(Number.isFinite(storage.get("xf_native_topics_cache").cachedAt), true);
    assert.equal(storage.get("xf_native_topics_cache").userId, "user-1");
    assert.equal(storage.get("xf_native_topics_cache").grade, "小学一年级");
    assert.equal(context.data.allGuideTags.length, tags.length + 1);
    assert.deepEqual(context.data.allGuideTags.slice(0, 4).map((item) => item.label), ["全部", "儿童心理", "教育理念", "游戏引导"]);
    const visibleGuideLabels = context.data.guideTags.map((item) => item.label);
    assert.equal(context.data.guideTags.length, 11);
    assert.deepEqual(visibleGuideLabels.slice(0, 5), ["全部", "儿童心理", "教育理念", "游戏引导", "游戏选择"]);
    assert.equal(visibleGuideLabels.includes("鸡娃"), true);
    assert.equal(visibleGuideLabels.includes("幼儿园选择"), false);
    assert.equal(context.data.guideTags.some((item) => item.label === "游戏引导"), true);
    assert.equal(context.data.guideTags.some((item) => item.label === "托班"), false);
    assert.equal(context.data.hasMoreGuideTags, true);

    definition.toggleGuideTags.call(context);

    assert.equal(context.data.guideTagsExpanded, false);
    assert.equal(context.data.guideTags.length, 11);
    assert.equal(context.data.filterDrawerOpen, true);
    assert.equal(context.data.topicFilterTags.some((item) => item.label === "托班"), true);
  } finally {
    global.wx = originalWx;
  }
});

test("topics cache expires and invalidated detail cards are removed on return", () => {
  const definition = loadPageDefinition("topics");
  const originalWx = global.wx;
  const staleTopic = { id: "stale-topic", slug: "stale-topic", title: "Stale", tags: [] };
  const validTopic = { id: "valid-topic", slug: "valid-topic", title: "Valid", tags: [] };
  const storage = new Map([
    ["xf_user", { _id: "user-1", childGrade: "小学一年级" }],
    ["xf_native_topics_cache", {
      version: 3,
      cachedAt: Date.now() - (6 * 60 * 60 * 1000) - 1,
      userId: "user-1",
      grade: "小学一年级",
      topics: [staleTopic]
    }]
  ]);
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) { this.data = { ...this.data, ...payload }; },
    syncTopbarMetrics() {},
    syncAccountEntry() {}
  };
  try {
    global.wx = {
      getStorageSync(key) { return storage.get(key) || ""; },
      setStorageSync(key, value) { storage.set(key, value); },
      removeStorageSync(key) { storage.delete(key); },
      showShareMenu() {}
    };
    definition.loadCachedTopics.call(context);
    assert.deepEqual(context.data.topics, []);

    context.data.allTopics = [staleTopic, validTopic];
    context.data.topics = [staleTopic, validTopic];
    storage.set("xf_native_topic_invalidated_v1", "stale-topic");
    definition.onShow.call(context);
    assert.deepEqual(context.data.allTopics.map((item) => item.id), ["valid-topic"]);
    assert.deepEqual(context.data.topics.map((item) => item.id), ["valid-topic"]);
    assert.equal(storage.has("xf_native_topic_invalidated_v1"), false);
  } finally {
    global.wx = originalWx;
  }
});

test("topics tab removes cached cards when detail prefetch returns not found", async () => {
  const definition = loadPageDefinition("topics");
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;
  const timers = [];
  const staleTopic = {
    id: "deleted-topic",
    slug: "deleted-topic",
    title: "已删除话题",
    tags: [],
    canOpen: true
  };
  const storage = new Map([
    ["xf_user", { _id: "user-1" }],
    ["xf_native_topics_cache", {
      version: 3,
      cachedAt: Date.now(),
      userId: "user-1",
      grade: "",
      topics: [staleTopic]
    }]
  ]);
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      request(options) {
        if (String(options.url).includes("/api/topic-hub/deleted-topic")) {
          options.success({ statusCode: 404, data: { error: "未找到该话题" } });
          return;
        }
        options.fail({ errMsg: `unexpected request: ${options.url}` });
      }
    };
    global.setTimeout = (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    };

    definition.loadCachedTopics.call(context);
    assert.equal(timers.length, 1);
    timers[0].callback();
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(context.data.topics, []);
    assert.deepEqual(storage.get("xf_native_topics_cache").topics, []);
  } finally {
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
  }
});

test("topics tab loads every page for filter counts but displays one page at a time", async () => {
  const definition = loadPageDefinition("topics");
  const originalWx = global.wx;
  const requests = [];
  const topics = Array.from({ length: 35 }, (_, index) => ({
    slug: `topic-${index + 1}`,
    title: `情绪管理话题 ${index + 1}`,
    tags: ["情绪管理"],
    generatingProgress: { status: "done", done: 1, total: 1 }
  }));
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      ...originalWx,
      getStorageSync(key) {
        if (key === "xf_token") return "token-1";
        return "";
      },
      request(options) {
        requests.push(options.url);
        const url = new URL(options.url, "https://xianfeng.xinzhi.info");
        const page = Number(url.searchParams.get("page")) || 1;
        const limit = Number(url.searchParams.get("limit")) || 100;
        const start = (page - 1) * limit;
        options.success({
          statusCode: 200,
          data: {
            topics: topics.slice(start, start + limit),
            total: topics.length,
            page,
            limit
          }
        });
      }
    };

    await definition.openFilterDrawer.call(context);

    assert.equal(context.data.filterDrawerOpen, true);
    assert.equal(context.data.filterSourceLoaded, true);
    assert.equal(context.data.allFilterTopics.length, 35);
    assert.equal(context.data.topicFilterPreviewCount, 35);
    assert.equal(requests.some((requestUrl) => {
      const url = new URL(requestUrl, "https://xianfeng.xinzhi.info");
      return url.pathname === "/api/topic-hub" && url.searchParams.get("limit") === "100";
    }), true);

    definition.onDrawerTopicTagTap.call(context, { currentTarget: { dataset: { tag: "情绪管理" } } });
    definition.applyTopicFilterDraft.call(context);

    assert.equal(context.data.topicFilterPreviewCount, 35);
    assert.equal(context.data.topics.length, 10);
    assert.equal(context.data.hasMoreTopics, true);
    assert.equal(context.data.visibleTopicCount, 10);

    definition.loadMoreTopics.call(context);

    assert.equal(context.data.topics.length, 20);
    assert.equal(context.data.hasMoreTopics, true);
  } finally {
    global.wx = originalWx;
  }
});

test("topics tab reveals a delete button on long press and hides the topic after delete", async () => {
  const definition = loadPageDefinition("topics");
  const originalWx = global.wx;
  const requests = [];
  const toasts = [];
  const topics = [
    {
      id: "keep-topic",
      slug: "keep-topic",
      title: "保留话题",
      tags: ["阅读"],
      displayTags: ["阅读"],
      canOpen: true,
      progressVisible: false
    },
    {
      id: "delete-topic",
      slug: "delete-topic",
      title: "删除话题",
      tags: ["写作"],
      displayTags: ["写作"],
      canOpen: true,
      progressVisible: false
    }
  ];
  const context = {
    ...definition,
    data: {
      ...definition.data,
      allTopics: topics,
      topics,
      guideTags: [{ label: "全部", value: "" }, { label: "阅读", value: "阅读" }, { label: "写作", value: "写作" }],
      allGuideTags: [{ label: "全部", value: "" }, { label: "阅读", value: "阅读" }, { label: "写作", value: "写作" }]
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        if (key === "xf_user") return { _id: "user-1" };
        return "";
      },
      setStorageSync() {},
      showToast(options) {
        toasts.push(options);
      },
      request(options) {
        requests.push({ method: options.method || "GET", url: options.url, data: options.data });
        if (options.method === "DELETE" && options.url.endsWith("/api/topic-hub/delete-topic")) {
          options.success({ statusCode: 200, data: { message: "已隐藏", slug: "delete-topic" } });
          return;
        }
        options.fail({ errMsg: `unexpected request ${options.url}` });
      }
    };

    definition.showTopicDelete.call(context, { currentTarget: { dataset: { id: "delete-topic" } } });
    assert.equal(context.data.deleteTopicId, "delete-topic");

    await definition.deleteTopic.call(context, { currentTarget: { dataset: { id: "delete-topic" } } });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "DELETE");
    assert.equal(requests[0].data.userId, "user-1");
    assert.deepEqual(context.data.topics.map((item) => item.id), ["keep-topic"]);
    assert.deepEqual(context.data.allTopics.map((item) => item.id), ["keep-topic"]);
    assert.equal(context.data.deleteTopicId, "");
    assert.equal(toasts.at(-1).title, "已删除");
  } finally {
    global.wx = originalWx;
  }
});

test("topics tab keeps other visible search results after deleting one topic", async () => {
  const definition = loadPageDefinition("topics");
  const originalWx = global.wx;
  const requests = [];
  const topics = [
    {
      id: "keep-result",
      slug: "keep-result",
      title: "保留搜索结果",
      tags: ["阅读"],
      displayTags: ["阅读"],
      canOpen: true,
      progressVisible: false
    },
    {
      id: "delete-result",
      slug: "delete-result",
      title: "删除搜索结果",
      tags: ["写作"],
      displayTags: ["写作"],
      canOpen: true,
      progressVisible: false
    }
  ];
  const context = {
    ...definition,
    data: {
      ...definition.data,
      allTopics: [],
      topics,
      guideTags: [{ label: "全部", value: "" }],
      allGuideTags: [{ label: "全部", value: "" }]
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        if (key === "xf_user") return { _id: "user-1" };
        return "";
      },
      setStorageSync() {},
      showToast() {},
      request(options) {
        requests.push({ method: options.method || "GET", url: options.url, data: options.data });
        if (options.method === "DELETE" && options.url.endsWith("/api/topic-hub/delete-result")) {
          options.success({ statusCode: 200, data: { message: "已隐藏", slug: "delete-result" } });
          return;
        }
        options.fail({ errMsg: `unexpected request ${options.url}` });
      }
    };

    await definition.deleteTopic.call(context, { currentTarget: { dataset: { id: "delete-result" } } });

    assert.equal(requests.length, 1);
    assert.deepEqual(context.data.topics.map((item) => item.id), ["keep-result"]);
    assert.deepEqual(context.data.allTopics, []);
  } finally {
    global.wx = originalWx;
  }
});

test("topics tab searches and intercepts matching topics before submit", async () => {
  const definition = loadPageDefinition("topics");
  const originalWx = global.wx;
  const requests = [];
  const navigations = [];
  const context = {
    ...definition,
    data: { ...definition.data, askInput: "孩子写作怎么提高" },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        if (key === "xf_user") return { _id: "user-1" };
        return "";
      },
      setStorageSync() {},
      navigateTo(options) {
        navigations.push(options);
      },
      showToast() {},
      request(options) {
        requests.push({ method: options.method || "GET", url: options.url, data: options.data });
        if (options.url.includes("/api/topic-hub?search=")) {
          options.success({
            statusCode: 200,
            data: {
              topics: [
                {
                  _id: "topic-existing",
                  slug: "existing-writing-topic",
                  title: "已有写作话题",
                  tags: ["写作"],
                  shortSummary: "可直接查看的相关话题",
                  generatingProgress: { status: "done", done: 1, total: 1 }
                }
              ]
            }
          });
          return;
        }
        options.fail({ errMsg: `unexpected request ${options.url}` });
      }
    };

    await definition.submitAsk.call(context);

    assert.deepEqual(navigations, [], "search interception should stay on the native topics tab");
    const searchRequest = requests.find((item) => item.url.includes("/api/topic-hub?search="));
    assert.ok(searchRequest, "submit should search existing topics before generating");
    assert.equal(new URL(searchRequest.url).searchParams.get("userId"), "user-1");
    assert.equal(requests.some((item) => item.method === "POST" && item.url.endsWith("/api/topic-hub/refine")), false);
    assert.equal(requests.some((item) => item.method === "POST" && item.url.endsWith("/api/topic-hub/validate")), false);
    assert.equal(requests.some((item) => item.method === "POST" && item.url.endsWith("/api/topic-hub/search-generate")), false);
    assert.equal(context.data.askMessageType, "searchResults");
    assert.equal(context.data.pendingAskText, "孩子写作怎么提高");
    assert.equal(context.data.topics.length, 1);
    assert.equal(context.data.topics[0].slug, "existing-writing-topic");
    assert.equal(context.data.topics[0].canOpen, true);
  } finally {
    global.wx = originalWx;
  }
});

test("topics tab submits the confirmed refined topic without searching again", async () => {
  const definition = loadPageDefinition("topics");
  const originalWx = global.wx;
  const originalSetInterval = global.setInterval;
  const requests = [];
  const timers = [];
  const context = {
    ...definition,
    data: {
      ...definition.data,
      askInput: "错",
      pendingAskText: "错",
      refinedKeyword: "孩子做错事不肯道歉怎么办"
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.setInterval = (callback, intervalMs) => {
      const timer = { id: timers.length + 1, callback, intervalMs };
      timers.push(timer);
      return timer.id;
    };
    global.wx = {
      getStorageSync(key) {
        if (key === "xf_user") return { _id: "user-1" };
        return "";
      },
      setStorageSync() {},
      navigateTo() {},
      showToast() {},
      request(options) {
        requests.push({ method: options.method || "GET", url: options.url, data: options.data });
        if (options.url.includes("/api/topic-hub?search=")) {
          options.fail({ errMsg: "confirm should not search existing topics again" });
          return;
        }
        if (options.url.endsWith("/api/topic-hub/validate")) {
          options.success({ statusCode: 200, data: { valid: true } });
          return;
        }
        if (options.url.endsWith("/api/topic-hub/search-generate")) {
          options.success({
            statusCode: 201,
            data: {
              source: "generated",
              topic: {
                _id: "topic-confirmed",
                slug: "confirmed-apology-topic",
                title: "孩子做错事不肯道歉怎么办",
                tags: ["家庭教育"],
                shortSummary: "正在生成知识树",
                generatingProgress: { status: "pending", done: 0, total: 15 }
              }
            }
          });
          return;
        }
        options.fail({ errMsg: `unexpected request ${options.url}` });
      }
    };

    await definition.confirmRefinedAsk.call(context);

    assert.equal(requests.some((item) => item.url.includes("/api/topic-hub?search=")), false);
    assert.equal(requests.some((item) => item.method === "POST" && item.url.endsWith("/api/topic-hub/refine")), false);
    assert.equal(requests.some((item) => item.method === "POST" && item.url.endsWith("/api/topic-hub/validate")), true);
    const generateRequest = requests.find((item) => item.method === "POST" && item.url.endsWith("/api/topic-hub/search-generate"));
    assert.ok(generateRequest, "confirmed refined topic should be submitted for creation");
    assert.equal(generateRequest.data.keyword, "孩子做错事不肯道歉怎么办");
    assert.equal(context.data.askMessageType, "success");
    assert.equal(context.data.pendingAskText, "");
    assert.equal(context.data.refinedKeyword, "");
    assert.equal(context.data.topics[0].slug, "confirmed-apology-topic");
    assert.equal(timers.length, 1, "new generated topics should start progress polling");
  } finally {
    global.wx = originalWx;
    global.setInterval = originalSetInterval;
  }
});

test("topics tab submits questions through the native API flow instead of opening the mobile website", async () => {
  const definition = loadPageDefinition("topics");
  const originalWx = global.wx;
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const requests = [];
  const navigations = [];
  const timers = [];
  const clearedTimers = [];
  const context = {
    ...definition,
    data: { ...definition.data, askInput: "孩子写作怎么提高" },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.setInterval = (callback, intervalMs) => {
      const timer = { id: timers.length + 1, callback, intervalMs };
      timers.push(timer);
      return timer.id;
    };
    global.clearInterval = (timerId) => {
      clearedTimers.push(timerId);
    };
    global.wx = {
      getStorageSync(key) {
        if (key === "xf_user") return { _id: "user-1" };
        return "";
      },
      setStorageSync() {},
      navigateTo(options) {
        navigations.push(options);
      },
      showToast() {},
      request(options) {
        requests.push({ method: options.method || "GET", url: options.url, data: options.data });
        if (options.url.includes("/api/topic-hub?search=")) {
          options.success({ statusCode: 200, data: { topics: [] } });
          return;
        }
        if (options.url.endsWith("/api/topic-hub/refine")) {
          options.success({ statusCode: 200, data: { refined: "孩子写作怎么提高", needConfirm: false } });
          return;
        }
        if (options.url.endsWith("/api/topic-hub/validate")) {
          options.success({ statusCode: 200, data: { valid: true } });
          return;
        }
        if (options.url.endsWith("/api/topic-hub/search-generate")) {
          options.success({
            statusCode: 201,
            data: {
              source: "generated",
              topic: {
                _id: "topic-1",
                slug: "writing-growth",
                title: "孩子写作怎么提高",
                subtitle: "表达能力提升",
                coverEmoji: "✍️",
                tags: ["写作"],
                shortSummary: "正在生成知识树",
                generatingProgress: { status: "pending", done: 0, total: 15 }
              }
            }
          });
          return;
        }
        if (options.url.endsWith("/api/topic-hub/writing-growth/progress")) {
          options.success({
            statusCode: 200,
            data: { progress: { total: 10, done: 5, status: "generating" } }
          });
        }
      }
    };

    await definition.submitAsk.call(context);

    assert.deepEqual(navigations, [], "native submit should not open /topics in a web-view");
    assert.equal(requests.some((item) => item.url.includes("/api/topic-hub?search=")), true);
    assert.equal(requests.some((item) => item.method === "POST" && item.url.endsWith("/api/topic-hub/refine")), true);
    assert.equal(requests.some((item) => item.method === "POST" && item.url.endsWith("/api/topic-hub/validate")), true);
    assert.equal(requests.some((item) => item.method === "POST" && item.url.endsWith("/api/topic-hub/search-generate")), true);
    assert.equal(context.data.askInput, "");
    assert.equal(context.data.topics[0].slug, "writing-growth");
    assert.equal(context.data.topics[0].progressVisible, true);
    assert.equal(context.data.topics[0].canOpen, false);
    assert.equal(context.data.askMessageType, "success");
    assert.equal(timers.length, 1, "new generated topics should start progress polling");
    assert.equal(timers[0].intervalMs, 1500);

    await timers[0].callback();

    assert.equal(requests.some((item) => item.url.endsWith("/api/topic-hub/writing-growth/progress")), true);
    assert.equal(context.data.topics[0].progressPercent, 50);
    assert.equal(context.data.topics[0].progressLabel, "AI 解析中");
    assert.deepEqual(clearedTimers, []);
  } finally {
    global.wx = originalWx;
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});

test("topics tab shows staged progress while a question is being submitted", async () => {
  const definition = loadPageDefinition("topics");
  const originalWx = global.wx;
  const originalSetInterval = global.setInterval;
  const requests = [];
  const updates = [];
  const context = {
    ...definition,
    data: { ...definition.data, askInput: "孩子写作怎么提高" },
    setData(payload) {
      updates.push(payload);
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.setInterval = () => 1;
    global.wx = {
      getStorageSync(key) {
        if (key === "xf_user") return { _id: "user-1" };
        return "";
      },
      setStorageSync() {},
      navigateTo() {},
      showToast() {},
      request(options) {
        requests.push({ method: options.method || "GET", url: options.url, data: options.data });
        if (options.url.includes("/api/topic-hub?search=")) {
          options.success({ statusCode: 200, data: { topics: [] } });
          return;
        }
        if (options.url.endsWith("/api/topic-hub/refine")) {
          options.success({ statusCode: 200, data: { refined: "孩子写作怎么提高", needConfirm: false } });
          return;
        }
        if (options.url.endsWith("/api/topic-hub/validate")) {
          options.success({ statusCode: 200, data: { valid: true } });
          return;
        }
        if (options.url.endsWith("/api/topic-hub/search-generate")) {
          options.success({
            statusCode: 201,
            data: {
              source: "generated",
              topic: {
                _id: "topic-progress-submit",
                slug: "progress-submit",
                title: "孩子写作怎么提高",
                generatingProgress: { status: "pending", done: 0, total: 15 }
              }
            }
          });
          return;
        }
        options.fail({ errMsg: `unexpected request ${options.url}` });
      }
    };

    await definition.submitAsk.call(context);

    const progressUpdates = updates
      .filter((payload) => Object.prototype.hasOwnProperty.call(payload, "askSubmitProgressPercent"))
      .map((payload) => [payload.askSubmitProgressLabel, payload.askSubmitProgressPercent]);
    assert.deepEqual(progressUpdates.slice(0, 4), [
      ["检索相似话题", 18],
      ["AI 提炼核心问题", 42],
      ["校验问题有效性", 68],
      ["创建话题与知识树任务", 88]
    ]);
    assert.equal(context.data.askMessageType, "success");
    assert.equal(context.data.askSubmitProgressPercent, 100);
    assert.equal(context.data.askSubmitProgressLabel, "提交完成");
  } finally {
    global.wx = originalWx;
    global.setInterval = originalSetInterval;
  }
});

test("native first-level tabs match web paging and append on scroll", () => {
  const programs = readPage("programs");
  const reading = readPage("reading");
  const materials = readPage("materials");
  const topics = readPage("topics");

  assert.match(programs.js, /const PROGRAM_PAGE_SIZE = 20;/, "programs should match web pageSize");
  assert.match(programs.js, /const PROGRAM_FILTER_PAGE_SIZE = 100;/, "program filters should load a larger source page");
  assert.match(programs.js, /currentProgramPage: 1/);
  assert.match(programs.js, /totalProgramPages: 1/);
  assert.match(programs.js, /hasMorePrograms: false/);
  assert.match(programs.js, /request\(\{ url: appendProfileQuery\(`\/api\/programs\?page=\$\{nextPage\}&pageSize=\$\{PROGRAM_PAGE_SIZE\}`\) \}\)/);
  assert.match(programs.js, /request\(\{ url: `\/api\/programs\?page=\$\{page\}&pageSize=\$\{PROGRAM_FILTER_PAGE_SIZE\}` \}\)/);
  assert.match(programs.js, /mergeProgramsById\(previousPrograms, pagePrograms\)/);
  assert.match(programs.js, /onReachBottom\(\)\s*\{[\s\S]*this\.loadMorePrograms\(\);[\s\S]*\}/);

  assert.match(reading.js, /const BOOK_PAGE_SIZE = 24;/, "reading should match web PAGE_SIZE");
  assert.match(reading.js, /visibleBookCount: BOOK_PAGE_SIZE/);
  assert.match(reading.js, /sliceBooksForDisplay\(filteredBooks, BOOK_PAGE_SIZE\)/);
  assert.match(reading.js, /const nextCount = Math\.min\(filteredBooks\.length, currentCount \+ BOOK_PAGE_SIZE\);/);
  assert.match(reading.js, /onReachBottom\(\)\s*\{[\s\S]*this\.loadMoreBooks\(\);[\s\S]*\}/);

  assert.match(materials.js, /const MATERIAL_PAGE_SIZE = 24;/, "materials should match web PAGE_SIZE");
  assert.match(materials.js, /visibleMaterialCount: MATERIAL_PAGE_SIZE/);
  assert.match(materials.js, /sliceMaterialsForDisplay\(filteredMaterials, MATERIAL_PAGE_SIZE\)/);
  assert.match(materials.js, /const nextCount = Math\.min\(filteredMaterials\.length, currentCount \+ MATERIAL_PAGE_SIZE\);/);
  assert.match(materials.js, /onReachBottom\(\)\s*\{[\s\S]*this\.loadMoreMaterials\(\);[\s\S]*\}/);

  assert.match(topics.js, /const TOPIC_PAGE_SIZE = 10;/, "topics should use small native pages for fast first paint");
  assert.match(topics.js, /const TOPIC_FILTER_PAGE_SIZE = 100;/, "topic filters should load a larger source page");
  assert.match(topics.js, /const TOPIC_DETAIL_PREFETCH_LIMIT = 1;/, "topics should not prefetch multiple heavy details on first paint");
  assert.match(topics.js, /const TOPIC_DETAIL_PREFETCH_DELAY_MS = 300;/, "topic detail prefetch should be delayed until after first paint");
  assert.match(topics.js, /currentTopicPage: 1/);
  assert.match(topics.js, /totalTopicPages: 1/);
  assert.match(topics.js, /hasMoreTopics: false/);
  assert.match(topics.js, /request\(\{ url: buildTopicListUrl\(nextPage, TOPIC_PAGE_SIZE\) \}\)/);
  assert.match(topics.js, /mergeTopicsById\(previousTopics, pageTopics\)/);
  assert.match(topics.js, /onReachBottom\(\)\s*\{[\s\S]*this\.loadMoreTopics\(\);[\s\S]*\}/);
});

test("programs tab displays appended normal list pages instead of resetting to the first page size", async () => {
  const definition = loadPageDefinition("programs");
  const originalWx = global.wx;
  const makeProgram = (index) => ({
    _id: `program-${index}`,
    title: `节目 ${index}`,
    status: "published",
    programShow: "xianfeng",
    summary: { tags: ["测试"] }
  });
  try {
    global.wx = {
      ...originalWx,
      request(options) {
        const url = new URL(options.url, "https://mp.local");
        const page = Number(url.searchParams.get("page") || 1);
        const start = (page - 1) * 20 + 1;
        options.success({
          statusCode: 200,
          data: {
            programs: Array.from({ length: 20 }, (_, index) => makeProgram(start + index)),
            total: 45,
            totalPages: 3
          }
        });
      },
      setStorageSync() {}
    };
    const context = {
      ...definition,
      data: { ...definition.data, programs: [], allPrograms: [] },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };

    await definition.loadPrograms.call(context);
    await definition.loadPrograms.call(context, { page: 2, append: true });

    assert.equal(context.data.allPrograms.length, 40);
    assert.equal(context.data.programs.length, 40);
    assert.equal(context.data.visibleProgramCount, 40);
    assert.equal(context.data.hasMorePrograms, true);
  } finally {
    global.wx = originalWx;
  }
});

test("topics tab displays appended normal list pages instead of resetting to the first page size", async () => {
  const definition = loadPageDefinition("topics");
  const originalWx = global.wx;
  const makeTopic = (index) => ({
    _id: `topic-${index}`,
    slug: `topic-${index}`,
    title: `话题 ${index}`,
    tags: ["测试"],
    shortSummary: "话题摘要"
  });
  try {
    global.wx = {
      ...originalWx,
      request(options) {
        const url = new URL(options.url, "https://mp.local");
        const page = Number(url.searchParams.get("page") || 1);
        const start = (page - 1) * 10 + 1;
        options.success({
          statusCode: 200,
          data: {
            topics: Array.from({ length: 10 }, (_, index) => makeTopic(start + index)),
            total: 75,
            totalPages: 8
          }
        });
      },
      setStorageSync() {}
    };
    const context = {
      ...definition,
      data: { ...definition.data, topics: [], allTopics: [] },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      },
      syncTopicProgressPolling() {}
    };

    await definition.loadTopics.call(context);
    await definition.loadTopics.call(context, { page: 2, append: true });

    assert.equal(context.data.allTopics.length, 20);
    assert.equal(context.data.topics.length, 20);
    assert.equal(context.data.visibleTopicCount, 20);
    assert.equal(context.data.hasMoreTopics, true);
  } finally {
    global.wx = originalWx;
  }
});

test("programs tab filters all loaded filter results but displays one page at a time", () => {
  const definition = loadPageDefinition("programs");
  const programs = Array.from({ length: 25 }, (_, index) => ({
    id: `program-${index + 1}`,
    title: `群友节目 ${index + 1}`,
    status: "group-only",
    show: "zhiji",
    tags: ["群友"],
    displayTags: ["#群友"]
  }));
  const context = {
    ...definition,
    data: {
      ...definition.data,
      allPrograms: programs.slice(0, 20),
      allFilterPrograms: programs,
      filterSourceLoaded: true,
      draftProgramShow: "",
      draftProgramStatus: "group-only",
      draftProgramTags: []
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    scrollBelowSearchPanel() {}
  };

  definition.applyProgramFilterDraft.call(context);

  assert.equal(context.data.programFilterPreviewCount, 25);
  assert.equal(context.data.programs.length, 20);
  assert.equal(context.data.hasMorePrograms, true);
  assert.equal(context.data.visibleProgramCount, 20);

  definition.loadMorePrograms.call(context);

  assert.equal(context.data.programs.length, 25);
  assert.equal(context.data.hasMorePrograms, false);
});

test("programs tab keeps filter drawer preview stable when page bottom is reached", () => {
  const definition = loadPageDefinition("programs");
  const loadCalls = [];
  const context = {
    ...definition,
    data: {
      ...definition.data,
      filterDrawerOpen: true,
      programFilterPreviewCount: 100,
      currentProgramPage: 1,
      totalProgramPages: 5,
      hasMorePrograms: true,
      loading: false,
      loadingMorePrograms: false,
      activeProgramShow: "",
      activeProgramStatus: "",
      activeProgramTags: [],
      activeProgramTag: ""
    },
    loadPrograms(options) {
      loadCalls.push(options);
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  definition.loadMorePrograms.call(context);

  assert.deepEqual(loadCalls, []);
  assert.equal(context.data.programFilterPreviewCount, 100);
});

test("programs tab waits for the full filter source before opening the filter drawer", async () => {
  const definition = loadPageDefinition("programs");
  const currentPrograms = Array.from({ length: 20 }, (_, index) => ({
    id: `current-${index + 1}`,
    title: `首屏节目 ${index + 1}`,
    status: "published",
    show: "xianfeng",
    tags: ["首屏"]
  }));
  const fullPrograms = Array.from({ length: 123 }, (_, index) => ({
    id: `program-${index + 1}`,
    title: `全部节目 ${index + 1}`,
    status: "published",
    show: "xianfeng",
    tags: ["全部"]
  }));
  let resolveSource;
  const sourcePromise = new Promise((resolve) => {
    resolveSource = resolve;
  });
  const context = {
    ...definition,
    data: {
      ...definition.data,
      allPrograms: currentPrograms,
      programs: currentPrograms,
      allFilterPrograms: [],
      filterSourceLoaded: false,
      filterDrawerOpen: false,
      programFilterPreviewCount: 0,
      activeProgramShow: "",
      activeProgramStatus: "",
      activeProgramTags: []
    },
    loadProgramFilterSource() {
      return sourcePromise.then(() => {
        this.setData({
          allFilterPrograms: fullPrograms,
          filterSourceLoaded: true,
          filterSourceLoading: false
        });
        return fullPrograms;
      });
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  const openPromise = definition.openFilterDrawer.call(context);

  assert.equal(context.data.filterDrawerOpen, false);
  assert.equal(context.data.programFilterPreviewCount, 0);

  resolveSource();
  await openPromise;

  assert.equal(context.data.filterDrawerOpen, true);
  assert.equal(context.data.programFilterPreviewCount, 123);
});

test("programs tab waits for the full filter source before applying a card tag", async () => {
  const definition = loadPageDefinition("programs");
  const programs = Array.from({ length: 25 }, (_, index) => ({
    id: `program-${index + 1}`,
    title: `群友节目 ${index + 1}`,
    status: "published",
    show: "xianfeng",
    tags: ["群友"],
    displayTags: ["#群友"]
  }));
  const context = {
    ...definition,
    data: {
      ...definition.data,
      allPrograms: programs.slice(0, 20),
      allFilterPrograms: [],
      filterSourceLoaded: false,
      activeProgramShow: "",
      activeProgramStatus: "",
      activeProgramTags: [],
      activeProgramTag: ""
    },
    loadProgramFilterSource() {
      this.data = {
        ...this.data,
        allFilterPrograms: programs,
        filterSourceLoaded: true
      };
      return Promise.resolve(programs);
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    scrollBelowSearchPanel() {}
  };

  await definition.applyProgramTagFilter.call(context, ["#群友"]);

  assert.equal(context.data.programFilterPreviewCount, 25);
  assert.equal(context.data.programs.length, 20);
  assert.equal(context.data.hasMorePrograms, true);
});

test("topics tab waits for the full filter source before applying filters", async () => {
  const definition = loadPageDefinition("topics");
  const topics = Array.from({ length: 35 }, (_, index) => ({
    id: `topic-${index + 1}`,
    title: `升学话题 ${index + 1}`,
    tags: ["升学"],
    displayTags: ["升学"],
    summary: "打开详情继续查看完整知识树和相关回答",
    canOpen: true,
    gradeMatch: true
  }));
  const createContext = () => ({
    ...definition,
    data: {
      ...definition.data,
      allTopics: topics.slice(0, 10),
      allFilterTopics: [],
      filterSourceLoaded: false,
      activeTopicTags: [],
      activeTopicTag: "",
      draftTopicTags: ["升学"],
      askInput: ""
    },
    loadTopicFilterSource() {
      this.data = {
        ...this.data,
        allFilterTopics: topics,
        filterSourceLoaded: true
      };
      return Promise.resolve(topics);
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  });

  const drawerContext = createContext();
  await definition.applyTopicFilterDraft.call(drawerContext);
  assert.equal(drawerContext.data.topicFilterPreviewCount, 35);
  assert.equal(drawerContext.data.topics.length, 10);
  assert.equal(drawerContext.data.hasMoreTopics, true);

  const tagContext = createContext();
  await definition.applyTopicTagFilter.call(tagContext, "升学");
  assert.equal(tagContext.data.topicFilterPreviewCount, 35);
  assert.equal(tagContext.data.topics.length, 10);
  assert.equal(tagContext.data.hasMoreTopics, true);
});

test("native list filter summaries omit the tag field name on every source", () => {
  const programs = readPage("programs");
  const reading = readPage("reading");
  const materials = readPage("materials");
  const topics = readPage("topics");

  assert.match(programs.wxml, />正在筛选：\{\{activeProgramTagLabel\}\}</);
  assert.match(reading.wxml, />正在筛选：\{\{activeReadingTagLabel\}\}</);
  assert.match(materials.wxml, />正在筛选：\{\{activeMaterialTagLabel\}\}</);
  assert.match(topics.wxml, />正在筛选：\{\{activeTopicTagLabel\}\}</);
  assert.match(programs.js, /if \(tagLabel\) parts\.push\(tagLabel\);/);
  assert.doesNotMatch(programs.js, /parts\.push\(`标签：\$\{tagLabel\}`\)/);
  for (const page of [reading, materials, topics]) {
    assert.match(page.js, /function buildFilterLabel\(tags\) \{\s+return normalizeFilterTags\(tags\)\.join\("、"\);\s+\}/);
  }
});

test("programs tab renders a native first-level list and opens details through the native wrapper route", async () => {
  const { js, json, wxml, wxss } = readPage("programs");
  const nativeSettings = readNativeSettings();
  const definition = loadPageDefinition("programs");
  const storage = new Map();
  const requests = [];
  const navigations = [];
  const pageScrolls = [];
  const tabBarData = {};
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    getTabBar() {
      return {
        setData(payload) {
          Object.assign(tabBarData, payload);
        }
      };
    }
  };
  const originalWx = global.wx;
  const originalGetCurrentPages = global.getCurrentPages;
  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      request(options) {
        requests.push(options);
        const requestedUrl = new URL(options.url, "https://mp.local");
        const pageSize = requestedUrl.searchParams.get("pageSize");
        const isFilterSourceRequest = pageSize === "100";
        const programs = [
          {
            _id: "p1",
            programCode: "ep-1",
            title: "家长先疯｜原生首屏节目，中年知己嘉宾来做客",
            description: "给小程序首屏展示的摘要，内容里提到中年知己但归属仍是家长先疯",
            coverImage: "http://xianfeng.xinzhi.info/uploads/program.jpg",
            programShow: "xianfeng",
            summary: { tags: ["升学", "亲子", "小学写作", "中年知己"], headline: "本期看点：中年知己联动" },
            episodes: [{ duration: "32:10" }],
            publishedAt: "2026-06-01T00:00:00.000Z",
            status: "published"
          },
          {
            _id: "p2",
            programCode: "ep-2",
            title: "番外｜群友专属内容",
            description: "只给群友看的补充节目",
            coverImage: "http://xianfeng.xinzhi.info/uploads/group.jpg",
            programShow: "zhiji",
            summary: { tags: ["群友"], headline: "群友看点" },
            episodes: [{ duration: "10:00" }],
            publishedAt: "2026-06-02T00:00:00.000Z",
            status: "group-only"
          },
          {
            _id: "p3",
            programCode: "ep-3",
            title: "番外｜首屏外的群友节目",
            description: "第二页才会加载的筛选节目",
            coverImage: "http://xianfeng.xinzhi.info/uploads/group-extra.jpg",
            programShow: "zhiji",
            summary: { tags: ["群友", "全量"], headline: "全量筛选看点" },
            episodes: [{ duration: "12:00" }],
            publishedAt: "2026-06-03T00:00:00.000Z",
            status: "group-only"
          }
        ];
        options.success({
          statusCode: 200,
          data: {
            programs: isFilterSourceRequest ? programs : programs.slice(0, 2),
            total: programs.length,
            page: Number(requestedUrl.searchParams.get("page") || "1"),
            pageSize: Number(pageSize || "20"),
            totalPages: isFilterSourceRequest ? 1 : 2
          }
        });
      },
      navigateTo(options) {
        navigations.push(options);
      },
      switchTab(options) {
        navigations.push(options);
      },
      pageScrollTo(options) {
        pageScrolls.push(options);
      }
    };
    global.getCurrentPages = () => [{ route: "pages/programs/index" }];

    assert.equal(json.navigationStyle, "custom");
    assert.match(wxml, /<view class="xf-program-page \{\{fontSizeClass\}\} \{\{compactMode \? 'is-compact' : 'is-feature'\}\}" style="padding-top: \{\{chromeHeight\}\}px;">/);
    assert.match(wxml, /src="\/assets\/nav\/logo\.png"/);
    assert.doesNotMatch(wxml, /PROGRAMS|从完整节目索引中/);
    assert.doesNotMatch(wxml, /xf-program-hero|showGuideCard|is-guide-hidden/);
    assert.match(wxml, /bindtap="switchProgramViewMode"/);
    assert.match(wxml, /aria-label="切换节目展示样式"/);
    assert.match(wxml, /class="xf-native-search-field has-filter" bindtap="openSearch" role="button"/);
    assert.match(wxml, /class="xf-native-search-filter" catchtap="openFilterDrawer" aria-label="打开节目筛选"/);
    assert.match(wxml, /<image class="xf-native-search-filter-icon" src="\/assets\/nav\/filter-sliders\.png" mode="aspectFit" aria-hidden="true" \/>/);
    assert.doesNotMatch(wxml, /xf-native-search-filter-line|xf-native-search-filter-dot|xf-native-search-filter-spark|xf-native-search-filter-funnel|xf-native-search-filter-stem/);
    assert.doesNotMatch(wxml, /material-symbols-rounded">tune|>tune<\/text>/);
    assert.doesNotMatch(wxml, /class="xf-program-filter-toggle"/);
    assert.match(wxml, /wx:if="\{\{filterDrawerOpen\}\}" class="xf-native-filter-mask" catchtap="closeFilterDrawer" catchtouchmove="noop"/);
    assert.match(wxml, /class="xf-native-filter-drawer"[\s\S]*style="height: \{\{filterDrawerHeight\}\}px;"[\s\S]*data-drag-mode="drawer"[\s\S]*catchtap="noop"/);
    assert.match(wxml, /<text class="xf-native-filter-title">节目筛选<\/text>/);
    assert.match(wxml, /<text class="xf-native-filter-subtitle">筛选全部节目内容<\/text>/);
    assert.match(wxml, /bindtouchmove="onFilterDrawerTouchMove"/);
    assert.match(wxml, /data-drag-mode="handle"[\s\S]*catchtouchmove="onFilterDrawerTouchMove"/);
    assert.match(wxml, /<scroll-view class="xf-native-filter-scroll" scroll-y="\{\{filterDrawerExpanded\}\}" enhanced show-scrollbar="false">/);
    assert.doesNotMatch(wxml, /内容类型/);
    assert.doesNotMatch(wxml, /wx:for="\{\{contentFilterOptions\}\}"/);
    assert.doesNotMatch(wxml, /data-page="\{\{item\.page\}\}"/);
    assert.match(wxml, /节目分类/);
    assert.match(wxml, /wx:for="\{\{programShowOptions\}\}"/);
    assert.match(wxml, /catchtap="onDrawerProgramShowTap"/);
    assert.match(wxml, /class="xf-native-filter-chip \{\{draftProgramShow === item\.value \? 'is-active' : ''\}\}"/);
    assert.doesNotMatch(wxml, /xf-program-show-filter-chip|xf-program-show-filter-logo/);
    assert.match(wxml, /发布范围/);
    assert.match(wxml, /wx:for="\{\{programStatusOptions\}\}"/);
    assert.match(wxml, /catchtap="onDrawerProgramStatusTap"/);
    assert.match(wxml, /class="xf-native-filter-chip \{\{draftProgramStatus === item\.value \? 'is-active' : ''\}\}"/);
    assert.doesNotMatch(wxml, /xf-program-status-filter-chip/);
    assert.match(wxml, /节目标签/);
    assert.match(wxml, /wx:for="\{\{programFilterTags\}\}"/);
    assert.match(wxml, /catchtap="onDrawerProgramTagTap"/);
    assert.match(wxml, /class="xf-native-filter-chip \{\{isProgramFilterAllSelected \? 'is-active' : ''\}\}" catchtap="resetProgramFilterDraft">全部<\/button>/);
    assert.match(wxml, /class="xf-native-filter-chip \{\{item\.selected \? 'is-active' : ''\}\}"/);
    assert.match(wxml, /class="xf-native-filter-actions"/);
    assert.doesNotMatch(wxml, /xf-program-filter-/);
    assert.match(wxml, /catchtap="applyProgramFilterDraft"[\s\S]*查看 \{\{programFilterPreviewCount\}\} 个节目/);
    assert.match(wxml, /<image wx:if="\{\{compactMode\}\}" class="xf-program-view-icon" src="\/assets\/nav\/view-grid\.png" mode="aspectFit" aria-hidden="true" \/>/);
    assert.match(wxml, /<image wx:else class="xf-program-view-icon" src="\/assets\/nav\/view-list\.png" mode="aspectFit" aria-hidden="true" \/>/);
    assert.equal((wxml.match(/class="xf-program-view-dot"/g) || []).length, 0);
    assert.equal((wxml.match(/class="xf-program-view-card"/g) || []).length, 0);
    assert.equal((wxml.match(/class="xf-program-view-card-thumb"/g) || []).length, 0);
    assert.equal(wxml.includes("xf-program-view-feature-dot"), false);
    assert.equal(wxml.includes("xf-program-view-line"), false);
    assert.equal(wxml.includes("xf-program-view-icon__large"), false);
    assert.equal(wxml.includes("xf-program-view-icon__small"), false);
    assert.equal(wxml.includes('data-mode="feature"'), false);
    assert.equal(wxml.includes('data-mode="compact"'), false);
    assert.equal(wxml.includes("大卡片"), false);
    assert.equal(wxml.includes("紧凑"), false);
    assert.equal(wxml.includes('wx:else class="xf-program-state"'), false);
    assert.match(wxml, /wx:if="\{\{loading\}\}"/);
    assert.match(wxml, /wx:if="\{\{!loading && programs\.length\}\}"/);
    assert.match(wxml, /wx:if="\{\{!loading && !programs\.length\}\}"/);
    assert.match(wxml, /wx:for="\{\{programs\}\}"/);
    assert.match(wxml, /bindtap="openProgram"/);
    assert.match(wxml, /class="xf-program-cover-wrap"/);
    assert.doesNotMatch(wxml, /xf-program-cover-pill/);
    assert.doesNotMatch(wxml, /xf-program-status-row/);
    assert.doesNotMatch(wxml, /xf-program-title-row/);
    assert.doesNotMatch(wxml, /xf-program-title-pill/);
    assert.doesNotMatch(wxml, /xf-program-show-tag/);
    assert.match(wxml, /<text class="xf-program-card-title">\{\{item\.title\}\}<\/text>[\s\S]*<text class="xf-program-description">/);
    assert.match(wxml, /wx:if="\{\{item\.statusLabel \|\| item\.displayTags\.length\}\}" class="xf-program-tags"[\s\S]*wx:if="\{\{item\.statusLabel\}\}" class="xf-program-status-tag \{\{item\.status\}\}"/);
    assert.match(wxml, /<text class="xf-program-card-title">\{\{item\.title\}\}<\/text>[\s\S]*<text class="xf-program-description">/);
    assert.doesNotMatch(wxml, /xf-program-meta/);
    assert.doesNotMatch(wxml, /item\.hasMeta/);
    assert.doesNotMatch(wxml, /wx:if="\{\{item\.date\}\}"/);
    assert.doesNotMatch(wxml, /wx:if="\{\{item\.duration\}\}"/);
    assert.match(wxml, /wx:for="\{\{item\.displayTags\}\}"/);
    assert.match(wxml, /class="xf-program-tag \{\{activeProgramTag === tag \? 'is-active' : ''\}\}"[\s\S]*data-tag="\{\{tag\}\}"[\s\S]*catchtap="onProgramTagTap"/);
    assert.equal(fs.existsSync(new URL("../assets/nav/logo.png", import.meta.url)), true);
    assert.match(js, /const PROGRAM_CACHE_KEY = "xf_native_programs_cache_v2"/);
    assert.match(js, /const PROGRAM_VIEW_MODE_KEY = "xf_native_programs_view_mode"/);
    assert.match(js, /const SEARCH_PANEL_HEIGHT_RPX = 114/);
    assert.doesNotMatch(js, /GUIDE_DISMISS_SCROLL_TOP/);
    assert.match(js, /getNativeTopbarMetrics/);
    assert.match(js, /loadPreferredViewMode\(\)/);
    assert.match(js, /isLargeFontMode\(\)/);
    assert.match(js, /onReady\(\)/);
    assert.match(js, /scrollBelowSearchPanel\(\)/);
    assert.match(js, /const scrollTop = Math\.max\(0, \(this\.data\.searchPanelHeight \|\| 0\) - \(this\.data\.topCardGapHeight \|\| 0\)\)/);
    assert.match(js, /wx\.pageScrollTo\(\{ scrollTop, duration: 0 \}\)/);
    assert.doesNotMatch(js, /onPageScroll\(event\)/);
    assert.doesNotMatch(js, /showGuideCard/);
    assert.match(js, /switchProgramViewMode\(\)/);
    assert.match(js, /const compactMode = !this\.data\.compactMode && !this\.isLargeFontMode\(\)/);
    assert.match(js, /this\.isLargeFontMode\(\)[\s\S]*wx\.setStorageSync\(PROGRAM_VIEW_MODE_KEY, "feature"\)/);
    assert.match(js, /filterDrawerOpen: false/);
    assert.match(js, /filterDrawerHeight: 0/);
    assert.match(js, /const \{ createFilterDrawerMethods \} = require\("\.\.\/\.\.\/utils\/filterDrawer"\)/);
    assert.match(js, /programFilterTags: \[\]/);
    assert.match(js, /programShowOptions: PROGRAM_SHOW_OPTIONS/);
    assert.match(js, /programStatusOptions: PROGRAM_STATUS_OPTIONS/);
    assert.match(js, /activeProgramShow: ""/);
    assert.match(js, /activeProgramStatus: ""/);
    assert.match(js, /activeProgramTags: \[\]/);
    assert.match(js, /allFilterPrograms: \[\]/);
    assert.match(js, /filterSourceLoaded: false/);
    assert.match(js, /draftProgramTags: \[\]/);
    assert.match(js, /draftProgramShow: ""/);
    assert.match(js, /draftProgramStatus: ""/);
    assert.match(js, /isProgramFilterAllSelected: true/);
    assert.match(js, /programFilterPreviewCount: 0/);
    assert.doesNotMatch(js, /contentFilterOptions: CONTENT_FILTER_OPTIONS/);
    assert.doesNotMatch(js, /const CONTENT_FILTER_OPTIONS = \[/);
    assert.match(js, /function buildProgramFilterTags\(programs, selectedTags\)/);
    assert.match(js, /function inferProgramShow\(program\)/);
    assert.match(js, /function filterPrograms\(programs, filters\)/);
    assert.match(js, /openFilterDrawer\(\)|createFilterDrawerMethods\(/);
    assert.match(js, /closeFilterDrawer\(\)|createFilterDrawerMethods\(/);
    assert.doesNotMatch(js, /onContentFilterTap\(event\)/);
    assert.doesNotMatch(js, /wx\.switchTab\(\{ url: page \}\)/);
    assert.match(js, /onDrawerProgramTagTap\(event\)/);
    assert.match(js, /onDrawerProgramShowTap\(event\)/);
    assert.match(js, /onDrawerProgramStatusTap\(event\)/);
    assert.match(js, /if \(status === "group-only"\) return "群友特供";/);
    assert.match(js, /if \(status === "published"\) return "公开发布";/);
    assert.match(js, /formatDate\(publishedAt\)/);
    assert.doesNotMatch(js, /hasMeta:/);
    assert.match(js, /displayTags: tags\.map\(\(tag\) => `#\$\{tag\}`\)/);
    assert.match(js, /showLabel: showMeta\.label/);
    assert.match(js, /showTone: showMeta\.tone/);
    assert.match(js, /findProgramShowOption\(item\.programShow\)/);
    assert.doesNotMatch(js, /item\.title,[\s\S]*item\.description,[\s\S]*item\.coverImage,[\s\S]*summary\.headline/);
    assert.equal(js.includes("?."), false);
    assert.equal(js.includes(".finally("), false);
    assert.match(js, /request\(\{ url: appendProfileQuery\(`\/api\/programs\?page=\$\{nextPage\}&pageSize=\$\{PROGRAM_PAGE_SIZE\}`\) \}\)/);
    assert.match(js, /openNativeSearch/);
    assert.match(js, /openSearch\(\)/);
    assert.match(js, /allPrograms: \[\]/);
    assert.match(js, /activeProgramTag: ""/);
    assert.match(js, /activeProgramTagLabel: ""/);
    assert.doesNotMatch(js, /programSearchQuery/);
    assert.doesNotMatch(js, /onProgramSearchInput\(event\)/);
    assert.match(js, /function filterProgramsByTags\(programs, tags\)/);
    assert.match(js, /function normalizeFilterTags\(values\)/);
    assert.match(js, /function buildProgramTagLabel\(tags\)/);
    assert.match(js, /loadProgramFilterSource\(\)/);
    assert.match(js, /syncProgramFilterDraft\(filters = \{\}\)/);
    assert.match(js, /resetProgramFilterDraft\(\)/);
    assert.match(js, /applyProgramFilterDraft\(\)/);
    assert.match(js, /onProgramTagTap\(event\)/);
    assert.match(js, /clearProgramTagFilter\(\)/);
    assert.doesNotMatch(js, /programMatchesQuery/);
    assert.match(js, /openSearch\(\) \{\s*openNativeSearch\(\);\s*\}/);
    assert.match(nativeSettings, /openSettings\(\)/);
    assert.match(js, /settingsPanelOpen: false/);
    assert.match(js, /const \{[^}]*SETTINGS_SECTIONS[^}]*createNativeSettingsMethods[^}]*setSettingsTabbarHidden[^}]*\} = require\("\.\.\/\.\.\/utils\/nativeSettings"\)/);
    assert.match(nativeSettings, /const \{ getToken, getUser, setSession, clearSession \} = require\("\.\/session"\)/);
    assert.match(nativeSettings, /const TAB_PAGES = \[/);
    assert.doesNotMatch(js, /accountPage: "\/pages\/login\/index"/);
    assert.match(nativeSettings, /syncAccountEntry\(\)/);
    assert.match(nativeSettings, /getToken\(\)/);
    assert.match(nativeSettings, /getUser\(\)/);
    assert.match(nativeSettings, /wx\.switchTab\(\{ url: page \}\)/);
    assert.match(nativeSettings, /openSettingsProfileView/);
    assert.match(nativeSettings, /settingsPanelView/);
    assert.match(nativeSettings, /from: hasMenuIndex \? "settings" : ""/);
    assert.match(nativeSettings, /preserveXiaowanziLayer/);
    assert.match(nativeSettings, /webParams\.xf_panel = panel/);
    assert.match(nativeSettings, /webParams\.preserveXiaowanziLayer = "1"/);
    assert.match(nativeSettings, /openWeb\(path, title, Object\.keys\(webParams\)\.length \? webParams : undefined\)/);
    assert.match(nativeSettings, /setSettingsTabbarHidden\(this, true\)/);
    assert.match(nativeSettings, /function getSettingsPanelHeight\(\)/);
    assert.match(nativeSettings, /this\.setData\(\{ settingsPanelHeight: getSettingsPanelHeight\(\), settingsPanelOpen: true, settingsPanelView: "menu" \}\)/);
    assert.match(nativeSettings, /closeSettings\(\)/);
    assert.match(nativeSettings, /setSettingsTabbarHidden\(this, false\)/);
    assert.match(nativeSettings, /this\.setData\(\{ settingsPanelOpen: false, settingsPanelView: "menu" \}\)/);
    assert.match(nativeSettings, /function setSettingsTabbarHidden\(page, hidden\)/);
    assert.match(nativeSettings, /tabBar\.setData\(\{ hidden \}\)/);
    assert.match(nativeSettings, /openSettingsItem\(event\)/);
    assert.match(nativeSettings, /const SETTINGS_SECTIONS = \[/);
    assert.match(js, /settingsSections: SETTINGS_SECTIONS/);
    assert.match(nativeSettings, /resolveSettingsItem\(sectionIndex, itemIndex\)/);
    assert.match(js, /const LOGO_HEIGHT_RPX = 56/);
    assert.match(js, /const TOP_CARD_GAP_RPX = 24/);
    assert.match(js, /chromeHeight: 88/);
    assert.match(js, /searchPanelHeight: 57/);
    assert.match(js, /topCardGapHeight: 12/);
    assert.match(js, /const searchPanelHeight = Math\.round\(\(SEARCH_PANEL_HEIGHT_RPX \* windowWidth\) \/ 750\)/);
    assert.match(js, /const topCardGapHeight = Math\.round\(\(TOP_CARD_GAP_RPX \* windowWidth\) \/ 750\)/);
    assert.match(js, /chromeHeight: topbarHeight/);
    assert.match(js, /searchPanelHeight/);
    assert.match(js, /logoTop: Math\.max\(0, Math\.round\(searchButtonTop \+ capsuleHeight \/ 2 - logoHeight \/ 2\)\)/);
    assert.match(js, /searchButtonTop/);
    assert.doesNotMatch(js, /searchButtonRight/);
    assert.doesNotMatch(js, /contentTop/);
    assert.match(js, /openWeb\(program\.path, program\.title\)/);
    assert.match(wxml, /class="xf-program-topbar" style="height: \{\{topbarHeight\}\}px;"/);
    assert.match(wxml, /class="xf-program-nav-row" style="height: \{\{topbarHeight\}\}px;"/);
    assert.match(wxml, /class="xf-program-menu-button" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;" catchtap="openSettings" role="button" aria-label="打开设置"/);
    assert.match(wxml, /class="xf-program-menu-icon"/);
    assert.match(wxml, /class="xf-program-logo" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;" src="\/assets\/nav\/logo\.png" mode="aspectFit" bindtap="goProgramsHome" aria-label="回到顶部"/);
    assert.match(js, /goProgramsHome: navigateProgramsHome/);
    assert.match(js, /goProgramsHome\(\)\s*\{[\s\S]*navigateProgramsHome\(\);[\s\S]*\}/);
    assert.match(wxml, /wx:if="\{\{settingsPanelOpen\}\}" class="xf-program-settings-mask" style="height: \{\{settingsPanelHeight\}\}px;" catchtap="closeSettings" catchtouchmove="noop"/);
    assert.match(wxml, /<scroll-view class="xf-program-settings-panel" style="height: \{\{settingsPanelHeight\}\}px; padding-top: \{\{profilePanelTop\}\}px;" scroll-y="true" enhanced show-scrollbar="false" catchtap="noop"/);
    assert.match(wxss, /\.xf-program-settings-mask \{[\s\S]*bottom: 0;[\s\S]*z-index: 2147483647;/);
    assert.match(wxss, /\.xf-program-settings-panel \{[\s\S]*height: 100%;[\s\S]*padding: 52rpx 34rpx 0;/);
    assert.match(wxml, /<view class="xf-program-settings-panel-inner">\s*<block wx:if="\{\{settingsPanelView === 'menu'\}\}">/);
    assert.match(wxml, /data-page="\{\{accountPage\}\}" data-title="\{\{accountTitle\}\}"/);
    assert.match(wxml, /\{\{accountTitle\}\}/);
    assert.match(wxml, /\{\{accountSubtitle\}\}/);
    assert.match(wxss, /\.xf-program-settings-copy \{[\s\S]*align-items: flex-start;[\s\S]*text-align: left;/);
    assert.match(wxss, /\.xf-program-settings-title,[\s\S]*\.xf-program-settings-subtitle \{[\s\S]*display: block;[\s\S]*text-align: left;/);
    assert.match(nativeSettings, /title: "订阅计划"/);
    assert.match(nativeSettings, /title: "档案管理"/);
    assert.match(nativeSettings, /title: "播客节目"/);
    assert.match(nativeSettings, /title: "先疯智库"[\s\S]*page: "\/pages\/experts\/index"/);
  assert.match(nativeSettings, /title: "学习资料"/);
  assert.match(nativeSettings, /title: "教育规划"/);
  assert.match(nativeSettings, /title: "知物"[\s\S]*title: "百宝箱"[\s\S]*image: "\/assets\/menu\/welfare-gift-icon\.png"[\s\S]*page: "\/pages\/welfare\/index"[\s\S]*title: "好赚"[\s\S]*image: "\/assets\/menu\/mama-hao-zhuan-icon\.png"[\s\S]*page: "\/pages\/mama-resource-apply\/index"/);
  assert.match(nativeSettings, /title: "设置"/);
    assert.match(wxml, /wx:for="\{\{settingsSections\}\}"/);
    assert.match(wxml, /wx:for="\{\{section\.items\}\}"/);
    assert.match(wxml, /data-section-index="\{\{sectionIndex\}\}"/);
    assert.match(wxml, /data-item-index="\{\{itemIndex\}\}"/);
    assert.doesNotMatch(wxml, /data-path=/);
    assert.doesNotMatch(wxml, /WEB_ROUTES/);
    assert.match(wxml, /class="xf-native-search-panel has-view-toggle" aria-label="搜索"/);
    assert.doesNotMatch(wxml, /class="xf-native-search-panel[^"]*" style="top: \{\{topbarHeight\}\}px;"/);
    assert.doesNotMatch(wxml, /class="xf-native-search-panel[^"]*" bindtap="openSearch"/);
    assert.match(wxml, /class="xf-native-search-field has-filter" bindtap="openSearch" role="button"/);
    assert.match(wxml, /class="xf-native-search-filter" catchtap="openFilterDrawer" aria-label="打开节目筛选"/);
    assert.match(wxml, /class="xf-native-search-text">\{\{searchPrompt\}\}<\/text>/);
    assert.match(wxml, /wx:if="\{\{activeProgramTagLabel\}\}" class="xf-native-filter-bar"/);
    assert.match(wxml, /catchtap="clearProgramTagFilter"/);
    assert.match(js, /startSearchPromptRotation\(this\)/);
    assert.match(js, /stopSearchPromptRotation\(this\)/);
    assert.match(js, /searchPrompt: getInitialSearchPrompt\(\)/);
    assert.match(js, /openNativeSearch\(\)/);
    assert.doesNotMatch(wxml, /class="xf-program-search-input"/);
    assert.doesNotMatch(wxml, /xf-program-search-/);
    assert.doesNotMatch(wxml, /placeholder="搜索"/);
    assert.doesNotMatch(wxml, /bindinput="onProgramSearchInput"/);
    assert.doesNotMatch(wxml, /bindconfirm="openSearch"/);
    assert.doesNotMatch(wxml, /xf-program-search-submit/);
    assert.match(wxml, /class="xf-native-search-field has-filter" bindtap="openSearch"[\s\S]*src="\/assets\/nav\/filter-sliders\.png"[\s\S]*<button class="xf-program-view-toggle"/);
    assert.doesNotMatch(wxml, /搜索节目、资料、书单内容/);
    assert.doesNotMatch(wxml, /没有匹配的节目/);
    assert.match(wxml, /class="xf-native-search-circle"/);
    assert.match(wxml, /class="xf-native-search-line"/);
    assert.match(wxss, /background:\s*#f3f2f8/);
    assert.match(wxss, /@import "\.\.\/\.\.\/styles\/native-list\.wxss";/);
    const topbarStyle = wxss.match(/\.xf-program-topbar \{[\s\S]*?\n\}/)?.[0] || "";
    assert.match(topbarStyle, /position: fixed;/);
    assert.match(topbarStyle, /z-index: 40;/);
    assert.match(topbarStyle, /background: #ffffff;/);
    assert.doesNotMatch(topbarStyle, /background: rgba\(255, 255, 255,/);
    assert.doesNotMatch(topbarStyle, /flex-direction: column;/);
    assert.match(wxss, /\.xf-program-nav-row \{[\s\S]*position: relative;[\s\S]*align-items: center;[\s\S]*justify-content: center;[\s\S]*width: 100%;/);
    assert.match(wxss, /\.xf-program-logo \{[\s\S]*position: absolute;[\s\S]*left: 50%;[\s\S]*width: 142rpx;[\s\S]*transform: translateX\(-50%\);/);
    assert.match(wxss, /\.xf-program-menu-button \{[\s\S]*position: absolute;[\s\S]*left: 26rpx;[\s\S]*z-index: 2;[\s\S]*width: 64rpx;[\s\S]*background: transparent;/);
    assert.match(wxss, /\.xf-program-menu-icon,[\s\S]*\.xf-program-menu-icon::before \{[\s\S]*width: 26rpx;[\s\S]*height: 3rpx;[\s\S]*background: #334155;/);
    assert.match(wxss, /\.xf-program-menu-icon \{[\s\S]*transform: translateY\(-5rpx\);/);
    assert.match(wxss, /\.xf-program-menu-icon::before \{[\s\S]*left: 0;[\s\S]*width: 18rpx;/);
    assert.match(wxss, /\.xf-program-menu-icon::before \{[\s\S]*top: 10rpx;/);
    assert.doesNotMatch(wxss, /\.xf-program-menu-icon::after/);
    assert.match(wxss, /\.xf-program-settings-mask \{[\s\S]*position: fixed;[\s\S]*bottom: 0;[\s\S]*z-index: 2147483647;[\s\S]*justify-content: flex-end;[\s\S]*background: rgba\(15, 23, 42, 0\.58\);/);
    assert.match(wxss, /\.xf-program-settings-panel \{[\s\S]*width: 84vw;[\s\S]*max-width: 640rpx;[\s\S]*height: 100%;[\s\S]*padding: 52rpx 34rpx 0;[\s\S]*background: #f7f7f8;[\s\S]*box-shadow: -36rpx 0 90rpx rgba\(15, 23, 42, 0\.2\);/);
    assert.match(wxss, /\.xf-program-settings-panel-inner \{[\s\S]*display: flex;[\s\S]*flex-direction: column;[\s\S]*gap: 26rpx;[\s\S]*min-height: 0;/);
    assert.match(wxss, /\.xf-program-settings-account,[\s\S]*\.xf-program-settings-card \{[\s\S]*margin-bottom: 0;[\s\S]*background: #ffffff;/);
    assert.match(wxss, /\.xf-program-settings-card \{[\s\S]*border-radius: 24rpx;/);
    assert.match(wxss, /\.xf-program-settings-account \{[\s\S]*justify-content: center;[\s\S]*gap: 15rpx;[\s\S]*margin: 0;[\s\S]*min-height: 152rpx;[\s\S]*padding: 32rpx 30rpx;[\s\S]*border-radius: 32rpx;/);
    assert.match(wxss, /\.xf-program-settings-avatar \{[\s\S]*width: 104rpx;[\s\S]*height: 104rpx;/);
    assert.match(wxss, /\.xf-program-settings-avatar-wrap \{[\s\S]*position: relative;[\s\S]*width: 104rpx;[\s\S]*height: 104rpx;/);
    assert.match(wxss, /\.xf-program-settings-title-row \{[\s\S]*display: flex;[\s\S]*align-items: center;[\s\S]*gap: 10rpx;/);
    assert.match(wxss, /\.xf-program-settings-subtitle-row \{[\s\S]*display: flex;[\s\S]*align-items: center;[\s\S]*gap: 10rpx;/);
    assert.match(wxss, /\.xf-program-settings-member-badge \{[\s\S]*display: inline-flex;[\s\S]*background: #0b0f19;[\s\S]*color: #f8d375;/);
    assert.doesNotMatch(wxss, /\.xf-program-settings-member-badge \{[\s\S]*position: absolute;/);
    assert.match(wxss, /\.xf-program-settings-label \{[\s\S]*display: flex;[\s\S]*align-items: center;[\s\S]*height: 34rpx;[\s\S]*line-height: 34rpx;/);
    assert.match(wxss, /\.xf-program-settings-row \.xf-program-settings-member-badge \{[\s\S]*align-self: center;[\s\S]*\}/);
    assert.doesNotMatch(wxss, /\.xf-program-settings-row \.xf-program-settings-member-badge \{[\s\S]*transform:/);
    assert.match(wxss, /\.xf-program-settings-row \.xf-program-settings-chevron \{[\s\S]*display: flex;[\s\S]*align-items: center;[\s\S]*height: 34rpx;[\s\S]*line-height: 34rpx;/);
    assert.match(wxss, /\.xf-program-settings-row \{[\s\S]*gap: 15rpx;[\s\S]*min-height: 98rpx;[\s\S]*padding: 0 30rpx;[\s\S]*border-bottom: 1rpx solid rgba\(15, 23, 42, 0\.07\);/);
    assert.doesNotMatch(wxss, /\.xf-program-search-panel/);
    assert.doesNotMatch(wxss, /\.xf-program-search-submit/);
    assert.doesNotMatch(wxss, /\.xf-program-search-field/);
    assert.doesNotMatch(wxss, /\.xf-program-search-main/);
    assert.doesNotMatch(wxss, /\.xf-program-search-field\.is-empty/);
    assert.doesNotMatch(wxss, /\.xf-program-search-input/);
    assert.doesNotMatch(wxss, /\.xf-program-search-placeholder/);
    assert.doesNotMatch(wxss, /\.xf-program-search-text/);
    assert.match(wxss, /linear-gradient\(45deg,[\s\S]*transparent 36rpx\)/);
    assert.match(wxss, /linear-gradient\(-45deg,[\s\S]*transparent 64rpx\)/);
    assert.equal(wxss.includes("25%, transparent 25%"), false);
    assert.equal(wxss.includes(".xf-program-view-switch"), false);
    assert.doesNotMatch(wxss, /\.xf-program-filter-toggle/);
    assert.match(wxss, /\.xf-program-view-toggle/);
    assert.match(wxss, /\.xf-program-view-toggle \{[\s\S]*width: 54rpx;[\s\S]*height: 54rpx;[\s\S]*border: 0;[\s\S]*border-radius: 999rpx;[\s\S]*background: #f3edff;/);
    assert.match(wxss, /\.xf-program-view-icon \{[\s\S]*display: block;[\s\S]*width: 40rpx;[\s\S]*height: 40rpx;/);
    assert.equal(wxss.includes(".xf-program-view-icon.is-compact"), false);
    assert.equal(wxss.includes(".xf-program-view-icon.is-feature"), false);
    assert.equal(wxss.includes(".xf-program-view-dot"), false);
    assert.equal(wxss.includes(".xf-program-view-card"), false);
    assert.equal(wxss.includes(".xf-program-view-card-thumb"), false);
    assert.equal(wxss.includes(".xf-program-view-feature-dot"), false);
    assert.equal(wxss.includes(".xf-program-view-line"), false);
    assert.equal(wxss.includes("border: 2rpx solid #d6c8f7"), false);
    assert.equal(wxss.includes("background: rgba(255, 255, 255, 0.72)"), false);
    assert.equal(wxss.includes(".xf-program-view-icon__large"), false);
    assert.equal(wxss.includes(".xf-program-view-icon__small"), false);
    assert.doesNotMatch(wxss, /is-guide-hidden/);
    assert.equal(wxss.includes(".xf-program-view-option"), false);
    assert.doesNotMatch(wxss, /\.xf-program-hero \{/);
    assert.match(wxss, /\.xf-program-cover \{[\s\S]*height: 244rpx;/);
    assert.match(wxss, /\.xf-program-page\.is-compact \.xf-program-card \{[\s\S]*display: flex;/);
    assert.match(wxss, /\.xf-program-page\.is-compact \.xf-program-cover-wrap \{[\s\S]*width: 184rpx;[\s\S]*height: 184rpx;/);
    assert.doesNotMatch(wxss, /\.xf-program-title-row \{/);
    assert.doesNotMatch(wxss, /\.xf-program-title-pill \{/);
    const programCardTitleStyle = wxss.match(/\.xf-program-card-title \{[\s\S]*?\n\}/)?.[0] || "";
    assert.match(programCardTitleStyle, /font-weight: 500;/);
    assert.match(wxss, /\.xf-program-description \{[\s\S]*color: #6f665d;[\s\S]*font-weight: 400;/);
    assert.match(wxss, /\.xf-program-page\.xf-font-small \.xf-program-card-title \{[\s\S]*font-size: 36rpx;/);
    assert.match(wxss, /\.xf-program-page\.xf-font-small \.xf-program-description \{[\s\S]*font-size: 27rpx;/);
    assert.match(wxss, /\.xf-program-page\.xf-font-small \.xf-program-status-tag,[\s\S]*\.xf-program-page\.xf-font-small \.xf-program-tag \{[\s\S]*font-size: 22rpx;/);
    assert.match(wxss, /\.xf-program-page\.xf-font-large \.xf-program-card-title \{[\s\S]*font-size: 44rpx;/);
    assert.match(wxss, /\.xf-program-page\.xf-font-large \.xf-program-description \{[\s\S]*font-size: 33rpx;/);
    assert.match(wxss, /\.xf-program-page\.xf-font-large \.xf-program-status-tag,[\s\S]*\.xf-program-page\.xf-font-large \.xf-program-tag \{[\s\S]*font-size: 27rpx;/);
    assert.match(wxss, /\.xf-program-page\.xf-font-large \.xf-program-cover \{[\s\S]*height: 300rpx;[\s\S]*line-height: 300rpx;/);
    assert.match(wxss, /\.xf-program-page\.xf-font-large \.xf-program-description \{[\s\S]*-webkit-line-clamp: 4;/);
    assert.match(wxss, /\.xf-program-page\.xf-font-large \.xf-program-tags \{[\s\S]*flex-wrap: wrap;[\s\S]*overflow: visible;[\s\S]*white-space: normal;/);
    assert.match(wxss, /\.xf-program-page\.xf-font-small\.is-compact \.xf-program-card-title \{[\s\S]*font-size: 28rpx;/);
    assert.match(wxss, /\.xf-program-page\.xf-font-small\.is-compact \.xf-program-description \{[\s\S]*font-size: 22rpx;/);
    assert.match(wxss, /\.xf-program-page\.xf-font-small\.is-compact \.xf-program-status-tag \{[\s\S]*font-size: 17rpx;/);
    assert.match(wxss, /\.xf-program-page\.xf-font-small\.is-compact \.xf-program-tag \{[\s\S]*font-size: 19rpx;/);
    assert.doesNotMatch(wxss, /\.xf-program-page\.xf-font-large\.is-compact/);
    assert.match(wxss, /\.xf-program-status-tag \{[\s\S]*display: flex;[\s\S]*align-items: center;[\s\S]*height: 42rpx;[\s\S]*border: 2rpx solid #b7f0ce;[\s\S]*background: #dcfce7;[\s\S]*color: #16985b;/);
    assert.match(wxss, /\.xf-program-status-tag \{[\s\S]*font-weight: 400;/);
    assert.match(wxss, /\.xf-program-status-tag\.group-only \{[\s\S]*border-color: #fed7aa;[\s\S]*background: #fff7ed;[\s\S]*color: #ea580c;/);
    assert.match(wxss, /\.xf-program-page\.is-compact \.xf-program-status-tag \{[\s\S]*font-size: 18rpx;/);
    assert.match(wxss, /\.xf-program-tags \{[\s\S]*align-items: center;[\s\S]*flex-wrap: nowrap;[\s\S]*min-height: 42rpx;[\s\S]*overflow: hidden;[\s\S]*white-space: nowrap;/);
    const programTagStyle = wxss.match(/\.xf-program-tag \{[\s\S]*?\n\}/)?.[0] || "";
    assert.match(programTagStyle, /display: flex;/);
    assert.match(programTagStyle, /align-items: center;/);
    assert.match(programTagStyle, /height: 42rpx;/);
    assert.doesNotMatch(programTagStyle, /border:/);
    assert.doesNotMatch(programTagStyle, /background:/);
    assert.doesNotMatch(programTagStyle, /border-radius:/);
    assert.match(programTagStyle, /padding: 0;/);
    assert.match(programTagStyle, /font-weight: 400;/);
    assert.doesNotMatch(wxss, /\.xf-program-cover-pill \{/);
    assert.doesNotMatch(wxss, /\.xf-program-status-row \{/);
    assert.doesNotMatch(wxss, /\.xf-program-meta \{/);
    assert.match(wxss, /\.xf-program-card/);
    assert.match(wxss, /min-height: 100vh/);
    assert.match(wxss, /padding: 52rpx 34rpx 0;/);

    definition.onLoad.call(context);
    await Promise.resolve();
    const requestUrl = new URL(requests[0].url);
    assert.equal(requestUrl.pathname, "/api/programs");
    assert.equal(requestUrl.searchParams.get("page"), "1");
    assert.equal(requestUrl.searchParams.get("pageSize"), "20");
    assert.equal(context.data.programs[0].title, "家长先疯｜原生首屏节目，中年知己嘉宾来做客");
    assert.equal(context.data.programs[0].path, "/programs/ep-1");
    assert.equal(context.data.programs[0].coverImage, "https://xianfeng.xinzhi.info/uploads/program.jpg");
    assert.equal(context.data.programs[0].description, "给小程序首屏展示的摘要，内容里提到中年知己但归属仍是家长先疯");
    assert.equal(context.data.programs[0].date, "2026/6/1");
    assert.equal(context.data.programs[0].statusLabel, "公开发布");
    assert.equal(context.data.programs[0].showLabel, "家长先疯");
    assert.equal(context.data.programs[0].showTone, "xianfeng");
    assert.equal(context.data.programs[1].statusLabel, "群友特供");
    assert.equal(context.data.programs[1].showLabel, "中年知己");
    assert.equal(context.data.programs[1].showTone, "zhiji");
    assert.deepEqual(context.data.programs[0].displayTags, ["#升学", "#亲子", "#小学写作"]);
    assert.equal(context.data.allPrograms[0].title, "家长先疯｜原生首屏节目，中年知己嘉宾来做客");
    assert.equal(context.data.allPrograms.length, 2);
    assert.equal(Object.hasOwn(context.data, "programSearchQuery"), false);
    await definition.onProgramTagTap.call(context, { currentTarget: { dataset: { tag: "#升学" } } });
    assert.equal(context.data.activeProgramTag, "#升学");
    assert.deepEqual(context.data.activeProgramTags, ["#升学"]);
    assert.equal(context.data.activeProgramTagLabel, "升学");
    assert.equal(context.data.programs.length, 1);
    assert.equal(context.data.programs[0].id, "p1");
    await definition.openFilterDrawer.call(context);
    assert.equal(context.data.filterDrawerOpen, true);
    assert.equal(context.data.filterSourceLoaded, true);
    assert.equal(context.data.allFilterPrograms.length, 3);
    const filterRequest = requests.find((item) => new URL(item.url, "https://mp.local").searchParams.get("pageSize") === "100");
    assert.ok(filterRequest);
    const filterRequestUrl = new URL(filterRequest.url, "https://mp.local");
    assert.equal(filterRequestUrl.pathname, "/api/programs");
    assert.equal(filterRequestUrl.searchParams.get("page"), "1");
    assert.equal(filterRequestUrl.searchParams.get("pageSize"), "100");
    assert.deepEqual(context.data.draftProgramTags, ["#升学"]);
    assert.equal(context.data.programFilterPreviewCount, 1);
    definition.onDrawerProgramShowTap.call(context, { currentTarget: { dataset: { show: "zhiji" } } });
    assert.equal(context.data.draftProgramShow, "zhiji");
    assert.equal(context.data.isProgramShowAllSelected, false);
    assert.equal(context.data.programFilterPreviewCount, 0);
    definition.onDrawerProgramTagTap.call(context, { currentTarget: { dataset: { tag: "#升学" } } });
    assert.deepEqual(context.data.draftProgramTags, []);
    definition.onDrawerProgramStatusTap.call(context, { currentTarget: { dataset: { status: "group-only" } } });
    assert.equal(context.data.draftProgramStatus, "group-only");
    assert.equal(context.data.isProgramStatusAllSelected, false);
    assert.equal(context.data.programFilterPreviewCount, 2);
    definition.applyProgramFilterDraft.call(context);
    await Promise.resolve();
    assert.equal(context.data.filterDrawerOpen, false);
    assert.equal(context.data.activeProgramShow, "zhiji");
    assert.equal(context.data.activeProgramStatus, "group-only");
    assert.equal(context.data.activeProgramTagLabel, "节目：中年知己、范围：群友特供");
    assert.equal(context.data.programs.length, 2);
    assert.equal(context.data.programs[0].id, "p2");
    assert.equal(context.data.programs[1].id, "p3");
    definition.openFilterDrawer.call(context);
    definition.resetProgramShowDraft.call(context);
    assert.equal(context.data.draftProgramShow, "");
    assert.equal(context.data.isProgramShowAllSelected, true);
    definition.resetProgramStatusDraft.call(context);
    assert.equal(context.data.draftProgramStatus, "");
    assert.equal(context.data.isProgramStatusAllSelected, true);
    definition.onDrawerProgramTagTap.call(context, { currentTarget: { dataset: { tag: "#群友" } } });
    assert.deepEqual(context.data.draftProgramTags, ["#群友"]);
    assert.equal(context.data.programFilterPreviewCount, 2);
    assert.equal(context.data.programFilterTags.some((item) => item.value === "#群友" && item.selected), true);
    definition.applyProgramFilterDraft.call(context);
    await Promise.resolve();
    assert.equal(context.data.filterDrawerOpen, false);
    assert.deepEqual(context.data.activeProgramTags, ["#群友"]);
    assert.equal(context.data.activeProgramTagLabel, "群友");
    assert.equal(context.data.programs.length, 2);
    definition.openFilterDrawer.call(context);
    definition.resetProgramFilterDraft.call(context);
    assert.deepEqual(context.data.draftProgramTags, []);
    assert.equal(context.data.isProgramFilterAllSelected, true);
    assert.equal(context.data.programFilterPreviewCount, 3);
    definition.clearProgramTagFilter.call(context);
    assert.equal(context.data.activeProgramTag, "");
    assert.deepEqual(context.data.activeProgramTags, []);
    assert.equal(context.data.activeProgramTagLabel, "");
    assert.equal(context.data.programs.length, 3);
    assert.equal(context.data.topbarHeight, 72);
    assert.equal(context.data.chromeHeight, 72);
    assert.equal(context.data.searchPanelHeight, 57);
    assert.equal(context.data.topCardGapHeight, 12);
    assert.equal(context.data.logoTop, 10);
    assert.equal(context.data.logoHeight, 28);
    assert.equal(context.data.contentTop, undefined);
    assert.equal(context.data.compactMode, true);
    assert.equal(context.data.settingsPanelOpen, false);
    assert.equal(storage.has("xf_native_programs_cache_v2"), true);

    definition.onReady.call(context);
    assert.deepEqual(pageScrolls.at(-1), { scrollTop: 45, duration: 0 });

    definition.switchProgramViewMode.call(context);
    assert.equal(context.data.compactMode, false);
    assert.equal(storage.get("xf_native_programs_view_mode"), "feature");

    definition.switchProgramViewMode.call(context);
    assert.equal(context.data.compactMode, true);
    assert.equal(storage.get("xf_native_programs_view_mode"), "compact");

    storage.set("xf_profile_font_size", "large");
    storage.set("xf_native_programs_view_mode", "compact");
    context.data.fontSizeClass = "xf-font-large";
    definition.loadPreferredViewMode.call(context);
    assert.equal(context.data.compactMode, false);
    assert.equal(storage.get("xf_native_programs_view_mode"), "feature");

    definition.switchProgramViewMode.call(context);
    assert.equal(context.data.compactMode, false);
    assert.equal(storage.get("xf_native_programs_view_mode"), "feature");

    definition.openSearch.call(context);
    const searchNavigation = navigations.find((item) => String(item.url || "").startsWith("/pages/search/index"));
    assert.ok(searchNavigation);
    const searchOpened = new URL(searchNavigation.url, "https://mp.local");
    assert.equal(searchOpened.pathname, "/pages/search/index");
    assert.equal(searchOpened.searchParams.has("q"), false);

    definition.openSettings.call(context);
    assert.equal(context.data.settingsPanelOpen, true);
    assert.equal(tabBarData.hidden, true);

    storage.set("xf_token", "mini-token");
    storage.set("xf_user", { name: "夏老师" });
    definition.openSettings.call(context);
    assert.equal(context.data.accountTitle, "夏老师");
    assert.equal(context.data.accountSubtitle, "查看和管理个人资料");
    assert.equal(context.data.accountPage, "/pages/mine/index");
    assert.equal(tabBarData.hidden, true);

    definition.closeSettings.call(context);
    assert.equal(context.data.settingsPanelOpen, false);
    assert.equal(tabBarData.hidden, false);

    definition.openSettings.call(context);
    definition.openSettingsItem.call(context, {
      currentTarget: { dataset: { page: "/pages/mine/settings/index", title: "设置" } }
    });
    assert.equal(context.data.settingsPanelOpen, false);
    assert.equal(tabBarData.hidden, false);
    assert.equal(navigations[1].url, "/pages/mine/settings/index");

    definition.openProgram.call(context, {
      currentTarget: { dataset: { index: 0 } }
    });
    const opened = new URL(
      decodeURIComponent(navigations[2].url.match(/url=([^&]+)/)[1])
    );
    assert.equal(opened.pathname, "/programs/ep-1");
    assert.equal(opened.searchParams.get("xf_mp"), "1");
  } finally {
    global.wx = originalWx;
    global.getCurrentPages = originalGetCurrentPages;
  }
});

test("pro page renders native subscription content instead of a web-view wrapper", async () => {
  const { js, json, wxml, wxss } = readPage("pro");
  const definition = loadPageDefinition("pro");
  const requests = [];
  const createdOrders = [];
  const syncedOrders = [];
  const virtualPaymentRequests = [];
  let billingMeActive = false;
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;

  try {
    global.setTimeout = ((callback) => {
      callback();
      return 0;
    });
    global.wx = {
      getStorageSync() {
        return "";
      },
      setStorageSync() {},
      login(options) {
        options.success({ code: "wx-login-code" });
      },
      request(options) {
        requests.push(options);
        if (options.url.endsWith("/api/billing/plans")) {
          options.success({
            statusCode: 200,
            data: {
              plans: {
                free: { id: "free", name: "Free", amountYuan: "0.00", description: "免费账户每天登录可获取10点，每月上限30点", pointsPerCycle: 10 },
                plus: { id: "plus", name: "Plus", amountYuan: "19.90", description: "Plus 兑换 200 点，用完可继续补充。", pointsPerCycle: 200 },
                pro: { id: "pro", name: "Pro", amountYuan: "99.00", description: "Pro 兑换 1,200 点，适合长期使用。", pointsPerCycle: 1200 }
              },
              usagePolicy: [
                { featureKey: "xiaowanzi", name: "小玩子对话", cost: 2, description: "每发送 1 次小玩子 AI 对话扣 2 点。" },
                { featureKey: "xiaowanzi_file", name: "小玩子图片文件处理", cost: 10, description: "每处理 1 张小玩子图片或文件扣 10 点。" }
              ]
            }
          });
          return;
        }
        if (options.url.endsWith("/api/billing/me")) {
          options.success({
            statusCode: 200,
            data: {
              membership: {
                proPointBalance: billingMeActive ? 428 : 42,
                proStatus: billingMeActive ? "active" : "none",
                proPlan: billingMeActive ? "plus" : "",
                membershipTier: billingMeActive ? "plus" : "free",
                membershipLabel: billingMeActive ? "Plus" : "Free",
                proExpiresAt: billingMeActive ? "2026-09-06T06:38:41.000Z" : null,
                proRefundEligibleUntil: null,
                isProActive: billingMeActive,
                canRefundLatestOrder: billingMeActive
              },
              latestOrder: billingMeActive ? { id: "order-plus-1", plan: "plus", status: "paid" } : null,
              latestRefundableOrder: billingMeActive ? { id: "order-plus-1", plan: "plus", status: "paid" } : null,
              paymentOrders: billingMeActive
                ? [
                  { id: "order-plus-2", plan: "plus", amountYuan: "19.90", paidAtText: "2026-07-12 12:44", statusLabel: "已支付", refundStatusLabel: "可申请退款", canRefund: true, refundablePoints: 200, refundableAmountYuan: "19.90" },
                  { id: "order-plus-1", plan: "plus", amountYuan: "19.90", paidAtText: "2026-07-12 12:42", statusLabel: "已支付", refundStatusLabel: "已退款", canRefund: false, refundablePoints: 0, refundableAmountYuan: "0.00" }
                ]
                : []
            }
          });
          return;
        }
        if (options.url.endsWith("/api/billing/virtual-orders")) {
          createdOrders.push(options.data);
          options.success({
            statusCode: 201,
            data: {
              order: { id: "order-1", plan: options.data.productId, status: "pending" },
              checkout: {
                paymentChannel: "wechat_virtual",
                paymentParams: {
                  mode: "short_series_goods",
                  signData: "{\"offerId\":\"offer-test\"}",
                  paySig: "pay-sig",
                  signature: "session-signature"
                }
              }
            }
          });
          return;
        }
        if (options.url.endsWith("/api/billing/virtual-orders/order-1/sync")) {
          syncedOrders.push(options.url);
          billingMeActive = true;
          options.success({
            statusCode: 200,
            data: {
              order: { id: "order-1", plan: "plus", status: "paid" },
              membership: {
                proPointBalance: 428,
                proStatus: "active",
                proPlan: "plus",
                membershipTier: "plus",
                membershipLabel: "Plus",
                proExpiresAt: "2026-09-06T06:38:41.000Z",
                isProActive: true,
                canRefundLatestOrder: true
              }
            }
          });
          return;
        }
        options.fail({ errMsg: "unexpected request" });
      },
      requestVirtualPayment(options) {
        virtualPaymentRequests.push(options);
        options.success({ errMsg: "requestVirtualPayment:ok" });
      },
      showToast() {}
    };

    assert.equal(json.navigationStyle, "custom");
    assert.equal(wxml.includes("<web-view"), false);
    assert.match(wxml, /class="xf-pro-page \{\{fontSizeClass\}\}" style="padding-top: \{\{chromeHeight\}\}px;"/);
    assert.match(wxml, /class="xf-native-topbar" style="height: \{\{topbarHeight\}\}px;"/);
    assert.match(wxml, /class="xf-native-menu-button xf-native-back-button" style="top: \{\{backTop\}\}px; width: \{\{backSize\}\}px; height: \{\{backSize\}\}px;" catchtap="goBack" role="button" aria-label="返回"/);
    assert.match(wxml, /class="xf-native-back-icon" aria-hidden="true"/);
    assert.doesNotMatch(wxml, /wx:else class="xf-native-menu-button" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;" catchtap="openSettings" role="button" aria-label="打开设置"/);
    assert.match(wxml, /class="xf-native-logo" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;" src="\/assets\/nav\/logo\.png" mode="aspectFit" bindtap="goProgramsHome" aria-label="回到顶部"/);
    assert.doesNotMatch(wxml, /xf-pro-logo-badge/);
    assert.match(wxml, /class="xf-native-settings-avatar-wrap"[\s\S]*class="xf-native-settings-avatar" src="\{\{accountAvatar\}\}" mode="aspectFill"[\s\S]*class="xf-native-settings-title-row"[\s\S]*class="xf-native-settings-title">\{\{accountTitle\}\}[\s\S]*class="xf-native-settings-subtitle-row"[\s\S]*class="xf-native-settings-subtitle">\{\{accountSubtitle\}\}/);
    assert.match(wxml, /class="xf-native-settings-label">\{\{item\.title\}\}<\/text>\s*<text wx:if="\{\{item\.key === 'pro' && settingsMemberBadgeLabel\}\}" class="xf-native-settings-member-badge">\{\{settingsMemberBadgeLabel\}\}<\/text>\s*<text class="xf-native-settings-chevron">›<\/text>/);
    assert.doesNotMatch(wxss, /\.xf-native-settings-member-badge \{/);
    assert.match(wxml, /wx:if="\{\{settingsPanelOpen\}\}" class="xf-native-settings-mask" style="height: \{\{settingsPanelHeight\}\}px;" catchtap="closeSettings"/);
    assert.doesNotMatch(wxml, /xf-native-search-panel|xf-pro-topbar|xf-pro-back/);
    assert.match(js, /const \{ getNativeTopbarMetrics \} = require\("\.\.\/\.\.\/utils\/nativeChrome"\)/);
    assert.match(js, /const \{ SETTINGS_SECTIONS, createNativeSettingsMethods \} = require\("\.\.\/\.\.\/utils\/nativeSettings"\)/);
    assert.match(js, /const LOGO_HEIGHT_RPX = 56/);
    assert.match(js, /settingsSections: SETTINGS_SECTIONS/);
    assert.match(js, /wx\.login/);
    assert.match(js, /wx\.requestVirtualPayment/);
    assert.match(js, /\/api\/billing\/virtual-orders/);
    assert.doesNotMatch(js, /wx\.requestPayment/);
    assert.match(js, /launchedFromSettings: false/);
    assert.match(js, /backTop: 8/);
    assert.match(js, /backSize: 32/);
    assert.match(js, /chromeHeight: 88/);
    assert.match(js, /syncTopbarMetrics\(\)/);
    assert.match(js, /\.\.\.createNativeSettingsMethods\(\)/);
    assert.match(js, /smartBackHome/);
    assert.match(js, /goBack\(\)\s*\{[\s\S]*smartBackHome\(\);[\s\S]*\}/);
    assert.match(js, /goProgramsHome: navigateProgramsHome/);
    assert.match(js, /goProgramsHome\(\)\s*\{[\s\S]*navigateProgramsHome\(\);[\s\S]*\}/);
    assert.match(wxml, /选择套餐/);
    assert.match(wxml, /订阅中/);
    assert.doesNotMatch(wxml, /订阅已完成/);
    assert.match(wxml, /继续补充点数/);
    assert.doesNotMatch(wxml, /bindtap="requestRefund"/);
    assert.match(wxml, /付款记录/);
    assert.match(wxml, /wx:for="\{\{paymentOrders\}\}"/);
    assert.match(wxml, /<view class="xf-pro-status-card">[\s\S]*<text class="xf-pro-section-title">订阅状态<\/text>[\s\S]*<text class="xf-pro-section-title is-sub">付款记录<\/text>[\s\S]*wx:for="\{\{paymentOrders\}\}"[\s\S]*<\/view>\s*<\/view>\s*<view class="xf-pro-pay-dock">/);
    assert.doesNotMatch(wxml, /<view wx:if="\{\{paymentOrders\.length\}\}" class="xf-pro-status-card">/);
    assert.match(wxml, /item\.refundStatusLabel/);
    assert.match(wxml, /虚拟支付订单不支持退款/);
    assert.doesNotMatch(wxml, /申请退款|退款入口|item\.externalRefundGuide|bindtap="showExternalRefundGuide"/);
    assert.doesNotMatch(wxml, /data-order-id="\{\{item\.id\}\}"/);
    assert.doesNotMatch(wxml, /退款按未使用点数折算|若无剩余有效套餐/);
    assert.doesNotMatch(wxml, /membership && membership\.canRefundLatestOrder && latestRefundableOrder && latestRefundableOrder\.status === 'paid'/);
    assert.doesNotMatch(wxml, /item\.canRefund/);
    assert.match(wxml, /当前可用点数/);
    assert.match(wxml, /wx:for="\{\{planCards\}\}"/);
    assert.match(wxml, /bindtap="selectPlan"/);
    assert.match(wxml, /class="xf-pro-pay-dock"[\s\S]*wx:if="\{\{!isLoggedIn\}\}" class="xf-pro-pay-button" open-type="getPhoneNumber" bindgetphonenumber="loginForSubscription"[\s\S]*wx:else class="xf-pro-pay-button" bindtap="createOrder" disabled="\{\{ordering \|\| loading\}\}"[\s\S]*立即订阅/);
    assert.match(wxml, /wx:for="\{\{usagePolicy\}\}"/);
    assert.match(wxml, /订阅状态/);
    assert.match(wxml, /xf-pro-primary-card[\s\S]*xf-pro-policy-card[\s\S]*xf-pro-status-card/);
    assert.doesNotMatch(wxml, /xf-pro-feature-grid/);
    assert.match(wxss, /@import "\.\.\/\.\.\/styles\/native-list\.wxss";/);
    assert.match(wxss, /background-color: #f6f7fb/);
    assert.doesNotMatch(wxss, /\.xf-pro-topbar|\.xf-pro-back|\.xf-pro-logo\s*\{/);
    assert.match(wxss, /\.xf-pro-plan-card\.is-selected \{[\s\S]*background: #6c27d6;/);
    assert.match(wxss, /\.xf-pro-main\.is-complete \{[\s\S]*padding-bottom: 200rpx;/);
    assert.match(wxss, /\.xf-pro-complete-hero \{[\s\S]*background: #0b0f19;[\s\S]*color: #f8d375;/);
    assert.match(wxss, /\.xf-pro-complete-title \{[\s\S]*color: #f8d375;/);
    assert.match(wxss, /\.xf-pro-complete-copy \{[\s\S]*color: rgba\(248, 211, 117, 0\.82\);/);
    assert.match(wxss, /\.xf-pro-plan-list\.is-topup \{[\s\S]*margin-top: 16rpx;/);
    assert.doesNotMatch(wxss, /\.xf-pro-refund-button/);
    assert.match(wxss, /\.xf-pro-pay-dock \{[\s\S]*position: fixed;[\s\S]*bottom: 0;[\s\S]*padding: 18rpx 52rpx calc\(18rpx \+ env\(safe-area-inset-bottom\)\);/);
    assert.match(wxss, /\.xf-pro-main \{[\s\S]*padding: 22rpx 24rpx 200rpx;/);
    assert.match(js, /request\(\{ url: "\/api\/billing\/plans" \}\)/);
    assert.match(js, /request\(\{ url: "\/api\/billing\/me" \}\)/);
    assert.match(js, /request\(\{[\s\S]*method: "POST",[\s\S]*url: "\/api\/billing\/virtual-orders"/);
    assert.doesNotMatch(js, /url: "\/api\/billing\/refunds"/);
    assert.match(js, /paymentOrders/);
    assert.doesNotMatch(js, /const refundOrder = this\.data\.latestRefundableOrder \|\| this\.data\.latestOrder/);
    assert.doesNotMatch(js, /requestRefund\(event\)|response && response\.refund|微信处理中，处理完成后积分会自动扣回|externalRefundGuide|showExternalRefundGuide|reportaproblem\.apple\.com/);
    assert.match(js, /selectedPlan: "pro"/);
    assert.match(js, /formatYuan/);
    assert.match(js, /formatPoints/);
    assert.match(js, /membershipBadgeLabel/);
    assert.match(js, /USAGE_POLICY_OVERRIDES/);
    assert.match(js, /featureKey: "education_planning", name: "智能教育规划", cost: 5/);
    assert.match(js, /featureKey: "xiaowanzi_file", name: "小玩子图片文件处理", cost: 1/);
    assert.doesNotMatch(js, /name: "兼容 AI 聊天"/);

    await definition.onLoad.call(context);
    assert.equal(context.data.launchedFromSettings, false);
    assert.equal(context.data.planCards.length, 3);
    assert.equal(context.data.planCards[2].id, "pro");
    assert.equal(context.data.planCards[2].selected, true);
    assert.equal(context.data.pointsText, "42 点");
    assert.equal(context.data.statusLabel, "未开通订阅");
    assert.equal(context.data.memberBadgeLabel, "");
    assert.equal(context.data.usagePolicy[0].name, "小玩子对话");
    assert.equal(context.data.usagePolicy.some((item) => item.featureKey === "xiaowanzi" && item.costText === "1 点/次" && item.description.includes("扣 1 点")), true);
    assert.equal(context.data.usagePolicy.some((item) => item.featureKey === "xiaowanzi_file" && item.costText === "1 点/次"), true);
    assert.equal(context.data.usagePolicy.some((item) => item.featureKey === "education_planning" && item.name === "智能教育规划"), true);
    assert.equal(context.data.usagePolicy.some((item) => item.featureKey === "ai_chat"), false);
    assert.equal(context.data.topbarHeight, 72);
    assert.equal(context.data.chromeHeight, 72);
    assert.equal(context.data.logoTop, 10);
    assert.equal(context.data.logoHeight, 28);
    assert.equal(context.data.settingsPanelOpen, false);

    billingMeActive = true;
    await definition.onShow.call(context);
    assert.equal(context.data.statusLabel, "Plus 会员");
    assert.equal(context.data.memberBadgeLabel, "Plus");
    assert.equal(context.data.pointsText, "428 点");
    assert.equal(context.data.latestOrder.status, "paid");
    assert.equal(context.data.paymentOrders.length, 2);
    assert.equal(context.data.paymentOrders[0].id, "order-plus-2");

    await definition.onLoad.call(context, { from: "settings" });
    assert.equal(context.data.launchedFromSettings, true);

    context.setData({
      selectedPlan: "",
      planCards: context.data.planCards.map((card) => ({ ...card, selected: card.id === "pro" }))
    });
    billingMeActive = false;

    await definition.createOrder.call(context);
    assert.deepEqual(createdOrders, [{ productId: "pro", quantity: 1, loginCode: "wx-login-code" }]);
    assert.equal(virtualPaymentRequests.length, 1);
    assert.equal(syncedOrders.length, 1);
    assert.match(syncedOrders[0], /\/api\/billing\/virtual-orders\/order-1\/sync$/);
    assert.deepEqual(
      Object.fromEntries(Object.entries(virtualPaymentRequests[0]).filter(([key]) => key !== "success" && key !== "fail")),
      {
        mode: "short_series_goods",
        signData: "{\"offerId\":\"offer-test\"}",
        paySig: "pay-sig",
        signature: "session-signature"
      }
    );

    definition.selectPlan.call(context, { currentTarget: { dataset: { plan: "plus" } } });
    assert.equal(context.data.selectedPlan, "plus");
    assert.equal(context.data.planCards[1].selected, true);

    await definition.createOrder.call(context);
    assert.deepEqual(createdOrders, [
      { productId: "pro", quantity: 1, loginCode: "wx-login-code" },
      { productId: "plus", quantity: 1, loginCode: "wx-login-code" }
    ]);
    assert.equal(virtualPaymentRequests.length, 2);
    assert.equal(virtualPaymentRequests[1].signData, "{\"offerId\":\"offer-test\"}");
    assert.match(context.data.message, /订阅权益已生效/);
  } finally {
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
  }
});

test("pro page renders completion state without refund actions", async () => {
  const definition = loadPageDefinition("pro");
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  const originalWx = global.wx;
  let active = true;
  const refundRequests = [];
  const modalPrompts = [];

  function membershipPayload() {
    return {
      proPointBalance: active ? 1200 : 30,
      proStatus: active ? "active" : "refunded",
      proPlan: active ? "pro" : "",
      membershipTier: active ? "pro" : "free",
      membershipLabel: active ? "Pro" : "Free",
      proExpiresAt: active ? "2026-08-06T00:00:00.000Z" : null,
      proRefundEligibleUntil: active ? "2026-07-09T00:00:00.000Z" : null,
      isProActive: active,
      canRefundLatestOrder: active
    };
  }

  try {
    global.wx = {
      getStorageSync() {
        return "";
      },
      setStorageSync() {},
      showModal(options) {
        modalPrompts.push(options);
        options.success({ confirm: true });
      },
      request(options) {
        if (options.url.endsWith("/api/billing/plans")) {
          options.success({
            statusCode: 200,
            data: {
              plans: {
                free: { id: "free", name: "Free", amountYuan: "0.00", description: "免费账户每天登录可获取10点，每月上限30点", pointsPerCycle: 10 },
                plus: { id: "plus", name: "Plus", amountYuan: "19.90", description: "Plus 兑换 200 点，用完可继续补充。", pointsPerCycle: 200 },
                pro: { id: "pro", name: "Pro", amountYuan: "99.00", description: "Pro 兑换 1,200 点，适合长期使用。", pointsPerCycle: 1200 }
              },
              usagePolicy: []
            }
          });
          return;
        }
        if (options.url.endsWith("/api/billing/me")) {
          options.success({
            statusCode: 200,
            data: {
              membership: membershipPayload(),
              latestOrder: { id: "order-pro-2", plan: "pro", status: "refunded" },
              latestRefundableOrder: active ? { id: "order-pro-1", plan: "pro", status: "paid" } : null
            }
          });
          return;
        }
        if (options.url.endsWith("/api/billing/refunds")) {
          refundRequests.push(options.data);
          options.fail({ errMsg: "refund endpoint should not be called" });
          return;
        }
        options.fail({ errMsg: "unexpected request" });
      },
      showToast() {}
    };

    await definition.onLoad.call(context);

    assert.equal(context.data.memberBadgeLabel, "Pro");
    assert.equal(context.data.statusLabel, "Pro 会员");
    assert.equal(context.data.pointsText, "1200 点");
    assert.equal(context.data.latestOrder.status, "refunded");
    assert.equal(context.data.latestRefundableOrder.status, "paid");

    assert.equal(definition.requestRefund, undefined);
    assert.deepEqual(modalPrompts, []);
    assert.deepEqual(refundRequests, []);
    assert.equal(context.data.membership.isProActive, true);
    assert.equal(context.data.latestOrder.status, "refunded");
    assert.equal(context.data.latestRefundableOrder.status, "paid");
  } finally {
    global.wx = originalWx;
  }
});

test("pro page waits for WeChat notify before showing paid membership", async () => {
  const definition = loadPageDefinition("pro");
  const requests = [];
  const syncRequests = [];
  const virtualPaymentRequests = [];
  let billingMeCount = 0;
  const context = {
    ...definition,
    data: { ...definition.data, selectedPlan: "plus", planCards: definition.data.planCards.map((card) => ({ ...card, selected: card.id === "plus" })) },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  const originalWx = global.wx;
  const originalSetTimeout = global.setTimeout;

  try {
    global.setTimeout = ((callback) => {
      callback();
      return 0;
    });
    global.wx = {
      getStorageSync() {
        return "";
      },
      setStorageSync() {},
      login(options) {
        options.success({ code: "wx-login-code" });
      },
      request(options) {
        requests.push(options.url);
        if (options.url.endsWith("/api/billing/plans")) {
          options.success({ statusCode: 200, data: { plans: {}, usagePolicy: [] } });
          return;
        }
        if (options.url.endsWith("/api/billing/me")) {
          billingMeCount += 1;
          const active = billingMeCount >= 3;
          options.success({
            statusCode: 200,
            data: {
              membership: active
                ? {
                  proPointBalance: 200,
                  proStatus: "active",
                  proPlan: "plus",
                  membershipTier: "plus",
                  membershipLabel: "Plus",
                  proExpiresAt: "2026-08-06T00:00:00.000Z",
                  isProActive: true,
                  canRefundLatestOrder: true
                }
                : {
                  proPointBalance: 30,
                  proStatus: "none",
                  proPlan: "",
                  membershipTier: "free",
                  membershipLabel: "Free",
                  proExpiresAt: null,
                  isProActive: false,
                  canRefundLatestOrder: false
                },
              latestOrder: active
                ? { id: "order-1", plan: "plus", status: "paid" }
                : { id: "order-1", plan: "plus", status: "pending" }
            }
          });
          return;
        }
        if (options.url.endsWith("/api/billing/virtual-orders")) {
          options.success({
            statusCode: 201,
            data: {
              order: { id: "order-1", plan: "plus", status: "pending" },
              checkout: {
                paymentChannel: "wechat_virtual",
                paymentParams: {
                  mode: "short_series_goods",
                  signData: "{\"offerId\":\"offer-test\"}",
                  paySig: "pay-sig",
                  signature: "session-signature"
                }
              }
            }
          });
          return;
        }
        if (options.url.endsWith("/api/billing/virtual-orders/order-1/sync")) {
          syncRequests.push(options.url);
          options.success({
            statusCode: 200,
            data: {
              order: { id: "order-1", plan: "plus", status: "paid" },
              membership: {
                proPointBalance: 200,
                proStatus: "active",
                proPlan: "plus",
                membershipTier: "plus",
                membershipLabel: "Plus",
                proExpiresAt: "2026-08-06T00:00:00.000Z",
                isProActive: true,
                canRefundLatestOrder: true
              }
            }
          });
          return;
        }
        options.fail({ errMsg: "unexpected request" });
      },
      requestVirtualPayment(options) {
        virtualPaymentRequests.push(options);
        options.success({ errMsg: "requestVirtualPayment:ok" });
      },
      showToast() {}
    };

    await definition.onLoad.call(context);
    assert.equal(context.data.statusLabel, "未开通订阅");

    await definition.createOrder.call(context);

    assert.equal(virtualPaymentRequests.length, 1);
    assert.equal(syncRequests.length, 1);
    assert.match(syncRequests[0], /\/api\/billing\/virtual-orders\/order-1\/sync$/);
    assert.ok(billingMeCount >= 3);
    assert.equal(context.data.statusLabel, "Plus 会员");
    assert.equal(context.data.memberBadgeLabel, "Plus");
    assert.equal(context.data.latestOrder.status, "paid");
    assert.match(context.data.message, /订阅权益已生效/);
  } finally {
    global.wx = originalWx;
    global.setTimeout = originalSetTimeout;
  }
});

test("pro page payment request failures expose the attempted API url", async () => {
  const definition = loadPageDefinition("pro");
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  const originalWx = global.wx;

  try {
    global.wx = {
      getStorageSync() {
        return "";
      },
      setStorageSync() {},
      login(options) {
        options.success({ code: "wx-login-code" });
      },
      request(options) {
        options.fail({ errMsg: "request:fail" });
      },
      showToast() {}
    };

    await definition.createOrder.call(context);

    assert.match(context.data.message, /request:fail/);
    assert.match(context.data.message, /\/api\/billing\/virtual-orders/);
  } finally {
    global.wx = originalWx;
  }
});

test("pro page unauthenticated checkout uses WeChat phone login instead of an error message", async () => {
  const { wxml } = readPage("pro");
  const definition = loadPageDefinition("pro");
  const storage = new Map([
    ["xf_token", "expired-token"],
    ["xf_user", { mobile: "13500003069" }]
  ]);
  const context = {
    ...definition,
    data: { ...definition.data, isLoggedIn: true, hasMobile: true, maskedMobile: "135****3069" },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  const originalWx = global.wx;
  const requestedUrls = [];

  try {
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
      login(options) {
        options.success({ code: "wx-login-code" });
      },
      request(options) {
        requestedUrls.push(options.url);
        if (options.url.endsWith("/api/billing/virtual-orders")) {
          options.success({
            statusCode: 401,
            data: { message: "未登录或登录已过期" }
          });
          return;
        }
        options.fail({ errMsg: "unexpected request" });
      },
      showToast() {}
    };

    assert.match(wxml, /<button wx:if="\{\{!isLoggedIn\}\}" class="xf-pro-pay-button" open-type="getPhoneNumber" bindgetphonenumber="loginForSubscription"/);
    assert.match(wxml, /<button wx:else class="xf-pro-pay-button" bindtap="createOrder" disabled="\{\{ordering \|\| loading\}\}"/);

    await definition.createOrder.call(context);

    assert.equal(requestedUrls.some((url) => url.endsWith("/api/billing/virtual-orders")), true);
    assert.equal(context.data.ordering, false);
    assert.equal(context.data.isLoggedIn, false);
    assert.equal(context.data.hasMobile, false);
    assert.equal(context.data.maskedMobile, "未绑定");
    assert.equal(context.data.message, "");
  } finally {
    global.wx = originalWx;
  }
});

test("pro page unauthenticated checkout uses the WeChat phone login button instead of an error message", async () => {
  const { wxml } = readPage("pro");
  const definition = loadPageDefinition("pro");
  const context = {
    ...definition,
    data: { ...definition.data, isLoggedIn: true },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  const originalWx = global.wx;
  const storage = new Map([
    ["xf_token", "expired-token"],
    ["xf_user", { mobile: "13500003069" }]
  ]);

  try {
    assert.match(wxml, /class="xf-pro-pay-dock"[\s\S]*wx:if="\{\{!isLoggedIn\}\}"[\s\S]*bindgetphonenumber="loginForSubscription"/);
    assert.match(wxml, /class="xf-pro-pay-dock"[\s\S]*wx:else[\s\S]*bindtap="createOrder"/);

    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      removeStorageSync(key) {
        storage.delete(key);
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      login(options) {
        options.success({ code: "wx-login-code" });
      },
      request(options) {
        if (options.url.endsWith("/api/billing/virtual-orders")) {
          options.success({
            statusCode: 401,
            data: { message: "未登录或登录已过期" }
          });
          return;
        }
        options.fail({ errMsg: "unexpected request" });
      },
      showToast() {}
    };

    await definition.createOrder.call(context);

    assert.equal(context.data.ordering, false);
    assert.equal(context.data.isLoggedIn, false);
    assert.equal(context.data.message, "");
  } finally {
    global.wx = originalWx;
  }
});

test("mine shared half-panel profile entries switch in place", () => {
  const mineDefinition = loadPageDefinition("mine");
  const memoryDefinition = loadPageDefinition("mine/memory");
  const settingsDefinition = loadPageDefinition("mine/settings");
  const mine = readPage("mine");
  const memory = readPage("mine/memory");
  const settings = readPage("mine/settings");
  const sharedTemplate = fs.readFileSync(new URL("../templates/settings-profile-views.wxml", import.meta.url), "utf8");
  const navigations = [];
  const context = {
    ...mineDefinition,
    data: { ...mineDefinition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  const originalWx = global.wx;

  try {
    global.wx = {
      navigateTo(options) {
        navigations.push(options);
      },
      getStorageSync() {
        return "";
      },
      setStorageSync() {},
      removeStorageSync() {},
      showToast() {}
    };

    assert.match(mine.wxml, /settingsPanelView === 'menu'/);
    assert.match(mine.wxml, /settingsPanelView === 'archive'/);
    assert.match(mine.wxml, /settingsPanelView === 'memory'/);
    assert.match(mine.wxml, /settingsPanelView === 'memoryManager'/);
    assert.match(mine.wxml, /settingsPanelView === 'settings'/);
    assert.match(mine.wxml, /<import src="\.\.\/\.\.\/templates\/settings-profile-views\.wxml" \/>/);
    assert.match(mine.wxml, /is="xfSettingsArchivePanel"/);
    assert.match(mine.wxml, /is="xfSettingsMemoryPanel"/);
    assert.match(mine.wxml, /is="xfSettingsMemoryManagerPanel"/);
    assert.match(mine.wxml, /bindtap="returnSettingsMenu"/);
    assert.match(mine.wxml, /class="xf-profile-secondary xf-settings-logout" bindtap="logout"/);
    assert.match(sharedTemplate, /class="xf-profile-secondary xf-settings-logout" bindtap="logout"/);
    for (const label of ["档案管理", "今日洞察", "保存档案", "找小玩子", "个性化回答", "开启记忆功能", "管理记忆", "绑定手机", "字体大小", "清理缓存", "退出登录", "注销账户"]) {
      assert.match(`${mine.wxml}\n${sharedTemplate}`, new RegExp(label));
    }
    assert.doesNotMatch(mine.wxml, /xf-profile-web-panel|xf-profile-web-loading|<web-view/);
    assert.match(mine.wxss, /@import "\.\/profile-panel\.wxss";/);
    assert.match(mine.js, /settingsPanelView: "menu"/);
    assert.match(mine.js, /backSettingsMenu/);

    mineDefinition.applyInitialPanel.call(context, { panel: "settings" });
    assert.deepEqual(navigations, []);
    assert.equal(context.data.settingsPanelOpen, true);
    assert.equal(context.data.settingsPanelView, "settings");
    mineDefinition.backSettingsMenu.call(context);
    assert.equal(context.data.settingsPanelOpen, true);
    assert.equal(context.data.settingsPanelView, "menu");
    mineDefinition.closeSettings.call(context);
    assert.equal(context.data.settingsPanelOpen, false);
    assert.equal(context.data.settingsPanelView, "menu");

    assert.equal(memoryDefinition.data.title, "个性化回答");
    assert.equal(settingsDefinition.data.title, "设置");
    assert.match(
      memory.wxss,
      /\.xf-memory-copy\s*\{[^}]*font-size:\s*23rpx[^}]*font-weight:\s*500[^}]*color:\s*#9aa4b5/s,
      "standalone memory copy should be smaller, lighter, and grayer"
    );

    for (const [page, labels] of [
      [memory, ["开启记忆功能", "管理记忆"]],
      [settings, ["绑定手机", "字体大小", "清理缓存", "退出登录", "注销账户"]]
    ]) {
      assert.equal(page.json.navigationStyle, "custom");
      assert.equal(page.wxml.includes("<web-view"), false);
      assert.match(page.wxml, /class="xf-profile-shell/);
      assert.match(page.wxml, /class="xf-profile-scrim"/);
      assert.match(page.wxml, /class="xf-profile-panel/);
      assert.match(page.wxml, /class="xf-profile-header"/);
      assert.match(page.wxml, /class="xf-profile-back" bindtap="goBack"/);
      for (const label of labels) {
        assert.match(page.wxml, new RegExp(label));
      }
      assert.doesNotMatch(page.wxml, /xf-profile-web-panel|xf-profile-web-loading|material-symbols|<web-view/);
      assert.doesNotMatch(page.js, /loadProfilePanel|webUrl|getNativeWebviewParams|xf_panel|src:/);
      assert.match(page.wxss, /@import "\.\.\/profile-panel\.wxss";/);
    }

    assert.match(settings.wxml, /wx:if="\{\{isLoggedIn\}\}" class="xf-profile-secondary xf-settings-logout" bindtap="logout"/);
    assert.match(settings.wxml, /wx:else class="xf-profile-secondary xf-settings-login" open-type="getPhoneNumber" bindgetphonenumber="loginWithPhone"/);
    assert.match(settings.wxml, /<view class="xf-settings-bottom">\s*<button wx:if="\{\{isLoggedIn\}\}" class="xf-profile-danger xf-settings-danger" bindtap="deleteAccount"/);
    assert.match(settings.wxss, /\.xf-settings-bottom \{[\s\S]*margin-top: auto;[\s\S]*padding-top: 120rpx;[\s\S]*padding-bottom: 86rpx;/);
    assert.match(settings.js, /loginWithPhone\(event\)[\s\S]*selectComponent\("#settingsPhoneLoginGate"\)[\s\S]*gate\.loginWithPhone\(event\)/);
    assert.match(settings.js, /deleteAccountFromSettings\(this, \{ messageKey: "message" \}\)/);
  } finally {
    global.wx = originalWx;
  }
});

test("mine profile actions open native profile panel entries", () => {
  const { js, json, wxml, wxss } = readPage("mine");
  const nativeSettings = readNativeSettings();
  const definition = loadPageDefinition("mine");
  const navigations = [];
  const storage = new Map([
    ["xf_token", "token-1"],
    ["xf_user", { name: "夏老师", mobile: "13812345678", avatar_initial: "夏" }],
    ["xf_child_profiles", [
      { id: "child-1", displayName: "小圆子", relation: "女儿", birthDate: "2022/01/02", grade: "小学三年级", city: "上海", region: "徐汇区", concernTags: ["阅读", "专注力"] }
    ]]
  ]);
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const originalGetCurrentPages = global.getCurrentPages;

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      removeStorageSync(key) {
        storage.delete(key);
      },
      navigateTo(options) {
        navigations.push(options);
      },
      switchTab(options) {
        navigations.push(options);
      },
      showToast() {}
    };
    global.getApp = () => ({
      clearLoginSession() {
        storage.delete("xf_token");
        storage.delete("xf_user");
      }
    });
    global.getCurrentPages = () => [{ route: "pages/mine/settings/index" }, { route: "pages/mine/index" }];

    assert.equal(json.navigationStyle, "custom");
    assert.equal(wxml.includes("<web-view"), false);
    assert.match(wxml, /class="xf-mine-page \{\{fontSizeClass\}\}" style="padding-top: \{\{chromeHeight\}\}px;"/);
    assert.match(wxml, /class="xf-native-topbar" style="height: \{\{topbarHeight\}\}px;"/);
    assert.match(wxml, /class="xf-native-menu-button" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;" catchtap="openSettings" role="button" aria-label="打开设置"/);
    assert.match(wxml, /class="xf-native-logo" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;" src="\/assets\/nav\/logo\.png" mode="aspectFit" bindtap="goProgramsHome" aria-label="回到顶部"/);
    assert.match(wxml, /wx:if="\{\{settingsPanelOpen\}\}" class="xf-native-settings-mask xf-mine-settings-mask" style="height: \{\{settingsPanelHeight\}\}px;" catchtap="closeSettings"/);
    assert.match(wxml, /wx:if="\{\{settingsPanelView === 'menu'\}\}"/);
    assert.match(wxml, /wx:elif="\{\{settingsPanelView === 'archive'\}\}"/);
    assert.match(wxml, /wx:elif="\{\{settingsPanelView === 'memory'\}\}"/);
    assert.match(wxml, /wx:elif="\{\{settingsPanelView === 'settings'\}\}"/);
    assert.doesNotMatch(wxml, /xf-mine-topbar|xf-mine-back|个人中心/);
    assert.match(wxml, /quickActions/);
    assert.match(wxml, /class="xf-mine-login" open-type="getPhoneNumber" bindgetphonenumber="loginWithPhone"/);
    assert.doesNotMatch(wxml, /xf-mine-segments/);
    assert.doesNotMatch(wxml, /activePanel ===/);
    assert.doesNotMatch(wxml, /wx:for="\{\{children\}\}"/);
    assert.match(wxss, /background-color: #f6f7fb/);
    assert.match(wxss, /@import "\.\.\/\.\.\/styles\/native-list\.wxss";/);
    assert.doesNotMatch(wxss, /\.xf-mine-topbar|\.xf-mine-back/);
    assert.match(wxss, /\.xf-mine-profile-card/);
    assert.match(js, /buildProfileState/);
    assert.match(js, /openProfilePanel/);
    assert.match(js, /settingsPanelView: "menu"/);
    assert.match(js, /\.\.\.createNativeSettingsMethods\(\)/);
    assert.match(js, /goProgramsHome: navigateProgramsHome/);
    assert.doesNotMatch(js, /findXiaowanzi\(\) \{[\s\S]*wx\.switchTab\(\{ url: "\/pages\/xiaowanzi\/index" \}\);[\s\S]*\}/);
    assert.match(nativeSettings, /findXiaowanzi\(\) \{[\s\S]*rememberCurrentExternalPage\(\);[\s\S]*wx\.switchTab\(\{ url: "\/pages\/xiaowanzi\/index" \}\);[\s\S]*\}/);
    assert.doesNotMatch(js, /goBack\(\)/);
    assert.match(js, /goLogin/);
    assert.doesNotMatch(js, /activePanel/);
    assert.doesNotMatch(js, /wx\.navigateTo\(\{ url: "\/pages\/mine\/archive\/index" \}\)/);
    assert.doesNotMatch(js, /wx\.navigateTo\(\{ url: "\/pages\/mine\/memory\/index" \}\)/);
    assert.doesNotMatch(js, /wx\.navigateTo\(\{ url: "\/pages\/mine\/settings\/index" \}\)/);

    assert.equal(fs.existsSync(new URL("../utils/profileWebPanel.js", import.meta.url)), false);

    definition.onShow.call(context);
    assert.equal(context.data.isLoggedIn, true);
    assert.equal(context.data.displayName, "夏老师");
    assert.equal(context.data.maskedMobile, "138****5678");
    assert.equal(context.data.children.length, 1);
    assert.equal(context.data.children[0].title, "小圆子");
    assert.equal(context.data.children[0].subtitle, "女儿 · 小学三年级 · 上海 徐汇区");
    assert.deepEqual(context.data.stats.map((item) => item.value), ["1", "2", "已登录"]);
    assert.deepEqual(context.data.quickActions.map((item) => item.title), ["档案管理", "记忆", "设置"]);
    assert.deepEqual(context.data.quickActions.map((item) => item.image), [
      "/assets/menu/line-badge.png",
      "/assets/menu/line-psychology.png",
      "/assets/menu/line-settings.png"
    ]);

    definition.openArchive.call(context);
    assert.deepEqual(navigations, []);
    assert.equal(context.data.settingsPanelOpen, true);
    assert.equal(context.data.settingsPanelView, "archive");
    definition.openMemory.call(context);
    assert.deepEqual(navigations, []);
    assert.equal(context.data.settingsPanelView, "memory");
    definition.openProfileSettings.call(context);
    assert.deepEqual(navigations, []);
    assert.equal(context.data.settingsPanelView, "settings");

    context.data.isLoggedIn = false;
    definition.openMemory.call(context);
    assert.deepEqual(navigations, []);
    assert.equal(context.data.profilePanelMessage, "请点击登录并授权手机号");
    context.data.isLoggedIn = true;

    definition.applyInitialPanel.call(context, { panel: "archive" });
    assert.equal(context.data.settingsPanelOpen, true);
    assert.equal(context.data.settingsPanelView, "archive");
    assert.equal(context.data.archiveDraft.displayName, "小圆子");
    definition.applyInitialPanel.call(context, { panel: "archive", action: "add" });
    assert.equal(context.data.settingsPanelOpen, true);
    assert.equal(context.data.settingsPanelView, "archive");
    assert.equal(context.data.archiveChildren.length, 2);
    assert.equal(context.data.archiveDraft.displayName, "");
    assert.equal(context.data.archiveChildren[1].selected, true);
    definition.applyInitialPanel.call(context, { panel: "memory" });
    assert.equal(context.data.settingsPanelView, "memory");
    definition.applyInitialPanel.call(context, { panel: "settings" });
    assert.equal(context.data.settingsPanelView, "settings");

    definition.openSettingsItem.call(context, { currentTarget: { dataset: { sectionIndex: 0, itemIndex: 1 } } });
    assert.equal(context.data.settingsPanelOpen, true);
    assert.equal(context.data.settingsPanelView, "archive");
    definition.openSettingsItem.call(context, { currentTarget: { dataset: { sectionIndex: 4, itemIndex: 0 } } });
    assert.equal(context.data.settingsPanelView, "memory");
    definition.openSettingsItem.call(context, { currentTarget: { dataset: { sectionIndex: 5, itemIndex: 0 } } });
    assert.equal(context.data.settingsPanelView, "settings");
    assert.deepEqual(navigations, []);
    definition.findXiaowanzi.call(context);
    assert.deepEqual(storage.get("xf_xiaowanzi_return_target_v1"), { type: "navigateTo", url: "/pages/mine/index" });
    assert.deepEqual(navigations, [{ url: "/pages/xiaowanzi/index" }]);
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
    global.getCurrentPages = originalGetCurrentPages;
  }
});

test("mine quick actions match mobile web compact row rhythm without changing routes", () => {
  const { js, wxml, wxss } = readPage("mine");

  assert.match(wxml, /class="xf-mine-actions"/);
  assert.match(wxml, /wx:for="\{\{quickActions\}\}"[\s\S]*class="xf-mine-action"[\s\S]*data-key="\{\{item\.key\}\}"[\s\S]*bindtap="handleQuickAction"/);
  assert.match(wxml, /<image class="xf-mine-action-icon" src="\{\{item\.image\}\}" mode="aspectFit" \/>/);
  assert.doesNotMatch(wxml, /xf-mine-action-icon material-symbols-rounded/);
  assert.match(wxml, /class="xf-mine-action-title"/);
  assert.match(wxml, /class="xf-mine-action-subtitle"/);
  assert.match(wxml, /class="xf-mine-chevron" aria-hidden="true"/);

  assert.match(wxss, /\.xf-mine-actions \{[\s\S]*margin-top: 18rpx;[\s\S]*border-radius: 20rpx;[\s\S]*background: #ffffff;[\s\S]*border: 1rpx solid rgba\(15, 23, 42, 0\.06\);/);
  assert.doesNotMatch(wxss, /\.xf-mine-actions \{[\s\S]*box-shadow:/);
  assert.match(wxss, /\.xf-mine-action \{[\s\S]*min-height: 88rpx;[\s\S]*gap: 16rpx;[\s\S]*padding: 0 22rpx;/);
  assert.match(wxss, /\.xf-mine-action-icon \{[\s\S]*width: 40rpx;[\s\S]*height: 40rpx;[\s\S]*flex: 0 0 40rpx;/);
  assert.match(wxss, /\.xf-mine-action-main \{[\s\S]*min-width: 0;[\s\S]*display: flex;[\s\S]*flex-direction: column;/);
  assert.match(wxss, /\.xf-mine-action-title \{[\s\S]*font-size: 27rpx;[\s\S]*font-weight: 800;[\s\S]*overflow: hidden;[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/);
  assert.match(wxss, /\.xf-mine-action-subtitle \{[\s\S]*margin-top: 4rpx;[\s\S]*font-size: 22rpx;[\s\S]*color: #94a3b8;[\s\S]*overflow: hidden;[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/);
  assert.match(wxss, /\.xf-mine-chevron \{[\s\S]*width: 28rpx;[\s\S]*flex: 0 0 28rpx;[\s\S]*text-align: center;/);

  assert.match(js, /if \(key === "memory"\) \{[\s\S]*this\.openMemory\(\);[\s\S]*return;[\s\S]*\}[\s\S]*if \(key === "settings"\) \{[\s\S]*this\.openProfileSettings\(\);[\s\S]*return;[\s\S]*\}[\s\S]*this\.openArchive\(\);/);
  assert.match(js, /openArchive\(\) \{[\s\S]*this\.openProfilePanel\("archive"\);[\s\S]*\}/);
  assert.match(js, /openMemory\(\) \{[\s\S]*if \(!this\.data\.isLoggedIn\) \{[\s\S]*this\.goLogin\(\);[\s\S]*return;[\s\S]*\}[\s\S]*this\.openProfilePanel\("memory"\);[\s\S]*\}/);
  assert.match(js, /openProfileSettings\(\) \{[\s\S]*this\.openProfilePanel\("settings"\);[\s\S]*\}/);
});

test("mine hamburger settings drawer matches the mobile web menu grouping and compact rhythm", () => {
  const { wxml, wxss } = readPage("mine");
  const nativeSettingsFile = require.resolve("../utils/nativeSettings.js");
  delete require.cache[nativeSettingsFile];
  const { SETTINGS_SECTIONS } = require("../utils/nativeSettings.js");

  assert.deepEqual(SETTINGS_SECTIONS.map((section) => [section.key, section.items.map((item) => item.key)]), [
    ["account", ["pro", "archive"]],
    ["content", ["programs", "experts"]],
    ["library", ["reading", "materials", "planning"]],
    ["ask", ["topics", "worthbuy", "welfare", "mamaHaozhuan"]],
    ["memory", ["memory"]],
    ["settings", ["settings"]]
  ]);
  assert.match(wxml, /class="xf-native-settings-mask xf-mine-settings-mask" style="height: \{\{settingsPanelHeight\}\}px;" catchtap="closeSettings" catchtouchmove="noop"/);
  assert.match(wxml, /<scroll-view class="xf-native-settings-panel xf-mine-settings-panel" style="height: \{\{settingsPanelHeight\}\}px; padding-top: \{\{profilePanelTop\}\}px;" scroll-y="true" enhanced show-scrollbar="false" catchtap="noop"/);
  assert.match(wxml, /<view class="xf-native-settings-panel-inner">\s*<block wx:if="\{\{settingsPanelView === 'menu'\}\}">/);
  assert.match(wxml, /class="xf-native-settings-account xf-mine-settings-account"[\s\S]*wx:for="\{\{settingsSections\}\}"/);
  assert.match(wxml, /class="xf-native-settings-card xf-mine-settings-card xf-mine-settings-card--\{\{section\.key\}\}"/);
  assert.match(wxml, /class="xf-native-settings-row xf-mine-settings-row"/);
  assert.match(wxml, /class="xf-native-settings-logo-icon xf-mine-settings-icon"/);
  assert.match(wxml, /class="xf-native-settings-emoji-icon xf-mine-settings-icon"/);
  assert.match(wxml, /class="xf-native-settings-label xf-mine-settings-label"/);
  assert.match(wxml, /class="xf-native-settings-chevron xf-mine-settings-chevron"/);
  assert.match(wxss, /\.xf-mine-settings-panel \{[\s\S]*width: 84vw;[\s\S]*max-width: 640rpx;[\s\S]*padding: 52rpx 34rpx 0;[\s\S]*gap: 26rpx;[\s\S]*background: #f7f7f8;/);
  assert.match(wxss, /\.xf-mine-settings-account,[\s\S]*\.xf-mine-settings-card \{[\s\S]*margin-bottom: 0;[\s\S]*background: #ffffff;/);
  assert.match(wxss, /\.xf-mine-settings-row \{[\s\S]*min-height: 96rpx;[\s\S]*padding: 0 30rpx;/);
  assert.match(wxss, /\.xf-mine-settings-icon \{[\s\S]*width: 34rpx;[\s\S]*height: 34rpx;/);
  assert.match(wxss, /\.xf-mine-settings-label \{[\s\S]*display: flex;[\s\S]*align-items: center;[\s\S]*height: 34rpx;[\s\S]*line-height: 34rpx;/);
  assert.match(wxss, /\.xf-mine-settings-chevron \{[\s\S]*width: 28rpx;[\s\S]*text-align: right;/);
  assert.match(wxss, /\.xf-mine-settings-row \.xf-mine-settings-chevron \{[\s\S]*align-items: center;[\s\S]*height: 34rpx;[\s\S]*line-height: 34rpx;/);
});

test("Xiaowanzi super webview hides the native bottom bar and uses its own web chrome", () => {
  const { js, wxml, wxss } = readPage("webview");
  const definition = loadPageDefinition("webview");
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  assert.match(js, /function isXiaowanziSuperWebview\(src\)/);
  assert.match(js, /function shouldHideNativeTabbar\(src\)/);
  assert.match(js, /function getUrlPathname\(value\)/);
  assert.doesNotMatch(js, /new URL\(src\)/);
  assert.match(js, /hideTabbar: true/);
  assert.match(js, /const hideTabbar = shouldHideNativeTabbar\(src\)/);
  assert.match(js, /const showXiaowanziClose = isXiaowanziSuperWebview\(src\)/);
  assert.match(js, /showXiaowanziClose,/);
  assert.match(js, /const \{ SETTINGS_SECTIONS, createNativeSettingsMethods \} = require\("\.\.\/\.\.\/utils\/nativeSettings"\)/);
  assert.match(js, /\.\.\.createNativeSettingsMethods\(\)/);
  assert.doesNotMatch(js, /restartXiaowanziHome\(\)/);
  assert.doesNotMatch(js, /openXiaowanziKnowledge\(\)/);
  assert.doesNotMatch(js, /showNativePageNav: !hideTabbar/);
  assert.match(wxml, /wx:if="\{\{settingsPanelOpen\}\}" class="xf-native-settings-mask" style="height: \{\{settingsPanelHeight\}\}px;" catchtap="closeSettings"/);
  assert.match(wxss, /@import "\.\.\/\.\.\/styles\/native-list\.wxss";/);
  assert.doesNotMatch(wxml, /xf-xiaowanzi-native-topbar/);
  assert.doesNotMatch(wxml, /xf-xiaowanzi-native-back/);
  assert.doesNotMatch(wxml, /xf-xiaowanzi-native-agent/);
  assert.doesNotMatch(wxml, /xf-xiaowanzi-web-close/);
  assert.doesNotMatch(wxml, /xf-xiaowanzi-web-nav/);
  assert.doesNotMatch(wxml, /xf-xiaowanzi-web-nav__logo/);
  assert.doesNotMatch(js, /xiaowanziWebviewStyle/);
  assert.match(wxml, /<web-view wx:elif="\{\{src\}\}" src="\{\{src\}\}" \/>[\s\S]*<custom-tab-bar selected="\{\{selected\}\}" hidden="\{\{hideTabbar\}\}" \/>/);

  const originalSetNavigationBarTitle = global.wx.setNavigationBarTitle;
  const navigationTitles = [];
  global.wx.setNavigationBarTitle = (payload) => {
    navigationTitles.push(payload);
  };

  try {
    definition.onLoad.call(context, {
      url: encodeURIComponent("https://xianfeng.xinzhi.info/index-xiaowanzi.html?xf_xw=home&xf_tab=0"),
      title: encodeURIComponent("小玩子")
    });
  } finally {
    if (originalSetNavigationBarTitle) {
      global.wx.setNavigationBarTitle = originalSetNavigationBarTitle;
    } else {
      delete global.wx.setNavigationBarTitle;
    }
  }

  assert.equal(context.data.title, "");
  assert.deepEqual(navigationTitles, [{ title: "" }]);
  assert.equal(context.data.selected, 2);
  assert.equal(context.data.hideTabbar, true);
  assert.equal(context.data.showXiaowanziClose, true);
  assert.equal(context.data.showNativePageNav, false);
  assert.match(context.data.src, /\/index-xiaowanzi\.html/);
  assert.match(context.data.src, /[?&]xf_xw=home/);
  assert.match(context.data.src, /[?&]xf_tab=0/);
});

test("planning webview hides the native bottom bar without using the Xiaowanzi close affordance", () => {
  const { js } = readPage("webview");
  const definition = loadPageDefinition("webview");
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  assert.match(js, /function shouldHideNativeTabbar\(src\)/);
  assert.match(js, /function getUrlPathname\(value\)/);
  assert.doesNotMatch(js, /new URL\(src\)/);
  assert.match(js, /pathname === "\/planning"/);
  assert.match(js, /const hideTabbar = shouldHideNativeTabbar\(src\)/);

  definition.onLoad.call(context, {
    url: encodeURIComponent("https://xianfeng.xinzhi.info/planning?xf_mp=1"),
    title: encodeURIComponent("教育规划")
  });

  assert.equal(context.data.title, "教育规划");
  assert.equal(context.data.selected, 0);
  assert.equal(context.data.hideTabbar, true);
  assert.equal(context.data.showXiaowanziClose, false);
  assert.equal(context.data.showNativePageNav, false);
  assert.equal(new URL(context.data.src).pathname, "/planning");

  definition.handleNativeNavRoute.call(context, {
    detail: { path: "/planning", text: "规划" }
  });
  assert.equal(new URL(context.data.src).pathname, "/planning");
  assert.equal(context.data.hideTabbar, true);
  assert.equal(context.data.showXiaowanziClose, false);
});

test("planning webview hides the native bottom bar when URL is unavailable on device", () => {
  const OriginalURL = global.URL;
  try {
    global.URL = undefined;
    const definition = loadPageDefinition("webview");
    const context = {
      ...definition,
      data: { ...definition.data },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };

    definition.onLoad.call(context, {
      url: encodeURIComponent("https://xianfeng.xinzhi.info/planning?xf_mp=1"),
      title: encodeURIComponent("教育规划")
    });

    assert.equal(context.data.title, "教育规划");
    assert.match(context.data.src, /^https:\/\/xianfeng\.xinzhi\.info\/planning\?/);
    assert.match(context.data.src, /[?&]xf_mp=1(?:&|$)/);
    assert.equal(context.data.hideTabbar, true);
    assert.equal(context.data.showXiaowanziClose, false);
  } finally {
    global.URL = OriginalURL;
  }
});

test("Xiaowanzi layer webviews hide the native bottom bar without taking over the close affordance", () => {
  const { js } = readPage("webview");
  const definition = loadPageDefinition("webview");
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  const ordinaryContext = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  assert.match(js, /function isXiaowanziLayerWebview\(src\)/);
  assert.match(js, /getUrlParam\(src, "xw_layer"\) === "1" && getUrlParam\(src, "xw_return"\) === "xiaowanzi"/);
  assert.match(js, /isXiaowanziSuperWebview\(src\) \|\| isXiaowanziLayerWebview\(src\)/);

  definition.onLoad.call(context, {
    url: encodeURIComponent("https://xianfeng.xinzhi.info/experts?xw_layer=1&xw_return=xiaowanzi"),
    title: encodeURIComponent("先疯智库")
  });
  assert.equal(context.data.title, "先疯智库");
  assert.equal(context.data.selected, 0);
  assert.equal(context.data.hideTabbar, true);
  assert.equal(context.data.showXiaowanziClose, false);
  assert.equal(context.data.showNativePageNav, false);
  assert.match(context.data.src, /\/experts\?/);
  assert.match(context.data.src, /[?&]xw_layer=1/);
  assert.match(context.data.src, /[?&]xw_return=xiaowanzi/);

  definition.onLoad.call(ordinaryContext, {
    url: encodeURIComponent("https://xianfeng.xinzhi.info/experts"),
    title: encodeURIComponent("先疯智库")
  });
  assert.equal(ordinaryContext.data.hideTabbar, false);
});

test("native pages keep view topbars while Xiaowanzi owns a native shell", () => {
  const chrome = fs.readFileSync(new URL("../utils/nativeChrome.js", import.meta.url), "utf8");
  const pageNames = ["programs", "reading", "materials", "topics", "pro", "mine"];

  for (const name of pageNames) {
    const { json, wxml } = readPage(name);
    assert.equal(Boolean((json.usingComponents || {})["native-page-nav"]), false, `${name} should not register native-page-nav`);
    assert.equal(wxml.includes("<native-page-nav"), false, `${name} should not render native-page-nav`);
  }
  const xiaowanzi = readPage("xiaowanzi");
  assert.deepEqual(xiaowanzi.json.usingComponents || {}, { "phone-login-gate": "../../components/phone-login-gate/index" });
  assert.equal(xiaowanzi.wxml.includes("<native-page-nav"), false);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-native-shell"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-menu-entry"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-menu-mark" src="\/assets\/xiaowanzi-icons\/menu-dark\.png" mode="aspectFit"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-child-hint"/);
  assert.equal(xiaowanzi.wxml.includes("<web-view"), false);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-chat-list \{\{homeMode \? 'is-home' : 'is-chat'\}\} \{\{attachmentMenuOpen \? 'has-attachment-menu' : ''\}\} \{\{shareSelectionMode \? 'has-share-selection' : ''\}\}"/);
  assert.match(xiaowanzi.wxml, /class="xf-xiaowanzi-composer \{\{attachmentMenuOpen \? 'is-attach-open' : ''\}\}"/);
  assert.equal(chrome.includes("NATIVE_TOP_MENU_HEIGHT"), false);
  assert.equal(chrome.includes("menuRowHeight"), false);
  assert.match(chrome, /getNativeWebviewParams/);

  const webview = readPage("webview");
  assert.deepEqual(webview.json.usingComponents || {}, {
    "custom-tab-bar": "../../custom-tab-bar/index",
    "phone-login-gate": "../../components/phone-login-gate/index"
  });
  assert.equal(webview.json.navigationStyle, "custom");
  assert.equal(webview.wxml.includes("<native-page-nav"), false);
  assert.doesNotMatch(webview.wxml, /xf-xiaowanzi-native-topbar/);
  assert.doesNotMatch(webview.wxml, /xf-xiaowanzi-web-nav/);
  assert.match(webview.wxml, /<custom-tab-bar selected="\{\{selected\}\}" hidden="\{\{hideTabbar\}\}" \/>/);
});

test("native page nav component keeps its default style when reused", () => {
  const js = fs.readFileSync(new URL("../components/native-page-nav/index.js", import.meta.url), "utf8");
  const wxml = fs.readFileSync(new URL("../components/native-page-nav/index.wxml", import.meta.url), "utf8");
  const wxss = fs.readFileSync(new URL("../components/native-page-nav/index.wxss", import.meta.url), "utf8");

  assert.equal(js.includes("variant"), false);
  assert.equal(wxml.includes("is-xiaowanzi"), false);
  assert.equal(wxss.includes("is-xiaowanzi"), false);
  assert.match(js, /const \{ goProgramsHome \} = require\("\.\.\/\.\.\/utils\/nativePageNav"\)/);
  assert.match(js, /const LOGO_HEIGHT_RPX = 56/);
  assert.match(js, /openHome\(\)\s*\{[\s\S]*goProgramsHome\(\);[\s\S]*\}/);
  assert.doesNotMatch(js, /handleSearch\(\)/);
  assert.match(wxml, /class="xf-native-page-nav__menu-toggle" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;" bindtap="toggleMenu"/);
  assert.match(wxml, /class="xf-native-page-nav__logo-button" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;" bindtap="openHome"/);
  assert.doesNotMatch(wxml, /xf-native-page-nav__search/);
  assert.match(wxss, /\.xf-native-page-nav \{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.98\);[\s\S]*border-bottom:\s*1rpx solid rgba\(17,\s*10,\s*8,\s*0\.08\);/);
  assert.match(wxss, /\.xf-native-page-nav__menu-panel \{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.98\);/);
});

test("Xiaowanzi super mode exit bridge closes the webview page stack", () => {
  const appJson = JSON.parse(
    fs.readFileSync(new URL("../app.json", import.meta.url), "utf8")
  );
  const bridgeJs = fs.readFileSync(new URL("./xiaowanzi-exit/index.js", import.meta.url), "utf8");
  const bridgeJson = JSON.parse(fs.readFileSync(new URL("./xiaowanzi-exit/index.json", import.meta.url), "utf8"));
  const bridgeDefinition = loadPageDefinition("xiaowanzi-exit");
  const originalSetStorageSync = global.wx.setStorageSync;
  const originalRemoveStorageSync = global.wx.removeStorageSync;
  const originalNavigateBack = global.wx.navigateBack;
  const originalSwitchTab = global.wx.switchTab;
  const navigateBackCalls = [];
  const switchCalls = [];
  const removedKeys = [];

  try {
    global.wx.setStorageSync = (key, value) => {
      throw new Error(`unexpected setStorageSync(${key}, ${value})`);
    };
    global.wx.removeStorageSync = (key) => {
      removedKeys.push(key);
    };
    global.wx.navigateBack = (options) => {
      navigateBackCalls.push(options);
    };
    global.wx.switchTab = (options) => {
      switchCalls.push(options);
    };

    assert.equal(appJson.pages.includes("pages/xiaowanzi-exit/index"), true);
    assert.equal(bridgeJson.navigationStyle, "custom");
    assert.match(bridgeJs, /closeXiaowanziSuperWebview/);
    bridgeDefinition.onLoad();
    assert.deepEqual(removedKeys, ["xf_xiaowanzi_entry_mode"]);
    assert.equal(navigateBackCalls.length, 1);
    assert.equal(navigateBackCalls[0].delta, 2);
    assert.equal(switchCalls.length, 0);
  } finally {
    global.wx.setStorageSync = originalSetStorageSync;
    global.wx.removeStorageSync = originalRemoveStorageSync;
    global.wx.navigateBack = originalNavigateBack;
    global.wx.switchTab = originalSwitchTab;
  }
});

test("main mini program pages expose WeChat share handlers", () => {
  const pages = [
    ["programs", "节目", "/pages/programs/index"],
    ["reading", "及阅", "/pages/reading/index"],
    ["xiaowanzi", "小玩子", "/pages/xiaowanzi/index"],
    ["materials", "资料", "/pages/materials/index"],
    ["topics", "家长先疯请教", "/pages/topics/index"]
  ];

  for (const [name, title, path] of pages) {
    const definition = loadPageDefinition(name);
    assert.equal(typeof definition.onShareAppMessage, "function", `${name} should support sharing to friends`);
    assert.equal(typeof definition.onShareTimeline, "function", `${name} should support sharing to timeline`);
    const appMessage = definition.onShareAppMessage();
    assert.equal(appMessage.title, title);
    assert.equal("imageUrl" in appMessage, false);
    assert.equal(appMessage.path, path);
    assert.equal(definition.onShareTimeline().title, title);
    assert.equal("imageUrl" in definition.onShareTimeline(), false);
  }
});

test("materials page shares the selected material detail while its link dialog is open", () => {
  const definition = loadPageDefinition("materials");
  const context = {
    data: {
      ...definition.data,
      materialLinkModalOpen: true,
      materialLinkModalId: "material-1",
      materialLinkModalTitle: "2026年高考资料"
    }
  };

  const appMessage = definition.onShareAppMessage.call(context);
  const appTarget = new URL(appMessage.path, "https://mini.local");
  const appDetail = new URL(appTarget.searchParams.get("url"));
  const timeline = definition.onShareTimeline.call(context);
  const timelineTarget = new URL(`/pages/webview/index?${timeline.query}`, "https://mini.local");
  const timelineDetail = new URL(timelineTarget.searchParams.get("url"));

  assert.equal(appMessage.title, "2026年高考资料");
  assert.equal(appTarget.pathname, "/pages/webview/index");
  assert.equal(appDetail.pathname, "/materials/material-1");
  assert.equal(timeline.title, "2026年高考资料");
  assert.equal(timelineDetail.pathname, "/materials/material-1");
});

test("mini program page share falls back to page screenshots unless a cover is explicit", () => {
  const { createPageShare } = require("../utils/share.js");
  const screenshotShare = createPageShare({
    title: "小玩子",
    path: "/pages/xiaowanzi/index"
  }).onShareAppMessage();
  const explicitCoverShare = createPageShare({
    title: "小玩子",
    path: "/pages/xiaowanzi/index",
    imageUrl: "/assets/share/timeline-logo.png"
  }).onShareAppMessage();

  assert.equal("imageUrl" in screenshotShare, false);
  assert.equal(explicitCoverShare.imageUrl, "/assets/share/timeline-logo.png");
});

test("webview detail page shares the current web route without leaking token", () => {
  const { js, json } = readPage("webview");
  const definition = loadPageDefinition("webview");
  const context = {
    data: {
      title: "节目详情",
      src: "https://xianfeng.xinzhi.info/programs/abc?xf_mp=1&xf_token=secret"
    }
  };

  assert.match(js, /enableShareMenu\(\)/);
  assert.equal(json.navigationStyle, "custom");
  assert.deepEqual(json.usingComponents || {}, {
    "custom-tab-bar": "../../custom-tab-bar/index",
    "phone-login-gate": "../../components/phone-login-gate/index"
  });
  assert.equal(typeof definition.onShareAppMessage, "function");
  assert.equal(typeof definition.onShareTimeline, "function");

  const share = definition.onShareAppMessage.call(context);
  const timelineShare = definition.onShareTimeline.call(context);
  assert.equal(share.title, "节目详情");
  assert.equal("imageUrl" in share, false);
  assert.equal(share.path.includes("xf_token"), false);
  assert.equal(share.path.includes("secret"), false);
  assert.match(share.path, /^\/pages\/webview\/index\?url=/);
  assert.equal("imageUrl" in timelineShare, false);
});

test("native webview details share their original detail route instead of the website home", () => {
  const { js } = readPage("webview");
  const definition = loadPageDefinition("webview");
  const details = [
    ["节目详情", "/programs/program-1"],
    ["图书详情", "/reading/book-1"],
    ["外部图书详情", "/library/external-book-1"],
    ["资料详情", "/materials/material-1"]
  ];

  assert.match(js, /this\.shareSrc = src;/, "onLoad should preserve the resolved route before native detail mode clears src");
  assert.match(js, /src: this\.data\.src \|\| this\.shareSrc/g, "friend and timeline shares should use the preserved native-detail route");

  for (const [title, pathname] of details) {
    const context = {
      data: {
        title,
        src: "",
        nativeTopicMode: false,
        nativeExpertMode: false
      },
      shareSrc: `https://xianfeng.xinzhi.info${pathname}?xf_mp=1&xf_token=secret`
    };
    const appMessage = definition.onShareAppMessage.call(context);
    const timeline = definition.onShareTimeline.call(context);
    const appTarget = new URL(appMessage.path, "https://mini.local");
    const appDetail = new URL(appTarget.searchParams.get("url"));
    const timelineTarget = new URL(`/pages/webview/index?${timeline.query}`, "https://mini.local");
    const timelineDetail = new URL(timelineTarget.searchParams.get("url"));

    assert.equal(appDetail.pathname, pathname, `${title} friend share should keep its detail route`);
    assert.equal(timelineDetail.pathname, pathname, `${title} timeline share should keep its detail route`);
    assert.equal(appMessage.path.includes("xf_token"), false);
    assert.equal(timeline.query.includes("xf_token"), false);
  }
});

test("topics cards share native landing paths without leaking web params", () => {
  const definition = loadPageDefinition("topics");
  const context = {
    data: {
      topics: [
        {
          id: "topic-1",
          slug: "writing-growth",
          title: "写作&成长=一#章",
          path: "/topics/writing-growth?ref=a%26b&section=one=1&xf_token=secret&userId=user-1#part=2"
        }
      ]
    }
  };

  const share = definition.onShareAppMessage.call(context, {
    target: {
      dataset: {
        topicId: "topic-1"
      }
    }
  });
  const timelineShare = definition.onShareTimeline.call(context, {
    target: {
      dataset: {
        topicId: "topic-1"
      }
    }
  });

  assert.equal(share.title, "写作&成长=一#章");
  assert.equal("imageUrl" in share, false);
  assert.match(share.path, /^\/pages\/webview\/index\?/);
  assert.equal(share.path.includes("xf_token"), false);
  assert.equal(share.path.includes("secret"), false);
  assert.equal(share.path.includes("userId"), false);
  const nested = new URL(share.path, "https://mini.local");
  assert.equal(nested.pathname, "/pages/webview/index");
  assert.equal(nested.searchParams.get("nativeTopic"), "1");
  assert.equal(nested.searchParams.get("topicSlug"), "writing-growth");
  assert.equal(nested.searchParams.get("title"), "写作&成长=一#章");
  assert.equal(nested.searchParams.has("url"), false);
  assert.equal(nested.searchParams.has("topicId"), false);
  assert.equal(timelineShare.title, "写作&成长=一#章");
  assert.equal(timelineShare.query.includes("xf_token"), false);
  assert.equal(new URLSearchParams(timelineShare.query).get("nativeTopic"), "1");
  assert.equal(new URLSearchParams(timelineShare.query).get("topicSlug"), "writing-growth");
});

test("programs hamburger settings drawer renders native menu content", () => {
  const { js, wxml, wxss } = readPage("programs");
  const nativeSettings = readNativeSettings();
  const jiyueLogo = new URL("../assets/menu/jiyue-logo.png", import.meta.url);

  assert.match(js, /const \{[^}]*SETTINGS_SECTIONS[^}]*createNativeSettingsMethods[^}]*setSettingsTabbarHidden[^}]*\} = require\("\.\.\/\.\.\/utils\/nativeSettings"\)/);
  assert.match(js, /openFilterDrawer\(\) \{[\s\S]*setSettingsTabbarHidden\(this, true\);[\s\S]*programFilterDrawerMethods\.openFilterDrawer\.call\(this\);[\s\S]*\}/);
  assert.match(js, /closeFilterDrawer\(\) \{[\s\S]*setSettingsTabbarHidden\(this, false\);[\s\S]*programFilterDrawerMethods\.closeFilterDrawer\.call\(this\);[\s\S]*\}/);
  assert.match(nativeSettings, /const SETTINGS_SECTIONS = \[/);
  assert.match(js, /settingsSections: SETTINGS_SECTIONS/);
  assert.match(nativeSettings, /resolveSettingsItem\(sectionIndex, itemIndex\)/);
  assert.equal(fs.existsSync(jiyueLogo), true);
  const lineIcons = ["workspace_premium", "badge", "podcasts", "person", "inventory_2", "route", "verified", "psychology", "settings"];
  for (const iconName of lineIcons) {
    assert.equal(fs.existsSync(new URL(`../assets/menu/line-${iconName}.png`, import.meta.url)), true);
    assert.equal(nativeSettings.includes(`image: "/assets/menu/line-${iconName}.png"`), true, `settings drawer should render the online ${iconName} line icon as an image`);
    assert.doesNotMatch(nativeSettings, new RegExp(`icon: "${iconName}"`), `settings drawer should not render raw ${iconName} ligature text in the mini program`);
  }
  assert.equal(nativeSettings.includes('iconType: "material"'), false);
  assert.doesNotMatch(nativeSettings, /loadSettingsIconFont/);
  assert.match(nativeSettings, /image: "\/assets\/menu\/jiyue-logo\.png"/);
  assert.match(nativeSettings, /image: "\/assets\/menu\/welfare-gift-icon\.png"/);
  assert.match(nativeSettings, /image: "\/assets\/menu\/mama-hao-zhuan-icon\.png"/);
  assert.match(nativeSettings, /emoji: "🙏🏻"/);
  assert.doesNotMatch(nativeSettings, /emoji: "⭐️"|emoji: "🗂️"|emoji: "👤"|emoji: "🧭"|emoji: "✅"|emoji: "🧠"|emoji: "⚙️"/);
  assert.doesNotMatch(wxss, /xf-program-filter-/);
  assert.match(wxml, /wx:for="\{\{settingsSections\}\}"/);
  assert.match(wxml, /wx:for-item="section"/);
  assert.match(wxml, /wx:for="\{\{section\.items\}\}"/);
  assert.match(wxml, /data-section-index="\{\{sectionIndex\}\}"/);
  assert.match(wxml, /data-item-index="\{\{itemIndex\}\}"/);
  assert.match(wxml, /wx:if="\{\{item\.iconType === 'image'\}\}" class="xf-program-settings-logo-icon"/);
  assert.match(wxml, /wx:elif="\{\{item\.iconType === 'emoji'\}\}" class="xf-program-settings-emoji-icon"/);
  assert.match(wxml, /wx:else class="xf-program-settings-symbol material-symbols-rounded"/);
  assert.doesNotMatch(wxml, /data-path=/);
  assert.doesNotMatch(wxml, /WEB_ROUTES/);
  assert.match(wxss, /\.xf-program-settings-symbol,[\s\S]*\.xf-program-settings-logo-icon,[\s\S]*\.xf-program-settings-emoji-icon \{[\s\S]*width: 34rpx;[\s\S]*height: 34rpx;[\s\S]*line-height: 34rpx;[\s\S]*overflow: hidden;[\s\S]*white-space: nowrap;/);
  assert.match(wxss, /\.xf-program-settings-symbol \{[\s\S]*font-size: 30rpx;/);
  assert.match(wxss, /\.xf-program-settings-emoji-icon \{[\s\S]*font-size: 28rpx;/);
  assert.match(wxss, /\.xf-program-settings-mask \{[\s\S]*z-index: 2147483647;/);
  assert.match(wxss, /\.xf-program-settings-panel \{[\s\S]*padding: 52rpx 34rpx 0;/);
  assert.match(wxss, /\.xf-program-settings-panel \{[\s\S]*width: 84vw;[\s\S]*max-width: 640rpx;/);
  assert.match(wxss, /\.xf-program-settings-account,[\s\S]*\.xf-program-settings-card \{[\s\S]*margin-bottom: 0;[\s\S]*background: #ffffff;/);
  assert.match(wxss, /\.xf-program-settings-card \{[\s\S]*border-radius: 24rpx;/);
  assert.match(wxss, /\.xf-program-settings-account \{[\s\S]*justify-content: center;[\s\S]*margin: 0;[\s\S]*min-height: 152rpx;[\s\S]*padding: 32rpx 30rpx;[\s\S]*border: 0;[\s\S]*border-radius: 32rpx;/);
  assert.match(wxss, /\.xf-program-settings-account::after \{[\s\S]*border: 0;/);
  assert.match(wxss, /\.xf-program-settings-avatar \{[\s\S]*width: 104rpx;[\s\S]*height: 104rpx;/);
  assert.match(wxss, /\.xf-program-settings-member-badge \{[\s\S]*display: inline-flex;[\s\S]*background: #0b0f19;[\s\S]*color: #f8d375;/);
  assert.match(wxss, /\.xf-program-settings-row \.xf-program-settings-chevron \{[\s\S]*display: flex;[\s\S]*align-items: center;[\s\S]*height: 34rpx;/);
  assert.match(wxss, /\.xf-program-settings-row \{[\s\S]*min-height: 98rpx;/);
});

test("hamburger secondary entries keep restored wrapper routes", () => {
  const appJson = JSON.parse(fs.readFileSync(new URL("../app.json", import.meta.url), "utf8"));
  const programs = readPage("programs");
  const nativeSettings = readNativeSettings();
  const pageNames = ["planning"];

  for (const name of pageNames) {
    assert.equal(appJson.pages.includes(`pages/${name}/index`), false, `${name} should not be registered as a native page`);
  }
  assert.equal(appJson.pages.includes("pages/worthbuy/index"), true, "worthbuy should be registered as a native page");
  assert.equal(appJson.pages.includes("pages/worthbuy-detail/index"), true, "worthbuy detail should be registered as a native page");

  assert.equal(appJson.pages.includes("pages/experts/index"), true);
  assert.match(nativeSettings, /key: "experts"[\s\S]*page: "\/pages\/experts\/index"/);
  assert.doesNotMatch(nativeSettings, /key: "experts"[\s\S]*path: "\/experts\?xw_layer=1&xw_return=xiaowanzi"/);
  assert.match(nativeSettings, /key: "planning"[\s\S]*path: "\/planning"/);
  assert.match(nativeSettings, /key: "worthbuy"[\s\S]*page: "\/pages\/worthbuy\/index"/);
  assert.equal(appJson.pages.includes("pages/welfare/index"), true);
  assert.match(nativeSettings, /key: "welfare"[\s\S]*title: "百宝箱"[\s\S]*page: "\/pages\/welfare\/index"/);
  assert.equal(appJson.pages.includes("pages/mama-resource-apply/index"), true);
  assert.match(nativeSettings, /key: "mamaHaozhuan"[\s\S]*page: "\/pages\/mama-resource-apply\/index"/);
  assert.doesNotMatch(nativeSettings, /key: "planning"[\s\S]*page: "\/pages\/planning\/index"/);
  assert.doesNotMatch(nativeSettings, /key: "worthbuy"[\s\S]*path: "\/worthbuy"/);
  assert.doesNotMatch(nativeSettings, /key: "mamaHaozhuan"[\s\S]*path: "\/mama-resources\/apply"/);
  assert.match(nativeSettings, /key: "archive"[\s\S]*page: "\/pages\/mine\/archive\/index"[\s\S]*panelView: "archive"/);
  assert.match(nativeSettings, /key: "memory"[\s\S]*page: "\/pages\/mine\/memory\/index"[\s\S]*panelView: "memory"/);
  assert.match(nativeSettings, /key: "settings"[\s\S]*path: "\/"[\s\S]*panel: "settings"[\s\S]*panelView: "settings"/);
  assert.match(nativeSettings, /panelView === "archive"[\s\S]*settingsProfilePanelSupported === true/);
  assert.match(nativeSettings, /preserveXiaowanziLayer/);
});

test("hamburger expert entry opens the native experts page directly", () => {
  const nativeSettings = require("../utils/nativeSettings.js");
  const navigations = [];
  const context = {
    data: {},
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    ...nativeSettings.createNativeSettingsMethods()
  };
  const originalWx = global.wx;
  const originalGetCurrentPages = global.getCurrentPages;

  try {
    global.wx = {
      getStorageSync() {
        return "";
      },
      navigateTo(options) {
        navigations.push(options);
      },
      switchTab(options) {
        navigations.push(options);
      },
      loadFontFace() {},
      getStorageSync() {
        return "";
      },
      removeStorageSync() {}
    };
    global.getCurrentPages = () => [{ route: "pages/programs/index" }];

    context.openSettingsItem({ currentTarget: { dataset: { sectionIndex: 1, itemIndex: 1 } } });

    assert.equal(navigations.length, 1);
    assert.deepEqual(navigations[0], { url: "/pages/experts/index?from=settings" });
  } finally {
    global.wx = originalWx;
    global.getCurrentPages = originalGetCurrentPages;
  }
});

test("hamburger profile entries stay inside the open half-panel when the page supports profile views", () => {
  const nativeSettings = require("../utils/nativeSettings.js");
  const navigations = [];
  const storage = new Map([
    ["xf_token", "mini-token"],
    ["xf_user", { name: "阿力", gender: "男", avatar: "/uploads/avatar.png" }]
  ]);
  const context = {
    data: { settingsProfilePanelSupported: true },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    ...nativeSettings.createNativeSettingsMethods()
  };
  const originalWx = global.wx;
  const originalGetCurrentPages = global.getCurrentPages;

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      navigateTo(options) {
        navigations.push(options);
      },
      switchTab(options) {
        navigations.push(options);
      }
    };
    global.getCurrentPages = () => [{ route: "pages/programs/index" }];

    context.openSettings();
    assert.equal(context.data.settingsPanelOpen, true);
    assert.equal(context.data.settingsPanelView, "menu");
    assert.equal(context.data.accountPanelView, "profile");

    context.openSettingsItem({ currentTarget: { dataset: { page: context.data.accountPage, title: context.data.accountTitle, panelView: context.data.accountPanelView } } });
    assert.equal(context.data.settingsPanelOpen, true);
    assert.equal(context.data.settingsPanelView, "profile");
    assert.equal(context.data.profileDraft.name, "阿力");
    assert.equal(context.data.profileDraft.gender, "男");
    assert.equal(context.data.profileAvatar, "https://xianfeng.xinzhi.info/uploads/avatar.png");
    assert.deepEqual(navigations, []);

    for (const view of ["archive", "memory"]) {
      context.openSettingsItem({ currentTarget: { dataset: { panelView: view } } });
      assert.equal(context.data.settingsPanelOpen, true);
      assert.equal(context.data.settingsPanelView, view);
      assert.deepEqual(navigations, []);
      context.openSettingsItem({ currentTarget: { dataset: { page: context.data.accountPage, title: context.data.accountTitle, panelView: context.data.accountPanelView } } });
      assert.equal(context.data.settingsPanelView, "profile");
    }

    for (const [sectionIndex, itemIndex, view] of [
      [0, 1, "archive"],
      [4, 0, "memory"],
      [5, 0, "settings"]
    ]) {
      context.openSettingsItem({ currentTarget: { dataset: { sectionIndex, itemIndex } } });
      assert.equal(context.data.settingsPanelOpen, true);
      assert.equal(context.data.settingsPanelView, view);
      assert.deepEqual(navigations, []);
    }

    context.backSettingsMenu();
    assert.equal(context.data.settingsPanelOpen, true);
    assert.equal(context.data.settingsPanelView, "menu");

    context.closeSettings();
    assert.equal(context.data.settingsPanelOpen, false);
    assert.equal(context.data.settingsPanelView, "menu");
  } finally {
    global.wx = originalWx;
    global.getCurrentPages = originalGetCurrentPages;
  }
});

test("shared native settings drawer renders profile subviews in place on first-level native pages", () => {
  const template = fs.readFileSync(new URL("../templates/settings-profile-views.wxml", import.meta.url), "utf8");
  const archivePageTemplate = fs.readFileSync(new URL("../pages/mine/archive/index.wxml", import.meta.url), "utf8");
  const nativeListStyles = fs.readFileSync(new URL("../styles/native-list.wxss", import.meta.url), "utf8");
  const archivePanelStyles = fs.readFileSync(new URL("../pages/mine/profile-panel.wxss", import.meta.url), "utf8");

  assert.match(template, /template name="xfSettingsProfilePanel"/);
  assert.match(template, /<view class="xf-profile-title">个人资料<\/view>/);
  assert.match(template, /open-type="chooseAvatar" bindchooseavatar="chooseProfileAvatar"[\s\S]*选择微信头像/);
  assert.match(template, /bindtap="removeProfileAvatar"[\s\S]*移除头像/);
  assert.match(template, /支持 JPG \/ PNG \/ WEBP，建议 1:1 方图/);
  assert.match(template, /<input type="nickname" value="\{\{profileDraft\.name\}\}"[\s\S]*bindinput="updateProfileName"/);
  assert.match(template, /<text class="xf-profile-label">性别<\/text>/);
  assert.match(template, /bindtap="chooseProfileGender"/);
  assert.match(template, /bindtap="saveProfilePanel">保存资料/);
  assert.match(template, /class="xf-profile-card xf-profile-shortcuts"/);
  assert.match(template, /class="xf-profile-shortcut" catchtap="openSettingsItem" data-panel-view="archive"[\s\S]*档案管理[\s\S]*查看孩子档案摘要/);
  assert.match(template, /class="xf-profile-shortcut" catchtap="openSettingsItem" data-panel-view="memory"[\s\S]*记忆[\s\S]*管理小玩子长期记忆/);
  assert.match(nativeListStyles, /\.xf-profile-shortcuts \{[\s\S]*margin-top: 34rpx;[\s\S]*padding: 0;[\s\S]*\}/);
  assert.match(nativeListStyles, /\.xf-profile-shortcut \{[\s\S]*gap: 18rpx;[\s\S]*min-height: 104rpx;[\s\S]*padding: 0 32rpx;/);
  assert.match(template, /class="xf-profile-header" style="height: \{\{profileHeaderHeight\}\}px;"/);
  assert.match(template, /class="xf-profile-add-child" aria-label="添加孩子档案" bindtap="addArchiveChild">\+<\/button>/);
  assert.doesNotMatch(template, />\+ 添加孩子<\/button>/);
  assert.match(template, /<view class="xf-settings-bottom">\s*<button wx:if="\{\{isLoggedIn\}\}" class="xf-profile-danger xf-settings-danger" bindtap="deleteAccount">注销账户<\/button>/);
  assert.match(nativeListStyles, /\.xf-settings-panel \{[\s\S]*display: flex;[\s\S]*flex-direction: column;[\s\S]*min-height: calc\(100vh - 190rpx\);/);
  assert.match(nativeListStyles, /\.xf-settings-bottom \{[\s\S]*margin-top: auto;[\s\S]*padding-top: 120rpx;[\s\S]*padding-bottom: 86rpx;/);
  assert.match(archivePanelStyles, /\.xf-profile-panel \{[\s\S]*background: #f6f7fb;/);
  assert.doesNotMatch(archivePanelStyles.match(/\.xf-profile-panel \{[\s\S]*?\n\}/)?.[0] || "", /transparent calc\(100% - 96rpx\)/);
  assert.match(template, /class="xf-profile-delete-child" bindtap="deleteArchiveChild">删除<\/button>/);
  assert.match(archivePageTemplate, /class="xf-profile-delete-child" bindtap="deleteChild">删除<\/button>/);
  assert.match(template, /<button class="xf-profile-secondary" bindtap="findXiaowanzi">找小玩子<\/button>\s*<\/view>\s*<\/view>\s*<view class="xf-profile-message">\{\{profilePanelMessage\}\}<\/view>\s*<view class="xf-profile-delete-zone">\s*<button class="xf-profile-delete-child" bindtap="deleteArchiveChild">删除<\/button>\s*<\/view>/);
  assert.match(archivePageTemplate, /<button class="xf-profile-secondary" bindtap="openXiaowanzi">找小玩子<\/button>\s*<\/view>\s*<\/view>\s*<view class="xf-profile-message">\{\{message\}\}<\/view>\s*<view class="xf-profile-delete-zone">\s*<button class="xf-profile-delete-child" bindtap="deleteChild">删除<\/button>\s*<\/view>/);
  assert.match(fs.readFileSync(new URL("../pages/mine/archive/index.wxss", import.meta.url), "utf8"), /\.xf-archive-panel \{[\s\S]*padding-bottom: 56rpx;/);
  for (const styles of [nativeListStyles, archivePanelStyles]) {
    assert.match(styles, /\.xf-profile-delete-zone \{[\s\S]*display: flex;[\s\S]*justify-content: center;[\s\S]*padding: 6rpx 0 16rpx;/);
    assert.match(styles, /\.xf-profile-delete-child \{[\s\S]*display: block;[\s\S]*width: auto;[\s\S]*min-width: 0;[\s\S]*height: auto;[\s\S]*margin: 0;[\s\S]*padding: 10rpx 24rpx;[\s\S]*line-height: 1;/);
    assert.match(styles, /\.xf-profile-delete-child::after \{[\s\S]*border: 0;/);
    assert.match(styles, /\.xf-profile-message \{[\s\S]*min-height: 0;[\s\S]*margin-top: 18rpx;[\s\S]*line-height: 1\.25;/);
  }
  for (const styles of [nativeListStyles, archivePanelStyles]) {
    assert.match(styles, /\.xf-profile-add-child \{[\s\S]*flex: 0 0 64rpx;[\s\S]*width: 64rpx;[\s\S]*height: 64rpx;[\s\S]*padding: 0;[\s\S]*font-size: 32rpx;/);
    assert.match(styles, /\.xf-profile-add-child::after[\s\S]*\{[\s\S]*border: 0;/);
  }
  assert.match(
    nativeListStyles,
    /\.xf-memory-copy\s*\{[^}]*font-size:\s*23rpx[^}]*font-weight:\s*500[^}]*color:\s*#9aa4b5/s,
    "shared memory copy should be smaller, lighter, and grayer"
  );
  assert.match(template, /<input value="\{\{archiveDraft\.displayName\}\}"[\s\S]*bindinput="updateArchiveName"/);
  assert.match(template, /<picker mode="date" value="\{\{archiveDraft\.birthDate\}\}" bindchange="chooseArchiveBirthDate"/);
  assert.match(template, /<input value="\{\{archiveDraft\.city\}\}"[\s\S]*bindinput="updateArchiveCity"/);
  assert.match(template, /range="\{\{archiveRegionOptions\}\}" value="\{\{archiveRegionIndex\}\}" bindchange="chooseArchiveRegion"/);
  assert.match(template, /mode="multiSelector" range="\{\{archiveStageGradeColumns\}\}" value="\{\{archiveStageGradeValue\}\}" bindcolumnchange="updateArchiveStageGradeColumn" bindchange="chooseArchiveStageGrade"/);
  assert.doesNotMatch(template, /range="\{\{archiveStageOptions\}\}" value="\{\{archiveStageIndex\}\}" bindchange="chooseArchiveStage"/);
  assert.doesNotMatch(template, /range="\{\{archiveGradeOptions\}\}" value="\{\{archiveGradeIndex\}\}" bindchange="chooseArchiveGrade"/);
  assert.doesNotMatch(template, /bindtap="toggleArchiveStageOptions"/);
  assert.doesNotMatch(template, /wx:for="\{\{archiveStageOptions\}\}"[\s\S]*data-value="\{\{item\.value\}\}"[\s\S]*bindtap="chooseArchiveStage"/);
  assert.doesNotMatch(template, /bindtap="toggleArchiveGradeOptions"/);
  assert.doesNotMatch(template, /wx:for="\{\{archiveGradeSelectOptions\}\}"[\s\S]*data-value="\{\{item\.value\}\}"[\s\S]*bindtap="chooseArchiveGrade"/);
  assert.match(archivePageTemplate, /mode="multiSelector" range="\{\{stageGradeColumns\}\}" value="\{\{stageGradeValue\}\}" bindcolumnchange="updateStageGradeColumn" bindchange="chooseStageGrade"/);
  assert.doesNotMatch(archivePageTemplate, /range="\{\{stageOptions\}\}" value="\{\{stageIndex\}\}" bindchange="chooseStage"/);
  assert.doesNotMatch(archivePageTemplate, /range="\{\{gradeOptions\}\}" value="0" bindchange="chooseGrade"/);
  assert.doesNotMatch(archivePageTemplate, /bindtap="toggleStageOptions"/);
  assert.doesNotMatch(archivePageTemplate, /wx:for="\{\{stageOptions\}\}"[\s\S]*data-value="\{\{item\.value\}\}"[\s\S]*bindtap="chooseStage"/);
  assert.doesNotMatch(archivePageTemplate, /bindtap="toggleGradeOptions"/);
  assert.doesNotMatch(archivePageTemplate, /wx:for="\{\{gradeSelectOptions\}\}"[\s\S]*data-value="\{\{item\.value\}\}"[\s\S]*bindtap="chooseGrade"/);
  assert.match(template, /bindtap="chooseArchiveRelation"/);
  assert.doesNotMatch(template, /关注点（非必选）|bindtap="toggleArchiveTag"|archiveTagOptions/);
  assert.match(template, /bindtap="openMemoryManager"/);
  assert.match(template, /template name="xfSettingsMemoryManagerPanel"/);
  for (const label of ["记忆写入策略", "触发时机", "记什么", "不记什么", "我的记忆", "搜索记忆"]) {
    assert.match(template, new RegExp(label));
  }

  for (const pageName of ["programs", "reading", "materials", "topics", "search", "pro", "mama-resource-apply", "worthbuy"]) {
    const page = readPage(pageName);
    assert.match(page.js, /settingsProfilePanelSupported: true/, pageName);
    assert.match(page.js, /settingsPanelView: "menu"/, pageName);
    assert.match(page.js, /profilePanelTop: \d+/, pageName);
    assert.match(page.js, /profileHeaderHeight: \d+/, pageName);
    assert.match(page.js, /profilePanelTop: searchButtonTop/, pageName);
    assert.match(page.js, /profileHeaderHeight: capsuleHeight/, pageName);
    assert.match(page.wxml, /<import src="\.\.\/\.\.\/templates\/settings-profile-views\.wxml" \/>/, pageName);
    assert.match(page.wxml, /catchtap="closeSettings" catchtouchmove="noop"/, pageName);
    assert.match(page.wxml, /<scroll-view class="xf-(native|program)-settings-panel" style="height: \{\{settingsPanelHeight\}\}px; padding-top: \{\{profilePanelTop\}\}px;" scroll-y="true" enhanced show-scrollbar="false" catchtap="noop"/, pageName);
    assert.match(page.wxml, /<view class="xf-(native|program)-settings-panel-inner">\s*<block wx:if="\{\{settingsPanelView === 'menu'\}\}">/, pageName);
    assert.match(page.wxml, /wx:if="\{\{settingsPanelView === 'menu'\}\}"/, pageName);
    assert.match(page.wxml, /data-panel-view="\{\{accountPanelView\}\}"/, pageName);
    assert.match(page.wxml, /src="\{\{accountAvatar\}\}"/, pageName);
    assert.match(page.wxml, /class="xf-(native|program)-settings-avatar-wrap"[\s\S]*class="xf-(native|program)-settings-title-row"[\s\S]*class="xf-(native|program)-settings-title">\{\{accountTitle\}\}[\s\S]*class="xf-(native|program)-settings-subtitle-row"[\s\S]*class="xf-(native|program)-settings-subtitle">\{\{accountSubtitle\}\}/, pageName);
    assert.match(page.wxml, /class="xf-(native|program)-settings-label[^"]*">\{\{item\.title\}\}<\/text>\s*<text wx:if="\{\{item\.key === 'pro' && settingsMemberBadgeLabel\}\}" class="xf-(native|program)-settings-member-badge">\{\{settingsMemberBadgeLabel\}\}<\/text>\s*<text class="xf-(native|program)-settings-chevron[^"]*">›<\/text>/, pageName);
    assert.match(page.wxml, /template wx:elif="\{\{settingsPanelView === 'profile'\}\}" is="xfSettingsProfilePanel"/, pageName);
    assert.match(page.wxml, /template wx:elif="\{\{settingsPanelView === 'archive'\}\}" is="xfSettingsArchivePanel"/, pageName);
    assert.match(page.wxml, /archiveStageOptions: archiveStageOptions/, pageName);
    assert.match(page.wxml, /archiveStageIndex: archiveStageIndex/, pageName);
    assert.match(page.wxml, /archiveStageGradeColumns: archiveStageGradeColumns/, pageName);
    assert.match(page.wxml, /archiveStageGradeValue: archiveStageGradeValue/, pageName);
    assert.match(page.wxml, /archiveGradeDisplayText: archiveGradeDisplayText/, pageName);
    assert.match(page.wxml, /template wx:elif="\{\{settingsPanelView === 'memory'\}\}" is="xfSettingsMemoryPanel"/, pageName);
    assert.match(page.wxml, /template wx:elif="\{\{settingsPanelView === 'memoryManager'\}\}" is="xfSettingsMemoryManagerPanel"/, pageName);
    assert.match(page.wxml, /template wx:elif="\{\{settingsPanelView === 'settings'\}\}" is="xfSettingsAppPanel"/, pageName);
    assert.match(page.wxml, /profileHeaderHeight: profileHeaderHeight/, pageName);
  }
}
);

test("shared native settings personal profile panel persists the account profile", async () => {
  const nativeSettings = require("../utils/nativeSettings.js");
  const storage = new Map([
    ["xf_token", "mini-token"],
    ["xf_user", { name: "阿力", gender: "男", avatar: "/uploads/avatar.png", mobile: "13512343069" }]
  ]);
  const context = {
    data: { settingsProfilePanelSupported: true },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    ...nativeSettings.createNativeSettingsMethods()
  };
  const originalWx = global.wx;
  const originalGetApp = global.getApp;

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      uploadFile(options) {
        options.success({ statusCode: 201, data: JSON.stringify({ url: "/uploads/new-avatar.png" }) });
      },
      request(options) {
        if (options.url.includes("/api/users/me")) {
          options.success({ statusCode: 200, data: { name: options.data.name, gender: options.data.gender, avatar_image: options.data.avatar_image, mobile: "13512343069" } });
          return;
        }
        options.success({ statusCode: 200, data: { membership: {} } });
      }
    };
    global.getApp = () => ({ globalData: {}, setLoginSession() {} });

    context.loadProfilePanel();
    assert.equal(context.data.profileDraft.name, "阿力");
    assert.equal(context.data.profileDraft.gender, "男");
    assert.equal(context.data.profileAvatar, "https://xianfeng.xinzhi.info/uploads/avatar.png");
    context.updateProfileName({ detail: { value: "新昵称" } });
    context.chooseProfileGender({ currentTarget: { dataset: { value: "女" } } });
    context.chooseProfileAvatar({ detail: { avatarUrl: "/tmp/new-avatar.png" } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(storage.get("xf_user").name, "新昵称");
    assert.equal(storage.get("xf_user").gender, "女");
    assert.equal(storage.get("xf_user").avatar, "/uploads/new-avatar.png");
    assert.equal(context.data.accountAvatar, "https://xianfeng.xinzhi.info/uploads/new-avatar.png");
    context.returnSettingsMenu();
    assert.equal(context.data.settingsPanelView, "menu");
    assert.equal(context.data.accountAvatar, "https://xianfeng.xinzhi.info/uploads/new-avatar.png");
    assert.match(context.data.profilePanelMessage, /资料已保存/);
    context.removeProfileAvatar();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(storage.get("xf_user").avatar, "");
    assert.equal(context.data.profileAvatar, "/assets/tabbar/xiaowanzi.png");
    context.handleProfileAvatarError();
    assert.equal(context.data.profileAvatar, "/assets/tabbar/xiaowanzi.png");
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
  }
});

test("shared native settings profile panel edits archives and opens memory manager in place", () => {
  const nativeSettings = require("../utils/nativeSettings.js");
  const storage = new Map();
  const context = {
    data: {
      settingsProfilePanelSupported: true,
      archiveDraft: {
        id: "child-1",
        relation: "儿子",
        displayName: "",
        gender: "男",
        birthDate: "",
        city: "上海",
        region: "",
        grade: "学前小班",
        concernTags: []
      },
      archiveHasChildren: false,
      archiveStage: "学前",
      archiveGradeName: "小班",
      archiveRegionOptions: ["静安区", "徐汇区"],
      archiveGradeOptions: ["小班", "中班"],
      archiveStageOptions: [
        { value: "学前", selected: true },
        { value: "小学", selected: false },
        { value: "初中", selected: false },
        { value: "高中", selected: false }
      ],
      memoryItems: [],
      memorySearchQuery: ""
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    ...nativeSettings.createNativeSettingsMethods()
  };
  const originalWx = global.wx;

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      switchTab() {}
    };

    context.updateArchiveName({ detail: { value: "小圆子" } });
    assert.equal(context.data.archiveDraft.displayName, "小圆子");
    context.chooseArchiveBirthDate({ detail: { value: "2022-01-02" } });
    assert.equal(context.data.archiveDraft.birthDate, "2022-01-02");
    context.chooseArchiveRelation({ currentTarget: { dataset: { value: "女儿" } } });
    assert.equal(context.data.archiveDraft.relation, "女儿");
    assert.equal(context.data.archiveDraft.gender, "女");
    context.chooseArchiveRegion({ detail: { value: 1 } });
    assert.equal(context.data.archiveDraft.region, "徐汇区");
    context.updateArchiveStageGradeColumn({ detail: { column: 0, value: 5 } });
    assert.deepEqual(context.data.archiveStageGradeValue, [5, 0]);
    assert.deepEqual(context.data.archiveStageGradeColumns[1], ["高一年级", "高二年级", "高三年级"]);
    context.chooseArchiveStageGrade({ detail: { value: [5, 1] } });
    assert.equal(context.data.archiveStage, "高中");
    assert.equal(context.data.archiveStageIndex, 5);
    assert.equal(context.data.archiveGradeIndex, 1);
    assert.equal(context.data.archiveDraft.grade, "高二年级");
    context.updateArchiveStageGradeColumn({ detail: { column: 0, value: 3 } });
    assert.deepEqual(context.data.archiveStageGradeValue, [3, 0]);
    assert.deepEqual(context.data.archiveStageGradeColumns[1], ["一年级", "二年级", "三年级", "四年级", "五年级"]);
    context.chooseArchiveStageGrade({ detail: { value: [3, 2] } });
    assert.equal(context.data.archiveStage, "小学");
    assert.equal(context.data.archiveStageIndex, 3);
    assert.equal(context.data.archiveGradeName, "三年级");
    assert.equal(context.data.archiveGradeIndex, 2);
    assert.equal(context.data.archiveDraft.grade, "小学三年级");
    context.saveArchivePanel();
    assert.match(context.data.profilePanelMessage, /档案已保存/);

    context.addArchiveChild();
    assert.equal(context.data.archiveDraft.displayName, "");
    assert.equal(context.data.archiveDraft.city, "");
    assert.equal(context.data.archiveDraft.region, "");
    assert.equal(context.data.archiveDraft.grade, "");
    assert.equal(context.data.archiveStage, "");
    assert.equal(context.data.archiveGradeName, "");
    assert.equal(context.data.archiveGradeDisplayText, "请选择年级");
    assert.deepEqual(context.data.archiveRegionOptions, []);
    context.updateArchiveCity({ detail: { value: "上海" } });
    assert.equal(context.data.archiveDraft.city, "上海");
    assert.equal(context.data.archiveDraft.region, "");
    assert.equal(context.data.archiveDraft.grade, "");
    assert.equal(context.data.archiveHasChildren, true);
    assert.equal(context.data.archiveChildren.length, 2);
    assert.equal(context.data.archiveChildren[1].selected, true);
    assert.equal(context.data.archiveStageIndex, 0);
    assert.equal(context.data.archiveGradeIndex, 0);
    context.updateArchiveName({ detail: { value: "小圆子" } });
    context.chooseArchiveBirthDate({ detail: { value: "2023-03-04" } });
    context.chooseArchiveStageGrade({ detail: { value: [0, 2] } });
    context.saveArchivePanel();
    assert.match(context.data.profilePanelMessage, /孩子名字不能重复/);
    assert.equal(storage.get("xf_child_profiles").length, 1);

    context.addArchiveChild();
    assert.equal(context.data.archiveChildren.length, 2);
    assert.equal(context.data.archiveChildren[1].selected, true);
    assert.match(context.data.profilePanelMessage, /请先完善当前未命名档案/);

    context.openMemoryManager();
    assert.equal(context.data.settingsPanelOpen, true);
    assert.equal(context.data.settingsPanelView, "menu");
  } finally {
    global.wx = originalWx;
  }
});

test("shared native settings archive panel deletes the current child after confirmation", () => {
  const nativeSettings = require("../utils/nativeSettings.js");
  const { CHILD_PROFILES_KEY, WEB_CHILD_PROFILES_KEY } = require("../utils/profileState.js");
  const storage = new Map([
    [CHILD_PROFILES_KEY, [
      { id: "child-1", relation: "儿子", displayName: "小圆", gender: "男", birthDate: "2020-01-02", city: "上海", region: "静安区", grade: "学前小班", concernTags: [] },
      { id: "child-2", relation: "女儿", displayName: "小满", gender: "女", birthDate: "2021-02-03", city: "上海", region: "徐汇区", grade: "学前中班", concernTags: [] }
    ]],
    ["xiaowanzi_last_child_id_v1", "child-2"]
  ]);
  const modalCalls = [];
  const context = {
    data: { settingsProfilePanelSupported: true },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    ...nativeSettings.createNativeSettingsMethods()
  };
  const originalWx = global.wx;

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      showModal(options) {
        modalCalls.push(options);
        options.success({ confirm: true });
      }
    };

    context.loadArchivePanel();
    assert.equal(context.data.archiveDraft.id, "child-2");
    context.deleteArchiveChild();

    assert.equal(modalCalls.length, 1);
    assert.equal(modalCalls[0].title, "删除孩子档案");
    assert.equal(modalCalls[0].confirmText, "删除");
    assert.deepEqual(storage.get(CHILD_PROFILES_KEY).map((child) => child.id), ["child-1"]);
    assert.deepEqual(JSON.parse(storage.get(WEB_CHILD_PROFILES_KEY)).map((child) => child.id), ["child-1"]);
    assert.equal(storage.get("xiaowanzi_last_child_id_v1"), "child-1");
    assert.equal(context.data.archiveDraft.id, "child-1");
    assert.equal(context.data.archiveChildren.length, 1);
    assert.match(context.data.profilePanelMessage, /孩子档案已删除/);
  } finally {
    global.wx = originalWx;
  }
});

test("standalone archive page uses a linked stage and grade picker", () => {
  const definition = loadPageDefinition("mine/archive");
  const storage = new Map([
    ["xiaowanzi_child_profiles_v1", [
      { id: "child-a", relation: "儿子", displayName: "一一", gender: "男", birthDate: "2020-01-02", city: "上海", region: "静安区", grade: "学前小班", concernTags: [] }
    ]]
  ]);
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  const originalWx = global.wx;

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      }
    };

    definition.loadProfile.call(context);
    definition.updateStageGradeColumn.call(context, { detail: { column: 0, value: 5 } });
    assert.deepEqual(context.data.stageGradeValue, [5, 0]);
    assert.deepEqual(context.data.stageGradeColumns[1], ["高一年级", "高二年级", "高三年级"]);
    definition.chooseStageGrade.call(context, { detail: { value: [5, 2] } });
    assert.equal(context.data.stage, "高中");
    assert.equal(context.data.gradeName, "高三年级");
    assert.equal(context.data.draft.grade, "高三年级");

    definition.updateStageGradeColumn.call(context, { detail: { column: 0, value: 4 } });
    assert.deepEqual(context.data.stageGradeValue, [4, 0]);
    assert.deepEqual(context.data.stageGradeColumns[1], ["六年级（预初）", "七年级", "八年级", "九年级"]);
    definition.chooseStageGrade.call(context, { detail: { value: [4, 1] } });
    assert.equal(context.data.stage, "初中");
    assert.equal(context.data.gradeName, "七年级");
    assert.equal(context.data.draft.grade, "初中七年级");
  } finally {
    global.wx = originalWx;
  }
});

test("standalone archive page opens an add-child draft from explicit action", () => {
  const { CHILD_PROFILES_KEY } = require("../utils/profileState.js");
  const definition = loadPageDefinition("mine/archive");
  const storage = new Map([
    [CHILD_PROFILES_KEY, [
      { id: "child-a", relation: "儿子", displayName: "一一", gender: "男", birthDate: "2020-01-02", city: "上海", region: "静安区", grade: "学前小班", concernTags: [] }
    ]],
    ["xiaowanzi_last_child_id_v1", "child-a"]
  ]);
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  const originalWx = global.wx;

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      showShareMenu() {
        return undefined;
      }
    };

    definition.onLoad.call(context, { action: "add" });
    const draftId = context.data.draft.id;
    assert.equal(context.data.draft.displayName, "");
    assert.equal(context.data.draft.city, "");
    assert.equal(context.data.draft.region, "");
    assert.equal(context.data.draft.grade, "");
    assert.equal(context.data.stage, "");
    assert.equal(context.data.gradeName, "");
    assert.equal(context.data.gradeDisplayText, "请选择年级");
    assert.deepEqual(context.data.regionOptions, []);
    definition.updateCity.call(context, { detail: { value: "上海" } });
    assert.equal(context.data.draft.city, "上海");
    assert.equal(context.data.draft.region, "");
    assert.equal(context.data.draft.grade, "");
    assert.equal(context.data.draft.draft, true);
    assert.equal(context.data.children.length, 2);
    assert.equal(context.data.children[1].selected, true);

    definition.onShow.call(context);
    assert.equal(context.data.draft.id, draftId);
    assert.equal(context.data.children.length, 2);
  } finally {
    global.wx = originalWx;
  }
});

test("standalone archive page rejects duplicate child names", () => {
  const { CHILD_PROFILES_KEY, WEB_CHILD_PROFILES_KEY } = require("../utils/profileState.js");
  const definition = loadPageDefinition("mine/archive");
  const storage = new Map([
    [CHILD_PROFILES_KEY, [
      { id: "child-a", relation: "儿子", displayName: "一一", gender: "男", birthDate: "2020-01-02", city: "上海", region: "静安区", grade: "学前小班", concernTags: [] }
    ]],
    ["xiaowanzi_last_child_id_v1", "child-a"]
  ]);
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  const originalWx = global.wx;

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      }
    };

    definition.onLoad.call(context, { action: "add" });
    definition.updateName.call(context, { detail: { value: "一一" } });
    definition.chooseBirthDate.call(context, { detail: { value: "2021-02-03" } });
    definition.chooseStageGrade.call(context, { detail: { value: [0, 2] } });
    definition.saveProfile.call(context);

    assert.match(context.data.message, /孩子名字不能重复/);
    assert.equal(storage.get(CHILD_PROFILES_KEY).length, 1);
    assert.equal(storage.get(WEB_CHILD_PROFILES_KEY), undefined);
  } finally {
    global.wx = originalWx;
  }
});

test("standalone archive page deletes the current child after confirmation", () => {
  const { CHILD_PROFILES_KEY, WEB_CHILD_PROFILES_KEY } = require("../utils/profileState.js");
  const definition = loadPageDefinition("mine/archive");
  const storage = new Map([
    [CHILD_PROFILES_KEY, [
      { id: "child-a", relation: "儿子", displayName: "一一", gender: "男", birthDate: "2020-01-02", city: "上海", region: "静安区", grade: "学前小班", concernTags: [] },
      { id: "child-b", relation: "女儿", displayName: "二二", gender: "女", birthDate: "2021-02-03", city: "上海", region: "徐汇区", grade: "学前中班", concernTags: [] }
    ]],
    ["xiaowanzi_last_child_id_v1", "child-b"]
  ]);
  const modalCalls = [];
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  const originalWx = global.wx;

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      showModal(options) {
        modalCalls.push(options);
        options.success({ confirm: true });
      }
    };

    definition.loadProfile.call(context);
    assert.equal(context.data.draft.id, "child-b");
    definition.deleteChild.call(context);

    assert.equal(modalCalls.length, 1);
    assert.equal(modalCalls[0].title, "删除孩子档案");
    assert.deepEqual(storage.get(CHILD_PROFILES_KEY).map((child) => child.id), ["child-a"]);
    assert.deepEqual(JSON.parse(storage.get(WEB_CHILD_PROFILES_KEY)).map((child) => child.id), ["child-a"]);
    assert.equal(storage.get("xiaowanzi_last_child_id_v1"), "child-a");
    assert.equal(context.data.draft.id, "child-a");
    assert.equal(context.data.children.length, 1);
    assert.match(context.data.message, /孩子档案已删除/);
  } finally {
    global.wx = originalWx;
  }
});

test("hamburger profile entries only use fallback routes when the current panel cannot render profile views", () => {
  const nativeSettings = require("../utils/nativeSettings.js");
  const navigations = [];
  const context = {
    data: {},
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    ...nativeSettings.createNativeSettingsMethods()
  };
  const originalWx = global.wx;
  const originalGetCurrentPages = global.getCurrentPages;

  try {
    global.wx = {
      getStorageSync() {
        return "";
      },
      navigateTo(options) {
        navigations.push(options);
      },
      switchTab(options) {
        navigations.push(options);
      }
    };
    global.getCurrentPages = () => [{ route: "pages/programs/index" }];

    for (const [sectionIndex, itemIndex, url] of [
      [0, 1, "/pages/mine/archive/index?from=settings"],
      [4, 0, "/pages/mine/memory/index?from=settings"]
    ]) {
      context.openSettings();
      assert.equal(context.data.settingsPanelOpen, true);
      assert.equal(context.data.settingsPanelView, "menu");

      context.openSettingsItem({ currentTarget: { dataset: { sectionIndex, itemIndex } } });
      assert.equal(context.data.settingsPanelOpen, false);
      assert.equal(context.data.settingsPanelView, "menu");
      assert.deepEqual(navigations.at(-1), { url });
    }

    context.openSettings();
    context.openSettingsItem({ currentTarget: { dataset: { sectionIndex: 5, itemIndex: 0 } } });
    assert.equal(context.data.settingsPanelOpen, false);
    assert.equal(context.data.settingsPanelView, "menu");
    const settingsPanel = decodeWebviewNavigation(navigations.at(-1));
    assert.equal(settingsPanel.pathname, "/");
    assert.equal(settingsPanel.searchParams.get("xf_panel"), "settings");
  } finally {
    global.wx = originalWx;
    global.getCurrentPages = originalGetCurrentPages;
  }
});

test("mama haozhuan opens a native mini program form instead of program detail webview", () => {
  const appJson = JSON.parse(fs.readFileSync(new URL("../app.json", import.meta.url), "utf8"));
  const page = readPage("mama-resource-apply");
  const nativeSettings = require("../utils/nativeSettings.js");
  const navigations = [];
  const context = {
    data: {},
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    ...nativeSettings.createNativeSettingsMethods()
  };
  const originalWx = global.wx;
  const originalGetCurrentPages = global.getCurrentPages;

  try {
    global.wx = {
      navigateTo(options) {
        navigations.push(options);
      },
      switchTab(options) {
        navigations.push(options);
      },
      loadFontFace() {},
      getStorageSync() {
        return "";
      }
    };
    global.getCurrentPages = () => [{ route: "pages/programs/index" }];

    context.openSettingsItem({ currentTarget: { dataset: { sectionIndex: 0, itemIndex: 1 } } });
    assert.deepEqual(navigations, [{ url: "/pages/mine/archive/index?from=settings" }]);
    navigations.length = 0;

    context.openSettingsItem({ currentTarget: { dataset: { sectionIndex: 3, itemIndex: 3 } } });

    assert.deepEqual(navigations, [{ url: "/pages/mama-resource-apply/index?from=settings" }]);
    assert.equal(appJson.pages.includes("pages/mama-resource-apply/index"), true);
    assert.equal(page.json.navigationStyle, "custom");
    assert.equal(page.wxml.includes("bindtap=\"openProgram\""), false);
    assert.equal(page.wxml.includes("<web-view"), false);
    assert.match(page.wxml, /class="xf-mama-page \{\{fontSizeClass\}\}" style="padding-top: \{\{chromeHeight\}\}px;"/);
    assert.match(page.wxml, /class="xf-native-topbar" style="height: \{\{topbarHeight\}\}px;"/);
    assert.match(page.wxml, /class="xf-native-menu-button xf-native-back-button" style="top: \{\{backTop\}\}px; width: \{\{backSize\}\}px; height: \{\{backSize\}\}px;" catchtap="goBack" role="button" aria-label="返回"/);
    assert.match(page.wxml, /class="xf-native-back-icon" aria-hidden="true"/);
    assert.doesNotMatch(page.wxml, /wx:else class="xf-native-menu-button" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;" catchtap="openSettings" role="button" aria-label="打开设置"/);
    assert.match(page.wxml, /class="xf-native-logo" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;" src="\/assets\/nav\/logo\.png" mode="aspectFit" bindtap="goProgramsHome" aria-label="回到顶部"/);
    assert.match(page.js, /goProgramsHome: navigateProgramsHome/);
    assert.match(page.js, /goProgramsHome\(\)\s*\{[\s\S]*navigateProgramsHome\(\);[\s\S]*\}/);
    assert.match(page.js, /launchedFromSettings: false/);
    assert.match(page.js, /backTop: 8/);
    assert.match(page.js, /backSize: 32/);
    assert.doesNotMatch(page.js, /smartBackHome|ensureBackStackForBackButtonPage/);
    assert.match(page.js, /goBack\(\)\s*\{[\s\S]*mamaResourceView === "apply" && profile\.status === "approved"[\s\S]*mamaResourceView: "tasks"[\s\S]*pages\.length > 1[\s\S]*wx\.navigateBack\(\{ delta: 1 \}\)[\s\S]*wx\.exitMiniProgram\(\)[\s\S]*\}/);
    assert.match(page.wxml, /wx:if="\{\{settingsPanelOpen\}\}" class="xf-native-settings-mask" style="height: \{\{settingsPanelHeight\}\}px;" catchtap="closeSettings"/);
    assert.match(page.wxml, /wx:for="\{\{settingsSections\}\}"/);
    assert.doesNotMatch(page.wxml, /xf-mama-back/);
    assert.match(page.wxml, /wx:if="\{\{!isLoggedIn\}\}"[\s\S]*登录后进入好赚[\s\S]*open-type="getPhoneNumber"[\s\S]*bindgetphonenumber="authorizeMamaResourceAction"[\s\S]*wx:elif="\{\{mamaResourceView === 'apply'\}\}"/);
    assert.match(page.wxml, /xf-mama-intro-card[\s\S]*好赚[\s\S]*<view class="xf-mama-card xf-mama-profile-manager">[\s\S]*资料管理[\s\S]*保存资料/);
    assert.doesNotMatch(page.wxml, /<view class="xf-mama-card">[\s\S]*<form class="xf-mama-form" bindsubmit="submit">\s*<view class="xf-mama-head">\s*<image class="xf-mama-icon"/);
    assert.match(page.wxml, /运营会按备注联系你。/);
    assert.doesNotMatch(page.wxml, /我同意家和万事团队为发稿资源匹配和运营联系使用以上资料/);
    assert.doesNotMatch(page.wxml, /我同意家长先疯为发稿资源匹配/);
    assert.match(page.wxml, /<input name="displayName"[\s\S]*placeholder-class="xf-mama-placeholder"/);
    assert.match(page.wxml, /账号定位[\s\S]*<textarea name="accountPositioning"[\s\S]*placeholder-class="xf-mama-textarea-placeholder"/);
    assert.match(page.wxml, /微信号[\s\S]*name="contactWechat"[\s\S]*优先通过微信添加[\s\S]*手机号[\s\S]*name="contactPhone"[\s\S]*备用联系电话/);
    assert.match(page.wxml, /孩子档案[\s\S]*wx:if="\{\{hasArchiveChildren\}\}"[\s\S]*openChildArchive[\s\S]*\{\{archiveChildrenText\}\}[\s\S]*wx:else[\s\S]*openChildCreate">添加孩子/);
    assert.doesNotMatch(page.wxml, /孩子阶段|孩子性别/);
    assert.doesNotMatch(page.wxml, /bindchange="selectChildStage"|catchtap="toggleChildGender"/);
    assert.match(page.js, /value: "男孩"[\s\S]*value: "女孩"/);
    assert.doesNotMatch(page.wxml, /bindchange="selectChildGender"|请选择孩子性别/);
    assert.doesNotMatch(page.wxml, /报价区间|可接频率|历史案例链接/);
    assert.doesNotMatch(page.wxml, /rateRange|availability|caseLinksText/);
    assert.match(page.wxml, /资料管理[\s\S]*catchtap="openPreferenceEditor"[\s\S]*catchtap="openPersonalInfoEditor"[\s\S]*catchtap="openMediaAccountsManager"[\s\S]*catchtap="submitProfileDraft"/);
    assert.match(page.wxml, /bindsubmit="savePersonalInfo"[\s\S]*bindsubmit="savePreferences"/);
    assert.doesNotMatch(page.wxml, /bindsubmit="submit"/);
    assert.match(page.wxml, /可发品类[\s\S]*class="xf-mama-chip \{\{item\.selected \? 'is-active' : ''\}\}"/);
    assert.match(page.wxml, /data-category="\{\{item\.label\}\}"[\s\S]*catchtap="toggleCategory"/);
    assert.doesNotMatch(page.wxml, /<checkbox-group name="categories"/);
    assert.match(page.js, /getNativeTopbarMetrics/);
    assert.match(page.js, /function buildCategoryOptions\(selectedCategories\)/);
    assert.match(page.js, /selectedCategories: \[\]/);
    assert.match(page.js, /toggleCategory\(event\)/);
    assert.match(page.js, /categories: this\.data\.selectedCategories/);
    assert.doesNotMatch(page.js, /rateRange|availability|caseLinksText/);
    assert.match(page.js, /SETTINGS_SECTIONS/);
    assert.match(page.js, /settingsSections: SETTINGS_SECTIONS/);
    assert.match(page.js, /syncTopbarMetrics\(\)/);
    assert.match(page.js, /\.\.\.createNativeSettingsMethods\(\)/);
    assert.match(page.wxss, /@import "\.\.\/\.\.\/styles\/native-list\.wxss";/);
    assert.match(page.wxss, /\.xf-mama-content \{[\s\S]*box-sizing: border-box;[\s\S]*width: 100%;[\s\S]*padding: 24rpx 28rpx 52rpx;/);
    assert.doesNotMatch(page.wxss, /\.xf-mama-topbar/);
    assert.doesNotMatch(page.wxss, /\.xf-mama-back/);
    assert.match(page.wxss, /\.xf-mama-intro-card,\s*\.xf-mama-card \{[\s\S]*box-sizing: border-box;[\s\S]*width: 100%;/);
    assert.match(page.wxss, /\.xf-mama-card \{[\s\S]*margin-top: 48rpx;/);
    assert.match(page.wxss, /\.xf-mama-form \{[\s\S]*display: block;/);
    assert.match(page.wxss, /\.xf-mama-notes \{[\s\S]*gap: 24rpx;[\s\S]*margin-top: 32rpx;/);
    assert.match(page.wxss, /\.xf-mama-notes text \{[\s\S]*min-height: 104rpx;[\s\S]*padding: 0 28rpx;[\s\S]*border-radius: 32rpx;[\s\S]*display: flex;[\s\S]*align-items: center;/);
    assert.match(page.wxss, /\.xf-mama-field input,\s*\.xf-mama-picker \{[\s\S]*height: 78rpx;[\s\S]*min-height: 78rpx;[\s\S]*line-height: 78rpx;[\s\S]*padding: 0 22rpx;/);
    assert.match(page.wxss, /\.xf-mama-field textarea \{[\s\S]*height: 80rpx;[\s\S]*min-height: 80rpx;[\s\S]*line-height: 1\.5;[\s\S]*padding: 20rpx 22rpx;/);
    assert.match(page.wxss, /\.xf-mama-textarea-placeholder \{[\s\S]*font-size: 26rpx;[\s\S]*font-weight: 600;[\s\S]*line-height: 40rpx;/);
    assert.match(page.wxss, /\.xf-mama-chip \{[\s\S]*min-height: 62rpx;[\s\S]*border-radius: 999rpx;[\s\S]*background: #ffffff;[\s\S]*font-size: 27rpx;/);
    assert.match(page.wxss, /\.xf-mama-chip\.is-active \{[\s\S]*border-color: #6c27d6;[\s\S]*background: #6c27d6;[\s\S]*color: #ffffff;/);
    assert.doesNotMatch(page.wxss, /\.xf-mama-card \{[\s\S]*margin: 26rpx;/);
    assert.match(page.js, /request\(\{[\s\S]*url: "\/api\/mama-resources\/applications"/);
  } finally {
    global.wx = originalWx;
    global.getCurrentPages = originalGetCurrentPages;
  }
});

test("mama haozhuan does not expose an unscoped private draft while logged out", async () => {
  const definition = loadPageDefinition("mama-resource-apply");
  const originalWx = global.wx;
  const originalGetCurrentPages = global.getCurrentPages;
  const storage = new Map([
    ["xf_mama_resource_apply_draft_v1", { displayName: "上一位用户", contactWechat: "previous-user" }]
  ]);

  try {
    global.wx = {
      loadFontFace() {},
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      removeStorageSync(key) {
        storage.delete(key);
      },
      getWindowInfo() {
        return { statusBarHeight: 20, windowWidth: 375 };
      },
      getMenuButtonBoundingClientRect() {
        return { top: 24, height: 32, left: 281 };
      },
      showShareMenu() {}
    };
    global.getCurrentPages = () => [
      { route: "pages/programs/index" },
      { route: "pages/mama-resource-apply/index" }
    ];
    const context = {
      ...definition,
      data: { ...definition.data },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };

    definition.onLoad.call(context, {});

    assert.equal(context.data.isLoggedIn, false);
    assert.equal(context.data.formDraft.displayName, "");
    assert.equal(context.data.formDraft.contactWechat, "");
    assert.equal(context.data.profileOverview.personalSummary.includes("上一位用户"), false);
    assert.equal(storage.has("xf_mama_resource_apply_draft_v1"), false);

    storage.set("xf_token", "token-user-a");
    storage.set("xf_user", { _id: "user-a", mobile: "13800000000" });
    definition.updateApplyDraft.call(context, { displayName: "当前用户" });

    assert.equal(storage.has("xf_mama_resource_apply_draft_v1"), false);
    assert.equal(storage.get("xf_mama_resource_apply_draft_v1:user-a").displayName, "当前用户");

    storage.set("xf_user", { _id: "user-b", mobile: "13900000000" });
    definition.onLoad.call(context, {});
    assert.equal(context.data.formDraft.displayName, "");

    storage.set("xf_user", { _id: "user-a", mobile: "13800000000" });
    definition.onLoad.call(context, {});
    assert.equal(context.data.formDraft.displayName, "当前用户");
  } finally {
    global.wx = originalWx;
    global.getCurrentPages = originalGetCurrentPages;
  }
});

test("mama haozhuan category chips toggle without checkbox controls", async () => {
  const definition = loadPageDefinition("mama-resource-apply");
  const page = readPage("mama-resource-apply");
  const requests = [];
  const originalWx = global.wx;

  assert.match(page.wxml, /暂不接的品类[\s\S]*name="blockedCategories"/);
  assert.doesNotMatch(page.wxml, /name="consentAccepted"|我同意家和万事团队/);
  assert.match(page.wxml, /name="xiaohongshuProfileUrl"[\s\S]*disabled="\{\{formDraft\.originalXiaohongshuProfileUrl\}\}"/);
  assert.match(page.wxml, /主页链接已锁定，保存时只更新昵称等资料。/);
  assert.doesNotMatch(page.wxml, /acceptsGiftExchange|可以接受产品置换|低预算试单/);
  assert.doesNotMatch(page.js, /acceptsGiftExchange/);
  assert.match(page.wxss, /\.xf-mama-field input\.is-locked \{/);

  try {
    global.wx = {
      loadFontFace() {},
      getStorageSync(key) {
        if (key === "xf_token") return "token-1";
        return "";
      },
      request(options) {
        requests.push(options);
        options.success({ statusCode: 200, data: { ok: true } });
      }
    };
    const context = {
      data: { ...definition.data, childStage: "小学", childGender: "男孩" },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      },
      submitMamaResourcePayload: definition.submitMamaResourcePayload
    };

    definition.toggleCategory.call(context, { currentTarget: { dataset: { category: "亲子阅读" } } });
    definition.toggleCategory.call(context, { currentTarget: { dataset: { category: "学习用品" } } });
    assert.deepEqual(context.data.selectedCategories, ["亲子阅读", "学习用品"]);
    assert.equal(context.data.categories.find((item) => item.label === "亲子阅读").selected, true);
    assert.equal(context.data.categories.find((item) => item.label === "母婴").selected, false);

    definition.toggleChildGender.call(context, { currentTarget: { dataset: { value: "女孩" } } });
    assert.equal(context.data.childGender, "女孩");
    definition.toggleRealNameVerified.call(context, { currentTarget: { dataset: { value: "yes" } } });
    assert.equal(context.data.realNameVerified, true);
    context.setData({ xiaohongshuScreenshotUrl: "/uploads/images/profile.png" });

    definition.toggleCategory.call(context, { currentTarget: { dataset: { category: "亲子阅读" } } });
    assert.deepEqual(context.data.selectedCategories, ["学习用品"]);
    assert.equal(context.data.categories.find((item) => item.label === "亲子阅读").selected, false);

    await definition.submit.call(context, {
      detail: {
        value: {
          displayName: "安安妈妈",
          contactPhone: "13800000000",
          contactWechat: "anan-mom",
          alipayAccount: "anan@example.com",
          alipayVerifiedName: "安安妈妈",
          city: "上海",
          xiaohongshuProfileUrl: "https://www.xiaohongshu.com/user/profile/demo",
          xiaohongshuNickname: "安安妈",
          followerCount: "12800",
          accountPositioning: "亲子阅读",
          rateRange: "300-500/篇",
          availability: "每周 1 篇",
          caseLinksText: "",
          blockedCategories: "",
          consentAccepted: ["1"]
        }
      }
    });

    assert.deepEqual(requests[0].data.categories, ["学习用品"]);
    assert.equal(requests[0].data.followerCount, "12800");
    assert.equal(requests[0].data.alipayAccount, "anan@example.com");
    assert.equal(requests[0].data.alipayVerifiedName, "安安妈妈");
    assert.equal(requests[0].data.realNameVerified, true);
    assert.equal(requests[0].data.xiaohongshuScreenshotUrl, "/uploads/images/profile.png");
    assert.equal("rateRange" in requests[0].data, false);
    assert.equal("availability" in requests[0].data, false);
    assert.equal("caseLinksText" in requests[0].data, false);
    assert.equal("acceptsGiftExchange" in requests[0].data, false);
  } finally {
    global.wx = originalWx;
  }
});

test("mama haozhuan page uploads Xiaohongshu account screenshot from phone", async () => {
  const definition = loadPageDefinition("mama-resource-apply");
  const originalWx = global.wx;
  const uploads = [];

  try {
    global.wx = {
      loadFontFace() {},
      getStorageSync() {
        return "";
      },
      chooseMedia(options) {
        options.success({ tempFiles: [{ tempFilePath: "/tmp/xhs-page.png" }] });
      },
      uploadFile(options) {
        uploads.push(options);
        options.success({ statusCode: 200, data: JSON.stringify({ url: "/uploads/images/profile.png" }) });
      }
    };
    const context = {
      data: { ...definition.data, message: "截图上传失败，请稍后重试", messageType: "error" },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };

    await definition.chooseXiaohongshuScreenshot.call(context);

    assert.match(uploads[0].url, /\/api\/mama-resources\/uploads$/);
    assert.equal(uploads[0].name, "file");
    assert.equal(context.data.xiaohongshuScreenshotUrl, "/uploads/images/profile.png");
    assert.equal(context.data.xiaohongshuScreenshotUploading, false);
    assert.equal(context.data.message, "");
    assert.equal(context.data.messageType, "");
  } finally {
    global.wx = originalWx;
  }
});

test("mama haozhuan keeps an existing screenshot without showing a red upload failure", async () => {
  const definition = loadPageDefinition("mama-resource-apply");
  const originalWx = global.wx;

  try {
    global.wx = {
      loadFontFace() {},
      getStorageSync() {
        return "";
      },
      chooseMedia(options) {
        options.success({ tempFiles: [{ tempFilePath: "/tmp/new-xhs-page.png" }] });
      },
      uploadFile(options) {
        options.fail({ errMsg: "uploadFile:fail timeout" });
      }
    };
    const context = {
      data: {
        ...definition.data,
        xiaohongshuScreenshotUrl: "/uploads/images/old-profile.png",
        formDraft: { ...definition.data.formDraft, xiaohongshuScreenshotUrl: "/uploads/images/old-profile.png" }
      },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };

    await definition.chooseXiaohongshuScreenshot.call(context);

    assert.equal(context.data.xiaohongshuScreenshotUrl, "/uploads/images/old-profile.png");
    assert.equal(context.data.message, "");
    assert.equal(context.data.messageType, "");
  } finally {
    global.wx = originalWx;
  }
});

test("mama haozhuan task list shows traffic fee and live promotion count", async () => {
  const definition = loadPageDefinition("mama-resource-apply");
  const page = readPage("mama-resource-apply");
  const originalWx = global.wx;

  assert.match(page.wxml, /xf-mama-task-price-group[\s\S]*任务单价[\s\S]*\{\{item\.unitPriceText\}\}[\s\S]*wx:if="\{\{item\.hasTrafficFee\}\}"[\s\S]*投流补贴 \{\{item\.trafficFeeText\}\}/);
  assert.match(page.wxml, /xf-mama-task-stats[\s\S]*\{\{item\.statusText\}\}[\s\S]*推广 \{\{item\.promotionCountText\}\} 人[\s\S]*\{\{item\.remainingClaimText\}\}/);
  assert.match(page.wxml, /项目价格[\s\S]*价格[\s\S]*投流补贴[\s\S]*结算周期/);
  assert.match(page.wxml, /\{\{currentMamaTask\.unitPriceText\}\}[\s\S]*\{\{currentMamaTask\.hasTrafficFee \? currentMamaTask\.trafficFeeText : "-"\}\}[\s\S]*\{\{currentMamaTask\.settlementCycle \|\| "T\+9"\}\}/);
  assert.doesNotMatch(page.wxml, /数据周期/);
  assert.doesNotMatch(page.wxml, /xf-mama-cost-row/);
  assert.match(page.wxml, /推广 \{\{item\.promotionCountText\}\} 人/);
  assert.match(page.js, /activePromotionCount/);

  try {
    global.wx = {
      loadFontFace() {},
      getStorageSync(key) {
        if (key === "xf_token") return "token-1";
        return "";
      },
      request(options) {
        options.success({
          statusCode: 200,
          data: {
            profile: {
              status: "approved",
              displayName: "安安妈妈",
              categories: ["亲子阅读"],
            },
            tasks: [
              {
                _id: "assignment-1",
                taskId: "task-1",
                title: "迪桑娜评论",
                category: "小红书评论",
                status: "assigned",
                unitPriceCents: 3000,
                trafficFeeCents: 1200,
                promotionCount: 42527,
                activePromotionCount: 2,
                latestDataDate: "2026-06-29T00:00:00.000Z",
              }
            ]
          }
        });
      }
    };
    const context = {
      data: { ...definition.data },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };

    await definition.loadMamaTasks.call(context);

    assert.equal(context.data.mamaResourceView, "tasks");
    assert.equal(context.data.mamaTasks[0].unitPriceText, "¥30.00");
    assert.equal(context.data.mamaTasks[0].trafficFeeText, "¥12.00");
    assert.equal(context.data.mamaTasks[0].hasTrafficFee, true);
    assert.equal(context.data.mamaTasks[0].promotionCountText, "2");
  } finally {
    global.wx = originalWx;
  }
});

test("webview detail page normalizes incoming web URLs with native tabbar height", () => {
  const definition = loadPageDefinition("webview");
  const context = {
    ...definition,
    data: {},
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  definition.onLoad.call(context, {
    title: encodeURIComponent("搜索"),
    url: encodeURIComponent("https://xianfeng.xinzhi.info/search?xf_mp=1")
  });

  const url = new URL(context.data.src);
  assert.equal(context.data.title, "搜索");
  assert.equal(context.data.selected, 0);
  assert.equal(context.data.nativeProgramMode, false);
  assert.equal(Object.hasOwn(context.data, "nativeListPage"), false);
  assert.equal(url.pathname, "/search");
  assert.equal(url.searchParams.get("xf_mp"), "1");
  assert.equal(url.searchParams.has("xf_nav"), false);
  assert.equal(url.searchParams.has("xf_tab"), true);
});

test("webview native book detail restores related books from current native cache", async () => {
  const definition = loadPageDefinition("webview");
  const originalWx = global.wx;
  const storage = new Map([
    [
      "xf_native_book_detail:book-cache-current",
      {
        _id: "book-cache-current",
        title: "缓存里的本地图书",
        author: "作者甲",
        sourceName: "家庭教育",
        categoryLabel: "教育",
        topic: "亲子关系"
      }
    ],
    [
      "xf_native_books_cache_v6",
      [
        {
          _id: "book-cache-current",
          title: "缓存里的本地图书",
          author: "作者甲",
          sourceName: "家庭教育",
          categoryLabel: "教育",
          topic: "亲子关系"
        },
        {
          _id: "book-cache-related",
          title: "缓存里的相关图书",
          author: "作者乙",
          sourceName: "家庭教育",
          categoryLabel: "教育",
          topic: "亲子关系"
        }
      ]
    ]
  ]);
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      request(options) {
        options.fail({ errMsg: "offline" });
      }
    };

    await definition.onLoad.call(context, {
      title: encodeURIComponent("及阅详情"),
      url: encodeURIComponent("https://xianfeng.xinzhi.info/reading/book-cache-current?xf_mp=1")
    });

    assert.equal(context.data.nativeBook.hasRelatedBooks, true);
    assert.equal(context.data.nativeBook.relatedBooks[0].title, "缓存里的相关图书");
  } finally {
    global.wx = originalWx;
  }
});

test("native topic detail loads the first knowledge node and reuses its cache", async () => {
  const definition = loadPageDefinition("webview");
  const originalWx = global.wx;
  const requests = [];
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync() {
        return "";
      },
      setNavigationBarTitle() {},
      request(options) {
        requests.push(options.url);
        if (options.url.includes("/api/topic-hub/topic-1/nodes/node-1")) {
          options.success({
            statusCode: 200,
            data: {
              node: {
                id: "node-1",
                nodeKey: "node-1",
                title: "阅读不是自动转化",
                summary: "需要主动加工。",
                content: "完整节点正文"
              },
              questions: [{ id: "question-1", content: "如何做主动输出训练？" }]
            }
          });
          return;
        }
        if (options.url.includes("/api/topic-hub/topic-1?userId=user-1")) {
          options.success({
            statusCode: 200,
            data: {
              topic: { slug: "topic-1", title: "阅读与写作" },
              tree: [{
                id: "branch-1",
                title: "认知篇",
                children: [{ id: "node-1", nodeKey: "node-1", title: "阅读不是自动转化", summary: "需要主动加工。" }]
              }]
            }
          });
          return;
        }
        options.fail({ errMsg: `unexpected request: ${options.url}` });
      }
    };

    await definition.onLoad.call(context, {
      nativeTopic: "1",
      topicSlug: "topic-1",
      userId: "user-1",
      title: encodeURIComponent("请教一下")
    });

    assert.equal(context.data.nativeTopicMode, true);
    assert.equal(context.data.nativeTopic.slug, "topic-1");
    assert.equal(context.data.activeTopicNodeKey, "node-1");
    assert.equal(context.data.activeTopicNode.content, "完整节点正文");
    assert.deepEqual(context.data.activeTopicNode.questions, [
      { id: "question-1", content: "如何做主动输出训练？" }
    ]);
    assert.equal(requests.some((url) => url.includes("/api/topic-hub/topic-1?userId=user-1")), true);
    assert.equal(requests.some((url) => url.includes("/api/topic-hub/topic-1/nodes/node-1?userId=user-1")), true);

    const requestCount = requests.length;
    await definition.loadNativeTopicNode.call(context, "node-1");
    assert.equal(requests.length, requestCount);
    assert.deepEqual(context.data.nativeTopicNodeCache["node-1"].questions, [
      { id: "question-1", content: "如何做主动输出训练？" }
    ]);
  } finally {
    global.wx = originalWx;
  }
});

test("native topic detail hydrates cached topic and first node before network returns", async () => {
  const definition = loadPageDefinition("webview");
  const originalWx = global.wx;
  const pending = [];
  const storage = new Map([
    ["xf_native_topic_detail_cache:topic-1:user-1", {
      version: 1,
      cachedAt: Date.now(),
      userId: "user-1",
      slug: "topic-1",
      detailResponse: {
        topic: { slug: "topic-1", title: "阅读积累" },
        tree: [{ title: "认知篇", children: [{ nodeKey: "node-1", title: "断层本质", summary: "缓存摘要" }] }]
      },
      firstNodeKey: "node-1",
      firstNodeResponse: {
        node: { nodeKey: "node-1", title: "断层本质", content: "缓存节点正文" },
        questions: [{ id: "q1", content: "缓存问题" }]
      }
    }]
  ]);
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      setNavigationBarTitle() {},
      request(options) {
        pending.push(options);
      }
    };

    const loadPromise = definition.onLoad.call(context, {
      nativeTopic: "1",
      topicSlug: "topic-1",
      userId: "user-1",
      title: encodeURIComponent("请教一下")
    });

    assert.equal(context.data.nativeTopicLoading, false);
    assert.equal(context.data.nativeTopic.slug, "topic-1");
    assert.equal(context.data.activeTopicNodeKey, "node-1");
    assert.equal(context.data.activeTopicNode.content, "缓存节点正文");
    assert.equal(context.data.activeTopicNode.questions[0].content, "缓存问题");

    pending[0].success({
      statusCode: 200,
      data: {
        topic: { slug: "topic-1", title: "阅读积累" },
        tree: [{ title: "认知篇", children: [{ nodeKey: "node-1", title: "断层本质" }] }]
      }
    });
    await Promise.resolve();
    pending[1].success({
      statusCode: 200,
      data: { node: { nodeKey: "node-1", title: "断层本质", content: "刷新后的正文" } }
    });
    await loadPromise;
    assert.equal(context.data.activeTopicNode.content, "刷新后的正文");
  } finally {
    global.wx = originalWx;
  }
});

test("native topic detail decodes encoded route slugs before requesting the backend", async () => {
  const definition = loadPageDefinition("webview");
  const originalWx = global.wx;
  const requests = [];
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync() {
        return "";
      },
      setStorageSync() {},
      setNavigationBarTitle() {},
      request(options) {
        requests.push(options.url);
        if (options.url.includes("/api/topic-hub/%E9%98%85%E8%AF%BB%E7%A7%AF%E7%B4%AF?userId=user-1")) {
          options.success({
            statusCode: 200,
            data: {
              topic: { slug: "阅读积累", title: "阅读积累" },
              tree: [{ title: "认知篇", children: [{ nodeKey: "node-1", title: "断层本质" }] }]
            }
          });
          return;
        }
        if (options.url.includes("/api/topic-hub/%E9%98%85%E8%AF%BB%E7%A7%AF%E7%B4%AF/nodes/node-1?userId=user-1")) {
          options.success({
            statusCode: 200,
            data: { node: { nodeKey: "node-1", title: "断层本质", content: "正文" } }
          });
          return;
        }
        options.fail({ errMsg: `unexpected request: ${options.url}` });
      }
    };

    await definition.onLoad.call(context, {
      nativeTopic: "1",
      topicSlug: encodeURIComponent("阅读积累"),
      userId: "user-1",
      title: encodeURIComponent("请教一下")
    });

    assert.equal(requests.some((url) => url.includes("%25E9%2598%2585")), false);
    assert.equal(context.data.nativeTopic.slug, "阅读积累");
    assert.equal(context.data.activeTopicNode.content, "正文");
  } finally {
    global.wx = originalWx;
  }
});

test("native topic node content renders mobile Markdown emphasis, summary blocks, and ordered points", async () => {
  const definition = loadPageDefinition("webview");
  const { js, wxml, wxss } = readPage("webview");
  const originalWx = global.wx;
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };
  const longDetail = "站内资料中有一个极具操作性的案例：夏老师训练初中生作文时，会给出文章的一半，要求学生用特定口吻续写后半部分。这种练习直接训练学生对原作者风格、用词和审美鉴赏的迁移能力；他指出，迁移能力是所有阅读能力的最高层级，也是现在孩子最缺的；比如孩子写北京夜景只会说很美，是因为学了灯光璀璨却不知道如何迁移使用；这种训练比单纯背范文更接近真实表达。";

  assert.match(js, /function buildNativeTopicContentParts\(content\)/);
  assert.match(wxml, /wx:for="\{\{activeTopicNode\.contentParts\}\}" wx:for-item="part"/);
  assert.doesNotMatch(wxml, /class="xf-topic-detail-content-text">\{\{activeTopicNode\.expandedContent \|\| activeTopicNode\.content\}\}<\/text>/);
  assert.match(wxml, /class="xf-topic-detail-md-strong">\{\{inline\.text\}\}<\/text>/);
  assert.match(wxml, /class="xf-topic-detail-md-label">要点<\/text>/);
  assert.match(wxml, /class="xf-topic-detail-md-number">\{\{part\.index\}\}<\/text>/);
  assert.match(wxss, /\.xf-topic-detail-md-label \{[\s\S]*background: #ede9fe;[\s\S]*color: #7c3aed;/);
  assert.match(wxss, /\.xf-topic-detail-md-summary-card \{[\s\S]*border: 1rpx solid #ede9fe;[\s\S]*background: #faf8ff;/);
  assert.match(wxss, /\.xf-topic-detail-md-number \{[\s\S]*border-radius: 50%;[\s\S]*background: linear-gradient\(135deg, #7c3aed, #6d28d9\);/);

  try {
    global.wx = {
      getStorageSync() {
        return "";
      },
      setStorageSync() {},
      setNavigationBarTitle() {},
      request(options) {
        if (options.url.includes("/api/topic-hub/topic-md/nodes/node-1")) {
          options.success({
            statusCode: 200,
            data: {
              node: {
                nodeKey: "node-1",
                title: "教育是技术",
                content: [
                  "**教育的本质不是灌输知识，而是掌握一门可操作、可迁移的工匠技术。** 夏老师反复强调，教师应归属于工匠类。",
                  "",
                  longDetail,
                  "",
                  "1. 从“分解动作”开始训练：孩子写不出一整篇作文，先练段落。",
                  "2. 把读到的词句迁移到自己的场景里。"
                ].join("\n")
              }
            }
          });
          return;
        }
        if (options.url.includes("/api/topic-hub/topic-md?userId=user-1")) {
          options.success({
            statusCode: 200,
            data: {
              topic: { slug: "topic-md", title: "夏老师教育观点解析" },
              tree: [{ title: "方法篇", children: [{ nodeKey: "node-1", title: "教育是技术" }] }]
            }
          });
          return;
        }
        options.fail({ errMsg: `unexpected request: ${options.url}` });
      }
    };

    await definition.onLoad.call(context, {
      nativeTopic: "1",
      topicSlug: "topic-md",
      userId: "user-1",
      title: encodeURIComponent("请教一下")
    });

    assert.deepEqual(context.data.activeTopicNode.contentParts.map((part) => part.type), [
      "paragraph",
      "spacer",
      "summary",
      "spacer",
      "ordered",
      "ordered"
    ]);
    assert.deepEqual(context.data.activeTopicNode.contentParts[0].inlineParts.map((part) => part.type), ["strong", "text"]);
    assert.equal(context.data.activeTopicNode.contentParts[0].inlineParts[0].text, "教育的本质不是灌输知识，而是掌握一门可操作、可迁移的工匠技术。");
    assert.equal(context.data.activeTopicNode.contentParts[2].summary, "站内资料中有一个极具操作性的案例：夏老师训练初中生作文时，会给出文章的一半，要求学生用特定口吻续写后半部分。");
    assert.equal(context.data.activeTopicNode.contentParts[2].detail.includes("迁移能力是所有阅读能力的最高层级"), true);
    assert.equal(context.data.activeTopicNode.contentParts[4].index, 1);
    assert.equal(context.data.activeTopicNode.contentParts[5].index, 2);
    assert.doesNotMatch(context.data.activeTopicNode.contentParts[0].inlineParts.map((part) => part.text).join(""), /\*\*/);
  } finally {
    global.wx = originalWx;
  }
});

test("native topic detail invalidates not found topics and returns to the topics list", async () => {
  const definition = loadPageDefinition("webview");
  const originalWx = global.wx;
  const storage = new Map();
  const switches = [];
  const toasts = [];
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync() {
        return "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      setNavigationBarTitle() {},
      showToast(options) {
        toasts.push(options);
      },
      switchTab(options) {
        switches.push(options);
      },
      request(options) {
        options.success({ statusCode: 404, data: { error: "未找到该话题" } });
      }
    };

    await definition.onLoad.call(context, {
      nativeTopic: "1",
      topicSlug: "deleted-topic",
      userId: "user-1",
      title: encodeURIComponent("请教一下")
    });

    assert.equal(storage.get("xf_native_topic_invalidated_v1"), "deleted-topic");
    assert.deepEqual(switches, [{ url: "/pages/topics/index" }]);
    assert.equal(toasts[0].title, "话题已失效，已返回请教列表");
    assert.equal(context.data.nativeTopicError, "");
    assert.equal(context.data.nativeTopicLoading, false);
    assert.equal(context.data.nativeTopic, null);
  } finally {
    global.wx = originalWx;
  }
});

test("native topic detail treats empty generated topics as unavailable instead of showing blank retry content", async () => {
  const definition = loadPageDefinition("webview");
  const originalWx = global.wx;
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync() {
        return "";
      },
      setStorageSync() {},
      setNavigationBarTitle() {},
      request(options) {
        options.success({
          statusCode: 200,
          data: {
            topic: { slug: "empty-topic", title: "空话题" },
            tree: []
          }
        });
      }
    };

    await definition.onLoad.call(context, {
      nativeTopic: "1",
      topicSlug: "empty-topic",
      userId: "user-1",
      title: encodeURIComponent("请教一下")
    });

    assert.equal(context.data.nativeTopicLoading, false);
    assert.equal(context.data.nativeTopic, null);
    assert.equal(context.data.activeTopicNode, null);
    assert.equal(context.data.nativeTopicError, "这个话题还在生成中，请稍后从请教列表再进入");
  } finally {
    global.wx = originalWx;
  }
});

test("native topic node view renders selectable content and next-node states", () => {
  const { wxml } = readPage("webview");
  assert.match(wxml, /bindtap="selectNativeTopicNode"/);
  assert.match(wxml, /nativeTopicNodeLoading/);
  assert.match(wxml, /activeTopicNode\.content/);
  assert.match(wxml, /bindtap="enterNextNativeTopicNode"/);
  assert.match(wxml, /已读完当前话题/);
  assert.match(wxml, /bindscrolltolower="onNativeTopicScrollToLower"/);
});

test("final native topic node shows completion only after successful content loading", () => {
  const { wxml } = readPage("webview");
  assert.match(
    wxml,
    /wx:elif="\{\{activeTopicNode && !nativeTopicNodeLoading && !nativeTopicNodeError\}\}" class="xf-topic-detail-complete"/
  );

  const showsCompletion = ({ activeTopicNode, nativeTopicNodeLoading, nativeTopicNodeError }) =>
    !!activeTopicNode && !nativeTopicNodeLoading && !nativeTopicNodeError;
  assert.equal(showsCompletion({ activeTopicNode: null, nativeTopicNodeLoading: true, nativeTopicNodeError: "" }), false);
  assert.equal(showsCompletion({ activeTopicNode: null, nativeTopicNodeLoading: false, nativeTopicNodeError: "加载失败" }), false);
  assert.equal(showsCompletion({ activeTopicNode: { nodeKey: "last" }, nativeTopicNodeLoading: false, nativeTopicNodeError: "" }), true);
});

test("next native topic node only becomes pull-ready after the detail scroll reaches bottom", async () => {
  const definition = loadPageDefinition("webview");
  const context = {
    ...definition,
    data: {
      ...definition.data,
      nativeTopicNodes: [
        { nodeKey: "node-1", title: "第一节" },
        { nodeKey: "node-2", title: "第二节" }
      ],
      activeTopicNodeKey: "node-1"
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    loadNativeTopicNode(nodeKey, options) {
      this.loadedNode = { nodeKey, options };
      return Promise.resolve();
    }
  };
  const touch = (clientY) => ({ touches: [{ clientY }], changedTouches: [{ clientY }] });

  definition.onNativeTopicPullStart.call(context, touch(200));
  definition.onNativeTopicPullMove.call(context, touch(100));
  assert.equal(context.data.nativeTopicPullState, "idle");

  definition.onNativeTopicScrollToLower.call(context);
  definition.onNativeTopicPullStart.call(context, touch(200));
  definition.onNativeTopicPullMove.call(context, touch(120));
  assert.equal(context.data.nativeTopicPullState, "ready");
  await definition.onNativeTopicPullEnd.call(context);
  assert.deepEqual(context.loadedNode, { nodeKey: "node-2", options: { resetScroll: true } });
});

test("native topic expand and ask use the backend contract and merge successful results", async () => {
  const definition = loadPageDefinition("webview");
  const originalWx = global.wx;
  const requests = [];
  const context = {
    ...definition,
    data: {
      ...definition.data,
      nativeTopic: { slug: "topic-1", title: "阅读与写作" },
      nativeTopicUserId: "user-1",
      activeTopicNodeKey: "node-1",
      activeTopicNode: {
        nodeKey: "node-1",
        title: "阅读不是自动转化",
        content: "existing content",
        expandedContent: "",
        questions: []
      },
      nativeTopicNodeCache: {}
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync() { return ""; },
      nextTick(callback) { callback(); },
      request(options) {
        requests.push(options);
        if (options.url.endsWith("/api/topic-hub/topic-1/expand")) {
          options.success({ statusCode: 200, data: { expanded: "expanded content", source: "ai" } });
          return;
        }
        if (options.url.endsWith("/api/topic-hub/topic-1/ask")) {
          options.success({ statusCode: 200, data: { message: "问题已收到", question: "如何训练？", userId: "user-1", questionCount: 1 } });
        }
      }
    };

    await definition.expandNativeTopicNode.call(context);
    definition.updateNativeTopicQuestion.call(context, { detail: { value: "  如何训练？  " } });
    await definition.submitNativeTopicQuestion.call(context);

    const expandRequest = requests.find((item) => item.url.endsWith("/api/topic-hub/topic-1/expand"));
    assert.deepEqual(expandRequest.data, {
      nodeKey: "node-1",
      nodeTitle: "阅读不是自动转化",
      topicTitle: "阅读与写作",
      deep: true,
      existingContent: "existing content"
    });
    const askRequest = requests.find((item) => item.url.endsWith("/api/topic-hub/topic-1/ask"));
    assert.deepEqual(askRequest.data, { question: "如何训练？", userId: "user-1", nodeKey: "node-1" });
    assert.equal(context.data.nativeTopic.slug, "topic-1");
    assert.equal(context.data.activeTopicNode.content, "existing content");
    assert.equal(context.data.activeTopicNode.expandedContent, "expanded content");
    assert.equal(context.data.nativeTopicExpandLoading, false);
    assert.equal(context.data.nativeTopicScrollTarget, "xfTopicExpandAnchor");
    assert.equal(context.data.activeTopicNode.contentParts.some((part) => part.type === "paragraph"), true);
    assert.equal(context.data.nativeTopicQuestionText, "");
    assert.deepEqual(context.data.activeTopicNode.questions, [{
      content: "如何训练？",
      answer: "",
      statusText: "问题已收到"
    }]);
  } finally {
    global.wx = originalWx;
  }
});

test("native topic auth and pro failures preserve content and question input", async () => {
  const definition = loadPageDefinition("webview");
  const originalWx = global.wx;
  let responseStatus = 401;
  let proOpenCount = 0;
  const context = {
    ...definition,
    data: {
      ...definition.data,
      nativeTopic: { slug: "topic-1", title: "阅读与写作" },
      activeTopicNodeKey: "node-1",
      activeTopicNode: { nodeKey: "node-1", title: "节点", content: "existing content", questions: [] },
      nativeTopicQuestionText: "请保留的问题"
    },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    },
    openNativePro() {
      proOpenCount += 1;
    }
  };

  try {
    global.wx = {
      getStorageSync() { return ""; },
      removeStorageSync() {},
      request(options) {
        options.success({
          statusCode: responseStatus,
          data: responseStatus === 401
            ? { error: "登录已过期" }
            : { code: "PRO_REQUIRED", error: "需要 Pro" }
        });
      }
    };

    await definition.submitNativeTopicQuestion.call(context);
    assert.equal(context.data.webviewLoginRequired, true);
    assert.equal(context.data.nativeTopicQuestionText, "请保留的问题");
    assert.equal(context.data.activeTopicNode.content, "existing content");

    responseStatus = 402;
    await definition.expandNativeTopicNode.call(context);
    assert.equal(proOpenCount, 1);
    assert.equal(context.data.activeTopicNode.content, "existing content");
    assert.equal(context.data.nativeTopicActionError, "需要 Pro");
  } finally {
    global.wx = originalWx;
  }
});

test("native topic expand response stays with its originating node after navigation", async () => {
  const definition = loadPageDefinition("webview");
  const originalWx = global.wx;
  let pendingRequest;
  const nodeOne = { nodeKey: "node-1", title: "第一节", content: "node one", expandedContent: "", questions: [] };
  const nodeTwo = { nodeKey: "node-2", title: "第二节", content: "node two", expandedContent: "", questions: [] };
  const context = {
    ...definition,
    data: {
      ...definition.data,
      nativeTopic: { slug: "topic-1", title: "话题" },
      activeTopicNodeKey: "node-1",
      activeTopicNode: nodeOne,
      nativeTopicNodeCache: { "node-1": nodeOne, "node-2": nodeTwo }
    },
    setData(payload) { this.data = { ...this.data, ...payload }; }
  };

  try {
    global.wx = {
      getStorageSync() { return ""; },
      request(options) { pendingRequest = options; }
    };
    const action = definition.expandNativeTopicNode.call(context);
    context.setData({ activeTopicNodeKey: "node-2", activeTopicNode: nodeTwo });
    context.setData({ nativeTopicExpandLoading: true, nativeTopicActionError: "new action" });
    pendingRequest.success({ statusCode: 200, data: { expanded: "node one expanded" } });
    await action;

    assert.equal(context.data.nativeTopicNodeCache["node-1"].expandedContent, "node one expanded");
    assert.equal(context.data.nativeTopicNodeCache["node-2"].expandedContent, "");
    assert.equal(context.data.activeTopicNode.nodeKey, "node-2");
    assert.equal(context.data.activeTopicNode.expandedContent, "");
    assert.equal(context.data.nativeTopicExpandLoading, true);
    assert.equal(context.data.nativeTopicActionError, "new action");
  } finally {
    global.wx = originalWx;
  }
});

test("native topic ask response stays with its originating node after navigation", async () => {
  const definition = loadPageDefinition("webview");
  const originalWx = global.wx;
  let pendingRequest;
  const nodeOne = { nodeKey: "node-1", title: "第一节", content: "node one", questions: [] };
  const nodeTwo = { nodeKey: "node-2", title: "第二节", content: "node two", questions: [] };
  const context = {
    ...definition,
    data: {
      ...definition.data,
      nativeTopic: { slug: "topic-1", title: "话题" },
      activeTopicNodeKey: "node-1",
      activeTopicNode: nodeOne,
      nativeTopicQuestionText: "第一节的问题",
      nativeTopicNodeCache: { "node-1": nodeOne, "node-2": nodeTwo }
    },
    setData(payload) { this.data = { ...this.data, ...payload }; }
  };

  try {
    global.wx = {
      getStorageSync() { return ""; },
      request(options) { pendingRequest = options; }
    };
    const action = definition.submitNativeTopicQuestion.call(context);
    context.setData({ activeTopicNodeKey: "node-2", activeTopicNode: nodeTwo, nativeTopicQuestionText: "第二节草稿" });
    context.setData({ nativeTopicQuestionLoading: true, nativeTopicActionError: "new action" });
    pendingRequest.success({ statusCode: 200, data: { question: "第一节的问题", message: "问题已收到" } });
    await action;

    assert.deepEqual(context.data.nativeTopicNodeCache["node-1"].questions, [{
      content: "第一节的问题",
      answer: "",
      statusText: "问题已收到"
    }]);
    assert.deepEqual(context.data.nativeTopicNodeCache["node-2"].questions, []);
    assert.equal(context.data.activeTopicNode.nodeKey, "node-2");
    assert.deepEqual(context.data.activeTopicNode.questions, []);
    assert.equal(context.data.nativeTopicQuestionText, "第二节草稿");
    assert.equal(context.data.nativeTopicQuestionLoading, true);
    assert.equal(context.data.nativeTopicActionError, "new action");
  } finally {
    global.wx = originalWx;
  }
});

test("native topic action view matches the mobile expand-only surface", () => {
  const { wxml, wxss } = readPage("webview");
  assert.match(wxml, /bindtap="expandNativeTopicNode"/);
  assert.match(wxml, /activeTopicNode\.contentParts\.length/);
  assert.match(wxml, /wx:for="\{\{activeTopicNode\.contentParts\}\}" wx:for-item="part"/);
  assert.match(wxml, /class="xf-topic-detail-expand-panel"/);
  assert.match(wxml, /scroll-into-view="\{\{nativeTopicScrollTarget\}\}"/);
  assert.match(wxml, /id="xfTopicExpandAnchor" class="xf-topic-detail-expand-anchor"/);
  assert.match(wxml, /nativeTopicActionError/);
  assert.match(wxml, /<image class="xf-topic-detail-expand-icon" src="\/assets\/topic-detail\/topic-auto-awesome-white\.png" mode="aspectFit" \/>/);
  assertAssetUnder("../assets/topic-detail/topic-auto-awesome-white.png", 8 * 1024);
  const expandButtonWxml = wxml.match(/<button[\s\S]*?bindtap="expandNativeTopicNode"[\s\S]*?<\/button>/)?.[0] || "";
  assert.doesNotMatch(expandButtonWxml, /auto_awesome/);
  assert.doesNotMatch(expandButtonWxml, /✦|&#xe65f;||material-symbols-rounded/);
  assert.match(wxml, /正在深度解析~/);
  assert.doesNotMatch(wxml, /xf-topic-detail-expanded-content/);
  assert.doesNotMatch(wxml, /xf-topic-detail-question-(?:box|input|submit|list)/);
  assert.doesNotMatch(wxml, /bindinput="updateNativeTopicQuestion"|bindtap="submitNativeTopicQuestion"/);
  assert.match(wxss, /\.xf-topic-detail-expand-panel\s*\{[\s\S]*margin-top: 23rpx;/);
  const expandStyle = wxss.match(/\.xf-topic-detail-expand\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(expandStyle, /min-height: 92rpx;/);
  assert.match(expandStyle, /padding: 23rpx 0;/);
  assert.match(expandStyle, /border-radius: 23rpx;/);
  assert.match(expandStyle, /background: linear-gradient\(135deg, #7c3aed, #6d28d9\);/);
  assert.doesNotMatch(expandStyle, /border-radius: 999rpx/);
  assert.match(wxss, /\.xf-topic-detail-expand-icon\s*\{[\s\S]*width: 35rpx;[\s\S]*height: 35rpx;[\s\S]*flex: 0 0 35rpx;/);
  assert.match(wxss, /\.xf-topic-detail-expand-anchor\s*\{[\s\S]*height: 1rpx;/);
  assert.doesNotMatch(wxss.match(/\.xf-topic-detail-expand-icon\s*\{[\s\S]*?\n\}/)?.[0] || "", /font-feature-settings|font-variation-settings|text-transform/);
  const expandDisabledStyle = wxss.match(/\.xf-topic-detail-expand\[disabled\]\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(expandDisabledStyle, /background: linear-gradient\(135deg, #a78bfa, #8b5cf6\);/);
  assert.match(expandDisabledStyle, /color: #fff;/);
  assert.match(wxss, /\.xf-topic-detail-expand\[disabled\] text\s*\{[\s\S]*color: #fff;[\s\S]*opacity: 1;/);
});

test("native topic detail mirrors the mobile topic directory and node-detail layout", () => {
  const { js, wxml, wxss } = readPage("webview");
  assert.doesNotMatch(wxml, /xf-topic-detail-eyebrow|xf-topic-detail-stats|xf-topic-detail-card is-hero/);
  assert.match(wxml, /class="xf-topic-detail-heading"/);
  assert.match(wxml, /class="xf-topic-detail-mobile-tabs"/);
  assert.match(wxml, /data-view="tree"[\s\S]*知识目录/);
  assert.match(wxml, /data-view="detail"[\s\S]*节点详情/);
  assert.match(wxml, /bindtap="setNativeTopicMobileView"/);
  assert.match(wxml, /bindtap="toggleNativeTopicBranch"/);
  assert.match(wxml, /class="xf-topic-detail-tree-pane/);
  assert.match(wxml, /class="xf-topic-detail-content-pane/);
  assert.match(js, /nativeTopicMobileView: "tree"/);
  assert.match(js, /nativeTopicCollapsedBranches: \[\]/);
  assert.match(js, /setNativeTopicMobileView\(event\)/);
  assert.match(js, /toggleNativeTopicBranch\(event\)/);
  assert.match(wxss, /\.xf-topic-detail-mobile-tabs/);
  assert.match(wxss, /\.xf-topic-detail-branch-toggle/);
  assert.doesNotMatch(wxss, /\.xf-topic-detail-card\.is-hero|\.xf-topic-detail-stats/);
});

test("native topic node detail keeps the mobile header, sibling, key-point, and reference sections", () => {
  const { wxml, js, wxss } = readPage("webview");
  assert.doesNotMatch(wxml, /open-type="share" class="xf-topic-detail-share"/);
  assert.doesNotMatch(wxml, /xf-topic-detail-share/);
  assert.match(wxml, /wx:if="\{\{activeTopicNode\.siblings\.length\}\}" class="xf-topic-detail-siblings"/);
  assert.match(wxml, /wx:if="\{\{activeTopicNode\.keyPoints\.length\}\}" class="xf-topic-detail-key-points"/);
  assert.match(wxml, /核心观点/);
  assert.match(wxml, /wx:if="\{\{activeTopicNode\.references\.length\}\}" class="xf-topic-detail-references"/);
  assert.match(wxml, /参考来源/);
  assert.match(js, /siblings: responseSiblings/);
  assert.match(js, /keyPoints: Array\.isArray/);
  assert.match(js, /references: Array\.isArray/);
  assert.doesNotMatch(wxss, /\.xf-topic-detail-share/);
  assert.match(wxss, /\.xf-topic-detail-siblings/);
  assert.match(wxss, /\.xf-topic-detail-key-points/);
  assert.match(wxss, /\.xf-topic-detail-references/);
});

test("native topic detail keeps system sharing while removing the custom share button", async () => {
  const definition = loadPageDefinition("webview");
  const originalWx = global.wx;
  const hiddenMenus = [];
  const shownMenus = [];
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  assert.doesNotMatch(String(definition.onLoad), /hideNativeTopicShareMenu\(\)/);
  assert.doesNotMatch(String(definition.onShow), /hideNativeTopicShareMenu\(\)/);

  try {
    global.wx = {
      getStorageSync() {
        return "";
      },
      setStorageSync() {},
      setNavigationBarTitle() {},
      showShareMenu(options) {
        shownMenus.push(options || {});
      },
      hideShareMenu(options) {
        hiddenMenus.push(options || {});
      },
      request(options) {
        if (options.url.includes("/api/topic-hub/no-share-topic/nodes/node-1")) {
          options.success({ statusCode: 200, data: { node: { nodeKey: "node-1", title: "节点", content: "正文" } } });
          return;
        }
        if (options.url.includes("/api/topic-hub/no-share-topic?userId=user-1")) {
          options.success({
            statusCode: 200,
            data: {
              topic: { slug: "no-share-topic", title: "不分享话题" },
              tree: [{ title: "认知篇", children: [{ nodeKey: "node-1", title: "节点" }] }]
            }
          });
          return;
        }
        options.fail({ errMsg: `unexpected request: ${options.url}` });
      }
    };

    await definition.onLoad.call(context, {
      nativeTopic: "1",
      topicSlug: "no-share-topic",
      userId: "user-1",
      title: encodeURIComponent("请教一下")
    });
    definition.onShow.call(context);

    assert.equal(context.data.nativeTopicMode, true);
    assert.equal(hiddenMenus.length, 0);
    assert.equal(shownMenus.length >= 2, true);
    assert.deepEqual(shownMenus[0].menus, ["shareAppMessage", "shareTimeline"]);
    const share = definition.onShareAppMessage.call(context);
    const timelineShare = definition.onShareTimeline.call(context);
    assert.equal(share.title, "不分享话题");
    const direct = new URL(share.path, "https://mini.local");
    assert.equal(direct.pathname, "/pages/webview/index");
    assert.equal(direct.searchParams.get("nativeTopic"), "1");
    assert.equal(direct.searchParams.get("topicSlug"), "no-share-topic");
    assert.equal(direct.searchParams.get("title"), "不分享话题");
    assert.equal(timelineShare.title, "不分享话题");
    assert.equal(new URLSearchParams(timelineShare.query).get("nativeTopic"), "1");
    assert.equal(new URLSearchParams(timelineShare.query).get("topicSlug"), "no-share-topic");
  } finally {
    global.wx = originalWx;
  }
});

test("native topic expand and ask ignore older same-node responses", async () => {
  const definition = loadPageDefinition("webview");
  const originalWx = global.wx;
  const pending = [];
  const node = { nodeKey: "node-1", title: "Node", expandedContent: "", questions: [] };
  const context = {
    ...definition,
    data: { ...definition.data, nativeTopicGeneration: 3, nativeTopic: { slug: "topic-1", title: "Topic" }, activeTopicNodeKey: "node-1", activeTopicNode: node, nativeTopicNodeCache: { "node-1": node }, nativeTopicQuestionText: "first" },
    setData(payload) { this.data = { ...this.data, ...payload }; }
  };
  try {
    global.wx = { getStorageSync() { return ""; }, request(options) { pending.push(options); } };
    const expandOne = definition.expandNativeTopicNode.call(context);
    context.setData({ nativeTopicExpandLoading: false });
    const expandTwo = definition.expandNativeTopicNode.call(context);
    pending[1].success({ statusCode: 200, data: { expanded: "fresh expand" } });
    await expandTwo;
    assert.equal(context.data.nativeTopicExpandLoading, false);
    assert.equal(context.data.activeTopicNode.expandedContent, "fresh expand");
    context.setData({ nativeTopicActionError: "fresh expand state" });
    pending[0].success({ statusCode: 200, data: { expanded: "stale expand" } });
    await expandOne;
    assert.equal(context.data.nativeTopicExpandLoading, false);
    assert.equal(context.data.nativeTopicActionError, "fresh expand state");
    assert.equal(context.data.activeTopicNode.expandedContent, "fresh expand");
    assert.equal(context.data.nativeTopicNodeCache["node-1"].expandedContent, "fresh expand");

    const askOne = definition.submitNativeTopicQuestion.call(context);
    context.setData({ nativeTopicQuestionLoading: false, nativeTopicQuestionText: "second" });
    const askTwo = definition.submitNativeTopicQuestion.call(context);
    pending[3].success({ statusCode: 200, data: { question: "second", message: "fresh" } });
    await askTwo;
    assert.equal(context.data.nativeTopicQuestionLoading, false);
    assert.equal(context.data.nativeTopicQuestionText, "");
    assert.equal(context.data.activeTopicNode.questions[0].content, "second");
    context.setData({ nativeTopicActionError: "fresh ask state" });
    pending[2].success({ statusCode: 200, data: { question: "first", message: "stale" } });
    await askOne;
    assert.equal(context.data.nativeTopicQuestionLoading, false);
    assert.equal(context.data.nativeTopicQuestionText, "");
    assert.equal(context.data.nativeTopicActionError, "fresh ask state");
    assert.deepEqual(context.data.activeTopicNode.questions.map((item) => item.content), ["second"]);
    assert.deepEqual(context.data.nativeTopicNodeCache["node-1"].questions.map((item) => item.content), ["second"]);
  } finally { global.wx = originalWx; }
});

test("native related topic switches in the same detail container and resets stale state", async () => {
  const definition = loadPageDefinition("webview");
  const { js, wxml } = readPage("webview");
  const context = {
    ...definition,
    data: {
      ...definition.data,
      nativeTopicMode: true,
      nativeTopic: { slug: "topic-1", title: "阅读与写作" },
      nativeTopicNodes: [{ nodeKey: "node-1" }],
      activeTopicNodeKey: "node-1",
      activeTopicNode: { nodeKey: "node-1", content: "old content" },
      nativeTopicNodeLoading: true,
      nativeTopicNodeError: "old node error",
      nativeTopicNodeCache: { "node-1": { nodeKey: "node-1" } },
      nextNativeTopicNode: { nodeKey: "node-2" },
      nativeTopicAtBottom: true,
      nativeTopicPullStartY: 240,
      nativeTopicPullDistance: 96,
      nativeTopicPullState: "ready",
      nativeTopicExpandLoading: true,
      nativeTopicQuestionText: "old draft",
      nativeTopicQuestionLoading: true,
      nativeTopicActionError: "old action error",
      nativeTopicScrollTop: 0
    },
    scrollTopTransitions: [],
    setData(payload, callback) {
      if (Object.hasOwn(payload, "nativeTopicScrollTop")) {
        this.scrollTopTransitions.push(payload.nativeTopicScrollTop);
      }
      this.data = { ...this.data, ...payload };
      if (callback) callback.call(this);
    },
    loadNativeTopic(slug) {
      this.loadedRelatedTopic = { slug, snapshot: { ...this.data } };
      return Promise.resolve(slug);
    }
  };

  assert.match(wxml, /bindtap="openNativeRelatedTopic"/);
  assert.match(js, /openNativeRelatedTopic\(event\)/);
  await definition.openNativeRelatedTopic.call(context, {
    currentTarget: { dataset: { slug: "summer-plan" } }
  });

  assert.equal(context.loadedRelatedTopic.slug, "summer-plan");
  assert.equal(context.loadedRelatedTopic.snapshot.nativeTopicMode, true);
  assert.equal(context.loadedRelatedTopic.snapshot.nativeTopic, null);
  assert.deepEqual(context.loadedRelatedTopic.snapshot.nativeTopicNodes, []);
  assert.equal(context.loadedRelatedTopic.snapshot.activeTopicNodeKey, "");
  assert.equal(context.loadedRelatedTopic.snapshot.activeTopicNode, null);
  assert.equal(context.loadedRelatedTopic.snapshot.nativeTopicNodeLoading, false);
  assert.equal(context.loadedRelatedTopic.snapshot.nativeTopicNodeError, "");
  assert.deepEqual(context.loadedRelatedTopic.snapshot.nativeTopicNodeCache, {});
  assert.equal(context.loadedRelatedTopic.snapshot.nextNativeTopicNode, null);
  assert.equal(context.loadedRelatedTopic.snapshot.nativeTopicAtBottom, false);
  assert.equal(context.loadedRelatedTopic.snapshot.nativeTopicPullStartY, null);
  assert.equal(context.loadedRelatedTopic.snapshot.nativeTopicPullDistance, 0);
  assert.equal(context.loadedRelatedTopic.snapshot.nativeTopicPullState, "idle");
  assert.equal(context.loadedRelatedTopic.snapshot.nativeTopicExpandLoading, false);
  assert.equal(context.loadedRelatedTopic.snapshot.nativeTopicQuestionText, "");
  assert.equal(context.loadedRelatedTopic.snapshot.nativeTopicQuestionLoading, false);
  assert.equal(context.loadedRelatedTopic.snapshot.nativeTopicActionError, "");
  assert.equal(context.loadedRelatedTopic.snapshot.nativeTopicScrollTop, 0);
  assert.deepEqual(context.scrollTopTransitions, [-1, 0]);
});

test("native topic async work cannot overwrite a newer topic or node", async () => {
  const definition = loadPageDefinition("webview");
  const originalWx = global.wx;
  const pending = [];
  const context = {
    ...definition,
    data: { ...definition.data, nativeTopicUserId: "user-1" },
    setData(payload, callback) {
      this.data = { ...this.data, ...payload };
      if (callback) callback.call(this);
    }
  };
  try {
    global.wx = {
      getStorageSync() { return ""; },
      request(options) { pending.push(options); }
    };
    const oldDetail = definition.loadNativeTopic.call(context, "old-topic");
    definition.openNativeRelatedTopic.call(context, { currentTarget: { dataset: { slug: "new-topic" } } });
    pending[0].success({ statusCode: 200, data: { topic: { slug: "old-topic", title: "Old" }, tree: [] } });
    await oldDetail;
    assert.equal(context.data.nativeTopic, null);
    assert.equal(context.data.nativeTopicLoading, true);

    pending[1].success({ statusCode: 200, data: { topic: { slug: "new-topic", title: "New" }, tree: [{ title: "B", children: [{ nodeKey: "n1", title: "N1" }, { nodeKey: "n2", title: "N2" }] }] } });
    await Promise.resolve();
    const n1Request = pending[2];
    const n2Load = definition.loadNativeTopicNode.call(context, "n2");
    const n2Request = pending[3];
    n2Request.success({ statusCode: 200, data: { node: { nodeKey: "n2", title: "N2", content: "new" } } });
    await n2Load;
    n1Request.success({ statusCode: 200, data: { node: { nodeKey: "n1", title: "N1", content: "old" } } });
    await Promise.resolve();
    assert.equal(context.data.activeTopicNodeKey, "n2");
    assert.equal(context.data.activeTopicNode.content, "new");
    assert.equal(context.data.nativeTopicNodeCache.n1.content, "old");
  } finally { global.wx = originalWx; }
});

test("old native topic ask cannot clear a newer topic draft or loading", async () => {
  const definition = loadPageDefinition("webview");
  const originalWx = global.wx;
  let oldAsk;
  const oldNode = { nodeKey: "old-node", title: "Old", questions: [] };
  const context = {
    ...definition,
    data: { ...definition.data, nativeTopicGeneration: 1, nativeTopic: { slug: "old-topic" }, activeTopicNodeKey: "old-node", activeTopicNode: oldNode, nativeTopicQuestionText: "old question", nativeTopicNodeCache: { "old-node": oldNode } },
    setData(payload) { this.data = { ...this.data, ...payload }; }
  };
  try {
    global.wx = { getStorageSync() { return ""; }, request(options) { oldAsk = options; } };
    const promise = definition.submitNativeTopicQuestion.call(context);
    context.setData({ nativeTopicGeneration: 2, nativeTopic: { slug: "new-topic" }, activeTopicNodeKey: "new-node", activeTopicNode: { nodeKey: "new-node", questions: [] }, nativeTopicQuestionText: "new draft", nativeTopicQuestionLoading: true, nativeTopicActionError: "" });
    oldAsk.success({ statusCode: 200, data: { message: "done" } });
    await promise;
    assert.equal(context.data.nativeTopicQuestionLoading, true);
    assert.equal(context.data.nativeTopicQuestionText, "new draft");
    assert.equal(context.data.activeTopicNode.nodeKey, "new-node");
  } finally { global.wx = originalWx; }
});

test("native topic next-node entry requires bottom and owns gestures after related topics", async () => {
  const definition = loadPageDefinition("webview");
  const { wxml, wxss } = readPage("webview");
  assert.match(wxml, /xf-topic-detail-scroll[^>]+bindtouchstart="onNativeTopicPullStart"[^>]+bindtouchmove="onNativeTopicPullMove"[^>]+bindtouchend="onNativeTopicPullEnd"/);
  assert.doesNotMatch(wxml, /xf-topic-detail-scroll[^>]+catchtouch(?:start|move|end)=/);
  assert.match(wxml, /class="xf-topic-detail-bottom-safe"/);
  const topicScrollStyle = wxss.match(/\.xf-topic-detail-scroll \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(topicScrollStyle, /padding: 28rpx 24rpx 0;/);
  assert.doesNotMatch(topicScrollStyle, /padding: 28rpx 24rpx calc\(220rpx \+ env\(safe-area-inset-bottom\)\);/);
  assert.doesNotMatch(topicScrollStyle, /padding: 28rpx 24rpx calc\(150rpx \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(wxss, /\.xf-topic-detail-bottom-safe \{[\s\S]*height: calc\(150rpx \+ env\(safe-area-inset-bottom\)\);[\s\S]*margin: 0 -24rpx;[\s\S]*background: #ffffff;/);
  const nextCardStyle = wxss.match(/\.xf-topic-detail-next,[\s\S]*?\.xf-topic-detail-complete \{[\s\S]*?\n\}/)?.[0] || "";
  const doneCardStyle = wxss.match(/\.xf-topic-detail-complete \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(nextCardStyle, /background: #ffffff;/);
  assert.doesNotMatch(nextCardStyle, /background: #f7f3ff;/);
  assert.doesNotMatch(doneCardStyle, /background: #f2faf4;/);
  const relatedIndex = wxml.indexOf("class=\"xf-topic-detail-related-line\"");
  const scrollEnd = wxml.indexOf("</scroll-view>", relatedIndex);
  assert.ok(relatedIndex > 0 && scrollEnd > relatedIndex, "related topics remain inside the pull owner");
  const context = {
    ...definition,
    data: { ...definition.data, nativeTopicNodes: [{ nodeKey: "n1" }, { nodeKey: "n2" }], activeTopicNodeKey: "n1", nextNativeTopicNode: { nodeKey: "n2" } },
    setData(payload) { this.data = { ...this.data, ...payload }; },
    loadNativeTopicNode() { this.entered = true; return Promise.resolve(); }
  };
  await definition.enterNextNativeTopicNode.call(context);
  assert.equal(context.entered, undefined);
  definition.onNativeTopicScrollToLower.call(context);
  await definition.enterNextNativeTopicNode.call(context);
  assert.equal(context.entered, true);
});

test("native topic topbar, empty fields, and detail retry keep native semantics", async () => {
  const definition = loadPageDefinition("webview");
  const { wxml, wxss } = readPage("webview");
  assert.match(wxml, /nativeTopicMode[\s\S]*class="xf-native-topbar xf-topic-detail-topbar" style="height: \{\{topbarHeight\}\}px;"[\s\S]*class="xf-native-nav-row" style="height: \{\{topbarHeight\}\}px;"[\s\S]*class="xf-native-menu-button xf-native-back-button" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;" catchtap="goBack"[\s\S]*class="xf-native-back-icon"/);
  assert.match(wxml, /class="xf-topic-detail-nav-title" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;"/);
  assert.match(wxss, /\.xf-topic-detail-nav-title\s*\{/);
  assert.match(wxml, /wx:if="\{\{nativeTopic\.title\}\}" class="xf-topic-detail-title"/);
  assert.doesNotMatch(wxml, /class="xf-topic-detail-emoji"/);
  assert.doesNotMatch(wxml, /class="xf-topic-detail-summary"/);
  assert.match(wxml, /bindtap="retryNativeTopic"/);
  const empty = definition.normalizeTopicDetailForTest ? definition.normalizeTopicDetailForTest({ topic: {} }) : null;
  assert.ok(empty, "normalizer is exposed for behavior regression");
  assert.equal(empty.title, "");
  assert.equal(empty.subtitle, "");
  assert.equal(empty.summary, "");
  assert.equal(empty.coverEmoji, "");
});

test("webview native book detail restores related books from native first-page cache", async () => {
  const definition = loadPageDefinition("webview");
  const originalWx = global.wx;
  const storage = new Map([
    [
      "xf_native_book_detail:book-first-page-current",
      {
        _id: "book-first-page-current",
        title: "首屏缓存里的本地图书",
        author: "作者甲",
        sourceName: "亲子阅读",
        categoryLabel: "阅读",
        topic: "共读"
      }
    ],
    [
      "xf_native_books_first_page_v3",
      {
        records: [
          {
            _id: "book-first-page-current",
            title: "首屏缓存里的本地图书",
            author: "作者甲",
            sourceName: "亲子阅读",
            categoryLabel: "阅读",
            topic: "共读"
          },
          {
            _id: "book-first-page-related",
            title: "首屏缓存里的相关图书",
            author: "作者乙",
            sourceName: "亲子阅读",
            categoryLabel: "阅读",
            topic: "共读"
          }
        ],
        total: 2,
        current: 1,
        pages: 1,
        size: 24
      }
    ]
  ]);
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      request(options) {
        options.fail({ errMsg: "offline" });
      }
    };

    await definition.onLoad.call(context, {
      title: encodeURIComponent("及阅详情"),
      url: encodeURIComponent("https://xianfeng.xinzhi.info/reading/book-first-page-current?xf_mp=1")
    });

    assert.equal(context.data.nativeBook.hasRelatedBooks, true);
    assert.equal(context.data.nativeBook.relatedBooks[0].title, "首屏缓存里的相关图书");
  } finally {
    global.wx = originalWx;
  }
});

test("native non-agent expert detail uses standalone profile and complete participated-program sections", () => {
  const { js, wxml, wxss } = readPage("webview");
  const normalizeProgramsStart = js.indexOf("function normalizeExpertPrograms");
  const normalizeProgramsEnd = js.indexOf("function normalizeExpertDetail");
  const normalizeProgramsSource = js.slice(normalizeProgramsStart, normalizeProgramsEnd);

  assert.match(wxml, /class="xf-expert-detail-card is-profile \{\{nativeExpert\.agentEnabled \? 'is-agent' : 'is-static'\}\}"/);
  assert.match(wxml, /class="xf-expert-detail-name-row">[\s\S]*class="xf-expert-detail-name">\{\{nativeExpert\.name\}\}<\/text>[\s\S]*class="xf-expert-detail-title">\{\{nativeExpert\.title\}\}<\/text>/);
  assert.match(wxml, /wx:if="\{\{!nativeExpert\.agentEnabled && \(nativeExpert\.programCount > 0 \|\| nativeExpert\.socialCount > 0 \|\| nativeExpert\.authoredBookCount > 0 \|\| nativeExpert\.bookListCount > 0 \|\| nativeExpert\.referenceCount > 0\)\}\}" class="xf-expert-detail-stat-pills"/);
  assert.match(wxml, /wx:if="\{\{nativeExpert\.programCount > 0\}\}" class="xf-expert-detail-stat-pill">节目 \{\{nativeExpert\.programCount\}\}<\/text>/);
  assert.match(wxml, /wx:if="\{\{nativeExpert\.socialCount > 0\}\}" class="xf-expert-detail-stat-pill">社交媒体 \{\{nativeExpert\.socialCount\}\}<\/text>/);
  assert.match(wxml, /wx:if="\{\{nativeExpert\.referenceCount > 0\}\}" class="xf-expert-detail-stat-pill">公开内容 \{\{nativeExpert\.referenceCount\}\}<\/text>/);
  assert.match(wxml, /wx:if="\{\{!nativeExpert\.agentEnabled && nativeExpert\.hasRelatedPrograms\}\}" class="xf-expert-detail-card is-static-programs"/);
  assert.doesNotMatch(wxml, /xf-expert-detail-eyebrow/);
  assert.doesNotMatch(wxml, /RELATED CONTENT|AUTHORED WORKS|EXTENSION MATERIALS|PUBLIC CONTENT|RECOMMENDED BOOKS/);
  assert.match(wxml, /class="xf-expert-detail-section-title">参与节目<\/text>/);
  assert.match(wxml, /wx:for="\{\{nativeExpert\.relatedPrograms\}\}"[\s\S]*class="xf-expert-detail-static-program-link"/);
  assert.match(wxml, /wx:if="\{\{nativeExpert\.agentEnabled\}\}" class="xf-expert-detail-agent-card"/);
  assert.doesNotMatch(wxml, /嘉宾资料已收录/);
  assert.doesNotMatch(normalizeProgramsSource, /\.slice\(/, "native expert normalization should retain every related program returned by the API");
  assert.match(js, /socialCount: socialProfiles\.length/);
  assert.match(wxss, /\.xf-expert-detail-card\.is-profile\.is-static \{[\s\S]*padding:/);
  assert.match(wxss, /\.xf-expert-detail-avatar-wrap \{[\s\S]*width: 188rpx;[\s\S]*padding: 12rpx;[\s\S]*border: 2rpx solid #eee8ff;[\s\S]*background: #f4f0ff;/);
  assert.match(wxss, /\.xf-expert-detail-avatar \{[\s\S]*width: 164rpx;[\s\S]*height: 164rpx;[\s\S]*border-radius: 32rpx;[\s\S]*background: #ffffff;/);
  assert.match(wxss, /\.xf-expert-detail-name-row \{[^}]*flex-direction: column;[^}]*align-items: center;/);
  assert.match(wxss, /\.xf-expert-detail-stat-pills \{[\s\S]*display: flex;[\s\S]*flex-wrap: wrap;/);
  assert.match(wxss, /\.xf-expert-detail-card\.is-static-programs,[\s\S]*\.xf-expert-detail-card\.is-static-publications,[\s\S]*\.xf-expert-detail-card\.is-booklists \{[\s\S]*text-align: left;/);
  assert.match(wxss, /\.xf-expert-detail-static-program-link \{[\s\S]*display: grid;/);
});

test("unauthenticated expert quick prompts use light content-card styling", () => {
  const { js, wxml, wxss } = readPage("webview");

  assert.match(wxml, /class="xf-expert-detail-agent-intro \{\{!nativeExpertAuthed \? 'is-guest' : ''\}\}"/);
  assert.match(js, /suggestedQuestions[\s\S]*\.slice\(0, 3\)/);
  assert.match(
    wxss,
    /\.xf-expert-detail-agent-intro\.is-guest button \{[^}]*border: 1rpx solid #e6def3;[^}]*background: #f4f2fb;[^}]*color: #241a3a;/
  );
  assert.match(wxss, /\.xf-expert-detail-login \{[^}]*background: #5e17eb;[^}]*color: #ffffff;/);
});

test("native expert participated-program lists show three rows and scroll the remainder", () => {
  const { wxml, wxss } = readPage("webview");

  assert.match(
    wxml,
    /<scroll-view wx:if="\{\{nativeExpertProfileTab === 'programs'\}\}" class="xf-expert-detail-profile-list is-programs \{\{nativeExpert\.relatedPrograms\.length > 3 \? 'is-scrollable' : ''\}\}" scroll-y="\{\{nativeExpert\.relatedPrograms\.length > 3\}\}" enhanced show-scrollbar="false">/
  );
  assert.match(
    wxml,
    /<scroll-view class="xf-expert-detail-static-program-list \{\{nativeExpert\.relatedPrograms\.length > 3 \? 'is-scrollable' : ''\}\}" scroll-y="\{\{nativeExpert\.relatedPrograms\.length > 3\}\}" enhanced show-scrollbar="false">/
  );
  assert.match(wxss, /\.xf-expert-detail-profile-list\.is-programs\.is-scrollable \{[\s\S]*height: 162rpx;/);
  assert.match(wxss, /\.xf-expert-detail-static-program-list\.is-scrollable \{[\s\S]*height: 310rpx;/);
  assert.match(wxss, /\.xf-expert-detail-static-program-title \{[\s\S]*white-space: normal;/);
  assert.doesNotMatch(wxss, /\.xf-expert-detail-static-program-title \{[^}]*text-overflow: ellipsis;/);
});

test("native expert detail shows five booklists and can expand the remainder", () => {
  const { js, wxml, wxss } = readPage("webview");

  assert.match(wxml, /wx:if="\{\{nativeExpert\.bookLists\.length\}\}" class="xf-expert-detail-card is-booklists"/);
  assert.match(wxml, /wx:for="\{\{nativeExpert\.visibleBookLists\}\}"[\s\S]*catchtap="openNativeExpertBookList"/);
  assert.match(wxml, /"展开其余 " \+ nativeExpert\.hiddenBookListCount \+ " 条"/);
  assert.match(wxml, /catchtap="toggleNativeExpertBookLists"/);
  assert.match(js, /visibleBookLists: bookLists\.slice\(0, 5\)/);
  assert.match(js, /toggleNativeExpertBookLists\(\)/);
  assert.match(js, /openNativeExpertBookList\(event\)/);
  assert.match(js, /wx\.setStorageSync\(READING_PENDING_FILTER_KEY, \{[\s\S]*source: "native",[\s\S]*tag: name/);
  assert.match(js, /wx\.switchTab\(\{ url: "\/pages\/reading\/index" \}\);/);
  assert.doesNotMatch(js, /openNativeExpertBookList\(event\)[\s\S]{0,500}openWeb\("\/books"/);
  assert.match(wxss, /\.xf-expert-detail-card\.is-booklists \{/);
  assert.match(wxss, /\.xf-expert-detail-booklist-link \{[\s\S]*box-sizing: border-box;[\s\S]*min-height: 94rpx;/);
});

test("native expert detail renders authored works and copies social links silently", () => {
  const { js, wxml, wxss } = readPage("webview");

  assert.match(js, /const authoredBooks = \(Array\.isArray\(item\.authoredBooks\)/);
  assert.match(js, /openNativeExpertAuthoredBook\(event\)/);
  assert.match(js, /copyNativeExpertSocial\(event\)/);
  assert.match(js, /copyTextSilently\(value\)/);
  assert.doesNotMatch(js, /url \? "链接已复制" : "账号名称已复制"/);
  assert.match(wxml, /wx:if="\{\{nativeExpert\.authoredBooks\.length\}\}" class="xf-expert-detail-card is-authored-books"/);
  assert.match(wxml, /scroll-x="true"[\s\S]*catchtap="openNativeExpertAuthoredBook"/);
  assert.doesNotMatch(wxml, /data-detail="\{\{item\.hasDetail\}\}"/);
  assert.match(wxml, /class="xf-expert-detail-authored-action">查看详情<\/text>/);
  assert.match(wxml, /wx:if="\{\{nativeExpert\.socialProfiles\.length\}\}" class="xf-expert-detail-card is-social-media"/);
  assert.match(wxml, /catchtap="copyNativeExpertSocial"/);
  assert.doesNotMatch(wxml, /class="xf-expert-detail-social-copy">复制<\/text>/);
  assert.match(wxss, /\.xf-expert-detail-authored-scroll \{/);
  assert.match(wxss, /\.xf-expert-detail-social-item \{/);
});

test("native expert count pills include authored works and recommended booklists on detail and list", () => {
  const detail = readPage("webview");
  const list = readPage("experts");

  assert.match(detail.js, /authoredBookCount: authoredBooks\.length/);
  assert.match(detail.js, /bookListCount: bookLists\.length/);
  assert.match(detail.wxml, /nativeExpert\.authoredBookCount > 0[^>]*>著作 \{\{nativeExpert\.authoredBookCount\}\}<\/text>/);
  assert.match(detail.wxml, /nativeExpert\.bookListCount > 0[^>]*>推荐书单 \{\{nativeExpert\.bookListCount\}\}<\/text>/);
  assert.match(list.js, /socialCount: Number\(item\.socialCount \|\| 0\)/);
  assert.match(list.js, /authoredBookCount: Number\(item\.authoredBookCount \|\| 0\)/);
  assert.match(list.js, /bookListCount: Number\(item\.bookListCount \|\| 0\)/);
  assert.match(list.wxml, />社交媒体 \{\{item\.socialCount\}\}<\/text>/);
  assert.match(list.wxml, />著作 \{\{item\.authoredBookCount\}\}<\/text>/);
  assert.match(list.wxml, />推荐书单 \{\{item\.bookListCount\}\}<\/text>/);
});

test("native expert detail renders bound extension materials and copies their links", () => {
  const { js, wxml, wxss } = readPage("webview");

  assert.match(js, /const extensionMaterials = normalizeExpertLinks\(item\.extensionMaterials\)/);
  assert.match(js, /extensionMaterials,/);
  assert.match(js, /copyNativeExpertMaterial\(event\)/);
  assert.match(wxml, /class="xf-expert-detail-card is-extension-materials"/);
  assert.match(wxml, /class="xf-expert-detail-section-title">拓展资料<\/text>/);
  assert.match(wxml, /wx:for="\{\{nativeExpert\.extensionMaterials\}\}"[\s\S]*catchtap="copyNativeExpertMaterial"/);
  assert.doesNotMatch(wxml, /class="xf-expert-detail-extension-action">复制链接<\/text>/);
  assert.match(wxss, /\.xf-expert-detail-extension-item \{/);
});

test("native expert public content copies its bound link", () => {
  const { wxml } = readPage("webview");

  assert.match(wxml, /wx:for="\{\{nativeExpert\.publicItems\}\}"[\s\S]*data-copy-url="\{\{reference\.url\}\}"[\s\S]*catchtap="copyNativeExpertMaterial"/);
});

test("native external content copies links that cannot be opened", () => {
  const xiaowanzi = readPage("xiaowanzi");
  const reading = readPage("reading");
  const search = readPage("search");
  const welfare = readPage("welfare");

  assert.match(xiaowanzi.js, /openMessageLink\(event\) \{[\s\S]*copyTextSilently\(url\);[\s\S]*\}/);
  assert.match(reading.js, /typeof wx\.navigateToMiniProgram !== "function"\) \{[\s\S]*copyTextSilently\(shortLink\);[\s\S]*return true;/);
  assert.match(reading.js, /wx\.navigateToMiniProgram\(\{[\s\S]*fail\(error\) \{[\s\S]*copyTextSilently\(shortLink\);/);
  assert.match(search.js, /typeof wx\.navigateToMiniProgram !== "function"\) \{[\s\S]*copyTextSilently\(shortLink\);[\s\S]*return true;/);
  assert.match(search.js, /wx\.navigateToMiniProgram\(\{[\s\S]*fail\(error\) \{[\s\S]*copyTextSilently\(shortLink\);/);
  assert.match(welfare.js, /wx\.navigateToMiniProgram\(\{[\s\S]*fail\(error\) \{[\s\S]*copyTextSilently\(link\);/);
});

test("native expert sharing reopens the same expert instead of the website home", () => {
  const definition = loadPageDefinition("webview");
  const context = {
    data: {
      title: "魏智渊",
      src: "",
      nativeTopicMode: false,
      nativeExpertMode: true,
      nativeExpert: { id: "expert-wei", name: "魏智渊" }
    }
  };

  const share = definition.onShareAppMessage.call(context);
  const target = new URL(share.path, "https://mini.local");

  assert.equal(target.pathname, "/pages/webview/index");
  assert.equal(target.searchParams.get("url"), "/experts/expert-wei");
  assert.equal(target.searchParams.get("title"), "魏智渊");
});

test("webview native program detail page keeps program, book, and topic details in the mobile web style", async () => {
  const { js, json, wxml, wxss } = readPage("webview");
  assert.match(js, /request\(\{ url: `\/api\/programs\/\$\{encodedId\}\/related` \}\)/, "native program detail should request guest-related programs");
  assert.match(wxml, /wx:if="\{\{nativeProgram\.relatedPrograms\.length\}\}"[\s\S]*>相关节目<\/text>/, "native program detail should render a related-program section at the bottom");
  assert.match(wxml, /catchtap="openNativeRelatedProgram"/, "related program cards should open another native detail");
  assert.match(wxss, /\.xf-program-detail-related-scroll\s*\{[\s\S]*white-space: nowrap;/, "related programs should use a horizontal mobile shelf");
  const definition = loadPageDefinition("webview");
  const originalWx = global.wx;
  const requests = [];
  const requestOptions = [];
  const navigations = [];
  const audioRuntime = {
    playCalls: 0,
    pauseCalls: 0,
    seekCalls: [],
    currentTime: 40,
    playbackRate: 1,
    handlers: {}
  };
  const storage = new Map([
    [
      "xf_external_book_detail:external-book-1",
      {
        id: "external-book-1",
        title: "Phantom Limb",
        author: "Lucinda Berry",
        publisher: "外部出版社",
        isbn: "9780000000001",
        pubDate: "2026-01-02",
        coverPic: "https://example.com/phantom.jpg",
        description: "Emily and Elizabeth spend their childhood locked in a bedroom.",
        tags: "Fantasy,Young Adult,Fiction,Magic,Adventure,Middle Grade,Childrens",
        levelRange: "花生 5 级",
        fiction: "true",
        words: "52000",
        lexile: "HL620L",
        ar: "4.8",
        pages: 264,
        series: "Berry Thriller"
      }
    ],
    [
      "xf_external_book_detail:external-book-empty",
      {
        id: "external-book-empty",
        title: "Blank Intro Book"
      }
    ],
    [
      "xf_external_book_library:records",
      [
        {
          id: "external-book-1",
          title: "Phantom Limb",
          author: "Lucinda Berry",
          publisher: "外部出版社",
          isbn: "9780000000001",
          pubDate: "2026-01-02",
          coverPic: "https://example.com/phantom.jpg",
          description: "Emily and Elizabeth spend their childhood locked in a bedroom.",
          tags: "Fantasy,Young Adult,Fiction,Magic,Adventure,Middle Grade,Childrens",
          levelRange: "花生 5 级",
          fiction: "true"
        },
        {
          id: "external-book-2",
          title: "Lie Lie Truth",
          author: "James Caine",
          publisher: "Kindle Press",
          description: "A related psychological thriller.",
          tags: "Thriller,Psychological Thriller",
          levelRange: "花生 5 级",
          fiction: "true"
        }
      ]
    ],
    [
      "xf_native_books_cache_v6",
      [
        {
          _id: "book-1",
          title: "给孩子的写作启蒙",
          author: "夏老师",
          publisher: "家长先疯出版社",
          coverImage: "https://img.example/book.jpg",
          sourceName: "阅读积累与写作表达的断层",
          recommendedGuest: "夏老师",
          grade: "小学",
          categoryLabel: "写作",
          topic: "表达能力",
          hasMetadataDetail: true
        },
        {
          _id: "book-2",
          title: "表达力练习册",
          author: "林老师",
          publisher: "家长先疯出版社",
          coverImage: "https://img.example/book-2.jpg",
          sourceName: "阅读积累与写作表达的断层",
          recommendedGuest: "夏老师",
          grade: "小学",
          categoryLabel: "写作",
          topic: "表达能力",
          hasMetadataDetail: true
        }
      ]
    ]
  ]);
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync(key) {
        return storage.get(key) || "";
      },
      setStorageSync(key, value) {
        storage.set(key, value);
      },
      request(options) {
        requestOptions.push(options);
        requests.push(options.url);
        if (options.url.endsWith("/return-wish")) {
          options.success({ statusCode: 200, data: { ok: true, count: 1 } });
          return;
        }
        if (options.url.endsWith("/api/programs/abc/related")) {
          options.success({
            statusCode: 200,
            data: {
              recommendedPrograms: [
                {
                  _id: "program-related-1",
                  title: "同一位嘉宾的另一档节目",
                  coverImage: "/uploads/related-cover.png",
                  guestBindings: [{ guest: { name: "刘美文", title: "美文工作室负责人" } }]
                }
              ]
            }
          });
          return;
        }
        if (options.url.endsWith("/api/books/book-1")) {
          options.success({
            statusCode: 200,
            data: {
              _id: "book-1",
              title: "给孩子的写作启蒙",
              author: "夏老师",
              publisher: "家长先疯出版社",
              coverImage: "https://img.example/book.jpg",
              publishedDate: "2024-05",
              sourceName: "阅读积累与写作表达的断层",
              recommendedGuest: "魏智渊",
              grade: "5-6岁",
              categoryLabel: "0-6岁1000本图书",
              topic: "儿童童谣；文化习俗；品格教养；0-6岁1000本图书",
              hasMetadataDetail: true
            }
          });
          return;
        }
        if (options.url.endsWith("/api/books/book-1/metadata")) {
          options.success({
            statusCode: 200,
            data: {
              bookId: "book-1",
              title: "包邮【3-6岁】给孩子的写作启蒙（精装） 长描述营销文案不应该覆盖书名",
              author: "夏老师",
              publisher: "家长先疯出版社",
              isbn: "9780000000001",
              cover: "https://img.example/metadata-book.jpg",
              description: "孩子写不出来，常常不是没有想法。需要把阅读中的材料转化为表达练习。两步训练能降低写作启动难度。\n\n点击链接进入：\n《小黑鱼》\n《李欧李奥尼作品集》",
              rating: 890,
              ratingCount: 128,
              source: "weread_web"
            }
          });
          return;
        }
        if (options.url === "/api/books" || options.url.endsWith("/api/books")) {
          options.success({
            statusCode: 200,
            data: [
              {
                _id: "book-1",
                title: "给孩子的写作启蒙",
                author: "夏老师",
                publisher: "家长先疯出版社",
                coverImage: "https://img.example/book.jpg",
                sourceName: "阅读积累与写作表达的断层",
                recommendedGuest: "夏老师",
                grade: "小学",
                categoryLabel: "写作",
                topic: "表达能力",
                hasMetadataDetail: true
              },
              {
                _id: "book-recovered-related",
                title: "缓存恢复的相关书",
                author: "林老师",
                publisher: "家长先疯出版社",
                sourceName: "阅读积累与写作表达的断层",
                recommendedGuest: "夏老师",
                grade: "小学",
                categoryLabel: "写作",
                topic: "表达能力",
                hasMetadataDetail: true
              }
            ]
          });
          return;
        }
        if (options.url.endsWith("/api/books/book-empty")) {
          options.success({
            statusCode: 200,
            data: {
              _id: "book-empty",
              title: "只有标题的本地图书"
            }
          });
          return;
        }
        if (options.url.endsWith("/api/books/book-empty/metadata")) {
          options.success({
            statusCode: 200,
            data: {}
          });
          return;
        }
        if (options.url.endsWith("/api/books/book-unmarked")) {
          options.success({
            statusCode: 200,
            data: {
              _id: "book-unmarked",
              title: "未标注信息的本地图书",
              author: "未标注",
              publisher: "未标注"
            }
          });
          return;
        }
        if (options.url.endsWith("/api/books/book-unmarked/metadata")) {
          options.success({
            statusCode: 200,
            data: {
              author: "未标注",
              publisher: "未标注"
            }
          });
          return;
        }
        if (options.url.endsWith("/api/books/external/external-book-1")) {
          options.success({
            statusCode: 200,
            data: {
              data: {
                id: "external-book-1",
                title: "Phantom Limb",
                author: "Lucinda Berry",
                publisher: "外部出版社",
                isbn: "9780000000001",
                pubDate: "2026-01-02",
                coverPic: "https://example.com/phantom.jpg",
                description: "Emily and Elizabeth spend their childhood locked in a bedroom.",
                tags: "Fantasy,Young Adult,Fiction,Magic,Adventure,Middle Grade,Childrens",
                levelRange: "花生 5 级"
              }
            }
          });
          return;
        }
        if (options.url.endsWith("/api/books/external/external-book-1/description-translation")) {
          assert.equal(options.method, "POST");
          assert.equal(options.data.title, "Phantom Limb");
          assert.equal(options.data.description, "Emily and Elizabeth spend their childhood locked in a bedroom.");
          options.success({
            statusCode: 200,
            data: {
              translatedDescription: "艾米丽和伊丽莎白童年时被锁在卧室里。"
            }
          });
          return;
        }
        if (options.url.endsWith("/api/learning-materials/material-1")) {
          options.success({
            statusCode: 200,
            data: {
              _id: "material-1",
              title: "2026年高考资料（优志愿-耿忠诚）",
              description: "阶段：高中｜年级：高三｜学科：家庭教育｜升学规划、高考、高考志愿、志愿填报",
              category: "升学资料",
              fileUrl: "https://pan.example/material-1",
              publishedAt: "2026-06-01T00:00:00.000Z"
            }
          });
          return;
        }
        if (options.url.endsWith("/api/topic-hub/topic-1")) {
          options.success({
            statusCode: 200,
            data: {
              topic: {
                _id: "topic-1",
                slug: "topic-1",
                title: "阅读积累与写作表达的断层",
                subtitle: "如何打通输入到输出的通路？",
                description: "孩子读了很多书却写不出作文，通常是因为阅读停留在被动输入阶段。",
                coverEmoji: "✍️",
                tags: ["阅读", "写作", "表达能力"]
              },
              tree: [
                {
                  id: 1,
                  nodeKey: "layer1",
                  title: "认知篇",
                  children: [
                    { id: 101, nodeKey: "read-input", title: "阅读不是自动转化", summary: "需要把文本素材重新加工成自己的表达。" },
                    { id: 102, nodeKey: "active-output", title: "主动输出训练", summary: "用复述、仿写和迁移练习降低写作启动难度。" }
                  ]
                }
              ],
              relatedTopics: [
                { title: "一升二暑假规划", slug: "summer-plan", tags: ["暑假规划", "学习动力"] }
              ]
            }
          });
          return;
        }
        if (options.url.endsWith("/api/guests/expert-1/agent/history")) {
          options.success({
            statusCode: 200,
            data: {
              conversationId: "conversation-1",
              messages: [
                { role: "user", content: "关于写作，夏老师有哪些具体建议？" },
                {
                  role: "assistant",
                  content: "先统一家庭表达口径，再用复述和仿写逐步练习。",
                  citations: [
                    {
                      chunkId: "chunk-1",
                      sourceType: "program_transcript",
                      sourceId: "program-2",
                      sourceTitle: "孩子写作怎么练",
                      locator: "逐字稿",
                      text: "把阅读素材转化成表达训练。"
                    }
                  ]
                }
              ]
            }
          });
          return;
        }
        if (options.url.endsWith("/api/guests/expert-1/agent/chat")) {
          options.success({
            statusCode: 200,
            data: {
              conversationId: "conversation-1",
              answer: "可以先从每天一次复述练习开始。",
              citations: [
                {
                  chunkId: "chunk-2",
                  sourceType: "program_summary",
                  sourceId: "program-2",
                  sourceTitle: "孩子写作怎么练",
                  locator: "节目摘要",
                  text: "复述可以降低表达启动难度。"
                }
              ],
              suggestedQuestions: ["如何安排一周练习？"]
            }
          });
          return;
        }
        if (options.url.endsWith("/api/guests/expert-1/agent")) {
          options.success({
            statusCode: 200,
            data: {
              agent: {
                guestId: "expert-1",
                name: "夏老师",
                title: "教育观察者",
                avatar: "/uploads/guest.png",
                bio: "长期关注儿童表达、阅读和写作迁移。",
                chunkCount: 1918,
                programCount: 2,
                sourceCounts: { program_transcript: 1200, program_summary: 718 },
                suggestedQuestions: ["夏老师的核心观点是什么？", "孩子写作该从哪里开始？"],
                privacyNote: "对话内容仅用于当前账号的嘉宾智能体会话展示。"
              }
            }
          });
          return;
        }
        if (options.url.endsWith("/api/guests/expert-1")) {
          options.success({
            statusCode: 200,
            data: {
              _id: "expert-1",
              name: "夏老师",
              title: "教育观察者",
              bio: "长期关注儿童表达、阅读和写作迁移。",
              avatar: "/uploads/guest.png",
              contentTags: ["阅读", "写作", "表达能力"],
              programCount: 2,
              referenceCount: 3,
              agentEnabled: true,
              profileReferences: [
                { title: "公开档案", source: "家长先疯", url: "https://example.com/profile" }
              ],
              publications: [
                { title: "儿童表达观察", source: "公众号", url: "https://example.com/paper" }
              ],
              socialProfiles: [
                { platform: "微信", label: "夏老师教育观察", url: "https://example.com/wechat" }
              ],
              listenerBenefits: [
                { title: "写作清单", description: "适合小学家庭的表达训练清单", url: "https://example.com/benefit" }
              ],
              bookLists: ["书单1", "书单2", "书单3", "书单4", "书单5", "书单6", "书单7"],
              relatedPrograms: [
                {
                  _id: "program-2",
                  programCode: "ep-2",
                  title: "孩子写作怎么练",
                  description: "把阅读素材转化成表达训练。",
                  coverImage: "/uploads/program-2.png",
                  publishedAt: "2026-06-02T00:00:00.000Z"
                }
              ]
            }
          });
          return;
        }
        if (options.url.endsWith("/api/worthbuy/item-1")) {
          options.success({
            statusCode: 200,
            data: {
              item: {
                _id: "worthbuy-1",
                brand: "护眼台灯",
                query: "item-1",
                status: "published",
                result: {
                  brand: "护眼台灯",
                  score: 72,
                  isIqTax: false,
                  reason: "基础照明和色温调节够用，宣传里的 AI 护眼需要谨慎看待。",
                  priceRange: "300-500 元",
                  pros: ["照度稳定", "操作简单"],
                  cons: ["智能卖点偏营销"],
                  ratingDimensions: {
                    cost: 70,
                    quality: 78,
                    safety: 82,
                    experience: 74,
                    afterSales: 68
                  },
                  suitableFor: ["小学家庭"],
                  notSuitableFor: ["期待全自动学习管理"],
                  dataPoints: ["照度覆盖普通书桌", "色温支持手动调节"],
                  recommendation: "可以考虑，但不要为 AI 卖点支付太多溢价。",
                  buyAdvice: "先确认桌面尺寸和真实照度，再比较同价位基础款。"
                }
              }
            }
          });
          return;
        }
        options.success({
          statusCode: 200,
          data: {
            _id: "program-1",
            programCode: "abc",
            programShow: "zhiji",
            title: "加餐 | 创意写作是更好的写作方式吗？",
            description: "孩子写作文憋半天写不出几行字？",
            coverImage: "/uploads/program-cover.png",
            publishedAt: "2026-06-01T00:00:00.000Z",
            episodes: [{ duration: "45 分钟", url: "/uploads/audio/abc.mp3" }],
            summary: {
              headline: "写作表达的断层",
              body: "阅读积累需要转化成主动表达。",
              highlightLabel: "关键",
              highlightText: "用素材和迁移训练打通输入到输出。",
              tags: ["阅读", "写作", "表达能力"]
            },
            contentPack: {
              quickView: [{ timeRangeLabel: "00:00-03:00", summary: "为什么孩子写不出来" }]
            },
            deepDive: {
              sectionTitle: "内容延展",
              curatedReading: [
                {
                  title: "把阅读变成表达",
                  author: "策划作者",
                  reason: "把阅读材料转化为可执行的表达训练。",
                  book: {
                    id: "curated-book-1",
                    title: "把阅读变成表达",
                    author: "站内作者",
                    translator: "译者甲",
                    publisher: "家长先疯出版社"
                  },
                  url: "https://example.com/reading-transfer"
                },
                {
                  title: "孩子写作启蒙清单",
                  author: "清单作者",
                  reason: "从复述到仿写，逐步降低写作启动难度。"
                },
                {
                  title: "延伸阅读",
                  subtitle: "围绕节目主题延展出的实用阅读线索",
                  url: "https://book.douban.com/"
                }
              ],
              mindMap: {
                root: {
                  title: "写作表达的断层",
                  summary: "孩子并不是没有想法，而是缺少把阅读转成表达的路径。",
                  children: [
                    {
                      title: "阅读输入",
                      summary: "先确认孩子真正理解了文本。",
                      children: [
                        { title: "文本理解", summary: "把故事讲回自己的话。" }
                      ]
                    },
                    {
                      title: "表达输出",
                      summary: "再用复述和仿写启动写作。",
                      children: [
                        { title: "迁移练习", summary: "把读到的材料换场景使用。" }
                      ]
                    },
                    {
                      title: "素材积累",
                      children: [{ title: "生活观察" }]
                    },
                    {
                      title: "结构组织",
                      children: [{ title: "段落安排" }]
                    },
                    {
                      title: "修改反馈",
                      children: [{ title: "反复打磨" }]
                    }
                  ]
                }
              }
            },
            agentOutputs: {
              enrichment: {
                readingVerificationReport: {
                  checkedAt: "2026-07-10T00:00:00.000Z",
                  total: 3,
                  passedCount: 2,
                  failedCount: 1,
                  items: [
                    {
                      title: "把阅读变成表达",
                      subtitle: "围绕写作迁移的实用阅读线索",
                      url: "https://example.com/reading-transfer",
                      finalUrl: "https://verified.example.com/reading-transfer",
                      landingTitle: "把阅读变成表达",
                      titleMatched: true,
                      contributorMatched: true,
                      passed: true
                    },
                    {
                      title: "孩子写作启蒙清单",
                      subtitle: "从复述到仿写的练习路径",
                      url: "https://example.com/wrong-book",
                      finalUrl: "https://example.com/other-book",
                      landingTitle: "另一本书",
                      titleMatched: false,
                      contributorMatched: false,
                      passed: false
                    },
                    {
                      title: "延伸阅读",
                      subtitle: "围绕节目主题延展出的实用阅读线索",
                      url: "https://book.douban.com/",
                      finalUrl: "https://book.douban.com/",
                      landingTitle: "延伸阅读",
                      titleMatched: true,
                      contributorMatched: true,
                      passed: true
                    }
                  ]
                }
              }
            },
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
            transcript: [
              { time: "0:00:05", speaker: "阿力", text: "国际教育也叫国际化教育，教育需要长期投入。", featured: true },
              { time: "00:19", speaker: "张琳", text: "后面再说国际化教育和教育。" },
              { time: "00:31", speaker: "张琳", text: "第三段。" },
              { time: "00:46", speaker: "张琳", text: "第四段。" },
              { time: "00:01:21", speaker: "张琳", text: "第五段。" },
              { time: "00:01:45", speaker: "张琳", text: "第六段。" },
              { time: "00:02:00", speaker: "张琳", text: "第七段。" },
              { time: "00:02:20", speaker: "张琳", text: "第八段。" },
              { time: "00:01:30", speaker: "张琳", text: "第九段。" },
              { time: "00:01:40", speaker: "张琳", text: "第十段。" }
            ],
            guestBindings: [
              {
                guestId: "missing-expert",
                order: 0,
                role: "嘉宾",
                guest: null
              },
              {
                guestId: "expert-1",
                order: 1,
                role: "嘉宾",
                guest: {
                  _id: "expert-1",
                  name: "刘美文",
                  title: "美文工作室负责人",
                  bio: "上海教育出版社美文工作室负责人、副编审。",
                  avatar: "https://img.example/liu-meiwen.png"
                }
              },
              {
                guestId: "expert-2",
                order: 2,
                role: "嘉宾",
                guest: {
                  _id: "expert-2",
                  name: "王璇",
                  title: "资深编辑",
                  bio: "深耕教育图书领域多年，关注儿童心理和教育公平议题。",
                  avatar: "http://xianfeng.xinzhi.info/uploads/images/1779668991727-vzxkyx0x.png"
                }
              }
            ],
            guest: {
              name: "历史快照嘉宾",
              title: "旧资料",
              bio: "该嘉宾不在先疯智库。",
              avatar: "/wel/assets/wel-avatar/no-hat.png"
            }
          }
        });
      },
      navigateTo(options) {
        navigations.push(options);
      },
      switchTab() {},
      showToast() {},
      createInnerAudioContext() {
        audioRuntime.createCalls = (audioRuntime.createCalls || 0) + 1;
        return {
          currentTime: audioRuntime.currentTime,
          onPlay(handler) { audioRuntime.handlers.play = handler; },
          onPause(handler) { audioRuntime.handlers.pause = handler; },
          onStop(handler) { audioRuntime.handlers.stop = handler; },
          onEnded(handler) { audioRuntime.handlers.ended = handler; },
          play() {
            audioRuntime.playCalls += 1;
            audioRuntime.handlers.play();
          },
          pause() {
            audioRuntime.pauseCalls += 1;
            audioRuntime.handlers.pause();
          },
          seek(seconds) { audioRuntime.seekCalls.push(seconds); },
          destroy() {}
        };
      }
    };

    assert.deepEqual(json.usingComponents || {}, {
      "custom-tab-bar": "../../custom-tab-bar/index",
      "phone-login-gate": "../../components/phone-login-gate/index"
    });
    assert.equal(json.navigationStyle, "custom");
    assert.equal(wxml.includes("<native-page-nav"), false);
    assert.match(js, /showNativePageNav: false/);
    assert.doesNotMatch(js, /showNativePageNav: !hideTabbar/);
    assert.match(wxml, /wx:if="\{\{nativeProgramMode\}\}" class="xf-program-detail-page \{\{fontSizeClass\}\}" style="padding-top: \{\{chromeHeight\}\}px;"/);
    assert.doesNotMatch(wxml, /class="xf-program-detail-meta"/);
    assert.doesNotMatch(wxss, /\.xf-program-detail-meta \{/);
    assert.match(wxml, /wx:if="\{\{nativeProgramMode\}\}"[\s\S]*class="xf-native-topbar xf-program-detail-topbar" style="height: \{\{topbarHeight\}\}px;"[\s\S]*class="xf-native-menu-button xf-native-back-button xf-program-detail-back-button"[\s\S]*catchtap="goBack" role="button" aria-label="返回"/);
    assert.match(wxml, /class="xf-book-detail-nav-title" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;">\{\{nativeProgram\.showLabel\}\}<\/text>/);
    assert.match(wxml, /wx:elif="\{\{nativeMaterialMode\}\}" class="xf-material-detail-page \{\{fontSizeClass\}\}" style="padding-top: \{\{chromeHeight\}\}px;"/);
    assert.match(wxml, /wx:elif="\{\{nativeExpertMode\}\}" class="xf-expert-detail-page \{\{fontSizeClass\}\}" style="padding-top: \{\{chromeHeight\}\}px;"/);
    assert.match(wxml, /wx:elif="\{\{nativeWorthBuyMode\}\}" class="xf-worthbuy-detail-page \{\{fontSizeClass\}\}" style="padding-top: \{\{chromeHeight\}\}px;"/);
    assert.match(wxml, /class="xf-native-topbar xf-book-detail-topbar" style="height: \{\{topbarHeight\}\}px;"/);
    assert.match(wxml, /class="xf-native-nav-row" style="height: \{\{topbarHeight\}\}px;"/);
    assert.match(wxml, /class="xf-native-menu-button xf-native-back-button" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;" catchtap="goBack" role="button" aria-label="返回"/);
    assert.match(wxml, /class="xf-native-back-icon" aria-hidden="true"/);
    assert.match(wxml, /class="xf-book-detail-nav-title" style="top: \{\{logoTop\}\}px; height: \{\{logoHeight\}\}px;">家长先疯<\/text>/);
    assert.match(wxml, /<web-view wx:elif="\{\{src\}\}"[\s\S]*src="\{\{src\}\}"/);
    assert.match(wxml, /class="xf-material-detail-card is-hero"/);
    assert.match(wxml, /bindtap="copyNativeMaterialLink"/);
    assert.doesNotMatch(wxml, /ASK &amp; LEARN/);
    assert.match(js, /eyebrowAmp: "&"/);
    assert.match(wxml, /class="xf-native-topbar xf-expert-detail-topbar"/);
    assert.match(wxml, /<text wx:if="\{\{!nativeExpertCompactHeaderVisible\}\}" class="xf-book-detail-nav-title xf-expert-detail-nav-title"[^>]*>先疯智库<\/text>/);
    assert.match(js, /onNativeExpertScroll\(event\)[\s\S]*scrollTop > 180[\s\S]*nativeExpertCompactHeaderVisible: visible/);
    assert.match(wxss, /\.xf-expert-detail-nav-title \{[^}]*font-weight: 900;/);
    assert.match(wxss, /\.xf-expert-detail-compact \{[\s\S]*left: 102rpx;[\s\S]*right: 150rpx;/);
    assert.match(wxml, /class="xf-expert-detail-card is-profile \{\{nativeExpert\.agentEnabled \? 'is-agent' : 'is-static'\}\}"/);
    assert.match(wxml, /class="xf-expert-detail-profile-tabs"/);
    assert.match(wxml, /class="xf-expert-detail-agent-card"/);
    assert.match(wxml, /class="xf-expert-detail-message is-\{\{message\.role\}\}"/);
    assert.match(wxml, /class="xf-expert-detail-citations"/);
    assert.match(wxml, /class="xf-expert-detail-recommendations"/);
    assert.match(wxml, /class="xf-expert-detail-composer/);
    assert.match(
      wxss,
      /\.xf-expert-detail-login \{[\s\S]*box-shadow: 0 18rpx 28rpx rgba\(36, 26, 58, 0\.28\), 0 4rpx 10rpx rgba\(36, 26, 58, 0\.16\);/,
      "guest login guide should use a neutral bottom shadow to stay distinct from purple content behind it"
    );
    assert.match(wxml, /bindinput="onNativeExpertQuestionInput"/);
    assert.match(wxml, /bindtap="submitNativeExpertQuestion"/);
    assert.match(wxml, /bindtap="goExpertsList"/);
    assert.match(wxml, /class="xf-worthbuy-detail-card is-hero"/);
    assert.match(wxml, /class="xf-worthbuy-detail-score-ring"/);
    assert.match(wxml, /class="xf-worthbuy-detail-card is-dimensions"/);
    assert.match(wxml, /class="xf-worthbuy-detail-card is-advice"/);
    assert.match(wxml, /bindtap="goWorthBuyList"/);
    assert.match(wxml, /<custom-tab-bar selected="\{\{selected\}\}" hidden="\{\{hideTabbar\}\}" \/>/);
    assert.match(js, /quickView\.length \? \{ key: "quickview", label: "速览" \} : null,[\s\S]*mindMap && mindMap\.root \? \{ key: "mindmap", label: "脉络" \} : null,[\s\S]*transcript\.length \? \{ key: "transcript", label: "逐字稿" \} : null/);
    assert.match(js, /mindMap && mindMap\.root \? \{ key: "mindmap", label: "脉络" \} : null/);
    assert.match(wxml, /class="xf-program-detail-action-icon" src="\{\{nativeProgram\.bookmarked \? '\/assets\/program-detail\/program-book-purple\.png' : '\/assets\/program-detail\/program-book-white\.png'\}\}"/);
    assert.match(wxml, /open-type="share" class="xf-program-detail-hero-icon is-share[\s\S]*src="\/assets\/program-detail\/program-share-white\.png"/);
    assert.match(wxml, /class="xf-program-detail-play" bindtap="toggleNativeAudio"[\s\S]*src="\{\{isAudioPlaying \? '\/assets\/program-detail\/program-pause-purple\.png' : '\/assets\/program-detail\/program-play-purple\.png'\}\}"/);
    assert.match(wxml, /class="xf-program-detail-summary-corner"/);
    assert.match(wxml, /class="xf-program-detail-content-shell"[\s\S]*class="xf-program-detail-tabs"/);
    assert.match(wxml, /activeContentMode === 'mindmap'/);
    assert.match(wxml, /class="xf-program-detail-mindmap-outline"/);
    assert.match(wxml, /class="xf-program-detail-mindmap-root"[\s\S]*\{\{nativeProgramMindMapOutline\.root\.title\}\}/);
    assert.match(wxml, /wx:for="\{\{nativeProgramMindMapOutline\.branches\}\}"[\s\S]*class="xf-program-detail-mindmap-branch"/);
    assert.match(wxml, /data-index="\{\{item\.index\}\}"[\s\S]*catchtap="toggleNativeProgramMindMapBranch"[\s\S]*aria-label="\{\{item\.collapsed \? '展开' : '收起'\}\}\{\{item\.title\}\}"/);
    assert.match(wxml, /class="xf-program-detail-mindmap-toggle">\{\{item\.collapsed \? '\+' : '−'\}\}<\/text>/);
    assert.match(wxml, /wx:if="\{\{!item\.collapsed\}\}" class="xf-program-detail-mindmap-children"[\s\S]*wx:for="\{\{item\.children\}\}"[\s\S]*class="xf-program-detail-mindmap-child"/);
    assert.doesNotMatch(wxml, /previewNativeProgramMindMap|查看脉络大图/);
    assert.doesNotMatch(wxml, /xf-program-mindmap-canvas|xf-program-detail-mindmap-area|xf-program-detail-mindmap-movable|nativeProgramMindMapImage|xf-program-detail-mindmap-image|xf-program-detail-mindmap-hotspot/);
    assert.match(wxml, /class="xf-program-detail-content-panel is-mindmap"/);
    assert.match(wxml, /class="xf-program-detail-content-panel is-quickview"/);
    assert.match(wxml, /class="xf-program-detail-content-panel is-transcript"/);
    assert.match(wxml, /class="xf-program-detail-content-row \{\{item\.featured \? 'is-featured' : ''\}\}"/);
    assert.match(wxml, /class="xf-program-detail-transcript-meta"[\s\S]*class="xf-program-detail-time">\{\{item\.time\}\}<\/text>[\s\S]*wx:if="\{\{item\.time && item\.speakerLabel\}\}" class="xf-program-detail-transcript-separator">·<\/text>[\s\S]*class="xf-program-detail-speaker">\{\{item\.speakerLabel\}\}<\/text>/);
    assert.match(wxml, /wx:for="\{\{item\.contentNodes\}\}"[\s\S]*wx:if="\{\{node\.type === 'dictionary'\}\}"[\s\S]*role="button"[\s\S]*aria-label="查看\{\{node\.term\}\}释义"[\s\S]*data-entry-id="\{\{node\.entryId\}\}"[\s\S]*catchtap="openProgramDictionaryEntry"/);
    assert.match(wxml, /wx:if="\{\{selectedProgramDictionaryEntry\}\}" class="xf-program-dictionary-overlay" catchtap="closeProgramDictionaryEntry"/);
    assert.match(wxml, /class="xf-program-dictionary-sheet" catchtap="stopNativeEvent" role="dialog" aria-label="\{\{selectedProgramDictionaryEntry\.term\}\}释义"/);
    assert.match(wxml, /class="xf-program-dictionary-close" catchtap="closeProgramDictionaryEntry" aria-label="关闭"/);
    assert.match(wxml, /\{\{selectedProgramDictionaryEntry\.term\}\}[\s\S]*\{\{selectedProgramDictionaryEntry\.definition\}\}/);
    assert.match(wxss, /\.xf-program-dictionary-term \{[\s\S]*color: #5e17eb;[\s\S]*background:/);
    assert.match(wxss, /\.xf-program-dictionary-overlay \{[\s\S]*position: fixed;[\s\S]*z-index:/);
    assert.doesNotMatch(wxml, /activeContentMode === 'mindmap' && nativeProgram\.hasMindMap\}\}" class="xf-program-detail-card is-mindmap"/);
    assert.doesNotMatch(wxml, /activeContentMode === 'quickview' && nativeProgram\.quickView\.length\}\}" class="xf-program-detail-card"/);
    assert.doesNotMatch(wxml, /activeContentMode === 'transcript' && nativeProgram\.transcript\.length\}\}" class="xf-program-detail-card"/);
    assert.match(wxml, /class="xf-program-detail-library-link" bindtap="goProgramList"/);
    assert.match(wxml, /class="xf-program-detail-player-fab[\s\S]*catchtap="toggleNativeAudio" aria-label="\{\{isAudioPlaying \? '暂停节目' : '播放节目'\}\}"[\s\S]*src="\{\{isAudioPlaying \? '\/assets\/program-detail\/program-pause-white\.png' : '\/assets\/program-detail\/program-play-white\.png'\}\}"/);
    assert.match(wxml, /class="xf-program-detail-player-rail \{\{playerQuickActionsOpen \? 'is-open' : ''\}\}"/);
    assert.match(wxml, /class="xf-program-detail-rail-button is-rewind"[\s\S]*aria-label="后退10秒"[\s\S]*data-seconds="-10"[\s\S]*class="xf-program-detail-skip-icon is-rewind"[\s\S]*class="xf-program-detail-skip-number">10<\/text>/);
    assert.match(wxml, /class="xf-program-detail-rail-button is-forward"[\s\S]*aria-label="前进30秒"[\s\S]*data-seconds="30"[\s\S]*class="xf-program-detail-skip-icon is-forward"[\s\S]*class="xf-program-detail-skip-number">30<\/text>/);
    assert.match(wxml, /class="xf-program-detail-rail-button is-list"[\s\S]*src="\/assets\/program-detail\/program-list-purple\.png"/);
    assert.match(wxml, /class="xf-program-detail-guest-wish \{\{nativeProgram\.guestWishAnimating \? 'is-animating' : ''\}\}"[\s\S]*src="\/assets\/program-detail\/program-heart-white\.png"/);
    assert.match(wxml, /wx:for="\{\{nativeProgram\.guestWishBubbles\}\}"[\s\S]*class="xf-program-detail-wish-bubble"[\s\S]*src="\/assets\/program-detail\/program-heart-red\.png"/);
    assert.doesNotMatch(wxml, /xf-program-detail-wish-count/);
    assert.match(wxml, /class="xf-program-detail-card is-guest is-centered"/);
    assert.match(wxml, /<scroll-view wx:if="\{\{nativeProgram\.guests\.length > 1\}\}" class="xf-program-detail-guest-switcher" scroll-x enhanced show-scrollbar="false">/);
    assert.match(wxml, /wx:for="\{\{nativeProgram\.guests\}\}"[\s\S]*class="xf-program-detail-guest-pill \{\{nativeProgram\.activeGuestIndex === index \? 'is-active' : ''\}\}"[\s\S]*data-index="\{\{index\}\}"[\s\S]*catchtap="switchNativeProgramGuest"/);
    assert.match(wxml, /class="xf-program-detail-guest-pill-avatar \{\{item\.avatarFallback \? 'is-fallback' : ''\}\}"[\s\S]*src="\{\{item\.avatar\}\}"/);
    assert.match(wxml, /class="xf-program-detail-guest-avatar \{\{nativeProgram\.guestAvatarFallback \? 'is-fallback' : ''\}\}"[\s\S]*src="\{\{nativeProgram\.guestAvatar\}\}"[\s\S]*mode="\{\{nativeProgram\.guestAvatarFallback \? 'aspectFit' : 'aspectFill'\}\}"[\s\S]*binderror="useNativeProgramGuestAvatarFallback"/);
    assert.match(wxml, /bindtap="openNativeProgramGuest"/);
    assert.match(wxml, /class="xf-program-detail-guest-profile-icon" src="\/assets\/program-detail\/program-user-white\.png"/);
    assert.match(wxml, />\s*查看完整学术档案\s*<\/button>/);
    assert.doesNotMatch(wxml, /查看完整学者档案/);
    assert.match(wxml, /wx:if="\{\{nativeProgram\.hasExtension\}\}" class="xf-program-detail-card is-extension"/);
    assert.match(wxml, /class="xf-program-detail-extension-label">推荐阅读 Curated Reading<\/text>/);
    assert.match(wxml, /wx:for="\{\{nativeProgram\.curatedReading\}\}"[\s\S]*wx:if="\{\{item\.bookId\}\}"[\s\S]*class="xf-program-detail-extension-item is-link"[\s\S]*data-index="\{\{index\}\}"[\s\S]*catchtap="openNativeProgramCuratedBook"/);
    assert.match(wxml, /wx:else class="xf-program-detail-extension-item"/);
    assert.match(wxml, /wx:if="\{\{item\.meta\}\}" class="xf-program-detail-extension-item-meta">\{\{item\.meta\}\}<\/text>/);
    assert.match(wxml, /wx:if="\{\{item\.subtitle\}\}" class="xf-program-detail-extension-item-subtitle">\{\{item\.subtitle\}\}<\/text>/);
    assert.doesNotMatch(wxml, /data-url="\{\{item\.url\}\}"|catchtap="openNativeProgramExtension"/);
    assert.doesNotMatch(wxml, /wx:if="\{\{nativeProgram\.summaryHighlightText\}\}" class="xf-program-detail-card is-extension"/);
    assert.match(wxml, /class="xf-expert-detail-wish[\s\S]*src="\/assets\/program-detail\/program-heart-white\.png"/);
    const programDetailWxml = wxml.slice(0, wxml.indexOf('<view wx:elif="{{nativeBookMode}}"'));
    assert.doesNotMatch(programDetailWxml, /material-symbols-rounded|play_arrow|auto_awesome|replay_10|forward_30|favorite_border/);
    for (const iconName of [
      "program-book-white.png",
      "program-book-purple.png",
      "program-share-white.png",
      "program-play-purple.png",
      "program-pause-purple.png",
      "program-sparkle-purple.png",
      "program-heart-red.png",
      "program-heart-purple.png",
      "program-heart-white.png",
      "program-user-white.png",
      "program-insights-purple.png",
      "program-replay-10-purple.png",
      "program-forward-30-purple.png",
      "program-list-purple.png",
      "program-play-white.png",
      "program-pause-white.png",
      "program-arrow-forward-purple.png"
    ]) {
      assert.equal(fs.existsSync(new URL(`../assets/program-detail/${iconName}`, import.meta.url)), true);
    }
    assertPngSize("../assets/program-detail/program-pause-white.png", 24, 24);
    assertPngSize("../assets/program-detail/program-pause-purple.png", 24, 24);
    assertPngAlphaBounds("../assets/program-detail/program-pause-white.png", 128, { minX: 6, minY: 5, maxX: 17, maxY: 18 });
    assertPngAlphaBounds("../assets/program-detail/program-pause-purple.png", 128, { minX: 6, minY: 5, maxX: 17, maxY: 18 });
    assert.match(js, /function extractProgramId\(src\)/);
    assert.match(js, /function extractBookId\(src\)/);
    assert.match(js, /function extractExternalBookId\(src\)/);
    assert.match(js, /function readExternalBookDetailCache\(bookId\)/);
    assert.match(js, /function getExternalBookFallback\(src, bookId\)/);
    assert.match(js, /function extractMaterialId\(src\)/);
    assert.match(js, /function extractExpertId\(src\)/);
    assert.match(js, /function extractWorthBuyQuery\(src\)/);
    assert.match(js, /function normalizeMaterialDetail\(material\)/);
    assert.match(js, /function normalizeExpertDetail\(guest\)/);
    assert.match(js, /function normalizeNativeExpertAgentProfile\(value, expert\)/);
    assert.match(js, /function normalizeNativeExpertMessages\(value\)/);
    assert.match(js, /function normalizeProgramCuratedReading\(deepDive, verificationReport\)/);
    assert.match(js, /function buildNativeCuratedReadingMeta\(value, book\)/);
    assert.match(js, /openNativeProgramCuratedBook\(event\)/);
    assert.match(js, /function normalizeProgramGuests\(item\)/);
    assert.match(
      js,
      /const bindingGuests = bindings[\s\S]*const candidates = bindingGuests\.length[\s\S]*\? bindingGuests[\s\S]*:\s*\[\]\.concat\(Array\.isArray\(source\.guests\) \? source\.guests : \[\]\)[\s\S]*\.concat\(source\.guest \|\| \[\]\)/
    );
    assert.match(js, /switchNativeProgramGuest\(event\)/);
    assert.match(js, /item\?\.passed === true/);
    assert.match(js, /item\?\.titleMatched === true/);
    assert.match(js, /function buildNativeProgramMindMapOutline\(mindMap, collapsedBranches\)/);
    assert.match(js, /function getNativeProgramMindMapOutlineSummary\(title, summary\)/);
    assert.match(js, /nativeProgramMindMapOutline/);
    assert.match(js, /toggleNativeProgramMindMapBranch\(event\)/);
    assert.doesNotMatch(js, /drawNativeProgramMindMapConnections|nativeProgramMindMapNodes|nativeProgramMindMapScale|nativeProgramMindMapHeight/);
    assert.doesNotMatch(js, /previewNativeProgramMindMap\(\)/);
    assert.doesNotMatch(js, /nativeProgramMindMapImage/);
    assert.doesNotMatch(js, /openNativeProgramExtension\(event\)/);
    assert.match(js, /function normalizeWorthBuyDetail\(item\)/);
    assert.match(js, /function normalizeExternalBookDetail\(book\)/);
    assert.match(js, /function buildNativeBookCoverFrameStyle\(width, height\)/);
    assert.match(js, /function readExternalBookLibraryRecords\(\)/);
    assert.match(js, /function buildExternalBookRelatedBooks\(book, candidates\)/);
    assert.match(wxml, /<text class="xf-book-detail-section-pill">METADATA<\/text>/);
    assert.match(wxml, /<text class="xf-book-detail-section-title">图书资料<\/text>/);
    assert.match(wxml, /class="xf-book-detail-fact \{\{item\.filterTag \? 'is-clickable' : ''\}\}"[\s\S]*data-tag="\{\{item\.filterTag\}\}"[\s\S]*catchtap="onNativeBookFactTap"/);
    assert.match(wxml, /<text class="xf-book-detail-section-pill">RELATED BOOKS<\/text>/);
    assert.match(wxml, /<text class="xf-book-detail-section-title">相关图书<\/text>/);
    assert.match(wxml, /<view class="xf-book-detail-card is-hero">[\s\S]*<view class="xf-book-detail-copy \{\{nativeBook\.hasMoreContent \? '' : 'is-terminal'\}\}">[\s\S]*<view wx:if="\{\{nativeBook\.hasMoreContent\}\}" class="xf-book-detail-hero-more">\s*<view class="xf-book-detail-tag-cloud is-hero-tags"/);
    assert.doesNotMatch(wxml, /<text class="xf-book-detail-section-pill">MORE CONTENT<\/text>/);
    assert.doesNotMatch(wxml, /class="xf-book-detail-card is-more-content"/);
    assert.match(wxml, /wx:for="\{\{nativeBook\.tags\}\}"[\s\S]*class="xf-book-detail-tag-pill"[\s\S]*data-tag="\{\{item\}\}"[\s\S]*catchtap="onNativeBookTagTap"/);
    assert.match(wxml, /<view wx:if="\{\{nativeBook\.hasIntro\}\}" class="xf-book-detail-card">/);
    assert.match(wxml, /<view wx:if="\{\{nativeBook\.hasFacts\}\}" class="xf-book-detail-card">/);
    assert.match(wxml, /<view wx:if="\{\{nativeBook\.hasRelatedBooks\}\}" class="xf-book-detail-card">/);
    assert.match(wxml, /class="xf-book-detail-edge-spacer" aria-hidden="true"[\s\S]*class="xf-book-detail-card is-hero"/);
    assert.match(wxml, /class="xf-book-detail-bottom-spacer" aria-hidden="true"[\s\S]*<\/scroll-view>/);
    assert.match(wxml, /class="xf-book-detail-cover-frame" style="\{\{nativeBookCoverFrameStyle\}\}"/);
    assert.match(wxml, /<image wx:if="\{\{nativeBook\.coverImage\}\}" class="xf-book-detail-cover" src="\{\{nativeBook\.coverImage\}\}" mode="widthFix" bindload="onNativeBookCoverLoad" \/>/);
    assert.doesNotMatch(wxml, /<image[^>]*class="xf-book-detail-cover"[^>]*mode="aspectFit"/);
    assert.doesNotMatch(wxml, /内容线索|相关标签|xf-book-detail-chip/);
    assert.match(wxss, /\.xf-book-detail-card \{[\s\S]*padding: 34rpx;/);
    assert.match(wxss, /\.xf-book-detail-card\.is-hero \{[\s\S]*display: flex;[\s\S]*flex-direction: column;[\s\S]*gap: 0;[\s\S]*padding: 0;/);
    assert.match(wxss, /\.xf-book-detail-copy\.is-terminal \{[\s\S]*padding-bottom: 34rpx;/);
    assert.match(wxss, /\.xf-book-detail-tag-cloud \{[\s\S]*flex-wrap: wrap;[\s\S]*gap: 10rpx 12rpx;/);
    assert.match(wxss, /\.xf-book-detail-hero-more \{[\s\S]*padding: 24rpx 36rpx 42rpx;/);
    assert.doesNotMatch(wxss, /\.xf-book-detail-card\.is-more-content/);
    assert.match(wxss, /\.xf-book-detail-tag-pill \{[\s\S]*min-height: 34rpx;[\s\S]*padding: 5rpx 14rpx;[\s\S]*border-radius: 999rpx;[\s\S]*font-size: 20rpx;[\s\S]*font-weight: 400;/);
    assert.match(wxml, /<view wx:if="\{\{nativeBook\.hasIntro\}\}" class="xf-book-detail-card">[\s\S]*<text class="xf-book-detail-section-pill">BOOK INFO<\/text>[\s\S]*<text class="xf-book-detail-section-title">内容简介<\/text>/);
    assert.match(wxml, /wx:if="\{\{nativeBookTranslationError\}\}" class="xf-book-detail-translation-error"/);
    assert.match(wxml, /wx:if="\{\{nativeBookTranslationLoading\}\}" class="xf-book-detail-translate-loading"/);
    assert.match(wxml, /wx:if="\{\{nativeBook\.isExternal\}\}" class="xf-book-detail-translate-row"[\s\S]*catchtap="toggleNativeBookIntroTranslation"[\s\S]*src="\{\{nativeBookIntroTranslated \? '\/assets\/library-translate-symbol-icon-active\.png' : '\/assets\/library-translate-symbol-icon\.png'\}\}"/);
    assert.doesNotMatch(wxml, /src="\/assets\/library-translate-symbol-mask\.png"/);
    assert.doesNotMatch(wxml, />译<\/text>/);
    assert.equal(fs.existsSync(new URL("../assets/library-translate-symbol-mask.png", import.meta.url)), true);
    assert.equal(fs.existsSync(new URL("../assets/library-translate-symbol-icon.png", import.meta.url)), true);
    assert.equal(fs.existsSync(new URL("../assets/library-translate-symbol-icon-active.png", import.meta.url)), true);
    assert.match(wxss, /\.xf-book-detail-page \{[\s\S]*box-sizing: border-box;[\s\S]*height: 100vh;[\s\S]*overflow: hidden;/);
    assert.match(wxss, /\.xf-book-detail-scroll \{[\s\S]*height: 100%;[\s\S]*padding: 0 24rpx 56px;[\s\S]*background: #f3f2f8;/);
    assert.match(wxss, /\.xf-book-detail-edge-spacer \{[\s\S]*height: 30rpx;/);
    assert.match(wxss, /\.xf-book-detail-bottom-spacer \{[\s\S]*height: 90rpx;/);
    assert.match(wxss, /\.xf-book-detail-card\.is-hero \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/);
    assert.match(wxss, /\.xf-book-detail-fact\.is-clickable \{[\s\S]*background: #fbf8ff;/);
    assert.match(wxss, /\.xf-book-detail-cover-panel \{[\s\S]*width: 100%;[\s\S]*min-height: 0;[\s\S]*padding: 30rpx 0 34rpx;/);
    assert.match(wxss, /\.xf-book-detail-cover-frame \{[\s\S]*width: 344rpx;[\s\S]*padding: 8rpx;/);
    assert.doesNotMatch(wxss, /\.xf-book-detail-cover-frame \{[^}]*height:/);
    assert.match(wxss, /\.xf-book-detail-cover \{[\s\S]*width: 100%;[\s\S]*height: auto;/);
    assert.match(wxss, /\.xf-book-detail-related-track \{[\s\S]*padding: 0 4rpx 20rpx;/);
    assert.doesNotMatch(wxml, /xf-book-detail-source/);
    assert.match(wxss, /\.xf-book-detail-pill \{[\s\S]*padding: 8rpx 18rpx;/);
    assert.match(wxss, /\.xf-book-detail-title \{[\s\S]*font-size: 32rpx;[\s\S]*font-weight: 400;/);
    assert.match(wxss, /\.xf-book-detail-meta-label \{[\s\S]*font-size: 21rpx;[\s\S]*font-weight: 400;/);
    assert.match(wxss, /\.xf-book-detail-meta-value \{[\s\S]*font-size: 21rpx;[\s\S]*font-weight: 400;/);
    assert.match(wxss, /\.xf-book-detail-translate-button \{[\s\S]*width: 44rpx;[\s\S]*height: 44rpx;/);
    assert.match(wxss, /\.xf-book-detail-translate-row \{[\s\S]*justify-content: flex-end;/);
    assert.match(wxss, /\.xf-book-detail-translate-icon \{[\s\S]*width: 36rpx;[\s\S]*height: 36rpx;/);
    assert.match(wxss, /@keyframes xfBookTranslateDot/);
    const bookDetailCss = wxss.slice(wxss.indexOf(".xf-book-detail-page"), wxss.indexOf(".xf-material-detail-page"));
    assert.doesNotMatch(bookDetailCss, /font-weight:\s*(?:[5-9]\d{2}|bold|bolder)/);
    assert.match(js, /request\(\{ url: `\/api\/programs\/\$\{encodedId\}` \}\)/);
    assert.match(js, /request\(\{ url: `\/api\/books\/\$\{encodedId\}` \}\)/);
    assert.match(js, /request\(\{ url: `\/api\/books\/\$\{encodedId\}\/metadata` \}\)/);
    assert.match(js, /request\(\{ url: `\/api\/books\/external\/\$\{encodedId\}` \}\)/);
    assert.match(js, /request\(\{ url: `\/api\/learning-materials\/\$\{encodedId\}` \}\)/);
    assert.match(js, /request\(\{ url: `\/api\/guests\/\$\{encodedId\}` \}\)/);
    assert.match(js, /request\(\{ url: `\/api\/worthbuy\/\$\{encodedQuery\}` \}\)/);
    assert.match(js, /nativeProgramMode: true/);
    assert.match(js, /nativeBookMode: true/);
    assert.match(js, /nativeMaterialMode: true/);
    assert.doesNotMatch(js, /const topicSlug = extractTopicSlug\(src\)/);
    assert.match(js, /nativeTopicMode: true/);
    assert.match(js, /loadNativeTopic\(topicSlug\)/);
    assert.match(js, /nativeExpertMode: true/);
    assert.match(js, /nativeWorthBuyMode: true/);
    assert.match(js, /goMaterialsList\(\)/);
    assert.match(js, /goExpertsList\(\)/);
    assert.match(js, /goWorthBuyList\(\)/);
    assert.match(js, /copyNativeMaterialLink\(\)/);
    assert.match(js, /onNativeBookFactTap\(event\) \{[\s\S]*return this\.onNativeBookTagTap\(event\);[\s\S]*\}/);
    assert.match(wxss, /\.xf-book-detail-topbar \{[\s\S]*box-shadow: 0 8rpx 24rpx rgba\(31, 29, 26, 0\.06\);/);
    assert.match(wxss, /\.xf-book-detail-nav-title \{[\s\S]*position: absolute;[\s\S]*left: 50%;[\s\S]*align-items: center;[\s\S]*text-align: center;[\s\S]*transform: translateX\(-50%\);/);
    assert.match(wxss, /\.xf-material-detail-page \{[\s\S]*background: #f3f2f8;/);
    assert.match(wxss, /\.xf-material-detail-card\.is-hero \{[\s\S]*background: radial-gradient/);
  assert.match(wxml, /class="xf-material-detail-link" user-select="true" bindtap="copyNativeMaterialLink"/);
    assert.doesNotMatch(wxml, /class="xf-material-detail-copy/);
    assert.match(wxss, /\.xf-expert-detail-page \{[\s\S]*background: #f3f2f8;/);
    assert.match(wxss, /\.xf-expert-detail-card\.is-profile \{[\s\S]*background: #ffffff;[\s\S]*text-align: center;/);
    assert.match(wxss, /\.xf-expert-detail-agent-card \{[\s\S]*background: #ffffff;/);
    assert.match(wxss, /\.xf-expert-detail-user-bubble \{[\s\S]*background: #5e17eb;[\s\S]*color: #ffffff;/);
    assert.match(wxml, /class="xf-expert-detail-composer \{\{nativeExpertAttachmentMenuOpen \? 'is-attach-open' : ''\}\}"/);
    assert.match(wxml, /class="xf-expert-detail-input-row"/);
    assert.match(wxml, /class="xf-expert-detail-voice"[\s\S]*catchtap="toggleNativeExpertVoiceInput"[\s\S]*src="\/assets\/xiaowanzi-icons\/voice-dark\.png"/);
    assert.match(wxml, /class="xf-expert-detail-input"[\s\S]*placeholder="对话内容已开启隐私保护"[\s\S]*bindfocus="onNativeExpertQuestionFocus"[\s\S]*bindblur="onNativeExpertQuestionBlur"/);
    assert.match(wxml, /class="xf-expert-detail-send \{\{nativeExpertSending \? 'is-stop' : 'is-send'\}\}"[\s\S]*src="\/assets\/xiaowanzi-icons\/send-white\.png"/);
    assert.match(wxml, /class="xf-expert-detail-plus \{\{nativeExpertAttachmentMenuOpen \? 'is-open' : ''\}\}"[\s\S]*catchtap="toggleNativeExpertAttachmentMenu"[\s\S]*src="\{\{nativeExpertAttachmentMenuOpen \? '\/assets\/xiaowanzi-icons\/close-purple\.png' : '\/assets\/xiaowanzi-icons\/add-dark\.png'\}\}"/);
    assert.match(wxml, /wx:if="\{\{nativeExpert\.agentEnabled && nativeExpertAuthed && nativeExpertAttachmentMenuOpen\}\}" class="xf-expert-detail-attach-menu"/);
    assert.match(js, /nativeExpertAttachmentMenuOpen: false/);
    assert.match(js, /toggleNativeExpertVoiceInput\(\) \{[\s\S]*语音输入正在开发中/);
    assert.match(js, /toggleNativeExpertAttachmentMenu\(\) \{/);
    assert.match(js, /chooseNativeExpertAttachment\(event\) \{[\s\S]*嘉宾分身暂不支持附件提问/);
    assert.match(wxss, /\.xf-expert-detail-composer \{[\s\S]*position: fixed;/);
    assert.match(wxss, /\.xf-expert-detail-input-row \{[\s\S]*display: flex;[\s\S]*align-items: center;[\s\S]*gap: 10px;/);
    assert.match(wxss, /\.xf-expert-detail-input-shell \{[\s\S]*height: 58px;[\s\S]*background: rgba\(255, 255, 255, 0\.96\);/);
    assert.match(wxss, /\.xf-expert-detail-voice \{[\s\S]*width: 44px;[\s\S]*height: 44px;/);
    assert.match(wxss, /\.xf-expert-detail-send \{[\s\S]*width: 46px;[\s\S]*height: 46px;/);
    assert.match(wxss, /\.xf-expert-detail-plus \{[\s\S]*width: 52px;[\s\S]*height: 52px;/);
    assert.match(wxss, /\.xf-expert-detail-plus-mark \{[\s\S]*width: 17\.6px;[\s\S]*height: 17\.6px;/);
    assert.doesNotMatch(wxss, /\.xf-expert-detail-composer \{[^}]*background:/);
    assert.match(wxss, /\.xf-expert-detail-scroll \{[\s\S]*?padding: 26rpx 22rpx 24rpx;/);
    assert.doesNotMatch(wxss, /\.xf-expert-detail-scroll \{[\s\S]*?padding: 26rpx 22rpx calc\(120rpx \+ env\(safe-area-inset-bottom\)\);/);
    assert.doesNotMatch(wxss, /\.xf-expert-detail-scroll \{[\s\S]*?padding: 26rpx 22rpx calc\(190rpx \+ env\(safe-area-inset-bottom\)\);/);
    assert.match(wxss, /\.xf-worthbuy-detail-page \{[\s\S]*background: #f8f6ff;/);
    assert.match(wxss, /\.xf-worthbuy-detail-card\.is-hero \{[\s\S]*background: #ffffff;/);
    assert.match(wxss, /\.xf-worthbuy-detail-score-fill \{[\s\S]*background: #5e17eb;/);
    assert.match(wxss, /\.xf-program-detail-page \{[\s\S]*box-sizing: border-box;[\s\S]*height: 100vh;[\s\S]*overflow: hidden;[\s\S]*background: #ffffff;/);
    assert.match(wxss, /\.xf-program-detail-topbar \{[\s\S]*background: #ffffff;[\s\S]*box-shadow: none;/);
    assert.match(wxss, /\.xf-program-detail-back-button \{[\s\S]*left: 26rpx;/);
    assert.match(wxss, /\.xf-program-detail-scroll \{[\s\S]*height: 100%;[\s\S]*padding-bottom: 40rpx;[\s\S]*background: #ffffff;/);
    assert.match(wxss, /\.xf-program-detail-hero-content \{[\s\S]*padding: 120rpx 44rpx 72rpx;[\s\S]*transform: translateY\(-48rpx\);/);
    assert.match(wxss, /\.xf-program-detail-hero-icon/);
    assert.match(wxss, /\.xf-program-detail-summary-corner/);
    assert.match(wxss, /\.xf-program-detail-card\.is-summary \.xf-program-detail-card-head \{[\s\S]*justify-content: center;[\s\S]*width: fit-content;[\s\S]*margin: 0 auto 30rpx;[\s\S]*padding-bottom: 26rpx;[\s\S]*border-bottom: 1rpx solid #f1edf7;/);
    assert.match(wxss, /\.xf-program-detail-card\.is-summary \.xf-program-detail-card-title \{[\s\S]*color: #5e17eb;/);
    assert.match(wxss, /\.xf-program-detail-content-shell \{[\s\S]*box-sizing: border-box;[\s\S]*margin: 28rpx 28rpx 0;[\s\S]*padding: 28rpx;/);
    assert.match(wxss, /\.xf-program-detail-content-shell \.xf-program-detail-tabs \{[\s\S]*margin: 0;[\s\S]*max-width: 100%;/);
    assert.match(wxss, /\.xf-program-detail-content-panel/);
    assert.match(wxss, /\.xf-program-detail-transcript-meta \{[\s\S]*display: flex;[\s\S]*align-items: center;[\s\S]*gap: 8rpx;[\s\S]*white-space: nowrap;/);
    assert.match(wxss, /\.xf-program-detail-time,[\s\S]*\.xf-program-detail-speaker,[\s\S]*\.xf-program-detail-transcript-separator \{[\s\S]*color: #5e17eb;[\s\S]*font-weight: 900;/);
    assert.match(wxss, /\.xf-program-detail-speaker \{[\s\S]*margin-top: 0;/);
    assert.doesNotMatch(wxss, /\.xf-program-detail-speaker \{[\s\S]*color: rgba\(94, 23, 235, 0\.7\);/);
    assert.ok(
      wxml.indexOf('class="xf-program-detail-card is-guest is-centered"') < wxml.indexOf('class="xf-program-detail-content-shell"'),
      "program guest card should appear before the mindmap, quick view, and transcript section"
    );
    assert.match(wxss, /\.xf-program-detail-content-row\.is-featured \{[\s\S]*padding: 24rpx;[\s\S]*border-radius: 24rpx;[\s\S]*background: rgba\(94, 23, 235, 0\.06\);/);
    assert.match(wxss, /\.xf-program-detail-content-row\.is-featured \.xf-program-detail-content-text \{[\s\S]*color: #211a18;[\s\S]*font-weight: 800;/);
    assert.match(wxss, /\.xf-program-detail-mindmap-outline \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/);
    assert.match(wxss, /\.xf-program-detail-mindmap-root \{[\s\S]*border-left: 6rpx solid #5e17eb;/);
    assert.match(wxss, /\.xf-program-detail-mindmap-branch \{[\s\S]*border: 1rpx solid #eee8ff;/);
    assert.match(wxss, /\.xf-program-detail-mindmap-branch \{[\s\S]*border-left: 6rpx solid #7c3aed;/);
    assert.match(wxss, /\.xf-program-detail-mindmap-branch-number \{[\s\S]*color: #5e17eb;/);
    assert.match(wxss, /\.xf-program-detail-mindmap-toggle \{[\s\S]*border: 2rpx solid #c8b5ff;[\s\S]*color: #5e17eb;/);
    assert.doesNotMatch(js, /const colors = \[/);
    assert.doesNotMatch(wxml, /item\.color|style="[^"]*\{\{item\.color\}\}/);
    assert.match(wxss, /\.xf-program-detail-mindmap-child \{[\s\S]*position: relative;/);
    assert.match(wxss, /\.xf-program-detail-mindmap-toggle \{[\s\S]*border-radius: 50%;/);
    assert.doesNotMatch(wxss, /\.xf-program-detail-mindmap-canvas|\.xf-program-detail-mindmap-area|\.xf-program-detail-mindmap-movable|\.xf-program-detail-mindmap-image|\.xf-program-detail-mindmap-hotspot/);
    assert.match(wxss, /\.xf-program-detail-library-link/);
    assert.doesNotMatch(wxss, /\.xf-program-detail-outline-node/);
    assert.match(wxss, /\.xf-program-detail-player-fab/);
    assert.match(wxss, /\.xf-program-detail-player-rail/);
    assert.match(wxss, /\.xf-program-detail-player-rail \{[\s\S]*position: fixed;[\s\S]*right: 54rpx;[\s\S]*bottom: calc\(160rpx \+ env\(safe-area-inset-bottom\)\);[\s\S]*gap: 16rpx;[\s\S]*opacity: 0;[\s\S]*pointer-events: none;[\s\S]*transform: translateY\(20rpx\) scale\(0\.96\);/);
    assert.match(wxss, /\.xf-program-detail-player-rail\.is-open \{[\s\S]*opacity: 1;[\s\S]*pointer-events: auto;[\s\S]*transform: translateY\(0\) scale\(1\);/);
    assert.match(wxss, /\.xf-program-detail-rail-button \{[\s\S]*width: 76rpx;[\s\S]*min-width: 76rpx;[\s\S]*height: 76rpx;[\s\S]*padding: 0;[\s\S]*border-radius: 50%;/);
    assert.match(wxss, /\.xf-program-detail-rail-button\.is-speed \{[\s\S]*width: 76rpx;[\s\S]*min-width: 76rpx;[\s\S]*height: 76rpx;[\s\S]*border-radius: 50%;/);
    assert.match(wxss, /\.xf-program-detail-rail-icon \{[\s\S]*width: 38rpx;[\s\S]*height: 38rpx;/);
    assert.match(wxss, /\.xf-program-detail-skip-icon \{[\s\S]*position: relative;[\s\S]*width: 38rpx;[\s\S]*height: 38rpx;/);
    assert.match(wxss, /\.xf-program-detail-skip-icon::before \{[\s\S]*border: 4rpx solid #5e17eb;[\s\S]*border-left-color: transparent;/);
    assert.match(wxss, /\.xf-program-detail-skip-icon\.is-forward \{[\s\S]*transform: scaleX\(-1\);/);
    assert.match(wxss, /\.xf-program-detail-player-fab \{[\s\S]*position: fixed;[\s\S]*right: 40rpx;[\s\S]*bottom: calc\(40rpx \+ env\(safe-area-inset-bottom\)\);[\s\S]*width: 52px;[\s\S]*min-width: 52px;[\s\S]*height: 52px;/);
    assert.match(wxss, /\.xf-program-detail-player-fab-icon \{[\s\S]*width: 26px;[\s\S]*height: 26px;/);
    assert.match(js, /playerQuickActionsOpen: false/);
    assert.match(js, /showNativePlayerQuickActions\(\) \{[\s\S]*playerQuickActionsOpen: true[\s\S]*5000/);
    assert.match(js, /toggleNativeAudio\(\) \{[\s\S]*this\.showNativePlayerQuickActions\(\)/);
    assert.match(wxss, /\.xf-program-detail-extension-label \{[\s\S]*margin-top: 28rpx;[\s\S]*font-size: 20rpx;[\s\S]*letter-spacing: 0\.08em;/);
    assert.match(wxss, /\.xf-program-detail-extension-item-title \{[\s\S]*color: #211a18;[\s\S]*font-size: 25rpx;[\s\S]*font-weight: 900;/);
    assert.match(wxss, /\.xf-program-detail-extension-item\.is-link \{[\s\S]*width: 100%;[\s\S]*background: transparent;[\s\S]*text-align: left;/);
    assert.match(wxss, /\.xf-program-detail-extension-item-meta \{[\s\S]*color: #7c34e8;[\s\S]*font-size: 21rpx;/);
    assert.match(wxss, /\.xf-program-detail-extension-item-arrow \{[\s\S]*width: 24rpx;[\s\S]*height: 24rpx;/);
    assert.match(wxss, /\.xf-program-detail-card\.is-guest\.is-centered \{[\s\S]*display: block;[\s\S]*text-align: center;/);
    assert.match(wxss, /\.xf-program-detail-guest-switcher \{[\s\S]*width: 100%;[\s\S]*margin: 0 auto 40rpx;[\s\S]*white-space: nowrap;/);
    assert.match(wxss, /\.xf-program-detail-guest-switcher-inner \{[\s\S]*gap: 16rpx;[\s\S]*min-width: 100%;/);
    assert.match(wxss, /\.xf-program-detail-guest-pill \{[\s\S]*gap: 12rpx;[\s\S]*height: 68rpx;[\s\S]*padding: 0 24rpx;[\s\S]*border: 2rpx solid #e7e5e4;[\s\S]*border-radius: 999rpx;[\s\S]*background: #f5f5f4;[\s\S]*color: #44403c;/);
    assert.match(wxss, /\.xf-program-detail-guest-pill\.is-active \{[\s\S]*border-color: rgba\(94, 23, 235, 0\.25\);[\s\S]*background: rgba\(94, 23, 235, 0\.12\);[\s\S]*color: #5e17eb;/);
    assert.match(wxss, /\.xf-program-detail-guest-pill-avatar \{[\s\S]*width: 40rpx;[\s\S]*height: 40rpx;[\s\S]*box-shadow: inset 0 0 0 2rpx rgba\(94, 23, 235, 0\.12\);/);
    assert.match(wxss, /\.xf-program-detail-card\.is-guest\.is-centered \.xf-program-detail-guest-avatar-wrap \{[\s\S]*box-sizing: border-box;[\s\S]*width: 188rpx;[\s\S]*height: 188rpx;[\s\S]*margin: 0 auto 24rpx;[\s\S]*padding: 12rpx;[\s\S]*border: 2rpx solid #eee8ff;[\s\S]*border-radius: 40rpx;[\s\S]*background: #f4f0ff;/);
    assert.match(wxss, /\.xf-program-detail-guest-avatar\.is-fallback \{[\s\S]*box-sizing: border-box;[\s\S]*padding: 12rpx;[\s\S]*background: #ffffff;/);
    assert.match(wxss, /\.xf-program-detail-card\.is-guest\.is-centered \.xf-program-detail-guest-profile \{[\s\S]*height: 98rpx;[\s\S]*border-radius: 18rpx;/);
    assert.match(wxss, /\.xf-program-detail-guest-wish,[\s\S]*\.xf-expert-detail-wish \{[\s\S]*right: -16rpx;[\s\S]*bottom: -16rpx;[\s\S]*width: 52rpx;[\s\S]*min-width: 52rpx;[\s\S]*height: 52rpx;[\s\S]*border-radius: 32rpx;[\s\S]*background: #f43f5e;[\s\S]*box-shadow: 0 8rpx 18rpx rgba\(225, 29, 72, 0\.24\);/);
    assert.match(wxss, /\.xf-program-detail-wish-icon \{[\s\S]*width: 28rpx;[\s\S]*height: 28rpx;/);
    assert.doesNotMatch(wxss, /\.xf-program-detail-wish-count \{/);
    assert.match(wxss, /\.xf-program-detail-wish-bubble \{[\s\S]*width: 40rpx;[\s\S]*height: 40rpx;[\s\S]*animation-name: xfReturnWishBubble;/);
    assert.match(wxss, /@keyframes xfReturnWishPulse/);
    assert.match(wxss, /@keyframes xfReturnWishBubble/);
    assert.match(wxss, /\.xf-expert-detail-wish/);
    assert.equal(js.includes("webUrl("), false);

    context.data.selectedProgramDictionaryEntry = { id: "stale-entry" };
    const requestCountBeforeProgram = requests.length;
    const loadPromise = definition.onLoad.call(context, {
      title: encodeURIComponent("节目详情"),
      url: encodeURIComponent("https://xianfeng.xinzhi.info/programs/abc?xf_mp=1")
    });
    await loadPromise;

    assert.equal(context.data.src, "");
    assert.equal(context.data.selected, 0);
    assert.equal(context.data.hideTabbar, true);
    assert.equal(context.data.nativeProgramMode, true);
    assert.equal(context.data.nativeProgramLoading, false);
    assert.equal(context.data.selectedProgramDictionaryEntry, null);
    assert.equal(context.data.showNativePageNav, false);
    assert.equal(context.data.nativeBookMode, false);
    assert.equal(context.data.nativeMaterialMode, false);
    assert.equal(context.data.title, "加餐 | 创意写作是更好的写作方式吗？");
    assert.equal(context.data.nativeProgram.title, "加餐 | 创意写作是更好的写作方式吗？");
    assert.equal(audioRuntime.createCalls, 1);
    assert.equal(context.audioContext.src, "https://xianfeng.xinzhi.info/uploads/audio/abc.mp3");
    assert.equal(context.data.nativeProgram.showLabel, "中年知己");
    assert.deepEqual(context.data.nativeProgram.contentModes.map((item) => item.key), ["quickview", "mindmap", "transcript"]);
    assert.equal(context.data.activeContentMode, "quickview");
    assert.equal(context.data.nativeProgram.mindMap.root.title, "写作表达的断层");
    assert.equal(context.data.nativeProgram.mindMap.root.children[1].title, "表达输出");
    assert.equal(context.data.nativeProgram.mindMap.root.children[4].title, "修改反馈");
    assert.deepEqual(context.data.nativeProgramMindMapCollapsedBranches, []);
    assert.equal(context.data.nativeProgramMindMapOutline.root.title, "写作表达的断层");
    assert.equal(context.data.nativeProgramMindMapOutline.branches.length, 5);
    assert.equal(context.data.nativeProgramMindMapOutline.branches[0].title, "阅读输入");
    assert.equal(context.data.nativeProgramMindMapOutline.branches[0].children.length, 1);
    definition.toggleNativeProgramMindMapBranch.call(context, { currentTarget: { dataset: { index: 0 } } });
    assert.deepEqual(context.data.nativeProgramMindMapCollapsedBranches, [0]);
    assert.equal(context.data.nativeProgramMindMapOutline.branches[0].children.length, 0);
    assert.equal(context.data.nativeProgramMindMapOutline.branches[0].collapsed, true);
    definition.toggleNativeProgramMindMapBranch.call(context, { currentTarget: { dataset: { index: 0 } } });
    assert.deepEqual(context.data.nativeProgramMindMapCollapsedBranches, []);
    assert.equal(context.data.nativeProgramMindMapOutline.branches[0].children.length, 1);
    assert.equal(context.data.nativeProgram.quickView[0].summary, "为什么孩子写不出来");
    assert.equal(context.data.nativeProgram.transcript.length, 10);
    assert.deepEqual(
      context.data.nativeProgram.transcript.slice(0, 6).map((item) => item.time),
      ["00:05-00:19", "00:19-00:31", "00:31-00:46", "00:46-01:21", "01:21-01:45", "01:45-02:00"]
    );
    assert.equal(context.data.nativeProgram.transcript[0].speaker, "阿力");
    assert.equal(context.data.nativeProgram.transcript[0].speakerLabel, "主播·阿力");
    assert.equal(context.data.nativeProgram.transcript[0].featured, true);
    assert.equal(context.data.nativeProgram.transcript[5].speakerLabel, "嘉宾·张琳");
    assert.equal(context.data.nativeProgram.transcript[9].text, "第十段。");
    assert.deepEqual(
      context.data.nativeProgram.transcript[0].contentNodes.map((node) => [node.type, node.text, node.term || ""]),
      [
        ["dictionary", "国际教育", "国际教育"],
        ["text", "也叫国际化教育，", ""],
        ["dictionary", "教育", "教育"],
        ["text", "需要长期投入。", ""]
      ]
    );
    assert.deepEqual(context.data.nativeProgram.transcript[1].contentNodes, [
      { type: "text", text: "后面再说国际化教育和教育。" }
    ]);
    assert.equal(context.data.nativeProgram.dictionaryEntries.length, 2);
    const requestCountBeforeDictionaryInteraction = requests.length;
    const navigationCountBeforeDictionaryInteraction = navigations.length;
    definition.openProgramDictionaryEntry.call(context, {
      currentTarget: { dataset: { entryId: "dictionary-international-education" } }
    });
    assert.equal(context.data.selectedProgramDictionaryEntry.term, "国际教育");
    assert.equal(context.data.selectedProgramDictionaryEntry.definition, "以国际视野为指导的教育理念和实践。");
    assert.deepEqual(context.data.selectedProgramDictionaryEntry.aliases, ["国际化教育"]);
    const selectedDictionaryEntry = context.data.selectedProgramDictionaryEntry;
    definition.openProgramDictionaryEntry.call(context, {
      currentTarget: { dataset: { entryId: "unknown-entry" } }
    });
    assert.equal(context.data.selectedProgramDictionaryEntry, selectedDictionaryEntry);
    definition.stopNativeEvent.call(context);
    assert.equal(context.data.selectedProgramDictionaryEntry, selectedDictionaryEntry);
    definition.closeProgramDictionaryEntry.call(context);
    assert.equal(context.data.selectedProgramDictionaryEntry, null);
    assert.equal(requests.length, requestCountBeforeDictionaryInteraction);
    assert.equal(navigations.length, navigationCountBeforeDictionaryInteraction);
    context.data.selectedProgramDictionaryEntry = selectedDictionaryEntry;
    await definition.loadNativeProgram.call(context, "abc");
    assert.equal(context.data.selectedProgramDictionaryEntry, null);
    assert.equal(context.data.nativeProgram.transcript[0].contentNodes[0].type, "dictionary");
    requests.splice(-2, 2);
    requestOptions.splice(-2, 2);
    assert.equal(context.data.nativeProgram.hasExtension, true);
    assert.equal(context.data.nativeProgram.curatedReading.length, 2);
    assert.equal(context.data.nativeProgram.curatedReading[0].title, "把阅读变成表达");
    assert.equal(context.data.nativeProgram.curatedReading[0].subtitle, "把阅读材料转化为可执行的表达训练。");
    assert.equal(context.data.nativeProgram.curatedReading[0].meta, "作者：站内作者 · 译者：译者甲 · 出版社：家长先疯出版社");
    assert.equal(context.data.nativeProgram.curatedReading[0].bookId, "curated-book-1");
    assert.equal(context.data.nativeProgram.curatedReading[0].url, "https://verified.example.com/reading-transfer");
    assert.equal(context.data.nativeProgram.curatedReading[1].title, "孩子写作启蒙清单");
    assert.equal(context.data.nativeProgram.curatedReading[1].subtitle, "从复述到仿写，逐步降低写作启动难度。");
    assert.equal(context.data.nativeProgram.curatedReading[1].meta, "作者：清单作者");
    assert.equal(context.data.nativeProgram.curatedReading[1].bookId, "");
    assert.equal(context.data.nativeProgram.curatedReading[1].url, "");
    assert.equal(context.data.nativeProgram.relatedPrograms.length, 1);
    assert.equal(context.data.nativeProgram.relatedPrograms[0].title, "同一位嘉宾的另一档节目");
    assert.equal(context.data.nativeProgram.relatedPrograms[0].guestMeta, "刘美文 美文工作室负责人");
    definition.openNativeRelatedProgram.call(context, { currentTarget: { dataset: { index: 0 } } });
    const relatedProgramNavigation = new URL(navigations.at(-1).url, "https://mini.local");
    assert.equal(relatedProgramNavigation.pathname, "/pages/webview/index");
    assert.equal(relatedProgramNavigation.searchParams.get("url"), "https://xianfeng.xinzhi.info/programs/program-related-1");
    definition.openNativeProgramCuratedBook.call(context, { currentTarget: { dataset: { index: 0 } } });
    assert.equal(navigations.length, 2);
    const curatedBookNavigation = new URL(navigations[1].url, "https://mini.local");
    assert.equal(curatedBookNavigation.pathname, "/pages/webview/index");
    assert.equal(curatedBookNavigation.searchParams.get("title"), "把阅读变成表达");
    assert.equal(curatedBookNavigation.searchParams.get("url"), "https://xianfeng.xinzhi.info/reading/curated-book-1");
    definition.openNativeProgramCuratedBook.call(context, { currentTarget: { dataset: { index: 1 } } });
    assert.equal(navigations.length, 2);
    assert.equal(context.data.nativeProgram.guests.length, 2);
    assert.deepEqual(context.data.nativeProgram.guests.map((guest) => guest.name), ["刘美文", "王璇"]);
    assert.equal(
      context.data.nativeProgram.guests.some((guest) => guest.name === "历史快照嘉宾"),
      false
    );
    assert.equal(context.data.nativeProgram.activeGuestIndex, 0);
    assert.equal(context.data.nativeProgram.guestId, "expert-1");
    assert.equal(context.data.nativeProgram.guestName, "刘美文");
    assert.equal(context.data.nativeProgram.guestTitle, "美文工作室负责人");
    assert.equal(context.data.nativeProgram.guestAvatar, "https://img.example/liu-meiwen.png");
    assert.equal(context.data.nativeProgram.guestAvatarFallback, false);
    definition.switchNativeProgramGuest.call(context, { currentTarget: { dataset: { index: 1 } } });
    assert.equal(context.data.nativeProgram.activeGuestIndex, 1);
    assert.equal(context.data.nativeProgram.guestId, "expert-2");
    assert.equal(context.data.nativeProgram.guestName, "王璇");
    assert.equal(context.data.nativeProgram.guestTitle, "资深编辑");
    assert.equal(context.data.nativeProgram.guestAvatar, "/assets/wel-avatar/no-hat.png");
    assert.equal(context.data.nativeProgram.guestAvatarFallback, true);
    definition.switchNativeProgramGuest.call(context, { currentTarget: { dataset: { index: 0 } } });
    assert.equal(context.data.nativeProgram.guestId, "expert-1");
    assert.equal(context.data.nativeProgram.guestWishSent, false);
    assert.equal(context.data.nativeProgram.guestWishCount, 0);
    assert.equal(context.data.nativeProgram.guestWishAnimating, false);
    assert.deepEqual(context.data.nativeProgram.guestWishBubbles, []);
    assert.equal(context.data.playerQuickActionsOpen, false);
    context.setData({
      nativeProgram: {
        ...context.data.nativeProgram,
        guestAvatar: "https://img.example/broken.png",
        guestAvatarFallback: false
      }
    });
    definition.useNativeProgramGuestAvatarFallback.call(context);
    assert.equal(context.data.nativeProgram.guestAvatar, "/assets/wel-avatar/no-hat.png");
    assert.equal(context.data.nativeProgram.guestAvatarFallback, true);
    assert.equal(requests.length, requestCountBeforeProgram + 2);
    assert.equal(requests.slice(-2).some((url) => url.endsWith("/api/programs/abc")), true);
    assert.equal(requests.slice(-2).some((url) => url.endsWith("/api/programs/abc/related")), true);
    assert.equal(Object.hasOwn(context.data, "nativeListPage"), false);

    definition.toggleNativeProgramGuestWish.call(context);
    assert.equal(context.data.nativeProgram.guestWishSent, true);
    assert.equal(context.data.nativeProgram.guestWishCount, 1);
    assert.equal(context.data.nativeProgram.guestWishAnimating, true);
    assert.equal(context.data.nativeProgram.guestWishBubbles.length, 5);
    assert.deepEqual(storage.get("xf_guest_wishes"), { "expert-1": 1 });
    assert.deepEqual(storage.get("xf_guest_wishes_sent"), { "expert-1": true });

    definition.toggleNativeProgramGuestWish.call(context);
    assert.equal(context.data.nativeProgram.guestWishSent, true);
    assert.equal(context.data.nativeProgram.guestWishCount, 1);
    assert.equal(context.data.nativeProgram.guestWishBubbles.length, 5);
    const programWishRequests = requestOptions.filter((options) => options.url.endsWith("/api/guests/expert-1/return-wish"));
    assert.equal(programWishRequests.length, 2);
    assert.equal(programWishRequests[0].method, "POST");
    assert.deepEqual(programWishRequests[0].data, { programId: "program-1" });

    definition.toggleNativeAudio.call(context);
    assert.equal(context.data.playerQuickActionsOpen, true);
    assert.equal(context.data.isAudioPlaying, true);
    assert.equal(audioRuntime.playCalls, 1);
    assert.equal(context.audioContext.src, "https://xianfeng.xinzhi.info/uploads/audio/abc.mp3");
    definition.seekNativeAudio.call(context, { currentTarget: { dataset: { seconds: -10 } } });
    definition.seekNativeAudio.call(context, { currentTarget: { dataset: { seconds: 30 } } });
    assert.deepEqual(audioRuntime.seekCalls, [30, 70]);
    definition.toggleNativeAudioSpeed.call(context);
    assert.equal(context.data.audioPlaybackRate, 1.25);
    assert.equal(context.audioContext.playbackRate, 1.25);
    definition.openNativeProgramTranscript.call(context);
    assert.equal(context.data.playerQuickActionsOpen, true);
    definition.onUnload.call(context);

    const bookContext = {
      ...definition,
      data: { ...definition.data },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };
    const requestCountBeforeBook = requests.length;
    await definition.onLoad.call(bookContext, {
      title: encodeURIComponent("及阅详情"),
      url: encodeURIComponent("https://xianfeng.xinzhi.info/reading/book-1?xf_mp=1")
    });

    assert.equal(bookContext.data.src, "");
    assert.equal(bookContext.data.selected, 1);
    assert.equal(bookContext.data.nativeProgramMode, false);
    assert.equal(bookContext.data.nativeBookMode, true);
    assert.equal(bookContext.data.nativeBookLoading, false);
    assert.equal(bookContext.data.nativeMaterialMode, false);
    assert.equal(bookContext.data.title, "给孩子的写作启蒙");
    assert.equal(bookContext.data.nativeBook.title, "给孩子的写作启蒙");
    assert.equal(bookContext.data.nativeBook.author, "夏老师");
    assert.equal(bookContext.data.nativeBook.publisher, "家长先疯出版社");
    assert.equal(bookContext.data.nativeBook.description, "孩子写不出来，常常不是没有想法。需要把阅读中的材料转化为表达练习。两步训练能降低写作启动难度。");
    assert.equal(bookContext.data.nativeBook.introParagraphs.some((paragraph) => paragraph.includes("点击链接进入")), false);
    assert.equal(bookContext.data.nativeBook.introParagraphs.some((paragraph) => paragraph.includes("《小黑鱼》")), false);
    assert.equal(bookContext.data.nativeBook.hasRating, false);
    assert.equal(bookContext.data.nativeBook.isExternal, false);
    assert.deepEqual(bookContext.data.nativeBook.tags, [
      "5-6岁",
      "0-6岁1000本图书",
      "儿童童谣",
      "文化习俗",
      "品格教养",
      "魏智渊"
    ]);
    assert.equal(bookContext.data.nativeBook.tags.includes("儿童童谣；文化习俗；品格教养；0-6岁1000本图书"), false);
    assert.equal(bookContext.data.nativeBook.hasMoreContent, true);
    assert.equal(bookContext.data.nativeBook.hasFacts, true);
    assert.equal(bookContext.data.nativeBook.facts.some((fact) => fact.label === "来源"), false);
    assert.equal(bookContext.data.nativeBook.facts.some((fact) => fact.label === "推荐人"), false);
    assert.equal(bookContext.data.nativeBook.facts.some((fact) => fact.label === "年级"), false);
    assert.equal(bookContext.data.nativeBook.facts.some((fact) => fact.label === "主题"), false);
    assert.equal(bookContext.data.nativeBook.facts.some((fact) => fact.label === "作者" && fact.value === "夏老师" && fact.filterTag === "夏老师"), true);
    assert.equal(bookContext.data.nativeBook.facts.some((fact) => fact.label === "ISBN" && fact.value === "9780000000001"), true);
    assert.equal(bookContext.data.nativeBook.hasRelatedBooks, true);
    assert.equal(bookContext.data.nativeBook.relatedBooks[0].title, "表达力练习册");
    assert.equal(requests.length, requestCountBeforeBook + 2);
    definition.onNativeBookTagTap.call(bookContext, { currentTarget: { dataset: { tag: "文化习俗" } } });
    assert.deepEqual(storage.get("xf_reading_pending_filter_v1"), {
      source: "native",
      tag: "文化习俗"
    });
    definition.onNativeBookCoverLoad.call(bookContext, { detail: { width: 600, height: 600 } });
    assert.equal(bookContext.data.nativeBookCoverFrameStyle, "width: 344rpx;");
    definition.onNativeBookCoverLoad.call(bookContext, { detail: { width: 400, height: 600 } });
    assert.equal(bookContext.data.nativeBookCoverFrameStyle, "width: 344rpx;");
    definition.openNativeRelatedBook.call(bookContext, { currentTarget: { dataset: { index: 0 } } });
    assert.equal(bookContext.data.nativeBookLoading, true);

    storage.set("xf_native_books_cache_v6", [
      {
        _id: "book-1",
        title: "给孩子的写作启蒙",
        sourceName: "阅读积累与写作表达的断层",
        recommendedGuest: "夏老师",
        grade: "小学",
        categoryLabel: "写作",
        topic: "表达能力",
        hasMetadataDetail: true
      }
    ]);
    const recoveredRelatedContext = {
      ...definition,
      data: { ...definition.data },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };
    const requestCountBeforeRecoveredBook = requests.length;
    await definition.onLoad.call(recoveredRelatedContext, {
      title: encodeURIComponent("及阅详情"),
      url: encodeURIComponent("https://xianfeng.xinzhi.info/reading/book-1?xf_mp=1")
    });
    const recoveredRequests = requests.slice(requestCountBeforeRecoveredBook);
    assert.equal(recoveredRequests.some((url) => url.endsWith("/api/books")), true, JSON.stringify(recoveredRequests));
    assert.equal(recoveredRelatedContext.data.nativeBook.hasRelatedBooks, true);
    assert.equal(recoveredRelatedContext.data.nativeBook.relatedBooks[0].title, "缓存恢复的相关书");
    assert.equal(recoveredRelatedContext.data.nativeBook.relatedBooks[0].coverImage, "/assets/menu/jiyue-logo.png");
    assert.equal(storage.get("xf_native_books_cache_v6")[1].title, "缓存恢复的相关书");

    const emptyNativeBookContext = {
      ...definition,
      data: { ...definition.data },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };
    await definition.onLoad.call(emptyNativeBookContext, {
      title: encodeURIComponent("及阅详情"),
      url: encodeURIComponent("https://xianfeng.xinzhi.info/reading/book-empty?xf_mp=1")
    });
    assert.equal(emptyNativeBookContext.data.nativeBook.title, "只有标题的本地图书");
    assert.equal(emptyNativeBookContext.data.nativeBook.coverImage, "/assets/menu/jiyue-logo.png");
    assert.equal(emptyNativeBookContext.data.nativeBook.hasMoreContent, false);
    assert.deepEqual(emptyNativeBookContext.data.nativeBook.tags, []);
    assert.equal(emptyNativeBookContext.data.nativeBook.description, "");
    assert.equal(emptyNativeBookContext.data.nativeBook.hasIntro, false);
    assert.deepEqual(emptyNativeBookContext.data.nativeBook.introParagraphs, []);
    assert.equal(emptyNativeBookContext.data.nativeBook.hasFacts, false);
    assert.deepEqual(emptyNativeBookContext.data.nativeBook.facts, []);
    assert.equal(emptyNativeBookContext.data.nativeBook.hasRelatedBooks, false);
    assert.deepEqual(emptyNativeBookContext.data.nativeBook.relatedBooks, []);

    const unmarkedNativeBookContext = {
      ...definition,
      data: { ...definition.data },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };
    await definition.onLoad.call(unmarkedNativeBookContext, {
      title: encodeURIComponent("及阅详情"),
      url: encodeURIComponent("https://xianfeng.xinzhi.info/reading/book-unmarked?xf_mp=1")
    });
    assert.equal(unmarkedNativeBookContext.data.nativeBook.author, "");
    assert.equal(unmarkedNativeBookContext.data.nativeBook.hasFacts, false);
    assert.deepEqual(unmarkedNativeBookContext.data.nativeBook.facts, []);

    const externalBookContext = {
      ...definition,
      data: { ...definition.data },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };
    await definition.onLoad.call(externalBookContext, {
      title: encodeURIComponent("及阅详情"),
      url: encodeURIComponent("https://xianfeng.xinzhi.info/library?xf_external_book_id=external-book-1&xf_mp=1")
    });

    assert.equal(externalBookContext.data.src, "");
    assert.equal(externalBookContext.data.selected, 1);
    assert.equal(externalBookContext.data.nativeProgramMode, false);
    assert.equal(externalBookContext.data.nativeBookMode, true);
    assert.equal(externalBookContext.data.nativeBookLoading, false);
    assert.equal(externalBookContext.data.nativeMaterialMode, false);
    assert.equal(externalBookContext.data.title, "Phantom Limb");
    assert.equal(externalBookContext.data.nativeBook.author, "Lucinda Berry");
    assert.equal(externalBookContext.data.nativeBook.publisher, "外部出版社");
    assert.equal(externalBookContext.data.nativeBook.description, "Emily and Elizabeth spend their childhood locked in a bedroom.");
    assert.equal(externalBookContext.data.nativeBook.introParagraphs[0], "Emily and Elizabeth spend their childhood locked in a bedroom.");
    assert.equal(externalBookContext.data.nativeBook.hasMoreContent, true);
    assert.deepEqual(externalBookContext.data.nativeBook.tags, [
      "Fantasy",
      "Young Adult",
      "Fiction",
      "Magic",
      "Adventure",
      "Middle Grade",
      "Childrens"
    ]);
    assert.equal(externalBookContext.data.nativeBook.facts.some((fact) => fact.label === "词汇量" && fact.value === "52000"), true);
    assert.equal(externalBookContext.data.nativeBook.facts.some((fact) => fact.label === "难度" && fact.value === "Level 5"), true);
    assert.equal(externalBookContext.data.nativeBook.facts.some((fact) => fact.label === "是否虚构" && fact.value === "虚构"), true);
    assert.equal(externalBookContext.data.nativeBook.relatedBooks.length, 1);
    assert.equal(externalBookContext.data.nativeBook.relatedBooks[0].title, "Lie Lie Truth");
    assert.equal(externalBookContext.data.nativeBook.relatedBooks[0].coverImage, "/assets/menu/jiyue-logo.png");
    assert.equal(requests.some((url) => url.endsWith("/api/books/external/external-book-1")), false);
    definition.onNativeBookCoverLoad.call(externalBookContext, { detail: { width: 800, height: 500 } });
    assert.equal(externalBookContext.data.nativeBookCoverFrameStyle, "width: 430rpx;");

    await definition.toggleNativeBookIntroTranslation.call(externalBookContext);
    assert.equal(requests.some((url) => url.endsWith("/api/books/external/external-book-1/description-translation")), true);
    assert.equal(externalBookContext.data.nativeBookIntroTranslated, true);
    assert.equal(externalBookContext.data.nativeBookTranslationLoading, false);
    assert.equal(externalBookContext.data.nativeBookTranslationError, "");
    assert.equal(externalBookContext.data.nativeBook.introParagraphs[0], "艾米丽和伊丽莎白童年时被锁在卧室里。");

    await definition.toggleNativeBookIntroTranslation.call(externalBookContext);
    assert.equal(externalBookContext.data.nativeBookIntroTranslated, false);
    assert.equal(externalBookContext.data.nativeBook.introParagraphs[0], "Emily and Elizabeth spend their childhood locked in a bedroom.");

    const tagNavigationStorage = [];
    const tagNavigationCalls = [];
    global.wx.setStorageSync = (key, value) => tagNavigationStorage.push([key, value]);
    global.wx.switchTab = (options) => tagNavigationCalls.push(options);
    definition.onNativeBookTagTap.call(externalBookContext, { currentTarget: { dataset: { tag: "Thriller" } } });
    assert.deepEqual(tagNavigationStorage.at(-1), [
      "xf_reading_pending_filter_v1",
      { source: "external", tag: "Thriller" }
    ]);
    assert.deepEqual(tagNavigationCalls.at(-1), { url: "/pages/reading/index" });
    definition.onNativeBookFactTap.call(externalBookContext, { currentTarget: { dataset: { tag: "Lucinda Berry" } } });
    assert.deepEqual(tagNavigationStorage.at(-1), [
      "xf_reading_pending_filter_v1",
      { source: "external", tag: "Lucinda Berry" }
    ]);
    assert.deepEqual(tagNavigationCalls.at(-1), { url: "/pages/reading/index" });

    const emptyExternalBookContext = {
      ...definition,
      data: { ...definition.data },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };
    await definition.onLoad.call(emptyExternalBookContext, {
      title: encodeURIComponent("及阅详情"),
      url: encodeURIComponent("https://xianfeng.xinzhi.info/library?xf_external_book_id=external-book-empty&xf_mp=1")
    });
    assert.equal(emptyExternalBookContext.data.nativeBook.title, "Blank Intro Book");
    assert.equal(emptyExternalBookContext.data.nativeBook.coverImage, "/assets/menu/jiyue-logo.png");
    assert.equal(emptyExternalBookContext.data.nativeBook.description, "");
    assert.equal(emptyExternalBookContext.data.nativeBook.hasIntro, false);
    assert.deepEqual(emptyExternalBookContext.data.nativeBook.introParagraphs, []);
    assert.equal(emptyExternalBookContext.data.nativeBook.hasMoreContent, false);
    assert.deepEqual(emptyExternalBookContext.data.nativeBook.tags, []);
    assert.equal(emptyExternalBookContext.data.nativeBook.hasFacts, false);
    assert.deepEqual(emptyExternalBookContext.data.nativeBook.facts, []);
    assert.equal(emptyExternalBookContext.data.nativeBook.hasRelatedBooks, false);
    assert.deepEqual(emptyExternalBookContext.data.nativeBook.relatedBooks, []);

    const materialContext = {
      ...definition,
      data: { ...definition.data },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };
    await definition.onLoad.call(materialContext, {
      title: encodeURIComponent("资料详情"),
      url: encodeURIComponent("https://xianfeng.xinzhi.info/materials/material-1?xf_mp=1")
    });

    assert.equal(materialContext.data.src, "");
    assert.equal(materialContext.data.selected, 3);
    assert.equal(materialContext.data.nativeProgramMode, false);
    assert.equal(materialContext.data.nativeBookMode, false);
    assert.equal(materialContext.data.nativeMaterialMode, true);
    assert.equal(materialContext.data.nativeMaterialLoading, false);
    assert.equal(materialContext.data.title, "2026年高考资料（优志愿-耿忠诚）");
    assert.equal(materialContext.data.nativeMaterial.category, "升学资料");
    assert.equal(materialContext.data.nativeMaterial.sourceHost, "pan.example");
    assert.equal(materialContext.data.nativeMaterial.tags[0].text, "高中");
    assert.equal(materialContext.data.nativeMaterial.tags[2].text, "家庭教育");
    assert.equal(requests.some((url) => url.endsWith("/api/learning-materials/material-1")), true);

    const topicContext = {
      ...definition,
      data: { ...definition.data },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };
    await definition.onLoad.call(topicContext, {
      title: encodeURIComponent("请教详情"),
      url: encodeURIComponent("https://xianfeng.xinzhi.info/topics/topic-1?xf_mp=1")
    });

    assert.notEqual(topicContext.data.src, "");
    assert.equal(new URL(topicContext.data.src).pathname, "/topics/topic-1");
    assert.equal(new URL(topicContext.data.src).searchParams.get("xf_mp"), "1");
    assert.equal(new URL(topicContext.data.src).searchParams.get("xf_mpv"), "20260630-topic-detail");
    assert.equal(topicContext.data.selected, 4);
    assert.equal(topicContext.data.nativeProgramMode, false);
    assert.equal(topicContext.data.nativeBookMode, false);
    assert.equal(topicContext.data.nativeMaterialMode, false);
    assert.equal(topicContext.data.nativeTopicMode, false);
    assert.equal(topicContext.data.title, "请教详情");
    assert.equal(requests.some((url) => url.endsWith("/api/topic-hub/topic-1")), false);

    storage.set("xf_token", "token-1");
    const expertContext = {
      ...definition,
      data: { ...definition.data },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };
    await definition.onLoad.call(expertContext, {
      title: encodeURIComponent("智库详情"),
      url: encodeURIComponent("https://xianfeng.xinzhi.info/experts/expert-1?xf_mp=1")
    });

    assert.equal(expertContext.data.src, "");
    assert.equal(expertContext.data.selected, 0);
    assert.equal(expertContext.data.nativeProgramMode, false);
    assert.equal(expertContext.data.nativeBookMode, false);
    assert.equal(expertContext.data.nativeMaterialMode, false);
    assert.equal(expertContext.data.nativeTopicMode, false);
    assert.equal(expertContext.data.nativeExpertMode, true);
    assert.equal(expertContext.data.nativeExpertLoading, false);
    assert.equal(expertContext.data.title, "夏老师");
    assert.equal(expertContext.data.nativeExpert.title, "教育观察者");
    assert.equal(expertContext.data.nativeExpert.bio, "长期关注儿童表达、阅读和写作迁移。");
    assert.deepEqual(expertContext.data.nativeExpert.contentTags.slice(0, 3), ["阅读", "写作", "表达能力"]);
    assert.equal(expertContext.data.nativeExpert.programCount, 2);
    assert.equal(expertContext.data.nativeExpert.referenceCount, 3);
    assert.equal(expertContext.data.nativeExpert.agentLabel, "可提问");
    assert.equal(expertContext.data.nativeExpert.relatedPrograms[0].title, "孩子写作怎么练");
    assert.equal(expertContext.data.nativeExpert.publications[0].title, "儿童表达观察");
    assert.equal(expertContext.data.nativeExpert.profileReferences[0].title, "公开档案");
    assert.equal(expertContext.data.nativeExpert.socialProfiles[0].label, "夏老师教育观察");
    assert.equal(expertContext.data.nativeExpert.listenerBenefits[0].description, "适合小学家庭的表达训练清单");
    assert.deepEqual(expertContext.data.nativeExpert.visibleBookLists.map((item) => item.name), ["书单1", "书单2", "书单3", "书单4", "书单5"]);
    assert.equal(expertContext.data.nativeExpert.hiddenBookListCount, 2);
    assert.equal(expertContext.data.nativeExpert.bookListsExpanded, false);
    assert.equal(expertContext.data.nativeExpert.wishSent, true);
    assert.equal(expertContext.data.nativeExpert.wishCount, 1);
    assert.equal(expertContext.data.nativeExpert.wishAnimating, false);
    assert.deepEqual(expertContext.data.nativeExpert.wishBubbles, []);
    assert.equal(expertContext.data.hideTabbar, true);
    assert.equal(expertContext.data.nativeExpertAuthed, true);
    assert.equal(expertContext.data.nativeExpertAgent.chunkCount, 1918);
    assert.equal(expertContext.data.nativeExpertMessages.length, 2);
    assert.equal(expertContext.data.nativeExpertMessages[1].citationCount, 1);
    assert.equal(expertContext.data.nativeExpertMessages[1].recommendations[0].title, "孩子写作怎么练");

    definition.toggleNativeExpertWish.call(expertContext);
    assert.equal(expertContext.data.nativeExpert.wishSent, true);
    assert.equal(expertContext.data.nativeExpert.wishCount, 1);
    assert.equal(expertContext.data.nativeExpert.wishAnimating, true);
    assert.equal(expertContext.data.nativeExpert.wishBubbles.length, 5);
    const expertWishRequests = requestOptions.filter((options) => options.url.endsWith("/api/guests/expert-1/return-wish"));
    assert.equal(expertWishRequests.length, 3);
    assert.deepEqual(expertWishRequests.at(-1).data, { programId: "expert-1" });
    assert.equal(requests.some((url) => url.endsWith("/api/guests/expert-1")), true);
    assert.equal(requests.some((url) => url.endsWith("/api/guests/expert-1/agent")), true);
    assert.equal(requests.some((url) => url.endsWith("/api/guests/expert-1/agent/history")), true);

    definition.onNativeExpertQuestionInput.call(expertContext, { detail: { value: "怎么开始练习？" } });
    await definition.submitNativeExpertQuestion.call(expertContext);
    assert.equal(expertContext.data.nativeExpertQuestion, "");
    assert.equal(expertContext.data.nativeExpertMessages.length, 4);
    assert.equal(expertContext.data.nativeExpertMessages.at(-1).content, "可以先从每天一次复述练习开始。");
    assert.equal(expertContext.data.nativeExpertMessages.at(-1).recommendations[0].title, "孩子写作怎么练");
    const expertChatRequest = requestOptions.find((options) => options.url.endsWith("/api/guests/expert-1/agent/chat"));
    assert.equal(expertChatRequest.method, "POST");
    assert.deepEqual(expertChatRequest.data, { question: "怎么开始练习？" });

    const worthBuyContext = {
      ...definition,
      data: { ...definition.data },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };
    await definition.onLoad.call(worthBuyContext, {
      title: encodeURIComponent("知物详情"),
      url: encodeURIComponent("https://xianfeng.xinzhi.info/worthbuy/item-1?xf_mp=1")
    });

    assert.equal(navigations.at(-1).url, "/pages/worthbuy-detail/index?query=item-1");
    assert.equal(requests.some((url) => url.endsWith("/api/worthbuy/item-1")), false);

    const webContext = {
      ...definition,
      data: { ...definition.data },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };
    definition.onLoad.call(webContext, {
      title: encodeURIComponent("搜索"),
      url: encodeURIComponent("https://xianfeng.xinzhi.info/search?xf_mp=1")
    });
    assert.equal(webContext.data.nativeProgramMode, false);
    assert.equal(webContext.data.nativeBookMode, false);
    assert.equal(webContext.data.nativeMaterialMode, false);
    assert.equal(webContext.data.nativeWorthBuyMode, false);
    assert.equal(new URL(webContext.data.src).pathname, "/search");
  } finally {
    global.wx = originalWx;
  }
});

test("native program detail falls back to legacy guests when bindings have no valid guest", async () => {
  const definition = loadPageDefinition("webview");
  const originalWx = global.wx;
  const context = {
    ...definition,
    data: { ...definition.data },
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  try {
    global.wx = {
      getStorageSync() { return ""; },
      request(options) {
        options.success({
          statusCode: 200,
          data: {
            _id: "legacy-fallback-program",
            title: "旧嘉宾回退节目",
            guestBindings: [
              { guestId: "missing-null", guest: null },
              { guestId: "missing-guest" },
              { guestId: "blank-guest", guest: { name: "   " } }
            ],
            guests: [
              { _id: "legacy-1", name: "旧嘉宾一" },
              { _id: "legacy-1", name: "旧嘉宾一重复", avatar: "https://img.example/duplicate.png" }
            ],
            guest: {
              _id: "legacy-2",
              name: "旧嘉宾二",
              title: "旧资料职称",
              avatar: "https://img.example/legacy-2.png"
            }
          }
        });
      }
    };

    await definition.loadNativeProgram.call(context, "legacy-fallback-program");

    assert.deepEqual(context.data.nativeProgram.guests.map((guest) => guest.name), ["旧嘉宾一", "旧嘉宾二"]);
    assert.equal(context.data.nativeProgram.guests[0].avatar, "/assets/wel-avatar/no-hat.png");
    assert.equal(context.data.nativeProgram.guests[0].avatarFallback, true);
    assert.equal(context.data.nativeProgram.guests[0].title, "教育与成长观察者");
    assert.equal(context.data.nativeProgram.guests[1].avatar, "https://img.example/legacy-2.png");
    assert.equal(context.data.nativeProgram.guestName, "旧嘉宾一");
  } finally {
    global.wx = originalWx;
  }
});

test("webview detail wrapper keeps the native bottom menu below website content", () => {
  const { js, json, wxml } = readPage("webview");
  const definition = loadPageDefinition("webview");
  const context = {
    ...definition,
    data: {},
    setData(payload) {
      this.data = { ...this.data, ...payload };
    }
  };

  assert.match(js, /function inferSelectedTab\(src\)/);
  assert.match(js, /function inferPageTitle\(src, fallback\)/);
  assert.match(js, /function extractProgramId\(src\)/);
  assert.match(js, /function extractBookId\(src\)/);
  assert.match(js, /pathname\.startsWith\("\/reading"\)/);
  assert.match(js, /pathname\.startsWith\("\/materials"\)/);
  assert.match(js, /pathname\.startsWith\("\/topics"\)/);
  assert.doesNotMatch(js, /goNativeTab\(event\)/);
  assert.doesNotMatch(js, /wx\.switchTab\(\{ url \}\)/);
  assert.doesNotMatch(js, /nativeListPage/);
  assert.doesNotMatch(js, /NATIVE_LIST_PAGES/);
  assert.deepEqual(json.usingComponents || {}, {
    "custom-tab-bar": "../../custom-tab-bar/index",
    "phone-login-gate": "../../components/phone-login-gate/index"
  });
  assert.equal(wxml.includes("<native-page-nav"), false);
  assert.match(wxml, /<web-view wx:elif="\{\{src\}\}"[\s\S]*src="\{\{src\}\}" \/>[\s\S]*<custom-tab-bar selected="\{\{selected\}\}" hidden="\{\{hideTabbar\}\}" \/>/);
  assert.doesNotMatch(wxml, /bindtap="goNativeList"/);

  definition.onLoad.call(context, {
    url: encodeURIComponent("https://xianfeng.xinzhi.info/materials?xf_mp=1")
  });
  const url = new URL(context.data.src);
  assert.equal(url.pathname, "/materials");
  assert.equal(url.searchParams.get("xf_mp"), "1");
  assert.equal(url.searchParams.has("xf_tab"), true);
  assert.equal(context.data.title, "学习资料");
  assert.equal(context.data.selected, 3);
  assert.equal(context.data.showNativePageNav, false);
  assert.equal(context.data.nativeProgramMode, false);
  assert.equal(context.data.nativeBookMode, false);
  assert.equal(context.data.nativeMaterialMode, false);
  assert.equal(context.data.nativeTopicMode, false);
  assert.equal(context.data.nativeExpertMode, false);
  assert.equal(context.data.nativeWorthBuyMode, false);
  assert.equal(Object.hasOwn(context.data, "nativeListPage"), false);
});

test("mine and pro are no longer secondary webview wrappers", () => {
  for (const name of ["mine", "pro"]) {
    const { js, wxml } = readPage(name);
    const definition = loadPageDefinition(name);

    assert.equal(wxml.includes("<web-view"), false, `${name} should render native content`);
    assert.equal(js.includes("getNativeWebviewParams"), false, `${name} should not pass web-view chrome params`);
    assert.equal(typeof definition.onShareAppMessage, "function", `${name} should support sharing to friends`);
    assert.equal(typeof definition.onShareTimeline, "function", `${name} should support sharing to timeline`);
  }
});

test("only explicit web page boundaries still render web-view", () => {
  const appJson = JSON.parse(
    fs.readFileSync(new URL("../app.json", import.meta.url), "utf8")
  );
  const allowedWebviewPages = new Set([
    "pages/webview/index"
  ]);

  for (const pagePath of appJson.pages) {
    const pageName = pagePath.replace(/^pages\//, "").replace(/\/index$/, "");
    const { js, wxml } = readPage(pageName);
    const hasWebview = wxml.includes("<web-view");

    assert.equal(
      hasWebview,
      allowedWebviewPages.has(pagePath),
      `${pagePath} web-view boundary should stay explicit`
    );
    if (!allowedWebviewPages.has(pagePath)) {
      assert.equal(js.includes("createTabWebviewPage"), false, `${pagePath} should not use the old tab web-view wrapper`);
    }
  }
});

test("share landing page is registered and uses the logo asset", async () => {
  const appJson = JSON.parse(
    fs.readFileSync(new URL("../app.json", import.meta.url), "utf8")
  );
  const { js, json, wxml, wxss } = readPage("share");

  assert.equal(appJson.pages.includes("pages/share/index"), true);
  assert.equal(json.navigationStyle, "custom");
  assert.match(wxml, /assets\/share\/timeline-logo\.png/);
  assert.match(js, /function inferTargetTitle\(target, fallback\)/);
  assert.match(js, /function buildTopicTargetFromScene\(scene\)/);
  assert.match(js, /function extractConversationShareIdFromScene\(scene\)/);
  assert.match(js, /loadConversationShare\(shareId\)/);
  assert.match(js, /\/api\/wechat-mini\/xiaowanzi-shares\/\$\{encodeURIComponent\(shareId\)\}/);
  assert.match(js, /title: inferTargetTitle\(target, title\)/);
  assert.match(wxml, /wx:if="\{\{conversationShare\}\}" class="xf-share-conversation"/);
  assert.match(wxml, /wx:for="\{\{conversationShare\.messages\}\}"/);
  assert.match(wxml, /wx:for="\{\{item\.contentParts\}\}"/);
  assert.match(wxml, /class="xf-share-readonly-head"[\s\S]*class="xf-share-brand" src="\/assets\/xiaowanzi-icons\/share-logo\.png"/);
  assert.doesNotMatch(wxml, /xf-share-readonly-kicker|xf-share-readonly-title|xf-share-readonly-note|不能继续提问或查看其它对话/);
  assert.match(wxml, /class="xf-share-message-link is-readonly"/);
  assert.match(wxml, /class="xf-share-message-link-arrow">↗<\/text>/);
  assert.match(wxml, /class="xf-share-references"[\s\S]*站内引用/);
  assert.match(wxml, /class="xf-share-reference-arrow">↗<\/text>/);
  assert.match(wxml, /class="xf-share-open-xiaowanzi" bindtap="openTarget">打开小玩子<\/button>/);
  assert.doesNotMatch(wxml, /openConversationLink/);
  assert.match(wxml, /bindtap="openTarget"/);
  assert.match(wxml, /bindtap="goPrograms"/);
  assert.match(js, /function buildMessageContentParts\(content\)/);
  assert.match(js, /function extractShareReferences\(content\)/);
  assert.doesNotMatch(js, /openConversationLink/);
  assert.match(js, /decodeOption\(options\.target, DEFAULT_TARGET\)/);
  assert.match(js, /if \(options\.target \|\| sceneTarget\) openTargetPath\(target\)/);
  assert.match(js, /wx\.reLaunch/);
  assert.match(js, /wx\.switchTab/);
  assert.match(wxss, /#5e17eb/);
  assert.match(wxss, /\.xf-share-user-bubble \{[\s\S]*border-radius: 34rpx 8rpx 34rpx 34rpx;[\s\S]*text-align: left;/);
  assert.match(wxss, /\.xf-share-assistant-card \{[\s\S]*border: 1rpx solid rgba\(122, 103, 238, 0\.1\);[\s\S]*line-height: 1\.82;/);
  assert.match(wxss, /\.xf-share-message-link \{[\s\S]*border: 1rpx solid rgba\(115, 83, 224, 0\.24\);/);
  assert.match(wxss, /\.xf-share-message-link-arrow \{[\s\S]*color: #6d28f2;/);
  assert.match(wxss, /\.xf-share-reference-arrow \{[\s\S]*color: #6d28f2;/);
  assert.match(wxss, /\.xf-share-open-xiaowanzi \{[\s\S]*background: linear-gradient\(108deg, #5368ff 0%, #6847ff 56%, #601bec 100%\);/);

  const definition = loadPageDefinition("share");
  const relaunchCalls = [];
  const originalRelaunch = global.wx.reLaunch;
  const originalRequest = global.wx.request;
  try {
    global.wx.reLaunch = (options) => relaunchCalls.push(options);
    global.wx.request = (options) => {
      assert.match(options.url, /\/api\/wechat-mini\/xiaowanzi-shares\/share-abc123/);
      options.success({
        statusCode: 200,
        data: {
          id: "share-abc123",
          title: "小玩子：小学数学进阶规划？",
          messages: [
            { role: "user", content: "小学数学进阶规划？" },
            { role: "assistant", content: "先培养数感，再慢慢进入抽象思维。👉 [夏老师教育观点解析](/topics/teacher-xia)" }
          ]
        }
      });
    };
    const context = {
      ...definition,
      data: { ...definition.data },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };
    const target = "/pages/webview/index?url=https%3A%2F%2Fxianfeng.xinzhi.info%2Fexperts%3Fxf_mp%3D1";
    definition.onLoad.call(context, {
      target: encodeURIComponent(target)
    });

    assert.equal(context.data.title, "先疯智库");
    assert.deepEqual(relaunchCalls, [{ url: target }]);

    const sceneContext = {
      ...definition,
      data: { ...definition.data },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };
    definition.onLoad.call(sceneContext, {
      scene: encodeURIComponent("t=507f1f77bcf86cd799439011")
    });
    const sceneNavigation = relaunchCalls.at(-1);
    assert.ok(sceneNavigation);
    const sceneTarget = new URL(sceneNavigation.url, "https://mini.local");
    assert.equal(sceneTarget.pathname, "/pages/webview/index");
    assert.equal(sceneTarget.searchParams.get("url"), "/topics/507f1f77bcf86cd799439011");
    assert.equal(sceneTarget.searchParams.get("topicId"), "507f1f77bcf86cd799439011");

    const shareSceneContext = {
      ...definition,
      data: { ...definition.data },
      setData(payload) {
        this.data = { ...this.data, ...payload };
      }
    };
    definition.onLoad.call(shareSceneContext, {
      scene: encodeURIComponent("s=share-abc123")
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(shareSceneContext.data.title, "小玩子：小学数学进阶规划？");
    assert.equal(shareSceneContext.data.conversationShare.id, "share-abc123");
    assert.equal(shareSceneContext.data.conversationShare.messages[0].role, "user");
    assert.equal(shareSceneContext.data.conversationShare.messages[1].role, "assistant");
    assert.equal(shareSceneContext.data.conversationShare.messages[1].contentParts.some((part) => part.type === "link"), true);
    assert.deepEqual(shareSceneContext.data.conversationShare.messages[1].references, [{
      title: "夏老师教育观点解析",
      url: "/topics/teacher-xia",
      key: "ref-0"
    }]);
    assert.equal(relaunchCalls.filter((item) => String(item.url).includes("share-abc123")).length, 0);
  } finally {
    global.wx.reLaunch = originalRelaunch;
    global.wx.request = originalRequest;
  }
});
