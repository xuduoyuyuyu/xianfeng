# 小程序底栏小玩子图标比例调整设计

## 目标

将微信小程序原生底栏中间的小玩子图标放大，使其有效图形比例更接近移动网页底栏，同时保留现有素材与交互。

## 设计

- 仅修改 `apps/wechat-miniprogram/custom-tab-bar/index.wxss`。
- 将 `.xf-custom-tabbar__icon.is-xiaowanzi-icon` 的宽高从 `42px` 调整为 `48px`。
- 将 `.xf-custom-tabbar__orb` 的宽高同步调整为 `48px`，避免图标受承载层尺寸限制。
- 不修改底栏整体高度、五等分布局、点击区域、按压动画、页面跳转和其他四个图标。
- 不替换图片素材。

## 验证

- 先更新现有静态测试，使其要求小玩子图标和承载层均为 `48px`，并确认测试在实现前失败。
- 完成样式调整后运行 `apps/wechat-miniprogram/pages/tab-webview.static.test.mjs`。
- 使用微信开发者工具或真机检查底栏视觉比例；自动测试只验证样式契约，不能替代视觉验收。

