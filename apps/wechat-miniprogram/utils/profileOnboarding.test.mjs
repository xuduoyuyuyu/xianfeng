import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const modulePath = require.resolve("./profileOnboarding.js");

function loadProfile(seed = {}) {
  const storage = { ...seed };
  global.wx = {
    getStorageSync(key) {
      return storage[key];
    },
    setStorageSync(key, value) {
      storage[key] = value;
    },
    removeStorageSync(key) {
      delete storage[key];
    },
  };
  delete require.cache[modulePath];
  return { profile: require(modulePath), storage };
}

test("selects the last-used child and reports incomplete profile fields", () => {
  const { profile } = loadProfile({
    xiaowanzi_last_child_id_v1: "child-2",
    xf_child_profiles: [
      { id: "child-1", displayName: "大宝", city: "上海", region: "徐汇区", grade: "小学三年级" },
      { id: "child-2", displayName: "二宝", city: "上海", region: "", grade: "小学一年级" },
    ],
  });

  assert.deepEqual(profile.getProfileOnboardingState(), {
    visible: true,
    childId: "child-2",
    city: "上海",
    region: "",
    grade: "小学一年级",
  });
});

test("creates one base child named 孩子 and updates it on repeat save", async () => {
  const { profile, storage } = loadProfile();

  await profile.saveProfileOnboardingDraft({ city: "上海", region: "徐汇区", stage: "小学", gradeName: "三年级" });
  await profile.saveProfileOnboardingDraft({ city: "上海", region: "长宁区", stage: "小学", gradeName: "四年级" });

  assert.equal(storage.xf_child_profiles.length, 1);
  assert.equal(storage.xf_child_profiles[0].displayName, "孩子");
  assert.equal(storage.xf_child_profiles[0].region, "长宁区");
  assert.equal(storage.xf_child_profiles[0].grade, "小学四年级");
});

test("dismissal lasts only until the next foreground reset", () => {
  const { profile } = loadProfile();

  profile.dismissProfileOnboardingForSession();
  assert.equal(profile.getProfileOnboardingState().visible, false);
  profile.resetProfileOnboardingSession();
  assert.equal(profile.getProfileOnboardingState().visible, true);
});

test("builds encoded profile parameters only for complete profiles", () => {
  const { profile } = loadProfile({
    xf_child_profiles: [{ id: "child-1", displayName: "孩子", city: "上海", region: "浦东新区", grade: "小学三年级" }],
  });

  assert.equal(
    profile.buildPersonalizationQuery(),
    "profileCity=%E4%B8%8A%E6%B5%B7&profileRegion=%E6%B5%A6%E4%B8%9C%E6%96%B0%E5%8C%BA&profileGrade=%E5%B0%8F%E5%AD%A6%E4%B8%89%E5%B9%B4%E7%BA%A7"
  );
});

test("uses the existing five-four school grade options", () => {
  const { profile } = loadProfile();
  assert.deepEqual(profile.gradesFor("小学", "上海"), ["一年级", "二年级", "三年级", "四年级", "五年级"]);
  assert.equal(profile.formatGrade("初中", "六年级（预初）"), "初中六年级");
});
