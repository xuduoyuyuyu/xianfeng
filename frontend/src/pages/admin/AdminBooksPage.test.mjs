import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(__dirname, "AdminBooksPage.tsx"), "utf8");
const apiSource = readFileSync(resolve(__dirname, "../../services/api.ts"), "utf8");

test("admin book api carries editable metadata details", () => {
  assert.match(apiSource, /metadataDetail\?: AdminBookMetadata \| null;/, "Book rows should expose full metadata detail for admin editing");
});

test("admin book editor can maintain existing metadata detail fields", () => {
  assert.match(pageSource, /type MetadataFormData = \{/, "admin page should have a separate metadata form state");
  assert.match(pageSource, /setMetadataFormData\(toMetadataForm\(book\)\)/, "editing a book should hydrate metadata detail into the modal");
  assert.match(pageSource, /adminApi\.reviewBookMetadata\(metadataId/, "saving an edited book should persist metadata detail changes");
  assert.match(pageSource, /图书详情内容/, "edit modal should expose a book detail section");
  assert.match(pageSource, /内容简介/, "edit modal should expose the public introduction field");
  assert.match(pageSource, /详情封面 URL/, "edit modal should expose the metadata cover field");
  assert.match(pageSource, /数据来源/, "edit modal should expose the metadata source field");
  assert.match(pageSource, /详情状态/, "edit modal should expose the metadata approval state");
  assert.match(pageSource, /详情 \{book\.metadataStatus === 'auto_approved'/, "admin table should show whether a row already has accepted details");
});
