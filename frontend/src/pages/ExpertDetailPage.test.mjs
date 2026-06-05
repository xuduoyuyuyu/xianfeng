import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "ExpertDetailPage.tsx"), "utf8");
const avatarSource = readFileSync(resolve(__dirname, "../utils/guestAvatar.ts"), "utf8");

test("guest detail opens mobile info panel on participated programs tab", () => {
  assert.match(
    source,
    /useState<"programs" \| "publications">\("programs"\)/,
    "mobile guest detail should default to 参与节目 instead of 公开内容"
  );
});

test("guest detail only shows AI avatar when the manual guest switch is enabled", () => {
  assert.match(
    source,
    /const showGuestAgent = guest\?\.agentEnabled === true && isGuestAgentLayer/,
    "guest AI avatar must be gated by the explicit backend manual switch and embedded layer"
  );
});

test("guest detail keeps Xiaowanzi layer navigation for non-agent guests", () => {
  assert.match(
    source,
    /to=\{`\/programs\/\$\{encodeURIComponent\(routeId\)\}\$\{isGuestAgentLayer \? "\?xw_layer=1" : ""\}`\}/,
    "related program links should preserve xw_layer whenever the detail page is embedded, even when the guest agent is disabled"
  );
  assert.doesNotMatch(
    source,
    /to=\{`\/programs\/\$\{encodeURIComponent\(routeId\)\}\$\{showGuestAgent \? "\?xw_layer=1" : ""\}`\}/,
    "related program links must not depend on the AI agent panel being shown"
  );
});

test("super-mode profile tabs render compact list rows", () => {
  assert.match(source, /className="mt-2 space-y-0\.5"/, "tab lists should reduce vertical spacing between references");
  assert.match(source, /rounded-xl px-2 py-1 text-left/, "tab list rows should reduce vertical padding");
  assert.match(source, /w-6 shrink-0 text-left text-\[14px\] font-black/, "tab row numbers should be two text sizes larger");
  assert.match(source, /truncate text-\[14px\] font-black leading-\[18px\]/, "tab list titles should be two text sizes larger");
  assert.match(source, /text-\[16px\].*arrow_outward/, "tab row arrows should scale with the larger references");
});

test("guest detail fills real avatars and centers the Xiaowanzi fallback avatar", () => {
  assert.match(source, /resolveGuestAvatar/, "guest detail should use the shared guest avatar resolver");
  assert.match(source, /GUEST_FALLBACK_AVATAR_DETAIL_IMG_CLASS/, "detail fallback avatar sizing should come from the shared fallback style");
  assert.match(source, /GUEST_FALLBACK_AVATAR_FRAME_CLASS/, "detail fallback frame should come from the shared fallback style");
  assert.match(avatarSource, /GUEST_FALLBACK_AVATAR_FRAME_CLASS = "bg-white"/, "fallback avatar frame should have a white background");
  assert.match(avatarSource, /1780579648191-wkisaaid\.png/, "the uploaded Xiaowanzi fallback avatar should stay in the fallback rendering branch");
  assert.match(avatarSource, /GUEST_FALLBACK_AVATAR_DETAIL_IMG_CLASS = "h-\[86%\] w-\[86%\]/, "detail fallback avatar should be large enough to fill the frame");
  assert.doesNotMatch(source, /h-\[62%\] w-\[62%\]/, "fallback avatar should no longer be too small");
});

test("non-agent guest header matches agent avatar and title placement", () => {
  assert.match(source, /className="flex flex-col items-center gap-8 text-center md:flex-row-reverse md:justify-between md:text-left"/, "normal desktop guest header should place the avatar on the far right");
  assert.match(source, /className="mt-6 min-w-0 md:mt-0 md:flex-1"/, "normal desktop profile copy should fill the left side beside the right avatar");
  assert.match(source, /className="mt-5 flex items-center justify-center gap-3 md:justify-start"/, "normal desktop name row should align left beside the avatar");
  assert.match(source, /absolute -bottom-3 right-\[-19px\][\s\S]*<GuestWishButton guestId=\{guest\._id \|\| ""\}/, "wish button should sit at the avatar lower-right corner");
  assert.match(source, /<h1 className="text-4xl font-black tracking-tight text-\[#241a3a\]">[\s\S]*<p className="text-sm font-black text-\[#5e17eb\]">\{guest\.title \|\| "节目嘉宾"\}<\/p>/, "guest title should sit next to the guest name");
  assert.doesNotMatch(source, /<p className="mt-3 text-sm font-black uppercase tracking-\[0\.22em\] text-\[#5e17eb\]">\{guest\.title \|\| "节目嘉宾"\}<\/p>/, "guest title should not render as a separate line under the name");
});

test("guest agent mode collapses social media into the profile tabs area", () => {
  assert.match(source, /const mobileProfileExtra = showGuestAgent && \(hasRelatedProgramsSection \|\| hasPublicationSection \|\| hasSocialSection\)/, "agent mode compact tabs should include social links");
  assert.match(source, /\.\.\.socialProfiles\.map/, "agent mode should fold social links into the 公开内容 tab");
  assert.match(source, /hasSocialSection && !showGuestAgent/, "full social media section should be hidden while AI agent is open");
});

test("guest detail public content links preserve Xiaowanzi return affordance", () => {
  assert.match(source, /toXiaowanziPublicContentUrl/, "public content links should be wrapped by the Xiaowanzi public-content route");
  assert.match(
    source,
    /href=\{toXiaowanziPublicContentUrl\(item\.url,\s*item\.title,\s*isGuestAgentLayer\)\}/,
    "mobile public content links should route through the Xiaowanzi public-content page"
  );
  assert.match(
    source,
    /href=\{toXiaowanziPublicContentUrl\(item\.url,\s*item\.title,\s*isGuestAgentLayer\)\}/,
    "desktop public content links should route through the Xiaowanzi public-content page"
  );
});
