import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "XiaowanziWidget.tsx"), "utf8");
const logicSource = readFileSync(resolve(__dirname, "XiaowanziWidget.logic.ts"), "utf8");

test("home mode creates recoverable sessions and uses dynamic topic prompts", () => {
  assert.match(source, /XIAOWANZI_SESSION_INDEX_KEY\s*=/, "session index key is required");
  assert.match(source, /XIAOWANZI_ACTIVE_SESSION_KEY\s*=/, "home mode needs an active session key for refresh restore");
  assert.match(source, /loadTopicPromptItems/, "home prompts must load from topic content");
  assert.match(source, /normalizeHomePromptItem/, "home prompts should be normalized before display");
  assert.match(source, /loadInitialConversationState/, "opening home mode should restore the active session instead of always creating a blank one");
  assert.match(source, /restoreConversationSession/, "history cards must restore saved sessions");
  assert.match(source, /openManualNewConversation/, "home mode needs a manual new conversation action");
});

test("refresh restores the active home conversation instead of opening a new blank session", () => {
  assert.match(
    source,
    /function loadInitialConversationState\(\)[\s\S]*readActiveConversationSessionId\(\)[\s\S]*loadConversationSessionMessages\(activeSessionId\)[\s\S]*messages: activeMessages[\s\S]*hasHistoryMessages: true/,
    "refresh should hydrate messages from the active session id"
  );
  assert.match(
    source,
    /const \[initialConversationState\] = useState\(\(\) => loadInitialConversationState\(\)\);[\s\S]*useState\(\(\) => initialConversationState\.sessionId\)[\s\S]*useState<Msg\[\]>\(\(\) => initialConversationState\.messages\)[\s\S]*useState\(\(\) => initialConversationState\.hasHistoryMessages\)/,
    "session id, messages, and history state should share the same restored initial state"
  );
  assert.match(
    source,
    /function persistConversation\(items: Msg\[\], sessionId = currentSessionId\)[\s\S]*saveActiveConversationSessionId\(sessionId\)[\s\S]*saveConversationSessionMessages\(sessionId, sanitized\)/,
    "saving a conversation should remember it as the active session"
  );
  assert.match(
    source,
    /function startNewConversationSession\(\)[\s\S]*saveActiveConversationSessionId\(nextSessionId\)[\s\S]*setMessages\(\[DEFAULT_MESSAGE\]\)/,
    "manual or expired new sessions should become the active session without restoring the previous one on refresh"
  );
});

test("home prompt suggestions are specific and not program-limited", () => {
  const fallbackMatch = source.match(/const HOME_FALLBACK_PROMPT_GROUPS:[\s\S]*?\n\];/);
  assert.ok(fallbackMatch, "fallback prompts block should exist");
  assert.doesNotMatch(fallbackMatch[0], /节目|这期|先听|哪一段/, "fallback prompts must not mention program-listening context");
  assert.match(source, /HOME_PROMPT_BLOCKED_TERMS/, "dynamic prompts need blocked terms");
  assert.match(source, /HOME_PROMPT_BLOCKED_TERMS\.some/, "dynamic prompts should filter blocked terms");
});

test("home fallback question suggestions rotate on each page refresh", () => {
  assert.match(source, /const HOME_FALLBACK_PROMPT_GROUPS: TopicPromptItem\[\]\[\]/, "fallback prompts should be organized as multiple rotatable groups");
  assert.match(source, /function pickRandomHomeFallbackPrompts\(\): TopicPromptItem\[\]/, "home needs a helper that chooses one fallback group per load");
  assert.match(source, /HOME_FALLBACK_PROMPT_ROTATION_KEY/, "fallback rotation should remember the previous group");
  assert.match(
    source,
    /\.filter\(\(index\) => fallbackGroups\.length <= 1 \|\| index !== lastIndex\)/,
    "fallback rotation should avoid showing the same group on consecutive refreshes"
  );
  assert.match(
    source,
    /const \[homeFallbackPrompts\] = useState<TopicPromptItem\[\]>\(\(\) => pickRandomHomeFallbackPrompts\(\)\)/,
    "the selected fallback group should be initialized on mount so browser refresh can change it"
  );
  assert.match(
    source,
    /const effectiveHomePrompts = homePromptItems\.length \? homePromptItems : homeFallbackPrompts;/,
    "empty dynamic prompts should render the selected refresh-specific fallback group"
  );
});

