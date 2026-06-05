import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import GlobalPublicNav from "../components/GlobalPublicNav";
import XiaowanziWidget from "../wel/components/XiaowanziWidget";
import { RootState } from "../store";
import { getAdminOrUserToken, hasAdminBypass } from "../utils/proGate";

function hasXiaowanziAppSession(token?: string | null) {
  if (hasAdminBypass()) return true;
  if (String(token || "").trim()) return true;
  try {
    return Boolean((getAdminOrUserToken() || localStorage.getItem("wel_tok") || "").trim());
  } catch (_error) {
    return false;
  }
}

const XiaowanziAppPage: React.FC = () => {
  const { token } = useSelector((state: RootState) => state.user);
  const authed = hasXiaowanziAppSession(token);

  useEffect(() => {
    document.title = "小玩子";
  }, []);

  useEffect(() => {
    if (authed) return;
    window.setTimeout(() => {
      document.dispatchEvent(
        new CustomEvent("xf-show-login-modal", {
          detail: {
            title: "登录后使用小玩子",
            description: "登录后可使用小玩子提问、同步孩子档案、页面浏览上下文和个性化建议。",
          },
        }),
      );
    }, 0);
  }, [authed]);

  if (authed) {
    return (
      <>
        <GlobalPublicNav headless />
        <XiaowanziWidget standalone />
      </>
    );
  }

  return (
    <main className="min-h-screen bg-[#ecefff] px-6 py-[calc(52px+env(safe-area-inset-top))] text-[#11143b]">
      <div className="mx-auto flex min-h-[calc(100vh-112px)] max-w-[430px] flex-col items-center justify-center text-center">
        <img src="/assets/wel-avatar/no-hat.png" alt="" className="h-24 w-24 object-contain drop-shadow-[0_18px_24px_rgba(91,72,255,0.22)]" />
        <h1 className="mt-5 text-3xl font-black">小玩子</h1>
        <p className="mt-3 max-w-[300px] text-sm font-bold leading-7 text-[#5f6685]">
          登录后进入小玩子 App，同步孩子档案、记忆和站内浏览上下文。
        </p>
        <button
          type="button"
          className="mt-8 h-12 w-full max-w-[300px] rounded-full bg-[#6c27d6] text-sm font-black text-white shadow-[0_18px_34px_rgba(108,39,214,0.24)]"
          onClick={() =>
            document.dispatchEvent(
              new CustomEvent("xf-show-login-modal", {
                detail: {
                  title: "登录后使用小玩子",
                  description: "登录后可使用小玩子提问、同步孩子档案、页面浏览上下文和个性化建议。",
                },
              }),
            )
          }
        >
          登录后进入
        </button>
      </div>
    </main>
  );
};

export default XiaowanziAppPage;
