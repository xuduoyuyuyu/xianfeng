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
    const hasName = user.name && user.name !== user.username;
    const hasCity = !!(user as any).city;
    if (!hasName || !hasCity) {
      sessionStorage.setItem("xf_show_profile", "1");
    }
    navigate("/programs/list", { replace: true });
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
    <div className="phone-login-page">
      <style>{`
        .phone-login-page {
          min-height: 100vh;
          min-height: 100dvh;
          overflow-y: auto;
          background: #f7f2ff;
          font-family: "Noto Sans SC", "Plus Jakarta Sans", sans-serif;
        }
        .phone-login-bg {
          position: fixed;
          inset: 0;
          pointer-events: none;
          background-image:
            radial-gradient(circle at 15% 20%, rgba(186,141,255,0.22), transparent 38%),
            radial-gradient(circle at 85% 80%, rgba(116,82,255,0.16), transparent 45%);
        }

        /* ===== 桌面端：左右两栏 ===== */
        .phone-login-wrap {
          position: relative;
          max-width: 1200px;
          margin: 0 auto;
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 60px;
          padding: 32px 40px;
        }

        .phone-left {
          flex: 1;
          max-width: 560px;
        }
        .phone-left-logo {
          height: 44px;
          width: auto;
          object-fit: contain;
        }
        .phone-tag {
          display: inline-flex;
          margin-top: 40px;
          border-radius: 999px;
          border: 1px solid rgba(123,68,255,.2);
          background: rgba(255,255,255,.8);
          color: #7b44ff;
          padding: 7px 16px;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .18em;
        }
        .phone-title {
          margin: 14px 0 0;
          font-size: 80px;
          line-height: .96;
          letter-spacing: -.02em;
          font-weight: 900;
          color: #111018;
        }
        .phone-title span { color: #6b3df0; }
        .phone-desc {
          margin-top: 18px;
          font-size: 28px;
          line-height: 1.55;
          color: #6c778f;
          font-weight: 700;
        }

        .phone-right-illustration {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          max-width: 400px;
        }
        .login-illustration-img {
          width: 100%;
          max-width: 340px;
          height: auto;
          object-fit: contain;
          filter: drop-shadow(0 12px 32px rgba(107,61,240,0.12));
        }
        .phone-card {
          flex-shrink: 0;
          width: 440px;
          border-radius: 28px;
          border: 1px solid rgba(255,255,255,.8);
          background: rgba(255,255,255,.95);
          box-shadow: 0 20px 60px -20px rgba(92,43,234,.3);
          padding: 32px 32px 26px;
        }
        .brand {
          text-align: center;
          margin-bottom: 20px;
        }
        .brand img {
          display: block;
          margin: 0 auto;
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
          gap: 12px;
          margin-bottom: 16px;
        }
        .country {
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
        .input {
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
          border-radius: 18px;
          background: #5b3cf0;
          color: #fff;
          font-size: 17px;
          font-weight: 900;
          padding: 0 22px;
          cursor: pointer;
          min-width: 150px;
        }
        .code-btn:disabled {
          opacity: .6;
          cursor: not-allowed;
        }
        .submit-btn {
          width: 100%;
          margin-top: 4px;
          border: none;
          border-radius: 18px;
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
          margin: 6px 0 8px;
          border: 1px solid #fecaca;
          background: #fef2f2;
          border-radius: 14px;
          padding: 10px 14px;
          color: #dc2626;
          font-size: 15px;
          font-weight: 700;
        }
        .hint {
          margin: 6px 0 8px;
          border: 1px solid #ddd6fe;
          background: #f5f3ff;
          border-radius: 14px;
          padding: 10px 14px;
          color: #5b21b6;
          font-size: 15px;
          font-weight: 700;
        }
        .policy {
          margin-top: 16px;
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

        /* ===== 中等屏幕 ===== */
        @media (max-width: 1280px) {
          .phone-title { font-size: 62px; }
          .phone-desc { font-size: 22px; }
          .phone-card { width: 400px; }
          .phone-right-illustration { max-width: 320px; }
          .login-illustration-img { max-width: 270px; }
        }

        @media (max-width: 980px) {
          .phone-login-wrap { flex-direction: column; justify-content: flex-start; gap: 28px; padding: 24px; }
          .phone-left { width: 100%; max-width: 100%; }
          .phone-left-logo { height: 36px; }
          .phone-tag { margin-top: 20px; }
          .phone-title { font-size: 48px; }
          .phone-desc { font-size: 18px; max-width: 100%; }
          .phone-right-illustration { display: none; }
          .phone-card { width: 100%; max-width: 500px; }
          .field-label { font-size: 13px; }
          .input, .country, .code-btn { font-size: 15px; border-radius: 14px; }
          .submit-btn { font-size: 16px; border-radius: 14px; }
          .code-btn { min-width: 130px; }
        }

        /* ===== 手机端 ===== */
        @media (max-width: 768px) {
          .phone-login-wrap {
            gap: 18px;
            padding: 14px 14px 28px;
            justify-content: center;
            align-items: center;
          }
          .phone-left-logo {
            height: 32px;
          }
          .phone-tag {
            margin-top: 14px;
            padding: 6px 12px;
            font-size: 10px;
            letter-spacing: .14em;
          }
          .phone-title {
            margin-top: 8px;
            font-size: 36px;
            line-height: 1.05;
          }
          .phone-desc {
            margin-top: 10px;
            font-size: 15px;
            line-height: 1.6;
          }
          .phone-card {
            border-radius: 22px;
            padding: 22px 16px 18px;
          }
          .brand {
            margin-bottom: 14px;
          }
          .brand img {
            height: 32px;
          }
          .row {
            gap: 8px;
            margin-bottom: 12px;
          }
          .country {
            width: 70px;
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
            min-width: 110px;
            border-radius: 12px;
            font-size: 14px;
            padding: 0 12px;
          }
          .submit-btn {
            border-radius: 12px;
            font-size: 16px;
            padding: 12px 14px;
          }
          .error, .hint {
            font-size: 13px;
            border-radius: 10px;
            padding: 8px 10px;
            margin: 4px 0 6px;
          }
          .policy {
            margin-top: 12px;
            font-size: 11px;
          }
        }

        /* ===== 极小屏 ===== */
        @media (max-width: 420px) {
          .phone-login-wrap { padding: 12px 10px 20px; gap: 14px; }
          .phone-title { font-size: 30px; }
          .phone-desc { font-size: 14px; }
          .phone-card { padding: 18px 12px 14px; }
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
            padding: 10px 0;
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
          <p className="phone-desc">
            家长先疯不仅是一个教育平台，它是基于深度理解分析的进化引擎。在这里，每一次学习都是一次精准的破译。
          </p>
        </div>
        <div className="phone-right-illustration">
          <img alt="安全守护" src="/assets/login-illustration.png" className="login-illustration-img" />
        </div>
        <div className="phone-card">
          <div className="brand">
            <img alt="家长先疯" src="/assets/logo.png" />
          </div>
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
      </div>
    </div>
  );
};

export default UserLoginPage;
