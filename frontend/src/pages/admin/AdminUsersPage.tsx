import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { adminApi, User } from "../../services/api";
import TopAlert from "../../components/TopAlert";
import { RootState } from "../../store";

type EditableUser = Pick<User, "_id" | "username" | "role" | "city" | "region" | "childGrade" | "createdAt">;
type UserModalMode = "create" | "edit" | null;

type UserFormState = {
  username: string;
  role: "admin" | "user";
  city: string;
  region: string;
  childGrade: string;
  password: string;
};

const EMPTY_USER_FORM: UserFormState = {
  username: "",
  role: "user",
  city: "",
  region: "",
  childGrade: "",
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
    role: row.role,
    city: row.city,
    region: row.region,
    childGrade: row.childGrade,
    createdAt: row.createdAt,
  };
}

const inputClass =
  "rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-900 caret-[#5e17eb] placeholder:text-stone-400 focus:border-[#5e17eb] focus:ring-4 focus:ring-[#5e17eb]/5";
const PAGE_SIZE = 20;

const AdminUsersPage: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.user);
  const myId = (user as any)?._id || (user as any)?.id || "";

  const [items, setItems] = useState<EditableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [modalMode, setModalMode] = useState<UserModalMode>(null);
  const [editingUser, setEditingUser] = useState<EditableUser | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_USER_FORM);
  const [resetTarget, setResetTarget] = useState<EditableUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

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
    if (!key) return items;
    return items.filter((row) => `${row.username} ${row.role} ${row.city || ""} ${row.region || ""} ${row.childGrade || ""}`.toLowerCase().includes(key));
  }, [items, keyword]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [keyword]);

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
      role: row.role,
      city: row.city || "",
      region: row.region || "",
      childGrade: row.childGrade || "",
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
          password,
          role: form.role,
          city: form.city.trim(),
          region: form.region.trim(),
          childGrade: form.childGrade.trim(),
        });
        await loadUsers();
      } else if (modalMode === "edit" && editingUser) {
        const response = await adminApi.updateUser(editingUser._id, {
          username,
          role: form.role,
          city: form.city.trim(),
          region: form.region.trim(),
          childGrade: form.childGrade.trim(),
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
        <div className="flex flex-col gap-4 border-b border-stone-100 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">用户列表</div>
          <div className="relative">
            <input
              className="w-80 max-w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-900 caret-[#5e17eb] placeholder:text-stone-400 transition-all focus:border-[#5e17eb] focus:ring-4 focus:ring-[#5e17eb]/5"
              placeholder="搜索用户名 / 角色 / 城市 / 区域 / 年级"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-base">search</span>
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
            <table className="w-full min-w-[1260px] text-left">
              <thead className="bg-white text-stone-500 uppercase text-[10px] font-black tracking-[0.2em]">
                <tr>
                  <th className="px-6 py-4">用户名</th>
                  <th className="px-6 py-4">角色</th>
                  <th className="px-6 py-4">城市</th>
                  <th className="px-6 py-4">区域</th>
                  <th className="px-6 py-4">孩子年级</th>
                  <th className="px-6 py-4">注册时间</th>
                  <th className="px-6 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {pagedItems.map((row) => {
                  const saving = savingId === row._id;
                  const deleting = deletingId === row._id;
                  const isMe = myId && String(myId) === String(row._id);
                  return (
                    <tr key={row._id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-stone-900">{row.username}</div>
                        <div className="text-xs text-stone-400">{row._id.slice(-8).toUpperCase()}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black ${row.role === "admin" ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}>
                          {row.role === "admin" ? "管理员" : "用户"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <input
                          className={`w-40 ${inputClass}`}
                          value={row.city || ""}
                          placeholder="填写城市"
                          onChange={(event) => updateLocal(row._id, { city: event.target.value })}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input
                          className={`w-40 ${inputClass}`}
                          value={row.region || ""}
                          placeholder="填写区域"
                          onChange={(event) => updateLocal(row._id, { region: event.target.value })}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input
                          className={`w-40 ${inputClass}`}
                          value={row.childGrade || ""}
                          placeholder="填写年级"
                          onChange={(event) => updateLocal(row._id, { childGrade: event.target.value })}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-stone-900">{formatDateTime(row.createdAt)}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleQuickSave(row)}
                            disabled={saving || deleting}
                            className="px-3 py-2 rounded-xl bg-[#5e17eb] text-white text-xs font-bold hover:bg-[#5112d1] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            type="button"
                          >
                            {saving ? "保存中..." : "保存"}
                          </button>
                          <button
                            onClick={() => openEdit(row)}
                            disabled={saving || deleting}
                            className="px-3 py-2 rounded-xl border border-stone-200 text-stone-700 text-xs font-bold hover:bg-stone-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            type="button"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => {
                              setError(null);
                              setResetTarget(row);
                              setResetPassword("");
                            }}
                            disabled={saving || deleting}
                            className="px-3 py-2 rounded-xl border border-[#5e17eb]/20 text-[#5e17eb] text-xs font-bold hover:bg-[#f7f3ff] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            type="button"
                          >
                            重置密码
                          </button>
                          <button
                            onClick={() => handleDelete(row)}
                            disabled={saving || deleting || isMe}
                            className="px-3 py-2 rounded-xl border border-red-100 text-red-500 text-xs font-bold hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={isMe ? "不能删除当前登录账号" : "删除用户"}
                            type="button"
                          >
                            {deleting ? "删除中..." : "删除"}
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
            <div>第 {currentPage}/{totalPages} 页，每页 {PAGE_SIZE} 条，共 {filteredItems.length} 条</div>
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
              <input className={`${inputClass} md:col-span-2`} placeholder="孩子年级" value={form.childGrade} onChange={(event) => setForm((prev) => ({ ...prev, childGrade: event.target.value }))} />
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
