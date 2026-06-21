# 家长先疯微信小程序

这个目录是独立微信小程序工程，采用混合方案：

- 必要微信能力用原生小程序页：登录、后续小程序支付/分享。
- 小程序底部使用原生 `tabBar`，菜单项直接对齐网站移动菜单：节目、及阅、小玩子、资料、请教。
- tab 图标放在 `assets/tabbar/`，来源直接对齐网站移动菜单：节目/资料为 Material Symbols 导出 PNG，及阅/小玩子为网站图片资源，请教为网站 emoji 导出 PNG。
- tab 页面内容只保留 web-view 壳，加载 `https://xianfeng.xinzhi.info` 对应页面；网页内移动底部菜单在 `xf_mp=1` 下隐藏，避免双导航。

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

默认入口是 `pages/programs/index`。原生 `tabBar` 是小程序主导航，网页自己的移动底部菜单会在小程序 web-view 内隐藏。

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

上线前验证：

```bash
curl -s -i -X POST https://xianfeng.xinzhi.info/api/wechat-mini/login \
  -H 'Content-Type: application/json' \
  -d '{"code":"fake-code"}'
```

期望看到微信返回的 `invalid code`。如果返回“微信小程序未配置”，说明线上后端还没有设置上述两个环境变量。

## 当前页面

- `pages/programs`：tab 页，直接加载 `/programs/list`。
- `pages/reading`：tab 页，直接加载 `/reading`。
- `pages/xiaowanzi`：tab 页，直接加载 `/xiaowanzi?xw_layer=1`。
- `pages/materials`：tab 页，直接加载 `/materials`。
- `pages/topics`：tab 页，直接加载 `/topics`。
- `pages/home`：备用 web-view 页，直接加载 `/`。
- `pages/pro`：备用 web-view 页，直接加载 `/pro`。
- `pages/mine`：备用 web-view 页，直接加载 `/profile`。
- `pages/login`：原生微信登录。
- `pages/webview`：通用 web-view 包装页，供非 tab 跳转复用。
