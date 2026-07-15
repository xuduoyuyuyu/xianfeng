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
  it("treats published and group-only programs as visible guest content", () => {
    assert.match(
      source,
      /const PUBLIC_GUEST_PROGRAM_STATUSES = \["published", "group-only"\] as const;/,
      "guest surfaces should share the same public statuses as program detail"
    );
    assert.match(
      source,
      /const publicProgramCountMap = await buildGuestProgramCountMap\(\);/,
      "public guest list should first compute guests that have visible programs"
    );
    assert.match(
      source,
      /baseFilter\._id = \{ \$in: publicGuestObjectIds \};/,
      "public guest list should constrain the guest query to guests with published programs"
    );
    assert.match(
      source,
      /\$match: \{[\s\S]*status: \{ \$in: PUBLIC_GUEST_PROGRAM_STATUSES \}/,
      "guest program counts should include published and group-only programs"
    );
  });

  it("returns every visible program on the guest detail page", () => {
    const detailStart = source.indexOf("async getByIdPublic");
    const detailEnd = source.indexOf("// POST /api/guests/:id/submit-wish");
    const detailSource = source.slice(detailStart, detailEnd);

    assert.match(detailSource, /status: \{ \$in: PUBLIC_GUEST_PROGRAM_STATUSES \}/);
    assert.match(detailSource, /relatedPrograms: relatedPrograms\.map\(serializeProgramCard\)/);
    assert.doesNotMatch(
      detailSource,
      /\.limit\(12\)/,
      "guest detail should not truncate participated programs before the client can render them"
    );
  });

  it("returns the complete normalized booklist contract on guest detail", () => {
    const detailStart = source.indexOf("async getByIdPublic");
    const detailEnd = source.indexOf("// POST /api/guests/:id/submit-wish");
    const detailSource = source.slice(detailStart, detailEnd);

    assert.match(detailSource, /const bookLists = await loadGuestBookLists\(id\)/);
    assert.match(detailSource, /bookLists,/);
    assert.doesNotMatch(detailSource, /bookLists:[\s\S]*\.slice\(0,\s*5\)/);
  });

  it("returns complete published books authored by the exact guest name", () => {
    const detailStart = source.indexOf("async getByIdPublic");
    const detailEnd = source.indexOf("// POST /api/guests/:id/submit-wish");
    const detailSource = source.slice(detailStart, detailEnd);

    assert.match(source, /loadGuestAuthoredBooks\(guestName: string\)/);
    assert.match(source, /Book\.find\(\s*\{ author: guestName, status: "published" \}/);
    assert.match(detailSource, /const authoredBooks = await loadGuestAuthoredBooks\(/);
    assert.match(detailSource, /authoredBooks,/);
    assert.doesNotMatch(detailSource, /authoredBooks\.slice\(/);
  });

  it("returns published learning materials bound to the guest", () => {
    const detailStart = source.indexOf("async getByIdPublic");
    const detailEnd = source.indexOf("// POST /api/guests/:id/submit-wish");
    const detailSource = source.slice(detailStart, detailEnd);

    assert.match(source, /import LearningMaterial from "\.\.\/models\/LearningMaterial"/);
    assert.match(detailSource, /LearningMaterial\.find\(\{ guestId: new mongoose\.Types\.ObjectId\(id\), status: "published" \}/);
    assert.match(detailSource, /extensionMaterials,/);
  });
});
