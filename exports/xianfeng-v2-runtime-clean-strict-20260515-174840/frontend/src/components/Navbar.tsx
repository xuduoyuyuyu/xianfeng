import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Navbar: React.FC = () => {
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 h-16">
      <div className="flex justify-between items-center px-6 h-full w-full max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-10">
          <Link to="/">
            <img alt="家长先疯" className="h-10 w-auto object-contain" src="/assets/logo.png" />
          </Link>
          <div className="hidden md:flex gap-8">
            <Link 
              to="/programs" 
              className={`text-sm font-medium transition-colors pb-1 border-b-2 ${
                isActive('/programs') 
                  ? 'text-[#5e17eb] border-[#5e17eb] font-bold' 
                  : 'text-gray-600 border-transparent hover:text-[#5e17eb]'
              }`}
            >
              播客节目
            </Link>
            <Link 
              to="/books" 
              className={`text-sm font-medium transition-colors pb-1 border-b-2 ${
                isActive('/books') 
                  ? 'text-[#5e17eb] border-[#5e17eb] font-bold' 
                  : 'text-gray-600 border-transparent hover:text-[#5e17eb]'
              }`}
            >
              推荐书单
            </Link>
            <Link 
              to="/materials" 
              className={`text-sm font-medium transition-colors pb-1 border-b-2 ${
                isActive('/materials') 
                  ? 'text-[#5e17eb] border-[#5e17eb] font-bold' 
                  : 'text-gray-600 border-transparent hover:text-[#5e17eb]'
              }`}
            >
              学习资料
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center bg-gray-50 rounded-full px-4 py-1.5 border border-gray-200">
            <span className="material-symbols-outlined text-[#5e17eb] text-lg mr-2">search</span>
            <input 
              className="bg-transparent border-none focus:ring-0 text-xs w-40 placeholder-gray-400 outline-none" 
              placeholder="搜索育儿洞察..." 
              type="text"
            />
          </div>
          <Link 
            to="/login"
            className="bg-[#5e17eb] text-white px-5 py-2 rounded-full text-xs font-bold hover:opacity-90 transition-opacity"
          >
            登录 / 注册
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
