import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChildMemorySummary,
  enqueueChildMemory,
  batchExtractChildMemory,
  splitChildMemoryItems,
  processChildMemoryBatch,
} from "./childMemory";

const originalApiKey = process.env.AI_API_KEY;
const originalBaseUrl = process.env.AI_API_BASE_URL;
const originalModel = process.env.AI_MODEL;

test.after(() => {
  process.env.AI_API_KEY = originalApiKey;
  process.env.AI_API_BASE_URL = originalBaseUrl;
  process.env.AI_MODEL = originalModel;
});

// ── enqueue 测试 ──

test("enqueueChildMemory filters page noise", () => {
  const item = enqueueChildMemory({
    userMessage: "浏览了页面:节目列表",
    assistantReply: "小玩子已记录当前浏览上下文...",
  });
  assert.equal(item, null);
});

test("enqueueChildMemory filters non-durable messages", () => {
  const item = enqueueChildMemory({
    userMessage: "我快被气死了",
    assistantReply: "理解你的感受...",
  });
  assert.equal(item, null);
});

test("enqueueChildMemory keeps messages with durable signal", () => {
  const item = enqueueChildMemory({
    userMessage: "孩子最近怕写作文，一写就哭",
    assistantReply: "先陪孩子口述故事再整理成提纲",
  });
  assert.ok(item);
  assert.match(item.userMessage, /怕写作文/);
  assert.match(item.assistantSummary, /口述故事/);
});

// ── batchExtractChildMemory 测试（无 API Key 走降级） ──

test("batchExtractChildMemory keyword fallback extracts facts", async () => {
  delete process.env.AI_API_KEY;

  const items = [
    { userMessage: "孩子写作业拖延，经常到11点", assistantSummary: "试试番茄钟", ts: new Date().toISOString() },
    { userMessage: "孩子性格比较敏感，被老师批评就哭", assistantSummary: "先共情", ts: new Date().toISOString() },
    { userMessage: "怎么培养阅读习惯？", assistantSummary: "每天15分钟", ts: new Date().toISOString() },
  ];

  const result = await batchExtractChildMemory(items);
  // 降级模式：有 durable signal 的会被提取
  assert.ok(result.facts.length >= 1);
});

// ── processChildMemoryBatch 测试 ──

test("processChildMemoryBatch merges facts into summary", async () => {
  delete process.env.AI_API_KEY;

  const items = [
    { userMessage: "孩子写作业拖延，经常到11点", assistantSummary: "试试番茄钟", ts: new Date().toISOString() },
  ];

  const result = await processChildMemoryBatch({
    queueItems: items,
    previousSummary: "旧记录: 喜欢数学",
    childProfile: "咨询人:小圆子。年级:三年级",
  });

  assert.match(result.summary, /旧记录: 喜欢数学/);
  assert.ok(result.factsAdded.length >= 1);
});

test("processChildMemoryBatch avoids duplicate profiles", async () => {
  delete process.env.AI_API_KEY;

  // 第一次
  const first = await processChildMemoryBatch({
    queueItems: [
      { userMessage: "孩子写作业拖延", assistantSummary: "", ts: new Date().toISOString() },
    ],
    previousSummary: "",
    childProfile: "咨询人:小圆子。年级:三年级",
  });

  // 第二次：档案不变
  const second = await processChildMemoryBatch({
    queueItems: [
      { userMessage: "孩子怕写作文", assistantSummary: "", ts: new Date().toISOString() },
    ],
    previousSummary: first.summary,
    childProfile: "咨询人:小圆子。年级:三年级",
  });

  const profileCount = (second.summary.match(/孩子档案/g) || []).length;
  assert.equal(profileCount, 1, "档案不应该重复追加");
});

test("splitChildMemoryItems dedupes repeated child profiles and drops browsing noise", async () => {
  const items = splitChildMemoryItems([
    "2026-06-06 13:24 孩子档案: 咨询人:小圆子。关系:女儿。出生日期:2022-01-02。当前日期:2026-06-06。准确年龄:4岁5个月（按出生日期和当前日期计算,请以该准确年龄为准）。年级:小班。关注标签:社交",
    "2026-06-06 18:16 孩子档案: 咨询人:小圆子。关系:女儿。出生日期:2022-01-02。当前日期:2026-06-06。准确年龄:4岁5个月（按出生日期和当前日期计算,请以该准确年龄为准）。年级:小班。关注标签:社交",
    "2026-06-08 18:55 孩子档案: 咨询人:小圆子。关系:女儿。出生日期:2022-01-02。当前日期:2026-06-08。准确年龄:4岁5个月（按出生日期和当前日期计算,请以该准确年龄为准）。年级:小班。关注标签:社交",
    "2026-06-09 孩子情况: 当前页面路径:/programs/list。已读取当前节目列表,你可以继续问我先看哪几期",
    "2026-06-09 孩子情况: 孩子最近社交退缩,进教室前会哭",
  ].join("\n"));

  assert.equal(items.length, 2);
  assert.equal((items.map((item) => item.text).join("\n").match(/孩子档案/g) || []).length, 1);
  assert.match(items[0].text, /2026-06-08 18:55 孩子档案/);
  assert.match(items[1].text, /社交退缩/);
  assert.doesNotMatch(items.map((item) => item.text).join("\n"), /当前页面路径|已读取|节目列表/);
});