test("assistant message links a repeated keyword only once in the same reply", () => {
  assert.match(
    source,
    /function renderTextWithMentionLinks\([\s\S]*?usedLinkKeys: Set<string>/,
    "inline mention rendering should receive a per-message linked-key tracker"
  );
  assert.match(
    source,
    /const linkKey = normalizeMessageLinkKey\(matched\.title\);[\s\S]*usedLinkKeys\.add\(linkKey\)/,
    "the first linked occurrence should mark the keyword as used"
  );
  assert.match(
    source,
    /const linkedMentionKeys = new Set<string>\(\);[\s\S]*renderInlineMarkdown\(line\.trim\(\), mentionLinks, onMentionLinkClick, linkedMentionKeys\)/,
    "one linked-key tracker should be shared across all lines in a single assistant message"
  );
});

test("home history drawer owns the new conversation and exit actions", () => {
  assert.match(source, /xw-home-history-drawer/, "home history should render in a left-side drawer");
  assert.match(source, /setHomeHistoryDrawerOpen\(true\)/, "history action should open the left drawer");
  assert.match(source, /aria-label="历史记录"[\s\S]*onClick=\{\(\) => void openHomeHistoryMenu\(\)\}/, "top-left menu button should open the left history drawer directly");
  assert.match(source, /aria-label="更多"[\s\S]*document\.dispatchEvent\(new CustomEvent\("xf-open-public-menu"\)\)/, "top-right more button should open the original public hamburger menu");
  assert.match(source, /className="xw-home-history-new"/, "history drawer should expose the new conversation action");
  assert.match(source, /\.xw-home-history-drawer-head\{[^}]*justify-content:center/s, "new conversation should be centered in the drawer header");
  assert.match(source, /\.xw-home-history-exit\{[^}]*width:44px[^}]*height:44px[^}]*border:0[^}]*border-radius:50%[^}]*background:#601BEC[^}]*box-shadow:0 14px 30px rgba\(96,27,236,\.28\)[^}]*color:#fff/s, "drawer exit should float as a purple circular button with a white icon");
  assert.match(source, /className="xw-home-history-exit xw-home-history-exit-dock"/, "super-mode exit should dock inside the history drawer");
  assert.match(source, /\.xw-home-history-exit-dock\{[^}]*position:absolute[^}]*right:18px[^}]*bottom:calc\(22px \+ env\(safe-area-inset-bottom\)\)/s, "super-mode exit should sit at the drawer bottom-right");
  assert.match(source, /\.xw-home-history-list\{[^}]*padding-bottom:62px/s, "history list should leave room for the drawer-bottom exit button");
  assert.doesNotMatch(source, /\.xw-home-history-drawer::after/, "history drawer should not render a bottom color block behind the floating exit button");
  assert.match(source, /\.xw-home-history-exit-dock\{[^}]*z-index:3/s, "super-mode exit should float above the drawer content");
  const drawerHeadMatch = source.match(/<div className="xw-home-history-drawer-head">[\s\S]*?<\/div>/);
  assert.ok(drawerHeadMatch, "history drawer header should exist");
  assert.doesNotMatch(drawerHeadMatch[0], /xw-home-history-exit/, "super-mode exit should not sit beside new conversation in the drawer header");
  assert.doesNotMatch(source, /\.xw-home-history-exit\{[^}]*transform:scaleX\(-1\)/s, "exit icon should use its normal direction");
  assert.doesNotMatch(source, /xw-home-history-drawer-close/, "history drawer should not keep a top-left back button");
  assert.match(source, /loadConversationSessionMessages\(session\.id\)\.length > 0/, "empty guide-only sessions should not render history cards");
  assert.doesNotMatch(source, /xw-home-more-history/, "history list must not stay inside the small more menu");
  assert.doesNotMatch(source, /xw-home-more-panel/, "top-right more button should not show an intermediate menu");
  assert.doesNotMatch(source, /xw-home-more-item/, "top-right more button should not require choosing a history item");
  assert.doesNotMatch(source, /className="xw-home-more-item" type="button" onClick=\{openManualNewConversation\}/, "new conversation should not stay in the top-right more menu");
  assert.doesNotMatch(source, /className="xw-home-more-item" type="button" onClick=\{closePanel\}/, "super-mode exit should not stay in the top-right more menu");
  assert.doesNotMatch(source, /setHomeMoreView\("history"\)/, "more menu should not switch into an embedded history view");
  assert.doesNotMatch(source, /xw-home-history-entry/, "history entry must not sit in the prompt card");
  assert.doesNotMatch(source, /className="aip-history-panel home"/, "home history must not use the floating history popover");
  assert.match(
    source,
    /\.xw-home-history-mask\{[^}]*animation:xwHistoryMaskIn \.2s cubic-bezier\(\.2,\.9,\.22,1\) both/s,
    "left history mask should use the shared sidebar timing"
  );
  assert.match(
    source,
    /\.xw-home-history-drawer\{[^}]*animation:xwHistoryDrawerIn \.2s cubic-bezier\(\.2,\.9,\.22,1\) both/s,
    "left history drawer should use the shared sidebar timing"
  );
  assert.match(
    source,
    /@keyframes xwHistoryDrawerIn\{from\{opacity:\.72;transform:translateX\(-100%\)\}to\{opacity:1;transform:none\}\}/,
    "left history drawer should slide from fully off-canvas"
  );
  const openHomeHistoryMenuMatch = source.match(/async function openHomeHistoryMenu\(\) \{[\s\S]*?\n  \}/);
  assert.ok(openHomeHistoryMenuMatch, "home history opener should exist");
  assert.doesNotMatch(openHomeHistoryMenuMatch[0], /shouldBlockXiaowanziForAuth\(\)/, "left history drawer should open local history without redirecting into auth gating");
});

test("restoring a home history session shows only saved messages", () => {
  assert.match(source, /setMessages\(cached\)/, "restored history should use the saved messages directly");
  assert.match(source, /text\.includes\("已在超能模式中打开"\)/, "super-mode page guide messages should be treated as read receipts");
  assert.match(
    source,
    /loadConversationSessionMessages[\s\S]*item\.content !== DEFAULT_MESSAGE\.content/,
    "loading saved sessions should drop the default Xiaowanzi guide message"
  );
  assert.doesNotMatch(
    source,
    /restoreConversationSession[\s\S]*setMessages\(\[DEFAULT_MESSAGE,\s*\.\.\.cached\]\)/,
    "restored history must not prepend the Xiaowanzi guide message"
  );
  assert.match(source, /setHomeViewingHistory\(true\)/, "opening a history session should switch to pure history view");
  assert.match(
    source,
    /homeViewingHistory \? \([\s\S]*xw-home-history-chat[\s\S]*\) : \(/,
    "pure history view should replace the hero and suggested prompt card"
  );
});

test("assistant history replies preserve readable paragraph and list formatting", () => {
  assert.match(logicSource, /function normalizeAssistantLayoutText\(content: string\): string/, "assistant replies should normalize inline list markers before rendering");
  assert.ok(
    logicSource.includes("\\\\d{1,2}\\\\."),
    "normalization should recognize numbered list markers even when the model returns them inline"
  );
  assert.ok(
    logicSource.includes("第[一二三四五六七八九十\\\\d]{1,3}步"),
    "normalization should also recognize old history replies that use Chinese step labels such as 第一步："
  );
  assert.match(
    logicSource,
    /KEYCAP_LIST_MARKER_PATTERN/,
    "normalization should also recognize old history replies that use keycap list markers such as 1️⃣"
  );
  assert.match(
    logicSource,
    /ASSISTANT_PUNCT_LIST_MARKER_RE/,
    "normalization should split list markers that directly follow punctuation, such as 。2. without a space"
  );
  assert.match(source, /function renderAssistantMessageContent\(/, "assistant replies should use a dedicated formatted renderer");
  assert.match(source, /className="xw-msg-flow"/, "formatted assistant replies need a stable wrapper class");
  assert.match(source, /className=\{`xw-msg-line \$\{isNumberedMessageLine\(line\) \? "numbered" : ""\}`\.trim\(\)\}/, "numbered lines should get a readable block style");
  assert.match(source, /\.xw-msg-block \+ \.xw-msg-block\{[^}]*margin-top:14px/s, "assistant answer paragraphs should use markdown block spacing");
  assert.match(source, /\.xw-home-msg\{[^}]*font-weight:520[^}]*line-height:1\.86/s, "home assistant replies should use lighter text and looser line height");
  assert.match(source, /\.xw-home-msg\.ai\{[^}]*max-width:calc\(86% \+ 10px\)[^}]*padding:9px 9px/s, "home assistant reply cards should be 10px wider with half-size inner padding");
  assert.match(source, /\.aip-msg\.ai\{[^}]*max-width:calc\(86% \+ 10px\)/s, "floating assistant reply cards should match the 10px wider reply width");
  assert.match(source, /\.xw-msg-line\.numbered\{[^}]*margin-top:0/s, "numbered answer lines should rely on paragraph spacing, not extra per-line decoration");
  assert.doesNotMatch(
    source,
    /\.xw-msg-line\.numbered\{[^}]*border-left/s,
    "numbered answer steps should rely on text spacing, not extra vertical line decoration"
  );
  assert.match(
    source,
    /return message\.role === "assistant" \? renderAssistantMessageContent\(message\.content, mentionLinks, onMentionLinkClick\) : message\.content;/,
    "all assistant messages, including restored history, should use the formatted renderer"
  );
  assert.match(source, /const MESSAGE_LAYOUT_VERSION = "md-paragraph-v\d+"/, "message rendering needs a layout version to remount saved history after typography changes");
  assert.match(source, /key=\{`history-\$\{MESSAGE_LAYOUT_VERSION\}-\$\{idx\}-\$\{message\.ts \|\| ""\}`\}/, "restored history rows should remount when the markdown layout version changes");
  assert.match(source, /key=\{`home-\$\{MESSAGE_LAYOUT_VERSION\}-\$\{idx\}-\$\{message\.ts \|\| ""\}`\}/, "generated home history rows should remount when the markdown layout version changes");
  assert.match(
    source,
    /function rerenderMessagesForLayoutVersion\(\)[\s\S]*setMessages\(\(items\) => items\.map\(\(item\) => \(\{ \.\.\.item \}\)\)\)/,
    "layout refresh should shallow-copy messages for rendering without changing message content"
  );
  assert.match(
    source,
    /restoreConversationSession[\s\S]*setMessages\(cached\.map\(\(item\) => \(\{ \.\.\.item \}\)\)\)/,
    "restoring saved sessions should re-render cached messages without rewriting their content"
  );
});

