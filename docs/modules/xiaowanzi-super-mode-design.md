# Xiaowanzi Super Mode Design

## For

- Defines the mobile source-of-truth interaction model for Xiaowanzi super mode.
- Guides the mini-program native implementation in `apps/wechat-miniprogram/pages/xiaowanzi/`.
- Keeps the super-mode design tokens, icons, panels, and conversation utilities aligned with the mobile web implementation in `frontend/src/wel/components/XiaowanziWidget.tsx`.

## Not For

- Backend AI routing, billing, or memory merge rules.
- General mini-program tab navigation outside the Xiaowanzi tab.
- Marketing homepage design.

## Mobile Reference Elements

- Home surface: soft lavender background, Xiaowanzi robot avatar, "哈喽" greeting, star badge, prompt card, rounded prompt rows, privacy hint, pill composer, voice button, purple send button, and detached plus button.
- Prompt fallback copy: when topic-hub data or local prompt cache is unavailable, the native page should still show mobile-reference topic rows such as "孩子玩电脑游戏的引导与游戏选择？", "窝沟封闭黄金年龄？", and "双语民办幼儿园回家还要加餐么？" instead of generic placeholder parenting prompts.
- Home prompt submit: tapping a prompt row under "可以这样问" immediately submits that question through the normal Xiaowanzi send flow; it should not require a second tap on the send button.
- Login gate: unauthenticated users stay visually on the Xiaowanzi native page. The page uses a transparent in-page `getPhoneNumber` authorization layer so the first current-page tap can request the phone login sheet; it must not navigate to `/pages/login/index`, show a white login interstitial, or render a separate inline login state in the composer.
- Home prompt bubble: the right-aligned purple question appears after the user taps or types a prompt. The initial home state keeps only the three prompt rows and the child-context hint below the card.
- Home pending reply: after sending from the home prompt card, the pending assistant state is a compact white "小玩子思考中" bubble with three lavender dots, not a full assistant answer card.
- Assistant answer links: topic Markdown links inside answer cards render as purple underlined native text buttons and open the topic detail webview while preserving the Xiaowanzi return layer.
- Left hamburger: opens the history conversation drawer, not the child archive panel. The drawer contains a pill "新对话" action, "历史会话" heading, white history cards with title/time/child tag, and a purple circular exit control.
- History drawer geometry: the drawer covers the native Xiaowanzi top shell from the page top while keeping the mini-program status/capsule region naturally visible, occupies about 72% of viewport width, and leaves a right-side dark blurred strip over the previous Xiaowanzi surface.
- Bottom plus: toggles the attachment dock. Open state changes the plus to close, lifts the composer, and shows three actions: 拍照, 上传图片, 上传文件.
- Message share: selecting a shareable assistant reply enters "选择对话" mode, shows checkmarks on paired Q/A messages, and opens a bottom sheet with 微信好友, 生成图片, 复制内容, plus the privacy notice.
- Message share content: generated images, WeChat share titles, and copied text render Markdown topic links as display text only; they must not expose `/topics/...`, `xw_layer`, or `xw_return` route parameters inside the shared body.
- Message share selected state: user bubbles keep their purple bubble shape with a small circular check near the upper-right; assistant answers highlight the answer card/panel border with a purple circular check near the upper-right, not a generic outer row frame.
- Share bottom sheet geometry: the sheet is tall and calm rather than compact. It keeps a large gap between the title/cancel row, the "将1轮对话分享至" copy, the three circular channel icons, and the privacy notice.
- Child profile: remains a secondary context action in the home content flow below the prompt or answer card via 关联/切换. It scrolls with the last card instead of staying fixed in the composer. It opens a bottom "选择咨询人" sheet with child cards and a fixed bottom action row: 取消 on the left and 新增孩子 on the right. It must not occupy the hamburger slot.
- Top shell: keep hamburger, Xiaowanzi avatar, and the "先疯智库" pill only. The mobile vertical-more control is not shown on the mini-program Xiaowanzi native page.

## Design Asset Map

- Xiaowanzi hero avatar: use the original no-hat robot avatar supplied for Xiaowanzi, packaged as `apps/wechat-miniprogram/assets/wel-avatar/no-hat.png`. The native page keeps the mobile 132px hero avatar footprint and 20px gap before the greeting copy. It should not be replaced by generated character variants unless the mobile reference changes.
- Xiaowanzi hero copy: mirror the mobile web hierarchy. The greeting remains 24px-equivalent, the star badge is 28px-equivalent, and the title uses the mobile 27px-equivalent size with natural wrapping instead of a forced single-line mini-program title.
- Xiaowanzi topbar avatar: use the same original no-hat robot avatar from `apps/wechat-miniprogram/assets/wel-avatar/no-hat.png`, so the native shell does not introduce generated avatar variants. The native topbar left group keeps the hamburger slot at `84rpx`, the avatar at `166rpx`, and the avatar footprint at `72rpx` wide by `36px` high so it lines up with the mobile reference instead of hugging the page edge.
- Xiaowanzi topbar avatar rotation: use the mobile `wel_avatar_index` and `wel_avatar_click_count` keys. Advance the count only when an explicit Xiaowanzi entry marker is consumed or when the topbar avatar itself is tapped; ordinary mini-program `onShow` returns must not count. Switch to the next packaged topbar avatar only after 5 triggers.
- Knowledge pill logo: use `apps/wechat-miniprogram/assets/share/xianfeng-round-logo.png`, matching the mobile "先疯智库" entry rather than the Xiaowanzi avatar. Keep the mini-program asset in PNG format for real-device compatibility. The pill keeps the mobile 38px entry height and stays vertically centered against the WeChat capsule. Tapping it opens `https://xianfeng.xinzhi.info/experts?xw_layer=1&xw_return=xiaowanzi` through the mini-program webview.
- Share-card brand logo: draw the provided transparent Xiaowanzi wordmark from `apps/wechat-miniprogram/assets/xiaowanzi-icons/share-logo.png` on the generated canvas, so the preview header shows the Xiaowanzi robot plus "小玩子" text instead of the avatar-only mark.
- Hamburger, voice, send, plus/close, attachment, assistant-card share, and history-exit icons use packaged mini-program image assets exported from the same mobile icon source, under `apps/wechat-miniprogram/assets/xiaowanzi-icons/`. Prompt hash, arrows, and selected-check marks may remain native WXSS shapes. All of these icons should keep the same slot, size, and semantic role as the mobile design.
- Child association uses the content-flow hint text and child picker sheet only. The hamburger slot is reserved for history; the detached plus slot is reserved for attachments; the assistant card share glyph is reserved for share selection.

## Mini-Program Native Contract

- `pages/xiaowanzi/index` remains a native page and must not wrap the primary experience in `web-view`.
- The native page should reuse the same visual rhythm and icon semantics as mobile web. Controls that depend on Material Symbols in mobile web should be converted to packaged image assets or simulator-proven native shapes.
- History drawer cards come from the native session index first, then fall back to the currently loaded history. Each saved session stores its paired messages locally so tapping a history card restores the full conversation without a web-view round trip.
- The child association sheet should select an existing child in place without leaving the Xiaowanzi page. Only "新增孩子" opens the archive edit panel.
- Attachment and share panels must be normal mini-program native controls; actions that are not fully implemented should show honest native feedback instead of pretending completion.
- WeChat native share remains available through `open-type="share"` where the platform requires it.
