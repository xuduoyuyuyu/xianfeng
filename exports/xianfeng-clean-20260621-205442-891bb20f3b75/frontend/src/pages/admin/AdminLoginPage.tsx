import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { adminLogin } from '../../store/adminSlice';
import { logout } from '../../store/userSlice';
import { RootState } from '../../store';

const AdminLoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { admin, isLoading, error, adminToken } = useSelector((state: RootState) => state.admin);
  // 也读 user slice 看是否有残留的普通用户登录态
  const { user } = useSelector((state: RootState) => state.user);

  // admin 登录后需要先清除普通用户登录态
  useEffect(() => {
    if (user && user.role !== 'admin') {
      dispatch(logout());
    }
  }, [dispatch, user]);

  useEffect(() => {
    if (admin && admin.role === 'admin' && adminToken) {
      navigate('/admin', { replace: true });
    }
  }, [navigate, admin, adminToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    try {
      await dispatch(adminLogin({ username, password }) as any).unwrap();
    } catch (_err) {
      // 错误已在 Redux 中处理
    }
  };

  return (
    <div className="adm-login-page">
      <style>{`
        .adm-login-page {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          background: #0b1020;
          font-family: "Noto Sans SC", "Plus Jakarta Sans", sans-serif;
          color: #e6e9f2;
        }
        .adm-login-bg {
          position: fixed;
          inset: 0;
          background-image:
            radial-gradient(circle at 15% 20%, rgba(94,23,235,0.12), transparent 38%),
            radial-gradient(circle at 85% 80%, rgba(94,23,235,0.08), transparent 45%);
          background-size: 100% 100%, 100% 100%;
        }
        .adm-login-wrap {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .adm-card {
          width: 100%;
          max-width: 460px;
          border-radius: 18px;
          border: 1px solid rgba(148,163,184,0.2);
          background: rgba(15,23,42,0.9);
          box-shadow: 0 24px 70px rgba(94,23,235,0.15);
          backdrop-filter: blur(12px);
          padding: 32px 28px;
        }
        .adm-card-brand {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 24px;
          text-align: center;
        }
        .adm-card-logo {
          display: flex;
          justify-content: center;
          width: 100%;
          margin-bottom: 8px;
        }
        .adm-card-logo img {
          display: block;
          height: 44px;
          width: auto;
          object-fit: contain;
        }
        .adm-card-subtitle {
          text-align: center;
          margin: 0;
          font-size: 13px;
          color: #98a2b3;
          letter-spacing: 0.04em;
        }
        .adm-field {
          margin-bottom: 18px;
        }
        .adm-label {
          display: block;
          margin-bottom: 8px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #7c8aa5;
        }
        .adm-input-wrap {
          display: flex;
          align-items: center;
          border: 1px solid rgba(148,163,184,0.25);
          border-radius: 12px;
          background: rgba(30,41,59,0.6);
          padding: 11px 14px;
        }
        .adm-input-wrap:focus-within {
          border-color: #5e17eb;
          box-shadow: 0 0 0 3px rgba(94,23,235,0.2);
        }
        .adm-icon {
          margin-right: 10px;
          color: #64748b;
          font-size: 20px;
        }
        .adm-input {
          width: 100%;
          border: none;
          outline: none;
          font-size: 14px;
          color: #e6e9f2;
          background: transparent;
          appearance: none;
          box-shadow: none;
        }
        .adm-input::placeholder {
          color: #475569;
        }
        .adm-input:-webkit-autofill,
        .adm-input:-webkit-autofill:hover,
        .adm-input:-webkit-autofill:focus {
          -webkit-text-fill-color: #e6e9f2;
          box-shadow: 0 0 0 1000px rgba(30,41,59,0.9) inset;
          transition: background-color 9999s ease-out;
        }
        .adm-error {
          margin: 8px 0 16px;
          border: 1px solid rgba(239,68,68,0.3);
          background: rgba(239,68,68,0.1);
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 13px;
          color: #fca5a5;
        }
        .adm-submit {
          width: 100%;
          margin-top: 4px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #5e17eb, #7c3aed);
          color: white;
          padding: 13px 16px;
          font-size: 14px;
          font-weight: 900;
          cursor: pointer;
          letter-spacing: 0.06em;
          transition: opacity 0.2s;
        }
        .adm-submit:hover {
          opacity: 0.9;
        }
        .adm-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .adm-agree {
          margin-top: 18px;
          text-align: center;
          font-size: 11px;
          color: #64748b;
        }
        .adm-link {
          color: #8b5cf6;
          text-decoration: none;
        }
        .adm-back {
          margin-top: 12px;
          text-align: center;
          font-size: 12px;
        }
        .adm-back a {
          color: #98a2b3;
          text-decoration: none;
        }
        .adm-back a:hover {
          color: #c4b5fd;
        }
      `}</style>
      <div className="adm-login-bg" />
      <div className="adm-login-wrap">
        <div className="adm-card">
          <div className="adm-card-brand">
            <div className="adm-card-logo">
              <img alt="家长先疯" src="/assets/logo.png" />
            </div>
            <p className="adm-card-subtitle">管理后台 · Admin Console</p>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="adm-field">
              <label className="adm-label">管理账号</label>
              <div className="adm-input-wrap">
                <span className="material-symbols-outlined adm-icon">person</span>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="adm-input" placeholder="输入管理账号..." required autoFocus />
              </div>
            </div>
            <div className="adm-field">
              <label className="adm-label">管理密码</label>
              <div className="adm-input-wrap">
                <span className="material-symbols-outlined adm-icon">lock</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="adm-input" placeholder="输入管理密码..." required />
              </div>
            </div>
            {error && <div className="adm-error">{error}</div>}
            <button type="submit" disabled={isLoading} className="adm-submit">
              {isLoading ? "验证中..." : "进入后台"}
            </button>
          </form>
          <div className="adm-agree">
            登录即表示同意
            <a className="adm-link" href="#"> 服务条款 </a>
            和
            <a className="adm-link" href="#"> 隐私政策</a>
          </div>
          <div className="adm-back">
            <Link to="/programs">← 返回前台</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
