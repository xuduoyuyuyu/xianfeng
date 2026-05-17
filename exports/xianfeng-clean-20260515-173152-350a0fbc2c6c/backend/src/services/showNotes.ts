import SystemSetting from "../models/SystemSetting";

const SHOW_NOTES_TEMPLATE_SETTING_KEY = "showNotesDefaultTemplate";

const DEFAULT_SHOW_NOTES_TEMPLATE = [
  "导引",
  "{{guide}}",
  "",
  "嘉宾介绍",
  "{{guestIntro}}",
  "",
  "重点时间戳",
  "{{keyMoments}}",
  "",
  "本期纪要",
  "{{minutes}}",
].join("\n");

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSingleLine(value: unknown): string {
  return asText(value).replace(/\s+/g, " ");
}

function normalizeNewlines(value: unknown): string {
  return String(value || "").replace(/\r\n?/g, "\n");
}

export function truncateByChars(value: unknown, maxChars: number): string {
  const text = asText(value);
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars)).trim();
}

export function buildShowNotesKeyMomentsText(input: unknown): string {
  const list = Array.isArray(input) ? input : [];
  const rows = list
    .map((item: any) => {
      const time = toSingleLine(item?.time);
      const point = toSingleLine(item?.point || item?.title || item?.summary);
      if (!time || !point) return "";
      return `- ${time} ${point}`;
    })
    .filter(Boolean);
  return rows.join("\n");
}

export function renderShowNotesTemplate(payload: {
  template: string;
  programTitle?: string;
  guestName?: string;
  guide?: string;
  guestIntro?: string;
  keyMomentsText?: string;
  minutes?: string;
}): string {
  const template = normalizeNewlines(payload.template || "");
  const keyMomentsText = normalizeNewlines(payload.keyMomentsText || "");
  const rendered = template
    .replace(/\{\{\s*programTitle\s*\}\}/g, toSingleLine(payload.programTitle))
    .replace(/\{\{\s*guestName\s*\}\}/g, toSingleLine(payload.guestName))
    .replace(/\{\{\s*guide\s*\}\}/g, asText(payload.guide))
    .replace(/\{\{\s*guestIntro\s*\}\}/g, asText(payload.guestIntro))
    .replace(/\{\{\s*keyMoments\s*\}\}/g, keyMomentsText)
    .replace(/\{\{\s*minutes\s*\}\}/g, asText(payload.minutes))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return rendered;
}

export async function getShowNotesDefaultTemplate(): Promise<string> {
  const row = await SystemSetting.findOne({ key: SHOW_NOTES_TEMPLATE_SETTING_KEY }).lean();
  const value = asText((row as any)?.value?.template);
  return value || DEFAULT_SHOW_NOTES_TEMPLATE;
}

export async function saveShowNotesDefaultTemplate(template: string): Promise<string> {
  const normalized = normalizeNewlines(template).trim() || DEFAULT_SHOW_NOTES_TEMPLATE;
  await SystemSetting.findOneAndUpdate(
    { key: SHOW_NOTES_TEMPLATE_SETTING_KEY },
    { key: SHOW_NOTES_TEMPLATE_SETTING_KEY, value: { template: normalized } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return normalized;
}

export function getDefaultShowNotesTemplate(): string {
  return DEFAULT_SHOW_NOTES_TEMPLATE;
}

