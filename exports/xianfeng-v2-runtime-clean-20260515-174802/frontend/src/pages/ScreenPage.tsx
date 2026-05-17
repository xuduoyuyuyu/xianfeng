import React, { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  title: string;
};

const ScreenPage: React.FC<Props> = ({ src, title }) => {
  const failSafeTimer = useRef<number | null>(null);
  const syncTimer = useRef<number | null>(null);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [srcSlots, setSrcSlots] = useState<[string, string]>([src, "about:blank"]);
  const [loadingSlot, setLoadingSlot] = useState<0 | 1 | null>(0);
  const srcSlotsRef = useRef<[string, string]>([src, "about:blank"]);
  const loadingSlotRef = useRef<0 | 1 | null>(0);
  const frame0Ref = useRef<HTMLIFrameElement | null>(null);
  const frame1Ref = useRef<HTMLIFrameElement | null>(null);

  function shouldInterceptPath(pathname: string): boolean {
    return /^\/(programs(\/[^/]+)?|books|materials|articles|experts(\/[^/]+)?|community)$/.test(pathname);
  }

  function bindFrameNavigation(frame: HTMLIFrameElement | null): void {
    const frameWindow = frame?.contentWindow;
    const frameDocument = frameWindow?.document;
    if (!frameWindow || !frameDocument) return;
    if ((frameDocument as any).__xfNavBound) return;

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (event.button !== 0) return;

      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;

      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

      let nextUrl: URL;
      try {
        nextUrl = new URL(href, window.location.origin);
      } catch (_error) {
        return;
      }
      if (nextUrl.origin !== window.location.origin) return;
      if (!shouldInterceptPath(nextUrl.pathname)) return;

      const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextPath === currentPath) return;

      event.preventDefault();
      event.stopPropagation();
      window.history.pushState({}, "", nextPath);
      window.dispatchEvent(new PopStateEvent("popstate"));
    };

    frameDocument.addEventListener("click", onClick, true);
    (frameDocument as any).__xfNavBound = true;
  }

  useEffect(() => {
    return () => {
      if (failSafeTimer.current) {
        window.clearTimeout(failSafeTimer.current);
        failSafeTimer.current = null;
      }
      if (syncTimer.current) {
        window.clearInterval(syncTimer.current);
        syncTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    srcSlotsRef.current = srcSlots;
  }, [srcSlots]);

  useEffect(() => {
    loadingSlotRef.current = loadingSlot;
  }, [loadingSlot]);

  useEffect(() => {
    const currentSrc = srcSlotsRef.current[activeSlot];
    if (src === currentSrc) return;
    const nextSlot: 0 | 1 = activeSlot === 0 ? 1 : 0;

    const nextAlreadyLoaded = srcSlotsRef.current[nextSlot] === src;
    if (nextAlreadyLoaded) {
      setActiveSlot(nextSlot);
      setLoadingSlot(null);
      return;
    }

    setSrcSlots((prev) => (nextSlot === 0 ? [src, prev[1]] : [prev[0], src]));
    setLoadingSlot(nextSlot);
  }, [src, activeSlot]);

  useEffect(() => {
    if (loadingSlot === null) return;
    if (failSafeTimer.current) window.clearTimeout(failSafeTimer.current);

    const slot = loadingSlot;
    const target = slot === 0 ? frame0Ref.current : frame1Ref.current;

    const readyCheck = window.setTimeout(() => {
      if (loadingSlotRef.current !== slot) return;
      try {
        bindFrameNavigation(target || null);
        if (target?.contentDocument?.readyState === "complete") {
          onFrameLoad(slot);
        }
      } catch (_e) {}
    }, 0);

    failSafeTimer.current = window.setTimeout(() => {
      if (loadingSlotRef.current !== slot) return;
      setLoadingSlot(null);
    }, 3000);

    return () => {
      window.clearTimeout(readyCheck);
      if (failSafeTimer.current) {
        window.clearTimeout(failSafeTimer.current);
        failSafeTimer.current = null;
      }
    };
  }, [loadingSlot]);

  function onFrameLoad(slot: 0 | 1) {
    const frame = slot === 0 ? frame0Ref.current : frame1Ref.current;
    bindFrameNavigation(frame);
    try {
      const frameWindow = frame?.contentWindow;
      const nextPathname = frameWindow?.location?.pathname || "";
      const nextSearch = frameWindow?.location?.search || "";
      const nextHash = frameWindow?.location?.hash || "";
      if (nextPathname && shouldInterceptPath(nextPathname)) {
        const nextPath = `${nextPathname}${nextSearch}${nextHash}`;
        const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (nextPath !== currentPath) {
          window.history.pushState({}, "", nextPath);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
      }
    } catch (_e) {}
    if (loadingSlot === null) return;
    if (slot !== loadingSlot) return;
    setActiveSlot(slot);
    setLoadingSlot(null);
  }

  function syncParentUrlFromFrame(frame: HTMLIFrameElement | null): void {
    try {
      const frameWindow = frame?.contentWindow;
      if (!frameWindow) return;
      const pathname = frameWindow.location.pathname || "";
      const search = frameWindow.location.search || "";
      const hash = frameWindow.location.hash || "";
      let nextPath = "";

      if (shouldInterceptPath(pathname)) {
        nextPath = `${pathname}${search}${hash}`;
      } else if (pathname === "/wel/index.html") {
        const params = new URLSearchParams(search || "");
        const page = String(params.get("page") || "").trim();
        if (page === "61") {
          nextPath = "/programs";
        } else if (page === "63") {
          nextPath = "/experts";
        } else if (page === "podcast-detail") {
          const programId = String(params.get("programId") || "").trim();
          if (programId) nextPath = `/programs/${encodeURIComponent(programId)}`;
        }
      }

      if (!nextPath) return;
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextPath !== currentPath) {
        window.history.pushState({}, "", nextPath);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    } catch (_e) {}
  }

  useEffect(() => {
    if (syncTimer.current) {
      window.clearInterval(syncTimer.current);
      syncTimer.current = null;
    }
    syncTimer.current = window.setInterval(() => {
      const frame = activeSlot === 0 ? frame0Ref.current : frame1Ref.current;
      syncParentUrlFromFrame(frame);
    }, 250);
    return () => {
      if (syncTimer.current) {
        window.clearInterval(syncTimer.current);
        syncTimer.current = null;
      }
    };
  }, [activeSlot]);

  return (
    <main className="screen-shell relative" aria-label={title}>
      <iframe
        className="screen-frame absolute inset-0"
        style={{ top: 0, opacity: activeSlot === 0 ? 1 : 0, pointerEvents: activeSlot === 0 ? "auto" : "none" }}
        src={srcSlots[0]}
        title={title}
        ref={frame0Ref}
        onLoad={() => onFrameLoad(0)}
      />
      <iframe
        className="screen-frame absolute inset-0"
        style={{ top: 0, opacity: activeSlot === 1 ? 1 : 0, pointerEvents: activeSlot === 1 ? "auto" : "none" }}
        src={srcSlots[1]}
        title={title}
        ref={frame1Ref}
        onLoad={() => onFrameLoad(1)}
      />
    </main>
  );
};

export default ScreenPage;
