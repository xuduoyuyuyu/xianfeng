import React from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../store";
import { logout } from "../store/userSlice";

const AdminLayout: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.user);
  const dispatch = useDispatch();
  const location = useLocation();
  const adminName = user?.username || "";

  const handleLogout = () => {
    dispatch(logout());
  };

  const isActive = (path: string) => location.pathname === path;
  const navItemClass = (active: boolean) =>
    `group flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 ${
      active
        ? "bg-[#5e17eb] text-white border-[#5e17eb] shadow-[0_8px_18px_-8px_rgba(94,23,235,0.7)]"
        : "bg-white text-stone-600 border-transparent hover:bg-[#f6f3ff] hover:text-[#4e18c9] hover:border-[#e8dcff]"
    }`;

  const navIconClass = (active: boolean) =>
    `material-symbols-outlined text-[19px] transition-colors ${
      active ? "text-white" : "text-stone-400 group-hover:text-[#5e17eb]"
    }`;

  const navTextClass = (active: boolean) =>
    `text-sm transition-colors ${active ? "font-semibold text-white" : "font-medium text-stone-600 group-hover:text-[#4e18c9]"}`;

  return (
    <div className="min-h-screen bg-[#FAF8F6] flex">
      {/* 侧边栏 */}
      <aside className="w-64 bg-white border-r border-stone-200 fixed h-full">
        <div className="p-6 border-b border-stone-100">
          <Link to="/">
            <img alt="家长先疯" className="h-10 w-auto object-contain" src="/assets/logo.png" />
          </Link>
          <p className="text-xs text-stone-400 mt-1">管理控制台</p>
        </div>
        <nav className="p-4 space-y-2.5">
          <Link
            to="/admin"
            className={navItemClass(isActive("/admin"))}
          >
            <span className={navIconClass(isActive("/admin"))}>dashboard</span>
            <span className={navTextClass(isActive("/admin"))}>总览</span>
          </Link>
          <Link
            to="/admin/programs"
            className={navItemClass(isActive("/admin/programs"))}
          >
            <span className={navIconClass(isActive("/admin/programs"))}>podcasts</span>
            <span className={navTextClass(isActive("/admin/programs"))}>播客管理</span>
          </Link>
          <Link
            to="/admin/books"
            className={navItemClass(isActive("/admin/books"))}
          >
            <span className={navIconClass(isActive("/admin/books"))}>menu_book</span>
            <span className={navTextClass(isActive("/admin/books"))}>书单管理</span>
          </Link>
          <Link
            to="/admin/materials"
            className={navItemClass(isActive("/admin/materials"))}
          >
            <span className={navIconClass(isActive("/admin/materials"))}>school</span>
            <span className={navTextClass(isActive("/admin/materials"))}>学习资料</span>
          </Link>
          <Link
            to="/admin/users"
            className={navItemClass(isActive("/admin/users"))}
          >
            <span className={navIconClass(isActive("/admin/users"))}>group</span>
            <span className={navTextClass(isActive("/admin/users"))}>用户管理</span>
          </Link>
          <Link
            to="/admin/system"
            className={navItemClass(isActive("/admin/system"))}
          >
            <span className={navIconClass(isActive("/admin/system"))}>settings</span>
            <span className={navTextClass(isActive("/admin/system"))}>系统信息</span>
          </Link>
        </nav>
      </aside>

      {/* 主内容区 */}
      <div className="flex-1 ml-64">
        {/* 顶部栏 */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-stone-100 flex items-center justify-between px-8 sticky top-0 z-40">
          <div className="flex items-center gap-2 text-stone-500 text-sm">
            <span className="material-symbols-outlined text-base">admin_panel_settings</span>
            <span>管理员: {adminName}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/" className="text-sm text-stone-500 hover:text-[#5e17eb] transition-colors">
              返回前台
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-red-500 hover:text-red-600 transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-base">logout</span>
              退出
            </button>
          </div>
        </header>

        {/* 页面内容 */}
        <main className="p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
