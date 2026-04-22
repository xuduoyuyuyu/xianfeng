import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, Program, Book, LearningMaterial } from '../../services/api';

const AdminDashboardPage: React.FC = () => {
  const [stats, setStats] = useState({
    programs: 0,
    books: 0,
    materials: 0,
    published: 0,
    drafts: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [programsRes, booksRes, materialsRes] = await Promise.all([
          adminApi.getPrograms(),
          adminApi.getBooks(),
          adminApi.getMaterials(),
        ]);

        const programs = programsRes.data;
        const books = booksRes.data;
        const materials = materialsRes.data;

        const allItems = [...programs, ...books, ...materials];
        const published = allItems.filter((item: Program | Book | LearningMaterial) => item.status === 'published').length;
        const drafts = allItems.filter((item: Program | Book | LearningMaterial) => item.status === 'draft').length;

        setStats({
          programs: programs.length,
          books: books.length,
          materials: materials.length,
          published,
          drafts,
        });
      } catch (error) {
        console.error('获取统计数据失败:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    { 
      title: '播客节目', 
      count: stats.programs, 
      icon: 'podcasts', 
      color: 'bg-[#5e17eb]',
      link: '/admin/programs'
    },
    { 
      title: '书单资源', 
      count: stats.books, 
      icon: 'menu_book', 
      color: 'bg-[#5E8B8E]',
      link: '/admin/books'
    },
    { 
      title: '学习资料', 
      count: stats.materials, 
      icon: 'school', 
      color: 'bg-orange-500',
      link: '/admin/materials'
    },
    { 
      title: '已发布', 
      count: stats.published, 
      icon: 'check_circle', 
      color: 'bg-emerald-500',
      link: '/admin'
    },
    { 
      title: '草稿箱', 
      count: stats.drafts, 
      icon: 'draft', 
      color: 'bg-amber-500',
      link: '/admin'
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-2 text-[#5E8B8E] font-bold tracking-[0.2em] text-xs uppercase">
        <span className="w-8 h-[1px] bg-[#5E8B8E]"></span>
        管理面板
      </div>
      <h1 className="text-5xl font-black tracking-tight text-stone-900">总览</h1>
      <p className="text-stone-500 text-xl font-light">欢迎回来，查看您的内容管理数据。</p>

      {/* 统计卡片 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-4 border-[#5e17eb]/10 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-t-[#5e17eb] rounded-full animate-spin"></div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {statCards.map((card, index) => (
            <Link
              key={index}
              to={card.link}
              className="bg-white rounded-2xl p-8 border border-stone-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className={`w-12 h-12 ${card.color} rounded-xl flex items-center justify-center text-white mb-5 shadow-lg`}>
                    <span className="material-symbols-outlined">{card.icon}</span>
                  </div>
                  <h3 className="text-stone-500 font-medium text-sm">{card.title}</h3>
                </div>
                <span className="text-4xl font-black tracking-tighter text-stone-900">{card.count}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 快速操作 */}
      <div className="bg-white rounded-2xl p-8 border border-stone-100 shadow-sm mt-8">
        <h2 className="text-2xl font-black text-stone-900 mb-6">快速操作</h2>
        <div className="flex flex-wrap gap-4">
          <Link
            to="/admin/programs"
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#5e17eb] text-white text-sm font-bold hover:bg-[#5e17eb]/90 transition-all shadow-md"
          >
            <span className="material-symbols-outlined">add</span>
            新建节目
          </Link>
          <Link
            to="/admin/books"
            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-stone-200 text-stone-700 hover:border-[#5e17eb] hover:text-[#5e17eb] transition-all text-sm font-bold"
          >
            <span className="material-symbols-outlined">add</span>
            新建书单
          </Link>
          <Link
            to="/admin/materials"
            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-stone-200 text-stone-700 hover:border-[#5e17eb] hover:text-[#5e17eb] transition-all text-sm font-bold"
          >
            <span className="material-symbols-outlined">add</span>
            上传资料
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
