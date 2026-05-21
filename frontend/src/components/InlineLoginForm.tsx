import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store";
import { login } from "../store/userSlice";
import { userApi } from "../services/api";

const PHONE_REGEX = /^1\d{10}$/;

interface Props {
  /** 登录成功后回调（可选，不传则 navigate 到节目列表） */
  onSuccess?: () => void;
  /** 关闭回调（显示关闭按钮时） */
  onClose?: () => void;
  /** 紧凑模式，去掉品牌 logo 等装饰 */
  compact?: boolean;
}

const InlineLoginForm: React.FC<Props> = ({ onSuccess, onClose, compact }) => {
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
    if (onSuccess) {
      onSuccess();
    } else {
      navigate("/programs/list", { replace: true });
    }
  }, [user, navigate, onSuccess]);

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

  return (
    <div className={`inline-login-form ${compact ? "inline-compact" : ""}`}>
      <style>{`
        .inline-login-form {
          font-family: "Noto Sans SC", "Plus Jakarta Sans", sans-serif;
        }
        .inline-login-form .field-label {
          display: block;
          margin-bottom: 8px;
          font-size: 12px;
          font-weight: 800;
          color: #111827;
          line-height: 1.2;
        }
        .inline-login-form .row {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }
        .inline-login-form .country {
          flex-shrink: 0;
          width: 100px;
          border: 1px solid #e7e7f0;
          border-radius: 18px;
          background: #fff;
          font-size: 17px;
          font-weight: 800;
          color: #1f2937;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px 0;
        }
        .inline-login-form .input {
          width: 100%;
          border: 1px solid #e7e7f0;
          border-radius: 18px;
          background: #fff;
          font-size: 16px;
          font-weight: 700;
          color: #111827;
          padding: 12px 14px;
          outline: none;
        }
        .inline-login-form .input::placeholder {
          color: #b8c2d7;
          font-weight: 700;
        }
        .inline-login-form .input:focus {
          border-color: #6b3df0;
          box-shadow: 0 0 0 4px rgba(107,61,240,.10);
        }
        .inline-login-form .code-btn {
          flex-shrink: 0;
          border: none;
          border-radius: 18px;
          background: #5b3cf0;
          color: #fff;
          font-size: 15px;
          font-weight: 900;
          padding: 0 20px;
          cursor: pointer;
          min-width: 130px;
          white-space: nowrap;
        }
        .inline-login-form .code-btn:disabled {
          opacity: .6;
          cursor: not-allowed;
        }
        .inline-login-form .submit-btn {
          width: 100%;
          margin-top: 4px;
          border: none;
          border-radius: 18px;
          background: linear-gradient(135deg, #5f3be0 0%, #8865f2 100%);
          color: #fff;
          font-size: 17px;
          font-weight: 800;
          padding: 13px 20px;
          cursor: pointer;
          box-shadow: 0 8px 20px rgba(101, 66, 204, 0.28);
        }
        .inline-login-form .submit-btn:disabled {
          opacity: .6;
          cursor: not-allowed;
        }
        .inline-login-form .error {
          margin: 6px 0 8px;
          border: 1px solid #fecaca;
          background: #fef2f2;
          border-radius: 14px;
          padding: 10px 14px;
          color: #dc2626;
          font-size: 14px;
          font-weight: 700;
        }
        .inline-login-form .hint {
          margin: 6px 0 8px;
          border: 1px solid #ddd6fe;
          background: #f5f3ff;
          border-radius: 14px;
          padding: 10px 14px;
          color: #5b21b6;
          font-size: 14px;
          font-weight: 700;
        }
        .inline-login-form .policy {
          margin-top: 14px;
          text-align: center;
          color: #7d8aa7;
          font-size: 11px;
          font-weight: 700;
        }
        .inline-login-form .policy a {
          color: #2f3f69;
          text-decoration: none;
          border-bottom: 2px solid rgba(47,63,105,0.25);
        }
        .inline-login-form .close-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 28px;
          height: 28px;
          border: none;
          border-radius: 999px;
          background: rgba(255,255,255,0.7);
          color: #8f87a9;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        @media (max-width: 768px) {
          .inline-login-form .input, .inline-login-form .country { font-size: 15px; border-radius: 14px; }
          .inline-login-form .submit-btn { font-size: 16px; border-radius: 14px; }
          .inline-login-form .code-btn { min-width: 110px; font-size: 14px; }
        }
      `}</style>

      {onClose && (
        <button className="close-btn" onClick={onClose} aria-label="关闭">×</button>
      )}

      <form onSubmit={handleSubmit}>
        <label className="field-label">手机号</label>
        <div className="row">
          <div className="country">+86</div>
          <input
            className="input"
            placeholder="请输入手机号"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
          />
        </div>

        <label className="field-label">验证码</label>
        <div className="row">
          <input
            className="input"
            placeholder="请输入验证码"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          <button
            type="button"
            className="code-btn"
            onClick={handleGetCode}
            disabled={!canGetCode}
          >
            {countdown > 0 ? `${countdown}s` : "获取验证码"}
          </button>
        </div>

        {localError ? <div className="error">{localError}</div> : null}
        {!localError && (hint || error) ? <div className="hint">{hint || error}</div> : null}

        <button className="submit-btn" type="submit" disabled={isLoading}>
          {isLoading ? "处理中..." : "登录/注册"}
        </button>
      </form>
      <div className="policy">
        登录视为您已阅读并同意 <a href="#">服务条款</a> 和 <a href="#">隐私政策</a>
      </div>
    </div>
  );
};

export default InlineLoginForm;
