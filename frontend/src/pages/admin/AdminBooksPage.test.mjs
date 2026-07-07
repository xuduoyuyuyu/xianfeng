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

test("admin book editor exposes a manual purchase jump link", () => {
  assert.match(apiSource, /wxPurchaseLink\?: string;/, "Book rows should carry the purchase jump link");
  assert.match(pageSource, /wxPurchaseLink: '',/, "new book forms should initialize an empty purchase jump link");
  assert.match(pageSource, /wxPurchaseLink: book\.wxPurchaseLink \|\| '',/, "editing a book should hydrate the purchase jump link");
  assert.match(pageSource, /购买短链/, "wechat store editor should expose an optional purchase short link field");
  assert.match(pageSource, /可选；手动创建书单时填写/, "purchase short link field should be presented as optional during manual creation");
  assert.match(pageSource, /#小程序:\/\/快团团\/点击查看\/pprMtoZCLfpeMFl/, "purchase jump link placeholder should show the tested short link shape");
  assert.match(pageSource, /setFormData\(\{ \.\.\.formData, wxPurchaseLink: e\.target\.value \}\)/, "purchase jump link input should update form data");
  assert.doesNotMatch(pageSource, /store\.mp\.video\.tencent-cloud\.com\/pages\/product\/detail/, "editor should not rely on the old generated H5 product link");
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
