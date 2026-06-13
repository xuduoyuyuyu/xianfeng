# 家长先疯 App 工程

这个目录管理 Android 和 iOS 原生 App 壳。它不复制业务代码，直接使用 `../../frontend/dist` 作为 Capacitor WebView 内容。

## 一次性准备

```bash
cd apps/mobile
npm install
npm run add:android
npm run add:ios
```

`apps/mobile/.env` 里的 `VITE_API_URL` 必须是线上 HTTPS API 源，例如：

```bash
VITE_API_URL=https://xianfeng.xinzhi.info
```

不要使用 `localhost` 或 `127.0.0.1`，真机 App 访问不到本机 Vite/Express 端口。

检查本机打包环境：

```bash
npm run doctor:env
```

## 同步前端到原生工程

```bash
cd apps/mobile
npm run sync
```

这个命令会先用 App 环境变量构建 `frontend/dist`，再执行 `cap sync` 同步到 Android 和 iOS。

也可以只同步单端：

```bash
npm run sync:android
npm run sync:ios
```

iOS 需要本机安装完整 Xcode，而不是只安装 Command Line Tools。若 `xcode-select -p` 输出 `/Library/Developer/CommandLineTools`，先执行：

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

## 打开原生工程

```bash
npm run open:android
npm run open:ios
```

Android 用 Android Studio 打 APK/AAB；iOS 用 Xcode 配置 Team、签名、Bundle ID 后打 TestFlight。

也可以先用命令行打 Android debug APK：

```bash
npm run build:android:debug
```

输出路径：

```bash
apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

release 包需要先配置 Android 签名，再运行：

```bash
npm run build:android:release
```

## 当前边界

- App 包含用户端现有前台能力。
- 后端、Mongo、AI、支付密钥、上传处理仍由线上服务负责。
- 后台管理端不建议作为第一版 App 主入口；需要时可后续单独决定入口和权限策略。
