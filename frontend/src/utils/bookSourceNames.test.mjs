import test from "node:test";
import assert from "node:assert/strict";
import {
  hasBookSourceName,
  parseBookSourceNames,
  uniqueBookSourceNames,
} from "./bookSourceNames.ts";

test("splits and normalizes legacy book source names", () => {
  assert.deepEqual(
    parseBookSourceNames(" 总书单；《小班书单》; 原创书单；；总书单 "),
    ["总书单", "小班书单", "原创书单"]
  );
  assert.deepEqual(parseBookSourceNames(null), []);
});

test("deduplicates source names across books in first-seen order", () => {
  assert.deepEqual(
    uniqueBookSourceNames(["总书单；小班书单", "《小班书单》;原创书单"]),
    ["总书单", "小班书单", "原创书单"]
  );
});

test("matches one real list without fuzzy matching", () => {
  assert.equal(hasBookSourceName("总书单；小班书单", "小班书单"), true);
  assert.equal(hasBookSourceName("总书单；小班书单", "小班"), false);
});
