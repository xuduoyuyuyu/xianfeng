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
  assert.match(source, /loadTopicPromptItems/, "home prompts must load from topic content");
  assert.match(source, /normalizeHomePromptItem/, "home prompts should be normalized before display");
  assert.match(source, /startNewConversationSession/, "opening home mode must start a new recoverable session");
  assert.match(source, /restoreConversationSession/, "history cards must restore saved sessions");
  assert.match(source, /openManualNewConversation/, "home mode needs a manual new conversation action");
});

test("home prompt suggestions are specific and not program-limited", () => {
  const fallbackMatch = source.match(/const HOME_FALLBACK_PROMPTS:[\s\S]*?\n\];/);
  assert.ok(fallbackMatch, "fallback prompts block should exist");
  assert.doesNotMatch(fallbackMatch[0], /节目|这期|先听|哪一段/, "fallback prompts must not mention program-listening context");
  assert.match(source, /HOME_PROMPT_BLOCKED_TERMS/, "dynamic prompts need blocked terms");
  assert.match(source, /HOME_PROMPT_BLOCKED_TERMS\.some/, "dynamic prompts should filter blocked terms");
});

test("home history drawer owns the new conversation and exit actions", () => {
  assert.match(source, /xw-home-history-drawer/, "home history should render in a left-side drawer");
  assert.match(source, /setHomeHistoryDrawerOpen\(true\)/, "history action should open the left drawer");
  assert.match(source, /aria-label="历史记录"[\s\S]*onClick=\{\(\) => void openHomeHistoryMenu\(\)\}/, "top-left menu button should open the left history drawer directly");
  assert.match(source, /aria-label="更多"[\s\S]*document\.dispatchEvent\(new CustomEvent\("xf-open-public-menu"\)\)/, "top-right more button should open the original public hamburger menu");
  assert.match(source, /className="xw-home-history-new"/, "history drawer should expose the new conversation action");
  assert.match(source, /\.xw-home-history-drawer-head\{[^}]*justify-content:center/s, "new conversation should be centered in the drawer header");
  assert.match(source, /\.xw-home-history-exit\{[^}]*border:0[^}]*background:transparent[^}]*box-shadow:none/s, "drawer exit should render only the logout icon without an outer ring");
  assert.doesNotMatch(source, /\.xw-home-history-exit\{[^}]*border:1\.5px solid/s, "drawer exit should not keep the previous outer ring");
  assert.match(source, /className="xw-home-history-exit xw-home-history-exit-dock"/, "super-mode exit should dock inside the history drawer");
  assert.match(source, /\.xw-home-history-exit-dock\{[^}]*position:absolute[^}]*right:18px[^}]*bottom:calc\(22px \+ env\(safe-area-inset-bottom\)\)/s, "super-mode exit should sit at the drawer bottom-right");
  assert.match(source, /\.xw-home-history-list\{[^}]*padding-bottom:62px/s, "history list should leave room for the drawer-bottom exit button");
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

test("manual new conversation saves current session before opening a blank one", () => {
  assert.match(
    source,
    /function openManualNewConversation\(\)[\s\S]*persistConversation\(messages\)[\s\S]*startNewConversationSession\(\)/,
    "new conversation should save the current history before opening a new session"
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
});

test("home avatars use optimized eager image assets", () => {
  assert.match(source, /const AVATAR_FALLBACK_SRC = "\/assets\/wel-avatar\/optimized\/no-hat\.webp";/, "Xiaowanzi fallback should use the optimized lightweight avatar");
  const avatarListMatch = logicSource.match(/export const XIAOWANZI_AVATARS = \[[\s\S]*?\] as const;/);
  assert.ok(avatarListMatch, "Xiaowanzi selectable avatar list should exist");
  assert.doesNotMatch(avatarListMatch[0], /\/assets\/wel-avatar\/(?!optimized\/)[^"]+\.(png|jpg|jpeg)/i, "local selectable avatars should use optimized webp assets");
  assert.match(avatarListMatch[0], /\/assets\/wel-avatar\/optimized\/no-hat\.webp/, "default avatar should be the optimized no-hat asset");
  assert.match(
    source,
    /<img key=\{displayAvatar\} className="xw-home-brand-avatar" src=\{displayAvatar\}[^>]*loading="eager"[^>]*decoding="async"[^>]*fetchPriority="high"/,
    "top Xiaowanzi avatar should be prioritized"
  );
  assert.match(
    source,
    /<img className="xw-home-avatar" src="\/assets\/wel-avatar\/optimized\/no-hat\.webp"[^>]*loading="eager"[^>]*decoding="async"[^>]*fetchPriority="high"/,
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

test("home composer switches to a stable multiline layout for long input", () => {
  assert.match(source, /const homeComposerExpanded = Boolean\(input\.includes\("\\n"\) \|\| \(inputRef\.current\?\.scrollHeight \|\| 0\) > 66\)/, "home composer should detect multi-line input");
  assert.match(source, /xw-home-input-shell\$\{homeComposerExpanded \? " multiline" : ""\}/, "home input shell should receive a multiline class");
  assert.match(source, /\.xw-home-input-shell\.multiline\{[^}]*align-items:flex-end/s, "multiline shell should bottom-align controls");
  assert.match(source, /\.xw-home-input-shell\.multiline \.xw-home-input\{[^}]*border-radius:28px[^}]*line-height:1\.42[^}]*overflow-y:auto/s, "multiline input should use readable text flow and scrolling");
  assert.match(source, /\.xw-home-input-shell\.multiline \.xw-home-voice-cue/s, "multiline style should reposition the voice affordance");
  assert.match(source, /\.xw-home-input-shell\.multiline \.xw-home-send/s, "multiline style should reposition the send or stop affordance");
});
