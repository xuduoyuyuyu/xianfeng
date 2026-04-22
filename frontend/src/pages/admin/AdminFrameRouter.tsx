import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import ScreenPage from "../ScreenPage";

const AdminFrameRouter: React.FC = () => {
  const location = useLocation();
  const path = (location.pathname || "/admin").replace(/\/+$/, "") || "/admin";

  const map: Record<string, { src: string; title: string }> = {
    "/admin": { src: "/screens/admin-dashboard.html", title: "数据概览" },
    "/admin/programs": { src: "/screens/admin-programs.html", title: "内容管理 / 播客" },
    "/admin/books": { src: "/screens/admin-books.html", title: "内容管理 / 书单" },
    "/admin/materials": { src: "/screens/admin-materials.html", title: "内容管理 / 学习资料" },
    "/admin/users": { src: "/screens/admin-users.html", title: "用户管理" },
    "/admin/system": { src: "/screens/admin-system.html", title: "系统信息" },
  };

  const target = map[path];
  if (!target) return <Navigate to="/admin" replace />;

  return <ScreenPage src={target.src} title={target.title} />;
};

export default AdminFrameRouter;

