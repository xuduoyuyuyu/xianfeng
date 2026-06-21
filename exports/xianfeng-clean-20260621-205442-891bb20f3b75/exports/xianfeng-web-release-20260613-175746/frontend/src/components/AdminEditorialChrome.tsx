import React from "react";
import { Link } from "react-router-dom";

export const AdminEditorialNav: React.FC = () => {
  return (
    <nav className="fixed top-0 z-50 flex h-20 w-full items-center justify-between border-b border-stone-100 bg-white/80 px-10 backdrop-blur-2xl">
      <div className="flex items-center gap-16">
        <Link to="/programs">
          <img alt="家长先疯" className="h-12 w-auto object-contain" src="/assets/logo.png" />
        </Link>
        <div className="hidden items-center gap-10 lg:flex">
          <a className="group relative font-medium text-[#7A746E] transition-colors hover:text-[#5e17eb]" href="#">
            推荐书单
            <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-[#5e17eb] transition-all group-hover:w-full"></span>
          </a>
          <a className="font-medium text-[#7A746E] transition-colors hover:text-[#5e17eb]" href="#">
            播客频道
          </a>
          <a className="font-medium text-[#7A746E] transition-colors hover:text-[#5e17eb]" href="#">
            专家名录
          </a>
          <a className="border-b-2 border-[#5e17eb] pb-1 font-bold text-[#5e17eb]" href="#">
            成功案例
          </a>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="group relative hidden md:block">
          <input className="w-72 rounded-full border-none bg-stone-100 px-6 py-2.5 text-sm focus:ring-2 focus:ring-[#5e17eb]/10" placeholder="搜索教育资源..." type="text" />
          <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-sm text-stone-400">search</span>
        </div>
        <Link to="/admin/login" className="rounded-full bg-[#5e17eb] px-7 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90 hover:shadow-lg">登录控制台</Link>
      </div>
    </nav>
  );
};

export const AdminEditorialFooter: React.FC = () => {
  return (
    <footer className="mt-24 w-full border-t border-stone-100 bg-white px-10 py-16">
      <div className="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-10 md:flex-row">
        <div className="flex flex-col items-center gap-4 md:items-start">
          <img alt="家长先疯" className="h-10 w-auto object-contain" src="/assets/logo.png" />
          <p className="text-sm font-medium text-[#7A746E]">© 2024 Luminous Mentor. 打造有温度的教育叙事体验。</p>
        </div>
        <div className="flex flex-wrap justify-center gap-10">
          <a className="text-xs font-black uppercase tracking-widest text-stone-400 transition-colors hover:text-[#5e17eb]" href="#">
            隐私政策
          </a>
          <a className="text-xs font-black uppercase tracking-widest text-stone-400 transition-colors hover:text-[#5e17eb]" href="#">
            使用条款
          </a>
          <a className="text-xs font-black uppercase tracking-widest text-stone-400 transition-colors hover:text-[#5e17eb]" href="#">
            家长指南
          </a>
          <a className="text-xs font-black uppercase tracking-widest text-stone-400 transition-colors hover:text-[#5e17eb]" href="#">
            联系支持
          </a>
        </div>
        <div className="flex gap-5">
          <div className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl border border-stone-100 bg-stone-50 text-stone-400 transition-all hover:bg-[#5e17eb]/5 hover:text-[#5e17eb]">
            <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>
              share
            </span>
          </div>
          <div className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl border border-stone-100 bg-stone-50 text-stone-400 transition-all hover:bg-[#5e17eb]/5 hover:text-[#5e17eb]">
            <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>
              language
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
