import React, { useCallback, useEffect, useRef, useState } from "react";

const WISH_USER_ID_KEY = "xf_wish_user_id";

/** 获取或生成用户 ID */
function getOrCreateUserId(): string {
  try {
    const stored = localStorage.getItem(WISH_USER_ID_KEY);
    if (stored) return stored;
    const id = `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(WISH_USER_ID_KEY, id);
    return id;
  } catch {
    return `u_${Date.now().toString(36)}`;
  }
}

interface WishModalProps {
  guestId?: string;
  guestName?: string;
  open: boolean;
  onClose: () => void;
}

const WishModal: React.FC<WishModalProps> = ({ guestId, guestName, open, onClose }) => {
  const [personName, setPersonName] = useState("");
  const [personIntro, setPersonIntro] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [charCount, setCharCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPersonName("");
      setPersonIntro("");
      setError("");
      setDone(false);
      setSubmitting(false);
      setCharCount(0);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    const name = personName.trim();
    if (!name || name.length < 2) {
      setError("请至少输入2个字的人物姓名 ✍️");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const userId = getOrCreateUserId();
      const targetGuestId = guestId || "guest-page";
      const res = await fetch(`/api/guests/${encodeURIComponent(targetGuestId)}/submit-wish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, personName: name, personIntro: personIntro.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "提交失败");
      setDone(true);
    } catch (err: any) {
      setError(err?.message || "许愿失败，请稍后重试 🥺");
    } finally {
      setSubmitting(false);
    }
  }, [personName, personIntro, guestId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !submitting && !done) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [submitting, done, handleSubmit]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(30, 20, 50, 0.55)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md rounded-[1.75rem] bg-white p-8 shadow-[0_30px_90px_rgba(94,23,235,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-[#f3eefc] text-[#7b6cad] transition hover:bg-[#e6dff5] hover:text-[#5e17eb]"
        >
          <span className="material-symbols-outlined text-lg">close</span>
        </button>

        {done ? (
          /* 提交成功状态 */
          <div className="flex flex-col items-center py-6 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#f0eaff]">
              <span className="text-4xl">✨</span>
            </div>
            <h3 className="mt-4 text-xl font-black text-[#241a3a]">许愿成功！</h3>
            <p className="mt-2 text-sm leading-7 text-[#7b70a4]">
              我们已经收到你对<br />
              <span className="font-black text-[#5e17eb]">{personName}</span> 的推荐，
              <br />
              会在后台认真审阅 💕
            </p>
            <button
              onClick={onClose}
              className="mt-6 rounded-full bg-[#5e17eb] px-8 py-2.5 text-sm font-black text-white transition hover:bg-[#4a11d0]"
            >
              好的
            </button>
          </div>
        ) : (
          /* 表单状态 */
          <>
            <h2 className="text-xl font-black text-[#241a3a]">
              女施主又来许愿了 🙏
            </h2>
            <p className="mt-2 text-sm text-[#8e81b3]">
              {guestName ? (
                <>看到 <span className="font-black text-[#5e17eb]">{guestName}</span> 的页面，想起还有哪一位人物也想在我们的节目中看到？告诉我们吧～</>
              ) : (
                <>告诉我们你想在节目中看到哪一位人物吧～</>
              )}
            </p>

            {/* 人物姓名 */}
            <div className="mt-6">
              <label className="text-xs font-black uppercase tracking-[0.16em] text-[#5b3fa1]">
                人物姓名 <span className="text-[#e11d48]">*</span>
              </label>
              <input
                ref={inputRef}
                type="text"
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="例如：张三、李教授…"
                maxLength={30}
                disabled={submitting}
                className="mt-2 w-full rounded-2xl border border-[#ddd4f0] bg-[#fbf9ff] px-5 py-3 text-sm text-[#241a3a] outline-none transition placeholder:text-[#c0b2e0] focus:border-[#5e17eb] focus:ring-4 focus:ring-[#5e17eb]/8 disabled:opacity-50"
              />
            </div>

            {/* 人物介绍 */}
            <div className="mt-5">
              <label className="text-xs font-black uppercase tracking-[0.16em] text-[#5b3fa1]">
                人物介绍
              </label>
              <textarea
                value={personIntro}
                onChange={(e) => {
                  setPersonIntro(e.target.value);
                  setCharCount(e.target.value.length);
                }}
                onKeyDown={handleKeyDown}
                placeholder="简单介绍一下这位人物吧（领域、成就、为什么推荐…）"
                rows={4}
                maxLength={500}
                disabled={submitting}
                className="mt-2 w-full resize-none rounded-2xl border border-[#ddd4f0] bg-[#fbf9ff] px-5 py-3 text-sm text-[#241a3a] outline-none transition placeholder:text-[#c0b2e0] focus:border-[#5e17eb] focus:ring-4 focus:ring-[#5e17eb]/8 disabled:opacity-50"
              />
              <div className="mt-1 text-right text-[10px] text-[#b7a9d6]">
                {charCount}/500
              </div>
            </div>

            {error ? (
              <div className="mt-3 rounded-xl bg-[#fff0f3] px-4 py-2.5 text-xs font-bold text-[#e11d48]">{error}</div>
            ) : null}

            <button
              onClick={handleSubmit}
              disabled={submitting || !personName.trim()}
              className="mt-6 w-full rounded-2xl bg-[#5e17eb] py-3.5 text-sm font-black text-white transition hover:bg-[#4a11d0] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "正在许愿… 🙏" : "提交许愿 ✨"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default WishModal;
