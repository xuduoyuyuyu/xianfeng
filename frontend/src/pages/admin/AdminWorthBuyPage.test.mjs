import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./AdminWorthBuyPage.tsx", import.meta.url), "utf8");

test("admin worthbuy list uses paginated loading", () => {
  assert.match(source, /\/api\/admin\/worthbuy\?page=\$\{pageNum\}&limit=\$\{PAGE_SIZE\}/);
});

test("admin worthbuy edit flow fetches full detail lazily", () => {
  assert.match(source, /axios\.get\(`\/api\/admin\/worthbuy\/\$\{item\._id\}`/);
  assert.match(source, /setEditingItem\(detail\)/);
});

test("admin worthbuy supports soft delete and restore controls", () => {
  assert.match(source, /const \[listMode, setListMode\] = useState<"active" \| "deleted">\("active"\)/, "worthbuy admin should default to the active non-deleted list");
  assert.match(source, /\/api\/admin\/worthbuy\?page=\$\{pageNum\}&limit=\$\{PAGE_SIZE\}&status=\$\{listMode === "deleted" \? "deleted" : "active"\}/, "worthbuy admin should request active or deleted rows explicitly");
  assert.match(source, /axios\.delete\(`\/api\/admin\/worthbuy\/\$\{item\._id\}`/, "worthbuy admin should soft delete through a dedicated delete endpoint");
  assert.match(source, /handleRestore\(item\)/, "worthbuy admin should provide a restore action for deleted rows");
  assert.match(source, /setListMode\("deleted"\)/, "worthbuy admin should expose a deleted-list view");
  assert.match(source, />删除<\/button>/, "worthbuy rows should include a separate delete button");
  assert.match(source, />恢复<\/button>/, "deleted worthbuy rows should include a restore button");
});
