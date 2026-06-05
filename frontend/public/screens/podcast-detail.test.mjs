import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "podcast-detail.html"), "utf8");

test("podcast detail iframe uses the local optimized fallback guest avatar", () => {
  assert.match(source, /const FALLBACK_AVATAR = "\/assets\/wel-avatar\/optimized\/no-hat\.webp";/, "script fallback avatar should be local");
  assert.match(source, /function resolveGuestAvatar\(url\)/, "template should normalize missing and fallback avatar urls");
  assert.match(source, /function handleGuestAvatarError\(\)/, "broken guest avatar images should recover to the local fallback");
  assert.match(source, /src="\/assets\/wel-avatar\/optimized\/no-hat\.webp"/, "initial img src should not start with a remote fallback");
  assert.doesNotMatch(source, /FALLBACK_AVATAR = "http:\/\/xianfeng\.xinzhi\.info\/uploads\/images\/1779668991727-vzxkyx0x\.png"/, "remote fallback should not be used in the iframe script");
  assert.doesNotMatch(source, /onerror="this\.style\.opacity='0\.3'"/, "image errors should swap to a fallback instead of dimming a broken image");
});
