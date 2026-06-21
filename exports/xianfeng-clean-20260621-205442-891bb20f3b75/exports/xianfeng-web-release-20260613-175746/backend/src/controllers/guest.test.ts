import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGuestContentTagMap, collectGuestFilterTags } from "./guest";

describe("guest public content tags", () => {
  it("derives guest tags from bound program summary tags", () => {
    const guestId = "64f000000000000000000001";
    const tagMap = buildGuestContentTagMap([
      {
        guestBindings: [{ guestId }],
        summary: { tags: ["亲子沟通", "青春期"] },
      },
      {
        guestBindings: [{ guestId }],
        summary: { tags: ["青春期", "学习动力"] },
      },
    ]);

    assert.deepEqual(tagMap.get(guestId), ["青春期", "亲子沟通", "学习动力"]);
  });

  it("sorts filter tags by guest coverage then keeps first-seen order", () => {
    const rows = [
      { contentTags: ["阅读", "亲子沟通"] },
      { contentTags: ["亲子沟通", "学习动力"] },
      { contentTags: ["阅读"] },
    ];

    assert.deepEqual(collectGuestFilterTags(rows), ["阅读", "亲子沟通", "学习动力"]);
  });
});
