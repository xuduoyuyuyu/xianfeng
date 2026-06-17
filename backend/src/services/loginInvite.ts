import SystemSetting from "../models/SystemSetting";

const LOGIN_INVITE_CONFIG_KEY = "loginInviteConfig";

export interface LoginInviteConfig {
  enabled: boolean;
  code: string;
  activationLimit: number | null;
  usedActivations: number;
  expiresAt: string | null;
}

export interface LoginInviteStatus extends LoginInviteConfig {
  remainingActivations: number | null;
  isExpired: boolean;
  isActive: boolean;
  source: "setting" | "env";
}

function normalizeText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function parseNonNegativeInteger(value: unknown): number | null {
  const text = normalizeText(value);
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function normalizeIsoDate(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeConfig(value: any, fallback?: LoginInviteConfig): LoginInviteConfig {
  const base = fallback || {
    enabled: false,
    code: "",
    activationLimit: null,
    usedActivations: 0,
    expiresAt: null,
  };
  const hasCode = value && Object.prototype.hasOwnProperty.call(value, "code");
  const hasActivationLimit = value && Object.prototype.hasOwnProperty.call(value, "activationLimit");
  const hasUsedActivations = value && Object.prototype.hasOwnProperty.call(value, "usedActivations");
  const hasExpiresAt = value && Object.prototype.hasOwnProperty.call(value, "expiresAt");
  const code = hasCode ? normalizeText(value?.code) : base.code;
  const activationLimit = hasActivationLimit ? parseNonNegativeInteger(value?.activationLimit) : base.activationLimit;
  const usedActivations = hasUsedActivations
    ? (parseNonNegativeInteger(value?.usedActivations) ?? 0)
    : hasCode && code !== base.code
      ? 0
      : base.usedActivations;
  return {
    enabled: typeof value?.enabled === "boolean" ? value.enabled : base.enabled,
    code,
    activationLimit,
    usedActivations,
    expiresAt: hasExpiresAt ? normalizeIsoDate(value?.expiresAt) : base.expiresAt,
  };
}

function fallbackConfig(): LoginInviteConfig {
  const code = normalizeText(process.env.LOGIN_INVITE_CODE);
  return {
    enabled: !!code,
    code,
    activationLimit: code ? parseNonNegativeInteger(process.env.LOGIN_INVITE_ACTIVATION_LIMIT) : null,
    usedActivations: 0,
    expiresAt: null,
  };
}

function withStatus(config: LoginInviteConfig, source: LoginInviteStatus["source"], now = Date.now()): LoginInviteStatus {
  const expiresAtMs = config.expiresAt ? new Date(config.expiresAt).getTime() : 0;
  const isExpired = !!expiresAtMs && expiresAtMs <= now;
  const remainingActivations =
    config.activationLimit === null
      ? null
      : Math.max(0, config.activationLimit - config.usedActivations);
  return {
    ...config,
    remainingActivations,
    isExpired,
    isActive: config.enabled && !!config.code && !isExpired && (remainingActivations === null || remainingActivations > 0),
    source,
  };
}

export async function getLoginInviteConfig(): Promise<LoginInviteStatus> {
  const row = await SystemSetting.findOne({ key: LOGIN_INVITE_CONFIG_KEY }).lean();
  if (!row) return withStatus(fallbackConfig(), "env");
  return withStatus(normalizeConfig((row as any).value), "setting");
}

export async function saveLoginInviteConfig(input: Partial<LoginInviteConfig>): Promise<LoginInviteStatus> {
  const current = await getLoginInviteConfig();
  const next = normalizeConfig(
    {
      enabled: input.enabled,
      code: input.code,
      activationLimit: input.activationLimit,
      usedActivations: input.usedActivations,
      expiresAt: input.expiresAt,
    },
    current
  );
  if (!next.code) {
    next.enabled = false;
    next.activationLimit = null;
    next.usedActivations = 0;
    next.expiresAt = null;
  }
  if (next.activationLimit !== null && next.usedActivations > next.activationLimit) {
    next.usedActivations = next.activationLimit;
  }
  await SystemSetting.findOneAndUpdate(
    { key: LOGIN_INVITE_CONFIG_KEY },
    { $set: { key: LOGIN_INVITE_CONFIG_KEY, value: next } },
    { upsert: true, new: true }
  );
  return withStatus(next, "setting");
}

export async function resetLoginInviteUsage(): Promise<LoginInviteStatus> {
  const current = await getLoginInviteConfig();
  return saveLoginInviteConfig({ ...current, usedActivations: 0 });
}

export function canVerifyLoginInvite(input: {
  enabled?: unknown;
  configuredInviteCode: unknown;
  submittedInviteCode: unknown;
  activationLimit?: unknown;
  usedActivations?: unknown;
  expiresAt?: unknown;
  now?: unknown;
}): boolean {
  const enabled = input.enabled !== false;
  if (!enabled) return true;
  const configuredInviteCode = normalizeText(input.configuredInviteCode);
  if (!configuredInviteCode) return true;
  if (normalizeText(input.submittedInviteCode) !== configuredInviteCode) return false;
  const expiresAt = normalizeIsoDate(input.expiresAt);
  const nowMs = typeof input.now === "number" ? input.now : input.now ? new Date(String(input.now)).getTime() : Date.now();
  if (expiresAt && new Date(expiresAt).getTime() <= nowMs) return false;
  const activationLimit = parseNonNegativeInteger(input.activationLimit);
  if (activationLimit === null) return true;
  const usedActivations = parseNonNegativeInteger(input.usedActivations) ?? 0;
  return usedActivations < activationLimit;
}

export function canAuthenticateWithMobileInvite(input: {
  existingUser: unknown;
  enabled?: unknown;
  configuredInviteCode: unknown;
  submittedInviteCode: unknown;
  activationLimit?: unknown;
  usedActivations?: unknown;
  expiresAt?: unknown;
}): boolean {
  if (input.existingUser) return true;
  return canVerifyLoginInvite(input);
}

export function canSendMobileCodeWithInvite(input: {
  existingUser: unknown;
  enabled?: unknown;
  configuredInviteCode: unknown;
  submittedInviteCode: unknown;
  activationLimit?: unknown;
  usedActivations?: unknown;
  expiresAt?: unknown;
}): boolean {
  return canAuthenticateWithMobileInvite(input);
}

export async function reserveLoginInviteActivation(config: LoginInviteStatus): Promise<boolean> {
  if (!config.enabled || !config.code || config.activationLimit === null) return true;
  await SystemSetting.findOneAndUpdate(
    { key: LOGIN_INVITE_CONFIG_KEY },
    {
      $setOnInsert: {
        key: LOGIN_INVITE_CONFIG_KEY,
        value: {
          enabled: config.enabled,
          code: config.code,
          activationLimit: config.activationLimit,
          usedActivations: 0,
          expiresAt: config.expiresAt,
        },
      },
    },
    { upsert: true, new: true }
  );
  const row = await SystemSetting.findOneAndUpdate(
    {
      key: LOGIN_INVITE_CONFIG_KEY,
      "value.enabled": true,
      "value.code": config.code,
      "value.usedActivations": { $lt: config.activationLimit },
    },
    { $inc: { "value.usedActivations": 1 } },
    { new: true }
  );
  return !!row;
}
