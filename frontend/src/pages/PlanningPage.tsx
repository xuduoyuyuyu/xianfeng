import React, { useEffect, useRef } from "react";
import GlobalPublicNav from "../components/GlobalPublicNav";

const CACHE_BUST = Date.now().toString(36);

const PlanningPage: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const src = `/wel/Planning/教育规划首页.html?v=${CACHE_BUST}`;

  // Auto-resize iframe to fit content
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && typeof event.data === "object" && event.data.type === "resize" && event.data.height) {
        if (iframeRef.current) {
          iframeRef.current.style.height = `${event.data.height}px`;
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

      // Get xianfeng auth token
      const xianfengToken = localStorage.getItem("token") || "";

      // Pass token to wel iframe via postMessage
      if (xianfengToken) {
        iframe.contentWindow.postMessage(
          {
            type: "wel-auth",
            token: xianfengToken,
            source: "xianfeng",
          },
          "*"
        );
      }

      // Tell wel iframe to hide its own 小玩子 button (xianfeng provides one)
      iframe.contentWindow.postMessage(
        { type: "wel-config", hideOwnWidget: true },
        "*"
      );

      // Try to get iframe content height
      const doc = iframe.contentDocument || (iframe as any).contentWindow?.document;
      if (doc) {
        // Inject token bridge script before page scripts run
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
                    // Reload education plan data if on form page
                    if (typeof loadEducationPlanData === 'function') {
                      loadEducationPlanData();
                    }
                  } catch(e) {}
                }
              });

              // Override getAuthToken to check xianfeng token as fallback
              var _origGetAuthToken = typeof getAuthToken === 'function' ? getAuthToken : null;
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
            })();
          `;
          doc.head.appendChild(script);

          // Also try resize observer
          const roScript = doc.createElement("script");
          roScript.textContent = `
            (function() {
              var ro = new ResizeObserver(function() {
                var h = document.documentElement.scrollHeight || document.body.scrollHeight;
                window.parent.postMessage({ type: "resize", height: Math.min(h + 80, 8000) }, "*");
              });
              ro.observe(document.body);
              var h = document.documentElement.scrollHeight || document.body.scrollHeight;
              window.parent.postMessage({ type: "resize", height: Math.min(h + 80, 8000) }, "*");
            })();
          `;
          doc.head.appendChild(roScript);
        } catch (_e) {
          /* cross-origin */
        }

        const height = doc.documentElement.scrollHeight || doc.body.scrollHeight;
        if (height > 600) {
          iframe.style.height = `${Math.min(height + 120, 8000)}px`;
        }
      }
    } catch (_e) {
      /* cross-origin */
    }
  };

  return (
    <div className="relative min-h-screen overflow-auto bg-[#f3f2f8] text-[#1f1d1a]">
      {/* PlanningPage: gentle hex grid + soft drifting orbs */}
      <style>{`
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

      <main className="relative z-10 mx-auto max-w-5xl px-4 pb-16 pt-[64px] sm:px-6 lg:px-8">
        <iframe
          ref={iframeRef}
          src={src}
          title="教育规划"
          className="w-full border-0 rounded-[1.2rem]"
          loading="lazy"
          onLoad={handleIframeLoad}
          style={{ minHeight: "600px", height: "800px", background: "transparent" }}
        />
      </main>
    </div>
  );
};

export default PlanningPage;
