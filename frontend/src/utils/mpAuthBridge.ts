declare global {
  interface Window {
    wx?: {
      miniProgram?: {
        navigateTo?: (options: { url: string }) => void;
        navigateBack?: (options: { delta?: number }) => void;
        getEnv?: (callback: (res: { miniprogram?: boolean }) => void) => void;
        postMessage?: (options: { data: Record<string, unknown> }) => void;
        redirectTo?: (options: { url: string }) => void;
        reLaunch?: (options: { url: string }) => void;
        switchTab?: (options: { url: string }) => void;
      };
    };
    WeixinJSBridge?: unknown;
  }
}

const WECHAT_JSSDK_URL = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
let wechatJssdkLoading: Promise<boolean> | null = null;
const WECHAT_JSSDK_LOAD_TIMEOUT_MS = 4000;
const MINI_PROGRAM_FONT_SCALES: Record<string, string> = {
  small: "0.95",
  standard: "1",
  large: "1.1"
};

function markMiniProgramWebView() {
  window.sessionStorage.setItem("xf_mp_webview", "1");
  document.documentElement.classList.add("xf-mp-webview");
}

function hasMiniProgramBridge() {
  return Boolean(
    window.wx?.miniProgram?.navigateTo ||
      window.wx?.miniProgram?.navigateBack ||
      window.wx?.miniProgram?.getEnv ||
      window.wx?.miniProgram?.postMessage ||
      window.wx?.miniProgram?.reLaunch ||
      window.wx?.miniProgram?.switchTab
  );
}

export function isMiniProgramWebView() {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  const wechatEnvironment = String((window as any).__wxjs_environment || "").toLowerCase();
  const userAgent = String(window.navigator?.userAgent || "");
  const referrer = String(document.referrer || "").toLowerCase();
  const detected = (
    url.searchParams.get("xf_mp") === "1" ||
    url.searchParams.has("xf_tab") ||
    window.sessionStorage.getItem("xf_mp_webview") === "1" ||
    document.documentElement.classList.contains("xf-mp-webview") ||
    referrer.includes("servicewechat.com/") ||
    wechatEnvironment === "miniprogram" ||
    /miniprogram/i.test(userAgent)
  );
  if (detected) {
    markMiniProgramWebView();
  }
  return detected;
}

function waitForWeixinBridgeReady() {
  if (window.WeixinJSBridge || hasMiniProgramBridge()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      document.removeEventListener("WeixinJSBridgeReady", finish);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, WECHAT_JSSDK_LOAD_TIMEOUT_MS);
    document.addEventListener("WeixinJSBridgeReady", finish, { once: true });
  });
}

async function detectMiniProgramEnvironment() {
  const getEnv = window.wx?.miniProgram?.getEnv;
  if (!getEnv) return isMiniProgramWebView();
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (inMiniProgram: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (inMiniProgram) markMiniProgramWebView();
      resolve(inMiniProgram || isMiniProgramWebView());
    };
    const timer = window.setTimeout(() => finish(isMiniProgramWebView()), 500);
    try {
      getEnv((res) => finish(Boolean(res?.miniprogram)));
    } catch (_error) {
      finish(isMiniProgramWebView());
    }
  });
}

async function waitForMiniProgramBridge() {
  await waitForWeixinBridgeReady();
  const inMiniProgram = await detectMiniProgramEnvironment();
  return hasMiniProgramBridge() || inMiniProgram;
}

function loadWechatJssdk() {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(false);
  if (hasMiniProgramBridge()) return waitForMiniProgramBridge();
  if (wechatJssdkLoading) return wechatJssdkLoading;

  wechatJssdkLoading = new Promise((resolve) => {
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(loaded);
    };
    const timer = window.setTimeout(() => finish(hasMiniProgramBridge()), WECHAT_JSSDK_LOAD_TIMEOUT_MS);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${WECHAT_JSSDK_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => void waitForMiniProgramBridge().then(finish), { once: true });
      existing.addEventListener("error", () => finish(false), { once: true });
      void waitForMiniProgramBridge().then(finish);
      return;
    }

    const script = document.createElement("script");
    script.src = WECHAT_JSSDK_URL;
    script.async = true;
    script.onload = () => void waitForMiniProgramBridge().then(finish);
    script.onerror = () => finish(false);
    document.head.appendChild(script);
  });

  return wechatJssdkLoading;
}

