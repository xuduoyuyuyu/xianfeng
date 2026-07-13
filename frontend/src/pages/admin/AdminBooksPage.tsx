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

type MetadataFormData = {
  title: string;
  author: string;
  publisher: string;
  isbn: string;
  cover: string;
  description: string;
  source: string;
  sourceId: string;
  rating: string;
  ratingCount: string;
  ratingLabel: string;
  reviewNote: string;
};

function createEmptyMetadataForm(): MetadataFormData {
  return {
    title: '',
    author: '',
    publisher: '',
    isbn: '',
    cover: '',
    description: '',
    source: '',
    sourceId: '',
    rating: '',
    ratingCount: '',
    ratingLabel: '',
    reviewNote: '',
  };
}

function toMetadataForm(book: Book | null): MetadataFormData {
  const detail = book?.metadataDetail || null;
  return {
    title: detail?.title || book?.title || '',
    author: detail?.author || book?.author || '',
    publisher: detail?.publisher || book?.publisher || '',
    isbn: detail?.isbn || book?.isbn || '',
    cover: detail?.cover || book?.metadataCover || book?.coverImage || '',
    description: detail?.description || book?.description || '',
    source: detail?.source || '',
    sourceId: detail?.sourceId || '',
    rating: detail?.rating === null || detail?.rating === undefined ? '' : String(detail.rating),
    ratingCount: detail?.ratingCount === null || detail?.ratingCount === undefined ? '' : String(detail.ratingCount),
    ratingLabel: detail?.ratingLabel || '',
    reviewNote: detail?.reviewNote || '',
  };
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

const AdminBooksPage: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [searchText, setSearchText] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
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
    isbn: '',
    publishedDate: '',
    grade: '',
    coverImage: '',
    recommendedGuest: '',
    sourceName: '',
    sourceGuestId: '',
    // 微信小店字段
    wxProductId: '',
    wxShopName: '',
    wxShopAppid: '',
    wxSalePrice: 0,
    wxMonthlySales: 0,
    wxShopScore: 0,
    wxHeadImgs: [] as string[],
    wxQrcodeUrl: '',
    wxPurchaseLink: '',
    status: 'draft' as 'draft' | 'published' | 'group-only',
  });
  const [metadataFormData, setMetadataFormData] = useState<MetadataFormData>(createEmptyMetadataForm);

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
      console.error('获取图书列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredBooks = useMemo(() => {
    if (!searchText.trim()) return books;
    const kw = searchText.trim().toLowerCase();
    return books.filter((b) =>
      (b.title || '').toLowerCase().includes(kw) ||
      (b.author || '').toLowerCase().includes(kw) ||
      (b.translator || '').toLowerCase().includes(kw) ||
      (b.publisher || '').toLowerCase().includes(kw) ||
      (b.isbn || '').toLowerCase().includes(kw) ||
      (b.recommendedGuest || '').toLowerCase().includes(kw) ||
      (b.sourceName || '').toLowerCase().includes(kw)
    );
  }, [books, searchText]);

  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / PAGE_SIZE));
  const pagedBooks = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredBooks.slice(start, start + PAGE_SIZE);
  }, [filteredBooks, currentPage]);

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
      isbn: '',
      publishedDate: '',
      grade: '',
      coverImage: '',
      recommendedGuest: '',
      sourceName: '',
      sourceGuestId: '',
      wxProductId: '',
      wxShopName: '',
      wxShopAppid: '',
      wxSalePrice: 0,
      wxMonthlySales: 0,
      wxShopScore: 0,
      wxHeadImgs: [],
      wxQrcodeUrl: '',
      wxPurchaseLink: '',
      status: 'draft',
    });
    setMetadataFormData(createEmptyMetadataForm());
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
      isbn: book.isbn || '',
      publishedDate: book.publishedDate || '',
      grade: book.grade || '',
      coverImage: book.coverImage,
      recommendedGuest: book.recommendedGuest || '',
      sourceName: book.sourceName || '',
      sourceGuestId: typeof book.sourceGuestId === 'string' ? book.sourceGuestId : (book.sourceGuestId?._id || ''),
      wxProductId: book.wxProductId || '',
      wxShopName: book.wxShopName || '',
      wxShopAppid: book.wxShopAppid || '',
      wxSalePrice: book.wxSalePrice || 0,
      wxMonthlySales: book.wxMonthlySales || 0,
      wxShopScore: book.wxShopScore || 0,
      wxHeadImgs: book.wxHeadImgs || [],
      wxQrcodeUrl: book.wxQrcodeUrl || '',
      wxPurchaseLink: book.wxPurchaseLink || '',
      status: book.status,
    });
    setMetadataFormData(toMetadataForm(book));
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBook) {
        await adminApi.updateBook(editingBook._id, formData);
        const metadataPayload = {
          title: metadataFormData.title.trim() || formData.title,
          author: metadataFormData.author.trim() || formData.author,
          publisher: metadataFormData.publisher.trim() || formData.publisher,
          isbn: metadataFormData.isbn.trim(),
          cover: metadataFormData.cover.trim() || formData.coverImage.trim(),
          description: metadataFormData.description.trim(),
          source: metadataFormData.source.trim(),
          sourceId: metadataFormData.sourceId.trim(),
          rating: parseOptionalNumber(metadataFormData.rating),
          ratingCount: parseOptionalNumber(metadataFormData.ratingCount),
          ratingLabel: metadataFormData.ratingLabel.trim(),
          reviewNote: metadataFormData.reviewNote.trim() || '后台编辑详情',
        };
        await adminApi.upsertBookMetadata(editingBook._id, metadataPayload);
      } else {
        await adminApi.createBook(formData);
      }
      setShowModal(false);
      await fetchBooks();
    } catch (error) {
      console.error('图书保存失败:', error);
      alert('图书保存失败，请重试');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这本图书吗？')) return;
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

  const handleCoverImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (coverUploading) return;
    setCoverUploading(true);
    try {
      const response = await adminApi.uploadAdminImage(file);
      if (!response.data.url) throw new Error('未返回图片 URL');
      setFormData((current) => ({ ...current, coverImage: response.data.url }));
      setMetadataFormData((current) => ({ ...current, cover: response.data.url }));
    } catch (error: any) {
      console.error('封面上传失败:', error);
      alert(error?.response?.data?.message || error?.message || '封面上传失败');
    } finally {
      setCoverUploading(false);
      event.target.value = '';
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
              if (!confirm(`确定清空全部 ${books.length} 本图书吗？此操作不可恢复。`)) return;
              try {
                const all = await adminApi.getBooks();
                const rows = Array.isArray(all.data) ? all.data : [];
                for (const row of rows) {
                  await adminApi.deleteBook(row._id);
                }
                await fetchBooks();
                alert(`已清空 ${rows.length} 本图书`);
              } catch (error) {
                console.error('清空图书失败:', error);
                alert('清空失败，请重试');
              }
            }}
            className="admin-pill-btn"
          >
            <span className="material-symbols-outlined text-base">delete_sweep</span>
            清空图书
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="admin-pill-btn admin-pill-btn-secondary"
          >
            <span className="material-symbols-outlined text-base">upload_file</span>
            导入图书
          </button>
          <button
            onClick={handleCreate}
            className="admin-pill-btn admin-pill-btn-primary"
          >
            <span className="material-symbols-outlined text-base">add_circle</span>
            新增图书
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#5e17eb]/10 rounded-xl flex items-center justify-center text-[#5e17eb]">
              <span className="material-symbols-outlined">menu_book</span>
            </div>
            <div>
              <p className="text-2xl font-black">{books.length}</p>
              <p className="text-xs text-stone-400">总图书数</p>
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

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex bg-stone-100 p-1.5 rounded-2xl">
          {(['all', 'published', 'draft'] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setSearchText(''); setCurrentPage(1); }}
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
        <div className="relative">
          <input
            className="w-64 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-900 caret-[#5e17eb] placeholder:text-stone-400"
            placeholder="搜索书名 / 作者 / 出版社 / ISBN …"
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
          />
          {searchText ? (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              onClick={() => { setSearchText(''); setCurrentPage(1); }}
              type="button"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          ) : (
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-base">search</span>
          )}
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
                  <th className="px-6 py-4">图书信息</th>
                  <th className="px-6 py-4">著作者</th>
                  <th className="px-6 py-4">出版社/年级</th>
                  <th className="px-6 py-4">微信小店</th>
                  <th className="px-6 py-4">出处</th>
                  <th className="px-6 py-4">质量评分</th>
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
                          src={book.coverImage ? `/api/books/proxy-image?url=${encodeURIComponent(book.coverImage)}` : 'https://via.placeholder.com/48x48/630ed4/ffffff?text=B'}
                          alt={book.title}
                          className="w-12 h-12 rounded-xl object-cover"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                        <div>
                          <div className="font-bold text-stone-900">{book.title}</div>
                          <div className="text-xs text-stone-400 line-clamp-1 max-w-xs">
                            {(book.topic || '-')} / {(book.translator || '-')}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {book.metadataStatus ? (
                              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-black text-[#5e17eb]">
                                详情已采纳
                              </span>
                            ) : (
                              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-black text-stone-400">无详情</span>
                            )}
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
                    <td className="px-6 py-4 align-top">
                      {book.qualityScore ? (
                        <details className="group min-w-36">
                          <summary className="cursor-pointer list-none">
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-black ${
                                book.qualityScore.tier === 'fallback_cover'
                                  ? 'bg-red-50 text-red-700'
                                  : book.qualityScore.tier === 'missing_description'
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-emerald-50 text-emerald-700'
                              }`}>
                                {book.qualityScore.totalScore} / 100
                              </span>
                              <span className="text-[10px] font-bold text-stone-500">{book.qualityScore.level}</span>
                            </div>
                          </summary>
                          <div className="mt-2 w-72 rounded-xl border border-stone-200 bg-white p-3 text-[11px] leading-5 text-stone-600 shadow-lg">
                            <div className="font-bold text-stone-700">
                              内容 {book.qualityScore.contentScore} · 置信 {book.qualityScore.confidenceScore} · 原始 {book.qualityScore.rawScore}
                            </div>
                            {book.qualityScore.reasons.length ? (
                              <ul className="mt-1 list-disc pl-4">
                                {book.qualityScore.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                              </ul>
                            ) : (
                              <div className="mt-1 text-emerald-700">字段完整，无扣分项</div>
                            )}
                          </div>
                        </details>
                      ) : (
                        <span className="text-xs text-stone-400">-</span>
                      )}
                    </td>
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
                <p>暂无图书</p>
              </div>
            )}
            {books.length > 0 && (
              <div className="flex items-center justify-between border-t border-stone-100 px-6 py-4 text-sm text-stone-500">
                <div>第 {currentPage}/{totalPages} 页，每页 {PAGE_SIZE} 条，共 {filteredBooks.length} 条{searchText.trim() ? `（搜索"${searchText.trim()}"）` : ''}</div>
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
                <h2 className="text-2xl font-black text-stone-900">导入图书</h2>
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
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-stone-900">
                  {editingBook ? '编辑图书' : '新建图书'}
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E] mb-3">
                      ISBN
                    </label>
                    <input
                      type="text"
                      value={formData.isbn}
                      onChange={(e) => setFormData({ ...formData, isbn: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                      placeholder="978-7-xxx-xxxxx-x"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E] mb-3">
                      出版日期
                    </label>
                    <input
                      type="text"
                      value={formData.publishedDate}
                      onChange={(e) => setFormData({ ...formData, publishedDate: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                      placeholder="2020-06"
                    />
                  </div>
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
                    封面配图
                  </label>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4">
                    <div className="flex items-center gap-4">
                      {formData.coverImage ? (
                        <img
                          src={formData.coverImage}
                          alt="封面预览"
                          className="h-20 w-16 shrink-0 rounded-xl border border-stone-200 bg-white object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white text-stone-300">
                          <span className="material-symbols-outlined">menu_book</span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white transition ${coverUploading ? 'bg-[#5e17eb] opacity-60' : 'bg-[#5e17eb] hover:bg-[#4a12c0]'}`}>
                            <span className="material-symbols-outlined text-base">upload_file</span>
                            {coverUploading ? '上传中...' : '上传封面'}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={coverUploading}
                              onChange={handleCoverImageUpload}
                            />
                          </label>
                          {formData.coverImage ? (
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, coverImage: '' })}
                              className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold text-stone-500 hover:bg-white hover:text-red-500"
                              disabled={coverUploading}
                            >
                              移除封面
                            </button>
                          ) : null}
                        </div>
                        <input
                          type="url"
                          value={formData.coverImage}
                          onChange={(e) => setFormData({ ...formData, coverImage: e.target.value })}
                          className="w-full bg-white border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                          placeholder="或手动填入封面图片 URL"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#E88B2C] mb-3">
                    📚 图书来源 (sourceName)
                  </label>
                  <input
                    type="text"
                    value={formData.sourceName}
                    onChange={(e) => setFormData({ ...formData, sourceName: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                    placeholder="如：重庆南明新学道1-6年级书梯"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#E88B2C] mb-3">
                    🔗 绑定嘉宾 ID (sourceGuestId)
                  </label>
                  <input
                    type="text"
                    value={formData.sourceGuestId}
                    onChange={(e) => setFormData({ ...formData, sourceGuestId: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                    placeholder="如：6a0271567598bae86f44babc"
                  />
                </div>
                <div className="border-t border-violet-100 pt-4">
                  <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5e17eb] mb-2">
                    图书详情内容
                  </label>
                  <p className="text-xs text-stone-400">
                    这里维护前台图书详情页使用的简介、封面、评分和数据来源。
                  </p>
                </div>
                {editingBook ? (
                    <div className="space-y-4 rounded-2xl border border-violet-100 bg-violet-50/30 p-4">
                      {!editingBook.metadataDetail && !editingBook.metadataId ? (
                        <div className="rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-bold text-[#5e17eb]">
                          暂无详情记录，保存后将自动创建图书详情。
                        </div>
                      ) : null}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-medium text-stone-500 mb-1">详情标题</label>
                          <input
                            type="text"
                            value={metadataFormData.title}
                            onChange={(e) => setMetadataFormData({ ...metadataFormData, title: e.target.value })}
                            className="w-full bg-white border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-stone-500 mb-1">详情作者</label>
                          <input
                            type="text"
                            value={metadataFormData.author}
                            onChange={(e) => setMetadataFormData({ ...metadataFormData, author: e.target.value })}
                            className="w-full bg-white border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-stone-500 mb-1">详情出版社</label>
                          <input
                            type="text"
                            value={metadataFormData.publisher}
                            onChange={(e) => setMetadataFormData({ ...metadataFormData, publisher: e.target.value })}
                            className="w-full bg-white border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-stone-500 mb-1">详情 ISBN</label>
                          <input
                            type="text"
                            value={metadataFormData.isbn}
                            onChange={(e) => setMetadataFormData({ ...metadataFormData, isbn: e.target.value })}
                            className="w-full bg-white border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-stone-500 mb-1">详情封面 URL</label>
                        <input
                          type="url"
                          value={metadataFormData.cover}
                          onChange={(e) => setMetadataFormData({ ...metadataFormData, cover: e.target.value })}
                          className="w-full bg-white border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                          placeholder="https://..."
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-stone-500 mb-1">内容简介</label>
                        <textarea
                          value={metadataFormData.description}
                          onChange={(e) => setMetadataFormData({ ...metadataFormData, description: e.target.value })}
                          className="min-h-32 w-full resize-y bg-white border border-stone-200 rounded-xl py-2.5 px-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                          placeholder="前台图书详情页展示的内容简介"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[11px] font-medium text-stone-500 mb-1">评分</label>
                          <input
                            type="number"
                            value={metadataFormData.rating}
                            onChange={(e) => setMetadataFormData({ ...metadataFormData, rating: e.target.value })}
                            className="w-full bg-white border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                            placeholder="如：8.9"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-stone-500 mb-1">评价人数</label>
                          <input
                            type="number"
                            value={metadataFormData.ratingCount}
                            onChange={(e) => setMetadataFormData({ ...metadataFormData, ratingCount: e.target.value })}
                            className="w-full bg-white border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                            placeholder="如：146"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-stone-500 mb-1">评分文案</label>
                          <input
                            type="text"
                            value={metadataFormData.ratingLabel}
                            onChange={(e) => setMetadataFormData({ ...metadataFormData, ratingLabel: e.target.value })}
                            className="w-full bg-white border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                            placeholder="如：神作"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-medium text-stone-500 mb-1">数据来源</label>
                          <input
                            type="text"
                            value={metadataFormData.source}
                            onChange={(e) => setMetadataFormData({ ...metadataFormData, source: e.target.value })}
                            className="w-full bg-white border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                            placeholder="如：weread_web"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-stone-500 mb-1">来源 ID</label>
                          <input
                            type="text"
                            value={metadataFormData.sourceId}
                            onChange={(e) => setMetadataFormData({ ...metadataFormData, sourceId: e.target.value })}
                            className="w-full bg-white border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-stone-500 mb-1">编辑备注</label>
                        <input
                          type="text"
                          value={metadataFormData.reviewNote}
                          onChange={(e) => setMetadataFormData({ ...metadataFormData, reviewNote: e.target.value })}
                          className="w-full bg-white border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                          placeholder="如：后台编辑详情"
                        />
                      </div>
                    </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-500">
                    新建图书后，详情内容会在匹配或导入后进入这里维护。
                  </div>
                )}
                {/* ===== 微信小店字段 ===== */}
                <div className="border-t border-[#fce4c8] pt-4">
                  <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#E88B2C] mb-3">
                    🛒 微信小店字段
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-medium text-stone-500 mb-1">商品 ID</label>
                    <input
                      type="text"
                      value={formData.wxProductId}
                      onChange={(e) => setFormData({ ...formData, wxProductId: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                      placeholder="10000795479475"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-500 mb-1">店铺名称</label>
                    <input
                      type="text"
                      value={formData.wxShopName}
                      onChange={(e) => setFormData({ ...formData, wxShopName: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                      placeholder="顺峰书馆"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-500 mb-1">店铺 Appid</label>
                    <input
                      type="text"
                      value={formData.wxShopAppid}
                      onChange={(e) => setFormData({ ...formData, wxShopAppid: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                      placeholder="wxc78e4b72f7bec385"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-500 mb-1">售价 (分)</label>
                    <input
                      type="number"
                      value={formData.wxSalePrice}
                      onChange={(e) => setFormData({ ...formData, wxSalePrice: Number(e.target.value) })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                      placeholder="8000"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-500 mb-1">月销量</label>
                    <input
                      type="number"
                      value={formData.wxMonthlySales}
                      onChange={(e) => setFormData({ ...formData, wxMonthlySales: Number(e.target.value) })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-500 mb-1">店铺评分</label>
                    <input
                      type="number"
                      value={formData.wxShopScore}
                      onChange={(e) => setFormData({ ...formData, wxShopScore: Number(e.target.value) })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-stone-500 mb-1">购买二维码</label>
                  <div className="flex gap-2 items-center mb-1.5">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-[#5e17eb] px-3 py-2 text-xs font-bold text-white hover:bg-[#4a12c0] transition">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      上传二维码
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const fd = new FormData();
                        fd.append('file', file);
                        try {
                          const token = localStorage.getItem('token');
                          const res = await fetch('/api/admin/upload', { method: 'POST', body: fd, headers: token ? { Authorization: `Bearer ${token}` } : {} });
                          const data = await res.json();
                          if (data.url) setFormData({ ...formData, wxQrcodeUrl: data.url });
                        } catch (err) { console.error('上传失败', err); }
                      }} />
                    </label>
                    {formData.wxQrcodeUrl ? (
                      <>
                        <img src={formData.wxQrcodeUrl} alt="二维码预览" className="h-10 w-10 rounded-lg object-cover border border-stone-200" />
                        <button type="button" onClick={() => setFormData({ ...formData, wxQrcodeUrl: '' })} className="text-[10px] text-red-400 hover:text-red-600">移除</button>
                      </>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={formData.wxQrcodeUrl}
                      onChange={(e) => setFormData({ ...formData, wxQrcodeUrl: e.target.value })}
                      className="flex-1 bg-stone-50 border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                      placeholder="或手动填入二维码图片URL"
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-stone-400">从微信小店后台「商品管理 → 下载二维码」保存后上传，或粘贴图片URL</p>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-stone-500 mb-1">购买短链</label>
                  <input
                    type="text"
                    value={formData.wxPurchaseLink}
                    onChange={(e) => setFormData({ ...formData, wxPurchaseLink: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[#5e17eb]/10 focus:border-[#5e17eb]"
                    placeholder="#小程序://快团团/点击查看/pprMtoZCLfpeMFl"
                  />
                  <p className="mt-1 text-[10px] text-stone-400">可选；手动创建图书时填写，有短链的小程序商品可用于图片或按钮点击跳转购买。</p>
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-[0.15em] text-[#5E8B8E] mb-3">
                    状态
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'draft' | 'published' | 'group-only' })}
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
                    disabled={coverUploading}
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
