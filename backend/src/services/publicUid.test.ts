import assert from "node:assert/strict";
import test from "node:test";
import { createPublicUid } from "./publicUid";

test("createPublicUid returns a nine-digit numeric identifier", () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(createPublicUid(), /^\d{9}$/);
  }
});