test("processChildMemoryBatch compacts legacy duplicate profiles before appending facts", async () => {
  delete process.env.AI_API_KEY;

  const result = await processChildMemoryBatch({
    previousSummary: [
      "2026-06-06 13:24 孩子档案: 咨询人:小圆子。关系:女儿。出生日期:2022-01-02。当前日期:2026-06-06。准确年龄:4岁5个月（按出生日期和当前日期计算,请以该准确年龄为准）。年级:小班。关注标签:社交",
      "2026-06-09 06:26 孩子档案: 咨询人:小圆子。关系:女儿。出生日期:2022-01-02。当前日期:2026-06-09。准确年龄:4岁5个月（按出生日期和当前日期计算,请以该准确年龄为准）。年级:小班。关注标签:社交",
      "2026-06-09 孩子情况: 当前正在小玩子超能模式内浏览「播客节目」页面。路径:/programs/list。请结合该页面浏览上下文回答。",
    ].join("\n"),
    childProfile: "咨询人:小圆子。关系:女儿。出生日期:2022-01-02。当前日期:2026-06-12。准确年龄:4岁5个月。年级:小班。关注标签:社交",
    queueItems: [
      { userMessage: "孩子最近社交退缩,进教室前会哭", assistantSummary: "", ts: new Date().toISOString() },
    ],
  });

  const profileCount = (result.summary.match(/孩子档案/g) || []).length;
  assert.equal(profileCount, 1);
  assert.doesNotMatch(result.summary, /浏览|路径:|当前页面|已读取/);
  assert.match(result.summary, /社交退缩/);
});

// ── buildChildMemorySummary（新接口兼容） ──

test("buildChildMemorySummary initializes profile when empty", async () => {
  const result = await buildChildMemorySummary({
    previous: "",
    childProfile: "咨询人:小圆子。年级:三年级",
    userMessage: "孩子写作业拖延",
    assistantReply: "试试番茄钟",
    now: new Date("2026-06-09T08:00:00+08:00"),
  });

  assert.match(result.summary, /咨询人:小圆子/);
  assert.ok(result.queued);
});

test("buildChildMemorySummary does not modify summary for subsequent calls", async () => {
  const result = await buildChildMemorySummary({
    previous: "旧记录: 喜欢数学",
    childProfile: "咨询人:小圆子。年级:三年级",
    userMessage: "孩子写作业拖延",
    assistantReply: "试试番茄钟",
  });

  // summary 保持不变，只是标记 queued
  assert.equal(result.summary, "旧记录: 喜欢数学");
  assert.ok(result.queued);
});

test("buildChildMemorySummary ignores page noise", async () => {
  const result = await buildChildMemorySummary({
    previous: "旧记录: 喜欢数学",
    userMessage: "浏览了页面:节目列表",
    assistantReply: "小玩子已记录当前浏览上下文...",
  });

  assert.equal(result.summary, "旧记录: 喜欢数学");
  assert.equal(result.queued, false);
});

test("buildChildMemorySummary returns a sanitized legacy summary", async () => {
  const result = await buildChildMemorySummary({
    previous: [
      "2026-06-06 13:24 孩子档案: 咨询人:小圆子。关系:女儿。出生日期:2022-01-02。当前日期:2026-06-06。年级:小班",
      "2026-06-09 06:26 孩子档案: 咨询人:小圆子。关系:女儿。出生日期:2022-01-02。当前日期:2026-06-09。年级:小班",
      "2026-06-09 孩子情况: 当前页面路径:/worthbuy。已读取当前知物列表。",
    ].join("\n"),
    userMessage: "浏览了页面:知物列表",
    assistantReply: "已读取当前页面",
  });

  assert.equal((result.summary.match(/孩子档案/g) || []).length, 1);
  assert.match(result.summary, /2026-06-09 06:26 孩子档案/);
  assert.doesNotMatch(result.summary, /当前页面路径|已读取|知物列表/);
  assert.equal(result.queued, false);
});

// ── split 测试 ──

test("splitChildMemoryItems returns removable items", async () => {
  assert.deepEqual(splitChildMemoryItems("偏好 A\n偏好 B；偏好 C"), [
    { id: "0", text: "偏好 A" },
    { id: "1", text: "偏好 B" },
    { id: "2", text: "偏好 C" },
  ]);
});
