import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { login } from '../../store/userSlice';
import { RootState } from '../../store';

const AdminLoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isLoading, error, user } = useSelector((state: RootState) => state.user);

  useEffect(() => {
    if (user?.role === 'admin') {
      navigate('/admin', { replace: true });
    }
  }, [navigate, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    
    try {
      await dispatch(login({ username, password }) as any).unwrap();
      navigate('/admin');
    } catch (err: any) {
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
          background:
            radial-gradient(1200px 700px at 50% 40%, rgba(44, 80, 255, 0.18), transparent 60%),
            radial-gradient(700px 500px at 50% 50%, rgba(107, 61, 240, 0.14), transparent 70%),
            #030712;
          font-family: "Noto Sans SC", "Plus Jakarta Sans", sans-serif;
          color: #e5e7eb;
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
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(10, 18, 34, 0.72);
          box-shadow: 0 0 0 1px rgba(129, 140, 248, 0.1), 0 24px 80px rgba(2, 6, 23, 0.8);
          backdrop-filter: blur(10px);
          padding: 26px;
        }
        .adm-card-logo {
          margin-bottom: 8px;
          text-align: center;
        }
        .adm-card-logo img {
          height: 42px;
          width: auto;
          object-fit: contain;
        }
        .adm-card-subtitle {
          text-align: center;
          margin: 0 0 20px;
          font-size: 13px;
          color: #93a4c5;
          letter-spacing: 0.04em;
        }
        .adm-field {
          margin-bottom: 16px;
        }
        .adm-label {
          display: block;
          margin-bottom: 8px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #9aa7c5;
        }
        .adm-input-wrap {
          display: flex;
          align-items: center;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 12px;
          background: rgba(10, 18, 34, 0.65);
          padding: 11px 12px;
        }
        .adm-input-wrap:focus-within {
          border-color: rgba(129, 140, 248, 0.9);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
        }
        .adm-icon {
          margin-right: 8px;
          color: #7f8fb2;
          font-size: 20px;
        }
        .adm-input {
          width: 100%;
          border: none;
          outline: none;
          font-size: 14px;
          color: #e5e7eb;
          background: transparent;
        }
        .adm-input::placeholder {
          color: #64748b;
        }
        .adm-error {
          margin: 8px 0 12px;
          border: 1px solid rgba(239, 68, 68, 0.35);
          background: rgba(127, 29, 29, 0.3);
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 13px;
          color: #fecaca;
        }
        .adm-submit {
          width: 100%;
          margin-top: 6px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #5b5fff, #6b3df0);
          color: white;
          padding: 13px 16px;
          font-size: 14px;
          font-weight: 900;
          cursor: pointer;
          letter-spacing: 0.06em;
        }
        .adm-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .adm-agree {
          margin-top: 18px;
          text-align: center;
          font-size: 11px;
          color: #7d8cae;
        }
        .adm-link {
          color: #8f8fff;
          text-decoration: none;
        }
        .adm-back {
          margin-top: 8px;
          text-align: center;
          font-size: 12px;
        }
        .adm-back a {
          color: #8fa0c8;
          text-decoration: none;
        }
      `}</style>
      <div className="adm-login-wrap">
        <div className="adm-card">
          <div className="adm-card-logo">
            <img alt="家长先疯" src="/assets/logo.png" />
          </div>
          <p className="adm-card-subtitle">家长先疯管理后台 · Admin Console</p>
          <form onSubmit={handleSubmit}>
            <div className="adm-field">
              <label className="adm-label">管理账号</label>
              <div className="adm-input-wrap">
                <span className="material-symbols-outlined adm-icon">person</span>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="adm-input" placeholder="输入管理账号..." required />
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
              {isLoading ? "进入中..." : "进入后台"}
            </button>
          </form>
          <div className="adm-agree">
            登录视为您已阅读并同意
            <a className="adm-link" href="#"> 服务条款 </a>
            和
            <a className="adm-link" href="#"> 隐私政策</a>
          </div>
          <div className="adm-back">
            <Link to="/programs">返回前台</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
