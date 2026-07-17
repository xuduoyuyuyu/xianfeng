import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSelector } from "react-redux";
import { adminApi, AdminUserOverview, User } from "../../services/api";
import TopAlert from "../../components/TopAlert";
import { RootState } from "../../store";

type EditableUser = Pick<User, "_id" | "username" | "mobile" | "role" | "city" | "region" | "childGrade" | "grade" | "name" | "membershipTier" | "hasMamaResource" | "mamaResourceId" | "childStages" | "childGrades" | "proPointBalance" | "changeHistory" | "childMemories" | "memoryItemCount" | "memoryPreview" | "latestMemoryAt" | "createdAt">;
type UserModalMode = "create" | "edit" | null;

type UserFormState = {
  username: string;
  name: string;
  role: "admin" | "user";
  city: string;
  region: string;
  childGrade: string;
  grade: string;
  password: string;
};

const EMPTY_USER_FORM: UserFormState = {
  username: "",
  name: "",
  role: "user",
  city: "",
  region: "",
  childGrade: "",
  grade: "",
  password: "",
};

function normalizeString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value;
}

function formatDateTime(value?: string): string {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toEditableUser(row: User): EditableUser {
  return {
    _id: row._id,
    username: row.username,
    name: row.name || "",
    mobile: row.mobile || "",
    role: row.role,
    city: row.city,
    region: row.region,
    childGrade: row.childGrade,
    grade: row.grade,
    membershipTier: row.membershipTier || "free",
    hasMamaResource: row.hasMamaResource === true,
    mamaResourceId: row.mamaResourceId || "",
    childStages: row.childStages || [],
    childGrades: row.childGrades || [],
    proPointBalance: Number(row.proPointBalance || 0),
    changeHistory: row.changeHistory || [],
    childMemories: row.childMemories || [],
    memoryItemCount: row.memoryItemCount || 0,
    memoryPreview: row.memoryPreview || "",
    latestMemoryAt: row.latestMemoryAt || null,
    createdAt: row.createdAt,
  };
}

const inputClass =
  "rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-900 caret-[#5e17eb] placeholder:text-stone-400 focus:border-[#5e17eb] focus:ring-4 focus:ring-[#5e17eb]/5";
const PAGE_SIZE = 20;

function resolveMobile(row: Pick<EditableUser, "mobile" | "username">): string {
  const explicitMobile = (row.mobile || "").trim();
  if (/^1\d{10}$/.test(explicitMobile)) return explicitMobile;
  const m = String(row.username || "").trim().match(/^u?(1\d{10})$/);
  return m ? m[1] : "";
}

const AdminUsersPage: React.FC = () => {
  const { admin } = useSelector((state: RootState) => state.admin);
  const myId = (admin as any)?._id || (admin as any)?.id || "";

  const [items, setItems] = useState<EditableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [mamaFilter, setMamaFilter] = useState("");
  const [membershipFilter, setMembershipFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [childStageFilter, setChildStageFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [modalMode, setModalMode] = useState<UserModalMode>(null);
  const [editingUser, setEditingUser] = useState<EditableUser | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_USER_FORM);
  const [resetTarget, setResetTarget] = useState<EditableUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [memoryTarget, setMemoryTarget] = useState<EditableUser | null>(null);
  const [overview, setOverview] = useState<AdminUserOverview | null>(null);
  const [overviewLoadingId, setOverviewLoadingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getUsers();
      setItems((response.data || []).map(toEditableUser));
    } catch (loadError: any) {
      setError(loadError?.response?.data?.message || loadError?.message || "获取用户列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredItems = useMemo(() => {
    const key = keyword.trim().toLowerCase();
    return items.filter((row) => {
      if (key && !`${row.username} ${row.name || ""} ${resolveMobile(row)} ${row.role} ${row.city || ""} ${row.region || ""} ${row.childGrade || ""} ${row.grade || ""} ${(row.childStages || []).join(" ")} ${(row.childGrades || []).join(" ")} ${row.memoryPreview || ""}`.toLowerCase().includes(key)) return false;
      if (mamaFilter && String(row.hasMamaResource) !== mamaFilter) return false;
      if (membershipFilter && row.membershipTier !== membershipFilter) return false;
      if (cityFilter && row.city !== cityFilter) return false;
      if (regionFilter && row.region !== regionFilter) return false;
      if (childStageFilter && !(row.childStages || []).includes(childStageFilter)) return false;
      if (gradeFilter && ![row.grade, row.childGrade, ...(row.childGrades || [])].filter(Boolean).includes(gradeFilter)) return false;
      return true;
    });
  }, [items, keyword, mamaFilter, membershipFilter, cityFilter, regionFilter, childStageFilter, gradeFilter]);

  const filterOptions = useMemo(() => ({
    cities: Array.from(new Set(items.map((row) => row.city).filter(Boolean))).sort(),
    regions: cityFilter
      ? Array.from(new Set(items.filter((row) => row.city === cityFilter).map((row) => row.region).filter(Boolean))).sort()
      : [],
    childStages: Array.from(new Set(items.flatMap((row) => row.childStages || []))).sort(),
    grades: Array.from(new Set(items.flatMap((row) => [row.grade, row.childGrade, ...(row.childGrades || [])].filter(Boolean)))).sort(),
  }), [items, cityFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [keyword, mamaFilter, membershipFilter, cityFilter, regionFilter, childStageFilter, gradeFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const stats = useMemo(() => {
    const total = items.length;
    const admins = items.filter((row) => row.role === "admin").length;
    const users = total - admins;
    return { total, admins, users };
  }, [items]);

  const updateLocal = (id: string, patch: Partial<EditableUser>) => {
    setItems((prev) => prev.map((row) => (row._id === id ? { ...row, ...patch } : row)));
  };

  const closeUserModal = () => {
    setModalMode(null);
    setEditingUser(null);
    setForm(EMPTY_USER_FORM);
  };

  const openCreate = () => {
    setError(null);
    setEditingUser(null);
    setForm(EMPTY_USER_FORM);
    setModalMode("create");
  };

  const openEdit = (row: EditableUser) => {
    setError(null);
    setEditingUser(row);
    setForm({
      username: row.username,
      name: row.name || "",
      role: row.role,
      city: row.city || "",
      region: row.region || "",
      childGrade: row.childGrade || "",
      grade: row.grade || "",
      password: "",
    });
    setModalMode("edit");
  };

  const handleQuickSave = async (row: EditableUser) => {
    setSavingId(row._id);
    setError(null);
    try {
      const payload: Partial<User> = {
        city: normalizeString(row.city),
        region: normalizeString(row.region),
        childGrade: normalizeString(row.childGrade),
        grade: normalizeString(row.grade),
        name: normalizeString(row.name),
        proPointBalance: Number(row.proPointBalance || 0),
      };
      const response = await adminApi.updateUser(row._id, payload);
      updateLocal(row._id, toEditableUser(response.data));
    } catch (saveError: any) {
      setError(saveError?.response?.data?.message || saveError?.message || "保存失败");
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveUser = async (event: React.FormEvent) => {
    event.preventDefault();
    const username = form.username.trim();
    const password = form.password.trim();
    if (!username) {
      setError("请填写用户名");
      return;
    }
    if (modalMode === "create" && !password) {
      setError("新建用户必须填写初始密码");
      return;
    }
    if (modalMode === "edit" && editingUser && String(editingUser._id) === String(myId) && form.role !== "admin") {
      setError("不能取消当前登录账号的管理员权限");
      return;
    }

    setSavingId(editingUser?._id || "new");
    setError(null);
    try {
      if (modalMode === "create") {
        await adminApi.createUser({
          username,
          name: form.name.trim(),
          password,
          role: form.role,
          city: form.city.trim(),
          region: form.region.trim(),
          childGrade: form.childGrade.trim(),
          grade: form.grade.trim(),
        });
        await loadUsers();
      } else if (modalMode === "edit" && editingUser) {
        const response = await adminApi.updateUser(editingUser._id, {
          username,
          name: form.name.trim(),
          role: form.role,
          city: form.city.trim(),
          region: form.region.trim(),
          childGrade: form.childGrade.trim(),
          grade: form.grade.trim(),
        });
        updateLocal(editingUser._id, toEditableUser(response.data));
      }
      closeUserModal();
    } catch (saveError: any) {
      setError(saveError?.response?.data?.message || saveError?.message || "保存用户失败");
    } finally {
      setSavingId(null);
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resetTarget) return;
    const password = resetPassword.trim();
    if (!password) {
      setError("请填写新密码");
      return;
    }
    setSavingId(resetTarget._id);
    setError(null);
    try {
      await adminApi.updateUser(resetTarget._id, { password });
      setResetTarget(null);
      setResetPassword("");
    } catch (saveError: any) {
      setError(saveError?.response?.data?.message || saveError?.message || "重置密码失败");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (row: EditableUser) => {
    if (!window.confirm(`确认删除用户「${row.username}」吗？`)) return;
    setDeletingId(row._id);
    setError(null);
    try {
      await adminApi.deleteUser(row._id);
      setItems((prev) => prev.filter((item) => item._id !== row._id));
    } catch (deleteError: any) {
      setError(deleteError?.response?.data?.message || deleteError?.message || "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  const openOverview = async (row: EditableUser) => {
    setOverviewLoadingId(row._id);
    setError(null);
    try {
      const response = await adminApi.getUserOverview(row._id);
      setOverview(response.data);
    } catch (loadError: any) {
      setError(loadError?.response?.data?.message || loadError?.message || "获取用户画像失败");
    } finally {
      setOverviewLoadingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="admin-toolbar">
        <div />
        <button
          onClick={openCreate}
          className="admin-pill-btn admin-pill-btn-primary"
          type="button"
        >
          <span className="material-symbols-outlined text-base">person_add</span>
          新建用户
        </button>
      </div>

      <TopAlert message={error} onClose={() => setError(null)} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="bg-white rounded-2xl p-6 border border-stone-100">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#5e17eb]/10 rounded-xl flex items-center justify-center text-[#5e17eb]">
              <span className="material-symbols-outlined">group</span>
            </div>
            <div>
              <p className="text-2xl font-black text-stone-900">{stats.total}</p>
              <p className="text-xs text-stone-400">总用户数</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-stone-100">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
              <span className="material-symbols-outlined">verified_user</span>
            </div>
            <div>
              <p className="text-2xl font-black text-stone-900">{stats.admins}</p>
              <p className="text-xs text-stone-400">管理员</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-stone-100">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center text-stone-600">
              <span className="material-symbols-outlined">person</span>
            </div>
            <div>
              <p className="text-2xl font-black text-stone-900">{stats.users}</p>
              <p className="text-xs text-stone-400">普通用户</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-stone-100 px-6 py-5">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">用户列表</div>
          <div className="overflow-x-auto pb-1">
          <div className="grid min-w-[1280px] grid-cols-[minmax(280px,2fr)_repeat(6,minmax(140px,1fr))] gap-2">
            <div className="relative">
            <input
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-900 caret-[#5e17eb] placeholder:text-stone-400 transition-all focus:border-[#5e17eb] focus:ring-4 focus:ring-[#5e17eb]/5"
              placeholder="搜索用户名 / 昵称 / 手机号 / 角色 / 城市 / 区域 / 年级"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-base">search</span>
            </div>
            <select className={inputClass} value={mamaFilter} onChange={(event) => setMamaFilter(event.target.value)}><option value="">全部</option><option value="true">好赚</option></select>
            <select className={inputClass} value={membershipFilter} onChange={(event) => setMembershipFilter(event.target.value)}><option value="">全部会员</option><option value="free">免费用户</option><option value="plus">Plus</option><option value="pro">Pro</option></select>
            <select className={inputClass} value={cityFilter} onChange={(event) => { setCityFilter(event.target.value); setRegionFilter(""); }}><option value="">全部城市</option>{filterOptions.cities.map((value) => <option key={value} value={value}>{value}</option>)}</select>
            <select className={inputClass} value={regionFilter} disabled={!cityFilter} onChange={(event) => setRegionFilter(event.target.value)}><option value="">{cityFilter ? "全部区域" : "请先选择城市"}</option>{filterOptions.regions.map((value) => <option key={value} value={value}>{value}</option>)}</select>
            <select className={inputClass} value={childStageFilter} onChange={(event) => setChildStageFilter(event.target.value)}><option value="">全部孩子年龄段</option>{filterOptions.childStages.map((value) => <option key={value} value={value}>{value}</option>)}</select>
            <select className={inputClass} value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}><option value="">全部年级</option>{filterOptions.grades.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-[#5e17eb]/10 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-t-[#5e17eb] rounded-full animate-spin"></div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] text-left">
              <thead className="bg-white text-stone-500 uppercase text-[10px] font-black tracking-[0.2em]">
                <tr>
                  <th className="px-4 py-3">用户名</th>
                  <th className="px-4 py-3">昵称</th>
                  <th className="px-4 py-3">手机号</th>
                  <th className="px-4 py-3">角色</th>
                  <th className="px-4 py-3">城市</th>
                      <th className="px-4 py-3">区域</th>
                      <th className="px-4 py-3">年级</th>
                      <th className="px-4 py-3">当前点数</th>
                      <th className="px-4 py-3">记忆</th>
                  <th className="px-4 py-3 whitespace-nowrap">注册时间</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {pagedItems.map((row) => {
                  const saving = savingId === row._id;
                  const deleting = deletingId === row._id;
                  const isMe = myId && String(myId) === String(row._id);
                  return (
                    <tr key={row._id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => openOverview(row)} className="text-left text-sm font-bold text-stone-900 hover:text-[#5e17eb]" title="查看用户画像与时间线">{row.username}</button>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className={`w-24 ${inputClass}`}
                          value={row.name || ""}
                          placeholder="昵称"
                          onChange={(event) => updateLocal(row._id, { name: event.target.value })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-stone-700">{resolveMobile(row) || "未绑定"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black ${row.role === "admin" ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}>
                          {row.role === "admin" ? "管理员" : "用户"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className={`w-20 ${inputClass}`}
                          value={row.city || ""}
                          placeholder="城市"
                          onChange={(event) => updateLocal(row._id, { city: event.target.value })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className={`w-20 ${inputClass}`}
                          value={row.region || ""}
                          placeholder="区域"
                          onChange={(event) => updateLocal(row._id, { region: event.target.value })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className={`w-20 ${inputClass}`}
                          value={row.grade || row.childGrade || ""}
                          placeholder="年级"
                          onChange={(event) => updateLocal(row._id, { grade: event.target.value })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className={`w-20 ${inputClass}`}
                          min={0}
                          step={1}
                          type="number"
                          value={Number(row.proPointBalance || 0)}
                          onChange={(event) => updateLocal(row._id, { proPointBalance: Number(event.target.value || 0) })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[90px]">
                          <button
                            className={`truncate rounded-xl px-2 py-1.5 text-[11px] font-bold transition-colors ${row.memoryItemCount ? "border border-[#5e17eb]/20 bg-[#f7f3ff] text-[#5e17eb] hover:bg-[#efe7ff]" : "border border-stone-200 text-stone-400"}`}
                            disabled={!row.childMemories?.length}
                            onClick={() => setMemoryTarget(row)}
                            title="查看记忆"
                            type="button"
                          >
                            {row.memoryItemCount ? `${row.memoryItemCount} 条` : "暂无"}
                          </button>
                          {row.memoryPreview ? (
                            <div className="mt-2 truncate text-xs font-medium text-stone-400" title={row.memoryPreview}>
                              {row.memoryPreview}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-bold text-stone-900">{formatDateTime(row.createdAt)}</div>
                      </td>
                      <td className="px-3 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openOverview(row)}
                            disabled={saving || deleting || overviewLoadingId === row._id}
                            className="rounded-lg border border-[#d9c7ff] px-2 py-1.5 text-[#5e17eb] hover:bg-[#f7f3ff] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="查看用户画像"
                            type="button"
                          >
                            <span className="material-symbols-outlined text-base">timeline</span>
                          </button>
                          <button
                            onClick={() => handleQuickSave(row)}
                            disabled={saving || deleting}
                            className="rounded-lg bg-[#5e17eb] px-2.5 py-1.5 text-white text-xs font-bold hover:bg-[#5112d1] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="保存"
                            type="button"
                          >
                            {saving ? "..." : "保存"}
                          </button>
                          <button
                            onClick={() => openEdit(row)}
                            disabled={saving || deleting}
                            className="rounded-lg border border-stone-200 px-2 py-1.5 text-stone-500 hover:bg-stone-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="编辑"
                            type="button"
                          >
                            <span className="material-symbols-outlined text-base">edit</span>
                          </button>
                          <button
                            onClick={() => {
                              setError(null);
                              setResetTarget(row);
                              setResetPassword("");
                            }}
                            disabled={saving || deleting}
                            className="rounded-lg border border-stone-200 px-2 py-1.5 text-stone-400 hover:border-amber-200 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="重置密码"
                            type="button"
                          >
                            <span className="material-symbols-outlined text-base">key</span>
                          </button>
                          <button
                            onClick={() => handleDelete(row)}
                            disabled={saving || deleting || isMe}
                            className="rounded-lg border border-stone-200 px-2 py-1.5 text-stone-400 hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={isMe ? "不能删除当前登录账号" : "删除用户"}
                            type="button"
                          >
                            {deleting ? "..." : <span className="material-symbols-outlined text-base">delete</span>}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredItems.length === 0 ? (
              <div className="text-center py-16 text-stone-400">
                <span className="material-symbols-outlined text-6xl mb-4">inbox</span>
                <p>暂无用户</p>
              </div>
            ) : null}
          </div>
        )}
        {!loading && filteredItems.length > 0 ? (
          <div className="flex items-center justify-between border-t border-stone-100 px-6 py-4 text-sm text-stone-500">
            <div className="flex items-center gap-2">
              <span>第 {currentPage}/{totalPages} 页，共 {filteredItems.length} 条</span>
              <select className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs font-bold text-stone-700" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setCurrentPage(1); }}>
                <option value={20}>每页 20 条</option>
                <option value={50}>每页 50 条</option>
                <option value={100}>每页 100 条</option>
              </select>
            </div>
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
        ) : null}
      </div>

      {overview ? createPortal((
        <div className="fixed inset-0 z-[85] overflow-y-auto bg-black/40 p-4 backdrop-blur-sm" onClick={() => setOverview(null)}>
          <div className="mx-auto my-6 max-w-5xl overflow-hidden rounded-3xl bg-[#faf9fc] shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-stone-200 bg-white px-6 py-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#5e17eb]">User 360</p>
                <h2 className="mt-1 text-2xl font-black text-stone-900">{overview.user.name || overview.user.username}</h2>
                <p className="mt-1 text-sm text-stone-500">{overview.user.username} · {overview.user.mobile || resolveMobile(overview.user as EditableUser) || "未绑定手机"} · 注册于 {formatDateTime(overview.user.createdAt)}</p>
              </div>
              <button type="button" onClick={() => setOverview(null)} className="rounded-full p-2 text-stone-400 hover:bg-stone-100"><span className="material-symbols-outlined">close</span></button>
            </div>

            <div className="grid gap-5 p-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
              <div className="space-y-5">
                <section className="rounded-2xl border border-stone-200 bg-white p-5">
                  <h3 className="text-sm font-black text-stone-900">基本资料</h3>
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    {[['用户 ID', overview.user._id], ['好赚 ID', overview.mamaProfile?._id || '未开通'], ['站内昵称', overview.user.name || '未填写'], ['性别', overview.user.gender || '未填写'], ['家长身份', overview.user.parentRole || '未填写'], ['城市', overview.user.city || '未填写'], ['区域', overview.user.region || '未填写'], ['年级', overview.user.grade || overview.user.childGrade || '未填写'], ['会员', overview.user.membershipLabel || overview.user.proStatus || '免费用户'], ['点数', String(overview.user.proPointBalance || 0)], ['页面访问', `${overview.pageVisitCount} 次（最近 100 条）`]].map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-stone-50 px-3 py-3"><div className="text-xs font-bold text-stone-400">{label}</div><div className="mt-1 font-bold text-stone-800">{value}</div></div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-stone-200 bg-white p-5">
                  <div className="flex items-center justify-between"><h3 className="text-sm font-black text-stone-900">孩子基本情况</h3><span className="text-xs font-bold text-stone-400">{overview.childProfiles.length} 份档案</span></div>
                  <div className="mt-4 space-y-3">
                    {overview.childProfiles.length ? overview.childProfiles.map((child, index) => (
                      <div key={child.id || child._id || index} className="rounded-xl bg-[#f7f3ff] px-4 py-3">
                        <div className="font-black text-stone-900">{child.name || child.nickname || `孩子 ${index + 1}`}</div>
                        <div className="mt-1 text-sm text-stone-600">{[child.gender, child.birthDate || child.birthday, child.stage, child.grade, child.city, child.region].filter(Boolean).join(' · ') || '基本情况待完善'}</div>
                      </div>
                    )) : <div className="rounded-xl bg-stone-50 px-4 py-6 text-center text-sm text-stone-400">暂无孩子档案</div>}
                  </div>
                </section>

                <section className="rounded-2xl border border-stone-200 bg-white p-5">
                  <div className="flex items-center justify-between"><h3 className="text-sm font-black text-stone-900">好赚</h3><span className="text-xs font-bold text-stone-400">{overview.mamaAssignments.length} 个任务</span></div>
                  {overview.mamaProfile ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span className="font-black">{overview.mamaProfile.displayName}</span><span className="ml-2">{overview.mamaProfile.status === 'approved' ? '可派单' : overview.mamaProfile.status}</span><div className="mt-1 text-xs">{(overview.mamaProfile.categories || []).join(' · ') || '未填写品类'} · {overview.mamaProfile.mediaAccounts?.length || 1} 个平台账号</div></div>
                      {overview.mamaAssignments.map((assignment) => <div key={assignment._id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-100 px-4 py-3 text-sm"><span className="font-bold text-stone-800">{assignment.task?.title || '好赚任务'}</span><span className="shrink-0 text-xs font-bold text-stone-500">{assignment.status}</span></div>)}
                    </div>
                  ) : <div className="mt-4 rounded-xl bg-stone-50 px-4 py-6 text-center text-sm text-stone-400">尚未开通好赚</div>}
                </section>
              </div>

              <section className="rounded-2xl border border-stone-200 bg-white p-5">
                <div className="flex items-center justify-between"><h3 className="text-sm font-black text-stone-900">用户时间线</h3><span className="text-xs font-bold text-stone-400">{overview.timeline.length} 条</span></div>
                <div className="mt-5 max-h-[68vh] space-y-0 overflow-y-auto pr-1">
                  {overview.timeline.length ? overview.timeline.map((item, index) => (
                    <div key={`${item.occurredAt}-${item.type}-${index}`} className="relative border-l-2 border-[#e8ddff] pb-5 pl-5 last:pb-0">
                      <span className="absolute -left-[7px] top-0 h-3 w-3 rounded-full border-2 border-white bg-[#6c27d6]" />
                      <div className="text-xs font-bold text-stone-400">{formatDateTime(item.occurredAt)}</div>
                      <div className="mt-1 text-sm font-black text-stone-900">{item.title}</div>
                      {item.detail ? <div className="mt-1 break-words text-xs leading-5 text-stone-500">{item.detail}</div> : null}
                    </div>
                  )) : <div className="py-10 text-center text-sm text-stone-400">暂无行为记录</div>}
                </div>
              </section>
            </div>
          </div>
        </div>
      ), document.body) : null}

      {modalMode ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-7 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#5e17eb]">User Account</p>
                <h2 className="mt-2 text-2xl font-black text-stone-900">{modalMode === "create" ? "新建用户" : "编辑用户"}</h2>
              </div>
              <button className="rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700" onClick={closeUserModal} type="button">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleSaveUser}>
              <input
                className={`${inputClass} md:col-span-2`}
                placeholder="用户名"
                required
                value={form.username}
                onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
              />
              <input
                className={`${inputClass} md:col-span-2`}
                placeholder="昵称"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <select
                className={`${inputClass} md:col-span-2`}
                value={form.role}
                disabled={Boolean(editingUser && String(editingUser._id) === String(myId))}
                onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as "admin" | "user" }))}
              >
                <option value="admin">管理员</option>
                <option value="user">普通用户</option>
              </select>
              <input className={inputClass} placeholder="城市" value={form.city} onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))} />
              <input className={inputClass} placeholder="区域" value={form.region} onChange={(event) => setForm((prev) => ({ ...prev, region: event.target.value }))} />
              <input className={inputClass} placeholder="年级 (grade)" value={form.grade} onChange={(event) => setForm((prev) => ({ ...prev, grade: event.target.value }))} />
              <input className={inputClass} placeholder="孩子年级 (childGrade)" value={form.childGrade} onChange={(event) => setForm((prev) => ({ ...prev, childGrade: event.target.value }))} />
              {modalMode === "create" ? (
                <input
                  className={`${inputClass} md:col-span-2`}
                  placeholder="初始密码"
                  required
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                />
              ) : null}
              <div className="mt-2 flex justify-end gap-3 md:col-span-2">
                <button className="rounded-xl border border-stone-200 px-5 py-2.5 text-sm font-bold text-stone-700 hover:bg-stone-50" onClick={closeUserModal} type="button">
                  取消
                </button>
                <button className="rounded-xl bg-[#5e17eb] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#5112d1] disabled:cursor-not-allowed disabled:opacity-60" disabled={Boolean(savingId)} type="submit">
                  {savingId ? "保存中..." : "保存"}
                </button>
              </div>
            </form>
            {editingUser?.changeHistory?.length ? (
              <div className="mt-6 rounded-2xl border border-stone-100 bg-stone-50 p-4">
                <div className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-stone-500">最近修改记录</div>
                <div className="space-y-2">
                  {editingUser.changeHistory.slice(-6).reverse().map((item, index) => (
                    <div key={`${item.changedAt || index}-${item.field}`} className="rounded-xl bg-white px-3 py-2 text-xs text-stone-600">
                      <span className="font-bold text-stone-900">{item.field}</span>
                      <span>：{item.oldValue || "空"} → {item.newValue || "空"}</span>
                      <span className="ml-2 text-stone-400">{formatDateTime(item.changedAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {memoryTarget ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-6 backdrop-blur-sm">
          <div className="max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-stone-100 p-7">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#5e17eb]">User Memory</p>
                <h2 className="mt-2 text-2xl font-black text-stone-900">前台记忆</h2>
                <p className="mt-1 text-sm text-stone-500">
                  账号：{memoryTarget.username} · 共 {memoryTarget.memoryItemCount || 0} 条
                </p>
              </div>
              <button className="rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700" onClick={() => setMemoryTarget(null)} type="button">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="max-h-[62vh] space-y-4 overflow-y-auto p-7">
              {memoryTarget.childMemories?.length ? (
                memoryTarget.childMemories.map((memory) => (
                  <div key={memory.childId} className="rounded-2xl border border-stone-100 bg-stone-50 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-stone-900">孩子档案：{memory.childId}</div>
                        <div className="mt-1 text-xs font-medium text-stone-400">更新：{formatDateTime(memory.updatedAt)} · {memory.itemCount} 条</div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black ${memory.enabled ? "bg-emerald-50 text-emerald-700" : "bg-stone-200 text-stone-500"}`}>
                        {memory.enabled ? "记忆开启" : "记忆关闭"}
                      </span>
                    </div>
                    {memory.summary ? (
                      <div className="whitespace-pre-wrap rounded-xl bg-white p-4 text-sm font-medium leading-7 text-stone-700">
                        {memory.summary}
                      </div>
                    ) : (
                      <div className="rounded-xl bg-white p-4 text-sm font-medium text-stone-400">该孩子档案暂无记忆内容。</div>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-stone-50 p-10 text-center text-sm font-bold text-stone-400">暂无前台记忆。</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {resetTarget ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#5e17eb]">Reset Password</p>
                <h2 className="mt-2 text-2xl font-black text-stone-900">重置密码</h2>
                <p className="mt-1 text-sm text-stone-500">账号：{resetTarget.username}</p>
              </div>
              <button className="rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700" onClick={() => setResetTarget(null)} type="button">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleResetPassword}>
              <input
                className={`w-full ${inputClass}`}
                placeholder="输入新密码"
                required
                type="password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
              />
              <div className="flex justify-end gap-3">
                <button className="rounded-xl border border-stone-200 px-5 py-2.5 text-sm font-bold text-stone-700 hover:bg-stone-50" onClick={() => setResetTarget(null)} type="button">
                  取消
                </button>
                <button className="rounded-xl bg-[#5e17eb] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#5112d1] disabled:cursor-not-allowed disabled:opacity-60" disabled={Boolean(savingId)} type="submit">
                  {savingId ? "重置中..." : "确认重置"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminUsersPage;
