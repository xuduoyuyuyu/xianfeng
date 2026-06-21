import React, { useEffect, useRef } from "react";
import GlobalPublicNav from "../components/GlobalPublicNav";

const CACHE_BUST = Date.now().toString(36);

const PlanningPage: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const src = `/wel/Planning/教育规划首页.html?v=${CACHE_BUST}`;

  // Force body background to match our container
  useEffect(() => {
    const prevBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#f3f2f8";
    return () => {
      document.body.style.backgroundColor = prevBg;
    };
  }, []);

  // Listen for auth requests from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && typeof event.data === "object") {
        if (event.data.type === "get-xianfeng-token") {
          const token = localStorage.getItem("token") || "";
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              { type: "wel-auth", token, source: "xianfeng" },
              "*"
            );
          }
        } else if (event.data.type === "WEL_LOGIN_REQUIRED") {
          document.dispatchEvent(new CustomEvent("xf-show-login-modal", {
            detail: {
              title: event.data.title || "登录后即可使用",
              description: event.data.description || "登录后可获取个性化教育规划方案，基于您的城市政策和家庭情况定制专属路径。"
            }
          }));
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleIframeLoad = () => {
    try {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) return;

      // Ensure iframe fills wrapper completely - no dynamic JS height needed
      // The CSS flex layout already handles this

      // Pass xianfeng auth token to wel iframe
      const token = localStorage.getItem("token") || "";
      if (token) {
        iframe.contentWindow.postMessage(
          { type: "wel-auth", token, source: "xianfeng" },
          "*"
        );
      }

      // Inject token bridge into iframe
      const doc = iframe.contentDocument || (iframe as any).contentWindow?.document;
      if (doc) {
        try {
          const script = doc.createElement("script");
          script.textContent = `
            (function() {
              // Listen for auth token from parent xianfeng page
              window.addEventListener('message', function(event) {
                if (event.data && event.data.type === 'wel-auth' && event.data.token) {
                  try {
                    localStorage.setItem('wel_tok', event.data.token);
                    console.log('[wel-bridge] token synced from xianfeng');
                    if (typeof loadEducationPlanData === 'function') {
                      loadEducationPlanData();
                    }
                  } catch(e) {}
                }
              });

              window.__welBridgeGetToken = function() {
                try {
                  var t = localStorage.getItem('wel_tok');
                  if (t) return t;
                  t = localStorage.getItem('token');
                  if (t) {
                    localStorage.setItem('wel_tok', t);
                    return t;
                  }
                } catch(e) {}
                return '';
              };

              // Request token from parent on load
              window.parent.postMessage({ type: 'get-xianfeng-token' }, '*');
            })();
          `;
          doc.head.appendChild(script);
        } catch (_e) {
          /* cross-origin */
        }
      }
    } catch (_e) {
      /* cross-origin */
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-[#f3f2f8] text-[#1f1d1a]">
      {/* PlanningPage: gentle hex grid + soft drifting orbs */}
      <style key="plan-bg">{`
        @keyframes planOrb1 {
          0%,100% { transform: translate3d(0,0,0) scale(1); opacity: .5; }
          50% { transform: translate3d(1.5%,-2%,0) scale(1.1); opacity: .75; }
        }
        @keyframes planOrb2 {
          0%,100% { transform: translate3d(0,0,0) scale(.9); opacity: .45; }
          45% { transform: translate3d(-2%,1.5%,0) scale(1.15); opacity: .7; }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 opacity-35">
        <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(118,83,205,0.06)_0.8px,transparent_0.8px)] bg-[size:22px_22px]" />
      </div>
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-[12%] right-[10%] h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,rgba(143,100,255,0.1),transparent_60%)]" style={{ animation: "planOrb1 14s ease-in-out infinite" }} />
        <div className="absolute bottom-[15%] left-[5%] h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,rgba(109,52,226,0.1),transparent_55%)]" style={{ animation: "planOrb2 16s ease-in-out infinite 4s" }} />
      </div>

      <GlobalPublicNav
        compactMobile
        showSearch={false}
        showAiOnline
        showLogout
        showProgramList
        showExpertsEntry
        showBooksEntry
        showMaterialsEntry
      />

      <div className="relative z-10 flex-1" style={{ overflow: "hidden", background: "transparent" }}>
        <iframe
          ref={iframeRef}
          src={src}
          title="教育规划"
          className="w-full h-full border-0"
          onLoad={handleIframeLoad}
          style={{
            width: "100%",
            height: "100%",
            background: "transparent",
            display: "block",
          }}
        />
      </div>
    </div>
  );
};

export default PlanningPage;
