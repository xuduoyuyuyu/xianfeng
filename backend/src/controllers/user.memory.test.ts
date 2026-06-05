import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeAdminChildMemories } from "./user";

describe("admin user child memories", () => {
  it("groups child memory documents into admin user summaries", () => {
    const userId = "64f000000000000000000001";
    const grouped = summarizeAdminChildMemories([
      {
        userId,
        childId: "child-a",
        enabled: true,
        summary: "2026-06-04 孩子档案: 小圆子 三年级\n2026-06-04 长期事实: 喜欢阅读",
        updatedAt: new Date("2026-06-04T08:00:00.000Z"),
      },
      {
        userId,
        childId: "child-b",
        enabled: false,
        summary: "",
        updatedAt: new Date("2026-06-04T07:00:00.000Z"),
      },
    ]);

    assert.equal(grouped.get(userId)?.memoryItemCount, 2);
    assert.equal(grouped.get(userId)?.childMemories.length, 2);
    assert.equal(grouped.get(userId)?.childMemories[0].childId, "child-a");
    assert.match(grouped.get(userId)?.memoryPreview || "", /小圆子 三年级/);
    assert.equal(grouped.get(userId)?.childMemories[1].enabled, false);
  });
});
