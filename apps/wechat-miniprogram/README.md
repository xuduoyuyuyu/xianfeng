# 家长先疯微信小程序

这个目录是独立微信小程序工程，采用混合方案：

- 必要微信能力用原生小程序页：登录、后续小程序支付/分享。
- 小程序使用自定义原生底部 `tabBar` 作为主导航，节目、及阅、小玩子、资料、请教 5 个入口保持可见可点。
- 小玩子底部 tab 只保留头像不显示文字；点击打开当前栏目网页并带 `xf_xw=chat` 普通对话层，长按才通过 `pages/webview` 打开 `/index-xiaowanzi.html?xf_xw=home` 超能页。
- 顶部导航使用 `cover-view` / `cover-image` 覆盖在 web-view 上，保留原生搜索入口和 5 个快捷入口。
- 导航图标放在 `assets/tabbar/`，来源直接对齐网站移动菜单：节目/资料为 Material Symbols 导出 PNG，及阅/小玩子为网站图片资源，请教为网站 emoji 导出 PNG。
- 页面内容只保留 web-view 壳，加载 `https://xianfeng.xinzhi.info` 对应页面；网页内顶部导航和移动底部菜单在 `xf_mp=1` 下隐藏，避免双导航。

## 开发工具导入

在微信开发者工具中导入：

```text
/Volumes/家长先疯/xianfeng/apps/wechat-miniprogram
```

`project.config.json` 里的 `appid` 已配置为当前小程序 AppID。若更换主体或小程序账号，再同步修改这里。

找不到顶部“编译”入口时，可以直接用命令打开或生成预览：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli open --project /Volumes/家长先疯/xianfeng/apps/wechat-miniprogram
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview --project /Volumes/家长先疯/xianfeng/apps/wechat-miniprogram
```

默认入口是 `pages/programs/index`。自定义原生底部 `tabBar` 是小程序主导航；顶部导航提供搜索和快捷入口。网页自己的顶部导航和移动底部菜单会在小程序 web-view 内隐藏。

## 域名配置

当前默认域名在 `utils/config.js`：

```js
WEB_ORIGIN: "https://xianfeng.xinzhi.info"
```

日常开发不要改线上服务器。小程序会优先读取本机覆盖文件：

```text
utils/config.local.js
```

当前本机覆盖建议默认指向线上域名，避免真机预览拿不到本机服务：

```js
WEB_ORIGIN: "https://xianfeng.xinzhi.info"
API_ORIGIN: "https://xianfeng.xinzhi.info"
```

这个文件已被 `.gitignore` 忽略，只用于本地调试。没有这个文件时，小程序自动回到 `https://xianfeng.xinzhi.info`。如果需要临时调试本地网页，再手动改成 `http://127.0.0.1:5173` 或 Mac 的局域网 IP。

本地调试流程：

```bash
cd /Volumes/家长先疯/xianfeng/frontend
npm run dev -- --host 0.0.0.0
```

微信开发者工具里打开：

```text
详情 -> 本地设置 -> 不校验合法域名、web-view 业务域名、TLS 版本以及 HTTPS 证书
```

模拟器可以直接用 `http://127.0.0.1:5173`。真机预览不能用 `127.0.0.1`，需要把 `utils/config.local.js` 改成 Mac 的局域网 IP，例如 `http://192.168.1.23:5173`。

微信公众平台需要配置：

- request 合法域名：`https://xianfeng.xinzhi.info`
- web-view 业务域名：`https://xianfeng.xinzhi.info`

如果线上域名变化，只改 `utils/config.js`。

## 后端环境变量

后端需要配置：

```bash
WECHAT_MINI_APP_ID=
WECHAT_MINI_APP_SECRET=
```

小程序调用 `POST /api/wechat-mini/login`，后端用 `wx.login` 的 code 换 openid，并返回现有 JWT。

上线前验证：

```bash
curl -s -i -X POST https://xianfeng.xinzhi.info/api/wechat-mini/login \
  -H 'Content-Type: application/json' \
  -d '{"code":"fake-code"}'
```

期望看到微信返回的 `invalid code`。如果返回“微信小程序未配置”，说明线上后端还没有设置上述两个环境变量。

## 当前页面

- `pages/programs`：原生节目列表，详情通过 `pages/webview` 打开 `/programs/:id`。
- `pages/reading`：原生及阅书单，详情通过 `pages/webview` 打开 `/reading/:id`。
- `pages/xiaowanzi`：旧 tab 占位兼容桥；实际底部入口直接 `navigateTo` 到 `pages/webview` 加载 `/index-xiaowanzi.html?xf_xw=home`。
- `pages/materials`：原生资料列表，详情通过 `pages/webview` 打开 `/materials/:id`。
- `pages/topics`：原生请教话题列表，详情复用 `pages/webview` 的原生话题模式渲染，相关话题在同一原生容器内切换；详情引用的未原生化复杂内容可继续通过 WebView 打开。
- `pages/search`：原生大搜页，聚合节目、及阅、资料、请教和智库；详情仍通过 `pages/webview` 承载。
- `pages/home`：旧入口兼容页，通过 `wx.switchTab` 跳转到 `pages/programs/index`。
- `pages/pro`：原生订阅页。
- `pages/mine`：原生个人中心；`archive`、`memory`、`settings` 子页为原生半屏面板内容，样式对齐移动网页。
- 登录：各原生页面在当前页直接通过 `getPhoneNumber` 授权，不再进入独立登录页。
- `pages/webview`：通用 web-view 包装页，供非 tab 跳转复用；壳层返回按钮回到对应原生列表 tab。
