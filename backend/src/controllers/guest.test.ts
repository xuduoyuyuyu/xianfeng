import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGuestContentTagMap, collectGuestFilterTags } from "./guest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "guest.ts"), "utf8");

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

describe("public guest list visibility", () => {
  it("filters guests without published programs before counting and pagination", () => {
    assert.match(
      source,
      /const publicProgramCountMap = await buildGuestProgramCountMap\(\);/,
      "public guest list should first compute guests that have published programs"
    );
    assert.match(
      source,
      /baseFilter\._id = \{ \$in: publicGuestObjectIds \};/,
      "public guest list should constrain the guest query to guests with published programs"
    );
    assert.match(
      source,
      /\$match: \{[\s\S]*status: "published"/,
      "guest program counts should only include published programs"
    );
  });

  it("returns every published program on the guest detail page", () => {
    const detailStart = source.indexOf("async getByIdPublic");
    const detailEnd = source.indexOf("// POST /api/guests/:id/submit-wish");
    const detailSource = source.slice(detailStart, detailEnd);

    assert.match(detailSource, /relatedPrograms: relatedPrograms\.map\(serializeProgramCard\)/);
    assert.doesNotMatch(
      detailSource,
      /\.limit\(12\)/,
      "guest detail should not truncate participated programs before the client can render them"
    );
  });
});
