import React, { useEffect, useRef, useState } from "react";
import { getCollapsedPages } from "../lib/pagination";
import { useIsMobilePager } from "../hooks/useIsMobilePager";

const MOBILE_AUTO_LOAD_DELAY_MS = 650;

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  mobileAutoLoad?: boolean;
  mobileHasMore?: boolean;
  mobileLoading?: boolean;
  onMobileLoadMore?: () => void;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  mobileAutoLoad = false,
  mobileHasMore,
  mobileLoading = false,
  onMobileLoadMore,
}) => {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadTimerRef = useRef<number | null>(null);
  const lastTriggeredPageRef = useRef<number | null>(null);
  const [mobilePending, setMobilePending] = useState(false);
  const isMobilePager = useIsMobilePager();
  const hasMore = mobileHasMore ?? currentPage < totalPages;
  const showMobileLoading = mobileLoading || mobilePending;

  useEffect(() => {
    return () => {
      if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!mobileAutoLoad || !isMobilePager || !hasMore || showMobileLoading || !onMobileLoadMore) return;
    if (lastTriggeredPageRef.current === currentPage) return;
    const target = sentinelRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (loadTimerRef.current !== null || lastTriggeredPageRef.current === currentPage) return;
        lastTriggeredPageRef.current = currentPage;
        setMobilePending(true);
        loadTimerRef.current = window.setTimeout(() => {
          loadTimerRef.current = null;
          onMobileLoadMore();
          setMobilePending(false);
        }, MOBILE_AUTO_LOAD_DELAY_MS);
      },
      { rootMargin: "120px 0px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [currentPage, hasMore, isMobilePager, mobileAutoLoad, onMobileLoadMore, showMobileLoading]);

  if (totalPages <= 1) return null;

  const items = getCollapsedPages(currentPage, totalPages, 1);

  return (
    <>
    <style>{`
      .xf-mobile-auto-pager { display: none; }
      @media (max-width: 768px) {
        .xf-desktop-pagination { display: none !important; }
        .xf-mobile-auto-pager {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 56px;
          margin: 18px 0 calc(18px + env(safe-area-inset-bottom));
          color: #8f7bd6;
          font-size: 12px;
          font-weight: 800;
        }
        .xf-mobile-auto-spinner {
          width: 14px;
          height: 14px;
          border-radius: 999px;
          border: 2px solid rgba(143, 123, 214, .24);
          border-top-color: #5e17eb;
          animation: xfMobilePagerSpin .72s linear infinite;
        }
      }
      @keyframes xfMobilePagerSpin { to { transform: rotate(360deg); } }
    `}</style>
    {mobileAutoLoad ? (
      <div ref={sentinelRef} className="xf-mobile-auto-pager" aria-live="polite">
        {showMobileLoading ? <span className="xf-mobile-auto-spinner" aria-hidden="true" /> : null}
        {showMobileLoading ? "正在加载下一页..." : hasMore ? "继续下滑加载更多" : "已加载全部"}
      </div>
    ) : null}
    <div className="xf-desktop-pagination" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 20, marginBottom: 20 }}>
      {/* 上一页 */}
      <button
        type="button"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        style={{
          height: 28, width: 28, borderRadius: "50%",
          border: `1px solid ${currentPage <= 1 ? "#E5E7EB" : "rgba(94,23,235,0.25)"}`,
          background: "#fff", color: currentPage <= 1 ? "#D1D5DB" : "#5e17eb",
          cursor: currentPage <= 1 ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 700,
        }}
      >
        ‹
      </button>

      {/* 页码 */}
      {items.map((item, idx) => {
        if (item === "ellipsis") {
          return (
            <span
              key={`dots-${idx}`}
              style={{
                width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, color: "#8f7bd6", fontWeight: 700,
              }}
            >
              ...
            </span>
          );
        }
        const active = item === currentPage;
        return (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            style={{
              height: 28, width: 28, borderRadius: "50%",
              border: active ? "none" : "1px solid rgba(94,23,235,0.25)",
              background: active ? "#5e17eb" : "#fff",
              color: active ? "#fff" : "#5e17eb",
              cursor: "pointer",
              fontSize: 9, fontWeight: 700,
              boxShadow: active ? "0 4px 12px rgba(94,23,235,0.25)" : "none",
            }}
          >
            {item}
          </button>
        );
      })}

      {/* 下一页 */}
      <button
        type="button"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        style={{
          height: 28, width: 28, borderRadius: "50%",
          border: `1px solid ${currentPage >= totalPages ? "#E5E7EB" : "rgba(94,23,235,0.25)"}`,
          background: "#fff", color: currentPage >= totalPages ? "#D1D5DB" : "#5e17eb",
          cursor: currentPage >= totalPages ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 700,
        }}
      >
        ›
      </button>
    </div>
    </>
  );
};

export default Pagination;
