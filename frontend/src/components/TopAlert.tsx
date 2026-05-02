import React from "react";

type TopAlertProps = {
  message: string | null | undefined;
  onClose?: () => void;
};

const TopAlert: React.FC<TopAlertProps> = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-3xl items-start justify-between gap-3 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-[0_10px_30px_-12px_rgba(220,38,38,0.35)]">
        <span className="min-w-0 flex-1 break-words">{message}</span>
        {onClose ? (
          <button
            className="material-symbols-outlined -mt-0.5 shrink-0 text-base text-red-500 hover:text-red-700"
            onClick={onClose}
            type="button"
            aria-label="关闭提示"
          >
            close
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default TopAlert;
