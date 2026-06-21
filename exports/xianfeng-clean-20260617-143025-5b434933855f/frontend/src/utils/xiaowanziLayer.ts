import { useEffect, useState } from "react";

export const XIAOWANZI_LAYER_DESKTOP_BREAKPOINT = 769;

type XiaowanziLayerWindow = Window & {
  __xfXiaowanziEmbeddedLayer?: boolean;
};

export function isXiaowanziEmbeddedLayer(): boolean {
  if (typeof window === "undefined") return false;
  const scopedWindow = window as XiaowanziLayerWindow;
  if (window.innerWidth >= XIAOWANZI_LAYER_DESKTOP_BREAKPOINT) {
    scopedWindow.__xfXiaowanziEmbeddedLayer = false;
    return false;
  }
  const active = new URLSearchParams(window.location.search).get("xw_layer") === "1";
  scopedWindow.__xfXiaowanziEmbeddedLayer = active;
  return active;
}

export function withXiaowanziLayerParam(to: string, active = isXiaowanziEmbeddedLayer()): string {
  if (!active) return to;
  if (!to || /^https?:\/\//i.test(to)) return to;
  const [withoutHash, hash = ""] = to.split("#", 2);
  const [path, query = ""] = withoutHash.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("xw_layer", "1");
  const nextQuery = params.toString();
  return `${path}${nextQuery ? `?${nextQuery}` : ""}${hash ? `#${hash}` : ""}`;
}

export function toXiaowanziPublicContentUrl(url: string, title = "", active = isXiaowanziEmbeddedLayer()): string {
  const cleanUrl = String(url || "").trim();
  if (!active || !cleanUrl) return cleanUrl;
  if (/^\/(?!\/)/.test(cleanUrl)) return withXiaowanziLayerParam(cleanUrl, true);
  const params = new URLSearchParams();
  params.set("url", cleanUrl);
  if (String(title || "").trim()) params.set("title", String(title).trim());
  params.set("xw_layer", "1");
  return `/public-content?${params.toString()}`;
}

export function useXiaowanziEmbeddedLayer(): boolean {
  const [active, setActive] = useState(() => isXiaowanziEmbeddedLayer());

  useEffect(() => {
    const update = () => setActive(isXiaowanziEmbeddedLayer());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("popstate", update);
    window.addEventListener("pageshow", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("popstate", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);

  return active;
}
