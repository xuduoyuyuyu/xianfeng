import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { GuestAgentSourceType } from "../models/GuestAgentChunk";

export type WeknoraConfig = {
  enabled: boolean;
  baseUrl: string;
  appId?: string;
  apiKey: string;
  guestKbPrefix: string;
  timeoutMs: number;
  globalKbIds?: string[];
  ragTopK?: number;
};

export type WeknoraClientOptions = {
  config?: WeknoraConfig;
  fetchImpl?: typeof fetch;
  storePath?: string;
};

export type WeknoraGuestDocument = {
  sourceKey: string;
  title: string;
  content: string;
  sourceType: GuestAgentSourceType;
  sourceId: string;
  locator: string;
  url?: string;
};

export type WeknoraSearchHit = {
  chunkId: string;
  sourceType: GuestAgentSourceType;
  sourceId: string;
  sourceTitle: string;
  locator: string;
  text: string;
  url?: string;
  score?: number;
};

type StoredDocument = {
  knowledgeId: string;
  hash: string;
  sourceType: GuestAgentSourceType;
  sourceId: string;
  sourceTitle: string;
  locator: string;
  url?: string;
  updatedAt: string;
};

type StoredGuest = {
  kbId: string;
  kbName: string;
  documents: Record<string, StoredDocument>;
  updatedAt: string;
};

type WeknoraStore = {
  guests: Record<string, StoredGuest>;
};

const DEFAULT_STORE_PATH = path.resolve(__dirname, "..", "..", "uploads", "_weknora_guest_store", "store.json");

