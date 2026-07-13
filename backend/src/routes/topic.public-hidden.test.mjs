import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./topic.ts", import.meta.url), "utf8");

test("public topic list excludes current user's hidden published topics", () => {
  assert.match(
    source,
    /filter\.\$or = \[\{ status: "published", hiddenForUsers: \{ \$ne: validUserId \} \}\];/
  );
  assert.doesNotMatch(source, /公开话题不受 hiddenForUsers 影响/);
});

test("public topic detail can open generated user pending topics without creator id drift", () => {
  assert.match(
    source,
    /function topicIdentityFilter\(param: string \| string\[\]\)/,
    "public topic detail should share slug-or-id lookup with generated cards"
  );
  assert.match(
    source,
    /\$or: \[\{ slug: p \}, \{ _id: p \}\]/,
    "public topic detail should allow database id fallback when slug is missing from a card"
  );
  assert.match(
    source,
    /const filter: Record<string, any> = \{[\s\S]*\$and: \[topicIdentityFilter\(req\.params\.slug\), topicVisibilityFilter\(validUserId\)\],[\s\S]*\};/,
    "public topic detail should combine slug-or-id identity with visibility rules"
  );
  assert.match(
    source,
    /\{ status: "pending", source: "user", hiddenForUsers: \{ \$ne: validUserId \} \}/,
    "topic detail should not return 404 for user-generated pending topics when createdBy changed"
  );
  assert.match(
    source,
    /\{ status: "pending", source: "user" \}/,
    "topic detail should still allow user-generated pending topics when no userId is available"
  );
});

test("public topic list keeps heavy layer content out of list responses", () => {
  assert.match(
    source,
    /const TOPIC_LIST_SELECT = /,
    "public topic list should define a list projection"
  );
  assert.match(
    source,
    /"-layers\.layer1\.content"[\s\S]*"-layers\.layer2\.content"[\s\S]*"-layers\.layer3\.content"[\s\S]*"-layers\.layer4\.content"[\s\S]*"-layers\.layer5\.content"/,
    "public topic list should exclude long node content while preserving node count"
  );
  assert.match(
    source,
    /Topic\.find\(filter\)[\s\S]*\.select\(TOPIC_LIST_SELECT\)[\s\S]*\.skip\(\(pageNum - 1\) \* limitNum\)/,
    "public topic list projection should be applied before paginated list reads"
  );
  assert.match(
    source,
    /Topic\.find\(\{[\s\S]*status: "pending",[\s\S]*createdBy: userId,[\s\S]*\}\)[\s\S]*\.select\(TOPIC_LIST_SELECT\)/,
    "user pending topic list merge should use the same lightweight projection"
  );
});