test("manual new conversation saves current session before opening a blank one", () => {
  assert.match(
    source,
    /function openManualNewConversation\(\)[\s\S]*persistConversation\(messages\)[\s\S]*startNewConversationSession\(\)/,
    "new conversation should save the current history before opening a new session"
  );
});

test("home top Xiaowanzi avatar quickly starts a new conversation", () => {
  assert.match(
    source,
    /<button className="xw-home-brand-button" type="button" aria-label="新对话" onClick=\{openManualNewConversation\}>[\s\S]*<img key=\{displayAvatar\} className="xw-home-brand-avatar"/,
    "top Xiaowanzi avatar should be a direct new-conversation button"
  );
  assert.match(
    source,
    /\.xw-home-brand-button\{[^}]*border:0[^}]*background:transparent[^}]*cursor:pointer/s,
    "avatar new-conversation button should keep the original visual treatment"
  );
});

test("mini program Xiaowanzi hides web top actions without reserving a native nav row", () => {
  assert.doesNotMatch(
    source,
    /xw-mp-home-top/,
    "mini program super mode should not render duplicate top actions inside the web-view"
  );
  assert.match(
    source,
    /html\.xf-mp-webview \.xw-home-more-wrap\{display:none!important\}/,
    "mini program super mode should still let the native WeChat capsule own the right overflow area"
  );
  assert.match(
    source,
    /html\.xf-mp-webview \.xw-home-top\{display:none!important\}/,
    "mini program super mode should hide the web top actions"
  );
  assert.doesNotMatch(
    source,
    /html\.xf-mp-webview \.xw-home-scroll\{padding-top:calc\(var\(--xf-native-topbar-height,88px\) \+ 16px\)!important\}/,
    "mini program super mode must not reserve a white native navigation row above the content"
  );
  assert.match(
    source,
    /html\.xf-mp-webview \.xw-home\{background:#f2f1ff!important;padding-top:var\(--xf-native-webview-shift,0px\)!important;overflow:visible!important;transform:none!important;-webkit-transform:none!important;animation:none!important;will-change:auto!important\}/,
    "mini program super mode should not reserve a second web-rendered navigation row"
  );
  assert.match(
    source,
    /document\.documentElement\.style\.setProperty\(cssVar, `\$\{Math\.round\(value\)\}px`\);/,
    "mini program native capsule URL metrics should be applied as CSS variables"
  );
  assert.match(
    source,
    /const renderHomeTop = \(\) => \([\s\S]*<div className="xw-home-top">[\s\S]*className="xw-home-menu"[\s\S]*className="xw-home-agent-entry"/,
    "browser Xiaowanzi super mode should keep its own menu, avatar, and knowledge entry"
  );
  assert.match(
    source,
    /\{renderHomeTop\(\)\}/,
    "browser top actions should stay behind renderHomeTop while mini-program CSS hides the row"
  );
  assert.doesNotMatch(
    source,
    /className="xw-home-hard-exit"/,
    "mini program super mode should not render a page-level exit button"
  );
  assert.doesNotMatch(
    source,
    /\.xw-home-hard-exit\{/,
    "mini program super mode should keep exit styling scoped to the history drawer"
  );
});

test("mini program Xiaowanzi add-child opens native archive create panel", () => {
  assert.match(
    source,
    /import \{[^}]*forceExitMiniProgramXiaowanzi[^}]*isMiniProgramWebView[^}]*openMiniProgramNativeArchiveCreate[^}]*openMiniProgramNativeArchivePicker[^}]*\} from "\.\.\/\.\.\/utils\/mpAuthBridge";/,
    "Xiaowanzi needs the native archive bridge"
  );
  assert.match(
    source,
    /function openSidebarChildCreate\(\) \{[\s\S]*if \(isMiniProgramWebView\(\)\) \{[\s\S]*void openMiniProgramNativeArchiveCreate\(\);[\s\S]*return;[\s\S]*if \(shouldBlockXiaowanziForAuth\(\)\) return;[\s\S]*document\.dispatchEvent\(new CustomEvent\("xf-open-child-profile-create"\)\);[\s\S]*\}/,
    "mini-program add child should use native archive while web keeps the web event"
  );
  const createFunction = source.match(/function openSidebarChildCreate\(\) \{[\s\S]*?\n  \}/);
  assert.ok(createFunction, "mini-program add-child function should exist");
  const miniProgramBranch = createFunction[0].match(/if \(isMiniProgramWebView\(\)\) \{[\s\S]*?return;\n    \}/);
  assert.ok(miniProgramBranch, "mini-program add-child branch should exist");
  assert.doesNotMatch(
    miniProgramBranch[0],
    /xf-open-child-profile-create/,
    "mini-program add child must not fall back to the web archive event"
  );
  assert.doesNotMatch(
    miniProgramBranch[0],
    /shouldBlockXiaowanziForAuth/,
    "mini-program add child must not be blocked by the web auth gate before opening native archive"
  );
});

