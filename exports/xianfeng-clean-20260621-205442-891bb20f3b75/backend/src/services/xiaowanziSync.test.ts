import test from "node:test";
import assert from "node:assert/strict";
import { mergeXiaowanziSyncState, sanitizeXiaowanziSyncState } from "./xiaowanziSync";

test("mergeXiaowanziSyncState keeps latest browsing memory per page", () => {
  const merged = mergeXiaowanziSyncState(
    {
      browsingMemory: [
        { pathname: "/topics", label: "旧话题", summary: "old", visitedAt: "2026-06-10T01:00:00.000Z" },
      ],
    },
    {
      browsingMemory: [
        { pathname: "/topics", label: "先疯智库", summary: "new", visitedAt: "2026-06-11T01:00:00.000Z" },
        { pathname: "/programs/list", label: "播客节目", summary: "programs", visitedAt: "2026-06-09T01:00:00.000Z" },
      ],
    }
  );

  assert.equal(merged.browsingMemory.length, 2);
  assert.equal(merged.browsingMemory[0].pathname, "/topics");
  assert.equal(merged.browsingMemory[0].summary, "new");
});

test("mergeXiaowanziSyncState merges sessions and messages by latest session metadata", () => {
  const merged = mergeXiaowanziSyncState(
    {
      conversationSessions: [
        { id: "s1", title: "旧标题", updatedAt: "2026-06-10T01:00:00.000Z", createdAt: "2026-06-10T00:00:00.000Z" },
      ],
      conversationMessages: {
        s1: [{ role: "user", content: "旧设备问题", ts: "2026-06-10T01:00:00.000Z" }],
      },
    },
    {
      conversationSessions: [
        { id: "s1", title: "新标题", updatedAt: "2026-06-11T01:00:00.000Z", createdAt: "2026-06-10T00:00:00.000Z" },
        { id: "s2", title: "第二会话", updatedAt: "2026-06-09T01:00:00.000Z", createdAt: "2026-06-09T00:00:00.000Z" },
      ],
      conversationMessages: {
        s1: [{ role: "assistant", content: "新设备回答", ts: "2026-06-11T01:00:00.000Z" }],
        orphan: [{ role: "user", content: "不属于有效会话" }],
      },
    }
  );

  assert.equal(merged.conversationSessions.length, 2);
  assert.equal(merged.conversationSessions[0].id, "s1");
  assert.equal(merged.conversationSessions[0].title, "新标题");
  assert.deepEqual(merged.conversationMessages.s1, [
    { role: "assistant", content: "新设备回答", ts: "2026-06-11T01:00:00.000Z" },
  ]);
  assert.equal(merged.conversationMessages.orphan, undefined);
});

test("mergeXiaowanziSyncState keeps child profile deletions from reviving removed children", () => {
  const merged = mergeXiaowanziSyncState(
    {
      childProfiles: [
        { id: "child-1", displayName: "测试", createdAt: "2026-06-10T01:00:00.000Z" },
        { id: "child-2", displayName: "小圆子", createdAt: "2026-06-10T02:00:00.000Z" },
      ],
    },
    {
      childProfiles: [
        { id: "child-1", displayName: "测试", createdAt: "2026-06-10T01:00:00.000Z" },
      ],
      childProfileDeletions: [
        { id: "child-1", removedAt: "2026-06-11T01:00:00.000Z" },
      ],
    }
  );

  assert.deepEqual(
    merged.childProfiles.map((item) => item.id),
    ["child-2"],
    "deleted child ids should not come back from older synced profile payloads"
  );
  assert.deepEqual(merged.childProfileDeletions, [
    { id: "child-1", removedAt: "2026-06-11T01:00:00.000Z" },
  ]);
});

test("sanitizeXiaowanziSyncState keeps only bounded account sync data", () => {
  const sanitized = sanitizeXiaowanziSyncState({
    childProfiles: [
      { id: "child-1", displayName: "小圆子", gender: "女", concernTags: Array.from({ length: 20 }, (_, index) => `标签${index}`) },
      { displayName: "无 id" },
    ],
    childProfileDeletions: [
      { id: "child-1", removedAt: "2026-06-11T01:00:00.000Z" },
      { removedAt: "2026-06-12T01:00:00.000Z" },
    ],
    chatContext: { sessionId: "s1", childProfileId: "child-1", isChildBound: true, lastSwitchedAt: "bad-date" },
    conversationSessions: [{ id: "s1", title: "会话", updatedAt: "2026-06-11T01:00:00.000Z" }],
    conversationMessages: {
      s1: Array.from({ length: 130 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `消息${index}` })),
    },
  });

  assert.equal(sanitized.childProfiles.length, 0);
  assert.equal(sanitized.childProfileDeletions.length, 1);
  assert.equal(sanitized.childProfileDeletions[0].id, "child-1");
  assert.equal(sanitized.chatContext, null);
  assert.equal(sanitized.conversationMessages.s1.length, 120);
});
