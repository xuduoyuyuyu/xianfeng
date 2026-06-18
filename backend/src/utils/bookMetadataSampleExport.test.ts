import test from "node:test";
import assert from "node:assert/strict";

import { buildHighConfidenceMatches } from "./bookMetadataSampleExport";

test("buildHighConfidenceMatches keeps only matches at or above threshold", () => {
  const input = [
    {
      sourceBook: { _id: "1", title: "低分书", author: "甲", publisher: "", coverImage: "" },
      bestMatch: { title: "低分候选", author: "甲", source: "weread_web", matchScore: 0.57, matchReason: [] },
      candidates: [],
      errors: [],
    },
    {
      sourceBook: { _id: "2", title: "高分书", author: "乙", publisher: "", coverImage: "" },
      bestMatch: { title: "高分候选", author: "乙", source: "weread_web", matchScore: 0.87, matchReason: ["title:exact"] },
      candidates: [],
      errors: [],
    },
    {
      sourceBook: { _id: "3", title: "边界书", author: "丙", publisher: "", coverImage: "" },
      bestMatch: { title: "边界候选", author: "丙", source: "weread_web", matchScore: 0.85, matchReason: ["title:exact"] },
      candidates: [],
      errors: [],
    },
  ];

  const result = buildHighConfidenceMatches(input, 0.85);
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((item) => ({ title: item.sourceBook.title, score: item.bestMatch.matchScore })),
    [
      { title: "高分书", score: 0.87 },
      { title: "边界书", score: 0.85 },
    ]
  );
});
