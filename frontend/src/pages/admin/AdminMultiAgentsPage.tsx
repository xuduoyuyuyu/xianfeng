import React, { useEffect, useMemo, useState } from "react";
import { adminApi, ModelRegistryItem } from "../../services/api";

type AgentRow = {
  agent_code: string;
  name: string;
  description: string;
  status: string;
  model_provider: string;
  model_name: string;
  primary_model_id?: string;
  feature_models?: { asr?: string; extract?: string };
  temperature: number;
  top_p: number;
  max_tokens: number;
  timeout_ms: number;
  max_retry: number;
  enable_web_search: boolean;
};

const cardClass = "rounded-[2rem] border border-stone-200 bg-white p-6";
const inputClass = "mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 admin-form-input";
const textareaClass = "w-full rounded-xl border border-stone-200 bg-stone-50 p-3 font-mono text-xs text-stone-700 admin-form-input";

function toFeatureModels(raw: any): { asr?: string; extract?: string } {
  const out: { asr?: string; extract?: string } = {};
  if (typeof raw?.asr === "string" && raw.asr.trim()) out.asr = raw.asr.trim();
  if (typeof raw?.extract === "string" && raw.extract.trim()) out.extract = raw.extract.trim();
  return out;
}

const AdminMultiAgentsPage: React.FC = () => {
  const base = (import.meta.env.VITE_API_URL || "").trim();
  const auth = { Authorization: `Bearer ${localStorage.getItem("token") || ""}` };

  const [items, setItems] = useState<AgentRow[]>([]);
  const [modelRegistry, setModelRegistry] = useState<ModelRegistryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentCode, setCurrentCode] = useState("");
  const [toast, setToast] = useState("");

  const [agentForm, setAgentForm] = useState<any>(null);
  const [promptForm, setPromptForm] = useState({ version: "", change_note: "", system_prompt: "", prompt_template: "" });
  const [promptHistory, setPromptHistory] = useState<any[]>([]);
  const [policyForm, setPolicyForm] = useState({
    allowed_routes_json: "[]",
    role_scope_json: '["system","user","admin"]',
    rate_limit_json: "{}",
    input_guardrails_json: "{}",
    output_guardrails_json: "{}",
  });
  const [strategyRoute, setStrategyRoute] = useState("ai_chat");
  const [strategyJson, setStrategyJson] = useState("{}");
  const [runs, setRuns] = useState<any[]>([]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  async function loadList() {
    setLoading(true);
    try {
      const [agentRes, modelRes] = await Promise.all([
        fetch(`${base}/api/admin/mgmt/agents`, { headers: auth }),
        adminApi.getModelRegistry(),
      ]);
      const data = await agentRes.json();
      const rows = Array.isArray(data?.items) ? data.items : [];
      setItems(rows);
      setModelRegistry(Array.isArray(modelRes.data?.items) ? modelRes.data.items : []);
      if (rows.length && !currentCode) setCurrentCode(rows[0].agent_code);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(code: string) {
    const [dRes, pRes, polRes] = await Promise.all([
      fetch(`${base}/api/admin/mgmt/agents/${encodeURIComponent(code)}`, { headers: auth }),
      fetch(`${base}/api/admin/mgmt/agents/${encodeURIComponent(code)}/prompts`, { headers: auth }),
      fetch(`${base}/api/admin/mgmt/agents/${encodeURIComponent(code)}/policy`, { headers: auth }),
    ]);
    const detail = await dRes.json();
    const prompts = await pRes.json();
    const policy = await polRes.json();

    const a = detail?.agent || null;
    setAgentForm({
      ...a,
      primary_model_id: String(a?.primary_model_id || ""),
      feature_models: toFeatureModels(a?.feature_models),
    });

    const cur = prompts?.current || {};
    setPromptForm({
      version: "",
      change_note: "",
      system_prompt: String(cur.system_prompt || ""),
      prompt_template: String(cur.prompt_template || ""),
    });
    setPromptHistory(Array.isArray(prompts?.items) ? prompts.items : []);

    const pol = policy?.policy || {};
    setPolicyForm({
      allowed_routes_json: JSON.stringify(pol.allowed_routes_json || [], null, 2),
      role_scope_json: JSON.stringify(pol.role_scope_json || ["system", "user", "admin"], null, 2),
      rate_limit_json: JSON.stringify(pol.rate_limit_json || {}, null, 2),
      input_guardrails_json: JSON.stringify(pol.input_guardrails_json || {}, null, 2),
      output_guardrails_json: JSON.stringify(pol.output_guardrails_json || {}, null, 2),
    });

    await loadStrategy(strategyRoute);
    await loadRuns();
  }

  async function loadStrategy(routeKey: string) {
    const res = await fetch(`${base}/api/admin/mgmt/agents/strategies?route_key=${encodeURIComponent(routeKey)}`, { headers: auth });
    const data = await res.json();
    setStrategyJson(JSON.stringify(data?.strategy?.strategy || {}, null, 2));
  }

  async function loadRuns() {
    const res = await fetch(`${base}/api/admin/mgmt/agents/runs`, { headers: auth });
    const data = await res.json();
    setRuns(Array.isArray(data?.items) ? data.items : []);
  }

  useEffect(() => {
    void loadList();
  }, []);

  useEffect(() => {
    if (currentCode) void loadDetail(currentCode);
  }, [currentCode]);

  const current = useMemo(() => items.find((x) => x.agent_code === currentCode) || null, [items, currentCode]);

  const primaryOptions = useMemo(
    () => modelRegistry.filter((x) => x.enabled && (x.capabilities?.includes("chat") || x.capabilities?.includes("reasoning"))),
    [modelRegistry]
  );
  const asrOptions = useMemo(() => modelRegistry.filter((x) => x.enabled && x.capabilities?.includes("asr")), [modelRegistry]);
  const extractOptions = useMemo(() => modelRegistry.filter((x) => x.enabled && x.capabilities?.includes("extract")), [modelRegistry]);

  async function saveAgent() {
    if (!agentForm?.agent_code) return;
    const payload = {
      ...agentForm,
      feature_models: toFeatureModels(agentForm.feature_models),
    };
    const res = await fetch(`${base}/api/admin/mgmt/agents/${encodeURIComponent(agentForm.agent_code)}`, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data?.ok) {
      setToast("Agent 参数已保存");
      await loadList();
    }
  }

  async function savePrompt() {
    if (!currentCode) return;
    const res = await fetch(`${base}/api/admin/mgmt/agents/${encodeURIComponent(currentCode)}/prompts`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(promptForm),
    });
    const data = await res.json();
    if (data?.ok) {
      setToast("Prompt 新版本已发布");
      await loadDetail(currentCode);
    }
  }

  async function savePolicy() {
    if (!currentCode) return;
    let payload: any;
    try {
      payload = {
        allowed_routes_json: JSON.parse(policyForm.allowed_routes_json),
        role_scope_json: JSON.parse(policyForm.role_scope_json),
        rate_limit_json: JSON.parse(policyForm.rate_limit_json),
        input_guardrails_json: JSON.parse(policyForm.input_guardrails_json),
        output_guardrails_json: JSON.parse(policyForm.output_guardrails_json),
      };
    } catch {
      setToast("策略 JSON 格式错误");
      return;
    }
    const res = await fetch(`${base}/api/admin/mgmt/agents/${encodeURIComponent(currentCode)}/policy`, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data?.ok) setToast("Agent 策略已保存");
  }

  async function saveStrategy() {
    let strategyObj: any;
    try {
      strategyObj = JSON.parse(strategyJson);
    } catch {
      setToast("路由策略 JSON 格式错误");
      return;
    }
    const res = await fetch(`${base}/api/admin/mgmt/agents/strategies/${encodeURIComponent(strategyRoute)}`, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ strategy_json: strategyObj }),
    });
    const data = await res.json();
    if (data?.ok) setToast("路由策略已保存");
  }

  async function createAgent() {
    const agentCodeRaw = window.prompt("请输入 agent_code（字母/数字/下划线）");
    if (agentCodeRaw == null) return;
    const agentCode = agentCodeRaw.trim();
    if (!agentCode) {
      setToast("agent_code 不能为空");
      return;
    }
    const nameRaw = window.prompt("请输入 Agent 名称");
    if (nameRaw == null) return;
    const name = nameRaw.trim();
    if (!name) {
      setToast("名称不能为空");
      return;
    }
    const description = window.prompt("请输入描述（可选）")?.trim() || "";

    const res = await fetch(`${base}/api/admin/mgmt/agents`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ agent_code: agentCode, name, description }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setToast(String(data?.message || "新增失败"));
      return;
    }
    setToast("Agent 已新增");
    await loadList();
    setCurrentCode(agentCode);
  }

  async function deleteAgent(agentCode: string, agentName: string) {
    if (!window.confirm(`确认删除 Agent「${agentName}」吗？`)) return;
    const res = await fetch(`${base}/api/admin/mgmt/agents/${encodeURIComponent(agentCode)}`, {
      method: "DELETE",
      headers: auth,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setToast(String(data?.message || "删除失败"));
      return;
    }
    setToast("Agent 已删除");
    const nextItems = items.filter((x) => x.agent_code !== agentCode);
    setItems(nextItems);
    if (currentCode === agentCode) setCurrentCode(nextItems[0]?.agent_code || "");
  }

  const legacyMode = Boolean(agentForm && !agentForm.primary_model_id && (agentForm.model_provider || agentForm.model_name));

  function migrateLegacyToPrimary() {
    if (!agentForm) return;
    const match = modelRegistry.find((m) => m.provider === agentForm.model_provider && m.model_name === agentForm.model_name && m.enabled);
    if (!match) {
      setToast("未找到可迁移的模型实例，请先在系统信息-模型中心新增对应模型");
      return;
    }
    setAgentForm({ ...agentForm, primary_model_id: match.id });
    setToast(`已迁移到模型实例：${match.name}`);
  }

  return (
    <div className="space-y-6 font-['Noto_Sans_SC','Plus_Jakarta_Sans',sans-serif] text-[#2D2926]">
      {toast ? <div className="rounded-xl border border-[#e8dcff] bg-[#f7f3ff] px-4 py-2 text-sm font-medium text-[#5e17eb]">{toast}</div> : null}

      <section className="grid grid-cols-1 gap-6 xl:h-[calc(100vh-4rem)] xl:grid-cols-[320px_1fr]">
        <aside className={`${cardClass} flex min-h-0 flex-col`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-black uppercase tracking-[0.14em] text-stone-600">Agent 列表</div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-600">{items.length}</span>
              <button type="button" onClick={createAgent} title="新增 Agent" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5e17eb] text-lg font-bold leading-none text-white transition hover:bg-[#5112d1]">+</button>
            </div>
          </div>
          {loading ? (
            <div className="py-12 text-center text-sm text-stone-500">加载中...</div>
          ) : (
            <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
              {items.map((a) => {
                const active = a.agent_code === currentCode;
                return (
                  <div key={a.agent_code} onClick={() => setCurrentCode(a.agent_code)} className={`group relative w-full rounded-2xl border px-3 py-3 text-left transition ${active ? "border-[#5e17eb] bg-[#f5efff]" : "border-stone-200 bg-white hover:border-stone-300"}`} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setCurrentCode(a.agent_code); }}>
                    <button type="button" title="删除 Agent" onClick={(e) => { e.stopPropagation(); void deleteAgent(a.agent_code, a.name); }} className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold text-red-500 opacity-0 transition hover:bg-red-50 group-hover:opacity-100">×</button>
                    <div className="flex items-center gap-2"><span className="text-sm">🤖</span><span className="text-sm font-bold text-stone-800">{a.name}</span>{a.agent_code === "chat_manager_agent" ? (<span className="ml-auto rounded-full bg-[#efe7ff] px-2 py-0.5 text-[10px] font-bold text-[#5e17eb]">小玩子</span>) : null}</div>
                    <div className="mt-1 truncate font-mono text-xs text-stone-500">{a.agent_code}</div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        <div className="space-y-4">
          {!current || !agentForm ? (
            <div className="rounded-[2rem] border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">请选择左侧 Agent 查看配置</div>
          ) : (
            <>
              <section className={cardClass}>
                <div className="mb-5 flex items-center justify-between"><h2 className="text-2xl font-black text-stone-900">{agentForm.name}</h2><button onClick={saveAgent} className="rounded-full bg-[#5e17eb] px-5 py-2 text-sm font-bold text-white hover:bg-[#5112d1]">保存参数</button></div>
                {legacyMode ? (
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    当前为旧版模型字段：provider={agentForm.model_provider || "-"}, model={agentForm.model_name || "-"}
                    <button onClick={migrateLegacyToPrimary} className="ml-3 rounded-full border border-amber-300 px-3 py-1 font-bold text-amber-700">一键迁移到模型中心</button>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-xs font-bold text-stone-500">Agent Code<input value={agentForm.agent_code} readOnly className={`${inputClass} font-mono text-xs`} /></label>
                  <label className="text-xs font-bold text-stone-500">状态<select value={agentForm.status} onChange={(e) => setAgentForm({ ...agentForm, status: e.target.value })} className={inputClass}><option value="active">active</option><option value="inactive">inactive</option></select></label>
                  <label className="text-xs font-bold text-stone-500">名称<input value={agentForm.name} onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })} className={inputClass} /></label>
                  <label className="text-xs font-bold text-stone-500">描述<input value={agentForm.description} onChange={(e) => setAgentForm({ ...agentForm, description: e.target.value })} className={inputClass} /></label>
                  <label className="text-xs font-bold text-stone-500">主模型实例<select value={agentForm.primary_model_id || ""} onChange={(e) => setAgentForm({ ...agentForm, primary_model_id: e.target.value })} className={inputClass}><option value="">未选择（回退旧字段）</option>{primaryOptions.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.provider}/{m.model_name})</option>)}</select></label>
                  <label className="text-xs font-bold text-stone-500">ASR 子模型<select value={agentForm.feature_models?.asr || ""} onChange={(e) => setAgentForm({ ...agentForm, feature_models: { ...toFeatureModels(agentForm.feature_models), asr: e.target.value || undefined } })} className={inputClass}><option value="">不指定</option>{asrOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
                  <label className="text-xs font-bold text-stone-500">Extract 子模型<select value={agentForm.feature_models?.extract || ""} onChange={(e) => setAgentForm({ ...agentForm, feature_models: { ...toFeatureModels(agentForm.feature_models), extract: e.target.value || undefined } })} className={inputClass}><option value="">不指定</option>{extractOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
                  <label className="text-xs font-bold text-stone-500">兼容 provider<input value={agentForm.model_provider || ""} onChange={(e) => setAgentForm({ ...agentForm, model_provider: e.target.value })} className={inputClass} /></label>
                  <label className="text-xs font-bold text-stone-500">兼容 model<input value={agentForm.model_name || ""} onChange={(e) => setAgentForm({ ...agentForm, model_name: e.target.value })} className={inputClass} /></label>
                  <label className="text-xs font-bold text-stone-500">temperature<input type="number" step="0.01" value={agentForm.temperature} onChange={(e) => setAgentForm({ ...agentForm, temperature: +e.target.value })} className={inputClass} /></label>
                  <label className="text-xs font-bold text-stone-500">top_p<input type="number" step="0.01" value={agentForm.top_p} onChange={(e) => setAgentForm({ ...agentForm, top_p: +e.target.value })} className={inputClass} /></label>
                  <label className="text-xs font-bold text-stone-500">max_tokens<input type="number" value={agentForm.max_tokens} onChange={(e) => setAgentForm({ ...agentForm, max_tokens: +e.target.value })} className={inputClass} /></label>
                  <label className="text-xs font-bold text-stone-500">timeout_ms<input type="number" value={agentForm.timeout_ms} onChange={(e) => setAgentForm({ ...agentForm, timeout_ms: +e.target.value })} className={inputClass} /></label>
                </div>
              </section>

              <section className={cardClass}>
                <div className="mb-4 flex items-center justify-between"><h3 className="text-xl font-black text-stone-900">Prompt 版本</h3><button onClick={savePrompt} className="rounded-full bg-[#5e17eb] px-5 py-2 text-sm font-bold text-white hover:bg-[#5112d1]">发布新版本</button></div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2"><input placeholder="版本号（可选）" value={promptForm.version} onChange={(e) => setPromptForm({ ...promptForm, version: e.target.value })} className={inputClass} /><input placeholder="变更说明（可选）" value={promptForm.change_note} onChange={(e) => setPromptForm({ ...promptForm, change_note: e.target.value })} className={inputClass} /></div>
                <textarea placeholder="System Prompt" value={promptForm.system_prompt} onChange={(e) => setPromptForm({ ...promptForm, system_prompt: e.target.value })} className={`mt-3 h-40 ${textareaClass}`} />
                <textarea placeholder="Prompt Template" value={promptForm.prompt_template} onChange={(e) => setPromptForm({ ...promptForm, prompt_template: e.target.value })} className={`mt-3 h-28 ${textareaClass}`} />
                <div className="mt-3 max-h-40 overflow-auto rounded-xl border border-stone-200 bg-stone-50 p-3">{promptHistory.length ? (promptHistory.map((p) => (<div key={p.id} className="border-b border-stone-200 py-2 text-xs text-stone-600 last:border-b-0"><span className="font-bold text-stone-800">{p.version}</span> · {p.change_note || ""}</div>))) : (<div className="text-xs text-stone-500">暂无历史</div>)}</div>
              </section>

              <section className={cardClass}>
                <div className="mb-4 flex items-center justify-between"><h3 className="text-xl font-black text-stone-900">策略配置</h3><button onClick={savePolicy} className="rounded-full bg-[#5e17eb] px-5 py-2 text-sm font-bold text-white hover:bg-[#5112d1]">保存策略</button></div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2"><textarea value={policyForm.allowed_routes_json} onChange={(e) => setPolicyForm({ ...policyForm, allowed_routes_json: e.target.value })} className={`h-28 ${textareaClass}`} /><textarea value={policyForm.role_scope_json} onChange={(e) => setPolicyForm({ ...policyForm, role_scope_json: e.target.value })} className={`h-28 ${textareaClass}`} /><textarea value={policyForm.rate_limit_json} onChange={(e) => setPolicyForm({ ...policyForm, rate_limit_json: e.target.value })} className={`h-28 ${textareaClass}`} /><textarea value={policyForm.input_guardrails_json} onChange={(e) => setPolicyForm({ ...policyForm, input_guardrails_json: e.target.value })} className={`h-28 ${textareaClass}`} /></div>
                <textarea value={policyForm.output_guardrails_json} onChange={(e) => setPolicyForm({ ...policyForm, output_guardrails_json: e.target.value })} className={`mt-3 h-28 ${textareaClass}`} />
              </section>

              <section className={cardClass}>
                <div className="mb-4 flex items-center justify-between"><h3 className="text-xl font-black text-stone-900">路由策略</h3><button onClick={saveStrategy} className="rounded-full bg-[#5e17eb] px-5 py-2 text-sm font-bold text-white hover:bg-[#5112d1]">保存路由策略</button></div>
                <div className="flex gap-2"><select value={strategyRoute} onChange={async (e) => { setStrategyRoute(e.target.value); await loadStrategy(e.target.value); }} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700"><option value="ai_chat">ai_chat</option><option value="textbook_analyze">textbook_analyze</option><option value="assessment_questions">assessment_questions</option><option value="wrong_analyze">wrong_analyze</option><option value="admission_planning">admission_planning</option></select></div>
                <textarea value={strategyJson} onChange={(e) => setStrategyJson(e.target.value)} className={`mt-3 h-32 ${textareaClass}`} />
              </section>

              <section className={cardClass}>
                <h3 className="mb-3 text-xl font-black text-stone-900">运行日志</h3>
                {runs.length ? (
                  <div className="max-h-52 overflow-auto rounded-xl border border-stone-200"><table className="w-full text-xs"><thead><tr className="bg-stone-50 text-stone-600"><th className="p-2 text-left font-bold">trace</th><th className="p-2 text-left font-bold">route</th><th className="p-2 text-left font-bold">agent</th><th className="p-2 text-left font-bold">status</th></tr></thead><tbody className="divide-y divide-stone-100">{runs.map((r, i) => (<tr key={`${i}-${r.trace_id || ""}`}><td className="p-2 font-mono text-stone-600">{r.trace_id || "-"}</td><td className="p-2 text-stone-700">{r.route_key || "-"}</td><td className="p-2 text-stone-700">{r.agent_code || "-"}</td><td className="p-2 text-stone-700">{r.status || "-"}</td></tr>))}</tbody></table></div>
                ) : (<div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-5 text-sm text-stone-500">暂无运行日志</div>)}
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default AdminMultiAgentsPage;
