import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useLocation } from "react-router-dom";
import type { RootState } from "../store";
import LoginRequiredModal from "./LoginRequiredModal";

interface Props {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

/**
 * 用于第二层页面（详情页）的登录引导：
 * 未登录 → 弹 LoginRequiredModal 引导框
 * 已登录 → 正常渲染 children
 */
const RequireAuthModal: React.FC<Props> = ({
  children,
  title = "登录后查看完整内容",
  description = "登录后可解锁完整知识树、查看详细内容、参与互动提问，获得个性化成长推荐。",
}) => {
  const { token } = useSelector((state: RootState) => state.user);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!token) {
      setShowModal(true);
    }
  }, [token]);

  const handleClose = () => {
    setShowModal(false);
    // 返回到列表页
    const path = location.pathname;
    if (path.startsWith("/experts")) navigate("/experts", { replace: true });
    else if (path.startsWith("/programs")) navigate("/programs/list", { replace: true });
    else if (path.startsWith("/topics")) navigate("/topics", { replace: true });
    else if (path.startsWith("/worthbuy")) navigate("/worthbuy", { replace: true });
    else navigate(-1);
  };

  if (token) {
    return <>{children}</>;
  }

  return (
    <>
      {showModal && (
        <LoginRequiredModal
          open={showModal}
          onClose={handleClose}
          title={title}
          description={description}
        />
      )}
      {/* 背景仍渲染 children，但会被弹窗遮盖 */}
      <div style={{ filter: "blur(6px)", pointerEvents: "none", opacity: 0.6 }}>
        {children}
      </div>
    </>
  );
};

export default RequireAuthModal;
