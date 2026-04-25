import React, { useEffect, useMemo, useState } from "react";
import { adminApi, SystemInfo } from "../../services/api";

function formatUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "-";
  const s = Math.floor(sec);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const parts = [];
  if (days) parts.push(`${days}天`);
  if (hours) parts.push(`${hours}小时`);
  if (minutes) parts.push(`${minutes}分`);
  parts.push(`${seconds}秒`);
  return parts.join(" ");
}

const AdminSystemPage: React.FC = () => {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const infoResp = await adminApi.getSystemInfo();
      setInfo(infoResp.data);
    } catch (loadError: any) {
      setError(loadError?.response?.data?.message || loadError?.message || "获取系统信息失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const mongoStateLabel = useMemo(() => {
    const state = info?.mongo?.readyState;
    if (state === 1) return { label: "已连接", tone: "bg-emerald-50 text-emerald-700" };
    if (state === 2) return { label: "连接中", tone: "bg-amber-50 text-amber-700" };
    if (state === 0) return { label: "未连接", tone: "bg-red-50 text-red-600" };
    if (state === 3) return { label: "断开中", tone: "bg-stone-100 text-stone-600" };
    return { label: "未知", tone: "bg-stone-100 text-stone-600" };
  }, [info?.mongo?.readyState]);
  const volcengine = info?.env.ai?.volcengine;
  const volcengineReady = Boolean(
    volcengine &&
      info?.env.ai?.provider === "volcengine" &&
      ((volcengine.activeAuth === "apiKey" && volcengine.apiKeySet) ||
        (volcengine.activeAuth === "appAccessToken" && volcengine.appIdSet && volcengine.accessTokenSet))
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[#5E8B8E] font-bold tracking-[0.2em] text-xs uppercase">
            <span className="w-8 h-[1px] bg-[#5E8B8E]"></span>
            管理面板
          </div>
          <h1 className="text-5xl font-black tracking-tight text-stone-900">系统信息</h1>
          <p className="text-stone-500 text-xl font-light">查看服务状态、环境与数据库连接信息。</p>
        </div>
        <button
          onClick={load}
          className="px-6 py-3 rounded-xl border border-stone-200 text-stone-700 hover:border-[#5e17eb] hover:text-[#5e17eb] transition-all text-sm font-bold flex items-center gap-2"
          disabled={loading}
        >
          <span className="material-symbols-outlined text-base">refresh</span>
          刷新
        </button>
      </div>

      {error ? <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-600">{error}</div> : null}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-4 border-[#5e17eb]/10 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-t-[#5e17eb] rounded-full animate-spin"></div>
          </div>
        </div>
      ) : info ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-[#5e17eb]/10 rounded-xl flex items-center justify-center text-[#5e17eb]">
                  <span className="material-symbols-outlined">schedule</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-900">{new Date(info.serverTime).toLocaleString("zh-CN")}</p>
                  <p className="text-xs text-stone-400">服务时间</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                  <span className="material-symbols-outlined">timer</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-900">{formatUptime(info.uptimeSec)}</p>
                  <p className="text-xs text-stone-400">运行时长</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-stone-100 rounded-xl flex items-center justify-center text-stone-600">
                  <span className="material-symbols-outlined">terminal</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-900">{info.nodeVersion}</p>
                  <p className="text-xs text-stone-400">Node.js 版本</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="bg-white rounded-2xl p-8 border border-stone-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black text-stone-900">环境配置</h2>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black ${info.env.allowPublicRegister ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {info.env.allowPublicRegister ? "允许公开注册" : "关闭公开注册"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">ALLOW_PUBLIC_REGISTER</div>
                  <div className="mt-2 text-sm font-bold text-stone-900">{String(info.env.allowPublicRegister)}</div>
                </div>
                <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">CORS_ORIGIN</div>
                  <div className="mt-2 text-sm font-bold text-stone-900">{info.env.corsOrigin || "-"}</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-8 border border-stone-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black text-stone-900">MongoDB</h2>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black ${mongoStateLabel.tone}`}>{mongoStateLabel.label}</span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">DB NAME</div>
                  <div className="mt-2 text-sm font-bold text-stone-900">{info.mongo.name || "-"}</div>
                </div>
                <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">HOST</div>
                  <div className="mt-2 text-sm font-bold text-stone-900">{info.mongo.host || "-"}</div>
                </div>
                <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">PORT</div>
                  <div className="mt-2 text-sm font-bold text-stone-900">{info.mongo.port || "-"}</div>
                </div>
                <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">READY STATE</div>
                  <div className="mt-2 text-sm font-bold text-stone-900">{String(info.mongo.readyState)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 border border-stone-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-black text-stone-900">数据统计</h2>
              <div className="text-xs text-stone-400">按数据库实时统计</div>
            </div>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">PROGRAMS</div>
                <div className="mt-2 text-3xl font-black text-stone-900">{info.stats.programs}</div>
              </div>
              <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">BOOKS</div>
                <div className="mt-2 text-3xl font-black text-stone-900">{info.stats.books}</div>
              </div>
              <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">MATERIALS</div>
                <div className="mt-2 text-3xl font-black text-stone-900">{info.stats.materials}</div>
              </div>
              <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">USERS</div>
                <div className="mt-2 text-3xl font-black text-stone-900">{info.stats.users}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 border border-stone-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-stone-900">AI 解析配置</h2>
              <span className={`px-3 py-1 rounded-full text-[10px] font-black ${volcengineReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {info.env.ai?.provider || "mock"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">AUTH MODE</div>
                <div className="mt-2 text-sm font-bold text-stone-900">{volcengine?.activeAuth === "apiKey" ? "X-Api-Key" : "App ID + Access Token"}</div>
              </div>
              <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">RESOURCE ID</div>
                <div className="mt-2 break-words text-sm font-bold text-stone-900">{volcengine?.resourceId || "-"}</div>
              </div>
              <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">MODE</div>
                <div className="mt-2 text-sm font-bold text-stone-900">{volcengine?.mode || "-"}</div>
              </div>
              <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">PUBLIC BASE URL</div>
                <div className="mt-2 break-words text-sm font-bold text-stone-900">{volcengine?.publicBaseUrl || "-"}</div>
              </div>
              <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">X-API-KEY</div>
                <div className="mt-2 text-sm font-bold text-stone-900">{volcengine?.apiKeySet ? `已设置 ${volcengine.apiKeyPreview}` : "未设置"}</div>
              </div>
              <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">SECRET KEY</div>
                <div className="mt-2 text-sm font-bold text-stone-900">{volcengine?.secretKeySet ? `已设置 ${volcengine.secretKeyPreview}` : "未设置"}</div>
              </div>
            </div>
            {volcengine?.apiKeySet ? (
              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">
                当前请求会优先使用 VOLCENGINE_API_KEY 作为 X-Api-Key；如果火山返回 Invalid X-Api-Key，请清空该项或填入火山控制台对应的 API Key。
              </div>
            ) : null}
          </div>

        </div>
      ) : null}
    </div>
  );
};

export default AdminSystemPage;
