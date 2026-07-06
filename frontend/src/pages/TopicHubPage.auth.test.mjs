import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "TopicHubPage.tsx"), "utf8");

test("topic submission clears stale login state when auth middleware returns 401", () => {
  assert.match(source, /import \{ useDispatch, useSelector \} from "react-redux";/, "topic page should be able to update Redux auth state");
  assert.match(source, /import \{ logout \} from "\.\.\/store\/userSlice";/, "topic page should reuse the shared logout cleanup");
  assert.match(source, /const dispatch = useDispatch\(\);/, "topic page should create a dispatch for stale-session cleanup");
  assert.match(
    source,
    /const handleAuthExpired = \([^)]*\) => \{[\s\S]*dispatch\(logout\(\)\);[\s\S]*xf-show-login-modal[\s\S]*登录态已过期/,
    "401 responses should clear stored auth and show the login-expired modal"
  );

  const calls = source.match(/handleAuthExpired\([^)]*\);/g) || [];
  assert.ok(calls.length >= 3, "refine, validate, and search-generate should all handle 401 auth expiry");
});

test("submitted pending topic links keep the current topic user id and id fallback", () => {
  assert.match(
    source,
    /function getTopicRouteId\(topic: Pick<TopicItem, "slug" \| "_id" \| "id">\): string \{[\s\S]*return String\(topic\.slug \|\| topic\._id \|\| topic\.id \|\| ""\)\.trim\(\);[\s\S]*\}/,
    "topic cards should fall back to database id when slug is missing"
  );
  assert.match(
    source,
    /const buildTopicDetailPath = \(topicOrSlug: TopicItem \| string\) => \{[\s\S]*const routeId = typeof topicOrSlug === "string" \? topicOrSlug : getTopicRouteId\(topicOrSlug\);[\s\S]*return `\/topics\/\$\{encodeURIComponent\(routeId\)\}\$\{uid \? `\?userId=\$\{encodeURIComponent\(uid\)\}` : ""\}`;/,
    "topic links should carry the same userId used by list and submit requests"
  );
  assert.match(
    source,
    /to=\{buildTopicDetailPath\(submitMsg\.slug\)\}/,
    "existing-match submit entry should open pending detail with userId"
  );
  assert.match(
    source,
    /to=\{buildTopicDetailPath\(topic\)\}/,
    "topic cards should open pending detail with userId and id fallback"
  );
});

test("confirmed refined topic submits directly instead of searching related topics again", () => {
  assert.match(
    source,
    /const handleConfirmRefine = \(\) => \{[\s\S]*doSearchAndSubmit\(kw, true, true\);[\s\S]*\};/,
    "confirmed refined topic should bypass the related-topic search and submit the topic"
  );
});
