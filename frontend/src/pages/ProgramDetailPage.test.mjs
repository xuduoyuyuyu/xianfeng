import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "ProgramDetailPage.tsx"), "utf8");

test("program detail keeps Xiaowanzi layer navigation and back button", () => {
  assert.match(source, /useXiaowanziEmbeddedLayer/, "program detail should detect Xiaowanzi embedded layer");
  assert.match(source, /withXiaowanziLayerParam/, "program detail should preserve xw_layer on internal links");
  assert.match(source, /aria-label="返回小玩子"/, "program detail should show a Xiaowanzi back button in layer mode");
  assert.match(source, /navigate\(-1\)/, "program detail back button should return to the previous page when possible");
  assert.match(source, /navigate\("\/programs\/list\?xw_restore=xiaowanzi"\)/, "program detail back button should fall back to Xiaowanzi home restore");
  assert.match(source, /to=\{withXiaowanziLayerParam\(`\/programs\/\$\{item\._id\}`,\s*superModePage\)\}/, "related program links should preserve xw_layer");
  assert.match(source, /to=\{withXiaowanziLayerParam\("\/programs\/list",\s*superModePage\)\}/, "program library link should preserve xw_layer");
});

test("program detail uses the shared guest avatar fallback instead of remote fallback images", () => {
  assert.match(source, /resolveGuestAvatar/, "program detail should resolve guest avatars through the shared helper");
  assert.match(source, /GUEST_FALLBACK_AVATAR_DETAIL_IMG_CLASS/, "fallback avatar should use the detail-page object-contain class");
  assert.match(source, /GUEST_FALLBACK_AVATAR_FRAME_CLASS/, "fallback avatar should use the shared fallback frame class");
  assert.match(source, /avatarFallbackActive/, "program detail should track image load failures");
  assert.match(source, /onError=\{\(\) => setAvatarFallbackActive\(true\)\}/, "broken avatar images should switch to the local fallback");
  assert.doesNotMatch(source, /const EXPERT_AVATAR\s*=/, "program detail should not keep a remote expert avatar fallback constant");
  assert.doesNotMatch(source, /1779668991727-vzxkyx0x\.png/, "remote fallback avatar marker should only live in the shared helper");
});

test("program detail deep dive keeps curated reading and related content adjacent", () => {
  assert.match(source, /<div className="p-8 pb-8">/, "deep dive content should use one padded body");
  assert.match(source, /<div className="mb-5">\s*<p className="mb-3 text-\[10px\] font-black uppercase tracking-widest text-gray-400">推荐阅读 Curated Reading<\/p>/, "curated reading should use compact spacing");
  assert.match(source, /<div className="mb-5 h-px w-full bg-gray-100"><\/div>\s*<div className="mb-6">\s*<p className="mb-3 text-\[10px\] font-black uppercase tracking-widest text-gray-400">相关内容推荐 Related Content<\/p>/, "related content should follow the divider without a large blank band");
  assert.doesNotMatch(source, /<div className="mb-10">\s*<p className="mb-4 text-\[10px\] font-black uppercase tracking-widest text-gray-400">推荐阅读 Curated Reading<\/p>/, "curated reading should not keep the old tall bottom spacing");
});
