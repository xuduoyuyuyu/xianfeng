export function hydrateMiniProgramAuthFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("xf_mp") !== "1") return;

  const token = (url.searchParams.get("xf_token") || "").trim();
  if (!token) return;

  window.localStorage.setItem("token", token);
  url.searchParams.delete("xf_token");
  window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
}
