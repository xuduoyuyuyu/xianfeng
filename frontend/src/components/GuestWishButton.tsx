import React, { useCallback, useEffect, useRef, useState } from "react";

interface GuestWishButtonProps {
  programId?: string;
  guestId?: string;
}

const WISH_KEY = "xf_guest_wishes";
const WISH_SENT_KEY = "xf_guest_wishes_sent"; // 记录是否已计过数

// 生成多个随机位置冒泡动画
function spawnBubbles(btn: HTMLElement) {
  const rect = btn.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top;
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      const bubble = document.createElement("span");
      bubble.className = "return-wish-bubble";
      bubble.innerHTML = "❤️";
      bubble.style.left = `${cx + (Math.random() - 0.5) * 30}px`;
      bubble.style.top = `${cy}px`;
      bubble.style.animationDuration = `${0.8 + Math.random() * 0.8}s`;
      document.body.appendChild(bubble);
      setTimeout(() => bubble.remove(), 1500);
    }, i * 80);
  }
}

const GuestWishButton: React.FC<GuestWishButtonProps> = ({ programId, guestId }) => {
  const [count, setCount] = useState(0);
  const [animating, setAnimating] = useState(false);
  const hasRecordedRef = useRef(false);

  // 从 localStorage 读取心愿数（首次加载）
  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(WISH_KEY) || "{}");
      const sent = JSON.parse(localStorage.getItem(WISH_SENT_KEY) || "{}");
      const key = programId || (guestId || "");
      setCount(data[key] || 0);
      hasRecordedRef.current = !!sent[key];
    } catch {}
  }, [programId, guestId]);

  const addWish = useCallback(
    (e: React.MouseEvent) => {
      // 冒泡动效（每次都触发）
      const btn = e.currentTarget as HTMLButtonElement;
      spawnBubbles(btn);

      // 点击动画
      setAnimating(true);
      setTimeout(() => setAnimating(false), 300);

      // 首次点击才计数 +1
      const key = programId || (guestId || "");
      let newCount = count;
      try {
        const sent = JSON.parse(localStorage.getItem(WISH_SENT_KEY) || "{}");
        if (!sent[key] && !hasRecordedRef.current) {
          newCount = count + 1;
          setCount(newCount);
          hasRecordedRef.current = true;
          sent[key] = true;
          localStorage.setItem(WISH_SENT_KEY, JSON.stringify(sent));

          const data = JSON.parse(localStorage.getItem(WISH_KEY) || "{}");
          data[key] = newCount;
          localStorage.setItem(WISH_KEY, JSON.stringify(data));
        }
      } catch {}

      // 每次都同步到后端（由后端去重）
      if (guestId) {
        fetch(`/api/guests/${encodeURIComponent(guestId)}/return-wish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ programId: programId || guestId }),
        }).catch(() => {});
      }
    },
    [count, programId, guestId]
  );

  return (
    <>
      {/* 冒泡动画全局样式 */}
      <style>{`
        .return-wish-bubble {
          position: fixed;
          pointer-events: none;
          z-index: 9999;
          font-size: 20px;
          animation: wishBubbleUp 1.2s ease-out forwards;
        }
        @keyframes wishBubbleUp {
          0% { opacity: 1; transform: translateY(0) scale(0.5) rotate(0deg); }
          30% { opacity: 1; transform: translateY(-40px) scale(1.2) rotate(10deg); }
          60% { opacity: 0.8; transform: translateY(-80px) scale(1.0) rotate(-5deg); }
          100% { opacity: 0; transform: translateY(-140px) scale(0.6) rotate(15deg); }
        }
      `}</style>

      <button
        onClick={addWish}
        className="group relative inline-flex items-center gap-1 transition-all hover:scale-110"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
          transform: animating ? "scale(1.2)" : "scale(1)",
        }}
      >
        {/* 红心 */}
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="#F43F5E"
          className="transition-transform group-hover:scale-110 drop-shadow-sm"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>

        {/* 计数（>0 时才显示） */}
        {count > 0 ? (
        <span
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "#E11D48",
          }}
        >
          {count}
        </span>
        ) : null}

        {/* hover 才显示的 "返场心愿" */}
        <span
          className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-0.5 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100"
          style={{ pointerEvents: "none" }}
        >
          返场心愿
        </span>
      </button>
    </>
  );
};

export default GuestWishButton;
