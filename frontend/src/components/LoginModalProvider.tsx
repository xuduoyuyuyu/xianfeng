import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import LoginRequiredModal from "./LoginRequiredModal";
import ProUpgradeModal from "./ProUpgradeModal";
import { isMiniProgramWebView, openMiniProgramNativeLogin } from "../utils/mpAuthBridge";

interface LoginModalContextType {
  showLoginModal: (title?: string, description?: string) => void;
  hideLoginModal: () => void;
}

const LoginModalContext = createContext<LoginModalContextType>({
  showLoginModal: () => {},
  hideLoginModal: () => {},
});

export const useLoginModal = () => useContext(LoginModalContext);

export const LoginModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [proOpen, setProOpen] = useState(false);
  const [title, setTitle] = useState<string>();
  const [description, setDescription] = useState<string>();
  const [proMessage, setProMessage] = useState<string>();

  const showLoginModal = useCallback((t?: string, d?: string) => {
    setTitle(t);
    setDescription(d);
    setOpen(true);
  }, []);

  const hideLoginModal = useCallback(() => {
    setOpen(false);
  }, []);

  // 监听全局自定义事件，使任意组件都能触发登录弹窗
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (isMiniProgramWebView()) {
        openMiniProgramNativeLogin().then((opened) => {
          if (!opened) showLoginModal(detail.title, detail.description);
        });
        return;
      }
      showLoginModal(detail.title, detail.description);
    };
    document.addEventListener("xf-show-login-modal", handler);
    return () => document.removeEventListener("xf-show-login-modal", handler);
  }, [showLoginModal]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setProMessage(detail.message);
      setProOpen(true);
    };
    document.addEventListener("xf-show-pro-modal", handler);
    return () => document.removeEventListener("xf-show-pro-modal", handler);
  }, []);

  return (
    <LoginModalContext.Provider value={{ showLoginModal, hideLoginModal }}>
      {children}
      <LoginRequiredModal
        open={open}
        onClose={hideLoginModal}
        title={title}
        description={description}
      />
      <ProUpgradeModal open={proOpen} message={proMessage} onClose={() => setProOpen(false)} />
    </LoginModalContext.Provider>
  );
};
