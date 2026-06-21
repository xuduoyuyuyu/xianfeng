import { useEffect, useState } from "react";

const MOBILE_PAGER_QUERY = "(max-width: 768px)";

export function useIsMobilePager() {
  const [isMobilePager, setIsMobilePager] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(MOBILE_PAGER_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(MOBILE_PAGER_QUERY);
    const update = () => setIsMobilePager(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return isMobilePager;
}