test("mini program Xiaowanzi child switch opens native archive picker without refreshing", () => {
  assert.match(
    source,
    /openMiniProgramNativeArchivePicker/,
    "mini-program child switch should call the native archive picker"
  );
  assert.match(
    source,
    /function openHiddenEntry\(\) \{[\s\S]*if \(isMiniProgramWebView\(\)\) \{[\s\S]*void openMiniProgramNativeArchivePicker\(\);[\s\S]*return;[\s\S]*if \(shouldBlockXiaowanziForAuth\(\)\) return;[\s\S]*setHiddenEntryOpen\(true\);[\s\S]*\}/,
    "mini-program child switch should use the native archive picker before web auth gating"
  );
  const switchFunction = source.match(/function openHiddenEntry\(\) \{[\s\S]*?\n  \}/);
  assert.ok(switchFunction, "mini-program child switch function should exist");
  const miniProgramBranch = switchFunction[0].match(/if \(isMiniProgramWebView\(\)\) \{[\s\S]*?return;\n    \}/);
  assert.ok(miniProgramBranch, "mini-program child switch branch should exist");
  assert.doesNotMatch(
    miniProgramBranch[0],
    /shouldBlockXiaowanziForAuth/,
    "mini-program child switch must not be blocked by the web auth gate before opening the picker"
  );
  assert.doesNotMatch(
    miniProgramBranch[0],
    /setOpen\(true\)|setHomeActive\(true\)|setHiddenEntryOpen\(true\)|loadChildProfiles\(\)/,
    "mini-program child switch must not open the web child picker"
  );
});

test("Xiaowanzi child profile list dedupes repeated child names", () => {
  assert.match(source, /function dedupeChildProfilesByDisplayName\(items: ChildProfileLite\[\]\): ChildProfileLite\[\]/);
  assert.match(
    source,
    /const profiles = dedupeChildProfilesByDisplayName\([\s\S]*parsed[\s\S]*normalizeChildProfileLite[\s\S]*isDeletedChildProfile[\s\S]*\);/,
    "mini-program bridged child profiles should be deduped before rendering"
  );
  assert.match(
    source,
    /return dedupeChildProfilesByDisplayName\([\s\S]*parsed[\s\S]*normalizeChildProfileLite[\s\S]*isDeletedChildProfile[\s\S]*\);/,
    "stored web child profiles should be deduped before rendering"
  );
  assert.match(
    source,
    /localStorage\.setItem\(CHILD_PROFILES_KEY, JSON\.stringify\(dedupeChildProfilesByDisplayName\(items\)\)\)/,
    "saving child profiles should not persist duplicate names"
  );
});

test("xiaowanzi send buttons do not render Pro corner badges", () => {
  assert.doesNotMatch(source, /xw-pro-badge/, "Xiaowanzi surfaces should not show Pro corner badges");
});

test("xiaowanzi successful replies notify subscription balance refresh", () => {
  assert.match(
    source,
    /new CustomEvent\("xf-billing-balance-changed", \{ detail: \{ featureKey: "xiaowanzi" \} \}\)/,
    "successful Xiaowanzi messages should ask billing surfaces to refresh the balance"
  );
});

test("xiaowanzi assistant replies turn mentioned site programs and materials into layer links", () => {
  assert.match(source, /buildXiaowanziMentionLinks/, "widget should build a site mention link index");
  assert.match(source, /buildXiaowanziInlineLinks/, "widget should render direct links for known site content");
  assert.match(source, /loadXiaowanziMentionLinks/, "widget should load public site titles for linking");
  assert.match(source, /fetch\("\/api\/topic-hub\?limit=200"\)/, "widget should load topic titles so mentioned topics open directly");
  assert.match(source, /xw-msg-link/, "assistant message links need a stable class for styling and inspection");
  assert.match(
    source,
    /renderDisplayMessage\(message,\s*xiaowanziMentionLinks,\s*openXiaowanziMentionLink\)/,
    "message rendering should receive the mention link index and layer opener"
  );
});

test("xiaowanzi mention link prefetch waits until after first paint idle time", () => {
  assert.match(source, /function scheduleXiaowanziContentWarmup\(task: \(\) => void\): \(\) => void/);
  assert.match(source, /requestAnimationFrame\(\(\) => \{/);
  assert.match(source, /requestIdleCallback\?\.\(task, \{ timeout: 2500 \}\)/);
  assert.match(
    source,
    /useEffect\(\(\) => \{[\s\S]*scheduleXiaowanziContentWarmup\(\(\) => \{[\s\S]*loadXiaowanziMentionLinks\(\)[\s\S]*setXiaowanziMentionLinks\(links\)[\s\S]*cancelWarmup\(\);/s,
    "heavy site-index prefetch should not run synchronously during Xiaowanzi first paint"
  );
});

test("xiaowanzi user question bubbles use the requested purple card color", () => {
  assert.match(source, /\.xw-home-msg\.user\{[^}]*background:#601BEC/s, "home user question card should use #601BEC");
  assert.match(source, /\.aip-msg\.user\{[^}]*background:#601BEC/s, "floating user question card should use #601BEC");
  assert.match(source, /#ai-panel\.docked\.docked-dark \.aip-msg\.user\{background:#601BEC;color:#fff\}/, "docked dark user question card should stay the same requested color");
});

test("xiaowanzi clears stale auth before showing login after unauthorized API responses", () => {
  assert.match(
    source,
    /function handleExpiredXiaowanziSession\(\)[\s\S]*localStorage\.removeItem\("token"\)[\s\S]*localStorage\.removeItem\("user"\)[\s\S]*localStorage\.removeItem\("wel_tok"\)[\s\S]*showXiaowanziSuperModeLoginModal\(\)/,
    "expired Xiaowanzi requests must clear stale tokens before prompting login"
  );
  assert.match(
    source,
    /if \(res\.status === 401\) \{[\s\S]*handleExpiredXiaowanziSession\(\)/,
    "unauthorized Xiaowanzi sends should use the expired-session handler"
  );
});

test("xiaowanzi non-ok send responses clear the thinking placeholder", () => {
  assert.match(
    source,
    /if \(res\.status === 402 \|\| isProRequiredPayload\(err\)\) \{[\s\S]*item\.ts !== userMessage\.ts && item\.ts !== thinkingTs[\s\S]*return;/,
    "Pro-required responses should remove the optimistic user message and thinking placeholder"
  );
  assert.match(
    source,
    /if \(res\.status === 401\) \{[\s\S]*item\.ts !== userMessage\.ts && item\.ts !== thinkingTs[\s\S]*handleExpiredXiaowanziSession\(\)/,
    "expired-session responses should not leave the thinking placeholder behind"
  );
  assert.match(
    source,
    /const msg = String\(err\?\.content \|\| err\?\.detail \|\| err\?\.message \|\| "请求失败"\);[\s\S]*prev\.filter\(\(item\) => item\.ts !== thinkingTs\)[\s\S]*content: msg/,
    "generic non-ok responses should replace thinking with the returned failure message"
  );
});

test("child profile prompt includes exact age instead of leaving birth year for model inference", () => {
  assert.match(logicSource, /buildChildProfileSummary/, "child profile summary should be centralized in logic helpers");
  assert.match(logicSource, /准确年龄/, "prompt summary should include a computed exact age");
  assert.match(logicSource, /请以该准确年龄为准/, "prompt must tell Xiaowanzi not to guess the child's age");
  assert.match(source, /buildChildProfileSummary\(activeChild/, "message sending should use the exact-age child profile summary");
  assert.doesNotMatch(source, /`出生日期:\$\{activeChild\.birthDate\}`,[\s\S]*`年级:\$\{activeChild\.grade\}`/, "message sending must not leave age inference to the model");
});

test("home greeting has a progressive text reveal animation", () => {
  assert.match(source, /@keyframes xwHomeTitleReveal/, "home title reveal keyframes are required");
  assert.match(source, /\.xw-home-greet strong\{[^}]*xwHomeTitleReveal/s, "main greeting title should use the reveal animation");
  assert.match(source, /\.xw-home-greet strong\{[^}]*display:block/s, "main greeting title must sit on the line below hello");
  assert.match(source, /xw-home-hello-star\{[^}]*xwHomeStarPop/s, "hello star should have its own pop animation");
});

test("home agent entry uses the fixed xianfeng round logo image", () => {
  assert.match(
    source,
    /<img className="xw-home-agent-entry-icon" src="\/assets\/xianfeng-round-logo\.webp"/,
    "agent entry must use the fixed round Xianfeng logo image"
  );
  assert.doesNotMatch(
    source,
    /<span className="xw-home-agent-entry-icon"[^>]*>\s*先疯\s*<\/span>/,
    "agent entry must not fall back to a text badge"
  );
});

test("home top chrome uses tighter symmetric side gutters", () => {
  assert.match(
    source,
    /\.xw-home-top\{[^}]*padding:env\(safe-area-inset-top\) 12px 0/s,
    "home top bar should move both left and right controls outward with equal side gutters"
  );
  assert.doesNotMatch(
    source,
    /\.xw-mp-home-top/,
    "mini-program home mode should leave the visible top row to native cover-view chrome"
  );
  assert.doesNotMatch(
    source,
    /html\.xf-mp-webview \.xw-home-scroll\{padding-top:calc\(var\(--xf-native-topbar-height,88px\) \+ 16px\)!important\}/,
    "mini-program home content should not sit below a separate native top navigation"
  );
});

test("home mode icon ligatures use the local Material Symbols font", () => {
  assert.match(
    source,
    /\.xw-home \.ms,\s*\.xw-home-menu,\s*\.xw-home-icon,[\s\S]*\.xw-home-send,[\s\S]*\.xw-home-plus,[\s\S]*\.xw-home-attach-action \.ms\{[\s\S]*font-family:'Material Symbols Rounded'!important[\s\S]*font-feature-settings:'liga' 1[\s\S]*font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24/s,
    "home mode icon text such as menu/send/close/photo_camera must render as local Material Symbols ligatures"
  );
});

test("home avatars use optimized eager image assets", () => {
  assert.match(source, /const AVATAR_FALLBACK_SRC = "\/assets\/wel-avatar\/optimized\/no-hat\.webp";/, "Xiaowanzi fallback should use the optimized lightweight avatar");
  const avatarListMatch = logicSource.match(/export const XIAOWANZI_AVATARS = \[[\s\S]*?\] as const;/);
  assert.ok(avatarListMatch, "Xiaowanzi selectable avatar list should exist");
  assert.doesNotMatch(avatarListMatch[0], /\/assets\/wel-avatar\/(?!optimized\/)[^"]+\.(png|jpg|jpeg)/i, "local selectable avatars should use optimized webp assets");
  assert.match(avatarListMatch[0], /\/assets\/wel-avatar\/optimized\/no-hat\.webp/, "default avatar should be the optimized no-hat asset");
  assert.match(
    source,
    /<img key=\{displayAvatar\} className="xw-home-brand-avatar" src=\{displayAvatar\}[^>]*loading="eager"[^>]*decoding="async"/,
    "top Xiaowanzi avatar should stay eager-decoded"
  );
  assert.match(
    source,
    /<img className="xw-home-avatar" src="\/assets\/wel-avatar\/optimized\/no-hat\.webp"[^>]*loading="eager"[^>]*decoding="async"/,
    "large Xiaowanzi hero avatar should use the optimized eager asset"
  );
  assert.match(
    source,
    /<img className="xw-home-agent-entry-icon" src="\/assets\/xianfeng-round-logo\.webp"[^>]*loading="eager"[^>]*decoding="async"/,
    "agent entry logo should use the optimized asset"
  );
});

test("home expanded prompt typography stays compact on mobile", () => {
  assert.match(source, /\.xw-home-greet\{[^}]*font-size:24px/s, "home greeting should not use the older oversized 28px base");
  assert.match(source, /\.xw-home-greet strong\{[^}]*font-size:27px/s, "home title line should stay compact");
  assert.match(source, /\.xw-home-card-title\{[^}]*font-size:21px/s, "prompt card title should stay compact");
  assert.match(source, /\.xw-home-question\{[^}]*font-size:16px/s, "prompt question rows should stay compact");
});

test("xiaowanzi streaming replies can be interrupted directly", () => {
  assert.match(source, /abortControllerRef = useRef<AbortController \| null>\(null\)/, "streaming request should keep an abort controller");
  assert.match(source, /function stopXiaowanziResponse\(\)/, "composer needs an explicit stop action");
  assert.match(source, /abortControllerRef\.current\?\.abort\(\)/, "stop action must abort the active stream");
  assert.match(source, /signal: controller\.signal/, "message fetch should receive the abort signal");
  assert.match(source, /error\?\.name === "AbortError"/, "aborted streams should not be shown as request failures");
  assert.match(source, /className="xw-home-send"[\s\S]*onClick=\{\(\) => sending \? stopXiaowanziResponse\(\) : void sendMessage\(\)\}/, "home send button should become a stop button while streaming");
  assert.match(source, /className="aip-send"[\s\S]*onClick=\{\(\) => sending \? stopXiaowanziResponse\(\) : void sendMessage\(\)\}/, "floating send button should become a stop button while streaming");
  assert.doesNotMatch(source, /disabled=\{sending \|\| \(!input\.trim\(\) && !uploadedImage\)\}/, "home composer must not disable the stop action while streaming");
});

test("floating composer plus opens the attachment actions", () => {
  assert.match(source, /const panelInputbarRef = useRef<HTMLDivElement \| null>\(null\)/, "floating composer should have its own click boundary");
  assert.match(source, /const panelAttachMenuRef = useRef<HTMLDivElement \| null>\(null\)/, "floating attachment menu should have its own click boundary");
  assert.match(
    source,
    /className=\{`aip-plus\$\{attachmentMenuOpen \? " on" : ""\}`\}[\s\S]*setAttachmentMenuOpen\(\(value\) => !value\)/,
    "floating plus button should toggle the shared attachment menu state"
  );
  assert.match(
    source,
    /<div className="aip-attach-menu" ref=\{panelAttachMenuRef\}>[\s\S]*拍照[\s\S]*上传图片[\s\S]*上传文件[\s\S]*<\/div>/,
    "floating composer should render the three attachment actions when the plus menu is open"
  );
  assert.match(
    source,
    /\.aip-attach-action\{[^}]*position:relative[^}]*z-index:1/s,
    "floating attachment action buttons should stay above their menu background"
  );
});

test("home composer switches to a stable multiline layout for long input", () => {
  assert.match(source, /const \[homeComposerExpanded, setHomeComposerExpanded\] = useState\(false\)/, "home composer should track multi-line state explicitly");
  assert.match(source, /const expanded = Boolean\(value\.length > 0 && \(value\.includes\("\\n"\) \|\| textarea\.scrollHeight > 66\)\)/, "home composer should detect multi-line input from non-empty fresh measurements");
  assert.match(source, /xw-home-input-shell\$\{homeComposerExpanded \? " multiline" : ""\}/, "home input shell should receive a multiline class");
  assert.match(source, /\.xw-home-input-shell\.multiline\{[^}]*align-items:flex-end/s, "multiline shell should bottom-align controls");
  assert.match(source, /\.xw-home-input-shell\.multiline \.xw-home-input\{[^}]*border-radius:28px[^}]*line-height:1\.42[^}]*overflow-y:auto/s, "multiline input should use readable text flow and scrolling");
  assert.match(source, /\.xw-home-input-shell\.multiline \.xw-home-voice-cue/s, "multiline style should reposition the voice affordance");
  assert.match(source, /\.xw-home-input-shell\.multiline \.xw-home-send/s, "multiline style should reposition the send or stop affordance");
});

test("home composer recalculates collapsed height after deleting long input", () => {
  assert.match(source, /const \[homeComposerExpanded, setHomeComposerExpanded\] = useState\(false\)/, "home composer expanded state should not be derived from stale textarea height during render");
  assert.match(source, /function syncHomeInputHeight\(textarea: HTMLTextAreaElement, value: string\): boolean[\s\S]*shell\?\.classList\.remove\("multiline"\)[\s\S]*textarea\.style\.height = "58px"[\s\S]*const expanded = Boolean\(value\.length > 0 && \(value\.includes\("\\n"\) \|\| textarea\.scrollHeight > 66\)\)[\s\S]*if \(!expanded\) return false/s, "home input should measure from the collapsed layout so deleting text can shrink it");
  assert.match(source, /setHomeComposerExpanded\(syncHomeInputHeight\(event\.currentTarget, event\.target\.value\)\)/, "home input change should update expanded state from a fresh height measurement");
  assert.doesNotMatch(source, /const homeComposerExpanded = Boolean\(input\.includes\("\\n"\) \|\| \(inputRef\.current\?\.scrollHeight \|\| 0\) > 66\)/, "home composer must not read sticky scrollHeight during render");
});

test("home composer covers the browser gap while the mobile keyboard is open", () => {
  assert.match(
    source,
    /<div className=\{`xw-home-bottom-dock\$\{attachmentMenuOpen \? " menu-open" : ""\}`\} aria-hidden="true" \/>/,
    "home input bar needs an independent bottom dock layer instead of relying on the inputbar pseudo-element"
  );
  assert.match(
    source,
    /\.xw-home-bottom-dock\{[^}]*position:fixed[^}]*left:0[^}]*right:0[^}]*bottom:-36px[^}]*height:calc\(115px \+ env\(safe-area-inset-bottom\)\)[^}]*z-index:8062[^}]*background:#e8ecff[^}]*box-shadow:0 -18px 58px rgba\(122,144,255,\.1\)[^}]*overflow:visible/s,
    "home input bar should keep the dock body opaque below the feathered edge"
  );
  assert.match(
    source,
    /\.xw-home-bottom-dock::before\{[^}]*content:""[^}]*position:absolute[^}]*left:0[^}]*right:0[^}]*top:-30px[^}]*height:30px[^}]*background:linear-gradient\(180deg,rgba\(232,236,255,0\) 0%,rgba\(232,236,255,\.05\) 18%,rgba\(232,236,255,\.16\) 36%,rgba\(232,236,255,\.34\) 54%,rgba\(232,236,255,\.62\) 74%,#e8ecff 100%\)/s,
    "home input bar should use a short separate feather overlay instead of making the dock transparent"
  );
  assert.match(
    source,
    /\.xw-home-inputbar\{[^}]*z-index:8063/s,
    "composer controls should stay above the fixed bottom dock"
  );
  assert.match(
    source,
    /\.xw-home-inputbar\.menu-open\{[^}]*bottom:calc\(150px \+ env\(safe-area-inset-bottom\)\)[^}]*z-index:8065/s,
    "opened attachment menu should keep the composer and close button above the menu shield"
  );
  assert.match(
    source,
    /\.xw-home-inputbar\.menu-open::before\{[^}]*top:0[^}]*height:70px[^}]*z-index:-1/s,
    "opened composer glow should stay behind the composer instead of covering the attachment actions"
  );
  assert.match(
    source,
    /\.xw-home-scroll\{[^}]*padding:6px 15px 113px/s,
    "message scroll padding should keep the requested tighter page card margin"
  );
  assert.match(
    source,
    /\.xw-home-inputbar:focus-within~\.xw-home-bottom-dock,\s*\.xw-home-bottom-dock:has\(\+ \.xw-home-inputbar:focus-within\)\{[^}]*height:calc\(115px \+ env\(safe-area-inset-bottom\)\)/s,
    "focused composer should keep the dock top aligned three pixels above the single-line input"
  );
  assert.match(
    source,
    /\.xw-home-bottom-dock\.menu-open\{[^}]*bottom:-42px[^}]*height:calc\(253px \+ env\(safe-area-inset-bottom\)\)[^}]*z-index:8062[^}]*background:#e8ecff[^}]*box-shadow:0 -22px 64px rgba\(122,144,255,\.1\)/s,
    "attachment menu should keep the same opaque bottom shield while raised"
  );
  assert.match(
    source,
    /\.xw-home-bottom-dock\.menu-open::before\{[^}]*top:-30px[^}]*height:30px[^}]*background:linear-gradient\(180deg,rgba\(232,236,255,0\) 0%,rgba\(232,236,255,\.05\) 18%,rgba\(232,236,255,\.16\) 36%,rgba\(232,236,255,\.34\) 54%,rgba\(232,236,255,\.62\) 74%,#e8ecff 100%\)/s,
    "raised attachment menu should keep the same short feather while the dock body remains opaque"
  );
  assert.match(
    source,
    /\.xw-home-attach-menu\{[^}]*position:fixed[^}]*bottom:calc\(24px \+ env\(safe-area-inset-bottom\)\)[^}]*z-index:8064[^}]*isolation:isolate/s,
    "attachment action menu should own a stacking context for its bottom shield"
  );
  assert.match(
    source,
    /\.xw-home-attach-menu::before\{[^}]*content:""[^}]*position:fixed[^}]*left:0[^}]*right:0[^}]*bottom:-42px[^}]*height:calc\(192px \+ env\(safe-area-inset-bottom\)\)[^}]*z-index:-2[^}]*background:linear-gradient\(180deg,rgba\(232,236,255,\.78\) 0%,rgba\(232,236,255,\.94\) 16%,#e8ecff 34%,#e8ecff 100%\)/s,
    "attachment action menu should feather its top edge without revealing the content behind it"
  );
  assert.match(
    source,
    /\.xw-home-attach-menu::after\{[^}]*content:""[^}]*position:absolute[^}]*z-index:0[^}]*background:radial-gradient\(ellipse at center,rgba\(91,72,255,\.2\) 0%,rgba\(148,163,255,\.18\) 42%,rgba\(232,236,255,0\) 78%\)[^}]*filter:blur\(18px\)/s,
    "attachment menu glow should live behind the action buttons"
  );
  assert.match(
    source,
    /\.xw-home-attach-action\{[^}]*position:relative[^}]*z-index:1/s,
    "attachment action buttons should render above the menu feather and glow layers"
  );
});

