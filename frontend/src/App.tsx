import React, { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
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

const App: React.FC = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    if (localStorage.getItem("token")) {
      dispatch(fetchMe() as any);
    }
  }, [dispatch]);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/programs" replace />} />
      <Route path="/programs" element={<ScreenPage src="/screens/podcast-home.html" title="播客首页" />} />
      <Route path="/programs/:id" element={<ScreenPage src="/screens/podcast-detail.html" title="播客详情" />} />
      <Route path="/books" element={<ScreenPage src="/screens/public-books.html" title="推荐书单" />} />
      <Route path="/materials" element={<ScreenPage src="/screens/public-materials.html" title="课程资料" />} />
      <Route path="/articles" element={<ScreenPage src="/screens/public-articles.html" title="精选文稿" />} />
      <Route path="/experts" element={<ScreenPage src="/screens/public-experts.html" title="专家采访" />} />
      <Route path="/community" element={<ScreenPage src="/screens/public-community.html" title="学习社区" />} />
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
        <Route path="books" element={<AdminBooksPage />} />
        <Route path="materials" element={<AdminMaterialsPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="system" element={<AdminSystemPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/programs" replace />} />
    </Routes>
  );
};

export default App;
