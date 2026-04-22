import React, { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  title: string;
};

const ScreenPage: React.FC<Props> = ({ src, title }) => {
  const hideLoaderTimer = useRef<number | null>(null);
  const failSafeTimer = useRef<number | null>(null);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [srcSlots, setSrcSlots] = useState<[string, string]>([src, src]);
  const [loadingSlot, setLoadingSlot] = useState<0 | 1 | null>(0);
  const [showLoader, setShowLoader] = useState(true);
  const srcSlotsRef = useRef<[string, string]>([src, src]);
  const loadingSlotRef = useRef<0 | 1 | null>(0);
  const frame0Ref = useRef<HTMLIFrameElement | null>(null);
  const frame1Ref = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    return () => {
      if (hideLoaderTimer.current) {
        window.clearTimeout(hideLoaderTimer.current);
        hideLoaderTimer.current = null;
      }
      if (failSafeTimer.current) {
        window.clearTimeout(failSafeTimer.current);
        failSafeTimer.current = null;
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
    setShowLoader(true);
    if (hideLoaderTimer.current) {
      window.clearTimeout(hideLoaderTimer.current);
      hideLoaderTimer.current = null;
    }

    const nextAlreadyLoaded = srcSlotsRef.current[nextSlot] === src;
    if (nextAlreadyLoaded) {
      setActiveSlot(nextSlot);
      setLoadingSlot(null);
      hideLoaderTimer.current = window.setTimeout(() => {
        setShowLoader(false);
      }, 120);
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
        if (target?.contentDocument?.readyState === "complete") {
          onFrameLoad(slot);
        }
      } catch (_e) {}
    }, 0);

    failSafeTimer.current = window.setTimeout(() => {
      if (loadingSlotRef.current !== slot) return;
      setLoadingSlot(null);
      setShowLoader(false);
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
    if (loadingSlot === null) return;
    if (slot !== loadingSlot) return;
    setActiveSlot(slot);
    setLoadingSlot(null);
    if (hideLoaderTimer.current) {
      window.clearTimeout(hideLoaderTimer.current);
    }
    hideLoaderTimer.current = window.setTimeout(() => {
      setShowLoader(false);
    }, 120);
  }

  return (
    <main className="screen-shell relative" aria-label={title}>
      <iframe
        className="screen-frame absolute inset-0 transition-opacity duration-200"
        style={{ opacity: activeSlot === 0 ? 1 : 0, pointerEvents: activeSlot === 0 ? "auto" : "none" }}
        src={srcSlots[0]}
        title={title}
        ref={frame0Ref}
        onLoad={() => onFrameLoad(0)}
      />
      <iframe
        className="screen-frame absolute inset-0 transition-opacity duration-200"
        style={{ opacity: activeSlot === 1 ? 1 : 0, pointerEvents: activeSlot === 1 ? "auto" : "none" }}
        src={srcSlots[1]}
        title={title}
        ref={frame1Ref}
        onLoad={() => onFrameLoad(1)}
      />
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-200"
        style={{
          opacity: showLoader ? 1 : 0,
          background:
            "radial-gradient(rgba(94, 23, 235, 0.14) 1px, transparent 1px), linear-gradient(#0b1020, #0b1020)",
          backgroundSize: "56px 56px, auto",
        }}
        aria-hidden="true"
      >
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-[#0e1630]/70 px-5 py-3 text-sm font-bold text-white backdrop-blur-xl">
          <span className="material-symbols-outlined animate-spin text-[22px] text-[#5e17eb]">progress_activity</span>
          页面切换中
        </div>
      </div>
    </main>
  );
};

export default ScreenPage;
