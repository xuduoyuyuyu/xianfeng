import React, { useEffect, useMemo, useState } from "react";
import { adminApi, User } from "../../services/api";
import TopAlert from "../../components/TopAlert";

type BucketItem = {
  label: string;
  count: number;
};

function normalizeText(value?: string): string {
  return String(value || "").trim();
}

function topBuckets(rows: User[], getter: (row: User) => string, max = 6): BucketItem[] {
  const map: Record<string, number> = {};
  rows.forEach((row) => {
    const key = normalizeText(getter(row)) || "未填写";
    map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

const AdminUserPortraitPage: React.FC = () => {
  const [items, setItems] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getUsers();
      setItems(response.data || []);
    } catch (loadError: any) {
      setError(loadError?.response?.data?.message || loadError?.message || "获取用户画像数据失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const cityOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(items.map((row) => normalizeText(row.city) || "未填写")))];
  }, [items]);

  const gradeOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(items.map((row) => normalizeText(row.childGrade) || "未填写")))];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((row) => {
      const roleOk = roleFilter === "all" || row.role === roleFilter;
      const cityVal = normalizeText(row.city) || "未填写";
      const gradeVal = normalizeText(row.childGrade) || "未填写";
      const cityOk = cityFilter === "all" || cityVal === cityFilter;
      const gradeOk = gradeFilter === "all" || gradeVal === gradeFilter;
      return roleOk && cityOk && gradeOk;
    });
  }, [items, roleFilter, cityFilter, gradeFilter]);

  const stats = useMemo(() => {
    const total = filteredItems.length;
    const admins = filteredItems.filter((row) => row.role === "admin").length;
    const users = total - admins;
    const completed = filteredItems.filter((row) => normalizeText(row.city) && normalizeText(row.region) && normalizeText(row.childGrade)).length;
    const completionRate = total ? Math.round((completed / total) * 100) : 0;
    return { total, admins, users, completed, completionRate };
  }, [filteredItems]);

  const cityTop = useMemo(() => topBuckets(filteredItems, (row) => row.city ?? ""), [filteredItems]);
  const gradeTop = useMemo(() => topBuckets(filteredItems, (row) => row.childGrade ?? ""), [filteredItems]);
  const regionTop = useMemo(() => topBuckets(filteredItems, (row) => row.region ?? ""), [filteredItems]);
  const monthlyTrend = useMemo(() => {
    const map: Record<string, number> = {};
    filteredItems.forEach((row) => {
      const raw = row.createdAt ? new Date(row.createdAt) : null;
      if (!raw || Number.isNaN(raw.getTime())) return;
      const key = `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, "0")}`;
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-8);
  }, [filteredItems]);

  const maxCity = cityTop[0]?.count || 1;
  const maxGrade = gradeTop[0]?.count || 1;
  const maxRegion = regionTop[0]?.count || 1;
  const maxTrend = monthlyTrend.reduce((max, row) => Math.max(max, row.count), 1);

  return (
    <div className="space-y-8">
      <TopAlert message={error} onClose={() => setError(null)} />

      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <select className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm admin-form-select" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | "admin" | "user")}>
            <option value="all">全部角色</option>
            <option value="admin">管理员</option>
            <option value="user">普通用户</option>
          </select>
          <select className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm admin-form-select" value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
            {cityOptions.map((item) => (
              <option key={item} value={item}>{item === "all" ? "全部城市" : item}</option>
            ))}
          </select>
          <select className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm admin-form-select" value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}>
            {gradeOptions.map((item) => (
              <option key={item} value={item}>{item === "all" ? "全部年级" : item}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 md:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="text-xs font-bold text-stone-500">总用户数</div>
          <div className="mt-2 text-4xl font-black text-stone-900">{stats.total}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="text-xs font-bold text-stone-500">管理员</div>
          <div className="mt-2 text-4xl font-black text-emerald-600">{stats.admins}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="text-xs font-bold text-stone-500">普通用户</div>
          <div className="mt-2 text-4xl font-black text-[#5e17eb]">{stats.users}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="text-xs font-bold text-stone-500">资料完整度</div>
          <div className="mt-2 text-4xl font-black text-stone-900">{stats.completionRate}%</div>
          <div className="mt-1 text-xs text-stone-500">{stats.completed}/{stats.total} 已完善城市/区域/年级</div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-stone-200 bg-white p-6">
          <h3 className="text-lg font-black text-stone-900">城市分布 TOP</h3>
          <div className="mt-4 space-y-3">
            {cityTop.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between text-xs font-bold text-stone-600">
                  <span>{item.label}</span>
                  <span>{item.count}</span>
                </div>
                <div className="h-2 rounded-full bg-stone-100">
                  <div className="h-2 rounded-full bg-[#5e17eb]" style={{ width: `${Math.max(8, Math.round((item.count / maxCity) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white p-6">
          <h3 className="text-lg font-black text-stone-900">年级分布 TOP</h3>
          <div className="mt-4 space-y-3">
            {gradeTop.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between text-xs font-bold text-stone-600">
                  <span>{item.label}</span>
                  <span>{item.count}</span>
                </div>
                <div className="h-2 rounded-full bg-stone-100">
                  <div className="h-2 rounded-full bg-[#7b49ef]" style={{ width: `${Math.max(8, Math.round((item.count / maxGrade) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white p-6">
          <h3 className="text-lg font-black text-stone-900">区域分布 TOP</h3>
          <div className="mt-4 space-y-3">
            {regionTop.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between text-xs font-bold text-stone-600">
                  <span>{item.label}</span>
                  <span>{item.count}</span>
                </div>
                <div className="h-2 rounded-full bg-stone-100">
                  <div className="h-2 rounded-full bg-[#9c74f6]" style={{ width: `${Math.max(8, Math.round((item.count / maxRegion) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white p-6">
        <h3 className="text-lg font-black text-stone-900">月度新增趋势（近 8 个月）</h3>
        <div className="mt-5">
          {monthlyTrend.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-200 px-4 py-6 text-sm text-stone-500">暂无可用创建时间数据</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {monthlyTrend.map((item) => (
                <div key={item.month} className="rounded-xl border border-stone-100 bg-white p-3">
                  <div className="text-[11px] font-bold text-stone-500">{item.month}</div>
                  <div className="mt-2 h-24 rounded-lg bg-white px-2 py-2 flex items-end">
                    <div className="w-full rounded-md bg-[#5e17eb]" style={{ height: `${Math.max(8, Math.round((item.count / maxTrend) * 100))}%` }} />
                  </div>
                  <div className="mt-2 text-xs font-black text-stone-700">{item.count} 人</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default AdminUserPortraitPage;
