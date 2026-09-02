import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pageSource = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");
const wxml = fs.readFileSync(new URL("./index.wxml", import.meta.url), "utf8");
const wxss = fs.readFileSync(new URL("./index.wxss", import.meta.url), "utf8");
const sharePageSource = fs.readFileSync(new URL("../share/index.js", import.meta.url), "utf8");

test("program detail share button opens a generated poster preview", () => {
  assert.match(pageSource, /require\("\.\/programSharePoster"\)/);
  assert.match(pageSource, /generateNativeProgramSharePoster\(\)/);
  assert.match(pageSource, /saveNativeProgramSharePoster\(\)/);
  assert.match(wxml, /class="xf-program-detail-hero-icon is-share" catchtap="generateNativeProgramSharePoster"/);
  assert.doesNotMatch(wxml, /open-type="share" class="xf-program-detail-hero-icon is-share"/);
  assert.match(wxml, /class="xf-program-share-preview-image" src="\{\{nativeProgramShareImagePath\}\}"/);
  assert.match(wxml, /xf-program-share-preview-panel[\s\S]*xf-program-share-preview-close[\s\S]*xf-program-share-preview-head/);
  assert.match(wxml, /catchtap="saveNativeProgramSharePoster"/);
  assert.match(wxml, /canvas-id="xf-program-share-canvas"[\s\S]*height="1520"/);
  assert.match(wxss, /\.xf-program-share-preview-panel/);
  assert.match(wxss, /\.xf-program-share-preview-close\s*\{[\s\S]*position:\s*absolute;[\s\S]*left:\s*24rpx;/);
  assert.match(wxss, /\.xf-program-share-preview-scroll\s*\{[\s\S]*box-sizing:\s*border-box;/);
  const playerZIndex = Number(wxss.match(/\.xf-program-detail-player-fab\s*\{[\s\S]*?z-index:\s*(\d+);/)[1]);
  const maskZIndex = Number(wxss.match(/\.xf-program-share-preview-mask\s*\{[\s\S]*?z-index:\s*(\d+);/)[1]);
  const panelZIndex = Number(wxss.match(/\.xf-program-share-preview-panel\s*\{[\s\S]*?z-index:\s*(\d+);/)[1]);
  assert.ok(maskZIndex > playerZIndex);
  assert.ok(panelZIndex > playerZIndex);
});

test("program poster requests a mini-program code for the current environment", () => {
  const previousWx = global.wx;
  global.wx = {
    env: { USER_DATA_PATH: "/tmp" },
    getAccountInfoSync() {
      return { miniProgram: { envVersion: "trial" } };
    }
  };
  const modulePath = require.resolve("./programSharePoster.js");
  delete require.cache[modulePath];
  const poster = require("./programSharePoster.js");
  const url = poster.buildProgramShareQrUrl("6982bf7670aae7e967849f92");
  assert.match(url, /\/api\/wechat-mini\/program-qrcode\?/);
  assert.match(url, /programId=6982bf7670aae7e967849f92/);
  assert.match(url, /envVersion=trial/);
  assert.equal(poster.programShareQrFilePath("abc/123"), "/tmp/xf-program-share-qr-abc_123.jpg");
  delete require.cache[modulePath];
  global.wx = previousWx;
});

test("program poster uses a real guest avatar and falls back when it cannot load", async () => {
  const poster = require("./programSharePoster.js");
  const previousWx = global.wx;
  try {
    global.wx = {
      getImageInfo({ src, success, fail }) {
        if (src.includes("real.png")) {
          success({ path: "/tmp/real-guest.png", width: 715, height: 688 });
          return;
        }
        fail();
      }
    };
    assert.deepEqual(
      await poster.resolveProgramShareGuestAvatars([
        { avatar: "https://xianfeng.xinzhi.info/uploads/images/real.png" },
        { avatar: "https://xianfeng.xinzhi.info/uploads/images/unavailable.png" }
      ]),
      [
        { path: "/tmp/real-guest.png", width: 715, height: 688 },
        { path: "/assets/wel-avatar/no-hat.png", width: 0, height: 0 }
      ]
    );
  } finally {
    global.wx = previousWx;
  }
});

test("program poster draws current content and the direct mini-program code", () => {
  const poster = require("./programSharePoster.js");
  const texts = [];
  const images = [];
  const ctx = {
    setFillStyle() {},
    fillRect() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    setFontSize() {},
    setTextAlign() {},
    setGlobalAlpha() {},
    setStrokeStyle() {},
    setLineWidth() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    arc() {},
    clip() {},
    measureText(value) { return { width: String(value).length * 30 }; },
    fillText(value) { texts.push(String(value)); },
    drawImage(...args) { images.push(args); }
  };

  assert.equal(poster.PROGRAM_SHARE_POSTER_HEIGHT, 1520);
  poster.drawProgramSharePoster(ctx, {
    title: "保研从业者的经验帖",
    showLabel: "家长先疯",
    description: "从跨校保研申请制到全国志愿系统",
    summaryHeadline: "保研不是玄学",
    summaryBody: "一本讲透推免的全流程与底层逻辑",
    summaryHighlightLabel: "保研科普",
    summaryHighlightText: "只要在名额当中，便是非常稳妥的选项，确定性很高。",
    guestName: "不应出现在分享图里的嘉宾",
    guests: [
      { name: "嘉宾甲", title: "升学规划顾问", bio: "分享跨校保研申请经验。", avatar: "https://example.com/guest-a.jpg" },
      { name: "嘉宾乙", title: "高校教师", bio: "解读大学四年的成长节奏。", avatar: "https://example.com/guest-b.jpg" },
      { name: "嘉宾丙", title: "学生家长", bio: "提供家庭支持的真实视角。", avatar: "https://example.com/guest-c.jpg" }
    ],
    tags: ["保研", "推免", "升学规划", "强基计划"]
  }, "/tmp/program-qr.png", { path: "/tmp/program-cover.jpg", width: 1000, height: 1000 }, [
    { path: "/tmp/guest-a.jpg", width: 300, height: 300 },
    { path: "/tmp/guest-b.jpg", width: 300, height: 300 },
    { path: "/tmp/guest-c.jpg", width: 300, height: 300 }
  ]);

  assert.ok(texts.some((text) => text.includes("保研从业者")));
  assert.ok(texts.some((text) => text.includes("保研不是玄学")));
  assert.ok(!texts.some((text) => text.includes("总结摘要")));
  assert.ok(!texts.some((text) => text.includes("A I  O v e r v i e w")));
  assert.ok(!texts.some((text) => text.includes("保研科普")));
  assert.ok(!texts.join("").includes("稳妥的选项"));
  assert.ok(!texts.join("").includes("确定性很高"));
  assert.ok(texts.some((text) => text.includes("微信扫码")));
  assert.ok(!texts.some((text) => text.includes("本期嘉宾")));
  assert.ok(!texts.some((text) => text.includes("G U E S T S")));
  assert.ok(texts.some((text) => text.includes("嘉宾甲")));
  assert.ok(texts.some((text) => text.includes("升学规划顾问")));
  assert.ok(texts.join("").includes("跨校保研申请经验"));
  assert.ok(texts.some((text) => text.includes("嘉宾乙")));
  assert.ok(texts.join("").includes("大学四年的成长节奏"));
  assert.ok(texts.some((text) => text.includes("嘉宾丙")));
  assert.ok(texts.join("").includes("家庭支持的真实视角"));
  assert.ok(!texts.some((text) => text.includes("立即收听")));
  assert.ok(!texts.some((text) => text.includes("从跨校保研申请制到全国志愿系统")));
  assert.ok(texts.some((text) => text.includes("强基计划")));
  assert.ok(!texts.some((text) => text.includes("不应出现在分享图里的嘉宾")));
  assert.ok(images.some((args) => args[0] === "/tmp/program-cover.jpg"));
  assert.ok(images.some((args) => args[0] === "/tmp/program-cover.jpg" && args.length === 9));
  assert.ok(images.some((args) => args[0] === "/tmp/guest-a.jpg"));
  assert.ok(images.some((args) => args[0] === "/tmp/guest-b.jpg"));
  assert.ok(images.some((args) => args[0] === "/tmp/guest-c.jpg"));
  assert.ok(!images.some((args) => String(args[0]).includes("program-book-white")));
  assert.ok(!images.some((args) => String(args[0]).includes("program-share-white")));
  assert.ok(!images.some((args) => String(args[0]).includes("program-play-purple")));
  assert.ok(images.some((args) => args[0] === "/tmp/program-qr.png"));
});

test("program poster places the QR panel directly after a single guest", () => {
  const poster = require("./programSharePoster.js");
  const images = [];
  const texts = [];
  let textAlign = "left";
  const ctx = {
    setFillStyle() {},
    fillRect() {},
    createLinearGradient() { return { addColorStop() {} }; },
    setFontSize() {},
    setTextAlign(value) { textAlign = value; },
    setGlobalAlpha() {},
    setStrokeStyle() {},
    setLineWidth() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    arc() {},
    clip() {},
    measureText(value) { return { width: String(value).length * 30 }; },
    fillText(value, x, y) { texts.push({ value: String(value), x, y, textAlign }); },
    drawImage(...args) { images.push(args); }
  };

  poster.drawProgramSharePoster(ctx, {
    title: "单嘉宾节目",
    summaryHeadline: "节目摘要",
    summaryBody: "节目内容",
    guests: [{ name: "嘉宾甲", title: "教师", bio: "嘉宾介绍" }]
  }, "/tmp/single-guest-program-qr.png", null, [
    { path: "/tmp/single-guest.jpg", width: 300, height: 300 }
  ]);

  const guestImage = images.find((args) => args[0] === "/tmp/single-guest.jpg");
  const guestName = texts.find((item) => item.value === "嘉宾甲");
  const guestTitle = texts.find((item) => item.value === "教师");
  const guestBio = texts.find((item) => item.value === "嘉宾介绍");
  const qrImage = images.find((args) => args[0] === "/tmp/single-guest-program-qr.png");
  assert.deepEqual(guestImage.slice(5), [293, 838, 164, 164]);
  assert.deepEqual(guestName, { value: "嘉宾甲", x: 375, y: 1052, textAlign: "center" });
  assert.deepEqual(guestTitle, { value: "教师", x: 375, y: 1086, textAlign: "center" });
  assert.deepEqual(guestBio, { value: "嘉宾介绍", x: 375, y: 1127, textAlign: "center" });
  assert.deepEqual(qrImage, ["/tmp/single-guest-program-qr.png", 52, 1222, 144, 144]);
});

test("program poster restores left alignment after Android canvas image state", () => {
  const poster = require("./programSharePoster.js");
  const texts = [];
  let textAlign = "left";
  const ctx = {
    setFillStyle() {},
    fillRect() {},
    createLinearGradient() { return { addColorStop() {} }; },
    setFontSize() {},
    setTextAlign(value) {
      if (value === "center") textAlign = value;
    },
    set textAlign(value) { textAlign = value; },
    setGlobalAlpha() {},
    setStrokeStyle() {},
    setLineWidth() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    arc() {},
    clip() {},
    measureText(value) { return { width: String(value).length * 30 }; },
    fillText(value, x, y) { texts.push({ value: String(value), x, y, textAlign }); },
    drawImage() {}
  };

  poster.drawProgramSharePoster(ctx, {
    title: "优绩主义不该被批评，应该被兑现",
    summaryHeadline: "批评而应被兑现",
    summaryBody: "从自我效能到无条件爱",
    guests: [{ name: "邓建国", title: "教授", bio: "传播学学者" }]
  }, "/tmp/program-qr.png", { path: "/tmp/program-cover.jpg", width: 1000, height: 1000 }, [
    { path: "/tmp/guest.jpg", width: 300, height: 300 }
  ]);

  assert.equal(texts.find((item) => item.value.includes("优绩主义")).textAlign, "left");
  assert.equal(texts.find((item) => item.value === "批评而应被兑现").textAlign, "left");
  assert.equal(texts.find((item) => item.value === "从自我效能到无条件爱").textAlign, "left");
});

test("program poster keeps Chinese punctuation off the start of wrapped lines", () => {
  const poster = require("./programSharePoster.js");
  const lines = poster.wrapPosterText({ measureText(value) { return { width: String(value).length * 10 }; } }, "一二三四，五六", 40, 10, 3);
  assert.deepEqual(lines, ["一二三四，", "五六"]);
});

test("program code lands directly on the native detail while legacy scenes remain compatible", () => {
  assert.match(pageSource, /function extractProgramIdFromScene\(scene\)/);
  assert.match(pageSource, /const sceneProgramId = extractProgramIdFromScene\(options\.scene\)/);
  assert.match(pageSource, /const rawSrc = sceneBookTarget \|\| \(sceneProgramId[\s\S]*?\? `\/programs\/\$\{encodeURIComponent\(sceneProgramId\)\}`/);
  assert.match(sharePageSource, /function buildProgramTargetFromScene\(scene\)/);
  assert.match(sharePageSource, /parseSceneParam\(scene, "p"\)/);
  assert.match(sharePageSource, /`\/programs\/\$\{encodeURIComponent\(programId\)\}`/);
  assert.match(sharePageSource, /const sceneTarget = buildProgramTargetFromScene\(scene\) \|\| buildTopicTargetFromScene\(scene\)/);
});
