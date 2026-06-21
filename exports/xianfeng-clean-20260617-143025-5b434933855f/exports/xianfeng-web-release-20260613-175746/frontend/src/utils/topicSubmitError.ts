function textFrom(value: unknown, seen = new Set<unknown>()): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return "";
  if (seen.has(value)) return "";
  seen.add(value);

  const record = value as Record<string, unknown>;
  for (const key of ["message", "reason", "error", "detail"]) {
    const text = textFrom(record[key], seen);
    if (text) return text;
  }

  return "";
}

export function extractTopicSubmitError(payload: unknown, fallback: string): string {
  return textFrom(payload) || fallback;
}
