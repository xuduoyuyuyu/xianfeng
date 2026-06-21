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

test("pickBestCandidate ignores title edition suffixes in brackets", () => {
  const best = pickBestCandidate(
    {
      title: "时间机器",
      author: "[英]赫伯特·乔治·威尔斯/著",
      publisher: "天津人民出版社",
    },
    [
      {
        title: "时间机器（果麦经典）",
        author: "赫伯特·乔治·威尔斯",
        publisher: "天津人民出版社",
        source: "weread_web",
      },
    ]
  );

  assert.ok(best);
  assert.equal(best?.matchReason.includes("title:exact"), true);
  assert.equal(best?.matchReason.includes("author:exact"), true);
  assert.ok((best?.matchScore || 0) > 0.9);
});

test("pickBestCandidate ignores title review suffixes and author locale markers", () => {
  const best = pickBestCandidate(
    {
      title: "小王子（审）",
      author: "(法) 圣埃克苏佩里",
      publisher: "浙江工商大学出版社",
    },
    [
      {
        title: "小王子",
        author: "[法]安托万·德·圣埃克苏佩里著",
        publisher: "天津人民出版社",
        source: "weread_web",
      },
    ]
  );

  assert.ok(best);
  assert.equal(best?.matchReason.includes("title:exact"), true);
  assert.equal(best?.matchReason.includes("author:partial"), true);
  assert.equal(best?.matchReason.includes("trusted:exact-title-partial-author"), true);
  assert.ok((best?.matchScore || 0) >= 0.85);
});

test("pickBestCandidate trusts series title candidates when author and publisher are exact", () => {
  const best = pickBestCandidate(
    {
      title: "像鹰一样滑翔",
      author: "曹文轩/著",
      publisher: "云南美术出版社",
    },
    [
      {
        title: "中文分级阅读文库K6 像鹰一样滑翔",
        author: "曹文轩",
        publisher: "云南美术出版社",
        source: "weread_web",
      },
    ]
  );

  assert.ok(best);
  assert.equal(best?.matchReason.includes("title:partial"), true);
  assert.equal(best?.matchReason.includes("author:exact"), true);
  assert.equal(best?.matchReason.includes("publisher:exact"), true);
  assert.equal(best?.matchReason.includes("trusted:partial-title-author-publisher"), true);
  assert.ok((best?.matchScore || 0) >= 0.85);
});

test("pickBestCandidate trusts exact title candidates when translated author names differ slightly", () => {
  const best = pickBestCandidate(
    {
      title: "绿山墙的安妮",
      author: "[加]露西·蒙哥马利",
      publisher: "浙江工商大学出版社",
    },
    [
      {
        title: "绿山墙的安妮（经典译林）",
        author: "[加]蒙哥马利",
        publisher: "译林出版社",
        source: "weread_web",
      },
    ]
  );

  assert.ok(best);
  assert.equal(best?.matchReason.includes("title:exact"), true);
  assert.equal(best?.matchReason.includes("author:partial"), true);
  assert.equal(best?.matchReason.includes("trusted:exact-title-partial-author"), true);
  assert.ok((best?.matchScore || 0) >= 0.85);
});

test("pickBestCandidate trusts normalized publisher suffixes for partial titles", () => {
  const best = pickBestCandidate(
    {
      title: "我是白痴",
      author: "王淑芬",
      publisher: "二十一世纪出版社",
    },
    [
      {
        title: "我是白痴/彩乌鸦原创王淑芬作品",
        author: "王淑芬",
        publisher: "二十一世纪出版社集团",
        source: "weread_web",
      },
    ]
  );

  assert.ok(best);
  assert.equal(best?.matchReason.includes("title:partial"), true);
  assert.equal(best?.matchReason.includes("author:exact"), true);
  assert.equal(best?.matchReason.includes("publisher:normalized"), true);
  assert.equal(best?.matchReason.includes("trusted:partial-title-author-publisher"), true);
  assert.ok((best?.matchScore || 0) >= 0.85);
});

test("pickBestCandidate normalizes publisher city suffixes", () => {
  const best = pickBestCandidate(
    {
      title: "爱上读书的妖怪",
      author: "[韩]李相培 著 / [韩]白明植 绘",
      publisher: "新蕾出版社",
    },
    [
      {
        title: "国际大奖小说-爱上读书的妖怪",
        author: "李相培",
        publisher: "新蕾出版社（天津）有限公司",
        source: "weread_web",
      },
    ]
  );

  assert.ok(best);
  assert.equal(best?.matchReason.includes("title:partial"), true);
  assert.equal(best?.matchReason.includes("author:exact"), true);
  assert.equal(best?.matchReason.includes("publisher:normalized"), true);
  assert.equal(best?.matchReason.includes("trusted:partial-title-author-publisher"), true);
  assert.ok((best?.matchScore || 0) >= 0.85);
});

