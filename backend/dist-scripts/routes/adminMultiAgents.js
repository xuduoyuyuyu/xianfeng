"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middlewares/auth");
const requireAdmin_1 = require("../middlewares/requireAdmin");
const agentModelRegistry_1 = require("../services/agentModelRegistry");
const router = express_1.default.Router();
const DEFAULT_AGENTS = [
    { agent_code: "dispatch_control_agent", name: "调度控制", description: "路由策略/降级控制", status: "active", model_provider: "openai", model_name: "gpt-4.1", primary_model_id: "", feature_models: {}, temperature: 0.2, top_p: 0.95, max_tokens: 1200, timeout_ms: 60000, max_retry: 1, enable_web_search: false },
    { agent_code: "chat_manager_agent", name: "小玩子对话管理", description: "小玩子入口与用户全量上下文管理", status: "active", model_provider: "openai", model_name: "gpt-4.1", primary_model_id: "", feature_models: {}, temperature: 0.2, top_p: 0.95, max_tokens: 1200, timeout_ms: 60000, max_retry: 1, enable_web_search: false },
    { agent_code: "user_agent", name: "用户信息智能体", description: "统一用户基础信息收集、清洗、标准化", status: "active", model_provider: "openai", model_name: "gpt-4.1", primary_model_id: "", feature_models: {}, temperature: 0.2, top_p: 0.95, max_tokens: 1200, timeout_ms: 60000, max_retry: 1, enable_web_search: false },
    { agent_code: "local_edu_agent", name: "本地教育信息智能体", description: "城市教育政策结构化与规则派发", status: "active", model_provider: "openai", model_name: "gpt-4.1", primary_model_id: "", feature_models: {}, temperature: 0.2, top_p: 0.95, max_tokens: 1200, timeout_ms: 60000, max_retry: 1, enable_web_search: false },
    { agent_code: "evaluation_agent", name: "学情测评智能体", description: "动态能力测评与雷达输出", status: "active", model_provider: "openai", model_name: "gpt-4.1", primary_model_id: "", feature_models: {}, temperature: 0.2, top_p: 0.95, max_tokens: 1200, timeout_ms: 60000, max_retry: 1, enable_web_search: false },
    { agent_code: "plan_agent", name: "升学规划智能体", description: "基于用户信息/政策/测评生成升学路径", status: "active", model_provider: "openai", model_name: "gpt-4.1", primary_model_id: "", feature_models: {}, temperature: 0.2, top_p: 0.95, max_tokens: 1200, timeout_ms: 60000, max_retry: 1, enable_web_search: false },
    { agent_code: "textbook_structure_agent", name: "教材结构理解", description: "结构化章节解析", status: "active", model_provider: "openai", model_name: "gpt-4.1", primary_model_id: "", feature_models: {}, temperature: 0.2, top_p: 0.95, max_tokens: 1200, timeout_ms: 60000, max_retry: 1, enable_web_search: false },
    { agent_code: "knowledge_split_agent", name: "知识点拆分", description: "章节知识点拆分", status: "active", model_provider: "openai", model_name: "gpt-4.1", primary_model_id: "", feature_models: {}, temperature: 0.2, top_p: 0.95, max_tokens: 1200, timeout_ms: 60000, max_retry: 1, enable_web_search: false },
    { agent_code: "learning_path_agent", name: "学习路径", description: "学习路径建议", status: "active", model_provider: "openai", model_name: "gpt-4.1", primary_model_id: "", feature_models: {}, temperature: 0.2, top_p: 0.95, max_tokens: 1200, timeout_ms: 60000, max_retry: 1, enable_web_search: false },
    { agent_code: "question_generate_agent", name: "题目生成", description: "测评题生成", status: "active", model_provider: "openai", model_name: "gpt-4.1", primary_model_id: "", feature_models: {}, temperature: 0.2, top_p: 0.95, max_tokens: 1200, timeout_ms: 60000, max_retry: 1, enable_web_search: false },
    { agent_code: "question_quality_agent", name: "题目质量", description: "质量评分与拦截", status: "active", model_provider: "openai", model_name: "gpt-4.1", primary_model_id: "", feature_models: {}, temperature: 0.2, top_p: 0.95, max_tokens: 1200, timeout_ms: 60000, max_retry: 1, enable_web_search: false },
    { agent_code: "question_bind_agent", name: "题目绑定", description: "知识点绑定与覆盖", status: "active", model_provider: "openai", model_name: "gpt-4.1", primary_model_id: "", feature_models: {}, temperature: 0.2, top_p: 0.95, max_tokens: 1200, timeout_ms: 60000, max_retry: 1, enable_web_search: false },
    { agent_code: "tutor_reply_agent", name: "讲解应答", description: "Tutor 主应答", status: "active", model_provider: "openai", model_name: "gpt-4.1", primary_model_id: "", feature_models: {}, temperature: 0.2, top_p: 0.95, max_tokens: 1200, timeout_ms: 60000, max_retry: 1, enable_web_search: false },
    { agent_code: "wrong_cause_agent", name: "错因分析", description: "错因归类与解释", status: "active", model_provider: "openai", model_name: "gpt-4.1", primary_model_id: "", feature_models: {}, temperature: 0.2, top_p: 0.95, max_tokens: 1200, timeout_ms: 60000, max_retry: 1, enable_web_search: false },
    { agent_code: "wrong_training_agent", name: "错题训练", description: "训练建议输出", status: "active", model_provider: "openai", model_name: "gpt-4.1", primary_model_id: "", feature_models: {}, temperature: 0.2, top_p: 0.95, max_tokens: 1200, timeout_ms: 60000, max_retry: 1, enable_web_search: false },
];
const DEFAULT_ROUTE_KEYS = ["textbook_analyze", "assessment_questions", "ai_chat", "wrong_analyze", "admission_planning"];
function buildSeedStore() {
    return {
        agents: DEFAULT_AGENTS,
        prompts: Object.fromEntries(DEFAULT_AGENTS.map((a) => [
            a.agent_code,
            {
                current: {
                    id: 1,
                    version: "bootstrap-v1",
                    system_prompt: `${a.name} 系统提示词`,
                    prompt_template: "Input: {...}\\nOutput: {...}",
                    change_note: "init",
                    is_current: true,
                    created_at: new Date().toISOString(),
                },
                items: [],
            },
        ])),
        policies: Object.fromEntries(DEFAULT_AGENTS.map((a) => [
            a.agent_code,
            {
                allowed_routes_json: DEFAULT_ROUTE_KEYS,
                role_scope_json: ["system", "user", "admin"],
                rate_limit_json: {},
                input_guardrails_json: {},
                output_guardrails_json: {},
            },
        ])),
        strategies: Object.fromEntries(DEFAULT_ROUTE_KEYS.map((k) => [k, { mode: "sequential", timeout_ms: 60000 }])),
        runs: [],
    };
}
function listAgents() {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    return [...store.agents].sort((a, b) => (a.agent_code === "chat_manager_agent" ? -1 : b.agent_code === "chat_manager_agent" ? 1 : 0));
}
function makeDefaultPrompt(name) {
    return {
        id: Date.now(),
        version: "bootstrap-v1",
        system_prompt: `${name} 系统提示词`,
        prompt_template: "Input: {...}\\nOutput: {...}",
        change_note: "init",
        is_current: true,
        created_at: new Date().toISOString(),
    };
}
function makeDefaultPolicy() {
    return {
        allowed_routes_json: DEFAULT_ROUTE_KEYS,
        role_scope_json: ["system", "user", "admin"],
        rate_limit_json: {},
        input_guardrails_json: {},
        output_guardrails_json: {},
    };
}
function normalizeFeatureModels(input) {
    const raw = input && typeof input === "object" ? input : {};
    const out = {};
    if (typeof raw.asr === "string" && raw.asr.trim())
        out.asr = raw.asr.trim();
    if (typeof raw.extract === "string" && raw.extract.trim())
        out.extract = raw.extract.trim();
    return out;
}
function pickAgentWritableFields(incoming) {
    return {
        name: typeof incoming?.name === "string" ? incoming.name : undefined,
        description: typeof incoming?.description === "string" ? incoming.description : undefined,
        status: typeof incoming?.status === "string" ? incoming.status : undefined,
        model_provider: typeof incoming?.model_provider === "string" ? incoming.model_provider : undefined,
        model_name: typeof incoming?.model_name === "string" ? incoming.model_name : undefined,
        primary_model_id: typeof incoming?.primary_model_id === "string" ? incoming.primary_model_id : "",
        feature_models: normalizeFeatureModels(incoming?.feature_models),
        temperature: Number.isFinite(Number(incoming?.temperature)) ? Number(incoming.temperature) : undefined,
        top_p: Number.isFinite(Number(incoming?.top_p)) ? Number(incoming.top_p) : undefined,
        max_tokens: Number.isFinite(Number(incoming?.max_tokens)) ? Number(incoming.max_tokens) : undefined,
        timeout_ms: Number.isFinite(Number(incoming?.timeout_ms)) ? Number(incoming.timeout_ms) : undefined,
        max_retry: Number.isFinite(Number(incoming?.max_retry)) ? Number(incoming.max_retry) : undefined,
        enable_web_search: typeof incoming?.enable_web_search === "boolean" ? incoming.enable_web_search : undefined,
    };
}
function makeAgentResponse(agent, registry) {
    return {
        ...agent,
        resolved_model_config: (0, agentModelRegistry_1.resolveAgentModelConfig)(agent, registry),
    };
}
router.use(auth_1.authenticate, requireAdmin_1.requireAdmin);
router.get("/multi-agents", (_req, res) => {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    res.json({ items: store.agents.map((x) => makeAgentResponse(x, store.model_registry)) });
});
router.get("/multi-agents/:code", (req, res) => {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    const row = store.agents.find((x) => x.agent_code === req.params.code);
    if (!row)
        return res.status(404).json({ message: "agent 不存在" });
    const prompts = store.prompts[req.params.code] || { current: null, items: [] };
    const policy = store.policies[req.params.code] || {};
    return res.json({ agent: makeAgentResponse(row, store.model_registry), current_prompt: prompts.current, prompts: prompts.items, policy });
});
router.put(["/multi-agents/:code", "/mgmt/agents/:code"], (req, res) => {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    const idx = store.agents.findIndex((x) => x.agent_code === req.params.code);
    if (idx < 0)
        return res.status(404).json({ message: "agent 不存在" });
    const incoming = req.body || {};
    const writable = pickAgentWritableFields(incoming);
    store.agents[idx] = {
        ...store.agents[idx],
        ...Object.fromEntries(Object.entries(writable).filter(([, v]) => v !== undefined)),
    };
    (0, agentModelRegistry_1.saveStore)(store);
    return res.json({ ok: true, agent: makeAgentResponse(store.agents[idx], store.model_registry) });
});
router.get("/mgmt/agents", (_req, res) => {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    res.json({ items: listAgents().map((x) => makeAgentResponse(x, store.model_registry)) });
});
router.get("/mgmt/agents/:code", (req, res) => {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    const row = store.agents.find((x) => x.agent_code === req.params.code);
    if (!row)
        return res.status(404).json({ message: "agent 不存在" });
    const prompts = store.prompts[req.params.code] || { current: null, items: [] };
    return res.json({ agent: makeAgentResponse(row, store.model_registry), current_prompt: prompts.current });
});
router.post(["/multi-agents", "/mgmt/agents"], (req, res) => {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    const incoming = req.body || {};
    const agentCode = String(incoming.agent_code || "").trim();
    const name = String(incoming.name || "").trim();
    if (!agentCode)
        return res.status(400).json({ message: "agent_code 不能为空" });
    if (!/^[a-z][a-z0-9_]{2,63}$/i.test(agentCode))
        return res.status(400).json({ message: "agent_code 格式错误，只允许字母数字下划线，长度 3-64" });
    if (!name)
        return res.status(400).json({ message: "name 不能为空" });
    if (store.agents.some((x) => x.agent_code === agentCode))
        return res.status(409).json({ message: "agent_code 已存在" });
    const row = {
        agent_code: agentCode,
        name,
        description: String(incoming.description || ""),
        status: String(incoming.status || "active"),
        model_provider: String(incoming.model_provider || "openai"),
        model_name: String(incoming.model_name || "gpt-4.1"),
        primary_model_id: String(incoming.primary_model_id || ""),
        feature_models: normalizeFeatureModels(incoming.feature_models),
        temperature: Number.isFinite(Number(incoming.temperature)) ? Number(incoming.temperature) : 0.2,
        top_p: Number.isFinite(Number(incoming.top_p)) ? Number(incoming.top_p) : 0.95,
        max_tokens: Number.isFinite(Number(incoming.max_tokens)) ? Number(incoming.max_tokens) : 1200,
        timeout_ms: Number.isFinite(Number(incoming.timeout_ms)) ? Number(incoming.timeout_ms) : 60000,
        max_retry: Number.isFinite(Number(incoming.max_retry)) ? Number(incoming.max_retry) : 1,
        enable_web_search: !!incoming.enable_web_search,
    };
    store.agents.push(row);
    store.prompts[agentCode] = { current: makeDefaultPrompt(name), items: [] };
    store.policies[agentCode] = makeDefaultPolicy();
    (0, agentModelRegistry_1.saveStore)(store);
    return res.status(201).json({ ok: true, agent: makeAgentResponse(row, store.model_registry) });
});
router.delete(["/multi-agents/:code", "/mgmt/agents/:code"], (req, res) => {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    const code = String(req.params.code || "");
    const idx = store.agents.findIndex((x) => x.agent_code === code);
    if (idx < 0)
        return res.status(404).json({ message: "agent 不存在" });
    store.agents.splice(idx, 1);
    delete store.prompts[code];
    delete store.policies[code];
    (0, agentModelRegistry_1.saveStore)(store);
    return res.json({ ok: true });
});
function getPrompts(code) {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    const bucket = store.prompts[code] || { current: null, items: [] };
    const candidates = [bucket.current, ...(Array.isArray(bucket.items) ? bucket.items : [])].filter(Boolean);
    const latest = [...candidates].sort((a, b) => {
        const at = String(a?.created_at || "");
        const bt = String(b?.created_at || "");
        if (at !== bt)
            return bt.localeCompare(at);
        return Number(b?.id || 0) - Number(a?.id || 0);
    })[0] || null;
    return {
        current: latest,
        items: (bucket.items || []).filter((x) => !latest || x?.id !== latest?.id),
    };
}
router.get(["/multi-agents/:code/prompts", "/mgmt/agents/:code/prompts"], (req, res) => {
    const code = String(req.params.code || "");
    const prompt = getPrompts(code);
    res.json({ agent_code: code, current: prompt.current, items: prompt.items || [] });
});
router.post(["/multi-agents/:code/prompts", "/mgmt/agents/:code/prompts"], (req, res) => {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    const code = String(req.params.code || "");
    const now = new Date().toISOString();
    const current = store.prompts[code]?.current;
    const item = {
        id: Date.now(),
        version: String(req.body?.version || `v-${Date.now()}`),
        system_prompt: String(req.body?.system_prompt || ""),
        prompt_template: String(req.body?.prompt_template || ""),
        change_note: String(req.body?.change_note || ""),
        is_current: true,
        created_at: now,
    };
    const list = store.prompts[code]?.items || [];
    if (current)
        list.unshift({ ...current, is_current: false });
    store.prompts[code] = { current: item, items: list.slice(0, 20) };
    (0, agentModelRegistry_1.saveStore)(store);
    res.json({ ok: true, agent_code: code, current: item });
});
router.get(["/multi-agents/:code/policy", "/mgmt/agents/:code/policy"], (req, res) => {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    const code = String(req.params.code || "");
    res.json({ agent_code: code, policy: store.policies[code] || {} });
});
router.put(["/multi-agents/:code/policy", "/mgmt/agents/:code/policy"], (req, res) => {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    const code = String(req.params.code || "");
    store.policies[code] = {
        allowed_routes_json: req.body?.allowed_routes_json || [],
        role_scope_json: req.body?.role_scope_json || ["system", "user", "admin"],
        rate_limit_json: req.body?.rate_limit_json || {},
        input_guardrails_json: req.body?.input_guardrails_json || {},
        output_guardrails_json: req.body?.output_guardrails_json || {},
    };
    (0, agentModelRegistry_1.saveStore)(store);
    res.json({ ok: true, agent_code: code, policy: store.policies[code] });
});
router.get(["/multi-agents/strategies/list", "/mgmt/agents/strategies"], (req, res) => {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    const routeKey = String(req.query.route_key || "");
    const strategy = store.strategies[routeKey] || {};
    res.json({ route_key: routeKey, strategy: { route_key: routeKey, strategy } });
});
router.put(["/multi-agents/strategies/:routeKey", "/mgmt/agents/strategies/:routeKey"], (req, res) => {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    const routeKey = String(req.params.routeKey || "");
    store.strategies[routeKey] = req.body?.strategy_json || {};
    (0, agentModelRegistry_1.saveStore)(store);
    res.json({ ok: true, route_key: routeKey, strategy: store.strategies[routeKey] });
});
router.get(["/multi-agents/runs", "/mgmt/agents/runs"], (req, res) => {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    let rows = [...store.runs];
    const trace = String(req.query.trace_id || "").trim();
    const route = String(req.query.route_key || "").trim();
    if (trace)
        rows = rows.filter((x) => String(x.trace_id || "").includes(trace));
    if (route)
        rows = rows.filter((x) => String(x.route_key || "") === route);
    res.json({ items: rows.slice(0, 100) });
});
router.get("/mgmt/model-registry", (_req, res) => {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    res.json({ items: store.model_registry.map(agentModelRegistry_1.maskModelRegistryItem) });
});
router.post("/mgmt/model-registry", (req, res) => {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    const body = req.body || {};
    const id = String(body.id || "").trim();
    const name = String(body.name || "").trim();
    const provider = String(body.provider || "").trim();
    const modelName = String(body.model_name || "").trim();
    if (!id || !name || !provider || !modelName) {
        return res.status(400).json({ message: "id/name/provider/model_name 必填" });
    }
    if (store.model_registry.some((x) => x.id === id)) {
        return res.status(409).json({ message: "模型 ID 已存在" });
    }
    const now = new Date().toISOString();
    const item = {
        id,
        name,
        provider,
        model_name: modelName,
        api_key: String(body.api_key || ""),
        base_url: String(body.base_url || ""),
        enabled: body.enabled !== false,
        capabilities: Array.isArray(body.capabilities) ? body.capabilities.map(String) : [],
        meta: body.meta && typeof body.meta === "object" ? body.meta : {},
        created_at: now,
        updated_at: now,
    };
    store.model_registry.push(item);
    (0, agentModelRegistry_1.saveStore)(store);
    res.status(201).json({ ok: true, item: (0, agentModelRegistry_1.maskModelRegistryItem)(item) });
});
router.put("/mgmt/model-registry/:id", (req, res) => {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    const id = String(req.params.id || "");
    const idx = store.model_registry.findIndex((x) => x.id === id);
    if (idx < 0)
        return res.status(404).json({ message: "模型不存在" });
    const body = req.body || {};
    const previous = store.model_registry[idx];
    const apiKey = typeof body.api_key === "string" ? body.api_key : previous.api_key;
    store.model_registry[idx] = {
        ...previous,
        name: typeof body.name === "string" ? body.name : previous.name,
        provider: typeof body.provider === "string" ? body.provider : previous.provider,
        model_name: typeof body.model_name === "string" ? body.model_name : previous.model_name,
        api_key: apiKey,
        base_url: typeof body.base_url === "string" ? body.base_url : previous.base_url,
        enabled: typeof body.enabled === "boolean" ? body.enabled : previous.enabled,
        capabilities: Array.isArray(body.capabilities) ? body.capabilities.map(String) : previous.capabilities,
        meta: body.meta && typeof body.meta === "object" ? body.meta : previous.meta,
        updated_at: new Date().toISOString(),
    };
    (0, agentModelRegistry_1.saveStore)(store);
    res.json({ ok: true, item: (0, agentModelRegistry_1.maskModelRegistryItem)(store.model_registry[idx]) });
});
router.delete("/mgmt/model-registry/:id", (req, res) => {
    const store = (0, agentModelRegistry_1.ensureStore)(buildSeedStore);
    const id = String(req.params.id || "");
    const refs = store.agents
        .filter((a) => a.primary_model_id === id || a.feature_models?.asr === id || a.feature_models?.extract === id)
        .map((a) => a.agent_code);
    if (refs.length > 0) {
        return res.status(409).json({ message: "模型已被 agent 引用，无法删除", references: refs });
    }
    const idx = store.model_registry.findIndex((x) => x.id === id);
    if (idx < 0)
        return res.status(404).json({ message: "模型不存在" });
    store.model_registry.splice(idx, 1);
    (0, agentModelRegistry_1.saveStore)(store);
    res.json({ ok: true });
});
exports.default = router;
