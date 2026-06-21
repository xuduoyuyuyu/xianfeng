import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "react-router-dom";
import type { RootState } from "../store";

interface Props {
  children: React.ReactNode;
}

const RequireAuth: React.FC<Props> = ({ children }) => {
  const { token } = useSelector((state: RootState) => state.user);
  const location = useLocation();

  useEffect(() => {
    if (!token) {
      document.dispatchEvent(new CustomEvent('xf-show-login-modal', {
        detail: {
          title: '登录后查看完整内容',
          description: '登录后可解锁完整知识树、查看详细内容、参与互动提问，获得个性化成长推荐。',
        },
      }));
    }
  }, [token]);

  if (!token) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        color: '#8f87a9',
        fontSize: 14,
        fontWeight: 600,
      }}>
        请先登录以访问此页面
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireAuth;
