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
  assert.match(pageSource, /可选；手动创建图书时填写/, "purchase short link field should be presented as optional during manual creation");
  assert.match(pageSource, /#小程序:\/\/快团团\/点击查看\/pprMtoZCLfpeMFl/, "purchase jump link placeholder should show the tested short link shape");
  assert.match(pageSource, /setFormData\(\{ \.\.\.formData, wxPurchaseLink: e\.target\.value \}\)/, "purchase jump link input should update form data");
  assert.doesNotMatch(pageSource, /store\.mp\.video\.tencent-cloud\.com\/pages\/product\/detail/, "editor should not rely on the old generated H5 product link");
});

test("admin book editor uploads cover images before saving books", () => {
  assert.match(apiSource, /uploadAdminImage: \(imageFile: File\)/, "admin API should expose the shared image upload endpoint");
  assert.match(pageSource, /const \[coverUploading, setCoverUploading\] = useState\(false\);/, "book editor should track cover upload state separately from saving");
  assert.match(pageSource, /handleCoverImageUpload/, "book editor should handle cover uploads");
  assert.match(pageSource, /adminApi\.uploadAdminImage\(file\)/, "book cover uploads should use the shared admin image uploader");
  assert.match(pageSource, /coverImage: response\.data\.url/, "successful uploads should populate the editable coverImage field");
  assert.match(pageSource, /setMetadataFormData\(\(current\) => \(\{ \.\.\.current, cover: response\.data\.url \}\)\)/, "uploaded covers should also populate the public metadata cover");
  assert.match(pageSource, /封面配图/, "book editor should expose a cover image upload section");
  assert.match(pageSource, /上传封面/, "book editor should provide a cover upload control");
  assert.doesNotMatch(pageSource, /批量发布封面正确的书/, "admin book page should not expose the old batch publish control");
  assert.doesNotMatch(apiSource, /batchPublishBooks/, "frontend admin API should not keep the removed batch publish action");
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

test("admin book editor can manually add missing metadata details", () => {
  assert.match(apiSource, /upsertBookMetadata: \(bookId: string, data: Partial<AdminBookMetadata>\)/, "admin API should expose metadata creation by book id");
  assert.match(apiSource, /api\.put<AdminBookMetadata>\(`\/admin\/books\/\$\{bookId\}\/metadata`, data\)/, "metadata creation should call the book-scoped upsert route");
  assert.match(apiSource, /description\?: string;/, "admin book rows should carry the base book introduction");
  assert.match(pageSource, /description: detail\?\.description \|\| book\?\.description \|\| '',/, "manual books without metadata should prefill the editable introduction from base book data");
  assert.match(pageSource, /const metadataPayload = \{/, "book save should build one metadata payload for create and edit");
  assert.match(pageSource, /cover: metadataFormData\.cover\.trim\(\) \|\| formData\.coverImage\.trim\(\)/, "metadata creation should fall back to the uploaded base cover");
  assert.match(pageSource, /if \(metadataId\) \{[\s\S]*reviewBookMetadata\(metadataId, metadataPayload\)[\s\S]*\} else \{[\s\S]*upsertBookMetadata\(editingBook\._id, metadataPayload\)/, "books without detail rows should create metadata on save");
  assert.doesNotMatch(pageSource, /这本书暂无详情记录；当前弹窗只编辑基础图书字段。/, "missing metadata should no longer hide the detail form");
});
