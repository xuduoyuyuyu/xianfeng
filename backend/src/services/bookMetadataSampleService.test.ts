import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  findHighConfidenceBookMetadataByBookId,
  findHighConfidenceBookMetadataForBook,
  findHighConfidenceBookMetadataInMatches,
  remapHighConfidenceBookMetadataMatchesToBooks,
} from "./bookMetadataSampleService";

test("findHighConfidenceBookMetadataByBookId returns a matching high-confidence entry", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "xf-book-meta-"));
  const filePath = path.join(dir, "high-confidence.json");
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        matches: [
          {
            sourceBook: {
              _id: "book-1",
              title: "呼兰河传",
              author: "萧红",
              publisher: "江西人民出版社",
              coverImage: "https://example.com/source.jpg",
            },
            bestMatch: {
              title: "呼兰河传",
              author: "萧红",
              publisher: "浙江文艺出版社",
              cover: "https://example.com/match.jpg",
              description: "详细简介",
              sourceId: "38099462",
              rating: 906,
              ratingCount: 1504,
              ratingLabel: "神作",
              source: "weread_web",
              matchScore: 0.9,
              matchReason: ["title:exact", "author:exact"],
            },
            candidates: [],
            errors: [],
          },
        ],
      },
      null,
      2
    ),
    "utf8"
  );

  const result = await findHighConfidenceBookMetadataByBookId("book-1", filePath);
  assert.ok(result);
  assert.equal(result?.sourceBook._id, "book-1");
  assert.equal(result?.bestMatch.title, "呼兰河传");
  assert.equal(result?.bestMatch.description, "详细简介");
});

test("findHighConfidenceBookMetadataByBookId returns null when no match exists", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "xf-book-meta-"));
  const filePath = path.join(dir, "high-confidence.json");
  await fs.writeFile(filePath, JSON.stringify({ matches: [] }, null, 2), "utf8");

  const result = await findHighConfidenceBookMetadataByBookId("missing-book", filePath);
  assert.equal(result, null);
});

test("findHighConfidenceBookMetadataForBook falls back to title and author when ids drift", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "xf-book-meta-"));
  const filePath = path.join(dir, "high-confidence.json");
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        matches: [
          {
            sourceBook: {
              _id: "old-import-id",
              title: "牧羊少年奇幻之旅",
              author: "[巴西]保罗·柯艾略/著",
              publisher: "北京十月文艺出版社",
              coverImage: "",
            },
            bestMatch: {
              title: "牧羊少年奇幻之旅",
              author: "保罗•柯艾略",
              publisher: "北京十月文艺出版社",
              cover: "",
              description: "详细简介",
              sourceId: "749907",
              rating: 816,
              ratingCount: 37959,
              ratingLabel: "脍炙人口",
              source: "weread_web",
              matchScore: 1,
              matchReason: ["title:exact", "author:exact", "publisher:exact"],
            },
            candidates: [],
            errors: [],
          },
        ],
      },
      null,
      2
    ),
    "utf8"
  );

  const result = await findHighConfidenceBookMetadataForBook(
    {
      _id: "new-import-id",
      title: "牧羊少年奇幻之旅",
      author: "[巴西]保罗·柯艾略/著",
      publisher: "北京十月文艺出版社",
    },
    filePath
  );

  assert.ok(result);
  assert.equal(result?.sourceBook._id, "old-import-id");
  assert.equal(result?.bestMatch?.description, "详细简介");
});

test("findHighConfidenceBookMetadataInMatches reuses loaded matches for list enrichment", () => {
  const matches = [
    {
      sourceBook: {
        _id: "book-1",
        title: "时间机器",
        author: "赫伯特·乔治·威尔斯",
        publisher: "江苏凤凰文艺出版社",
        coverImage: "",
      },
      bestMatch: {
        title: "时间机器",
        author: "赫伯特·乔治·威尔斯",
        publisher: "江苏凤凰文艺出版社",
        cover: "",
        description: "详细简介",
        sourceId: "123",
        rating: 800,
        ratingCount: 12,
        ratingLabel: "推荐",
        source: "weread_web",
        matchScore: 1,
        matchReason: ["title:exact"],
      },
      candidates: [],
      errors: [],
    },
  ];

  assert.equal(findHighConfidenceBookMetadataInMatches({ _id: "book-1" }, matches)?.sourceBook._id, "book-1");
  assert.equal(
    findHighConfidenceBookMetadataInMatches(
      { _id: "new-id", title: "时间机器", author: "赫伯特·乔治·威尔斯", publisher: "江苏凤凰文艺出版社" },
      matches
    )?.sourceBook._id,
    "book-1"
  );
  assert.equal(findHighConfidenceBookMetadataInMatches({ _id: "missing", title: "不存在的书" }, matches), null);
});

test("remapHighConfidenceBookMetadataMatchesToBooks rewrites stale sample ids to current book ids", () => {
  const matches = [
    {
      sourceBook: {
        _id: "old-id",
        title: "小真的长头发",
        author: "[日]高楼方子",
        publisher: "海豚出版社",
        coverImage: "https://old.example/cover.jpg",
      },
      bestMatch: {
        title: "小真的长头发",
        author: "高楼方子",
        publisher: "海豚出版社",
        cover: "https://example.com/cover.jpg",
        description: "详细简介",
        sourceId: "123",
        rating: 892,
        ratingCount: 32,
        ratingLabel: "推荐",
        source: "weread_web",
        matchScore: 0.9,
        matchReason: ["title:exact", "publisher:exact"],
      },
      candidates: [],
      errors: [],
    },
  ];

  const remapped = remapHighConfidenceBookMetadataMatchesToBooks(
    [
      {
        _id: "current-id",
        title: "小真的长头发",
        author: "[日]高楼方子",
        publisher: "海豚出版社",
        coverImage: "https://current.example/cover.jpg",
      },
    ],
    matches
  );

  assert.equal(remapped.length, 1);
  assert.equal(remapped[0].sourceBook._id, "current-id");
  assert.equal(remapped[0].sourceBook.coverImage, "https://current.example/cover.jpg");
  assert.equal(matches[0].sourceBook._id, "old-id");
});
