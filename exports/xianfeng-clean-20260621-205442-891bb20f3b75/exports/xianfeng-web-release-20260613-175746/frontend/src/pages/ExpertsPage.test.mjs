import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "ExpertsPage.tsx"), "utf8");
const avatarSource = readFileSync(resolve(__dirname, "../utils/guestAvatar.ts"), "utf8");

test("super-mode expert cards use dynamic guest agent questions", () => {
  assert.doesNotMatch(source, /AI分身是什么？/, "expert list must not render the old fixed AI topic");
  assert.match(source, /getGuestAgent/, "expert list should read detail chat suggestedQuestions");
  assert.match(source, /suggestedQuestions/, "expert list should render suggestedQuestions from the agent profile");
});

test("super-mode expert question CTA is only shown for agent-enabled guests", () => {
  assert.doesNotMatch(source, /const isPrimaryQuestionCard = superModePage && index === 0;/, "super-mode question CTA must not be tied to the first card");
  assert.doesNotMatch(source, /const showQuestionCard = superModePage && guest\.agentEnabled === true;/, "super-mode question CTA should not show on every enabled guest");
  assert.match(source, /const firstAgentGuestId = .*guests\.find\(\(guest\) => guest\.agentEnabled === true\)\?\._id/, "super-mode should compute the topmost agent-enabled guest");
  assert.match(source, /const showQuestionCard = superModePage && guest\.agentEnabled === true && guest\._id === firstAgentGuestId;/, "only the topmost agent-enabled guest should show the question CTA");
  assert.match(source, /guests\.find\(\(guest\) => guest\.agentEnabled === true\)/, "agent question fetch should target an enabled guest, not the first guest");
});

test("super-mode fallback avatars stay centered with a thinner frame", () => {
  assert.doesNotMatch(source, /experts-super-avatar[\s\S]*ring-4/, "super-mode avatar frame should be thinner than ring-4");
  assert.match(source, /resolveGuestAvatar/, "expert list should use the shared guest avatar resolver");
  assert.match(source, /GUEST_FALLBACK_AVATAR_CARD_IMG_CLASS/, "super-mode fallback avatar sizing should come from the shared fallback style");
  assert.match(source, /GUEST_FALLBACK_AVATAR_FRAME_CLASS/, "super-mode fallback frame should come from the shared fallback style");
  assert.match(source, /items-center justify-center[\s\S]*GUEST_FALLBACK_AVATAR_FRAME_CLASS/, "super-mode avatar frame should center fallback avatars like the detail page");
  assert.match(avatarSource, /GUEST_FALLBACK_AVATAR_FRAME_CLASS = "bg-white"/, "super-mode fallback avatar frame should have a white background");
  assert.match(source, /isFallbackAvatar \? "bg-white" : "bg-\[linear-gradient/, "archive-card fallback avatar area should have a white background");
  assert.match(avatarSource, /1780579648191-wkisaaid\.png/, "uploaded Xiaowanzi fallback avatars should stay in the fallback branch");
  assert.match(avatarSource, /GUEST_FALLBACK_AVATAR_CARD_IMG_CLASS = "h-\[86%\] w-\[86%\]/, "super-mode fallback avatar should be large enough to fill the frame");
  assert.doesNotMatch(source, /h-\[62%\] w-\[62%\]/, "fallback avatar should no longer be too small");
});

test("visible expert avatars load eagerly and fallback uses optimized asset", () => {
  assert.match(avatarSource, /GUEST_FALLBACK_AVATAR_SRC = "\/assets\/wel-avatar\/optimized\/no-hat\.webp"/, "fallback avatar should use the optimized lightweight asset");
  assert.match(source, /guests\.map\(\(guest,\s*index\) =>/, "expert cards need the map index to prioritize visible avatars");
  assert.match(source, /const avatarLoading(?::[^=]+)? = index < 6 \? "eager" : "lazy";/, "first visible expert avatars should not be lazy-loaded");
  assert.match(source, /const avatarFetchPriority(?::[^=]+)? = index < 6 \? "high" : "auto";/, "first visible expert avatars should request higher priority");
  assert.match(source, /loading=\{avatarLoading\}/, "expert avatar loading must use the priority helper");
  assert.match(source, /fetchPriority=\{avatarFetchPriority\}/, "expert avatar fetch priority must use the priority helper");
  assert.match(avatarSource, /XIANFENG_UPLOAD_HOST_RE/, "production upload URLs should be recognized");
  assert.match(avatarSource, /\/uploads\/images\/\$\{fileName\}\$\{suffix\}/, "local development should use the proxied upload path instead of remote production uploads");
});
