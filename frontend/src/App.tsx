import React, { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
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
import AdminMamaResourcesPage from "./pages/admin/AdminMamaResourcesPage";
import { AdminMamaResourceReviewPage } from "./pages/admin/AdminMamaResourcesPage";
import AdminWelfarePage from "./pages/admin/AdminWelfarePage";
import ProgramListPage from "./pages/ProgramListPage";
import ExpertsPage from "./pages/ExpertsPage";
import ExpertDetailPage from "./pages/ExpertDetailPage";
import LandingPage from "./pages/LandingPage";
import MaterialsPage from "./pages/MaterialsPage";
import BooksPage from "./pages/BooksPage";
import BookDetailPage from "./pages/BookDetailPage";
import ExternalBookLibraryPage from "./pages/ExternalBookLibraryPage";
import ExternalBookLibraryDetailPage from "./pages/ExternalBookLibraryDetailPage";
import PublicContentPage from "./pages/PublicContentPage";
import PlanningPage from "./pages/PlanningPage";
import TopicHubPage from "./pages/TopicHubPage";
import TopicDetailPage from "./pages/TopicDetailPage";
import { XianfengSharePosterExample } from "./components/XianfengSharePoster";
import WorthBuyPage from "./pages/WorthBuyPage";
import WorthBuyDetailPage from "./pages/WorthBuyDetailPage";
import SearchPage from "./pages/SearchPage";
import ProPage from "./pages/ProPage";
import MamaResourceApplyPage from "./pages/MamaResourceApplyPage";
import WelfarePage from "./pages/WelfarePage";
import WithLoginGate from "./components/WithLoginGate";
import PageViewTracker from "./components/PageViewTracker";
import XiaowanziWidget from "./wel/components/XiaowanziWidget";
import { RootState } from "./store";
import { fetchMe } from "./store/userSlice";

const shouldUseDirectMobileProgramDetail = () =>
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  window.matchMedia("(max-width: 768px)").matches &&
  !document.documentElement.classList.contains("xf-mp-webview");

const MobileProgramDetailRedirect: React.FC<{ src: string }> = ({ src }) => {
  useEffect(() => {
    window.location.replace(src);
  }, [src]);

  return null;
};

const PublicScreenRouter: React.FC = () => {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const normalizedPathname = pathname.startsWith("/v2/") ? pathname.slice(3) : pathname === "/v2" ? "/" : pathname;
  const screenRev = "20260717-podcast-summary-1";
  const [programDetailFrameHeight, setProgramDetailFrameHeight] = React.useState<string | null>(null);

  useEffect(() => {
    setProgramDetailFrameHeight(null);
  }, [normalizedPathname, search]);

  useEffect(() => {
    const handleProgramDetailHeight = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (document.documentElement.classList.contains("xf-mp-webview")) return;
      if (!window.matchMedia("(max-width: 768px)").matches) return;
      const data = event.data;
      if (!data || data.type !== "xianfeng:program-detail-height") return;
      const height = Number(data.height);
      if (!Number.isFinite(height) || height <= 0) return;
      const nextHeight = `${Math.ceil(Math.max(height, window.innerHeight))}px`;
      setProgramDetailFrameHeight((current) => (current === nextHeight ? current : nextHeight));
    };
    window.addEventListener("message", handleProgramDetailHeight);
    return () => window.removeEventListener("message", handleProgramDetailHeight);
  }, []);

  if (normalizedPathname === "/") {
    return <LandingPage />;
  }

  if (normalizedPathname === "/programs") {
    return <Navigate to="/programs/list" replace />;
  }

  if (normalizedPathname === "/programs/list") {
    return <ProgramListPage />;
  }

  if (/^\/programs\/[^/]+$/.test(normalizedPathname)) {
    const routeParams = new URLSearchParams(search);
    const xiaowanziLayer = routeParams.get("xw_layer") === "1";
    const miniProgramWebView = routeParams.get("xf_mp") === "1" ||
      routeParams.has("xf_tab") ||
      window.sessionStorage.getItem("xf_mp_webview") === "1" ||
      document.documentElement.classList.contains("xf-mp-webview");
    const programId = normalizedPathname.split("/")[2] || "";
    const detailParams = new URLSearchParams({ programId, v: screenRev });
    if (xiaowanziLayer) detailParams.set("xw_layer", "1");
    if (miniProgramWebView) {
      detailParams.set("xf_mp", "1");
      detailParams.set("xf_tab", routeParams.get("xf_tab") || "0");
    }
    const src = `/screens/podcast-detail.html?${detailParams.toString()}`;
    if (shouldUseDirectMobileProgramDetail()) {
      return <MobileProgramDetailRedirect src={src} />;
    }
    const programDetailScrollableStyle: React.CSSProperties = {
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
      touchAction: "pan-y",
    };
    const programDetailMiniProgramStyle = (
      <style>{`
        html.xf-mp-webview .program-detail-frame-shell {
          padding-top: var(--xf-mp-nav-height, 88px) !important;
          padding-bottom: var(--xf-mp-tabbar-height, 0px) !important;
          background: #fff !important;
        }
        html.xf-mp-webview.xf-mp-tabbar-hidden .program-detail-frame-shell {
          padding-bottom: 0 !important;
          min-height: calc(100vh - var(--xf-mp-nav-height, 88px)) !important;
          overflow: hidden !important;
        }
        html.xf-mp-webview .program-detail-frame {
          height: calc(100vh - var(--xf-mp-nav-height, 88px)) !important;
          margin-top: 0 !important;
          background: #fff !important;
          display: block;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
        }
        html.xf-mp-webview.xf-mp-tabbar-hidden .program-detail-frame {
          height: calc(100vh - var(--xf-mp-nav-height, 88px)) !important;
          min-height: calc(100vh - var(--xf-mp-nav-height, 88px)) !important;
        }
      `}</style>
    );
    if (xiaowanziLayer) {
      return (
        <div className="program-detail-frame-shell relative min-h-screen bg-[#f3f2f8]">
          {programDetailMiniProgramStyle}
          <button
            type="button"
            aria-label="返回小玩子"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
                return;
              }
              navigate("/programs/list?xw_restore=xiaowanzi");
            }}
            className="fixed left-4 top-[calc(14px+env(safe-area-inset-top))] z-[120] inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-[#11143b] shadow-[0_10px_24px_rgba(70,73,132,0.14)]"
          >
            <span className="material-symbols-outlined text-[28px]">arrow_back</span>
          </button>
          <iframe
            scrolling="yes"
            className="program-detail-frame"
            src={src}
            style={{ width: "100%", height: programDetailFrameHeight || "100vh", border: "none", ...programDetailScrollableStyle }}
            title="节目详情"
          />
        </div>
      );
    }

    return (
      <>
        {programDetailMiniProgramStyle}
        <GlobalPublicNav compactMobile />
        <WithLoginGate backTo="/programs/list" title="登录后查看完整内容" description="登录后即可查看节目逐字稿、AI分析、嘉宾详情等完整内容。">
          <div className="program-detail-frame-shell">
            <iframe
              scrolling="yes"
              className="program-detail-frame"
              src={src}
              style={{ width: "100%", height: programDetailFrameHeight || "calc(100vh - 64px)", border: "none", marginTop: 64, ...programDetailScrollableStyle }}
              title="节目详情"
            />
          </div>
        </WithLoginGate>
      </>
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

  if (normalizedPathname === "/books") {
    return <Navigate to={`/reading${search}`} replace />;
  }

  if (normalizedPathname === "/reading") {
    return <BooksPage />;
  }

  if (normalizedPathname === "/library") {
    const externalBookId = new URLSearchParams(search).get("xf_external_book_id");
    if (externalBookId) return <ExternalBookLibraryDetailPage />;
    return <ExternalBookLibraryPage />;
  }

  if (/^\/library\/[^/]+$/.test(normalizedPathname)) {
    return <ExternalBookLibraryDetailPage />;
  }

  if (normalizedPathname === "/reading/library") {
    return <Navigate to={`/library${search}`} replace />;
  }

  if (/^\/reading\/[^/]+$/.test(normalizedPathname)) {
    return <BookDetailPage />;
  }

  if (normalizedPathname === "/public-content") {
    return <PublicContentPage />;
  }

  if (normalizedPathname === "/planning") {
    return <PlanningPage />;
  }

  if (normalizedPathname === "/topics") {
    return <TopicHubPage />;
  }

  if (normalizedPathname === "/topics/share-preview") {
    return <XianfengSharePosterExample />;
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

  if (normalizedPathname === "/search") {
    return <SearchPage />;
  }

  if (normalizedPathname === "/pro" || normalizedPathname === "/pro/success") {
    return <ProPage />;
  }

  if (normalizedPathname === "/mama-resources/apply") {
    return <MamaResourceApplyPage />;
  }

  if (normalizedPathname === "/welfare") {
    return <WelfarePage />;
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
  const dispatch = useDispatch();
  const { token, user } = useSelector((state: RootState) => state.user);
  const { pathname, search } = useLocation();
  const searchParams = new URLSearchParams(search);
  const hideWidget = searchParams.get("hideWidget") === "1" || searchParams.get("widgetOnly") === "1";

  const shouldRenderGlobalXiaowanzi =
    pathname !== "/login" &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/planning") &&
    !hideWidget;

  useEffect(() => {
    if (!token || user) return;
    dispatch(fetchMe() as any);
  }, [dispatch, token, user]);

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
            <Route path="mama-resources" element={<AdminMamaResourcesPage />} />
            <Route path="mama-resources/review" element={<AdminMamaResourceReviewPage />} />
            <Route path="welfare" element={<AdminWelfarePage />} />
            <Route path="inbox" element={<AdminInboxPage />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>

          <Route path="*" element={<PublicScreenRouter />} />
        </Routes>
      </div>
      {shouldRenderGlobalXiaowanzi ? <XiaowanziWidget hideLauncher={pathname === "/"} /> : null}
    </LoginModalProvider>
  );
};

export default App;
