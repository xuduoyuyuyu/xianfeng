import React, { useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { adminApi, Book, Guest } from '../../services/api';

const PAGE_SIZE = 20;

type ImportRow = Record<string, any>;

function unwrapImportRow(input: any): ImportRow {
  if (!input || typeof input !== 'object') return {};
  const row = input as Record<string, any>;
  if (row.fields && typeof row.fields === 'object' && !Array.isArray(row.fields)) return row.fields as ImportRow;
  if (row.data && typeof row.data === 'object' && !Array.isArray(row.data)) return row.data as ImportRow;
  const keys = Object.keys(row);
  if (keys.length === 1) {
    const only = row[keys[0]];
    if (only && typeof only === 'object' && !Array.isArray(only)) return only as ImportRow;
  }
  return row;
}

function pickLooseValue(row: ImportRow, keys: string[]): string {
  const normalized = new Map<string, any>();
  Object.entries(row || {}).forEach(([k, v]) => {
    const nk = String(k || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_\-:：]/g, '');
    normalized.set(nk, v);
  });
  for (const key of keys) {
    const direct = row?.[key];
    if (direct !== undefined && direct !== null && String(direct).trim()) return String(direct).trim();
    const nk = String(key || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_\-:：]/g, '');
    const byNormalized = normalized.get(nk);
    if (byNormalized !== undefined && byNormalized !== null && String(byNormalized).trim()) return String(byNormalized).trim();
  }
  return '';
}

function inferFromFirstStringColumns(row: ImportRow): { title: string; author: string } {
  const values = Object.values(row || {})
    .map((v) => (v === undefined || v === null ? '' : String(v).trim()))
    .filter((v) => v.length > 0);
  return {
    title: values[0] || '',
    author: values[1] || '',
  };
}

