import React, { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import GlobalPublicNav from "./components/GlobalPublicNav";
import { LoginModalProvider } from "./components/LoginModalProvider";
import ScreenPage from "./pages/ScreenPage";
import AdminLoginPage from "./pages/admin/AdminLoginPage";
import UserLoginPage from "./pages/UserLoginPage";
import RequireAdmin from "./components/RequireAdmin";
import AdminLayout from "./components/AdminLayout";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminProgramsPage from "./pages/admin/AdminProgramsPage";
import AdminBooksPage from "./pages/admin/AdminBooksPage";
import AdminMaterialsPage from "./pages/admin/AdminMaterialsPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminUserPortraitPage from "./pages/admin/AdminUserPortraitPage";
import AdminSystemPage from "./pages/admin/AdminSystemPage";
import AdminMultiAgentsPage from "./pages/admin/AdminMultiAgentsPage";
import AdminTopicsPage from "./pages/admin/AdminTopicsPage";
import AdminDictionaryPage from "./pages/admin/AdminDictionaryPage";
import AdminGuestsPage from "./pages/admin/AdminGuestsPage";
import AdminAgentsPage from "./pages/admin/AdminAgentsPage";
import AdminAgentsChatPage from "./pages/admin/AdminAgentsChatPage";
import AdminInboxPage from "./pages/admin/AdminInboxPage";
import AdminWorthBuyPage from "./pages/admin/AdminWorthBuyPage";
import ProgramListPage from "./pages/ProgramListPage";
import ProgramDetailPage from "./pages/ProgramDetailPage";
import ExpertsPage from "./pages/ExpertsPage";
import ExpertDetailPage from "./pages/ExpertDetailPage";
import LandingPage from "./pages/LandingPage";
import MaterialsPage from "./pages/MaterialsPage";
import BooksPage from "./pages/BooksPage";
import PlanningPage from "./pages/PlanningPage";
import TopicHubPage from "./pages/TopicHubPage";
import TopicDetailPage from "./pages/TopicDetailPage";
import WorthBuyPage from "./pages/WorthBuyPage";
import WorthBuyDetailPage from "./pages/WorthBuyDetailPage";
import WithLoginGate from "./components/WithLoginGate";
import PageViewTracker from "./components/PageViewTracker";
import XiaowanziWidget from "./wel/components/XiaowanziWidget";

const PublicScreenRouter: React.FC = () => {
  const { pathname, search } = useLocation();
  const normalizedPathname = pathname.startsWith("/v2/") ? pathname.slice(3) : pathname === "/v2" ? "/" : pathname;
  const screenRev = "20260502-podcast-home-force-refresh-1";
  const cacheBust = String(Date.now());

  if (normalizedPathname === "/") {
    return <LandingPage />;
  }

  if (normalizedPathname === "/programs") {
    const src = `/wel/index.html?page=61&hideWidget=1&v=${screenRev}&cb=${cacheBust}`;
    return (
      <>
        <GlobalPublicNav />
        <ScreenPage src={src} title="播客列表（框架内）" />
      </>
    );
  }

  if (normalizedPathname === "/programs/list") {
    return <ProgramListPage />;
  }

  if (/^\/programs\/[^/]+$/.test(normalizedPathname)) {
    const programId = normalizedPathname.split("/")[2] || "";
    const src = `/screens/podcast-detail.html?programId=${encodeURIComponent(programId)}`;
    return (
      <WithLoginGate backTo="/programs/list" title="登录后查看完整内容" description="登录后即可查看节目逐字稿、AI分析、嘉宾详情等完整内容。">
        <GlobalPublicNav />
        <iframe src={src} style={{ width: "100%", height: "calc(100vh - 64px)", border: "none", marginTop: 64 }} title="节目详情" />
      </WithLoginGate>
    );
  }

  if (normalizedPathname === "/experts") {
    return <ExpertsPage />;
  }

  if (/^\/experts\/[^/]+$/.test(normalizedPathname)) {
    return (
      <WithLoginGate backTo="/experts" title="登录后查看完整内容" description="登录后即可查看专家详细资料、论文著作、相关节目等完整信息。">
        <ExpertDetailPage />
      </WithLoginGate>
    );
  }

  if (normalizedPathname === "/materials") {
    return <MaterialsPage />;
  }

  if (normalizedPathname === "/books" || normalizedPathname === "/reading") {
    return <BooksPage />;
  }

  if (normalizedPathname === "/planning") {
    return <PlanningPage />;
  }

  if (normalizedPathname === "/topics") {
    return <TopicHubPage />;
  }

  if (/^\/topics\/[^/]+$/.test(normalizedPathname)) {
    const slug = normalizedPathname.split("/")[2] || "";
    return (
      <WithLoginGate backTo="/topics" title="登录后查看完整内容" description="登录后即可查看完整知识树、深入话题内容，获得个性化学习推荐。">
        <TopicDetailPage slug={slug} />
      </WithLoginGate>
    );
  }

  if (normalizedPathname === "/worthbuy") {
    return <WorthBuyPage />;
  }

  if (/^\/worthbuy\/[^/]+$/.test(normalizedPathname)) {
    return (
      <WithLoginGate backTo="/worthbuy" title="登录后查看完整内容" description="登录后即可查看完整分析结果、品牌对比详情，获取个性化消费建议。">
        <WorthBuyDetailPage />
      </WithLoginGate>
    );
  }

  const routeMap: Record<string, { src: string; title: string }> = {
    "/articles": { src: "/screens/public-articles.html", title: "精选文稿" },
    "/community": { src: "/screens/public-community.html", title: "学习社区" },
  };

  const match = routeMap[normalizedPathname];
  if (!match) {
    return <Navigate to="/programs/list" replace />;
  }
  const joiner = search ? "&" : "?";
  const withQuery = `${search ? `${match.src}${search}` : match.src}${joiner}v=${screenRev}`;
  return <ScreenPage src={withQuery} title={match.title} />;
};

const App: React.FC = () => {
  const { pathname, search } = useLocation();
  const searchParams = new URLSearchParams(search);
  const hideWidget = searchParams.get("hideWidget") === "1" || searchParams.get("widgetOnly") === "1";

  const shouldRenderGlobalXiaowanzi =
    pathname !== "/" &&
    pathname !== "/login" &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/planning") &&
    !hideWidget;

  useEffect(() => {
    // Admin/User 登录态由各自的 slice 管理，不再统一 fetchMe
  }, []);

  return (
    <LoginModalProvider>
      <div id="app-shell">
        <PageViewTracker />
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
            <Route path="topics" element={<AdminTopicsPage />} />
            <Route path="worthbuy" element={<AdminWorthBuyPage />} />
            <Route path="inbox" element={<AdminInboxPage />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
          <Route path="*" element={<PublicScreenRouter />} />
        </Routes>
      </div>
      {shouldRenderGlobalXiaowanzi ? <XiaowanziWidget /> : null}
    </LoginModalProvider>
  );
};

export default App;
