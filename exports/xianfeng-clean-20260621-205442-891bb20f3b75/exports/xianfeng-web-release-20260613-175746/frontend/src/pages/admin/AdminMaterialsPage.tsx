import React, { useEffect, useMemo, useState } from 'react';
import { adminApi, LearningMaterial } from '../../services/api';
const PAGE_SIZE = 20;

type CsvMaterialRow = {
  title: string;
  fileUrl: string;
  grade: string;
  subject: string;
  stage: string;
  category: string;
  description: string;
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((value) => value.trim());
}

function parseMaterialsCsv(text: string): CsvMaterialRow[] {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];

  const rows: CsvMaterialRow[] = [];
  for (const line of lines.slice(1)) {
    const [name, url, grade, subject, stage, keycat] = parseCsvLine(line);
    if (!name || !url) continue;
    rows.push({
      title: name,
      fileUrl: url,
      grade: grade || '',
      subject: subject || '',
      stage: stage || '',
      category: keycat || '其他',
      description: `阶段: ${stage || '未标注'} | 年级: ${grade || '未标注'} | 学科: ${subject || '未标注'}`,
    });
  }
  return rows;
}

const AdminMaterialsPage: React.FC = () => {
  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<LearningMaterial | null>(null);
  const [importRows, setImportRows] = useState<CsvMaterialRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; failed: number } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    fileUrl: '',
    category: '',
    status: 'draft' as 'draft' | 'published' | 'group-only',
  });

  useEffect(() => {
    fetchMaterials();
  }, [filter]);

  const fetchMaterials = async () => {
    try {
      const status = filter === 'all' ? undefined : filter;
      const response = await adminApi.getMaterials(status);
      setMaterials(response.data);
      setCurrentPage(1);
    } catch (error) {
      console.error('获取学习资料列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(materials.length / PAGE_SIZE));
  const pagedMaterials = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return materials.slice(start, start + PAGE_SIZE);
  }, [materials, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handleCreate = () => {
    setEditingMaterial(null);
    setFormData({ title: '', description: '', fileUrl: '', category: '', status: 'draft' });
    setShowModal(true);
  };

  const handleEdit = (material: LearningMaterial) => {
    setEditingMaterial(material);
    setFormData({
      title: material.title,
      description: material.description,
      fileUrl: material.fileUrl,
      category: material.category,
      status: material.status,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingMaterial) {
        await adminApi.updateMaterial(editingMaterial._id, formData);
      } else {
        await adminApi.createMaterial(formData);
      }
      setShowModal(false);
      fetchMaterials();
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个学习资料吗？')) return;
    try {
      await adminApi.deleteMaterial(id);
      fetchMaterials();
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败');
    }
  };

  const handleToggleStatus = async (material: LearningMaterial) => {
    const newStatus = material.status === 'published' ? 'draft' : 'published';
    try {
      await adminApi.updateMaterialStatus(material._id, newStatus);
      fetchMaterials();
    } catch (error) {
      console.error('状态更新失败:', error);
      alert('状态更新失败');
    }
  };

  const handleOpenImport = () => {
    setImportRows([]);
    setImportFileName('');
    setImportResult(null);
    setShowImportModal(true);
  };

  const handlePickCsvFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setImportFileName(file.name);
    try {
      const raw = await file.text();
      const parsed = parseMaterialsCsv(raw);
      setImportRows(parsed);
      if (parsed.length === 0) {
        alert('CSV 未解析到有效数据（需包含 名称 和 链接 列）');
      }
    } catch (error) {
      console.error('解析 CSV 失败:', error);
      alert('解析 CSV 失败，请检查文件编码和格式');
    }
  };

  const handleImportRows = async () => {
    if (importRows.length === 0) {
      alert('请先选择并解析 CSV 文件');
      return;
    }

    setImporting(true);
    setImportResult(null);
    let created = 0;
    let updated = 0;
    let failed = 0;

    try {
      const existingResponse = await adminApi.getMaterials();
      const existing = Array.isArray(existingResponse.data) ? existingResponse.data : [];
      const titleToMaterial = new Map(existing.map((item) => [String(item.title || '').trim(), item]));

      for (const row of importRows) {
        const payload = {
          title: row.title,
          fileUrl: row.fileUrl,
          category: row.category,
          description: row.description,
          status: 'published' as const,
        };
        try {
          const match = titleToMaterial.get(row.title);
          if (match?._id) {
            await adminApi.updateMaterial(match._id, payload);
            updated += 1;
          } else {
            const response = await adminApi.createMaterial(payload);
            created += 1;
            if (response?.data?._id) {
              titleToMaterial.set(row.title, response.data);
            }
          }
        } catch (error) {
          console.error('导入行失败:', row.title, error);
          failed += 1;
        }
      }

      setImportResult({ created, updated, failed });
      await fetchMaterials();
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="admin-toolbar">
        <div />
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenImport}
            className="admin-pill-btn admin-pill-btn-secondary"
          >
            <span className="material-symbols-outlined text-base">upload_file</span>
            CSV导入
          </button>
          <button
            onClick={handleCreate}
            className="admin-pill-btn admin-pill-btn-primary"
          >
            <span className="material-symbols-outlined text-base">add_circle</span>
            新增资料
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#5e17eb]/10 rounded-xl flex items-center justify-center text-[#5e17eb]">
              <span className="material-symbols-outlined">school</span>
            </div>
            <div>
              <p className="text-2xl font-black">{materials.length}</p>
              <p className="text-xs text-stone-400">总资料数</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
              <span className="material-symbols-outlined">check_circle</span>
            </div>
            <div>
              <p className="text-2xl font-black">{materials.filter(m => m.status === 'published').length}</p>
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
              <p className="text-2xl font-black">{materials.filter(m => m.status === 'draft').length}</p>
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
                  <th className="px-6 py-4">资料信息</th>
                  <th className="px-6 py-4">分类</th>
                  <th className="px-6 py-4">状态</th>
                  <th className="px-6 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {pagedMaterials.map((material) => (
                  <tr key={material._id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#5e17eb]/10 rounded-xl flex items-center justify-center text-[#5e17eb]">
                          <span className="material-symbols-outlined">description</span>
                        </div>
                        <div>
                          <div className="font-bold text-stone-900">{material.title}</div>
                          <div className="text-xs text-stone-400 line-clamp-1 max-w-xs">{material.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded-full bg-stone-100 text-stone-600 text-xs font-bold">
                        {material.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleStatus(material)}
                        className={`px-3 py-1 rounded-full text-[10px] font-black transition-colors ${
                          material.status === 'published'
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                        }`}
                      >
                        {material.status === 'published' ? '已发布' : '草稿'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={material.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-[#5e17eb] transition-colors"
                        >
                          <span className="material-symbols-outlined">open_in_new</span>
                        </a>
                        <button
                          onClick={() => handleEdit(material)}
                          className="p-2 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-[#5e17eb] transition-colors"
                        >
                          <span className="material-symbols-outlined">edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(material._id)}
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
            {materials.length === 0 && (
              <div className="text-center py-16 text-stone-400">
                <span className="material-symbols-outlined text-6xl mb-4">inbox</span>
                <p>暂无学习资料</p>
              </div>
            )}
            {materials.length > 0 && (
              <div className="flex items-center justify-between border-t border-stone-100 px-6 py-4 text-sm text-stone-500">
                <div>第 {currentPage}/{totalPages} 页，每页 {PAGE_SIZE} 条，共 {materials.length} 条</div>
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
                  {editingMaterial ? '编辑资料' : '新建资料'}
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
                    分类
                  </label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                    placeholder="如：课程、文档、视频..."
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
                    文件链接 URL
                  </label>
                  <input
                    type="url"
                    value={formData.fileUrl}
                    onChange={(e) => setFormData({ ...formData, fileUrl: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-3 px-4 text-sm focus:ring-4 focus:ring-[#5e17eb]/5 focus:border-[#5e17eb] outline-none"
                    placeholder="https://..."
                    required
                  />
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

      {/* CSV 导入弹窗 */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white">
            <div className="p-8">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-black text-stone-900">CSV 批量导入学习资料</h2>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="rounded-lg p-2 text-stone-400 hover:bg-stone-100"
                  type="button"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="space-y-4 rounded-2xl border border-stone-200 bg-stone-50 p-5">
                <p className="text-sm text-stone-600">
                  支持字段顺序：名称, 链接, 年级, 学科, 阶段, 关键分类。导入时默认设为「已发布」。
                </p>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handlePickCsvFile}
                  className="block w-full text-sm text-stone-700 file:mr-3 file:rounded-xl file:border-0 file:bg-[#5e17eb] file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-[#4c12c3]"
                />
                {importFileName ? (
                  <p className="text-xs text-stone-500">已选择：{importFileName}</p>
                ) : null}
                <p className="text-sm font-bold text-stone-800">已解析 {importRows.length} 条</p>
              </div>

              {importRows.length > 0 ? (
                <div className="mt-5 overflow-hidden rounded-2xl border border-stone-100">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-left">
                      <thead className="bg-stone-50 text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">
                        <tr>
                          <th className="px-4 py-3">标题</th>
                          <th className="px-4 py-3">阶段/年级/学科</th>
                          <th className="px-4 py-3">分类</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 bg-white text-sm">
                        {importRows.slice(0, 30).map((row, idx) => (
                          <tr key={`${row.title}-${idx}`}>
                            <td className="px-4 py-3 text-stone-800">{row.title}</td>
                            <td className="px-4 py-3 text-stone-500">{`${row.stage || '-'} / ${row.grade || '-'} / ${row.subject || '-'}`}</td>
                            <td className="px-4 py-3 text-stone-500">{row.category}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importRows.length > 30 ? (
                    <div className="border-t border-stone-100 bg-stone-50 px-4 py-2 text-xs text-stone-500">
                      仅预览前 30 条，实际将导入全部 {importRows.length} 条
                    </div>
                  ) : null}
                </div>
              ) : null}

              {importResult ? (
                <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  导入完成：新增 {importResult.created} 条，更新 {importResult.updated} 条，失败 {importResult.failed} 条
                </div>
              ) : null}

              <div className="mt-6 flex gap-4">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="flex-1 rounded-xl border border-stone-200 py-3 text-sm font-bold text-stone-600 hover:bg-stone-50"
                  disabled={importing}
                >
                  关闭
                </button>
                <button
                  type="button"
                  onClick={handleImportRows}
                  className="flex-1 rounded-xl bg-[#5e17eb] py-3 text-sm font-bold text-white hover:bg-[#4c12c3] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={importing || importRows.length === 0}
                >
                  {importing ? '导入中...' : `开始导入 ${importRows.length} 条`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMaterialsPage;
