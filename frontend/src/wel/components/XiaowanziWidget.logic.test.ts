import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChildProfileSummary,
  buildXiaowanziPromptPayload,
  canEnterXiaowanziSuperMode,
  shouldPersistChildMemory,
} from "./XiaowanziWidget.logic";

test("buildXiaowanziPromptPayload injects enabled child memory into tutorbot content", () => {
  const content = buildXiaowanziPromptPayload({
    profileSummary: "咨询人:小圆子。年级:三年级",
    memorySummary: "孩子最近怕写作文,需要先降低压力",
    pageSummary: "当前页面是作文训练",
    userContent: "怎么开始",
  });

  assert.match(content, /\[孩子档案\]\n咨询人:小圆子/);
  assert.match(content, /\[孩子记忆\]\n孩子最近怕写作文/);
  assert.match(content, /\[当前页面上下文\]\n当前页面是作文训练/);
  assert.match(content, /\[用户问题\]\n怎么开始/);
  assert.match(content, /当前页面只是线索，不是唯一资料来源/);
  assert.match(content, /通用建议而非站内资料结论/);
  assert.doesNotMatch(content, /只基于当前页面已经明确展示/);
  assert.doesNotMatch(content, /当前页面未显示这部分信息/);
});

test("buildChildProfileSummary sends exact current age from birth date", () => {
  const summary = buildChildProfileSummary(
    {
      displayName: "小圆子",
      relation: "女儿",
      birthDate: "2022-03-01",
      grade: "学前",
      concernTags: ["语言表达"],
    },
    { now: new Date(2026, 5, 6, 12) },
  );

  assert.match(summary, /出生日期:2022-03-01/);
  assert.match(summary, /当前日期:2026-06-06/);
  assert.match(summary, /准确年龄:4岁3个月/);
  assert.match(summary, /请以该准确年龄为准/);
  assert.doesNotMatch(summary, /2岁/);
});

test("buildXiaowanziPromptPayload omits memory block when memory is disabled or empty", () => {
  const content = buildXiaowanziPromptPayload({
    profileSummary: "咨询人:小圆子。年级:三年级",
    memorySummary: "",
    pageSummary: "",
    userContent: "怎么开始",
  });

  assert.doesNotMatch(content, /\[孩子记忆\]/);
  assert.equal(shouldPersistChildMemory({ childId: "child-1", enabled: false }), false);
  assert.equal(shouldPersistChildMemory({ childId: "child-1", enabled: true }), true);
});

test("canEnterXiaowanziSuperMode requires an app or wel auth token", () => {
  assert.equal(canEnterXiaowanziSuperMode({}), false);
  assert.equal(canEnterXiaowanziSuperMode({ token: "   ", welToken: "" }), false);
  assert.equal(canEnterXiaowanziSuperMode({ token: "app-token" }), true);
  assert.equal(canEnterXiaowanziSuperMode({ welToken: "wel-token" }), true);
});
