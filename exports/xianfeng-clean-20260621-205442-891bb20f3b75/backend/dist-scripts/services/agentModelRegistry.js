"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.envPreview = envPreview;
exports.maskModelRegistryItem = maskModelRegistryItem;
exports.ensureStore = ensureStore;
exports.saveStore = saveStore;
exports.resolveAgentModelConfig = resolveAgentModelConfig;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Keep storage path stable regardless of process cwd.
// Both tsx (src/*) and compiled dist/* resolve to backend/data/multi_agents.
// 使用已挂载的 uploads 目录确保持久化（容器重建不会丢失）
const STORE_DIR = path_1.default.resolve(__dirname, "..", "..", "uploads", "_agents_store");
const STORE_FILE = path_1.default.join(STORE_DIR, "store.json");
// 迁移兼容：旧路径 data/multi_agents
const LEGACY_STORE_FILE_1 = path_1.default.join(process.cwd(), "data", "multi_agents", "store.json");
const LEGACY_STORE_FILE_2 = path_1.default.resolve(__dirname, "..", "..", "data", "multi_agents", "store.json");
const DEFAULT_MODEL_REGISTRY = [
    {
        id: "default-openai-gpt41",
        name: "OpenAI GPT-4.1",
        provider: "openai",
        model_name: "gpt-4.1",
        api_key: "",
        base_url: "",
        enabled: true,
        capabilities: ["chat", "reasoning"],
        meta: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    },
];
function normalizeFeatureModels(input) {
    const raw = input && typeof input === "object" ? input : {};
    const out = {};
    if (typeof raw.asr === "string" && raw.asr.trim())
        out.asr = raw.asr.trim();
    if (typeof raw.extract === "string" && raw.extract.trim())
        out.extract = raw.extract.trim();
    return out;
}
function envPreview(value) {
    if (!value)
        return "";
    if (value.length <= 8)
        return "****";
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
function maskModelRegistryItem(item) {
    return {
        ...item,
        api_key: undefined,
        api_key_preview: envPreview(String(item.api_key || "").trim()),
    };
}
function migrateStore(parsed) {
    const raw = parsed && typeof parsed === "object" ? parsed : {};
    const agents = Array.isArray(raw.agents) ? raw.agents : [];
    const normalizedAgents = agents.map((a) => ({
        ...a,
        primary_model_id: typeof a?.primary_model_id === "string" ? a.primary_model_id : "",
        feature_models: normalizeFeatureModels(a?.feature_models),
    }));
    const modelRegistry = Array.isArray(raw.model_registry) && raw.model_registry.length ? raw.model_registry : DEFAULT_MODEL_REGISTRY;
    return {
        agents: normalizedAgents,
        prompts: raw.prompts && typeof raw.prompts === "object" ? raw.prompts : {},
        policies: raw.policies && typeof raw.policies === "object" ? raw.policies : {},
        strategies: raw.strategies && typeof raw.strategies === "object" ? raw.strategies : {},
        runs: Array.isArray(raw.runs) ? raw.runs : [],
        model_registry: modelRegistry.map((m) => ({
            id: String(m?.id || ""),
            name: String(m?.name || ""),
            provider: String(m?.provider || ""),
            model_name: String(m?.model_name || ""),
            api_key: String(m?.api_key || ""),
            base_url: String(m?.base_url || ""),
            enabled: Boolean(m?.enabled),
            capabilities: Array.isArray(m?.capabilities) ? m.capabilities.filter(Boolean) : [],
            meta: m?.meta && typeof m.meta === "object" ? m.meta : {},
            created_at: String(m?.created_at || new Date().toISOString()),
            updated_at: String(m?.updated_at || new Date().toISOString()),
        })),
    };
}
function ensureStore(seedFactory) {
    fs_1.default.mkdirSync(STORE_DIR, { recursive: true });
    if (!fs_1.default.existsSync(STORE_FILE)) {
        // One-time compatibility: migrate from old paths
        const legacySources = [LEGACY_STORE_FILE_1, LEGACY_STORE_FILE_2];
        for (const legacyPath of legacySources) {
            if (fs_1.default.existsSync(legacyPath)) {
                const parsed = JSON.parse(fs_1.default.readFileSync(legacyPath, "utf-8"));
                const migrated = migrateStore(parsed);
                fs_1.default.writeFileSync(STORE_FILE, JSON.stringify(migrated, null, 2), "utf-8");
                return migrated;
            }
        }
        const seed = seedFactory();
        const full = {
            ...seed,
            agents: seed.agents.map((a) => ({
                ...a,
                primary_model_id: a.primary_model_id || "",
                feature_models: normalizeFeatureModels(a.feature_models),
            })),
            model_registry: DEFAULT_MODEL_REGISTRY,
        };
        fs_1.default.writeFileSync(STORE_FILE, JSON.stringify(full, null, 2), "utf-8");
        return full;
    }
    const parsed = JSON.parse(fs_1.default.readFileSync(STORE_FILE, "utf-8"));
    const migrated = migrateStore(parsed);
    const rawText = JSON.stringify(parsed);
    const migratedText = JSON.stringify(migrated);
    if (rawText !== migratedText) {
        fs_1.default.writeFileSync(STORE_FILE, JSON.stringify(migrated, null, 2), "utf-8");
    }
    return migrated;
}
function saveStore(store) {
    fs_1.default.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}
function normalizeUpstreamModelName(provider, modelName) {
    const p = String(provider || "").trim().toLowerCase();
    const m = String(modelName || "").trim();
    const ml = m.toLowerCase();
    // Compatibility: gateways often reject shorthand names like "Pro"/"Flash".
    if (ml === "pro")
        return "deepseek-v4-pro";
    if (ml === "flash")
        return "deepseek-v4-flash";
    if (p === "deepseek" && ml === "deepseek-chat")
        return "deepseek-v4-flash";
    return m;
}
function resolveAgentModelConfig(agent, registry) {
    const primaryById = registry.find((x) => x.id === agent.primary_model_id && x.enabled);
    const fallbackPrimary = !primaryById
        ? registry
            .filter((x) => x.enabled && x.provider === agent.model_provider && x.model_name === agent.model_name)
            .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0]
        : null;
    const primary = primaryById || fallbackPrimary;
    const asr = registry.find((x) => x.id === agent.feature_models?.asr && x.enabled);
    const extract = registry.find((x) => x.id === agent.feature_models?.extract && x.enabled);
    return {
        primary: primary
            ? {
                id: primary.id,
                name: primary.name,
                provider: primary.provider,
                model_name: normalizeUpstreamModelName(primary.provider, primary.model_name),
                api_key: primary.api_key,
                base_url: primary.base_url,
                meta: primary.meta,
            }
            : {
                provider: agent.model_provider,
                model_name: normalizeUpstreamModelName(agent.model_provider, agent.model_name),
                api_key: "",
                base_url: "",
                meta: {},
            },
        features: {
            asr: asr
                ? {
                    id: asr.id,
                    name: asr.name,
                    provider: asr.provider,
                    model_name: normalizeUpstreamModelName(asr.provider, asr.model_name),
                    api_key: asr.api_key,
                    base_url: asr.base_url,
                    meta: asr.meta,
                }
                : null,
            extract: extract
                ? {
                    id: extract.id,
                    name: extract.name,
                    provider: extract.provider,
                    model_name: normalizeUpstreamModelName(extract.provider, extract.model_name),
                    api_key: extract.api_key,
                    base_url: extract.base_url,
                    meta: extract.meta,
                }
                : null,
        },
    };
}
