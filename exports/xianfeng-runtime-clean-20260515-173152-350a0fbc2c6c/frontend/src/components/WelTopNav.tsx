import React from "react";

const WelTopNav: React.FC = () => {
  return (
    <>
      <style>{`
        #tb{height:52px;display:flex;align-items:center;background:#fff;border-bottom:1px solid rgba(17,10,8,.08)}
        #tb .tb-logo{display:flex;align-items:center;height:100%;padding:0 14px;border-right:1px solid rgba(17,10,8,.08);cursor:pointer}
        #tb .tb-right{margin-left:auto;display:flex;align-items:center;gap:8px;padding:0 14px}
        #tb .ai-pill{display:flex;align-items:center;gap:5px;padding:3px 9px;background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.18);border-radius:20px;font-size:10.5px;font-weight:600;color:#059669}
        #tb .ai-dot{width:5px;height:5px;border-radius:50%;background:#10b981;box-shadow:0 0 5px #10b981;animation:blink 2s ease-in-out infinite}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.35}}
        #tb .ibtn{width:30px;height:30px;border:none;border-radius:7px;background:transparent;color:#7d736f;display:flex;align-items:center;justify-content:center;font-family:'Material Symbols Rounded';font-size:16px}
      `}</style>
      <div id="tb">
        <div
          className="tb-logo"
          onClick={() => {
            window.location.href = "/";
          }}
        >
          <img src="/logo.png" alt="Logo" style={{ height: 22 }} />
        </div>
        <nav className="tb-nav" id="tb-nav" />
        <div className="tb-right">
          <div className="ai-pill" id="ai-pill">
            <div className="ai-dot" />
            <span id="ai-txt">AI 在线</span>
          </div>
          <button className="ibtn" title="退出" type="button">
            logout
          </button>
        </div>
      </div>
    </>
  );
};

export default WelTopNav;