export class WeknoraClientError extends Error {
  code: string;
  status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "WeknoraClientError";
    this.code = code;
    this.status = status;
  }
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(value: string, max = 180): string {
  const text = asText(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function normalizeBaseUrl(value: string): string {
  const clean = asText(value).replace(/\/+$/, "");
  if (!clean) return "";
  return clean.endsWith("/api/v1") ? clean : `${clean}/api/v1`;
}

function parseCsv(value: unknown): string[] {
  return asText(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function md5Hex(value: string): string {
  return crypto.createHash("md5").update(value).digest("hex");
}

function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function randomNonce(length = 16): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

export function signWeknoraCloudHeaders(params: {
  appId: string;
  apiKey: string;
  requestId?: string;
  timestamp?: string;
  nonce?: string;
  bodyJson?: string;
}): Record<string, string> {
  const requestId = asText(params.requestId) || crypto.randomUUID();
  const timestamp = asText(params.timestamp) || String(Math.floor(Date.now() / 1000));
  const nonce = asText(params.nonce) || randomNonce();
  const bodyJson = params.bodyJson === undefined || params.bodyJson === "" ? "{}" : params.bodyJson;
  const signatureParams: Record<string, string> = {
    body: md5Hex(bodyJson),
    "x-api-key": params.apiKey,
    "x-appid": params.appId,
    "x-nonce": nonce,
    "x-request-id": requestId,
    "x-timestamp": timestamp,
  };
  const signatureBase = Object.keys(signatureParams)
    .sort()
    .map((key) => `${rfc3986Encode(key)}=${rfc3986Encode(signatureParams[key])}`)
    .join("&");

  return {
    "X-APPID": params.appId,
    "X-API-Key": params.apiKey,
    "X-Request-ID": requestId,
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "X-Signature": md5Hex(signatureBase),
  };
}

export function resolveWeknoraConfig(env: NodeJS.ProcessEnv = process.env): WeknoraConfig {
  const enabled = env.WEKNORA_ENABLED === "true" || env.WEKNORA_ENABLED === "1";
  const baseUrl = normalizeBaseUrl(env.WEKNORA_BASE_URL || "");
  const appId = asText(env.WEKNORA_APP_ID);
  const apiKey = asText(env.WEKNORA_API_KEY);
  const timeoutMs = Math.max(100, positiveInt(env.WEKNORA_RAG_TIMEOUT_MS || env.WEKNORA_TIMEOUT_MS, 8000));
  return {
    enabled: enabled && Boolean(baseUrl && apiKey),
    baseUrl,
    appId,
    apiKey,
    guestKbPrefix: asText(env.WEKNORA_GUEST_KB_PREFIX) || "xianfeng-guest",
    timeoutMs,
    globalKbIds: parseCsv(env.WEKNORA_GLOBAL_KB_IDS),
    ragTopK: positiveInt(env.WEKNORA_RAG_TOP_K, 8),
  };
}

export function isWeknoraEnabled(options: WeknoraClientOptions = {}): boolean {
  return (options.config || resolveWeknoraConfig()).enabled === true;
}

function getConfig(options: WeknoraClientOptions = {}) {
  return options.config || resolveWeknoraConfig();
}

function getFetch(options: WeknoraClientOptions = {}) {
  return options.fetchImpl || fetch;
}

function getStorePath(options: WeknoraClientOptions = {}) {
  return options.storePath || DEFAULT_STORE_PATH;
}

function readStore(options: WeknoraClientOptions = {}): WeknoraStore {
  const storePath = getStorePath(options);
  if (!fs.existsSync(storePath)) return { guests: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
    return {
      guests: parsed && typeof parsed === "object" && parsed.guests && typeof parsed.guests === "object" ? parsed.guests : {},
    };
  } catch {
    return { guests: {} };
  }
}

function writeStore(store: WeknoraStore, options: WeknoraClientOptions = {}) {
  const storePath = getStorePath(options);
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
}

function contentHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function extractData(payload: any) {
  return payload?.data ?? payload;
}

function extractId(payload: any): string {
  const data = extractData(payload);
  return asText(data?.id || data?._id || data?.knowledge_id || data?.kb_id);
}

function extractList(payload: any): any[] {
  const data = extractData(payload);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.knowledge_bases)) return data.knowledge_bases;
  return [];
}

export async function requestWeknora(apiPath: string, options: WeknoraClientOptions & { method?: string; body?: any } = {}) {
  const config = getConfig(options);
  if (!config.enabled) {
    throw new WeknoraClientError("WEKNORA_DISABLED", "WeKnora is not enabled");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const fetchImpl = getFetch(options);
  const bodyJson = options.body === undefined ? "{}" : JSON.stringify(options.body);
  const headers: Record<string, string> = config.appId
    ? signWeknoraCloudHeaders({ appId: config.appId, apiKey: config.apiKey, bodyJson })
    : { "X-API-Key": config.apiKey };
  const init: RequestInit = {
    method: options.method || "GET",
    headers,
    signal: controller.signal,
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = bodyJson;
  }
  try {
    const response = await fetchImpl(`${config.baseUrl}${apiPath.startsWith("/") ? apiPath : `/${apiPath}`}`, init);
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new WeknoraClientError(
        "WEKNORA_HTTP_ERROR",
        payload?.error?.message || payload?.message || `WeKnora HTTP ${response.status}`,
        response.status
      );
    }
    return payload;
  } catch (error: any) {
    if (error instanceof WeknoraClientError) throw error;
    if (error?.name === "AbortError") {
      throw new WeknoraClientError("WEKNORA_TIMEOUT", `WeKnora request timed out after ${config.timeoutMs}ms`);
    }
    throw new WeknoraClientError("WEKNORA_NETWORK_ERROR", error?.message || "WeKnora network error");
  } finally {
    clearTimeout(timer);
  }
}

function makeKbName(guestId: string, guestName: string, config: WeknoraConfig) {
  return `${config.guestKbPrefix}-${asText(guestName) || guestId}`;
}

export async function ensureGuestKnowledgeBase(
  params: { guestId: string; guestName: string },
  options: WeknoraClientOptions = {}
) {
  const config = getConfig(options);
  if (!config.enabled) return { enabled: false, kbId: "", kbName: "", status: "disabled" as const };
  const store = readStore(options);
  const existing = store.guests[params.guestId];
  if (existing?.kbId) return { enabled: true, kbId: existing.kbId, kbName: existing.kbName, status: "existing" as const };

  const kbName = makeKbName(params.guestId, params.guestName, config);
  const listPayload = await requestWeknora("/knowledge-bases", options);
  const matched = extractList(listPayload).find((item) => asText(item?.name) === kbName);
  const kbId = matched ? extractId(matched) : extractId(await requestWeknora("/knowledge-bases", {
    ...options,
    method: "POST",
    body: {
      name: kbName,
      description: `家长先疯嘉宾 AI 分身知识库：${params.guestName || params.guestId}`,
      type: "document",
      indexing_strategy: {
        vector_enabled: true,
        keyword_enabled: true,
        wiki_enabled: false,
        graph_enabled: false,
      },
    },
  }));
  if (!kbId) throw new WeknoraClientError("WEKNORA_BAD_RESPONSE", "WeKnora knowledge base response did not include an id");

  store.guests[params.guestId] = {
    kbId,
    kbName,
    documents: {},
    updatedAt: new Date().toISOString(),
  };
  writeStore(store, options);
  return { enabled: true, kbId, kbName, status: matched ? "matched" as const : "created" as const };
}

export async function uploadGuestKnowledgeDocument(
  params: { guestId: string; kbId: string; document: WeknoraGuestDocument },
  options: WeknoraClientOptions = {}
) {
  const store = readStore(options);
  const guestStore = store.guests[params.guestId];
  if (!guestStore?.kbId) throw new WeknoraClientError("WEKNORA_MAPPING_MISSING", "Guest WeKnora KB mapping is missing");
  const hash = contentHash(`${params.document.title}\n${params.document.content}`);
  const existing = guestStore.documents[params.document.sourceKey];
  if (existing?.knowledgeId && existing.hash === hash) {
    return { status: "skipped" as const, knowledgeId: existing.knowledgeId };
  }

  const body = {
    title: params.document.title,
    content: params.document.content,
    status: "active",
  };
  let knowledgeId = existing?.knowledgeId || "";
  if (knowledgeId) {
    try {
      await requestWeknora(`/knowledge/manual/${knowledgeId}`, { ...options, method: "PUT", body });
    } catch (error: any) {
      if (!(error instanceof WeknoraClientError) || error.status !== 404) throw error;
      knowledgeId = "";
    }
  }
  if (!knowledgeId) {
    knowledgeId = extractId(await requestWeknora(`/knowledge-bases/${params.kbId}/knowledge/manual`, {
      ...options,
      method: "POST",
      body,
    }));
  }
  if (!knowledgeId) throw new WeknoraClientError("WEKNORA_BAD_RESPONSE", "WeKnora knowledge response did not include an id");

  guestStore.documents[params.document.sourceKey] = {
    knowledgeId,
    hash,
    sourceType: params.document.sourceType,
    sourceId: params.document.sourceId,
    sourceTitle: params.document.title,
    locator: params.document.locator,
    url: params.document.url,
    updatedAt: new Date().toISOString(),
  };
  guestStore.updatedAt = new Date().toISOString();
  writeStore(store, options);
  return { status: existing?.knowledgeId ? "updated" as const : "uploaded" as const, knowledgeId };
}

export async function syncGuestKnowledgeDocuments(
  params: { guestId: string; guestName: string; documents: WeknoraGuestDocument[] },
  options: WeknoraClientOptions = {}
) {
  const config = getConfig(options);
  if (!config.enabled) {
    return { enabled: false, status: "disabled" as const, kbId: "", uploaded: 0, updated: 0, skipped: 0, total: 0 };
  }
  const kb = await ensureGuestKnowledgeBase({ guestId: params.guestId, guestName: params.guestName }, options);
  let uploaded = 0;
  let updated = 0;
  let skipped = 0;
  for (const document of params.documents) {
    const result = await uploadGuestKnowledgeDocument({ guestId: params.guestId, kbId: kb.kbId, document }, options);
    if (result.status === "uploaded") uploaded += 1;
    if (result.status === "updated") updated += 1;
    if (result.status === "skipped") skipped += 1;
  }
  return { enabled: true, status: "synced" as const, kbId: kb.kbId, uploaded, updated, skipped, total: params.documents.length };
}

function extractReferences(payload: any): any[] {
  const data = extractData(payload);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.knowledge_references)) return data.knowledge_references;
  if (Array.isArray(data?.references)) return data.references;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

export function normalizeWeknoraSearchResults(
  payload: any,
  lookup: (knowledgeId: string) => Partial<StoredDocument> | undefined
): WeknoraSearchHit[] {
  return extractReferences(payload)
    .map((item) => {
      const knowledgeId = asText(item?.knowledge_id || item?.knowledgeId || item?.knowledge?.id || item?.id);
      const meta = lookup(knowledgeId) || {};
      const sourceType = (meta.sourceType || "public_material") as GuestAgentSourceType;
      const text = truncate(asText(item?.content || item?.text || item?.chunk_content || item?.summary), 180);
      if (!text) return null;
      return {
        chunkId: asText(item?.id || item?.chunk_id || item?.chunkId) || knowledgeId,
        sourceType,
        sourceId: asText(meta.sourceId) || knowledgeId,
        sourceTitle: asText(meta.sourceTitle) || asText(item?.knowledge_title || item?.title || item?.knowledge_filename) || "WeKnora 知识片段",
        locator: asText(meta.locator) || "WeKnora 检索",
        text,
        url: asText(meta.url),
        score: Number.isFinite(Number(item?.score)) ? Number(item.score) : undefined,
      } satisfies WeknoraSearchHit;
    })
    .filter(Boolean) as WeknoraSearchHit[];
}

export async function searchGuestKnowledge(
  params: { guestId: string; query: string; limit?: number },
  options: WeknoraClientOptions = {}
): Promise<WeknoraSearchHit[]> {
  const config = getConfig(options);
  if (!config.enabled) return [];
  const store = readStore(options);
  const guestStore = store.guests[params.guestId];
  if (!guestStore?.kbId) return [];
  const byKnowledgeId = new Map<string, StoredDocument>();
  Object.values(guestStore.documents || {}).forEach((item) => {
    if (item.knowledgeId) byKnowledgeId.set(item.knowledgeId, item);
  });
  const payload = await requestWeknora("/knowledge-search", {
    ...options,
    method: "POST",
    body: {
      query: params.query,
      knowledge_base_ids: [guestStore.kbId],
    },
  });
  return normalizeWeknoraSearchResults(payload, (knowledgeId) => byKnowledgeId.get(knowledgeId))
    .slice(0, Math.max(1, Math.floor(params.limit || 8)));
}

export async function searchGlobalKnowledge(
  params: { query: string; limit?: number },
  options: WeknoraClientOptions = {}
): Promise<WeknoraSearchHit[]> {
  const config = getConfig(options);
  const kbIds = Array.isArray(config.globalKbIds) ? config.globalKbIds.filter(Boolean) : [];
  const query = asText(params.query);
  if (!config.enabled || !query || kbIds.length === 0) return [];
  const limit = Math.max(1, Math.floor(params.limit || config.ragTopK || 8));
  const payload = await requestWeknora("/knowledge-search", {
    ...options,
    method: "POST",
    body: {
      query,
      knowledge_base_ids: kbIds,
    },
  });
  return normalizeWeknoraSearchResults(payload, () => undefined).slice(0, limit);
}