test("home thinking indicator restores the assistant bubble background", () => {
  assert.match(
    source,
    /if \(message\.content === "__THINKING__"\) \{[\s\S]*className="xw-home-thinking"[\s\S]*\{renderDisplayMessage\(message,\s*xiaowanziMentionLinks,\s*openXiaowanziMentionLink\)\}/,
    "home thinking placeholders should use their own home thinking container"
  );
  assert.match(
    source,
    /\.xw-home-thinking\{[^}]*background:rgba\(255,255,255,\.9\)[^}]*border:1px solid rgba\(122,103,238,\.1\)[^}]*box-shadow:0 8px 18px rgba\(72,75,132,\.06\)/s,
    "home thinking indicator should restore the previous assistant white card background"
  );
  assert.match(
    source,
    /\.xw-home-thinking \.xw-thinking-dots\{[^}]*padding:0[^}]*min-height:28px/s,
    "home thinking indicator should keep the dots compact inside the restored card"
  );
});

test("share controls only appear for successful assistant messages on hover or click", () => {
  assert.match(
    source,
    /function isShareableAssistantMessage\(message: Msg\)[\s\S]*message\.role !== "assistant"[\s\S]*message\.content === "__THINKING__"[\s\S]*isFailedAssistantMessage\(message\.content\)/,
    "share eligibility should exclude thinking placeholders and failed assistant messages"
  );
  assert.match(
    source,
    /function isFailedAssistantMessage\(content: string\)[\s\S]*请求失败/,
    "request failure text should be detected before rendering share controls"
  );
  assert.match(
    source,
    /function isFailedAssistantMessage\(content: string\)[\s\S]*校验 Pro 权限失败[\s\S]*登录态已过期[\s\S]*无效的登录凭证/,
    "known unsuccessful status messages should be treated as failed assistant messages"
  );
  assert.match(
    source,
    /function isFailedAssistantMessage\(content: string\)[\s\S]*\(权限\|登录凭证\|登录态\)/,
    "short permission and login failure bubbles should not trigger share controls"
  );
  assert.match(
    source,
    /className=\{`xw-share-btn \$\{shareRevealMessageId === \(message\.ts \|\| ""\) \? "xw-share-visible" : ""\}`\.trim\(\)\}/,
    "clicked successful assistant messages should reveal their share button"
  );
  assert.match(
    source,
    /\.xw-home-msg\.ai:hover \+ \.xw-share-btn,[^}]*\.xw-home-msg\.ai:focus-within \+ \.xw-share-btn,[^}]*\.xw-share-btn\.xw-share-visible/s,
    "successful assistant messages should reveal share controls on hover, focus, or click"
  );
  assert.doesNotMatch(
    source,
    /\{message\.role === "assistant" && !isReplying \? \(/,
    "share buttons must not render for every assistant message, because failures are assistant messages too"
  );
});

