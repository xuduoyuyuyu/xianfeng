# 家长先疯微信小程序

这个目录是独立微信小程序工程，采用混合方案：

- 必要微信能力用原生小程序页：登录、tab 导航、我的状态、后续小程序支付/分享。
- 已成熟的业务页面用 `web-view` 加载线上站点：节目、Pro、资料、搜索、小玩子等。

## 开发工具导入

在微信开发者工具中导入：

```text
/Volumes/家长先疯/xianfeng/apps/wechat-miniprogram
```

`project.config.json` 里的 `appid` 当前是 `touristappid`，正式联调时改成真实小程序 AppID。

## 域名配置

当前默认域名在 `utils/config.js`：

```js
WEB_ORIGIN: "https://xianfeng.xinzhi.info"
```

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

## 当前页面

- `pages/home`：原生首页入口。
- `pages/programs`：web-view 加载 `/programs`。
- `pages/xiaowanzi`：登录后 web-view 加载 `/xiaowanzi?xw_layer=1`。
- `pages/pro`：web-view 加载 `/pro`。
- `pages/mine`：原生账号状态。
- `pages/login`：原生微信登录。
- `pages/webview`：通用 web-view 包装页。
