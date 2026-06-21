import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "TopicHubPage.tsx"), "utf8");

test("topic hub collapses mobile tags to three rows while preserving desktop count", () => {
  assert.match(source, /const DESKTOP_VISIBLE_TAGS = 48;/, "desktop should keep the existing broad collapsed tag list");
  assert.match(source, /const MOBILE_VISIBLE_TAGS = 18;/, "mobile should cap collapsed tags at three rows");
  assert.match(
    source,
    /const maxVisibleTags = isMobilePager \? MOBILE_VISIBLE_TAGS : DESKTOP_VISIBLE_TAGS;/,
    "collapsed tag count should switch by mobile pager state"
  );
  assert.match(
    source,
    /const visibleTags = tagExpanded \? allTags : allTags\.slice\(0, maxVisibleTags\);/,
    "collapsed tags should use the responsive visible-tag limit"
  );
  assert.match(
    source,
    /const hasMoreTags = allTags\.length > maxVisibleTags;/,
    "expand control should follow the responsive visible-tag limit"
  );
});
