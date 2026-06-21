import test from "node:test";
import assert from "node:assert/strict";

import { normalizeBookText, pickBestCandidate } from "./bookMetadataSampleMatcher";

test("normalizeBookText removes brackets and separators", () => {
  assert.equal(normalizeBookText("（英） 茱莉亚·唐纳森 / 著"), "英茱莉亚唐纳森著");
  assert.equal(normalizeBookText("[英] J.K.罗琳"), "英jk罗琳");
});

test("pickBestCandidate prefers exact title and close author", () => {
  const best = pickBestCandidate(
    {
      title: "秘密花园",
      author: "弗朗西丝 霍奇森 伯内特",
      publisher: "北京联合出版公司",
    },
    [
      {
        title: "秘密花园：彩图版",
        author: "佚名",
        publisher: "某出版社",
        isbn: "111",
        source: "fallback",
      },
      {
        title: "秘密花园",
        author: "弗朗西丝·霍奇森·伯内特",
        publisher: "北京联合出版公司",
        isbn: "222",
        source: "google_books",
      },
    ]
  );

  assert.ok(best);
  assert.equal(best?.isbn, "222");
  assert.ok((best?.matchScore || 0) > 0.8);
});
