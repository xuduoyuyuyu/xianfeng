import crypto from "crypto";
import SystemSetting from "../models/SystemSetting";

const SETTING_KEY = "feishuIntegrationConfig";

function text(value: unknown): string {
  return value === undefined || value === null ? "" : String(value).trim();
}
function preview(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function encryptionKey(): Buffer {
  const secret = text(process.env.JWT_SECRET);
  if (!secret) throw new Error("系统未配置 JWT_SECRET，无法安全保存飞书密钥");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptFeishuSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptFeishuSecret(value: string): string {
  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("飞书密钥存储格式无效，请重新保存配置");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}

export async function getFeishuConfig() {
  const row = await SystemSetting.findOne({ key: SETTING_KEY }).lean();
  const stored = (row as any)?.value || {};
  const storedAppId = text(stored.appId);
  const storedSecret = text(stored.appSecretEncrypted);
  const appId = storedAppId || text(process.env.FEISHU_APP_ID);
  const appSecret = storedSecret ? decryptFeishuSecret(storedSecret) : text(process.env.FEISHU_APP_SECRET);
  return { appId, appSecret, source: storedAppId || storedSecret ? "setting" as const : "env" as const };
}

export async function getFeishuConfigStatus() {
  const config = await getFeishuConfig();
  return {
    appId: config.appId,
    appIdSet: !!config.appId,
    appSecretSet: !!config.appSecret,
    appSecretPreview: preview(config.appSecret),
    configured: !!config.appId && !!config.appSecret,
    source: config.source,
  };
}

export async function saveFeishuConfig(input: { appId?: unknown; appSecret?: unknown }) {
  const current = await getFeishuConfig();
  const appId = text(input.appId);
  const suppliedSecret = text(input.appSecret);
  const appSecret = suppliedSecret || current.appSecret;
  if (!appId) throw new Error("请填写飞书 App ID");
  if (!appSecret) throw new Error("请填写飞书 App Secret");
  await SystemSetting.findOneAndUpdate(
    { key: SETTING_KEY },
    { $set: { key: SETTING_KEY, value: { appId, appSecretEncrypted: encryptFeishuSecret(appSecret) } } },
    { upsert: true, returnDocument: "after" },
  );
  return getFeishuConfigStatus();
}