export async function openMiniProgramNativeLogin() {
  if (typeof window === "undefined") return false;
  await loadWechatJssdk();
  const currentWebviewLoginUrl = `/pages/webview/index?url=${encodeURIComponent(window.location.href)}&title=${encodeURIComponent(document.title || "家长先疯")}&login=1`;
  const redirectTo = window.wx?.miniProgram?.redirectTo;
  if (isMiniProgramWebView() && redirectTo) {
    redirectTo({ url: currentWebviewLoginUrl });
    return true;
  }

  const navigateTo = window.wx?.miniProgram?.navigateTo;
  if (!navigateTo) return false;

  navigateTo({
    url: isMiniProgramWebView()
      ? currentWebviewLoginUrl
      : `/pages/xiaowanzi/index?login=1&redirect=${encodeURIComponent(window.location.href)}`
  });
  return true;
}

export async function openMiniProgramXiaowanziChat() {
  if (typeof window === "undefined") return false;
  await loadWechatJssdk();
  const navigateBack = window.wx?.miniProgram?.navigateBack;
  if (navigateBack) {
    navigateBack({ delta: 1 });
    return true;
  }

  const navigateTo = window.wx?.miniProgram?.navigateTo;
  if (!navigateTo) return false;

  navigateTo({
    url: "/pages/xiaowanzi-exit/index"
  });
  return true;
}

async function openMiniProgramNativeArchive(action: "select" | "add") {
  if (typeof window === "undefined") return false;
  const postArchiveMessage = () => {
    const postMessage = window.wx?.miniProgram?.postMessage;
    if (!postMessage) return false;
    postMessage({
      data: {
        type: "xianfeng:xiaowanzi-open-archive",
        action
      }
    });
    return true;
  };
  const requestNativeAction = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("xf_native_action", action === "add" ? "archive_add" : "archive_select");
      url.searchParams.set("xf_native_action_ts", String(Date.now()));
      window.location.replace(url.toString());
      return true;
    } catch (_error) {}
    return false;
  };

  if (postArchiveMessage()) return true;

  void loadWechatJssdk().then(() => {
    if (postArchiveMessage()) return;
    requestNativeAction();
  });

  return true;
}

export async function openMiniProgramNativeArchivePicker() {
  return openMiniProgramNativeArchive("select");
}

export async function openMiniProgramNativeArchiveCreate() {
  return openMiniProgramNativeArchive("add");
}

export async function openMiniProgramNativePro(plan?: "plus" | "pro") {
  if (typeof window === "undefined") return false;
  await loadWechatJssdk();
  const navigateTo = window.wx?.miniProgram?.navigateTo;
  if (!isMiniProgramWebView() || !navigateTo) return false;
  navigateTo({
    url: `/pages/pro/index?${plan ? `plan=${encodeURIComponent(plan)}&` : ""}from=webview`
  });
  return true;
}

export async function forceExitMiniProgramXiaowanzi() {
  if (typeof window === "undefined") return false;
  await loadWechatJssdk();
  const reLaunch = window.wx?.miniProgram?.reLaunch;
  if (reLaunch) {
    reLaunch({ url: "/pages/programs/index" });
    return true;
  }

  const switchTab = window.wx?.miniProgram?.switchTab;
  if (switchTab) {
    switchTab({ url: "/pages/programs/index" });
    return true;
  }

  return false;
}

export function hydrateMiniProgramAuthFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!isMiniProgramWebView()) return;

  window.sessionStorage.setItem("xf_mp_webview", "1");
  document.documentElement.classList.add("xf-mp-webview");
  hydrateMiniProgramFontFromUrl(url);

  const token = (url.searchParams.get("xf_token") || "").trim();
  if (!token) return;

  window.localStorage.setItem("token", token);
  url.searchParams.delete("xf_token");
  window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function hydrateMiniProgramFontFromUrl(url = new URL(window.location.href)) {
  const rawFontSize = (url.searchParams.get("xf_font") || window.localStorage.getItem("xf_mp_font_size") || "standard").trim();
  const fontSize = MINI_PROGRAM_FONT_SCALES[rawFontSize] ? rawFontSize : "standard";
  const scale = MINI_PROGRAM_FONT_SCALES[fontSize] || MINI_PROGRAM_FONT_SCALES.standard;
  document.documentElement.classList.remove("xf-mp-font-small", "xf-mp-font-standard", "xf-mp-font-large");
  document.documentElement.classList.add(`xf-mp-font-${fontSize}`);
  document.documentElement.style.setProperty("--xf-user-font-scale", scale);
  window.localStorage.setItem("xf_mp_font_size", fontSize);
  window.localStorage.setItem("xf_font_scale", scale);
  url.searchParams.delete("xf_font");
  window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
}
