import React, { useEffect, useMemo, useState } from 'react';
import { adminApi, Book } from '../../services/api';
const PAGE_SIZE = 20;

const AdminBooksPage: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState({
    title: '',
    author: '',
    description: '',
    coverImage: '',
    category: '',
    status: 'draft' as 'draft' | 'published',
  });

  useEffect(() => {
    fetchBooks();
  }, [filter]);

  const fetchBooks = async () => {
    try {
      const status = filter === 'all' ? undefined : filter;
      const response = await adminApi.getBooks(status);
      setBooks(response.data);
      setCurrentPage(1);
    } catch (error) {
      console.error('获取书单列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(books.length / PAGE_SIZE));
  const pagedBooks = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return books.slice(start, start + PAGE_SIZE);
  }, [books, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handleCreate = () => {
    setEditingBook(null);
    setFormData({ title: '', author: '', description: '', coverImage: '', category: '', status: 'draft' });
    setShowModal(true);
  };

  const handleEdit = (book: Book) => {
    setEditingBook(book);
    setFormData({
      title: book.title,
      author: book.author,
      description: book.description,
      coverImage: book.coverImage,
      category: book.category,
      status: book.status,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBook) {
        await adminApi.updateBook(editingBook._id, formData);
      } else {
        await adminApi.createBook(formData);
      }
      setShowModal(false);
      fetchBooks();
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个书单吗？')) return;
    try {
      await adminApi.deleteBook(id);
      fetchBooks();
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败');
    }
  };

  const handleToggleStatus = async (book: Book) => {
    const newStatus = book.status === 'published' ? 'draft' : 'published';
    try {
      await adminApi.updateBookStatus(book._id, newStatus);
      fetchBooks();
    } catch (error) {
      console.error('状态更新失败:', error);
      alert('状态更新失败');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="admin-toolbar">
        <div />
        <button
          onClick={handleCreate}
          className="admin-pill-btn admin-pill-btn-primary"
        >
          <span className="material-symbols-outlined text-base">add_circle</span>
          新增书单
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#5e17eb]/10 rounded-xl flex items-center justify-center text-[#5e17eb]">
              <span className="material-symbols-outlined">menu_book</span>
            </div>
            <div>
              <p className="text-2xl font-black">{books.length}</p>
              <p className="text-xs text-stone-400">总书单数</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
              <span className="material-symbols-outlined">check_circle</span>
            </div>
            <div>
              <p className="text-2xl font-black">{books.filter(b => b.status === 'published').length}</p>
              <p className="text-xs text-stone-400">已发布</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
              <span className="material-symbols-outlined">draft</span>
            </div>
            <div>
              <p className="text-2xl font-black">{books.filter(b => b.status === 'draft').length}</p>
              <p className="text-xs text-stone-400">草稿</p>
            </div>
          </div>
        </div>
      </div>

      {/* 筛选标签 */}
      <div className="flex items-center gap-4">
        <div className="flex bg-stone-100 p-1.5 rounded-2xl">
          {(['all', 'published', 'draft'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${
                filter === f
                  ? 'bg-white shadow-sm text-stone-900'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              {f === 'all' ? '全部' : f === 'published' ? '已发布' : '草稿'}
            </button>
          ))}
        </div>
      </div>

      {/* 列表表格 */}
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-[#5e17eb]/10 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-t-[#5e17eb] rounded-full animate-spin"></div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-stone-50/50 text-stone-500 uppercase text-[10px] font-black tracking-[0.2em]">
                <tr>
                  <th className="px-6 py-4">书单信息</th>
                  <th className="px-6 py-4">作者</th>
                  <th className="px-6 py-4">分类</th>
                  <th className="px-6 py-4">状态</th>
                  <th className="px-6 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {pagedBooks.map((book) => (
                  <tr key={book._id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <img
                          src={book.coverImage || 'https://via.placeholder.com/48x48/630ed4/ffffff?text=B'}
                          alt={book.title}
                          className="w-12 h-12 rounded-xl object-cover"
                        />
                        <div>
                          <div className="font-bold text-stone-900">{book.title}</div>
                          <div className="text-xs text-stone-400 line-clamp-1 max-w-xs">{book.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">{book.author}</td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded-full bg-stone-100 text-stone-600 text-xs font-bold">
                        {book.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleStatus(book)}
                        className={`px-3 py-1 rounded-full text-[10px] font-black transition-colors ${
                          book.status === 'published'
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                        }`}
                      >
                        {book.status === 'published' ? '已发布' : '草稿'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(book)}
                          className="p-2 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-[#5e17eb] transition-colors"
                        >
                          <span className="material-symbols-outlined">edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(book._id)}
                          className="p-2 rounded-lg hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors"
                        >
                          <span className="material-symbols-outlined">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {books.length === 0 && (
              <div className="text-center py-16 text-stone-400">
                <span className="material-symbols-outlined text-6xl mb-4">inbox</span>
                <p>暂无书单</p>
              </div>
            )}
            {books.length > 0 && (
              <div className="flex items-center justify-between border-t border-stone-100 px-6 py-4 text-sm text-stone-500">
                <div>第 {currentPage}/{totalPages} 页，每页 {PAGE_SIZE} 条，共 {books.length} 条</div>
                <div className="flex gap-2">
                  <button
                    className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    type="button"
                  >
                    上一页
                  </button>
                  <button
                    className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    type="button"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 编辑/创建弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-stone-900">
                  {editingBook ? '编辑书单' : '新建书单'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 rounded-lg hover:bg-stone-100 text-stone-400"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E] mb-3">
                    标题
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E] mb-3">
                    作者
                  </label>
                  <input
                    type="text"
                    value={formData.author}
                    onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E] mb-3">
                    分类
                  </label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                    placeholder="如：教育、心理、成长..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E] mb-3">
                    描述
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={4}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none resize-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E] mb-3">
                    封面图片 URL
                  </label>
                  <input
                    type="url"
                    value={formData.coverImage}
                    onChange={(e) => setFormData({ ...formData, coverImage: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E] mb-3">
                    状态
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'draft' | 'published' })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                  >
                    <option value="draft">草稿</option>
                    <option value="published">发布</option>
                  </select>
                </div>
                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-3 rounded-xl border border-stone-200 text-stone-600 font-bold text-sm hover:bg-stone-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 rounded-xl bg-[#5e17eb] text-white font-bold text-sm hover:bg-[#5e17eb]/90 transition-colors"
                  >
                    保存
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBooksPage;
