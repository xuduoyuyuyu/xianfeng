import fs from "fs";
import path from "path";

export type ModelCapability = "chat" | "reasoning" | "asr" | "extract";

export type ModelRegistryItem = {
  id: string;
  name: string;
  provider: string;
  model_name: string;
  api_key: string;
  base_url: string;
  enabled: boolean;
  capabilities: ModelCapability[];
  meta: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type AgentFeatureModels = {
  asr?: string;
  extract?: string;
};

export type AgentRow = {
  agent_code: string;
  name: string;
  description: string;
  status: string;
  model_provider: string;
  model_name: string;
  primary_model_id?: string;
  feature_models?: AgentFeatureModels;
  temperature: number;
  top_p: number;
  max_tokens: number;
  timeout_ms: number;
  max_retry: number;
  enable_web_search: boolean;
};

export type Store = {
  agents: AgentRow[];
  prompts: Record<string, { current: any; items: any[] }>;
  policies: Record<string, any>;
  strategies: Record<string, any>;
  runs: any[];
  model_registry: ModelRegistryItem[];
};

// Keep storage path stable regardless of process cwd.
// Both tsx (src/*) and compiled dist/* resolve to backend/data/multi_agents.
const STORE_DIR = path.resolve(__dirname, "..", "..", "data", "multi_agents");
const STORE_FILE = path.join(STORE_DIR, "store.json");
const LEGACY_STORE_FILE = path.join(process.cwd(), "data", "multi_agents", "store.json");

const DEFAULT_MODEL_REGISTRY: ModelRegistryItem[] = [
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

function normalizeFeatureModels(input: any): AgentFeatureModels {
  const raw = input && typeof input === "object" ? input : {};
  const out: AgentFeatureModels = {};
  if (typeof raw.asr === "string" && raw.asr.trim()) out.asr = raw.asr.trim();
  if (typeof raw.extract === "string" && raw.extract.trim()) out.extract = raw.extract.trim();
  return out;
}

export function envPreview(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function maskModelRegistryItem(item: ModelRegistryItem) {
  return {
    ...item,
    api_key: undefined,
    api_key_preview: envPreview(String(item.api_key || "").trim()),
  };
}

function migrateStore(parsed: any): Store {
  const raw = parsed && typeof parsed === "object" ? parsed : {};
  const agents = Array.isArray(raw.agents) ? raw.agents : [];
  const normalizedAgents = agents.map((a: any) => ({
    ...a,
    primary_model_id: typeof a?.primary_model_id === "string" ? a.primary_model_id : "",
    feature_models: normalizeFeatureModels(a?.feature_models),
  })) as AgentRow[];
  const modelRegistry = Array.isArray(raw.model_registry) && raw.model_registry.length ? raw.model_registry : DEFAULT_MODEL_REGISTRY;
  return {
    agents: normalizedAgents,
    prompts: raw.prompts && typeof raw.prompts === "object" ? raw.prompts : {},
    policies: raw.policies && typeof raw.policies === "object" ? raw.policies : {},
    strategies: raw.strategies && typeof raw.strategies === "object" ? raw.strategies : {},
    runs: Array.isArray(raw.runs) ? raw.runs : [],
    model_registry: modelRegistry.map((m: any) => ({
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

export function ensureStore(seedFactory: () => Omit<Store, "model_registry">): Store {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    // One-time compatibility: migrate data from old cwd-based path if it exists.
    if (fs.existsSync(LEGACY_STORE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LEGACY_STORE_FILE, "utf-8"));
      const migrated = migrateStore(parsed);
      fs.writeFileSync(STORE_FILE, JSON.stringify(migrated, null, 2), "utf-8");
      return migrated;
    }
    const seed = seedFactory();
    const full: Store = {
      ...seed,
      agents: seed.agents.map((a) => ({
        ...a,
        primary_model_id: a.primary_model_id || "",
        feature_models: normalizeFeatureModels(a.feature_models),
      })),
      model_registry: DEFAULT_MODEL_REGISTRY,
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(full, null, 2), "utf-8");
    return full;
  }
  const parsed = JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
  const migrated = migrateStore(parsed);
  const rawText = JSON.stringify(parsed);
  const migratedText = JSON.stringify(migrated);
  if (rawText !== migratedText) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(migrated, null, 2), "utf-8");
  }
  return migrated;
}

export function saveStore(store: Store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function resolveAgentModelConfig(agent: AgentRow, registry: ModelRegistryItem[]) {
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
      ? { provider: primary.provider, model_name: primary.model_name, api_key: primary.api_key, base_url: primary.base_url, meta: primary.meta }
      : { provider: agent.model_provider, model_name: agent.model_name, api_key: "", base_url: "", meta: {} },
    features: {
      asr: asr ? { provider: asr.provider, model_name: asr.model_name, api_key: asr.api_key, base_url: asr.base_url, meta: asr.meta } : null,
      extract: extract
        ? { provider: extract.provider, model_name: extract.model_name, api_key: extract.api_key, base_url: extract.base_url, meta: extract.meta }
        : null,
    },
  };
}
