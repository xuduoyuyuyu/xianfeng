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
  assert.match(source, /break-words text-\[14px\] font-black leading-\[18px\]/, "tab list titles should be two text sizes larger and show the complete title");
  assert.match(source, /text-\[16px\].*arrow_outward/, "tab row arrows should scale with the larger references");
});

test("guest related-program cards show complete titles", () => {
  assert.match(
    source,
    /<div className="mt-1 break-words text-base font-black leading-snug text-\[#241a3a\]">\{program\.title \|\| "未命名节目"\}<\/div>/,
    "desktop related-program cards should wrap instead of truncating long titles"
  );
  assert.doesNotMatch(
    source,
    /truncate[^\n]*>\{program\.title \|\| "未命名节目"\}<\/div>/,
    "guest program titles should never be shortened with an ellipsis"
  );
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

test("non-agent guest header stacks and centers the title on mobile", () => {
  assert.match(source, /className="flex flex-col items-center gap-8 text-center md:flex-row-reverse md:justify-between md:text-left"/, "normal desktop guest header should place the avatar on the far right");
  assert.match(source, /className="mt-6 min-w-0 md:mt-0 md:flex-1"/, "normal desktop profile copy should fill the left side beside the right avatar");
  assert.match(source, /className="mt-5 flex flex-col items-center justify-center gap-1 md:flex-row md:justify-start md:gap-3"/, "mobile guest title should sit on a centered second line while desktop keeps its existing row layout");
  assert.match(source, /absolute -bottom-3 right-\[-19px\][\s\S]*<GuestWishButton guestId=\{guest\._id \|\| ""\}/, "wish button should sit at the avatar lower-right corner");
  assert.match(source, /<h1 className="text-4xl font-black tracking-tight text-\[#241a3a\]">[\s\S]*<p className="text-sm font-black text-\[#5e17eb\]">\{guest\.title \|\| "节目嘉宾"\}<\/p>/, "guest title should remain directly after the guest name in the stacked heading group");
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

test("guest detail authored books only link when metadata detail exists", () => {
  assert.match(
    source,
    /return book\.hasMetadataDetail \? \(\s*<Link[\s\S]*to=\{`\/reading\/\$\{book\._id\}`\}/,
    "authored books should link to reading detail only when detail metadata exists"
  );
  assert.match(
    source,
    /<div className="mt-1 text-\[10px\] font-black text-\[#7C3AED\]">查看详情<\/div>/,
    "authored books with detail metadata should show a small detail marker"
  );
  assert.doesNotMatch(
    source,
    /<Link key=\{book\._id\}[\s\S]*>[\s\S]*未命名书籍[\s\S]*<\/Link>\s*\);\s*\}\)\}/,
    "authored books should not become universally clickable"
  );
});

test("guest detail page uses native mini program chrome spacing when embedded", () => {
  assert.match(
    source,
    /html\.xf-mp-webview \.expert-detail-main \{[\s\S]*padding-top: var\(--xf-mp-nav-height, 88px\) !important;[\s\S]*padding-bottom: 0 !important;/,
    "mini program web-view should use the native topbar height and remove web bottom padding"
  );
  assert.match(
    source,
    /<main className=\{`expert-detail-main mx-auto max-w-7xl/,
    "guest detail main wrapper should expose the mini-program spacing hook"
  );
});

test("guest detail splits and deduplicates real booklists", () => {
  assert.match(source, /import \{ uniqueBookSourceNames \} from "\.\.\/utils\/bookSourceNames";/);
  assert.match(source, /const authoredSourceNames = new Set\(\s*uniqueBookSourceNames\(authoredBooks\.map/);
  assert.match(source, /return uniqueBookSourceNames\(guest\?\.bookLists \|\| \[\]\)/);
  assert.match(source, /\.filter\(\(sourceName\) => !authoredSourceNames\.has\(sourceName\)\)/);
  assert.match(source, /\{bookGroups\.length > 0 \? \(/);
});

test("each guest booklist card links to its exact source filter", () => {
  assert.match(source, /mobileBookGroups\.map\(\(sourceName, index\) =>/);
  assert.match(source, /sourceName=\$\{encodeURIComponent\(sourceName\)\}/);
  assert.match(source, /\{sourceName\}/);
});

test("mobile guest booklists show five by default and can expand or collapse", () => {
  assert.match(source, /const MOBILE_BOOKLIST_LIMIT = 5/);
  assert.match(source, /const \[bookListsExpanded, setBookListsExpanded\] = useState\(false\)/);
  assert.match(source, /setBookListsExpanded\(false\)/);
  assert.match(source, /bookGroups\.slice\(0, MOBILE_BOOKLIST_LIMIT\)/);
  assert.match(source, /展开其余 \{bookGroups\.length - MOBILE_BOOKLIST_LIMIT\} 条/);
  assert.match(source, /\{bookListsExpanded \? "收起"/);
  assert.match(source, /md:hidden/);
});

test("desktop guest booklists remain fully visible", () => {
  assert.match(source, /hidden space-y-3 md:block/);
  assert.match(source, /bookGroups\.map\(\(sourceName, index\) =>/);
});

test("guest detail consumes booklists from the detail API", () => {
  assert.match(source, /bookLists: Array\.isArray\(detail\?\.bookLists\)/);
  assert.match(source, /uniqueBookSourceNames\(guest\?\.bookLists \|\| \[\]\)/);
  assert.doesNotMatch(source, /const \[boundBooks, setBoundBooks\]/);
});

test("guest detail renders bound learning materials as extension materials", () => {
  assert.match(source, /const extensionMaterials = useMemo/);
  assert.match(source, /guest\?\.extensionMaterials/);
  assert.match(source, />拓展资料<\/h2>/);
  assert.match(source, /extensionMaterials\.map\(\(item/);
  assert.match(source, /href=\{item\.fileUrl\}/);
});
