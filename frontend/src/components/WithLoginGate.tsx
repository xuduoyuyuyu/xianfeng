import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
 * 同时监听 Redux token + localStorage token，确保已登录用户不会被拦。
 */
const WithLoginGate: React.FC<Props> = ({
  children,
  title = "登录后查看完整内容",
  description = "登录后可解锁完整知识树、查看详细内容、参与互动提问，获得个性化成长推荐。",
  backTo,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [checked, setChecked] = useState(false);
  const navigate = useNavigate();

  // 双重检测：Redux token + localStorage token
  const reduxToken = useSelector((state: RootState) => state.user.token);

  useEffect(() => {
    const localToken = localStorage.getItem("token");
    const isLoggedIn = !!reduxToken || !!localToken;

    if (!isLoggedIn) {
      setShowModal(true);
    }
    setChecked(true);
  }, [reduxToken]);

  const handleClose = () => {
    setShowModal(false);
    navigate(backTo, { replace: true });
  };

  if (!checked) return null;

  // 如果用户已登录，直接渲染 children，不弹任何框
  if (!showModal) {
    return <>{children}</>;
  }

  // 未登录：children（详情页）正常渲染 + LoginRequiredModal 弹窗叠加
  return (
    <>
      {children}
      <LoginRequiredModal
        open={showModal}
        onClose={handleClose}
        title={title}
        description={description}
      />
    </>
  );
};

export default WithLoginGate;
