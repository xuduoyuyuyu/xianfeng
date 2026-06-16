import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "LandingPage.tsx"), "utf8");

const getStyleBlock = (selector) => source.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{[\\s\\S]*?\\n        \\}`))?.[0] || "";

test("landing guest marquee uses guest avatar images instead of generated initials", () => {
  assert.match(source, /fetch\("\/api\/guests\?page=1&pageSize=120"\)/, "guest marquee should load enough guest records to find real avatar entries");
  assert.match(source, /setGuests\(list\.filter\(\(guest: PublicGuest\) => toText\(guest\?\.name\)\)\.slice\(0, 120\)\)/, "guest marquee should include all named guests instead of filtering out fallback-avatar guests");
  assert.match(source, /return \[\.\.\.guests, \.\.\.guests\]/, "guest marquee should duplicate the full guest list for seamless looping");
  assert.match(source, /const avatar = resolveGuestAvatar\(guest\.avatar, !!failedGuestAvatars\[guest\._id\]\)/, "guest avatar should use the shared resolver for fallback images");
  assert.match(source, /const avatarSrc = avatar\.isFallback \? avatar\.src : toText\(guest\.avatar\);/, "real guest avatars should use the raw guest avatar URL while fallback guests use the shared fallback image");
  assert.match(source, /className=\{avatar\.isFallback \? "is-fallback-avatar" : undefined\}/, "fallback avatar images should remain image-based and centered");
  assert.doesNotMatch(source, /guestName\.slice\(0,\s*1\)/, "guest pill avatar should not be generated from the guest name initial");
  assert.doesNotMatch(source, /showAvatarImage/, "guest pill should not branch into a generated text-avatar path");
});

test("landing guest marquee pill height matches detail guest switcher scale", () => {
  assert.match(source, /\.guest-marquee-track \{[\s\S]*gap: 6px;/, "guest marquee track should match the detail guest pill row gap");
  assert.match(source, /animation: guestMarquee 140s linear infinite;/, "full guest marquee should move slowly enough for the longer all-guest loop");
  assert.match(source, /\.guest-pill \{[\s\S]*gap: 8px;[\s\S]*border: 1px solid rgba\(23, 24, 31, 0\.1\);[\s\S]*background: rgba\(255, 255, 255, 0\.82\);[\s\S]*padding: 6px 12px;[\s\S]*font-size: 11px;[\s\S]*font-weight: 700;[\s\S]*line-height: 1;/, "guest pill should keep the compact detail-page scale while adapting to the light page background");
  assert.match(source, /\.guest-pill-avatar \{[\s\S]*width: 24px;[\s\S]*height: 24px;[\s\S]*flex: 0 0 auto;/, "guest pill avatar should use the same 24px avatar scale as the detail guest switcher");
  assert.match(source, /\.guest-pill-name \{[\s\S]*max-width: 80px;/, "guest names should use the same max width as the detail page guest switcher");
});

test("landing guest marquee does not render selected-looking pills", () => {
  assert.doesNotMatch(source, /\.guest-pill:nth-child/, "guest marquee should not fake selected pills with nth-child highlighting");
  assert.doesNotMatch(source, /background: #f1e8ff;[\s\S]*color: var\(--lp-primary\);[\s\S]*box-shadow: 0 12px 30px rgba\(124, 58, 237, 0\.14\);/, "guest marquee should keep every pill visually neutral");
});

test("landing guest marquee is tiled directly on the page background", () => {
  const sectionBlock = getStyleBlock(".guest-marquee-section");
  const headBlock = getStyleBlock(".guest-marquee-head");
  const trackBlock = getStyleBlock(".guest-marquee-track");

  assert.match(sectionBlock, /margin-top: clamp\(26px, 4vw, 52px\);/, "guest marquee should keep the same vertical placement");
  assert.match(sectionBlock, /overflow: hidden;/, "guest marquee should keep horizontal clipping for the marquee");
  assert.match(sectionBlock, /padding: 0;/, "guest marquee should sit directly on the page background");
  assert.doesNotMatch(sectionBlock, /background:/, "guest marquee should not render a card background");
  assert.doesNotMatch(sectionBlock, /border:/, "guest marquee should not render a card border");
  assert.doesNotMatch(sectionBlock, /box-shadow:/, "guest marquee should not render a card shadow");
  assert.doesNotMatch(sectionBlock, /border-radius:/, "guest marquee should not render as a rounded card");
  assert.match(headBlock, /padding: 0 0 16px;/, "guest marquee heading should align to the page content instead of an inner card gutter");
  assert.match(trackBlock, /padding: 4px 0;/, "guest marquee pills should align to the page content instead of an inner card gutter");
});

test("landing topbar Xiaowanzi avatar opens Xiaowanzi home instead of a dropdown menu", () => {
  assert.match(source, /const openXiaowanziHome = \(\) => \{[\s\S]*new CustomEvent\("xf-open-xiaowanzi", \{[\s\S]*detail: \{ source: "landing-topbar", mode: "home" \},[\s\S]*\}/, "topbar Xiaowanzi action should open the shared Xiaowanzi home mode");
  assert.match(source, /<button className="heo-nav-brand" type="button" aria-label="打开小玩子首页" onClick=\{openXiaowanziHome\}>[\s\S]*<img src="\/assets\/xiaowanzi-nohat\.png" alt="" aria-hidden="true" \/>/, "left brand slot should become the Xiaowanzi avatar button");
  assert.doesNotMatch(source, /heo-xiaowanzi-trigger/, "topbar should not keep a second Xiaowanzi button on the right");
  assert.doesNotMatch(source, /menuOpen|setMenuOpen|toggleHomeMenu|activeMenuGroup|setActiveMenuGroup|activateHomeMenuGroup/, "homepage should not keep dropdown menu state");
  assert.doesNotMatch(source, /heo-menu-backdrop|heo-menu-panel|heo-menu-tab|heo-menu-feature|heo-chat-icon/, "homepage should not render the old dropdown menu surface or chat bubble icon");
});

test("landing top navigation hover only animates and never opens a flyout card", () => {
  assert.match(source, /const navItems = heoSectionOrder\.map\(\(label, index\) => \(\{ label, targetId: heoSectionTargets\[label\], index \}\)\)/, "top nav items should keep concise section scroll targets while matching menu groups");
  assert.match(source, /<nav className="heo-nav-links" aria-label="首页导航">/, "desktop top navigation should not keep flyout hover handlers");
  assert.match(source, /onMouseEnter=\{\(\) => setActiveCatalogIndex\(item\.index\)\}[\s\S]*onPointerEnter=\{\(\) => setActiveCatalogIndex\(item\.index\)\}[\s\S]*onFocus=\{\(\) => setActiveCatalogIndex\(item\.index\)\}/, "hovering or focusing a top nav category should only activate the pill animation");
  assert.doesNotMatch(source, /openHomeMenuGroup/, "top nav hover should not open matching menu groups");
  assert.doesNotMatch(source, /aria-controls="heo-home-menu"[\s\S]*aria-pressed=\{activeCatalogIndex === item\.index\}/, "top nav category buttons should not advertise a menu flyout relationship");
});

test("landing top navigation categories are zhheo-like buttons that scroll to sections", () => {
  assert.match(source, /const handleNavCategoryClick = \(index: number, targetId: string\) => \{[\s\S]*setActiveCatalogIndex\(index\);[\s\S]*document\.getElementById\(targetId\)\?\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\);[\s\S]*\}/, "top nav category buttons should scroll to their catalog section");
  assert.match(source, /<button\s+type="button"\s+key=\{`\$\{item\.label\}-\$\{item\.targetId\}`\}\s+className=\{`heo-nav-link \$\{activeCatalogIndex === item\.index \? "is-active" : ""\}`\}/, "top nav categories should render as buttons like the reference with stable unique keys");
  assert.match(source, /aria-pressed=\{activeCatalogIndex === item\.index\}/, "active nav category button should expose pressed state");
  assert.match(source, /onClick=\{\(\) => handleNavCategoryClick\(item\.index, item\.targetId\)\}/, "clicking a top nav category should use the section-scroll handler");
  assert.doesNotMatch(source, /<a\s+href=\{item\.href\}\s+key=\{item\.href\}\s+className=\{`heo-nav-link/, "top nav categories should not remain plain anchor links");
});

