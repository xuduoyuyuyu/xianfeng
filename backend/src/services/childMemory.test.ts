import test from "node:test";
import assert from "node:assert/strict";
import { buildChildMemorySummary, splitChildMemoryItems } from "./childMemory";

test("buildChildMemorySummary keeps latest child profile and conversation facts", () => {
  const summary = buildChildMemorySummary({
    previous: "旧偏好: 喜欢数学",
    childProfile: "咨询人:小圆子。年级:三年级。关注标签:阅读理解",
    userMessage: "孩子最近怕写作文,需要先降低压力",
    assistantReply: "建议先用口述故事再整理成提纲",
    now: new Date("2026-06-04T08:15:00+08:00"),
  });

  assert.match(summary, /旧偏好: 喜欢数学/);
  assert.match(summary, /咨询人:小圆子/);
  assert.match(summary, /2026-06-04 08:15/);
  assert.match(summary, /孩子最近怕写作文/);
  assert.doesNotMatch(summary, /口述故事/);
});

test("buildChildMemorySummary ignores browsing and page-context noise", () => {
  const summary = buildChildMemorySummary({
    previous: "已有事实: 孩子喜欢数学",
    childProfile: "咨询人:小圆子。年级:三年级",
    userMessage: "浏览了页面:节目列表",
    assistantReply: "小玩子已记录当前浏览上下文:当前正在小玩子超能模式内浏览「节目」页面。路径:/programs/list。",
    now: new Date("2026-06-04T09:00:00+08:00"),
  });

  assert.match(summary, /已有事实: 孩子喜欢数学/);
  assert.doesNotMatch(summary, /浏览了页面/);
  assert.doesNotMatch(summary, /节目列表/);
  assert.doesNotMatch(summary, /当前浏览上下文/);
});

test("buildChildMemorySummary keeps child traits and problems with record time", () => {
  const summary = buildChildMemorySummary({
    previous: "",
    childProfile: "咨询人:小圆子。年级:三年级。关注标签:阅读理解",
    userMessage: "孩子性格比较敏感,最近遇到的问题是怕写作文,一写就哭",
    assistantReply: "先陪孩子口述",
    now: new Date("2026-06-04T10:20:00+08:00"),
  });

  assert.match(summary, /2026-06-04 10:20/);
  assert.match(summary, /性格比较敏感/);
  assert.match(summary, /怕写作文/);
  assert.doesNotMatch(summary, /先陪孩子口述/);
});

test("splitChildMemoryItems returns removable items from a merged summary", () => {
  assert.deepEqual(splitChildMemoryItems("偏好 A\n偏好 B；偏好 C"), [
    { id: "0", text: "偏好 A" },
    { id: "1", text: "偏好 B" },
    { id: "2", text: "偏好 C" },
  ]);
});
