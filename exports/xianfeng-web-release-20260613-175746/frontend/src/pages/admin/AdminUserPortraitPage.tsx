import React, { useEffect, useMemo, useState } from "react";
import { adminApi, User, UserPageStat, UserPortraitResponse } from "../../services/api";
import TopAlert from "../../components/TopAlert";

type BucketItem = {
  label: string;
  count: number;
};

type DonutSlice = {
  label: string;
  count: number;
  color: string;
};

const DONUT_COLORS = ["#5e17eb", "#8b5cf6", "#22c55e", "#fb7185", "#f59e0b", "#14b8a6"];

function normalizeText(value?: string): string {
  return String(value || "").trim();
}

function formatDateLabel(value: string): string {
  return value || "未命名页面";
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

function buildConicGradient(items: DonutSlice[]): string {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (!total) {
    return "conic-gradient(#e7e5e4 0deg 360deg)";
  }
  let current = 0;
  const stops = items.map((item) => {
    const start = current;
    current += (item.count / total) * 360;
    return `${item.color} ${start}deg ${current}deg`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function polylinePoints(rows: Array<{ count: number }>, width: number, height: number): string {
  if (!rows.length) return "";
  const max = rows.reduce((peak, item) => Math.max(peak, item.count), 1);
  return rows
    .map((item, index) => {
      const x = rows.length === 1 ? width / 2 : (index / (rows.length - 1)) * width;
      const y = height - (item.count / max) * (height - 16) - 8;
      return `${x},${y}`;
    })
    .join(" ");
}

function HorizontalBucketList({
  title,
  items,
  color,
}: {
  title: string;
  items: BucketItem[];
  color: string;
}) {
  const max = items[0]?.count || 1;
  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-6">
      <h3 className="text-lg font-black text-stone-900">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-200 px-4 py-6 text-sm text-stone-500">暂无数据</div>
        ) : (
          items.map((item) => (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between text-xs font-bold text-stone-600">
                <span>{item.label}</span>
                <span>{item.count}</span>
              </div>
              <div className="h-2 rounded-full bg-stone-100">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${Math.max(8, Math.round((item.count / max) * 100))}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DonutChartCard({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: Array<{ label: string; count: number }>;
}) {
  const slices = items.map((item, index) => ({
    ...item,
    color: DONUT_COLORS[index % DONUT_COLORS.length],
  }));
  const total = slices.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-stone-900">{title}</h3>
          <p className="mt-1 text-xs text-stone-500">{subtitle}</p>
        </div>
        <div className="rounded-full bg-[#f4efff] px-3 py-1 text-[11px] font-black text-[#5e17eb]">
          {formatNumber(total)}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-center">
        <div
          className="relative h-36 w-36 shrink-0 rounded-full"
          style={{ background: buildConicGradient(slices) }}
        >
          <div className="absolute inset-[18px] flex items-center justify-center rounded-full bg-white text-center">
            <div>
              <div className="text-2xl font-black text-stone-900">{formatNumber(total)}</div>
              <div className="text-[11px] font-bold text-stone-500">总量</div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-3">
          {slices.map((item) => {
            const percent = total ? Math.round((item.count / total) * 100) : 0;
            return (
              <div key={item.label} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-sm font-bold text-stone-700">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </div>
                <div className="text-sm font-black text-stone-900">
                  {item.count} <span className="ml-1 text-xs font-bold text-stone-500">{percent}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TrendLineCard({ items }: { items: Array<{ month: string; count: number }> }) {
  const points = polylinePoints(items, 520, 180);

  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-6 lg:col-span-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-stone-900">月度新增趋势（近 8 个月）</h3>
          <p className="mt-1 text-xs text-stone-500">用折线观察注册节奏，而不是只看柱状块。</p>
        </div>
        <div className="rounded-full bg-[#f4efff] px-3 py-1 text-[11px] font-black text-[#5e17eb]">
          {items.length} 个月
        </div>
      </div>

      {items.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-stone-200 px-4 py-10 text-sm text-stone-500">暂无可用创建时间数据</div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <div className="min-w-[560px]">
            <svg viewBox="0 0 520 180" className="h-52 w-full">
              <defs>
                <linearGradient id="portraitTrendStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#5e17eb" />
                  <stop offset="100%" stopColor="#9c74f6" />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3].map((index) => {
                const y = 20 + index * 40;
                return <line key={index} x1="0" y1={y} x2="520" y2={y} stroke="#f0ece7" strokeDasharray="4 6" />;
              })}
              <polyline
                fill="none"
                stroke="url(#portraitTrendStroke)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
              />
              {items.map((item, index) => {
                const max = items.reduce((peak, row) => Math.max(peak, row.count), 1);
                const x = items.length === 1 ? 260 : (index / (items.length - 1)) * 520;
                const y = 180 - (item.count / max) * (180 - 16) - 8;
                return (
                  <g key={item.month}>
                    <circle cx={x} cy={y} r="6" fill="#5e17eb" />
                    <circle cx={x} cy={y} r="12" fill="#5e17eb" fillOpacity="0.12" />
                    <text x={x} y={y - 14} textAnchor="middle" fontSize="11" fontWeight="800" fill="#1c1917">
                      {item.count}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {items.map((item) => (
                <div key={item.month} className="rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3">
                  <div className="text-[11px] font-black text-stone-500">{item.month}</div>
                  <div className="mt-2 text-lg font-black text-stone-900">{item.count} 人</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_PORTRAIT: UserPortraitResponse = {
  stats: {
    total: 0,
    admins: 0,
    users: 0,
    completed: 0,
    completionRate: 0,
    totalPageViews: 0,
    totalUv: 0,
    totalPcViews: 0,
  },
  roleBreakdown: [],
  cityTop: [],
  gradeTop: [],
  regionTop: [],
  monthlyTrend: [],
  deviceBreakdown: [],
  pageStats: [],
};

function getFriendlyPortraitError(loadError: any): string | null {
  const status = Number(loadError?.response?.status || 0);
  if (status === 404) return null;
  return loadError?.response?.data?.message || loadError?.message || "获取用户访问画像失败";
}

const AdminUserPortraitPage: React.FC = () => {
  const [items, setItems] = useState<User[]>([]);
  const [portrait, setPortrait] = useState<UserPortraitResponse>(EMPTY_PORTRAIT);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingPortrait, setLoadingPortrait] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");

  useEffect(() => {
    const loadUsers = async () => {
      setLoadingUsers(true);
      setError(null);
      try {
        const response = await adminApi.getUsers();
        setItems(response.data || []);
      } catch (loadError: any) {
        if (Number(loadError?.response?.status || 0) === 404) {
          setItems([]);
        } else {
          setError(loadError?.response?.data?.message || loadError?.message || "获取用户画像数据失败");
        }
      } finally {
        setLoadingUsers(false);
      }
    };
    void loadUsers();
  }, []);

  useEffect(() => {
    const loadPortrait = async () => {
      setLoadingPortrait(true);
      setError(null);
      try {
        const response = await adminApi.getUserPortrait({
          role: roleFilter,
          city: cityFilter,
          grade: gradeFilter,
        });
        setPortrait(response.data || EMPTY_PORTRAIT);
      } catch (loadError: any) {
        setPortrait(EMPTY_PORTRAIT);
        const message = getFriendlyPortraitError(loadError);
        if (message) setError(message);
      } finally {
        setLoadingPortrait(false);
      }
    };
    void loadPortrait();
  }, [roleFilter, cityFilter, gradeFilter]);

  const cityOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(items.map((row) => normalizeText(row.city) || "未填写")))];
  }, [items]);

  const gradeOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(items.map((row) => normalizeText(row.childGrade) || "未填写")))];
  }, [items]);

  const loading = loadingUsers || loadingPortrait;
  const stats = portrait.stats || EMPTY_PORTRAIT.stats;

  return (
    <div className="space-y-8">
      <TopAlert message={error} onClose={() => setError(null)} />

      <section className="grid grid-cols-1 gap-5 md:grid-cols-3 xl:grid-cols-6">
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
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="text-xs font-bold text-stone-500">访问次数 PV</div>
          <div className="mt-2 text-4xl font-black text-stone-900">{stats.totalPageViews}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="text-xs font-bold text-stone-500">访问用户 UV / PC</div>
          <div className="mt-2 text-4xl font-black text-stone-900">{stats.totalUv}</div>
          <div className="mt-1 text-xs text-stone-500">PC 访问 {stats.totalPcViews} 次</div>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <select className="admin-form-select rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | "admin" | "user")}>
            <option value="all">全部角色</option>
            <option value="admin">管理员</option>
            <option value="user">普通用户</option>
          </select>
          <select className="admin-form-select rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm" value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
            {cityOptions.map((item) => (
              <option key={item} value={item}>{item === "all" ? "全部城市" : item}</option>
            ))}
          </select>
          <select className="admin-form-select rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm" value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}>
            {gradeOptions.map((item) => (
              <option key={item} value={item}>{item === "all" ? "全部年级" : item}</option>
            ))}
          </select>
        </div>
      </section>

      {loading ? (
        <section className="rounded-3xl border border-stone-200 bg-white p-10">
          <div className="flex items-center justify-center py-20">
            <div className="relative h-12 w-12">
              <div className="absolute inset-0 rounded-full border-4 border-[#5e17eb]/10" />
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-t-[#5e17eb]" />
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-4">
            <DonutChartCard title="角色占比" subtitle="看管理员与普通用户的结构。" items={portrait.roleBreakdown} />
            <DonutChartCard title="设备访问分布" subtitle="聚合页面访问中的 PC / 移动端结构。" items={portrait.deviceBreakdown} />
            <TrendLineCard items={portrait.monthlyTrend} />
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <HorizontalBucketList title="城市分布 TOP" items={portrait.cityTop} color="#5e17eb" />
            <HorizontalBucketList title="年级分布 TOP" items={portrait.gradeTop} color="#7b49ef" />
            <HorizontalBucketList title="区域分布 TOP" items={portrait.regionTop} color="#9c74f6" />
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-lg font-black text-stone-900">页面访问明细</h3>
                <p className="mt-1 text-sm text-stone-500">展示用户实际访问的具体页面、访问次数、UV 和 PC 访问量。</p>
              </div>
              <div className="rounded-full bg-[#f4efff] px-3 py-1 text-[11px] font-black text-[#5e17eb]">
                共 {portrait.pageStats.length} 个高频页面
              </div>
            </div>

            {portrait.pageStats.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-stone-200 px-4 py-8 text-sm text-stone-500">当前还没有用户访问页面数据，刷新后继续浏览页面就会开始累积。</div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[920px] text-left">
                  <thead className="bg-white text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">
                    <tr>
                      <th className="px-4 py-3">页面</th>
                      <th className="px-4 py-3">路径</th>
                      <th className="px-4 py-3">访问次数 PV</th>
                      <th className="px-4 py-3">访问用户 UV</th>
                      <th className="px-4 py-3">PC</th>
                      <th className="px-4 py-3">移动端</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {portrait.pageStats.map((item: UserPageStat) => (
                      <tr key={item.pagePath} className="hover:bg-stone-50/60">
                        <td className="px-4 py-4">
                          <div className="font-bold text-stone-900">{formatDateLabel(item.pageTitle)}</div>
                        </td>
                        <td className="px-4 py-4 text-sm font-medium text-stone-500">{item.pagePath}</td>
                        <td className="px-4 py-4 text-sm font-black text-stone-900">{formatNumber(item.pv)}</td>
                        <td className="px-4 py-4 text-sm font-black text-stone-900">{formatNumber(item.uv)}</td>
                        <td className="px-4 py-4 text-sm font-black text-[#5e17eb]">{formatNumber(item.pc)}</td>
                        <td className="px-4 py-4 text-sm font-black text-stone-700">{formatNumber(item.mobile)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default AdminUserPortraitPage;
