import React from "react";
import { Outlet, Link, useLocation } from "react-router-dom";

const AdminLayout: React.FC = () => {
  const location = useLocation();
  const handleAdminLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/admin/login";
  };

  const isActive = (path: string) => location.pathname === path;
  const navItemClass = (active: boolean) =>
    `group flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-200 ${
      active
        ? "bg-[#5e17eb] text-white border-[#5e17eb] shadow-[0_8px_18px_-8px_rgba(94,23,235,0.7)]"
        : "bg-white text-stone-600 border-transparent hover:bg-[#f6f3ff] hover:text-[#4e18c9] hover:border-[#e8dcff]"
    }`;

  const navIconClass = (active: boolean) =>
    `material-symbols-outlined text-[7px] transition-colors ${
      active ? "text-white" : "text-stone-400 group-hover:text-[#5e17eb]"
    }`;

  const navTextClass = (active: boolean) =>
    `text-sm transition-colors ${active ? "font-semibold text-white" : "font-medium text-stone-600 group-hover:text-[#4e18c9]"}`;

  const renderNavItem = (to: string, icon: string, label: string) => (
    <Link
      key={to}
      to={to}
      className={navItemClass(isActive(to))}
    >
      <span className={navIconClass(isActive(to))}>{icon}</span>
      <span className={navTextClass(isActive(to))}>{label}</span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-[#FAF8F6] flex overflow-x-hidden">
      {/* 侧边栏 */}
      <aside className="w-64 bg-white border-r border-stone-200 fixed h-full">
        <div className="flex h-full flex-col">
          <div className="p-6 border-b border-stone-100">
            <Link to="/">
              <img alt="家长先疯" className="h-10 w-auto object-contain" src="/assets/logo.png" />
            </Link>
            <p className="text-xs text-stone-400 mt-1">管理控制台</p>
          </div>
          <nav className="flex-1 overflow-y-auto p-3 pb-4 space-y-1.5">
            <div className="space-y-1">
              {renderNavItem("/admin", "dashboard", "数据概览")}
            </div>

            <section>
              <p className="px-1 mb-1.5 text-[11px] font-bold tracking-[0.08em] text-stone-400 uppercase">内容</p>
              <div className="space-y-1">
                {renderNavItem("/admin/programs", "podcasts", "内容管理")}
                {renderNavItem("/admin/guests", "group", "先疯智库")}
                {renderNavItem("/admin/dictionary", "dictionary", "教育词典")}
                {renderNavItem("/admin/books", "menu_book", "书单管理")}
                {renderNavItem("/admin/materials", "school", "学习资料")}
              </div>
            </section>

            <section>
              <p className="px-1 mb-1.5 text-[11px] font-bold tracking-[0.08em] text-stone-400 uppercase">用户</p>
              <div className="space-y-1">
                {renderNavItem("/admin/users", "group", "用户管理")}
                {renderNavItem("/admin/user-portrait", "monitoring", "用户画像")}
              </div>
            </section>

            <section>
              <p className="px-1 mb-1.5 text-[11px] font-bold tracking-[0.08em] text-stone-400 uppercase">AI</p>
              <div className="space-y-1">
                {renderNavItem("/admin/agents", "smart_toy", "Agents")}
                {renderNavItem("/admin/multi-agents", "hub", "multi-agents")}
              </div>
            </section>

            <section>
              <p className="px-1 mb-1.5 text-[11px] font-bold tracking-[0.08em] text-stone-400 uppercase">内容</p>
              <div className="space-y-1">
                {renderNavItem("/admin/topics", "tag", "话题广场")}
              </div>
            </section>

            <section>
              <p className="px-1 mb-1.5 text-[11px] font-bold tracking-[0.08em] text-stone-400 uppercase">设置</p>
              <div className="space-y-1">
                {renderNavItem("/admin/inbox", "mail", "站内信")}
                {renderNavItem("/admin/system", "settings", "系统信息")}
              </div>
            </section>
          </nav>
          <div className="border-t border-stone-100 p-3">
            <button
              type="button"
              onClick={handleAdminLogout}
              className="group flex w-full items-center gap-2 rounded-xl border border-transparent bg-white px-3 py-2 text-sm font-medium text-stone-600 transition-all duration-200 hover:border-[#5e17eb] hover:bg-[#5e17eb] hover:text-white hover:shadow-[0_8px_18px_-8px_rgba(94,23,235,0.7)]"
            >
              <span className="material-symbols-outlined text-[18px] text-stone-400 transition-colors group-hover:text-white">logout</span>
              退出
            </button>
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <div className="ml-64 flex min-w-0 flex-1">
        {/* 页面内容 */}
        <main className="flex-1 min-w-0 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
