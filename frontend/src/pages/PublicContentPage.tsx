import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useXiaowanziEmbeddedLayer } from "../utils/xiaowanziLayer";

const PublicContentPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const superModePage = useXiaowanziEmbeddedLayer();
  const targetUrl = String(searchParams.get("url") || "").trim();
  const title = String(searchParams.get("title") || "公开内容").trim();
  const canFrame = /^https?:\/\//i.test(targetUrl);

  const backButton = superModePage ? (
    <button
      type="button"
      aria-label="返回小玩子"
      onClick={() => {
        if (window.history.length > 1) {
          navigate(-1);
          return;
        }
        navigate("/experts?xw_layer=1");
      }}
      className="fixed left-4 top-[calc(14px+env(safe-area-inset-top))] z-[120] inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-[#11143b] shadow-[0_10px_24px_rgba(70,73,132,0.14)]"
    >
      <span className="material-symbols-outlined text-[28px]">arrow_back</span>
    </button>
  ) : null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f3f2f8] text-[#241a3a]">
      <style>{`
        html.xf-mp-webview .public-content-main {
          padding-top: var(--xf-mp-nav-height, 88px) !important;
          padding-bottom: 0 !important;
        }
        html.xf-mp-webview .public-content-frame {
          min-height: calc(100vh - var(--xf-mp-nav-height, 88px) - var(--xf-mp-tabbar-height, 64px) - 112px) !important;
        }
      `}</style>
      {backButton}
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(118,83,205,0.08)_1px,transparent_1px)] bg-[size:28px_28px]" />
      </div>
      <main className={`public-content-main relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-6 sm:px-6 ${superModePage ? "pt-[78px]" : "pt-6"}`}>
        <section className="mb-3 rounded-[1.6rem] border border-[#e4dcf4] bg-white/92 px-5 py-4 shadow-[0_14px_46px_rgba(80,62,125,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-[#6b58bd]">Public Content</div>
              <h1 className="mt-1 truncate text-xl font-black text-[#241a3a]">{title || "公开内容"}</h1>
            </div>
            {targetUrl ? (
              <a
                href={targetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[#5e17eb] px-4 text-sm font-black text-white shadow-[0_10px_24px_rgba(94,23,235,0.2)]"
              >
                打开原链接
              </a>
            ) : null}
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-hidden rounded-[1.6rem] border border-[#e4dcf4] bg-white shadow-[0_18px_60px_rgba(80,62,125,0.1)]">
          {canFrame ? (
            <iframe
              src={targetUrl}
              title={title || "公开内容"}
              className="public-content-frame h-full min-h-[calc(100vh-178px)] w-full border-0 bg-white"
              sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
            />
          ) : (
            <div className="flex min-h-[50vh] items-center justify-center px-6 text-center text-sm font-bold text-[#8e81b3]">
              公开内容链接暂不可加载。
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default PublicContentPage;