test("share hover reveal stays visible for five seconds before hiding", () => {
  assert.match(
    source,
    /const SHARE_REVEAL_HIDE_DELAY_MS = 5000;/,
    "share reveal should stay visible for five seconds after hover"
  );
  assert.match(
    source,
    /const shareRevealHideTimerRef = useRef<number \| null>\(null\);/,
    "share reveal hide timer should be tracked so newer hovers can replace older timers"
  );
  assert.match(
    source,
    /function scheduleShareRevealHide\(messageId: string\)[\s\S]*window\.setTimeout\(\(\) => \{[\s\S]*setShareRevealMessageId\(\(current\) => \(current === messageId \? null : current\)\);[\s\S]*SHARE_REVEAL_HIDE_DELAY_MS/,
    "hide timer should only clear the same message after the five-second delay"
  );
  assert.match(
    source,
    /onMouseEnter=\{\(\) => revealShareButtonForMessage\(message\)\}/,
    "hovering the message bubble should promote CSS hover into a delayed visible state"
  );
  assert.match(
    source,
    /onFocus=\{\(\) => revealShareButtonForMessage\(message\)\}/,
    "keyboard focus should use the same delayed reveal path"
  );
});

test("share card generation uses cached assets and async blob output", () => {
  assert.match(source, /let cachedShareLogoPromise: Promise<HTMLImageElement \| null> \| null = null/, "share logo should be cached across image generations");
  assert.match(source, /let cachedShareQrPromise: Promise<HTMLImageElement \| null> \| null = null/, "share QR should be cached across image generations");
  assert.match(source, /const SHARE_CARD_LOGO_HEIGHT = 156;/, "share card Xiaowanzi logo should be 30 percent larger than the previous 120px height");
  assert.match(source, /const logoH = SHARE_CARD_LOGO_HEIGHT;/, "share card rendering should use the larger logo height constant");
  assert.doesNotMatch(source, /xiaowanzi-share-logo\.png\?t=\$\{Date\.now\(\)\}/, "share logo generation must not bypass browser cache on each click");
  assert.match(source, /function canvasToShareObjectUrl\(canvas: HTMLCanvasElement\): Promise<string>/, "share card should encode through an async blob helper");
  assert.match(source, /canvas\.toBlob\(\(blob\) =>/, "share card export should avoid synchronous canvas.toDataURL for large answers");
  assert.doesNotMatch(source, /setShareCardUrl\(canvas\.toDataURL\("image\/png"\)\)/, "large share cards should not use blocking base64 data URLs");
});

test("share card generation uses assistant layout normalization before canvas wrapping", () => {
  assert.match(
    source,
    /const text = msg\.role === "assistant"\s+\?\s+normalizeAssistantLayoutText\(cln\(msg\.content\)\)\s+:\s+cln\(msg\.content\);/,
    "share cards should keep the same paragraph and numbered-list layout as visible assistant bubbles"
  );
});

test("share selection sheet closes when the page outside the sheet is tapped", () => {
  assert.match(
    source,
    /\.xw-share-select-backdrop\{[^}]*pointer-events:auto/s,
    "share selection backdrop must receive outside taps instead of letting them pass through"
  );
  assert.match(
    source,
    /function dismissShareSelectionBackdropEvent\(event: React\.MouseEvent<HTMLDivElement>\)[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)[\s\S]*exitShareSelectionMode\(\)/,
    "share selection backdrop should dismiss the sheet while preventing a pass-through click"
  );
  assert.match(
    source,
    /className="xw-share-select-backdrop"[\s\S]*onClick=\{dismissShareSelectionBackdropEvent\}/,
    "clicking outside the share selection sheet should close it"
  );
});

test("share selection mode keeps the Xiaowanzi message list scrollable", () => {
  const backdropRule = source.match(/\.xw-share-select-backdrop\{([^}]*)\}/);
  assert.ok(backdropRule, "share selection backdrop rule should exist");
  const zIndexMatch = backdropRule[1].match(/z-index:(\d+)/);
  assert.ok(zIndexMatch, "share selection backdrop should declare a stable z-index");
  assert.ok(
    Number(zIndexMatch[1]) < 8050,
    "share selection backdrop must sit below the Xiaowanzi message shell so the message list can keep receiving scroll and selection taps"
  );
  assert.match(
    source,
    /<div key=\{`xw-home-\$\{homePortalKey\}`\}[\s\S]*onClick=\{shareSelectionMode \? dismissShareSelectionBackdropEvent : undefined\}/,
    "home super-mode should close selection mode from its empty shell without covering the scrollable message list"
  );
});

test("share selection mode exposes all home conversation messages for multi-select", () => {
  assert.match(
    source,
    /const homeConversationMessages = visibleMessages\.filter\(\(message\) => !isReadReceiptMessage\(message\.content\)\);/,
    "home mode should keep one untruncated conversation list before rendering"
  );
  assert.match(
    source,
    /const homeAnswerMessages = shareSelectionMode \? homeConversationMessages : homeConversationMessages\.slice\(-6\);/,
    "normal home mode can stay compact, but share selection mode must show the full conversation for multi-select"
  );
  assert.match(
    source,
    /homeAnswerMessages\.map\(\(message, idx\) =>/,
    "home answer rendering should use the share-aware message list"
  );
});

test("xiaowanzi account sync mirrors local profiles browsing memory and sessions", () => {
  assert.match(source, /function collectXiaowanziSyncPayload\(\): XiaowanziSyncPayload[\s\S]*childProfiles: loadChildProfiles\(\)[\s\S]*childProfileDeletions: loadChildProfileDeletions\(\)[\s\S]*browsingMemory: readBrowsingMemory\(\)[\s\S]*conversationSessions,[\s\S]*conversationMessages/s, "account sync payload should include local profiles, deletion tombstones, browsing memory, and conversation sessions");
  assert.match(source, /async function pullAndMergeXiaowanziAccountSync\(\): Promise<boolean>[\s\S]*\/api\/users\/me\/xiaowanzi-sync[\s\S]*applyXiaowanziSyncPayload\(remote\)[\s\S]*pushXiaowanziAccountSync\(\)/s, "login sync should pull remote data, merge it locally, then push the merged state");
  assert.match(source, /useEffect\(\(\) => \{[\s\S]*pullAndMergeXiaowanziAccountSync\(\)[\s\S]*setChildProfiles\(loadChildProfiles\(\)\)[\s\S]*setChatContext\(loadChatContext\(\)\)[\s\S]*refreshConversationSessions\(\)/s, "widget should automatically refresh state after account sync");
  assert.match(source, /function appendBrowsingMemory[\s\S]*localStorage\.setItem\(BROWSING_MEMORY_KEY[\s\S]*scheduleXiaowanziAccountSync\(\)/s, "browsing memory writes should schedule account sync");
  assert.match(source, /function saveConversationSessionMessages[\s\S]*localStorage\.setItem\([\s\S]*conversationSessionMessagesKey\(sessionId\)[\s\S]*scheduleXiaowanziAccountSync\(\)/s, "session message writes should schedule account sync");
  assert.match(source, /function applyXiaowanziSyncPayload\(remote: XiaowanziSyncPayload \| null \| undefined\) \{[\s\S]*const childProfileDeletions = mergeByLatest\([\s\S]*remote\.childProfileDeletions[\s\S]*localStorage\.setItem\(CHILD_PROFILE_DELETIONS_KEY, JSON\.stringify\(childProfileDeletions\)\);[\s\S]*const childProfiles = mergeByLatest\([\s\S]*filter\(\(item\) => !isDeletedChildProfile\(item, childProfileDeletions\)\)/s, "account sync merge should keep deletion tombstones and filter deleted child profiles before writing local state");
});

test("mini program Xiaowanzi child bridge seeds local child profiles and default binding", () => {
  assert.match(source, /const MINI_PROGRAM_CHILD_PROFILES_QUERY_KEY = "xf_child_profiles";/, "mini program should pass saved native children through the web-view url");
  assert.match(source, /const MINI_PROGRAM_CHILD_ID_QUERY_KEY = "xf_child_id";/, "mini program should pass the preferred active child id");
  assert.match(source, /function applyMiniProgramChildProfileBridge\(\): ChildProfileLite\[\] \| null \{[\s\S]*url\.searchParams\.get\(MINI_PROGRAM_CHILD_PROFILES_QUERY_KEY\)[\s\S]*normalizeChildProfileLite[\s\S]*localStorage\.setItem\(CHILD_PROFILES_KEY, JSON\.stringify\(profiles\)\)[\s\S]*childProfileId: picked\.id[\s\S]*isChildBound: true[\s\S]*localStorage\.setItem\(CHAT_CONTEXT_KEY, JSON\.stringify\(nextContext\)\)/s, "web-view startup should mirror native profiles and bind the selected or first child");
  assert.match(source, /url\.searchParams\.delete\(MINI_PROGRAM_CHILD_PROFILES_QUERY_KEY\)[\s\S]*url\.searchParams\.delete\(MINI_PROGRAM_CHILD_ID_QUERY_KEY\)/s, "bridge query params should be consumed after startup");
  assert.match(source, /function loadChildProfiles\(\): ChildProfileLite\[\] \{[\s\S]*const bridgedProfiles = applyMiniProgramChildProfileBridge\(\);[\s\S]*if \(bridgedProfiles\) return bridgedProfiles;/s, "initial child profile state should prefer the native web-view bridge before localStorage");
});

test("xiaowanzi ignores draft child profiles before they are saved", () => {
  assert.match(
    source,
    /const childProfileDeletions = loadChildProfileDeletions\(\);[\s\S]*\.filter\(\(item\): item is ChildProfileLite => \{[\s\S]*if \(!item\) return false;[\s\S]*return Boolean\(item\.id\) && !item\.draft && !isDeletedChildProfile\(item, childProfileDeletions\);[\s\S]*\}\)/,
    "newly created draft child profiles or deleted ids should not become selectable or synced before save"
  );
});
