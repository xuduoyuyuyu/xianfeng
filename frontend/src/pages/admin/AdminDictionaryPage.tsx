import React, { useEffect, useMemo, useState } from "react";
import {
  adminApi,
  AdminEducationDictionaryEntry,
  DictionaryRelatedProgram,
  Program,
} from "../../services/api";

type StatusFilter = "all" | "active" | "hidden";

type FormState = {
  term: string;
  definition: string;
  sourceUrl: string;
  aliases: string;
  status: "active" | "hidden";
};

const EMPTY_FORM: FormState = {
  term: "",
  definition: "",
  sourceUrl: "",
  aliases: "",
  status: "active",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("zh-CN");
}

const AdminDictionaryPage: React.FC = () => {
  const [items, setItems] = useState<AdminEducationDictionaryEntry[]>([]);
  const [programOptions, setProgramOptions] = useState<Program[]>([]);
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
  const [relatedPrograms, setRelatedPrograms] = useState<DictionaryRelatedProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [importQuery, setImportQuery] = useState("");
  const [editingItem, setEditingItem] = useState<AdminEducationDictionaryEntry | null>(null);
  const [detailItem, setDetailItem] = useState<AdminEducationDictionaryEntry | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const filteredPrograms = useMemo(() => {
    if (!importQuery.trim()) return programOptions.slice(0, 24);
    const keyword = importQuery.trim().toLowerCase();
    return programOptions.filter((program) => program.title.toLowerCase().includes(keyword)).slice(0, 24);
  }, [programOptions, importQuery]);

  async function loadEntries() {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getDictionaryEntries({
        search: query.trim() || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setItems(response.data || []);
    } catch (loadError: any) {
      setError(loadError?.response?.data?.message || loadError?.message || "获取教育词典失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntries();
  }, [query, statusFilter]);

  useEffect(() => {
    let active = true;
    async function loadPrograms() {
      try {
        const response = await adminApi.getPrograms();
        if (active) {
          setProgramOptions(response.data || []);
        }
      } catch (_error) {}
    }
    loadPrograms();
    return () => {
      active = false;
    };
  }, []);

  const openCreate = () => {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const openEdit = (item: AdminEducationDictionaryEntry) => {
    setEditingItem(item);
    setForm({
      term: item.term,
      definition: item.definition,
      sourceUrl: item.sourceUrl || "",
      aliases: (item.aliases || []).join(", "),
      status: item.status,
    });
    setIsFormOpen(true);
  };

  const openDetail = async (item: AdminEducationDictionaryEntry) => {
    setDetailItem(item);
    setRelatedPrograms([]);
    try {
      const [detailRes, programsRes] = await Promise.all([
        adminApi.getDictionaryEntry(item._id),
        adminApi.getDictionaryEntryPrograms(item._id),
      ]);
      setDetailItem(detailRes.data);
      setRelatedPrograms(programsRes.data || []);
    } catch (detailError: any) {
      setError(detailError?.response?.data?.message || detailError?.message || "加载词条详情失败");
    }
  };

  const closeForm = () => {
    if (saving) return;
    setIsFormOpen(false);
    setEditingItem(null);
    setForm(EMPTY_FORM);
  };

  const closeImport = () => {
    if (importing) return;
    setIsImportOpen(false);
    setSelectedProgramIds([]);
    setImportQuery("");
  };

  const toggleProgramSelection = (programId: string) => {
    setSelectedProgramIds((prev) =>
      prev.includes(programId) ? prev.filter((id) => id !== programId) : [...prev, programId]
    );
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      term: form.term.trim(),
      definition: form.definition.trim(),
      sourceUrl: form.sourceUrl.trim(),
      aliases: form.aliases
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      status: form.status,
    };

    try {
      if (editingItem) {
        await adminApi.updateDictionaryEntry(editingItem._id, payload);
      } else {
        await adminApi.createDictionaryEntry(payload);
      }
      await loadEntries();
      closeForm();
    } catch (saveError: any) {
      setError(saveError?.response?.data?.message || saveError?.message || "保存词条失败");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusToggle = async (item: AdminEducationDictionaryEntry) => {
    try {
      await adminApi.updateDictionaryEntryStatus(item._id, item.status === "active" ? "hidden" : "active");
      await loadEntries();
      if (detailItem?._id === item._id) {
        await openDetail(item);
      }
    } catch (statusError: any) {
      setError(statusError?.response?.data?.message || statusError?.message || "更新状态失败");
    }
  };

  const handleImport = async () => {
    if (!selectedProgramIds.length) {
      setError("请至少选择一个节目");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      await adminApi.importDictionaryFromPrograms(selectedProgramIds);
      await loadEntries();
      closeImport();
    } catch (importError: any) {
      setError(importError?.response?.data?.message || importError?.message || "导入节目词条失败");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-8 font-['Noto_Sans_SC','Plus_Jakarta_Sans',sans-serif] text-[#2D2926]">
      {error ? <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-600">{error}</div> : null}

      <section className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.24em] text-[#5e17eb]">Education Dictionary</div>
            <h2 className="mt-3 text-3xl font-black text-stone-900">教育词典</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
              统一维护节目术语、释义、别名、相关词和关联节目。AI 解析出的词条会自动入库，这里负责人工校正与补导入。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-full border border-[#5e17eb]/20 bg-[#f7f3ff] px-5 py-3 text-sm font-bold text-[#5e17eb] hover:border-[#5e17eb] hover:bg-[#f1eaff]"
              onClick={() => setIsImportOpen(true)}
              type="button"
            >
              从节目导入
            </button>
            <button
              className="rounded-full bg-[#5e17eb] px-5 py-3 text-sm font-bold text-white hover:bg-[#5112d1]"
              onClick={openCreate}
              type="button"
            >
              新建词条
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row">
            <input
              className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm"
              placeholder="搜索词条、释义或别名"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="all">全部状态</option>
              <option value="active">仅看启用</option>
              <option value="hidden">仅看隐藏</option>
            </select>
          </div>
          <div className="rounded-full bg-stone-100 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-stone-500">
            {items.length} 条词条
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-stone-50 text-[11px] font-black uppercase tracking-[0.2em] text-stone-500">
              <tr>
                <th className="px-5 py-4">词条</th>
                <th className="px-5 py-4">释义摘要</th>
                <th className="px-5 py-4">关联节目</th>
                <th className="px-5 py-4">状态</th>
                <th className="px-5 py-4">更新时间</th>
                <th className="px-5 py-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-stone-500" colSpan={6}>
                    正在加载教育词典...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-sm text-stone-500" colSpan={6}>
                    还没有词条，可直接新建或从节目导入。
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item._id} className="hover:bg-stone-50/60">
                    <td className="px-5 py-5">
                      <div className="font-bold text-stone-900">{item.term}</div>
                      <div className="mt-1 text-xs text-stone-500">
                        {(item.aliases || []).length > 0 ? `别名：${item.aliases.join("、")}` : "暂无别名"}
                      </div>
                    </td>
                    <td className="px-5 py-5 text-sm leading-6 text-stone-600">
                      {(item.definition || "").slice(0, 90) || "暂无释义"}
                    </td>
                    <td className="px-5 py-5 text-sm font-semibold text-stone-700">{item.programCount || 0} 个节目</td>
                    <td className="px-5 py-5">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${
                          item.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {item.status === "active" ? "启用中" : "已隐藏"}
                      </span>
                    </td>
                    <td className="px-5 py-5 text-sm text-stone-500">{formatDate(item.updatedAt)}</td>
                    <td className="px-5 py-5">
                      <div className="flex justify-end gap-2">
                        <button
                          className="rounded-full border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 hover:border-[#5e17eb] hover:text-[#5e17eb]"
                          onClick={() => openDetail(item)}
                          type="button"
                        >
                          详情
                        </button>
                        <button
                          className="rounded-full border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 hover:border-[#5e17eb] hover:text-[#5e17eb]"
                          onClick={() => openEdit(item)}
                          type="button"
                        >
                          编辑
                        </button>
                        <button
                          className="rounded-full border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 hover:border-[#5e17eb] hover:text-[#5e17eb]"
                          onClick={() => handleStatusToggle(item)}
                          type="button"
                        >
                          {item.status === "active" ? "隐藏" : "启用"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isFormOpen ? (
        <div className="fixed inset-0 z-[70] bg-black/35 p-4 backdrop-blur-sm" onClick={closeForm}>
          <div className="mx-auto mt-10 max-w-2xl rounded-[2rem] bg-white p-8 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h3 className="text-2xl font-black text-stone-900">{editingItem ? "编辑词条" : "新建词条"}</h3>
                <p className="mt-1 text-sm text-stone-500">修改后会同步影响节目详情里的术语释义和 tooltip 展示。</p>
              </div>
              <button className="material-symbols-outlined text-stone-400 hover:text-stone-700" onClick={closeForm} type="button">
                close
              </button>
            </div>
            <form className="grid grid-cols-1 gap-4" onSubmit={handleSave}>
              <input
                className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm"
                placeholder="词条名称"
                required
                value={form.term}
                onChange={(event) => setForm((prev) => ({ ...prev, term: event.target.value }))}
              />
              <textarea
                className="min-h-[120px] rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm"
                placeholder="词条释义"
                required
                value={form.definition}
                onChange={(event) => setForm((prev) => ({ ...prev, definition: event.target.value }))}
              />
              <input
                className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm"
                placeholder="来源链接（可选）"
                value={form.sourceUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, sourceUrl: event.target.value }))}
              />
              <input
                className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm"
                placeholder="别名（逗号分隔）"
                value={form.aliases}
                onChange={(event) => setForm((prev) => ({ ...prev, aliases: event.target.value }))}
              />
              <select
                className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm"
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as "active" | "hidden" }))}
              >
                <option value="active">启用词条</option>
                <option value="hidden">隐藏词条</option>
              </select>
              <div className="mt-2 flex justify-end gap-3">
                <button className="rounded-full border border-stone-200 px-5 py-2.5 text-sm font-bold text-stone-700" onClick={closeForm} type="button">
                  取消
                </button>
                <button className="rounded-full bg-[#5e17eb] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#5112d1]" disabled={saving} type="submit">
                  {saving ? "保存中..." : editingItem ? "保存修改" : "创建词条"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {detailItem ? (
        <div className="fixed inset-0 z-[72] bg-black/35 p-4 backdrop-blur-sm" onClick={() => setDetailItem(null)}>
          <div className="mx-auto mt-10 max-w-3xl rounded-[2rem] bg-white p-8 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-[#5e17eb]">Dictionary Detail</div>
                <h3 className="mt-2 text-2xl font-black text-stone-900">{detailItem.term}</h3>
              </div>
              <button className="material-symbols-outlined text-stone-400 hover:text-stone-700" onClick={() => setDetailItem(null)} type="button">
                close
              </button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <section className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-stone-500">释义</div>
                <p className="mt-3 text-sm leading-7 text-stone-700">{detailItem.definition || "暂无释义"}</p>
                <div className="mt-4 text-xs text-stone-500">
                  {(detailItem.aliases || []).length > 0 ? `别名：${detailItem.aliases.join("、")}` : "暂无别名"}
                </div>
                {detailItem.sourceUrl ? (
                  <a className="mt-3 inline-flex text-sm font-bold text-[#5e17eb] hover:underline" href={detailItem.sourceUrl} target="_blank" rel="noreferrer">
                    查看来源
                  </a>
                ) : null}
              </section>

              <section className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-stone-500">自动相关词</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(detailItem.relatedEntries || []).length > 0 ? (
                    detailItem.relatedEntries!.map((entry) => (
                      <span key={entry._id} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-stone-700">
                        {entry.term}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-stone-500">暂未形成共现关系</span>
                  )}
                </div>
              </section>
            </div>

            <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-stone-500">关联节目</div>
              <div className="mt-4 grid gap-3">
                {relatedPrograms.length > 0 ? (
                  relatedPrograms.map((program) => (
                    <div key={program._id} className="flex items-center justify-between rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3">
                      <div>
                        <div className="font-bold text-stone-900">{program.title}</div>
                        <div className="mt-1 text-xs text-stone-500">
                          {program.status === "published" ? "已发布" : "草稿"} · {formatDate(program.publishedAt || program.updatedAt)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-stone-500">当前还没有关联节目。</div>
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {isImportOpen ? (
        <div className="fixed inset-0 z-[71] bg-black/35 p-4 backdrop-blur-sm" onClick={closeImport}>
          <div className="mx-auto mt-10 max-w-3xl rounded-[2rem] bg-white p-8 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h3 className="text-2xl font-black text-stone-900">从节目导入词条</h3>
                <p className="mt-1 text-sm text-stone-500">首版导入仅从节目现有的 AI 术语结果中重新入库，不支持文件上传。</p>
              </div>
              <button className="material-symbols-outlined text-stone-400 hover:text-stone-700" onClick={closeImport} type="button">
                close
              </button>
            </div>

            <input
              className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm"
              placeholder="搜索节目标题"
              value={importQuery}
              onChange={(event) => setImportQuery(event.target.value)}
            />
            <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {filteredPrograms.map((program) => {
                const checked = selectedProgramIds.includes(program._id);
                return (
                  <label
                    key={program._id}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                      checked ? "border-[#5e17eb] bg-[#f7f3ff]" : "border-stone-200 bg-white hover:border-stone-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProgramSelection(program._id)}
                    />
                    <div>
                      <div className="font-bold text-stone-900">{program.title}</div>
                      <div className="mt-1 text-xs text-stone-500">
                        {(program.dictionaryEntries || []).length} 个已关联词条 · {program.status === "published" ? "已发布" : "草稿"}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-stone-500">已选择 {selectedProgramIds.length} 个节目</div>
              <div className="flex gap-3">
                <button className="rounded-full border border-stone-200 px-5 py-2.5 text-sm font-bold text-stone-700" onClick={closeImport} type="button">
                  取消
                </button>
                <button className="rounded-full bg-[#5e17eb] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#5112d1]" disabled={importing} onClick={handleImport} type="button">
                  {importing ? "导入中..." : "开始导入"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminDictionaryPage;
