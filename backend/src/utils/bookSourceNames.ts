function normalizeBookSourceName(value: unknown): string {
  let normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.startsWith("《") && normalized.endsWith("》")) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

export function uniqueBookSourceNames(values: unknown[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  values.forEach((value) => {
    if (typeof value !== "string") return;
    value.split(/[；;]/).forEach((part) => {
      const name = normalizeBookSourceName(part);
      if (!name || seen.has(name)) return;
      seen.add(name);
      names.push(name);
    });
  });

  return names;
}
