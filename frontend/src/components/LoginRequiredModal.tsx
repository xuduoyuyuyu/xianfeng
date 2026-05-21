import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store";
import { login } from "../store/userSlice";
import { userApi } from "../services/api";

const PHONE_REGEX = /^1\d{10}$/;

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

const LoginRequiredModal: React.FC<Props> = ({
  open,
  onClose,
  title = "登录后查看完整内容",
  description = "登录后可解锁完整知识树、查看详细内容、参与互动提问，获得个性化成长推荐。",
}) => {
  // ---- 登录表单 state ----
  const [phone, setPhone] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [sentCode, setSentCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [localError, setLocalError] = useState("");
  const [hint, setHint] = useState("");

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isLoading, error, user } = useSelector((state: RootState) => state.user);

  useEffect(() => {
    if (!user) return;
    const hasName = user.name && user.name !== user.username;
    const hasCity = !!(user as any).city;
    if (!hasName || !hasCity) {
      sessionStorage.setItem("xf_show_profile", "1");
    }
    onClose();
  }, [user]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const canGetCode = useMemo(() => PHONE_REGEX.test(phone) && countdown === 0, [phone, countdown]);

  const handleGetCode = () => {
    if (!PHONE_REGEX.test(phone)) {
      setLocalError("请输入正确的 11 位手机号");
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setSentCode(code);
    setCountdown(60);
    setLocalError("");
    setHint(`验证码已发送（演示）：${code}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    setHint("");

    if (!PHONE_REGEX.test(phone)) {
      setLocalError("请输入正确的 11 位手机号");
      return;
    }
    if (!sentCode) {
      setLocalError("请先获取验证码");
      return;
    }
    if (verifyCode !== sentCode) {
      setLocalError("验证码不正确");
      return;
    }

    const password = `sms_${phone}`;
    try {
      await dispatch(login({ username: phone, password }) as any).unwrap();
      return;
    } catch (_err) {
      // user not exists, try register
    }

    try {
      await userApi.register(phone, password, "user");
      await dispatch(login({ username: phone, password }) as any).unwrap();
    } catch (registerErr: any) {
      const message = registerErr?.response?.data?.message || registerErr?.message || "注册失败，请稍后重试";
      setLocalError(message);
      if (String(message).includes("不允许公开注册")) {
        setHint("当前环境关闭了公开注册，请联系管理员开通或先由管理员创建账号。");
      }
    }
  };

  if (!open) return null;

  return (
    <div className="xf-overlay" onClick={onClose}>
      <style>{`
        .xf-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 14px;
          background: rgba(30, 24, 54, 0.38);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          font-family: Inter, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
        }

        .xf-modal {
          width: 86%;
          max-width: 860px;
          height: 500px;
          border-radius: 28px;
          background: #ffffff;
          border: 1px solid rgba(209, 196, 241, 0.7);
          box-shadow: 0 26px 68px rgba(49, 38, 87, 0.24), 0 8px 22px rgba(0, 0, 0, 0.08);
          overflow: hidden;
          position: relative;
          display: grid;
          grid-template-columns: 1fr 1fr;
          animation: xfModalIn 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes xfModalIn {
          from { opacity: 0; transform: translateY(18px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .xf-close {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 34px;
          height: 34px;
          border: none;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.88);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          color: #8f87a9;
          font-size: 26px;
          line-height: 1;
          cursor: pointer;
          z-index: 5;
        }

        /* ===== 左侧：内容 ===== */
        .xf-content {
          padding: 0 24px;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          gap: 4px;
          padding-top: 32px;
          overflow-y: auto;
        }
        .xf-badge {
          display: inline-flex;
          padding: 5px 11px;
          margin-top: -13px;
          border-radius: 999px;
          background: rgba(124, 77, 255, 0.1);
          color: #6642ce;
          font-size: 11px;
          font-weight: 700;
          align-self: flex-start;
        }

        .xf-content h1 {
          margin: 0;
          color: #24164b;
          font-size: 32px;
          line-height: 1.1;
          letter-spacing: -0.02em;
          font-weight: 900;
        }

        .xf-desc {
          margin: 2px 0 0;
          color: #6f6688;
          font-size: 13px;
          line-height: 1.45;
        }

        .xf-benefits {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          margin-top: 2px;
          margin-bottom: 0;
        }

        .xf-card {
          border-radius: 12px;
          border: 1px solid #ece5fb;
          background: linear-gradient(180deg, #fff, #fdfbff);
          box-shadow: 0 3px 8px rgba(77, 56, 136, 0.05);
          padding: 8px 6px 7px;
          text-align: center;
        }

        .xf-card-icon {
          margin-bottom: 4px;
          width: 28px;
          height: 28px;
          margin-left: auto;
          margin-right: auto;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: radial-gradient(circle at 30% 25%, #ffffff 0%, #f2eaff 55%, #e8dbff 100%);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.92),
            inset 0 -1px 0 rgba(132, 94, 214, 0.15),
            0 4px 10px rgba(94, 70, 172, 0.18);
        }
        .xf-card-icon-svg {
          width: 17px;
          height: 17px;
          display: inline-block;
          filter: drop-shadow(0 2px 4px rgba(94, 70, 172, 0.18));
        }
        .xf-icon-book .xf-card-icon-svg { transform: scale(0.95); }
        .xf-icon-chat .xf-card-icon-svg { transform: scale(0.95); }
        .xf-icon-star .xf-card-icon-svg { transform: scale(1.05); }
        .xf-card-title { font-size: 11px; font-weight: 800; color: #2a1d4f; margin-bottom: 1px; }
        .xf-card-desc { font-size: 9px; color: #847a9d; line-height: 1.2; }

        /* ===== 登录表单区域 ===== */
        .xf-login-form-section {
          margin-top: 4px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .xf-login-form-section label {
          display: block;
          margin-bottom: 0;
          font-size: 11px;
          font-weight: 800;
          color: #111827;
          line-height: 1.1;
        }
        .xf-login-form-section .xf-field-row {
          display: flex;
          gap: 8px;
        }
        .xf-login-form-section .xf-country-code {
          flex-shrink: 0;
          width: 72px;
          border: 1px solid #e7e7f0;
          border-radius: 12px;
          background: #fff;
          font-size: 15px;
          font-weight: 800;
          color: #1f2937;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px 0;
        }
        .xf-login-form-section .xf-input {
          width: 100%;
          border: 1px solid #e7e7f0;
          border-radius: 12px;
          background: #fff;
          font-size: 14px;
          font-weight: 700;
          color: #111827;
          padding: 8px 10px;
          outline: none;
        }
        .xf-login-form-section .xf-input::placeholder {
          color: #b8c2d7;
          font-weight: 700;
        }
        .xf-login-form-section .xf-input:focus {
          border-color: #6b3df0;
          box-shadow: 0 0 0 3px rgba(107,61,240,.10);
        }
        .xf-login-form-section .xf-code-btn {
          flex-shrink: 0;
          border: none;
          border-radius: 12px;
          background: #5b3cf0;
          color: #fff;
          font-size: 13px;
          font-weight: 900;
          padding: 0 14px;
          cursor: pointer;
          min-width: 100px;
          white-space: nowrap;
        }
        .xf-login-form-section .xf-code-btn:disabled {
          opacity: .6;
          cursor: not-allowed;
        }
        .xf-login-form-section .xf-submit-btn {
          width: 100%;
          margin-top: 0;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #5f3be0 0%, #8865f2 100%);
          color: #fff;
          font-size: 16px;
          font-weight: 800;
          padding: 10px 18px;
          cursor: pointer;
          box-shadow: 0 6px 16px rgba(101, 66, 204, 0.25);
        }
        .xf-login-form-section .xf-submit-btn:disabled {
          opacity: .6;
          cursor: not-allowed;
        }
        .xf-login-form-section .xf-error-msg {
          border: 1px solid #fecaca;
          background: #fef2f2;
          border-radius: 10px;
          padding: 6px 10px;
          color: #dc2626;
          font-size: 12px;
          font-weight: 700;
        }
        .xf-login-form-section .xf-hint-msg {
          border: 1px solid #ddd6fe;
          background: #f5f3ff;
          border-radius: 10px;
          padding: 6px 10px;
          color: #5b21b6;
          font-size: 12px;
          font-weight: 700;
        }
        .xf-login-form-section .xf-policy {
          margin-top: 0;
          text-align: center;
          color: #7d8aa7;
          font-size: 10px;
          font-weight: 700;
        }
        .xf-login-form-section .xf-policy a {
          color: #2f3f69;
          text-decoration: none;
          border-bottom: 2px solid rgba(47,63,105,0.25);
        }

        /* ===== 右侧：插画 ===== */
        .xf-hero {
          position: relative;
          background: radial-gradient(120% 100% at 50% 8%, #f2ebff 0%, #f7f3ff 60%, #fbf9ff 100%);
          border-left: 1px solid rgba(222, 212, 244, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          padding: 0;
          min-height: 0;
        }

        .xf-bg-circle {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -48%);
          width: 200px;
          height: 200px;
          border-radius: 50%;
          background: radial-gradient(circle at 40% 40%, rgba(171, 144, 244, 0.18), rgba(171, 144, 244, 0.03));
        }

        .xf-figure {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 48%;
          position: relative;
          z-index: 2;
        }

        .xf-float {
          position: absolute;
          z-index: 3;
          animation: xfFloat 4s ease-in-out infinite;
          user-select: none;
          pointer-events: none;
        }
        .star1 { left: 22px; top: 32px; color: #b197ff; font-size: 14px; }
        .star2 { right: 28px; top: 44px; color: #facc15; font-size: 16px; animation-delay: 0.8s; }
        .star3 { right: 24px; bottom: 44px; color: #c4b5ff; font-size: 12px; animation-delay: 1.6s; }
        .star4 { left: 30px; bottom: 32px; color: #fcd34d; font-size: 14px; animation-delay: 2.4s; }
        @keyframes xfFloat { 0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)} }

        @media (max-width: 768px) {
          .xf-overlay {
            background: rgba(0, 0, 0, 0.15) !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            align-items: center !important;
          }
          .xf-modal {
            max-width: 380px;
            width: 92%;
            height: auto;
            max-height: 85vh;
            grid-template-columns: 1fr;
            border-radius: 20px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
          }
          .xf-content { order: 1; padding: 20px 18px 16px; gap: 8px; }
          .xf-hero {
            display: none;
          }
          .xf-head { margin-bottom: 2px; }
          .xf-badge { display: none; }
          .xf-content h1 { font-size: 20px; margin-bottom: 2px; }
          .xf-desc { font-size: 12px; line-height: 1.45; display: none; }
          .xf-close { top: 8px; right: 10px; width: 28px; height: 28px; font-size: 20px; }
        }
      `}</style>

      <div className="xf-modal xf-modal-with-form" onClick={(e) => e.stopPropagation()}>
        <button className="xf-close" onClick={onClose} aria-label="关闭">×</button>

        {/* 左侧内容 */}
        <div className="xf-content">
          <div className="xf-head">
            <div className="xf-badge">家长先疯 · 知识权限解锁</div>
            <h1>{title}</h1>
            <p className="xf-desc">{description}</p>
          </div>

          <div className="xf-benefits">
            <div className="xf-card xf-icon-book">
              <div className="xf-card-icon" aria-hidden="true">
                <svg className="xf-card-icon-svg" viewBox="0 0 24 24" fill="none">
                  <defs>
                    <linearGradient id="iBookL" x1="3" y1="4" x2="11" y2="20" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#B99EFF" />
                      <stop offset="1" stopColor="#8B5CF6" />
                    </linearGradient>
                    <linearGradient id="iBookR" x1="13" y1="4" x2="21" y2="20" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#9E7DFF" />
                      <stop offset="1" stopColor="#6D28D9" />
                    </linearGradient>
                  </defs>
                  <rect x="3" y="4" width="8" height="16" rx="2.2" fill="url(#iBookL)" />
                  <rect x="13" y="4" width="8" height="16" rx="2.2" fill="url(#iBookR)" />
                  <path d="M12 6V18" stroke="#F5F3FF" strokeWidth="1.2" strokeLinecap="round" />
                  <rect x="4.1" y="5.2" width="5.8" height="1.15" rx=".6" fill="rgba(255,255,255,.36)" />
                  <rect x="14.1" y="5.2" width="5.8" height="1.15" rx=".6" fill="rgba(255,255,255,.3)" />
                  <path d="M3.8 17.2C5.8 16.1 8 16 10.2 16.8" stroke="rgba(65,36,138,.24)" strokeWidth="1" strokeLinecap="round" />
                  <path d="M13.8 16.8C16 16 18.2 16.1 20.2 17.2" stroke="rgba(52,27,120,.24)" strokeWidth="1" strokeLinecap="round" />
                </svg>
              </div>
              <div className="xf-card-title">完整知识</div>
              <div className="xf-card-desc">全部知识节点</div>
            </div>
            <div className="xf-card xf-icon-chat">
              <div className="xf-card-icon" aria-hidden="true">
                <svg className="xf-card-icon-svg" viewBox="0 0 24 24" fill="none">
                  <defs>
                    <linearGradient id="iChat" x1="4" y1="6.2" x2="20" y2="18.8" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#C0A8FF" />
                      <stop offset="1" stopColor="#7C3AED" />
                    </linearGradient>
                  </defs>
                  <path d="M6.8 6.2H17.2C18.8 6.2 20 7.4 20 9V13C20 14.6 18.8 15.8 17.2 15.8H11.6L8 18.6V15.8H6.8C5.2 15.8 4 14.6 4 13V9C4 7.4 5.2 6.2 6.8 6.2Z" fill="url(#iChat)" />
                  <path d="M7.4 7.45H16.6" stroke="rgba(255,255,255,.34)" strokeWidth="1.1" strokeLinecap="round" />
                  <circle cx="9.2" cy="11" r="1.1" fill="#F5F3FF" />
                  <circle cx="12" cy="11" r="1.1" fill="#F5F3FF" />
                  <circle cx="14.8" cy="11" r="1.1" fill="#F5F3FF" />
                  <path d="M8.4 15.4L9.8 14.3L10.7 15.4" stroke="rgba(65,36,138,.22)" strokeWidth=".95" strokeLinecap="round" />
                </svg>
              </div>
              <div className="xf-card-title">互动提问</div>
              <div className="xf-card-desc">专家与家长交流</div>
            </div>
            <div className="xf-card xf-icon-star">
              <div className="xf-card-icon" aria-hidden="true">
                <svg className="xf-card-icon-svg" viewBox="0 0 24 24" fill="none">
                  <defs>
                    <linearGradient id="iStar" x1="12" y1="3.8" x2="12" y2="18.2" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#FCD34D" />
                      <stop offset="1" stopColor="#F59E0B" />
                    </linearGradient>
                  </defs>
                  <path d="M12 3.8L14.3 8.6L19.5 9.3L15.7 13L16.6 18.2L12 15.7L7.4 18.2L8.3 13L4.5 9.3L9.7 8.6L12 3.8Z" fill="url(#iStar)" />
                  <path d="M12 5.7L13.7 9L17.3 9.5L14.7 12L15.3 15.7L12 13.9L8.7 15.7L9.3 12L6.7 9.5L10.3 9L12 5.7Z" fill="#FDE68A" />
                  <ellipse cx="9.5" cy="8.8" rx="2.1" ry="1.05" fill="rgba(255,255,255,.35)" />
                  <path d="M11.2 15.1L12 14.6L12.8 15.1" stroke="rgba(149,91,9,.32)" strokeWidth=".95" strokeLinecap="round" />
                </svg>
              </div>
              <div className="xf-card-title">个性推荐</div>
              <div className="xf-card-desc">专属成长内容</div>
            </div>
          </div>

          {/* 登录表单：手机号 + 验证码 + 提交 */}
          <form className="xf-login-form-section" onSubmit={handleSubmit}>
            <label>手机号</label>
            <div className="xf-field-row">
              <div className="xf-country-code">+86</div>
              <input
                className="xf-input"
                placeholder="请输入手机号"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
              />
            </div>

            <label>验证码</label>
            <div className="xf-field-row">
              <input
                className="xf-input"
                placeholder="请输入验证码"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <button
                type="button"
                className="xf-code-btn"
                onClick={handleGetCode}
                disabled={!canGetCode}
              >
                {countdown > 0 ? `${countdown}s` : "获取验证码"}
              </button>
            </div>

            {localError ? <div className="xf-error-msg">{localError}</div> : null}
            {!localError && (hint || error) ? <div className="xf-hint-msg">{hint || error}</div> : null}

            <button className="xf-submit-btn" type="submit" disabled={isLoading}>
              {isLoading ? "处理中..." : "登录/注册"}
            </button>

            <div className="xf-policy">
              登录视为您已阅读并同意 <a href="#">服务条款</a> 和 <a href="#">隐私政策</a>
            </div>
          </form>
        </div>

        {/* 右侧插画 */}
        <div className="xf-hero" aria-hidden="true">
          <div className="xf-bg-circle" />
          <div className="xf-float star1">✦</div>
          <div className="xf-float star2">✦</div>
          <div className="xf-float star3">✦</div>
          <div className="xf-float star4">✦</div>
          <img className="xf-figure" src="/assets/login-hero-illustration.webp" alt="" />
        </div>
      </div>
    </div>
  );
};

export default LoginRequiredModal;
