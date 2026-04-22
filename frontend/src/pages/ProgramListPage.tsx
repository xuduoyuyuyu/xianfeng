import React from "react";
import { Link } from "react-router-dom";
import { PodcastHomeFooter, PodcastHomeNav, PodcastSidebarSubscribe } from "../components/PodcastChrome";

const categories = [
  { label: "全部节目", icon: "grid_view", active: true },
  { label: "早期启蒙", icon: "child_care" },
  { label: "情绪管理", icon: "psychology" },
  { label: "升学路径", icon: "school" },
  { label: "艺术素养", icon: "palette" },
  { label: "通识博雅", icon: "menu_book" },
  { label: "家庭关系", icon: "diversity_3" },
];

const featuredCards = [
  {
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuD9kNK0Swlk0Z_8qKWeNY7pZRXiC8aQ5uXb7civ7JNln2ot7EXUUGXeU1g4OYo8pUPDqk_iwcI-Fqks1baa6f595CSw302ox2wCyWX3KGkcZq630cbJ0m9-DkHNLkbeKiJQoqTsFuQ41ThYMWb-CkI0xyoZ0sFJR5FyzlKpOAewSqoiZ6kmzawO5-T02uwzHQwHVvASQATN4dsVy6Gl1YGvmuTaEWHvnf3zRDSGoUeBDBsXQA9XGf2dJ2WS1cqnfOfRzJafzReWqXHu",
    episode: "EPISODE 102",
    date: "2024年3月24日",
    title: "深度倾听：如何与正处于叛逆期的幼儿建立情感锚点",
    description: "探讨如何通过积极的存在将日常互动转化为深层的情感纽带，应对幼儿成长过程中的心理挑战。",
  },
  {
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCB-GSaZMDiqA4GYZONoY9nisAnyZtALuNcQhk8Sh7yVZ8RRhefCBZlMtZFXCEXhl10igFW9OuzkcwydIbKX3yMVjpTgT_naxLpII471gZ5JS-b2kNwpRqswWXGt51fIPTGbug0Fw56U6xYteRX7VML-uR9747KMFnEEGUj66zC47ibjudvQtvWORLUCejtqUqkDmYKZvDm3WXfE0heZ-pNhUnlG9fmAa4zzYH7nF6IZQbDz3AcIMWKDqBR9BEx11b7zyNaeaO0Xor3",
    episode: "EPISODE 101",
    date: "2024年3月17日",
    title: "IB课程导航：全球化教育背景下家长的选择指南",
    description: "揭秘国际文凭组织(IB)的课程体系，为什么它可能适合您孩子的未来，以及家庭需要做哪些准备。",
  },
];

const compactCards = [
  {
    no: "100",
    title: "数字时代下的家庭公民教育：如何建立健康的屏幕时间",
    date: "2024年3月10日",
    duration: "52分钟",
  },
];

const ProgramListPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#f4f5f7] font-['Plus_Jakarta_Sans','PingFang_SC','Microsoft_YaHei',sans-serif] text-[#1a1a1b]">
      <style>{`
        .magazine-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);
        }
        .magazine-card:hover {
          border-color: #5e17eb;
          transform: translateY(-4px);
          box-shadow: 0 20px 40px -15px rgba(94, 23, 235, 0.1);
        }
        .category-circle {
          display: flex;
          min-width: 6rem;
          flex-shrink: 0;
          cursor: pointer;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          transition: all 0.3s;
        }
        .circle-icon {
          display: flex;
          height: 2.5rem;
          width: 6rem;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          border: 1px solid #e2e8f0;
          background: #fff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
          transition: all 0.3s;
        }
        .category-circle:hover .circle-icon {
          border-color: #5e17eb;
          background: rgba(94, 23, 235, 0.05);
          transform: translateY(-1px);
        }
        .category-circle.active .circle-icon {
          border-color: #5e17eb;
          background: #5e17eb;
          color: white;
          box-shadow: 0 10px 18px rgba(94, 23, 235, 0.2);
        }
        .category-circle.active .circle-text {
          color: #5e17eb;
          font-weight: 700;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f4f5f7;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #5e17eb;
        }
      `}</style>

      <PodcastHomeNav />

      <main className="relative mx-auto flex w-full max-w-[1440px] flex-grow pt-20 custom-scrollbar">
        <section className="flex-1 p-8 md:p-12 lg:mr-80">
          <header className="mb-12">
            <div className="mb-4 flex items-baseline gap-4">
              <h1 className="text-4xl font-black tracking-tight text-[#1a1a1b]">知识沉淀</h1>
              <div className="h-1.5 w-12 rounded-full bg-[#5e17eb]"></div>
            </div>
            <p className="max-w-2xl text-lg text-[#64748b]">深度对话教育与成长，采用现代内容中心设计，为您呈现最优质的学习视野。</p>
          </header>

          <div className="relative mb-16">
            <div className="scrollbar-hide flex gap-8 overflow-x-auto pb-4 snap-x">
              {categories.map((item) => (
                <div key={item.label} className={`category-circle snap-start ${item.active ? "active" : ""}`}>
                  <div className="circle-icon">
                    <span className={`material-symbols-outlined text-2xl ${item.active ? "" : "text-[#64748b]"}`}>{item.icon}</span>
                  </div>
                  <span className="circle-text text-[10px] font-bold uppercase tracking-widest text-[#64748b]">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="pointer-events-none absolute right-0 top-0 bottom-4 w-20 bg-gradient-to-l from-[#f4f5f7] to-transparent"></div>
          </div>

          <div className="space-y-8">
            {featuredCards.map((card, index) => (
              <Link key={card.title} to="/programs/42" className="block">
              <article className="magazine-card group rounded-3xl p-10 cursor-pointer">
                <div className="flex flex-col gap-10 xl:flex-row">
                  <div className="relative h-[300px] w-full flex-shrink-0 overflow-hidden rounded-2xl shadow-lg xl:w-[420px]">
                    <img alt="Podcast Cover" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" src={card.image} />
                  </div>
                  <div className="flex flex-1 flex-col justify-center">
                    <div className="mb-4 flex items-center gap-4">
                      <span className={`rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${index === 0 ? "bg-[#5e17eb]/10 text-[#5e17eb]" : "bg-slate-100 text-[#64748b]"}`}>
                        {card.episode}
                      </span>
                      <span className="text-xs font-medium text-[#64748b]">{card.date}</span>
                    </div>
                    <h2 className="mb-4 text-3xl font-extrabold leading-tight transition-colors group-hover:text-[#5e17eb]">{card.title}</h2>
                    <p className="line-clamp-2 mb-8 text-base leading-relaxed text-[#64748b]">{card.description}</p>
                    <div className="flex flex-wrap gap-3">
                      <span className="flex items-center gap-2 rounded-xl bg-[#5e17eb] px-6 py-3 text-sm font-bold text-white shadow-md transition-all">
                        <span className="material-symbols-outlined text-lg">description</span>
                        逐字稿
                      </span>
                      <span className="flex items-center gap-2 rounded-xl border border-[#e2e8f0] px-6 py-3 text-sm font-bold text-[#1a1a1b] transition-all">
                        <span className="material-symbols-outlined text-lg">menu_book</span>
                        书单
                      </span>
                      <span className="flex items-center gap-2 rounded-xl border border-[#e2e8f0] px-6 py-3 text-sm font-bold text-[#1a1a1b] transition-all">
                        <span className="material-symbols-outlined text-lg">school</span>
                        课程
                      </span>
                    </div>
                  </div>
                </div>
              </article>
              </Link>
            ))}

            {compactCards.map((card) => (
              <Link key={card.title} to="/programs/42" className="block">
              <article className="magazine-card group flex cursor-pointer flex-col items-center justify-between gap-6 rounded-2xl p-6 md:flex-row">
                <div className="flex items-center gap-6">
                  <span className="w-12 text-center text-2xl font-black text-slate-200 transition-colors group-hover:text-[#5e17eb]/20">{card.no}</span>
                  <div>
                    <h3 className="text-lg font-bold transition-colors group-hover:text-[#5e17eb]">{card.title}</h3>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-xs text-[#64748b]">{card.date}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-200"></span>
                      <span className="text-xs font-bold text-[#5e17eb]">{card.duration}</span>
                    </div>
                  </div>
                </div>
                <span className="flex items-center gap-2 rounded-xl bg-[#5e17eb] px-6 py-3 text-sm font-bold text-white shadow-md transition-all">
                  <span className="material-symbols-outlined text-lg">description</span>
                  阅读稿件
                </span>
              </article>
              </Link>
            ))}

            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <div className="relative h-8 w-8">
                <div className="absolute inset-0 rounded-full border-4 border-[#5e17eb]/10"></div>
                <div className="animate-spin absolute inset-0 rounded-full border-4 border-t-[#5e17eb]"></div>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748b]">正在加载更多精彩...</p>
            </div>
          </div>
        </section>

        <PodcastSidebarSubscribe />
      </main>

      <PodcastHomeFooter />
    </div>
  );
};

export default ProgramListPage;
