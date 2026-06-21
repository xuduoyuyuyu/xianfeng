import React from "react";
import { Link } from "react-router-dom";

const ProUpgradeModal: React.FC<{
  open: boolean;
  message?: string;
  onClose: () => void;
}> = ({ open, message, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[420px] rounded-[1.5rem] bg-white p-6 text-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.24)]" onClick={(event) => event.stopPropagation()}>
        <div className="inline-flex rounded-full bg-[#6c27d6] px-3 py-1 text-[11px] font-black uppercase text-white">订阅</div>
        <h2 className="mt-4 text-2xl font-black text-slate-950">开通订阅计划</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-600">
          {message || "订阅后可开启小玩子、嘉宾 AI 分身与知物新分析等高级能力。基础浏览、历史内容和公开资料不受影响。"}
        </p>
        <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm font-bold leading-6 text-slate-700">
          订阅包月 ¥19.9，订阅年付 ¥99。支付成功后 3 天内可在订阅页自助申请全额退款。
        </div>
        <div className="mt-6 grid grid-cols-[1fr_auto] gap-3">
          <Link
            to="/pro"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#6c27d6] px-5 text-sm font-black !text-white no-underline"
          >
            查看订阅计划
          </Link>
          <button type="button" onClick={onClose} className="h-11 rounded-full border border-slate-200 bg-white px-5 text-sm font-black text-slate-600">
            稍后
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProUpgradeModal;
