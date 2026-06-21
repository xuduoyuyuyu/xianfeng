declare global {
  interface Window {
    wx?: {
      miniProgram?: {
        navigateTo?: (options: { url: string }) => void;
      };
    };
  }
}

export function isMiniProgramWebView() {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  return url.searchParams.get("xf_mp") === "1" || window.sessionStorage.getItem("xf_mp_webview") === "1";
}

export function openMiniProgramNativeLogin() {
  if (typeof window === "undefined") return false;
  const navigateTo = window.wx?.miniProgram?.navigateTo;
  if (!navigateTo) return false;

  navigateTo({
    url: `/pages/login/index?redirect=${encodeURIComponent(window.location.href)}`
  });
  return true;
}

export function hydrateMiniProgramAuthFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("xf_mp") !== "1") return;

  window.sessionStorage.setItem("xf_mp_webview", "1");

  const token = (url.searchParams.get("xf_token") || "").trim();
  if (!token) return;

  window.localStorage.setItem("token", token);
  url.searchParams.delete("xf_token");
  window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
}
