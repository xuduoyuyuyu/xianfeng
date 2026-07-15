function normalizeBookSourceName(value: unknown): string {
  let normalized = String(value || "").trim();
  if (normalized.startsWith("《") && normalized.endsWith("》")) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

export function parseBookSourceNames(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const seen = new Set<string>();
  const names: string[] = [];
  value.split(/[；;]/).forEach((part) => {
    const name = normalizeBookSourceName(part);
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  });
  return names;
}

export function uniqueBookSourceNames(values: unknown[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  values.forEach((value) => {
    parseBookSourceNames(value).forEach((name) => {
      if (seen.has(name)) return;
      seen.add(name);
      names.push(name);
    });
  });
  return names;
}

export function hasBookSourceName(value: unknown, target: unknown): boolean {
  const normalizedTarget = normalizeBookSourceName(target);
  return Boolean(normalizedTarget) && parseBookSourceNames(value).includes(normalizedTarget);
}
