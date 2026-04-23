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
import AdminSystemPage from "./pages/admin/AdminSystemPage";
import AdminDictionaryPage from "./pages/admin/AdminDictionaryPage";

const PublicScreenRouter: React.FC = () => {
  const { pathname, search } = useLocation();

  if (pathname === "/") {
    return <Navigate to="/programs" replace />;
  }

  if (/^\/programs\/[^/]+$/.test(pathname)) {
    const programId = pathname.split("/")[2] || "";
    const src = `/screens/podcast-detail.html?programId=${encodeURIComponent(programId)}`;
    return <ScreenPage src={src} title="播客详情" />;
  }

  const routeMap: Record<string, { src: string; title: string }> = {
    "/programs": { src: "/screens/podcast-home.html", title: "播客首页" },
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
  const withQuery = search ? `${match.src}${search}` : match.src;
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
        <Route path="books" element={<AdminBooksPage />} />
        <Route path="materials" element={<AdminMaterialsPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="system" element={<AdminSystemPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
      <Route path="*" element={<PublicScreenRouter />} />
    </Routes>
  );
};

export default App;
