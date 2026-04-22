import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { logout } from '../store/userSlice';

const AdminLayout: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.user);
  const dispatch = useDispatch();
  const location = useLocation();
  const adminName = user?.username || "";

  const handleLogout = () => {
    dispatch(logout());
  };

  const isActive = (path: string) => location.pathname === path;

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
        <nav className="p-4 space-y-2">
          <Link
            to="/admin"
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              isActive('/admin') 
                ? 'bg-[#5e17eb] text-white' 
                : 'text-stone-600 hover:bg-stone-50'
            }`}
          >
            <span className="material-symbols-outlined">dashboard</span>
            <span className="font-medium text-sm">总览</span>
          </Link>
          <Link
            to="/admin/programs"
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              isActive('/admin/programs') 
                ? 'bg-[#5e17eb] text-white' 
                : 'text-stone-600 hover:bg-stone-50'
            }`}
          >
            <span className="material-symbols-outlined">podcasts</span>
            <span className="font-medium text-sm">播客管理</span>
          </Link>
          <Link
            to="/admin/books"
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              isActive('/admin/books') 
                ? 'bg-[#5e17eb] text-white' 
                : 'text-stone-600 hover:bg-stone-50'
            }`}
          >
            <span className="material-symbols-outlined">menu_book</span>
            <span className="font-medium text-sm">书单管理</span>
          </Link>
          <Link
            to="/admin/materials"
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              isActive('/admin/materials') 
                ? 'bg-[#5e17eb] text-white' 
                : 'text-stone-600 hover:bg-stone-50'
            }`}
          >
            <span className="material-symbols-outlined">school</span>
            <span className="font-medium text-sm">学习资料</span>
          </Link>
          <Link
            to="/admin/users"
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              isActive('/admin/users') 
                ? 'bg-[#5e17eb] text-white' 
                : 'text-stone-600 hover:bg-stone-50'
            }`}
          >
            <span className="material-symbols-outlined">group</span>
            <span className="font-medium text-sm">用户管理</span>
          </Link>
          <Link
            to="/admin/system"
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              isActive('/admin/system') 
                ? 'bg-[#5e17eb] text-white' 
                : 'text-stone-600 hover:bg-stone-50'
            }`}
          >
            <span className="material-symbols-outlined">settings</span>
            <span className="font-medium text-sm">系统信息</span>
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
