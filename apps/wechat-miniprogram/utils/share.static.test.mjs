import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const shareModulePath = new URL("./share.js", import.meta.url);
const shareModuleFile = require.resolve("./share.js");
const shareSource = fs.readFileSync(shareModulePath, "utf8");

assert.equal(fs.existsSync(shareModulePath), true, "utils/share.js should define mini program share helpers");

const {
  createPageShare,
  createWebviewShare,
  DEFAULT_SHARE_IMAGE_URL,
  SHARE_PAGE_PATH,
  enableShareMenu,
  stripSensitiveWebParams
} = require("./share.js");

function loadShareWithoutUrlGlobals() {
  const originalURL = global.URL;
  const originalURLSearchParams = global.URLSearchParams;
  try {
    delete require.cache[shareModuleFile];
    global.URL = undefined;
    global.URLSearchParams = undefined;
    return require("./share.js");
  } finally {
    delete require.cache[shareModuleFile];
    global.URL = originalURL;
    global.URLSearchParams = originalURLSearchParams;
  }
}

test("default timeline share image exists in the mini program package", () => {
  assert.equal(DEFAULT_SHARE_IMAGE_URL, "/assets/share/timeline-logo.png");
  assert.equal(
    fs.existsSync(new URL(`..${DEFAULT_SHARE_IMAGE_URL}`, import.meta.url)),
    true,
    "timeline share image should be packaged with the mini program"
  );
});

test("createPageShare returns friend and timeline payloads for a native page", () => {
  const share = createPageShare({
    title: "家长先疯节目",
    path: "/pages/programs/index"
  });

  assert.deepEqual(share.onShareAppMessage(), {
    title: "家长先疯节目",
    path: "/pages/programs/index"
  });
  assert.equal(SHARE_PAGE_PATH, "/pages/share/index");
  assert.deepEqual(share.onShareTimeline(), {
    title: "家长先疯节目"
  });
});

test("createPageShare keeps explicit cover images when a page has one", () => {
  const share = createPageShare({
    title: "家长先疯节目",
    path: "/pages/programs/index",
    imageUrl: DEFAULT_SHARE_IMAGE_URL
  });

  assert.deepEqual(share.onShareAppMessage(), {
    title: "家长先疯节目",
    path: "/pages/programs/index",
    imageUrl: DEFAULT_SHARE_IMAGE_URL
  });
});

test("share helpers do not depend on browser URL globals in mini program runtime", () => {
  assert.equal(shareSource.includes("new URL("), false);
  assert.equal(shareSource.includes("URLSearchParams"), false);

  const runtimeShare = loadShareWithoutUrlGlobals();
  const share = runtimeShare.createPageShare({
    title: "家长先疯节目",
    path: "/pages/programs/index"
  });

  assert.deepEqual(share.onShareAppMessage(), {
    title: "家长先疯节目",
    path: "/pages/programs/index"
  });
});

test("createWebviewShare keeps the current web route but never shares login token", () => {
  const share = createWebviewShare({
    title: "节目详情",
    src: "https://xianfeng.xinzhi.info/programs/abc?xf_mp=1&xf_token=secret&from=card"
  });
  const appMessage = share.onShareAppMessage();

  assert.equal(appMessage.title, "节目详情");
  assert.equal("imageUrl" in appMessage, false);
  assert.match(appMessage.path, /^\/pages\/webview\/index\?url=/);
  assert.equal(appMessage.path.includes("xf_token"), false);
  assert.equal(appMessage.path.includes("secret"), false);

  const encodedUrl = new URLSearchParams(appMessage.path.split("?")[1]).get("url");
  const url = new URL(encodedUrl);
  assert.equal(url.pathname, "/programs/abc");
  assert.equal(url.searchParams.get("xf_mp"), "1");
  assert.equal(url.searchParams.get("from"), "card");

  assert.equal("imageUrl" in share.onShareTimeline(), false);
});

test("enableShareMenu enables WeChat friend and timeline menu items", () => {
  let menuOptions = null;
  global.wx = {
    showShareMenu(options) {
      menuOptions = options;
    }
  };

  enableShareMenu();

  assert.deepEqual(menuOptions, {
    withShareTicket: true,
    menus: ["shareAppMessage", "shareTimeline"]
  });
});

test("stripSensitiveWebParams removes token from relative and absolute URLs", () => {
  assert.equal(
    stripSensitiveWebParams("/books/123?xf_mp=1&xf_token=secret"),
    "https://xianfeng.xinzhi.info/books/123?xf_mp=1"
  );
  assert.equal(
    stripSensitiveWebParams("https://xianfeng.xinzhi.info/topics/a?xf_token=secret&xf_xw=chat"),
    "https://xianfeng.xinzhi.info/topics/a?xf_xw=chat"
  );
});