const AdminBooksPage: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importSourceName, setImportSourceName] = useState('');
  const [importGuestId, setImportGuestId] = useState('');
  const [importOverwrite, setImportOverwrite] = useState(false);
  const [importing, setImporting] = useState(false);
  const [formData, setFormData] = useState({
    categoryLabel: '',
    topic: '',
    title: '',
    author: '',
    translator: '',
    publisher: '',
    grade: '',
    coverImage: '',
    recommendedGuest: '',
    status: 'draft' as 'draft' | 'published',
  });

  useEffect(() => {
    fetchBooks();
  }, [filter]);

  useEffect(() => {
    fetchGuests();
  }, []);

  const fetchGuests = async () => {
    try {
      const response = await adminApi.getGuests({ status: 'active' });
      setGuests(response.data || []);
    } catch (error) {
      console.error('获取嘉宾列表失败:', error);
    }
  };

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
    setFormData({
      categoryLabel: '',
      topic: '',
      title: '',
      author: '',
      translator: '',
      publisher: '',
      grade: '',
      coverImage: '',
      recommendedGuest: '',
      status: 'draft',
    });
    setShowModal(true);
  };

  const handleEdit = (book: Book) => {
    setEditingBook(book);
    setFormData({
      categoryLabel: book.categoryLabel || '',
      topic: book.topic || '',
      title: book.title,
      author: book.author,
      translator: book.translator || '',
      publisher: book.publisher || '',
      grade: book.grade || '',
      coverImage: book.coverImage,
      recommendedGuest: book.recommendedGuest || '',
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

  const parseJsonFile = async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text);
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(data?.rows)
      ? data.rows
      : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.list)
      ? data.list
      : null;
    if (rows) return rows.map((item: any) => unwrapImportRow(item));
    throw new Error('JSON 格式不正确，需为数组或 { rows: [] }');
  };

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseJsonFile(file);
      setImportRows(rows);
      setImportFileName(file.name);
    } catch (error) {
      console.error('解析 JSON 失败:', error);
      alert('解析 JSON 失败，请确认文件格式为 .json，且内容是数组或 { rows: [] }');
    }
  };

  const handleImportSubmit = async () => {
    if (!importRows.length) {
      alert('请先选择要导入的 JSON 文件');
      return;
    }
    try {
      setImporting(true);
      const chunkSize = 50;
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let fallbackUsed = false;
      const existingResponse = await adminApi.getBooks();
      const existingBooks = Array.isArray(existingResponse.data) ? existingResponse.data : [];
      const byTitle = new Map(existingBooks.map((item) => [String(item.title || '').trim(), item]));
      for (let i = 0; i < importRows.length; i += chunkSize) {
        const chunk = importRows.slice(i, i + chunkSize);
        try {
          const response = await adminApi.importBooks({
            rows: chunk,
            sourceName: importSourceName,
            sourceGuestId: importGuestId || undefined,
            overwrite: importOverwrite,
          });
          const data = response.data;
          created += Number(data?.created || 0);
          updated += Number(data?.updated || 0);
          skipped += Number(data?.skipped || 0);
        } catch (error) {
          const err = error as AxiosError<any>;
          const raw = typeof err.response?.data === 'string' ? err.response?.data : '';
          const cannotPostImport = err.response?.status === 404 && raw.includes('Cannot POST /api/admin/books/import');
          if (!cannotPostImport) throw error;
          fallbackUsed = true;
          for (const row of chunk) {
            const normalizedRow = unwrapImportRow(row);
            let title = pickLooseValue(normalizedRow, ['title', '书名', '图书名称', '名称', 'name', 'bookName', 'bookTitle', '推荐书目', '书籍']);
            let author = pickLooseValue(normalizedRow, ['author', '作者', 'Author', '作者姓名', '主编', '编著', '推荐人']);
            if (!title || !author) {
              const inferred = inferFromFirstStringColumns(normalizedRow);
              title = title || inferred.title;
              author = author || inferred.author;
            }
            if (!title || !author) {
              skipped += 1;
              continue;
            }
            const payload = {
              categoryLabel: pickLooseValue(normalizedRow, ['类别', 'categoryLabel', 'category', '分类']),
              topic: pickLooseValue(normalizedRow, ['主题', 'topic', '标签']),
              title,
              author,
              translator: pickLooseValue(normalizedRow, ['译者', 'translator']),
              publisher: pickLooseValue(normalizedRow, ['出版社', 'publisher']),
              grade: pickLooseValue(normalizedRow, ['年级', 'grade']),
              coverImage: pickLooseValue(normalizedRow, ['coverImage', '封面', '封面图', '图片', 'cover']) || 'https://via.placeholder.com/240x320/630ed4/ffffff?text=Book',
              recommendedGuest: pickLooseValue(normalizedRow, ['推荐嘉宾', 'recommendedGuest']) || (guests.find((g) => g._id === importGuestId)?.name || ''),
              status: 'draft' as const,
              sourceName: importSourceName,
              sourceGuestId: importGuestId || undefined,
            };
            const exists = byTitle.get(title);
            try {
              if (exists?._id) {
                if (!importOverwrite) {
                  skipped += 1;
                  continue;
                }
                await adminApi.updateBook(exists._id, payload);
                updated += 1;
              } else {
                const createdRow = await adminApi.createBook(payload);
                if (createdRow?.data) byTitle.set(title, createdRow.data);
                created += 1;
              }
            } catch (_e) {
              skipped += 1;
            }
          }
        }
      }
      alert(`导入完成：新增 ${created}，更新 ${updated}，跳过 ${skipped}${fallbackUsed ? '（已自动兼容旧后端）' : ''}`);
      setShowImportModal(false);
      setImportRows([]);
      setImportFileName('');
      setImportSourceName('');
      setImportGuestId('');
      setImportOverwrite(false);
      fetchBooks();
    } catch (error) {
      console.error('导入失败:', error);
      const err = error as AxiosError<any>;
      const serverMessage = err.response?.data?.message || '';
      const detail = (() => {
        const raw = err.response?.data?.error;
        if (!raw) return '';
        if (typeof raw === 'string') return raw;
        if (typeof (raw as any)?.message === 'string') return (raw as any).message;
        return '';
      })();
      const rawText = (() => {
        const data = err.response?.data;
        if (typeof data === 'string') return data.slice(0, 200);
        return '';
      })();
      if (!err.response) {
        alert(`导入失败：${err.message || '请求超时或网络异常'}`);
      } else {
        const msg = serverMessage || detail || rawText || `HTTP ${err.response.status}`;
        alert(`导入失败：${msg}`);
      }
    } finally {
      setImporting(false);
    }
  };

  const renderSourceGuest = (book: Book) => {
    const v = book.sourceGuestId;
    if (!v) return '-';
    if (typeof v === 'string') return v;
    return v.name || v._id;
  };

  return (
    <div className="space-y-8">
      <div className="admin-toolbar">
        <div />
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              const wxCount = books.filter(b => b.coverImage && /wxapp\.tc\.qq\.com|store\.mp\.video\.tencent-cloud/.test(b.coverImage) && b.status === 'draft').length;
              if (wxCount === 0) { alert('没有封面正确且处于草稿状态的书'); return; }
              if (!confirm(`确定批量发布 ${wxCount} 本封面正确的草稿书吗？`)) return;
              try {
                const res = await adminApi.batchPublishBooks({ filter: 'with_wx_cover' });
                await fetchBooks();
                alert(`批量发布完成：${res.data.modified} 本已发布`);
              } catch (error) {
                console.error('批量发布失败:', error);
                alert('批量发布失败');
              }
            }}
            className="admin-pill-btn admin-pill-btn-secondary"
          >
            <span className="material-symbols-outlined text-base">rocket_launch</span>
            批量发布封面正确的书
          </button>
          <button
            onClick={async () => {
              if (!confirm(`确定清空全部 ${books.length} 条书单吗？此操作不可恢复。`)) return;
              try {
                const all = await adminApi.getBooks();
                const rows = Array.isArray(all.data) ? all.data : [];
                for (const row of rows) {
                  await adminApi.deleteBook(row._id);
                }
                await fetchBooks();
                alert(`已清空 ${rows.length} 条书单`);
              } catch (error) {
                console.error('清空书单失败:', error);
                alert('清空失败，请重试');
              }
            }}
            className="admin-pill-btn"
          >
            <span className="material-symbols-outlined text-base">delete_sweep</span>
            清空书单
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="admin-pill-btn admin-pill-btn-secondary"
          >
            <span className="material-symbols-outlined text-base">upload_file</span>
            导入书单
          </button>
          <button
            onClick={handleCreate}
            className="admin-pill-btn admin-pill-btn-primary"
          >
            <span className="material-symbols-outlined text-base">add_circle</span>
            新增书单
          </button>
        </div>
      </div>

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
                  <th className="px-6 py-4">著作者</th>
                  <th className="px-6 py-4">出版社/年级</th>
                  <th className="px-6 py-4">微信小店</th>
                  <th className="px-6 py-4">出处</th>
                  <th className="px-6 py-4">绑定嘉宾</th>
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
                          <div className="text-xs text-stone-400 line-clamp-1 max-w-xs">
                            {(book.topic || '-')} / {(book.translator || '-')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">{book.author}</td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded-full bg-stone-100 text-stone-600 text-xs font-bold">
                        {[book.publisher || '-', book.grade || '-'].join(' / ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {book.wxShopName ? (
                        <div className="flex items-center gap-2">
                          {book.wxHeadImgs?.[0] ? (
                            <img src={book.wxHeadImgs[0]} alt="" className="w-8 h-8 rounded-lg object-cover" />
                          ) : null}
                          <div>
                            <div className="text-xs font-bold text-stone-700">{book.wxShopName}</div>
                            <div className="text-[10px] text-stone-400">
                              {book.wxSalePrice ? `¥${(book.wxSalePrice / 100).toFixed(1)}` : ''}
                              {book.wxMonthlySales !== undefined && book.wxMonthlySales !== null ? ` · 月销${book.wxMonthlySales === 0 ? '<10' : book.wxMonthlySales >= 1000 ? `${Math.floor(book.wxMonthlySales/100)/10}k` : book.wxMonthlySales}` : ''}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-stone-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">{book.sourceName || '-'}</td>
                    <td className="px-6 py-4 text-sm text-stone-600">{renderSourceGuest(book)}</td>
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

      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-8 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black text-stone-900">导入书单</h2>
                <button onClick={() => setShowImportModal(false)} className="p-2 rounded-lg hover:bg-stone-100 text-stone-400">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E] mb-3">JSON 文件</label>
                <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4 space-y-3">
                  <p className="text-sm text-stone-600">支持 JSON 数组或 `{"{ rows: [...] }"}` 结构。</p>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex cursor-pointer items-center rounded-xl bg-[#5e17eb] px-4 py-2 text-sm font-black text-white hover:bg-[#5e17eb]/90 transition-colors">
                      选择文件
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={handleImportFileChange}
                        className="hidden"
                      />
                    </label>
                    <span className="text-sm text-stone-700">{importFileName || '未选择任何文件'}</span>
                  </div>
                  <p className="text-sm font-bold text-stone-800">已解析 {importRows.length} 条</p>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E] mb-3">出处</label>
                <input
                  type="text"
                  value={importSourceName}
                  onChange={(e) => setImportSourceName(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                  placeholder="例如：重庆南明新学道 1-6 年级书梯"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E] mb-3">绑定嘉宾（可选）</label>
                <select
                  value={importGuestId}
                  onChange={(e) => setImportGuestId(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                >
                  <option value="">不绑定</option>
                  {guests.map((guest) => (
                    <option key={guest._id} value={guest._id}>
                      {guest.name}{guest.title ? ` / ${guest.title}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-stone-600">
                <input type="checkbox" checked={importOverwrite} onChange={(e) => setImportOverwrite(e.target.checked)} />
                遇到同名书籍时覆盖更新
              </label>
              <div className="flex gap-4 pt-3">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="flex-1 py-3 rounded-xl border border-stone-200 text-stone-600 font-bold text-sm hover:bg-stone-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={importing}
                  className="flex-1 py-3 rounded-xl bg-[#5e17eb] text-white font-bold text-sm hover:bg-[#5e17eb]/90 transition-colors disabled:opacity-60"
                >
                  {importing ? '导入中...' : '开始导入'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                    书名
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
                    类别
                  </label>
                  <input
                    type="text"
                    value={formData.categoryLabel}
                    onChange={(e) => setFormData({ ...formData, categoryLabel: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                    placeholder="如：科普、文学..."
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E] mb-3">
                    主题
                  </label>
                  <input
                    type="text"
                    value={formData.topic}
                    onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                    placeholder="如：成长、习惯养成..."
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E] mb-3">
                    著作者
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
                    译者
                  </label>
                  <input
                    type="text"
                    value={formData.translator}
                    onChange={(e) => setFormData({ ...formData, translator: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                    placeholder="如：张三"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E] mb-3">
                    出版社
                  </label>
                  <input
                    type="text"
                    value={formData.publisher}
                    onChange={(e) => setFormData({ ...formData, publisher: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                    placeholder="如：人民教育出版社"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E] mb-3">
                    年级
                  </label>
                  <input
                    type="text"
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                    placeholder="如：一年级"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E] mb-3">
                    推荐嘉宾
                  </label>
                  <input
                    type="text"
                    value={formData.recommendedGuest}
                    onChange={(e) => setFormData({ ...formData, recommendedGuest: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                    placeholder="如：魏志渊"
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
