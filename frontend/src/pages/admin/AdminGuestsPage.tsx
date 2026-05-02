import React, { useEffect, useMemo, useRef, useState } from "react";
import { adminApi, AgentTask, Guest, GuestBoundProgram, Program } from "../../services/api";
import TopAlert from "../../components/TopAlert";

type GuestForm = {
  name: string;
  title: string;
  bio: string;
  avatar: string;
  profileUrl: string;
  profileMarkdown: string;
  status: "active" | "inactive";
};

const EMPTY_FORM: GuestForm = {
  name: "",
  title: "",
  bio: "",
  avatar: "",
  profileUrl: "",
  profileMarkdown: "",
  status: "active",
};
const PAGE_SIZE = 20;
const PROGRAM_PAGE_SIZE = 20;

function normalizeGuestName(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeProgramText(value: string): string {
  return String(value || "").trim().toLowerCase();
}

const AdminGuestsPage: React.FC = () => {
  const [items, setItems] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUploadHint, setAvatarUploadHint] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Guest | null>(null);
  const [form, setForm] = useState<GuestForm>(EMPTY_FORM);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [programSearch, setProgramSearch] = useState("");
  const [programCandidates, setProgramCandidates] = useState<Program[]>([]);
  const [boundPrograms, setBoundPrograms] = useState<GuestBoundProgram[]>([]);
  const [bindingLoading, setBindingLoading] = useState(false);
  const [guestTask, setGuestTask] = useState<AgentTask | null>(null);
  const [guestTaskLoading, setGuestTaskLoading] = useState(false);

  const loadGuests = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getGuests({
        search: search.trim() || undefined,
      });
      setItems(res.data || []);
      setCurrentPage(1);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "获取嘉宾列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGuests();
  }, []);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const filteredProgramCandidates = useMemo(() => {
    const keyword = normalizeProgramText(programSearch);
    const boundSet = new Set(boundPrograms.map((item) => String(item._id)));
    return (programCandidates || []).filter((item) => {
      const id = String(item._id || "");
      if (!id || boundSet.has(id)) return false;
      if (!keyword) return true;
      const haystack = `${item.title || ""} ${item.programCode || ""}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [programCandidates, programSearch, boundPrograms]);

  const loadProgramCandidates = async (searchValue = "") => {
    try {
      const res = await adminApi.getProgramsPaged({
        page: 1,
        pageSize: PROGRAM_PAGE_SIZE,
        search: searchValue.trim() || undefined,
      });
      setProgramCandidates(res.data?.items || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "加载节目列表失败");
    }
  };

  const addProgramBinding = (program: Program) => {
    if (!program?._id) return;
    setBoundPrograms((prev) => {
      if (prev.some((item) => String(item._id) === String(program._id))) return prev;
      return [
        ...prev,
        {
          _id: String(program._id),
          title: String(program.title || ""),
          programCode: String(program.programCode || ""),
          status: program.status || "draft",
          updatedAt: program.updatedAt || null,
        },
      ];
    });
  };

  const removeProgramBinding = (programId: string) => {
    setBoundPrograms((prev) => prev.filter((item) => String(item._id) !== String(programId)));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setAvatarUploadHint("");
    setProgramSearch("");
    setProgramCandidates([]);
    setBoundPrograms([]);
    setIsModalOpen(true);
    void loadProgramCandidates("");
  };

  const openEdit = async (guest: Guest) => {
    setEditing(guest);
    setForm({
      name: guest.name || "",
      title: guest.title || "",
      bio: guest.bio || "",
      avatar: guest.avatar || "",
      profileUrl: guest.profileUrl || "",
      profileMarkdown: guest.profileMarkdown || "",
      status: guest.status || "active",
    });
    setAvatarUploadHint("");
    setProgramSearch("");
    setProgramCandidates([]);
    setBoundPrograms([]);
    setIsModalOpen(true);
    setBindingLoading(true);
    setGuestTaskLoading(true);
    try {
      const [boundRes, candidatesRes, taskRes] = await Promise.all([
        adminApi.getGuestProgramBindings(guest._id),
        adminApi.getProgramsPaged({ page: 1, pageSize: PROGRAM_PAGE_SIZE }),
        adminApi.listAgentTasks({ targetType: "guest", targetId: guest._id, limit: 1 }),
      ]);
      setBoundPrograms(boundRes.data?.items || []);
      setProgramCandidates(candidatesRes.data?.items || []);
      setGuestTask((taskRes.data?.items || [])[0] || null);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "加载节目绑定数据失败");
    } finally {
      setBindingLoading(false);
      setGuestTaskLoading(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setUploadingAvatar(false);
    setAvatarUploadHint("");
    setProgramSearch("");
    setProgramCandidates([]);
    setBoundPrograms([]);
    setBindingLoading(false);
    setGuestTask(null);
    setGuestTaskLoading(false);
  };

  const refreshGuestTask = async (guestId: string) => {
    const response = await adminApi.listAgentTasks({
      targetType: "guest",
      targetId: guestId,
      limit: 1,
    });
    setGuestTask((response.data?.items || [])[0] || null);
  };

  const runGuestProfileEnrichment = async () => {
    if (!editing?._id || guestTaskLoading) return;
    setGuestTaskLoading(true);
    setError(null);
    try {
      const created = await adminApi.createAgentTask({
        taskType: "enrich_guest_profile",
        targetType: "guest",
        targetId: editing._id,
      });
      setGuestTask(created.data);
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const latest = await adminApi.getAgentTask(created.data._id);
        setGuestTask(latest.data);
        if (latest.data.status === "succeeded" || latest.data.status === "failed" || latest.data.status === "canceled") {
          break;
        }
      }
      const guestRes = await adminApi.getGuest(editing._id);
      const next = guestRes.data;
      setEditing(next);
      setForm((prev) => ({
        ...prev,
        avatar: next.avatar || prev.avatar,
        profileUrl: next.profileUrl || prev.profileUrl,
        profileMarkdown: next.profileMarkdown || prev.profileMarkdown,
      }));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "触发嘉宾资料收集失败");
    } finally {
      setGuestTaskLoading(false);
      await refreshGuestTask(editing._id).catch(() => {});
    }
  };

  const handleAvatarUpload = async (file: File) => {
    const isImage = String(file.type || "").startsWith("image/");
    if (!isImage) {
      setAvatarUploadHint("仅支持图片文件（jpg/png/webp 等）");
      return;
    }
    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setAvatarUploadHint("图片过大，最大支持 10MB");
      return;
    }
    setUploadingAvatar(true);
    setAvatarUploadHint("头像上传中...");
    setError(null);
    try {
      const response = await adminApi.uploadProgramImage(file, (percent) => {
        setAvatarUploadHint(`头像上传中... ${percent}%`);
      });
      const imageUrl = response?.data?.url || "";
      if (!imageUrl) throw new Error("上传成功但未返回 URL");
      setForm((prev) => ({ ...prev, avatar: imageUrl }));
      setAvatarUploadHint("上传成功，已自动填充头像 URL");
    } catch (uploadErr: any) {
      const message = uploadErr?.response?.data?.message || uploadErr?.message || "头像上传失败";
      setAvatarUploadHint(message);
      setError(message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedIncomingName = normalizeGuestName(form.name);
    if (!normalizedIncomingName) {
      setError("嘉宾姓名不能为空");
      return;
    }
    const duplicate = items.find((item) => {
      const sameName = normalizeGuestName(item.name) === normalizedIncomingName;
      if (!sameName) return false;
      if (!editing) return true;
      return String(item._id) !== String(editing._id);
    });
    if (duplicate) {
      setError(`嘉宾已存在（姓名重复）: ${duplicate.name}（ID: ${duplicate._id}）`);
      setAvatarUploadHint(`嘉宾已存在（姓名重复）: ${duplicate.name}`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      let savedGuestId = "";
      if (editing) {
        const updated = await adminApi.updateGuest(editing._id, form);
        savedGuestId = String(updated.data?._id || editing._id);
        await adminApi.updateGuestProgramBindings(
          savedGuestId,
          boundPrograms.map((item) => String(item._id))
        );
      } else {
        const created = await adminApi.createGuest(form);
        savedGuestId = String(created.data?._id || "");
        if (savedGuestId && boundPrograms.length > 0) {
          await adminApi.updateGuestProgramBindings(
            savedGuestId,
            boundPrograms.map((item) => String(item._id))
          );
        }
      }
      await loadGuests();
      closeModal();
    } catch (err: any) {
      const detail =
        err?.response?.data?.message ||
        err?.response?.data?.error?.message ||
        err?.message ||
        "保存嘉宾失败";
      const conflictGuest = err?.response?.data?.conflictGuest;
      if (conflictGuest && conflictGuest._id) {
        const conflictDetail = `${detail}：${conflictGuest.name || "未命名"}（状态: ${conflictGuest.status || "active"}，ID: ${conflictGuest._id}）`;
        setError(conflictDetail);
        setAvatarUploadHint(conflictDetail);
      } else {
        let debugText = detail;
        try {
          const probe = await adminApi.getGuests({ search: form.name.trim() || undefined });
          const matched = (probe.data || []).map((g) => `${g.name}(ID:${g._id},状态:${g.status})`);
          if (matched.length > 0) {
            debugText += `；同名检索结果：${matched.join("、")}`;
          } else {
            const raw = err?.response?.data ? JSON.stringify(err.response.data) : "";
            if (raw) debugText += `；后端返回：${raw}`;
          }
        } catch (_probeErr) {
          const raw = err?.response?.data ? JSON.stringify(err.response.data) : "";
          if (raw) debugText += `；后端返回：${raw}`;
        }
        setError(debugText);
        setAvatarUploadHint(debugText);
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (guest: Guest) => {
    if (!window.confirm(`确认删除嘉宾《${guest.name}》吗？`)) return;
    try {
      await adminApi.deleteGuest(guest._id);
      await loadGuests();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "删除嘉宾失败");
    }
  };

  return (
    <div className="space-y-6 font-['Noto_Sans_SC','Plus_Jakarta_Sans',sans-serif] text-[#2D2926]">
      <style>{`
        .gradient-violet {
          background: linear-gradient(135deg, #5e17eb 0%, #5e17eb 100%);
        }
      `}</style>
      <div className="admin-toolbar">
        <div />
        <div className="flex items-center gap-3">
          <input
            className="rounded-xl border border-stone-200 px-3 py-2 text-sm admin-form-input"
            placeholder="搜索姓名/头衔"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                loadGuests();
              }
            }}
          />
          <button className="admin-pill-btn admin-pill-btn-secondary" onClick={loadGuests} type="button">
            搜索
          </button>
          <button className="admin-pill-btn admin-pill-btn-primary" onClick={openCreate} type="button">
            新建嘉宾
          </button>
        </div>
      </div>

      <TopAlert message={error} onClose={() => setError(null)} />

      <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
        <table className="w-full text-left">
          <thead className="bg-stone-50 text-xs text-stone-500">
            <tr>
              <th className="px-6 py-3">嘉宾</th>
              <th className="px-6 py-3">头衔</th>
              <th className="px-6 py-3 text-center">关联节目</th>
              <th className="px-6 py-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr><td className="px-6 py-6 text-sm text-stone-500" colSpan={4}>正在加载...</td></tr>
            ) : items.length === 0 ? (
              <tr><td className="px-6 py-6 text-sm text-stone-500" colSpan={4}>暂无嘉宾</td></tr>
            ) : (
              pagedItems.map((item) => (
                <tr key={item._id}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={item.avatar || "/assets/podcast-cover-1.svg"} className="h-10 w-10 rounded-full object-cover" />
                      <div>
                        <div className="text-sm font-bold text-stone-900">{item.name}</div>
                        <div className="text-xs text-stone-500 line-clamp-1">{item.bio || "-"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-700">{item.title || "-"}</td>
                  <td className="px-6 py-4 text-center text-sm text-stone-600">{item.programCount || 0}</td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex justify-center gap-2">
                      <button className="rounded-full border border-stone-200 px-3 py-1 text-xs font-bold text-stone-700" onClick={() => { void openEdit(item); }} type="button">编辑</button>
                      <button className="rounded-full border border-red-100 px-3 py-1 text-xs font-bold text-red-500" onClick={() => remove(item)} type="button">删除</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!loading && items.length > 0 ? (
          <div className="flex items-center justify-between border-t border-stone-100 px-6 py-4 text-sm text-stone-500">
            <div>第 {currentPage}/{totalPages} 页，每页 {PAGE_SIZE} 条，共 {items.length} 条</div>
            <div className="flex gap-2">
              <button
                className="rounded-full border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                type="button"
              >
                上一页
              </button>
              <button
                className="rounded-full border border-stone-200 px-4 py-2 text-xs font-bold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                type="button"
              >
                下一页
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {isModalOpen ? (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/30 p-4 backdrop-blur-sm md:p-6" onClick={closeModal}>
          <div className="mx-auto my-6 w-full max-w-3xl rounded-[2rem] bg-white p-6 shadow-2xl md:my-10 md:p-8" onClick={(event) => event.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black text-stone-900">{editing ? "编辑嘉宾" : "新建嘉宾"}</h3>
                <p className="mt-1 text-sm text-[#7A746E]">保存后即可在节目编辑中搜索并关联到前台展示。</p>
              </div>
              <button
                aria-label="关闭弹窗"
                className="material-symbols-outlined text-stone-400 transition-colors hover:text-stone-700"
                onClick={closeModal}
                type="button"
              >
                close
              </button>
            </div>

            <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={submit}>
              <input className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm admin-form-input" placeholder="姓名" required value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
              <input className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm admin-form-input" placeholder="头衔" value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm md:col-span-2">
                <input className="w-full bg-transparent p-0 text-sm outline-none admin-form-input" placeholder="头像 URL" value={form.avatar} onChange={(event) => setForm((prev) => ({ ...prev, avatar: event.target.value }))} />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-[11px] font-bold text-[#7A746E]">{avatarUploadHint || "支持直接上传头像，自动回填 URL"}</div>
                  <button className="rounded-full border border-[#5e17eb]/20 px-3 py-1 text-[11px] font-bold text-[#5e17eb] disabled:opacity-50" disabled={uploadingAvatar} type="button" onClick={() => avatarInputRef.current?.click()}>
                    {uploadingAvatar ? "上传中..." : "上传头像"}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      handleAvatarUpload(file);
                    }}
                  />
                </div>
              </div>
              <input className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm md:col-span-2 admin-form-input" placeholder="档案链接" value={form.profileUrl} onChange={(event) => setForm((prev) => ({ ...prev, profileUrl: event.target.value }))} />
              <textarea className="min-h-[90px] rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm md:col-span-2 admin-form-textarea" placeholder="简介" value={form.bio} onChange={(event) => setForm((prev) => ({ ...prev, bio: event.target.value }))} />
              {editing ? (
                <div className="rounded-2xl border border-stone-200 bg-white p-4 md:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-[#7A746E]">嘉宾资料收集 Agent</p>
                      <p className="mt-1 text-xs text-stone-500">
                        手动触发后生成 Markdown 草稿、外链索引与头像候选，可继续人工编辑后保存。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={runGuestProfileEnrichment}
                      disabled={guestTaskLoading}
                      className="rounded-full bg-[#5e17eb] px-4 py-1.5 text-xs font-bold text-white transition hover:bg-[#5112d1] disabled:opacity-60"
                    >
                      {guestTaskLoading ? "生成中..." : "触发资料收集"}
                    </button>
                  </div>
                  <div className="mt-3 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 text-xs text-stone-600">
                    {guestTask
                      ? `最新任务：${guestTask.status}${guestTask.outputSummary ? ` · ${guestTask.outputSummary}` : ""}`
                      : "暂无任务记录"}
                  </div>
                  {(editing.profileAvatarCandidates || []).length > 0 ? (
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                      {(editing.profileAvatarCandidates || []).slice(0, 3).map((item, index) => (
                        <button
                          key={`${item.url}-${index}`}
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, avatar: item.url || prev.avatar }))}
                          className="overflow-hidden rounded-xl border border-stone-200 bg-white text-left"
                        >
                          <img src={item.url} className="h-24 w-full object-cover" />
                          <div className="px-2 py-1 text-[11px] text-stone-600">{item.label || "候选头像"}</div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <textarea
                    className="mt-3 min-h-[180px] w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-mono admin-form-textarea"
                    placeholder="嘉宾资料 Markdown（可编辑）"
                    value={form.profileMarkdown}
                    onChange={(event) => setForm((prev) => ({ ...prev, profileMarkdown: event.target.value }))}
                  />
                  {(editing.profileReferences || []).length > 0 ? (
                    <div className="mt-2 space-y-1 text-xs">
                      {(editing.profileReferences || []).map((item, idx) => (
                        <a
                          key={`${item.url}-${idx}`}
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-[#5e17eb] hover:underline"
                        >
                          {item.title || item.url}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="rounded-2xl border border-stone-200 bg-white p-4 md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-[#7A746E]">节目内容关联</p>
                    <p className="mt-1 text-xs text-stone-500">支持搜索节目并关联，保存后会同步到节目内容的嘉宾关联。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadProgramCandidates(programSearch)}
                    className="rounded-full bg-[#5e17eb] px-4 py-1.5 text-xs font-bold text-white transition hover:bg-[#5112d1]"
                  >
                    刷新节目
                  </button>
                </div>

                <div className="mt-3">
                  <input
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm admin-form-input"
                    placeholder="搜索节目标题 / 编号"
                    value={programSearch}
                    onChange={(event) => {
                      setProgramSearch(event.target.value);
                      void loadProgramCandidates(event.target.value);
                    }}
                  />
                </div>

                <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-stone-100 bg-stone-50 p-2">
                  {bindingLoading ? (
                    <div className="px-2 py-3 text-xs text-stone-400">正在加载绑定...</div>
                  ) : filteredProgramCandidates.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-stone-400">暂无可关联节目</div>
                  ) : (
                    filteredProgramCandidates.map((program) => (
                      <button
                        key={program._id}
                        type="button"
                        onClick={() => addProgramBinding(program)}
                        className="mb-1 flex w-full items-center justify-between rounded-lg bg-white px-2 py-2 text-left text-xs hover:bg-[#f7f3ff]"
                      >
                        <span>{program.title}{program.programCode ? ` · ${program.programCode}` : ""}</span>
                        <span className="rounded-full bg-[#5e17eb] px-3 py-1 text-[11px] font-bold text-white">关联</span>
                      </button>
                    ))
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  {boundPrograms.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-stone-200 px-3 py-2 text-xs text-stone-400">
                      当前未绑定节目
                    </div>
                  ) : (
                    boundPrograms.map((program) => (
                      <div key={program._id} className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-stone-800">{program.title || program._id}</div>
                          <div className="truncate text-xs text-stone-500">{program.programCode || program._id}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeProgramBinding(program._id)}
                          className="rounded-full border border-red-100 px-2 py-1 text-[11px] font-bold text-red-500"
                        >
                          移除
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="mt-2 flex justify-end gap-3 md:col-span-2">
                <button className="rounded-full border border-stone-200 px-6 py-3 text-sm font-bold text-stone-700" onClick={closeModal} type="button">取消</button>
                <button className="gradient-violet rounded-full px-8 py-3 text-sm font-bold text-white disabled:opacity-60" disabled={saving} type="submit">{saving ? "保存中..." : "保存"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminGuestsPage;
