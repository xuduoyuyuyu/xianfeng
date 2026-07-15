import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { uniqueBookSourceNames } from "./bookSourceNames";

describe("guest book source names", () => {
  it("splits and deduplicates real source names in first-seen order", () => {
    assert.deepEqual(
      uniqueBookSourceNames(["《亲子书单》；教师书单", "亲子书单; 阅读书单", null]),
      ["亲子书单", "教师书单", "阅读书单"]
    );
  });

  it("drops empty and non-string source names", () => {
    assert.deepEqual(uniqueBookSourceNames(["； ; ", undefined, 42]), []);
  });
});
