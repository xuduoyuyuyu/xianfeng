import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenPage from "../ScreenPage";

type AdminPageKey = "dashboard" | "programs" | "books" | "materials" | "users" | "system";

const AdminShellPage: React.FC = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState<AdminPageKey>(() => {
    const saved = sessionStorage.getItem("adminPage") as AdminPageKey | null;
    return saved || "dashboard";
  });

  const config = useMemo(() => {
    const map: Record<AdminPageKey, { src: string; title: string }> = {
      dashboard: { src: "/screens/admin-dashboard.html", title: "数据概览" },
      programs: { src: "/screens/admin-programs.html", title: "内容管理 / 播客" },
      books: { src: "/screens/admin-books.html", title: "内容管理 / 书单" },
      materials: { src: "/screens/admin-materials.html", title: "内容管理 / 学习资料" },
      users: { src: "/screens/admin-users.html", title: "用户管理" },
      system: { src: "/screens/admin-system.html", title: "系统信息" },
    };
    return map[page];
  }, [page]);

  useEffect(() => {
    sessionStorage.setItem("adminPage", page);
  }, [page]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as any;
      if (!data || typeof data !== "object") return;

      if (data.type === "admin:switch") {
        const key = data.key as AdminPageKey;
        if (!key) return;
        if (!["dashboard", "programs", "books", "materials", "users", "system"].includes(key)) return;
        setPage(key);
        return;
      }

      if (data.type === "admin:navigate") {
        const path = data.path;
        if (typeof path !== "string") return;
        navigate(path);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate]);

  return <ScreenPage src={config.src} title={config.title} />;
};

export default AdminShellPage;

