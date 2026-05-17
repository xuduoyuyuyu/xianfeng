import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store";
import { login } from "../store/userSlice";
import { userApi } from "../services/api";

const PHONE_REGEX = /^1\d{10}$/;

const UserLoginPage: React.FC = () => {
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
    if (user.role === "admin") {
      navigate("/admin", { replace: true });
      return;
    }
    navigate("/programs", { replace: true });
  }, [navigate, user]);

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
      // user not exists or password mismatch, try register
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
    <div className="phone-login-page">
      <style>{`
        .phone-login-page {
          min-height: 100vh;
          overflow: hidden;
          background: #f7f2ff;
          font-family: "Noto Sans SC", "Plus Jakarta Sans", sans-serif;
        }
        .phone-login-bg {
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(to right, rgba(138,99,255,0.10) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(138,99,255,0.10) 1px, transparent 1px),
            radial-gradient(circle at 15% 20%, rgba(186,141,255,0.22), transparent 38%),
            radial-gradient(circle at 85% 80%, rgba(116,82,255,0.16), transparent 45%);
          background-size: 40px 40px, 40px 40px, 100% 100%, 100% 100%;
        }
        .phone-login-wrap {
          position: relative;
          max-width: 1440px;
          margin: 0 auto;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 48px;
          padding: 24px 40px;
        }
        .phone-left {
          flex: 1;
          min-width: 0;
        }
        .phone-left-logo {
          height: 44px;
          width: auto;
          object-fit: contain;
        }
        .phone-tag {
          display: inline-flex;
          margin-top: 48px;
          border-radius: 999px;
          border: 1px solid rgba(123,68,255,.2);
          background: rgba(255,255,255,.8);
          color: #7b44ff;
          padding: 8px 18px;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .2em;
        }
        .phone-title {
          margin: 16px 0 0;
          font-size: 92px;
          line-height: .95;
          letter-spacing: -.02em;
          font-weight: 900;
          color: #111018;
        }
        .phone-title span { color: #6b3df0; }
        .phone-desc {
          margin-top: 22px;
          max-width: 620px;
          font-size: 34px;
          line-height: 1.55;
          color: #6c778f;
          font-weight: 700;
        }
        .phone-card {
          width: 100%;
          max-width: 620px;
          border-radius: 28px;
          border: 1px solid rgba(255,255,255,.8);
          background: rgba(255,255,255,.95);
          box-shadow: 0 20px 60px -20px rgba(92,43,234,.3);
          padding: 28px 28px 22px;
        }
        .brand {
          text-align: center;
          margin-bottom: 18px;
          display: flex;
          justify-content: center;
        }
        .brand img {
          display: block;
          height: 40px;
          width: auto;
          object-fit: contain;
        }
        .field-label {
          display: block;
          margin-bottom: 8px;
          font-size: 12px;
          font-weight: 800;
          color: #111827;
          line-height: 1.2;
        }
        .row {
          display: flex;
          gap: 14px;
          margin-bottom: 18px;
        }
        .country {
          flex-shrink: 0;
          width: 110px;
          border: 1px solid #e7e7f0;
          border-radius: 20px;
          background: #fff;
          font-size: 18px;
          font-weight: 800;
          color: #1f2937;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px 0;
        }
        .input {
          width: 100%;
          border: 1px solid #e7e7f0;
          border-radius: 20px;
          background: #fff;
          font-size: 16px;
          font-weight: 700;
          color: #111827;
          padding: 12px 16px;
          outline: none;
        }
        .input::placeholder {
          color: #b8c2d7;
          font-weight: 700;
        }
        .input:focus {
          border-color: #6b3df0;
          box-shadow: 0 0 0 4px rgba(107,61,240,.10);
        }
        .code-btn {
          flex-shrink: 0;
          border: none;
          border-radius: 20px;
          background: #5b3cf0;
          color: #fff;
          font-size: 18px;
          font-weight: 900;
          padding: 0 24px;
          cursor: pointer;
          min-width: 170px;
        }
        .code-btn:disabled {
          opacity: .6;
          cursor: not-allowed;
        }
        .submit-btn {
          width: 100%;
          margin-top: 8px;
          border: none;
          border-radius: 20px;
          background: #5b3cf0;
          color: #fff;
          font-size: 18px;
          font-weight: 900;
          padding: 13px 20px;
          cursor: pointer;
        }
        .submit-btn:disabled {
          opacity: .6;
          cursor: not-allowed;
        }
        .error {
          margin: 8px 0 10px;
          border: 1px solid #fecaca;
          background: #fef2f2;
          border-radius: 14px;
          padding: 10px 14px;
          color: #dc2626;
          font-size: 16px;
          font-weight: 700;
        }
        .hint {
          margin: 8px 0 10px;
          border: 1px solid #ddd6fe;
          background: #f5f3ff;
          border-radius: 14px;
          padding: 10px 14px;
          color: #5b21b6;
          font-size: 16px;
          font-weight: 700;
        }
        .policy {
          margin-top: 14px;
          text-align: center;
          color: #7d8aa7;
          font-size: 12px;
          font-weight: 700;
        }
        .policy a {
          color: #2f3f69;
          text-decoration: none;
          border-bottom: 2px solid rgba(47,63,105,0.25);
        }
        @media (max-width: 1280px) {
          .phone-title { font-size: 68px; }
          .phone-desc { font-size: 26px; }
          .input, .code-btn, .submit-btn { font-size: 16px; }
          .policy { font-size: 12px; }
        }
        @media (max-width: 980px) {
          .phone-login-wrap { flex-direction: column; justify-content: center; padding: 24px; }
          .phone-left { width: 100%; }
          .phone-title { font-size: 56px; }
          .phone-desc { font-size: 20px; max-width: 100%; }
          .phone-tag { margin-top: 24px; }
          .phone-card { max-width: 620px; padding: 24px; }
          .field-label { font-size: 14px; }
          .input, .country, .code-btn { font-size: 15px; border-radius: 14px; }
          .submit-btn { font-size: 16px; border-radius: 14px; }
          .policy { font-size: 14px; }
          .code-btn { min-width: 140px; }
        }
        @media (max-width: 768px) {
          .phone-login-wrap {
            gap: 20px;
            padding: 18px 14px 24px;
            align-items: stretch;
          }
          .phone-left-logo {
            height: 34px;
          }
          .phone-tag {
            margin-top: 14px;
            padding: 6px 12px;
            font-size: 10px;
            letter-spacing: .14em;
          }
          .phone-title {
            margin-top: 10px;
            font-size: 38px;
            line-height: 1.04;
          }
          .phone-desc {
            margin-top: 12px;
            font-size: 16px;
            line-height: 1.65;
          }
          .phone-card {
            max-width: none;
            border-radius: 22px;
            padding: 18px 14px 16px;
          }
          .brand {
            margin-bottom: 12px;
          }
          .brand img {
            height: 32px;
          }
          .row {
            gap: 10px;
            margin-bottom: 12px;
          }
          .country {
            width: 78px;
            font-size: 14px;
            border-radius: 12px;
            padding: 10px 0;
          }
          .input {
            border-radius: 12px;
            font-size: 14px;
            padding: 10px 12px;
          }
          .code-btn {
            min-width: 112px;
            border-radius: 12px;
            font-size: 14px;
            padding: 0 10px;
          }
          .submit-btn {
            border-radius: 12px;
            font-size: 15px;
            padding: 11px 14px;
          }
          .error, .hint {
            font-size: 13px;
            border-radius: 10px;
            padding: 8px 10px;
            margin-bottom: 8px;
          }
          .policy {
            font-size: 11px;
          }
        }
        @media (max-width: 420px) {
          .phone-title {
            font-size: 34px;
          }
          .phone-desc {
            font-size: 15px;
          }
          .row {
            flex-wrap: wrap;
          }
          .row .input {
            min-width: 0;
            width: 100%;
          }
          .row .code-btn {
            width: 100%;
            min-height: 40px;
          }
        }
      `}</style>

      <div className="phone-login-bg" />

      <div className="phone-login-wrap">
        <div className="phone-left">
          <img alt="家长先疯" className="phone-left-logo" src="/assets/logo.png" />
          <span className="phone-tag">VERSION 2.0 CORE</span>
          <h1 className="phone-title">
            洞察本质
            <br />
            <span>同步未来</span>
          </h1>
          <p className="phone-desc">家长先疯不仅是一个教育平台，它是基于深度理解分析的进化引擎。在这里，每一次学习都是一次精准的破译。</p>
        </div>
        <div className="phone-card">
          <div className="brand">
            <img alt="家长先疯" src="/assets/logo.png" />
          </div>
          <form onSubmit={handleSubmit}>
            <label className="field-label">手机号</label>
            <div className="row">
              <div className="country">+86</div>
              <input className="input" placeholder="请输入手机号" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} />
            </div>

            <label className="field-label">验证码</label>
            <div className="row">
              <input className="input" placeholder="请输入验证码" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
              <button type="button" className="code-btn" onClick={handleGetCode} disabled={!canGetCode}>
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
      </div>
    </div>
  );
};

export default UserLoginPage;
