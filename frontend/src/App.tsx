import React, { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useDispatch } from "react-redux";
import ScreenPage from "./pages/ScreenPage";
import AdminLoginPage from "./pages/admin/AdminLoginPage";
import UserLoginPage from "./pages/UserLoginPage";
import RequireAdmin from "./components/RequireAdmin";
import { fetchMe } from "./store/userSlice";
import AdminLayout from "./components/AdminLayout";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminProgramsPage from "./pages/admin/AdminProgramsPage";
import AdminBooksPage from "./pages/admin/AdminBooksPage";
import AdminMaterialsPage from "./pages/admin/AdminMaterialsPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminUserPortraitPage from "./pages/admin/AdminUserPortraitPage";
import AdminSystemPage from "./pages/admin/AdminSystemPage";
import AdminMultiAgentsPage from "./pages/admin/AdminMultiAgentsPage";
import AdminDictionaryPage from "./pages/admin/AdminDictionaryPage";
import AdminGuestsPage from "./pages/admin/AdminGuestsPage";
import AdminAgentsPage from "./pages/admin/AdminAgentsPage";
import AdminAgentsChatPage from "./pages/admin/AdminAgentsChatPage";
import ProgramListPage from "./pages/ProgramListPage";

const PublicScreenRouter: React.FC = () => {
  const { pathname, search } = useLocation();
  const screenRev = "20260502-podcast-home-force-refresh-1";
  const cacheBust = String(Date.now());

  if (pathname === "/") {
    return <Navigate to="/programs" replace />;
  }

  if (pathname === "/programs") {
    return <ScreenPage src={`/wel/index.html?v=${screenRev}&cb=${cacheBust}`} title="wel 首页架构" />;
  }

  if (pathname === "/programs/list") {
    return <ProgramListPage />;
  }

  if (/^\/programs\/[^/]+$/.test(pathname)) {
    const programId = pathname.split("/")[2] || "";
    const src = `/wel/index.html?page=podcast-detail&programId=${encodeURIComponent(programId)}&v=${screenRev}&cb=${cacheBust}`;
    return <ScreenPage src={src} title="播客详情（框架内）" />;
  }

  const routeMap: Record<string, { src: string; title: string }> = {
    "/books": { src: "/screens/public-books.html", title: "推荐书单" },
    "/materials": { src: "/screens/public-materials.html", title: "课程资料" },
    "/articles": { src: "/screens/public-articles.html", title: "精选文稿" },
    "/experts": { src: "/screens/public-experts.html", title: "专家采访" },
    "/community": { src: "/screens/public-community.html", title: "学习社区" },
  };

  const match = routeMap[pathname];
  if (!match) {
    return <Navigate to="/programs" replace />;
  }
  const joiner = search ? "&" : "?";
  const withQuery = `${search ? `${match.src}${search}` : match.src}${joiner}v=${screenRev}`;
  return <ScreenPage src={withQuery} title={match.title} />;
};

const App: React.FC = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    if (localStorage.getItem("token")) {
      dispatch(fetchMe() as any);
    }
  }, [dispatch]);

  return (
    <Routes>
      <Route path="/login" element={<UserLoginPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="programs" element={<AdminProgramsPage />} />
        <Route path="dictionary" element={<AdminDictionaryPage />} />
        <Route path="guests" element={<AdminGuestsPage />} />
        <Route path="books" element={<AdminBooksPage />} />
        <Route path="materials" element={<AdminMaterialsPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="user-portrait" element={<AdminUserPortraitPage />} />
        <Route path="system" element={<AdminSystemPage />} />
        <Route path="agents" element={<AdminAgentsPage />} />
        <Route path="agents/:botId/chat" element={<AdminAgentsChatPage />} />
        <Route path="multi-agents" element={<AdminMultiAgentsPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
      <Route path="*" element={<PublicScreenRouter />} />
    </Routes>
  );
};

export default App;
