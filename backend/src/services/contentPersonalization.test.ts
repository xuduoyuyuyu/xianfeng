import assert from "node:assert/strict";
import test from "node:test";
import {
  parseContentProfile,
  profileStage,
  rankPersonalizedItems,
  scorePersonalizedText,
} from "./contentPersonalization";

test("normalizes complete bounded profile query text", () => {
  assert.deepEqual(parseContentProfile({
    profileCity: " 上海市 ",
    profileRegion: "徐汇区",
    profileGrade: "小学三年级",
  }), { city: "上海市", region: "徐汇区", grade: "小学三年级", stage: "小学" });
});

test("rejects partial, unknown-stage, and overlong profiles", () => {
  assert.equal(parseContentProfile({ profileCity: "上海", profileRegion: "", profileGrade: "小学三年级" }), null);
  assert.equal(parseContentProfile({ profileCity: "上海", profileRegion: "徐汇区", profileGrade: "三岁" }), null);
  assert.equal(parseContentProfile({ profileCity: "上".repeat(81), profileRegion: "徐汇区", profileGrade: "小学三年级" }), null);
});

test("scores region then city then exact grade then stage", () => {
  const profile = parseContentProfile({ profileCity: "上海", profileRegion: "徐汇区", profileGrade: "小学三年级" });
  assert.ok(profile);
  assert.equal(scorePersonalizedText("徐汇区活动", profile), 1000);
  assert.equal(scorePersonalizedText("上海教育", profile), 100);
  assert.equal(scorePersonalizedText("适合小学三年级", profile), 11);
  assert.equal(scorePersonalizedText("小学阅读", profile), 1);
});

test("ranks before slicing and keeps original order for equal scores", () => {
  const profile = { city: "上海", region: "徐汇区", grade: "小学三年级", stage: profileStage("小学三年级") } as const;
  const items = [
    { id: "old-1", text: "通用" },
    { id: "region", text: "徐汇区" },
    { id: "old-2", text: "通用" },
    { id: "city", text: "上海" },
  ];
  const ranked = rankPersonalizedItems(items, profile, (item) => item.text);
  assert.deepEqual(ranked.map((item) => item.id), ["region", "city", "old-1", "old-2"]);
  assert.deepEqual(rankPersonalizedItems(items, null, (item) => item.text), items);
});
