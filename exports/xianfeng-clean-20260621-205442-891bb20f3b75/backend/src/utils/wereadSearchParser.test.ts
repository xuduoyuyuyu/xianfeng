import test from "node:test";
import assert from "node:assert/strict";

import { parseWereadSearchCandidates } from "./wereadSearchParser";

test("parseWereadSearchCandidates extracts books from embedded state", () => {
  const html = `
    <html><body>
      <script>
        window.__INITIAL_STATE__={"searchBooksStoreModule":{"bookInfos":[{"bookInfo":{"bookId":"3300","title":"秘密花园","author":"伯内特","cover":"https://example.com/c.jpg","intro":"intro","publisher":"北京联合出版公司","newRating":915,"newRatingCount":321,"newRatingDetail":{"title":"神作"}}}]}};(function(){})();
      </script>
    </body></html>
  `;

  const items = parseWereadSearchCandidates(html);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.title, "秘密花园");
  assert.equal(items[0]?.author, "伯内特");
  assert.equal(items[0]?.description, "intro");
  assert.equal(items[0]?.sourceId, "3300");
  assert.equal(items[0]?.rating, 915);
  assert.equal(items[0]?.ratingCount, 321);
  assert.equal(items[0]?.ratingLabel, "神作");
  assert.equal(items[0]?.source, "weread_web");
});
