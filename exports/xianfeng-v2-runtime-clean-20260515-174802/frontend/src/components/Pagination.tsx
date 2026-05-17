import React from "react";
import { getCollapsedPages } from "../lib/pagination";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const items = getCollapsedPages(currentPage, totalPages, 1);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 20, marginBottom: 20 }}>
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
  );
};

export default Pagination;
