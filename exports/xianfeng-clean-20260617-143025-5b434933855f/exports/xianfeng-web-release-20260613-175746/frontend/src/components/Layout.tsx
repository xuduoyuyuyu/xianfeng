import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

interface LayoutProps {
  children?: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-[#fdfbf9] flex flex-col">
      <Navbar />
      <main className="flex-1 pt-16">
        {children || <Outlet />}
      </main>
      <footer className="bg-white border-t border-gray-100 w-full py-16 px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8 max-w-7xl mx-auto">
          <div className="flex flex-col gap-2 text-center md:text-left">
            <img alt="家长先疯" className="h-10 w-auto object-contain" src="/assets/logo.png" />
            <p className="text-gray-400 text-xs">© 2024 家长先疯. 为中国家长打造的纯净知识空间。</p>
          </div>
          <div className="flex gap-8">
            <a className="text-gray-400 text-xs hover:text-[#5e17eb] transition-colors" href="#">隐私政策</a>
            <a className="text-gray-400 text-xs hover:text-[#5e17eb] transition-colors" href="#">服务条款</a>
            <a className="text-gray-400 text-xs hover:text-[#5e17eb] transition-colors" href="#">联系支持</a>
          </div>
          <div className="flex gap-5">
            <span className="material-symbols-outlined text-gray-400 hover:text-[#5e17eb] cursor-pointer text-xl">language</span>
            <span className="material-symbols-outlined text-gray-400 hover:text-[#5e17eb] cursor-pointer text-xl">rss_feed</span>
            <span className="material-symbols-outlined text-gray-400 hover:text-[#5e17eb] cursor-pointer text-xl">mail</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
