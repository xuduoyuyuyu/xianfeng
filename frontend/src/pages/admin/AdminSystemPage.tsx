import React, { useEffect, useMemo, useState } from "react";
import { adminApi, ModelRegistryItem, SystemInfo } from "../../services/api";
import TopAlert from "../../components/TopAlert";

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

type ModelForm = {
  id: string;
  name: string;
  provider: string;
  model_name: string;
  api_key: string;
  base_url: string;
  enabled: boolean;
  capabilitiesCsv: string;
  metaJson: string;
};

function buildModelForm(item?: ModelRegistryItem | null): ModelForm {
  return {
    id: item?.id || "",
    name: item?.name || "",
    provider: item?.provider || "",
    model_name: item?.model_name || "",
    api_key: "",
    base_url: item?.base_url || "",
    enabled: item?.enabled ?? true,
    capabilitiesCsv: Array.isArray(item?.capabilities) ? item!.capabilities.join(",") : "",
    metaJson: JSON.stringify(item?.meta || {}, null, 2),
  };
}

const inputClass = "mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 admin-form-input";

const AdminSystemPage: React.FC = () => {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [models, setModels] = useState<ModelRegistryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ModelRegistryItem | null>(null);
  const [modelForm, setModelForm] = useState<ModelForm>(buildModelForm(null));

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [infoResp, modelResp] = await Promise.all([adminApi.getSystemInfo(), adminApi.getModelRegistry()]);
      setInfo(infoResp.data);
      setModels(Array.isArray(modelResp.data?.items) ? modelResp.data.items : []);
    } catch (loadError: any) {
      setError(loadError?.response?.data?.message || loadError?.message || "获取系统信息失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
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

  const summary = info?.env.ai?.modelRegistrySummary;

  function openCreate() {
    setEditing(null);
    setModelForm(buildModelForm(null));
    setShowModal(true);
  }

  function openEdit(item: ModelRegistryItem) {
    setEditing(item);
    setModelForm(buildModelForm(item));
    setShowModal(true);
  }

  async function saveModel() {
    const id = modelForm.id.trim();
    const name = modelForm.name.trim();
    const provider = modelForm.provider.trim();
    const modelName = modelForm.model_name.trim();
    if (!id || !name || !provider || !modelName) {
      setError("模型 ID/名称/服务商/模型名为必填");
      return;
    }
    let meta: Record<string, any> = {};
    try {
      meta = modelForm.metaJson.trim() ? JSON.parse(modelForm.metaJson) : {};
    } catch {
      setError("Meta JSON 格式错误");
      return;
    }
    const capabilities = modelForm.capabilitiesCsv
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const payload = {
      id,
      name,
      provider,
      model_name: modelName,
      api_key: modelForm.api_key,
      base_url: modelForm.base_url.trim(),
      enabled: modelForm.enabled,
      capabilities,
      meta,
    };
    setSaving(true);
    try {
      if (editing) {
        await adminApi.updateModelRegistryItem(editing.id, payload);
      } else {
        await adminApi.createModelRegistryItem(payload);
      }
      setShowModal(false);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "保存模型失败");
    } finally {
      setSaving(false);
    }
  }

  async function removeModel(item: ModelRegistryItem) {
    if (!window.confirm(`确认删除模型实例「${item.name}」吗？`)) return;
    try {
      await adminApi.deleteModelRegistryItem(item.id);
      await load();
    } catch (e: any) {
      const refs = e?.response?.data?.references;
      if (Array.isArray(refs) && refs.length) {
        setError(`模型被以下 agent 引用：${refs.join(", ")}`);
      } else {
        setError(e?.response?.data?.message || e?.message || "删除失败");
      }
    }
  }

  async function toggleEnabled(item: ModelRegistryItem) {
    try {
      await adminApi.updateModelRegistryItem(item.id, { enabled: !item.enabled });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "更新状态失败");
    }
  }

  return (
    <div className="space-y-8">
      <TopAlert message={error} onClose={() => setError(null)} />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-[#5e17eb]/10"></div>
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-t-[#5e17eb]"></div>
          </div>
        </div>
      ) : info ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-stone-100 bg-white p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5e17eb]/10 text-[#5e17eb]">
                  <span className="material-symbols-outlined">schedule</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-900">{new Date(info.serverTime).toLocaleString("zh-CN")}</p>
                  <p className="text-xs text-stone-400">服务时间</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-stone-100 bg-white p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                  <span className="material-symbols-outlined">timer</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-900">{formatUptime(info.uptimeSec)}</p>
                  <p className="text-xs text-stone-400">运行时长</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-stone-100 bg-white p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-600">
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
            <div className="rounded-2xl border border-stone-100 bg-white p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black text-stone-900">环境配置</h2>
                <span className={`rounded-full px-3 py-1 text-[10px] font-black ${info.env.allowPublicRegister ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {info.env.allowPublicRegister ? "允许公开注册" : "关闭公开注册"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-stone-100 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">ALLOW_PUBLIC_REGISTER</div><div className="mt-2 text-sm font-bold text-stone-900">{String(info.env.allowPublicRegister)}</div></div>
                <div className="rounded-2xl border border-stone-100 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">CORS_ORIGIN</div><div className="mt-2 text-sm font-bold text-stone-900">{info.env.corsOrigin || "-"}</div></div>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-100 bg-white p-8 space-y-6">
              <div className="flex items-center justify-between"><h2 className="text-2xl font-black text-stone-900">MongoDB</h2><span className={`rounded-full px-3 py-1 text-[10px] font-black ${mongoStateLabel.tone}`}>{mongoStateLabel.label}</span></div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-stone-100 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">DB NAME</div><div className="mt-2 text-sm font-bold text-stone-900">{info.mongo.name || "-"}</div></div>
                <div className="rounded-2xl border border-stone-100 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">HOST</div><div className="mt-2 text-sm font-bold text-stone-900">{info.mongo.host || "-"}</div></div>
                <div className="rounded-2xl border border-stone-100 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">PORT</div><div className="mt-2 text-sm font-bold text-stone-900">{info.mongo.port || "-"}</div></div>
                <div className="rounded-2xl border border-stone-100 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">READY STATE</div><div className="mt-2 text-sm font-bold text-stone-900">{String(info.mongo.readyState)}</div></div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-100 bg-white p-8">
            <div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-black text-stone-900">数据统计</h2><div className="text-xs text-stone-400">按数据库实时统计</div></div>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              <div className="rounded-2xl border border-stone-100 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">PROGRAMS</div><div className="mt-2 text-3xl font-black text-stone-900">{info.stats.programs}</div></div>
              <div className="rounded-2xl border border-stone-100 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">BOOKS</div><div className="mt-2 text-3xl font-black text-stone-900">{info.stats.books}</div></div>
              <div className="rounded-2xl border border-stone-100 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">MATERIALS</div><div className="mt-2 text-3xl font-black text-stone-900">{info.stats.materials}</div></div>
              <div className="rounded-2xl border border-stone-100 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">USERS</div><div className="mt-2 text-3xl font-black text-stone-900">{info.stats.users}</div></div>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-100 bg-white p-8 space-y-6">
            <div className="flex items-center justify-between"><h2 className="text-2xl font-black text-stone-900">AI 解析配置</h2><span className={`rounded-full px-3 py-1 text-[10px] font-black ${volcengineReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{info.env.ai?.provider || "mock"}</span></div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-stone-100 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">AUTH MODE</div><div className="mt-2 text-sm font-bold text-stone-900">{volcengine?.activeAuth === "apiKey" ? "X-Api-Key" : "App ID + Access Token"}</div></div>
              <div className="rounded-2xl border border-stone-100 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">RESOURCE ID</div><div className="mt-2 break-words text-sm font-bold text-stone-900">{volcengine?.resourceId || "-"}</div></div>
              <div className="rounded-2xl border border-stone-100 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">MODE</div><div className="mt-2 text-sm font-bold text-stone-900">{volcengine?.mode || "-"}</div></div>
              <div className="rounded-2xl border border-stone-100 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">PUBLIC BASE URL</div><div className="mt-2 break-words text-sm font-bold text-stone-900">{volcengine?.publicBaseUrl || "-"}</div></div>
              <div className="rounded-2xl border border-stone-100 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">X-API-KEY</div><div className="mt-2 text-sm font-bold text-stone-900">{volcengine?.apiKeySet ? `已设置 ${volcengine.apiKeyPreview}` : "未设置"}</div></div>
              <div className="rounded-2xl border border-stone-100 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">SECRET KEY</div><div className="mt-2 text-sm font-bold text-stone-900">{volcengine?.secretKeySet ? `已设置 ${volcengine.secretKeyPreview}` : "未设置"}</div></div>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-100 bg-white p-8 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-stone-900">模型中心</h2>
                <div className="mt-1 text-xs text-stone-500">
                  总数 {summary?.total ?? models.length} · 启用 {summary?.enabled ?? models.filter((x) => x.enabled).length}
                </div>
              </div>
              <button onClick={openCreate} className="rounded-full bg-[#5e17eb] px-5 py-2 text-sm font-bold text-white hover:bg-[#5112d1]">添加模型</button>
            </div>
            {!!summary?.byProvider && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(summary.byProvider).map(([k, v]) => (
                  <span key={k} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-700">{k}: {v}</span>
                ))}
              </div>
            )}
            <div className="overflow-auto rounded-2xl border border-stone-200">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-stone-600">
                  <tr>
                    <th className="p-3 text-left">模型实例</th>
                    <th className="p-3 text-left">服务商</th>
                    <th className="p-3 text-left">能力</th>
                    <th className="p-3 text-left">API Key</th>
                    <th className="p-3 text-left">状态</th>
                    <th className="p-3 text-left">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((item) => (
                    <tr key={item.id} className="border-t border-stone-100">
                      <td className="p-3"><div className="font-bold text-stone-800">{item.name}</div><div className="text-xs text-stone-500">{item.model_name} · {item.id}</div></td>
                      <td className="p-3 text-stone-700">{item.provider}</td>
                      <td className="p-3 text-stone-700">{(item.capabilities || []).join(", ") || "-"}</td>
                      <td className="p-3 text-stone-700">{item.api_key_preview || "未设置"}</td>
                      <td className="p-3"><button onClick={() => void toggleEnabled(item)} className={`rounded-full px-3 py-1 text-xs font-bold ${item.enabled ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>{item.enabled ? "enabled" : "disabled"}</button></td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(item)} className="rounded-lg border border-stone-200 px-3 py-1 text-xs font-semibold text-stone-700">编辑</button>
                          <button onClick={() => void removeModel(item)} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600">删除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {models.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-sm text-stone-500">暂无模型实例</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-3xl border border-stone-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-2xl font-black text-stone-900">{editing ? "编辑模型" : "添加模型"}</h3>
              <button onClick={() => setShowModal(false)} className="rounded-full border border-stone-200 px-3 py-1 text-sm">关闭</button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-xs font-bold text-stone-500">模型实例ID<input value={modelForm.id} disabled={!!editing} onChange={(e) => setModelForm({ ...modelForm, id: e.target.value })} className={inputClass} /></label>
              <label className="text-xs font-bold text-stone-500">名称<input value={modelForm.name} onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })} className={inputClass} /></label>
              <label className="text-xs font-bold text-stone-500">服务商<input value={modelForm.provider} onChange={(e) => setModelForm({ ...modelForm, provider: e.target.value })} className={inputClass} /></label>
              <label className="text-xs font-bold text-stone-500">模型名<input value={modelForm.model_name} onChange={(e) => setModelForm({ ...modelForm, model_name: e.target.value })} className={inputClass} /></label>
              <label className="text-xs font-bold text-stone-500">API Key（编辑时留空=不改）<input value={modelForm.api_key} onChange={(e) => setModelForm({ ...modelForm, api_key: e.target.value })} className={inputClass} /></label>
              <label className="text-xs font-bold text-stone-500">Base URL<input value={modelForm.base_url} onChange={(e) => setModelForm({ ...modelForm, base_url: e.target.value })} className={inputClass} /></label>
              <label className="text-xs font-bold text-stone-500 md:col-span-2">能力（逗号分隔）<input value={modelForm.capabilitiesCsv} onChange={(e) => setModelForm({ ...modelForm, capabilitiesCsv: e.target.value })} className={inputClass} placeholder="chat,reasoning,asr,extract" /></label>
              <label className="text-xs font-bold text-stone-500 md:col-span-2">Meta(JSON)<textarea value={modelForm.metaJson} onChange={(e) => setModelForm({ ...modelForm, metaJson: e.target.value })} className="mt-1 h-28 w-full rounded-xl border border-stone-200 bg-stone-50 p-3 font-mono text-xs text-stone-700" /></label>
              <label className="text-xs font-bold text-stone-500">启用状态<select value={modelForm.enabled ? "enabled" : "disabled"} onChange={(e) => setModelForm({ ...modelForm, enabled: e.target.value === "enabled" })} className={inputClass}><option value="enabled">enabled</option><option value="disabled">disabled</option></select></label>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="rounded-full border border-stone-200 px-5 py-2 text-sm font-bold text-stone-700">取消</button>
              <button disabled={saving} onClick={() => void saveModel()} className="rounded-full bg-[#5e17eb] px-5 py-2 text-sm font-bold text-white hover:bg-[#5112d1] disabled:opacity-50">{saving ? "保存中..." : "保存模型"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSystemPage;