test("landing dropdown menu panel has been removed from the topbar", () => {
  assert.doesNotMatch(source, /menuOpenSource/, "menu should not track nav-hover versus button-open sources");
  assert.doesNotMatch(source, /isNavFlyout/, "menu should not keep a nav-hover flyout mode");
  assert.doesNotMatch(source, /navFlyoutX/, "menu should not position itself from hovered nav items");
  assert.doesNotMatch(source, /menuOpen \?/, "homepage should not conditionally render a topbar dropdown");
  assert.doesNotMatch(source, /<aside className="heo-menu-panel"/, "homepage should not render the old menu panel");
  assert.doesNotMatch(source, /\.heo-menu-panel/, "old menu panel CSS should be removed");
});

test("landing desktop topbar is a centered compact capsule island", () => {
  assert.match(source, /\.heo-topbar-inner \{[\s\S]*width: fit-content;[\s\S]*max-width: calc\(100% - 28px\);[\s\S]*margin: 0 auto;/, "desktop topbar should shrink to its content and stay centered like the reference capsule");
  assert.match(source, /\.heo-topbar-inner \{[\s\S]*border-radius: 999px;[\s\S]*backdrop-filter: blur\(18px\);/, "topbar should keep the floating frosted capsule chrome");
  assert.match(source, /@media \(max-width: 768px\) \{[\s\S]*\.heo-topbar-inner \{[\s\S]*width: calc\(100% - 18px\);/, "mobile topbar should still span the small viewport");
  assert.doesNotMatch(source, /\.heo-topbar-inner \{[\s\S]*width: min\(1160px, calc\(100% - 28px\)\);/, "desktop topbar should not remain a full-width page bar");
});

test("landing topbar uses the zhheo-like dark capsule and hover chrome", () => {
  assert.match(source, /\.heo-topbar-inner \{[\s\S]*background: rgba\(25, 27, 39, 0\.88\);[\s\S]*border: 1px solid rgba\(255, 255, 255, 0\.12\);/, "topbar should use the dark floating capsule surface from the reference");
  assert.match(source, /<button className="heo-nav-brand" type="button" aria-label="打开小玩子首页" onClick=\{openXiaowanziHome\}>[\s\S]*<span className="heo-nav-avatar">\s*<img src="\/assets\/xiaowanzi-nohat\.png" alt="" aria-hidden="true" \/>\s*<\/span>/, "left brand slot should render Xiaowanzi as the single assistant entry");
  assert.match(source, /\.heo-nav-avatar \{[\s\S]*width: 46px;[\s\S]*height: 46px;[\s\S]*border-radius: 999px;/, "brand icon should use the same circular scale as the reference");
  assert.match(source, /\.heo-nav-link \{[\s\S]*color: rgba\(255, 255, 255, 0\.86\);[\s\S]*font-size: 20px;/, "desktop nav labels should become large white text buttons");
  assert.match(source, /\.heo-nav-link \{[\s\S]*transform-origin: center;[\s\S]*will-change: transform;/, "nav links should be ready for the reference-style scale hover");
  assert.match(source, /\.heo-nav-link::after \{[\s\S]*transform: scaleX\(0\);[\s\S]*background: var\(--lp-primary\);/, "nav buttons should include a hidden hover underline/glow");
  assert.match(source, /\.heo-nav-link:hover::after,[\s\S]*\.heo-nav-link\.is-active::after \{[\s\S]*transform: scaleX\(1\);/, "hovered and active nav buttons should reveal the zhheo-like indicator");
  assert.match(source, /\.heo-nav-link:hover,[\s\S]*\.heo-nav-link\.is-active \{[\s\S]*transform: translateY\(-1px\) scale\(1\.12\);[\s\S]*box-shadow: inset 0 0 0 1px rgba\(56, 189, 248, 0\.72\)/, "hovered nav buttons should enlarge into the reference-style outlined capsule");
  assert.doesNotMatch(source, /className="heo-xiaowanzi-trigger"/, "right circular Xiaowanzi action should be removed after moving it to the left slot");
  assert.match(source, /\.heo-login-link \{[\s\S]*background: var\(--lp-primary\);[\s\S]*color: #fff;/, "login should be a prominent theme-colored capsule action");
});

test("landing login opens the modal in-place instead of navigating to /login", () => {
  assert.match(source, /const openHomepageLoginModal = \(\) => \{[\s\S]*new CustomEvent\("xf-show-login-modal", \{[\s\S]*title: "登录后继续浏览"[\s\S]*\}\);[\s\S]*\}/, "homepage login should dispatch the shared login modal event");
  assert.match(source, /<button type="button" className="heo-login-link" onClick=\{openHomepageLoginModal\}>登录<\/button>/, "homepage login should be a button, not a route link");
  assert.doesNotMatch(source, /<a className="heo-login-link" href="\/login">登录<\/a>/, "homepage login should not navigate to the standalone login route");
});

test("landing top navigation keeps a zhheo-like active section pill", () => {
  assert.match(source, /const \[activeCatalogIndex, setActiveCatalogIndex\] = useState\(0\)/, "top navigation should track the active catalog section");
  assert.match(source, /onMouseEnter=\{\(\) => setActiveCatalogIndex\(item\.index\)\}/, "hovering a nav category should only activate that category pill");
  assert.match(source, /className=\{`heo-nav-link \$\{activeCatalogIndex === item\.index \? "is-active" : ""\}`\}/, "top nav links should expose an active pill class");
  assert.match(source, /onClick=\{\(\) => handleNavCategoryClick\(item\.index, item\.targetId\)\}/, "clicking a nav category should update active state and scroll via the shared handler");
  assert.match(source, /const heoSectionTargets: Record<HeoSectionTitle, string> = \{[\s\S]*应用: "primary-entry"[\s\S]*服务: "guest-marquee"[\s\S]*赞赏: "contact"/, "top nav should scroll to the remaining concise homepage sections");
  assert.match(source, /\.heo-nav-link\.is-active \{[\s\S]*background: rgba\(56, 189, 248, 0\.14\);[\s\S]*color: #fff;/, "active nav pill should use the same enlarged hover capsule style");
  assert.doesNotMatch(source, /new IntersectionObserver/, "simplified homepage should not keep scroll observers for removed catalog cards");
});

test("landing navigation and catalog follow the zhheo six-section rhythm", () => {
  assert.match(source, /const heoSectionOrder = \["应用", "媒体", "阅读", "服务", "活动", "赞赏"\]/, "homepage should keep the zhheo-like six-section order in one source of truth");
  assert.match(source, /const navItems = heoSectionOrder\.map\(\(label, index\) => \(\{ label, targetId: heoSectionTargets\[label\], index \}\)\)/, "top navigation should be generated from the same six sections");
  assert.doesNotMatch(source, /const menuGroups = heoSectionOrder/, "six-section rhythm should stay in the visible nav after removing the dropdown menu");
  assert.doesNotMatch(source, /className=\{`heo-catalog-section/, "six-section rhythm should live in the nav, not in a repeated page catalog");
});

test("landing hero follows the zhheo-inspired identity-first structure", () => {
  assert.match(source, /JIAZHANG XIANFENG \/ PARENTING CONTENT EST\. 2024/, "hero should use a brand identity line");
  assert.match(source, /<span>家长先疯<\/span>[\s\S]*<span>DIGITAL<\/span>/, "hero should use a large two-line identity headline");
  assert.match(source, /className="heo-manifesto-card"/, "hero should include one concise brand manifesto card");
  assert.doesNotMatch(source, /className="heo-profile-card"/, "hero should not include an extra brand profile card");
  assert.doesNotMatch(source, /className="heo-live-frame"[\s\S]*title=\{`\$\{currentPreview\.title\}真实页面预览`\}/, "hero should not use the old iframe preview stage");
});

test("landing hero keeps the first viewport compact like the reference", () => {
  assert.match(source, /<div className="heo-hero-copy">[\s\S]*<div className="heo-actions">/, "hero should keep only centered copy and primary actions");
  assert.doesNotMatch(source, /className="heo-hero-console"/, "hero should not keep an extra console block");
  assert.match(source, /\.heo-hero-stage \{[\s\S]*gap: clamp\(14px, 2vw, 22px\);[\s\S]*padding: clamp\(22px, 3\.6vw, 44px\);/, "hero stage should use tighter spacing than the earlier stacked version");
  assert.match(source, /<\/section>\s*<section className="heo-manifesto-section fade-up"/, "manifesto should follow the hero instead of sitting inside the first-screen stage");
  assert.doesNotMatch(source, /className="heo-hero-bottom"/, "hero should not keep the tall bottom double-card row");
  assert.doesNotMatch(source, /\.heo-hero-bottom \{/, "hero bottom row styles should be removed after compacting the first viewport");
});

test("landing first screen uses zhheo-like dark dotted hero atmosphere", () => {
  assert.match(source, /<div className="heo-first-screen">[\s\S]*<section className="heo-hero fade-up"/, "hero should sit inside a dedicated dark first-screen wrapper");
  assert.match(source, /\.heo-first-screen \{[\s\S]*background:[\s\S]*radial-gradient\(circle, rgba\(255, 255, 255, 0\.14\) 1px, transparent 1\.6px\)[\s\S]*background-size: 84px 84px, auto, auto, auto;[\s\S]*background-repeat: repeat, no-repeat, no-repeat, no-repeat;/, "first screen should include a subtle dotted/star grid without tiling gradient bands");
  assert.match(source, /\.heo-main \{[\s\S]*padding-top: 0;/, "main should let the dark first screen own the top spacing");
  assert.match(source, /\.heo-hero \{[\s\S]*padding-top: clamp\(112px, 12vw, 156px\);[\s\S]*color: #fff;/, "hero should start below the floating nav on the dark surface");
  assert.match(source, /\.heo-hero-stage \{[\s\S]*background: rgba\(255, 255, 255, 0\.08\);[\s\S]*border: 1px solid rgba\(255, 255, 255, 0\.12\);/, "hero stage should become a translucent dark-surface panel");
  assert.match(source, /\.heo-title \{[\s\S]*color: #fff;/, "hero headline should switch to white on the dark first screen");
  assert.match(source, /\.heo-lead \{[\s\S]*color: rgba\(255, 255, 255, 0\.74\);/, "hero body copy should use muted white on the dark first screen");
});

test("landing desktop hero uses one full-width stage instead of two sibling columns", () => {
  assert.match(source, /\.heo-hero \{[\s\S]*display: block;/, "desktop hero should be one full-width section, not a two-column wrapper");
  assert.match(source, /\.heo-hero-stage \{[\s\S]*display: grid;[\s\S]*grid-template-columns: minmax\(0, 1fr\);/, "hero stage should be the single full-width visual surface");
  assert.match(source, /<section className="heo-hero fade-up"[\s\S]*<div className="heo-hero-stage fade-up"[\s\S]*<div className="heo-hero-copy">/, "hero copy should live inside the unified stage");
  assert.doesNotMatch(source, /\.heo-hero \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(360px, 0\.92fr\);/, "desktop hero should not use the old two-column split");
  assert.doesNotMatch(source, /<section className="heo-hero fade-up"[\s\S]*<div className="heo-hero-copy">[\s\S]*<\/div>\s*<div className="heo-hero-stage fade-up"/, "hero should not render copy and stage as sibling panels");
});

test("landing first viewport centers the hero like zhheo instead of splitting the top into two columns", () => {
  assert.match(source, /<span className="heo-hero-wordmark" aria-hidden="true">JIAZHANG XIANFENG DIGITAL<\/span>/, "hero should include a large atmospheric background wordmark");
  assert.match(source, /\.heo-hero-copy \{[\s\S]*max-width: 860px;[\s\S]*margin: 0 auto;[\s\S]*text-align: center;/, "hero copy should be centered in the first viewport");
  assert.match(source, /\.heo-actions \{[\s\S]*justify-content: center;/, "primary hero actions should sit under the centered headline");
  assert.doesNotMatch(source, /<div className="heo-hero-console">/, "first viewport should not include a data-console block under the headline");
  assert.doesNotMatch(source, /<div className="heo-stage-grid" aria-label="家长先疯核心入口数据">/, "first viewport should not include dense stat tiles");
  assert.doesNotMatch(source, /<div className="heo-brand-lockup">/, "top hero should not keep the previous brand lockup column");
});

test("landing page keeps a concise zhheo-like content flow", () => {
  assert.match(source, /<section id="guest-marquee" className="guest-marquee-section" aria-label="先疯智库嘉宾">/, "homepage should keep the guest marquee");
  assert.match(source, /<div className="heo-product-list" ref=\{productRailRef\}>[\s\S]*featureCards\.map/, "homepage should keep the primary-entry carousel section");
  assert.doesNotMatch(source, /<section id="case-wall" className="heo-section">/, "homepage should remove the featured case-wall block");
  assert.doesNotMatch(source, /className="heo-preview-grid"/, "homepage should remove the iframe preview wall from the main flow");
  assert.doesNotMatch(source, /className="heo-banner"/, "homepage should remove the extra question banner from the main flow");
  assert.doesNotMatch(source, /className="heo-catalog-stack"/, "homepage should remove the repeated catalog stack from the main flow");
  assert.doesNotMatch(source, /className="stat-marquee"/, "homepage should remove the extra stats marquee");
  assert.doesNotMatch(source, /className="final-cta"/, "homepage should remove the final duplicated CTA");
});

test("landing hero includes a zhheo-like manifesto card with brand identity", () => {
  assert.match(source, /<div className="heo-manifesto-card">[\s\S]*<p>不只聊教育，也把真实家庭里的判断、犹豫、经验和方法放回同一个内容现场。<\/p>/, "hero should include a large manifesto paragraph rather than only short marketing copy");
  assert.match(source, /<div className="heo-manifesto-profile">[\s\S]*<img src="\/assets\/logo\.png" alt="家长先疯" \/>[\s\S]*<b>家长先疯<\/b>[\s\S]*<span>教育对话 · 内容资料库 · 家长问题现场<\/span>/, "manifesto card should pair the statement with a brand profile block");
  assert.match(source, /\.heo-manifesto-card \{[\s\S]*display: grid;[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/, "manifesto card should use a two-part desktop layout like the reference profile block");
  assert.match(source, /\.heo-manifesto-card p \{[\s\S]*font-size: clamp\(20px, 2\.2vw, 30px\);/, "manifesto copy should stay prominent without making the first viewport too tall");
});

test("landing product recommendations use solid illustration cards like the reference lower panels", () => {
  assert.match(source, /const featureCards = \[[\s\S]*visual: "program"[\s\S]*status: "推荐"[\s\S]*action: "进入节目"/, "feature cards should carry visual variant, status, and action copy in data");
  assert.match(source, /<div className="heo-product-list" ref=\{productRailRef\}>[\s\S]*featureCards\.map/, "product recommendations should render as a horizontal carousel rail");
  assert.match(source, /className=\{`heo-product-card tone-\$\{item\.tone\} \$\{isHomepageXiaowanziEntry\(item\.href\) \? "is-xiaowanzi-entry" : ""\}`\}/, "each product entry should use a solid-color illustration card with Xiaowanzi entry support");
  assert.match(source, /item\.visual === "reading" \? \([\s\S]*<img className="heo-jiyue-bird-art" src="\/assets\/jiyue-logo\.png" alt="" loading="lazy" decoding="async" \/>/, "Jiyue card should render the Jiyue bird logo as its illustration");
  assert.match(source, /item\.visual === "assistant" \? \([\s\S]*<img className="heo-xiaowanzi-art" src="\/assets\/xiaowanzi-nohat\.png" alt="" loading="lazy" decoding="async" \/>/, "Xiaowanzi card should render the nohat Xiaowanzi logo as its illustration");
  assert.match(source, /<span className="heo-visual-scene">[\s\S]*<span className="heo-scene-panel" \/>[\s\S]*<span className="heo-scene-line three" \/>[\s\S]*<\/span>/, "other product cards should render content-specific CSS scenes instead of a shared logo stack");
  assert.match(source, /<span className="heo-product-status">\{item\.status\}<\/span>/, "product rows should render status labels from data");
  assert.match(source, /<span className="heo-product-action">\{item\.action\}<\/span>/, "product rows should render a clear action label");
  assert.match(source, /\.heo-product-card \{[\s\S]*flex: 0 0 min\(420px, calc\(100vw - 56px\)\);[\s\S]*min-height: 520px;[\s\S]*border-radius: 34px;[\s\S]*background: var\(--card-bg\);/, "product cards should use the target site's large fixed-card carousel scale");
  assert.match(source, /\.heo-card-art \{[\s\S]*position: relative;[\s\S]*min-height: 230px;/, "product card art should have a dedicated illustration zone");
  assert.match(source, /\.heo-jiyue-bird-art \{[\s\S]*object-fit: contain;[\s\S]*filter: drop-shadow\(0 26px 42px rgba\(0, 0, 0, 0\.28\)\);/, "Jiyue bird logo should be sized as a standalone product illustration");
  assert.match(source, /\.heo-xiaowanzi-art \{[\s\S]*object-fit: contain;[\s\S]*filter: drop-shadow\(0 26px 42px rgba\(0, 0, 0, 0\.24\)\);/, "Xiaowanzi nohat logo should be sized as a standalone product illustration");
  assert.match(source, /\.visual-program \.heo-scene-panel::after \{[\s\S]*border-radius: 999px;/, "program card should draw a play/listening scene");
  assert.match(source, /\.visual-materials \.heo-scene-card\.one::before,[\s\S]*\.visual-materials \.heo-scene-card\.two::before \{[\s\S]*box-shadow:/, "materials card should draw document lines");
  assert.match(source, /\.visual-experts \.heo-scene-node \{[\s\S]*linear-gradient\(135deg, #7dd3fc, #f9a8d4\);/, "expert card should draw people/knowledge nodes");
  assert.match(source, /\.visual-planning \.heo-scene-line\.three \{[\s\S]*transform: rotate\(-20deg\);/, "planning card should draw a path line");
  assert.match(source, /\.tone-deep \{[\s\S]*--card-bg: #061b2d;/, "at least one card should use a deep target-style solid background");
  assert.doesNotMatch(source, /className=\{`heo-card \$\{item\.featured \? "featured" : item\.tone\}`\}/, "product recommendations should not remain bento cards");
  assert.doesNotMatch(source, /className="material-icons-round heo-product-icon"/, "product cards should not rely on icon font text as the illustration");
  assert.doesNotMatch(source, /heo-logo-stack|zhongnianzhiji-square-logo|xianfeng-square-logo/, "product cards should not reuse a single two-logo stack for unrelated entries");
  assert.doesNotMatch(source, /heo-art-device|heo-art-card|heo-art-bubble/, "product card illustration should not keep the old abstract CSS device art");
});

test("landing product recommendations scroll horizontally with controls", () => {
  assert.match(source, /const productRailRef = useRef<HTMLDivElement \| null>\(null\);/, "product carousel should keep a ref to the scroll rail");
  assert.match(source, /const scrollProductRail = \(direction: "prev" \| "next"\) => \{[\s\S]*rail\.scrollBy\(\{ left: direction === "next" \? step : -step, behavior: "smooth" \}\);[\s\S]*\}/, "carousel buttons should scroll the product rail");
  assert.match(source, /\.heo-product-list \{[\s\S]*display: flex;[\s\S]*overflow-x: auto;[\s\S]*scroll-snap-type: x mandatory;[\s\S]*scrollbar-width: none;/, "product list should be a horizontal snap carousel");
  assert.match(source, /<div className="heo-carousel-controls" aria-label="查看更多主要入口">[\s\S]*aria-label="查看上一组入口"[\s\S]*scrollProductRail\("prev"\)[\s\S]*aria-label="查看下一组入口"[\s\S]*scrollProductRail\("next"\)/, "product carousel should expose previous and next controls");
  assert.match(source, /\.heo-carousel-button \{[\s\S]*width: 42px;[\s\S]*height: 42px;[\s\S]*border-radius: 999px;/, "carousel controls should match the reference circular arrow buttons");
});

test("landing product cards never expose material icon ligature text", () => {
  const featureCardsBlock = source.match(/const featureCards = \[[\s\S]*?\n  \];/)?.[0] || "";
  assert.doesNotMatch(featureCardsBlock, /icon: "(podcasts|menu_book|folder_open|question_answer|psychology|inventory_2|route|smart_toy)"/, "product card data should not keep unused material icon ligatures that can leak as text");
  assert.doesNotMatch(source, /<span[^>]*>\{item\.icon\}<\/span>/, "homepage rendering should never print icon ligature text");
  assert.doesNotMatch(source, /material-symbols-outlined|material-icons-round/, "homepage should not depend on Google icon-font loading");
  assert.doesNotMatch(source, />close<\/button>/, "close controls should use CSS shapes instead of icon-font ligature text");
});

test("landing highlights topics and worthbuy as standalone activity cards", () => {
  const featureCardsBlock = source.match(/const featureCards = \[[\s\S]*?\n  \];/)?.[0] || "";
  const specialCardsBlock = source.match(/const specialActionCards = \[[\s\S]*?\n  \];/)?.[0] || "";

  assert.doesNotMatch(featureCardsBlock, /title: "请教一下"/, "topics should no longer be mixed into the ordinary product card grid");
  assert.doesNotMatch(featureCardsBlock, /title: "知物"/, "worthbuy should no longer be mixed into the ordinary product card grid");
  assert.match(specialCardsBlock, /title: "请教一下"[\s\S]*href: "\/topics"[\s\S]*tone: "ask"/, "topics should have a dedicated activity-style card");
  assert.match(specialCardsBlock, /title: "知物"[\s\S]*href: "\/worthbuy"[\s\S]*tone: "worth"/, "worthbuy should have a dedicated activity-style card");
  assert.match(source, /<div className="heo-special-actions" aria-label="请教一下与知物">[\s\S]*specialActionCards\.map/, "homepage should render the dedicated two-card module");
  assert.match(source, /<span className="heo-special-hero-copy">[\s\S]*<small>\{item\.eyebrow\}<\/small>[\s\S]*<b>\{item\.headline\}<\/b>[\s\S]*<span>\{item\.text\}<\/span>/, "special cards should place the activity copy over the illustration area");
  assert.match(source, /<span className="heo-special-body">[\s\S]*<small>\{item\.title\}<\/small>[\s\S]*<b>\{item\.product\}<\/b>[\s\S]*<p>\{item\.productText\}<\/p>[\s\S]*<span className="heo-special-action">\{item\.action\}<\/span>/, "special cards should keep a dark product footer row like the reference");
  assert.match(source, /\.heo-special-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/, "special cards should be a two-column desktop pair");
  assert.match(source, /\.heo-special-card \{[\s\S]*min-height: 460px;[\s\S]*border-radius: 34px;/, "special cards should use the large rounded activity-card scale");
});

test("landing page includes a zhheo-like site entry directory list", () => {
  assert.match(source, /const siteEntryGroups: SiteEntryGroup\[\] = \[[\s\S]*title: "应用"[\s\S]*subtitle: "把常用功能放在一个入口列表里"/, "homepage should define grouped site entry data");
  assert.match(source, /title: "节目列表"[\s\S]*href: "\/programs\/list"[\s\S]*title: "请教一下"[\s\S]*href: "\/topics"/, "entry list should include real product routes");
  assert.match(source, /<section id="site-entry-list" className="heo-entry-directory">/, "homepage should render a dedicated site entry directory section");
  assert.match(source, /displaySiteEntryGroups\.map\(\(group\) => \([\s\S]*<div className="heo-entry-group" key=\{group\.title\}>/, "entry directory should render dynamic grouped sections");
  assert.match(source, /group\.items\.map\(\(item\) => \([\s\S]*className=\{`heo-entry-item \$\{isHomepageXiaowanziEntry\(item\.href\) \? "is-xiaowanzi-entry" : ""\}`\}/, "entry directory should render each entry with Xiaowanzi entry support");
  assert.match(source, /key=\{`\$\{group\.title\}-\$\{item\.href\}-\$\{item\.title\}`\}/, "entry directory should use stable composite keys for real repeated content");
  assert.match(source, /<span className=\{`heo-entry-icon tone-\$\{item\.tone\}`\} aria-hidden="true">[\s\S]*<i \/>[\s\S]*<\/span>/, "entry icons should be local CSS illustrations, not copied image assets");
  assert.match(source, /\.heo-entry-directory \{[\s\S]*background: #16171d;[\s\S]*border-radius: 34px;/, "entry directory should use a dark reference-style panel");
  assert.match(source, /\.heo-entry-grid \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/, "entry directory should use a three-column app list on desktop");
  assert.match(source, /\.heo-entry-title-row b \{[\s\S]*display: -webkit-box;[\s\S]*-webkit-line-clamp: 2;/, "entry titles should support real longer content names without breaking the grid");
  assert.match(source, /\.heo-entry-desc \{[\s\S]*display: -webkit-box;[\s\S]*-webkit-line-clamp: 2;/, "entry descriptions should support real longer summaries without breaking the grid");
});

test("landing site entry directory pulls concrete topics and worthbuy analyses", () => {
  assert.match(source, /const \[topicDirectoryItems, setTopicDirectoryItems\] = useState<SiteEntryItem\[\]>\(\[\]\)/, "homepage should keep live topic preview entries in state");
  assert.match(source, /const \[worthBuyDirectoryItems, setWorthBuyDirectoryItems\] = useState<SiteEntryItem\[\]>\(\[\]\)/, "homepage should keep live worthbuy preview entries in state");
  assert.match(source, /loadJson\("\/api\/topic-hub\?limit=6"\)/, "homepage should fetch public topic content for the directory");
  assert.match(source, /loadJson\("\/api\/worthbuy\/list"\)/, "homepage should fetch public worthbuy content for the directory");
  assert.match(source, /setTopicDirectoryItems\(buildTopicDirectoryItems\(topics\)\)/, "topic API data should be normalized into entry rows");
  assert.match(source, /setWorthBuyDirectoryItems\(buildWorthBuyDirectoryItems\(worthBuyItems\)\)/, "worthbuy API data should be normalized into entry rows");
  assert.match(source, /const displaySiteEntryGroups = useMemo<SiteEntryGroup\[\]>\(\(\) => \{[\s\S]*title: "请教一下"[\s\S]*items: topicDirectoryItems\.length > 0 \? topicDirectoryItems : fallbackTopicDirectoryItems[\s\S]*title: "知物"[\s\S]*items: worthBuyDirectoryItems\.length > 0 \? worthBuyDirectoryItems : fallbackWorthBuyDirectoryItems/, "directory should insert real topic and worthbuy content groups between the static entry groups");
  assert.match(source, /href: `\/topics\/\$\{encodeURIComponent\(slug\)\}`/, "topic entries should deep link to the concrete topic detail route");
  assert.match(source, /href: `\/worthbuy\/\$\{encodeURIComponent\(query\)\}`/, "worthbuy entries should deep link to concrete analysis detail routes");
});

test("landing program list entries point to the real desktop list route", () => {
  assert.doesNotMatch(source, /href: "\/programs"(?!\/)/, "homepage should not link to the legacy embedded program index");
  assert.match(source, /title: "节目列表"[\s\S]*href: "\/programs\/list"/, "site entries should include the real program list route");
  assert.match(source, /title: "节目案例"[\s\S]*href: "\/programs\/list"/, "case entry should now point to the real program list");
  assert.match(source, /<a className="heo-button primary" href="\/programs\/list">进入节目列表<\/a>/, "hero program CTA should use the real list route");
});

test("landing Xiaowanzi entries open the desktop chat panel instead of super mode", () => {
  assert.match(source, /const HOMEPAGE_XIAOWANZI_ENTRY_HREFS = new Set\(\["\/index-xiaowanzi\.html"\]\)/, "Xiaowanzi standalone href should be intercepted on desktop");
  assert.match(source, /const XIAOWANZI_DESKTOP_FULLSCREEN_BREAKPOINT = 769;/, "desktop-only Xiaowanzi interception should keep mobile standalone navigation");
  assert.match(source, /function isHomepageXiaowanziEntry\(href: string\): boolean \{[\s\S]*return HOMEPAGE_XIAOWANZI_ENTRY_HREFS\.has\(href\);[\s\S]*\}/, "Xiaowanzi homepage entries should be centralized");
  assert.match(source, /if \(isHomepageXiaowanziEntry\(href\) && window\.innerWidth >= XIAOWANZI_DESKTOP_FULLSCREEN_BREAKPOINT\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*new CustomEvent\("xf-open-xiaowanzi", \{[\s\S]*detail: \{ source: "landing-page", mode: "chat", maximized: true \},[\s\S]*\}/, "desktop Xiaowanzi entries should open the normal chat panel maximized");
  assert.doesNotMatch(source, /mode: "home", desktopFullscreen: true/, "homepage should not open Xiaowanzi super mode for this entry");
  assert.match(source, /onClick=\{\(event\) => handleHomepageEntryClick\(event, item\.href\)\}/, "product and entry cards should use the Xiaowanzi click handler");
  assert.match(source, /const openXiaowanziHome = \(\) => \{[\s\S]*detail: \{ source: "landing-topbar", mode: "home" \}/, "topbar Xiaowanzi avatar should use home mode while entry cards keep chat mode");
});

test("landing homepage uses a light page background with target-style dark product cards", () => {
  assert.match(source, /--lp-bg: #f3f7fb;/, "page background should use the requested light base");
  assert.match(source, /--lp-panel: rgba\(255, 255, 255, 0\.9\);/, "general panels should move to light surfaces");
  assert.match(source, /--lp-primary: #24a8f2;/, "primary actions should use the target site's bright blue accent");
  assert.match(source, /\.landing-root \{[\s\S]*linear-gradient\(180deg, #eef6ff 0%, #f7f9fd 42%, #eef4fb 100%\);/, "whole homepage should use a light background gradient");
  assert.match(source, /\.heo-first-screen \{[\s\S]*--lp-text: #f5f7fb;[\s\S]*linear-gradient\(180deg, #17181f 0%, #15161d 62%, #17181f 100%\);/, "first screen can retain the dark brand atmosphere while the page body is light");
  assert.match(source, /\.heo-login-link \{[\s\S]*background: var\(--lp-primary\);[\s\S]*box-shadow: 0 14px 28px rgba\(36, 168, 242, 0\.28\);/, "topbar primary action should use target blue glow");
  assert.match(source, /\.tone-deep \{[\s\S]*--card-bg: #061b2d;[\s\S]*--card-fg: #fff;/, "product cards should move from pastel colors to dark solid panels");
  assert.doesNotMatch(source, /--lp-bg: #17181f;/, "homepage body should not remain fully dark");
  assert.doesNotMatch(source, /--card-bg: #c9f3df;|--card-bg: #fff0a8;|--card-bg: #cde9ff;|--card-bg: #ffd3e3;|--card-bg: #e8dcff;/, "product card tones should not keep macaron backgrounds");
});

test("landing featured case-wall section is fully removed", () => {
  assert.doesNotMatch(source, /case-wall/, "homepage should not keep case-wall anchors or sections");
  assert.doesNotMatch(source, /LandingCaseItem|fallbackCases|buildProgramCase|buildBookCase|buildMaterialCase/, "homepage should not keep case-wall data builders");
  assert.doesNotMatch(source, /activeTag|visibleCount|filteredItems|visibleItems|CASE_PAGE_SIZE|CASE_MAX_PROGRAMS/, "homepage should not keep case-wall filtering and pagination state");
  assert.doesNotMatch(source, /heo-activity-toolbar|heo-case-grid|heo-case-card|heo-case-media|heo-case-body|heo-case-action/, "homepage should not keep case-wall CSS or markup");
  assert.doesNotMatch(source, /精选内容与案例|正在加载案例|加载更多案例/, "homepage should not render case-wall copy");
});