test("pickBestCandidate normalizes numeric publisher aliases", () => {
  const best = pickBestCandidate(
    {
      title: "喜欢大的国王",
      author: "（日）安野光雅",
      publisher: "21世纪出版社",
    },
    [
      {
        title: "喜欢大的国王 安野光雅作品如果世界都只有大会怎么样，辩证思考问题 蒲蒲兰绘本",
        author: "[日]安野光雅",
        publisher: "二十一世纪出版社",
        source: "weread_web",
      },
    ]
  );

  assert.ok(best);
  assert.equal(best?.matchReason.includes("title:partial"), true);
  assert.equal(best?.matchReason.includes("author:exact"), true);
  assert.equal(best?.matchReason.includes("publisher:normalized"), true);
  assert.equal(best?.matchReason.includes("trusted:partial-title-author-publisher"), true);
  assert.ok((best?.matchScore || 0) >= 0.85);
});

test("pickBestCandidate trusts exact titles when author names are close variants", () => {
  const best = pickBestCandidate(
    {
      title: "灵犬莱西",
      author: "[美]艾里克·奈特",
      publisher: "中国少年儿童出版社",
    },
    [
      {
        title: "灵犬莱西",
        author: "[美]埃里克·奈特",
        publisher: "湖南少年儿童出版社",
        source: "weread_web",
      },
    ]
  );

  assert.ok(best);
  assert.equal(best?.matchReason.includes("title:exact"), true);
  assert.equal(best?.matchReason.includes("author:close"), true);
  assert.equal(best?.matchReason.includes("trusted:exact-title-close-author"), true);
  assert.ok((best?.matchScore || 0) >= 0.85);
});

test("pickBestCandidate trusts exact titles when author names differ by one translated character", () => {
  const best = pickBestCandidate(
    {
      title: "小鹿斑比",
      author: "菲利克斯·萨尔腾",
      publisher: "北京日报出版社",
    },
    [
      {
        title: "小鹿斑比",
        author: "费力克斯·萨尔腾",
        publisher: "中国少年儿童出版社",
        source: "weread_web",
      },
    ]
  );

  assert.ok(best);
  assert.equal(best?.matchReason.includes("title:exact"), true);
  assert.equal(best?.matchReason.includes("author:close"), true);
  assert.equal(best?.matchReason.includes("trusted:exact-title-close-author"), true);
  assert.ok((best?.matchScore || 0) >= 0.85);
});

test("pickBestCandidate normalizes full-width numeric publisher aliases", () => {
  const best = pickBestCandidate(
    {
      title: "克里克塔",
      author: "汤米·温格尔",
      publisher: "２１世纪出版社",
    },
    [
      {
        title: "克里克塔 汤米温格尔系列（套装共4册）让孩子发现自己的独特",
        author: "汤米温格尔",
        publisher: "二十一世纪出版社",
        source: "weread_web",
      },
    ]
  );

  assert.ok(best);
  assert.equal(best?.matchReason.includes("title:partial"), true);
  assert.equal(best?.matchReason.includes("author:exact"), true);
  assert.equal(best?.matchReason.includes("publisher:normalized"), true);
  assert.equal(best?.matchReason.includes("trusted:partial-title-author-publisher"), true);
  assert.ok((best?.matchScore || 0) >= 0.85);
});

test("pickBestCandidate trusts partial title and author when publisher is exact", () => {
  const best = pickBestCandidate(
    {
      title: "忠犬八公",
      author: "（西）路易斯·普拉茨/著 / （西）苏珊娜·塞莱伊/绘",
      publisher: "广西师范大学出版社",
    },
    [
      {
        title: "魔法象故事森林 忠犬八公",
        author: "路易斯·普拉茨 苏珊娜·塞莱伊",
        publisher: "广西师范大学出版社",
        source: "weread_web",
      },
    ]
  );

  assert.ok(best);
  assert.equal(best?.matchReason.includes("title:partial"), true);
  assert.equal(best?.matchReason.includes("author:partial"), true);
  assert.equal(best?.matchReason.includes("publisher:exact"), true);
  assert.equal(best?.matchReason.includes("trusted:partial-title-partial-author-publisher"), true);
  assert.ok((best?.matchScore || 0) >= 0.85);
});

test("pickBestCandidate trusts exact titles with transliterated author variants", () => {
  const best = pickBestCandidate(
    {
      title: "天蓝色的彼岸",
      author: "（英）艾利克斯・希尔",
      publisher: "新世界出版社",
    },
    [
      {
        title: "天蓝色的彼岸",
        author: "[英]亚历克斯·希勒",
        publisher: "北京联合出版公司",
        source: "weread_web",
      },
    ]
  );

  assert.ok(best);
  assert.equal(best?.matchReason.includes("title:exact"), true);
  assert.equal(best?.matchReason.includes("author:transliterated"), true);
  assert.equal(best?.matchReason.includes("trusted:exact-title-transliterated-author"), true);
  assert.ok((best?.matchScore || 0) >= 0.85);
});

test("pickBestCandidate keeps exact title with unrelated author below auto-approval", () => {
  const best = pickBestCandidate(
    {
      title: "阿凡提的故事",
      author: "赵世杰 编译",
      publisher: "云南美术出版社",
    },
    [
      {
        title: "阿凡提的故事（全4册）",
        author: "艾克拜尔·吾拉木",
        publisher: "南方出版社",
        source: "weread_web",
      },
    ]
  );

  assert.ok(best);
  assert.equal(best?.matchReason.includes("title:exact"), true);
  assert.equal(best?.matchReason.includes("trusted:exact-title-transliterated-author"), false);
  assert.ok((best?.matchScore || 0) < 0.85);
});
