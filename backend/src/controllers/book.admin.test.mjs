import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const controllerSource = readFileSync(resolve(__dirname, "book.ts"), "utf8");
const adminRouteSource = readFileSync(resolve(__dirname, "../routes/adminBook.ts"), "utf8");

test("admin book routes do not expose the removed batch publish action", () => {
  assert.doesNotMatch(adminRouteSource, /batch-publish/, "admin books should not expose a batch publish route");
  assert.doesNotMatch(adminRouteSource, /batchPublish/, "admin books should not reference a batch publish controller");
  assert.doesNotMatch(controllerSource, /async batchPublish/, "book controller should not keep the removed batch publish action");
  assert.doesNotMatch(controllerSource, /with_wx_cover/, "book controller should not keep the removed correct-cover publish filter");
});

test("admin book creation falls back to a placeholder cover when no cover is uploaded", () => {
  assert.match(
    controllerSource,
    /coverImage: pick\(raw, \["封面图片", "coverImage", "封面", "封面图", "图片", "cover"\]\) \|\| "https:\/\/via\.placeholder\.com\/240x320\/630ed4\/ffffff\?text=Book"/,
    "blank manual book covers should fall back before hitting the required Book.coverImage field"
  );
});

test("admin book normalization keeps imported list descriptions", () => {
  assert.match(
    controllerSource,
    /description: pick\(raw, \["简介", "图书简介", "内容简介", "description", "summary", "intro"\]\)/,
    "book imports and manual saves should preserve list descriptions instead of dropping them"
  );
});

test("admin metadata upsert keeps an uploaded base cover when detail cover is blank", () => {
  assert.match(
    controllerSource,
    /const metadataPayload = \{[\s\S]*\.\.\.\(req\.body \|\| \{\}\),[\s\S]*cover: String\(req\.body\?\.cover \|\| \(existing as any\)\.coverImage \|\| ""\)/,
    "metadata upsert should not replace an uploaded base cover with an empty detail cover"
  );
  assert.match(controllerSource, /upsertBookMetadataManually\(String\(existing\._id\), metadataPayload\)/);
});
