import React, { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  title: string;
};

const ScreenPage: React.FC<Props> = ({ src, title }) => {
  const failSafeTimer = useRef<number | null>(null);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [srcSlots, setSrcSlots] = useState<[string, string]>([src, "about:blank"]);
  const [loadingSlot, setLoadingSlot] = useState<0 | 1 | null>(0);
  const srcSlotsRef = useRef<[string, string]>([src, "about:blank"]);
  const loadingSlotRef = useRef<0 | 1 | null>(0);
  const frame0Ref = useRef<HTMLIFrameElement | null>(null);
  const frame1Ref = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    return () => {
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
    if (loadingSlot === null) return;
    if (slot !== loadingSlot) return;
    setActiveSlot(slot);
    setLoadingSlot(null);
  }

  return (
    <main className="screen-shell relative" aria-label={title}>
      <iframe
        className="screen-frame absolute inset-0"
        style={{ opacity: activeSlot === 0 ? 1 : 0, pointerEvents: activeSlot === 0 ? "auto" : "none" }}
        src={srcSlots[0]}
        title={title}
        ref={frame0Ref}
        onLoad={() => onFrameLoad(0)}
      />
      <iframe
        className="screen-frame absolute inset-0"
        style={{ opacity: activeSlot === 1 ? 1 : 0, pointerEvents: activeSlot === 1 ? "auto" : "none" }}
        src={srcSlots[1]}
        title={title}
        ref={frame1Ref}
        onLoad={() => onFrameLoad(1)}
      />
    </main>
  );
};

export default ScreenPage;
