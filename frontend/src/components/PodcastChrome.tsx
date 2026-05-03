import React from "react";
import { Link } from "react-router-dom";

type NavProps = {
  detail?: boolean;
};

export const PodcastHomeNav: React.FC = () => {
  return (
    <nav className="fixed top-0 z-50 w-full border-b border-[#e2e8f0] bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-8">
        <div className="flex items-center gap-12">
          <Link to="/programs">
            <img alt="家长先疯" className="h-[62px] w-auto object-contain" src="/assets/logo.png" />
          </Link>
          <div className="hidden items-center gap-8 xl:flex">
            <div className="flex gap-8 border-r border-[#e2e8f0] pr-8">
              <Link className="relative flex items-center gap-1.5 text-sm font-bold text-[#1a1a1b] after:absolute after:bottom-[-29px] after:left-0 after:h-1 after:w-full after:bg-[#5e17eb]" to="/programs">
                播客节目
              </Link>
              <a className="flex items-center gap-1.5 text-sm font-semibold text-[#64748b] transition-colors hover:text-[#5e17eb]" href="#">
                学习社区
              </a>
            </div>
            <div className="flex gap-6">
              <a className="flex items-center gap-1.5 text-sm font-semibold text-[#64748b] transition-colors hover:text-[#5e17eb]" href="#">
                <span className="material-symbols-outlined text-lg">article</span>
                精选文稿
              </a>
              <a className="flex items-center gap-1.5 text-sm font-semibold text-[#64748b] transition-colors hover:text-[#5e17eb]" href="#">
                <span className="material-symbols-outlined text-lg">auto_stories</span>
                推荐书单
              </a>
              <a className="flex items-center gap-1.5 text-sm font-semibold text-[#64748b] transition-colors hover:text-[#5e17eb]" href="#">
                <span className="material-symbols-outlined text-lg">forum</span>
                专家采访
              </a>
              <a className="flex items-center gap-1.5 text-sm font-semibold text-[#64748b] transition-colors hover:text-[#5e17eb]" href="#">
                <span className="material-symbols-outlined text-lg">collections_bookmark</span>
                课程资料
              </a>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="relative hidden lg:block">
            <input
              className="w-64 rounded-xl border-none bg-[#f4f5f7] px-6 py-2.5 text-sm text-[#1a1a1b] transition-all placeholder:text-[#64748b]/60 focus:ring-2 focus:ring-[#5e17eb]"
              placeholder="搜索内容..."
              type="text"
            />
            <span className="material-symbols-outlined absolute right-4 top-2.5 text-xl text-[#64748b]">search</span>
          </div>
          <Link to="/login" className="rounded-xl bg-[#5e17eb] px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#5e17eb]/20 transition-all hover:bg-[#4a12ba]">
            登录
          </Link>
        </div>
      </div>
    </nav>
  );
};

export const PodcastDetailNav: React.FC<NavProps> = () => {
  return (
    <nav className="fixed top-0 z-50 h-16 w-full border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-full w-full max-w-screen-2xl items-center justify-between px-6">
        <div className="flex items-center gap-10">
          <Link to="/programs">
            <img alt="家长先疯" className="h-[52px] w-auto object-contain" src="/assets/logo.png" />
          </Link>
          <div className="hidden gap-8 md:flex">
            <a className="text-sm font-medium text-[#53433f] transition-colors hover:text-[#5e17eb]" href="#">
              推荐书单
            </a>
            <Link className="border-b-2 border-[#5e17eb] pb-1 text-sm font-bold text-[#5e17eb]" to="/programs">
              播客节目
            </Link>
            <a className="text-sm font-medium text-[#53433f] transition-colors hover:text-[#5e17eb]" href="#">
              专家导览
            </a>
            <a className="text-sm font-medium text-[#53433f] transition-colors hover:text-[#5e17eb]" href="#">
              成功案例
            </a>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden items-center rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 sm:flex">
            <span className="material-symbols-outlined mr-2 text-lg text-[#5e17eb]">search</span>
            <input className="w-40 border-none bg-transparent text-xs placeholder:text-[#53433f]/50 focus:ring-0" placeholder="搜索育儿洞察..." type="text" />
          </div>
          <Link to="/login" className="rounded-full bg-[#5e17eb] px-5 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90">
            登录 / 注册
          </Link>
        </div>
      </div>
    </nav>
  );
};

export const PodcastSidebarSubscribe: React.FC = () => {
  return (
    <aside className="fixed right-0 hidden h-[calc(100vh-80px)] w-80 flex-col border-l border-[#e2e8f0] bg-white p-10 lg:flex">
      <div className="mt-4">
        <div className="relative overflow-hidden rounded-3xl border border-[#5e17eb]/20 bg-[#5e17eb]/[0.02] p-8 text-center">
          <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[#5e17eb]/5 blur-3xl"></div>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#5e17eb] text-white shadow-xl shadow-[#5e17eb]/20">
            <span className="material-symbols-outlined text-3xl font-bold">mail</span>
          </div>
          <h4 className="mb-3 text-xl font-black text-[#1a1a1b]">每周精选推送</h4>
          <p className="mb-8 text-sm leading-relaxed text-[#64748b]">加入 5,000+ 精进家长，每周获取一次深度教育思考。</p>
          <input className="mb-4 w-full rounded-xl border-none bg-[#f4f5f7] px-4 py-3 text-sm focus:ring-1 focus:ring-[#5e17eb]" placeholder="您的邮箱地址" type="email" />
          <button className="w-full rounded-xl bg-[#5e17eb] py-4 text-sm font-black tracking-wider text-white shadow-lg shadow-[#5e17eb]/15 transition-all hover:bg-[#4a12ba]">
            立即免费订阅
          </button>
          <p className="mt-4 text-[10px] italic text-[#64748b]/60">隐私保护 · 随时取消</p>
        </div>
      </div>
    </aside>
  );
};

export const PodcastHomeFooter: React.FC = () => {
  return (
    <footer className="border-t border-[#e2e8f0] bg-white px-8 py-7">
      <div className="mx-auto max-w-6xl text-center text-xs font-semibold text-[#94a3b8]">
        © 2026 家长先疯. All rights reserved.
      </div>
    </footer>
  );
};

export const PodcastDetailFooter: React.FC = () => {
  return (
    <footer className="mt-10 w-full border-t border-gray-100 bg-white px-8 py-16 pb-44">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 md:flex-row">
        <div className="flex flex-col gap-2 text-center md:text-left">
          <img alt="家长先疯" className="h-10 w-auto object-contain" src="/assets/logo.png" />
          <p className="text-xs text-gray-400">© 2024 家长先疯. 为中国家长打造的纯净知识空间。</p>
        </div>
        <div className="flex gap-8">
          <a className="text-xs text-gray-400 transition-colors hover:text-[#5e17eb]" href="#">
            隐私政策
          </a>
          <a className="text-xs text-gray-400 transition-colors hover:text-[#5e17eb]" href="#">
            服务条款
          </a>
          <a className="text-xs text-gray-400 transition-colors hover:text-[#5e17eb]" href="#">
            联系支持
          </a>
        </div>
        <div className="flex gap-5">
          <span className="material-symbols-outlined cursor-pointer text-xl text-gray-400 hover:text-[#5e17eb]">language</span>
          <span className="material-symbols-outlined cursor-pointer text-xl text-gray-400 hover:text-[#5e17eb]">rss_feed</span>
          <span className="material-symbols-outlined cursor-pointer text-xl text-gray-400 hover:text-[#5e17eb]">mail</span>
        </div>
      </div>
    </footer>
  );
};
