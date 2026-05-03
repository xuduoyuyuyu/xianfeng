import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";

type GlobalPublicNavProps = {
  showSearch?: boolean;
  showAiOnline?: boolean;
  showLogout?: boolean;
  compactMobile?: boolean;
  showProgramList?: boolean;
  showProgramEntry?: boolean;
};

const GlobalPublicNav: React.FC<GlobalPublicNavProps> = ({
  showSearch = true,
  showAiOnline = true,
  showLogout = true,
  compactMobile = false,
  showProgramList = true,
  showProgramEntry = true,
}) => {
  const { pathname } = useLocation();
  const activePrograms = pathname.startsWith("/programs");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <style>{`
        #tb{height:52px;flex-shrink:0;background:rgba(255,255,255,.92);backdrop-filter:blur(16px);border-bottom:1px solid rgba(17,10,8,.08);display:flex;align-items:center;z-index:100;padding:0 10px;gap:8px;overflow:visible}
        #tb .tb-logo{flex-shrink:0;display:flex;align-items:center;gap:8px;padding:0 14px;cursor:pointer;transition:all .15s;height:calc(100% - 12px);border:1px solid transparent;border-radius:11px}
        #tb .tb-logo:hover{background:rgba(108,39,214,.05);border-color:rgba(108,39,214,.16)}
        #tb .tb-nav{flex:1;display:flex;align-items:center;padding:0 4px;gap:2px;height:100%;overflow:visible}
        #tb .tb-nav-btn{display:flex;align-items:center;gap:5px;height:100%;padding:0 12px;border:none;border-bottom:2px solid transparent;background:transparent;font:inherit;font-size:13px;font-weight:500;color:#6b7280;cursor:pointer;transition:all .15s;white-space:nowrap;position:relative;text-decoration:none}
        #tb .tb-nav-btn .ms{font-family:'Material Symbols Rounded';font-size:15px;line-height:1;font-variation-settings:'FILL' 0}
        #tb .tb-nav-btn:hover{color:#111118}
        #tb .tb-nav-btn.on{color:#6c27d6;font-weight:600;border-bottom-color:#6c27d6}
        #tb .tb-nav-btn.on .ms{font-variation-settings:'FILL' 1;color:#6c27d6}
        #tb .tb-right{display:flex;align-items:center;gap:4px;padding:0 8px;flex-shrink:0}
        #tb .search-wrap{display:flex;align-items:center;gap:6px;height:34px;padding:0 12px;border:1px solid rgba(17,10,8,.12);border-radius:9999px;background:#fff;width:230px;min-width:230px}
        #tb .search-wrap input{width:100%;border:none;outline:none;background:transparent;font-size:12px;color:#111118}
        #tb .search-wrap input::placeholder{color:#9ca3af}
        #tb .search-divider{width:1px;height:24px;background:rgba(17,10,8,.08);margin:0 6px 0 2px}
        #tb .ai-pill{display:flex;align-items:center;gap:5px;padding:3px 9px;background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.18);border-radius:20px;font-size:10.5px;font-weight:600;color:#059669}
        #tb .ai-dot{width:5px;height:5px;border-radius:50%;background:#10b981;box-shadow:0 0 5px #10b981;animation:blink 2s ease-in-out infinite}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.35}}
        #tb .uc{display:flex;align-items:center;gap:6px;padding:3px 10px 3px 5px;border:1px solid rgba(17,10,8,.08);border-radius:20px;cursor:pointer;transition:all .12s;text-decoration:none}
        #tb .uc:hover{border-color:#6c27d6;background:rgba(108,39,214,.09)}
        #tb .uc-av{width:20px;height:20px;border-radius:5px;background:linear-gradient(135deg,#6c27d6,#a855f7);display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:700}
        #tb .uc-name{font-size:11.5px;font-weight:600;color:#111118}
        #tb .ibtn{width:30px;height:30px;border:none;border-radius:7px;background:transparent;color:#6b7280;display:flex;align-items:center;justify-content:center;font-family:'Material Symbols Rounded';font-size:16px;font-variation-settings:'FILL' 0;transition:all .12s}
        #tb .mobile-toggle{display:none}
        #tb .mobile-main-link{display:none}
        .tb-mobile-panel{display:none}

        @media (max-width: 768px){
          #tb{height:56px;padding:0 8px}
          #tb .tb-logo{padding:0 8px;height:calc(100% - 10px)}
          #tb .tb-nav{display:none}
          #tb .tb-right{display:none}
          #tb .mobile-toggle{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border:1px solid rgba(17,10,8,.12);background:#fff;border-radius:10px;color:#4b5563;font-family:'Material Symbols Rounded';font-size:20px;line-height:1}
          #tb .mobile-main-link{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 12px;border-radius:10px;border:1px solid rgba(17,10,8,.08);font-size:12px;font-weight:700;color:#374151;background:#fff;text-decoration:none}
          #tb .mobile-main-link.on{color:#6c27d6;border-color:rgba(108,39,214,.3);background:rgba(108,39,214,.06)}
          .tb-mobile-panel{display:block;position:fixed;top:56px;left:0;right:0;background:rgba(255,255,255,.98);backdrop-filter:blur(10px);border-bottom:1px solid rgba(17,10,8,.08);z-index:49;padding:10px 12px 14px;box-shadow:0 14px 30px rgba(30,41,59,.08)}
          .tb-mobile-grid{display:grid;gap:8px}
          .tb-mobile-link{min-height:44px;display:flex;align-items:center;gap:8px;padding:0 12px;border-radius:12px;border:1px solid rgba(148,163,184,.3);text-decoration:none;color:#334155;font-size:13px;font-weight:700;background:#fff}
          .tb-mobile-link.on{border-color:rgba(108,39,214,.35);background:rgba(108,39,214,.06);color:#6c27d6}
          .tb-mobile-muted{margin-top:8px;font-size:11px;color:#64748b;font-weight:600}
        }
      `}</style>
      <nav className="fixed top-0 z-50 w-full">
        <div id="tb">
          <Link className="tb-logo" to="/programs" onClick={() => setMenuOpen(false)}>
            <img src="/assets/logo.png" alt="Logo" style={{ height: 29 }} />
          </Link>

          <nav className="tb-nav" id="tb-nav">
            {showProgramList ? (
              <Link to="/programs" className={`tb-nav-btn ${activePrograms ? "on" : ""}`}>
                <span className="ms">podcasts</span>
                <span>节目列表</span>
              </Link>
            ) : null}
          </nav>

          <div className="tb-right">
            {showSearch ? (
              <>
                <label className="search-wrap" id="tb-program-search-wrap">
                  <span className="ms0" style={{ fontFamily: "'Material Symbols Rounded'", fontSize: 16, color: "#9ca3af", lineHeight: 1 }}>
                    search
                  </span>
                  <input id="tb-program-search-input" type="text" placeholder="搜索节目标题/简介" />
                </label>
                {showAiOnline ? <span className="search-divider" id="tb-search-divider" /> : null}
              </>
            ) : null}
            {showAiOnline ? (
              <div className="ai-pill" id="ai-pill">
                <div className="ai-dot" />
                <span id="ai-txt">AI 在线</span>
              </div>
            ) : null}
            <Link className="uc" id="uc" to="/login">
              <div className="uc-av" id="uc-av">登</div>
              <span className="uc-name" id="uc-name">登录/注册</span>
            </Link>
            {showLogout ? (
              <button className="ibtn" title="退出" type="button">
                logout
              </button>
            ) : null}
          </div>

          {compactMobile ? (
            <>
              {showProgramEntry ? (
                <Link to="/programs" className={`mobile-main-link ${activePrograms ? "on" : ""}`} onClick={() => setMenuOpen(false)}>
                  节目入口
                </Link>
              ) : null}
              <button type="button" className="mobile-toggle" onClick={() => setMenuOpen((v) => !v)} aria-label="打开导航菜单">
                menu
              </button>
            </>
          ) : null}
        </div>

        {compactMobile && menuOpen ? (
          <div className="tb-mobile-panel">
            <div className="tb-mobile-grid">
              <Link className={`tb-mobile-link ${activePrograms ? "on" : ""}`} to="/programs" onClick={() => setMenuOpen(false)}>
                <span className="ms">podcasts</span>
                <span>播客节目</span>
              </Link>
              <Link className="tb-mobile-link" to="/books" onClick={() => setMenuOpen(false)}>
                <span className="ms">menu_book</span>
                <span>推荐书单</span>
              </Link>
              <Link className="tb-mobile-link" to="/materials" onClick={() => setMenuOpen(false)}>
                <span className="ms">inventory_2</span>
                <span>学习资料</span>
              </Link>
              <Link className="tb-mobile-link" to="/login" onClick={() => setMenuOpen(false)}>
                <span className="ms">login</span>
                <span>登录/注册</span>
              </Link>
            </div>
            <p className="tb-mobile-muted">面向家长的教育决策内容平台</p>
          </div>
        ) : null}
      </nav>
    </>
  );
};

export default GlobalPublicNav;
