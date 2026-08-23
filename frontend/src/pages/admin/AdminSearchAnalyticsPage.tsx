import React, { useEffect, useMemo, useState } from "react";
import { adminApi, SearchAnalyticsResponse } from "../../services/api";

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

const AdminSearchAnalyticsPage: React.FC = () => {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<SearchAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    return () => {
      active = false;
    };
  }, [days]);

  const trendMax = useMemo(
    () => Math.max(1, ...(data?.dailyTrend || []).map((item) => item.searches)),
    [data]
  );
  const resultTypeMax = useMemo(
    () => Math.max(1, ...(data?.resultTypeDistribution || []).map((item) => item.count)),
    [data]
  );

  const summaryCards = data ? [
    { label: "搜索次数", value: data.summary.totalSearches, note: `近 ${days} 天稳定搜索` },
    { label: "搜索会话", value: data.summary.uniqueSessions, note: "匿名会话去重" },
    { label: "独立关键词", value: data.summary.uniqueQueries, note: "不含敏感隐藏项" },
    { label: "无结果率", value: percent(data.summary.zeroResultRate), note: `${data.summary.zeroResultSearches} 次无结果` },
    { label: "结果点击率", value: percent(data.summary.clickThroughRate), note: `${data.summary.clickedSearches} 次产生点击` },
  ] : [];

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#7c5fd2]">Search insights</p>
          <h1 className="text-4xl font-black tracking-tight text-stone-900">搜索洞察</h1>
          <p className="mt-2 text-sm text-stone-500">观察小程序用户真正关心的内容，以及搜索结果是否满足需求。</p>
        </div>
        <div className="flex rounded-xl border border-stone-200 bg-white p-1 shadow-sm">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${days === option ? "bg-[#5e17eb] text-white" : "text-stone-500 hover:bg-[#f5f1ff] hover:text-[#5e17eb]"}`}
            >
              {option} 天
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-stone-100 bg-white">
          <div className="h-11 w-11 animate-spin rounded-full border-4 border-[#5e17eb]/15 border-t-[#5e17eb]" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-6 py-5 text-sm font-medium text-red-700">{error}</div>
      )}

      {!loading && !error && data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-black text-stone-900">搜索趋势</h2>
                    <p className="mt-1 text-xs text-stone-400">紫色为搜索次数，深色标记产生结果点击的日期。</p>
                  </div>
                </div>
                <div className="flex h-48 items-end gap-2 overflow-x-auto pb-1">
                  {data.dailyTrend.map((item) => (
                    <div key={item.date} className="group flex min-w-8 flex-1 flex-col items-center justify-end gap-2">
                      <div className="text-[10px] font-semibold text-stone-400 opacity-0 transition-opacity group-hover:opacity-100">{item.searches}</div>
                      <div
                        className={`w-full min-w-5 rounded-t-md ${item.clicks ? "bg-[#5e17eb]" : "bg-[#c9b5f7]"}`}
                        style={{ height: `${Math.max(8, (item.searches / trendMax) * 132)}px` }}
                        title={`${item.date}：${item.searches} 次搜索，${item.clicks} 次点击`}
                      />
                      <span className="text-[10px] text-stone-400">{item.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <div className="grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
                <section className="overflow-hidden rounded-2xl border border-stone-100 bg-white shadow-sm">
                  <div className="border-b border-stone-100 px-6 py-5">
                    <h2 className="text-xl font-black text-stone-900">热门搜索词</h2>
                    <p className="mt-1 text-xs text-stone-400">只展示至少出现 {data.privacy.minimumQueryCount} 次的聚合词。</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="bg-stone-50 text-xs text-stone-400">
                        <tr>
                          <th className="px-6 py-3 font-semibold">关键词</th>
                          <th className="px-4 py-3 text-right font-semibold">搜索</th>
                          <th className="px-4 py-3 text-right font-semibold">点击率</th>
                          <th className="px-6 py-3 text-right font-semibold">无结果</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {data.topQueries.map((item) => (
                          <tr key={item.query}>
                            <td className="px-6 py-3.5 font-semibold text-stone-800">{item.query}</td>
                            <td className="px-4 py-3.5 text-right text-stone-600">{item.count}</td>
                            <td className="px-4 py-3.5 text-right text-stone-600">{percent(item.count ? item.clicks / item.count : 0)}</td>
                            <td className="px-6 py-3.5 text-right text-stone-600">{item.zeroResults}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <div className="space-y-6">
                  <section className="rounded-2xl border border-stone-100 bg-white p-6 shadow-sm">
                    <h2 className="text-xl font-black text-stone-900">上升关键词</h2>
                    <div className="mt-4 space-y-3">
                      {data.risingQueries.length ? data.risingQueries.map((item) => (
                        <div key={item.query} className="flex items-center justify-between rounded-xl bg-[#f7f3ff] px-4 py-3">
                          <span className="font-semibold text-stone-800">{item.query}</span>
                          <span className="text-sm font-bold text-[#5e17eb]">+{item.change}</span>
                        </div>
                      )) : <p className="text-sm text-stone-400">当前周期暂无明显上升词。</p>}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-stone-100 bg-white p-6 shadow-sm">
                    <h2 className="text-xl font-black text-stone-900">无结果关键词</h2>
                    <div className="mt-4 space-y-3">
                      {data.zeroResultQueries.length ? data.zeroResultQueries.map((item) => (
                        <div key={item.query} className="flex items-center justify-between border-b border-stone-100 pb-3 last:border-0 last:pb-0">
                          <span className="font-medium text-stone-700">{item.query}</span>
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{item.count} 次</span>
                        </div>
                      )) : <p className="text-sm text-stone-400">没有重复出现的无结果关键词。</p>}
                    </div>
                  </section>
                </div>
              </div>

              <section className="rounded-2xl border border-stone-100 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-black text-stone-900">内容命中分布</h2>
                <p className="mt-1 text-xs text-stone-400">统计各类内容出现在搜索结果中的累计次数。</p>
                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  {data.resultTypeDistribution.map((item) => (
                    <div key={item.type} className="rounded-xl bg-stone-50 p-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-stone-700">{TYPE_LABELS[item.type] || item.type}</span>
                        <span className="font-black text-stone-900">{item.count}</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200">
                        <div className="h-full rounded-full bg-[#7b48ed]" style={{ width: `${(item.count / resultTypeMax) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          <div className="flex items-start gap-3 rounded-2xl border border-[#ded4f4] bg-[#faf8ff] px-5 py-4 text-sm text-[#62567c]">
            <span className="material-symbols-outlined text-[20px] text-[#6f3bd9]">shield</span>
            <p>仅做匿名聚合，不保存 IP、OpenID 或用户账号；手机号、邮箱和长数字在入库前隐藏，数据保存 {data.privacy.retentionDays} 天。</p>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminSearchAnalyticsPage;
