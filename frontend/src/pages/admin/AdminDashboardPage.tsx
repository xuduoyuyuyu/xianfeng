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

        // getPrograms 返回分页对象 { items, data, programs, total, ... }
        // getBooks / getMaterials 直接返回数组
        const programsRaw = programsRes.data as any;
        const programTotal = typeof programsRaw?.total === 'number' ? programsRaw.total : (Array.isArray(programsRaw) ? programsRaw.length : 0);
        const books = booksRes.data;
        const materials = materialsRes.data;

        setStats({
          programs: programTotal,
          books: books.length,
          materials: materials.length,
          published: 0,
          drafts: 0,
        });

        // 异步获取已发布和草稿数量（节目）
        const [pubRes, draftRes] = await Promise.all([
          adminApi.getPrograms('published'),
          adminApi.getPrograms('draft'),
        ]);
        const pubRaw = pubRes.data as any;
        const draftRaw = draftRes.data as any;
        const pubCount = typeof pubRaw?.total === 'number' ? pubRaw.total : (Array.isArray(pubRaw) ? pubRaw.length : 0);
        const draftCount = typeof draftRaw?.total === 'number' ? draftRaw.total : (Array.isArray(draftRaw) ? draftRaw.length : 0);

        setStats(prev => ({
          ...prev,
          published: pubCount,
          drafts: draftCount,
        }));
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
      <div className="admin-toolbar">
        <h1 className="text-4xl font-black text-stone-900">数据概览</h1>
      </div>

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
            className="admin-pill-btn admin-pill-btn-primary"
          >
            <span className="material-symbols-outlined">add</span>
            新建节目
          </Link>
          <Link
            to="/admin/books"
            className="admin-pill-btn admin-pill-btn-secondary"
          >
            <span className="material-symbols-outlined">add</span>
            新建书单
          </Link>
          <Link
            to="/admin/materials"
            className="admin-pill-btn admin-pill-btn-secondary"
          >
            <span className="material-symbols-outlined">add</span>
            上传资料
          </Link>
          <Link
            to="/admin/mama-resources"
            className="admin-pill-btn admin-pill-btn-secondary"
          >
            <img src="/assets/mama-hao-zhuan-icon.png" alt="" className="h-5 w-5 object-contain" />
            好赚
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
