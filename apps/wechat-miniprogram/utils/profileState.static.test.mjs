import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { hasDuplicateChildDisplayName, mergeChildProfileRecords } = require("./profileState.js");

test("child profile merge keeps persisted web children when native only has a draft", () => {
  const nativeChildren = [
    {
      id: "draft-1",
      displayName: "",
      relation: "儿子",
      grade: "学前小班",
      draft: true
    }
  ];
  const webChildren = JSON.stringify([
    {
      id: "child-web",
      displayName: "小圆子",
      relation: "女儿",
      grade: "小学一年级",
      concernTags: ["睡眠"]
    }
  ]);

  const merged = mergeChildProfileRecords(nativeChildren, webChildren, { avatarFallback: "/assets/wel-avatar/no-hat.png" });

  assert.deepEqual(merged.map((child) => child.id), ["child-web"]);
  assert.equal(merged[0].displayName, "小圆子");
  assert.equal(merged[0].avatar, "/assets/wel-avatar/no-hat.png");
});

test("child profile merge lets native saved child override the same web child", () => {
  const nativeChildren = [
    {
      id: "child-1",
      displayName: "小圆子",
      relation: "儿子",
      grade: "小学二年级",
      concernTags: ["专注力"]
    }
  ];
  const webChildren = [
    {
      id: "child-1",
      displayName: "旧小圆",
      relation: "女儿",
      grade: "小学一年级",
      concernTags: ["睡眠"]
    }
  ];

  const merged = mergeChildProfileRecords(nativeChildren, webChildren);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].displayName, "小圆子");
  assert.equal(merged[0].relation, "儿子");
  assert.equal(merged[0].grade, "小学二年级");
  assert.deepEqual(merged[0].concernTags, ["专注力"]);
});

test("child profile merge replaces retired Xiaowanzi avatar paths with the packaged default", () => {
  const merged = mergeChildProfileRecords(
    [
      {
        id: "child-legacy",
        displayName: "测试",
        relation: "儿子",
        avatar: "/assets/xiaowanzi-nohat.png"
      }
    ],
    [],
    { avatarFallback: "/assets/wel-avatar/no-hat.png" }
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].avatar, "/assets/wel-avatar/no-hat.png");
});

test("child profile merge dedupes saved children by display name", () => {
  const nativeChildren = [
    {
      id: "child-native",
      displayName: "小圆子",
      relation: "儿子",
      grade: "小学一年级"
    }
  ];
  const webChildren = [
    {
      id: "child-web",
      displayName: " 小圆子 ",
      relation: "女儿",
      grade: "学前小班"
    }
  ];

  const merged = mergeChildProfileRecords(nativeChildren, webChildren);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "child-native");
  assert.equal(merged[0].displayName, "小圆子");
  assert.equal(merged[0].relation, "儿子");
});

test("child profile merge omits drafts unless explicitly requested", () => {
  const nativeChildren = [
    {
      id: "child-draft",
      displayName: "未保存",
      relation: "儿子",
      grade: "学前小班",
      draft: true
    }
  ];

  assert.deepEqual(mergeChildProfileRecords(nativeChildren, []), []);
  assert.deepEqual(mergeChildProfileRecords(nativeChildren, [], { includeDrafts: true }).map((child) => child.id), ["child-draft"]);
});

test("child profile duplicate-name check ignores the same record id", () => {
  const children = [
    { id: "child-a", displayName: "小圆子" },
    { id: "child-b", displayName: "安安" }
  ];

  assert.equal(hasDuplicateChildDisplayName(children, { id: "child-new", displayName: "小圆子" }), true);
  assert.equal(hasDuplicateChildDisplayName(children, { id: "child-a", displayName: "小圆子" }), false);
  assert.equal(hasDuplicateChildDisplayName(children, { id: "child-new", displayName: "  " }), false);
});
