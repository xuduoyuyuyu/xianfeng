import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";
import type { RootState } from "../store";

interface Props {
  children: React.ReactNode;
}

const RequireAuth: React.FC<Props> = ({ children }) => {
  const { token, user, isLoading } = useSelector((state: RootState) => state.user);
  const location = useLocation();

  // 无 token 直接跳登录
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 有 token 但用户信息还在加载中，显示 loading
  if (!user && isLoading) {
    return (
      <div style={{
        minHeight: "100vh", background: "#f8f6ff",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            border: "3px solid #EDE9FE", borderTopColor: "#7C3AED",
            animation: "spin 0.8s linear infinite", margin: "0 auto 12px",
          }} />
          <p style={{ color: "#9CA3AF", fontSize: 13 }}>加载中...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireAuth;
