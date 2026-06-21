import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import LoginRequiredModal from "./LoginRequiredModal";

interface Props {
  children: React.ReactNode;
  title?: string;
  description?: string;
  backTo: string;
}

/**
 * 第二层页面（详情页）登录引导。
 * 未登录时显示 LoginRequiredModal，关闭后返回 backTo 页面。
 * 
 * 同时检测 Redux token + localStorage token，确保已登录用户不会被拦。
 * 使用 useMemo 在渲染阶段同步判断，避免 useEffect 异步检查导致的时序问题。
 */
const WithLoginGate: React.FC<Props> = ({
  children,
  title = "登录后查看完整内容",
  description = "登录后可解锁完整知识树、查看详细内容、参与互动提问，获得个性化成长推荐。",
  backTo,
}) => {
  const navigate = useNavigate();

  const reduxToken = useSelector((state: RootState) => state.user.token);

  // 在渲染阶段同步判断登录态，避免 useEffect 异步检查的时序问题
  const isLoggedIn = useMemo(() => {
    if (reduxToken) return true;
    try {
      const localToken = localStorage.getItem("token");
      if (localToken) return true;
    } catch {
      // localStorage 不可用，仅依赖 Redux
    }
    return false;
  }, [reduxToken]);

  const handleClose = () => {
    navigate(backTo, { replace: true });
  };

  if (isLoggedIn) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <LoginRequiredModal
        open
        onClose={handleClose}
        title={title}
        description={description}
      />
    </>
  );
};

export default WithLoginGate;
