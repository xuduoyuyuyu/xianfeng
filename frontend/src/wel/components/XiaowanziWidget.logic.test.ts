import test from "node:test";
import assert from "node:assert/strict";
import {
  buildXiaowanziInlineLinks,
  buildXiaowanziMentionLinks,
  buildChildProfileSummary,
  buildXiaowanziPromptPayload,
  canEnterXiaowanziSuperMode,
  normalizeAssistantLayoutText,
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

test("normalizeAssistantLayoutText splits dense inline numbered advice into markdown paragraphs", () => {
  const denseReply =
    "哎呀这个我熟！睡前吵架真的很费心神对不对🥺 但凭我偷师学来的育儿小秘笈，给你几个万能小技巧哦～ 1. 先给情绪“降个温” 睡前孩子容易累、容易烦躁。2. 把“指责”换成“感受” 比如不要说你怎么又拖拉不刷牙，换成：宝贝，妈妈刚才有点着急了。3. 建立专属“睡前安抚小仪式” 比如固定流程：泡脚→关大灯→讲一个超短的故事。4. 万一吵起来了，试试“破冰三连” 先蹲下来平视她。";

  assert.equal(
    normalizeAssistantLayoutText(denseReply),
    [
      "哎呀这个我熟！睡前吵架真的很费心神对不对🥺 但凭我偷师学来的育儿小秘笈，给你几个万能小技巧哦～",
      "1. 先给情绪“降个温” 睡前孩子容易累、容易烦躁。",
      "2. 把“指责”换成“感受” 比如不要说你怎么又拖拉不刷牙，换成：宝贝，妈妈刚才有点着急了。",
      "3. 建立专属“睡前安抚小仪式” 比如固定流程：泡脚→关大灯→讲一个超短的故事。",
      "4. 万一吵起来了，试试“破冰三连” 先蹲下来平视她。",
    ].join("\n\n")
  );
});

test("normalizeAssistantLayoutText splits bold markdown numbered advice from saved history", () => {
  const denseReply =
    "给你几个万能小技巧哦～ **1. 先给情绪“降个温”** 睡前孩子容易累、容易烦躁。 **2. 把“指责”换成“感受”** 比如不要说你怎么又拖拉不刷牙。 **3. 建立专属“睡前安抚小仪式”** 比如固定流程。";

  assert.equal(
    normalizeAssistantLayoutText(denseReply),
    [
      "给你几个万能小技巧哦～",
      "**1. 先给情绪“降个温”** 睡前孩子容易累、容易烦躁。",
      "**2. 把“指责”换成“感受”** 比如不要说你怎么又拖拉不刷牙。",
      "**3. 建立专属“睡前安抚小仪式”** 比如固定流程。",
    ].join("\n\n")
  );
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

test("buildXiaowanziMentionLinks creates layer-return links for programs topics and materials", () => {
  const links = buildXiaowanziMentionLinks({
    programs: [
      { _id: "program-1", title: "深度倾听：如何与正处于叛逆期的幼儿建立情感锚点" },
      { _id: "program-2", title: "  " },
    ],
    topics: [
      { slug: "youxihua-tiaozhan", title: "游戏化挑战" },
    ],
    materials: [
      { _id: "material-1", title: "09 理论第七课 英语不好的爸妈如何给孩子启蒙.m4a" },
      { _id: "material-2", title: "全网最好的800单词卡片完美打印版" },
    ],
  });

  assert.deepEqual(links, [
    {
      title: "深度倾听：如何与正处于叛逆期的幼儿建立情感锚点",
      href: "/programs/program-1?xw_layer=1&xw_return=xiaowanzi",
      type: "program",
    },
    {
      title: "游戏化挑战",
      href: "/topics/youxihua-tiaozhan?xw_layer=1&xw_return=xiaowanzi",
      type: "topic",
    },
    {
      title: "09 理论第七课 英语不好的爸妈如何给孩子启蒙.m4a",
      href: "/materials?xw_layer=1&xw_return=xiaowanzi",
      type: "material",
    },
    {
      title: "全网最好的800单词卡片完美打印版",
      href: "/materials?xw_layer=1&xw_return=xiaowanzi",
      type: "material",
    },
  ]);
});

test("buildXiaowanziInlineLinks only links quoted terms when they match known site content", () => {
  const links = buildXiaowanziInlineLinks(
    "可以在咱们平台的搜索框里搜「拖延」「时间管理」「习惯养成」，之前有一期「用游戏化解磨蹭」特别赞。",
    [
      {
        title: "用游戏化解磨蹭",
        href: "/topics/youxihua-jie-moceng?xw_layer=1&xw_return=xiaowanzi",
        type: "topic",
      },
    ],
  );

  assert.deepEqual(links, [
    {
      title: "用游戏化解磨蹭",
      href: "/topics/youxihua-jie-moceng?xw_layer=1&xw_return=xiaowanzi",
      type: "topic",
    },
  ]);
});

test("buildXiaowanziInlineLinks does not turn unmatched quoted words into search links", () => {
  const links = buildXiaowanziInlineLinks(
    "推荐资料「全网最好的800单词卡片完美打印版」，再搜「时间管理」。",
    [
      {
        title: "全网最好的800单词卡片完美打印版",
        href: "/materials?xw_layer=1&xw_return=xiaowanzi",
        type: "material",
      },
    ],
  );

  assert.deepEqual(links, [
    {
      title: "全网最好的800单词卡片完美打印版",
      href: "/materials?xw_layer=1&xw_return=xiaowanzi",
      type: "material",
    },
  ]);
});
