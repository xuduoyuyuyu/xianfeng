import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("./user.ts", import.meta.url), "utf8");

describe("admin user list projection", () => {
  it("returns only list fields and caps embedded change history", () => {
    const getAll = source.slice(source.indexOf("async getAll("), source.indexOf("async getOverview("));

    assert.match(getAll, /\.select\([\s\S]*username mobile name role[\s\S]*proPointBalance changeHistory createdAt[\s\S]*\)/);
    assert.match(getAll, /\.slice\("changeHistory", -6\)/);
    assert.doesNotMatch(getAll, /\.select\("-password"\)/);
  });
});
