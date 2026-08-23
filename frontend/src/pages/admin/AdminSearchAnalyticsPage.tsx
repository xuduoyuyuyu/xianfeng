import React, { useEffect, useMemo, useState } from "react";
import {
  adminApi,
  SearchAnalyticsEventListResponse,
  SearchAnalyticsResponse,
  SearchAnalyticsUserDetailResponse,
  SearchAnalyticsUserListResponse,
} from "../../services/api";

const RANGE_OPTIONS: Array<7 | 30 | 90> = [7, 30, 90];
const TYPE_LABELS: Record<string, string> = {
  programs: "节目",
  books: "书籍",
  materials: "资料",
  topics: "请教",
  experts: "智库",
};

function percent(value: number): string {
  return `${Math.round(Math.max(0, value || 0) * 100)}%`;
}

function dateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}

function displayName(user: SearchAnalyticsUserListResponse["items"][number]["user"]): string {
  return user?.name || user?.username || "账号资料已删除";
}

const AdminSearchAnalyticsPage: React.FC = () => {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [view, setView] = useState<"stream" | "overview" | "users">("stream");
  const [data, setData] = useState<SearchAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [users, setUsers] = useState<SearchAnalyticsUserListResponse | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchAnalyticsUserDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [stream, setStream] = useState<SearchAnalyticsEventListResponse | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamQuery, setStreamQuery] = useState("");
  const [streamIdentity, setStreamIdentity] = useState<"all" | "identified" | "anonymous">("all");
  const [streamPage, setStreamPage] = useState(1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    adminApi.getSearchAnalytics(days)
      .then((response) => {
        if (active) setData(response.data);
      })
      .catch(() => {
        if (active) setError("搜索洞察加载失败，请稍后重试");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [days]);

  useEffect(() => {
    if (view !== "stream") return;
    let active = true;
    const timer = window.setTimeout(() => {
      setStreamLoading(true);
      adminApi.getSearchAnalyticsEvents({ days, page: streamPage, pageSize: 100, query: streamQuery.trim(), identity: streamIdentity })
        .then((response) => {
          if (active) setStream(response.data);
        })
        .finally(() => {
          if (active) setStreamLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [days, streamIdentity, streamPage, streamQuery, view]);

  useEffect(() => {
    if (view !== "users") return;
    let active = true;
    const timer = window.setTimeout(() => {
      setUsersLoading(true);
      adminApi.getSearchAnalyticsUsers({ days, search: userSearch.trim(), pageSize: 50 })
        .then((response) => {
          if (active) setUsers(response.data);
        })
        .finally(() => {
          if (active) setUsersLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [days, userSearch, view]);

  const openUser = (userId: string, page = 1) => {
    setDetailLoading(true);
    setSelectedUser(null);
    adminApi.getSearchAnalyticsUser(userId, { days, page, pageSize: 200 })
      .then((response) => setSelectedUser(response.data))
      .finally(() => setDetailLoading(false));
  };

  const trendMax = useMemo(() => Math.max(1, ...(data?.dailyTrend || []).map((item) => item.searches)), [data]);
  const resultTypeMax = useMemo(() => Math.max(1, ...(data?.resultTypeDistribution || []).map((item) => item.count)), [data]);
  const wordMax = useMemo(() => Math.max(1, ...(data?.wordCloud || []).map((item) => item.count)), [data]);

  const summaryCards = data ? [
    { label: "搜索次数", value: data.summary.totalSearches, note: `近 ${days} 天稳定搜索` },
    { label: "搜索会话", value: data.summary.uniqueSessions, note: "匿名安装标识去重" },
    { label: "独立关键词", value: data.summary.uniqueQueries, note: "不含敏感隐藏项" },
    { label: "已识别用户", value: data.summary.identifiedUsers, note: `${percent(data.summary.identifiedRate)} 搜索已关联` },
    { label: "无结果率", value: percent(data.summary.zeroResultRate), note: `${data.summary.zeroResultSearches} 次无结果` },
    { label: "结果点击率", value: percent(data.summary.clickThroughRate), note: `${data.summary.clickedSearches} 次产生点击` },
  ] : [];

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#7c5fd2]">Search insights</p>
          <h1 className="text-4xl font-black tracking-tight text-stone-900">搜索洞察</h1>
          <p className="mt-2 text-sm text-stone-500">从搜索流水、每日需求和用户行为三个视角观察搜索，以及结果是否满足需求。</p>
        </div>
        <div className="flex rounded-xl border border-stone-200 bg-white p-1 shadow-sm">
          {RANGE_OPTIONS.map((option) => (
            <button key={option} type="button" onClick={() => setDays(option)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${days === option ? "bg-[#5e17eb] text-white" : "text-stone-500 hover:bg-[#f5f1ff]"}`}>
              {option} 天
            </button>
          ))}
        </div>
      </div>

      <div className="inline-flex rounded-xl bg-stone-100 p-1">
        {([['stream', '搜索流水'], ['overview', '趋势总览'], ['users', '用户行为']] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setView(key)} className={`rounded-lg px-5 py-2.5 text-sm font-bold ${view === key ? "bg-white text-[#5e17eb] shadow-sm" : "text-stone-500"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-stone-100 bg-white"><div className="h-11 w-11 animate-spin rounded-full border-4 border-[#5e17eb]/15 border-t-[#5e17eb]" /></div>}
      {!loading && error && <div className="rounded-2xl border border-red-100 bg-red-50 px-6 py-5 text-sm font-medium text-red-700">{error}</div>}

      {!loading && !error && data && view === "stream" && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-stone-100 bg-white p-5 shadow-sm"><p className="text-sm text-stone-500">全部搜索</p><p className="mt-2 text-3xl font-black">{data.summary.totalSearches}</p></div>
            <div className="rounded-2xl border border-stone-100 bg-white p-5 shadow-sm"><p className="text-sm text-stone-500">独立关键词</p><p className="mt-2 text-3xl font-black">{data.summary.uniqueQueries}</p></div>
            <div className="rounded-2xl border border-stone-100 bg-white p-5 shadow-sm"><p className="text-sm text-stone-500">已关联账号</p><p className="mt-2 text-3xl font-black">{data.summary.identifiedSearches}</p></div>
            <div className="rounded-2xl border border-stone-100 bg-white p-5 shadow-sm"><p className="text-sm text-stone-500">匿名搜索</p><p className="mt-2 text-3xl font-black">{Math.max(0, data.summary.totalSearches - data.summary.identifiedSearches)}</p></div>
          </div>
          <section className="overflow-hidden rounded-2xl border border-stone-100 bg-white shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-100 px-6 py-5">
              <div><h2 className="text-xl font-black">全量搜索流水</h2><p className="mt-1 text-xs text-stone-400">逐条展示每一次有效搜索，单次出现的关键词也不会隐藏。</p></div>
              <div className="flex flex-wrap gap-2">
                <select value={streamIdentity} onChange={(event) => { setStreamIdentity(event.target.value as typeof streamIdentity); setStreamPage(1); }} className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm"><option value="all">全部身份</option><option value="identified">已关联账号</option><option value="anonymous">匿名安装</option></select>
                <input value={streamQuery} onChange={(event) => { setStreamQuery(event.target.value); setStreamPage(1); }} placeholder="搜索全部关键词" className="w-60 rounded-xl border border-stone-200 px-4 py-2.5 text-sm outline-none focus:border-[#8a5be8]" />
              </div>
            </div>
            {streamLoading ? <div className="py-16 text-center text-sm text-stone-400">正在读取搜索流水…</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-stone-50 text-xs text-stone-400"><tr><th className="px-6 py-3">搜索时间</th><th className="px-4 py-3">用户 / 匿名安装</th><th className="px-4 py-3">搜索关键词</th><th className="px-4 py-3 text-right">结果</th><th className="px-6 py-3">后续行为</th></tr></thead><tbody className="divide-y divide-stone-100">{(stream?.items || []).map((item) => <tr key={item.id} className={item.user?.id ? "cursor-pointer hover:bg-[#faf8ff]" : ""} onClick={() => item.user?.id && openUser(item.user.id)}><td className="px-6 py-4 text-xs text-stone-500">{dateTime(item.searchedAt)}</td><td className="px-4 py-4"><b>{item.user ? (item.user.name || item.user.username) : item.anonymousKey}</b><p className="mt-1 text-xs text-stone-400">{item.user ? `UID ${item.user.publicUid || "未生成"} · ${item.user.mobile || "无手机号"}` : "尚未同意关联账号"}</p></td><td className="px-4 py-4 text-base font-black text-stone-900">{item.query}</td><td className={`px-4 py-4 text-right font-bold ${item.totalResults ? "text-stone-700" : "text-amber-700"}`}>{item.totalResults}</td><td className="px-6 py-4 text-xs text-stone-500">{item.clickedAt ? `点击${TYPE_LABELS[item.clickedType] || item.clickedType}` : "未点击结果"}</td></tr>)}</tbody></table>{!stream?.items.length && <div className="py-16 text-center text-sm text-stone-400">当前筛选没有搜索记录。</div>}<div className="flex items-center justify-end gap-3 border-t border-stone-100 px-6 py-3 text-xs text-stone-400"><span>本页 {stream?.items.length || 0} 条，共 {stream?.total || 0} 条</span><button type="button" disabled={streamPage <= 1} onClick={() => setStreamPage((page) => Math.max(1, page - 1))} className="rounded-lg border border-stone-200 px-3 py-1.5 disabled:opacity-30">上一页</button><button type="button" disabled={!stream || streamPage * stream.pageSize >= stream.total} onClick={() => setStreamPage((page) => page + 1)} className="rounded-lg border border-stone-200 px-3 py-1.5 disabled:opacity-30">下一页</button></div></div>}
          </section>
        </>
      )}

      {!loading && !error && data && view === "overview" && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            {summaryCards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-stone-100 bg-white p-5 shadow-sm">
                <p className="text-sm font-medium text-stone-500">{card.label}</p>
                <p className="mt-3 text-3xl font-black tracking-tight text-stone-900">{card.value}</p>
                <p className="mt-2 text-xs text-stone-400">{card.note}</p>
              </div>
            ))}
          </div>

          {data.summary.totalSearches === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#cfc1f2] bg-[#faf8ff] px-8 py-16 text-center">
              <span className="material-symbols-outlined text-4xl text-[#7c5fd2]">search_insights</span>
              <h2 className="mt-3 text-xl font-black text-stone-800">暂无正式搜索数据</h2>
              <p className="mt-2 text-sm text-stone-500">统计从新版小程序上线后开始，历史访问日志不会混入正式口径。</p>
            </div>
          ) : (
            <>
              <section className="rounded-2xl border border-stone-100 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-black text-stone-900">搜索趋势</h2>
                <p className="mt-1 text-xs text-stone-400">紫色为搜索次数，深色标记产生结果点击的日期。</p>
                <div className="mt-6 flex h-48 items-end gap-2 overflow-x-auto pb-1">
                  {data.dailyTrend.map((item) => (
                    <div key={item.date} className="group flex min-w-8 flex-1 flex-col items-center justify-end gap-2">
                      <div className="text-[10px] font-semibold text-stone-400 opacity-0 group-hover:opacity-100">{item.searches}</div>
                      <div className={`w-full min-w-5 rounded-t-md ${item.clicks ? "bg-[#5e17eb]" : "bg-[#c9b5f7]"}`} style={{ height: `${Math.max(8, (item.searches / trendMax) * 132)}px` }} title={`${item.date}：${item.searches} 次搜索`} />
                      <span className="text-[10px] text-stone-400">{item.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-stone-100 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><h2 className="text-xl font-black text-stone-900">关键词词云</h2><p className="mt-1 text-xs text-stone-400">包含单次搜索词；敏感内容隐藏项不进入词云。</p></div>
                  <p className="text-xs text-stone-400">每日汇总已覆盖 {data.dailyKeywords.length} 天</p>
                </div>
                <div className="mt-6 flex min-h-36 flex-wrap content-center items-center justify-center gap-x-5 gap-y-3 rounded-2xl bg-[#faf8ff] p-6">
                  {data.wordCloud.map((item, index) => (
                    <span key={item.query} title={`${item.count} 次`} className={index % 3 === 0 ? "text-[#5e17eb]" : index % 3 === 1 ? "text-[#8a5be8]" : "text-[#463a65]"} style={{ fontSize: `${14 + Math.round((item.count / wordMax) * 24)}px`, fontWeight: item.count === wordMax ? 900 : 700 }}>{item.query}</span>
                  ))}
                </div>
              </section>

              <div className="grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
                <section className="overflow-hidden rounded-2xl border border-stone-100 bg-white shadow-sm">
                  <div className="border-b border-stone-100 px-6 py-5"><h2 className="text-xl font-black text-stone-900">热门搜索词</h2><p className="mt-1 text-xs text-stone-400">稳定榜单仍只展示至少出现 {data.privacy.minimumQueryCount} 次的聚合词。</p></div>
                  <table className="w-full text-left text-sm"><thead className="bg-stone-50 text-xs text-stone-400"><tr><th className="px-6 py-3">关键词</th><th className="px-4 py-3 text-right">搜索</th><th className="px-4 py-3 text-right">点击率</th><th className="px-6 py-3 text-right">无结果</th></tr></thead><tbody className="divide-y divide-stone-100">{data.topQueries.map((item) => <tr key={item.query}><td className="px-6 py-3.5 font-semibold text-stone-800">{item.query}</td><td className="px-4 py-3.5 text-right">{item.count}</td><td className="px-4 py-3.5 text-right">{percent(item.count ? item.clicks / item.count : 0)}</td><td className="px-6 py-3.5 text-right">{item.zeroResults}</td></tr>)}</tbody></table>
                </section>
                <div className="space-y-6">
                  <section className="rounded-2xl border border-stone-100 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">上升关键词</h2><div className="mt-4 space-y-3">{data.risingQueries.length ? data.risingQueries.map((item) => <div key={item.query} className="flex justify-between rounded-xl bg-[#f7f3ff] px-4 py-3"><b>{item.query}</b><b className="text-[#5e17eb]">+{item.change}</b></div>) : <p className="text-sm text-stone-400">当前周期暂无明显上升词。</p>}</div></section>
                  <section className="rounded-2xl border border-stone-100 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">无结果关键词</h2><div className="mt-4 space-y-3">{data.zeroResultQueries.length ? data.zeroResultQueries.map((item) => <div key={item.query} className="flex justify-between border-b border-stone-100 pb-3"><span>{item.query}</span><b className="text-amber-700">{item.count} 次</b></div>) : <p className="text-sm text-stone-400">没有重复出现的无结果关键词。</p>}</div></section>
                </div>
              </div>

              <section className="rounded-2xl border border-stone-100 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">内容命中分布</h2><div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">{data.resultTypeDistribution.map((item) => <div key={item.type} className="rounded-xl bg-stone-50 p-4"><div className="flex justify-between text-sm"><b>{TYPE_LABELS[item.type] || item.type}</b><b>{item.count}</b></div><div className="mt-3 h-2 rounded-full bg-stone-200"><div className="h-full rounded-full bg-[#7b48ed]" style={{ width: `${(item.count / resultTypeMax) * 100}%` }} /></div></div>)}</div></section>
            </>
          )}
        </>
      )}

      {!loading && !error && data && view === "users" && (
        <>
          <div className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-stone-100 bg-white p-5 shadow-sm"><p className="text-sm text-stone-500">已识别用户</p><p className="mt-2 text-3xl font-black">{data.summary.identifiedUsers}</p></div><div className="rounded-2xl border border-stone-100 bg-white p-5 shadow-sm"><p className="text-sm text-stone-500">已关联搜索</p><p className="mt-2 text-3xl font-black">{data.summary.identifiedSearches}</p></div><div className="rounded-2xl border border-stone-100 bg-white p-5 shadow-sm"><p className="text-sm text-stone-500">搜索识别率</p><p className="mt-2 text-3xl font-black">{percent(data.summary.identifiedRate)}</p></div></div>
          <section className="overflow-hidden rounded-2xl border border-stone-100 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-6 py-5"><div><h2 className="text-xl font-black">用户搜索行为</h2><p className="mt-1 text-xs text-stone-400">账号资料为当前值，点击用户查看完整关键词时间线。</p></div><input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="搜索 UID、昵称、手机号、城市" className="w-full max-w-sm rounded-xl border border-stone-200 px-4 py-2.5 text-sm outline-none focus:border-[#8a5be8]" /></div>
            {usersLoading ? <div className="py-16 text-center text-sm text-stone-400">正在加载用户行为…</div> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-stone-50 text-xs text-stone-400"><tr><th className="px-6 py-3">用户</th><th className="px-4 py-3">账号信息</th><th className="px-4 py-3">孩子档案</th><th className="px-4 py-3">高频关键词</th><th className="px-4 py-3 text-right">搜索 / 活跃</th><th className="px-6 py-3 text-right">最近搜索</th></tr></thead><tbody className="divide-y divide-stone-100">{(users?.items || []).map((item) => <tr key={item.user?.id || item.behavior.lastSearchedAt} className="cursor-pointer hover:bg-[#faf8ff]" onClick={() => item.user?.id && openUser(item.user.id)}><td className="px-6 py-4"><b className="text-stone-900">{displayName(item.user)}</b><p className="mt-1 text-xs text-stone-400">UID {item.user?.publicUid || "未生成"}<br />ID {item.user?.id || "—"}</p></td><td className="px-4 py-4"><p>{item.user?.mobile || "无手机号"}</p><p className="mt-1 text-xs text-stone-400">{[item.user?.city, item.user?.region, item.user?.childGrade].filter(Boolean).join(" · ") || "资料待补充"}</p></td><td className="px-4 py-4 text-stone-600">{item.children.length ? item.children.map((child) => `${child.name || "孩子"} ${child.age || child.grade}`).join("；") : "暂无"}</td><td className="max-w-xs px-4 py-4"><div className="flex flex-wrap gap-1.5">{item.behavior.topQueries.slice(0, 5).map((query) => <span key={query.query} className="rounded-full bg-[#f2edff] px-2.5 py-1 text-xs font-semibold text-[#6440b6]">{query.query} {query.count > 1 ? `×${query.count}` : ""}</span>)}</div></td><td className="px-4 py-4 text-right"><b>{item.behavior.totalSearches}</b><p className="text-xs text-stone-400">{item.behavior.activeDays} 天</p></td><td className="px-6 py-4 text-right text-xs text-stone-500">{dateTime(item.behavior.lastSearchedAt)}</td></tr>)}</tbody></table>{!users?.items.length && <div className="py-16 text-center text-sm text-stone-400">当前范围内暂无已同意关联的用户搜索。</div>}</div>}
          </section>
        </>
      )}

      {!loading && !error && data && <div className="flex items-start gap-3 rounded-2xl border border-[#ded4f4] bg-[#faf8ff] px-5 py-4 text-sm text-[#62567c]"><span className="material-symbols-outlined text-[20px] text-[#6f3bd9]">shield</span><p>搜索默认匿名记录；用户明确同意后，才将本设备历史与后续搜索关联账号，并可在小程序设置中撤回。手机号、邮箱和长数字入库前隐藏，原始数据保存 {data.privacy.retentionDays} 天。</p></div>}

      {(detailLoading || selectedUser) && (
        <div className="fixed inset-0 z-50 flex justify-end bg-stone-950/25" onClick={() => !detailLoading && setSelectedUser(null)}><aside className="h-full w-full max-w-3xl overflow-y-auto bg-[#f7f5f2] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><h2 className="text-2xl font-black">用户搜索画像</h2><button type="button" onClick={() => setSelectedUser(null)} className="rounded-full bg-white px-3 py-2 text-sm">关闭</button></div>{detailLoading && <div className="py-24 text-center text-stone-400">正在读取完整搜索记录…</div>}{selectedUser && <div className="mt-6 space-y-5"><section className="rounded-2xl bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-4"><div><h3 className="text-xl font-black">{selectedUser.user.name || selectedUser.user.username}</h3><p className="mt-1 text-xs text-stone-400">UID {selectedUser.user.publicUid || "未生成"} · ID {selectedUser.user.id}</p></div><div className="text-right text-sm"><p>{selectedUser.user.mobile || "无手机号"}</p><p className="text-stone-400">{[selectedUser.user.city, selectedUser.user.region, selectedUser.user.childGrade].filter(Boolean).join(" · ") || "资料待补充"}</p></div></div>{selectedUser.children.length > 0 && <div className="mt-4 border-t border-stone-100 pt-4"><p className="mb-2 text-xs font-bold text-stone-400">孩子档案</p><div className="flex flex-wrap gap-2">{selectedUser.children.map((child) => <span key={child.id} className="rounded-lg bg-stone-50 px-3 py-2 text-sm">{[child.name || "孩子", child.age, child.grade, child.city, child.region].filter(Boolean).join(" · ")}</span>)}</div></div>}</section><section className="rounded-2xl bg-white p-5 shadow-sm"><h3 className="font-black">行为画像（事实指标）</h3><div className="mt-4 grid grid-cols-3 gap-3"><div className="rounded-xl bg-stone-50 p-3"><p className="text-xs text-stone-400">搜索</p><b className="text-xl">{selectedUser.behaviorProfile.totalSearches}</b></div><div className="rounded-xl bg-stone-50 p-3"><p className="text-xs text-stone-400">点击率</p><b className="text-xl">{percent(selectedUser.behaviorProfile.clickThroughRate)}</b></div><div className="rounded-xl bg-stone-50 p-3"><p className="text-xs text-stone-400">无结果率</p><b className="text-xl">{percent(selectedUser.behaviorProfile.zeroResultRate)}</b></div></div><div className="mt-4 flex flex-wrap gap-2">{selectedUser.behaviorProfile.topQueries.map((item) => <span key={item.query} className="rounded-full bg-[#f2edff] px-3 py-1.5 text-sm font-bold text-[#6440b6]">{item.query} ×{item.count}</span>)}</div></section><section className="overflow-hidden rounded-2xl bg-white shadow-sm"><div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4"><div><h3 className="font-black">完整搜索时间线</h3><p className="mt-1 text-xs text-stone-400">本页 {selectedUser.events.length} 条，共 {selectedUser.total} 条</p></div><div className="flex gap-2"><button type="button" disabled={selectedUser.page <= 1} onClick={() => openUser(selectedUser.user.id, selectedUser.page - 1)} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs disabled:opacity-30">上一页</button><button type="button" disabled={selectedUser.page * selectedUser.pageSize >= selectedUser.total} onClick={() => openUser(selectedUser.user.id, selectedUser.page + 1)} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs disabled:opacity-30">下一页</button></div></div><div className="divide-y divide-stone-100">{selectedUser.events.map((event) => <div key={event.id} className="px-5 py-4"><div className="flex justify-between gap-3"><b>{event.query}</b><span className="text-xs text-stone-400">{dateTime(event.searchedAt)}</span></div><p className="mt-2 text-xs text-stone-500">结果 {event.totalResults} 条 · {event.clickedAt ? `点击了${TYPE_LABELS[event.clickedType] || event.clickedType}` : "未产生结果点击"} · {event.identitySource === "consented-backfill" ? "历史回填" : "已同意后记录"}</p></div>)}</div></section></div>}</aside></div>
      )}
    </div>
  );
};

export default AdminSearchAnalyticsPage;
