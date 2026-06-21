import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./AdminTopicsPage.tsx", import.meta.url), "utf8");

test("admin topics list uses paginated loading instead of all=true", () => {
  assert.doesNotMatch(source, /\/api\/admin\/topic-hub\?all=true/);
  assert.match(source, /\/api\/admin\/topic-hub\?page=\$\{pageNum\}&limit=\$\{PAGE_SIZE\}/);
});

test("admin topics edit flow loads full topic detail on demand", () => {
  assert.match(source, /fetch\(`\/api\/admin\/topic-hub\/\$\{encodeURIComponent\(item\.slug\)\}`/);
  assert.match(source, /const detail = data\.topic as TopicHubItem/);
});
